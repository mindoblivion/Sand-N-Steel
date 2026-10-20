/**
 * The two-step arm behind the New Character overwrite confirmation.
 *
 * The player's first tap ARMS the erase and the second one lands it; the arm lapses
 * on its own after this window, so a tap the player forgot about cannot erase a save
 * later.  Pure and clock-free — the caller passes the time — so the window is the one
 * place it is defined and can be exercised without a browser.
 */
export const OVERWRITE_ARM_WINDOW_MS = 3000;

/**
 * Is an arm taken at `armedAt` still live at `now`?
 *
 * `null` (never armed, or lapsed and cleared) is never live.  The boundary is
 * inclusive: an arm exactly `OVERWRITE_ARM_WINDOW_MS` old still counts.
 */
export function overwriteArmIsLive(armedAt: number | null, now: number): boolean {
  return armedAt !== null && now - armedAt <= OVERWRITE_ARM_WINDOW_MS;
}
