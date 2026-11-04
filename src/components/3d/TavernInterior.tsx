import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function TimberBeam({ position, size, rotation = [0, 0, 0] }: {
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#49301e" roughness={0.88} />
    </mesh>
  );
}

function Amphora({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <latheGeometry args={[[
          new THREE.Vector2(0.12, 0), new THREE.Vector2(0.19, 0.08),
          new THREE.Vector2(0.28, 0.26), new THREE.Vector2(0.3, 0.43),
          new THREE.Vector2(0.22, 0.59), new THREE.Vector2(0.11, 0.68),
          new THREE.Vector2(0.1, 0.76), new THREE.Vector2(0.14, 0.79),
        ], 10]} />
        <meshStandardMaterial color="#a9542e" roughness={0.82} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.22, 0.58, 0]} rotation={[0, 0, side * -0.55]}>
          <torusGeometry args={[0.105, 0.035, 6, 10, Math.PI * 1.25]} />
          <meshStandardMaterial color="#8b4528" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function DrinkingCup({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} castShadow>
      <cylinderGeometry args={[0.09, 0.065, 0.17, 8]} />
      <meshStandardMaterial color="#b76a43" roughness={0.62} />
    </mesh>
  );
}

function Bench({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.35, 0.16, 0.42]} />
        <meshStandardMaterial color="#5a3821" roughness={0.85} />
      </mesh>
      {[-0.88, 0.88].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} castShadow>
          <boxGeometry args={[0.14, 0.48, 0.3]} />
          <meshStandardMaterial color="#382519" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function TavernTable({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.82, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.17, 1.05]} />
        <meshStandardMaterial color="#704626" roughness={0.82} />
      </mesh>
      {[[-0.63, 0.4, -0.34], [0.63, 0.4, -0.34], [-0.63, 0.4, 0.34], [0.63, 0.4, 0.34]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <boxGeometry args={[0.12, 0.8, 0.12]} />
          <meshStandardMaterial color="#49301e" roughness={0.9} />
        </mesh>
      ))}
      <DrinkingCup position={[-0.42, 0.99, 0.08]} />
      <DrinkingCup position={[0.25, 0.99, -0.1]} />
    </group>
  );
}

function Patron({ position, tunic = '#8d3e2c', facing = 0 }: {
  position: [number, number, number];
  tunic?: string;
  facing?: number;
}) {
  return (
    <group position={position} rotation={[0, facing, 0]}>
      <mesh position={[0, 1.12, 0]} castShadow>
        <capsuleGeometry args={[0.27, 0.72, 4, 8]} />
        <meshStandardMaterial color={tunic} roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.84, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial color="#b9825b" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.9, -0.02]}>
        <sphereGeometry args={[0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshStandardMaterial color="#34251d" roughness={1} />
      </mesh>
      <mesh position={[0.31, 1.18, -0.08]} rotation={[0, 0, -0.7]}>
        <capsuleGeometry args={[0.09, 0.48, 3, 6]} />
        <meshStandardMaterial color={tunic} roughness={0.95} />
      </mesh>
    </group>
  );
}

function WallTorch({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.15, 0]} rotation={[0.18, 0, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.09, 0.38, 7]} />
        <meshStandardMaterial color="#5b3822" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <coneGeometry args={[0.13, 0.32, 7]} />
        <meshStandardMaterial color="#ff9d38" emissive="#ff5a12" emissiveIntensity={2.2} roughness={0.5} />
      </mesh>
      <pointLight color="#ff9b42" intensity={2.1} distance={6} decay={2} />
    </group>
  );
}

function TavernRoom() {
  return (
    <>
      <color attach="background" args={['#1b100b']} />
      <fog attach="fog" args={['#1b100b', 11, 24]} />
      <ambientLight intensity={0.75} color="#ffdfb2" />
      <hemisphereLight args={['#ffd5a0', '#382015', 1.15]} />
      <directionalLight position={[-3, 7, 4]} intensity={1.25} color="#ffcf91" />
      <pointLight position={[0, 3.2, -2.5]} intensity={1.8} distance={10} color="#ffb35c" />
      <pointLight position={[0, 2.5, 3.5]} intensity={1.2} distance={8} color="#ffd18a" />

      {/* Packed-earth floor and stone lower courses */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[15, 18]} />
        <meshStandardMaterial color="#57402d" roughness={1} />
      </mesh>
      <mesh position={[0, 1.8, -8]} receiveShadow>
        <boxGeometry args={[15, 3.7, 0.35]} />
        <meshStandardMaterial color="#76543b" roughness={0.98} />
      </mesh>
      <mesh position={[-7.3, 1.8, 0]} receiveShadow>
        <boxGeometry args={[0.35, 3.7, 16]} />
        <meshStandardMaterial color="#624631" roughness={0.98} />
      </mesh>
      <mesh position={[7.3, 1.8, 0]} receiveShadow>
        <boxGeometry args={[0.35, 3.7, 16]} />
        <meshStandardMaterial color="#624631" roughness={0.98} />
      </mesh>
      {/* Dark rafters overhead, but warm, readable illumination below */}
      {[-5.8, -3.1, -0.4, 2.3, 5.0].map((z) => (
        <TimberBeam key={z} position={[0, 3.75, z]} size={[15, 0.2, 0.24]} />
      ))}
      {[-6, -3, 0, 3, 6].map((x) => (
        <TimberBeam key={x} position={[x, 3.55, 0]} size={[0.22, 0.38, 16]} />
      ))}
      {/* Back bar and shelves of amphorae */}
      <mesh position={[0, 0.75, -6.7]} castShadow receiveShadow>
        <boxGeometry args={[5.8, 1.45, 0.8]} />
        <meshStandardMaterial color="#50311d" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.8, -7.05]} castShadow>
        <boxGeometry args={[5.7, 0.12, 0.5]} />
        <meshStandardMaterial color="#8a5a32" roughness={0.78} />
      </mesh>
      {[-2.2, -1.1, 0, 1.1, 2.2].map((x, i) => (
        <Amphora key={x} position={[x, 1.88, -7.05]} scale={0.65 + (i % 2) * 0.08} />
      ))}
      {/* A row of stacked casks beside the counter */}
      {[-1, 0, 1].map((x) => (
        <group key={x} position={[x + 3.4, 0, -6.3]}>
          <mesh position={[0, 0.48, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.43, 0.95, 10]} />
            <meshStandardMaterial color="#5c3b24" roughness={0.9} />
          </mesh>
          {[-0.31, 0, 0.31].map((z) => (
            <mesh key={z} position={[0, 0.48, z]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.39, 0.035, 5, 12]} />
              <meshStandardMaterial color="#9b7446" metalness={0.25} roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Central communal tables, benches, food, and busy patrons */}
      <TavernTable position={[-3.3, 0, -2.1]} rotationY={0.12} />
      <Bench position={[-3.3, 0, -3.0]} />
      <Bench position={[-3.3, 0, -1.2]} rotationY={Math.PI} />
      <TavernTable position={[1.4, 0, -2.4]} rotationY={-0.15} />
      <Bench position={[1.4, 0, -3.3]} />
      <Bench position={[1.4, 0, -1.5]} rotationY={Math.PI} />
      <TavernTable position={[-0.8, 0, 1.5]} rotationY={0.15} />
      <Bench position={[-0.8, 0, 0.55]} />
      <Bench position={[-0.8, 0, 2.45]} rotationY={Math.PI} />
      <Patron position={[-4.1, 0, -2.5]} tunic="#a44731" facing={-0.25} />
      <Patron position={[-2.5, 0, -2.0]} tunic="#b48b42" facing={Math.PI} />
      <Patron position={[0.7, 0, -2.7]} tunic="#315d4a" facing={0.2} />
      <Patron position={[2.4, 0, -2.1]} tunic="#8b392d" facing={Math.PI} />
      <Patron position={[-1.8, 0, 1.4]} tunic="#7c573d" facing={0.6} />
      {/* Earthenware, spare stools, and a wall of shield decorations */}
      <Amphora position={[-6.2, 0, -4.5]} scale={0.9} />
      <Amphora position={[6.1, 0, -3.8]} scale={0.78} />
      {[-4.5, -1.5, 1.5, 4.5].map((x) => (
        <group key={x} position={[x, 2.45, -7.78]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.42, 0.42, 0.12, 12]} />
            <meshStandardMaterial color="#7b2f23" metalness={0.18} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.29, 0.29, 0.13, 12]} />
            <meshStandardMaterial color="#b58a42" metalness={0.45} roughness={0.48} />
          </mesh>
        </group>
      ))}
      <WallTorch position={[-6.9, 2.2, -2.4]} />
      <WallTorch position={[6.9, 2.2, -2.4]} />
      <WallTorch position={[-6.9, 2.2, 4.0]} />
      <WallTorch position={[6.9, 2.2, 4.0]} />
      {/* Entrance lintel and hanging sign seen from inside */}
      <TimberBeam position={[0, 2.85, 7.7]} size={[4.2, 0.24, 0.28]} />
      <mesh position={[0, 2.35, 7.62]} rotation={[0, 0, 0.02]} castShadow>
        <boxGeometry args={[1.4, 0.75, 0.1]} />
        <meshStandardMaterial color="#6c321f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.35, 7.53]}>
        <boxGeometry args={[1.12, 0.08, 0.025]} />
        <meshStandardMaterial color="#d4a66a" emissive="#6a3918" emissiveIntensity={0.25} />
      </mesh>
      {/* Warm floor-level bounce keeps faces, tables, and equipment readable on phones. */}
      <pointLight position={[-3.2, 1.1, -1.8]} intensity={0.65} distance={5} color="#ffbd72" />
      <pointLight position={[3.0, 1.15, 1.2]} intensity={0.55} distance={5} color="#ffc982" />
    </>
  );
}

export function TavernInterior({ onExit, onOpenServices }: { onExit: () => void; onOpenServices: () => void }) {
  return (
    <div className="fixed inset-0 z-[95] bg-[#1b100b] text-amber-100" role="dialog" aria-label="Roman tavern interior">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 2.7, 10.8], fov: 63, near: 0.1, far: 45 }}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.22;
        }}
      >
        <Suspense fallback={null}>
          <TavernRoom />
          <OrbitControls
            makeDefault
            target={[0, 1.35, -1.4]}
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI * 0.28}
            maxPolarAngle={Math.PI * 0.62}
            minAzimuthAngle={-Math.PI * 0.36}
            maxAzimuthAngle={Math.PI * 0.36}
          />
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <div className="rounded-xl border border-amber-200/25 bg-stone-950/75 px-5 py-2 text-center shadow-xl backdrop-blur-sm">
          <div className="text-xs uppercase tracking-[0.28em] text-amber-300">Taberna · District of the Arena</div>
          <div className="mt-1 text-lg font-bold tracking-wide sm:text-2xl">The Bronze Cup</div>
          <div className="text-xs text-amber-100/75">Wine, wagers, and stories from the sands</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenServices}
        className="absolute left-3 top-3 z-10 min-h-12 rounded-xl border border-amber-200/40 bg-stone-950/90 px-4 text-sm font-bold text-amber-100 shadow-xl hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Talk to the tavern keeper"
      >
        Rumours &amp; Games
      </button>
      <button
        type="button"
        onClick={onExit}
        className="absolute right-3 top-3 z-10 min-h-12 rounded-xl border border-amber-200/40 bg-stone-950/90 px-4 text-sm font-bold text-amber-100 shadow-xl hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Leave tavern and return to the city"
      >
        ← Return to City
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
        <div className="rounded-lg bg-stone-950/65 px-4 py-2 text-center text-xs text-amber-100/80 backdrop-blur-sm">
          Drag to look around · Tap Return to City to leave
        </div>
      </div>
    </div>
  );
}
