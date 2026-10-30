/**
 * Phase AR-3 — the Android release workflow's trigger matrix and tag provenance.
 *
 * Run with: bun test src/utils/phaseAndroidReleaseSeparation.test.ts
 *
 * ── WHAT THIS PINS, AND WHY IT IS A TEST RATHER THAN A REVIEW ────────────────────────────────
 * AR-2 hardened the workflow so a *feature branch* could not sign. It still let the two paths
 * overlap: the `rehearsal` job ran for EVERY trigger — including a `v*` tag push — so a tagged
 * release built a rehearsal artifact as well, and the signing job was gated on that rehearsal
 * through `needs:`. AR-3 makes the two paths mutually exclusive and adds tag provenance:
 *
 *   A. the trigger matrix                — each job's `if:` admits only its own event, and no
 *                                          event starts both (evaluated, not text-matched)
 *   B. the trigger filters               — `v*` tags only, no branch push, mode defaults to safe
 *   C. secret isolation                  — `secrets.*` appears in the release job alone
 *   D. tag provenance                    — a tag must be reachable from `main`, checked before any
 *                                          secret-bearing step, failing closed
 *   E. provenance behaviour              — the real shell block driven against a real repository
 *   F. every shell block parses          — `bash -n` over each `run:`
 *   G. signer identity is pinned         — rehearsal opts out explicitly, release cannot
 *
 * The guards are EVALUATED here: `github.event_name`, `github.ref` and `inputs.mode` are
 * substituted into the same boolean expression GitHub reads, and the result is computed. A guard
 * that grew a context this evaluator cannot model raises rather than passing silently.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  env?: unknown;
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

const KEYSTORE_SECRETS = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

const FINGERPRINT_SECRET = 'ANDROID_UPLOAD_CERT_SHA256';
const REHEARSAL_ARTIFACT = 'rehearsal-aab-do-not-upload';
const RELEASE_ARTIFACT = 'sand-and-steel-aab';

// ── the guard evaluator ──────────────────────────────────────────────────────────────────────

interface GuardContext {
  eventName: 'push' | 'workflow_dispatch' | 'pull_request' | 'schedule';
  ref: string;
  mode?: string;
}

/**
 * Evaluate a job-level `if:` the way GitHub does, for the three contexts these guards use.
 *
 * Anything the model does not cover — `needs.*`, `vars.*`, `github.sha` — raises instead of
 * evaluating to something plausible, so a guard that outgrows this helper fails the suite loudly.
 */
function evaluateGuard(expression: string, context: GuardContext): boolean {
  const quote = (value: string | undefined): string => JSON.stringify(value ?? '');

  let expr = expression.replace(/\s+/g, ' ').trim();
  expr = expr.replace(/github\.event_name/g, quote(context.eventName));
  expr = expr.replace(/github\.ref\b/g, quote(context.ref));
  expr = expr.replace(/\binputs\.mode\b/g, quote(context.mode));
  expr = expr.replace(/startsWith\(([^,()]+),\s*([^()]+)\)/g, '($1).startsWith($2)');

  const withoutStrings = expr.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const unmodelled = withoutStrings.match(/\b(github|needs|vars|secrets|inputs)\.[A-Za-z_][A-Za-z0-9_.]*/);
  if (unmodelled) throw new Error(`the guard uses a context this evaluator does not model: ${unmodelled[0]}`);

  return new Function(`return (${expr});`)() === true;
}

interface MatrixRow {
  name: string;
  context: GuardContext;
  rehearsal: boolean;
  release: boolean;
}

const MATRIX: MatrixRow[] = [
  // tag pushes — the release path ALONE
  { name: 'push of an approved v* tag', context: { eventName: 'push', ref: 'refs/tags/v1.0.0' }, rehearsal: false, release: true },
  { name: 'push of an approved v* pre-release tag', context: { eventName: 'push', ref: 'refs/tags/v1.0.0-alpha.1' }, rehearsal: false, release: true },
  { name: 'push of a non-v tag', context: { eventName: 'push', ref: 'refs/tags/release-1.0.0' }, rehearsal: false, release: false },
  { name: 'push of a branch', context: { eventName: 'push', ref: 'refs/heads/main' }, rehearsal: false, release: false },
  { name: 'push of a branch whose name starts with v', context: { eventName: 'push', ref: 'refs/heads/v-feature' }, rehearsal: false, release: false },
  // manual rehearsal — the rehearsal path ALONE, from any ref
  { name: 'rehearsal dispatch from a feature branch', context: { eventName: 'workflow_dispatch', ref: 'refs/heads/development-focus-strategy', mode: 'rehearsal' }, rehearsal: true, release: false },
  { name: 'rehearsal dispatch from main', context: { eventName: 'workflow_dispatch', ref: 'refs/heads/main', mode: 'rehearsal' }, rehearsal: true, release: false },
  { name: 'rehearsal dispatch from a tag', context: { eventName: 'workflow_dispatch', ref: 'refs/tags/v1.0.0', mode: 'rehearsal' }, rehearsal: true, release: false },
  // manual release — main only
  { name: 'release dispatch from main', context: { eventName: 'workflow_dispatch', ref: 'refs/heads/main', mode: 'release' }, rehearsal: false, release: true },
  { name: 'release dispatch from a feature branch', context: { eventName: 'workflow_dispatch', ref: 'refs/heads/feature/x', mode: 'release' }, rehearsal: false, release: false },
  { name: 'release dispatch from a pull-request merge ref', context: { eventName: 'workflow_dispatch', ref: 'refs/pull/42/merge', mode: 'release' }, rehearsal: false, release: false },
  { name: 'release dispatch from a tag', context: { eventName: 'workflow_dispatch', ref: 'refs/tags/v2.0.0', mode: 'release' }, rehearsal: false, release: false },
  // unauthorized modes and missing input
  { name: 'dispatch with no mode', context: { eventName: 'workflow_dispatch', ref: 'refs/heads/main' }, rehearsal: false, release: false },
  { name: 'dispatch with an unauthorized mode', context: { eventName: 'workflow_dispatch', ref: 'refs/heads/main', mode: 'production' }, rehearsal: false, release: false },
  // events the workflow does not subscribe to at all
  { name: 'pull-request event', context: { eventName: 'pull_request', ref: 'refs/pull/7/merge' }, rehearsal: false, release: false },
  { name: 'schedule event', context: { eventName: 'schedule', ref: 'refs/heads/main' }, rehearsal: false, release: false },
];

function rehearsalRuns(context: GuardContext): boolean {
  const guard = job('rehearsal').if;
  if (typeof guard !== 'string') throw new Error('the rehearsal job has no `if:` — it would run for every trigger');
  return evaluateGuard(guard, context);
}

function releaseRuns(context: GuardContext): boolean {
  const guard = job('release').if;
  if (typeof guard !== 'string') throw new Error('the release job has no `if:` — it would sign for every trigger');
  return evaluateGuard(guard, context);
}

// ── A. the trigger matrix ───────────────────────────────────────────────────────────────────

describe('A. rehearsal and release are mutually exclusive across every trigger', () => {
  for (const row of MATRIX) {
    test(`${row.name}: rehearsal=${row.rehearsal}, release=${row.release}`, () => {
      expect(rehearsalRuns(row.context)).toBe(row.rehearsal);
      expect(releaseRuns(row.context)).toBe(row.release);
      // The property the matrix exists for, asserted independently of the expected pair.
      expect(rehearsalRuns(row.context) && releaseRuns(row.context)).toBe(false);
    });
  }

  test('no row can start both jobs, and the matrix exercises both paths', () => {
    const running = MATRIX.map((row) => [rehearsalRuns(row.context), releaseRuns(row.context)] as const);
    expect(running.every(([rehearsal, release]) => !(rehearsal && release))).toBe(true);
    expect(running.some(([rehearsal]) => rehearsal)).toBe(true);
    expect(running.some(([, release]) => release)).toBe(true);
  });

  test('a tag push runs the production path only and starts no rehearsal artifact', () => {
    const tag = { eventName: 'push' as const, ref: 'refs/tags/v1.0.0' };
    expect(rehearsalRuns(tag)).toBe(false);
    expect(releaseRuns(tag)).toBe(true);
    // Nothing in the rehearsal job may be reachable when its `if:` is false: no `always()` escape.
    expect(JSON.stringify(job('rehearsal')).includes('always()')).toBe(true); // the cleanup step only
    const cleanup = stepNamed('rehearsal', 'Remove signing material').step;
    expect(cleanup.if).toBe('always()');
    // …so the upload itself must not be able to run unconditionally either.
    const upload = stepNamed('rehearsal', 'Upload the REHEARSAL bundle').step;
    expect(upload.if).toBeUndefined();
  });

  test('release dispatch is reachable from main and from nowhere else', () => {
    const onMain = { eventName: 'workflow_dispatch' as const, ref: 'refs/heads/main', mode: 'release' };
    expect(releaseRuns(onMain)).toBe(true);
    for (const ref of ['refs/heads/feature/x', 'refs/heads/development-focus-strategy', 'refs/pull/1/merge', 'refs/tags/v9.9.9']) {
      expect(releaseRuns({ ...onMain, ref })).toBe(false);
    }
  });

  test('the guards are job-level, and neither job can be re-enabled by `always()`', () => {
    for (const id of ['rehearsal', 'release']) {
      const guard = job(id).if ?? '';
      expect(guard.trim().length).toBeGreaterThan(0);
      expect(guard).not.toContain('always()');
    }
  });

  test('neither job depends on the other, which is what allows the paths to be exclusive', () => {
    expect(job('rehearsal').needs).toBeUndefined();
    expect(job('release').needs).toBeUndefined();
    expect(Object.keys(workflow.jobs ?? {}).sort()).toEqual(['rehearsal', 'release']);
  });

  test('the release job carries the gates it no longer inherits', () => {
    const runs = steps('release').map((entry) => entry.run ?? '').join('\n');
    expect(runs).toContain('bun test');
    expect(runs).toContain('bun run lint');
    expect(runs).toContain('bun run cap:sync');
    expect(runs).toContain('./gradlew bundleRelease');
  });

  test('CONTROL — the pre-hardening shape (a always-on rehearsal) fails this matrix', () => {
    const tag = { eventName: 'push' as const, ref: 'refs/tags/v1.0.0' };
    // AR-2 ran the rehearsal on every trigger and gated release on `needs:`. Modelled as the
    // unconditional rehearsal plus the old ref/mode clause, a tag push started BOTH jobs.
    const legacyRehearsal = true;
    const legacyRelease = evaluateGuard(
      "(github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')) && (github.event_name != 'workflow_dispatch' || inputs.mode == 'release')",
      tag,
    );
    expect(legacyRelease).toBe(true);
    expect(legacyRehearsal && legacyRelease).toBe(true);
    expect(rehearsalRuns(tag) && releaseRuns(tag)).toBe(false);
  });

  test('the evaluator itself is faithful — it is not vacuously true or false', () => {
    expect(evaluateGuard("github.ref == 'refs/heads/main'", { eventName: 'push', ref: 'refs/heads/main' })).toBe(true);
    expect(evaluateGuard("github.ref == 'refs/heads/main'", { eventName: 'push', ref: 'refs/heads/x' })).toBe(false);
    expect(evaluateGuard("startsWith(github.ref, 'refs/tags/v')", { eventName: 'push', ref: 'refs/tags/v2' })).toBe(true);
    expect(evaluateGuard("startsWith(github.ref, 'refs/tags/v')", { eventName: 'push', ref: 'refs/tags/release-2' })).toBe(false);
    expect(() => evaluateGuard('needs.rehearsal.result == \'success\'', { eventName: 'push', ref: 'refs/tags/v1' })).toThrow();
  });
});

// ── B. the trigger filters ─────────────────────────────────────────────────────────────────

describe('B. the trigger filters match the guard', () => {
  test('exactly two triggers: manual dispatch and v* tag pushes', () => {
    expect(Object.keys(triggers()).sort()).toEqual(['push', 'workflow_dispatch']);
  });

  test('the tag trigger is `v*` and has no branch filter that could widen it', () => {
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

// ── C. secret isolation ────────────────────────────────────────────────────────────────────

describe('C. production signing material never reaches the rehearsal path', () => {
  test('the rehearsal job references no secret at all', () => {
    expect(secretNamesIn('rehearsal')).toEqual([]);
    expect(JSON.stringify(job('rehearsal'))).not.toContain('secrets.');
  });

  test('the release job references exactly the keystore secrets plus the signer fingerprint', () => {
    expect(secretNamesIn('release')).toEqual([...KEYSTORE_SECRETS, FINGERPRINT_SECRET].sort());
  });

  test('the keystore secrets live in the restore step alone, the fingerprint in the verify step alone', () => {
    const keystoreHolders = steps('release').filter((entry) =>
      KEYSTORE_SECRETS.some((name) => JSON.stringify(entry).includes(name)),
    );
    expect(keystoreHolders).toHaveLength(1);
    expect(keystoreHolders[0].name).toContain('Restore the upload keystore');

    const fingerprintHolders = steps('release').filter((entry) => JSON.stringify(entry).includes(FINGERPRINT_SECRET));
    expect(fingerprintHolders).toHaveLength(1);
    expect(fingerprintHolders[0].name).toContain('Verify the release bundle signature');
  });

  test('no secret is lifted into a job-level env, so a skipped job cannot resolve one', () => {
    expect(job('release').env).toBeUndefined();
    expect(job('rehearsal').env).toBeUndefined();
    expect(job('release').environment).toBeUndefined();
  });

  test('the rehearsal never names the production keystore or its alias', () => {
    const text = JSON.stringify(job('rehearsal'));
    expect(text).not.toContain('Sand-and-Steel.keystore');
    for (const name of KEYSTORE_SECRETS) expect(text).not.toContain(name);
  });
});

// ── D. tag provenance ─────────────────────────────────────────────────────────────────────

describe('D. a release tag must point at a commit on main', () => {
  test('the provenance step exists, is tag-gated, and runs before any secret-bearing step', () => {
    const provenance = stepNamed('release', 'approved commit on main');
    expect(provenance.step.if).toBe("startsWith(github.ref, 'refs/tags/')");
    expect(provenance.index).toBeLessThan(stepNamed('release', 'Restore the upload keystore').index);
    expect(provenance.index).toBeLessThan(stepNamed('release', 'Verify the release bundle signature').index);
    // …and before the build gates too: an unapproved tag must not be built at all.
    expect(provenance.index).toBeLessThan(stepNamed('release', 'Test suite').index);
  });

  test('it checks ancestry against refs/heads/main and never against the tagged ref itself', () => {
    const run = stepNamed('release', 'approved commit on main').step.run ?? '';
    expect(run).toContain('set -euo pipefail');
    expect(run).toContain("git fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'");
    expect(run).toContain('git merge-base --is-ancestor');
    expect(run).toContain('refs/remotes/origin/main');
    expect(run).toContain('git rev-parse HEAD');
  });

  test('it fails closed on every failure branch, not just on a non-ancestor', () => {
    const run = stepNamed('release', 'approved commit on main').step.run ?? '';
    // fetch failure, missing ref, and the ancestry verdict each exit non-zero with an ::error::.
    expect(run.match(/::error::/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(run.match(/exit 1/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // No `|| true` / `continue-on-error` escape on this step.
    expect(run).not.toContain('|| true');
    expect(stepNamed('release', 'approved commit on main').step['continue-on-error' as keyof WorkflowStep]).toBeUndefined();
  });

  test('nothing in the workflow creates, moves or pushes a tag', () => {
    const allRuns = ['rehearsal', 'release']
      .flatMap((id) => steps(id))
      .map((entry) => entry.run ?? '')
      .join('\n');
    expect(allRuns).not.toMatch(/\bgit\s+tag\b/);
    expect(allRuns).not.toMatch(/\bgit\s+push\b/);
    expect(RAW).not.toMatch(/refs\/tags\/\*|git tag -a/);
  });
});

// ── E. provenance behaviour, against a real repository ────────────────────────────────────

const GIT_AVAILABLE = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

function git(cwd: string, args: string[]): { status: number | null; output: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('E. the provenance block, driven against a real repository', () => {
  const BLOCK = stepNamed('release', 'approved commit on main').step.run ?? '';

  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'ar3-provenance-'));
    const remote = join(dir, 'remote.git');
    const work = join(dir, 'work');

    expect(git(dir, ['init', '--bare', '-q', remote]).status).toBe(0);
    expect(git(dir, ['init', '-q', '-b', 'main', work]).status).toBe(0);
    expect(git(work, ['config', 'user.email', 'test@example.test']).status).toBe(0);
    expect(git(work, ['config', 'user.name', 'AR-3 test']).status).toBe(0);
    expect(git(work, ['remote', 'add', 'origin', remote]).status).toBe(0);

    writeFileSync(join(work, 'file.txt'), 'one\n');
    expect(git(work, ['add', 'file.txt']).status).toBe(0);
    expect(git(work, ['commit', '-q', '-m', 'approved commit']).status).toBe(0);
    expect(git(work, ['push', '-q', '-u', 'origin', 'main']).status).toBe(0);

    expect(git(work, ['checkout', '-q', '-b', 'feature']).status).toBe(0);
    writeFileSync(join(work, 'file.txt'), 'two\n');
    expect(git(work, ['commit', '-q', '-am', 'unapproved commit']).status).toBe(0);
    expect(git(work, ['push', '-q', '-u', 'origin', 'feature']).status).toBe(0);
    expect(git(work, ['tag', 'v-unapproved']).status).toBe(0);

    expect(git(work, ['checkout', '-q', 'main']).status).toBe(0);
    expect(git(work, ['tag', 'v-approved']).status).toBe(0);

    return { dir, work };
  }

  function runBlock(cwd: string, ref: string) {
    return spawnSync('bash', ['-c', BLOCK], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_REF: ref },
    });
  }

  test.skipIf(!GIT_AVAILABLE)('a tag on a main commit is accepted', () => {
    const { dir, work } = fixture();
    try {
      expect(git(work, ['checkout', '-q', '--detach', 'v-approved']).status).toBe(0);
      const result = runBlock(work, 'refs/tags/v-approved');
      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('reachable from refs/heads/main');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.skipIf(!GIT_AVAILABLE)('a tag on a feature-branch commit is refused', () => {
    const { dir, work } = fixture();
    try {
      expect(git(work, ['checkout', '-q', '--detach', 'v-unapproved']).status).toBe(0);
      const result = runBlock(work, 'refs/tags/v-unapproved');
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('is not reachable from refs/heads/main');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.skipIf(!GIT_AVAILABLE)('an unfetchable main fails closed rather than passing', () => {
    const { dir, work } = fixture();
    try {
      // `main` disappears from the remote; the ancestry question can no longer be answered.
      expect(git(dir, ['-C', join(dir, 'remote.git'), 'branch', '-m', 'main', 'renamed']).status).toBe(0);
      expect(git(work, ['checkout', '-q', '--detach', 'v-approved']).status).toBe(0);
      const result = runBlock(work, 'refs/tags/v-approved');
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('tag provenance cannot be verified');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the block is the one the workflow ships, so E cannot drift from D', () => {
    expect(BLOCK).toContain('git merge-base --is-ancestor');
    expect(BLOCK.length).toBeGreaterThan(200);
  });
});

// ── F. every shell block parses ───────────────────────────────────────────────────────────

describe('F. every `run:` block is valid shell', () => {
  const shellBlocks = ['rehearsal', 'release'].flatMap((id) =>
    steps(id)
      .filter((entry) => typeof entry.run === 'string')
      .map((entry) => ({ job: id, name: entry.name ?? '(unnamed)', run: entry.run as string })),
  );

  test('the sweep found the workflow shell blocks (it cannot pass vacuously)', () => {
    expect(shellBlocks.length).toBeGreaterThanOrEqual(10);
    for (const jobId of ['rehearsal', 'release']) {
      expect(shellBlocks.filter((block) => block.job === jobId).length).toBeGreaterThan(0);
    }
  });

  for (const block of shellBlocks) {
    test(`${block.job}: ${block.name}`, () => {
      const parsed = spawnSync('bash', ['-n'], { input: block.run, encoding: 'utf8' });
      expect(`${parsed.stderr ?? ''}`).toBe('');
      expect(parsed.status).toBe(0);
    });
  }

  test('the rehearsal properties writer is fed by environment, never by argv', () => {
    const run = stepNamed('rehearsal', 'throwaway signing key').step.run ?? '';
    expect(run).toContain('KEYSTORE_STORE_PASSWORD=');
    expect(run).toContain('-storepass "$KEYPASS"');
    expect(run).not.toMatch(/writeKeystoreProperties\.ts[^\n]*(pass|alias)/i);
  });
});

// ── G. signer identity ────────────────────────────────────────────────────────────────────

describe('G. the release verification is pinned to a signer certificate', () => {
  test('rehearsal opts out of the identity check explicitly, and says so', () => {
    const run = stepNamed('rehearsal', 'Verify the practice bundle signature').step.run ?? '';
    expect(run).toContain('verifyBundleSignature.ts');
    expect(run).toContain('--signature-only');
    expect(stepNamed('rehearsal', 'Verify the practice bundle signature').step.env).toBeUndefined();
  });

  test('release runs the same script WITHOUT the opt-out, with the fingerprint configured', () => {
    const { step } = stepNamed('release', 'Verify the release bundle signature');
    const run = step.run ?? '';
    expect(run).toContain('verifyBundleSignature.ts');
    expect(run).not.toContain('--signature-only');
    expect(step.env?.['EXPECTED_SIGNER_SHA256']).toBe(`\${{ secrets.${FINGERPRINT_SECRET} }}`);
  });

  test('verification precedes the upload and neither may fail softly', () => {
    const verify = stepNamed('release', 'Verify the release bundle signature');
    const upload = stepNamed('release', 'Upload the signed .aab');
    expect(verify.index).toBeLessThan(upload.index);
    expect(upload.step['continue-on-error' as keyof WorkflowStep]).toBeUndefined();
    expect(verify.step.if).toBeUndefined();
    expect(upload.step.if).toBeUndefined();
    expect(JSON.stringify(job('release'))).not.toContain('continue-on-error');
  });

  test('the artifacts keep their established names and never cross over', () => {
    const rehearsalName = String((stepNamed('rehearsal', 'Upload the REHEARSAL bundle').step.with ?? {})['name'] ?? '');
    const releaseName = String((stepNamed('release', 'Upload the signed .aab').step.with ?? {})['name'] ?? '');
    expect(rehearsalName).toBe(REHEARSAL_ARTIFACT);
    expect(releaseName).toBe(RELEASE_ARTIFACT);
    // A tag run cannot produce the rehearsal artifact: the job that uploads it is not started.
    expect(rehearsalRuns({ eventName: 'push', ref: 'refs/tags/v1.0.0' })).toBe(false);
    expect(releaseRuns({ eventName: 'workflow_dispatch', ref: 'refs/heads/main', mode: 'rehearsal' })).toBe(false);
  });
});
