/**
 * start1.test.ts — START-1, "The Front Gate": the startup sequence's own contract.
 *
 * Run with: bun test src/utils/start1.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the boot shell: the first paint is the manifest's `background_color`,
 *      matched by the `theme-color` meta, and it wears the SAME backdrop rule the
 *      title screen wears — so the splash → title hand-off shows one picture
 *      twice instead of a blank frame between two of them;
 *   §B the hand-off itself: the element id and the out-class `bootShell.ts`
 *      drives are the ones `index.html` writes, the fade matches the transition,
 *      and `main.tsx` dismisses the shell only after React has mounted;
 *   §C the title art: every registered startup asset ships under `public/`, the
 *      WebP primary is the compressed one, `index.html` names both files and
 *      `TitleScreen` names neither (it wears the shared class), and the build
 *      runs the asset check;
 *   §D the sequence around the picture: the two preload stages are armed at the
 *      two beats, every wait destination has its own copy and is mounted, the
 *      Acta line wraps in both directions, and each of the three failure
 *      surfaces says something a player can act on without jargon;
 *   §E the post-Oath nudge: once per session, driven against a recording store,
 *      and provably unable to reach the player's save.
 *
 * Every value is read out of the shipped source or the shipped manifest; nothing
 * here restates one the app owns. `scripts/startupAssetCheck.ts` is the build-time
 * half of §C and runs against a real `dist/` on every `bun run build`.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';

import { BOOT_SHELL_ID, BOOT_SHELL_OUT_CLASS } from './bootShell';
import {
  STARTUP_ASSETS,
  TITLE_BACKDROP_CLASS,
  TITLE_BACKDROP_PNG,
  TITLE_BACKDROP_WEBP,
  assetRepoPath,
} from './startupAssets';
import {
  KEEPER_LINES,
  WAIT_DESTINATIONS,
  keeperLineAt,
  nextKeeperIndex,
  waitDestination,
  type WaitDestinationId,
} from '../components/ui/waitSurfaceLines';
import {
  POST_OATH_NUDGE_KEY,
  markPostOathNudgeSeen,
  shouldOfferPostOathNudge,
  type SessionStore,
} from './postOathNudge';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/**
 * L25 — how `index.html` names a public file now: through Vite's `%BASE_URL%`
 * token, which the build replaces with the deploy base (`/`, or `/repo/` for a
 * project-site Pages deploy). Read as the served URL it becomes, this is exactly
 * the registered asset path.
 */
const bootUrl = (path: string): string => `%BASE_URL%${path.replace(/^\//, '')}`;

/** A source with its comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const indexHtml = load('../../index.html');
const manifest = JSON.parse(load('../../public/manifest.webmanifest'));
const appSrc = load('../App.tsx');
const titleSrc = load('../components/hub/TitleScreen.tsx');
const mainSrc = load('../main.tsx');
const bootShellSrc = load('./bootShell.ts');
const nudgeSrc = load('./postOathNudge.ts');
const failureSrc = load('../components/ui/GameFailureSurface.tsx');
const packageJson = JSON.parse(load('../../package.json'));
const assetCheckSrc = load('../../scripts/startupAssetCheck.ts');

/** The inline `<style>` block: the only stylesheet available before the bundle. */
const bootStyle = indexHtml.slice(indexHtml.indexOf('<style>'), indexHtml.indexOf('</style>'));

// ══════════════════════════════════════════════════════════════════════════
// A. The boot shell is the manifest's own picture
// ══════════════════════════════════════════════════════════════════════════

describe('A. The boot shell', () => {
  test('the first paint is the manifest background colour, matched by the theme-color meta', () => {
    // The installed-app splash, the boot shell and the title must agree, or the
    // sequence shows a colour change at a hand-off it exists to hide.
    expect(manifest.background_color).toBe('#0c0a09');
    expect(indexHtml).toContain(`<meta name="theme-color" content="${manifest.background_color}" />`);
    expect(bootStyle).toContain(`background-color: ${manifest.background_color};`);
    expect(manifest.theme_color).toBe(manifest.background_color);
  });

  test('the shell wears the shared backdrop class and covers the whole viewport', () => {
    expect(indexHtml).toContain(`<div id="${BOOT_SHELL_ID}" class="${TITLE_BACKDROP_CLASS}"`);
    // Fixed, pinned to all four edges, above the app's own root.
    const shellRule = bootStyle.slice(
      bootStyle.indexOf(`#${BOOT_SHELL_ID} {`),
      bootStyle.indexOf(`#${BOOT_SHELL_ID}::after`),
    );
    expect(shellRule).toContain('position: fixed;');
    expect(shellRule).toContain('inset: 0;');
    expect(shellRule).toContain('z-index:');
    // Decorative: the shell carries no content a screen reader should announce.
    expect(indexHtml).toContain('aria-hidden="true"');
    // …and the app has somewhere to mount once it arrives.
    expect(indexHtml).toContain('<div id="root"></div>');
    expect(indexHtml).toContain('src="/src/main.tsx"');
  });

  test('the backdrop rule declares the WebP primary with the PNG as its fallback', () => {
    // Order matters: the later `background-image` declaration is the one a WebP-capable
    // browser uses, so the WebP must come second inside the image-set.
    const setStart = bootStyle.indexOf('image-set(');
    const setEnd = bootStyle.indexOf(')', bootStyle.indexOf('type("image/png")'));
    const imageSet = bootStyle.slice(setStart, setEnd);
    // Addressed through the build's base (L25), so the pair cannot 404 at a subpath.
    expect(imageSet.indexOf(bootUrl(TITLE_BACKDROP_WEBP))).toBeGreaterThan(-1);
    expect(imageSet.indexOf(bootUrl(TITLE_BACKDROP_PNG))).toBeGreaterThan(-1);
    expect(imageSet.indexOf(bootUrl(TITLE_BACKDROP_WEBP))).toBeLessThan(imageSet.indexOf(bootUrl(TITLE_BACKDROP_PNG)));
    // A browser without `image-set` support still gets the picture — from the build's
    // own base, so the boot shell cannot go blank on a subpath deploy.
    expect(bootStyle).toContain(`background-image: url(${bootUrl(TITLE_BACKDROP_PNG)});`);
    // The art fills the frame at any aspect.
    expect(bootStyle).toContain('background-size: cover;');
    expect(bootStyle).toContain('background-position: center;');
  });

  test('the shell does not outlive its hand-off', () => {
    // The class the fade uses is the class the CSS fades with.
    expect(bootStyle).toContain(`#${BOOT_SHELL_ID}.${BOOT_SHELL_OUT_CLASS}`);
    expect(bootStyle).toContain('opacity: 0;');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The hand-off is one fade over the same picture
// ══════════════════════════════════════════════════════════════════════════

describe('B. The hand-off', () => {
  test('the shell id and the out-class are the ones index.html writes', () => {
    expect(indexHtml).toContain(`id="${BOOT_SHELL_ID}"`);
    expect(bootStyle).toContain(`.${BOOT_SHELL_OUT_CLASS} {`);
  });

  test('the fade the helper waits out matches the transition in index.html', () => {
    const transition = bootStyle.match(/transition:\s*opacity\s+([\d.]+)s/);
    expect(transition).not.toBeNull();
    const cssMs = Number(transition![1]) * 1000;
    const helperMs = Number(bootShellSrc.match(/BOOT_SHELL_FADE_MS = (\d+)/)![1]);
    expect(helperMs).toBe(cssMs);
  });

  test('main.tsx dismisses the shell only after React has committed a frame', () => {
    // A shell removed before the first commit is a blank frame — the one thing the
    // sequence must never show.
    expect(mainSrc).toContain("import { dismissBootShell } from './utils/bootShell'");
    expect(mainSrc).toContain(
      'requestAnimationFrame(() => requestAnimationFrame(() => dismissBootShell()));',
    );
    // …and it runs after the root was rendered, not before it.
    const renderCall = mainSrc.indexOf('ReactDOM.createRoot(');
    const dismissCall = mainSrc.indexOf('requestAnimationFrame(');
    expect(renderCall).toBeGreaterThan(-1);
    expect(dismissCall).toBeGreaterThan(renderCall);
    // Every mount path goes through that one helper.
    expect(mainSrc.split('createRoot(').length - 1).toBe(1);
  });

  test('the helper is total: a second call, or no shell at all, is a no-op', () => {
    expect(code(bootShellSrc)).toContain('if (!shell) return;');
    expect(code(bootShellSrc)).toContain('classList.contains(BOOT_SHELL_OUT_CLASS)');
    expect(code(bootShellSrc)).toContain('typeof document ===');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The title art ships, compressed, and is named in one place
// ══════════════════════════════════════════════════════════════════════════

describe('C. The startup assets', () => {
  test('every registered startup asset exists under public/ and is not empty', () => {
    for (const url of STARTUP_ASSETS) {
      const repoPath = assetRepoPath(url);
      expect(existsSync(new URL(`../../${repoPath}`, import.meta.url)), repoPath).toBe(true);
      expect(statSync(new URL(`../../${repoPath}`, import.meta.url)).size, repoPath).toBeGreaterThan(0);
    }
  });

  test('the WebP primary is the compressed one, and the PNG is the fallback', () => {
    const webp = statSync(new URL(`../../${assetRepoPath(TITLE_BACKDROP_WEBP)}`, import.meta.url)).size;
    const png = statSync(new URL(`../../${assetRepoPath(TITLE_BACKDROP_PNG)}`, import.meta.url)).size;
    // The whole point of shipping the pair: the file a modern browser fetches is
    // materially smaller than the one it would otherwise download.
    expect(webp).toBeLessThan(png);
    expect(webp).toBeLessThan(png / 4);
  });

  test('index.html names the art; TitleScreen names neither file', () => {
    // One source of truth for the picture: the shared rule in index.html.
    // L25 — both files, addressed through the deploy base rather than the site root.
    expect(indexHtml).toContain(bootUrl(TITLE_BACKDROP_WEBP));
    expect(indexHtml).toContain(bootUrl(TITLE_BACKDROP_PNG));
    expect(indexHtml).not.toMatch(/url\(\/title_screen\.(webp|png)\)/);
    expect(titleSrc).toContain(TITLE_BACKDROP_CLASS);
    expect(titleSrc).not.toContain(TITLE_BACKDROP_WEBP);
    expect(titleSrc).not.toContain(TITLE_BACKDROP_PNG);
  });

  test('the title paints the same scrim the boot shell does', () => {
    // index.html's `::after` layer and the title's own overlay are the same 20%
    // black, so the dissolve between them cannot be seen.
    const scrim = bootStyle.slice(bootStyle.indexOf(`#${BOOT_SHELL_ID}::after`));
    expect(scrim).toContain('rgba(0, 0, 0, 0.2)');
    expect(titleSrc).toContain('bg-black/20');
  });

  test('the build runs the startup-asset check, and the check reads the registry', () => {
    expect(packageJson.scripts.build).toContain('scripts/startupAssetCheck.ts');
    expect(packageJson.scripts['check:startup-assets']).toContain('scripts/startupAssetCheck.ts');
    expect(assetCheckSrc).toContain("from '../src/utils/startupAssets'");
    // It fails the build rather than warning into a log nobody reads.
    expect(assetCheckSrc).toContain('process.exit(1)');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The sequence around the picture
// ══════════════════════════════════════════════════════════════════════════

describe('D. The sequence', () => {
  test('the title warms stage 1 at mount and the tap warms stage 2', () => {
    // The beats, in the two files that own them: App mounts the title, TitleScreen
    // takes the tap.
    expect(appSrc).toContain("import { preloadTitleStage } from './utils/preloadAssets'");
    expect(appSrc).toContain('preloadTitleStage();');
    expect(appSrc).not.toContain('preloadTapStage');
    expect(titleSrc).toContain("import { preloadTapStage } from '../../utils/preloadAssets'");
    expect(titleSrc).toContain('preloadTapStage();');
  });

  test('every wait destination has its own copy, and App mounts one per tier', () => {
    for (const id of Object.keys(WAIT_DESTINATIONS) as WaitDestinationId[]) {
      const destination = WAIT_DESTINATIONS[id];
      expect(destination.line.length, id).toBeGreaterThan(0);
      expect(destination.gloss.length, id).toBeGreaterThan(0);
    }
    // The three destinations the sequence can actually wait on.
    expect(Object.keys(WAIT_DESTINATIONS).sort()).toEqual(['arena', 'circus', 'city_hub']);
    // …and each is mounted by the screen it belongs to.
    for (const id of ['city_hub', 'arena', 'circus'] as WaitDestinationId[]) {
      expect(appSrc).toContain(`<WaitSurface destination="${id}" />`);
    }
    // An unknown destination falls back rather than rendering nothing.
    expect(waitDestination('not-a-destination' as WaitDestinationId)).toEqual(WAIT_DESTINATIONS.city_hub);
  });

  test('the Acta line answers at any index, wrapping in both directions', () => {
    expect(KEEPER_LINES.length).toBeGreaterThan(1);
    expect(keeperLineAt(0)).toBe(KEEPER_LINES[0]);
    expect(keeperLineAt(KEEPER_LINES.length)).toBe(KEEPER_LINES[0]);
    expect(keeperLineAt(-1)).toBe(KEEPER_LINES[KEEPER_LINES.length - 1]);
    expect(keeperLineAt(Number.NaN)).toBe(KEEPER_LINES[0]);
    expect(nextKeeperIndex(KEEPER_LINES.length - 1)).toBe(0);
    expect(nextKeeperIndex(Number.NaN)).toBe(0);
    // Every line is a sentence about the world, not a progress message.
    for (const line of KEEPER_LINES) expect(line.length, line).toBeGreaterThan(20);
  });

  test('the three failure surfaces each offer a way forward, in plain language', () => {
    for (const surface of ['offline', 'load', 'no-webgl']) {
      expect(failureSrc).toContain(`data-failure-surface="${surface}"`);
    }
    // Every one of them can be retried; the offline notice can also be dismissed.
    expect(failureSrc.split('data-failure-action="retry"').length - 1).toBe(3);
    expect(failureSrc).toContain('data-failure-action="dismiss"');
    expect(failureSrc).toContain('window.location.reload()');
    // No jargon in the copy the player reads. The identifiers and data attributes
    // are stripped out first, because they are not what a player sees.
    const noWebglCopy = code(failureSrc)
      .slice(code(failureSrc).indexOf('export const NoWebGLScreen'))
      .split('=>')
      .slice(1)
      .join('=>');
    expect(noWebglCopy.length).toBeGreaterThan(500);
    for (const jargon of ['WebGL', 'GPU', 'shader', 'hardware acceleration']) {
      expect(noWebglCopy, jargon).not.toContain(jargon);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The post-Oath nudge is once per session, and cannot reach the save
// ══════════════════════════════════════════════════════════════════════════

/** A recording session store, so the nudge's flag can be driven without a browser. */
function recordingStore(): SessionStore & { values: Record<string, string> } {
  const values: Record<string, string> = {};
  return {
    values,
    getItem: (key: string) => (key in values ? values[key] : null),
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}

describe('E. The post-Oath nudge', () => {
  test('it is offered once, and only for an Oath that has just been taken', () => {
    const store = recordingStore();
    // No Oath this session → nothing to offer, even on a fresh session.
    expect(shouldOfferPostOathNudge(false, store)).toBe(false);
    expect(store.values).toEqual({});
    // The Oath just happened → offer it, and record that it was shown.
    expect(shouldOfferPostOathNudge(true, store)).toBe(true);
    markPostOathNudgeSeen(store);
    expect(store.values[POST_OATH_NUDGE_KEY]).toBe('1');
    // …and it does not come back this session.
    expect(shouldOfferPostOathNudge(true, store)).toBe(false);
  });

  test('a store that refuses to answer is not an error state', () => {
    const hostile: SessionStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => markPostOathNudgeSeen(hostile)).not.toThrow();
    expect(shouldOfferPostOathNudge(true, null)).toBe(true);
  });

  test('the nudge module touches session scratch state only — never the player’s save', () => {
    const nudgeCode = code(nudgeSrc);
    // The profile key and every save path stay out of this module entirely.
    for (const token of [
      'sand_and_steel_gladiator_save',
      'localStorage',
      'saveProfile',
      'PROFILE_STORAGE_KEY',
      'services/storage',
    ]) {
      expect(nudgeCode, token).not.toContain(token);
    }
    // It reads sessionStorage, which dies with the tab — the design's whole point.
    expect(nudgeCode).toContain('sessionStorage');
    expect(POST_OATH_NUDGE_KEY).not.toContain('save');
  });
});
