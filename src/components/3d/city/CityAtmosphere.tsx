import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import {
  applyAtmosphere,
  clearAtmosphere,
  ATMOSPHERE_PROFILES,
  type AtmosphereProfileName,
} from '../../../utils/atmosphere';
import { BRIGHTNESS_EXPOSURE } from '../../../services/settings';
import { useSettings } from '../../../hooks/useSettings';

/**
 * CityAtmosphere — Atmosphere A1's single mount point in the CITY scene.
 *
 * The profile is applied from ONE place: `applyAtmosphere(scene, profile, gl)` builds
 * the gradient sky dome, sets the dust fog, adds the one shadow-casting sun and the
 * hemisphere bounce, and writes the renderer's colour space / tone-mapping curve /
 * exposure (`utils/atmosphere.ts`). A profile change — the Lighting setting — re-runs
 * that one call, which clears the previous rig first, so the swap is live and leaves
 * no second sky behind. It renders nothing itself.
 *
 * Brightness: the profile's exposure is the BASELINE and the existing Brightness row
 * scales it, so at the default Standard the city sits at exactly the profile's 1.10
 * (`getBrightnessExposure` answers 1.0 there). This effect runs after
 * `SceneBrightness`'s own listener, so the composed value is the one that holds.
 */
export const CityAtmosphere: React.FC<{ profile: AtmosphereProfileName }> = ({ profile }) => {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const { brightness } = useSettings();

  useEffect(() => {
    applyAtmosphere(scene, profile, gl);
    return () => clearAtmosphere(scene);
  }, [scene, gl, profile]);

  useEffect(() => {
    gl.toneMappingExposure = ATMOSPHERE_PROFILES[profile].exposure * BRIGHTNESS_EXPOSURE[brightness];
  }, [gl, profile, brightness]);

  return null;
};
