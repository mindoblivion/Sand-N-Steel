/**
 * L21D — the herald's queue, and the one rule a dismissal follows.
 *
 * WHY THIS EXISTS. The herald has two cry channels — the road's milestones
 * (`utils/roadMilestones`, raised through `App.evaluateRituals`) and L21B's visitor
 * ledger (`utils/visitorHerald`, whose `(day, visitorId)` keys are spent BEFORE the
 * cry is handed back) — and both only ever APPEND to one `heraldCries` array.
 * `HeraldToast` used to dismiss by replacing that array wholesale
 * (`setHeraldCries([])`). A cry appended between the toast's render and its
 * dismissal landing — the seven-second timer of a stack that had since grown, or a
 * tap on a stack a newer cry had just joined — was destroyed while its
 * deduplication key had already been consumed, so that day's call was silently
 * lost for the rest of the session. Reloading was the only way to hear it again.
 *
 * THE RULE. A toast instance dismisses exactly the cries it displayed. Because the
 * queue is append-only, those cries are always a PREFIX of the live queue, so
 * removing that prefix removes the displayed cries and nothing else: every cry
 * appended after the snapshot stays queued and visible.
 *
 * It is deliberately not a blind `slice(displayed.length)`: every displayed
 * position is compared against the queue first, and a queue that does not begin
 * with that snapshot is returned untouched. That can only happen if something
 * reorders the queue, and leaving a stale cry up is a far smaller failure than
 * silently deleting a newer one whose announcement key is already spent.
 *
 * PURE: no storage, no React, no timer, no clock. The queue itself stays `App`
 * state, in memory only; nothing here is persisted, and no save field exists.
 */

/**
 * Remove exactly the cries a toast displayed from the front of the live queue.
 *
 * `displayed` is the snapshot that toast rendered; `queue` is the queue as it
 * stands now. Returns the SAME array when nothing matched, so React's state
 * update can bail out instead of re-rendering an unchanged stack.
 */
export function removeDisplayedCries(
  queue: string[],
  displayed: readonly string[]
): string[] {
  if (displayed.length === 0 || displayed.length > queue.length) return queue;
  for (let index = 0; index < displayed.length; index += 1) {
    if (queue[index] !== displayed[index]) return queue;
  }
  return queue.slice(displayed.length);
}
