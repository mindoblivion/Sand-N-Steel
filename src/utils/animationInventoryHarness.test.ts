// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const main = readFileSync(here('../main.tsx'), 'utf8');
const harness = readFileSync(here('../components/dev/AnimationInventoryHarness.tsx'), 'utf8');

describe('Roman animation inventory harness — development isolation and read-only scope', () => {
  test('entry point is DEV-gated and dynamically imports only for the exact animations token', () => {
    expect(main).toContain("new URLSearchParams(window.location.search).get('devHarness') === 'animations'");
    expect(main).toContain('const useAnimationInventoryHarness =');
    expect(main).toContain('import.meta.env.DEV &&');
    expect(main).toContain("void import('./components/dev/AnimationInventoryHarness')");
    expect(main).toContain('if (useAnimationInventoryHarness)');
    expect(main).not.toContain("import { AnimationInventoryHarness }");
  });

  test('reads the shipped Roman GLB metadata without entering gameplay or persistence', () => {
    expect(harness).toContain("const MODEL_URL = '/models/arena_roman.glb'");
    expect(harness).toContain('useGLTF(MODEL_URL)');
    expect(harness).toContain('gltf.animations.map');
    expect(harness).toContain('clip.duration');
    expect(harness).toContain('clip.tracks');
    for (const forbidden of [
      'DuelScene',
      'saveProfile',
      'loadSavedProfile',
      'localStorage',
      'sessionStorage',
      'PROFILE_STORAGE_KEY',
      'FighterState',
    ]) {
      expect(harness).not.toContain(forbidden);
    }
  });

  test('renders the isolated preview and plays selected clips without entering gameplay', () => {
    expect(harness).toContain('new THREE.AnimationMixer(clonedScene)');
    expect(harness).toContain('SkeletonUtils.clone(gltf.scene)');
    expect(harness).toContain('mixer.clipAction(clip)');
    expect(harness).toContain('action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce');
    expect(harness).toContain('mixer.update(Math.min(delta, 0.05))');
    expect(harness).toContain('selectedClip={selectedClip}');
    expect(harness).toContain('enablePan={false}');
    for (const forbidden of ['DuelScene', 'saveProfile', 'localStorage', 'FighterState']) {
      expect(harness).not.toContain(forbidden);
    }
  });

  test('updates playback speed without recreating or resetting the selected action', () => {
    expect(harness).toContain('activeActionRef.current?.setEffectiveTimeScale(speed)');
    expect(harness).toContain('}, [gltf.animations, loop, mixer, selectedClip]);');
    expect(harness).not.toContain('}, [gltf.animations, loop, mixer, selectedClip, speed]);');
  });

  test('reports candidate metadata but explicitly does not claim clip names prove a recovery action', () => {
    expect(harness).toContain('CANDIDATE_WORDS');
    expect(harness).toContain('trackCount');
    expect(harness).toContain('keyframeCount');
    expect(harness).toContain('clip names alone do not prove');
    expect(harness).toContain('Playback lets us inspect poses and timing');
  });
});
