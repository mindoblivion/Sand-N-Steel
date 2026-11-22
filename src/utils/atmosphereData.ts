/**
 * atmosphereData.ts — Three.js-free atmosphere definitions and pure resolvers.
 *
 * Keep this module safe for startup/settings imports. Renderer construction and
 * scene mutation remain in atmosphere.ts; the values below are shared by both.
 */
import { TIME_PHASES, type TimePhase } from './timeState';

/** Which body a phase's key light is. Night's key is the moon, in the same light. */
export type PhaseKeyLight = 'sun' | 'moon';

/** One complete rig for one phase: sky, haze, key light, bounce and exposure. */
export interface PhaseLight {
  /** The dome's three gradient stops, and the glow the key light paints around itself. */
  skyZenith: string;
  skyMid: string;
  skyHorizon: string;
  sunGlow: string;
  /** The haze: its colour and its near/far band. See DIRECTOR RULING A above. */
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** The key light: colour, intensity and where it stands. */
  sunColor: string;
  sunIntensity: number;
  /** Degrees above the horizon. */
  sunElevationDeg: number;
  /**
   * Compass bearing in degrees, clockwise from north (+north is −Z), so 247.5 is
   * WSW and 202.5 is SSW. `sunDirection()` turns a pair into a vector.
   */
  sunAzimuthDeg: number;
  /** The hemisphere bounce: sky colour, ground colour, intensity. */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** The tone-mapping exposure the rig is drawn at. */
  exposure: number;
  /** The scene environment's intensity (the PMREM lightformer rig's weight). */
  envIntensity: number;
  /** How much procedural star field the dome paints, 0…1. */
  starAmount: number;
  /** How hard the man-made lights (duel braziers) burn at this hour, 0…1. */
  lampGlow: number;
  /** `sun` by day, `moon` at night — the body `sunColor`/`sunIntensity` describe. */
  keyLight: PhaseKeyLight;
}

/**
 * THE SHIPPED TABLE — seven rows, in cycle order.
 *
 * DIRECTOR RULING A (authoritative, do not "fix"): `fogColor` is a per-row field and
 * drives `scene.fog`; it is NOT re-derived from `skyHorizon`. `golden` and `midday`
 * are the A1 anchor rows and keep A1's shipped fog colours (`#E8C9A0`, `#E3D3AC`),
 * which deliberately differ from their horizons; the five authored rows set
 * `fogColor = skyHorizon`. `dayNightT1.test.ts` pins both halves of that ruling, and
 * the required outcome is that `golden` and `midday` render identically to A1.
 *
 * Azimuths: compass bearings clockwise from north. A1's anchors keep 247.5° / 202.5°;
 * the authored rows step 112.5° (ESE dawn) → 270° (due west dusk) → 45° (the moon,
 * north-east) so the key travels the way a day does.
 */
export const PHASE_LIGHT: Record<TimePhase, PhaseLight> = {
  dawn: {
    skyZenith: '#3E5570',
    skyMid: '#A8908F',
    skyHorizon: '#F2C99B',
    sunGlow: '#FFC98F',
    fogColor: '#F2C99B',
    fogNear: 50,
    fogFar: 175,
    sunColor: '#FFD9AE',
    sunIntensity: 2.2,
    sunElevationDeg: 8,
    sunAzimuthDeg: 112.5,
    hemiSky: '#A8B4C4',
    hemiGround: '#B28E62',
    hemiIntensity: 0.42,
    exposure: 1.08,
    envIntensity: 0.30,
    starAmount: 0.15,
    lampGlow: 0.6,
    keyLight: 'sun',
  },
  morning: {
    skyZenith: '#3C6CA6',
    skyMid: '#86A9C9',
    skyHorizon: '#EBDCBE',
    sunGlow: '#FFF0D2',
    fogColor: '#EBDCBE',
    fogNear: 55,
    fogFar: 185,
    sunColor: '#FFF0D6',
    sunIntensity: 2.8,
    sunElevationDeg: 38,
    sunAzimuthDeg: 135,
    hemiSky: '#B9D2E6',
    hemiGround: '#BEA676',
    hemiIntensity: 0.52,
    exposure: 1.10,
    envIntensity: 0.35,
    starAmount: 0,
    lampGlow: 0.15,
    keyLight: 'sun',
  },
  midday: {
    skyZenith: '#3A6EA8',
    skyMid: '#7FA8CC',
    skyHorizon: '#E9DDBE',
    sunGlow: '#FFF3D6',
    // A1's shipped fog (see DIRECTOR RULING A): deliberately NOT #E9DDBE.
    fogColor: '#E3D3AC',
    fogNear: 55,
    fogFar: 190,
    sunColor: '#FFF2DC',
    sunIntensity: 3.0,
    sunElevationDeg: 62,
    sunAzimuthDeg: 202.5,
    hemiSky: '#BFD6E8',
    hemiGround: '#C2A878',
    hemiIntensity: 0.55,
    exposure: 1.10,
    envIntensity: 0.35,
    starAmount: 0,
    lampGlow: 0,
    keyLight: 'sun',
  },
  afternoon: {
    skyZenith: '#3B659C',
    skyMid: '#93A5BE',
    skyHorizon: '#EFDCB4',
    sunGlow: '#FFE9BC',
    fogColor: '#EFDCB4',
    fogNear: 52,
    fogFar: 182,
    sunColor: '#FFE9BE',
    sunIntensity: 2.85,
    sunElevationDeg: 34,
    sunAzimuthDeg: 225,
    hemiSky: '#AEC4DC',
    hemiGround: '#C0A06E',
    hemiIntensity: 0.50,
    exposure: 1.10,
    envIntensity: 0.35,
    starAmount: 0,
    lampGlow: 0.1,
    keyLight: 'sun',
  },
  golden: {
    skyZenith: '#3D5A86',
    skyMid: '#C99A6B',
    skyHorizon: '#F4C078',
    sunGlow: '#FFD9A0',
    // A1's shipped fog (see DIRECTOR RULING A): deliberately NOT #F4C078.
    fogColor: '#E8C9A0',
    fogNear: 45,
    fogFar: 165,
    sunColor: '#FFBE78',
    sunIntensity: 2.6,
    sunElevationDeg: 14,
    sunAzimuthDeg: 247.5,
    hemiSky: '#93A7C8',
    hemiGround: '#B98A5E',
    hemiIntensity: 0.45,
    exposure: 1.10,
    envIntensity: 0.30,
    starAmount: 0.05,
    lampGlow: 0.35,
    keyLight: 'sun',
  },
  dusk: {
    skyZenith: '#2E3D5E',
    skyMid: '#7A5E6E',
    skyHorizon: '#E88F4E',
    sunGlow: '#FF9E57',
    fogColor: '#E88F4E',
    fogNear: 40,
    fogFar: 140,
    sunColor: '#FF9A4E',
    sunIntensity: 1.5,
    sunElevationDeg: 3,
    sunAzimuthDeg: 270,
    hemiSky: '#6E7FA6',
    hemiGround: '#8A6A4E',
    hemiIntensity: 0.36,
    exposure: 1.06,
    envIntensity: 0.22,
    starAmount: 0.35,
    lampGlow: 0.8,
    keyLight: 'sun',
  },
  night: {
    skyZenith: '#101C30',
    skyMid: '#1E2E47',
    skyHorizon: '#33455E',
    sunGlow: '#D8E4F5',
    fogColor: '#33455E',
    fogNear: 30,
    fogFar: 120,
    // The MOON: the same single directional light, its own colour and intensity.
    sunColor: '#B9C8E8',
    sunIntensity: 0.55,
    sunElevationDeg: 40,
    sunAzimuthDeg: 45,
    hemiSky: '#33456A',
    hemiGround: '#1E2836',
    hemiIntensity: 0.30,
    exposure: 1.02,
    envIntensity: 0.12,
    starAmount: 1.0,
    lampGlow: 1.0,
    keyLight: 'moon',
  },
};

/** The phase a missing or unknown id resolves to (T1's staging default). */
export const DEFAULT_PHASE: TimePhase = 'golden';

/**
 * A1's two SETTINGS spellings. The stored `cityLighting` field keeps them in this
 * slice (it is inert — no renderer reads it), so the two names stay resolvable and
 * the legacy `applyAtmosphere` wrapper still accepts them.
 */
export type AtmosphereProfileName = 'goldenHour' | 'midday';

/** The two legacy settings names, in the settings order. */
export const ATMOSPHERE_NAMES: readonly AtmosphereProfileName[] = ['goldenHour', 'midday'];

/** The legacy name a missing or unknown value resolves to. */
export const DEFAULT_ATMOSPHERE: AtmosphereProfileName = 'goldenHour';

/** Where A1's two profiles live now: one row each. */
export const A1_PHASE_BY_PROFILE: Record<AtmosphereProfileName, TimePhase> = {
  goldenHour: 'golden',
  midday: 'midday',
};

/** Total resolver for a phase id: anything unrecognised is `DEFAULT_PHASE`. */
export function resolvePhase(phaseId?: string | null): TimePhase {
  return (TIME_PHASES as readonly string[]).includes(phaseId ?? '')
    ? (phaseId as TimePhase)
    : DEFAULT_PHASE;
}

/** The row for a phase id — total, never undefined. */
export function getPhaseLight(phaseId?: string | null): PhaseLight {
  return PHASE_LIGHT[resolvePhase(phaseId)];
}

/** Total resolver for the legacy A1 settings names (the inert stored field). */
export function resolveAtmosphere(profileName?: string | null): AtmosphereProfileName {
  return (ATMOSPHERE_NAMES as readonly string[]).includes(profileName ?? '')
    ? (profileName as AtmosphereProfileName)
    : DEFAULT_ATMOSPHERE;
}

/**
 * The key light's own direction from its elevation and bearing — a unit vector
 * pointing FROM the scene TOWARD the light. North is −Z, so bearing 90° (east) is +X.
 */
export function sunDirection(
  elevationDeg: number,
  azimuthDeg: number,
): [number, number, number] {
  const elevation = (elevationDeg * Math.PI) / 180;
  const bearing = (azimuthDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevation);
  return [Math.sin(bearing) * horizontal, Math.sin(elevation), -Math.cos(bearing) * horizontal];
}
