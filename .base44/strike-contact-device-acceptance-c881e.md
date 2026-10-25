# C-8.81E — Strike-contact visual acceptance (preparation only; Android PENDING)

**Nothing was changed in gameplay.** No clip timing, playback rate, damage timing, weapon attachment
transform, range, movement rule, combat constant, asset or test route was touched by this phase. This
document is the procedure; every number in it is read from the shipped source at the HEAD below, or was
measured live in the sandbox browser (marked as such).

## 1. Preflight (measured)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at the start | `d0956f609497cd926a0c8d971e6de75d904dac75` |
| `git status --short` at the start | **empty** (clean tree; the C-8.81D work is committed, not pending) |
| Dev stack | `app-web-1` (`oven/bun:1`, Vite), `Up 3 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl -s -o /dev/null -w '%{http_code}' localhost:3000/` → **200** |

Read before writing this: `AGENTS.md` (the C-8.81D section, "Duel hit-stop and scaled screen shake", the
harness sections, "Verifying"), `src/utils/attackContact.ts`, `src/utils/bladeTip.ts`,
`src/utils/duelGeometry.ts`, `src/utils/combatCalculations.ts`, `src/components/duel/DuelScene.tsx`,
`src/components/3d/GladiatorMesh.tsx`, `src/components/ui/TurnActionPanel.tsx`,
`src/components/dev/CharacterTestHarness.tsx`, `src/main.tsx`, `.base44/attack-contact-c881d.md`,
`.base44/hit-stop-device-acceptance.md`.

## 2. What the shipped code does at each strike (read from source)

| stage | light (`Quick Strike`) | heavy (`Power Slash`) |
| --- | --- | --- |
| commitment | the tap disables the grid; `PLAYER_ATTACK_WINDUP_MS` = **700 ms** | same |
| clip | `Sword_Attack`, 1.917 s | `Sword_Regular_C`, 1.667 s |
| playback rate | `546 / 700` = **0.78** | `698 / 700` = **0.9971428571** |
| clip time at impact | **546 ms** | **698 ms** |
| hit-stop | **60 ms** | **110 ms** (crit **170 ms**) |
| defender reaction | action `hit` → `Hit_Chest`; emissive flash 0.3 s; HP drop; floating `-N` | same |
| camera trauma | 0.25 | 0.45 |

- The rate is `contact / attackContactWindowMs()`, where the window is `700 - 16.67 + 16.67` = **700 ms**
  (`ATTACK_CLIP_START_LAG_MS` and `HIT_STOP_SAMPLE_LAG_MS` cancel). `GladiatorMesh` sets it per clip via
  `attackPlaybackRateForAction`; every non-striking action still plays at 1.
- The hit-stop is `mixer.timeScale = impactAnimationScale(impactRef)` — the pose the freeze holds is the
  first frame boundary at or after the impact, which is why the contact frame is measured mid-descent on
  the light and at its deepest on the heavy. Nothing in game logic waits on the freeze.

### What the strike is *expected* to look like (measured geometry, never observed on hardware)

| | light, at 1.8 m | heavy, at 1.8 m |
| --- | --- | --- |
| blade tip height at contact | **1.297 m** | **0.578 m** |
| nearest defender vertex | y **1.302** (chest) | y **0.575** (leading knee) |
| tip-to-surface distance | **0.0074** | **0.0073** |
| torso distance | **0.0074** | **0.337** |

The heavy's overhead arc passes ~0.34 **in front of** the torso and never touches it at any frame; its
closest approach is the defender's knee. That is a pose-quality limitation of the clip, not a timing
question, and it is the one thing this acceptance pass exists to judge.

## 3. The route (existing; no new route added)

**`?devHarness=character`** — `src/components/dev/CharacterTestHarness.tsx`, mounted INSTEAD of the game
by `src/main.tsx` only in a Vite dev build (`import.meta.env.DEV`). It uses an in-memory profile: nothing
is saved, and the player's real save is never read or written. It hardcodes `ALL_OPPONENTS[0]`
(Marcus the Rookie, 90 HP) and starts the duel at the designed **3.6 m** opening.

- **On Android this works only against the sandbox dev server** — open the same public port-3000 URL the
  preview uses (in Chrome on the phone) and append `?devHarness=character`. It does **not** exist in an
  installed production build, where the branch is dead-code-eliminated.
- **The shipping route also works on a device** (title → character creation → 3D city → Colosseum tab →
  Enter Arena Duel → Step into Sand), but it costs the GPU-heavy hub first and cannot start a fresh bout
  as quickly.

**Why no new harness was added.** The existing route already provides what the test needs: the real
`DuelScene`, the real HUD and range gate, both strike cards, a deterministic 3.6 m opening, and a live
`DIST: x.xm` readout in the chronicle header. It cannot freeze a frame or force the opponent's choice —
neither can any in-app route — and the frame-level inspection is done from a 60 fps screen recording
(§5), not from the app. A dedicated strike harness would only be justified if the recording method
below proves unable to adjudicate the contact.

### Live check performed this phase (sandbox browser, 400 px mobile viewport)

| assertion | result |
| --- | --- |
| `/?devHarness=character` mounts the harness banner instead of the title screen | **pass** |
| creation → "TEST PROFILE READY" → Start Test Duel reaches the live duel | **pass** |
| opening chronicle reads `DIST: 3.6m`, Advance enabled, both strike cards disabled behind "Out of range — Advance to strike" | **pass** |
| one `Advance (+1.8m)` → chronicle `DIST: 1.8m`, `Range Status: IN STRIKE RANGE`, overlay gone, Advance now disabled | **pass** |
| the strike cards enabling after the move resolves | **not captured** — the read was taken while the panel still showed `EXECUTING STRIKE...`; the gate itself (`IN STRIKE RANGE`) was confirmed |

The sandbox renders the arena in software (~1–2 fps), so **no strike was executed here** and nothing
about the impact's appearance was observed.

## 4. Android reproduction — the exact steps

Settings for the run: **landscape**, quality preset at its default, `Camera Shake` at **Reduced**
(shipped default), `Vibration` **on**.

1. On the phone, open the sandbox port-3000 URL with `?devHarness=character`.
2. Character creation shows the Roman Warrior rig. Leave the defaults (name `Spartacus`, Roman Warrior,
   10 unspent points) and tap **"Apply Points & Enter Metropolis [Town Gate]"**.
3. On **TEST PROFILE READY** tap **"Start Test Duel (opponent: Marcus the Rookie)"**.
4. Confirm the chronicle header reads **`DIST: 3.6m`** and both strike cards show *Out of range —
   Advance to strike*. If the opponent's first turn already closed the gap (it advances 82 % of the time
   when out of range), skip step 5.
5. Tap **`Advance (+1.8m)`** once. Wait for the turn to hand back and confirm **`DIST: 1.8m`** and
   **`Range Status: IN STRIKE RANGE`**. This is the only state the strikes are judged in.
6. **Run A — light:** tap **Quick Strike**. Let the 700 ms wind-up, the strike, the impact and the
   opponent's answer play out.
7. Stay at 1.8 m (the opponent does not close while in range). **Run B — heavy:** tap **Power Slash**.
8. If the opponent ever moves — or the readout leaves 1.8 m — Retreat to 3.0 m and Advance back to 1.8 m,
   or restart the duel from the harness to get a clean opening again.

Stamina is not a constraint here: the gladius costs 12 SP (light) and 24 SP (heavy), and the fresh
profile starts at full. Marcus has 90 HP against 14 / 26 base damage, so neither of the two strikes can
end the bout — both runs can be taken in one duel.

## 5. Recording and frame inspection (reuses the C-8.73D protocol)

1. Record the screen at the device's full rate:
   `adb shell screenrecord --bit-rate 24000000 --time-limit 180 /sdcard/c881e.mp4`.
2. **Baseline first:** record one turn with no strike (a Taunt or a Retreat) and confirm the encoder's own
   cadence. Any stutter there is the recorder, not the game.
3. Extract every frame: `ffmpeg -i c881e.mp4 -vsync 0 frames/%04d.png`.
4. Locate the **onset frame**: the first frame on which the damage text spawns and the defender's HP bar
   drops. That frame is the impact; the tap is ~700 ms earlier (≈ 42 frames at 60 fps).
5. Judge the **contact** on the onset frame, allowing ±2 frames (33 ms):
   - **light** — the blade tip should be at the defender's **chest/upper torso**, around shoulder-line
     height, and should read as *touching*: not visibly short, not passing through the body.
   - **heavy** — the blade should be **low**, at the defender's leading **knee/shin**, and pass in front of
     the torso rather than into it.
6. Count the **held frames**: frames in which neither gladiator's skeleton advances while the camera keeps
   settling, the damage text keeps rising and the HP bar has already landed. Expect **3–4** frames for the
   light (60 ms) and **6–7** for the heavy (110 ms) at 60 fps; below 60 fps a 60 ms hold is inconclusive,
   not a fail.
7. Note what the held pose shows: the attacker's blade mid-cut, the defender in the first pose of
   `Hit_Chest`, the emissive flash, the floating `-N`, and the shake strength (the heavy's is visibly
   stronger).

### Pass / fail discriminators

- **PASS (contact):** on the onset frame the blade is on the body at the expected height for that strike,
  with no visible gap and no visible pass-through, and the pose resumes without a jump.
- **FAIL (early):** the blade is already past/through the defender on or before the onset frame.
- **FAIL (late):** the damage text and HP drop land while the blade is still clearly short of the body.
- **FAIL (stall, not hit-stop):** every moving element stops in the same frames — a dropped-frame cluster.
- **Record, do not fail:** the heavy landing low. That is the designed measurement, and whether it *reads*
  as intentional is the judgement this pass is collecting.

## 6. What evidence decides whether the heavy needs its own animation task

Answer these from the recording, for the heavy at **1.8 m**:

1. On the onset frame, is the blade visibly in contact with the defender's knee/leg, or does the impact
   read as a strike at the air in front of them?
2. Does the held pose read as a **deliberate low power blow**, or as a **leg graze / mistimed chop**?
3. Do the damage text and the defender's reaction make the moment legible even though the blade is not at
   the torso?

- **No separate task** if (1) is contact and (2) reads as deliberate.
- **Separate animation/weapon-alignment task** if (1) is contact but (2) reads as a graze — a clip choice
  or arc change, since no frame of `Sword_Regular_C` touches the torso and scaling the blade is already
  ruled out (C-8.81C).
- **Timing regression, not animation** if (1) is *not* contact, or if the impact lands visibly before or
  after the onset frame — that would contradict the calibrated 546 / 698 ms frames and needs
  re-measurement.

Also worth recording while the pass is open (secondary, not blocking): at the **1.2 m** minimum gap both
tips pass *through* the body by measurement (0.2535 / 0.1577 from the nearest surface); note whether that
reads as obvious clipping in a normal bout.

## 7. Device test status

**Not performed.** There is no physical Android device attached to this sandbox; every statement above
about how the strikes *look* is geometry or source, not observation. Android acceptance remains
**PENDING** until the steps in §4 are run and the evidence in §5 is returned.

## 8. Tracked measurement harnesses at the repo root

All twelve `.c881d-*.ts` files are **tracked** (added by `5a35664`, still present at this HEAD), and
nothing imports them.

| file | what it prints (from its own output) |
| --- | --- |
| `.c881d-measure.ts` | per-clip closest-approach sweep; carries the superseded C-8.80G frames (519 / 659) |
| `.c881d-m2.ts` | second-body sweep of the same shape; also carries 519 / 659 |
| `.c881d-scan.ts` | separation sweep, one table per distance |
| `.c881d-dists.ts` | distance table for a fixed pair |
| `.c881d-parity.ts` | surface-distance parity against its own ray/grid solid model |
| `.c881d-verify.ts` | an independent minimum table (`ms / minDist / defY / tipY / tipDist`) at 1.8 m |
| `.c881d-final.ts` | the final strike table used for the shipped figures |
| `.c881d-inside.ts` | penetration probe at a fixed (clip, ms, separation) |
| `.c881d-pen.ts` | penetration probe, one line per frame |
| `.c881d-surface.ts`, `.c881d-surface2.ts`, `.c881d-surface3.ts` | three iterations of one surface-distance query on the defender mesh |

- **They are not tests and not artifacts of the shipping build.** `bun test` collects `*.test.ts` only, and
  `tsconfig.json` includes `src` and `scripts` — so these root files are neither run nor type-checked, and
  they cannot affect `bun run lint` or `bun run build`.
- **They are not reusable.** Each hardcodes `/app/public/models/...` absolute paths, so it only runs inside
  this container; they print tables rather than asserting anything; and two of them still use the
  superseded 519 / 659 frames, so re-running them reproduces the old — wrong — numbers.
- **They are documented only as scratch.** `AGENTS.md` names them "scratch scripts, not tests", and the
  repository's own convention is that new measurement work goes in `/tmp`.
- **Recommendation (not done in this phase; deletion was not requested): delete all twelve** in a future,
  explicitly approved cleanup, once their reproduction method is confirmed to live in
  `.base44/attack-contact-c881d.md`. The durable artifact of the measurement is
  `src/utils/phaseC8_81d.test.ts`, which re-derives both frames from the assets and asserts them. If they
  must be kept, move them out of the repo root into a documented diagnostics folder rather than deleting.
  Either way they should not stay at the root as `.`-prefixed tracked files.
