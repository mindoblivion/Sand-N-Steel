# C-8.80G — Attack contact-phase calibration (phase record)

Status: implemented and measured (2026-10-24). One new pure module, one lifecycle line in
`GladiatorMesh`, one new suite. **No combat timing, damage, range, stamina, AI, hit-stop duration or
weapon-attachment value changed.** No commit, push, merge or deployment was performed by the phase.

## 1. Preflight (measured)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at start | `35757d66c615d369d590f49b2be1ffedc523d85a` |
| Working tree | `git status --porcelain` empty before the first edit |
| Dev stack | `app-web-1` (oven/bun:1, Vite), `Up 2 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl localhost:3000/` → `200` |
| C-8.80F record | **not present in the repo** — the audit was read-only, so its 549 ms figure was treated as a hypothesis and re-measured (it did not reproduce exactly; see §2) |

Read before editing: `GladiatorMesh.tsx` (action effect, `useAnimations`, the `mixer.timeScale`
hit-stop), `DuelScene.tsx` (player strike commit/impact, the 1100 ms turn timer, `HIT_STOP_MS`),
`combatCalculations.ts` (both 700 ms wind-ups), `pendingStrike.ts` / `playerStrike.ts` (impact
scheduling and cancellation), `duelWithdrawal.ts` (the confirmed forfeit), `weaponAttachment.ts` and
`phaseC8_80e.test.ts` (the C-8.80E implementation and its transform harness).

## 2. Measurements (real assets, real `AnimationMixer`)

Method: the shipped hierarchy rebuilt in three.js — real `arena_roman.glb` / `gladius.glb`, root
scale `meshScale × correction`, the gladius on `hand_r` inside the C-8.80E attachment group
(`1/correction`, `[π/2, 0, 0]`), the defender on `Fighting_Idle` at 0.4 s and posed at the legal
gladius distance (2.1, roots at ±1.05, rotations π / 0). Tip world position from
`attachment.localToWorld`, distance to the defender's nearest skinned vertex, scanned at 1 ms.

| clip | duration | contact clip time | tip-to-defender at contact | at 700 ms | ratio |
| --- | --- | --- | --- | --- | --- |
| `Sword_Attack` (light) | 1.917 s | **519 ms** | 0.786 | 2.032 | 2.6× |
| `Sword_Regular_C` (heavy) | 1.667 s | **659 ms** | 0.573 | 1.673 | 2.9× |

Cross-body stability (same method, each body's own correction and attachment scale):

| body | correction | `Sword_Attack` | `Sword_Regular_C` |
| --- | --- | --- | --- |
| arena_roman | 1.00 | 519 ms | 659 ms |
| amazonian | 0.61 | 517 ms | 659 ms |
| dimachaerus | 0.60 | 518 ms | 659 ms |
| minotaur | 0.77 | 523 ms | 661 ms |
| netfighter | 0.60 | 517 ms | 659 ms |

All five bodies load the same 178 clips and `resolveActionClip` picks the same two attack clips on
every one, so the contact phase is a property of the **clip**, not of the model — one constant per
clip, and no universal multiplier (the clips differ by 140 ms, twenty times the cross-body spread).

## 3. Rates, and how the offsets were handled

`rate = contact / window`, with `window = PLAYER_ATTACK_WINDUP_MS − ATTACK_CLIP_START_LAG_MS +
HIT_STOP_SAMPLE_LAG_MS`. Both offsets are one 60 Hz frame and they cancel, so the window is the
700 ms wind-up itself:

- **clip start lag** — `play()` runs in the effect that follows the React commit and drei's mixer
  advances on the next frame, so the clip's clock starts up to a frame after the tap;
- **hit-stop sample lag** — the impact timer fires between frames and `GladiatorMesh` sets the
  freeze in its own `useFrame`, which runs *after* the mixer's update, so the pose the hit-stop
  holds is the frame boundary at or just after the impact.

| clip | rate | clip time reached at the impact | pose held during the freeze (measured band, one frame either side) |
| --- | --- | --- | --- |
| `Sword_Attack` | **0.7414285714** | 519 ms | 0.786 … 0.881 |
| `Sword_Regular_C` | **0.9414285714** | 659 ms | 0.574 … 1.005 |

The residual one-frame band is stated rather than hidden. It is not biased toward an earlier target
deliberately: measured on the real tip path, a frame **after** contact costs less than a frame
**before** it on both clips (light 517→533: 0.790→0.912; heavy 650→667: 0.892→0.792), so aligning
contact to the impact is the better end of the interval.

## 4. The change (narrowest possible)

`src/utils/attackContact.ts` — `ATTACK_CLIP_CONTACT_MS` (the two measured values),
`ATTACK_FRAME_MS` / `ATTACK_CLIP_START_LAG_MS` / `HIT_STOP_SAMPLE_LAG_MS`,
`attackContactWindowMs()`, `attackPlaybackRateForClip()` and `attackPlaybackRateForAction()` (which
returns 1 for everything that is not `attack_light` / `attack_heavy`, and for uncalibrated clips).

`GladiatorMesh.tsx` — one line in the existing action effect, after `reset()`:

```tsx
nextAction.setEffectiveTimeScale(attackPlaybackRateForAction(activeAction, targetClip));
```

`reset()` does not clear the rate (pinned by a test), so the lifecycle point is safe. The action's
rate multiplies `mixer.timeScale`, which remains the hit-stop's only channel — the file still has
exactly one `mixer.timeScale` assignment — so a freeze still stops the clip exactly where it is. The
opponent's swings go through the same component and are calibrated identically.

Nothing else moved: `PLAYER_ATTACK_WINDUP_MS` / `ENEMY_ATTACK_WINDUP_MS` (700), the 1100 ms turn
timer, the `HIT_STOP_MS` table (60 / 110 / 170 / 40 / 200), damage, range, stamina, the AI, the
defensive stances, withdrawal, the settlement and the C-8.80E attachment are untouched.

## 5. Regression coverage — `src/utils/phaseC8_80g.test.ts` (22 tests / 92 expect(), ~0.6 s)

- §A the derivation: the window is the wind-up with both offsets cancelling; each clip's rate maps
  its own contact frame onto it (9 dp); the two rates differ by 140 ms of clip time; the derivation
  follows a changed wind-up instead of a hard-coded 700; uncalibrated clips and every non-striking
  action stay at 1; unusable inputs fall back.
- §B runtime transforms over the real assets: both contact frames re-measured within 7 ms of the
  stored constants, and the tip is more than twice as far away at the impact as at contact (the
  defect itself); minotaur (0.77, its own attachment scale) reproduces both frames, which is the
  evidence for "per clip, not per model".
- §C the real animation API: `reset()` keeps the rate; at the calibrated rate `action.time` is at
  the contact frame after 42 × 1/60 s; at rate 1 it is 181 ms past it; the hit-stop (`mixer.timeScale
  = 0`) holds `action.time` exactly and the clip resumes at `rate × delta`; the shipped hit-stop
  table is unchanged and none of its durations advances the held pose.
- §D the contract: both wind-ups, the 1100 ms timer, gladius damage/range/stamina and the 2.1 range
  boundary; the rate is applied to the action while `mixer.timeScale` keeps its single hit-stop
  assignment; the C-8.80E attachment is still in place.
- §E cancellation: a cancelled swing resolves nothing; a confirmed withdrawal drops the pending
  swing, settles once, zeroes the purse and marks `withdrawn`, and a second confirmation changes
  nothing; a stale callback cannot resolve a newer swing.

## 6. Validation (2026-10-24, `web` container, final tree)

| command | result |
| --- | --- |
| `bun test src/utils/phaseC8_80g.test.ts` | **22 pass / 0 fail** (92 expect()) |
| focused set (`phaseC8_80e`, `phaseC8_80g`, `playerStrikeWindup`, `pendingStrike`, `combatResponsiveness`, `combatActionOrder`, `defensiveBalance`, `duelResultLifecycle`) | **179 pass / 0 fail** (742 expect()) |
| `bun run scripts/combatTests.ts` | **69 passed, 0 failed** |
| `bun test` (full) | **3553 pass / 0 fail (125 files, 92,654 expect())** — C-8.80E left 3531 / 124 / 92,562 |
| `bun run lint` (`tsc --noEmit`) | exit 0 |
| `git diff --check` | clean |

## 7. Rendered evidence, and its limits

Preview (anonymous visitor, app root): the title screen renders (**0 console errors**), and the dev
server serves this turn's source — `/src/utils/attackContact.ts` carries both measured constants and
the window helper, and the transformed `GladiatorMesh.tsx` carries the `setEffectiveTimeScale(...)`
call while still holding exactly one `mixer.timeScale` assignment.

**Not automatically verified:** a live before/after capture of the impact frame inside a duel. The
sandbox renders the duel through SwiftShader at ~1–2 fps, i.e. 500–1000 ms per frame against a 700 ms
wind-up, so the impact instant cannot be sampled there — the frame-level comparison in §3 comes from
the same deterministic transform harness that produced the baseline, not from the running arena.
Android / device acceptance of the strike's read is **PENDING**; do not claim it. The residual
standoff gap at the legal range (≈0.5 world units, recorded by C-8.80E) is untouched by this phase.
