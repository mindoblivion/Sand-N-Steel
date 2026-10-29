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

CI: `.github/workflows/android-release.yml` does the same on GitHub's runners and uploads
the `.aab` as a downloadable artifact. It needs four repository secrets you create yourself
(Settings → Secrets and variables → Actions):

| secret | value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | the store password |
| `ANDROID_KEY_ALIAS` | the key alias |
| `ANDROID_KEY_PASSWORD` | the key password |

On macOS/Linux: `base64 -i Sand-and-Steel.keystore | pbcopy` (or `base64 -w0` on Linux).

## Every new version

1. Raise `versionCode` by at least 1 in `android/app/build.gradle` (Play rejects a lower or
   repeated code) and update `versionName` to whatever the player should see.
2. Run `bun run cap:sync` so the web build in `android/` matches the code.
3. Build the `.aab` (locally or via the workflow) and upload it in Play Console.

## What is verified, and what is not

- Verified here: `bun run build` (including the startup-asset check) passes, `bun run
  cap:sync` copies the bundle into `android/`, and the generated project carries the
  package name above.
- **Not verified here:** the Gradle/AAB build itself. This sandbox has no JDK or Android
  SDK, so `./gradlew bundleRelease` has never run in it — the first real compile happens on
  the CI workflow or on your machine.
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
