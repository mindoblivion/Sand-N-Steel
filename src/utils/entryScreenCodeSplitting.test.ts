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
    // Google auth is loaded only for an explicit sign-in or when account settings open.
    expect(app).not.toContain("import { googleSignIn, subscribeAuthUser } from './services/googleAuth';");
    expect(app).toContain("await import('./services/googleAuth')");
    expect(app).toContain("import('./services/googleAuth').then(({ subscribeAuthUser }) => {");
    expect(app).toContain("if (!settingsOpen) return;");
  });

  test('the title import graph defers Drei-backed progress readers until a destination transition', () => {
    const waitSurface = readFileSync('src/components/ui/WaitSurface.tsx', 'utf8');
    const waitProgress = readFileSync('src/components/ui/WaitSurfaceProgress.tsx', 'utf8');
    const overlayShell = readFileSync('src/components/ui/AssetLoadingOverlay.tsx', 'utf8');
    const overlayContent = readFileSync('src/components/ui/AssetLoadingOverlayContent.tsx', 'utf8');
    expect(app).toContain("import { WaitSurface } from './components/ui/WaitSurface';");
    expect(app).toContain("import { AssetLoadingOverlay } from './components/ui/AssetLoadingOverlay';");
    expect(app).toContain("{currentScreen !== 'title' && <AssetLoadingOverlay />}");
    expect(waitSurface).toContain("import('./WaitSurfaceProgress')");
    expect(waitSurface).not.toContain('useProgress');
    expect(overlayShell).toContain("import('./AssetLoadingOverlayContent')");
    expect(overlayShell).not.toContain('useProgress');
    expect(waitProgress).toContain("from '@react-three/drei/core/Progress'");
    expect(overlayContent).toContain("from '@react-three/drei/core/Progress'");
  });

  test('startup settings use Three-free atmosphere data instead of the renderer module', () => {
    const settings = readFileSync('src/services/settings.ts', 'utf8');
    const atmosphereData = readFileSync('src/utils/atmosphereData.ts', 'utf8');
    const atmosphereRenderer = readFileSync('src/utils/atmosphere.ts', 'utf8');
    const timeState = readFileSync('src/utils/timeState.ts', 'utf8');

    expect(settings).toContain("from '../utils/atmosphereData'");
    expect(settings).not.toContain("from '../utils/atmosphere'");
    expect(atmosphereData).not.toMatch(/from ['\"]three['\"]/);
    expect(atmosphereData).not.toContain('THREE.');
    expect(timeState).not.toMatch(/from ['\"]three['\"]/);
    expect(atmosphereRenderer).toContain("import * as THREE from 'three'");
  });

});
