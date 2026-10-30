import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell configuration for Sand & Steel.
 *
 * appId is the Google Play package name and is PERMANENT once the first build is
 * uploaded to the Play Console — changing it later creates a brand-new listing and
 * orphans every existing install. Do not edit it; `docs/ANDROID_RELEASE.md` records
 * the same value for humans.
 *
 * The native project in `android/` ships the contents of `dist/`, so a build is
 * always: `bun run cap:sync` -> build the AAB from `android/`.
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
