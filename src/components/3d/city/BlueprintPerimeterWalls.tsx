import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  BLUEPRINT_CORNER_BASTIONS,
  BLUEPRINT_GATEHOUSES,
  BLUEPRINT_WALL_SEGMENTS,
  PERIMETER_CITADEL_JOIN_X,
  PERIMETER_GATE_CLEAR_HALF,
  PERIMETER_WALL_BOUND,
  PERIMETER_WALL_HEIGHT,
  PERIMETER_WALL_THICKNESS,
  type BlueprintCornerBastion,
  type BlueprintGatehouse,
  type BlueprintWallSegment,
} from '../../../data/cityLayoutBlueprint';
import { computeWallSegmentTransform } from '../../../utils/cityBlueprintLoader';
import { ClassicalColumn } from './ClassicalArchitecture';
import { NOISE_TEXTURE, ROMAN_PALETTE, TRAVERTINE_TEXTURE } from './RomanMaterials';

const CurtainWallBody: React.FC<{ segment: BlueprintWallSegment }> = React.memo(({ segment }) => {
  const wt = useMemo(() => computeWallSegmentTransform(segment), [segment]);
  const mainHeight = PERIMETER_WALL_HEIGHT - 1.1; // 7.5

  return (
    <group position={wt.center} rotation={[0, wt.yaw, 0]}>
      {/* Stepped ashlar foundation plinth */}
      <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[wt.length, 1.1, PERIMETER_WALL_THICKNESS + 0.7]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertineDark.color}
          roughness={0.86}
          bumpMap={TRAVERTINE_TEXTURE || undefined}
          bumpScale={0.02}
        />
      </mesh>

      {/* Main fortified Roman ashlar wall body */}
      <mesh castShadow receiveShadow position={[0, 1.0 + mainHeight / 2, 0]}>
        <boxGeometry args={[wt.length, mainHeight, PERIMETER_WALL_THICKNESS]} />
        <meshStandardMaterial
          color="#968773"
          roughness={0.86}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.022}
        />
      </mesh>

      {/* Upper travertine cornice ledge */}
      <mesh castShadow receiveShadow position={[0, PERIMETER_WALL_HEIGHT + 0.15, 0]}>
        <boxGeometry args={[wt.length, 0.45, PERIMETER_WALL_THICKNESS + 0.55]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={0.78}
          bumpMap={TRAVERTINE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>

      {/* Timber parapet walkway runner */}
      <mesh receiveShadow position={[0, PERIMETER_WALL_HEIGHT + 0.42, 0]}>
        <boxGeometry args={[wt.length, 0.12, PERIMETER_WALL_THICKNESS - 1.0]} />
        <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.9} />
      </mesh>
    </group>
  );
});

/**
 * Batched InstancedMesh for all curtain wall crenellation merlons and structural
 * pilasters across the entire ±200 perimeter (2 GPU draw calls total).
 */
const CurtainWallInstancedDetails: React.FC = React.memo(() => {
  const merlonRef = useRef<THREE.InstancedMesh>(null);
  const pilasterRef = useRef<THREE.InstancedMesh>(null);

  const { merlonTransforms, pilasterTransforms } = useMemo(() => {
    const merlons: THREE.Matrix4[] = [];
    const pilasters: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    const merlonSpacing = 2.8;
    const pilasterSpacing = 12.0;
    const halfThick = PERIMETER_WALL_THICKNESS / 2;

    for (const seg of BLUEPRINT_WALL_SEGMENTS) {
      const wt = computeWallSegmentTransform(seg);
      const dirX = wt.axis === 'x' ? 1 : 0;
      const dirZ = wt.axis === 'z' ? 1 : 0;
      const perpX = wt.axis === 'x' ? 0 : 1;
      const perpZ = wt.axis === 'z' ? 0 : 1;

      const merlonCount = Math.max(2, Math.floor((wt.length - 2.4) / merlonSpacing));
      const merlonSpan = (merlonCount - 1) * merlonSpacing;
      for (let i = 0; i < merlonCount; i++) {
        const offsetAlong = -merlonSpan / 2 + i * merlonSpacing;
        for (const side of [-1, 1] as const) {
          const offsetPerp = side * (halfThick - 0.15);
          dummy.position.set(
            wt.center[0] + dirX * offsetAlong + perpX * offsetPerp,
            PERIMETER_WALL_HEIGHT + 1.0,
            wt.center[2] + dirZ * offsetAlong + perpZ * offsetPerp,
          );
          dummy.rotation.set(0, wt.yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          merlons.push(dummy.matrix.clone());
        }
      }

      const pilasterCount = Math.max(2, Math.floor((wt.length - 6.0) / pilasterSpacing));
      const pilasterSpan = (pilasterCount - 1) * pilasterSpacing;
      for (let i = 0; i < pilasterCount; i++) {
        const offsetAlong = -pilasterSpan / 2 + i * pilasterSpacing;
        for (const side of [-1, 1] as const) {
          const offsetPerp = side * (halfThick + 0.16);
          dummy.position.set(
            wt.center[0] + dirX * offsetAlong + perpX * offsetPerp,
            4.6,
            wt.center[2] + dirZ * offsetAlong + perpZ * offsetPerp,
          );
          dummy.rotation.set(0, wt.yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          pilasters.push(dummy.matrix.clone());
        }
      }
    }

    return { merlonTransforms: merlons, pilasterTransforms: pilasters };
  }, []);

  const { merlonGeo, pilasterGeo, stoneTrimMat, ashlarDarkMat } = useMemo(() => {
    const mGeo = new THREE.BoxGeometry(1.3, 1.35, 0.55);
    const pGeo = new THREE.BoxGeometry(0.95, PERIMETER_WALL_HEIGHT - 0.8, 0.45);
    const trimMat = new THREE.MeshStandardMaterial({
      color: ROMAN_PALETTE.travertine.color,
      roughness: 0.78,
      metalness: 0.04,
      bumpMap: TRAVERTINE_TEXTURE || null,
      bumpScale: 0.014,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#7a6c5a',
      roughness: 0.88,
      metalness: 0.05,
      bumpMap: NOISE_TEXTURE || null,
      bumpScale: 0.018,
    });
    return {
      merlonGeo: mGeo,
      pilasterGeo: pGeo,
      stoneTrimMat: trimMat,
      ashlarDarkMat: darkMat,
    };
  }, []);

  useEffect(() => {
    return () => {
      merlonGeo.dispose();
      pilasterGeo.dispose();
      stoneTrimMat.dispose();
      ashlarDarkMat.dispose();
    };
  }, [merlonGeo, pilasterGeo, stoneTrimMat, ashlarDarkMat]);

  useLayoutEffect(() => {
    if (merlonRef.current) {
      merlonTransforms.forEach((mat, idx) => merlonRef.current!.setMatrixAt(idx, mat));
      merlonRef.current.instanceMatrix.needsUpdate = true;
      merlonRef.current.computeBoundingSphere();
    }
    if (pilasterRef.current) {
      pilasterTransforms.forEach((mat, idx) => pilasterRef.current!.setMatrixAt(idx, mat));
      pilasterRef.current.instanceMatrix.needsUpdate = true;
      pilasterRef.current.computeBoundingSphere();
    }
  }, [merlonTransforms, pilasterTransforms]);

  return (
    <group name="perimeter-wall-instanced-details">
      <instancedMesh
        ref={merlonRef}
        args={[merlonGeo, stoneTrimMat, merlonTransforms.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={pilasterRef}
        args={[pilasterGeo, ashlarDarkMat, pilasterTransforms.length]}
        castShadow
        receiveShadow
      />
    </group>
  );
});

/**
 * Monumental Roman Gatehouse (local +Z faces outward from city, local -Z faces road approach).
 */
const CityGatehouse: React.FC<{ gate: BlueprintGatehouse }> = React.memo(({ gate }) => {
  const portalClearWidth = PERIMETER_GATE_CLEAR_HALF * 2; // 12.8
  const portcullisBars = [-5.4, -4.2, -3.0, -1.8, -0.6, 0.6, 1.8, 3.0, 4.2, 5.4];

  return (
    <group position={gate.position} rotation={[0, gate.rotationY, 0]}>
      {/* Paved stone threshold bay bridging the 12u road under the archway */}
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[portalClearWidth + 0.4, 0.1, 7.6]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.forumPaving.color}
          roughness={0.76}
          bumpMap={TRAVERTINE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>

      {/* Flanking twin guardian towers (left/right of the 12u artery) */}
      {[-9.2, 9.2].map((tx, ti) => (
        <group key={`gate-tower-${ti}`} position={[tx, 0, 0]}>
          {/* Stepped tower podium */}
          <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
            <boxGeometry args={[6.0, 0.8, 7.6]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.82} />
          </mesh>

          {/* Main ashlar watchtower shaft */}
          <mesh castShadow receiveShadow position={[0, 7.2, 0]}>
            <boxGeometry args={[5.4, 13.6, 6.8]} />
            <meshStandardMaterial
              color="#9a8a76"
              roughness={0.85}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.02}
            />
          </mesh>

          {/* Mid-belt travertine string course */}
          <mesh castShadow receiveShadow position={[0, 6.9, 0]}>
            <boxGeometry args={[5.8, 0.4, 7.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.76} />
          </mesh>

          {/* Upper cornice collar */}
          <mesh castShadow receiveShadow position={[0, 13.9, 0]}>
            <boxGeometry args={[6.0, 0.5, 7.4]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.75} />
          </mesh>

          {/* Watchtower crenellations */}
          {[-1.9, 0, 1.9].map((mx, mi) =>
            [-3.3, 3.3].map((mz, mzi) => (
              <mesh key={`tm-${mi}-${mzi}`} castShadow position={[mx, 14.65, mz]}>
                <boxGeometry args={[1.05, 1.1, 0.55]} />
                <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
              </mesh>
            )),
          )}

          {/* Terracotta pyramidal roof & bronze finial */}
          <mesh castShadow position={[0, 15.85, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[4.1, 2.3, 4]} />
            <meshStandardMaterial color={ROMAN_PALETTE.terracottaTile.color} roughness={0.74} />
          </mesh>
          <mesh castShadow position={[0, 17.3, 0]}>
            <cylinderGeometry args={[0.08, 0.14, 0.85, 8]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.goldAccent.color}
              metalness={0.78}
              roughness={0.32}
            />
          </mesh>
        </group>
      ))}

      {/* Central archway bridge span above y=6.4 (leaving clear 12.8 x 6.4 portal) */}
      <mesh castShadow receiveShadow position={[0, 8.9, 0]}>
        <boxGeometry args={[portalClearWidth, 5.0, 6.0]} />
        <meshStandardMaterial
          color="#a89882"
          roughness={0.82}
          bumpMap={TRAVERTINE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>

      {/* Coffered dark timber archway ceiling */}
      <mesh position={[0, 6.38, 0]}>
        <boxGeometry args={[portalClearWidth, 0.12, 6.1]} />
        <meshStandardMaterial color={ROMAN_PALETTE.darkStructuralTimber.color} roughness={0.92} />
      </mesh>

      {/* Attic gold/bronze SPQR entablature frieze & travertine cap */}
      <mesh castShadow position={[0, 11.85, 0]}>
        <boxGeometry args={[portalClearWidth + 0.6, 1.1, 6.4]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.goldAccent.color}
          metalness={0.76}
          roughness={0.34}
        />
      </mesh>
      <mesh castShadow position={[0, 12.6, 0]}>
        <boxGeometry args={[portalClearWidth + 1.2, 0.45, 6.8]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.74} />
      </mesh>

      {/* Parapet merlons atop the central gatehouse arch */}
      {[-4.8, -2.4, 0, 2.4, 4.8].map((ax, ai) =>
        [-3.0, 3.0].map((az, azi) => (
          <mesh key={`arch-merlon-${ai}-${azi}`} castShadow position={[ax, 13.35, az]}>
            <boxGeometry args={[1.2, 1.1, 0.55]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.76} />
          </mesh>
        )),
      )}

      {/* Classical Corinthian engaged columns & golden keystones on BOTH city (-Z) & desert (+Z) facades */}
      {[-3.15, 3.15].map((fz, fzi) => (
        <group key={`facade-${fzi}`}>
          {[-6.2, 6.2].map((cx, ci) => (
            <ClassicalColumn
              key={`gate-col-${fzi}-${ci}`}
              position={[cx, 0, fz]}
              height={6.4}
              radius={0.32}
              stoneColor={ROMAN_PALETTE.marbleWhite.color}
              capitalColor={ROMAN_PALETTE.goldAccent.color}
              metalness={ROMAN_PALETTE.goldAccent.metalness}
              order="corinthian"
            />
          ))}
          <mesh castShadow position={[0, 6.8, fz]}>
            <boxGeometry args={[0.9, 1.15, 0.35]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.goldAccent.color}
              metalness={0.78}
              roughness={0.32}
            />
          </mesh>
        </group>
      ))}

      {/* Lowered wrought-iron Portcullis Grille at outer threshold (local z = +1.4) */}
      <group position={[0, 0, 1.4]}>
        {portcullisBars.map((bx, bi) => (
          <mesh key={`pbar-${bi}`} castShadow position={[bx, 3.2, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 6.3, 6]} />
            <meshStandardMaterial color={ROMAN_PALETTE.darkIron.color} metalness={0.82} roughness={0.46} />
          </mesh>
        ))}
        {[1.1, 3.2, 5.2].map((hy, hi) => (
          <mesh key={`pbeam-${hi}`} castShadow position={[0, hy, 0]}>
            <boxGeometry args={[portalClearWidth - 0.3, 0.18, 0.16]} />
            <meshStandardMaterial color={ROMAN_PALETTE.darkIron.color} metalness={0.82} roughness={0.48} />
          </mesh>
        ))}
      </group>

      {/* Inward approach glowing bronze braziers */}
      {[-6.3, 6.3].map((bx, bi) => (
        <group key={`gate-brazier-${bi}`} position={[bx, 2.7, -3.65]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.24, 0.14, 0.65, 8]} />
            <meshStandardMaterial color={ROMAN_PALETTE.agedBronze.color} metalness={0.76} roughness={0.42} />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.22, 8, 8]} />
            <meshStandardMaterial
              color="#fb923c"
              emissive="#f97316"
              emissiveIntensity={1.6}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/** Multi-part fortified Roman watchtower bastion at (±200, ±200). */
const CornerBastion: React.FC<{ bastion: BlueprintCornerBastion }> = React.memo(({ bastion }) => {
  return (
    <group position={bastion.position} rotation={[0, bastion.rotationY, 0]}>
      {/* Stepped ashlar foundation plinth */}
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[11.4, 1.2, 11.4]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.84} />
      </mesh>

      {/* Main square bastion shaft */}
      <mesh castShadow receiveShadow position={[0, 7.2, 0]}>
        <boxGeometry args={[9.8, 12.4, 9.8]} />
        <meshStandardMaterial
          color="#92826f"
          roughness={0.86}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.022}
        />
      </mesh>

      {/* Mid-level string course */}
      <mesh castShadow receiveShadow position={[0, 7.6, 0]}>
        <boxGeometry args={[10.3, 0.45, 10.3]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
      </mesh>

      {/* Overhanging upper machicolation gallery */}
      <mesh castShadow receiveShadow position={[0, 13.5, 0]}>
        <boxGeometry args={[10.8, 0.65, 10.8]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.76} />
      </mesh>

      {/* Corner bastion merlons */}
      {[
        [-4.9, -4.9],
        [0, -4.9],
        [4.9, -4.9],
        [4.9, 0],
        [4.9, 4.9],
        [0, 4.9],
        [-4.9, 4.9],
        [-4.9, 0],
      ].map(([mx, mz], idx) => (
        <mesh key={`bm-${idx}`} castShadow position={[mx, 14.4, mz]}>
          <boxGeometry args={[1.35, 1.25, 1.35]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
        </mesh>
      ))}

      {/* Terracotta hipped watchtower roof + bronze finial */}
      <mesh castShadow position={[0, 15.7, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[7.4, 3.0, 4]} />
        <meshStandardMaterial color={ROMAN_PALETTE.terracottaTileDark.color} roughness={0.76} />
      </mesh>
      <mesh castShadow position={[0, 17.6, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 1.1, 8]} />
        <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.78} roughness={0.32} />
      </mesh>
    </group>
  );
});

/**
 * North Citadel Flank Integration Towers + Stepped Earth-Wall Buttresses at [±36, 0, -200].
 * Ties the z = -200 northern perimeter walls cleanly into the slopes of NorthernMotte.
 */
const CitadelFlankTieIn: React.FC = React.memo(() => {
  return (
    <group name="citadel-wall-tie-in">
      {([-1, 1] as const).map((sign) => (
        <group key={`citadel-join-${sign}`} position={[sign * PERIMETER_CITADEL_JOIN_X, 0, -PERIMETER_WALL_BOUND]}>
          {/* Deep stone abutment tower seated along the moat shoreline */}
          <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
            <boxGeometry args={[8.4, 1.5, 8.4]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.86} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 6.8, 0]}>
            <boxGeometry args={[7.2, 12.0, 7.2]} />
            <meshStandardMaterial
              color="#92826f"
              roughness={0.86}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.02}
            />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 12.95, 0]}>
            <boxGeometry args={[7.8, 0.55, 7.8]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.76} />
          </mesh>
          <mesh castShadow position={[0, 14.3, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[5.2, 2.3, 4]} />
            <meshStandardMaterial color={ROMAN_PALETTE.terracottaTile.color} roughness={0.75} />
          </mesh>

          {/* Stepped wing rampart climbing inward along z = -200..-194 onto the motte flank */}
          <mesh castShadow receiveShadow position={[-sign * 6.5, 5.2, 3.2]}>
            <boxGeometry args={[10.5, 10.6, 3.0]} />
            <meshStandardMaterial
              color="#877865"
              roughness={0.88}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.02}
            />
          </mesh>
          <mesh castShadow receiveShadow position={[-sign * 6.5, 10.65, 3.2]}>
            <boxGeometry args={[10.8, 0.4, 3.4]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

export const BlueprintPerimeterWalls: React.FC = React.memo(() => {
  return (
    <group name="blueprint-perimeter-walls">
      {BLUEPRINT_WALL_SEGMENTS.map((seg) => (
        <CurtainWallBody key={seg.id} segment={seg} />
      ))}
      <CurtainWallInstancedDetails />
      {BLUEPRINT_CORNER_BASTIONS.map((bastion) => (
        <CornerBastion key={bastion.id} bastion={bastion} />
      ))}
      {BLUEPRINT_GATEHOUSES.map((gate) => (
        <CityGatehouse key={gate.id} gate={gate} />
      ))}
      <CitadelFlankTieIn />
    </group>
  );
});
