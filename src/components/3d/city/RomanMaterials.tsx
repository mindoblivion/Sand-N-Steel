import * as THREE from 'three';

/**
 * ROMAN MATERIAL PALETTE & SURFACE REALISM SYSTEM
 * Centralized, controlled Roman / Mediterranean architectural materials.
 * Calibrated for high roughness, authentic earth pigments, weathered stone,
 * muted terracotta, seasoned timber, patinated bronze, and paved road flagstones.
 */

// Singleton procedural textures for tactile micro-relief (0 network cost, ~64KB memory each)
let sharedNoiseTexture: THREE.CanvasTexture | null = null;
let sharedTravertineTexture: THREE.CanvasTexture | null = null;
let sharedSandTexture: THREE.CanvasTexture | null = null;

const createProceduralCanvas = (width: number, height: number, type: 'noise' | 'travertine' | 'sand'): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    let v = 128;
    if (type === 'noise') {
        v = 128 + Math.floor((Math.random() - 0.5) * 32);
    } else if (type === 'travertine') {
        // Horizontal stratification simulation
        const y = Math.floor(i / 4 / width);
        const noise = Math.floor((Math.random() - 0.5) * 40);
        v = 140 + Math.floor(Math.sin(y * 0.5) * 20) + noise;
    } else if (type === 'sand') {
        // Grainy sand distribution
        v = 180 + Math.floor((Math.random() - 0.5) * 60);
    }

    imgData.data[i] = v;
    imgData.data[i + 1] = v;
    imgData.data[i + 2] = v;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
};

const getSharedNoiseTexture = (): THREE.CanvasTexture | null => {
  if (sharedNoiseTexture) return sharedNoiseTexture;
  if (typeof document === 'undefined') return null;
  const tex = new THREE.CanvasTexture(createProceduralCanvas(128, 128, 'noise'));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  sharedNoiseTexture = tex;
  return tex;
};

const getTravertineTexture = (): THREE.CanvasTexture | null => {
  if (sharedTravertineTexture) return sharedTravertineTexture;
  if (typeof document === 'undefined') return null;
  const tex = new THREE.CanvasTexture(createProceduralCanvas(256, 256, 'travertine'));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  sharedTravertineTexture = tex;
  return tex;
};

const getSandTexture = (): THREE.CanvasTexture | null => {
  if (sharedSandTexture) return sharedSandTexture;
  if (typeof document === 'undefined') return null;
  const tex = new THREE.CanvasTexture(createProceduralCanvas(256, 256, 'sand'));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  sharedSandTexture = tex;
  return tex;
};

export const NOISE_TEXTURE = getSharedNoiseTexture();
export const TRAVERTINE_TEXTURE = getTravertineTexture();
export const SAND_TEXTURE = getSandTexture();

/**
 * Standardized Roman Material Definitions (Color, Roughness, Metalness, Bump)
 */
export const ROMAN_PALETTE = {
  // 1. STONE & MARBLE
  travertine: {
    color: '#ebdcb9',
    roughness: 0.78,
    metalness: 0.04,
    bumpMap: TRAVERTINE_TEXTURE || undefined,
    bumpScale: 0.02,
  },
  travertineDark: {
    color: '#dfcfb7',
    roughness: 0.82,
    metalness: 0.04,
    bumpMap: TRAVERTINE_TEXTURE || undefined,
    bumpScale: 0.025,
  },
  ashlarStone: {
    color: '#544e47',
    roughness: 0.88,
    metalness: 0.05,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.018,
  },
  ashlarLight: {
    color: '#78716c',
    roughness: 0.82,
    metalness: 0.04,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.014,
  },
  marbleWhite: {
    color: '#f6f2ea',
    roughness: 0.45,
    metalness: 0.06,
    bumpMap: TRAVERTINE_TEXTURE || undefined,
    bumpScale: 0.005,
  },
  marbleGrey: {
    color: '#cbd5e1',
    roughness: 0.52,
    metalness: 0.06,
    bumpMap: TRAVERTINE_TEXTURE || undefined,
    bumpScale: 0.005,
  },

  // 2. PLASTER & STUCCO
  stuccoWarm: {
    color: '#f3e8d5',
    roughness: 0.84,
    metalness: 0.02,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.014,
  },
  stuccoSand: {
    color: '#ebdcb9',
    roughness: 0.85,
    metalness: 0.02,
    bumpMap: SAND_TEXTURE || undefined,
    bumpScale: 0.015,
  },
  stuccoTerracotta: {
    color: '#b46237',
    roughness: 0.82,
    metalness: 0.02,
  },

  // 3. BRICK & TERRACOTTA
  romanBrick: {
    color: '#824632',
    roughness: 0.86,
    metalness: 0.04,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.018,
  },
  terracottaTile: {
    color: '#8f3e26',
    roughness: 0.74,
    metalness: 0.04,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.015,
  },
  terracottaTileDark: {
    color: '#76311d',
    roughness: 0.78,
    metalness: 0.04,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.016,
  },
  terracottaTileAged: {
    color: '#9e492f',
    roughness: 0.72,
    metalness: 0.04,
  },

  // 4. TIMBER & WOOD
  weatheredTimber: {
    color: '#442e1d',
    roughness: 0.88,
    metalness: 0.02,
  },
  darkStructuralTimber: {
    color: '#2a1c12',
    roughness: 0.92,
    metalness: 0.02,
  },
  agedPine: {
    color: '#654321',
    roughness: 0.85,
    metalness: 0.02,
  },

  // 5. METALS
  darkIron: {
    color: '#2b2a29',
    roughness: 0.48,
    metalness: 0.82,
  },
  agedBronze: {
    color: '#4c3e30',
    roughness: 0.42,
    metalness: 0.76,
  },
  goldAccent: {
    color: '#b89547',
    roughness: 0.34,
    metalness: 0.78,
  },

  // 6. ROAD STONE & GROUND
  roadFlagstone: {
    color: '#a89882',
    roughness: 0.82,
    metalness: 0.03,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.02,
  },
  roadKerb: {
    color: '#d6c4aa',
    roughness: 0.76,
    metalness: 0.04,
  },
  forumPaving: {
    color: '#e4d8c5',
    roughness: 0.68,
    metalness: 0.05,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.012,
  },
  imperialRunner: {
    color: '#6e1828',
    roughness: 0.68,
    metalness: 0.06,
  },
  arenaSand: {
    color: '#cda270',
    roughness: 0.94,
    metalness: 0.02,
  },
  roadMortarBed: {
    color: '#3d3730',
    roughness: 0.94,
    metalness: 0.02,
  },
  basaltPaving: {
    color: '#554f49',
    roughness: 0.86,
    metalness: 0.04,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.022,
  },
  roadGutter: {
    color: '#6e6356',
    roughness: 0.85,
    metalness: 0.03,
  },
  wheelRut: {
    color: '#7a6e60',
    roughness: 0.62,
    metalness: 0.05,
  },
  crossingStone: {
    color: '#d8c6a9',
    roughness: 0.74,
    metalness: 0.03,
    bumpMap: NOISE_TEXTURE || undefined,
    bumpScale: 0.015,
  },

  // 7. ARCHITECTURAL INTERIOR RECESSED VOID
  recessDark: {
    color: '#131110',
    roughness: 0.96,
    metalness: 0.02,
  },

  // 8. GLAZED CERAMIC TILES (Ishtar Gatehouse Roman-Provincial Glazed Ceramic)
  glazedLapis: {
    color: '#1a3b5c',
    roughness: 0.42,
    metalness: 0.16,
  },
  glazedLapisTower: {
    color: '#16314e',
    roughness: 0.45,
    metalness: 0.16,
  },
};

/**
 * Pre-instantiated shared THREE.MeshStandardMaterial instances
 * for maximum performance and GPU state reuse across city tiles.
 */
export const sharedMaterials = {
  travertine: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.travertine.color,
    roughness: ROMAN_PALETTE.travertine.roughness,
    bumpMap: NOISE_TEXTURE || null,
    bumpScale: 0.012,
  }),
  travertineDark: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.travertineDark.color,
    roughness: ROMAN_PALETTE.travertineDark.roughness,
    bumpMap: NOISE_TEXTURE || null,
    bumpScale: 0.015,
  }),
  ashlarStone: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.ashlarStone.color,
    roughness: ROMAN_PALETTE.ashlarStone.roughness,
    bumpMap: NOISE_TEXTURE || null,
    bumpScale: 0.018,
  }),
  ashlarLight: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.ashlarLight.color,
    roughness: ROMAN_PALETTE.ashlarLight.roughness,
  }),
  stuccoWarm: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.stuccoWarm.color,
    roughness: ROMAN_PALETTE.stuccoWarm.roughness,
  }),
  stuccoSand: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.stuccoSand.color,
    roughness: ROMAN_PALETTE.stuccoSand.roughness,
  }),
  romanBrick: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.romanBrick.color,
    roughness: ROMAN_PALETTE.romanBrick.roughness,
  }),
  terracottaTile: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.terracottaTile.color,
    roughness: ROMAN_PALETTE.terracottaTile.roughness,
    bumpMap: NOISE_TEXTURE || null,
    bumpScale: 0.015,
  }),
  terracottaTileDark: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.terracottaTileDark.color,
    roughness: ROMAN_PALETTE.terracottaTileDark.roughness,
  }),
  weatheredTimber: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.weatheredTimber.color,
    roughness: ROMAN_PALETTE.weatheredTimber.roughness,
  }),
  darkStructuralTimber: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.darkStructuralTimber.color,
    roughness: ROMAN_PALETTE.darkStructuralTimber.roughness,
  }),
  darkIron: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.darkIron.color,
    roughness: ROMAN_PALETTE.darkIron.roughness,
    metalness: ROMAN_PALETTE.darkIron.metalness,
  }),
  agedBronze: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.agedBronze.color,
    roughness: ROMAN_PALETTE.agedBronze.roughness,
    metalness: ROMAN_PALETTE.agedBronze.metalness,
  }),
  goldAccent: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.goldAccent.color,
    roughness: ROMAN_PALETTE.goldAccent.roughness,
    metalness: ROMAN_PALETTE.goldAccent.metalness,
  }),
  roadFlagstone: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.roadFlagstone.color,
    roughness: ROMAN_PALETTE.roadFlagstone.roughness,
    bumpMap: NOISE_TEXTURE || null,
    bumpScale: 0.02,
  }),
  roadKerb: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.roadKerb.color,
    roughness: ROMAN_PALETTE.roadKerb.roughness,
  }),
  roadMortarBed: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.roadMortarBed.color,
    roughness: ROMAN_PALETTE.roadMortarBed.roughness,
  }),
  basaltPaving: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.basaltPaving.color,
    roughness: ROMAN_PALETTE.basaltPaving.roughness,
    bumpMap: NOISE_TEXTURE || null,
    bumpScale: 0.022,
  }),
  roadGutter: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.roadGutter.color,
    roughness: ROMAN_PALETTE.roadGutter.roughness,
  }),
  wheelRut: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.wheelRut.color,
    roughness: ROMAN_PALETTE.wheelRut.roughness,
  }),
  crossingStone: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.crossingStone.color,
    roughness: ROMAN_PALETTE.crossingStone.roughness,
    bumpMap: NOISE_TEXTURE || null,
    bumpScale: 0.015,
  }),
  recessDark: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.recessDark.color,
    roughness: ROMAN_PALETTE.recessDark.roughness,
  }),
  glazedLapis: new THREE.MeshStandardMaterial({
    color: ROMAN_PALETTE.glazedLapis.color,
    roughness: ROMAN_PALETTE.glazedLapis.roughness,
    metalness: ROMAN_PALETTE.glazedLapis.metalness,
  }),
};
