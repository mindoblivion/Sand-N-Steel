# Android race-profiler rehearsal

This is a separate, manually dispatched development build for measuring the Circus race on a physical Android device. It is **not** a release candidate and must never be uploaded to Google Play.

## Build it

1. Open **Actions → Build Android race-profiler APK**.
2. Select **Run workflow** on the desired branch (normally `main`).
3. Wait for tests, TypeScript, development web build, Capacitor sync, Gradle debug packaging, and APK verification to pass.
4. Download the artifact `sand-and-steel-race-profiler-debug-apk`.

The workflow has no signing-secret references. Android signs the debug APK with the standard debug key. Its application ID is `com.phatass.sandandsteel.profiler`, so it installs alongside the normal Sand & Steel app rather than replacing its local save.

## Capture race measurements

1. Install the profiler APK on the Samsung device and launch it.
2. Connect the device to a computer with USB debugging enabled.
3. Open Chrome on the computer at `chrome://inspect/#devices`, find the Sand & Steel profiler WebView, and choose **Inspect**.
4. Enter the Circus race. The profiler is compiled into this development APK and enabled by `VITE_DEV_RACE_STATS=1`.
5. In DevTools Console, collect repeated `[RaceRenderDiagnostics]` entries during a steady race segment and during the busiest part of the race.

Each two-second sample reports FPS, average and P95 frame time, average and peak draw calls, average triangles, pixel ratio, drawing-buffer dimensions, and renderer geometry/texture counts.

For a useful comparison, capture at least three steady-state samples in the same race scene, camera view, device orientation, and graphics-quality setting. Record the device model, Android version, APK commit SHA, race segment, and quality setting alongside the logs. Do not infer FPS from visual smoothness.

## Safety and limitations

- The profiler component mounts only when `import.meta.env.DEV` is true and the diagnostics flag is set. Production builds retain neither the diagnostics mount nor its development bundle.
- This workflow builds only the debug variant and verifies the isolated `.profiler` application ID.
- It does not alter the release/rehearsal workflow, production signing, save schema, race simulation, or graphics-quality settings.
- The APK's debug signing identity is not a Play Store signing identity.
- A successful CI build proves packaging and the expected app ID, not that a Samsung device has been tested or that the profiler has captured measurements.
