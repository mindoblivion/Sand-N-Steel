/**
 * Heraldry — the gladiator's own banner: its device, its field and the bosses' stripes.
 *
 * Pure data and geometry.  Nothing here reads or writes the save, imports three.js or
 * touches the DOM, so the ludus banner row (2D hub), the Device Choosing panel and the
 * Colosseum gate pole (3D) all paint from this one source.
 *
 * Field colours are the existing palette constants from `ROMAN_PALETTE`
 * (`src/components/3d/city/RomanMaterials.tsx`), repeated here as plain hex so this
 * module stays importable by the hub and by unit tests without pulling that module's
 * canvas-texture generators in with it.
 */
import type { PlayerProfile } from '../types/game';
import { resolveRoadProgress, resolveRoadState } from './roadOfGlory';

/** The four personal devices, in the order the Device Choosing panel offers them. */
export type BannerDevice = 'sword' | 'laurel' | 'spear' | 'bull';

export const BANNER_DEVICES: readonly BannerDevice[] = ['sword', 'laurel', 'spear', 'bull'];

export interface BannerDeviceSpec {
  id: BannerDevice;
  /** The device's Latin name, as the panel prints it. */
  latin: string;
  /** One line of gloss, in the ludus's own voice. */
  gloss: string;
  /** The banner's field — a `ROMAN_PALETTE` colour. */
  primary: string;
  /** The device's ink — a `ROMAN_PALETTE` colour. */
  ink: string;
  /** SVG path data on a 0 0 100 100 viewBox. */
  path: string;
}

export const BANNER_DEVICE_SPECS: readonly BannerDeviceSpec[] = [
  {
    id: 'sword',
    latin: 'Gladius',
    gloss: 'The short blade — the soldier’s answer, given twice.',
    primary: '#6e1828', // ROMAN_PALETTE.imperialRunner
    ink: '#b89547', // ROMAN_PALETTE.goldAccent
    path: 'M50 4 L58 24 V58 H66 V68 H57 V76 H61 V84 H39 V76 H43 V68 H34 V58 H42 V24 Z',
  },
  {
    id: 'laurel',
    latin: 'Laurea',
    gloss: 'The victor’s crown — earned once, worn for good.',
    primary: '#b89547', // ROMAN_PALETTE.goldAccent
    ink: '#442e1d', // ROMAN_PALETTE.weatheredTimber
    path: 'M50 12 C32 18 22 34 22 54 C22 72 32 84 48 90 C36 80 30 68 30 54 C30 40 38 26 50 12 Z M50 12 C68 18 78 34 78 54 C78 72 68 84 52 90 C64 80 70 68 70 54 C70 40 62 26 50 12 Z',
  },
  {
    id: 'spear',
    latin: 'Hasta',
    gloss: 'The levy’s spear — reach enough to keep the sand at bay.',
    primary: '#1a3b5c', // ROMAN_PALETTE.glazedLapis
    ink: '#b89547', // ROMAN_PALETTE.goldAccent
    path: 'M50 4 L59 30 L54 36 V74 H62 V82 H38 V74 H46 V36 L41 30 Z',
  },
  {
    id: 'bull',
    latin: 'Taurus',
    gloss: 'The bull — the sand’s own animal, slow to turn and never moved.',
    primary: '#9e492f', // ROMAN_PALETTE.terracottaTileAged
    ink: '#b89547', // ROMAN_PALETTE.goldAccent
    path: 'M50 32 C60 32 68 40 68 50 C68 62 60 72 50 80 C40 72 32 62 32 50 C32 40 40 32 50 32 Z M20 22 C32 20 42 26 46 34 C38 34 31 39 27 46 C22 39 20 30 20 22 Z M80 22 C68 20 58 26 54 34 C62 34 69 39 73 46 C78 39 80 30 80 22 Z',
  },
];

/** The dark the boss stripes are cut in — `ROMAN_PALETTE.darkIron`. */
export const BANNER_STRIPE_COLOR = '#2b2a29';

/** Narrow a stored value to a device this build knows how to paint. */
export function isBannerDevice(value: unknown): value is BannerDevice {
  return typeof value === 'string' && (BANNER_DEVICES as readonly string[]).includes(value);
}

/** The spec for a stored device value, or `null` when the save carries none or an unknown one. */
export function bannerDeviceSpec(value: string | null | undefined): BannerDeviceSpec | null {
  if (!isBannerDevice(value)) return null;
  return BANNER_DEVICE_SPECS.find((spec) => spec.id === value) ?? null;
}

/**
 * One dark stripe per boss kill.  Derived from the save on every read — `bossKills` is
 * the only stored count, and the banner never gains a field of its own.
 */
export function bannerStripeCount(profile: PlayerProfile | null | undefined): number {
  const kills = profile?.bossKills;
  return typeof kills === 'number' && Number.isFinite(kills) && kills > 0 ? Math.floor(kills) : 0;
}

export interface BannerState {
  device: BannerDeviceSpec;
  /** One per boss kill. */
  stripes: number;
  /** True once the road stands at Champion: the banner has moved to the Colosseum gate. */
  atGate: boolean;
}

/**
 * The banner this profile carries, or `null` while no device has been chosen.
 * Everything else is derived: the stripes from `bossKills`, the gate from the road.
 */
export function resolveBanner(profile: PlayerProfile | null | undefined): BannerState | null {
  const device = bannerDeviceSpec(resolveRoadProgress(profile).bannerDevice);
  if (!device) return null;

  const atGate = resolveRoadState(profile).some(
    (stage) => stage.id === 'champion' && stage.state !== 'ahead'
  );

  return { device, stripes: bannerStripeCount(profile), atGate };
}
