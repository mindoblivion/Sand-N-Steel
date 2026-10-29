/**
 * assetUrl.ts — the deploy base, and the ONE way the client turns a public file
 * path into the URL it is fetched from.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Every model, track, sign and icon is shipped from `public/`, so in the source
 * tree it is named by a root-absolute path (`'/models/arena_roman.glb'`). That is
 * correct only while the app is served from the domain ROOT. A GitHub Pages
 * *project* site serves the same files from a subpath
 * (`https://<owner>.github.io/<repo>/`), where every one of those requests 404s
 * — the page loads, the rigged gladiator falls back to procedural blocks and the
 * offline shell never installs. A bundled WebView (the Play Store build) has the
 * same constraint: nothing may assume it owns the origin root.
 *
 * Vite knows the answer: it rewrites the bundle, the CSS, the icons and the
 * manifest for whatever `base` the build was given, and exposes that base as
 * `import.meta.env.BASE_URL`. This module is the single place the runtime reads
 * it, so a path literal stays a plain public-file path everywhere else and only
 * becomes a URL here.
 *
 * ── THE CONTRACT ─────────────────────────────────────────────────────────
 * `assetUrl()` is the IDENTITY at the root (`BASE_URL = '/'`): every existing
 * caller, GLTF cache key and suite keeps meaning exactly what it meant before a
 * base existed. It prefixes only a path that starts with `/`, so a value that is
 * already relative, or an absolute `https://` URL, is returned untouched.
 *
 * `stripSiteBase()` is the inverse for `window.location.pathname`, so the public
 * pages (`/privacy`, `/delete-account`) resolve at a subpath as they do at the
 * root. Under `bun test` there is no Vite base, so both fall back to the root —
 * which is what every suite asserts.
 */

/**
 * The build's base, as Vite substitutes it. This MUST be written as the exact
 * member expression `import.meta.env.BASE_URL`: that is what the bundler replaces
 * with the literal base. Read through anything else — a destructured `env`, an
 * optional chain — it is not substituted, the value is `undefined`, and every
 * asset silently falls back to the root. Outside a Vite build (`bun test`, where
 * Bun's `import.meta.env` is the process environment) it is undefined by design.
 */
const injectedBase: string | undefined = import.meta.env.BASE_URL;

/**
 * The base every public asset is served from, always with a leading and a
 * trailing slash: `'/'` for the dev server, the sandbox preview and any
 * domain-root deploy; `'/sand-and-steel/'` for a project-site deploy.
 */
export const SITE_BASE: string = normalizeBase(injectedBase);

/** `'/repo'`, `'repo/'`, `''` and `'/'` all become a usable `'/…/'` base. */
export function normalizeBase(raw: string | undefined): string {
  if (typeof raw !== 'string' || raw.trim() === '') return '/';
  const trimmed = raw.trim();
  const rooted = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return rooted.endsWith('/') ? rooted : `${rooted}/`;
}

/** `withBase('/', '/models/a.glb')` → `'/models/a.glb'`; `withBase('/repo/', …)` → `'/repo/models/a.glb'`. */
export function withBase(base: string, path: string): string {
  if (!path.startsWith('/')) return path;
  return `${normalizeBase(base)}${path.slice(1)}`;
}

/** A public file path (`'/music/title_main.ogg'`) as the URL it is actually fetched from. */
export function assetUrl(path: string): string {
  return withBase(SITE_BASE, path);
}

/** A location pathname with the deploy base removed: `('/repo/', '/repo/privacy')` → `'/privacy'`. */
export function stripBase(base: string, pathname: string): string {
  const normalizedBase = normalizeBase(base);
  if (normalizedBase === '/') return pathname;
  const bare = normalizedBase.slice(0, -1);
  if (pathname === bare) return '/';
  if (pathname.startsWith(normalizedBase)) return `/${pathname.slice(normalizedBase.length)}`;
  return pathname;
}

/** `window.location.pathname` as the app's own route, whatever base it is served under. */
export function stripSiteBase(pathname: string): string {
  return stripBase(SITE_BASE, pathname);
}
