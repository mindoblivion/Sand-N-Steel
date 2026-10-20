/**
 * The champion's pole at the Colosseum gate.
 *
 * Raised once the road stands at Champion: the same banner the ludus row carries, grown
 * to a real pole beside the monumental entrance.  The device, the field and the boss
 * stripes come from `src/utils/heraldry.ts`, painted onto one canvas texture — four
 * meshes and a single 192x288 texture, so the gate costs the same as a prop.
 *
 * It renders nothing on its own judgement: `resolveBanner(profile)?.atGate` decides,
 * and this component just draws what it is handed.
 */
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BANNER_STRIPE_COLOR, type BannerDeviceSpec } from '../../../utils/heraldry';

const BANNER_W = 1.5;
const BANNER_H = 2.2;
const POLE_H = 5.8;
/** Just outside the portal's 5.2-unit passage, clear of the piers. */
const POLE_POSITION: [number, number, number] = [3.4, 0, -4.9];

const TEXTURE_W = 192;
const TEXTURE_H = 288;

/** Paint the banner once into a canvas: field, device, then one stripe per boss kill. */
function paintBanner(device: BannerDeviceSpec, stripes: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_W;
  canvas.height = TEXTURE_H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = device.primary;
  ctx.fillRect(0, 0, TEXTURE_W, TEXTURE_H);

  // The device, centred on the field's upper two-thirds (its path is a 100x100 box).
  const scale = (TEXTURE_W * 0.74) / 100;
  ctx.save();
  ctx.translate(TEXTURE_W * 0.13, TEXTURE_H * 0.05);
  ctx.scale(scale, scale);
  ctx.fillStyle = device.ink;
  ctx.fill(new Path2D(device.path));
  ctx.restore();

  // One dark stripe per boss kill, stacked up from the fly end.
  const stripeHeight = 7;
  const gap = 4;
  for (let stripe = 0; stripe < stripes; stripe += 1) {
    ctx.fillStyle = BANNER_STRIPE_COLOR;
    ctx.fillRect(
      TEXTURE_W * 0.06,
      TEXTURE_H - 8 - (stripe + 1) * (stripeHeight + gap),
      TEXTURE_W * 0.88,
      stripeHeight
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

export interface ChampionBannerPoleProps {
  device: BannerDeviceSpec;
  stripes: number;
  position?: [number, number, number];
}

export const ChampionBannerPole = React.memo(
  ({ device, stripes, position = POLE_POSITION }: ChampionBannerPoleProps) => {
    const texture = useMemo(() => paintBanner(device, stripes), [device, stripes]);

    useEffect(() => () => texture?.dispose(), [texture]);

    return (
      <group position={position}>
        <mesh position={[0, POLE_H / 2, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.075, POLE_H, 8]} />
          <meshStandardMaterial color="#442e1d" roughness={0.8} metalness={0.05} />
        </mesh>

        <mesh position={[0, POLE_H + 0.1, 0]}>
          <coneGeometry args={[0.09, 0.22, 8]} />
          <meshStandardMaterial color="#b89547" metalness={0.7} roughness={0.35} />
        </mesh>

        <mesh position={[BANNER_W / 2 + 0.08, POLE_H - 0.9, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.03, 0.03, BANNER_W + 0.16, 6]} />
          <meshStandardMaterial color="#442e1d" roughness={0.8} metalness={0.05} />
        </mesh>

        <mesh position={[BANNER_W / 2 + 0.1, POLE_H - 0.9 - BANNER_H / 2, 0.02]}>
          <planeGeometry args={[BANNER_W, BANNER_H]} />
          <meshStandardMaterial
            map={texture ?? undefined}
            roughness={0.85}
            metalness={0.02}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }
);

ChampionBannerPole.displayName = 'ChampionBannerPole';
