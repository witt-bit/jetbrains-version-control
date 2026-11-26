import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeKey,
  explainSigningFailure,
  isNonOpenPgpFormat,
  keyMatchesConfig,
  listSecretKeys,
  parseSecretKeys,
  resolveGpgProgram,
  usableSigningKeys,
} from "./gpg.ts";

// Listings in the `--with-colons` layout documented in GnuPG's doc/DETAILS
// (field 2 validity, 5 key id, 6 created, 7 expires, 10 user id, 12 capabilities).
// Written by hand to that layout: this machine has no gpg to capture from.
const RSA = [
  "sec:u:4096:1:3AA5C34371567BD2:1530000000:::u:::scESC:::+::::",
  "fpr:::::::::A1B2C3D4E5F60718293A3AA5C34371567BD2:",
  "grp:::::::::0123456789ABCDEF0123456789ABCDEF01234567:",
  "uid:u::::1530000000::5F1C0A0C0C0D0E0F101112131415161718191A1B::Alice Example <alice@example.com>::::::::::0:",
  "uid:u::::1530000100::6F1C0A0C0C0D0E0F101112131415161718191A1C::Alice Work <alice@work.example>::::::::::0:",
  "ssb:u:4096:1:0123456789ABCDEF:1530000000::::::e:::+::::",
  "fpr:::::::::FFFF000011112222333344445555666677778888:",
].join("\n");

const ED25519 = [
  "sec:u:255:22:F9E8D7C6B5A49382:1600000000:::u:::scESC:::+::ed25519::",
  "fpr:::::::::00112233445566778899AABBCCDDEEFF9988F9E8D7C6B5A49382:",
  "uid:u::::1600000000::ABCDEF::Bob \\x3aColon <bob@example.com>::::::::::0:",
  "ssb:u:255:18:1111222233334444:1600000000::::::e:::+::cv25519:",
].join("\n");

const EXPIRED = [
  "sec:e:2048:1:AAAAAAAAAAAAAAAA:1400000000:1450000000::u:::scESC:::+::::",
  "fpr:::::::::AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:",
  "uid:e::::1400000000::AA::Old Key <old@example.com>::::::::::0:",
].join("\n");

const REVOKED = [
  "sec:r:2048:1:BBBBBBBBBBBBBBBB:1400000000:::u:::scESC:::+::::",
  "fpr:::::::::BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:",
  "uid:r::::1400000000::BB::Revoked Key <revoked@example.com>::::::::::0:",
].join("\n");

// A primary key that only certifies, with a separate signing subkey.
const SIGN_SUBKEY = [
  "sec:u:3072:1:CCCCCCCCCCCCCCCC:1500000000:::u:::cC:::+::::",
  "fpr:::::::::CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC:",
  "uid:u::::1500000000::CC::Carol <carol@example.com>::::::::::0:",
  "ssb:u:3072:1:DDDDDDDDDDDDDDDD:1500000000::::::s:::+::::",
  "fpr:::::::::DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD:",
].join("\n");

const NO_SIGN = [
  "sec:u:3072:1:EEEEEEEEEEEEEEEE:1500000000:::u:::cC:::+::::",
  "fpr:::::::::EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE:",
  "uid:u::::1500000000::EE::Dave <dave@example.com>::::::::::0:",
  "ssb:u:3072:1:FFFFFFFFFFFFFFFF:1500000000::::::e:::+::::",
].join("\n");

describe("parseSecretKeys", () => {
  it("reads id, fingerprint, algorithm, dates and every user id", () => {
    const [key, ...rest] = parseSecretKeys(`${RSA}\n`);
    assert.equal(rest.length, 0);
    assert.equal(key.keyId, "3AA5C34371567BD2");
    assert.equal(key.fingerprint, "A1B2C3D4E5F60718293A3AA5C34371567BD2");
    assert.equal(key.algorithm, "1");
    assert.equal(key.length, "4096");
    assert.equal(key.created, 1530000000);
    assert.equal(key.expires, undefined);
    assert.deepEqual(key.userIds, [
      "Alice Example <alice@example.com>",
      "Alice Work <alice@work.example>",
    ]);
    assert.equal(key.canSign, true);
    assert.equal(key.expired, false);
    assert.equal(key.revoked, false);
  });

  it("takes the primary fingerprint, not a subkey's", () => {
    const [key] = parseSecretKeys(RSA);
    assert.notEqual(
      key.fingerprint,
      "FFFF000011112222333344445555666677778888",
    );
  });

  it("unescapes colons in user ids", () => {
    const [key] = parseSecretKeys(ED25519);
    assert.deepEqual(key.userIds, ["Bob :Colon <bob@example.com>"]);
  });

  it("splits a multi-key listing and tolerates CRLF line ends", () => {
    const keys = parseSecretKeys(`${RSA}\r\n${ED25519}\r\n${EXPIRED}\r\n`);
    assert.deepEqual(
      keys.map((k) => k.keyId),
      ["3AA5C34371567BD2", "F9E8D7C6B5A49382", "AAAAAAAAAAAAAAAA"],
    );
    assert.equal(keys[1].fingerprint?.endsWith("F9E8D7C6B5A49382"), true);
  });

  it("marks expired and revoked keys", () => {
    const [expired, revoked] = parseSecretKeys(`${EXPIRED}\n${REVOKED}`);
    assert.equal(expired.expired, true);
    assert.equal(expired.expires, 1450000000);
    assert.equal(revoked.revoked, true);
  });

  it("derives expiry from the date when the validity flag is not set", () => {
    const line =
      "sec:u:2048:1:1234567890ABCDEF:1400000000:1450000000::u:::scESC:::+::::";
    assert.equal(parseSecretKeys(line, 1449999999)[0].expired, false);
    assert.equal(parseSecretKeys(line, 1450000000)[0].expired, true);
  });

  it("finds the signing ability on a subkey", () => {
    const [withSubkey, without] = parseSecretKeys(`${SIGN_SUBKEY}\n${NO_SIGN}`);
    assert.equal(withSubkey.canSign, true);
    assert.equal(without.canSign, false);
  });

  it("returns nothing for empty or unrelated output", () => {
    assert.deepEqual(parseSecretKeys(""), []);
    assert.deepEqual(parseSecretKeys("gpg: error reading key block\n"), []);
  });
});

describe("key helpers", () => {
  const keys = parseSecretKeys(
    [RSA, EXPIRED, REVOKED, NO_SIGN, SIGN_SUBKEY].join("\n"),
  );

  it("offers only keys that can sign right now", () => {
    assert.deepEqual(
      usableSigningKeys(keys).map((k) => k.keyId),
      ["3AA5C34371567BD2", "CCCCCCCCCCCCCCCC"],
    );
  });

  it("describes a key by id and first user id", () => {
    assert.equal(
      describeKey(keys[0]),
      "3AA5C34371567BD2 — Alice Example <alice@example.com>",
    );
    assert.equal(describeKey({ ...keys[0], userIds: [] }), "3AA5C34371567BD2");
  });

  it("matches user.signingkey by id suffix, fingerprint or user id", () => {
    const [key] = keys;
    assert.equal(keyMatchesConfig(key, "3AA5C34371567BD2"), true);
    assert.equal(keyMatchesConfig(key, "0x71567bd2"), true);
    assert.equal(
      keyMatchesConfig(key, "A1B2C3D4E5F60718293A3AA5C34371567BD2"),
      true,
    );
    assert.equal(keyMatchesConfig(key, "alice@example.com"), true);
    assert.equal(keyMatchesConfig(key, "DEADBEEF"), false);
    assert.equal(keyMatchesConfig(key, "  "), false);
  });

  it("uses gpg.program when set, else gpg", () => {
    assert.equal(resolveGpgProgram(undefined), "gpg");
    assert.equal(resolveGpgProgram("  "), "gpg");
    assert.equal(
      resolveGpgProgram("/opt/homebrew/bin/gpg2"),
      "/opt/homebrew/bin/gpg2",
    );
  });

  it("recognises signing formats other than OpenPGP", () => {
    assert.equal(isNonOpenPgpFormat("ssh"), true);
    assert.equal(isNonOpenPgpFormat("X509"), true);
    assert.equal(isNonOpenPgpFormat("openpgp"), false);
    assert.equal(isNonOpenPgpFormat(undefined), false);
  });

  it("explains the usual headless signing failures", () => {
    assert.match(
      explainSigningFailure("error: gpg failed to sign the data") ?? "",
      /pinentry/,
    );
    assert.match(
      explainSigningFailure(
        "gpg: signing failed: Inappropriate ioctl for device",
      ) ?? "",
      /pinentry/,
    );
    assert.equal(explainSigningFailure("nothing to commit"), undefined);
  });
});

describe("listSecretKeys", () => {
  it("says so when the gpg program does not exist", async () => {
    await assert.rejects(
      listSecretKeys("jgc-no-such-gpg-program"),
      /was not found.*gpg\.program/,
    );
  });
});
