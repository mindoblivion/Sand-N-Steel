/**
 * settings.ts — the player's preferences, in one place.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 * Until this slice the game had exactly one player preference (Lefty Mode) and it
 * lived as a field on the saved profile; everything else was a module constant or
 * session-only state.  This module is the ONE settings store: a single
 * `localStorage` record (`sand_and_steel_settings_v1`), the defaults the design
 * names, and the readers the scenes consume.  It **never reads, writes or
 * migrates the profile key** (`sand_and_steel_gladiator_save_v2`) — a player's
 * gladiator and their preferences are separate records, and the suite proves the
 * separation by comparing the profile's stored bytes across a settings workout.
 *
 * ── The shape of the module ───────────────────────────────────────────────
 *   • `DEFAULT_SETTINGS` — the design's values, absence included: `screenMotion`
 *     is deliberately ABSENT, because absence is what lets the operating system
 *     decide (`prefers-reduced-motion`).  The resolver never invents it.
 *   • `resolveSettings(stored, legacyLefty)` — PURE, total, and the lazy-resolution
 *     idiom this repo already uses (`resolveRacingState`, `resolveTimeState`): any
 *     stored value, however partial or damaged, resolves to a complete record with
 *     every unusable field replaced by its default.  It is pure on purpose — the
 *     suite drives it with no storage at all.
 *   • `loadSettings()` / `saveSettings()` — storage with the `storage.ts` try/catch
 *     idiom, so a browser that refuses storage degrades to the defaults instead of
 *     throwing.
 *   • `getSettings()` / `subscribeSettings()` / `updateSettings()` — a module-level
 *     resolved cache plus change listeners.  Consumers read the cache (a scene's
 *     frame loop reads it, never React state); React surfaces subscribe through
 *     `hooks/useSettings.ts`.  Nothing here is per-frame state.
 *   • the derived readers the scenes consume: brightness, the city camera's
 *     distances, the drag sensitivity scale and the camera-shake multiplier.
 *
 * ── Lefty Mode, and the legacy key ────────────────────────────────────────
 * Lefty is a preference, so it lives here now — but the app shipped it once as the
 * standalone key `sand_and_steel_lefty_mode` (`storage.ts`'s `getLeftyMode` /
 * `setLeftyMode`), so a record that says nothing about lefty falls back to that
 * key and a Lefty chosen before this slice is still Lefty after it.  Saving
 * lefty writes the record **and** mirrors the legacy key.
 */

import { getLeftyMode, setLeftyMode } from './storage';
// Atmosphere A1 — the city's two sky/sun/fog profiles. The names and the default live
// in `utils/atmosphere.ts`, so this record stores a choice and never restates a value.
import { ATMOSPHERE_NAMES, DEFAULT_ATMOSPHERE } from '../utils/atmosphere';
import type { AtmosphereProfileName } from '../utils/atmosphere';

/** The one settings record. */
export const SETTINGS_STORAGE_KEY = 'sand_and_steel_settings_v1';

/**
 * Cinematic / Balanced / Swift — the picture-quality preset.
 *
 * SF-1 made it live: it is the city's governor, read by `hooks/useAdaptiveDpr.ts`
 * for the Canvas's DPR band and for the dust particle count.  The names are the
 * design's; a record written with SET-1's `low` / `high` spellings still resolves
 * (see `LEGACY_QUALITY_PRESETS`).
 */
export type QualityPreset = 'cinematic' | 'balanced' | 'swift';

/** Dim / Standard / Bright — the scene exposure. */
export type Brightness = 'dim' | 'standard' | 'bright';

/** Near / Standard / Far — a camera's distance behind its subject. */
export type CameraDistance = 'near' | 'standard' | 'far';

/** Full / Reduced / Off — the same three steps for motion and for camera shake. */
export type ScreenMotion = 'full' | 'reduced' | 'off';
export type CameraShake = 'full' | 'reduced' | 'off';

export interface Settings {
  /** Picture quality preset (SF-1's governor reads it). */
  qualityPreset: QualityPreset;
  /** Scene exposure: 0.9 / 1.0 / 1.1. */
  brightness: Brightness;
  /**
   * Atmosphere A1 — which sky/sun/fog profile the CITY scene is drawn under
   * (Golden Hour, the default, or Midday). City-only: no other scene reads it.
   */
  cityLighting: AtmosphereProfileName;
  /** How far behind the gladiator the city chase camera sits. */
  cityCamDistance: CameraDistance;
  /** How far behind the chariot the race chase camera sits. */
  raceCamDistance: CameraDistance;
  /** Atmosphere motion (drift, smoke, banners). */
  atmosphereMotion: boolean;
  /** Music level, 0…1. */
  musicVolume: number;
  /** Sound-effect level, 0…1. */
  sfxVolume: number;
  /** Crowd level, 0…1. */
  crowdVolume: number;
  /** All sound off — persisted, unlike the session-only flag it replaces. */
  muted: boolean;
  /** Lefty Mode: weapon in the left hand. */
  lefty: boolean;
  /** Hold-and-drag orbit speed, 1…10 (5 = the shipped feel). */
  cameraSensitivity: number;
  /** Device vibration. */
  vibration: boolean;
  /**
   * Screen motion.  **Optional on purpose:** an absent field means the operating
   * system decides, so the resolver only ever carries a value the player chose.
   */
  screenMotion?: ScreenMotion;
  /** Camera shake strength; reduced by default. */
  cameraShake: CameraShake;
  /** Enhanced colour (the grading pass's consumer). */
  enhancedColor: boolean;
}

export const QUALITY_PRESETS: readonly QualityPreset[] = ['cinematic', 'balanced', 'swift'];

/**
 * The spellings a record written before SF-1 could carry (`SET-1` shipped
 * `low` / `balanced` / `high`).  A stored choice is a choice, so it is translated
 * rather than dropped on the floor: `high` was the most-pixels setting and `low`
 * the least, which is exactly Cinematic and Swift.  `balanced` needs no alias — it
 * is in `QUALITY_PRESETS` itself.
 */
const LEGACY_QUALITY_PRESETS: Record<string, QualityPreset> = {
  high: 'cinematic',
  low: 'swift',
};

/**
 * The cheap-device heuristic's thresholds: a dense screen on few cores.  BOTH
 * halves must hold — a dense screen alone is not a cheap device.
 */
export const CHEAP_DEVICE_DPR = 2.5;
export const CHEAP_DEVICE_CORES = 4;

/** The two device facts the first-run default reads. */
export interface DeviceProfile {
  devicePixelRatio?: number;
  hardwareConcurrency?: number;
}

/**
 * Whether this device should start at Swift (SF-1's first-run default).  An
 * unknown core count is not evidence of a cheap device — a browser that withholds
 * `hardwareConcurrency` is usually not the slow one.
 */
export function isCheapDevice(device: DeviceProfile): boolean {
  const dpr = device.devicePixelRatio;
  const cores = device.hardwareConcurrency;
  return (
    typeof dpr === 'number' &&
    typeof cores === 'number' &&
    dpr > CHEAP_DEVICE_DPR &&
    cores >= 1 &&
    cores <= CHEAP_DEVICE_CORES
  );
}
export const BRIGHTNESS_LEVELS: readonly Brightness[] = ['dim', 'standard', 'bright'];
export const CAMERA_DISTANCES: readonly CameraDistance[] = ['near', 'standard', 'far'];
export const SCREEN_MOTION_LEVELS: readonly ScreenMotion[] = ['full', 'reduced', 'off'];
export const CAMERA_SHAKE_LEVELS: readonly CameraShake[] = ['full', 'reduced', 'off'];

/** The design's defaults.  `screenMotion` is absent, and stays absent. */
export const DEFAULT_SETTINGS: Settings = {
  qualityPreset: 'balanced',
  brightness: 'standard',
  cityLighting: DEFAULT_ATMOSPHERE,
  cityCamDistance: 'standard',
  raceCamDistance: 'standard',
  atmosphereMotion: true,
  musicVolume: 0.8,
  sfxVolume: 1.0,
  crowdVolume: 1.0,
  muted: false,
  lefty: false,
  cameraSensitivity: 5,
  vibration: true,
  cameraShake: 'reduced',
  enhancedColor: false,
};

/** Volume bounds, shared by the sliders and the resolver. */
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 1;
export const MUSIC_VOLUME_DEFAULT = DEFAULT_SETTINGS.musicVolume;

/** The orbit-sensitivity scale's bounds (1 = 0.6× the shipped feel, 10 = 1.5×). */
export const CAMERA_SENSITIVITY_MIN = 1;
export const CAMERA_SENSITIVITY_MAX = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Resolution — pure, total, and the reason a damaged record is harmless
// ─────────────────────────────────────────────────────────────────────────────

/** One of `allowed`, or `fallback` for anything else (including a wrong type). */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** A boolean, or `fallback` for anything else. */
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** A finite number clamped to `[min, max]`, or `fallback` for anything else. */
function clampedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** The record-shaped part of anything stored, or an empty one. */
function asRecord(stored: unknown): Record<string, unknown> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return stored as Record<string, unknown>;
}

/**
 * Resolve any stored value into a complete record — PURE, so the suite can drive
 * it with no storage, and total, so a corrupt or partial record can never reach a
 * consumer half-filled.
 *
 * `legacyLefty` is the legacy lefty key's value (`storage.ts`'s `getLeftyMode`), or
 * `false` when there is none.  It is used ONLY when the record is silent about
 * lefty: a record that carries a boolean lefty wins, either way round.
 *
 * `device` is the device's own two facts (`window.devicePixelRatio`,
 * `navigator.hardwareConcurrency`), read by `loadSettings` and passed in by the
 * suite.  It is consulted ONLY where the record carries no usable preset, which is
 * what makes it a FIRST-RUN default rather than a policy.
 */
/**
 * The preset, three ways in order: a value the design names; the spelling a record
 * written before SF-1 could carry (`low` / `high`); and otherwise the first-run
 * default — Swift on a cheap device, Balanced everywhere else.
 */
export function resolveQualityPreset(stored: unknown, device: DeviceProfile = {}): QualityPreset {
  if (typeof stored === 'string') {
    if ((QUALITY_PRESETS as readonly string[]).includes(stored)) return stored as QualityPreset;
    const legacy = LEGACY_QUALITY_PRESETS[stored];
    if (legacy) return legacy;
  }
  return isCheapDevice(device) ? 'swift' : DEFAULT_SETTINGS.qualityPreset;
}

export function resolveSettings(
  stored: unknown,
  legacyLefty = false,
  device: DeviceProfile = {},
): Settings {
  const record = asRecord(stored);

  const resolved: Settings = {
    qualityPreset: resolveQualityPreset(record.qualityPreset, device),
    brightness: oneOf(record.brightness, BRIGHTNESS_LEVELS, DEFAULT_SETTINGS.brightness),
    cityLighting: oneOf(record.cityLighting, ATMOSPHERE_NAMES, DEFAULT_SETTINGS.cityLighting),
    cityCamDistance: oneOf(record.cityCamDistance, CAMERA_DISTANCES, DEFAULT_SETTINGS.cityCamDistance),
    raceCamDistance: oneOf(record.raceCamDistance, CAMERA_DISTANCES, DEFAULT_SETTINGS.raceCamDistance),
    atmosphereMotion: bool(record.atmosphereMotion, DEFAULT_SETTINGS.atmosphereMotion),
    musicVolume: clampedNumber(record.musicVolume, DEFAULT_SETTINGS.musicVolume, VOLUME_MIN, VOLUME_MAX),
    sfxVolume: clampedNumber(record.sfxVolume, DEFAULT_SETTINGS.sfxVolume, VOLUME_MIN, VOLUME_MAX),
    crowdVolume: clampedNumber(record.crowdVolume, DEFAULT_SETTINGS.crowdVolume, VOLUME_MIN, VOLUME_MAX),
    muted: bool(record.muted, DEFAULT_SETTINGS.muted),
    lefty: 'lefty' in record ? bool(record.lefty, legacyLefty) : legacyLefty,
    cameraSensitivity: Math.round(
      clampedNumber(
        record.cameraSensitivity,
        DEFAULT_SETTINGS.cameraSensitivity,
        CAMERA_SENSITIVITY_MIN,
        CAMERA_SENSITIVITY_MAX,
      ),
    ),
    vibration: bool(record.vibration, DEFAULT_SETTINGS.vibration),
    cameraShake: oneOf(record.cameraShake, CAMERA_SHAKE_LEVELS, DEFAULT_SETTINGS.cameraShake),
    enhancedColor: bool(record.enhancedColor, DEFAULT_SETTINGS.enhancedColor),
  };

  // Screen motion: only a value the design names is carried.  Absence stays absent
  // (the OS decides) and a damaged value is dropped for the same reason.
  if (SCREEN_MOTION_LEVELS.includes(record.screenMotion as ScreenMotion)) {
    resolved.screenMotion = record.screenMotion as ScreenMotion;
  }

  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage — the `storage.ts` try/catch idiom, over one key
// ─────────────────────────────────────────────────────────────────────────────

/** The stored record as written, or `null` when there is none readable. */
function readStoredRecord(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    return asRecord(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to load settings:', e);
    return null;
  }
}

/** The legacy lefty key's value, or `false` where storage refuses to answer. */
function readLegacyLefty(): boolean {
  try {
    return getLeftyMode();
  } catch {
    return false;
  }
}

/**
 * The device's own two facts, or an empty profile where the browser withholds them
 * (or where there is no window at all, as in the suite).
 */
function readDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') return {};
  return {
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: window.navigator?.hardwareConcurrency,
  };
}

/** What the player has stored, resolved over the defaults. */
export function loadSettings(): Settings {
  return resolveSettings(readStoredRecord(), readLegacyLefty(), readDeviceProfile());
}

/**
 * Write the record, mirror the legacy lefty key, refresh the cache and tell the
 * subscribers.  A storage failure is logged and swallowed: the in-memory record
 * still resolves, so the session keeps the player's choice.
 */
export function saveSettings(settings: Settings): Settings {
  const resolved = resolveSettings(settings);
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(resolved));
    setLeftyMode(resolved.lefty);
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
  cache = resolved;
  notify();
  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// The module-level cache and its listeners
// ─────────────────────────────────────────────────────────────────────────────

let cache: Settings | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/**
 * The current settings — resolved once per session and kept current by every
 * write, so a scene's frame loop can read it without touching React state.
 */
export function getSettings(): Settings {
  if (!cache) cache = loadSettings();
  return cache;
}

/** Subscribe to changes.  Returns the unsubscribe function. */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Change one or more fields: merge the patch over the current record, save it,
 * and hand back the resolved result.  `screenMotion` is dropped when a caller
 * clears it, so absence means what it says.
 */
export function updateSettings(patch: Partial<Settings>): Settings {
  const merged: Record<string, unknown> = { ...getSettings(), ...patch };
  if (merged.screenMotion === undefined) delete merged.screenMotion;
  return saveSettings(resolveSettings(merged, readLegacyLefty()));
}

// ─────────────────────────────────────────────────────────────────────────────
// The derived readers the scenes consume
// ─────────────────────────────────────────────────────────────────────────────

/** The exposure each brightness level asks for.  Standard is the shipped 1.0. */
export const BRIGHTNESS_EXPOSURE: Record<Brightness, number> = {
  dim: 0.9,
  standard: 1.0,
  bright: 1.1,
};

/** The exposure the current setting asks for. */
export function getBrightnessExposure(settings: Settings): number {
  return BRIGHTNESS_EXPOSURE[settings.brightness];
}

/**
 * Apply the brightness to a renderer — the ONE helper every Canvas uses, on
 * creation and again whenever the setting changes.
 *
 * `toneMappingExposure` only means something while a tone-mapping curve is
 * installed, which is react-three-fiber's own default (ACES Filmic) on every
 * Canvas in this app.
 */
export function applyBrightness(renderer: { toneMappingExposure: number }, settings: Settings): void {
  renderer.toneMappingExposure = getBrightnessExposure(settings);
}

/**
 * The subject the city camera has to keep readable, and the design's floor for it.
 *
 * The height is `GladiatorMesh`'s own measured figure for the rigged default model
 * (`arena_roman`): an animated bounding height of 1.854, of which 0.75 sits below
 * Y = 0 and is hidden by the arena floor.  The FOV is `CityHubScene`'s own Canvas
 * camera.  Both are stated here so the floor's derivation can be checked rather
 * than trusted.
 */
export const CITY_CAMERA_SUBJECT_HEIGHT = 1.854;
export const CITY_CAMERA_FOV_DEGREES = 58;

/** The design's readability floor: the gladiator never reads smaller than 18% of the screen. */
export const CITY_CAMERA_SUBJECT_SCREEN_FLOOR = 0.18;

/** The design's requested Far distance, before the readability floor is applied. */
export const CITY_CAMERA_FAR_REQUESTED = 11.5;

/** How much of the screen's height the subject fills at `distance`. */
export function cityCameraSubjectScreenFraction(
  distance: number,
  fovDegrees: number = CITY_CAMERA_FOV_DEGREES,
  subjectHeight: number = CITY_CAMERA_SUBJECT_HEIGHT,
): number {
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(fovDegrees)) return 0;
  const frustumHeight = 2 * distance * Math.tan((fovDegrees * Math.PI) / 360);
  return frustumHeight > 0 ? subjectHeight / frustumHeight : 0;
}

/** The furthest the camera may sit and still hold the readability floor. */
export const CITY_CAMERA_FAR_MAX_DISTANCE =
  CITY_CAMERA_SUBJECT_HEIGHT /
  (2 * Math.tan((CITY_CAMERA_FOV_DEGREES * Math.PI) / 360) * CITY_CAMERA_SUBJECT_SCREEN_FLOOR);

/**
 * The city camera's three framings, behind the subject.
 *
 * Standard is the framing the city already had (5.5 behind, 2.8 above) and Near is
 * the design's ≈7.  Far is the design's ≈11.5 — **subject to the gladiator staying
 * ≥18% of screen height**, which at this camera's 58° FOV binds first: 11.5 would
 * show him at ~14.5% of the screen, so Far is the largest distance that holds the
 * floor (≈9.29).  The design's own clause governs its own number.
 */
export const CITY_CAMERA_DISTANCES: Record<CameraDistance, number> = {
  near: 7,
  standard: 5.5,
  far: Math.min(CITY_CAMERA_FAR_REQUESTED, CITY_CAMERA_FAR_MAX_DISTANCE),
};

/**
 * The drag-orbit speed scale for the current sensitivity: 1.0 at the default 5,
 * 0.6 at 1 and 1.5 at 10 — linear, so every step moves the feel by the same
 * amount.  Applied to `useCameraDrag`'s yaw and pitch sensitivities by the city
 * camera and the duel's orbit rig.
 */
export function getCameraSensitivityScale(settings: Settings): number {
  const sensitivity = clampedNumber(
    settings.cameraSensitivity,
    DEFAULT_SETTINGS.cameraSensitivity,
    CAMERA_SENSITIVITY_MIN,
    CAMERA_SENSITIVITY_MAX,
  );
  return 0.5 + 0.1 * sensitivity;
}

/**
 * What the motion setting actually means: a stored value when the player chose
 * one, and the operating system's own preference when the record is silent.
 */
export function getEffectiveScreenMotion(settings: Settings, prefersReducedMotion = false): ScreenMotion {
  if (settings.screenMotion) return settings.screenMotion;
  return prefersReducedMotion ? 'reduced' : 'full';
}

/**
 * MO-1 — what the document root's `data-motion` attribute should carry: the stored
 * preference when the player has chosen one, and `null` when the record is silent.
 *
 * Absence is load-bearing.  `null` means App writes NO attribute at all, so the
 * operating system's own `prefers-reduced-motion` query (the app-wide block in
 * `index.css`) is what governs — exactly the way `getEffectiveScreenMotion`
 * resolves an absent field.  A chosen `'off'` is carried verbatim rather than
 * folded into `'reduced'`: MO-1 ships the reduced block, and the attribute has to
 * keep the two distinct from the moment it is first written.
 */
export function resolveMotionAttribute(settings: Settings): ScreenMotion | null {
  return settings.screenMotion ?? null;
}

/**
 * The atmosphere motion the city's drifting dust actually runs with: the player's
 * own switch, and OFF while Swift is the preset.
 *
 * The stored toggle is never rewritten — Swift overrides it for as long as it is
 * active, and the player's own choice is back the moment they leave Swift.  This is
 * the toggle's first consumer (SET-1 defined it as a named attachment point), so the
 * motion switch and the quality preset cannot disagree about whether the city's
 * atmosphere drifts.
 */
export function getEffectiveAtmosphereMotion(settings: Settings): boolean {
  return settings.qualityPreset === 'swift' ? false : settings.atmosphereMotion;
}

/**
 * The camera-shake multiplier: full 1.0, reduced 0.4, off 0 — and never more than
 * 0.4 while the effective screen motion is reduced or off, so a player who has
 * stilled the screen never gets a full shake out of the other control.
 */
export function getCameraShakeMultiplier(settings: Settings, prefersReducedMotion = false): number {
  const shake = settings.cameraShake === 'full' ? 1 : settings.cameraShake === 'reduced' ? 0.4 : 0;
  const motion = getEffectiveScreenMotion(settings, prefersReducedMotion);
  const motionCap = motion === 'reduced' || motion === 'off' ? 0.4 : 1;
  return Math.min(shake, motionCap);
}
