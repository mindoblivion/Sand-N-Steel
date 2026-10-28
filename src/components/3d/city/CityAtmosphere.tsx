import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  PHASE_CROSSFADE_MS,
  clearAtmosphere,
  configureAtmosphereRenderer,
  createAtmosphereRig,
  getLastAppliedPhaseLight,
  getPhaseLight,
  markPhaseApplied,
  type AtmosphereRig,
  type PhaseLight,
} from '../../../utils/atmosphere';
import { BRIGHTNESS_EXPOSURE } from '../../../services/settings';
import { useSettings } from '../../../hooks/useSettings';
import type { TimePhase } from '../../../utils/timeState';

/** One in-flight entry fade: the rig, the row it came from, and when it began. */
interface PhaseFade {
  rig: AtmosphereRig;
  from: PhaseLight;
  startedAt: number;
}

/**
 * CityAtmosphere — the city's single mount point for the day's phase row.
 *
 * `createAtmosphereRig(scene, phase)` builds the gradient dome, the dust fog of the
 * row's own `fogColor`, the one shadow-casting key light (the MOON at night) and the
 * hemisphere bounce, and writes the scene's environment intensity. It renders
 * nothing itself.
 *
 * ── THE ENTRY CROSSFADE ──────────────────────────────────────────────────
 * If the last row some entry applied differs from this one — coming back to the city
 * after a race or a duel drew another hour — the whole rig starts on the PREVIOUS
 * row and is lerped to this one over `PHASE_CROSSFADE_MS`. It is visual only: one
 * module-level record (`getLastAppliedPhaseLight`), one `useFrame` that returns
 * immediately when no fade is in flight, and no React state anywhere. A light never
 * changes while the player stands in the city.
 *
 * Brightness: the row's exposure is the BASELINE and the Brightness row scales it,
 * so at the default Standard the city sits at exactly the row's own exposure. While
 * a fade is running it owns the exposure (lerped from row to row); when it ends the
 * brightness effect takes over again.
 */
export const CityAtmosphere: React.FC<{ phase: TimePhase }> = ({ phase }) => {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const { brightness } = useSettings();

  // The frame loop and the entry effect both need the latest brightness without
  // re-running on a Brightness change; a ref keeps the loop out of React state.
  const brightnessRef = useRef(brightness);
  brightnessRef.current = brightness;
  const fadeRef = useRef<PhaseFade | null>(null);

  useEffect(() => {
    const previous = getLastAppliedPhaseLight();
    clearAtmosphere(scene);
    const rig = createAtmosphereRig(scene, phase);
    markPhaseApplied(rig.profile);

    const brightnessNow = BRIGHTNESS_EXPOSURE[brightnessRef.current];
    configureAtmosphereRenderer(gl);

    if (previous && previous !== rig.profile) {
      rig.blend(previous, 0);
      fadeRef.current = { rig, from: previous, startedAt: performance.now() };
      gl.toneMappingExposure = previous.exposure * brightnessNow;
    } else {
      fadeRef.current = null;
      gl.toneMappingExposure = rig.profile.exposure * brightnessNow;
    }

    return () => {
      fadeRef.current = null;
      clearAtmosphere(scene);
    };
  }, [scene, gl, phase]);

  // The Brightness row, live — but only when no fade owns the exposure.
  useEffect(() => {
    if (fadeRef.current) return;
    gl.toneMappingExposure = getPhaseLight(phase).exposure * BRIGHTNESS_EXPOSURE[brightness];
  }, [gl, phase, brightness]);

  // The crossfade: bounded work, and NOTHING once it has completed.
  useFrame(() => {
    const fade = fadeRef.current;
    if (!fade) return;
    const progress = Math.min(1, (performance.now() - fade.startedAt) / PHASE_CROSSFADE_MS);
    fade.rig.blend(fade.from, progress);
    gl.toneMappingExposure =
      (fade.from.exposure + (fade.rig.profile.exposure - fade.from.exposure) * progress) *
      BRIGHTNESS_EXPOSURE[brightnessRef.current];
    if (progress >= 1) fadeRef.current = null;
  });

  return null;
};
