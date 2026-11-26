/**
 * GPG key discovery for commit signing.
 *
 * `parseSecretKeys` is a pure parser over `gpg --list-secret-keys
 * --keyid-format=long --with-colons`; `listSecretKeys` runs it. Only key ids
 * and user ids are ever read or returned: no passphrase, no key material.
 */

import { execFile } from "node:child_process";

export interface GpgKey {
  /** Long key id (16 hex digits), what `user.signingkey` takes. */
  keyId: string;
  fingerprint?: string;
  /** Algorithm number from the listing (1 = RSA, 22 = EdDSA, ...). */
  algorithm?: string;
  /** Key length in bits, or the curve size for elliptic-curve keys. */
  length?: string;
  /** Creation time, seconds since the epoch. */
  created?: number;
  /** Expiry time, seconds since the epoch; absent when the key never expires. */
  expires?: number;
  userIds: string[];
  /** The key or one of its subkeys can sign. */
  canSign: boolean;
  expired: boolean;
  revoked: boolean;
}

/** Undo gpg's `\xHH` escaping of `:`, `\` and control characters. */
function unescapeColons(value: string): string {
  return value.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function epoch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Parse `--with-colons` secret-key output. A `sec` record starts a key; the
 * first `fpr` after it is the primary fingerprint, each `uid` adds a user id,
 * and `ssb` subkeys only matter for whether the key can sign.
 */
export function parseSecretKeys(
  output: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): GpgKey[] {
  const keys: GpgKey[] = [];
  let current: GpgKey | undefined;
  let expectPrimaryFingerprint = false;

  for (const line of output.split(/\r?\n/)) {
    const f = line.split(":");
    switch (f[0]) {
      case "sec": {
        const expires = epoch(f[6]);
        current = {
          keyId: f[4] ?? "",
          algorithm: f[3] || undefined,
          length: f[2] || undefined,
          created: epoch(f[5]),
          expires,
          userIds: [],
          canSign: /[sS]/.test(f[11] ?? ""),
          expired:
            f[1] === "e" || (expires !== undefined && expires <= nowSeconds),
          revoked: f[1] === "r",
        };
        keys.push(current);
        expectPrimaryFingerprint = true;
        break;
      }
      case "ssb":
        if (
          current &&
          /[sS]/.test(f[11] ?? "") &&
          f[1] !== "r" &&
          f[1] !== "e"
        ) {
          current.canSign = true;
        }
        expectPrimaryFingerprint = false;
        break;
      case "fpr":
        if (current && expectPrimaryFingerprint) {
          current.fingerprint = f[9] || undefined;
          expectPrimaryFingerprint = false;
        }
        break;
      case "uid":
        if (current && f[9]) current.userIds.push(unescapeColons(f[9]));
        break;
      default:
        break;
    }
  }
  return keys.filter((k) => k.keyId.length > 0);
}

/** Keys git can actually sign with right now. */
export function usableSigningKeys(keys: GpgKey[]): GpgKey[] {
  return keys.filter((k) => k.canSign && !k.expired && !k.revoked);
}

/** `<long key id> — <first user id>`; the long id is the unambiguous one. */
export function describeKey(key: GpgKey): string {
  const user = key.userIds[0];
  return user ? `${key.keyId} — ${user}` : key.keyId;
}

/**
 * Whether `user.signingkey` names this key. Git accepts a key id of any
 * length, a fingerprint, or a user id, so compare by suffix and by user id.
 */
export function keyMatchesConfig(key: GpgKey, configured: string): boolean {
  const wanted = configured.trim().replace(/^0x/i, "").toUpperCase();
  if (!wanted) return false;
  if (/^[0-9A-F]+$/.test(wanted)) {
    return (
      key.keyId.toUpperCase().endsWith(wanted) ||
      (key.fingerprint?.toUpperCase().endsWith(wanted) ?? false)
    );
  }
  return key.userIds.some((u) => u.toUpperCase().includes(wanted));
}

/** The program git runs for signing: `gpg.program`, else `gpg` on PATH. */
export function resolveGpgProgram(configured: string | undefined): string {
  const value = configured?.trim();
  return value ? value : "gpg";
}

/** True when git signs with something other than OpenPGP keys. */
export function isNonOpenPgpFormat(format: string | undefined): boolean {
  const value = format?.trim().toLowerCase();
  return value === "ssh" || value === "x509";
}

/**
 * Add the way out when git's own message points at the usual headless
 * problem: gpg could not ask for a passphrase.
 */
export function explainSigningFailure(message: string): string | undefined {
  if (
    /gpg failed to sign the data|no pinentry|inappropriate ioctl|can't connect to the (?:gpg-)?agent|no secret key/i.test(
      message,
    )
  ) {
    return "GPG could not sign the commit. If it needs to ask for a passphrase, use a graphical pinentry program (for example pinentry-mac) in ~/.gnupg/gpg-agent.conf, or choose the key again from the commit options.";
  }
  return undefined;
}

export function listSecretKeys(
  program: string,
  cwd?: string,
): Promise<GpgKey[]> {
  return new Promise((resolve, reject) => {
    execFile(
      program,
      ["--list-secret-keys", "--keyid-format=long", "--with-colons"],
      {
        cwd,
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, LC_ALL: "C" },
      },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          reject(
            new Error(
              code === "ENOENT"
                ? `GPG program "${program}" was not found. Install GnuPG or set gpg.program in your Git config.`
                : `${program} --list-secret-keys failed: ${(stderr || err.message).trim()}`,
            ),
          );
          return;
        }
        resolve(parseSecretKeys(stdout));
      },
    );
  });
}
