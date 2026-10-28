import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { registerCityFixtureLight } from '../../../utils/cityFixtureLight';
import type { CityFixtureClass } from '../../../utils/cityFixtureGlow';

/**
 * CityFixtureLight — Day/Night T3-F: the one warm point light a city fixture draws
 * with, driven from the phase row's `lampGlow` (see `utils/cityFixtureLight.ts`).
 *
 * It replaces the inline `<pointLight … intensity={N} />` elements that used to sit
 * inside each building. It draws exactly ONE point light, casts no shadow before or
 * after, and adds no mesh and no draw call; the only thing the phase moves is
 * `intensity`. `base` is the intensity the light was AUTHORED with — the night value,
 * since `lampGlow` is 1 at night. Registration writes the current hour's intensity in
 * a layout effect, i.e. before the first frame is painted.
 */
export const CityFixtureLight: React.FC<{
  fixture: CityFixtureClass;
  base: number;
  color: string;
  distance: number;
  position: [number, number, number];
}> = ({ fixture, base, color, distance, position }) => {
  const lightRef = useRef<THREE.PointLight>(null);

  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return undefined;
    return registerCityFixtureLight(fixture, light, base);
  }, [fixture, base]);

  // Only the props the caller named are handed to three, so a light keeps exactly the
  // reach, colour and position it had before this slice. No shadow is ever cast.
  return <pointLight ref={lightRef} color={color} intensity={base} distance={distance} position={position} />;
};
