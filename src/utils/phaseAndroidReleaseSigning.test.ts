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
 *
 * The `main()` entry points are not executed here: they need a JDK (`jar`, `jarsigner`) and a
 * scratch file, so everything below tests the pure functions the workflows depend on.
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
import { evaluateBundleSignature, findSignatureBlock } from '../../scripts/verifyBundleSignature';

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
