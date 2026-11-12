import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import {
  RomanGabledRoof,
  ClassicalColumn,
  ClassicalDoorway,
  ClassicalPediment,
} from './ClassicalArchitecture';
import { NOISE_TEXTURE } from './RomanMaterials';

/**
 * CITY-EXPAND-1 — The Southern District.
 * Five new buildings in the empty southern strip (Z 26→35).
 * Exteriors only. All meshes castShadow. No new lights.
 */

interface StallProps {
  position: [number, number, number];
  awningColor: string;
}

const MarketStall: React.FC<StallProps> = ({ position, awningColor }) => {
  return (
    <group position={position}>
      {/* Stall counter */}
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[2.2, 1.0, 1.4]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
      </mesh>
      {/* Awning posts */}
      {[-1, 1].map((x) => (
        <mesh key={x} castShadow position={[x, 1.5, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 2.0, 8]} />
          <meshStandardMaterial color="#6b4423" roughness={0.9} />
        </mesh>
      ))}
      {/* Striped awning */}
      <mesh castShadow position={[0, 2.6, 0]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[2.6, 0.08, 1.8]} />
        <meshStandardMaterial color={awningColor} roughness={0.7} />
      </mesh>
    </group>
  );
};

/**
 * Animated flowing water stream — a vertical cylinder with scrolling opacity
 * to simulate falling water. Cheap, mobile-friendly, no shaders.
 */
const WaterStream: React.FC<{
  position: [number, number, number];
  height: number;
  radius?: number;
}> = ({ position, height, radius = 0.08 }) => {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshStandardMaterial;
      // Animate opacity to simulate flowing water
      mat.opacity = 0.5 + 0.2 * Math.sin(state.clock.elapsedTime * 8 + position[0]);
    }
  });

  return (
    <mesh ref={ref} position={position} castShadow={false}>
      <cylinderGeometry args={[radius, radius * 1.3, height, 8]} />
      <meshStandardMaterial
        color="#7ec8e3"
        transparent
        opacity={0.6}
        roughness={0.1}
        metalness={0.1}
      />
    </mesh>
  );
};

/**
 * Arcing water jet — from the central column outward to the basin.
 * Uses a curved tube for the arc shape.
 */
const WaterArc: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
}> = ({ start, end }) => {
  const ref = useRef<THREE.Mesh>(null);

  const curve = React.useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const mid = s.clone().lerp(e, 0.5);
    mid.y += 0.8; // Arc peak
    return new THREE.QuadraticBezierCurve3(s, mid, e);
  }, [start, end]);

  useFrame((state) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.45 + 0.15 * Math.sin(state.clock.elapsedTime * 6 + start[0] * 2);
    }
  });

  return (
    <mesh ref={ref} castShadow={false}>
      <tubeGeometry args={[curve, 12, 0.06, 6, false]} />
      <meshStandardMaterial
        color="#8ed6f2"
        transparent
        opacity={0.5}
        roughness={0.1}
      />
    </mesh>
  );
};

/**
 * Splash particles — small spheres at the water impact points, bobbing.
 */
const Splash: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (ref.current) {
      ref.current.children.forEach((child, i) => {
        const t = state.clock.elapsedTime * 3 + i * 1.5;
        child.position.y = Math.abs(Math.sin(t)) * 0.25;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.opacity = 0.7 - 0.3 * Math.abs(Math.sin(t));
      });
    }
  });

  return (
    <group ref={ref} position={position}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[(Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4]} castShadow={false}>
          <sphereGeometry args={[0.05, 6, 6]} />
          <meshStandardMaterial color="#b8e6f5" transparent opacity={0.7} roughness={0.1} />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Coin arc — one gold coin tossed into the basin, fired by `tossKey` changing.
 * A flat gold disc rides a parabola from the north rim (where the player
 * stands, per the C-8.47 approach table) into the water, then hides.  When no
 * toss has happened the coin is never drawn.
 */
const CoinArc: React.FC<{ tossKey?: number }> = ({ tossKey }) => {
  const ref = useRef<THREE.Mesh>(null);
  const startRef = useRef<number | null>(null);

  const curve = React.useMemo(() => {
    const s = new THREE.Vector3(0, 2.0, -1.9);
    const e = new THREE.Vector3(0, 1.25, 0);
    const mid = s.clone().lerp(e, 0.5);
    mid.y += 0.9; // Arc peak
    return new THREE.QuadraticBezierCurve3(s, mid, e);
  }, []);

  useEffect(() => {
    if (tossKey && tossKey > 0) startRef.current = performance.now();
  }, [tossKey]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const start = startRef.current;
    if (start === null) {
      mesh.visible = false;
      return;
    }
    const t = (performance.now() - start) / 900;
    if (t >= 1) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const p = curve.getPoint(Math.min(Math.max(t, 0), 1));
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y += 0.2;
  });

  return (
    <mesh ref={ref} visible={false} castShadow={false}>
      <cylinderGeometry args={[0.09, 0.09, 0.02, 12]} />
      <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.25} />
    </mesh>
  );
};

export const ForumFountain: React.FC<{ coinTossKey?: number }> = ({ coinTossKey }) => {
  const waterRef = useRef<THREE.Mesh>(null);

  // Gentle ripple on the basin water surface
  useFrame((state) => {
    if (waterRef.current) {
      const s = 1 + 0.02 * Math.sin(state.clock.elapsedTime * 2);
      waterRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group position={[10, 0, 30]}>
      {/* Stone plaza */}
      <mesh receiveShadow position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7, 24]} />
        <meshStandardMaterial color="#d4c4a8" roughness={0.9} />
      </mesh>
      {/* Fountain basin */}
      <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
        <cylinderGeometry args={[2.2, 2.5, 1.2, 16]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} />
      </mesh>
      {/* Water surface with ripple */}
      <mesh ref={waterRef} position={[0, 1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, 16]} />
        <meshStandardMaterial color="#4a90d9" roughness={0.2} metalness={0.3} transparent opacity={0.85} />
      </mesh>
      {/* Central column */}
      <mesh castShadow position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 1.5, 12]} />
        <meshStandardMaterial color="#d4a373" roughness={0.6} />
      </mesh>
      {/* Top bowl */}
      <mesh castShadow position={[0, 2.7, 0]}>
        <cylinderGeometry args={[0.8, 0.5, 0.4, 12]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} />
      </mesh>

      {/* FLOWING WATER */}
      {/* Central vertical stream from top bowl */}
      <WaterStream position={[0, 2.2, 0]} height={1.0} radius={0.1} />
      {/* Four arcing jets from top bowl to basin */}
      <WaterArc start={[0.5, 2.7, 0]} end={[1.5, 1.2, 0]} />
      <WaterArc start={[-0.5, 2.7, 0]} end={[-1.5, 1.2, 0]} />
      <WaterArc start={[0, 2.7, 0.5]} end={[0, 1.2, 1.5]} />
      <WaterArc start={[0, 2.7, -0.5]} end={[0, 1.2, -1.5]} />
      {/* Splashes where water hits the basin */}
      <Splash position={[1.5, 1.2, 0]} />
      <Splash position={[-1.5, 1.2, 0]} />
      <Splash position={[0, 1.2, 1.5]} />
      <Splash position={[0, 1.2, -1.5]} />
      <Splash position={[0, 1.7, 0]} />

      {/* FOUNTAIN COIN TOSS — the tossed coin, fired by the panel's key. */}
      <CoinArc tossKey={coinTossKey} />

      {/* Benches */}
      {[[4, 2], [-4, 2], [4, -2], [-4, -2]].map(([x, z], i) => (
        <mesh key={i} castShadow receiveShadow position={[x, 0.3, z]}>
          <boxGeometry args={[1.8, 0.6, 0.5]} />
          <meshStandardMaterial color="#8b7355" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
};

export const MacellumMarket = React.memo(() => {
  return (
    <group position={[-8, 0, 33]}>
      <BuildingFoundation size={[10, 8]} height={0.25} projection={0.2} />
      {/* Four market stalls with alternating awnings */}
      <MarketStall position={[-3, 0, -2]} awningColor="#991b1b" />
      <MarketStall position={[3, 0, -2]} awningColor="#b45309" />
      <MarketStall position={[-3, 0, 2]} awningColor="#b45309" />
      <MarketStall position={[3, 0, 2]} awningColor="#991b1b" />
      {/* Central counter */}
      <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[3, 1.2, 2]} />
        <meshStandardMaterial color="#a0826d" roughness={0.7} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.01} />
      </mesh>
    </group>
  );
});

export const BibliothecaLibrary = React.memo(() => {
  return (
    <group position={[18, 0, 30]}>
      <BuildingFoundation size={[9, 7]} height={0.3} projection={0.25} />
      {/* Main hall */}
      <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
        <boxGeometry args={[9, 3.6, 7]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      {/* Four Doric columns at front */}
      {[-3, -1, 1, 3].map((x) => (
        <ClassicalColumn
          key={x}
          position={[x, 0, 3.8]}
          height={3.6}
          order="doric"
        />
      ))}
      {/* Pediment and roof */}
      <ClassicalPediment position={[0, 4.2, 3.5]} width={9} depth={1.4} />
      <RomanGabledRoof position={[0, 4.8, 0]} width={9.5} depth={7.5} />
      {/* Grand doorway */}
      <ClassicalDoorway position={[0, 0, 3.51]} width={1.6} height={2.8} />
    </group>
  );
});

export const PistrinumBakery = React.memo(() => {
  return (
    <group position={[-24, 0, 31]}>
      <BuildingFoundation size={[7, 6]} height={0.25} projection={0.2} />
      {/* Stone ground floor */}
      <mesh castShadow receiveShadow position={[0, 1.4, 0]}>
        <boxGeometry args={[7, 2.8, 6]} />
        <meshStandardMaterial color="#c9b896" roughness={0.7} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.015} />
      </mesh>
      {/* Timber upper floor */}
      <mesh castShadow receiveShadow position={[0, 3.6, 0]}>
        <boxGeometry args={[6.6, 1.6, 5.6]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
      </mesh>
      <RomanGabledRoof position={[0, 4.8, 0]} width={7.2} depth={6.2} />
      {/* Millstone */}
      <mesh castShadow receiveShadow position={[2.5, 0.5, 1.5]} rotation={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.3, 16]} />
        <meshStandardMaterial color="#9a9a9a" roughness={0.9} />
      </mesh>
      {/* Oven glow window */}
      <mesh position={[-2, 1.4, 3.01]}>
        <planeGeometry args={[1.2, 1.0]} />
        <meshStandardMaterial color="#ff8c42" emissive="#ff6b1a" emissiveIntensity={0.8} />
      </mesh>
      <ClassicalDoorway position={[0.5, 0, 3.01]} width={1.2} height={2.2} />
    </group>
  );
});

export const TriumphalArch = React.memo(() => {
  return (
    <group position={[0, 0, 35]}>
      {/* Two piers — walk-through gap between them */}
      {[-2.5, 2.5].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
            <boxGeometry args={[2, 5, 2.5]} />
            <meshStandardMaterial color="#ebdcb9" roughness={0.6} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
          </mesh>
          {/* Engaged column on outer face */}
          <ClassicalColumn
            position={[x > 0 ? 1.1 : -1.1, 0, 0]}
            height={4.5}
            order="corinthian"
          />
        </group>
      ))}
      {/* Lintel spanning the piers */}
      <mesh castShadow receiveShadow position={[0, 5.8, 0]}>
        <boxGeometry args={[7, 1.6, 2.5]} />
        <meshStandardMaterial color="#d4a373" roughness={0.6} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      {/* Inscription band */}
      <mesh position={[0, 5.8, 1.26]}>
        <planeGeometry args={[5.5, 0.8]} />
        <meshStandardMaterial color="#8b7355" roughness={0.7} />
      </mesh>
      {/* Attic */}
      <mesh castShadow receiveShadow position={[0, 7.2, 0]}>
        <boxGeometry args={[5, 1.2, 2]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} />
      </mesh>
    </group>
  );
});

export const SouthernDistrict = React.memo(() => {
  return (
    <group>
      <ForumFountain />
      <MacellumMarket />
      <BibliothecaLibrary />
      <PistrinumBakery />
      <TriumphalArch />
    </group>
  );
});
