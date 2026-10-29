/**
 * Alpha build identification — the label a bug report is filed against.
 *
 * THE GAP THIS PINS. The title screen's version line was a bare hardcoded string
 * ("Alpha 1.0") and `package.json` carried no release version, so a build could not
 * be tied to the commit it was made from: two alphas could wear the same label, and a
 * report could not name the code it came from. The fix is one release name in one
 * place plus a build id resolved AT BUILD TIME (`vite.config.ts` defines
 * `__BUILD_ID__` through `scripts/buildId.ts`, from the checkout's short commit, `dev`
 * when there is no history).
 *
 * THE RESOLVER IS EXERCISED, NOT GREPPED. `scripts/buildId.ts` is importable build
 * tooling, so every branch below is driven against a throwaway `.git` laid out in the
 * OS temp directory — an ordinary symbolic HEAD, a detached HEAD, packed refs, a linked
 * worktree, missing/unreadable/dangling metadata — plus the builder's env overrides and
 * an injected git runner. No test edits this repository's own git metadata.
 *
 * Sections:
 *   §A  the pure label contract — the release name, the id, the `dev` fallback
 *   §B  the resolver's ref-file branches, driven against real fixtures
 *   §C  the git-binary route and its validation (injected runner)
 *   §D  BUILD_COMMIT / GIT_COMMIT precedence and malformed-value rejection
 *   §E  the bundle seam — build time only, one source, no runtime git
 *   §F  the wiring — the title screen renders the derived label and hardcodes nothing
 *
 * Run with: `bun test src/utils/buildInfo.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ALPHA_LABEL, UNKNOWN_BUILD_ID, buildLabel, readBuildId } from './buildInfo';
// @ts-ignore — build tooling, typed by the repo's own tsconfig (scripts is included)
import { BUILD_ID_LENGTH, resolveBuildId } from '../../scripts/buildId';

const FULL_SHA = '4104a13fed434fd0a90e174eac4b6d7ca7aa624c';
const SHORT_SHA = FULL_SHA.slice(0, BUILD_ID_LENGTH);

const viteConfigSource = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
const titleSource = readFileSync(
  new URL('../components/hub/TitleScreen.tsx', import.meta.url),
  'utf8',
);

const fixtures: string[] = [];
afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway checkout root; `build` lays out whatever `.git` the case needs. */
function fixture(build: (root: string) => void): string {
  const root = mkdtempSync(path.join(tmpdir(), 'build-id-'));
  fixtures.push(root);
  build(root);
  return root;
}

/** An ordinary `.git` directory: HEAD plus whichever refs the case wants loose. */
function gitRepo(
  root: string,
  head: string,
  refs: Record<string, string> = {},
  packed?: string,
): void {
  const gitDir = path.join(root, '.git');
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(path.join(gitDir, 'HEAD'), head);
  for (const [name, sha] of Object.entries(refs)) {
    const file = path.join(gitDir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${sha}\n`);
  }
  if (packed) writeFileSync(path.join(gitDir, 'packed-refs'), packed);
}

/** No git binary on the builder — the sandbox's own case (`sh: git: not found`). */
const noGit = () => null;

/** Runs `fn` with exactly the given BUILD_COMMIT/GIT_COMMIT, restoring afterwards. */
function withEnv<T>(env: { BUILD_COMMIT?: string; GIT_COMMIT?: string }, fn: () => T): T {
  const saved = { BUILD_COMMIT: process.env.BUILD_COMMIT, GIT_COMMIT: process.env.GIT_COMMIT };
  for (const key of ['BUILD_COMMIT', 'GIT_COMMIT'] as const) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const key of ['BUILD_COMMIT', 'GIT_COMMIT'] as const) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const noEnv = { BUILD_COMMIT: undefined, GIT_COMMIT: undefined };

describe('§A — the label contract', () => {
  test('the release name and the id are joined by the existing separator', () => {
    expect(ALPHA_LABEL).toBe('Alpha 1.0');
    expect(buildLabel('b475ce4')).toBe('Alpha 1.0 · b475ce4');
  });

  test('an absent or blank id falls back to the honest placeholder, never an empty tail', () => {
    expect(buildLabel('')).toBe(`${ALPHA_LABEL} · ${UNKNOWN_BUILD_ID}`);
    expect(buildLabel('   ')).toBe(`${ALPHA_LABEL} · ${UNKNOWN_BUILD_ID}`);
    expect(buildLabel(undefined as unknown as string)).toBe(
      `${ALPHA_LABEL} · ${UNKNOWN_BUILD_ID}`,
    );
    expect(buildLabel('  b475ce4 ')).toBe(`${ALPHA_LABEL} · b475ce4`);
  });

  test('readBuildId answers a non-empty id in a bundle with no define', () => {
    // Under `bun test` there is no Vite define: the guard is what keeps this a
    // value instead of a ReferenceError.
    expect(readBuildId()).toBe(UNKNOWN_BUILD_ID);
  });

  test('the label carries the id and nothing else — no path, no cwd, no env text', () => {
    const label = buildLabel(SHORT_SHA);
    expect(label).toBe(`${ALPHA_LABEL} · ${SHORT_SHA}`);
    expect(label).not.toContain('/');
    expect(label).not.toContain(process.cwd());
  });
});

describe('§B — the resolver reads .git without git', () => {
  test('an ordinary symbolic HEAD resolves through its loose ref', () => {
    const root = fixture((dir) =>
      gitRepo(dir, 'ref: refs/heads/development-focus-strategy\n', {
        'refs/heads/development-focus-strategy': FULL_SHA,
      }),
    );
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(SHORT_SHA);
    // Deterministic: the same checkout answers the same id every time.
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(SHORT_SHA);
  });

  test('a detached HEAD resolves from HEAD itself', () => {
    const root = fixture((dir) => gitRepo(dir, `${FULL_SHA}\n`));
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(SHORT_SHA);
  });

  test('a packed ref resolves, and its peeled `^<sha>` line is ignored', () => {
    const root = fixture((dir) =>
      gitRepo(
        dir,
        'ref: refs/heads/main\n',
        {},
        `# pack-refs with: peeled fully-peeled sorted\n${FULL_SHA} refs/heads/main\n${FULL_SHA} refs/tags/alpha\n^b475ce4000000000000000000000000000000000\n`,
      ),
    );
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(SHORT_SHA);
  });

  test('a linked worktree resolves through its commondir', () => {
    const root = fixture((dir) => {
      const common = path.join(dir, 'common.git');
      mkdirSync(path.join(common, 'worktrees', 'wt'), { recursive: true });
      mkdirSync(path.join(common, 'refs', 'heads'), { recursive: true });
      writeFileSync(path.join(common, 'worktrees', 'wt', 'HEAD'), 'ref: refs/heads/feature-x\n');
      writeFileSync(path.join(common, 'worktrees', 'wt', 'commondir'), '../..\n');
      writeFileSync(path.join(common, 'refs', 'heads', 'feature-x'), `${FULL_SHA}\n`);
      mkdirSync(path.join(dir, 'checkout'), { recursive: true });
      writeFileSync(
        path.join(dir, 'checkout', '.git'),
        `gitdir: ${path.join(common, 'worktrees', 'wt')}\n`,
      );
    });
    expect(withEnv(noEnv, () => resolveBuildId(path.join(root, 'checkout'), noGit))).toBe(
      SHORT_SHA,
    );
  });

  test('a checkout with no .git still builds and says so', () => {
    const root = fixture(() => {});
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(UNKNOWN_BUILD_ID);
  });

  test('malformed HEAD content is refused, not sliced into the label', () => {
    const root = fixture((dir) => gitRepo(dir, 'not-a-commit\n'));
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(UNKNOWN_BUILD_ID);
  });

  test('an empty HEAD, a dangling ref and an unreadable HEAD all fall back', () => {
    const empty = fixture((dir) => gitRepo(dir, ''));
    const dangling = fixture((dir) => gitRepo(dir, 'ref: refs/heads/missing\n'));
    const unreadable = fixture((dir) => {
      mkdirSync(path.join(dir, '.git', 'HEAD'), { recursive: true });
    });
    for (const root of [empty, dangling, unreadable]) {
      expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(UNKNOWN_BUILD_ID);
    }
  });

  test('a HEAD pointing outside the refs/ namespace is refused', () => {
    const root = fixture((dir) => gitRepo(dir, 'ref: ../../etc/passwd\n'));
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(UNKNOWN_BUILD_ID);
  });

  test('a loose ref holding garbage falls back instead of being truncated', () => {
    const root = fixture((dir) =>
      gitRepo(dir, 'ref: refs/heads/main\n', { 'refs/heads/main': 'ref: not a sha' }),
    );
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(UNKNOWN_BUILD_ID);
  });
});

describe('§C — the git-binary route (injected runner)', () => {
  const detached = () => fixture((dir) => gitRepo(dir, `${FULL_SHA}\n`));

  test('git’s own short output is validated and shortened to the same length as every route', () => {
    const root = detached();
    expect(withEnv(noEnv, () => resolveBuildId(root, () => FULL_SHA))).toBe(SHORT_SHA);
    expect(BUILD_ID_LENGTH).toBe(7);
  });

  test('output that is not a sha falls through to the ref files', () => {
    const root = detached();
    expect(withEnv(noEnv, () => resolveBuildId(root, () => 'not-a-commit'))).toBe(SHORT_SHA);
    expect(withEnv(noEnv, () => resolveBuildId(root, () => ''))).toBe(SHORT_SHA);
  });

  test('a builder with no git binary reaches the ref files', () => {
    const root = detached();
    expect(withEnv(noEnv, () => resolveBuildId(root, noGit))).toBe(SHORT_SHA);
  });
});

describe('§D — BUILD_COMMIT / GIT_COMMIT precedence', () => {
  const repo = () => fixture((dir) => gitRepo(dir, `${FULL_SHA}\n`));

  test('an explicit BUILD_COMMIT wins over GIT_COMMIT, git and the ref files', () => {
    const root = repo();
    expect(
      withEnv({ BUILD_COMMIT: 'abc1234', GIT_COMMIT: 'def5678' }, () =>
        resolveBuildId(root, () => 'fedcba9'),
      ),
    ).toBe('abc1234');
  });

  test('GIT_COMMIT alone is used', () => {
    const root = repo();
    expect(
      withEnv({ GIT_COMMIT: 'def5678' }, () => resolveBuildId(root, () => 'fedcba9')),
    ).toBe('def5678');
  });

  test('a full sha from the builder answers the same short id as the other routes', () => {
    const root = repo();
    expect(withEnv({ BUILD_COMMIT: FULL_SHA }, () => resolveBuildId(root, noGit))).toBe(
      SHORT_SHA,
    );
  });

  test('a non-sha build name (a tag) is carried verbatim, not truncated', () => {
    const root = repo();
    expect(withEnv({ BUILD_COMMIT: 'v1.2.3-alpha' }, () => resolveBuildId(root, noGit))).toBe(
      'v1.2.3-alpha',
    );
  });

  test('a malformed value is rejected without echoing it, and the git route still runs', () => {
    const root = repo();
    const warned: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warned.push(args.join(' '));
    try {
      for (const junk of ['/home/me/secret/path', 'two words', 'line\nbreak', 'a'.repeat(64)]) {
        expect(withEnv({ BUILD_COMMIT: junk }, () => resolveBuildId(root, noGit))).toBe(SHORT_SHA);
      }
    } finally {
      console.warn = originalWarn;
    }
    // Announced once per rejected value, and never with the value in it.
    expect(warned.length).toBe(4);
    for (const line of warned) {
      expect(line).toContain('BUILD_COMMIT');
      expect(line).not.toContain('secret');
      expect(line).not.toContain('two words');
      expect(line).not.toContain('/home');
    }
  });

  test('a blank or whitespace-only value is simply absent', () => {
    const root = repo();
    expect(withEnv({ BUILD_COMMIT: '   ' }, () => resolveBuildId(root, () => 'abc1234'))).toBe(
      'abc1234',
    );
  });
});

describe('§E — the bundle seam', () => {
  test('the id is resolved at build time through ONE resolver', () => {
    expect(viteConfigSource).toContain('define:');
    expect(viteConfigSource).toContain('__BUILD_ID__');
    expect(viteConfigSource).toContain('resolveBuildId(');
    // The resolution itself lives in scripts/buildId.ts — not duplicated in the config.
    expect(viteConfigSource).not.toContain('execSync');
    expect(viteConfigSource).not.toContain('packed-refs');
  });

  test('no shipped source reads git at runtime', () => {
    const buildInfo = readFileSync(new URL('./buildInfo.ts', import.meta.url), 'utf8');
    expect(buildInfo).not.toContain('child_process');
    expect(buildInfo).not.toContain('execSync');
    expect(buildInfo).not.toContain('localStorage');
    // …and nothing under src/ may import the build-time resolver either.
    const srcRoot = new URL('..', import.meta.url).pathname;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry) && full !== new URL(import.meta.url).pathname) {
          if (readFileSync(full, 'utf8').includes('scripts/buildId')) offenders.push(full);
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });

  test('the declared type keeps tsc strict over the define', () => {
    const envTypes = readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8');
    expect(envTypes).toContain('__BUILD_ID__');
  });
});

describe('§F — the title screen renders it', () => {
  test('the version line comes from the one label, not a hardcoded string', () => {
    expect(titleSource).toContain('buildLabel(');
    expect(titleSource).toContain("from '../../utils/buildInfo'");
    expect(titleSource).not.toContain('Alpha 1.0');
  });
});
