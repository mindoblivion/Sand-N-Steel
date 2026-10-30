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

`.github/workflows/android-release.yml` has **two jobs whose triggers are mutually exclusive**: no
single event can start both, and only one of them can ever sign.

| job | starts on | signing | artifact |
|---|---|---|---|
| `rehearsal` | `workflow_dispatch` with `mode: rehearsal` — from **any** branch | a throwaway RSA key generated on the runner | `rehearsal-aab-do-not-upload` (7-day retention) |
| `release` | a `push` of an approved **`v*` tag**, or `workflow_dispatch` with `mode: release` **from `main`** | your upload keystore, and only if the bundle's signer certificate matches the configured fingerprint | `sand-and-steel-aab` |

### Trigger matrix

| trigger | `rehearsal` | `release` | what happens |
|---|---|---|---|
| push of tag `v1.0.0` | — | **runs** | suite + typecheck + build, then a signed, fingerprint-verified bundle — **only if the tagged commit is on `main`** |
| push of tag `v1.0.0-alpha.1` | — | **runs** | same; any tag whose name starts with `v` |
| push of tag `release-1.0.0` | — | — | the workflow does not start: `push` matches `v*` tags only |
| push of a branch (including `main`) | — | — | the workflow does not start: there is no `branches:` filter |
| dispatch, `mode: rehearsal`, any ref | **runs** | — | practice bundle signed with a throwaway key; the upload key is never touched |
| dispatch, `mode: release`, `main` | — | **runs** | signed, fingerprint-verified bundle |
| dispatch, `mode: release`, any other ref | — | — | refused: the release job's `if:` requires `refs/heads/main` |
| dispatch from a tag with `mode: release` | — | — | refused: a manual release is main-only; tags release by being pushed |
| dispatch with no `mode`, or any other value | — | — | nothing runs |

**Why the rule lives in job-level `if:`s.** A skipped job never starts a runner, so GitHub never
injects that job's secrets into one. A shell test inside a job would run *after* the secrets were
already in that runner's environment, which is too late.

`release` deliberately has **no `needs:`** on `rehearsal`: a dependency on a job that a tag push
skips would skip the release too, and a tag push is the release path alone. For that reason the
release job runs the test suite and the typecheck **itself**, before any signing material is
restored, so a tagged commit is still never signed untested.

### Tag provenance — a release tag must be on `main`

A `v*` tag is release-eligible only when the commit it points at is **reachable from
`refs/heads/main`**. The check is the first step after checkout, before any secret-bearing step and
before anything is built:

1. `git fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'`;
2. `git merge-base --is-ancestor HEAD refs/remotes/origin/main`.

It **fails closed**: a fetch failure, a missing `main`, or a non-ancestor commit ends the job with an
`::error::` line. A tag on a feature-branch commit is therefore refused even though its name matches
`v*`, and so is a tag whose commit was dropped from `main` by a rewrite — retag a commit that is on
`main` instead. **The workflow never creates, moves or pushes a tag.** A manual `mode: release` run
needs no provenance step because its guard already pins `refs/heads/main`.

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
6. verifies that bundle's signature with the same script the release job uses, passing
   `--signature-only` because a key that exists for one run has no identity to pin;
7. uploads it as **`rehearsal-aab-do-not-upload`** and then deletes both signing files.

It references no secret, so it cannot become a store bundle: the practice bundle is signed with a key
that exists only for the length of that run and cannot update the Play listing. It is labelled a
rehearsal in its logs (`::notice::REHEARSAL`) and in its artifact name. A rehearsal never uploads
`sand-and-steel-aab`, and a tag push never produces the rehearsal artifact.

### How signing verification works

An unsigned `.aab` builds **successfully** — `android/app/build.gradle` applies the release
`signingConfig` only when `android/keystore.properties` exists — so "Gradle exited 0" is not
evidence that a bundle can be uploaded. `bun run scripts/verifyBundleSignature.ts <path-to.aab>`
makes **two** checks:

1. **Signature.** Lists the bundle's entries with `jar tf` and requires a JAR signature block
   (`META-INF/*.RSA`, `.DSA` or `.EC`); then runs `jarsigner -verify -certs` (the right verifier for
   an `.aab`, which uses the JAR signature scheme — `apksigner` verifies APKs, not bundles) and
   requires **both** a zero exit status and the `jar verified` line.
2. **Signer identity.** Runs `keytool -printcert -jarfile` and compares the SHA-256 fingerprint of
   **every** signer certificate against `EXPECTED_SIGNER_SHA256` (fed from the
   `ANDROID_UPLOAD_CERT_SHA256` secret). A certificate chain contributes only its signer, and a
   second, unexpected signer is enough to fail the bundle.

This second check is what a valid signature alone cannot give you: **any** key produces a perfectly
valid signature. The identity check is fail-closed — no configured fingerprint, a malformed one, a
keytool failure, or any mismatch ends the release with an `::error::` line, and no fingerprint value
is ever printed (only counts such as `1 of 1 signer certificate(s) do not match`). The rehearsal is
the only caller allowed to skip it, and it must say so explicitly with `--signature-only`.

In the release job the verification step runs **before** the upload step and carries no
`continue-on-error`, so the artifact is uploaded only once both checks pass. A failed check stops the
job and produces no artifact.

### Signing identity — obtaining and confirming the fingerprint

The pin is the SHA-256 fingerprint of **your upload certificate** — the certificate in
`Sand-and-Steel.keystore`, i.e. the key CI signs with. With Play App Signing enabled (the default for
new apps) Google holds a separate *app signing key* and re-signs the distributed APKs/App Bundles
with it, so the two fingerprints are **different**: Play Console → *Test and release* → *App
integrity* shows the app signing certificate, which is **not** the value to pin here. Pin the upload
certificate.

An administrator obtains it from material they already hold, and confirms it against a bundle CI
actually produced:

1. **From the keystore** (authoritative — it describes what CI will sign with):
   ```bash
   keytool -list -v -keystore Sand-and-Steel.keystore -alias <your-alias> | grep 'SHA256:'
   ```
   (`keytool -list -keystore … ` without `-v` prints only SHA-1/SHA-256 in some JDK builds; `-v`
   always prints the fingerprint block. If you don't know the alias, omit `-alias` and read the one
   entry it prints.)
2. **Confirm against a real bundle** — download `sand-and-steel-aab` from a release run, or use a
   local `./gradlew bundleRelease` output, and run:
   ```bash
   keytool -printcert -jarfile app-release.aab
   ```
   The `SHA256:` line under `Certificate #1` of `Signer #1` must be the same value. If the two
   disagree, the bundle was not signed with that keystore — stop and find out why before uploading.
3. **Store it** in Settings → Secrets and variables → Actions as **`ANDROID_UPLOAD_CERT_SHA256`**.
   The colon form (`AB:CD:…`, 95 characters) and the 64 hex digits are both accepted, in either
   case; the script normalizes before comparing.
4. **On rotation:** if the upload key is ever rotated, update this secret in the same change that
   installs the new keystore. A stale pin fails the release closed — by design.

Never commit a fingerprint to the repository and never paste a keystore or password into a chat.

### Required secrets

Create these yourself in Settings → Secrets and variables → Actions:

| secret | value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | the store password |
| `ANDROID_KEY_ALIAS` | the key alias |
| `ANDROID_KEY_PASSWORD` | the key password |
| `ANDROID_UPLOAD_CERT_SHA256` | SHA-256 fingerprint of the upload certificate (see above) |

On macOS/Linux: `base64 -i Sand-and-Steel.keystore | pbcopy` (or `base64 -w0` on Linux).

All five are required by the release path. The four keystore values are checked for non-emptiness
before anything is written (`::error::Missing repository secret for …`), and the fingerprint is
checked by the verification step, which fails closed when it is absent. The keystore values reach
Gradle only through `scripts/writeKeystoreProperties.ts`, which reads them from the environment,
escapes them for `java.util.Properties` (backslash, newline, non-ASCII, leading spaces) and prints
neither the values nor a derived form of them. The old workflow wrote the file with an unquoted shell
heredoc, which interpolated the password verbatim and silently corrupted any password containing a
backslash, `$`, a backtick, a newline or a leading space.

**The rehearsal job references none of these five secrets.** That is enforced structurally: it has
no `secrets.*` reference at all, and its job-level `if:` refuses every trigger except a manual
`mode: rehearsal` run, so it never starts a runner on a tag push.

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
3. Tag a commit that is **on `main`** as `v<versionName>` (e.g. `v1.0.1`) and push the tag, or
   dispatch the workflow from `main` with `mode: release`. **Only those paths can sign**, and a tag
   whose commit is not reachable from `main` is refused — see "Trigger matrix" and "Tag provenance".
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

- **Workflow structure verified 2026-10-30 (AR-3), without dispatching a run.** The workflow YAML
  parses, and every `run:` block passes `bash -n`. `bun test` covers the trigger matrix (the jobs'
  real `if:` expressions are evaluated for 16 event/ref/mode combinations, proving that no event
  starts both jobs and that a feature-branch, tag or unauthorized-mode dispatch can never reach the
  release path), the secret isolation, the verify-before-upload ordering and the fingerprint logic.
  The provenance block was driven against a real throwaway repository in three scenarios — an
  approved tag (exit 0), a tag on a feature-branch commit (exit 1) and an unfetchable `main`
  (exit 1) — and `scripts/verifyBundleSignature.ts` was run end to end against a real JAR-signed
  bundle with a real JDK: unpinned → exit 1, wrong fingerprint → exit 1, correct fingerprint (colon
  form, colon-less form and lowercase) → exit 0, unsigned bundle → exit 1.
- **Still CI-only (not verified here):** that GitHub itself evaluates these guards the same way, that
  the five secrets are populated in the repository, that `setup-java`/Gradle produce a signable
  bundle on `ubuntu-latest`, and the upload to Play Console. The first `workflow_dispatch` rehearsal
  and the first tagged release are the checks that close them.

## Known Android limitation: cloud-save sign-in

Sign-in (Google, Facebook, Apple, email) currently uses the Firebase **web** SDK. Inside an
Android WebView its popup/redirect flows cannot complete, so cloud save is not expected to
work in the installed app — the game itself plays fully offline, and saves are stored in the
WebView's `localStorage` (they are lost if the app is uninstalled).

Making sign-in work natively needs a follow-up step: a native auth plugin (e.g.
`@capacitor-firebase/authentication`), a `google-services.json` registered against the package
name `com.phatass.sandandsteel`, and this build's SHA-1 fingerprint added in Firebase. That
file is not in the repo, and the build works without it.
