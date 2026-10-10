import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';

// ---------------------------------------------------------------------------
// 1. ROMAN GABLED / HIP ROOF SYSTEM
// ---------------------------------------------------------------------------

interface RomanGabledRoofProps {
  /** Width of the wall footprint beneath the roof (X dimension) */
  width: number;
  /** Depth of the wall footprint beneath the roof (Z dimension) */
  depth: number;
  /** Height of the ridge peak above the eave line */
  height?: number;
  /** Horizontal eave overhang beyond wall footprint (default 0.35m) */
  eaveOverhang?: number;
  /** Axis along which the main ridge line runs: 'z' (standard) or 'x' */
  ridgeAlong?: 'z' | 'x';
  /** Position offset of the roof base [x, y, z] */
  position?: [number, number, number];
  /** Terracotta tile material color */
  tileColor?: string;
  /** Stone / timber eave trim color */
  trimColor?: string;
  /** Gable tympanum infill wall color */
  tympanumColor?: string;
}

/**
 * Procedural low-poly Roman / Mediterranean gabled terracotta roof.
 * Replaces crude 45-degree rotated cubes with authentic low-pitch rafter slopes,
 * projecting eaves, fascia boards, ridge cap, and enclosed pediment tympanums.
 */
export const RomanGabledRoof: React.FC<RomanGabledRoofProps> = ({
  width,
  depth,
  height = 1.35,
  eaveOverhang = 0.35,
  ridgeAlong = 'z',
  position = [0, 0, 0],
  tileColor = ROMAN_PALETTE.terracottaTile.color,
  trimColor = ROMAN_PALETTE.travertine.color,
  tympanumColor = ROMAN_PALETTE.stuccoSand.color,
}) => {
  const isZAxis = ridgeAlong === 'z';
  const span = isZAxis ? width : depth;
  const length = isZAxis ? depth : width;

  const halfSpan = span / 2 + eaveOverhang;
  const fullLength = length + eaveOverhang * 2;
  const slopeAngle = Math.atan2(height, halfSpan);
  const rafterLength = Math.hypot(halfSpan, height);
  const tileThickness = 0.15;

  // Triangular gable end shape for closing front & back tympanums
  const tympanumShape = useMemo(() => {
    const shape = new THREE.Shape();
    const halfBase = span / 2;
    shape.moveTo(-halfBase, 0);
    shape.lineTo(halfBase, 0);
    shape.lineTo(0, height);
    shape.closePath();
    return shape;
  }, [span, height]);

  return (
    <group position={position}>
      {/* HORIZONTAL EAVE FASCIA / BEARING CORNICE UNDER ROOF */}
      <mesh castShadow receiveShadow position={[0, -0.08, 0]}>
        <boxGeometry args={[width + eaveOverhang * 1.2, 0.16, depth + eaveOverhang * 1.2]} />
        <meshStandardMaterial color={trimColor} roughness={0.78} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>

      {isZAxis ? (
        <>
          {/* LEFT SLOPING TERRACOTTA ROOF PLANE */}
          <mesh
            castShadow
            receiveShadow
            position={[-halfSpan / 2, height / 2 + 0.04, 0]}
            rotation={[0, 0, -slopeAngle]}
          >
            <boxGeometry args={[rafterLength, tileThickness, fullLength]} />
            <meshStandardMaterial color={tileColor} roughness={0.75} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.015} />
          </mesh>

          {/* RIGHT SLOPING TERRACOTTA ROOF PLANE */}
          <mesh
            castShadow
            receiveShadow
            position={[halfSpan / 2, height / 2 + 0.04, 0]}
            rotation={[0, 0, slopeAngle]}
          >
            <boxGeometry args={[rafterLength, tileThickness, fullLength]} />
            <meshStandardMaterial color={tileColor} roughness={0.75} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.015} />
          </mesh>

          {/* RIDGE CAP BEAM (COLUMEN / IMBREX RIDGE TILES) */}
          <mesh castShadow position={[0, height + tileThickness / 2 + 0.02, 0]}>
            <boxGeometry args={[0.32, 0.18, fullLength + 0.08]} />
            <meshStandardMaterial color={ROMAN_PALETTE.terracottaTileDark.color} roughness={0.78} />
          </mesh>

          {/* FRONT GABLE TYMPANUM WALL */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0, depth / 2 + 0.02]}
            rotation={[0, 0, 0]}
          >
            <shapeGeometry args={[tympanumShape]} />
            <meshStandardMaterial color={tympanumColor} roughness={0.82} side={THREE.DoubleSide} />
          </mesh>

          {/* REAR GABLE TYMPANUM WALL */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0, -depth / 2 - 0.02]}
            rotation={[0, Math.PI, 0]}
          >
            <shapeGeometry args={[tympanumShape]} />
            <meshStandardMaterial color={tympanumColor} roughness={0.82} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : (
        <>
          {/* FRONT SLOPING TERRACOTTA ROOF PLANE */}
          <mesh
            castShadow
            receiveShadow
            position={[0, height / 2 + 0.04, halfSpan / 2]}
            rotation={[-slopeAngle, 0, 0]}
          >
            <boxGeometry args={[fullLength, tileThickness, rafterLength]} />
            <meshStandardMaterial color={tileColor} roughness={0.75} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.015} />
          </mesh>

          {/* REAR SLOPING TERRACOTTA ROOF PLANE */}
          <mesh
            castShadow
            receiveShadow
            position={[0, height / 2 + 0.04, -halfSpan / 2]}
            rotation={[slopeAngle, 0, 0]}
          >
            <boxGeometry args={[fullLength, tileThickness, rafterLength]} />
            <meshStandardMaterial color={tileColor} roughness={0.75} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.015} />
          </mesh>

          {/* RIDGE CAP BEAM */}
          <mesh castShadow position={[0, height + tileThickness / 2 + 0.02, 0]}>
            <boxGeometry args={[fullLength + 0.08, 0.18, 0.32]} />
            <meshStandardMaterial color={ROMAN_PALETTE.terracottaTileDark.color} roughness={0.78} />
          </mesh>

          {/* LEFT GABLE TYMPANUM WALL */}
          <mesh
            castShadow
            receiveShadow
            position={[-width / 2 - 0.02, 0, 0]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <shapeGeometry args={[tympanumShape]} />
            <meshStandardMaterial color={tympanumColor} roughness={0.82} side={THREE.DoubleSide} />
          </mesh>

          {/* RIGHT GABLE TYMPANUM WALL */}
          <mesh
            castShadow
            receiveShadow
            position={[width / 2 + 0.02, 0, 0]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <shapeGeometry args={[tympanumShape]} />
            <meshStandardMaterial color={tympanumColor} roughness={0.82} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// 2. CLASSICAL ROMAN PEDIMENT (MONUMENTAL PORTAL / TEMPLE GABLE)
// ---------------------------------------------------------------------------

interface ClassicalPedimentProps {
  /** Width of the portico pediment base */
  width: number;
  /** Depth of the pediment entablature */
  depth: number;
  /** Peak rise height (default 1.2m) */
  height?: number;
  /** Position offset [x, y, z] */
  position?: [number, number, number];
  /** Marble / travertine stone color */
  stoneColor?: string;
  /** Raking cornice roof tile or bronze accent color */
  trimColor?: string;
}

export const ClassicalPediment: React.FC<ClassicalPedimentProps> = ({
  width,
  depth,
  height = 1.2,
  position = [0, 0, 0],
  stoneColor = ROMAN_PALETTE.travertine.color,
  trimColor = ROMAN_PALETTE.terracottaTile.color,
}) => {
  const halfBase = width / 2;
  const slopeAngle = Math.atan2(height, halfBase);
  const rafterLen = Math.hypot(halfBase, height);

  const tympanumShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-halfBase + 0.15, 0);
    shape.lineTo(halfBase - 0.15, 0);
    shape.lineTo(0, height - 0.1);
    shape.closePath();
    return shape;
  }, [halfBase, height]);

  return (
    <group position={position}>
      {/* 1. HORIZONTAL ENTABLATURE & GEISON CORNICE */}
      <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
        <boxGeometry args={[width + 0.4, 0.3, depth + 0.2]} />
        <meshStandardMaterial color={stoneColor} roughness={0.78} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      {/* Dentil / Frieze Band */}
      <mesh position={[0, -0.15, depth / 2 + 0.02]}>
        <boxGeometry args={[width + 0.2, 0.25, 0.15]} />
        <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.75} roughness={0.34} />
      </mesh>

      {/* 2. RECESSED TYMPANUM TRIANGLE */}
      <mesh position={[0, 0.3, depth / 2 - 0.05]}>
        <shapeGeometry args={[tympanumShape]} />
        <meshStandardMaterial color={stoneColor} roughness={0.82} side={THREE.DoubleSide} />
      </mesh>

      {/* 3. LEFT RAKING CORNICE */}
      <mesh
        castShadow
        position={[-halfBase / 2, 0.3 + height / 2, 0]}
        rotation={[0, 0, -slopeAngle]}
      >
        <boxGeometry args={[rafterLen + 0.2, 0.22, depth + 0.35]} />
        <meshStandardMaterial color={trimColor} roughness={0.75} />
      </mesh>

      {/* 4. RIGHT RAKING CORNICE */}
      <mesh
        castShadow
        position={[halfBase / 2, 0.3 + height / 2, 0]}
        rotation={[0, 0, slopeAngle]}
      >
        <boxGeometry args={[rafterLen + 0.2, 0.22, depth + 0.35]} />
        <meshStandardMaterial color={trimColor} roughness={0.75} />
      </mesh>

      {/* 5. APEX ACROTERION FINIAL */}
      <mesh castShadow position={[0, 0.3 + height + 0.16, depth / 2 + 0.05]}>
        <boxGeometry args={[0.35, 0.32, 0.35]} />
        <meshStandardMaterial color={ROMAN_PALETTE.goldAccent.color} metalness={0.75} roughness={0.34} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// 3. CLASSICAL COLUMN WITH STEPPED BASE & CAPITAL
// ---------------------------------------------------------------------------

interface ClassicalColumnProps {
  position: [number, number, number];
  height: number;
  radius?: number;
  stoneColor?: string;
  capitalColor?: string;
  order?: 'tuscan' | 'corinthian' | 'doric';
}

export const ClassicalColumn: React.FC<ClassicalColumnProps> = ({
  position,
  height,
  radius = 0.18,
  stoneColor = ROMAN_PALETTE.marbleWhite.color,
  capitalColor = ROMAN_PALETTE.travertine.color,
  order = 'tuscan',
}) => {
  const plinthHeight = Math.min(0.25, height * 0.07);
  const capitalHeight = Math.min(0.32, height * 0.09);
  const shaftHeight = height - plinthHeight - capitalHeight;
  const shaftRadiusTop = radius * 0.92;

  return (
    <group position={position}>
      {/* 1. SQUARE PLINTH BASE */}
      <mesh castShadow receiveShadow position={[0, plinthHeight / 2, 0]}>
        <boxGeometry args={[radius * 2.6, plinthHeight, radius * 2.6]} />
        <meshStandardMaterial color={capitalColor} roughness={0.78} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      {/* Torus base ring */}
      <mesh position={[0, plinthHeight + 0.04, 0]}>
        <cylinderGeometry args={[radius * 1.25, radius * 1.35, 0.08, 12]} />
        <meshStandardMaterial color={capitalColor} roughness={0.74} />
      </mesh>

      {/* 2. TAPERED SHAFT */}
      <mesh
        castShadow
        receiveShadow
        position={[0, plinthHeight + 0.08 + shaftHeight / 2, 0]}
      >
        <cylinderGeometry args={[shaftRadiusTop, radius, shaftHeight, 14]} />
        <meshStandardMaterial color={stoneColor} roughness={0.55} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.008} />
      </mesh>

      {/* 3. ASTRAGAL / NECKING RING */}
      <mesh position={[0, height - capitalHeight - 0.02, 0]}>
        <cylinderGeometry args={[shaftRadiusTop * 1.15, shaftRadiusTop * 1.15, 0.06, 12]} />
        <meshStandardMaterial color={capitalColor} roughness={0.65} />
      </mesh>

      {/* 4. CAPITAL & ABACUS BLOCK */}
      <mesh castShadow position={[0, height - capitalHeight / 2, 0]}>
        {order === 'corinthian' ? (
          <cylinderGeometry args={[radius * 1.5, shaftRadiusTop, capitalHeight, 12]} />
        ) : (
          <cylinderGeometry args={[radius * 1.3, shaftRadiusTop, capitalHeight, 12]} />
        )}
        <meshStandardMaterial color={capitalColor} roughness={0.65} />
      </mesh>
      {/* Square abacus block atop capital */}
      <mesh castShadow position={[0, height - 0.04, 0]}>
        <boxGeometry args={[radius * 2.5, 0.08, radius * 2.5]} />
        <meshStandardMaterial color={capitalColor} roughness={0.72} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// 4. ARCHITECTURAL DOORWAY (FRAMED RECESSED OPENING)
// ---------------------------------------------------------------------------

interface ClassicalDoorwayProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  depth?: number;
  stoneColor?: string;
  recessColor?: string;
  hasArchHeader?: boolean;
  wearTone?: 'sand' | 'dust' | 'forge' | 'none';
}

export const ClassicalDoorway: React.FC<ClassicalDoorwayProps> = ({
  position,
  rotation = [0, 0, 0],
  width = 1.4,
  height = 2.4,
  depth = 0.4,
  stoneColor = ROMAN_PALETTE.travertine.color,
  recessColor = ROMAN_PALETTE.recessDark.color,
  hasArchHeader = false,
  wearTone = 'dust',
}) => {
  const jambWidth = 0.22;
  const lintelHeight = 0.28;

  // Dust color for threshold flanks
  const dustColor =
    wearTone === 'sand'
      ? ROMAN_PALETTE.arenaSand.color
      : wearTone === 'forge'
      ? '#3f3833'
      : '#ab977e';

  return (
    <group position={position} rotation={rotation}>
      {/* DARK RECESSED INTERIOR OPENING (REAL DEPTH SHADOW) */}
      <mesh position={[0, height / 2, -depth / 4]}>
        <boxGeometry args={[width, height, depth / 2]} />
        <meshStandardMaterial color={recessColor} roughness={0.96} />
      </mesh>

      {/* RAISED STONE THRESHOLD */}
      <mesh position={[0, 0.06, 0.05]}>
        <boxGeometry args={[width + jambWidth * 2 + 0.1, 0.12, depth + 0.15]} />
        <meshStandardMaterial color={stoneColor} roughness={0.82} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.015} />
      </mesh>

      {/* Phase 25: Slightly worn threshold contact step transitioning to street */}
      <mesh receiveShadow position={[0, 0.02, depth / 2 + 0.12]}>
        <boxGeometry args={[width + jambWidth * 2, 0.04, 0.25]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.86} />
      </mesh>

      {/* Phase 25: Subtle foot-worn patina on threshold surface */}
      <mesh receiveShadow position={[0, 0.041, depth / 2 + 0.12]}>
        <boxGeometry args={[width * 0.7, 0.005, 0.18]} />
        <meshStandardMaterial color={ROMAN_PALETTE.ashlarLight.color} roughness={0.75} />
      </mesh>

      {/* Phase 25: Flanking dust accumulations beside threshold */}
      {wearTone !== 'none' && (
        <>
          <mesh receiveShadow position={[-width / 2 - jambWidth - 0.12, 0.012, depth / 2 + 0.08]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.35, 0.35]} />
            <meshStandardMaterial color={dustColor} roughness={0.94} />
          </mesh>
          <mesh receiveShadow position={[width / 2 + jambWidth + 0.12, 0.012, depth / 2 + 0.08]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.35, 0.35]} />
            <meshStandardMaterial color={dustColor} roughness={0.94} />
          </mesh>
        </>
      )}

      {/* LEFT STONE JAMB */}
      <mesh castShadow position={[-width / 2 - jambWidth / 2, height / 2, 0.02]}>
        <boxGeometry args={[jambWidth, height, depth]} />
        <meshStandardMaterial color={stoneColor} roughness={0.78} />
      </mesh>

      {/* RIGHT STONE JAMB */}
      <mesh castShadow position={[width / 2 + jambWidth / 2, height / 2, 0.02]}>
        <boxGeometry args={[jambWidth, height, depth]} />
        <meshStandardMaterial color={stoneColor} roughness={0.78} />
      </mesh>

      {/* STONE LINTEL BEAM */}
      <mesh castShadow position={[0, height + lintelHeight / 2, 0.04]}>
        <boxGeometry args={[width + jambWidth * 2 + 0.2, lintelHeight, depth + 0.06]} />
        <meshStandardMaterial color={stoneColor} roughness={0.75} />
      </mesh>

      {/* PROJECTING CORNICE CAP */}
      <mesh castShadow position={[0, height + lintelHeight + 0.05, 0.06]}>
        <boxGeometry args={[width + jambWidth * 2 + 0.35, 0.1, depth + 0.12]} />
        <meshStandardMaterial color={stoneColor} roughness={0.75} />
      </mesh>

      {/* OPTIONAL ARCHED KEYSTONE LUNETTE */}
      {hasArchHeader && (
        <group position={[0, height + lintelHeight + 0.45, 0.02]}>
          <mesh castShadow>
            <cylinderGeometry
              args={[width * 0.55, width * 0.55, depth, 14, 1, false, 0, Math.PI]}
            />
            <meshStandardMaterial color={stoneColor} roughness={0.78} />
          </mesh>
          {/* Central Keystone Block */}
          <mesh castShadow position={[0, width * 0.52, 0.04]}>
            <boxGeometry args={[0.26, 0.35, depth + 0.08]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.75} />
          </mesh>
        </group>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// 5. ARCHITECTURAL WINDOW (STONE FRAME, SILL & RECESSED VOID)
// ---------------------------------------------------------------------------

interface ClassicalWindowProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  stoneColor?: string;
  recessColor?: string;
}

export const ClassicalWindow: React.FC<ClassicalWindowProps> = ({
  position,
  rotation = [0, 0, 0],
  width = 0.8,
  height = 1.1,
  stoneColor = ROMAN_PALETTE.travertine.color,
  recessColor = ROMAN_PALETTE.recessDark.color,
}) => {
  const frameThickness = 0.12;

  return (
    <group position={position} rotation={rotation}>
      {/* RECESSED DARK VOID */}
      <mesh position={[0, 0, -0.06]}>
        <boxGeometry args={[width, height, 0.14]} />
        <meshStandardMaterial color={recessColor} roughness={0.96} />
      </mesh>

      {/* PROJECTING SILL */}
      <mesh castShadow position={[0, -height / 2 - 0.04, 0.06]}>
        <boxGeometry args={[width + frameThickness * 2 + 0.16, 0.09, 0.22]} />
        <meshStandardMaterial color={stoneColor} roughness={0.8} />
      </mesh>

      {/* TOP LINTEL */}
      <mesh castShadow position={[0, height / 2 + 0.05, 0.03]}>
        <boxGeometry args={[width + frameThickness * 2 + 0.12, 0.11, 0.16]} />
        <meshStandardMaterial color={stoneColor} roughness={0.78} />
      </mesh>

      {/* LEFT FRAME */}
      <mesh position={[-width / 2 - frameThickness / 2, 0, 0.02]}>
        <boxGeometry args={[frameThickness, height, 0.14]} />
        <meshStandardMaterial color={stoneColor} roughness={0.78} />
      </mesh>

      {/* RIGHT FRAME */}
      <mesh position={[width / 2 + frameThickness / 2, 0, 0.02]}>
        <boxGeometry args={[frameThickness, height, 0.14]} />
        <meshStandardMaterial color={stoneColor} roughness={0.78} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// 6. WALL CORNER QUOINS (MASONRY CORNER BLOCKS)
// ---------------------------------------------------------------------------

interface CornerQuoinsProps {
  height: number;
  /** Width & Depth of the building footprint to attach quoins to */
  buildingSize: [number, number];
  color?: string;
  blockHeight?: number;
}

export const CornerQuoins: React.FC<CornerQuoinsProps> = ({
  height,
  buildingSize,
  color = ROMAN_PALETTE.travertineDark.color,
  blockHeight = 0.5,
}) => {
  const [bw, bd] = buildingSize;
  const count = Math.floor(height / blockHeight);
  const corners: [number, number][] = [
    [-bw / 2, -bd / 2],
    [bw / 2, -bd / 2],
    [-bw / 2, bd / 2],
    [bw / 2, bd / 2],
  ];

  return (
    <group>
      {corners.map(([cx, cz], ci) => (
        <group key={`corner-${ci}`} position={[cx, 0, cz]}>
          {Array.from({ length: count }).map((_, i) => {
            const isLong = i % 2 === 0;
            const y = (i + 0.5) * blockHeight;
            const qx = isLong ? 0.35 : 0.22;
            const qz = isLong ? 0.22 : 0.35;
            return (
              <mesh key={`quoin-${ci}-${i}`} castShadow receiveShadow position={[0, y, 0]}>
                <boxGeometry args={[qx, blockHeight * 0.94, qz]} />
                <meshStandardMaterial color={color} roughness={0.82} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.015} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------------------
// 7. HORIZONTAL WALL STRING COURSE / CORNICE TRIM
// ---------------------------------------------------------------------------

interface WallCorniceProps {
  size: [number, number];
  y: number;
  color?: string;
  height?: number;
  projection?: number;
}

export const WallCornice: React.FC<WallCorniceProps> = ({
  size,
  y,
  color = ROMAN_PALETTE.travertine.color,
  height = 0.18,
  projection = 0.14,
}) => {
  const [w, d] = size;
  return (
    <group position={[0, y, 0]}>
      {/* Front & Rear cornice strips */}
      <mesh castShadow receiveShadow position={[0, 0, d / 2 + projection / 2]}>
        <boxGeometry args={[w + projection * 2, height, projection]} />
        <meshStandardMaterial color={color} roughness={0.78} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0, -d / 2 - projection / 2]}>
        <boxGeometry args={[w + projection * 2, height, projection]} />
        <meshStandardMaterial color={color} roughness={0.78} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      {/* Left & Right cornice strips */}
      <mesh castShadow receiveShadow position={[-w / 2 - projection / 2, 0, 0]}>
        <boxGeometry args={[projection, height, d]} />
        <meshStandardMaterial color={color} roughness={0.78} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      <mesh castShadow receiveShadow position={[w / 2 + projection / 2, 0, 0]}>
        <boxGeometry args={[projection, height, d]} />
        <meshStandardMaterial color={color} roughness={0.78} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
    </group>
  );
};
