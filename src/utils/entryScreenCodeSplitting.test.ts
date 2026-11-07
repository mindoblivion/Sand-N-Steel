// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const title = readFileSync('src/components/hub/TitleScreen.tsx', 'utf8');

describe('deferred title and Ludus screens', () => {
  test('the Ludus hub is not part of the initial App import graph', () => {
    expect(app).toContain("const GladiatorSchoolHub = React.lazy(() => import('./components/hub/GladiatorSchoolHub').then((module) => ({ default: module.GladiatorSchoolHub })));");
    expect(app).not.toContain("import { GladiatorSchoolHub } from './components/hub/GladiatorSchoolHub';");
    expect(app).toContain('<React.Suspense fallback={<WaitSurface destination="school_hub" />}>');
  });

  test('the title account panel loads only after the account control is opened', () => {
    expect(title).toContain("const TitleAccountPanel = React.lazy(() => import('./TitleAccountPanel').then((module) => ({ default: module.TitleAccountPanel })));");
    expect(title).not.toContain("import { TitleAccountPanel } from './TitleAccountPanel';");
    expect(title).toContain('{isAccountOpen && (');
    expect(title).toContain('<React.Suspense fallback={null}>');
  });
  test('secondary identity providers and Drive restore are deferred until invoked', () => {
    expect(app).not.toContain("import { facebookSignIn } from './services/facebookAuth';");
    expect(app).not.toContain("import { appleSignIn } from './services/appleAuth';");
    expect(app).not.toContain("import { microsoftSignIn } from './services/microsoftAuth';");
    expect(app).not.toContain("import { listDriveSaves, loadProfileFromDrive } from './services/googleDrive';");
    expect(app).toContain("await (await import('./services/facebookAuth')).facebookSignIn();");
    expect(app).toContain("await (await import('./services/appleAuth')).appleSignIn();");
    expect(app).toContain("await (await import('./services/microsoftAuth')).microsoftSignIn();");
    expect(app).toContain("const { listDriveSaves, loadProfileFromDrive } = await import('./services/googleDrive');");
    // Google auth remains eagerly available for Firebase session observation and Drive token state.
    expect(app).toContain("import { googleSignIn, subscribeAuthUser } from './services/googleAuth';");
  });

});
