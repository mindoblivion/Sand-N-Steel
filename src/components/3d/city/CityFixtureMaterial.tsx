import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { registerCityFixture, type CityFixtureClass } from '../../../utils/cityFixtureGlow';

/**
 * CityFixtureMaterial — Day/Night T3: the ONE material a city fixture class draws
 * with, driven from the phase row's `lampGlow` (see `utils/cityFixtureGlow.ts`).
 *
 * It replaces the inline `<meshStandardMaterial … emissiveIntensity={N} />`
 * literals that used to sit inside each building. The mesh keeps this material
 * (no clone, no extra mesh), so the draw-call count is unchanged; the only thing
 * the phase moves is `emissiveIntensity`.
 *
 * `base` is the intensity the fixture was AUTHORED with — the night value, since
 * `lampGlow` is 1 at night. Registration writes the current hour's intensity in a
 * layout effect, i.e. before the first frame is painted.
 */
export const CityFixtureMaterial: React.FC<{
  fixture: CityFixtureClass;
  base: number;
  color: string;
  emissive: string;
  roughness?: number;
  metalness?: number;
}> = ({ fixture, base, color, emissive, roughness, metalness }) => {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useLayoutEffect(() => {
    const material = materialRef.current;
    if (!material) return undefined;
    return registerCityFixture(fixture, material, base);
  }, [fixture, base]);

  // Only the props the caller named are handed to three, so a fixture keeps
  // exactly the surface it had before this slice.
  const props: React.ComponentProps<'meshStandardMaterial'> = {
    color,
    emissive,
    emissiveIntensity: base,
  };
  if (roughness !== undefined) props.roughness = roughness;
  if (metalness !== undefined) props.metalness = metalness;

  return <meshStandardMaterial ref={materialRef} {...props} />;
};
