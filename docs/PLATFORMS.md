# Platform support — where Sand & Steel runs

One web build (`dist/`) is the game. Everything else is a shell around it: two Capacitor
projects for the mobile stores, and the browser itself for desktop. This page records what
exists in the repository, how each target is produced, and — plainly — what has and has not
been verified here.

| Platform | How it ships | In this repo | Verified |
|---|---|---|---|
| Web (any modern browser) | static `dist/` | `vite build` | ✅ build + startup check + dev server |
| Android | Capacitor shell → `.aab` | `android/` | ✅ project, icons, splash; ⚠️ AAB build not run in this container |
| iOS / iPadOS | Capacitor shell → `.ipa` | `ios/` | ⚠️ project + assets generated; Xcode build needs macOS |
| Windows 10/11 | installable PWA from the web build | `public/manifest.webmanifest`, `public/sw.js` | ✅ install criteria; ⚠️ no install prompt driven |
| macOS | installable PWA from the web build | same | ✅ install criteria; ⚠️ no install prompt driven |

## The permanent identifiers

| | value |
|---|---|
| App name | **Sand & Steel** |
| Bundle / package id | **`com.phatass.sandandsteel`** |

`capacitor.config.ts` is the single `appId`. The Android copy lives in `android/app/build.gradle`
and `values/strings.xml` (see `docs/ANDROID_RELEASE.md`); the iOS copy is in
`ios/App/App.xcodeproj`. Both are permanent once a first upload exists: changing the id creates a
new listing and orphans every install.

## Android

```bash
bun run cap:sync        # build dist/ and copy it into android/
# then build/sign the AAB — docs/ANDROID_RELEASE.md
```

## iOS

The project is Swift Package Manager based (Capacitor 8), so **no CocoaPods are involved** — which
is why `bunx cap add ios` completed on this Linux container and `ios/` contains a real Xcode
project rather than a stub.

```bash
bun run cap:sync:ios    # build dist/ and copy it into ios/App/App/public
open ios/App/App.xcodeproj   # macOS only
```

What still needs a Mac and an Apple Developer Program membership (none of it can be done here):

1. Set the team and a unique bundle id suffix in Xcode → Signing & Capabilities.
2. Set the version and build number (Xcode → General), matching `package.json`'s version.
3. Archive → Distribute App → App Store Connect, then complete the App Store listing.
4. App Store review requires a **privacy policy URL** (`/privacy`) and, for apps that create
   accounts, an **account-deletion path** (`/delete-account`) — both already exist and are public.
   The **terms of service** (`/terms`) linked from the title screen and Settings serve the same
   purpose for both stores.

## Windows and macOS — the installable web app

The web build already satisfies the browser's install criteria, so a player on Windows or macOS
can install Sand & Steel like a native app — same build, no wrapper, no store review:

- `public/manifest.webmanifest` — name, short name, `display: standalone`, landscape orientation,
  `#0c0a09` theme/background, 192/512 icons plus a maskable 512.
- `public/sw.js` — registered in production builds only (`src/main.tsx`), precaching the app shell
  and serving `offline.html` when the shell cannot be reached.
- Icons at `public/icons/`, generated from the single branding source (see below).

Install it from Edge or Chrome (Windows and macOS): open the game, then *App menu → Apps →
Install Sand & Steel*, or the install icon in the address bar. In Safari 17+ on macOS:
*File → Add to Dock*.

**Not verified here:** an actual install prompt in a desktop browser, and offline launch on a
physical machine — both need a real desktop browser and a served production build.

**What does not exist yet:** native desktop installers (`.exe`, `.msix`, `.dmg`, `.pkg`) for the
Microsoft Store or the Mac App Store. Those need a wrapper project (Electron or Tauri) plus code
signing certificates, and macOS builds additionally need a Mac. That is a separate decision, not a
configuration change.

## Branding artwork — one source, every surface

`resources/icon.png` (1024×1024), `resources/splash.png` and `resources/splash-dark.png`
(2732×2732) are the single source of the branding. Everything else is generated:

```bash
bun run brand:assets
```

That runs `@capacitor/assets` for **Android and iOS** (launcher icons, adaptive icon layers,
portrait/landscape splashes, day and night) and then `scripts/generateBrandAssets.ts` for the
**web and store** set:

| file | rule |
|---|---|
| `public/icons/icon-192.png`, `icon-512.png` | the artwork as drawn, cover-cropped |
| `public/icons/icon-maskable-512.png` | mark at 80 % inside the safe zone, on `#0c0a09` — a full-bleed image would be cropped by a launcher mask |
| `public/icons/apple-touch-icon.png` | 180×180, opaque (iOS composites transparency onto black) |
| `store/play/icon-512.png` | 512×512 opaque RGB — the Play Console listing icon |

Do not hand-edit `android/app/src/main/res/mipmap-*`, `drawable*` or
`ios/App/App/Assets.xcassets/`; regenerate instead.
