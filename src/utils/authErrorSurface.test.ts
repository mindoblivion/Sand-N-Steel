/**
 * Authentication error surface regressions.
 *
 * Pins the App-to-screen wiring for provider sign-in failures: each async
 * provider clears stale feedback, reports a failure, and releases its loading
 * state; both screens render supplied feedback accessibly.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const titleScreen = readFileSync('src/components/hub/TitleScreen.tsx', 'utf8');
const titleAccountPanel = readFileSync('src/components/hub/TitleAccountPanel.tsx', 'utf8');
const characterCreation = readFileSync('src/components/hub/CharacterCreation.tsx', 'utf8');

function handlerBetween(start: string, end: string): string {
  const from = app.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = app.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return app.slice(from, to);
}

describe('authentication failure feedback', () => {
  test('each async provider clears stale feedback, reports failures, and releases loading state', () => {
    const providers = [
      { start: 'const handleGoogleSignIn = async () => {', end: 'const handleFacebookSignIn', loading: 'setIsGoogleLoading(false)' },
      { start: 'const handleFacebookSignIn = async () => {', end: 'const handleAppleSignIn', loading: 'setIsFacebookLoading(false)' },
      { start: 'const handleAppleSignIn = async () => {', end: 'const handleMicrosoftSignIn', loading: 'setIsAppleLoading(false)' },
      { start: 'const handleMicrosoftSignIn = async () => {', end: 'const handleEmailSignIn', loading: 'setIsMicrosoftLoading(false)' },
    ];

    for (const provider of providers) {
      const handler = handlerBetween(provider.start, provider.end);
      expect(handler).toContain('setAuthError(null)');
      expect(handler).toContain('catch (e)');
      expect(handler).toContain("setAuthError('Sign-in failed. Check your connection or account settings, then try again.')");
      expect(handler).toContain('finally');
      expect(handler).toContain(provider.loading);
    }
  });

  test('title account screen receives the shared error and renders it as an alert', () => {
    expect(app).toContain('authError={authError}');
    expect(titleScreen).toContain('authError={authError}');
    expect(titleAccountPanel).toContain('authError?: string | null');
    expect(titleAccountPanel).toContain('role="alert"');
    expect(titleAccountPanel).toContain('{authError}');
  });

  test('multiple cloud saves require an explicit selection even without a local profile', () => {
    const googleHandler = handlerBetween('const handleGoogleSignIn = async () => {', 'const handleFacebookSignIn');
    expect(googleHandler).toContain('if (profile || saves.length > 1)');
    expect(googleHandler).toContain('setShowDriveSync(true)');
    expect(googleHandler).toContain('loadProfileFromDrive(saves[0].id)');
  });

  test('character creation receives the shared error and renders it as an alert', () => {
    expect(characterCreation).toContain('authError?: string | null');
    expect(characterCreation).toContain('role="alert"');
    expect(characterCreation).toContain('{authError}');
  });
});
