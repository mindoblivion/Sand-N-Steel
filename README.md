<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/239f31e2-b3a7-4dd5-9f49-51afe4e8a00e

## Deploy (GitHub Pages)

`.github/workflows/deploy-pages.yml` publishes the production build to GitHub Pages on a push to
`main` (or by hand from the Actions tab). It runs the release gates first — `bun test`, `bun run lint`,
`bun run build` (which includes the startup-asset check) — and uploads `dist/` only if all three pass.
Set the repository's Pages source to **GitHub Actions** once, under Settings → Pages.

The build must be served from a **domain root**. A project site
(`https://<owner>.github.io/<repo>/`) is not supported yet, because the 3D models
(`/models/...`), the model preload list and the offline service worker (`/sw.js`) are still referenced
root-absolutely. Use a custom domain (or a `https://<owner>.github.io` user/org site) until those
references are made base-relative. `PAGES_BASE_PATH` (repository variable) passes `BASE_PATH` to Vite
and defaults to `/`.

This app is not published yet; no live URL exists.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
