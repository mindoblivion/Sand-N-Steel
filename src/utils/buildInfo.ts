/**
 * Alpha build identification — one label, one build id.
 *
 * The alpha has to be identifiable from a screenshot or a bug report: the human
 * release name (`ALPHA_LABEL`, the designer-owned string the title screen already
 * showed) plus the build id Vite bakes in at build time (`vite.config.ts`'s
 * `__BUILD_ID__` — the short git commit of the checkout that produced the bundle,
 * or `dev` when the build had no git history).
 *
 * Nothing here reads git at runtime: the id is frozen into the bundle when it is
 * built, so a shipped build can never report a different commit than the code it
 * runs, and reading the label costs no storage and no network.
 *
 * Removal: none. Bumping the release name is editing `ALPHA_LABEL`, in one place.
 */

/** The designer-owned release name. The ONE place it is written. */
export const ALPHA_LABEL = 'Alpha 1.0';

/** Fallback for a bundle with no baked id (a plain test run, or a checkout without git). */
export const UNKNOWN_BUILD_ID = 'dev';

/**
 * The build id this bundle was compiled with.
 *
 * `typeof` on the Vite define is safe everywhere: under Vite the identifier is
 * replaced textually, and where no define exists (a `bun test` run importing this
 * module) the guard answers `dev` instead of throwing a ReferenceError.
 */
export function readBuildId(): string {
  return typeof __BUILD_ID__ === 'string' && __BUILD_ID__.length > 0
    ? __BUILD_ID__
    : UNKNOWN_BUILD_ID;
}

/** "Alpha 1.0 · b475ce4" — the title screen's version line. */
export function buildLabel(buildId: string = readBuildId()): string {
  const id = typeof buildId === 'string' ? buildId.trim() : '';
  return `${ALPHA_LABEL} · ${id || UNKNOWN_BUILD_ID}`;
}
