# C-8.78A — Combat-feel acceptance audit and device-test preparation

Audit and test preparation only. **No production file is changed** — no combat timing, stamina cost,
damage formula, AI balance, reward, HUD layout or asset is touched. This document records what the
four mechanics actually do in the shipped code, what the automated suites cover, and the manual
Android pass that still has to be performed.

Baseline: branch `development-focus-strategy`, HEAD `ffa4dfd756`, `git status --porcelain` **empty**,
`git diff --check` **clean**, compose stack up (one `web` service, healthy). No stash, reset, commit,
push, merge or deploy.

---

## 1. The four mechanics, as traced in production code

### M1 · Player attack wind-up — 700 ms

| item | value |
|---|---|
| duration | `PLAYER_ATTACK_WINDUP_MS = 700` (`src/utils/combatCalculations.ts:96`) |
| controller | `createPlayerStrike` (`src/utils/playerStrike.ts:87`), created once per duel (`DuelScene.tsx:421-428`) |
| commit | `DuelScene.tsx:1023` (`playerStrikeRef.current?.strike(actionType, resolveImpact)`) |
| impact | `resolveImpact` (`DuelScene.tsx:802`) — the same resolution block both fighters use |
| cue | `CombatHUD.tsx:67` + `:314-345`, rule in `playerStrike.ts:194` |
| turn end | `resolutionTimerRef`, 1100 ms (`DuelScene.tsx:1040-1079`) |

- **Trigger.** The player taps Quick Strike or Power Slash in the tactic panel →
  `executeCombatTurn('player', action)`. Three guards run **before any mutation**: the synchronous
  re-entrancy latch (`resolvingRef`), the authoritative range guard (`isAttackInRange`) and the
  authoritative affordability guard (`canAffordAttack`). A refused tap spends no stamina, starts no
  animation and does not hold the turn.
- **Timing.** At the commit the stamina is deducted once, the `attack_light`/`attack_heavy` animation
  starts and the controller schedules the impact **700 ms later**. Damage, the damage number, the
  hit-stop and the camera shake all land at the impact, not at the tap. The turn ends at **1100 ms**,
  so the blow (700) always resolves before the turn can pass (1100).
- **Feedback.** An amber cue — "Your quick strike" / "Your power slash" — with a 700 ms countdown bar,
  plus the chronicle line "X winds up a quick strike…". The cue is *inert* (`pointer-events-none`, no
  controls) and sits below the vitals.
- **Can the opponent act during it?** No. `isExecuting` is true for the whole window (it disables the
  tactic panel and blocks the AI effect), and `resolvingRef` refuses a second resolution in the same
  tick.
- **Interruption / cancellation.** `cancel()` is called by the 1100 ms turn-end timer, by both outcome
  effects and by the unmount cleanup (the path the HUD's Armory exit triggers). There is **no player
  cancel gesture** — the swing is committed at the tap, and stamina is deliberately not refunded when
  a swing is dropped.
- **Death / duel completion.** `canResolveStrikeImpact` (`playerStrike.ts:160`) re-reads live health,
  match-over state and reach at the impact point, so a stale swing resolves nothing. The turn timer
  still runs, so a dropped blow can never leave the fight locked.
- **Why one swing cannot land twice.** `strike()` returns false while a swing is pending (no second
  schedule); every accepted strike takes an ownership token (`owner`) so a cancelled strike's queued
  callback is a complete no-op; the impact reads the pending action *at* impact (null after a cancel);
  the turn timer calls `cancel()`; and the resolution latch refuses a concurrent turn.

### M2 · Hit-stop — 40 / 60 / 110 / 170 / 200 ms

> **The brief's "≈140 ms" is not a hold that exists in the code.** The shipped holds are
> `HIT_STOP_MS` (`DuelScene.tsx:81-93`): **quick 60, power 110, crit 170, blocked 40, telegraphed
> heavy 200**. 140 ms is the *difference* between the telegraphed heavy and a quick strike
> (200 − 60), which is how earlier phases measured it.

- **Trigger.** The impact point of a **landed** strike (not a miss, not an evade), inside the same
  branch that spawns the damage number and sets `hitFlashTimer`.
- **Timing.** `impactRef.current.freezeUntil = performance.now() + freezeMs` (`DuelScene.tsx:964`),
  with the precedence blocked → telegraphed heavy → crit → quick → power. The telegraphed-heavy marker
  is read **and cleared at the top of `executeCombatTurn`**, before any early return, so a swing the
  player stepped out of cannot lend its 200 ms hold to a later ordinary hit. The player's own strikes
  take the hold their blow earned; a blow the player *receives* replaces it with one flat shake value
  (never both).
- **Feedback.** Both fighters' animation mixers read `impactAnimationScale` (`GladiatorMesh.tsx:26-31`,
  consumed at `:636`) and stop advancing for the hold; the camera rig adds shake trauma (0.25 / 0.45 /
  0.7 / 0.2) that decays at 1.6 units/s.
- **Is the whole duel frozen?** No. Only the two rigs' animations pause. Combat state, the HUD, the
  announcement timers and the 1100 ms resolution all keep running, and the longest hold (200 ms)
  cannot reach a turn boundary.
- **Cleanup.** There is nothing to clean up: it is a **wall-clock deadline, not a timer**. It expires
  by comparison (`now < freezeUntil`) and the ref dies with the scene, so scene exit, cancellation,
  death or a paused tab can never leave a stuck freeze.
- **Duplicate prevention.** One write per resolution, and `resolvingRef` refuses a second resolution.

### M3 · Valéria's announced counter — `counter_dodge`

| item | value |
|---|---|
| mechanic gate | `isCounterDodgeOpponent` (`src/utils/counterDodge.ts:38`) — `bossMechanic === 'counter_dodge'` |
| passive rate | `dodgeChance: 0.35` (`src/data/opponents.ts:259`, in the documented band) |
| queue | `DuelScene.tsx:872` (`queuesCounterOnEvade(isActorPlayer, opponent)`) |
| her turn | `DuelScene.tsx:1264-1282` → `announceEnemyAttack('quick_attack')` |
| announcement | `pendingStrike.announce` (`pendingStrike.ts:85`), 700 ms (`combatCalculations.ts:81`) |

- **Trigger.** A **player** strike is evaded — either her active dodge stance (75%) or her passive
  `dodgeChance` (0.35). `queuesCounterOnEvade` requires `attackerIsPlayer`, so a player who evades
  *her* counter never chains into another counter.
- **Timing.** The latch is set at the player's impact. On her turn (AI 750 ms after the turn toggles
  at 1100 ms) she **announces** a quick strike; the damage resolves 700 ms later through the ordinary
  resolution — same formulas, range guard, stamina cost and evade rules.
- **Feedback.** The red "Quick strike incoming" cue with a 700 ms countdown and the two reaction
  buttons (`CombatHUD.tsx:255-300`), plus the chronicle line naming the wind-up.
- **Can she act during it?** She is locked by `isExecuting`; the player's normal tactics are locked but
  Shield Guard / Dodge are live, and exactly one is accepted (`claimReaction`, `pendingStrike.ts:101`).
- **Interruption.** The queued latch is consumed **before** announcing, so one evade can only ever
  produce one counter; `announce` refuses a second pending strike; if she cannot afford the quick
  strike the answer is dropped with a chronicle line and the turn carries on through ordinary
  selection (nothing is left locked). Victory/defeat clear the latch and cancel the announcement, and
  unmount cancels it.
- **Duplicate prevention.** One latch, one announcement slot, one reaction claim per announcement.

### M4 · Crowd Momentum — every 3rd consecutive landed player hit

| item | value |
|---|---|
| rule | `crowdMomentumReward` (`src/utils/crowdMomentum.ts:75`) — interval 3, gain 10, cap 100 |
| wiring | React effect on `player.comboCount` (`DuelScene.tsx:528-540`) |
| badge | `CombatHUD.tsx:79` + `:152-163` (`isCrowdMomentumMilestone`) |

- **Trigger.** The combo count moves **forward onto** a multiple of 3. `player.comboCount` only moves
  on a player `landed` (+1) or a reset (miss, player damaged); a blocked chip keeps it, and a taunt, a
  dodge, an opponent miss or an evade never touches it — so the award is player-only by construction.
- **Timing.** The same render cycle as the damage write (a `useEffect` on the count), through the
  existing hype writer so the peak that pays the purse keeps its single writer.
- **Feedback.** +10 hype on the existing meter (clamped to 100), the chronicle line "CROWD MOMENTUM! N
  unanswered strikes — the mob is on its feet (+10% Hype).", and the combo badge's existing
  colour/glow swap. **No new HUD row, no damage bonus, no stamina refund.**
- **Interruption / scene exit.** No timers and no locks; nothing to cancel. The effect simply stops
  running when the scene unmounts.
- **Why it cannot award twice.** The award is keyed on the **transition** (`comboCount > previousCombo`
  recorded in `comboMilestoneRef`), so a re-render, a Strict Mode doubled effect or a second identical
  callback all re-observe `3 → 3` and pay 0. A reset to 0 can never pay: 0 is not a milestone and the
  count did not move forward.

---

## 2. Automated coverage — commands and results

Run in the `web` container, 2026-10-23.

| scope | command | result |
|---|---|---|
| wind-up lifecycle (3 files) | `bun test src/utils/playerStrikeWindup.test.ts src/utils/pendingStrike.test.ts src/utils/playerWindupCue.test.ts` | **69 pass / 0 fail**, 283 `expect()` |
| mechanics (4 files) | `bun test src/utils/combatResponsiveness.test.ts src/utils/phaseC8_75B.test.ts src/utils/phaseC8_75F.test.ts src/utils/phaseC8_76.test.ts` | **93 pass / 0 fail**, 467 `expect()` |
| broader combat (6 files) | `bun test src/utils/combatActionOrder.test.ts src/utils/defensiveBalance.test.ts src/utils/duelResultLifecycle.test.ts src/utils/phaseC8_75E.test.ts src/utils/phaseC8_74D.test.ts src/utils/duelSettlement.test.ts` | **144 pass / 0 fail**, 1,287 `expect()` |
| full suite | `bun test` | **3,404 pass / 0 fail**, 91,422 `expect()`, 118 files, 6.26 s |
| types | `bun run lint` (`tsc --noEmit`) | **exit 0** |
| whitespace | `git diff --check` | **clean** |

What the suites actually exercise (traced, not inferred from names):

- `playerStrikeWindup.test.ts` / `pendingStrike.test.ts` / `playerWindupCue.test.ts` drive the **real
  controllers** on a controlled clock (no sleeps): commit → impact at exactly the injected window; a
  refused second strike; a cancel followed by a stale callback; ownership after a newer strike; one
  reaction per announcement; and the cue raised/cleared with the controller rather than by a timer.
- `phaseC8_75F.test.ts` **executes the production `executeCombatTurn` body** (read out of
  `DuelScene.tsx` at test time, run against a deterministic harness that supplies the React primitives
  and a fake clock, with every formula imported) and asserts, among others, that a refused telegraphed
  landing consumes the marker and writes **no** hit-stop (`freezeUntil === 0`) while a landed blow does.
- `phaseC8_75B.test.ts` drives the **production `pendingStrike`** for the counter (announce → 700 ms →
  impact, one impact, one reaction, cancel) and pins the passive-evade gate and the seeded balance
  simulation.
- `phaseC8_76.test.ts` pins the pure momentum rule (milestones, reset, cap, malformed values, the
  player-only rule) **and** reads the shipped wiring (evaluated once on the combo count, the gated hype
  write, the four untouched combo event sites, the existing badge).

**Gaps the audit confirmed (no test was altered):**

- **Nothing pins the hit-stop durations.** `HIT_STOP_MS` / `SHAKE_TRAUMA` have no assertion on their
  values anywhere; the harness only proves "freeze written on a landing / not written on a refusal".
  A future edit could change 200 → 20 ms with every suite green. This is the one coverage gap worth a
  future test, and it is a *test* change, not a production change.
- **Nothing renders `<DuelScene/>`.** There is no DOM renderer for the 3D scene (it mounts a three.js
  `<Canvas>`), so the cue's actual paint, z-order and touch targets remain a device question.

---

## 3. Android acceptance checklist (landscape)

Setup: phone held **landscape**, sound on, one clean run per scenario, screen recording at the highest
available frame rate (slow-motion review is how a 40–200 ms hold is judged; the recording protocol is
in `.base44/hit-stop-device-acceptance.md`). Enter through the shipping route: Colosseum → tier bout
→ **Step into Sand**.

**[P]** = pass criterion.

### A · Player attack wind-up (700 ms)
1. In range, tap **Quick Strike** once.
   - Expect: the tap is acknowledged immediately (amber cue + chronicle line), the swing animation
     starts, and the damage number / health drop appears about 0.7 s later.
   - **[P]** the cue is readable before any damage appears and the blow lands while the swing is still
     playing. **[F]** damage on the same frame as the tap, or no cue at all.
2. Tap **Quick Strike** five times rapidly.
   - **[P]** exactly one strike resolves and the panel stays disabled until the turn ends.
   - **[F]** two damage numbers, two stamina deductions, or an extra turn.
3. Note stamina at the tap and after the turn.
   - **[P]** exactly one deduction of the cost shown on the card. **[F]** a second deduction or a refund.
4. Retreat out of range, then tap Power Slash.
   - **[P]** an "out of range" line, **no** stamina spent, no cue, nothing locks.

### B · Hit-stop
5. Land a quick strike, then a power slash, then a crit (power slash until it crits).
   - Expect: a brief visible freeze of both fighters at the moment of impact; the quick hold is the
     shortest and the crit the longest.
   - **[P]** the freeze is noticeable but short, both fighters pause together, and the duel resumes by
     itself. **[F]** a freeze the player can measure as "stuck", or one that outlasts the turn.
6. Let a strike be **blocked** by the opponent's shield.
   - **[P]** the shortest hold of all. **[F]** the same hold as a normal hit.
7. Fight Goliath (tier 1) through one **HEAVY ATTACK INCOMING** telegraph and let it land.
   - **[P]** the longest hold in the game (~0.2 s) on that landing, and an ordinary hit afterwards does
     **not** inherit it. **[F]** the heavy hold on a normal hit, or no visible difference at all.
8. During a hold, watch the match timer and the panel.
   - **[P]** the timer keeps running and no control is left disabled after the turn.

### C · Valéria's counter (tier 3 boss "Valéria the Viper Queen", recommended level 8)
9. Attack her repeatedly until she slips a strike ("swiftly EVADED").
   - Expect: on her next turn a red **"Quick strike incoming"** cue with a countdown, not an instant hit.
   - **[P]** the cue appears before the damage and leaves time to react. **[F]** damage with no cue.
10. On the cue, tap **Shield Guard**; on a later cue, tap **Dodge**.
    - **[P]** the stance is acknowledged ("Stance set") and exactly one reaction is accepted — tapping
      the other afterwards changes nothing. **[P]** the blow lands against the guard / is evaded.
11. Let one counter land unanswered.
    - **[P]** the damage matches her quick strike, and one evade produces exactly **one** counter.
    - **[F]** two counters from one evade, or a counter with no announcement.
12. Finish the bout during or just after a counter.
    - **[P]** no delayed hit lands on the result screen and no second purse/defeat is recorded.

### D · Crowd Momentum
13. Land three consecutive unanswered strikes.
    - Expect: hype jumps by 10, the chronicle prints "CROWD MOMENTUM! 3 unanswered strikes…", and the
      COMBO ×3 badge takes its lit colour.
    - **[P]** one award at 3. **[F]** an award at 1, 2 or 4.
14. Keep the streak to 6 and 9.
    - **[P]** exactly one award at each milestone.
15. Break the streak (miss, or take a hit), then rebuild to 3.
    - **[P]** a fresh award after the rebuild; **[P]** nothing is awarded at the reset itself.
16. Reach 100 % hype, then land a 3rd hit.
    - **[P]** the meter stays at exactly 100 and the badge lights. *(Known copy defect: the chronicle
      still says "+10% Hype" — see §4, D1.)*

### E · Cross-cutting
17. **[P]** every control is comfortably tappable in landscape (the reaction buttons are the 44 px
    pair); the tactic grid is one row and the chronicle never covers the reaction buttons.
18. **[P]** no stuck animation (a fighter frozen mid-swing after the turn ends), no permanently
    disabled panel, no unexpected stamina deduction.
19. **[P]** no console errors and no unhandled promise rejections during the run.
20. **[P]** leaving the arena mid-wind-up (HUD's Armory button) produces no delayed hit or damage
    number afterwards.

**Status: Android acceptance is PENDING for every item above.** Nothing here was performed on a
device. The sandbox preview renders the duel through SwiftShader at a few frames per second and cannot
resolve a 40–200 ms hold or judge feel; the software-rendered preview is explicitly **not** device
acceptance.

Dev-only helper for item 17 (no 3D cost): the shipped HUD mounts alone at
`?devHarness=hud&hudState=player-windup` (also `3` power / `4` quick / `5` reaction-taken), so the two
cue layers and the touch targets can be inspected at any landscape size. It exists only in a Vite dev
build and cannot be used to judge timing or the 3D scene.

---

## 4. Confirmed defects vs unverified concerns

### Confirmed (source + a pinning test), not fixed — out of scope

**D1 · Crowd Momentum claims a gain it did not make at the hype ceiling.**
`crowdMomentumReward(100, 2, 3)` returns `hypeGain: 10` with `hype: 100`
(`phaseC8_76.test.ts:239-243`), and `DuelScene.tsx:533-539` writes `hype` and logs
`+${hypeGain}% Hype` from that pair. At the cap the meter correctly stays 100, but the chronicle says
the crowd is up 10 points when it moved by 0. Cosmetic feedback-truthfulness only — no gameplay value
changes.
*Reproduction:* reach 100 % hype, land a 3rd consecutive hit, read the chronicle line.
*Minimal proposed correction (not implemented):* in the combo effect, log the real movement —
`const gained = hype - crowdHypeRef.current;` — and use it in the message (or print a "the mob is
already at full voice" variant when `gained === 0`). No formula, cap or award change.

### Unverified concerns (no evidence of a defect)

- **U1** No hardware evidence for any of the four mechanics; every checklist item is PENDING (§3).
- **U2** `HIT_STOP_MS` / `SHAKE_TRAUMA` are unpinned by tests (§2), so their values could drift silently.
- **U3** The brief's "≈140 ms telegraph hit-stop" does not match the code (200 ms; 140 ms is the delta
  against a quick strike). A wording question for the brief, not a code question.
- **U4** A pre-existing known issue reports the enemy telegraph pushing the HUD dashboard past the
  bottom bounds in transient states. C-8.74G took both cues out of flow (`h-0` wrappers, z-30) and the
  geometry was measured at 375×812, but neither cue has been re-measured at a real landscape size with
  a dynamic URL bar. Item 17 of §3 covers it.
- **U5** Cancellation on scene exit is verified by source and by the unmount cleanup, not by a mounted
  test (no DOM renderer for the 3D scene). Item 20 of §3 covers it on device.
- **U6** The pre-existing "losing a duel via the HUD's Armory exit bypasses the defeat record" issue
  remains open and is unrelated to this audit — it is a settlement path, not a timing path.

---

## 5. Recommended next step

The four mechanics are implemented and covered as described; what is missing is **device evidence**.
The cheapest useful next action is the §3 checklist on one Android device with a screen recording, plus
one small test-only follow-up: a suite pinning the five `HIT_STOP_MS` values, the precedence order and
`SHAKE_TRAUMA` by reading them out of `DuelScene.tsx` the way `phaseC8_75F` already reads its
constants. Neither requires a production change.
