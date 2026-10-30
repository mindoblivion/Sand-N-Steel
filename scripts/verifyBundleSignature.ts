/**
 * verifyBundleSignature.ts — proves a built `.aab` carries a valid JAR signature AND (for a
 * release) that it was signed by the approved upload certificate.
 *
 * Run with:  bun run scripts/verifyBundleSignature.ts <path-to.aab> [--signature-only]
 *
 * WHY THE SIGNATURE CHECK EXISTS: an UNSIGNED bundle builds perfectly well.
 * `android/app/build.gradle` applies the release `signingConfig` only when
 * `android/keystore.properties` exists, so a missing or mis-wired keystore yields a
 * `bundleRelease` that exits 0 and produces an artifact Play Console rejects on upload. The
 * release job therefore refuses to publish anything until this check passes.
 *
 * TWO CHECKS, TWO DIFFERENT FAILURES
 *   1. SIGNATURE — the bundle carries a JAR signature block and `jarsigner -verify` accepts it.
 *      That proves the bundle is signed and internally intact. It does NOT prove who signed it:
 *      any key at all produces a perfectly valid signature.
 *   2. SIGNER IDENTITY — `keytool -printcert -jarfile` reports every signer the bundle carries,
 *      each with its certificate fingerprints. The expected SHA-256 fingerprint is configured in
 *      `EXPECTED_SIGNER_SHA256`; EVERY signer must match it, or the bundle is refused. That is
 *      what stops a bundle signed with an arbitrary key from reaching Play Console.
 *
 * The identity check is fail-closed in both directions: a missing or malformed fingerprint is an
 * ERROR (an unpinned signer is evidence of nothing), and any mismatch is an error. The rehearsal
 * job is the one caller that skips check 2, and it must say so explicitly with `--signature-only`,
 * which prints a notice that the signer is not pinned.
 *
 * NO FINGERPRINT VALUE IS EVER PRINTED. `EXPECTED_SIGNER_SHA256` is delivered as a repository
 * secret, so the log only ever reports how many signers were found and how many failed to match.
 *
 * WHICH TOOL IS APPROPRIATE FOR AN AAB: an Android App Bundle is a JAR signed with the JAR
 * signature scheme (v1) — `apksigner`, which verifies APK signature schemes, does not apply to a
 * `.aab`. The right tools are the JDK's own `jarsigner -verify` for the signature and
 * `keytool -printcert -jarfile` for the certificate, together with the presence of a signature
 * block in `META-INF/`, all used below. `jar`, `jarsigner` and `keytool` ship with the JDK that
 * `actions/setup-java` installs, so no Android SDK component is needed.
 *
 * The decision logic is exported as pure functions so `bun test` can pin it without a JDK.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** `META-INF/CERT.RSA` — a JAR signature block, directly under `META-INF/`. */
const SIGNATURE_BLOCK = /^META-INF\/[^/]+\.(?:RSA|DSA|EC)$/i;

/** Environment variable carrying the approved upload certificate's SHA-256 fingerprint. */
export const EXPECTED_FINGERPRINT_ENV = 'EXPECTED_SIGNER_SHA256';

/** A SHA-256 fingerprint with its separators removed: 64 uppercase hex digits. */
const SHA256_DIGEST = /^[0-9A-F]{64}$/;

/** Default output of `./gradlew bundleRelease` in `android/`. */
export const DEFAULT_AAB_PATH = 'android/app/build/outputs/bundle/release/app-release.aab';

export interface SignatureVerdict {
  ok: boolean;
  reason: string;
}

/** The first signature block among a bundle's entry names, or `null` when there is none. */
export function findSignatureBlock(entries: string[]): string | null {
  return entries.find((entry) => SIGNATURE_BLOCK.test(entry.trim())) ?? null;
}

/**
 * Normalize a fingerprint to what both `keytool` and Play Console report it as: uppercase hex
 * with every `:` and space removed. `null` when the value is not a SHA-256 digest at all.
 */
export function normalizeFingerprint(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/[\s:]/g, '').toUpperCase();
  return SHA256_DIGEST.test(compact) ? compact : null;
}

/**
 * The signer certificates of a bundle, from `keytool -printcert -jarfile` output.
 *
 * The output is grouped per signer (`Signer #1:`, `Signer #2:`, …), and within a signer its
 * certificate chain follows signer-first (`Certificate #1`, `#2`, …). So the FIRST `SHA256:` line
 * in each signer block is that signer's own certificate — exactly the identity that has to be
 * pinned. Chain certificates after it are deliberately ignored.
 */
export function extractSignerFingerprints(keytoolOutput: string): string[] {
  const blocks = keytoolOutput.split(/^Signer #\d+:/m);
  // No `Signer #` marker (an older or unexpected keytool): treat the whole output as one signer.
  const scopes = blocks.length > 1 ? blocks.slice(1) : [keytoolOutput];

  const fingerprints: string[] = [];
  for (const scope of scopes) {
    const match = scope.match(/SHA256:\s*([0-9A-Fa-f][0-9A-Fa-f:\s]*)/);
    const normalized = match ? normalizeFingerprint(match[1]) : null;
    if (normalized) fingerprints.push(normalized);
  }
  return fingerprints;
}

/**
 * Decide whether a bundle is signed, from the evidence a run can actually collect.
 *
 * `jarsignerOutput` is the combined stdout/stderr of `jarsigner -verify`; `jarsignerExitCode`
 * is its exit status (`null` when the tool could not run at all).
 */
export function evaluateBundleSignature(input: {
  entries: string[];
  jarsignerOutput: string;
  jarsignerExitCode: number | null;
}): SignatureVerdict {
  const block = findSignatureBlock(input.entries);

  if (!block) {
    return { ok: false, reason: 'no META-INF signature block — the bundle is UNSIGNED' };
  }
  if (input.jarsignerExitCode === null) {
    return { ok: false, reason: 'jarsigner could not run — verification is impossible' };
  }
  if (input.jarsignerExitCode !== 0) {
    return { ok: false, reason: `jarsigner exited ${input.jarsignerExitCode} — the signature is not valid` };
  }
  if (/jar is unsigned/i.test(input.jarsignerOutput)) {
    return { ok: false, reason: 'jarsigner reports the bundle as unsigned' };
  }
  if (!/jar verified/i.test(input.jarsignerOutput)) {
    return { ok: false, reason: 'jarsigner did not report "jar verified"' };
  }

  return { ok: true, reason: `signed (${block}) and verified by jarsigner` };
}

/**
 * Decide whether every signer of the bundle is the approved upload certificate.
 *
 * `keytoolOutput` is the combined stdout/stderr of `keytool -printcert -jarfile`, the only JDK
 * tool that reports a certificate's SHA-256 fingerprint.
 */
export function evaluateSigningIdentity(input: {
  expectedFingerprint: string | null | undefined;
  keytoolOutput: string;
  keytoolExitCode: number | null;
}): SignatureVerdict {
  const configured = (input.expectedFingerprint ?? '').trim();
  if (configured === '') {
    return {
      ok: false,
      reason: `no trusted signer fingerprint is configured (${EXPECTED_FINGERPRINT_ENV}) — refusing to accept an unpinned signing certificate`,
    };
  }

  const expected = normalizeFingerprint(configured);
  if (!expected) {
    return {
      ok: false,
      reason: `${EXPECTED_FINGERPRINT_ENV} is not a SHA-256 fingerprint (expected 64 hex digits, colons optional)`,
    };
  }

  if (input.keytoolExitCode === null) {
    return { ok: false, reason: 'keytool could not run — the signing certificate cannot be identified' };
  }
  if (input.keytoolExitCode !== 0) {
    return {
      ok: false,
      reason: `keytool exited ${input.keytoolExitCode} — the signing certificate cannot be identified`,
    };
  }

  const signers = extractSignerFingerprints(input.keytoolOutput);
  if (signers.length === 0) {
    return { ok: false, reason: 'the bundle reports no signer certificate fingerprint' };
  }

  const mismatched = signers.filter((fingerprint) => fingerprint !== expected).length;
  if (mismatched > 0) {
    return {
      ok: false,
      reason: `${mismatched} of ${signers.length} signer certificate(s) do not match the configured fingerprint`,
    };
  }

  return { ok: true, reason: `all ${signers.length} signer certificate(s) match the configured fingerprint` };
}

function listEntries(aabPath: string): { entries: string[]; error: string | null } {
  const result = spawnSync('jar', ['tf', aabPath], { encoding: 'utf8' });
  if (result.error) return { entries: [], error: `jar could not run: ${result.error.message}` };
  if (result.status !== 0) {
    return { entries: [], error: `jar exited ${result.status}: ${(result.stderr ?? '').trim()}` };
  }
  return { entries: (result.stdout ?? '').split('\n').filter((line) => line.trim() !== ''), error: null };
}

function runJarsigner(aabPath: string): { output: string; exitCode: number | null } {
  const result = spawnSync('jarsigner', ['-verify', '-certs', aabPath], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) {
    return { output: `${output}\njarsigner could not run: ${result.error.message}`, exitCode: null };
  }
  return { output, exitCode: result.status };
}

function runKeytool(aabPath: string): { output: string; exitCode: number | null } {
  const result = spawnSync('keytool', ['-printcert', '-jarfile', aabPath], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) {
    return { output: `${output}\nkeytool could not run: ${result.error.message}`, exitCode: null };
  }
  return { output, exitCode: result.status };
}

interface Options {
  aabPath: string;
  signatureOnly: boolean;
  error: string | null;
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  let signatureOnly = false;
  let error: string | null = null;

  for (const argument of argv) {
    if (argument === '--signature-only') {
      signatureOnly = true;
    } else if (argument.startsWith('-')) {
      error = `unknown option ${argument} — usage: verifyBundleSignature.ts [path-to.aab] [--signature-only]`;
    } else {
      positional.push(argument);
    }
  }

  return { aabPath: positional[0] ?? DEFAULT_AAB_PATH, signatureOnly, error };
}

function main(argv: string[]): number {
  const { aabPath, signatureOnly, error } = parseArgs(argv);
  if (error) {
    console.error(`::error::${error}`);
    return 1;
  }

  if (!existsSync(aabPath)) {
    console.error(`::error::No bundle at ${aabPath} — nothing to verify.`);
    return 1;
  }

  const { entries, error: listingError } = listEntries(aabPath);
  if (listingError) {
    console.error(`::error::Could not read the bundle's entries: ${listingError}`);
    return 1;
  }

  // Only pay for jarsigner when a signature block is actually present.
  const block = findSignatureBlock(entries);
  const jarsigner = block ? runJarsigner(aabPath) : { output: 'jar is unsigned', exitCode: 1 };

  const signature = evaluateBundleSignature({
    entries,
    jarsignerOutput: jarsigner.output,
    jarsignerExitCode: jarsigner.exitCode,
  });

  if (!signature.ok) {
    console.error(`::error::Bundle signature verification FAILED — ${signature.reason}.`);
    console.error(jarsigner.output.trim());
    return 1;
  }

  console.log(`Bundle signature verified — ${signature.reason}.`);

  if (signatureOnly) {
    console.log(
      '::notice::Signer identity NOT checked (--signature-only). This is the rehearsal path: the bundle is signed with a throwaway key and must never be uploaded to Play Console.',
    );
    return 0;
  }

  const keytool = runKeytool(aabPath);
  const identity = evaluateSigningIdentity({
    expectedFingerprint: process.env[EXPECTED_FINGERPRINT_ENV],
    keytoolOutput: keytool.output,
    keytoolExitCode: keytool.exitCode,
  });

  if (!identity.ok) {
    console.error(`::error::Signer identity verification FAILED — ${identity.reason}.`);
    return 1;
  }

  console.log(`Signer identity verified — ${identity.reason}.`);
  return 0;
}

const isEntryPoint = (import.meta as ImportMeta & { main?: boolean }).main === true;
if (isEntryPoint) {
  process.exitCode = main(process.argv.slice(2));
}
