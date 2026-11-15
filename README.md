<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

## Project state — read this first

**Authoritative handoff:** [`docs/STATE_OF_THE_GAME.md`](docs/STATE_OF_THE_GAME.md)

Before every AI coding session, read `docs/STATE_OF_THE_GAME.md` and its linked Android acceptance checklist. It records what currently works, what remains unverified, known release blockers, and what is out of scope. Do not reintroduce deferred systems or assume a feature is broken without checking the current source and tests.

---


This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/239f31e2-b3a7-4dd5-9f49-51afe4e8a00e

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
