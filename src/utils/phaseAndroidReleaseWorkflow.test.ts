/**
 * Phase AR-2 — the Android release workflow's security structure.
 *
 * Run with: bun test src/utils/phaseAndroidReleaseWorkflow.test.ts
 *
 * ── WHAT THIS PINS, AND WHY IT IS A TEST RATHER THAN A REVIEW ────────────────────────────────
 * The pre-hardening workflow said "a feature branch must never produce a store artifact" in a
 * comment (lines 3-5 of the old file) and enforced nothing: `workflow_dispatch` accepted any ref,
 * `push: tags: ['v*']` accepted any v-tag, and the four signing secrets were injected into the
 * single job that every ref ran. A comment cannot fail a build; these assertions can.
 *
 *   A. triggers and release refs           — dispatch + `v*` tags, nothing branch-scoped
 *   B. the job-level guard                 — `main` or `v*` only, dispatch cannot bypass it
 *   C. secret isolation                    — `secrets.*` appears in the release job ONLY
 *   D. rehearsal safety                    — throwaway key, no upload-key path, own artifact name
 *   E. verify-before-upload                — signature verification precedes the upload step
 *   F. keystore handling                   — no shell heredoc; the escaping script is used
 *   G. cleanup                             — signing material removed unconditionally
 *
 * Phase AR-3 made the two jobs MUTUALLY EXCLUSIVE by trigger: a `v*` tag push runs the release path
 * alone, a rehearsal dispatch runs the rehearsal path alone. This file's assertions that described
 * the old `needs:` dependency and the old single-clause ref guard were REBASED to that structure
 * (not weakened); the full trigger matrix, the tag-provenance step and the signer-identity pin are
 * pinned in `phaseAndroidReleaseSeparation.test.ts`.
 *
 * The workflow YAML is parsed with Bun's own parser (`Bun.YAML.parse`), so the assertions read the
 * structure GitHub reads, not a text match on the file.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const WORKFLOW_PATH = new URL('../../.github/workflows/android-release.yml', import.meta.url);
const RAW = readFileSync(WORKFLOW_PATH, 'utf8');

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  name?: string;
  needs?: string | string[];
  if?: string;
  runsOn?: string;
  environment?: unknown;
  steps?: WorkflowStep[];
}

interface Workflow {
  name?: string;
  on?: unknown;
  jobs?: Record<string, WorkflowJob>;
}

/** Bun's YAML parser may resolve the bare key `on` to the string 'on' or to boolean true. */
function parseWorkflow(): Workflow {
  const yaml = (globalThis as { Bun?: { YAML?: { parse(text: string): unknown } } }).Bun?.YAML;
  if (!yaml) throw new Error('Bun.YAML is unavailable — cannot parse the workflow structurally.');
  return yaml.parse(RAW) as Workflow;
}

const workflow = parseWorkflow();

function triggers(): Record<string, unknown> {
  const node = workflow as unknown as Record<string, unknown>;
  const value = (node.on ?? node['true'] ?? node[true as unknown as string]) as
    | Record<string, unknown>
    | undefined;
  if (!value) throw new Error('the workflow declares no `on:` block');
  return value;
}

function job(id: string): WorkflowJob {
  const found = workflow.jobs?.[id];
  if (!found) throw new Error(`missing job: ${id}`);
  return found;
}

function steps(id: string): WorkflowStep[] {
  return job(id).steps ?? [];
}

function stepNamed(id: string, fragment: string): { step: WorkflowStep; index: number } {
  const list = steps(id);
  const index = list.findIndex((entry) => (entry.name ?? '').includes(fragment));
  if (index === -1) throw new Error(`no step matching "${fragment}" in job ${id}`);
  return { step: list[index], index };
}

/** Every `secrets.NAME` reference inside one job's parsed subtree. */
function secretNamesIn(id: string): string[] {
  const found = new Set<string>();
  const text = JSON.stringify(job(id));
  for (const match of text.matchAll(/secrets\.([A-Z0-9_]+)/g)) found.add(match[1]);
  return [...found].sort();
}

const RELEASE_SECRETS = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

const REHEARSAL_ARTIFACT = 'rehearsal-aab-do-not-upload';
const RELEASE_ARTIFACT = 'sand-and-steel-aab';

// ── A. triggers and release refs ─────────────────────────────────────────────────────────────

describe('A. permitted triggers', () => {
  test('exactly two triggers: manual dispatch and v* tag pushes', () => {
    expect(Object.keys(triggers()).sort()).toEqual(['push', 'workflow_dispatch']);
  });

  test('the tag trigger is `v*` and carries no branch filter that could widen it', () => {
    const push = triggers().push as { tags?: string[]; branches?: string[] };
    expect(push.tags).toEqual(['v*']);
    expect(push.branches).toBeUndefined();
  });

  test('workflow_dispatch requires an explicit mode, defaulting to the safe rehearsal', () => {
    const dispatch = triggers().workflow_dispatch as {
      inputs?: Record<string, { type?: string; options?: string[]; default?: string }>;
    };
    const mode = dispatch.inputs?.mode;
    expect(mode).toBeDefined();
    expect(mode?.type).toBe('choice');
    expect(mode?.options).toEqual(['rehearsal', 'release']);
    expect(mode?.default).toBe('rehearsal');
  });
});

// ── B. the job-level release guard ───────────────────────────────────────────────────────────

describe('B. the release guard is job-level and ref-based', () => {
  // AR-3 replaced `needs: rehearsal` with mutually exclusive job-level guards: a `needs:` on a job
  // that a tag push skips would skip the release too, and a tag push must reach the release path.
  test('two jobs, and neither depends on the other', () => {
    expect(Object.keys(workflow.jobs ?? {}).sort()).toEqual(['rehearsal', 'release']);
    expect(job('release').needs).toBeUndefined();
    expect(job('rehearsal').needs).toBeUndefined();
  });

  test('the approved refs are exactly the protected branch and the v* tag convention', () => {
    const guard = job('release').if ?? '';
    expect(guard).toContain("github.ref == 'refs/heads/main'");
    expect(guard).toContain("startsWith(github.ref, 'refs/tags/v')");
  });

  test('a manual run must also ask for release mode from main, so dispatch cannot bypass the ref rule', () => {
    const guard = job('release').if ?? '';
    // AR-3's matrix: a tag push, OR a `release` dispatch pinned to main. Every term is ANDed inside
    // its own clause, so a feature-branch dispatch fails on the ref. Evaluated per trigger in
    // `phaseAndroidReleaseSeparation.test.ts` §A.
    expect(guard).toContain("github.event_name == 'push'");
    expect(guard).toContain("github.event_name == 'workflow_dispatch'");
    expect(guard).toContain("inputs.mode == 'release'");
    expect(guard).toContain("github.ref == 'refs/heads/main'");
  });

  test('the guard is on the JOB, not merely on its steps — a skipped job never starts a runner', () => {
    expect(typeof job('release').if).toBe('string');
    expect((job('release').if ?? '').trim().length).toBeGreaterThan(0);
    // Nothing in this job may re-enable it for a non-approved ref.
    expect(job('release').if ?? '').not.toContain('always()');
  });

  test('the rehearsal job is the safe path for every REF, and only for a manual rehearsal run', () => {
    // It carries no ref term at all — any branch may rehearse — but AR-3 gates it to a manual
    // `mode: rehearsal` dispatch so a tag push runs the release path alone.
    expect(job('rehearsal').if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.mode == 'rehearsal'",
    );
    expect(job('rehearsal').if ?? '').not.toContain('github.ref');
  });
});

// ── C. secret isolation ─────────────────────────────────────────────────────────────────────

describe('C. production secrets are unreachable outside the release job', () => {
  test('the rehearsal job references no secret at all', () => {
    expect(secretNamesIn('rehearsal')).toEqual([]);
    expect(JSON.stringify(job('rehearsal'))).not.toContain('secrets.');
  });

  test('the release job references exactly the four keystore secrets plus the signer fingerprint', () => {
    // AR-3 added the upload certificate's fingerprint as the fifth, release-only secret.
    expect(secretNamesIn('release')).toEqual([...RELEASE_SECRETS, 'ANDROID_UPLOAD_CERT_SHA256'].sort());
  });

  test('no secret is lifted into a job-level env, so a skipped job cannot resolve one', () => {
    expect((job('release') as { env?: unknown }).env).toBeUndefined();
    expect((job('rehearsal') as { env?: unknown }).env).toBeUndefined();
  });

  test('the keystore secrets are confined to the one restore step', () => {
    const holders = steps('release').filter((entry) =>
      RELEASE_SECRETS.some((name) => JSON.stringify(entry).includes(name)),
    );
    expect(holders).toHaveLength(1);
    expect(holders[0].name).toContain('Restore the upload keystore');
  });

  test('there is no environment gate claimed that does not exist', () => {
    expect(job('release').environment).toBeUndefined();
  });
});

// ── D. rehearsal safety ─────────────────────────────────────────────────────────────────────

describe('D. the rehearsal path cannot produce or masquerade as a release', () => {
  test('it signs with a throwaway key generated on the runner', () => {
    const { step } = stepNamed('rehearsal', 'throwaway signing key');
    expect(step.run).toContain('keytool -genkeypair');
    expect(step.run).toContain('rehearsal.keystore');
    expect(step.run).toContain('openssl rand -hex');
  });

  test('it never names the production keystore', () => {
    const text = JSON.stringify(job('rehearsal'));
    expect(text).not.toContain('Sand-and-Steel.keystore');
    expect(text).not.toContain('ANDROID_KEYSTORE_BASE64');
    expect(text).not.toContain('ANDROID_KEYSTORE_PASSWORD');
  });

  test('it runs the same gates plus web build, Cap sync and Android packaging', () => {
    const runs = steps('rehearsal').map((entry) => entry.run ?? '').join('\n');
    expect(runs).toContain('bun test');
    expect(runs).toContain('bun run lint');
    expect(runs).toContain('bun run cap:sync');
    expect(runs).toContain('./gradlew bundleRelease');
    expect(runs).toContain('verifyBundleSignature.ts');
  });

  test('its artifact is clearly labelled and is not the release name', () => {
    const { step } = stepNamed('rehearsal', 'Upload the REHEARSAL bundle');
    const name = String((step.with ?? {})['name'] ?? '');
    expect(name).toBe(REHEARSAL_ARTIFACT);
    expect(name).not.toBe(RELEASE_ARTIFACT);
    expect(name.toLowerCase()).toContain('rehearsal');
    expect(name.toLowerCase()).toContain('do-not-upload');
    expect(step.with?.['retention-days']).toBe(7);
  });

  test('it labels its logs as a rehearsal', () => {
    const text = JSON.stringify(job('rehearsal'));
    expect(text).toContain('::notice::REHEARSAL');
    expect(text.toLowerCase()).toContain('not a release candidate');
  });
});

// ── E. verify-before-upload ─────────────────────────────────────────────────────────────────

describe('E. the release upload depends on a passing signature verification', () => {
  test('the only release artifact keeps the established name', () => {
    const { step } = stepNamed('release', 'Upload the signed .aab');
    expect(String((step.with ?? {})['name'] ?? '')).toBe(RELEASE_ARTIFACT);
    expect(String((step.with ?? {})['path'] ?? '')).toContain('app-release.aab');
  });

  test('verification runs BEFORE the upload step in the same job', () => {
    const verify = stepNamed('release', 'Verify the release bundle signature');
    const upload = stepNamed('release', 'Upload the signed .aab');
    expect(verify.index).toBeLessThan(upload.index);
    expect(verify.step.run).toContain('verifyBundleSignature.ts');
  });

  test('neither the verification nor the upload may be allowed to fail softly', () => {
    const verify = stepNamed('release', 'Verify the release bundle signature').step;
    const upload = stepNamed('release', 'Upload the signed .aab').step;
    for (const entry of [verify, upload]) {
      expect(entry['continue-on-error' as keyof WorkflowStep]).toBeUndefined();
    }
    // No `if:` on either step: both inherit success(), so a failed check stops the job.
    expect(verify.if).toBeUndefined();
    expect(upload.if).toBeUndefined();
    expect(JSON.stringify(job('release'))).not.toContain('continue-on-error');
  });

  // AR-3 removed `needs: rehearsal` so a tag push can run the release path alone; the release job
  // therefore runs the same gates itself, before any signing material is restored.
  test('the release job runs its own gates before signing', () => {
    const runs = steps('release').map((entry) => entry.run ?? '').join('\n');
    expect(runs).toContain('bun test');
    expect(runs).toContain('bun run lint');
    expect(runs).toContain('bun run cap:sync');
    expect(stepNamed('release', 'Test suite').index).toBeLessThan(
      stepNamed('release', 'Restore the upload keystore').index,
    );
  });
});

// ── F. keystore properties handling ─────────────────────────────────────────────────────────

describe('F. no shell interpolation of passwords', () => {
  test('the unsafe heredoc is gone from the whole file', () => {
    expect(RAW).not.toContain('<<PROPS');
    expect(RAW).not.toContain("<< 'PROPS'");
    // The old step wrote storePassword=$KEYSTORE_PASSWORD straight into the file.
    expect(RAW).not.toContain('storePassword=$');
    expect(RAW).not.toContain('keyPassword=$');
    expect(RAW).not.toContain('keyAlias=$');
  });

  test('properties are written by the escaping script, in both jobs', () => {
    for (const id of ['rehearsal', 'release']) {
      expect(steps(id).map((entry) => entry.run ?? '').join('\n')).toContain(
        'scripts/writeKeystoreProperties.ts',
      );
    }
  });

  test('the keystore file is decoded straight to disk with a restrictive umask', () => {
    const { step } = stepNamed('release', 'Restore the upload keystore');
    expect(step.run).toContain('umask 077');
    expect(step.run).toContain('base64 --decode');
    // Presence is checked for every secret before anything is written.
    expect(step.run).toContain('Missing repository secret for $name');
    expect(step.run).toContain('set -euo pipefail');
  });

  test('the keystore is never echoed or printed', () => {
    for (const id of ['rehearsal', 'release']) {
      const text = steps(id).map((entry) => entry.run ?? '').join('\n');
      expect(text).not.toMatch(/echo[^\n]*\$KEYSTORE_BASE64/);
      expect(text).not.toMatch(/cat\s+android\/keystore\.properties/);
      expect(text).not.toContain('printenv');
    }
  });
});

// ── G. unconditional cleanup ────────────────────────────────────────────────────────────────

describe('G. signing material is removed unconditionally', () => {
  test('the release job deletes the keystore and properties even when the build fails', () => {
    const { step } = stepNamed('release', 'Remove signing material');
    expect(step.if).toBe('always()');
    expect(step.run).toContain('Sand-and-Steel.keystore');
    expect(step.run).toContain('android/keystore.properties');
  });

  test('the rehearsal job does the same for its throwaway key', () => {
    const { step } = stepNamed('rehearsal', 'Remove signing material');
    expect(step.if).toBe('always()');
    expect(step.run).toContain('rehearsal.keystore');
    expect(step.run).toContain('android/keystore.properties');
  });

  test('the signing files are git-ignored, so a run can never commit them', () => {
    const ignored = readFileSync(new URL('../../android/.gitignore', import.meta.url), 'utf8');
    expect(ignored).toMatch(/^\*\.keystore$/m);
    expect(ignored).toMatch(/^\*\.jks$/m);
    expect(ignored).toMatch(/^keystore\.properties$/m);
  });
});
