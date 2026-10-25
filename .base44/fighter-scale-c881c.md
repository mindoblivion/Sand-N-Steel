# C-8.81C — Fighter world scale and strike reach (phase record)

Status: implemented, measured and pinned by a regression suite (2026-10-24). **No combat value, timing,
AI rule, damage formula, stamina cost, collider, save field or asset changed.** No commit, push, merge or
deployment was performed by the phase.

## 1. Preflight (measured)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at the start of this window | `0f24465` (layout clipping / HUD alignment, 768–1023 px) |
| Working tree | the C-8.81C edits in `GladiatorMesh.tsx`, `weaponAttachment.ts`, `phaseC8_80e.test.ts`, `phaseC8_80g.test.ts` (uncommitted) |
| Dev stack | `app-web-1` (oven/bun:1, Vite), `Up 3 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl localhost:3000/` → `200` |

Read before editing: `GladiatorMesh.tsx` (the outer group's scale, `MODEL_SCALE_CORRECTIONS`, the shield
constant and its hand offset), `weaponAttachment.ts`, `combatCalculations.ts` (`getWeaponRange`,
`isAttackInRange`), `itemsDB.ts`, `DuelScene.tsx` (the 3.6 m opening, the 1.8 m Advance, the range guard)
and the C-8.80E / C-8.80G / C-8.80J records.

## 2. The defect, restated in one line

`arena_roman.glb`'s authored visible height is **1.103** and the default `roman_warrior` key had **no**
entry in `MODEL_SCALE_CORRECTIONS`, so the player and every opponent rendered at 1.103; the four
alternative bodies were normalised to the same ~1.10 instead of to their intended size. Every downstream
symptom — a 1.10 m fighter under a 1.37 m arena feature, a legal strike whose blade stopped short — is
that one number.

## 3. The shipped table, and the measurement it comes from

`Fighting_Idle` at t = 0.4, every skinned vertex read through `getVertexPosition` / `localToWorld`, root
at the origin at scale 1:

| `characterModel` | asset | authored visible height | correction | rendered |
| --- | --- | --- | --- | --- |
| `roman_warrior` (default) | `arena_roman.glb` | 1.1035 | **1.632** | **1.8009** |
| `amazonian` | `amazonian.glb` | 1.8177 | **0.990** | **1.7995** |
| `dimachaerus` | `dimachaerus.glb` | 1.8208 | **0.989** | **1.8007** |
| `retiarius` | `netfighter.glb` | 1.8288 | **0.985** | **1.8014** |
| `minotaur` | `minotaur.glb` | 1.7055 | **1.256** | **2.1421** |

The Minotaur keeps the shipped ratio 1.313 / 1.103 = **1.19×** the human height (2.142 / 1.800), so the
size hierarchy is preserved rather than flattened. `roman_warrior`'s mesh also carries **0.7516** of
vertices below Y = 0 (a separate open asset defect) that the arena floor hides; the root group is never
offset vertically, so the stray band is 0.7516 × 1.632 = **1.2266** under the floor and the visible
height above it is exactly `maxY`.

## 4. The shield, carried along

`SHIELD_SCALE_GLB` 0.53 → **0.861** = 0.55 × 1.80 / 1.15, and the hand offset stays 0.13 pre-scale
(0.13 × 0.861 ≈ **0.112** world units). The attachment expression `SHIELD_SCALE_GLB / modelCorrection`
inside the body's own root scale still cancels the correction, so the board renders **0.990** world units
on every body (0.55 × the human height; 0.46 × the Minotaur's, which shares the one constant by design).
Left at 0.53 the board would have been 0.6095 — **34 %** of a 1.80 m body.

## 5. What the scale buys the strike (the point of the phase)

> **SUPERSEDED FIGURES — see C-8.81D (`.base44/attack-contact-c881d.md`).** Every number in this
> section was measured at the contact frames C-8.80G had derived from an **invalid blade-tip proxy**
> (`attachment.localToWorld((0, box.max.y, 0))`, 1.4132 world units from the real point of the sword).
> Re-measured with the true tip at the corrected frames (546 / 698 ms), the conclusion is **stronger
> than stated here**: at 1.8 m the shipped blade **touches** the opponent (nearest 0.0066) where the
> pre-fix 1.10-unit body's stands **0.3724** clear, and at 1.2 m the shipped blade overlaps by
> **−0.793** (not −0.458). The "+0.142 residual at 1.8 m" below was an artifact of the mis-timed frame;
> the residual is at the 2.1 m maximum (+0.107, nearest 0.276) and is pinned there in
> `phaseC8_81c.test.ts` §F. The table is kept as this phase's own record, not as current fact.

Measured at each clip's calibrated contact frame (`Sword_Attack` 519 ms, `Sword_Regular_C` 659 ms),
attacker at `+sep/2` facing the defender at `−sep/2`:

- **reach** — how far forward the furthest-forward blade vertex reaches from the attacker's root;
- **defenderFront** — how far the defender's forward-most vertex stands from its own root;
- **axisGap** = `sep − (reach + defenderFront)`; negative = the blade's furthest point is past the
  opponent's furthest point;
- **nearest** — the nearest 3-D distance from any blade vertex to any body vertex (C-8.80E's figure).

| config | sep | clip | reach | defenderFront | axisGap | nearest |
| --- | --- | --- | --- | --- | --- | --- |
| shipped 1.632 | 1.2 m | `Sword_Attack` | 1.2962 | 0.3615 | **−0.4577** | **0.0648** |
| shipped 1.632 | 1.2 m | `Sword_Regular_C` | 1.2931 | 0.3615 | **−0.4546** | — |
| shipped 1.632 | 1.8 m | `Sword_Attack` | 1.2962 | 0.3615 | **+0.1423** | — |
| pre-fix 1.000 | 1.2 m | `Sword_Attack` | 1.0304 | 0.2215 | **−0.0519** | 0.3198 |
| pre-fix 1.000 | 1.8 m | `Sword_Attack` | 1.0304 | 0.2215 | **+0.5481** | — |

Read honestly: at 1.2 m the pre-fix blade *did* reach the opponent's forward-most plane, but only by
0.052 and still standing 0.32 clear of the body itself; the shipped geometry overlaps by **0.458** and
comes within **0.065**. At **1.8 m — the distance of the first legal attack** (3.6 m opening, one 1.8 m
Advance, 2.1 gladius range) — the shortfall drops from **0.548 to 0.142**, i.e. **74 % of the previous
gap is closed**, and it is **still a shortfall of 0.142**. The scale correction is not a solved contact
problem, and the suite pins the residual so no later reader mistakes it for one.

## 6. What did not move

`getWeaponRange` (2.1), `isAttackInRange`, damage (14 / 26), stamina (12 / 24), both 700 ms wind-ups,
the 1100 ms turn, the 1400 ms settlement, the weapon attachment (C-8.80E: the blade is still 1.000 world
units on every body), the arena, every collider, every save field and every asset byte. The only
production edits are two constant blocks in `GladiatorMesh.tsx` and one comment in `weaponAttachment.ts`
whose "0.6095 world units" sentence now reads 0.990.

## 7. Suite

`src/utils/phaseC8_81c.test.ts` — **24 tests / 85 `expect()`**, ~3 s, over the five real character GLBs
and the real `gladius.glb`:

- §A the shipped table parsed out of the component (the five keys and values, the default key present,
  no pre-fix value surviving, the 0.861 = 0.55 × 1.80 / 1.15 derivation, the 0.13 hand offset);
- §B authored heights re-measured from the assets at scale 1, and every correction shown to be
  `target / authored` (1.80 for the humans, 1.19 × 1.80 for the Minotaur);
- §C rendered heights (four humans within 2 mm of 1.800, Minotaur 2.142) plus the pre-fix control
  (1.103 / 1.092, i.e. 0.70 / 0.71 short);
- §D ground alignment (soles at Y = 0 on four bodies; `arena_roman`'s stray band scales exactly with the
  correction; the visible height pinned separately from the 3.03 full bounding box);
- §E the shield (0.990 on all five, 0.55× the human height, 0.462× the Minotaur's, 0.6095 at the old
  constant = 34 %);
- §F the strike table above, including the 1.8 m residual as a positive shortfall;
- §G the combat contract (range 2.1, 1.8 legal, 2.1001 refused, the weapon length independent of the
  body).

**Sensitivity demonstrated, not assumed:** replacing `roman_warrior: 1.632` with `1.0` (i.e. restoring the
missing default entry) fails **11 of 24** tests; the file was restored byte-identical (`cmp` clean).

## 8. Verified

| command | result |
| --- | --- |
| `bun test src/utils/phaseC8_81c.test.ts` | **24 pass / 0 fail** (85 `expect()`, 2.94 s) |
| focused `phaseC8_81c` + `phaseC8_80e` + `phaseC8_80g` | **62 pass / 0 fail** (229 `expect()`) |
| `bun run lint` (`tsc --noEmit`) | **exit 0** |
| `git diff --check` | clean |

Rebased this phase (not weakened): `phaseC8_80e` and `phaseC8_80g` now restate the shipped corrections
(1.632 / 0.989 / 0.861) and `phaseC8_80g`'s contact tolerance is one 60 Hz frame, with the reason stated
in each file.

## 9. Not verified — the rendered read, and it is a device question

The numbers above are geometry, not appearance. The sandbox has no GPU (SwiftShader, ~1–2 fps in the 3D
scenes), so whether a 1.80 m fighter *reads* correctly beside the arena's 1.37 m wheels and a 2.18 m
carceres block, and whether the shorter 1.8 m strike's 0.142 residual is visible as a miss, are device
questions. Android visual acceptance of the new scale is **PENDING**; do not claim it from a green suite.

## 10. Open follow-ups this phase deliberately did not take

1. **The 1.8 m residual (0.142).** Closing it means changing the clip's contact pose, the 1.8 m Advance
   step, or the opening separation — each a gameplay change, not a scale one. Scaling the blade was
   already ruled out (unrealistic proportions, and it fails for light attacks).
2. **`arena_roman`'s 0.7516 stray vertex band** under the floor now sits 1.2266 deep. Hidden by the floor
   as before, but deeper; it is an asset repair, not a code fix.
3. **The Minotaur shares the humans' 0.99-unit board** (0.462× its own height). Deliberate — one constant,
   no per-body art — but a future pass may want a per-body shield proportion.
