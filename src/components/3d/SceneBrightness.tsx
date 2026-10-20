import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { applyBrightness, getSettings, subscribeSettings } from '../../services/settings';

/**
 * SceneBrightness — the brightness row, wired to a Canvas.
 *
 * Mounted once inside every Canvas that renders a scene the player looks at
 * (the city hub, the duel arena, the circus and the creation preview).  It applies
 * the exposure on mount — i.e. at Canvas creation, before the first frame the
 * settings can affect — and again on every settings change, through the settings
 * module's own subscription.  It renders nothing and holds no state, so it adds no
 * frame work and no re-render to the scenes.
 */
export const SceneBrightness: React.FC = () => {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const apply = () => applyBrightness(gl, getSettings());
    apply();
    return subscribeSettings(apply);
  }, [gl]);

  return null;
};
