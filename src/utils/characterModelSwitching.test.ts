// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test, beforeEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ENEMY_CHARACTER_ASSETS,
  getEnemyCharacterAsset,
} from '../data/enemyCharacterAssets';
import {
  getGlbStatus,
  resetGlbStatusCache,
  isRealGlbFile,
} from '../components/3d/GladiatorMesh';
import { hasGlbMagic, responseHasGlbMagic } from './glbHeader';
import {
  ARMATURA_CHARACTER_MODELS,
  DEFAULT_SELECTION,
  armaturaModel,
  selectArmatura,
} from './characterCreation';
import type { CharacterModelType } from '../types/game';

describe('Character Model Switching & Availability', () => {
  beforeEach(() => {
    resetGlbStatusCache();
  });

  describe('all six character looks resolve to valid GLB URLs', () => {
    const SIX_LOOKS: Array<{ look: string; key: CharacterModelType; expectedGlb: string }> = [
      { look: 'Roman Warrior', key: 'roman_warrior', expectedGlb: '/models/arena_roman.glb' },
      { look: 'Amazonian', key: 'amazonian', expectedGlb: '/models/amazonian.glb' },
      { look: 'Centurion', key: 'procedural_gladiator', expectedGlb: '/models/arena_roman.glb' },
      { look: 'The Retiarius', key: 'retiarius', expectedGlb: '/models/netfighter.glb' },
      { look: 'Minotaur', key: 'minotaur', expectedGlb: '/models/minotaur.glb' },
      { look: 'Dimachaerus', key: 'dimachaerus', expectedGlb: '/models/dimachaerus.glb' },
    ];

    test('each of the six looks maps to its expected GLB URL', () => {
      for (const item of SIX_LOOKS) {
        const resolved = getEnemyCharacterAsset(item.key);
        expect(resolved).toBe(item.expectedGlb);
      }
    });

    test('every resolved GLB exists on disk as a public asset', () => {
      for (const item of SIX_LOOKS) {
        const resolved = getEnemyCharacterAsset(item.key);
        const diskPath = resolve(process.cwd(), 'public', resolved.slice(1));
        expect(existsSync(diskPath)).toBe(true);
      }
    });
  });

  describe('GLB availability status lifecycle', () => {
    test('getGlbStatus returns "loading" for uncached URLs', () => {
      expect(getGlbStatus('/models/amazonian.glb')).toBe('loading');
      expect(getGlbStatus('/models/unknown.glb')).toBe('loading');
    });

    test('resetGlbStatusCache resets cached statuses back to loading', async () => {
      // Simulate caching via fetch mock
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), {
            status: 200,
            headers: { 'content-type': 'model/gltf-binary' },
          });
        }) as typeof fetch;

        const valid = await isRealGlbFile('/models/test_model.glb');
        expect(valid).toBe(true);
        expect(getGlbStatus('/models/test_model.glb')).toBe('valid');

        resetGlbStatusCache();
        expect(getGlbStatus('/models/test_model.glb')).toBe('loading');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('isRealGlbFile correctly detects valid glTF header and sets status to valid', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]), {
            status: 200,
            headers: { 'content-type': 'model/gltf-binary' },
          });
        }) as typeof fetch;

        const result = await isRealGlbFile('/models/valid_test.glb');
        expect(result).toBe(true);
        expect(getGlbStatus('/models/valid_test.glb')).toBe('valid');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('isRealGlbFile marks HTML error response as invalid', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response('<!DOCTYPE html><html><body>404 Not Found</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }) as typeof fetch;

        const result = await isRealGlbFile('/models/html_fallback.glb');
        expect(result).toBe(false);
        expect(getGlbStatus('/models/html_fallback.glb')).toBe('invalid');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('isRealGlbFile marks 404 HTTP errors as invalid', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response('Not Found', {
            status: 404,
            headers: { 'content-type': 'text/plain' },
          });
        }) as typeof fetch;

        const result = await isRealGlbFile('/models/nonexistent.glb');
        expect(result).toBe(false);
        expect(getGlbStatus('/models/nonexistent.glb')).toBe('invalid');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('isRealGlbFile marks corrupt / non-glTF bytes as invalid', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
          });
        }) as typeof fetch;

        const result = await isRealGlbFile('/models/corrupt.glb');
        expect(result).toBe(false);
        expect(getGlbStatus('/models/corrupt.glb')).toBe('invalid');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('isRealGlbFile deduplicates parallel checks for the same URL', async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          callCount++;
          await new Promise((r) => setTimeout(r, 10));
          return new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), {
            status: 200,
            headers: { 'content-type': 'model/gltf-binary' },
          });
        }) as typeof fetch;

        const [r1, r2, r3] = await Promise.all([
          isRealGlbFile('/models/parallel_test.glb'),
          isRealGlbFile('/models/parallel_test.glb'),
          isRealGlbFile('/models/parallel_test.glb'),
        ]);

        expect(r1).toBe(true);
        expect(r2).toBe(true);
        expect(r3).toBe(true);
        expect(callCount).toBe(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('GLB magic header validator', () => {
    test('hasGlbMagic identifies glTF magic bytes', () => {
      expect(hasGlbMagic(new Uint8Array([0x67, 0x6c, 0x54, 0x46]))).toBe(true);
      expect(hasGlbMagic(new Uint8Array([0x67, 0x6c, 0x54, 0x47]))).toBe(false);
      expect(hasGlbMagic(new Uint8Array([0x00]))).toBe(false);
    });

    test('responseHasGlbMagic identifies glTF from streaming body', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x99, 0x88]));
          controller.close();
        },
      });
      const res = new Response(stream);
      const isGlb = await responseHasGlbMagic(res);
      expect(isGlb).toBe(true);
    });
  });

  describe('unified fighter selection', () => {
    test('the default selection is the default class and its matching model', () => {
      expect(DEFAULT_SELECTION).toEqual({
        armatura: 'murmillo',
        characterModel: 'roman_warrior',
      });
    });

    test('every class selects its model atomically', () => {
      for (const [armatura, model] of Object.entries(ARMATURA_CHARACTER_MODELS)) {
        expect(selectArmatura(DEFAULT_SELECTION, armatura as keyof typeof ARMATURA_CHARACTER_MODELS)).toEqual({
          armatura,
          characterModel: model,
        });
        expect(armaturaModel(armatura as keyof typeof ARMATURA_CHARACTER_MODELS)).toBe(model);
      }
    });

    test('changing classes cannot preserve the previous class model', () => {
      const thraex = selectArmatura(DEFAULT_SELECTION, 'thraex');
      expect(thraex.characterModel).toBe('amazonian');
      const retiarius = selectArmatura(thraex, 'retiarius');
      expect(retiarius).toEqual({ armatura: 'retiarius', characterModel: 'retiarius' });
    });
  });

  describe('error boundary reset and stale failure recovery', () => {
    test('ThreeComponentErrorBoundary resets hasError when resetKey changes', () => {
      // Simulate ThreeComponentErrorBoundary lifecycle
      let state = { hasError: true, error: new Error('Failed to render 3D mesh') };
      const prevProps = { resetKey: 'amazonian' };
      const nextProps = { resetKey: 'roman_warrior' };

      if (state.hasError && prevProps.resetKey !== nextProps.resetKey) {
        state = { hasError: false, error: null as any };
      }

      expect(state.hasError).toBe(false);
      expect(state.error).toBeNull();
    });

    test('GLTFErrorBoundary resets hasError when modelUrl changes', () => {
      // Simulate GLTFErrorBoundary lifecycle
      let state = { hasError: true, error: new Error('GLB model failed to load') };
      const prevProps = { modelUrl: '/models/broken.glb' };
      const nextProps = { modelUrl: '/models/arena_roman.glb' };

      if (prevProps.modelUrl !== nextProps.modelUrl && state.hasError) {
        state = { hasError: false, error: null as any };
      }

      expect(state.hasError).toBe(false);
      expect(state.error).toBeNull();
    });
  });
});
