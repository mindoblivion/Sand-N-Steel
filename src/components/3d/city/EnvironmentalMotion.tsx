import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Lightweight vertex-shader banner animation
export const Banner: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number];
  color?: string;
}> = ({ position, rotation = [0, 0, 0], size = [1.2, 2.0], color = '#b91c1c' }) => {
  const mesh = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    color: { value: new THREE.Color(color) },
  }), [color]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={mesh} position={position} rotation={rotation}>
      <planeGeometry args={[size[0], size[1], 10, 10]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={`
          uniform float time;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 pos = position;
            // Subtle wave displacement
            pos.z += sin(pos.y * 1.5 + time * 2.0) * 0.1 * uv.x;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 color;
          varying vec2 vUv;
          void main() {
            gl_FragColor = vec4(color, 1.0);
          }
        `}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// Simple particle pool for steam
export const SteamParticles: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 12 }).map(() => ({
      mesh: new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
      ),
      offset: Math.random() * 10,
    }));
  }, []);

  useFrame((state) => {
    particles.forEach((p, i) => {
      const time = (state.clock.elapsedTime + p.offset) % 3;
      p.mesh.position.set(
        Math.sin(time + i) * 0.2,
        time * 0.5,
        Math.cos(time + i) * 0.2
      );
      p.mesh.scale.setScalar(time / 3);
      p.mesh.material.opacity = 0.3 * (1 - time / 3);
    });
  });

  return (
    <group position={position}>
      {particles.map((p, i) => <primitive key={i} object={p.mesh} />)}
    </group>
  );
};

// Particle pool for forge smoke
export const ForgeSmoke: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 8 }).map(() => ({
      mesh: new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x444444, transparent: true, opacity: 0.2 })
      ),
      offset: Math.random() * 5,
    }));
  }, []);

  useFrame((state) => {
    particles.forEach((p, i) => {
      const time = (state.clock.elapsedTime + p.offset) % 4;
      p.mesh.position.set(
        Math.sin(time + i) * 0.1,
        time * 0.4,
        Math.cos(time + i) * 0.1
      );
      p.mesh.scale.setScalar(0.5 + time * 0.5);
      p.mesh.material.opacity = 0.2 * (1 - time / 4);
    });
  });

  return (
    <group position={position}>
      {particles.map((p, i) => <primitive key={i} object={p.mesh} />)}
    </group>
  );
};

// Particle pool for drifting sand
export const SandDrift: React.FC = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 12 }).map(() => ({
      mesh: new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 4),
        new THREE.MeshStandardMaterial({ color: 0xe0a96d, transparent: true, opacity: 0.25 })
      ),
      startX: (Math.random() - 0.5) * 60,
      startZ: (Math.random() - 0.5) * 60,
      speed: 1 + Math.random(),
    }));
  }, []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    particles.forEach((p) => {
      const x = (p.startX + time * p.speed) % 60 - 30;
      const z = (p.startZ + time * (p.speed * 0.5)) % 60 - 30;
      p.mesh.position.set(x, 0.05, z);
    });
  });

  return (
    <group>
      {particles.map((p, i) => <primitive key={i} object={p.mesh} />)}
    </group>
  );
};
