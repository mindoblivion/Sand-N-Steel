# C-8.70A — Chariot racing implementation audit (read-only)

## Preflight and scope

Branch `colosseum-exterior-architecture`, HEAD `073ac49eb5b0d498cc7d52b4f070e1b3ac3f4f19`;
`git status --short` was empty. The governing `AGENTS.md`, the East Circus layout
(`circusDistrictGeometry.ts`), the race screen (`RaceScene.tsx`), the race's pure modules
(`raceState.ts`, `chariotMovement.ts`, `chaseCamera.ts`), the formation plan
(`chariotTeamFormation.ts`), the progression module (`racingProgression.ts`) and the three horse
assets were read.

**No production file was changed by this audit.** No collider, geometry, material, transform, save
or progression code was touched, no test was edited, and no commit, push or deploy was run. The only
artefact of the phase is this record.

## What already ships (C-8.70B Stage 1, slices 0–2 + camera addendum)

| piece | file | state |
|---|---|---|
| district race entry, pre-race panel | `circusDistrictGeometry.ts`, `PreRacePanel.tsx`, `App.tsx` | shipped |
| race screen as a fifth `GameScreen` value | `App.tsx`, `components/3d/RaceScene.tsx` | shipped |
| five-state machine `idle → countdown → racing → finished → aborted` | `utils/raceState.ts` | shipped; **`finishRace` has no caller** |
| movement physics, boundary stop, Clean Start | `utils/chariotMovement.ts` | shipped, pure, unit-tested |
| touch + keyboard controls, gait HUD | `ui/RaceTouchControls.tsx`, `RaceScene.tsx` | shipped |
| chase camera at the surveyed standard (55°→65° FOV, 8.5 / 3.4 Standard) | `utils/chaseCamera.ts` | shipped |

## Measured facts re-verified at this HEAD

- **Arena placement.** `EastCircusArena` = `public/_workspace_arena.glb`, mounted at
  `[CIRCUS_AXIS_X = 52.34, 0.00, CIRCUS_SOUTH_Z = 43.80]`, yaw π/2, scale 0.20 (C-8.69B lifted the
  ground contact by 0.05). The track's top face is Y 0; the carceres block's rendered north face is
  Z 43.80 and its registered front collider line is Z 46.00.
- **Start line.** `CIRCUS_RACE_START = {x: 52.34, y: 0, z: 42.5, rotationY: 0}` — on the track's
  centre line, 1.30 north of the carceres' rendered face, 3.50 north of its collider.
  `CIRCUS_RACE_CAMERA` stands north-east of the model, because the 2.18-high carceres block hides it
  from any camera placed south.
- **Perimeter.** The arena is enclosed by **31 `circus-*` collider segments** derived from one
  closed polygon; three of them (`circus-carceres-w`, `-e`, `-front`) bound the carceres block's
  belly and are deliberately not polygon edges. There is **no traversable entrance**: the carceres
  and north mouths are capped by collision-only chords. Racing is therefore a **separate screen**,
  not driving in the city hub, and that is the shipped architecture.
- **Movement envelope.** `CHARIOT_MOVEMENT` holds forward cap 13, reverse cap 3.2, acceleration /
  brake / reverse / drag, turn rate 0.35 rad/s at rest → 1.5 rad/s at the cap, fixed step 1/60 s,
  frame clamp 0.1 s, two boundary probes (body 1.05 behind, yoke 0.70 at 2.02 forward). Boundary
  contact projects the position and zeroes speed; the chariot cannot leave the ring.
- **Chariot asset.** `public/_workspace_chariot_model_RomanChariot.glb`, 202,280 bytes, 26 nodes,
  23 meshes, 9,768 triangles, no skin, no animations; forward is local **−Z**; widest point
  X ±0.768; wheel leading edge Z −0.685; yoke line Z −2.020, underside Y 0.935, pegs at X ±0.500.

## Horse asset feasibility — measured, and the reason the team is not drawn yet

Three candidate assets, all with the same rig and the same three clips:

| asset | bytes | skins / joints | meshes | clips |
|---|---|---|---|---|
| `_workspace_dist_horse_weak.glb` | 15,248,136 | 1 / 31 | 7 | Gallop 0.708 s, Idle 4.042 s, Walk 1.042 s |
| `_workspace_dist_horse_better.glb` | 15,783,980 | 1 / 31 | 9 | same three |
| `_workspace_dist_horse_great.glb` | 16,342,056 | 1 / 31 | 10 | same three |

Each clip animates 93 channels (translation, rotation, scale) across the 31 joints, but **the legs
do not move**:

- `Gallop` and `Walk` move **no leg joint at all** — the largest leg rotation across the whole clip
  is **0.02°** (shoulder). What moves is the tail (up to 14.6°) and the neck/head (5–11°), i.e. a
  breathing/sway pose, not a gait.
- `Idle` is the only clip that touches the legs, and only by **2°** (thigh).
- Joint chains available to a future gait: `shoulder_L/R → forearm_L/R → fcannon_L/R →
  fpastern_L/R → fhoof_L/R` and `thigh_L/R → gaskin_L/R → hcannon_L/R → hpastern_L/R → hhoof_L/R`,
  plus `chest`, `spine`, `pelvis`, `root`, `neck1/2`, `head`, `tail1/2/3`.

Consequence recorded for the roadmap: the supplied clips cannot be played as a gait, so a hitched
team would visibly slide with rigid legs; the team can be drawn either in the rest pose (honest but
inert) or with a **procedurally driven** leg cycle on the measured joint names (a new pure module
plus per-frame bone writes — and not judgeable in this GPU-less sandbox).

Fit numbers already derived and pinned: horse forward **+X** → chariot **−Z** = one **+90° yaw about
Y**; the Alternative-A scale `0.935 / 1.6907 = 0.5530` puts the withers on the yoke's underside and
the hooves on the chariot's ground plane; the yoke's own two pegs hold the yoked pair.

## Team progression and the plan that renders nothing yet

`racingProgression.ts` is the single source for team size: **Biga 2 (default, price 0) → Triga 3
(750, requires biga) → Quadra 4 (1,500, requires triga)**, unlocked in order, purchased as an atomic
transaction that deducts exactly once and never auto-selects, stored in `PlayerProfile.racing`.
`chariotTeamFormation.ts` turns the selected team size into one station per horse (lane X, yoke-line
Z, hoof Y, yoked/trace attachment) and publishes every clearance. **Nothing consumes it**: the race
scene renders the chariot alone, so Biga/Triga/Quadra are visually identical today.

## Gaps this audit hands to the roadmap

1. **No horses.** The player's team never appears, so the racing configuration has no visible effect.
2. **No wheel rotation.** The model's wheels are static; the chariot reads as slid rather than rolled.
3. **No finish, no lap, no time result.** `finished` is reachable only from a test; `finishRace` is
   unused, so a race can only be aborted.
4. **No rivals, incidents or wager.** `idle` / `countdown` / `racing` are a solitary session.
5. **Best-time persistence does not exist** — deliberately, because the race is read-only today.

## Roadmap and acceptance criteria

- **Stage 1 — the race as a physical event (IN PROGRESS).** Slices 0–2 and the camera addendum are
  shipped. Remaining acceptance: the player's own team (Biga/Triga/Quadra) is hitched at the
  formation's stations and reads as moving with the chariot; the fitted wheels roll at the travelled
  speed; the whole thing keeps the mobile draw-call and asset budget.
- **Stage 2 — the finish.** A closed lap circuit with a start/finish gate that `finishRace` can be
  called from, lap counting, a time result screen, and the first deliberate save write (best time
  per team size). Acceptance: a full lap can be driven, timed, finished and abandoned; finishing
  writes only the best-time field; aborting still writes nothing.
- **Stage 3 — the sport.** Rivals on the same track, start-gate incidents, and rewards or a wager
  that makes racing part of progression. Acceptance: a race with a rival can be won or lost, and the
  result reaches progression through the existing transaction style.

## Evidence limits

Everything above is source- and asset-measured. Nothing here is a visual acceptance: the sandbox has
no GPU (SwiftShader, ~1–2 fps in the 3D scenes), so no frame of the race was used to judge framing,
gait quality or touch feel, and none is claimed. Device acceptance for the existing race HUD, chase
camera and touch mirroring remains outstanding.
