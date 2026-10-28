import type { BuildId, ProvinceId, VitiumId } from '../types/game';
import type { StatFlat, TraitModifierBlock } from '../utils/traitModifiers';

/**
 * ===========================================================================
 * PITCH A4 — CORPUS ET ORIGO: the gladiator's life before the sand, as data
 * ===========================================================================
 * Three cheap axes, chosen once at creation and frozen:
 *
 *   • BUILD   — the body he grew into.  A small `statFlat` delta applied BEFORE
 *               the creation points are spent, so the class template plus the
 *               delta is the allocation floor.  NO silhouette geometry: the
 *               rigs are GLBs and scaling them risks the rig, so the stat effect
 *               ships and the visual is a future art pass (Pitch A4 — Director
 *               ruling R-BUILD).
 *   • ORIGO   — the province he came from: one small passive, one favoured god
 *               (recorded data only — Favores Deorum is NOT built), and a
 *               flavour line for the bazaar.
 *   • VITIUM  — one chosen flaw, worth +2 creation points.  The flaw IS the
 *               stat flag: no separate slot system and no extra stat penalty is
 *               invented (Pitch A4 — Director ruling R-VITIUM).
 *
 * EVERY LIST AND EVERY VALUE BELOW IS A DIRECTOR RULING, NOT A DESIGN
 * TRANSCRIPTION.  The pitch gives the three axes and three example flaws; it
 * gives no build values, no province list, no gods, no passive magnitudes and no
 * flavour lines.  Each row is flagged where it is authored.  Nothing here reads
 * storage, a profile or a clock, and nothing here renders.
 */

// ── BUILD ───────────────────────────────────────────────────────────────────

export interface BuildPreset {
  id: BuildId;
  /** Player-facing name. */
  name: string;
  /** One line, player-facing. */
  text: string;
  /** The `statFlat` delta applied before allocation (empty = no change). */
  statDelta: StatFlat;
}

/**
 * Pitch A4 — Director ruling R-BUILD (authored presets; the design gives axes, not
 * values).  Three bodies, symmetric around Even: Sturdy trades a point of agility
 * for a point of stamina, Swift the reverse.  Even changes nothing, so it is the
 * identity row and the creation screen's default.
 */
export const BUILDS: BuildPreset[] = [
  {
    id: 'even',
    name: 'Even',
    text: 'Neither tall nor slight — the build that asks nothing of you and gives nothing away.',
    statDelta: {},
  },
  {
    id: 'sturdy',
    name: 'Sturdy',
    text: 'Heavy through the shoulders and slow off the mark. You last longer than you move.',
    statDelta: { agi: -1, sta: 1 },
  },
  {
    id: 'swift',
    name: 'Swift',
    text: 'Light-boned and quick, with less in the tank when the sand turns heavy.',
    statDelta: { agi: 1, sta: -1 },
  },
];

export const DEFAULT_BUILD_ID: BuildId = 'even';

// ── ORIGO ───────────────────────────────────────────────────────────────────

/**
 * The ONE `TraitModifierBlock` channel an Origo may use.  Each province carries
 * exactly one — enforced by the type, not by convention.
 */
export type OriginChannel =
  | 'damageDealtMult'
  | 'hitAgiAdd'
  | 'staminaCostMult'
  | 'staminaRegenAdd'
  | 'healthMaxAdd'
  | 'damageTakenMult';

export interface OriginPassive {
  channel: OriginChannel;
  value: number;
  /** The channel and the value in one player-facing line. */
  text: string;
}

export interface Province {
  id: ProvinceId;
  name: string;
  /** The favoured god — RECORDED DATA ONLY (Favores Deorum is not built). */
  god: string;
  /** The province's one small passive. */
  passive: OriginPassive;
  /** The bazaar flavour line. */
  flavour: string;
}

/**
 * Pitch A4 — Director ruling R-ORIGO (authored table).  Six provinces, six gods,
 * six single-channel passives, six flavour lines.  The god is `true` as a string
 * only: nothing reads it but the character sheet.
 */
export const PROVINCES: Province[] = [
  {
    id: 'italia',
    name: 'Italia',
    god: 'Mars',
    passive: { channel: 'damageDealtMult', value: 1.05, text: 'Damage dealt ×1.05' },
    flavour: 'The road from Italia is paved, and every toll is collected twice.',
  },
  {
    id: 'hispania',
    name: 'Hispania',
    god: 'Diana',
    passive: { channel: 'hitAgiAdd', value: 1, text: 'Agility in the hit roll +1' },
    flavour: 'Hispania breeds hunters who never miss the first throw.',
  },
  {
    id: 'gallia',
    name: 'Gallia',
    god: 'Mercury',
    passive: { channel: 'staminaCostMult', value: 0.95, text: 'Stamina cost ×0.95' },
    flavour: 'Gallic merchants talk fast, walk faster, and never pay full price.',
  },
  {
    id: 'graecia',
    name: 'Graecia',
    god: 'Apollo',
    passive: { channel: 'staminaRegenAdd', value: 1, text: 'Stamina recovery +1/s' },
    flavour: 'Greek tutors teach the body the way they teach the lyre: daily, and without mercy.',
  },
  {
    id: 'aegyptus',
    name: 'Aegyptus',
    god: 'Isis',
    passive: { channel: 'healthMaxAdd', value: 5, text: 'Maximum health +5' },
    flavour: 'The Nile teaches patience: a wound closes if you give it a season.',
  },
  {
    id: 'thracia',
    name: 'Thracia',
    god: 'Bellona',
    passive: { channel: 'damageTakenMult', value: 0.95, text: 'Damage taken ×0.95' },
    flavour: 'Thracians are born with a blade in hand and a song half-sung.',
  },
];

export const DEFAULT_PROVINCE_ID: ProvinceId = 'italia';

// ── VITIUM ──────────────────────────────────────────────────────────────────

export interface Vitium {
  id: VitiumId;
  /** Player-facing name. */
  name: string;
  /** The flaw's flavour line — the memorable part. */
  text: string;
}

/**
 * Pitch A4 — Director ruling R-VITIUM (authored list; the design names old knee /
 * temper / superstition as examples).  Four flaws, each worth the same +2 creation
 * points; a flaw carries NO stat penalty of its own — the +2 economy IS the
 * mechanic, and the vitium record itself is the stat flag.
 */
export const VITIA: Vitium[] = [
  {
    id: 'old_knee',
    name: 'Old Knee',
    text: 'The left knee remembers every winter campaign.',
  },
  {
    id: 'quick_temper',
    name: 'Quick Temper',
    text: 'Slow to forgive, quick to swing.',
  },
  {
    id: 'superstitious',
    name: 'Superstitious',
    text: 'Never enters the sand without touching the gate.',
  },
  {
    id: 'night_terrors',
    name: 'Night Terrors',
    text: 'Dreams of the arena before dawn, and wakes already tired.',
  },
];

/** Pitch A4 — Director ruling R-VITIUM: a chosen flaw raises the pool by two. */
export const VITIUM_CREATION_POINTS = 2;

// ── lookups (total; an unknown id answers `undefined`, never a guess) ───────

export function getBuild(id: unknown): BuildPreset | undefined {
  return typeof id === 'string' ? BUILDS.find((row) => row.id === id) : undefined;
}

export function getProvince(id: unknown): Province | undefined {
  return typeof id === 'string' ? PROVINCES.find((row) => row.id === id) : undefined;
}

export function getVitium(id: unknown): Vitium | undefined {
  return typeof id === 'string' ? VITIA.find((row) => row.id === id) : undefined;
}

export const BUILD_IDS: BuildId[] = BUILDS.map((row) => row.id);
export const PROVINCE_IDS: ProvinceId[] = PROVINCES.map((row) => row.id);
export const VITIUM_IDS: VitiumId[] = VITIA.map((row) => row.id);

export const isBuildId = (value: unknown): value is BuildId =>
  typeof value === 'string' && BUILD_IDS.includes(value as BuildId);
export const isProvinceId = (value: unknown): value is ProvinceId =>
  typeof value === 'string' && PROVINCE_IDS.includes(value as ProvinceId);
export const isVitiumId = (value: unknown): value is VitiumId =>
  typeof value === 'string' && VITIUM_IDS.includes(value as VitiumId);

/** A province's passive as the shared modifier block (`{}` when there is none). */
export function originPassiveOf(province: Province | undefined): TraitModifierBlock {
  if (!province) return {};
  return { [province.passive.channel]: province.passive.value } as TraitModifierBlock;
}
