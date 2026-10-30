# Android / Google Play release

Sand & Steel ships to Google Play as a Capacitor shell around the web build: the Vite
bundle in `dist/` is copied into the native project in `android/`, which is then built
and signed as an Android App Bundle (`.aab`).

## Permanent identifiers — do not change these

| | value |
|---|---|
| Play store app name | **Sand & Steel** |
| Package name (`applicationId`) | **`com.phatass.sandandsteel`** |

The package name lives in three places and must stay identical in all of them:
`capacitor.config.ts` (`appId`), `android/app/build.gradle` (`applicationId` and
`namespace`), and `android/app/src/main/res/values/strings.xml` (`package_name`,
`custom_url_scheme`).

Once the first bundle is uploaded to the Play Console the package name is **permanent**:
changing it creates a brand-new listing, and every existing install, review score and
Firebase-registered Android app stays behind with the old one. Treat it as carved in stone.

## Signing material you already have

- `Sand-and-Steel.keystore` — the upload key. **Never commit it**, never paste it into a
  chat, and keep a backup: losing it means you can no longer ship updates to this listing.
- `keystore.pass` — the password(s) for it. Same handling.

Both are git-ignored (`android/.gitignore` covers `*.keystore`, `*.jks` and
`keystore.properties`).

To build a signed bundle locally:

1. Put the keystore at `android/app/Sand-and-Steel.keystore`.
2. Copy `android/keystore.properties.example` to `android/keystore.properties` and fill in
   the store password, the key alias and the key password. If you don't remember the alias,
   run `keytool -list -v -keystore Sand-and-Steel.keystore` — it prints it.
3. Without `keystore.properties` the release build still compiles, just unsigned.

The Play Console must have **Play App Signing** enabled (it is by default for new apps):
Google holds the app signing key, and this keystore is your *upload* key.

## Building

Local (needs JDK 21 and the Android SDK — Android Studio installs both):

```bash
bun install --frozen-lockfile
bun run cap:sync          # builds dist/ and copies it into android/
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

## CI: rehearsal and release

`.github/workflows/android-release.yml` has **two jobs, and only one of them can sign**.

| job | runs on | signing | artifact |
|---|---|---|---|
| `rehearsal` | **every** trigger (a dispatch from any branch, any `v*` tag) | a throwaway RSA key generated on the runner | `rehearsal-aab-do-not-upload` (7-day retention) |
| `release` | **`main` or a `v*` tag only** | your upload keystore | `sand-and-steel-aab` |

### Which refs may create signed artifacts

Only two refs may reach the upload keystore:

- **`refs/heads/main`** — the protected release branch (the repository default).
- **`refs/tags/v*`** — a release tag whose name starts with `v`, e.g. `v1.0.0`, `v1.0.0-alpha.1`.

Everything else is refused: a feature branch, a pull-request ref, any other tag name. The refusal
is a **job-level `if:` on the `release` job**, which also requires
`needs.rehearsal.result == 'success'`. That placement is deliberate — a skipped job never starts a
runner, so GitHub never injects the four signing secrets into a runner for an unapproved ref. A
shell check inside the job would run *after* the secrets were already in that runner's environment.

`workflow_dispatch` cannot bypass the rule. The guard reads `github.ref`, so dispatching the
workflow "from" a feature branch evaluates to that branch's ref and the `release` job is skipped;
a manual run must also pass `mode: release`. A manual run from `main` with the default
`mode: rehearsal` validates without signing.

Tag pushes obey the same guard: `push: tags: ['v*']` only starts the workflow at all for a `v*`
tag, and the job's `if:` then applies the same main/`v*` test.

### Running a safe rehearsal

Actions → **Build Android bundle (rehearsal or release)** → **Run workflow** → pick any branch →
leave `mode` at `rehearsal`.

The rehearsal job:

1. installs from the committed lockfile (`bun install --frozen-lockfile`);
2. runs the suite (`bun test`) and the typecheck (`bun run lint`);
3. builds the web app and syncs it into `android/` (`bun run cap:sync`, with `BUILD_COMMIT` set to
   the run's commit);
4. generates a **throwaway** PKCS12 key as `android/app/rehearsal.keystore` and writes the matching
   `android/keystore.properties`;
5. runs `./gradlew bundleRelease --no-daemon`;
6. verifies that bundle's signature with the same check the release job uses;
7. uploads it as **`rehearsal-aab-do-not-upload`** and then deletes both signing files.

It reads no secret, so it cannot become a store bundle: the practice bundle is signed with a key
that exists only for the length of that run and cannot update the Play listing. It is labelled a
rehearsal in its logs (`::notice::REHEARSAL`) and in its artifact name.

### How signing verification works

An unsigned `.aab` builds **successfully** — `android/app/build.gradle` applies the release
`signingConfig` only when `android/keystore.properties` exists — so "Gradle exited 0" is not
evidence that a bundle can be uploaded. Both jobs therefore run
`bun run scripts/verifyBundleSignature.ts <path-to.aab>`, which:

- lists the bundle's entries with `jar tf` and requires a JAR signature block
  (`META-INF/*.RSA`, `.DSA` or `.EC`) — an unsigned build has none;
- runs `jarsigner -verify -certs` (the right verifier for an `.aab`, which uses the JAR signature
  scheme; `apksigner` verifies APKs, not bundles) and requires **both** a zero exit status and the
  `jar verified` line, so a silent exit 0 is not accepted as proof;
- fails with an `::error::` line naming the reason otherwise.

In the release job the verification step runs **before** the upload step and carries no
`continue-on-error`, so the artifact is uploaded only once the signature verifies. A failed check
stops the job and produces no artifact.

**What verification does not prove:** that the signer is *your* upload key. That needs the
certificate fingerprint, which is deliberately not stored in this repository — confirm it by hand
once, with `jarsigner -verify -certs` on the first release bundle, or against Play Console →
App integrity.

### Required secrets

Create these yourself in Settings → Secrets and variables → Actions:

| secret | value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | the store password |
| `ANDROID_KEY_ALIAS` | the key alias |
| `ANDROID_KEY_PASSWORD` | the key password |

On macOS/Linux: `base64 -i Sand-and-Steel.keystore | pbcopy` (or `base64 -w0` on Linux).

All four are required. The release job checks that each one is non-empty before writing anything and
fails with `::error::Missing repository secret for …` if one is absent. The values reach Gradle only
through `scripts/writeKeystoreProperties.ts`, which reads them from the environment, escapes them for
`java.util.Properties` (backslash, newline, non-ASCII, leading spaces) and prints neither the values
nor a derived form of them. The old workflow wrote the file with an unquoted shell heredoc, which
interpolated the password verbatim and silently corrupted any password containing a backslash, `$`,
a backtick, a newline or a leading space.

## Native assets (Play Console "Configure assets and build")

Everything the store build needs from an icon/splash/branding standpoint is already in the
repository. This is the audited inventory, and which file goes where in the Play Console.

| what | source of truth | files in the build / upload | spec |
|---|---|---|---|
| Launcher icon (legacy) | `resources/icon.png` (1024×1024) | `android/app/src/main/res/mipmap-{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` and `ic_launcher_round.png` | 36 / 48 / 72 / 96 / 144 / 192 px |
| Adaptive icon | same | `mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_foreground.png` / `ic_launcher_background.png` per density | 81 / 108 / 162 / 216 / 324 / 432 px (108 dp layers) |
| Master artwork | `public/icons/icon-source.svg` | — | 512×512, art inside an 80 % circle |
| Play Store icon (512) | `public/icons/icon-512.png` | uploaded in Play Console → Store listing → App icon | 512×512, **opaque RGB** (no alpha), 49.9 KB |
| Splash screen | `resources/splash.png`, `resources/splash-dark.png` (2732×2732) | 26 `drawable-*`/`drawable-*-night` splashes, portrait and landscape, mdpi–xxxhdpi | generated by `@capacitor/assets` |
| Launch theme | `android/app/src/main/res/values/styles.xml` | `AppTheme.NoActionBarLaunch` | Android 12+ `windowSplashScreenBackground`, pre-12 `windowBackground` |
| Brand colours | `android/app/src/main/res/values/colors.xml` + `capacitor.config.ts` + `index.html` | — | bronze `#b45309`, deep stone `#0c0a09`, ember `#f59e0b` |

To regenerate the raster icons after changing the artwork:

```bash
npx @capacitor/assets generate --android   # reads resources/icon.png + splash*.png
```

Then re-run `bun run cap:sync` (or simply rebuild) so the native project carries the new files.

### Store listing assets

`store/play/` holds the Play Console uploads and their specs — see its README.

- **Feature graphic**: `store/play/feature-graphic-1024x500.png` (1024×500, 24-bit PNG, no alpha),
  derived from the supplied 1488×720 artwork by a 7 px-per-side trim and a scale.
- **App icon**: `public/icons/icon-512.png` (512×512, opaque).
- **Phone screenshots**: still missing. The two supplied captures are 1080×2340 (2.17:1, over
  Play's 2:1 limit); one of them also shows Base44 development UI. They need a retake in the
  installed app framed at 16:9 (1080×1920).
- Tablet screenshots are only needed if tablet support is declared.

### Bundle size note

`bun run build` produces **~73 MB** of `dist/` (it was ~120 MB before the horse models were
relocated). The difference is three dev-only horse uploads totalling **47.4 MB**, which now live in
`src/assets/dev/horses/` instead of `public/`.

That move is the whole fix, and it is worth understanding why: **Vite copies every file in
`public/` into the build, imported or not**, so any art parked there ships to `dist/`, `cap sync`,
the AAB and both store bundles. Under `src/`, a file reaches a build only by being imported, and
nothing imports these — only the dev-only fit prototype does (`?devHarness=horsefit` →
`src/components/dev/HorseChariotFitPrototype.tsx` → `src/utils/horseFitPrototype.ts`), through
`main.tsx`'s `import.meta.env.DEV` branch, which a production bundle drops.

They stay in the repository because nothing replaces them: that prototype is the tool that measures
horse scale and alignment for the racing feature, and three suites hash-pin their exact bytes
(`phaseC8_67d` §G, `phaseC8_68c`, `phaseC8_70bStage1`). The dev server still serves the file
(`/src/assets/dev/horses/_workspace_dist_horse_weak.glb`, `model/gltf-binary`, 200). Rule of thumb:
**a dev-only asset belongs in `src/`, never in `public/`.**

`public/README.md` and `README2.md` are still packaged (a few KB — not worth a rule). Play's
base-module limit is 200 MB, so nothing here blocks a submission.

### Push notifications (Firebase)

The game sends no push notifications, so **no Firebase project has to be linked for this phase** and
no `google-services.json` is required — the release build is complete without it.
`android/app/build.gradle` already has the standard hook (it applies
`com.google.gms.google-services` only when `android/app/google-services.json` exists), so adding push
later is: register package `com.phatass.sandandsteel` in Firebase, drop the file at
`android/app/google-services.json`, add the SHA-1 of the upload certificate, then add a native push
plugin + `POST_NOTIFICATIONS` permission. That is a feature change, not part of packaging.

The Firebase config currently in the repo (`firebase-applet-config.json`) is the **web** SDK config
used by the optional cloud-save sign-in — see the sign-in limitation at the end of this document.

## Every new version

1. Raise `versionCode` by at least 1 in `android/app/build.gradle` (Play rejects a lower or
   repeated code) and update `versionName` to whatever the player should see.
2. Run `bun run cap:sync` so the web build in `android/` matches the code.
3. Tag the release commit `v<versionName>` (e.g. `v1.0.1`) and push the tag, or dispatch the
   workflow from `main` with `mode: release`. **Only those refs can sign** — see
   "Which refs may create signed artifacts".
4. Download `sand-and-steel-aab` from the run and upload it in Play Console.

### Before the first (or next) upload: check the versionCode

The repository's `versionCode` is **1** (`android/app/build.gradle`). Do **not** assume that number
is still available:

- **First upload ever:** confirm no bundle or APK has been uploaded for `com.phatass.sandandsteel`.
  If the listing already exists, Play Console → *Test and release* → the track's bundle list shows
  the highest `versionCode` already accepted.
- **Every later upload:** the new `versionCode` must be **strictly greater** than the highest one
  Play has accepted. Play rejects a lower or repeated code, and a rejected bundle cannot be
  replaced — it can only be re-uploaded with a higher code.

Check this **before** tagging: raising `versionCode` after a tagged release means a second build.
The CI signature check covers whether the bundle is signed, **not** whether Play will accept its
`versionCode`.

## What is verified, and what is not

- Verified here: `bun run build` (including the startup-asset check) passes, `bun run
  cap:sync` copies the bundle into `android/`, and the generated project carries the
  package name above. Re-verified 2026-10-29: build exit 0 (8 startup assets), `cap sync
  android` exit 0, icon/splash densities measured against Google's size table.
- **Not verified here:** the `styles.xml` launch-theme change (Android 12 splash background +
  pre-12 window background) — it needs a device or emulator look at a cold start.
- **The Gradle/AAB build itself: verified once, in a throwaway container.** The sandbox host
  has no JDK or Android SDK, so on 2026-10-29 a temporary `eclipse-temurin:21-jdk` container was
  given `cmdline-tools` + `platforms;android-36` + `build-tools;36.0.0` and ran
  `./gradlew bundleRelease` against this checkout: **BUILD SUCCESSFUL**, 118 tasks,
  `lintVitalRelease` clean, output `android/app/build/outputs/bundle/release/app-release.aab`
  (88.9 MB, 526 entries, 61 `assets/public/` entries). The bundle is **unsigned** — no
  `keystore.properties` existed — so it cannot be uploaded; a signed one still comes from the CI
  workflow or your machine. That scratch container is not part of the dev stack: the `web`
  service still has no JDK, and nothing in `docker-compose.base44.yml` builds Android.
- **Not verified here:** anything on a physical device (touch feel, HUD, frame rate).

## Known Android limitation: cloud-save sign-in

Sign-in (Google, Facebook, Apple, email) currently uses the Firebase **web** SDK. Inside an
Android WebView its popup/redirect flows cannot complete, so cloud save is not expected to
work in the installed app — the game itself plays fully offline, and saves are stored in the
WebView's `localStorage` (they are lost if the app is uninstalled).

Making sign-in work natively needs a follow-up step: a native auth plugin (e.g.
`@capacitor-firebase/authentication`), a `google-services.json` registered against the package
name `com.phatass.sandandsteel`, and this build's SHA-1 fingerprint added in Firebase. That
file is not in the repo, and the build works without it.
