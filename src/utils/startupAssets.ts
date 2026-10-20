/**
 * START-1 — the startup asset registry.
 *
 * ONE list of the files the boot/title path depends on, so the "missing title art"
 * class of defect — a startup asset referenced by URL but never shipped — fails loudly
 * in a build instead of showing up as a blank title on a device. `scripts/startupAssetCheck.ts`
 * verifies this list against `public/`, against `dist/` after a build, and against the
 * URLs the sources actually reference; `src/utils/start1.test.ts` pins it.
 *
 * The title backdrop pair is the one piece of CSS the title and the boot shell share:
 * the `.title-backdrop` rule in `index.html` (which is the only stylesheet available
 * before the bundle loads) declares the WebP first and the PNG as the fallback, and
 * `TitleScreen` wears the same class. Both URLs live here so the check has one source
 * of truth for what "the title art" means.
 */

/** The class `index.html` defines and `TitleScreen` wears for the shared backdrop. */
export const TITLE_BACKDROP_CLASS = 'title-backdrop';

/** The title backdrop's primary format (see the `.title-backdrop` rule in index.html). */
export const TITLE_BACKDROP_WEBP = '/title_screen.webp';

/** The title backdrop's fallback format, for a browser without WebP support. */
export const TITLE_BACKDROP_PNG = '/title_screen.png';

/**
 * Every asset the boot → title sequence references, as the app serves it: the title
 * backdrop in both formats, the installable-app metadata the boot path honours (the
 * manifest and the icons it lists) and the designed offline page the service worker
 * shell falls back to.
 */
export const STARTUP_ASSETS: readonly string[] = [
  TITLE_BACKDROP_WEBP,
  TITLE_BACKDROP_PNG,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/offline.html',
];

/** Documents, not files: the service worker's shell list also names these two. */
export const SHELL_DOCUMENTS: readonly string[] = ['/', '/index.html', '/manifest.webmanifest'];

/**
 * The public-path → repository-path mapping the check uses. A URL is served from a file
 * of the same name under `public/` and lands under `dist/` in a build.
 */
export function assetRepoPath(url: string): string {
  return `public${url}`;
}

export function assetDistPath(url: string): string {
  return `dist${url}`;
}
