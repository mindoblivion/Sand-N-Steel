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
| `rehearsal` | `workflow_dispatch` with `mode: rehearsal` — from **any** branch | stable rehearsal-only RSA key by default; temporary one-run key only when explicitly selected | `rehearsal-aab-do-not-upload` — signed AAB + directly installable APK (7-day retention) |
| `release` | a `push` of an approved **`v*` tag**, or `workflow_dispatch` with `mode: release` **from `main`** | your upload keystore, and only if the bundle's signer certificate matches the configured fingerprint | `sand-and-steel-aab` |

### Trigger matrix

| trigger | `rehearsal` | `release` | what happens |
|---|---|---|---|
| push of tag `v1.0.0` | — | **runs** | suite + typecheck + build, then a signed, fingerprint-verified bundle — **only if the tagged commit is on `main`** |
| push of tag `v1.0.0-alpha.1` | — | **runs** | same; any tag whose name starts with `v` |
| push of tag `release-1.0.0` | — | — | the workflow does not start: `push` matches `v*` tags only |
| push of a branch (including `main`) | — | — | the workflow does not start: there is no `branches:` filter |
| dispatch, `mode: rehearsal`, any ref | **runs** | — | stable rehearsal-only key by default (or temporary key when explicitly selected); production upload key is never touched |
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

Actions → **Build Android bundle (rehearsal or release)** → **Run workflow** → pick the branch
containing the candidate. Leave `mode` at `rehearsal`. Leave `rehearsal_signing` at its default,
`stable`, for normal device testing and in-place APK updates.

The rehearsal job:

1. installs from the committed lockfile (`bun install --frozen-lockfile`);
2. runs the suite (`bun test`) and the typecheck (`bun run lint`);
3. builds the web app and syncs it into `android/` (`bun run cap:sync`, with `BUILD_COMMIT` set to
   the run's commit);
4. restores the dedicated rehearsal keystore from rehearsal-only Actions secrets, writes
   `android/keystore.properties`, and builds the signed AAB;
5. verifies both the AAB signature and its pinned rehearsal certificate fingerprint;
6. builds and verifies a directly installable APK with that same stable certificate;
7. uploads both outputs as **`rehearsal-aab-do-not-upload`**, then deletes the keystore and
   properties file from the runner.

If the rehearsal secrets are missing, stable mode **fails closed** with a clear error. It does not
silently fall back to a temporary key. The optional `temporary` choice is an explicit one-run
fallback for disposable testing; it generates a throwaway key, skips only signer-identity pinning,
and cannot update a previous rehearsal install.

### Stable rehearsal signing (one-time owner setup)

This certificate is separate from the Google Play upload key. It exists only to let successive
rehearsal APKs update the same test installation without uninstalling the app and losing its
WebView `localStorage` save.

Generate a dedicated PKCS12 key locally. Keep the keystore and passwords private; **never commit
them, upload them as repository files, or paste them into a chat or issue**.

Example on macOS/Linux (run in a private local terminal):

```bash
export STORE_PASSWORD="$(openssl rand -hex 32)"
# PKCS12 uses the same password for the store and private key.
export KEY_PASSWORD="$STORE_PASSWORD"
keytool -genkeypair -noprompt \
  -keystore Sand-and-Steel-Rehearsal.keystore \
  -storetype PKCS12 \
  -alias rehearsal \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -keyalg RSA -keysize 2048 -validity 3650 \
  -dname "CN=Sand and Steel Rehearsal, OU=Testing, O=Sand and Steel, C=US"

# Copy the complete base64 output into the matching GitHub Actions secret.
base64 < Sand-and-Steel-Rehearsal.keystore | tr -d '\n'
printf '%s\n' "$STORE_PASSWORD"
printf '%s\n' "$KEY_PASSWORD"
printf '%s\n' "$(keytool -list -v -keystore Sand-and-Steel-Rehearsal.keystore \
  -storepass "$STORE_PASSWORD" -alias rehearsal | awk '/SHA256:/{print $2; exit}')"
```


#### Android / Termux setup

If you are generating the rehearsal key directly on an Android phone with Termux, use this equivalent setup. It creates the keystore inside a private directory and writes the long Base64 value to a file so it is easier to copy without relying on terminal line wrapping.

```bash
pkg update
pkg install openssl openjdk-21 coreutils

mkdir -p "$HOME/sand-steel-signing"
chmod 700 "$HOME/sand-steel-signing"
cd "$HOME/sand-steel-signing"
umask 077

STORE_PASSWORD="$(openssl rand -hex 32)"
KEY_PASSWORD="$STORE_PASSWORD"

keytool -genkeypair -noprompt \
  -keystore Sand-and-Steel-Rehearsal.keystore \
  -storetype PKCS12 \
  -alias rehearsal \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -keyalg RSA -keysize 2048 -validity 3650 \
  -dname "CN=Sand and Steel Rehearsal, OU=Testing, O=Sand and Steel, C=US"

base64 -w 0 Sand-and-Steel-Rehearsal.keystore > rehearsal-keystore-base64.txt
chmod 600 Sand-and-Steel-Rehearsal.keystore rehearsal-keystore-base64.txt

printf 'STORE_PASSWORD: %s\\n' "$STORE_PASSWORD"
printf 'KEY_PASSWORD: %s\\n' "$KEY_PASSWORD"
printf 'KEY_ALIAS: rehearsal\\n'
printf 'CERT_SHA256: '
keytool -list -v -keystore Sand-and-Steel-Rehearsal.keystore \
  -storepass "$STORE_PASSWORD" -alias rehearsal | awk '/SHA256:/{print $2; exit}'

# Display the Base64 value only when you are ready to copy it into GitHub.
cat rehearsal-keystore-base64.txt
```

Keep this Termux session open until you have entered all five values in GitHub. Copy the Base64 output as one uninterrupted value; do not add spaces or line breaks. If Termux reports that the `openjdk-21` package is unavailable, run `pkg search openjdk` and install the current OpenJDK package it lists, then confirm `keytool -version` works before generating the key.

The keystore and Base64 file are both private signing material. Do not share them, attach them to a chat, or commit them to Git. After all five GitHub secrets are saved and you have confirmed the workflow can use them, securely delete the local Base64 copy and keep a protected backup of the keystore and its passwords.

In the repository, open **Settings → Secrets and variables → Actions → New repository secret** and
create these five secrets. Enter each value locally; do not send the values to anyone.

| secret name | value |
|---|---|
| `ANDROID_REHEARSAL_KEYSTORE_BASE64` | Base64 output of the rehearsal PKCS12 keystore |
| `ANDROID_REHEARSAL_KEYSTORE_PASSWORD` | `STORE_PASSWORD` |
| `ANDROID_REHEARSAL_KEY_ALIAS` | `rehearsal` |
| `ANDROID_REHEARSAL_KEY_PASSWORD` | `KEY_PASSWORD` |
| `ANDROID_REHEARSAL_CERT_SHA256` | SHA-256 certificate fingerprint printed by `keytool` |

The workflow injects these values only into the rehearsal job's specific restore/verification steps.
The production upload secrets remain confined to the release job. The rehearsal fingerprint is
checked on every stable-mode AAB before the APK is built or either artifact is uploaded. Missing
secrets or a mismatched certificate stop the job.

**Rotation:** changing the rehearsal keystore changes the Android signing identity. Existing
installations cannot be updated by APKs signed with the replacement key; they must be uninstalled
and reinstalled, which can erase local saves. Only rotate when necessary, update all five secrets
together, and plan a one-time reinstall. Do not reuse the Play upload key for rehearsal signing.

### Installing the rehearsal APK on a Samsung device

After the manual rehearsal workflow finishes successfully:

1. Open the completed Actions run and confirm its checked-out commit SHA is the exact candidate you intend to test. Do not use an older run's artifact.
2. Download the **`rehearsal-aab-do-not-upload`** artifact and extract the ZIP.
3. Use **`apk/release/app-release.apk`** from the extracted artifact. Because the workflow uploads both files together, `android/app/build/outputs/` is their common root and is stripped from the ZIP paths. The AAB appears at `bundle/release/app-release.aab` and is included for bundle-level validation; the APK is the file to install directly.
4. Transfer the APK to the Samsung device (for example, with USB) and open it from the device's file manager. If Android prompts, allow that file manager to install unknown apps, then retry the installation.
5. Launch **Sand & Steel** and record the device model, Android version, install/launch result, orientation, local save/restore, arena entry, crashes, and observed performance.

**Important signing constraint:** stable rehearsal APKs use the same dedicated rehearsal certificate on every run, so a later APK can update an earlier rehearsal install without uninstalling it. This is not the Play upload/app-signing certificate and cannot update a Play-installed copy of the same package. If you explicitly select `temporary`, the one-run certificate will not update an earlier APK; uninstalling first can erase local app data. Rehearsal artifacts must never be uploaded to Play Console.

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

**The rehearsal job references none of the five production upload secrets.** It uses a separate
set of dedicated rehearsal-only secrets when stable signing is selected; the Play upload keystore
and its fingerprint remain confined to the release job. Its job-level `if:` refuses every trigger
except a manual `mode: rehearsal` run, so it never starts a runner on a tag push.

## Native assets (Play Console "Configure assets and build")

**Icon inventory status (audited 2026-11-15):** the approved two-gladiator artwork and generator update from
[PR #404](https://github.com/mindoblivion/Sand-N-Steel/pull/404) have been merged into `main` and are present in
`feature/rival-schools`. The Android manifest references the adaptive launcher resources and the generator
produces the density-specific legacy/adaptive assets. The icon is included in the candidate source; its
appearance has not yet been visually checked in an installed rehearsal APK on the Samsung device.

| what | current source / location | current state |
|---|---|---|
| Approved artwork source | `public/assets/aistudio/file_00000000445881f587bb682b9f8ef1bb_a38986d0.png` on PR #404 | Owner-approved two-gladiator artwork, 1536×1536 |
| Android legacy launcher icons | `mipmap-{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` and `ic_launcher_round.png` | Generator retains the complete source composition for these square/round outputs |
| Android adaptive launcher icons | `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` | Reference density-specific foreground and background resources |
| Adaptive foreground/background | `scripts/generateIconAssets.cjs`; generated `ic_launcher_foreground.png` and `ic_launcher_background.png` | Candidate foreground uses a 4% edge crop and a centered 46%-canvas square; its diagonal fits within the central ~66%-diameter circular safe zone |
| Web/PWA raster icons | `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Generator preserves the full source composition for square icons and uses a separate 80% maskable composition |
| Play Store listing icon | `public/icons/icon-512.png` | Generated square source asset; upload to Play Console separately after final asset review |
| Splash screens | Android `drawable-*` resources and web title artwork | Separate from launcher-icon generation |

### Safe icon replacement status and verification

The scoped implementation is in [PR #404](https://github.com/mindoblivion/Sand-N-Steel/pull/404):

1. The approved original 1536×1536 artwork is retained as the generator source; it is not overwritten by a crop.
2. The generator creates all Android legacy density resources, adaptive foreground/background resources, and PWA icon outputs.
3. Only the adaptive foreground receives the 4% decorative-edge crop and centered 46%-canvas square. Its square diagonal is constrained to the Android central circular safe zone; full artwork remains available in legacy and store/PWA square outputs.
4. Regression coverage checks the safe-zone geometry, crop constant, Android manifest resource references, density assets, and PWA icon paths.
5. Both the Main quality gate and Environment gate passed for PR #404's current head.

**Still outstanding:** the merged icon implementation has not yet been verified in an installed APK, and the adaptive crop/title legibility have not been visually checked on a Samsung launcher. The Play Store listing upload is a separate Play Console action. Do not report the icon as device-verified until that check is recorded.

### Store listing assets

`store/play/` holds the Play Console uploads and their specs — see its README.

- **Feature graphic**: `store/play/feature-graphic-1024x500.png` (1024×500, 24-bit PNG, no alpha),
  derived from the supplied 1488×720 artwork by a 7 px-per-side trim and a scale.
- **App icon**: `public/icons/icon-512.png` (512×512, opaque).
- **Phone screenshots**: still missing. The two supplied captures are 1080×2340 (2.17:1, over
  Play's 2:1 limit); one of them also shows hosted-editor development UI. They need a retake in the
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
  service still has no JDK, and nothing in `docker-compose.dev.yml` builds Android.
- **Physical-device rehearsal verified (Samsung, 2026-11-03):** the owner installed the workflow-generated rehearsal APK, launched Sand & Steel, walked around the Roman city, and reported that the game looked good, played well, and had no crashes or freezes during the smoke test. The owner also reported substantially better playability than the earlier hosted-editor preview. This is a successful initial install/launch/gameplay smoke test, **not** exhaustive acceptance: save persistence/restore, arena entry, orientation edge cases, app lifecycle, offline behavior, long sessions, frame-rate measurements, and other Android models remain unverified. The rehearsal APK is signed with a rehearsal-only certificate and must never be uploaded to Play Console.

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
