import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSkyDome, getPhaseLight, markPhaseApplied } from '../../utils/atmosphere';
import type { TimePhase } from '../../utils/timeState';

/**
 * PhaseSkyDome — the city's gradient sky reused in the DUEL and the RACE.
 *
 * Both scenes used drei's Preetham `<Sky>`; T1 replaces it with this one mesh built
 * by `utils/atmosphere.ts`'s own `createSkyDome`, so the two scenes paint the row's
 * gradient, its procedural stars and its key light's disc (the MOON at night) through
 * the SAME term the city does. The swap is draw-call neutral: one mesh out, one mesh in.
 *
 * drei's Sky cannot render a night state — it has no star term and its Preetham model
 * has no moon disc — which is why the fallback the brief allows is the one taken here
 * for every phase, by day as well as by night: one sky, one shader, three scenes.
 *
 * It renders nothing itself and owns exactly one object (freed on unmount).
 */
export const PhaseSkyDome: React.FC<{ phase: TimePhase | string }> = ({ phase }) => {
  const scene = useThree((state) => state.scene);
  const profile = getPhaseLight(phase);

  useEffect(() => {
    const dome = createSkyDome(profile);
    scene.add(dome);
    markPhaseApplied(profile);
    return () => {
      scene.remove(dome);
      dome.geometry.dispose();
      (dome.material as THREE.Material).dispose();
    };
  }, [scene, profile]);

  return null;
};
