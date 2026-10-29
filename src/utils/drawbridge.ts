/**
 * drawbridge.ts - DB-1 The Working Drawbridge mechanics.
 *
 * Pure, deterministic helpers for the working drawbridge: the shared
 * mechanics constants and the moat water-respawn rule. No wall-clock reads,
 * no randomness - everything here is a pure function of its inputs.
 *
 * Measurements are read from the shipped scene (the moat constants in
 * NorthernMotte.tsx, the BRIDGE_* constants in terrainHeight.ts, and the
 * deck constants in Drawbridge.tsx); they are pinned here, not re-derived.
 */

// - Bridge mechanics constants (DB-1) -------------------------------------
/** Angle the deck rotates to when raised, in radians. */
export const DRAWBRIDGE_RAISED_ANGLE = (75 * Math.PI) / 180;
/** Raise/lower animation duration in seconds (easeInOutCubic). */
export const DRAWBRIDGE_ANIM_DURATION = 2.5;
/** How far (in Y) each chain control point droops when the bridge is down. */
export const DRAWBRIDGE_CHAIN_SAG = 0.8;

// - Moat measurements (read from NorthernMotte.tsx; do not re-derive) -----
/** Moat ring center in world space: [0, 0, MOTTE_MOAT_CENTER_Z]. */
export const MOAT_CENTER: [number, number, number] = [0, 0, -81.5];
/** Moat ring inner radius (MOAT_INNER_RADIUS). */
export const MOAT_INNER_RADIUS = 25.0;
/** Moat ring outer radius (MOAT_OUTER_RADIUS). */
export const MOAT_OUTER_RADIUS = 31.0;
/** Where a player who ends up in the moat water is relocated. */
export const MOAT_RESPAWN_POS: [number, number, number] = [0, 0, -48];

// - Bridge deck footprint in world space (from Drawbridge.tsx) -------------
/** Half width of the deck (BRIDGE_HALF_WIDTH). */
export const BRIDGE_DECK_HALF_WIDTH = 2.0;
/** South/city end of the deck (BRIDGE_Z_OUTER). */
export const BRIDGE_DECK_Z_OUTER = -50.5;
/** North/motte end of the deck, at the hinge (BRIDGE_Z_INNER - 0.5). */
export const BRIDGE_DECK_Z_INNER = -56.5;

/**
 * Moat water-respawn rule (pure).
 *
 * Returns MOAT_RESPAWN_POS when the player is in the moat water, else null:
 * 1. dist = sqrt(x^2 + (z + 81.5)^2); if not in [25.0, 31.0] -> null.
 * 2. If on the bridge deck (|x| <= 2.0 and z in [-56.5, -50.5]) and the
 *    bridge is down -> null (the player is on the deck, not in the water).
 * 3. If playerY > 0.5 -> null (the player is above the water).
 * 4. Otherwise -> MOAT_RESPAWN_POS.
 */
export function checkMoatRespawn(
  playerX: number,
  playerY: number,
  playerZ: number,
  bridgeRaised: boolean,
): [number, number, number] | null {
  const dz = playerZ - MOAT_CENTER[2];
  const dist = Math.sqrt(playerX * playerX + dz * dz);
  if (dist < MOAT_INNER_RADIUS || dist > MOAT_OUTER_RADIUS) {
    return null;
  }
  const onDeck =
    Math.abs(playerX) <= BRIDGE_DECK_HALF_WIDTH &&
    playerZ >= BRIDGE_DECK_Z_INNER &&
    playerZ <= BRIDGE_DECK_Z_OUTER;
  if (onDeck && !bridgeRaised) {
    return null;
  }
  if (playerY > 0.5) {
    return null;
  }
  return MOAT_RESPAWN_POS;
}
