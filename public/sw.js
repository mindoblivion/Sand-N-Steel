/**
 * Sand & Steel — offline service worker (hand-written, no workbox dependency).
 *
 * WHY THIS EXISTS
 * A packaged web app is judged on whether it survives an offline launch: a failed
 * main document counts as a crash in store review. This worker keeps the app shell
 * on the device so a cold start without a connection still renders a designed
 * screen instead of the browser's error page, while online behaviour is unchanged.
 *
 * CACHE STRATEGY
 *   - Cache: `sand-steel-shell-v1` (versioned). `activate` deletes every other
 *     `sand-steel-` cache, so bumping VERSION is a clean swap.
 *   - Precache (on install): "/", "/index.html", "/offline.html", the web app
 *     manifest and the app icons.
 *   - Navigations: network-first. A success refreshes ONE fixed shell copy
 *     ("/index.html") — never a per-URL or per-query variant, so the cache cannot
 *     grow — and a failure falls back to the cached shell, then to
 *     "/offline.html", which is served as a normal HTTP 200 document.
 *   - Static game assets (models, audio, images, fonts, built script/style):
 *     network-first with a cache fallback, so a fresh build always wins online and
 *     the last seen copy still loads offline.
 *   - Everything else — every authenticated call, the Google Drive cloud save and
 *     the Firebase auth/identity traffic — is not intercepted at all.
 *
 * This file lives in `public/`, so it is copied verbatim into the build and never
 * hashed or transformed by Vite. It is registered from `src/main.tsx` in
 * production builds only (`import.meta.env.PROD`); the dev harnesses never
 * register it.
 */

const VERSION = 'v1';

/** The one cache this worker writes; the version suffix makes upgrades explicit. */
const SHELL_CACHE = `sand-steel-shell-${VERSION}`;

/** Caches kept on `activate`; any other `sand-steel-` cache is an older version. */
const ACTIVE_CACHES = [SHELL_CACHE];
const CACHE_PREFIX = 'sand-steel-';

/**
 * The base this worker was served from — `'/'` at a domain root, `'/repo/'` for a
 * GitHub Pages project site. It is read from the worker's OWN script URL, because
 * this file is copied verbatim into the build and cannot ask Vite for
 * `BASE_URL`. Derived once, so a subpath deploy precaches and serves the same
 * files the page loads instead of 404ing on the root-absolute ones.
 */
const BASE = (() => {
  const path = (self.location && self.location.pathname) || '/sw.js';
  const cut = path.lastIndexOf('/');
  return cut >= 0 ? path.slice(0, cut + 1) : '/';
})();

/** A public file path as the URL it is fetched from, under this worker's base. */
const baseUrl = (path) => `${BASE}${String(path).replace(/^\/+/, '')}`;

/** The app's root under the base: `'/'` or `'/repo/'`. */
const SHELL_ROOT = BASE;

const SHELL_URL = baseUrl('index.html');
const OFFLINE_URL = baseUrl('offline.html');

/** Cached on install, before the first request is ever handled. */
const SHELL_ASSETS = [
  SHELL_ROOT,
  SHELL_URL,
  OFFLINE_URL,
  baseUrl('manifest.webmanifest'),
  baseUrl('icons/icon-192.png'),
  baseUrl('icons/icon-512.png'),
  baseUrl('icons/icon-maskable-512.png'),
  baseUrl('icons/apple-touch-icon.png'),
];

/**
 * Never intercepted and never cached: authentication, the Google Drive cloud save
 * and the Firebase SDK's own traffic. Those responses carry or exchange a session,
 * so they must always reach the network untouched. They are cross-origin anyway —
 * the generic cross-origin rule below already excludes them — and this list keeps
 * the guarantee explicit and reviewable.
 */
const BYPASS_HOST_SUFFIXES = [
  'googleapis.com', // Identity Toolkit, Secure Token, Drive REST
  'googleusercontent.com', // Drive file content
  'firebaseapp.com', // Firebase hosted auth domain / auth handler
  'firebaseio.com', // Firebase realtime database
  'gstatic.com', // Firebase SDK assets
  'accounts.google.com', // Google sign-in
];

/** Same-origin paths that are never shell, asset or cache material. */
const BYPASS_PATH_PARTS = [
  '/api/', // no backend today; a future one must not be cached
  '/identitytoolkit', // Firebase auth REST
  '/securetoken', // Firebase token exchange
  '/drive/v3', // Google Drive REST
  '/__/auth', // Firebase auth handler
  '/oauth',
];

/** Extensions handled network-first with a cache fallback. */
const STATIC_ASSET_EXTENSIONS = [
  // Models
  '.glb',
  '.gltf',
  '.bin',
  // Audio (the soundtrack is played through Audio(), i.e. ranged media)
  '.ogg',
  '.mp3',
  '.wav',
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.ico',
  // Fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  // Built script / style output
  '.js',
  '.mjs',
  '.css',
  '.wasm',
  '.json',
  '.webmanifest',
];

/**
 * Last-resort document for a navigation whose network AND caches are both cold
 * (a first launch that never reached the network). Served with a normal 200 so the
 * platform never records a failed main document.
 */
const FALLBACK_DOCUMENT =
  '<!doctype html><meta charset="utf-8"><title>Sand &amp; Steel</title>' +
  '<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0c0a09;' +
  "color:#e8c88a;font:600 18px/1.6 Georgia,'Times New Roman',serif;text-align:center;padding:2rem\">" +
  '<p>The gates are closed — no connection.<br>Your progress is saved on this device.</p></body>';

/** Only a fresh, same-origin document is worth storing. */
const isCacheable = (response) =>
  Boolean(response) && response.status === 200 && response.type === 'basic';

const isStaticAsset = (url) => {
  const path = url.pathname.toLowerCase();
  return STATIC_ASSET_EXTENSIONS.some((extension) => path.endsWith(extension));
};

/** True for every request this worker must leave alone. */
const shouldBypass = (url) => {
  if (url.origin !== self.location.origin) return true; // auth, Drive, Firebase, CDNs
  if (BYPASS_HOST_SUFFIXES.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    return true;
  }
  if (BYPASS_PATH_PARTS.some((part) => url.pathname.includes(part))) return true;
  // Dev harness entry points stay exactly as they are: never cached and never
  // served from the shell (they are eliminated from production builds anyway).
  if (url.pathname.startsWith(baseUrl('__dev/'))) return true;
  // The browser must always fetch this worker's own script from the network.
  if (url.pathname === baseUrl('sw.js')) return true;
  return false;
};

// ══════════════════════════════════════════════════════════════════════════
// Install — precache the shell
// ══════════════════════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Each entry is fetched and stored on its own, past the HTTP cache
      // (`cache: 'reload'`): one missing icon must not abort the whole install, and
      // a fresh deploy must not install a stale shell.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (isCacheable(response)) await cache.put(url, response);
          } catch {
            // First run with no connection, or the entry is genuinely missing.
            // Install still completes; the shell is filled in as the player browses.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

// ══════════════════════════════════════════════════════════════════════════
// Activate — drop older versions, take over open pages
// ══════════════════════════════════════════════════════════════════════════

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && !ACTIVE_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// ══════════════════════════════════════════════════════════════════════════
// Fetch — navigations and static assets only
// ══════════════════════════════════════════════════════════════════════════

/**
 * Network-first navigation. Online, the player gets exactly what the server just
 * served; offline, the cached shell; if the shell is gone too, the designed offline
 * page — as a 200, never as a browser error.
 */
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    // Refresh ONE fixed shell copy. Keying by request URL would store a copy per
    // route and per query string, which is unbounded.
    if (isCacheable(response)) await cache.put(SHELL_URL, response.clone());
    return response;
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(SHELL_URL)) ||
      (await cache.match(SHELL_ROOT)) ||
      (await cache.match(OFFLINE_URL));
    if (cached) return cached;
    return new Response(FALLBACK_DOCUMENT, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/** Network-first static asset: fresh when online, last seen copy when offline. */
async function handleAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error; // Nothing stored: fail exactly as the page would without a worker.
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return; // Not a URL this worker can reason about.
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Untouched: auth/Drive/Firebase, dev routes, other origins.
  if (shouldBypass(url)) return;
  // An authenticated request is neither a shell nor an asset.
  if (request.headers.has('authorization')) return;
  // Ranged media (the .ogg soundtrack is played through Audio()) must never be
  // answered with a whole cached entry.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(handleAsset(request));
  }
  // Everything else passes through to the network.
});
