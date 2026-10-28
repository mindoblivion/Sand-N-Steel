/**
 * ===========================================================================
 * D-3 — GNAEUS'S UNBROKEN PANOPLY: three gilt pieces, six cracks, one humiliation
 * ===========================================================================
 * Gnaeus "The Gilded" fights behind three pride-pieces — his crest, his shield
 * FACING and his pauldron — and each one guards him while it shines:
 *
 *   crest     +aggression   (the shout that drives him forward)
 *   facing    +blockChance  (the shield's face turned into the blow)
 *   pauldron  damage taken ×0.90 (the gilt plate takes the edge)
 *
 * A PLAYER POWER ATTACK that lands — hit OR blocked, because the design says a
 * power attack cracks them "even through his block" — puts one crack on the
 * piece on the struck line. Quick attacks never crack anything. Two cracks break
 * a piece: its benefit is removed, the crowd is paid a hype beat, the HUD says
 * so, and Vainheart (his own palma) arms his next two attacks at +12 %.
 *
 * ── STRIKE LINES: THE RULING ───────────────────────────────────────────────
 * This combat model has NO strike lines — there is no high/mid/low, no hit
 * location, nothing on a resolution that could name which piece was struck. The
 * design permits a fallback in that case, and this is it: cracks accrue to the
 * pieces in their row's own fixed order, `facing → crest → pauldron`, one crack
 * per power attack on the first unbroken piece. Six power attacks strip the
 * panoply. The order lives in the ROW (`OpponentConfig.panoply.pieces`), not in
 * this module, so it is data a future strike-line model could replace.
 *
 * ── THE FENCE ──────────────────────────────────────────────────────────────
 *   a panoply exists  ⇔  the opponent `isBoss` ∧ carries `featureBout` ∧ its
 *                         mechanic is `unbroken_panoply` ∧ the row carries
 *                         valid `panoply` sub-data.
 *
 * Everything here is pure — no React, no storage, no randomness — and the whole
 * state is duel-session only.
 */
import type { PanoplyConfig, PanoplyPieceId, OpponentConfig } from '../types/game';

/** One piece's live state: cracks taken, and whether it has broken. */
export interface PanoplyPieceState {
  id: PanoplyPieceId;
  name: string;
  cracks: number;
  breakAt: number;
  broken: boolean;
}

/** Gnaeus's whole duel-session panoply state. */
export interface PanoplyState {
  /** In the row's crack order. */
  pieces: PanoplyPieceState[];
  /** All three broken: the permanent shift is in force. */
  humiliated: boolean;
  /** Vainheart: attacks still carrying +12 %. */
  vainheartArmedAttacks: number;
}

/** The line a break speaks. Part A's words, with the piece's own name. */
export function panoplyBreakWords(pieceName: string): string {
  return `His ${pieceName} splits — the crowd loves it.`;
}

/** The line Humiliated speaks, once. */
export const PANOPLY_HUMILIATED_WORDS =
  'The gold is gone — Gnaeus stands humiliated before the crowd.';

/* ── THE FENCE ───────────────────────────────────────────────────────────── */

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const PIECE_IDS: readonly PanoplyPieceId[] = ['crest', 'facing', 'pauldron'];

/**
 * The panoply this opponent wears, or `null` when it wears none.
 *
 * THE FENCE, in full: `isBoss` ∧ `featureBout` ∧ the mechanic ∧ usable sub-data
 * (three known, distinct pieces with a positive whole `breakAt`, and finite
 * magnitudes). A malformed row is refused rather than half-working.
 */
export function panoplyConfigFor(opponent: OpponentConfig | null | undefined): PanoplyConfig | null {
  if (!opponent) return null;
  if (opponent.isBoss !== true) return null;
  if (opponent.featureBout !== true) return null;
  if (opponent.bossMechanic !== 'unbroken_panoply') return null;

  const config = opponent.panoply;
  if (!config) return null;
  if (!Array.isArray(config.pieces) || config.pieces.length === 0) return null;
  const seen = new Set<PanoplyPieceId>();
  for (const piece of config.pieces) {
    if (!piece || !PIECE_IDS.includes(piece.id) || seen.has(piece.id)) return null;
    if (typeof piece.name !== 'string' || piece.name.trim().length === 0) return null;
    if (!finite(piece.breakAt) || piece.breakAt < 1) return null;
    seen.add(piece.id);
  }
  if (!finite(config.crestAggressionBonus) || config.crestAggressionBonus < 0) return null;
  if (!finite(config.facingBlockChanceBonus) || config.facingBlockChanceBonus < 0) return null;
  if (
    !finite(config.pauldronDamageTakenMult) ||
    config.pauldronDamageTakenMult <= 0 ||
    config.pauldronDamageTakenMult > 1
  ) {
    return null;
  }
  if (!finite(config.breakHype) || config.breakHype < 0) return null;
  if (!finite(config.vainheartAttacks) || config.vainheartAttacks < 0) return null;
  if (!finite(config.vainheartDamageMult) || config.vainheartDamageMult < 1) return null;
  if (!config.humiliated) return null;
  if (!finite(config.humiliated.blockChanceDelta)) return null;
  if (!finite(config.humiliated.aggressionDelta)) return null;
  return config;
}

/** Is this opponent one whose pride is his armour? */
export function isPanoplyBout(opponent: OpponentConfig | null | undefined): boolean {
  return panoplyConfigFor(opponent) !== null;
}

/* ── THE STATE ───────────────────────────────────────────────────────────── */

/** A fresh panoply, every piece whole. A bout with none answers an empty state. */
export function createPanoplyState(config: PanoplyConfig | null | undefined): PanoplyState {
  return {
    pieces: (config?.pieces ?? []).map((piece) => ({
      id: piece.id,
      name: piece.name,
      cracks: 0,
      breakAt: Math.max(1, Math.floor(piece.breakAt)),
      broken: false,
    })),
    humiliated: false,
    vainheartArmedAttacks: 0,
  };
}

/** One piece by id, or `null` when the row does not wear it. */
export function panoplyPiece(
  state: PanoplyState,
  id: PanoplyPieceId
): PanoplyPieceState | null {
  return state.pieces.find((piece) => piece.id === id) ?? null;
}

/* ── THE BENEFITS ────────────────────────────────────────────────────────── */

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Gnaeus's aggression: the row's base plus the crest's shout while it shines,
 * plus Humiliated's permanent shift once every piece has broken. Clamped into
 * the range `chooseAIStandardAction` documents.
 */
export function panoplyAggression(
  base: number,
  config: PanoplyConfig,
  state: PanoplyState
): number {
  let value = finite(base) ? base : 0.5;
  const crest = panoplyPiece(state, 'crest');
  if (crest && !crest.broken) value += config.crestAggressionBonus;
  if (state.humiliated) value += config.humiliated.aggressionDelta;
  return clamp01(value);
}

/** Gnaeus's blockChance: the facing's guard while it shines, then the shame. */
export function panoplyBlockChance(
  base: number,
  config: PanoplyConfig,
  state: PanoplyState
): number {
  let value = finite(base) ? base : 0;
  const facing = panoplyPiece(state, 'facing');
  if (facing && !facing.broken) value += config.facingBlockChanceBonus;
  if (state.humiliated) value += config.humiliated.blockChanceDelta;
  return clamp01(value);
}

/** How much of a blow he takes: the pauldron's 0.90 while it shines, else 1. */
export function panoplyDamageTakenMult(config: PanoplyConfig, state: PanoplyState): number {
  const pauldron = panoplyPiece(state, 'pauldron');
  return pauldron && !pauldron.broken ? config.pauldronDamageTakenMult : 1;
}

/* ── THE CRACK ───────────────────────────────────────────────────────────── */

export interface PanoplyCrackResult {
  state: PanoplyState;
  /** The piece this crack broke, if it broke one. */
  broken: PanoplyPieceId | null;
  /** The HUD line for a break (`''` while a piece still holds). */
  words: string;
  /** True only on the crack that completed the panoply. */
  humiliatedNow: boolean;
}

/**
 * One player POWER attack landed: one crack, on the first unbroken piece.
 *
 * A panoply already stripped answers an unchanged state (and no words) rather
 * than inventing a seventh crack. A break removes that piece's benefit (the
 * readers above do that by reading `broken`), arms Vainheart's `vainheartAttacks`
 * for his next attacks, and — when it is the third — sets Humiliated for the rest
 * of the duel and says so once.
 */
export function crackPanoply(state: PanoplyState, config: PanoplyConfig): PanoplyCrackResult {
  const index = state.pieces.findIndex((piece) => !piece.broken);
  if (index < 0) return { state, broken: null, words: '', humiliatedNow: false };

  const target = state.pieces[index];
  const cracks = target.cracks + 1;
  const breaks = cracks >= target.breakAt;
  const pieces = state.pieces.map((piece, i) =>
    i === index ? { ...piece, cracks, broken: breaks } : piece
  );
  const humiliatedNow = breaks && pieces.every((piece) => piece.broken) && !state.humiliated;
  const next: PanoplyState = {
    pieces,
    humiliated: state.humiliated || humiliatedNow,
    // A break arms Vainheart; it does not stack with an unspent arming.
    vainheartArmedAttacks: breaks
      ? Math.max(state.vainheartArmedAttacks, Math.floor(config.vainheartAttacks))
      : state.vainheartArmedAttacks,
  };

  return {
    state: next,
    broken: breaks ? target.id : null,
    words: breaks ? panoplyBreakWords(target.name) : '',
    humiliatedNow,
  };
}

/**
 * Gnaeus attacks: read-and-spend one armed Vainheart attack.
 *
 * Returns whether THIS blow carries the +12 % and the state with one fewer armed
 * attack. A blow thrown while nothing is armed answers `false` and the same
 * state, so a malformed or absent panoply is the identity.
 */
export function consumeVainheartAttack(state: PanoplyState): {
  state: PanoplyState;
  armed: boolean;
} {
  if (state.vainheartArmedAttacks <= 0) return { state, armed: false };
  return {
    state: { ...state, vainheartArmedAttacks: state.vainheartArmedAttacks - 1 },
    armed: true,
  };
}
