/**
 * L21B — the ONE rectangle-clearance predicate the two landmark-sign suites share.
 *
 * L17B and L17D both claimed to prove that no sign footprint reaches a collider
 * rectangle, and both measured it with the same clamped distance:
 *
 *     const dx = Math.max(r.minX - fp.maxX, fp.minX - r.maxX, 0);
 *     const dz = Math.max(r.minZ - fp.maxZ, fp.minZ - r.maxZ, 0);
 *     expect(Math.hypot(dx, dz) >= 0).toBe(true);
 *
 * `Math.hypot` of two non-negative numbers is never negative, so the assertion
 * could not fail: the clamp had already turned every overlap into 0, and 0 read as
 * "clear". The three vacuous checks are now this predicate instead, which uses the
 * UNCLAMPED axis separations.
 *
 * The rule is the standard separating-axis test for two axis-aligned rectangles
 * in the city's XZ plane: two rectangles are disjoint when at least one axis
 * separates them by a strictly positive amount. Touching exactly (separation 0) is
 * not clear — a footprint that touches a plinth is a footprint on it.
 *
 * Imports nothing, and is used by the tests only; it lives here rather than being
 * copied into both suites so the two can never drift into subtly different
 * definitions of "clear".
 */

/** An axis-aligned rectangle in the city's XZ plane. */
export interface PlanarRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Signed separation on one axis: positive when the two spans are apart along it,
 * negative (by exactly the overlap) when they cross. Deliberately unclamped — the
 * sign of this number is the whole test.
 */
function axisSeparation(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.max(bMin - aMax, aMin - bMax);
}

/** The two unclamped axis separations — positive means apart on that axis. */
export function rectSeparations(
  a: PlanarRect,
  b: PlanarRect
): { readonly x: number; readonly z: number } {
  return {
    x: axisSeparation(a.minX, a.maxX, b.minX, b.maxX),
    z: axisSeparation(a.minZ, a.maxZ, b.minZ, b.maxZ),
  };
}

/** True only when the two rectangles are really disjoint (one axis strictly apart). */
export function rectsClear(a: PlanarRect, b: PlanarRect): boolean {
  const { x, z } = rectSeparations(a, b);
  return x > 0 || z > 0;
}
