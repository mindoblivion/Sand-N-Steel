/**
 * serviceWorker.test.ts — the offline service worker, its designed offline page
 * and the production-only registration.
 *
 * Run with: bun test src/utils/serviceWorker.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the cache contract: one versioned cache name, the shell precache list, the
 *      version sweep on `activate` and `clients.claim()`;
 *   §B the fetch strategy: navigations network-first → cached shell →
 *      `/offline.html`, answered as a normal 200 document, and static game assets
 *      network-first with a cache fallback;
 *   §C the bypass list: the Google Drive / Firebase / identity endpoints, any
 *      authenticated request, ranged media, the dev-harness routes and the
 *      worker's own script are never intercepted and never cached;
 *   §D the registration is PRODUCTION-gated in `src/main.tsx`, and the dev
 *      harnesses under `src/components/dev` and the `/__dev` routes stay excluded
 *      exactly as they were;
 *   §E `public/offline.html` is self-contained — no external request of any kind —
 *      and carries the designed copy;
 *   §F the same contract, DRIVEN: the shipped `public/sw.js` is evaluated against
 *      a fake `self` / `caches` / `fetch`, so the fallback chain, the 200 status,
 *      the cache write-back and every bypass are exercised rather than grepped.
 *
 * The suites read the shipped sources, so nothing here restates a value the app
 * owns; the driven section runs the worker's real code, not a copy of it.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const swSrc = load('../../public/sw.js');
const offlineSrc = load('../../public/offline.html');
const mainSrc = load('../main.tsx');

/** A source with its comments stripped, so prose cannot satisfy (or defeat) a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

/** HTML with its comments stripped, for the same reason. */
const markup = (source: string): string => source.replace(/<!--[\s\S]*?-->/g, '');

const swCode = code(swSrc);
const offlineCode = markup(offlineSrc);
const mainCode = code(mainSrc);

// ══════════════════════════════════════════════════════════════════════════
// A. The cache contract
// ══════════════════════════════════════════════════════════════════════════

describe('A. One versioned cache, precached shell and a version sweep', () => {
  test('the cache name is versioned, and the prefix is what activate sweeps on', () => {
    expect(swCode).toContain("const VERSION = 'v1'");
    expect(swCode).toMatch(/const SHELL_CACHE = `sand-steel-shell-\$\{VERSION\}`/);
    expect(swCode).toMatch(/const CACHE_PREFIX = 'sand-steel-'/);
    expect(swCode).toContain('const ACTIVE_CACHES = [SHELL_CACHE]');
  });

  test('the shell precache list covers /, the shell document, offline.html, the manifest and the icons', () => {
    const list = swCode.slice(swCode.indexOf('const SHELL_ASSETS'), swCode.indexOf('const BYPASS_HOST_SUFFIXES'));
    expect(list).toContain("'/'");
    expect(list).toContain('SHELL_URL');
    expect(list).toContain('OFFLINE_URL');
    expect(list).toContain("'/manifest.webmanifest'");
    for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
      expect(list).toContain(`/icons/${icon}`);
    }
    expect(swCode).toContain("const SHELL_URL = '/index.html'");
    expect(swCode).toContain("const OFFLINE_URL = '/offline.html'");
  });

  test('install caches the shell and takes over immediately, tolerating a missing entry', () => {
    const install = swCode.slice(swCode.indexOf("addEventListener('install'"), swCode.indexOf("addEventListener('activate'"));
    expect(install).toContain('caches.open(SHELL_CACHE)');
    expect(install).toContain('SHELL_ASSETS.map');
    expect(install).toContain('self.skipWaiting()');
    // One entry failing must not abort the install.
    expect(install).toContain('catch');
  });

  test('activate deletes older sand-steel-* caches and claims the open clients', () => {
    const activate = swCode.slice(swCode.indexOf("addEventListener('activate'"), swCode.indexOf('// Fetch — navigations'));
    expect(activate).toContain('caches.keys()');
    expect(activate).toContain('startsWith(CACHE_PREFIX)');
    expect(activate).toContain('!ACTIVE_CACHES.includes(name)');
    expect(activate).toContain('caches.delete(name)');
    expect(activate).toContain('self.clients.claim()');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The fetch strategy
// ══════════════════════════════════════════════════════════════════════════

describe('B. Navigations network-first, then the shell, then the offline page', () => {
  test('a navigation is handled by the navigation handler', () => {
    expect(swCode).toContain("request.mode === 'navigate'");
    expect(swCode).toContain('event.respondWith(handleNavigation(request))');
  });

  test('the network is tried first and the shell copy is refreshed on success', () => {
    const navigation = swCode.slice(swCode.indexOf('async function handleNavigation'), swCode.indexOf('async function handleAsset'));
    expect(navigation.indexOf('await fetch(request)')).toBeGreaterThan(-1);
    expect(navigation).toContain('cache.put(SHELL_URL, response.clone())');
  });

  test('the fallback chain is request → shell → "/" → the designed offline page', () => {
    const navigation = swCode.slice(swCode.indexOf('async function handleNavigation'), swCode.indexOf('async function handleAsset'));
    const order = ['cache.match(request)', 'cache.match(SHELL_URL)', "cache.match('/')", 'cache.match(OFFLINE_URL)'];
    let cursor = -1;
    for (const step of order) {
      const at = navigation.indexOf(step);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  test('the offline document is answered as a normal 200, never as a browser error', () => {
    const navigation = swCode.slice(swCode.indexOf('async function handleNavigation'), swCode.indexOf('async function handleAsset'));
    expect(navigation).toContain('new Response(FALLBACK_DOCUMENT, {');
    expect(navigation).toContain('status: 200');
    expect(swCode).toContain('The gates are closed — no connection.');
  });

  test('static game assets are network-first with a cache fallback', () => {
    expect(swCode).toContain('const isStaticAsset = (url)');
    const asset = swCode.slice(swCode.indexOf('async function handleAsset'), swCode.indexOf("addEventListener('fetch'"));
    expect(asset.indexOf('await fetch(request)')).toBeGreaterThan(-1);
    expect(asset).toContain('cache.put(request, response.clone())');
    expect(asset).toContain('cache.match(request)');
    for (const extension of ['.glb', '.ogg', '.png', '.woff2']) {
      expect(swCode).toContain(`'${extension}'`);
    }
  });

  test('only GET requests are ever answered from the cache', () => {
    expect(swCode).toContain("if (request.method !== 'GET') return;");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. What is never touched
// ══════════════════════════════════════════════════════════════════════════

describe('C. Auth, Drive, Firebase, dev routes and the worker itself pass through', () => {
  test('the bypass list names the Drive, Firebase and identity endpoints', () => {
    const list = swCode.slice(swCode.indexOf('const BYPASS_HOST_SUFFIXES'), swCode.indexOf('const STATIC_ASSET_EXTENSIONS'));
    for (const host of ['googleapis.com', 'googleusercontent.com', 'firebaseapp.com', 'firebaseio.com', 'accounts.google.com']) {
      expect(list).toContain(`'${host}'`);
    }
    for (const path of ['/identitytoolkit', '/securetoken', '/drive/v3', '/__/auth']) {
      expect(list).toContain(`'${path}'`);
    }
  });

  test('another origin is never intercepted', () => {
    expect(swCode).toContain('if (url.origin !== self.location.origin) return true;');
  });

  test('an authenticated or ranged request is left alone', () => {
    expect(swCode).toContain("if (request.headers.has('authorization')) return;");
    expect(swCode).toContain("if (request.headers.has('range')) return;");
  });

  test('the dev-harness routes and the worker script are never intercepted', () => {
    expect(swCode).toContain("if (url.pathname.startsWith('/__dev/')) return true;");
    expect(swCode).toContain("if (url.pathname === '/sw.js') return true;");
  });

  test('only a fresh same-origin 200 is ever stored', () => {
    expect(swCode).toMatch(/const isCacheable = \(response\) =>/);
    expect(swCode).toContain('response.status === 200');
    expect(swCode).toContain("response.type === 'basic'");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. Registration is production-only
// ══════════════════════════════════════════════════════════════════════════

describe('D. The worker registers in production builds only', () => {
  test('there is exactly one registration, and it is gated on import.meta.env.PROD', () => {
    const registrations = mainCode.split("navigator.serviceWorker.register('/sw.js')").length - 1;
    expect(registrations).toBe(1);
    expect(mainCode).toContain("if (import.meta.env.PROD && 'serviceWorker' in navigator)");
  });

  test('registration is fire-and-forget, so a failure cannot break boot', () => {
    expect(mainCode).toMatch(/navigator\.serviceWorker\.register\('\/sw\.js'\)\.catch\(/);
  });

  test('the registration is not inside any dev-harness branch', () => {
    const registration = mainCode.indexOf("navigator.serviceWorker.register('/sw.js')");
    const lastBranch = mainCode.lastIndexOf('} else if (useRaceHarness) {');
    const guard = mainCode.lastIndexOf('if (import.meta.env.PROD', registration);
    expect(registration).toBeGreaterThan(lastBranch);
    expect(guard).toBeGreaterThan(lastBranch);
    // From the last harness branch to the registration's own guard: no worker code.
    expect(mainCode.slice(lastBranch, guard)).not.toContain('serviceWorker');
  });

  test('the dev harnesses stay DEV-gated and never mention the worker', () => {
    for (const harness of [
      'useColosseumRearHarness',
      'useCharacterHarness',
      'useChariotHarness',
      'useRacingHarness',
      'useHorseFitHarness',
      'useRaceHarness',
    ]) {
      expect(mainCode).toMatch(new RegExp(`const ${harness} =\\s*\\n?\\s*import\\.meta\\.env\\.DEV &&`));
      // First in the chain (`if (…)`) or a later one (`} else if (…)`) — either way
      // the branch is still mounted before the final `<App />` else.
      expect(mainCode).toContain(`(${harness}) {`);
    }
    expect(mainCode).toContain("window.location.pathname === '/__dev/colosseum-rear'");
    expect(mainCode).toContain('sand_and_steel_dev_harness');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The designed offline page
// ══════════════════════════════════════════════════════════════════════════

describe('E. public/offline.html is a designed, self-contained screen', () => {
  test('it carries the designed copy', () => {
    expect(offlineCode).toContain('The gates are closed — no connection.');
    expect(offlineCode).toContain('Your progress is saved on this device');
    expect(offlineCode).toContain('Sand &amp; Steel');
  });

  test('it makes no external request of any kind', () => {
    expect(offlineCode).not.toMatch(/https?:\/\//);
    expect(offlineCode).not.toContain('<link ');
    expect(offlineCode).not.toContain('@import');
    expect(offlineCode).not.toContain('url(');
    expect(offlineCode).not.toMatch(/<img\b/);
  });

  test('its styles are inline and its type stack is the game’s own', () => {
    expect(offlineCode).toContain('<style>');
    expect(offlineCode).toContain("font-family: 'Cinzel', 'Trajan Pro', 'Times New Roman', Georgia, serif");
    expect(offlineCode).toContain('--bronze');
  });

  test('the retry control reloads the page', () => {
    expect(offlineCode).toMatch(/<button[^>]*id="retry"/);
    expect(offlineCode).toContain('window.location.reload()');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. The same contract, driven against the shipped worker
// ══════════════════════════════════════════════════════════════════════════

const ORIGIN = 'https://sand-and-steel.example';

/** A key as the real Cache API stores it: an absolute URL, string or Request alike. */
const keyOf = (key: any): string => new URL(typeof key === 'string' ? key : key.url, ORIGIN).href;

class FakeCache {
  readonly entries = new Map<string, any>();
  async put(key: any, response: any) {
    this.entries.set(keyOf(key), response);
  }
  async match(key: any) {
    return this.entries.get(keyOf(key));
  }
}

class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>();
  async open(name: string) {
    const existing = this.stores.get(name);
    if (existing) return existing;
    const created = new FakeCache();
    this.stores.set(name, created);
    return created;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
}

/** A response shaped like the ones a real `fetch` hands the worker. */
const makeResponse = (body: string, url: string, status = 200) => ({
  status,
  ok: status === 200,
  type: 'basic',
  url,
  clone: () => makeResponse(body, url, status),
  text: async () => body,
});

const createWorker = (fetchImpl: (input: any, init?: any) => Promise<any>) => {
  const handlers = new Map<string, (event: any) => void>();
  const storage = new FakeCacheStorage();
  const counts = { skipped: 0, claimed: 0 };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: (event: any) => void) => {
      handlers.set(type, handler);
    },
    skipWaiting: async () => {
      counts.skipped += 1;
    },
    clients: {
      claim: async () => {
        counts.claimed += 1;
      },
    },
  };
  // The worker's own shipped source, with its globals injected.
  new Function('self', 'caches', 'fetch', 'Response', swSrc)(self, storage, fetchImpl, Response);
  return { handlers, storage, counts };
};

const runLifecycle = async (handler: (event: any) => void) => {
  const waited: Promise<any>[] = [];
  handler({ waitUntil: (promise: any) => waited.push(promise) });
  await Promise.all(waited);
};

const dispatchFetch = async (
  handlers: Map<string, (event: any) => void>,
  request: any,
): Promise<any> => {
  let responded: Promise<any> | null = null;
  handlers.get('fetch')!({ request, respondWith: (promise: any) => { responded = promise; } });
  return responded ? await responded : null;
};

const navigationRequest = (path: string) => {
  const request = new Request(`${ORIGIN}${path}`);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
};

/** A worker installed against a network that serves every shell entry. */
const installedWorker = async (offlineBody = '<!doctype html><title>offline</title>') =>
  createWorker(async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const body = url.includes('offline.html') ? offlineBody : '<!doctype html><title>shell</title>';
    return makeResponse(body, new URL(url, ORIGIN).href);
  });

/** The route an offline launch lands on. */
const OFFLINE_ROUTE = '/some/route';

/**
 * The same worker, installed against a network that serves the shell — and then no
 * connection at all. Only a navigation fails afterwards, which is exactly what an
 * offline launch looks like once the shell is already on the device.
 */
const installedWorkerGoneOffline = async (offlineBody: string) => {
  const worker = createWorker(async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = new URL(url, ORIGIN).pathname;
    if (path === OFFLINE_ROUTE) throw new Error('offline');
    const body = path === '/offline.html' ? offlineBody : '<!doctype html><title>shell</title>';
    return makeResponse(body, new URL(url, ORIGIN).href);
  });
  await runLifecycle(worker.handlers.get('install')!);
  return worker;
};

const offlineFetch = async () => {
  throw new Error('offline');
};

describe('F. The shipped worker, driven', () => {
  test('install precaches the whole shell into the versioned cache and skips waiting', async () => {
    const worker = await installedWorker('<h1>The gates are closed — no connection.</h1>');
    await runLifecycle(worker.handlers.get('install')!);
    const cache = worker.storage.stores.get('sand-steel-shell-v1')!;
    expect(worker.counts.skipped).toBe(1);
    expect(cache).toBeDefined();
    for (const path of ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png']) {
      expect(cache.entries.has(keyOf(path))).toBe(true);
    }
  });

  test('activate drops an older version and keeps the current one', async () => {
    const worker = await installedWorker();
    await worker.storage.open('sand-steel-shell-v1');
    await worker.storage.open('sand-steel-shell-v0');
    await runLifecycle(worker.handlers.get('activate')!);
    expect(worker.storage.stores.has('sand-steel-shell-v0')).toBe(false);
    expect(worker.storage.stores.has('sand-steel-shell-v1')).toBe(true);
    expect(worker.counts.claimed).toBe(1);
  });

  test('an online navigation is served from the network and refreshes the shell copy', async () => {
    const worker = await installedWorker();
    await runLifecycle(worker.handlers.get('install')!);
    const cache = worker.storage.stores.get('sand-steel-shell-v1')!;
    cache.entries.delete(keyOf('/index.html'));

    const response = await dispatchFetch(worker.handlers, navigationRequest('/some/route'));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('shell');
    expect(cache.entries.has(keyOf('/index.html'))).toBe(true);
    // One fixed key: the route itself is never stored.
    expect(cache.entries.has(keyOf('/some/route'))).toBe(false);
  });

  test('an offline navigation falls back to the cached shell and answers HTTP 200', async () => {
    const worker = await installedWorkerGoneOffline('<h1>The gates are closed — no connection.</h1>');
    const cache = worker.storage.stores.get('sand-steel-shell-v1')!;
    expect(cache.entries.has(keyOf('/index.html'))).toBe(true);

    const response = await dispatchFetch(worker.handlers, navigationRequest(OFFLINE_ROUTE));
    expect(response).not.toBeNull();
    expect(response.status).toBe(200);
    // The app itself: the shell is cached so an offline launch still runs, rather
    // than landing on the offline screen whenever the connection is gone.
    expect(await response.text()).toContain('shell');
    // One fixed key — the route itself is never stored.
    expect(cache.entries.has(keyOf(OFFLINE_ROUTE))).toBe(false);
  });

  test('with no shell left the offline navigation serves the designed page as HTTP 200', async () => {
    const worker = await installedWorkerGoneOffline('<h1>The gates are closed — no connection.</h1>');
    const cache = worker.storage.stores.get('sand-steel-shell-v1')!;
    expect(cache.entries.has(keyOf('/offline.html'))).toBe(true);
    // Nothing left to serve the app from: both shell keys are gone.
    cache.entries.delete(keyOf('/index.html'));
    cache.entries.delete(keyOf('/'));

    const response = await dispatchFetch(worker.handlers, navigationRequest(OFFLINE_ROUTE));
    expect(response).not.toBeNull();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('The gates are closed — no connection.');
  });

  test('an offline navigation with a cold cache still answers a 200 document', async () => {
    const worker = createWorker(offlineFetch);
    const response = await dispatchFetch(worker.handlers, navigationRequest('/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('The gates are closed — no connection.');
  });

  test('a static asset is served from the network online and from the cache offline', async () => {
    const assetUrl = `${ORIGIN}/models/arena_roman.glb`;
    const online = createWorker(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      return makeResponse(url.includes('.glb') ? 'glb-bytes' : 'shell', new URL(url, ORIGIN).href);
    });
    const onlineResponse = await dispatchFetch(online.handlers, new Request(assetUrl));
    expect(await onlineResponse.text()).toBe('glb-bytes');
    expect(online.storage.stores.get('sand-steel-shell-v1')!.entries.has(keyOf(assetUrl))).toBe(true);

    const offline = createWorker(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('.glb')) throw new Error('offline');
      return makeResponse('shell', new URL(url, ORIGIN).href);
    });
    await runLifecycle(offline.handlers.get('install')!);
    await offline.storage.stores.get('sand-steel-shell-v1')!.put(assetUrl, makeResponse('cached-glb', assetUrl));
    const fallback = await dispatchFetch(offline.handlers, new Request(assetUrl));
    expect(await fallback.text()).toBe('cached-glb');
  });

  test('a request with no cached copy fails exactly as it would without a worker', async () => {
    const worker = createWorker(offlineFetch);
    const missing = `${ORIGIN}/models/missing.glb`;
    await expect(dispatchFetch(worker.handlers, new Request(missing))).rejects.toThrow();
    // The cache was opened to look, and nothing was written into it.
    expect(worker.storage.stores.get('sand-steel-shell-v1')!.entries.has(keyOf(missing))).toBe(false);
    expect(worker.storage.stores.get('sand-steel-shell-v1')!.entries.size).toBe(0);
  });

  test('auth, Drive and Firebase traffic is never intercepted and never cached', async () => {
    const worker = await installedWorker();
    await runLifecycle(worker.handlers.get('install')!);
    const cache = worker.storage.stores.get('sand-steel-shell-v1')!;
    const before = cache.entries.size;

    const untouched = [
      'https://www.googleapis.com/drive/v3/files',
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
      'https://securetoken.googleapis.com/v1/token',
      'https://game-abc.firebaseapp.com/__/auth/handler',
      'https://accounts.google.com/o/oauth2/v2/auth',
      `${ORIGIN}/sw.js`,
      `${ORIGIN}/__dev/colosseum-rear`,
    ];
    for (const url of untouched) {
      const response = await dispatchFetch(worker.handlers, new Request(url));
      expect(response).toBeNull();
      expect(cache.entries.has(keyOf(url))).toBe(false);
    }
    // An authenticated request is left alone even on this origin.
    const authorized = new Request(`${ORIGIN}/assets/index.js`, { headers: { authorization: 'Bearer token' } });
    expect(await dispatchFetch(worker.handlers, authorized)).toBeNull();
    // Ranged media (the .ogg soundtrack) is never answered from a whole entry.
    const ranged = new Request(`${ORIGIN}/music/title_main.ogg`, { headers: { range: 'bytes=0-' } });
    expect(await dispatchFetch(worker.handlers, ranged)).toBeNull();
    // A POST is never handled either.
    expect(await dispatchFetch(worker.handlers, new Request(`${ORIGIN}/`, { method: 'POST' }))).toBeNull();

    expect(cache.entries.size).toBe(before);
  });
});
