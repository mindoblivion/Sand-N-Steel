// @ts-ignore — bun:test is available at runtime via bun test (repo convention)
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { applyRearNeutral, getExteriorMeshes, probeRear, surfaceSignature } from './colosseumRearMaterials';
import { DAY_LIGHT } from '../../utils/cityLightProfile';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const main = source('../../main.tsx');
const view = source('./ColosseumRearDiagnostic.tsx');
const city = source('../3d/city/CityHubScene.tsx');

function fixture() {
  const root = new THREE.Group();
  root.position.set(0, 0, -25);
  const material = new THREE.MeshStandardMaterial({ color: '#3d352a', side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 5, 36, 1, true), material);
  ring.position.y = 12;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(17.8, 16.8, 2.5, 32, 1, true), material);
  bowl.position.y = 5;
  const bay = new THREE.Group();
  const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4.85, 1.3), material);
  jamb.position.set(4, 4.9, -18);
  bay.add(jamb);
  const portal = new THREE.Group();
  portal.position.z = 15.2;
  const front = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 3), material);
  portal.add(front);
  root.add(ring, bowl, bay, portal);
  return { root, ring, bowl, jamb, front, material };
}

describe('C-8.69D reversible material comparison', () => {
  test('selects exterior, excludes bowl and portal even when material is shared', () => {
    const { root, ring, bowl, jamb, front } = fixture();
    expect(getExteriorMeshes(root)).toEqual([ring, jamb]);
    expect(getExteriorMeshes(root)).not.toContain(bowl);
    expect(getExteriorMeshes(root)).not.toContain(front);
  });

  test('B leaves every buffer, triangle, transform and original resource untouched', () => {
    const { root, ring, bowl, jamb, front, material } = fixture();
    const signature = surfaceSignature(root);
    const geometry = ring.geometry;
    const groups = JSON.stringify(geometry.groups);
    const original = material.toJSON();
    const undo = applyRearNeutral(root);
    expect(surfaceSignature(root)).toBe(signature);
    expect(ring.geometry).not.toBe(geometry);
    expect(Array.from(ring.geometry.getAttribute('position').array)).toEqual(Array.from(geometry.getAttribute('position').array));
    expect(Array.from(ring.geometry.index!.array)).toEqual(Array.from(geometry.index!.array));
    expect(JSON.stringify(geometry.groups)).toBe(groups);
    expect(material.toJSON()).toEqual(original);
    expect(bowl.material).toBe(material);
    expect(front.material).toBe(material);
    expect(root.children.length).toBe(4);
    expect(Array.isArray(jamb.material)).toBe(true);
    undo();
    expect(ring.geometry).toBe(geometry);
    expect(ring.material).toBe(material);
    expect(jamb.material).toBe(material);
    expect(surfaceSignature(root)).toBe(signature);
  });

  test('only rear ring triangles receive unlit material; every index drawn once', () => {
    const { root, ring, material } = fixture();
    const undo = applyRearNeutral(root);
    const materials = (ring as THREE.Mesh).material as THREE.Material[];
    expect(materials[0]).toBe(material);
    const neutral = materials[1] as THREE.MeshBasicMaterial;
    expect(neutral.isMeshBasicMaterial).toBe(true);
    expect(neutral.side).toBe(material.side);
    expect(neutral.depthTest).toBe(material.depthTest);
    expect(neutral.depthWrite).toBe(material.depthWrite);
    expect(neutral.fog).toBe(false);
    expect(neutral.toneMapped).toBe(false);
    const geometry = ring.geometry;
    const positions = geometry.getAttribute('position');
    const index = geometry.index!;
    let consumed = 0;
    const assigned = new Set<number>();
    for (const group of geometry.groups) {
      expect(group.start).toBe(consumed);
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const z = [0, 1, 2].reduce((sum, j) => sum + positions.getZ(index.getX(i + j)), 0);
        expect(group.materialIndex).toBe(z < -1e-6 ? 1 : 0);
        assigned.add(group.materialIndex!);
      }
      consumed += group.count;
    }
    expect(consumed).toBe(index.count);
    expect([...assigned].sort()).toEqual([0, 1]);
    undo();
  });

  test('radial solid-liner probes are identical in A, B and restored A', () => {
    const { root } = fixture();
    const before = probeRear(root);
    expect(before.every((row) => row.bands.find((band) => band.y === 12)?.surface === 'recess liner')).toBe(true);
    const undo = applyRearNeutral(root);
    expect(probeRear(root)).toEqual(before);
    undo();
    expect(probeRear(root)).toEqual(before);
  });

  test('repeated B -> A cycles restore references and dispose only diagnostic resources', () => {
    const { root, ring } = fixture();
    const original = ring.geometry;
    let originalDisposals = 0;
    original.addEventListener('dispose', () => originalDisposals++);
    for (let i = 0; i < 3; i++) {
      const undo = applyRearNeutral(root);
      let disposed = false;
      ring.geometry.addEventListener('dispose', () => { disposed = true; });
      undo();
      expect(disposed).toBe(true);
      expect(ring.geometry).toBe(original);
    }
    expect(originalDisposals).toBe(0);
  });
});

describe('C-8.69D isolation and lighting parity', () => {
  test('both dev entries short-circuit in production, dynamically imported only', () => {
    const expression = main.match(/const useColosseumRearHarness =([\s\S]*?);/)![1];
    for (const path of ['/', '/__dev/colosseum-rear']) {
      for (const query of ['', '?devHarness=colosseum-rear']) {
        const run = (dev: boolean) => Function('window', `return (${expression.replace('import.meta.env.DEV', String(dev))})`)({ location: { pathname: path, search: query } });
        expect(run(false)).toBe(false);
        expect(run(true)).toBe(path.includes('__dev') || query.includes('colosseum-rear'));
      }
    }
    expect(main.match(/import\('\.\/components\/dev\/ColosseumRearDiagnostic'\)/g)?.length).toBe(1);
    expect(main).not.toMatch(/^import .*ColosseumRearDiagnostic/m);
    expect(view).toContain('if (!import.meta.env.DEV) return null;');
  });

  test('viewer has no storage, player, collision or progression dependencies', () => {
    const helper = source('./colosseumRearMaterials.ts');
    for (const code of [view, helper]) {
      expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|saveProfile|loadSavedProfile|cityCollisions|collisionShapes|racingProgression/);
    }
    expect(view.match(/<GrandColosseum\s*\/>/g)?.length).toBe(1);
    expect(view).not.toContain('CityHubScene');
  });

  test('normal light rig copies all production parameters, including environment and shadows', () => {
    const rig = view.slice(view.indexOf('function ProductionLighting'), view.indexOf('function RearScene'));
    const tags = ['Lightformer', 'fog', 'Sky', 'hemisphereLight', 'directionalLight', 'Environment'];
    // The city now spells this rig as the named day profile (`utils/cityLightProfile`), so
    // parity is compared by VALUE, not by spelling: every attribute of every tag is
    // evaluated with `lights` bound to the day rig exactly as the scene resolves it, and
    // the two lists must match — shorthands included, so nothing is dropped from the check.
    // DAY/NIGHT T1 REBASE: the city's `<Environment>` intensity is now selected by
    // `isOathRig` (the `cityLightProfile` rig the oath beat draws) against the phase
    // row's own value. This diagnostic copies the `lights` RIG, so the selector is
    // bound to that branch and the row is bound to the day rig — the comparison is
    // still by VALUE, and the phase rig (a dome + row values) is not what this
    // diagnostic models. Nothing was relaxed: every attribute is still evaluated.
    const props = (source: string, tag: string) =>
      [...source.matchAll(new RegExp(`<${tag}\\s([^>]*?)(?:/?>)`, 'g'))]
        .map((m) =>
          m[1]
            .replace(/([A-Za-z][\w-]*)=(\{[^}]*\}|"[^"]*")/g, (_all, name, raw) => {
              const value = raw.startsWith('{')
                ? Function('lights', 'isOathRig', 'cityPhaseLight', `return (${raw.slice(1, -1)});`)(
                    DAY_LIGHT,
                    true,
                    DAY_LIGHT,
                  )
                : raw.slice(1, -1);
              return `${name}=${JSON.stringify(value)}`;
            })
            .replace(/\s/g, '')
            .replace(/\/$/, ''),
        )
        .sort();
    for (const tag of tags) {
      expect({ tag, rig: props(rig, tag) }).toEqual({ tag, rig: props(city, tag) });
    }
  });

  test('mode does not drive camera changes, fill exists only in C', () => {
    const cameraEffect = view.slice(view.indexOf('// Neither camera'), view.indexOf('  useLayoutEffect(() => {\n    const root'));
    expect(cameraEffect.replace(/\/\/[^\n]*/g, '')).not.toMatch(/\bmode\b/);
    expect(view).toContain("mode === 'C' && <directionalLight");
    expect(view).toContain("mode === 'B' ? applyRearNeutral(root) : undefined");
    expect(view).toContain('return () => undo?.();');
  });
});
