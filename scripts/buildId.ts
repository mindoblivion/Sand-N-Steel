/**
 * buildId.ts — the ONE resolver behind `__BUILD_ID__` (see src/utils/buildInfo.ts).
 *
 * Resolution order, evaluated ONCE while `vite.config.ts` loads:
 *   1. `BUILD_COMMIT` / `GIT_COMMIT` from the builder (CI, a release script);
 *   2. `git rev-parse --short HEAD`, when the builder has a git binary;
 *   3. the checkout's own `.git` ref files, read directly — the case that matters
 *      here, whose container image has no git at all (`sh: git: not found`);
 *   4. `dev` — a checkout with no history (a tarball) still builds and still says so.
 *
 * Every route is validated before it may reach the label, and every route answers the
 * same 7-character short commit for the same revision, so the label never carries a
 * path, a blank, or a different id depending on how the build resolved it.
 *
 * This module is build tooling: nothing under `src/` imports it (the shipped client
 * only reads the literal Vite bakes in — `src/utils/buildInfo.ts`).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** The id the title screen shows: git's own default short length. */
export const BUILD_ID_LENGTH = 7;

/** The honest fallback for a checkout with no resolvable history. */
export const FALLBACK_BUILD_ID = 'dev';

/** A git object id — abbreviated or full, SHA-1 or SHA-256. */
const COMMIT_SHA = /^[0-9a-f]{7,64}$/i;

/**
 * An explicitly supplied id: a sha, a tag or a CI build name. No whitespace and no
 * path separator, so an env var holding a filesystem path or a pasted line of shell
 * text can never become a user-visible label.
 */
const EXPLICIT_BUILD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

function shortCommit(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!COMMIT_SHA.test(trimmed)) return null;
  return trimmed.slice(0, BUILD_ID_LENGTH);
}

/**
 * The builder's own id, when it supplied a well-formed one.
 *
 * A malformed value is ignored (the git routes still run) and announced WITHOUT
 * echoing the value, so a misconfigured CI variable is visible in the build log
 * without a path or a token being copied into it.
 */
export function explicitBuildId(): string | null {
  const raw = (process.env.BUILD_COMMIT || process.env.GIT_COMMIT || '').trim();
  if (!raw) return null;
  if (!EXPLICIT_BUILD_ID.test(raw)) {
    console.warn('[build-id] ignoring malformed BUILD_COMMIT/GIT_COMMIT; falling back to git.');
    return null;
  }
  return COMMIT_SHA.test(raw) ? raw.slice(0, BUILD_ID_LENGTH) : raw;
}

/** The `.git` directory and the directory the refs actually live in. */
function gitRefDirectories(root: string): { gitDir: string; refDir: string } | null {
  const gitEntry = path.resolve(root, '.git');
  if (!existsSync(gitEntry)) return null;
  let gitDir = gitEntry;
  if (!statSync(gitEntry).isDirectory()) {
    // A linked worktree or a submodule: `.git` is a file pointing at the real dir.
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitEntry, 'utf8'));
    if (!pointer) return null;
    gitDir = path.resolve(root, pointer[1].trim());
  }
  // A linked worktree keeps its own HEAD, but its refs and `packed-refs` live in the
  // repository's COMMON directory, which its own `commondir` file names.
  let refDir = gitDir;
  const commonDirFile = path.join(gitDir, 'commondir');
  if (existsSync(commonDirFile)) {
    refDir = path.resolve(gitDir, readFileSync(commonDirFile, 'utf8').trim());
  }
  return { gitDir, refDir };
}

/**
 * The commit of the checkout at `root`, read from `.git` without git.
 *
 * Covers an ordinary symbolic HEAD, a detached HEAD, a packed ref (and its peeled
 * `^<sha>` line) and a linked worktree. Anything unreadable, dangling or malformed
 * answers `null` so the caller can fall back — it never answers a slice of garbage.
 */
export function readGitCommitFromFiles(root: string): string | null {
  try {
    const dirs = gitRefDirectories(root);
    if (!dirs) return null;
    const head = readFileSync(path.join(dirs.gitDir, 'HEAD'), 'utf8').trim();
    const ref = /^ref:\s*(.+)$/.exec(head);
    if (!ref) return shortCommit(head); // detached HEAD: HEAD is the sha
    const refName = ref[1].trim();
    // Only ever a ref inside the refs/ namespace — never a path a HEAD could point out.
    if (!refName.startsWith('refs/')) return null;
    const refFile = path.join(dirs.refDir, refName);
    if (existsSync(refFile)) return shortCommit(readFileSync(refFile, 'utf8'));
    const packed = path.join(dirs.refDir, 'packed-refs');
    if (existsSync(packed)) {
      for (const line of readFileSync(packed, 'utf8').split('\n')) {
        const parts = line.trim().split(/\s+/);
        const sha = parts[0];
        const name = parts[1];
        if (name === refName && sha && COMMIT_SHA.test(sha)) {
          return sha.slice(0, BUILD_ID_LENGTH);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Runs git in the checkout itself, not in whatever directory the build started from. */
export type GitRunner = () => string | null;

export function runGitRevParseShort(root: string): string | null {
  try {
    const out = execSync('git rev-parse --short HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    // No git binary on the builder (this container), or no repo — try the ref files.
    return null;
  }
}

/**
 * The build id for the checkout at `root`. Never throws: every route ends in a
 * string, and the last one (`dev`) is a legitimate, documented answer.
 */
export function resolveBuildId(
  root: string,
  runGit: GitRunner = () => runGitRevParseShort(root),
): string {
  return (
    explicitBuildId() ?? shortCommit(runGit()) ?? readGitCommitFromFiles(root) ?? FALLBACK_BUILD_ID
  );
}
