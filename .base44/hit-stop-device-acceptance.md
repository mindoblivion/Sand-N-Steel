# C-8.73D — Hit-stop device acceptance preparation

Preparation only: **no production code, constant, save, timer or test route changed.** This
document is the procedure; the values it names are read from the shipped source at the HEAD
recorded below.

## Baseline

- Repository root `/app`; branch `development-focus-strategy`;
  HEAD `40bad999329598d3e3dea4fa7b6f4676d443e488` ("Add visual telegraph for player attack wind-up").
- `git status --porcelain` and `git diff --check` were clean before the first edit. Nothing was
  reset, stashed, overwritten, committed, pushed, merged or deployed.
- Read first: the AGENTS.md hit-stop record (the "Duel hit-stop and scaled screen shake" section),
  the C-8.71A / C-8.71B / C-8.71D / C-8.72B / C-8.73B records, `src/components/duel/DuelScene.tsx`,
  `src/components/3d/GladiatorMesh.tsx`, `src/components/ui/TurnActionPanel.tsx`,
  `src/data/opponents.ts`, `src/data/itemsDB.ts`, `src/utils/combatCalculations.ts`,
  `src/utils/tierAdvancement.ts`, `src/components/dev/CharacterTestHarness.tsx`, `src/main.tsx`.

## What the shipped code guarantees (read from source)

| outcome | hold | shake trauma added |
|---|---|---|
| blocked (any strike stopped by a shield) | **40 ms** | — (a received hit still adds the player's 0.2) |
| telegraphed heavy landing (Goliath's announced smash) | **200 ms** | — |
| crit (a power attack that crit) | **170 ms** | 0.7 (player's own) |
| power attack | **110 ms** | 0.45 |
| quick attack | **60 ms** | 0.25 |
| any hit the player *receives* | — | 0.2 (replaces the dealt value, never adds) |

- **Precedence** is `blocked → telegraphedHeavy → crit → quick/power` (`HIT_STOP_MS` read at the
  landed branch of `executeCombatTurn`). A telegraphed smash that crits still holds 200 ms, and a
  blocked blow still holds 40 ms however hard it was.
- **The write point is the impact**, immediately before the defender's `hitFlashTimer: 0.3` state
  writes — never at the tap, never at the wind-up commit.
- **What actually stops:** `mixer.timeScale = impactAnimationScale(impactRef, now)` — the *animation*
  advances by `delta × 0`. Both fighters read the same shared ref, so both hold. The camera rig,
  trauma decay, floating damage text, HP bars and the log keep updating on the real frame delta —
  **nothing in game logic waits on the freeze** (the 1100 ms turn timer, the 750 ms AI delay and the
  1400 ms result settle are untouched).
- **The flash is not the hold.** The emissive hit flash starts only when `fighter.action` transitions
  to `'hit'`. A killing blow sets the defender's action to `'death'`, so **there is no hit flash on
  the finishing blow** — the hold is still written, because the freeze is set before the HP/action
  state writes.
- **Death clip:** `'death'` is `LoopOnce` + `clampWhenFinished`, `reset()` to frame 0 with a 0.14 s
  `fadeIn`. Because the freeze stops the mixer, the 60–170 ms hold can also stall that fade-in. What
  the held frame therefore *looks* like is a device question, not inferable from source.
- **Randomness that cannot be forced:** crit is `!isQuick && Math.random() < 0.25`; the opponent's
  choice while the player guards is `45 % power / 30 % taunt / 25 % shield block`; the Goliath
  telegraph is announced at ~30 % per AI turn. None of these has a test hook, and none is added.
- **Reach and the advance rule:** both fighters start at `z = ±3.5` (**7.0 m** apart). `Advance`
  moves 1.8 m but clamps to a 1.2 m minimum gap; the starting gladius has `range: 2.1`, Goliath's
  mace `2.2`. The `Advance` button disables itself once in range, and both strike cards show
  "Out of range — Advance to strike" until then.
- **Which builds can use the dev harness:** `?devHarness=character` exists only in a
  `vite`/`bun run dev` build (`import.meta.env.DEV`, dead-code-eliminated in production). On an
  Android device running a build, **only the shipping routes exist**.

## Which scenarios the shipped routes can set up

| scenario | route | setup reliable? | verdict |
|---|---|---|---|
| quick-strike hit (60 ms) | shipping duel, any opponent | yes — deterministic setup, the hit roll may miss | **available** |
| power-slash hit (110 ms) | shipping duel, any opponent | yes | **available** |
| crit (170 ms) | shipping duel, power slash only | **no** — 25 % roll per landed power attack | **available by repetition**, not forceable |
| blocked incoming hit (40 ms) | shipping duel, hold Shield Guard | **partial** — the guard is deterministic, the opponent choosing to strike is ~45 % per guarded turn | **available by repetition** |
| killing blow | shipping duel played to 0 HP (Marcus 90 HP / Flaccus 105 HP; gladius 14/26 base) | no — it is the end of a real fight | **available through normal play** |
| telegraphed heavy (200 ms) | tier-1 bout vs **Goliath**, his announcement must land unblocked | **no**, and gated: `recommendedLevel 3` unless already beaten | **conditionally available** |
| any of the above in `?devHarness=character` | harness | hardcodes `ALL_OPPONENTS[0]` (Marcus, not a boss) | quick/power/block/kill reachable by attrition; **telegraphed heavy unavailable** |

Unavailable without inventing a workaround (all deliberately **not** added): a forced crit, a forced
opponent strike, a forced killing blow, a boss opponent in the harness, and any save edit to unlock
Goliath. The dev harness is also absent from a device build, so it cannot serve device acceptance.

## Recording protocol (all scenarios)

1. Landscape, `Camera Shake` at its shipped **Reduced** default, `Vibration` **On**.
2. Record with the platform recorder at the device's full rate, e.g.
   `adb shell screenrecord --bit-rate 24000000 --time-limit 180 /sdcard/hs.mp4`.
3. **Baseline first:** record one turn with **no impact** (a Taunt, Rest or Advance turn) and confirm
   the encoder's own cadence. Any stutter there is the recorder, not the game.
4. Extract every frame (`ffmpeg -i hs.mp4 -vsync 0 frames/%04d.png`) and count the frames in which
   the gladiators' **skeletons do not advance**.
5. Expected hold in whole frames — 60 fps: blocked **2–3**, quick **3–4**, power **6–7**, crit
   **10**, telegraphed **12**. At 30 fps: 1, 2, 3, 5, 6. **Below 60 fps a 40 ms hold is not
   adjudicable** — record it as inconclusive, not as a fail.

### The pass/fail discriminator

- **PASS (a real hit-stop):** a continuous run of frames at the expected count in which **neither
  gladiator's animation advances, while the camera keeps shaking/settling, the floating damage text
  keeps rising and the HP bar/HUD update has already landed** — and motion resumes without a visible
  jump backwards.
- **FAIL (a stall, not a hit-stop):** every moving element stops in the *same* frames (camera,
  damage text, HUD) — that is a dropped-frame cluster.
- **FAIL (absent):** motion continues with no measurable hold, or the hold appears on random turns
  unrelated to the impact frame.
- **Onset check:** the first held frame must be the frame on which the damage text spawns and the HP
  bar drops — not the tap and not the end of the wind-up.

## Acceptance checklist

### S1 · Quick-strike hit — 60 ms

- **Start:** tier-1 duel (Marcus), your turn, out of reach.
- **Sequence:** `Advance (+1.8m)` until the Quick Strike card no longer shows "Out of range —
  Advance to strike" (the Advance button greys out at the same moment) → tap `Quick Strike` → let the
  700 ms wind-up, the amber `YOUR QUICK STRIKE / COMMITTED` cue and the impact run → stop recording
  once the opponent's turn begins.
- **Inspect:** the frames from the impact.
- **Expect:** both fighters hold (the attacker's blade holds mid-swing, the defender's hit-reaction
  first pose holds); the defender flashes; HP drops; `-N` floats; slash sound; a 15 ms buzz **only**
  if this landed strike was yours and Vibration is on; after the hold the reaction plays out and the
  turn hands back inside the unchanged 1100 ms.
- **Pass:** 3–4 held frames at 60 fps with the camera/text still moving, onset on the HP-drop frame.
- **Fail:** no hold; a whole-frame stall; or the hold starting before the impact.

### S2 · Power-slash hit — 110 ms, and a crit — 170 ms

- **Sequence:** same approach with `Power Slash` for a normal reading.
- **Crit:** repeat Power Slash until the log reads `CRITICAL BLOW!`. Do not try to force the roll.
- **Inspect:** the crit landing in the *same recording session* as the non-crit power landing.
- **Expect:** the crit's hold is longer than the plain power hold by ~4 frames at 60 fps; the crit's
  damage text reads `-N CRIT!`, the sound is the heavy impact, and the camera shake is visibly
  stronger (trauma 0.7 against 0.45).
- **Pass:** a measurable 6–7 frames plain and ~10 frames crit, both with the matching text and sound.
- **Fail:** identical holds for both; or the crit reading taken on a turn where the strike missed or
  was evaded.

### S3 · Blocked incoming hit — 40 ms

- **Start:** in reach, opponent's turn next.
- **Sequence:** on your turn tap `Shield Guard` (the stance persists across the turn boundary until
  your next action) → wait for the opponent's announcement cue → **do not dodge** → the announced
  strike resolves. Repeat guarded turns until the opponent actually strikes.
- **Inspect:** the strike's impact frames.
- **Expect:** `BLOCKED -N HP` log + text, block sound, at least 1 chip damage, a 40 ms hold
  (2–3 frames at 60 fps), and **no** 15 ms buzz (it fires only for the player's own landed strike).
- **Pass:** a measurable 2–3 frame hold whose onset is the blocked-damage frame.
- **Fail/inconclusive:** no measurable hold *at 60 fps or above* is a fail; at a lower or unstable
  rate it is inconclusive — this is the shortest hold and the one most likely to fall below the
  recorder's resolution.

### S4 · Killing blow — the finishing strike's own hold (60/110/170 ms)

- **Start:** continue a tier-1 duel until the opponent is one strike from 0 HP.
- **Sequence:** land the finishing strike (quick or power).
- **Inspect:** impact → death → result settle.
- **Expect:** HP reaches 0 on the impact frame; **no white emissive flash** (the death transition is
  not the `'hit'` action — its absence is expected, not a defect); the outcome's own freeze is still
  applied; the death clip then proceeds; ~1.4 s later the victory line and the result settle.
- **Pass:** the killing blow reads as impact → hold → fall → result, with a visible hold on the
  finishing frame and no ambiguity about *who* died.
- **Fail:** the fight appears to cut instantly to the result; or the body is parked for clearly
  longer than the expected hold (a stalled 0.14 s death-clip fade-in is the open question to record,
  not a defect claim).

### S5 · Telegraphed heavy landing — 200 ms

- **Start:** tier-1 bout against **Goliath the Pit Behemoth** (Tournament tab, tier 1, bout 3). His
  bout is level-gated at 3 unless already beaten; a save that has not unlocked him cannot run this
  scenario **without editing the save, which is out of bounds**.
- **Sequence:** `Advance` into the boss's 2.2 m reach → end your turns with `Taunt` / `Rest` /
  `Advance` (i.e. **no** defensive stance) so the announced smash lands **unblocked** — a block wins
  precedence and would give 40 ms, and a dodge gives none → when the HUD announces the heavy, let it
  land.
- **Inspect:** the landing frames.
- **Expect:** 12 frames at 60 fps — the longest hold in the game, clearly longer than any S1/S2 hold
  recorded in the same session; both fighters hold; you flash, lose HP, see the damage text.
- **Pass:** ~12 held frames, longer than the crit hold from S2, onset on the HP-drop frame, and no
  more than 200 ms (a crit on that same blow must not read as 170).
- **Fail:** the hold matches an ordinary power attack (the marker was cleared or the blow was
  blocked), or no hold at all.

## Evidence categories

**A · Verified by source and automated tests.** The five durations and their precedence, the write
point at impact, the shared `impactRef` and the `mixer.timeScale` read, the procedural fallback's own
clock, "no game logic waits on the freeze", the flash's `'hit'`-only trigger, the crit/block/AI
tables, the 7.0 m start and the advance clamp, and Goliath's level-3 gate are all read directly from
the shipped files listed above. Focused suite at HEAD:
`bun test src/utils/combatActionOrder.test.ts src/utils/combatResponsiveness.test.ts
src/utils/duelResultLifecycle.test.ts src/utils/pendingStrike.test.ts
src/utils/playerStrikeWindup.test.ts src/utils/playerWindupCue.test.ts` → **136 pass / 0 fail**
(599 `expect()`), matching the C-8.73B baseline. **Gap, stated plainly: no test anywhere pins
`HIT_STOP_MS`, `SHAKE_TRAUMA` or `impactAnimationScale` — the only references to them in the repo are
the two production files.**

**B · Verified in a running browser / development harness.** `/?devHarness=character` mounts at this
HEAD (harness banner + asset-loading overlay, 2026-10-22), so the harness route itself is live. The
C-8.73B record's real-HUD harness run (a full turn resolved, the wind-up cue lifecycle, no console
errors) stands at this content. **The hold itself was not observed live:** the sandbox renders the 3D
duel through SwiftShader at ~1–2 fps, and 40–200 ms is far below its frame time.

**C · Pending real Android/GPU inspection.** Everything in the checklist above: whether each hold is
visible at all, whether 40 ms is perceptible, whether the holds are distinguishable from one another,
whether the killing blow reads without the flash, how the telegraphed smash reads at full length, the
15 ms buzz, and whether the freeze stalls the death clip's fade-in.

## Smallest recommended step after the device results

1. **If the holds are absent or too short** (most likely for the 40 ms block and the 60 ms quick):
   change only the one constant per outcome in `HIT_STOP_MS` — no architecture, no timer, no new
   state. The device recording is the evidence.
2. **If the killing blow reads as a cut:** allow the flash on the `'death'` transition too (one
   condition in `GladiatorMesh`) with its own small test — the only proposed behaviour change, and
   only with the recording attached.
3. **Regardless of the outcome:** add one focused test pinning the five durations, their precedence
   and `impactAnimationScale`'s boundary, since nothing covers them today.
