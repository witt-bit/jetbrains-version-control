import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

// Real signing needs a gpg install and a key, which a unit run cannot assume.
// A stand-in program speaks just enough of gpg's protocol for git to accept
// its output, so the flags and config the extension passes are what is tested.
const posix = process.platform !== "win32";

const LISTING = [
  "sec:u:255:22:F9E8D7C6B5A49382:1600000000:::u:::scESC:::+::ed25519::",
  "fpr:::::::::00112233445566778899AABBCCDDEEFF9988F9E8D7C6B5A49382:",
  "uid:u::::1600000000::ABCDEF::Bob <bob@example.com>::::::::::0:",
  "sec:e:2048:1:AAAAAAAAAAAAAAAA:1400000000:1450000000::u:::scESC:::+::::",
  "fpr:::::::::AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:",
  "uid:e::::1400000000::AA::Old <old@example.com>::::::::::0:",
].join("\n");

const FAKE_GPG = `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "--list-secret-keys" ]; then
    cat <<'LISTING'
${LISTING}
LISTING
    exit 0
  fi
done
cat > /dev/null
echo >&2
echo "[GNUPG:] SIG_CREATED D 22 8 00 1700000000 FAKEFINGERPRINT" >&2
printf -- '-----BEGIN PGP SIGNATURE-----\\n\\nZmFrZSBzaWduYXR1cmU=\\n-----END PGP SIGNATURE-----\\n'
`;

const BROKEN_GPG = `#!/bin/sh
cat > /dev/null
echo "gpg: signing failed: Inappropriate ioctl for device" >&2
exit 2
`;

async function repoWithGpg(
  script: string,
): Promise<{ dir: string; service: GitService }> {
  const dir = await makeTempDir("jgc-gpg-");
  await createRepo(dir);
  const program = path.join(dir, ".git", "fake-gpg.sh");
  await fs.writeFile(program, script, { mode: 0o755 });
  await git(dir, "config", "gpg.program", program);
  await git(dir, "config", "user.signingkey", "F9E8D7C6B5A49382");
  return { dir, service: new GitService(dir) };
}

async function change(dir: string, name: string) {
  await fs.writeFile(path.join(dir, name), `${name}\n`);
  await git(dir, "add", "--", name);
}

const isSigned = async (dir: string) =>
  (await git(dir, "cat-file", "commit", "HEAD")).includes("\ngpgsig ");

describe("GitService signing", { skip: !posix }, () => {
  before(isolateGitEnvironment);

  it("signs when asked, whatever git config says", async () => {
    const { dir, service } = await repoWithGpg(FAKE_GPG);
    await change(dir, "a.txt");
    await service.commit("signed", false, { gpgSign: "always" });
    assert.equal(await isSigned(dir), true);
  });

  it("auto leaves the decision to commit.gpgsign", async () => {
    const { dir, service } = await repoWithGpg(FAKE_GPG);
    await change(dir, "a.txt");
    await service.commit("unsigned", false, { gpgSign: "auto" });
    assert.equal(await isSigned(dir), false);

    await git(dir, "config", "commit.gpgsign", "true");
    await change(dir, "b.txt");
    await service.commit("signed", false, { gpgSign: "auto" });
    assert.equal(await isSigned(dir), true);
  });

  it("never overrides commit.gpgsign, for new commits and amends", async () => {
    const { dir, service } = await repoWithGpg(FAKE_GPG);
    await git(dir, "config", "commit.gpgsign", "true");
    await change(dir, "a.txt");
    await service.commit("plain", false, { gpgSign: "never" });
    assert.equal(await isSigned(dir), false);

    await service.commit("signed again", true, { gpgSign: "always" });
    assert.equal(await isSigned(dir), true);
    await service.commit("plain again", true, { gpgSign: "never" });
    assert.equal(await isSigned(dir), false);
  });

  it("explains a signing failure without hiding git's message", async () => {
    const { dir, service } = await repoWithGpg(BROKEN_GPG);
    await change(dir, "a.txt");
    await assert.rejects(
      service.commit("fails", false, { gpgSign: "always" }),
      (err: Error) =>
        /failed to sign the data/.test(err.message) &&
        /pinentry/.test(err.message),
    );
    // Opting out of signing is not blocked by the broken program.
    await service.commit("works", false, { gpgSign: "never" });
    assert.equal((await git(dir, "log", "-1", "--format=%s")).trim(), "works");
  });

  it("lists secret keys through gpg.program", async () => {
    const { service } = await repoWithGpg(FAKE_GPG);
    const keys = await service.listGpgKeys();
    assert.deepEqual(
      keys.map((k) => [k.keyId, k.expired]),
      [
        ["F9E8D7C6B5A49382", false],
        ["AAAAAAAAAAAAAAAA", true],
      ],
    );
    assert.deepEqual(keys[0].userIds, ["Bob <bob@example.com>"]);
  });
});

describe("GitService signing config", () => {
  before(isolateGitEnvironment);

  it("resolves the gpg program from git config", async () => {
    const dir = await makeTempDir("jgc-gpg-");
    await createRepo(dir);
    const service = new GitService(dir);
    assert.equal(await service.getGpgProgram(), "gpg");
    await git(dir, "config", "gpg.program", "gpg2");
    assert.equal(await service.getGpgProgram(), "gpg2");
    await git(dir, "config", "gpg.openpgp.program", "/opt/gpg");
    assert.equal(await service.getGpgProgram(), "/opt/gpg");
  });

  it("enables signing with a key and turns it off while keeping the key", async () => {
    const dir = await makeTempDir("jgc-gpg-");
    await createRepo(dir);
    const service = new GitService(dir);
    assert.deepEqual(await service.getSigningConfig(), {
      keyId: undefined,
      enabled: false,
      format: undefined,
    });

    await service.setSigningKey("F9E8D7C6B5A49382");
    assert.deepEqual(await service.getSigningConfig(), {
      keyId: "F9E8D7C6B5A49382",
      enabled: true,
      format: undefined,
    });
    assert.equal(
      (await git(dir, "config", "--local", "commit.gpgsign")).trim(),
      "true",
    );

    await service.setSigningKey(null);
    assert.deepEqual(await service.getSigningConfig(), {
      keyId: "F9E8D7C6B5A49382",
      enabled: false,
      format: undefined,
    });
  });

  it("reports a missing gpg program as a readable error", async () => {
    const dir = await makeTempDir("jgc-gpg-");
    await createRepo(dir);
    await git(dir, "config", "gpg.program", "jgc-no-such-gpg-program");
    await assert.rejects(
      new GitService(dir).listGpgKeys(),
      /"jgc-no-such-gpg-program" was not found/,
    );
  });
});
