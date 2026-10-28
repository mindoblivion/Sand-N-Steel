/**
 * ===========================================================================
 * PITCH A4 — ORIGO PASSIVE: the province's one small passive, and the identity read
 * ===========================================================================
 * `data/corpusEtOrigo.ts` owns the authored rows; this module owns the two rules
 * that turn a save into something the game can read:
 *
 *   • `resolveCorpusIdentity` — the identity record, validated and normalized.
 *     A profile with no `identity` (every save written before this slice), a
 *     null/partial field or an unknown id reads as "nothing recorded" — never
 *     repaired, never backfilled, never given a retroactive build delta or Origo
 *     passive (Pitch A4 — Director ruling R-DEFAULTS).
 *   • `originPassiveBlock` — the province's ONE `TraitModifierBlock` channel, in
 *     the shared shape `utils/traitModifiers.ts` merges.  No province, an unknown
 *     province or a legacy save is the empty block, which is the identity.
 *
 * `combatModifiers.buildPlayerModifiers` is the ONLY combat consumer, so the
 * passive reaches the duel through the one merged per-fighter block every other
 * trait already uses.  `buildOpponentModifiers` never reads it: the origo passive
 * is the PLAYER's alone (Pitch A4 — Director ruling R-ORIGO plumbing).
 *
 * Pure: no React, no storage, no clock, no randomness.  Never mutates its input.
 */

import type { BuildId, CorpusEtOrigoIdentity, ProvinceId, VitiumId } from '../types/game';
import {
  DEFAULT_BUILD_ID,
  getProvince,
  isBuildId,
  isProvinceId,
  isVitiumId,
  originPassiveOf,
} from '../data/corpusEtOrigo';
import type { TraitModifierBlock } from './traitModifiers';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The identity record as stored, keeping only members that name a real row.
 *
 * Accepts the profile itself (it reads `profile.identity`) or the `identity`
 * record on its own, so a screen and a test can drive the same function.  An
 * absent, null, non-object or wholly unknown field answers `{}` — no defaults are
 * invented here; the creation defaults (Even / Italia / no flaw) belong to the
 * creation screen and to `DEFAULT_SELECTION`, not to a read of an old save.
 */
export function resolveCorpusIdentity(input: unknown): CorpusEtOrigoIdentity {
  const record = isPlainObject(input) && 'identity' in input ? input.identity : input;
  if (!isPlainObject(record)) return {};

  const identity: CorpusEtOrigoIdentity = {};
  if (isBuildId(record.build)) identity.build = record.build;
  if (isProvinceId(record.origo)) identity.origo = record.origo;
  if (isVitiumId(record.vitium)) identity.vitium = record.vitium;
  return identity;
}

/**
 * The build a save is DISPLAYED as: the recorded one, else Even.
 *
 * "Even" is the stated creation default (Pitch A4 — Director ruling R-DEFAULTS)
 * and its delta is the identity, so a legacy save reading as Even changes no
 * stat — it only names the body the record never had to describe.
 */
export function resolveBuildId(input: unknown): BuildId {
  return resolveCorpusIdentity(input).build ?? DEFAULT_BUILD_ID;
}

/** The recorded province, or `null` — a legacy save has NO province, not Italia. */
export function resolveProvinceId(input: unknown): ProvinceId | null {
  return resolveCorpusIdentity(input).origo ?? null;
}

/** The recorded flaw, or `null` (the "None" choice writes no id at all). */
export function resolveVitiumId(input: unknown): VitiumId | null {
  return resolveCorpusIdentity(input).vitium ?? null;
}

/**
 * The province's passive in the shared modifier shape.
 *
 * Exactly one channel per province (the data type guarantees it), the empty block
 * for anything else.  This is the ONLY place the passive becomes a block, so the
 * duel, the HUD and `calculateTotalStats` cannot each invent their own reading.
 */
export function originPassiveBlock(input: unknown): TraitModifierBlock {
  const provinceId = resolveProvinceId(input);
  if (!provinceId) return {};
  return originPassiveOf(getProvince(provinceId));
}
