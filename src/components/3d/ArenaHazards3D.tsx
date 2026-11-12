import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ArenaHazard, getStandardArenaHazards } from '../../utils/arenaHazards';

interface ArenaHazards3DProps {
  hazards?: ArenaHazard[];
}

export const ArenaHazards3D: React.FC<ArenaHazards3DProps> = ({
  hazards = getStandardArenaHazards(),
}) => {
  const flameLightRef1 = useRef<THREE.PointLight>(null);
  const flameLightRef2 = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (flameLightRef1.current) {
      flameLightRef1.current.intensity = 2.5 + Math.sin(time * 12) * 0.8 + Math.cos(time * 25) * 0.4;
    }
    if (flameLightRef2.current) {
      flameLightRef2.current.intensity = 2.5 + Math.cos(time * 10) * 0.7 + Math.sin(time * 22) * 0.5;
    }
  });

  return (
    <group data-arena-hazards="3d">
      {hazards.map((h, i) => {
        if (h.type === 'fire_brazier') {
          const isFirst = i === 0;
          return (
            <group key={h.id} position={h.position}>
              {/* Bronze Brazier Base */}
              <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[1.2, 0.8, 1.6, 12]} />
                <meshStandardMaterial color="#8a5a22" roughness={0.4} metalness={0.7} />
              </mesh>
              {/* Flaming Embers */}
              <mesh position={[0, 1.7, 0]}>
                <sphereGeometry args={[0.9, 12, 12]} />
                <meshStandardMaterial
                  color="#ff4500"
                  emissive="#ff2200"
                  emissiveIntensity={3.5}
                  roughness={0.2}
                />
              </mesh>
              {/* Dynamic Point Light */}
              <pointLight
                ref={isFirst ? flameLightRef1 : flameLightRef2}
                position={[0, 2.2, 0]}
                color="#ffaa00"
                distance={12}
                decay={2}
                intensity={3.0}
              />
            </group>
          );
        }

        if (h.type === 'spiked_barrier') {
          return (
            <group key={h.id} position={h.position}>
              {/* Iron Wall Plate */}
              <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.4, 2.4, 4.0]} />
                <meshStandardMaterial color="#22252a" metalness={0.8} roughness={0.3} />
              </mesh>
              {/* Spikes */}
              {[-1.2, -0.4, 0.4, 1.2].map((offsetZ, idx) => (
                <mesh
                  key={idx}
                  position={[0, 1.2, offsetZ]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <coneGeometry args={[0.25, 0.9, 8]} />
                  <meshStandardMaterial color="#4a4d52" metalness={0.9} roughness={0.2} />
                </mesh>
              ))}
            </group>
          );
        }

        if (h.type === 'pit_trap') {
          return (
            <group key={h.id} position={h.position}>
              {/* Sunken Pit Frame */}
              <mesh position={[0, -0.05, 0]} receiveShadow>
                <boxGeometry args={[3.2, 0.1, 3.2]} />
                <meshStandardMaterial color="#1a1815" roughness={0.9} />
              </mesh>
              {/* Iron Grate Bars */}
              {[-1.0, -0.5, 0, 0.5, 1.0].map((offsetX, idx) => (
                <mesh key={idx} position={[offsetX, 0.02, 0]} receiveShadow>
                  <boxGeometry args={[0.12, 0.05, 3.0]} />
                  <meshStandardMaterial color="#33373e" metalness={0.8} roughness={0.4} />
                </mesh>
              ))}
            </group>
          );
        }

        return null;
      })}
    </group>
  );
};
