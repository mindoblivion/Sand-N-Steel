/**
 * Phase AR-1 — Android release signing helpers.
 *
 * Run with: bun test src/utils/phaseAndroidReleaseSigning.test.ts
 *
 * ── WHAT THIS PINS ────────────────────────────────────────────────────────────────────────────
 *   A. `escapePropertyValue` / `renderKeystoreProperties` — the replacement for the release
 *      workflow's unquoted shell heredoc. `java.util.Properties` has its own escaping rules, and
 *      the heredoc interpolated the password verbatim, so a backslash, a `$`, a newline or a
 *      leading space silently produced a file Gradle read as a different password.
 *   B. `keystorePropertiesFromEnv` — a missing variable is reported BY NAME and never by value.
 *   C. `findSignatureBlock` / `evaluateBundleSignature` — the decision the release job makes
 *      before uploading. An unsigned `.aab` builds successfully, so "it built" is not evidence.
 *   D. `normalizeFingerprint` / `extractSignerFingerprints` / `evaluateSigningIdentity` (AR-3) —
 *      the signer identity check. A valid signature proves only that SOME key signed the bundle,
 *      so the release job requires the configured SHA-256 fingerprint to match every signer, and
 *      fails closed when no fingerprint is configured or it disagrees.
 *
 * The `main()` entry points are not executed here: they need a JDK (`jar`, `jarsigner`, `keytool`)
 * and a scratch file, so everything below tests the pure functions the workflows depend on.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  KEYSTORE_ENV_NAMES,
  KEYSTORE_PROPERTY_KEYS,
  escapePropertyValue,
  keystorePropertiesFromEnv,
  renderKeystoreProperties,
  type KeystoreProperties,
} from '../../scripts/writeKeystoreProperties';
import {
  EXPECTED_FINGERPRINT_ENV,
  evaluateBundleSignature,
  evaluateSigningIdentity,
  extractSignerFingerprints,
  findSignatureBlock,
  normalizeFingerprint,
} from '../../scripts/verifyBundleSignature';

const VALUES: KeystoreProperties = {
  storeFile: 'Sand-and-Steel.keystore',
  storePassword: 'simplepass',
  keyAlias: 'upload',
  keyPassword: 'simplepass',
};

// ── A. java.util.Properties escaping ──────────────────────────────────────────────────────────

describe('A. property-value escaping (java.util.Properties rules, not shell rules)', () => {
  test('plain ASCII passes through untouched', () => {
    expect(escapePropertyValue('simplepass')).toBe('simplepass');
    expect(escapePropertyValue('Sand-and-Steel.keystore')).toBe('Sand-and-Steel.keystore');
    expect(escapePropertyValue('p@ss!#%&=:;,./-')).toBe('p@ss!#%&=:;,./-');
  });

  test('a backslash is doubled — the one character the loader treats as an escape', () => {
    expect(escapePropertyValue('a\\b')).toBe('a\\\\b');
    expect(escapePropertyValue('\\')).toBe('\\\\');
    // The old heredoc wrote `a\b` verbatim, which Properties.load reads as `ab`.
    expect(escapePropertyValue('a\\b')).not.toBe('a\\b');
  });

  test('control characters become the format\'s named escapes', () => {
    expect(escapePropertyValue('a\nb')).toBe('a\\nb');
    expect(escapePropertyValue('a\rb')).toBe('a\\rb');
    expect(escapePropertyValue('a\tb')).toBe('a\\tb');
    expect(escapePropertyValue('a\fb')).toBe('a\\fb');
    // A raw newline would end the property line and truncate the password.
    expect(escapePropertyValue('a\nb')).not.toContain('\n');
  });

  test('non-ASCII is \\u-escaped, because Properties.load(InputStream) decodes ISO-8859-1', () => {
    expect(escapePropertyValue('é')).toBe('\\u00E9');
    expect(escapePropertyValue('Ω')).toBe('\\u03A9');
    // An astral character is two UTF-16 code units, so two escapes — as Properties.store emits.
    expect(escapePropertyValue('\u{1F600}')).toBe('\\uD83D\\uDE00');
    expect(escapePropertyValue('café')).toBe('caf\\u00E9');
  });

  test('leading spaces are escaped (the loader trims them) while inner spaces survive', () => {
    expect(escapePropertyValue('  pass')).toBe('\\ \\ pass');
    expect(escapePropertyValue('a b c')).toBe('a b c');
    expect(escapePropertyValue(' ')).toBe('\\ ');
  });

  test('the empty value stays empty', () => {
    expect(escapePropertyValue('')).toBe('');
  });
});

describe('A. the rendered file Gradle reads', () => {
  test('always four lines, in the order android/app/build.gradle reads them', () => {
    const rendered = renderKeystoreProperties(VALUES);
    const lines = rendered.trimEnd().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.split('=')[0])).toEqual([
      'storeFile',
      'storePassword',
      'keyAlias',
      'keyPassword',
    ]);
    expect(KEYSTORE_PROPERTY_KEYS).toEqual(['storeFile', 'storePassword', 'keyAlias', 'keyPassword']);
  });

  test('ends with exactly one newline and never leaks a line break into a value', () => {
    const rendered = renderKeystoreProperties({ ...VALUES, storePassword: 'line1\nline2' });
    expect(rendered.endsWith('\n')).toBe(true);
    expect(rendered.endsWith('\n\n')).toBe(false);
    expect(rendered.trimEnd().split('\n')).toHaveLength(4);
    expect(rendered).toContain('storePassword=line1\\nline2');
  });

  test('a hostile password round-trips as ONE property line', () => {
    const nasty = '  pa$$`word\\with\ttabs';
    const rendered = renderKeystoreProperties({ ...VALUES, storePassword: nasty });
    const line = rendered.trimEnd().split('\n').find((entry) => entry.startsWith('storePassword='));
    expect(line).toBe('storePassword=\\ \\ pa$$`word\\\\with\\ttabs');
    // No shell metacharacter is left to be expanded by anything: the value's `$` and backtick
    // are inert in the file, which is why the shell never interpolates it.
    expect(line).not.toContain('\t');
  });
});

// ── B. environment input, never argv, never echoed ───────────────────────────────────────────

describe('B. keystorePropertiesFromEnv', () => {
  const env = (overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
    KEYSTORE_STORE_FILE: 'Sand-and-Steel.keystore',
    KEYSTORE_STORE_PASSWORD: 'storepass',
    KEYSTORE_KEY_ALIAS: 'upload',
    KEYSTORE_KEY_PASSWORD: 'keypass',
    ...overrides,
  });

  test('maps the four documented variables onto the four properties', () => {
    expect(keystorePropertiesFromEnv(env())).toEqual({
      storeFile: 'Sand-and-Steel.keystore',
      storePassword: 'storepass',
      keyAlias: 'upload',
      keyPassword: 'keypass',
    });
    expect(KEYSTORE_ENV_NAMES).toEqual({
      storeFile: 'KEYSTORE_STORE_FILE',
      storePassword: 'KEYSTORE_STORE_PASSWORD',
      keyAlias: 'KEYSTORE_KEY_ALIAS',
      keyPassword: 'KEYSTORE_KEY_PASSWORD',
    });
  });

  test('a missing variable is reported by NAME, and the message carries no value', () => {
    for (const key of KEYSTORE_PROPERTY_KEYS) {
      const envName = KEYSTORE_ENV_NAMES[key];
      const partial = { ...env() } as Record<string, string | undefined>;
      delete partial[envName];
      expect(() => keystorePropertiesFromEnv(partial)).toThrow(envName);
      try {
        keystorePropertiesFromEnv(partial);
      } catch (error) {
        const message = (error as Error).message;
        expect(message).not.toContain('storepass');
        expect(message).not.toContain('keypass');
        expect(message).not.toContain('Sand-and-Steel');
      }
    }
  });

  test('an empty variable is treated as missing (an unset GitHub secret expands to "")', () => {
    expect(() => keystorePropertiesFromEnv(env({ KEYSTORE_KEY_PASSWORD: '' }))).toThrow(
      'KEYSTORE_KEY_PASSWORD',
    );
  });
});

// ── C. bundle signature verification ────────────────────────────────────────────────────────

const SIGNED_ENTRIES = ['META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA', 'base/manifest/AndroidManifest.xml'];
const UNSIGNED_ENTRIES = ['META-INF/MANIFEST.MF', 'base/manifest/AndroidManifest.xml'];

describe('C. findSignatureBlock', () => {
  test('finds the JAR signature block an AAB carries', () => {
    expect(findSignatureBlock(SIGNED_ENTRIES)).toBe('META-INF/CERT.RSA');
  });

  test('accepts the DSA and EC variants and is case-insensitive', () => {
    expect(findSignatureBlock(['META-INF/CERT.DSA'])).toBe('META-INF/CERT.DSA');
    expect(findSignatureBlock(['META-INF/CERT.EC'])).toBe('META-INF/CERT.EC');
    expect(findSignatureBlock(['META-INF/cert.rsa'])).toBe('META-INF/cert.rsa');
  });

  test('an unsigned bundle has none, and neither do nested or unrelated entries', () => {
    expect(findSignatureBlock(UNSIGNED_ENTRIES)).toBeNull();
    expect(findSignatureBlock([])).toBeNull();
    expect(findSignatureBlock(['META-INF/sub/CERT.RSA'])).toBeNull();
    expect(findSignatureBlock(['base/META-INF/CERT.RSA'])).toBeNull();
    expect(findSignatureBlock(['META-INF/CERT.RSA.txt'])).toBeNull();
  });
});

describe('C. evaluateBundleSignature', () => {
  const verified = { entries: SIGNED_ENTRIES, jarsignerOutput: 'jar verified.', jarsignerExitCode: 0 };

  test('only a signature block AND a clean jarsigner run passes', () => {
    const verdict = evaluateBundleSignature(verified);
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain('META-INF/CERT.RSA');
  });

  test('no signature block fails, even when jarsigner is happy', () => {
    const verdict = evaluateBundleSignature({ ...verified, entries: UNSIGNED_ENTRIES });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('UNSIGNED');
  });

  test('a non-zero jarsigner exit fails the release', () => {
    const verdict = evaluateBundleSignature({ ...verified, jarsignerOutput: 'jar verification FAILED', jarsignerExitCode: 1 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('exited 1');
  });

  test('jarsigner unavailable fails rather than passing by default', () => {
    const verdict = evaluateBundleSignature({ ...verified, jarsignerOutput: '', jarsignerExitCode: null });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('could not run');
  });

  test('"jar is unsigned" fails even on a zero exit', () => {
    const verdict = evaluateBundleSignature({ ...verified, jarsignerOutput: 'jar is unsigned', jarsignerExitCode: 0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('unsigned');
  });

  test('a clean exit without the "jar verified" line fails (nothing assumed from exit 0)', () => {
    const verdict = evaluateBundleSignature({ ...verified, jarsignerOutput: 'some other output', jarsignerExitCode: 0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('jar verified');
  });

  test('warnings after a successful verification still pass — a legit signed bundle is not failed', () => {
    const verdict = evaluateBundleSignature({
      ...verified,
      jarsignerOutput: 'jar verified.\n\nWarning: This jar contains entries whose signer certificate will expire within six months.',
      jarsignerExitCode: 0,
    });
    expect(verdict.ok).toBe(true);
  });
});

// ── D. signer identity (AR-3) ──────────────────────────────────────────────────────────────

/**
 * Two synthetic certificates. They are FIXTURES — obviously patterned, not real certificates, and
 * deliberately not any fingerprint of the project's upload key (which is never written down here).
 */
const CERT_A = 'A1B2C3D4'.repeat(8);
const CERT_B = '0F1E2D3C'.repeat(8);

function colonize(compact: string): string {
  return (compact.match(/.{2}/g) ?? []).join(':');
}

/**
 * One signer block in the real `keytool -printcert -jarfile` shape. `chain` adds a second
 * certificate to the same signer, as a real certificate chain would.
 */
function signerBlock(leaf: string, chain: string[] = []): string {
  const certificates = [leaf, ...chain]
    .map(
      (fingerprint, index) => `Certificate #${index + 1}:
Owner: CN=Fixture ${index + 1}, OU=Test, O=Sand and Steel, C=US
Issuer: CN=Fixture ${index + 1}, OU=Test, O=Sand and Steel, C=US
Serial number: 79904656776f3e45
Valid from: Fri Oct 30 10:22:11 UTC 2026 until: Sun Nov 29 10:22:11 UTC 2026
Certificate fingerprints:
\t SHA1: 85:D5:3C:B7:B2:FC:3A:F9:D3:3D:37:21:DC:97:BE:0F:B0:44:7D:8A
\t SHA256: ${colonize(fingerprint)}
Signature algorithm name: SHA256withRSA
Subject Public Key Algorithm: 2048-bit RSA key
Version: 3
`,
    )
    .join('\n');
  return `Signer #${chain.length + 1 > 1 ? 1 : 1}:\n\n${certificates}`;
}

function keytoolOutput(leaves: string[], chain: string[] = []): string {
  return leaves.map((leaf, index) => `Signer #${index + 1}:\n\n${signerBlock(leaf, chain)}`).join('\n');
}

describe('D. normalizeFingerprint', () => {
  test('reduces the colon form keytool and Play Console print to 64 uppercase hex digits', () => {
    expect(normalizeFingerprint(colonize(CERT_A))).toBe(CERT_A);
    expect(normalizeFingerprint(CERT_A)).toBe(CERT_A);
  });

  test('accepts lowercase, spaces and surrounding whitespace', () => {
    expect(normalizeFingerprint(CERT_A.toLowerCase())).toBe(CERT_A);
    expect(normalizeFingerprint(`  ${colonize(CERT_A).toLowerCase()}  `)).toBe(CERT_A);
    expect(normalizeFingerprint(CERT_A.replace(/(.{2})/g, '$1 '))).toBe(CERT_A);
  });

  test('rejects anything that is not a SHA-256 digest', () => {
    expect(normalizeFingerprint('')).toBeNull();
    expect(normalizeFingerprint('   ')).toBeNull();
    expect(normalizeFingerprint(null)).toBeNull();
    expect(normalizeFingerprint(undefined)).toBeNull();
    // A SHA-1 fingerprint (40 hex digits) is NOT acceptable as a SHA-256 pin.
    expect(normalizeFingerprint('85:D5:3C:B7:B2:FC:3A:F9:D3:3D:37:21:DC:97:BE:0F:B0:44:7D:8A')).toBeNull();
    expect(normalizeFingerprint(CERT_A.slice(1))).toBeNull();
    expect(normalizeFingerprint(`${CERT_A}0`)).toBeNull();
    expect(normalizeFingerprint('Z'.repeat(64))).toBeNull();
  });
});

describe('D. extractSignerFingerprints', () => {
  test('reads the signer certificate out of a real-shaped keytool report', () => {
    expect(extractSignerFingerprints(keytoolOutput([CERT_A]))).toEqual([CERT_A]);
  });

  test('a certificate CHAIN contributes only its signer, not the issuers behind it', () => {
    // Certificate #2..N are chain members; pinning the leaf is the identity that matters.
    expect(extractSignerFingerprints(keytoolOutput([CERT_A], [CERT_B]))).toEqual([CERT_A]);
  });

  test('every signer of a multi-signed bundle is reported', () => {
    expect(extractSignerFingerprints(keytoolOutput([CERT_A, CERT_B]))).toEqual([CERT_A, CERT_B]);
    expect(extractSignerFingerprints(keytoolOutput([CERT_A, CERT_A]))).toEqual([CERT_A, CERT_A]);
  });

  test('output with no certificate fingerprints yields nothing', () => {
    expect(extractSignerFingerprints('')).toEqual([]);
    expect(extractSignerFingerprints('keytool error: java.lang.SecurityException')).toEqual([]);
    expect(extractSignerFingerprints('Certificate fingerprints:\n\t SHA1: 85:D5:3C:B7\n')).toEqual([]);
  });

  test('a report with no `Signer #` marker is still read as one signer', () => {
    const unheaded = `Certificate #1:\nCertificate fingerprints:\n\t SHA256: ${colonize(CERT_A)}\n`;
    expect(extractSignerFingerprints(unheaded)).toEqual([CERT_A]);
  });
});

describe('D. evaluateSigningIdentity', () => {
  const good = {
    expectedFingerprint: colonize(CERT_A),
    keytoolOutput: keytoolOutput([CERT_A]),
    keytoolExitCode: 0,
  };

  test('the configured fingerprint matching the signer passes', () => {
    const verdict = evaluateSigningIdentity(good);
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain('match');
  });

  test('an unconfigured fingerprint FAILS — an unpinned signer is not accepted', () => {
    for (const missing of [undefined, null, '', '   ']) {
      const verdict = evaluateSigningIdentity({ ...good, expectedFingerprint: missing });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain(EXPECTED_FINGERPRINT_ENV);
      expect(verdict.reason).toContain('refusing');
    }
    expect(EXPECTED_FINGERPRINT_ENV).toBe('EXPECTED_SIGNER_SHA256');
  });

  test('a malformed configured fingerprint FAILS rather than being ignored', () => {
    const verdict = evaluateSigningIdentity({ ...good, expectedFingerprint: 'not-a-fingerprint' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('SHA-256');
  });

  test('a different certificate FAILS, and the reason names counts — never a value', () => {
    const verdict = evaluateSigningIdentity({
      ...good,
      expectedFingerprint: colonize(CERT_B),
      keytoolOutput: keytoolOutput([CERT_A]),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('1 of 1');
    for (const fingerprint of [CERT_A, CERT_B]) {
      expect(verdict.reason).not.toContain(fingerprint);
      expect(verdict.reason).not.toContain(colonize(fingerprint));
    }
  });

  test('one unexpected co-signer is enough to fail a bundle', () => {
    const verdict = evaluateSigningIdentity({
      ...good,
      keytoolOutput: keytoolOutput([CERT_A, CERT_B]),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('1 of 2');
  });

  test('keytool failing or missing FAILS closed', () => {
    const unavailable = evaluateSigningIdentity({ ...good, keytoolExitCode: null });
    expect(unavailable.ok).toBe(false);
    expect(unavailable.reason).toContain('could not run');

    const failed = evaluateSigningIdentity({ ...good, keytoolExitCode: 2, keytoolOutput: '' });
    expect(failed.ok).toBe(false);
    expect(failed.reason).toContain('exited 2');
  });

  test('a report with no signer certificate FAILS closed', () => {
    const verdict = evaluateSigningIdentity({ ...good, keytoolOutput: '' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('no signer certificate');
  });

  test('the verdict is a pure function of its input — no environment is read', () => {
    // Called with the SAME input twice, with no fingerprint in the process environment either time.
    const previous = process.env[EXPECTED_FINGERPRINT_ENV];
    delete process.env[EXPECTED_FINGERPRINT_ENV];
    try {
      expect(evaluateSigningIdentity(good).ok).toBe(true);
      expect(evaluateSigningIdentity({ ...good, expectedFingerprint: undefined }).ok).toBe(false);
    } finally {
      if (previous !== undefined) process.env[EXPECTED_FINGERPRINT_ENV] = previous;
    }
  });
});
