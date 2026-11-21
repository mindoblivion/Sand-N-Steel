import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  CITY_LAYOUT_BLUEPRINT,
  type BlueprintBuilding,
  type BlueprintBuildingId,
} from '../../../data/cityLayoutBlueprint';
import { NOISE_TEXTURE, ROMAN_PALETTE, TRAVERTINE_TEXTURE } from './RomanMaterials';

const INSULA_PALETTE: Record<string, { stucco: string; brick: string; floors: number }> = {
  bldg_insula_1: { stucco: '#e8d8be', brick: '#8c4e38', floors: 3 },
  bldg_insula_2: { stucco: '#dfc8a8', brick: '#7e4330', floors: 4 },
  bldg_insula_3: { stucco: '#d8be98', brick: '#8c4e38', floors: 3 },
  bldg_insula_4: { stucco: '#e4d2b4', brick: '#7a4534', floors: 4 },
  bldg_insula_5: { stucco: '#d9c6aa', brick: '#874b36', floors: 3 },
  bldg_insula_6: { stucco: '#e6d6bc', brick: '#824632', floors: 3 },
};

const DOMUS_ACCENTS: Record<string, string> = {
  bldg_domus_1: '#9b3a2e',
  bldg_domus_2: '#8a3529',
  bldg_domus_3: '#a14332',
  bldg_domus_4: '#7d3026',
};

const ModularInsulaShell: React.FC<{ building: BlueprintBuilding }> = React.memo(({ building }) => {
  const [w, d] = building.footprint;
  const spec = INSULA_PALETTE[building.id] ?? { stucco: '#e4d2b4', brick: '#824632', floors: 3 };
  const groundH = 3.2;
  const upperH = spec.floors === 4 ? 8.6 : 6.0;

  return (
    <group position={building.position} rotation={[0, building.rotationY_radians, 0]}>
      {/* Stepped stone plinth */}
      <mesh receiveShadow position={[0, 0.15, 0]}>
        <boxGeometry args={[w, 0.3, d]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.85} />
      </mesh>

      {/* Ground-floor Roman brick tabernae (shopfront story) */}
      <mesh castShadow receiveShadow position={[0, 0.3 + groundH / 2, 0]}>
        <boxGeometry args={[w - 0.3, groundH, d - 0.3]} />
        <meshStandardMaterial
          color={spec.brick}
          roughness={0.86}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>

      {/* Street-facing (+Z) recessed tabernae shop doorways & timber lintels */}
      {[-w * 0.28, 0, w * 0.28].map((dx, idx) => (
        <group key={`taberna-${idx}`} position={[dx, 1.35, d / 2 - 0.12]}>
          <mesh>
            <boxGeometry args={[2.3, 2.2, 0.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.recessDark.color} roughness={0.95} />
          </mesh>
          <mesh castShadow position={[0, 1.22, 0.08]}>
            <boxGeometry args={[2.65, 0.24, 0.28]} />
            <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.88} />
          </mesh>
        </group>
      ))}

      {/* Upper timber-and-stucco tenement stories */}
      <mesh castShadow receiveShadow position={[0, 0.3 + groundH + upperH / 2, 0]}>
        <boxGeometry args={[w - 0.1, upperH, d - 0.1]} />
        <meshStandardMaterial
          color={spec.stucco}
          roughness={0.84}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>
    </group>
  );
});

const CommunalWellCourtyardShell: React.FC<{ building: BlueprintBuilding }> = React.memo(
  ({ building }) => {
    const [w, d] = building.footprint; // 12 x 12
    const wallH = 1.45;
    const halfW = w / 2;
    const halfD = d / 2;

    return (
      <group position={building.position} rotation={[0, building.rotationY_radians, 0]}>
        {/* Limestone flagstone courtyard floor */}
        <mesh receiveShadow position={[0, 0.05, 0]}>
          <boxGeometry args={[w, 0.12, d]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.forumPaving.color}
            roughness={0.82}
            bumpMap={TRAVERTINE_TEXTURE || undefined}
            bumpScale={0.014}
          />
        </mesh>

        {/* Enclosing low limestone parapet walls with +Z 5u wide doorway */}
        <mesh castShadow receiveShadow position={[0, wallH / 2, -halfD + 0.55]}>
          <boxGeometry args={[w, wallH, 1.1]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.84} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={`well-wall-${side}`}>
            <mesh castShadow receiveShadow position={[side * (halfW - 0.55), wallH / 2, 0]}>
              <boxGeometry args={[1.1, wallH, d]} />
              <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.84} />
            </mesh>
            <mesh castShadow receiveShadow position={[side * 4.2, wallH / 2, halfD - 0.55]}>
              <boxGeometry args={[3.6, wallH, 1.1]} />
              <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.84} />
            </mesh>
          </group>
        ))}

        {/* Central circular travertine wellhead */}
        <group position={[0, 0, -0.5]}>
          <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
            <cylinderGeometry args={[1.35, 1.45, 1.15, 16]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.travertine.color}
              roughness={0.78}
              bumpMap={TRAVERTINE_TEXTURE || undefined}
              bumpScale={0.015}
            />
          </mesh>
          <mesh position={[0, 1.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.0, 16]} />
            <meshStandardMaterial color="#2f5f70" roughness={0.25} metalness={0.1} />
          </mesh>
          {/* Timber A-frame winch posts & crossbeam */}
          {[-1.25, 1.25].map((px, idx) => (
            <mesh key={`well-post-${idx}`} castShadow position={[px, 1.85, 0]}>
              <boxGeometry args={[0.18, 2.5, 0.18]} />
              <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.88} />
            </mesh>
          ))}
          <mesh castShadow position={[0, 3.05, 0]}>
            <boxGeometry args={[2.9, 0.2, 0.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.88} />
          </mesh>
          <mesh castShadow position={[0, 3.32, 0]}>
            <boxGeometry args={[3.1, 0.18, 1.4]} />
            <meshStandardMaterial color={ROMAN_PALETTE.terracottaTile.color} roughness={0.75} />
          </mesh>
        </group>

        {/* Twin communal washbasins along rear courtyard wall */}
        {[-3.0, 3.0].map((bx, idx) => (
          <group key={`basin-${idx}`} position={[bx, 0, -3.6]}>
            <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
              <boxGeometry args={[2.4, 0.85, 1.5]} />
              <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.89, 0]}>
              <boxGeometry args={[1.95, 0.04, 1.1]} />
              <meshStandardMaterial color="#3c7385" roughness={0.28} metalness={0.12} />
            </mesh>
          </group>
        ))}
      </group>
    );
  },
);

const TempleOfFortunaShell: React.FC<{ building: BlueprintBuilding }> = React.memo(
  ({ building }) => {
    const [w, d] = building.footprint; // 28 x 22 (with local +Z forward stairs)
    const podiumH = 2.4;

    return (
      <group position={building.position} rotation={[0, building.rotationY_radians, 0]}>
        {/* Main Roman stone temple podium */}
        <mesh castShadow receiveShadow position={[0, podiumH / 2, -2.0]}>
          <boxGeometry args={[w - 1.2, podiumH, d - 4.5]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.travertine.color}
            roughness={0.76}
            bumpMap={TRAVERTINE_TEXTURE || undefined}
            bumpScale={0.018}
          />
        </mesh>

        {/* 7 Broad front steps (+Z forward facing road_sec_civic_north) */}
        {[0, 1, 2, 3, 4, 5, 6].map((step) => {
          const stepH = podiumH / 7;
          const stepZ = d / 2 - 0.6 - step * 0.55;
          const stepY = step * stepH + stepH / 2;
          return (
            <mesh
              key={`temple-step-${step}`}
              castShadow
              receiveShadow
              position={[0, stepY, stepZ]}
            >
              <boxGeometry args={[16.5, stepH, 0.65]} />
              <meshStandardMaterial color={ROMAN_PALETTE.marbleWhite.color} roughness={0.62} />
            </mesh>
          );
        })}

        {/* Sanctuary Cella walls */}
        <mesh castShadow receiveShadow position={[0, podiumH + 4.4, -3.5]}>
          <boxGeometry args={[18.0, 8.8, 12.2]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.marbleWhite.color}
            roughness={0.58}
            bumpMap={TRAVERTINE_TEXTURE || undefined}
            bumpScale={0.01}
          />
        </mesh>

        {/* Gold-trimmed bronze sanctuary double doors on +Z cella facade */}
        <mesh castShadow position={[0, podiumH + 2.8, 2.65]}>
          <boxGeometry args={[4.4, 5.6, 0.35]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.agedBronze.color}
            metalness={0.72}
            roughness={0.38}
          />
        </mesh>
        <mesh position={[0, podiumH + 5.75, 2.7]}>
          <boxGeometry args={[5.2, 0.55, 0.45]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.78}
            roughness={0.32}
          />
        </mesh>

        {/* Entablature architrave & golden Fortuna pediment gable */}
        <mesh castShadow receiveShadow position={[0, podiumH + 9.25, -0.8]}>
          <boxGeometry args={[22.0, 1.05, 19.2]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.72} />
        </mesh>
        <mesh castShadow position={[0, podiumH + 10.1, 8.85]}>
          <boxGeometry args={[20.0, 0.85, 0.4]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.76}
            roughness={0.34}
          />
        </mesh>
        {/* Pediment triangular gable prism */}
        <mesh
          castShadow
          position={[0, podiumH + 11.45, -0.8]}
          rotation={[Math.PI / 2, 0, Math.PI / 4]}
        >
          <cylinderGeometry args={[3.4, 3.4, 19.0, 3]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.74} />
        </mesh>

        {/* Glowing bronze Fortuna Luck Altar brazier on front terrace */}
        <group position={[0, podiumH, 5.8]}>
          <mesh castShadow position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.65, 0.85, 1.1, 10]} />
            <meshStandardMaterial color={ROMAN_PALETTE.marbleWhite.color} roughness={0.5} />
          </mesh>
          <mesh position={[0, 1.25, 0]}>
            <sphereGeometry args={[0.35, 10, 10]} />
            <meshStandardMaterial
              color="#fde047"
              emissive="#f59e0b"
              emissiveIntensity={1.6}
              roughness={0.35}
            />
          </mesh>
        </group>
      </group>
    );
  },
);

const WatchBarracksShell: React.FC<{ building: BlueprintBuilding }> = React.memo(
  ({ building }) => {
    const [w, d] = building.footprint; // 34 x 26

    return (
      <group position={building.position} rotation={[0, building.rotationY_radians, 0]}>
        {/* Paved stone training courtyard floor */}
        <mesh receiveShadow position={[0, 0.05, 0]}>
          <boxGeometry args={[w, 0.12, d]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.roadFlagstone.color}
            roughness={0.84}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.018}
          />
        </mesh>

        {/* Rear main barracks hall (z in [-13, -3.5]) */}
        <mesh castShadow receiveShadow position={[0, 3.8, -8.25]}>
          <boxGeometry args={[w, 7.6, 9.5]} />
          <meshStandardMaterial
            color="#8f806d"
            roughness={0.86}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.02}
          />
        </mesh>

        {/* Northwest fortified corner watchtower */}
        <mesh castShadow receiveShadow position={[-13.4, 6.2, -9.2]}>
          <boxGeometry args={[7.2, 12.4, 7.6]} />
          <meshStandardMaterial
            color="#857664"
            roughness={0.86}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.022}
          />
        </mesh>
        <mesh castShadow position={[-13.4, 12.6, -9.2]}>
          <boxGeometry args={[7.8, 0.55, 8.2]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
        </mesh>

        {/* West & East barracks wings framing open central courtyard */}
        {[-13.4, 13.4].map((wx, idx) => (
          <mesh
            key={`barracks-wing-${idx}`}
            castShadow
            receiveShadow
            position={[wx, 3.1, 4.75]}
          >
            <boxGeometry args={[7.2, 6.2, 16.5]} />
            <meshStandardMaterial
              color="#958672"
              roughness={0.85}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.018}
            />
          </mesh>
        ))}

        {/* Front courtyard parapet walls with 8.4u open +Z entrance gateway */}
        {[-7.0, 7.0].map((px, idx) => (
          <mesh
            key={`barracks-front-pier-${idx}`}
            castShadow
            receiveShadow
            position={[px, 2.2, 12.25]}
          >
            <boxGeometry args={[5.6, 4.4, 1.5]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.84} />
          </mesh>
        ))}
        {/* Overhead timber & bronze gatehouse lintel beam above the 8.4u gateway */}
        <mesh castShadow position={[0, 4.75, 12.25]}>
          <boxGeometry args={[18.8, 0.9, 1.8]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
        </mesh>

        {/* Two timber combat training pell posts inside the courtyard */}
        {[-3.2, 3.2].map((tx, idx) => (
          <group key={`pell-${idx}`} position={[tx, 0, 1.5]}>
            <mesh castShadow position={[0, 1.05, 0]}>
              <cylinderGeometry args={[0.2, 0.24, 2.1, 8]} />
              <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0, 1.4, 0]}>
              <boxGeometry args={[0.9, 0.16, 0.16]} />
              <meshStandardMaterial color={ROMAN_PALETTE.agedBronze.color} metalness={0.65} roughness={0.45} />
            </mesh>
          </group>
        ))}
      </group>
    );
  },
);

const PatricianDomusShell: React.FC<{ building: BlueprintBuilding }> = React.memo(
  ({ building }) => {
    const [w, d] = building.footprint; // 24 x 20
    const accent = DOMUS_ACCENTS[building.id] ?? '#9b3a2e';
    const wallH = 5.2;

    return (
      <group position={building.position} rotation={[0, building.rotationY_radians, 0]}>
        {/* Travertine plinth & paved inner peristyle floor */}
        <mesh receiveShadow position={[0, 0.12, 0]}>
          <boxGeometry args={[w, 0.24, d]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
        </mesh>

        {/* Walled perimeter wings surrounding open central impluvium courtyard */}
        {/* Front (+Z) vestibule wing */}
        <mesh castShadow receiveShadow position={[0, wallH / 2, d / 2 - 2.3]}>
          <boxGeometry args={[w, wallH, 4.6]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.stuccoWarm.color}
            roughness={0.82}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.012}
          />
        </mesh>
        {/* Rear (-Z) tablinum wing */}
        <mesh castShadow receiveShadow position={[0, wallH / 2, -d / 2 + 2.5]}>
          <boxGeometry args={[w, wallH + 0.6, 5.0]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.stuccoWarm.color}
            roughness={0.82}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.012}
          />
        </mesh>
        {/* West & East side wings */}
        {[-w / 2 + 2.3, w / 2 - 2.3].map((sx, idx) => (
          <mesh key={`domus-side-${idx}`} castShadow receiveShadow position={[sx, wallH / 2, 0]}>
            <boxGeometry args={[4.6, wallH, d - 9.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.stuccoWarm.color} roughness={0.82} />
          </mesh>
        ))}

        {/* Lower Pompeiian crimson dado band & recessed bronze portal on +Z street facade */}
        <mesh castShadow position={[0, 0.75, d / 2 + 0.04]}>
          <boxGeometry args={[w - 0.1, 1.3, 0.12]} />
          <meshStandardMaterial color={accent} roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0, 2.1, d / 2 + 0.08]}>
          <boxGeometry args={[3.4, 3.8, 0.25]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.agedBronze.color}
            metalness={0.7}
            roughness={0.4}
          />
        </mesh>

        {/* Open-air central atrium marble impluvium reflection pool */}
        <mesh receiveShadow position={[0, 0.26, 0]}>
          <boxGeometry args={[7.2, 0.14, 5.2]} />
          <meshStandardMaterial color={ROMAN_PALETTE.marbleWhite.color} roughness={0.48} />
        </mesh>
        <mesh position={[0, 0.34, 0]}>
          <boxGeometry args={[5.8, 0.04, 3.8]} />
          <meshStandardMaterial color="#3b8296" roughness={0.22} metalness={0.14} />
        </mesh>
      </group>
    );
  },
);

/**
 * Global InstancedMesh batches across ALL 13 Step-3 North District buildings:
 *   1. Terracotta roofs (Insulae, Domus, Barracks, Temple)
 *   2. Timber horizontal floor/eave beams
 *   3. Wooden shuttered window frames + recessed dark panes
 *   4. Classical columns (Temple of Fortuna, Domus peristyles)
 */
const NorthDistrictInstancedDetails: React.FC<{ buildings: BlueprintBuilding[] }> = React.memo(
  ({ buildings }) => {
    const roofRef = useRef<THREE.InstancedMesh>(null);
    const beamRef = useRef<THREE.InstancedMesh>(null);
    const shutterRef = useRef<THREE.InstancedMesh>(null);
    const paneRef = useRef<THREE.InstancedMesh>(null);
    const columnRef = useRef<THREE.InstancedMesh>(null);

    const batches = useMemo(() => {
      const roofs: THREE.Matrix4[] = [];
      const beams: THREE.Matrix4[] = [];
      const shutters: THREE.Matrix4[] = [];
      const panes: THREE.Matrix4[] = [];
      const columns: THREE.Matrix4[] = [];

      const parentObj = new THREE.Object3D();
      const childObj = new THREE.Object3D();

      const push = (
        target: THREE.Matrix4[],
        lx: number,
        ly: number,
        lz: number,
        rx: number,
        ry: number,
        rz: number,
        sx: number,
        sy: number,
        sz: number,
      ) => {
        childObj.position.set(lx, ly, lz);
        childObj.rotation.set(rx, ry, rz);
        childObj.scale.set(sx, sy, sz);
        childObj.updateMatrix();
        const m = new THREE.Matrix4();
        m.multiplyMatrices(parentObj.matrixWorld, childObj.matrix);
        target.push(m);
      };

      for (const b of buildings) {
        parentObj.position.set(b.position[0], b.position[1], b.position[2]);
        parentObj.rotation.set(0, b.rotationY_radians, 0);
        parentObj.scale.set(1, 1, 1);
        parentObj.updateMatrixWorld();

        const [w, d] = b.footprint;

        if (b.id.startsWith('bldg_insula_')) {
          const floors = INSULA_PALETTE[b.id]?.floors ?? 3;
          const topY = 0.3 + 3.2 + (floors === 4 ? 8.6 : 6.0);

          // 2 Sloped terracotta roof halves
          const halfSlope = (d / 2) + 0.55;
          const slopePitch = 0.28;
          push(roofs, 0, topY + 0.85, -halfSlope * 0.48, -slopePitch, 0, 0, w + 0.9, 0.28, halfSlope * 1.06);
          push(roofs, 0, topY + 0.85, halfSlope * 0.48, slopePitch, 0, 0, w + 0.9, 0.28, halfSlope * 1.06);

          // Horizontal timber floor-band beams around building stories
          const storyHeights = floors === 4 ? [3.65, 6.4, 9.2, topY] : [3.65, 6.5, topY];
          for (const sy of storyHeights) {
            push(beams, 0, sy, d / 2 + 0.02, 0, 0, 0, w + 0.15, 0.22, 0.22);
            push(beams, 0, sy, -d / 2 - 0.02, 0, 0, 0, w + 0.15, 0.22, 0.22);
            push(beams, -w / 2 - 0.02, sy, 0, 0, 0, 0, 0.22, 0.22, d + 0.15);
            push(beams, w / 2 + 0.02, sy, 0, 0, 0, 0, 0.22, 0.22, d + 0.15);
          }

          // Upper-story shuttered windows on front (+Z) and back (-Z) facades
          const winRows = floors === 4 ? [5.0, 7.8, 10.6] : [5.0, 7.9];
          const colsX = w >= 22 ? [-7.2, -2.4, 2.4, 7.2] : [-5.2, 0, 5.2];
          for (const wy of winRows) {
            for (const wx of colsX) {
              for (const wzSign of [-1, 1] as const) {
                const wz = wzSign * (d / 2 - 0.02);
                push(panes, wx, wy, wz, 0, 0, 0, 1.35, 1.65, 0.16);
                push(shutters, wx - 0.88, wy, wz + wzSign * 0.05, 0, 0, 0, 0.38, 1.68, 0.14);
                push(shutters, wx + 0.88, wy, wz + wzSign * 0.05, 0, 0, 0, 0.38, 1.68, 0.14);
              }
            }
          }
        } else if (b.id === 'bldg_temple_fortuna') {
          // Sloped temple terracotta roofs
          push(roofs, -5.6, 13.8, -0.8, 0, 0, 0.3, 11.6, 0.32, 19.6);
          push(roofs, 5.6, 13.8, -0.8, 0, 0, -0.3, 11.6, 0.32, 19.6);

          // 10 Classical portico columns (6 across front + 2 each flank return)
          const frontColsX = [-9.2, -5.5, -1.8, 1.8, 5.5, 9.2];
          for (const cx of frontColsX) {
            push(columns, cx, 2.4 + 4.2, 8.2, 0, 0, 0, 0.9, 8.4, 0.9);
          }
          for (const cz of [5.4, 2.6]) {
            push(columns, -9.2, 2.4 + 4.2, cz, 0, 0, 0, 0.9, 8.4, 0.9);
            push(columns, 9.2, 2.4 + 4.2, cz, 0, 0, 0, 0.9, 8.4, 0.9);
          }
        } else if (b.id === 'bldg_watch_barracks') {
          // Barracks roofs (rear hall + west/east wings)
          push(roofs, 0, 8.4, -10.5, -0.22, 0, 0, w + 0.8, 0.3, 5.4);
          push(roofs, 0, 8.4, -6.0, 0.22, 0, 0, w + 0.8, 0.3, 5.4);
          push(roofs, -13.4, 6.7, 4.75, 0, 0, 0.18, 7.6, 0.28, 16.8);
          push(roofs, 13.4, 6.7, 4.75, 0, 0, -0.18, 7.6, 0.28, 16.8);

          // Courtyard timber tie beams
          push(beams, 0, 4.75, 11.35, 0, 0, 0, 18.8, 0.24, 0.24);
          // Front courtyard shuttered windows along street wings
          for (const wx of [-14.8, -12.0, 12.0, 14.8]) {
            push(panes, wx, 3.6, 13.0, 0, 0, 0, 1.3, 1.5, 0.16);
            push(shutters, wx - 0.82, 3.6, 13.05, 0, 0, 0, 0.34, 1.55, 0.14);
            push(shutters, wx + 0.82, 3.6, 13.05, 0, 0, 0, 0.34, 1.55, 0.14);
          }
        } else if (b.id.startsWith('bldg_domus_')) {
          const topY = 5.2;
          // Peristyle sloped terracotta roofs around the open atrium
          push(roofs, 0, topY + 0.55, d / 2 - 2.3, 0.24, 0, 0, w + 0.6, 0.28, 5.1);
          push(roofs, 0, topY + 1.05, -d / 2 + 2.5, -0.24, 0, 0, w + 0.6, 0.28, 5.5);
          push(roofs, -w / 2 + 2.3, topY + 0.55, 0, 0, 0, 0.24, 5.1, 0.28, d - 8.4);
          push(roofs, w / 2 - 2.3, topY + 0.55, 0, 0, 0, -0.24, 5.1, 0.28, d - 8.4);

          // Horizontal timber cornice beam on +Z street wall
          push(beams, 0, topY - 0.1, d / 2 + 0.04, 0, 0, 0, w + 0.15, 0.25, 0.25);

          // Atrium peristyle colonnade (8 columns framing the impluvium)
          for (const cx of [-6.0, -2.0, 2.0, 6.0]) {
            push(columns, cx, 2.7, 4.8, 0, 0, 0, 0.62, 5.0, 0.62);
            push(columns, cx, 2.7, -4.8, 0, 0, 0, 0.62, 5.0, 0.62);
          }
          // Flanking facade pilasters & street windows
          push(columns, -2.4, 2.7, d / 2 + 0.15, 0, 0, 0, 0.68, 5.0, 0.68);
          push(columns, 2.4, 2.7, d / 2 + 0.15, 0, 0, 0, 0.68, 5.0, 0.68);
          for (const wx of [-8.2, -5.2, 5.2, 8.2]) {
            push(panes, wx, 3.2, d / 2 + 0.02, 0, 0, 0, 1.3, 1.45, 0.16);
            push(shutters, wx - 0.82, 3.2, d / 2 + 0.07, 0, 0, 0, 0.34, 1.5, 0.14);
            push(shutters, wx + 0.82, 3.2, d / 2 + 0.07, 0, 0, 0, 0.34, 1.5, 0.14);
          }
        }
      }

      return { roofs, beams, shutters, panes, columns };
    }, [buildings]);

    const resources = useMemo(() => {
      const roofGeo = new THREE.BoxGeometry(1, 1, 1);
      const beamGeo = new THREE.BoxGeometry(1, 1, 1);
      const shutterGeo = new THREE.BoxGeometry(1, 1, 1);
      const paneGeo = new THREE.BoxGeometry(1, 1, 1);
      const colGeo = new THREE.CylinderGeometry(0.42, 0.48, 1, 10);

      const roofMat = new THREE.MeshStandardMaterial({
        color: ROMAN_PALETTE.terracottaTile.color,
        roughness: 0.74,
        metalness: 0.04,
        bumpMap: NOISE_TEXTURE || null,
        bumpScale: 0.014,
      });
      const beamMat = new THREE.MeshStandardMaterial({
        color: ROMAN_PALETTE.weatheredTimber.color,
        roughness: 0.88,
      });
      const shutterMat = new THREE.MeshStandardMaterial({
        color: ROMAN_PALETTE.agedPine.color,
        roughness: 0.84,
      });
      const paneMat = new THREE.MeshStandardMaterial({
        color: ROMAN_PALETTE.recessDark.color,
        roughness: 0.96,
      });
      const colMat = new THREE.MeshStandardMaterial({
        color: ROMAN_PALETTE.marbleWhite.color,
        roughness: 0.46,
        metalness: 0.06,
      });

      return {
        roofGeo,
        beamGeo,
        shutterGeo,
        paneGeo,
        colGeo,
        roofMat,
        beamMat,
        shutterMat,
        paneMat,
        colMat,
      };
    }, []);

    useEffect(() => {
      return () => {
        resources.roofGeo.dispose();
        resources.beamGeo.dispose();
        resources.shutterGeo.dispose();
        resources.paneGeo.dispose();
        resources.colGeo.dispose();
        resources.roofMat.dispose();
        resources.beamMat.dispose();
        resources.shutterMat.dispose();
        resources.paneMat.dispose();
        resources.colMat.dispose();
      };
    }, [resources]);

    useLayoutEffect(() => {
      const apply = (mesh: THREE.InstancedMesh | null, list: THREE.Matrix4[]) => {
        if (!mesh || list.length === 0) return;
        list.forEach((mat, i) => mesh.setMatrixAt(i, mat));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      };
      apply(roofRef.current, batches.roofs);
      apply(beamRef.current, batches.beams);
      apply(shutterRef.current, batches.shutters);
      apply(paneRef.current, batches.panes);
      apply(columnRef.current, batches.columns);
    }, [batches]);

    return (
      <group name="north-districts-instanced-details">
        {batches.roofs.length > 0 && (
          <instancedMesh
            ref={roofRef}
            args={[resources.roofGeo, resources.roofMat, batches.roofs.length]}
            castShadow
            receiveShadow
          />
        )}
        {batches.beams.length > 0 && (
          <instancedMesh
            ref={beamRef}
            args={[resources.beamGeo, resources.beamMat, batches.beams.length]}
            castShadow
            receiveShadow
          />
        )}
        {batches.shutters.length > 0 && (
          <instancedMesh
            ref={shutterRef}
            args={[resources.shutterGeo, resources.shutterMat, batches.shutters.length]}
            castShadow
          />
        )}
        {batches.panes.length > 0 && (
          <instancedMesh
            ref={paneRef}
            args={[resources.paneGeo, resources.paneMat, batches.panes.length]}
          />
        )}
        {batches.columns.length > 0 && (
          <instancedMesh
            ref={columnRef}
            args={[resources.colGeo, resources.colMat, batches.columns.length]}
            castShadow
            receiveShadow
          />
        )}
      </group>
    );
  },
);

const STEP3_IDS = new Set<BlueprintBuildingId>([
  'bldg_insula_1',
  'bldg_insula_2',
  'bldg_insula_3',
  'bldg_insula_4',
  'bldg_insula_5',
  'bldg_insula_6',
  'bldg_well_courtyard',
  'bldg_temple_fortuna',
  'bldg_watch_barracks',
  'bldg_domus_1',
  'bldg_domus_2',
  'bldg_domus_3',
  'bldg_domus_4',
]);

export const isStep3BuildingId = (id: BlueprintBuildingId): boolean => STEP3_IDS.has(id);

export const BlueprintNorthDistricts: React.FC = React.memo(() => {
  const northBuildings = useMemo(
    () => CITY_LAYOUT_BLUEPRINT.buildings.filter((b) => STEP3_IDS.has(b.id)),
    [],
  );

  return (
    <group name="blueprint-north-districts">
      {northBuildings.map((b) => {
        if (b.id.startsWith('bldg_insula_')) {
          return <ModularInsulaShell key={b.id} building={b} />;
        }
        if (b.id === 'bldg_well_courtyard') {
          return <CommunalWellCourtyardShell key={b.id} building={b} />;
        }
        if (b.id === 'bldg_temple_fortuna') {
          return <TempleOfFortunaShell key={b.id} building={b} />;
        }
        if (b.id === 'bldg_watch_barracks') {
          return <WatchBarracksShell key={b.id} building={b} />;
        }
        if (b.id.startsWith('bldg_domus_')) {
          return <PatricianDomusShell key={b.id} building={b} />;
        }
        return null;
      })}
      <NorthDistrictInstancedDetails buildings={northBuildings} />
    </group>
  );
});
