/**
 * verifyBundleSignature.ts — proves a built `.aab` actually carries a valid JAR signature.
 *
 * Run with:  bun run scripts/verifyBundleSignature.ts <path-to.aab>
 *
 * WHY THIS EXISTS: an UNSIGNED bundle builds perfectly well. `android/app/build.gradle` applies
 * the release `signingConfig` only when `android/keystore.properties` exists, so a missing or
 * mis-wired keystore yields a `bundleRelease` that exits 0 and produces an artifact Play Console
 * rejects on upload. The release job therefore refuses to publish anything until this check
 * passes; the rehearsal job runs the same check against its throwaway key, so the verification
 * path itself is exercised before a real release depends on it.
 *
 * WHICH TOOL IS "APPROPRIATE" FOR AN AAB: an Android App Bundle is a JAR signed with the JAR
 * signature scheme (v1) — `apksigner`, which verifies APK signature schemes, does not apply to a
 * `.aab`. The right tools are the JDK's own `jarsigner -verify` plus the presence of a signature
 * block in `META-INF/`, both used below. `jar` and `jarsigner` ship with the JDK that
 * `actions/setup-java` installs, so no Android SDK component is needed.
 *
 * LIMITATION, stated rather than hidden: this proves the bundle is signed and that the signature
 * verifies. It cannot prove the signer is *your* upload key — that needs the certificate
 * fingerprint, which is deliberately not in this repository. Confirm the signer fingerprint once,
 * by hand, the first time a release bundle is built.
 *
 * The decision logic is exported as pure functions so `bun test` can pin it without a JDK.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** `META-INF/CERT.RSA` — a JAR signature block, directly under `META-INF/`. */
const SIGNATURE_BLOCK = /^META-INF\/[^/]+\.(?:RSA|DSA|EC)$/i;

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

function main(argv: string[]): number {
  const aabPath = argv[0] ?? DEFAULT_AAB_PATH;

  if (!existsSync(aabPath)) {
    console.error(`::error::No bundle at ${aabPath} — nothing to verify.`);
    return 1;
  }

  const { entries, error } = listEntries(aabPath);
  if (error) {
    console.error(`::error::Could not read the bundle's entries: ${error}`);
    return 1;
  }

  // Only pay for jarsigner when a signature block is actually present.
  const block = findSignatureBlock(entries);
  const jarsigner = block ? runJarsigner(aabPath) : { output: 'jar is unsigned', exitCode: 1 };

  const verdict = evaluateBundleSignature({
    entries,
    jarsignerOutput: jarsigner.output,
    jarsignerExitCode: jarsigner.exitCode,
  });

  if (!verdict.ok) {
    console.error(`::error::Bundle signature verification FAILED — ${verdict.reason}.`);
    console.error(jarsigner.output.trim());
    return 1;
  }

  console.log(`Bundle signature verified — ${verdict.reason}.`);
  console.log(
    `::notice::Signature verification passed for ${aabPath}. Confirm the signer fingerprint by hand on the first release.`,
  );
  return 0;
}

const isEntryPoint = (import.meta as ImportMeta & { main?: boolean }).main === true;
if (isEntryPoint) {
  process.exitCode = main(process.argv.slice(2));
}
