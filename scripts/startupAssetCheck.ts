/**
 * startupAssetCheck.ts — START-1's build check for the startup sequence's assets.
 *
 * Run with:  bun run scripts/startupAssetCheck.ts
 * It is also the second half of `bun run build` (`vite build && bun run scripts/...`),
 * so the check runs against a real `dist/` every time the app is built.
 *
 * WHY IT EXISTS: the startup sequence once shipped a title backdrop that was referenced
 * by URL and missing from the build — a blank title on device and nothing in CI that
 * said so. This check makes that class of defect loud, from three directions:
 *
 *   1. the declared registry (`src/utils/startupAssets.ts`) — every entry must exist in
 *      `public/` AND in `dist/` after a build;
 *   2. the REFERENCES — every startup asset URL the boot path actually names
 *      (`index.html`'s inline style and links, the web app manifest's icons, the
 *      service worker's precache list) must be in the registry, so a new reference
 *      cannot be added without being checked;
 *   3. the TITLE itself — `TitleScreen` must wear the shared `.title-backdrop` class
 *      rather than naming the art files itself, so the boot shell and the title screen
 *      cannot drift onto different pictures.
 *
 * No dependency is added: plain `node:fs` reads and regexes, the way the repo's other
 * scripts read sources.
 */

import { existsSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SHELL_DOCUMENTS,
  STARTUP_ASSETS,
  TITLE_BACKDROP_CLASS,
  TITLE_BACKDROP_PNG,
  TITLE_BACKDROP_WEBP,
  assetDistPath,
  assetRepoPath,
} from '../src/utils/startupAssets';

const ROOT = process.cwd();
const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

function sizeOf(relPath: string): number {
  return statSync(resolve(ROOT, relPath)).size;
}

/** Every `/asset` URL an inline `<style>` block references. */
function styleUrls(html: string): string[] {
  const found: string[] = [];
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/g) ?? [];
  for (const block of styleBlocks) {
    for (const match of block.matchAll(/url\(\s*['"]?(\/[^'")]+)['"]?\s*\)/g)) {
      found.push(match[1]);
    }
  }
  return found;
}

/** Every `/asset` URL an element attribute references (link/script/img/source). */
function attributeUrls(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/(?:href|src)\s*=\s*['"](\/[^'"]+)['"]/g)) {
    found.push(match[1]);
  }
  return found;
}

/** Every `"src": "/..."` in the web app manifest's icon list. */
function manifestIconUrls(manifest: string): string[] {
  const icons = JSON.parse(manifest).icons ?? [];
  return icons.map((icon: { src?: string }) => icon?.src).filter((src: unknown): src is string => typeof src === 'string');
}

/** The service worker's precache list, read as the string literals it is written as. */
function shellAssetUrls(sw: string): string[] {
  const block = sw.match(/const SHELL_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  if (!block) return [];
  const found: string[] = [];
  for (const match of block[1].matchAll(/'([^']+)'/g)) found.push(match[1]);
  return found;
}

/**
 * References that are NOT startup assets. `index.html` also names the module the bundle
 * is built from, which no `public/` file backs and which no build output contains under
 * that name — it is the entry point, not an asset the startup sequence downloads. Kept
 * as an explicit list (rather than a silent pattern) so a new startup asset cannot slip
 * through by being mistaken for one of these.
 */
const SOURCE_ENTRY_POINTS = ['/src/main.tsx'];

function report(): void {
  // ── 1: the registry, in the repository ──────────────────────────────────────────
  const sizes: string[] = [];
  for (const url of STARTUP_ASSETS) {
    const repoPath = assetRepoPath(url);
    if (!existsSync(resolve(ROOT, repoPath))) {
      fail(`MISSING IN REPO: ${repoPath} (declared as ${url} in src/utils/startupAssets.ts)`);
      continue;
    }
    sizes.push(`${url} — ${sizeOf(repoPath).toLocaleString()} bytes`);
  }

  // ── 2: the registry, in the build output ────────────────────────────────────────
  if (!existsSync(resolve(ROOT, 'dist'))) {
    fail('NO BUILD OUTPUT: dist/ does not exist — run `bun run build` before this check.');
  } else {
    for (const url of STARTUP_ASSETS) {
      const distPath = assetDistPath(url);
      if (!existsSync(resolve(ROOT, distPath))) {
        fail(`MISSING IN dist/: ${distPath} — a startup asset the title/boot path needs did not reach the build.`);
      }
    }
  }

  // ── 3: every reference is registered ────────────────────────────────────────────
  const indexHtml = read('index.html');
  const referenced = new Set<string>([
    ...styleUrls(indexHtml),
    ...attributeUrls(indexHtml),
    ...manifestIconUrls(read('public/manifest.webmanifest')),
    ...shellAssetUrls(read('public/sw.js')),
  ]);

  for (const url of referenced) {
    if (SHELL_DOCUMENTS.includes(url)) continue;
    if (SOURCE_ENTRY_POINTS.includes(url)) continue;
    if (!STARTUP_ASSETS.includes(url)) {
      fail(`UNREGISTERED REFERENCE: ${url} is referenced by the boot/title path but is not in src/utils/startupAssets.ts.`);
    }
  }

  // The two title-art URLs must actually be the ones the boot path names, or the
  // registry would be checking a picture nothing renders.
  for (const url of [TITLE_BACKDROP_WEBP, TITLE_BACKDROP_PNG]) {
    if (!referenced.has(url)) {
      fail(`UNREFERENCED TITLE ART: ${url} is in the registry but nothing on the boot path names it.`);
    }
  }

  // ── 4: the title screen wears the shared backdrop ───────────────────────────────
  const titleScreen = read('src/components/hub/TitleScreen.tsx');
  if (!titleScreen.includes(TITLE_BACKDROP_CLASS)) {
    fail(`TITLE SCREEN: TitleScreen does not use the shared "${TITLE_BACKDROP_CLASS}" backdrop, so the boot shell and the title can show different pictures.`);
  }
  for (const url of [TITLE_BACKDROP_WEBP, TITLE_BACKDROP_PNG]) {
    if (titleScreen.includes(url)) {
      fail(`TITLE SCREEN: TitleScreen names ${url} directly — the backdrop belongs to the shared rule in index.html.`);
    }
  }

  // ── report ──────────────────────────────────────────────────────────────────────
  console.log('startup assets:');
  for (const line of sizes) console.log(`  ✓ ${line}`);

  if (failures.length > 0) {
    console.error(`\nstartup asset check FAILED (${failures.length}):`);
    for (const message of failures) console.error(`  ✗ ${message}`);
    process.exit(1);
  }

  console.log(`\nstartup asset check passed — ${STARTUP_ASSETS.length} assets in public/ and dist/.`);
}

report();
