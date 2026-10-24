# C-8.80E — Weapon attachment and reach calibration (phase record)

Status: implemented and measured (2026-10-24). One production attachment scale, one pure helper, one
new suite. **No combat range, damage, stamina, timing, AI, collider, save or shield value changed.**
No commit, push, merge or deployment was performed by the phase.

## 1. Preflight (measured)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at start | `460c957de4c8f85aed172d67a95362eac30852e5` |
| Working tree | `git status --porcelain` empty before the first edit |
| Dev stack | `app-web-1` (oven/bun:1, Vite), `Up 2 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl localhost:3000/` → `200` |
| C-8.80D record | **not present** — the audit was re-derived from the code and the assets, as the brief requires when the record is missing |

Read before editing: `GladiatorMesh.tsx` (attachment, shield scale, `MODEL_SCALE_CORRECTIONS`),
`DuelScene.tsx` (spawn positions, range guard, impact), `combatCalculations.ts` (`getWeaponRange`,
`isAttackInRange`, the two wind-up constants), `itemsDB.ts`, and the C-8.77E proportion audit.

## 2. Runtime transform truth (real assets, three.js, throwaway harness in `/tmp/c880e`)

Method: the shipped hierarchy rebuilt in three.js — real `arena_roman.glb` / `dimachaerus.glb`, real
`gladius.glb`, outer group scaled `meshScale × modelCorrection`, the weapon on `hand_r` under the
same `[π/2, 0, 0]` rotation — posed on `Fighting_Idle` / `Sword_Attack` / `Sword_Regular_C` through a
real `AnimationMixer`, then read with `localToWorld` and per-vertex skinning.

**Authored dimensions.** `gladius.glb` is **1.000** units grip→tip about a grip at its own origin
(node scale 0.5 over normalized ±1 positions, node offset +0.5). The character bodies render
**1.101** (`arena_roman`, mesh sunk to −0.751), **1.092** (`dimachaerus`), 1.109 / 1.313 for the
others.

**The defect, measured on the rendered graph.** With the pre-fix attachment (scale 1, inheriting the
root):

| body | correction | rendered weapon length | shield world height |
| --- | --- | --- | --- |
| arena_roman | 1.00 | **1.000** | 0.6095 |
| amazonian | 0.61 | **0.610** | 0.6095 |
| dimachaerus | 0.60 | **0.600** | 0.6095 |
| minotaur | 0.77 | **0.770** | 0.6095 |

The shield already divided the correction out (`SHIELD_SCALE_GLB / modelCorrection`); the weapon did
not. Combat reach is world-space (`getWeaponRange`), so four of five bodies swung a weapon 23-40 %
shorter than the same item on the default body — measured at the legal gladius range (2.1, roots at
±1.05): `dimachaerus`' `Sword_Attack` came **0.904** from the defender's nearest vertex, against
**0.515** for the same character at the corrected scale (a 0.389 improvement at the attack's contact
frame).

**Ruled out as causes, with numbers.** (a) The weapon is *not* under-scaled relative to the default
body: 1.000 units against 1.101 of rendered height is 91 % — already generous — so no multiplier is
applied to `arena_roman`. (b) The blade is not mis-oriented at contact: the tip is aligned with the
forearm within 11-24° on `Sword_Attack`'s contact frames. (c) The residual shortfall on **every**
body at the maximum legal distance (0.515 on the corrected dimachaerus; 0.54 for the default body in
the same measurement) is not the weapon's scale — it is the body's world scale (≈1.10 units of
rendered height against a 2.1-unit reach, the open "models render at ~60 % of intended world-space
height" issue) plus the clip's contact frame landing at ~0.56-0.69 s while damage resolves at 0.70 s.
Both are out of this phase's scope by its own rules (no fighter resize, no hit timing).

## 3. The correction (smallest evidence-backed change)

`src/utils/weaponAttachment.ts` — `attachmentScaleForModelCorrection(correction) = 1 / correction`
(total: a missing, zero, negative or non-finite correction reads as 1). `GladiatorMesh` wraps the
weapon node in one group, **inside the hand bone**:

```tsx
const weaponAttachment = <group scale={weaponAttachmentScale}>{weaponNode}</group>;
```

and both hands use it (`rightHandEquipment` / `leftHandEquipment`), so the player and the opponent
share one convention. Composition: `meshScale × correction × (1 / correction) = meshScale`, so a boss
with `meshScale 1.25` still swings a 1.25-length weapon. The shield's expression, the fighter's root
scale, its ground alignment and its collision are untouched, as are `getWeaponRange`, damage, stamina,
hit chance, wind-ups, the AI and the settlement.

## 4. Regression coverage — `src/utils/phaseC8_80e.test.ts` (16 tests / 49 expect(), 0.35 s)

Runtime-transform assertions over the real assets, not source strings:

- §A the helper: inverse of 1 / 0.61 / 0.6 / 0.77, identity fallback, and the composition identity
  across corrections × meshScale.
- §B the hierarchy: the gladius measures 1.000 on `arena_roman` **and** on `dimachaerus` (agreeing to
  <0.001), a 1.25 `meshScale` scales it by exactly 1.25, and the attachment group's parent **is** the
  hand bone while the root keeps only the body correction.
- §C the control: the pre-fix render (`correction × 1.000`) is 0.600 and the corrected render is
  0.4 longer — the suite fails if the wrapper is removed (demonstrated: removing it fails the §B
  measurement and the §E wiring pin).
- §D independence: the shield keeps 1.15 × 0.53 = 0.6095 world height on both bodies; attaching the
  weapon leaves the posed ground offset byte-identical (−0.7508 on `arena_roman`, 0.000 on
  `dimachaerus`).
- §E combat values: gladius range 2.1 / damage 14·26 / stamina 12·24, the `2.1` boundary of
  `isAttackInRange`, both 700 ms wind-ups, and both hands binding the one attachment node.

## 5. Validation (2026-10-24, `web` container, final tree)

| command | result |
| --- | --- |
| `bun test src/utils/phaseC8_80e.test.ts` | **16 pass / 0 fail** (49 expect()) |
| focused combat set (11 suites: `phaseC8_79A/79B/75B/75E/75F`, `combatActionOrder`, `combatResponsiveness`, `playerStrikeWindup`, `pendingStrike`, `duelResultLifecycle`, `defensiveBalance`) | **241 pass / 0 fail** (1,642 expect()) |
| `bun run scripts/combatTests.ts` | **69 passed, 0 failed** |
| `bun test` (full) | **3531 pass / 0 fail (124 files, 92,562 expect())** |
| `bun run lint` (`tsc --noEmit`) | exit 0 |
| `git diff --check` | clean |

## 6. Rendered evidence, and its limits

Preview (anonymous visitor, mobile viewport): the app boots to its title screen (**0 console
errors**), the dev server serves the corrected module (the transformed source carries
`weaponAttachmentScale`, the helper import and both hand assignments), and the dev character harness
(`?devHarness=character`, in an in-page frame) mounts the real creation preview — **canvas mounted,
Roman Warrior rendered holding sword and shield, 0 console errors**. That proves the extra attachment
group renders through `createPortal` in the shipping path; it is **not** a visual adjudication of a
0.4-unit blade difference, which the sandbox's SwiftShader duel (~1-2 fps) cannot resolve.

**Not automatically verified / PENDING on device:** whether the corrected blade reads as reaching
further on Amazonian / Retiarius / Dimachaerus / Minotaur in a live bout; the residual standoff
shortfall listed in §2 (character world scale and clip contact timing), which this phase deliberately
did not touch; and Android acceptance generally. Do not claim device or visual acceptance.
