import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell configuration for Sand & Steel — one config, two platforms: the
 * Android project in `android/` and the iOS project in `ios/`.
 *
 * appId is the Google Play package name and is PERMANENT once the first build is
 * uploaded to the Play Console — changing it later creates a brand-new listing and
 * orphans every existing install. Do not edit it; `docs/ANDROID_RELEASE.md` records
 * the same value for humans.
 *
 * Both native projects ship the contents of `dist/`, so a build is always the same
 * shape: sync first, then build with the platform's own toolchain.
 *   Android: `bun run cap:sync`      -> build the AAB from `android/` (docs/ANDROID_RELEASE.md)
 *   iOS:     `bun run cap:sync:ios`  -> build in Xcode from `ios/` (docs/PLATFORMS.md, needs macOS)
 */
const config: CapacitorConfig = {
  appId: 'com.phatass.sandandsteel',
  appName: 'Sand & Steel',
  webDir: 'dist',
  android: {
    // The game ships its own assets, so nothing needs to be loaded over plain HTTP.
    allowMixedContent: false,
    // Matches the PWA manifest background and the boot shell, so the WebView never
    // flashes white between the native splash and the title screen.
    backgroundColor: '#0c0a09',
  },
};

export default config;
