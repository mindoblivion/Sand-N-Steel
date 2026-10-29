<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/239f31e2-b3a7-4dd5-9f49-51afe4e8a00e

## Deploy (GitHub Pages)

`.github/workflows/deploy-pages.yml` publishes the production build to GitHub Pages on a push to
`main` (or by hand from the Actions tab). It runs the release gates first — `bun test`, `bun run lint`,
`bun run build` (which includes the startup-asset check) — then fails if the base token did not resolve,
publishes the app shell as `404.html` so deep links work, and uploads `dist/` only if everything passed.
Set the repository's Pages source to **GitHub Actions** once, under Settings → Pages.

**Both serving targets work — no code change to switch.**

| Target | URL | Setting |
| --- | --- | --- |
| Project site (default) | `https://<owner>.github.io/<repo>/` | nothing — base is derived from the repo name |
| Custom domain / user site | `https://your-domain/` | set the repository variable `PAGES_BASE_PATH` to `/` |

Every asset is base-relative (`src/utils/assetUrl.ts`, `%BASE_URL%` in `index.html`, a relative web app
manifest, and a service worker that derives its base from its own script URL), so a subpath deploy serves
its models, audio, signage, icons and offline shell without 404s. `PAGES_BASE_PATH`, when set, always wins
over the derived base.

`/privacy` and `/delete-account` are resolved by the app from the address at load time, so on Pages they
are served through `404.html` (HTTP status 404, the app inside it — the standard static-host fallback).

This app is not published yet; no live URL exists.

### Android (Google Play)

Nothing is packaged for Android yet. The base-relative work above is the prerequisite, because a bundled
WebView (Capacitor) serves the same `dist/` from its own origin root with no domain, and the offline shell
is already in place. See the L25 notes in `AGENTS.md`.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
