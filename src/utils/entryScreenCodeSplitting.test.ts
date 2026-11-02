// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const title = readFileSync('src/components/hub/TitleScreen.tsx', 'utf8');

describe('deferred title and Ludus screens', () => {
  test('the Ludus hub is not part of the initial App import graph', () => {
    expect(app).toContain("const GladiatorSchoolHub = React.lazy(() => import('./components/hub/GladiatorSchoolHub').then((module) => ({ default: module.GladiatorSchoolHub })));");
    expect(app).not.toContain("import { GladiatorSchoolHub } from './components/hub/GladiatorSchoolHub';");
    expect(app).toContain('<React.Suspense fallback={<div className="w-full h-full min-h-[100dvh] bg-neutral-950" aria-busy="true" />}>');
  });

  test('the title account panel loads only after the account control is opened', () => {
    expect(title).toContain("const TitleAccountPanel = React.lazy(() => import('./TitleAccountPanel').then((module) => ({ default: module.TitleAccountPanel })));");
    expect(title).not.toContain("import { TitleAccountPanel } from './TitleAccountPanel';");
    expect(title).toContain('{isAccountOpen && (');
    expect(title).toContain('<React.Suspense fallback={null}>');
  });
});
