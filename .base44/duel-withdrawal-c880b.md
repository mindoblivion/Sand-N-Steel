# C-8.80B — Confirmed duel withdrawal (phase record)

Status: implemented and verified (C-8.80B verification pass, 2026-10-23). The production code
shipped in `6998d37` was **not** redesigned or rewritten; three test-side defects were repaired
and every requested check was run. See §7.

## 1. Preflight (measured, not assumed)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at start | `f68dfccde4ee431105fd6e90c1de1eb3a99a425a` |
| Working tree | `git status --porcelain` empty, `git diff` empty, no untracked files |
| Dev stack | `app-web-1` (image `oven/bun:1`, Vite dev server), `Up 2 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` -> `200` |

Nothing was reset, stashed, discarded, committed, pushed, merged or deployed.

## 2. The rule contract (as approved for this phase)

- Opening the confirmation dialog has **no** gameplay consequences.
- Choosing **Stay and Fight** has **no** gameplay consequences.
- Only **explicit confirmation** counts as a withdrawal.
- A confirmed withdrawal **is an authoritative defeat**: it increments loss accounting and applies the
  existing defeat consequences (injury, day turn) **exactly once**.
- **No** victory purse, no victory-only XP/fame, no tier advancement, no fabricated combat event.
- An accidental exit, unrelated unmount, WebGL failure or reload must **not** count as a withdrawal.

## 3. The L1 rule, verbatim, and the exact conflict

`AGENTS.md`, "Living City L1 — foundational in-game clock", exactly-once paragraph:

> **Exactly-once, enforced at two levels, and the latch is App's own.** ... It is cleared in exactly one
> place — `handleEnterDuel`, the only route onto the duel screen — so a **new** bout re-arms it and a
> repeated callback for the same bout cannot. Merely opening, leaving (the HUD's Armory exit) or
> cancelling a duel never reaches the settlement and therefore never advances the day.

`AGENTS.md`, "Living City L7 — core injury system", first bullet:

> An abandoned or cancelled bout never reaches the settlement, so it neither inflicts nor spends one.

`AGENTS.md`, "Final verification pass", consequence 2 (the design question this phase answers):

> **Leaving mid-fight records no defeat** — the defeat branch is the only writer of `fightsLost` and
> it needs `player.health <= 0`. A losing gladiator can therefore walk out through the badge. That
> is a **design question** (should the badge confirm, or count as a forfeit?), not a code defect;
> nothing was changed, and it is the next decision owed to the duel's exit.

**The conflict.** L1 names "leaving (the HUD's Armory exit)" as an action that must never reach the
settlement. C-8.80B replaces that shortcut with an explicit, confirmed withdrawal that **must** reach
it. Read as a prohibition on exiting the bout at all, L1 and L7 forbid the phase.

**The resolution (and why it does not rewrite L1's intent).** L1's premise is that "leaving" is a
*cancellation* — an accidental or unconsidered exit that should cost nothing. C-8.80B **removes the
cancellation exit entirely**: during a live bout the HUD no longer offers a one-tap route out; the only
exit a player can take is a confirmation that says, in as many words, that the bout is forfeit. So the
category L1 describes no longer exists for a player to choose. The withdrawal is not a cancellation:
it is a **completed, forfeited bout**, and it settles through the *same single settlement boundary*
(`App.handleMatchComplete`, one `advanceCityDay`, one `settleInjury`, one `saveProfile`) that L1 and L7
built. Their invariants are preserved word for word:

- **one authoritative event** — a withdrawal is one settlement, not a second path that skips the
  clock or the injury;
- **exactly once** — the per-bout settlement latch (`claim(duelId)`) still refuses a replay, so
  double confirmation cannot turn the day or injure twice;
- **abandoned / cancelled still settles nothing** — an unmount, a WebGL failure, a reload and a
  dismissed confirmation reach neither `handleMatchComplete` nor any consequence.

No historical requirement is rewritten: L1's and L7's sentences stay in `AGENTS.md` as written, and
this phase's own record states how "leaving" was removed from the player's vocabulary instead of
reinterpreting it.

## 4. Production contracts traced before designing anything

- `DuelStatistics` (`src/types/game.ts`) — the duel's own record, with optional fields whose absence
  is meaningful (`wagerEarned?`, `lootDrop?`, `goldBreakdown?`). It is the object that travels from
  `DuelScene` -> `onMatchComplete` -> App's credit -> `duelResult` -> `DuelResultModal`.
- `App.handleMatchComplete` (`src/App.tsx`) — the one settlement boundary: `claim(settledDuelId)`
  first, then one `advanceCityDay`, one `settleInjury(base, didWin)`, then the victory or the defeat
  profile literal, one `evaluateRituals`, one `setProfile` + `saveProfile`, then `setDuelResult`.
  The defeat branch credits **no** gold, fame or xp and writes only `fightsLost + 1`, the peak hype,
  `city` and `injury`.
- `createDuelSettlementLatch` (`src/utils/duelSettlement.ts`) — `arm()`/`claim(id)`, per bout,
  never cleared, refuses a replay and an out-of-order id.
- `DuelScene` — `isMatchOver` (never cleared), `strikeRef` (enemy announcement), `playerStrikeRef`
  (player swing), `resolutionTimerRef` (1100 ms turn end), the AI `setTimeout(750)`, the 1400 ms
  outcome settlement, and the unmount cleanup that cancels the first three and deliberately keeps
  the settlement.
- `CombatHUD` — the top-left **Armory badge** (`onOpenArmory`, `title="Armory & Opponents"`) that
  App wires to `handleOpenHubTab('tournament')`, i.e. a one-tap exit that unmounts the scene.
- `DuelResultModal` — the staged reveal; a defeat shows the red card, "DEFEAT", "Felled by ...",
  and "Fell at N% of <opponent>'s HP remaining".
- Reward / injury / day / progression: `calculateDuelGold` (defeat totals 0), `settleInjury`
  (defeat inflicts or refreshes 2/2/2), `advanceCityDay` (one day per settled bout),
  `resolveVictoryTier` (victory branch only).

## 5. Design decisions (narrow, and why)

1. **No new settlement path.** The withdrawal calls the *existing* `onMatchComplete` callback by
   reference, so App's latch, clock, injury and save run unchanged. App itself needs **no edit**.
2. **The outcome is carried on the duel's own record, not invented into its statistics.**
   `DuelStatistics.outcome?: 'withdrawn'` — absent means "decided by the sand", so every existing
   reader keeps its exact semantics; it is the only way the result screen can tell a forfeit from a
   knockout without App gaining a second callback signature (pinned by three suites) or a fabricated
   killing blow. No gold/fame/xp field is "zeroed to fake a defeat": the only stat written is
   `goldEarned = 0`, exactly as the shipped defeat branch already does.
3. **One pure, tested orchestrator.** `src/utils/duelWithdrawal.ts` (`withdrawFromDuel`) owns the
   order — refuse when already decided, latch, drop the enemy strike, drop the player swing, clear
   the turn timer, zero the purse, mark the outcome, settle — so the lifecycle is exercised
   behaviourally instead of asserted from source text.
4. **The HUD's exit becomes a badge + a Withdraw action.** The weapon name stays visible as a
   non-interactive badge; the one new control opens a confirmation dialog whose copy states that
   confirmation is a defeat. The WebGL error boundary keeps its existing `onFallbackTo2D` escape
   hatch (a failure surface, not a gameplay action) and that path settles nothing.
5. **Unmount is not a forfeit.** Nothing in the unmount cleanup or in App's dismissal settles.

## 6. Files this phase is expected to touch

`src/types/game.ts`, `src/utils/duelWithdrawal.ts` (new), `src/components/duel/WithdrawConfirmModal.tsx`
(new), `src/components/ui/CombatHUD.tsx`, `src/components/duel/DuelScene.tsx`,
`src/components/hub/DuelResultModal.tsx`, `src/components/dev/CombatHudHarness.tsx`,
`src/utils/phaseC8_79B.test.ts` and `src/utils/phaseC8_79C.test.ts` (prop rename only),
`src/utils/phaseC8_80B.test.ts` (new), `AGENTS.md` (this phase's record).

## 7. Verification pass (2026-10-23) — what was run, and what it proved

**Starting state** (measured before any edit): root `/app`, branch `development-focus-strategy`,
HEAD `6998d37a02c7402634af676f083a4350743e8270`, `git status --porcelain` empty (the previous
session's work is the commit itself), `app-web-1` `Up 2 days (healthy)` on `0.0.0.0:3000`,
`curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` → `200`. Nothing was reset, stashed,
discarded, committed, pushed, merged or deployed.

**The unfinished runs, and the three test-side defects they had hidden.** The first run of
`bun test src/utils/phaseC8_80B.test.ts src/utils/settings.test.ts` was **50 pass / 1 fail**:

1. `§D an unrelated unmount forfeits nothing` sliced the scene with
   `between(source, 'if (resolutionTimerRef.current !== null) clearTimeout(...)', '// OPPONENT AI TURN
   STRATEGY ENGINE')`. `between` takes the **first** match, and C-8.80B's `handleConfirmWithdrawal`
   now contains that same `clearTimeout` statement, so the slice covered the withdrawal handler and
   never reached the cleanup — a false failure, not a production defect. The anchor is now the
   unmount effect itself (`useEffect(\n    () => () => {`), and the test additionally asserts that
   the cleanup *does* drop the timer and both pending strikes, so it pins more than before.
2. The full suite then exposed one stale pin outside this phase's files:
   `phaseC8_74D.test.ts` §D pinned exactly **two** `min-h-[44px]` touch targets in `CombatHUD`; the
   Withdraw action is a third (44 px tall, per the existing convention). The count is rebased to 3
   **and** each reaction target (`shield_block`, `dodge`) is now checked by name, so the test still
   pins its stated contract instead of a bare total.
3. `settings.test.ts`'s haptic-site assertion (`2 → 3`, rebased by the previous session) **was**
   confirmed to test the intended contract rather than merely a changed count: the three `vibrate(`
   sites in `DuelScene.tsx` are the landed hit (942), the confirmed withdrawal (1144) and the
   knockout defeat (1426), and the withdrawal site is now asserted **inside** the confirm handler,
   so the count cannot drift into an unnamed buzz.

No production file was changed in this pass. `error: blocked` lines in the settings output are
expected log noise from the passing "a store that refuses to answer is not an error state" test.

**Results, with exit codes.**

| check | result | exit |
| --- | --- | --- |
| `bun test src/utils/phaseC8_80B.test.ts src/utils/settings.test.ts` | **51 pass / 0 fail** (2 files) | 0 |
| focused regressions (`duelResultLifecycle`, `duelSettlement`, `duelSettlementCommit`, `combatResponsiveness`, `phaseC8_79A`, `phaseC8_79B`, `phaseC8_79C`, `phaseC8_76`, `settings`, `lodging`) | **255 pass / 0 fail** (10 files) | 0 |
| `bun test` (full) | **3515 pass / 0 fail** (123 files) — started at 3514/1 | 0 |
| `bun run lint` (`tsc --noEmit`) | clean | 0 |
| `git diff --check` | clean | 0 |

**The settlement contract, traced and pinned.** `DuelScene` hands `settle: onMatchComplete` by
reference, and App's `handleMatchComplete` is unchanged: `claim(settledDuelId)` first (the per-bout
latch), then one `advanceCityDay`, one `settleInjury(base, didWin)`, then the **defeat** branch only
(`fightsLost + 1`, peak hype, city, injury — no gold, fame, xp or tier). A withdrawal therefore
settles exactly once, applies loss/injury/day exactly once, and can never reach the victory branch.
`withdrawFromDuel` refuses when `isMatchOver.current` is already set, so a duplicate confirmation or
a late click cannot settle or mutate a decided bout; `cancelEnemyStrike`, `cancelPlayerStrike` and
`clearTurnTimer` run before the settlement, so no stale attack/counter can resolve afterwards; the
dialog and "Stay and Fight" touch only `withdrawConfirmOpen`; and the unmount effect settles nothing.

**`DuelStatistics.outcome` and `goldEarned = 0` — consistent with every consumer.** `outcome` is
written in exactly one place (`duelWithdrawal.ts`) and read in exactly one (`DuelResultModal`, as
`!didWin && stats.outcome === 'withdrawn'`), where it selects the WITHDREW card and a flag glyph
instead of DEFEAT/"Felled by". Absence keeps the shipped semantics for every other reader.
`goldEarned = 0` matches the shipped knockout-defeat branch exactly, and App only credits
`stats.goldEarned` inside the `didWin` branch. The object's `fameEarned`/`xpEarned` are still the
opponent's seeded figures (as they are for a knockout defeat), and the result card's reward block is
gated on `didWin && stage >= 3`, so **no victory-only figure is ever displayed or credited** for a
forfeit. Nothing was changed here.

**UI acceptance (preview browser, `?devHarness=character` — the real `DuelScene`/`CombatHUD` against
a disposable in-memory profile, so the player's save is never touched).** Driven with real clicks:

- the weapon badge is a **`<div>`**, not inside any `<button>`, reading
  "Armed: Standard Gladius & Scutum" — it no longer exits the duel;
- the **Withdraw** control is a real `<button>`, 38 × 44 px at the 400 px viewport, and opens the
  confirmation;
- the dialog's copy states the consequence ("it is recorded as a **defeat** … a loss on your record,
  your wound renewed, and the day spent. You take no purse, no fame and no renown.");
- **Stay and Fight** closed the dialog, the stage stayed `duel` and the HUD remained — no settlement;
- **Confirm Withdrawal** closed the dialog and the harness received **one** result: stage `result`,
  `Gold Earned 0`.

**Not automatically verified, and why.** (a) The production `DuelResultModal`'s WITHDREW card was
pinned by `phaseC8_80B.test.ts` §C (copy, icon, "Withdrew with N%") but **not rendered in the
browser**: reaching it needs the real duel entry from the city hub, which writes the player's own
save (a loss, an injury, a day), and that is not something this pass may spend for a screenshot.
(b) **No Android/physical-device run** was performed — landscape HUD legibility, touch feel and the
defeat haptic on hardware remain the open device items recorded in earlier phases. (c) At the 400 px
preview width the Withdraw label is hidden (`hidden sm:inline`), leaving the 44 px flag button with
its `title`; the label returns at ≥ 640 px, i.e. on a landscape phone. This matches the top bar's
other utilities and was **not** changed (a labelling decision, not a defect found in the code).
(d) One low-priority observation, not acted on: the confirm button's label is
`text-neutral-950` on `bg-red-600/85` (≈ 3.2:1), the app's established destructive-button styling
(`DeleteAccountModal`, `SettingsModal` use the same pairing); it reads in the captured frame, and
changing it would relitigate a shared design token.

**Remaining acceptance blockers.** Device (Android) validation of the withdrawal gesture, the
landscape HUD and the defeat haptic; and a real-flow look at the production WITHDREW result card.
No production defect is known to remain in C-8.80B.
