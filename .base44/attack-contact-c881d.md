# C-8.81D — Correct blade-tip impact timing (phase record)

Status: implemented, measured and pinned by a regression suite (2026-10-25). **No combat timing, damage,
stamina, range, movement, AI, layout, save or asset byte changed** — only the two contact frames and the
measurement contract behind them. No commit, push, merge or deployment was performed by the phase.

## 1. Preflight (measured)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at the start | `5a35664cbf` |
| Working tree | **clean** (`git status --porcelain` empty, `git diff` empty) — the previous attempt's "no files changed" was true of that attempt, not evidence of prior work |
| HEAD at the end | `5a35664cbf` + the uncommitted C-8.81D edits (see §7) |
| Dev stack | `app-web-1` (oven/bun:1, Vite), `Up 3 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl localhost:3000/` → **200** |

Read before editing: `src/utils/attackContact.ts`, `src/utils/phaseC8_80g.test.ts`,
`src/utils/phaseC8_80j.test.ts`, `src/utils/phaseC8_81c.test.ts`, `.base44/attack-contact-c880g.md`,
`.base44/fighter-scale-c881c.md`, `GladiatorMesh.tsx` (the attachment and the rate application),
`DuelScene.tsx` (the wind-up, the turn window, the hit-stops) and `duelGeometry.ts` (the distances the
1.8 m measurement is taken from).

## 2. The defect, measured

C-8.80G sampled the "blade tip" as `attachment.localToWorld((0, box.max.y, 0))`. Two errors compound:

1. `box.max.y` is a length in the **gladius scene's** space (the blade runs +Y there, 0 → 0.9996), but the
   point was handed to `attachment.localToWorld`, so it was read in the **attachment group's** space.
2. The attachment is not aligned with the gladius: `GladiatorMesh` puts the blade inside an orientation
   group rotated **+90° about X** (C-8.80E), so the blade leaves the grip along the attachment's **+Z**,
   not its +Y.

Measured on the shipped assets at the fighting idle: the proxy sits **1.4132** world units from the real
point of the sword — a different part of space, not a 2 cm offset. That is why the derived contact frames
drifted to the tail of each swing.

## 3. The corrected measurement contract

New `src/utils/bladeTip.ts`, with the coordinate spaces made explicit and testable:

- `BLADE_AXIS_LOCAL = (0, 1, 0)` — the gladius geometry's blade axis, measured from the asset: the mesh
  spans Y −1.000 … +1.000, the point is the vertex with the greatest Y at (−0.0029, 1.0000, −0.0020),
  i.e. on the centreline to within 3 mm.
- `bladeTipLocal(mesh)` / `bladeHiltLocal(mesh)` — the extremities in **geometry** space.
- `bladeTipWorld(mesh)` — `updateWorldMatrix(true, false)` then `mesh.localToWorld(...)`, so one call
  applies the complete chain: geometry → mesh node → orientation group → attachment scale → animated
  `hand_r` bone → the attacker's root (position, yaw, `meshScale × correction`).
- `bladeLengthWorld(mesh)` — the rendered blade length, for the attachment invariant.

Verified on the shipped `arena_roman.glb` + `gladius.glb`: blade point-to-pommel **0.9996** world units
(C-8.80E's 1.000), pommel **0.0017** from the hand bone's origin, point **0.9996** from it — so the grip
is in the hand and the blade is not lengthened by the attachment.

## 4. The recalibrated impact timestamps

Measured at the **legal engagement distance of 1.8 m** (the 3.6 m opening less one 1.8 m Advance — the
distance of the first legal attack), defender on `Fighting_Idle` at 0.4, sampled every 1 ms:

| clip | before | after | tip-to-defender at contact (1.8 m) | at rate 1, 700 ms |
| --- | --- | --- | --- | --- |
| `Sword_Attack` | 519 ms | **546 ms** | **0.0074** | 1.594 (0.519 at the OLD 519 ms frame) |
| `Sword_Regular_C` | 659 ms | **698 ms** | **0.0073** | 0.054 (0.828 at the OLD 659 ms frame) |

- **Rate-1 figures, reconciled (C-8.81D documentation pass).** The last column is the pose the clip
  actually holds at the 700 ms impact when its rate is left at 1. For `Sword_Attack` that tip has
  swung through and down: **1.594** from the defender's nearest vertex (tip height 0.263, the nearest
  vertex below the feet) and 1.241 from the blade's nearest point — the cut is long past. The
  **0.519** and **0.828** that earlier text quoted here are the tip's distance at the *old* C-8.80G
  frames (519 / 659 ms), i.e. the shortfall those frames were calibrated against, not the impact.
  Only `Sword_Regular_C` still has a meaningful rate-1 figure at the impact (**0.054**), because its
  contact is 2 ms before it. The units are world units for every distance and milliseconds of clip
  time for every timestamp; the only dimensionless values in the pipeline are the playback rates
  (546 / 700 = **0.7800**, 698 / 700 = **0.99714**).

- **One-frame scheduling envelope (measured, and the residual the constants cannot remove).** The two
  offsets the header describes cancel *in the window* (`700 − lag + hitStop` = 700, so the rate is
  simply `contact / 700`), but they do not cancel sample-by-sample: each ranges over one 60 Hz frame
  (0 … 16.67 ms), so the clip time at the *held* impact frame is `rate × (700 + ε − λ)` —
  **533 … 559 ms** for the light cut and **681 … 715 ms** for the heavy. Measured tip clearance at
  those window edges: light **0.1939 / 0.2703** (against 0.0074 at 546 ms); heavy **0.2485 / 0.3805**
  (against 0.0073 at 698 ms). At rate 1 over the same one-frame window (683 … 717 ms) the light cut
  reads **1.5825 / 1.6013** (1.5937 at exactly 700 ms, 1.2412 to the blade's nearest point), i.e. the
  cut has carried through, and the heavy reads **0.1937 / 0.4132** (0.0544 at exactly 700 ms) — the
  same band its calibrated window occupies, which is what "a 2 ms nudge" means in practice. So the
  calibration removes the C-8.80F symptom on the light cut by roughly an order of magnitude and leaves
  the heavy essentially as it was. The residual is the contact pose's own narrow basin: measured, the
  tip is within 0.10 of the surface only for about ±5 ms around 546 (**0.0987** at 541 ms,
  **0.0653** at 551 ms). No contact constant can widen that; it needs a clip or an attachment change,
  so it is recorded, not tuned.

- 546.3 ms and 697.7 ms by sub-millisecond refinement; the constants are the integer frames.
- Body-independence: on `minotaur.glb` (correction 1.256) the same minima are **545 ms** and **699 ms** —
  inside one 60 Hz frame — so one constant per clip remains the correct granularity.
- Both stay strictly inside the 700 ms wind-up, so the playback rates are 0.7800 and 0.99714 (< 1): **the
  wind-up, the turn window, the hit-stops and the sequencing needed no change and none was made.**
- The brief's candidates were 546 and "approximately 694". 546 was confirmed. For the heavy, **698** is
  used: at 1.8 m the tip's minimum is 697.7 (arena) / 699.2 (Minotaur), the whole-blade contact begins at
  692 (0.0024) and 694 reads 0.015 — 694 is inside the same contact plateau (0.5 frame apart) but the
  deepest tip contact, which is what freezes under the hit-stop, is 698. The 4 ms difference is recorded
  rather than silently adopted.

### Pose quality, checked as the brief required

- **Light:** contact at tip height **1.297**, nearest vertex y **1.302**, torso distance **0.0074** — a
  diagonal cut landing on the chest, mid-descent. Not overhead, not a limb.
- **Heavy:** contact at tip height **0.578**, nearest vertex y **0.575**, torso distance **0.337**. The
  overhead arc passes **0.34 in front of the torso** and its contact is the defender's **leading knee**.
  Measured across the whole swing, the torso never comes closer than ~0.23, so there is **no frame that
  contacts the torso** — resolving damage at one would show the blade visibly short (0.35+). The
  closest-approach frame is therefore the only honest damage frame, and the low read is recorded as a
  **pose-quality limitation that timing cannot fix** (it needs a clip/attachment change).
- **Minimum legal gap (1.2 m):** both cuts pass **through** the body — the tip finishes 0.210 (light) /
  0.281 (heavy) past the defender's own root plane at the chosen frames, 0.2535 / 0.1577 from the nearest
  surface. This is inherent to a 1.000-unit blade at a 1.2 m root gap and is unchanged in kind by the
  timing; it is pinned in §D of the suite rather than "cured".
- **Maximum range (2.1 m):** the tip never reaches the body — 0.2817 (light) / 0.2426 (heavy) from the
  nearest vertex at the chosen frames, and never closer than 0.2808 / 0.2028 anywhere in the 400–800 ms
  sweep — a **reach** limitation, independent of timing, recorded and pinned in `phaseC8_81c` §F so it
  is not mistaken for a solved contact problem.

### Blade-to-target distance at the chosen impact frames

| clip | frame | 1.2 m | 1.8 m |
| --- | --- | --- | --- |
| `Sword_Attack` | 546 ms | **0.2535** (nearest y 1.250; tip 0.210 past the defender root) | **0.0074** (nearest y 1.302; tip 0.167 before it) |
| `Sword_Regular_C` | 698 ms | **0.1577** (nearest y 0.599; 0.281 past) | **0.0073** (nearest y 0.575; 0.201 before) |

## 5. Suites

- **`src/utils/bladeTip.ts`** (new, production-measurement helper) and
  **`src/utils/phaseC8_81d.test.ts`** (new, **25 tests / 97 `expect()`**):
  §A the sampler's coordinate contract (axis and tip vertex re-derived from the GLB; blade 1.000 world
  units with the pommel on the hand; the **old proxy measured at 1.4132** as the control; the tip follows
  the animated hand through five poses while staying one blade-length from the grip; a root translation
  moves it exactly; `bladeTipWorld` refreshes stale ancestor matrices); §B both constants within one
  frame of a fresh closest-approach sweep at 1.8 m on two bodies, plus the old frames shown 0.52 / 0.83
  short; §C the rate → contact relationship, the rate-1 symptom (0.519 for the light, and the honest
  0.054 for the heavy, whose contact is 2 ms before the impact), and "not overhead"; §D the pose-quality
  limits above; §E the untouched invariants (wind-ups, turn window, hit-stops, damage, stamina, range,
  movement distances, the AI split, the rate-on-action wiring, the C-8.80N/P/Q responsive composition and
  the scale table).
- **Rebased, not weakened.** `phaseC8_80g.test.ts` now samples the **real tip** (`bladeTipWorld` on the
  gladius mesh) and measures at **1.8 m** instead of the 2.1 m at which the true tip never touches; its
  §A/§B/§C expectations moved 519 → 546, 659 → 698, the rate pair to 0.78 / 0.9971428571, the frame gap
  to 152 ms and "181 ms past contact" to 154 ms. `phaseC8_80j.test.ts` pins 546 / 698 and the same rates.
  `phaseC8_81c.test.ts` imports `ATTACK_CLIP_CONTACT_MS` instead of restating it, and its §F was
  re-measured at the corrected frames: at 1.8 m the shipped blade **touches** (0.0066) where the pre-fix
  1.10-unit body's stands **0.3724** clear (the old +0.142 residual was an artifact of the mid-swing
  frame), and the residual now lives at 2.1 m (+0.107, 0.276 clear) where it is pinned as a residual.
- **One harness bug found and fixed while rebasing:** `findBladeMesh(player.scene)` returned the fighter's
  own body mesh (the first mesh in the scene), which produced 196 / 348 ms "contacts"; it is now applied to
  the attachment group. The suite failed loudly rather than passing on a wrong node.

## 6. Full validation (dev container, final tree)

| command | result |
| --- | --- |
| `bun test` (attack-contact + scale: `phaseC8_80g`, `phaseC8_81c`, `phaseC8_81d`, `phaseC8_80e`, `phaseC8_80j`) | **107 pass / 0 fail** (403 `expect()`) |
| `bun test` (pending-strike / responsiveness / action-order / defensive-balance / result lifecycle) | **109 pass / 0 fail** (447 `expect()`) |
| `bun test` (whole suite) | **3725 pass / 0 fail (132 files, 93,441 `expect()`)** |
| `bun run scripts/combatTests.ts` | **69 passed, 0 failed** |
| `bun run lint` (`tsc --noEmit`) | **exit 0** |
| `bun run build` | **exit 0**, startup-asset check passing (8 assets) |
| `git diff --check` | **clean (exit 0)** |

## 7. Files changed

| file | change |
| --- | --- |
| `src/utils/attackContact.ts` | the two constants (519 → 546, 659 → 698) and the header's measurement contract + measured table |
| `src/utils/bladeTip.ts` | **new** — the true tip sampler and its coordinate-space contract |
| `src/utils/phaseC8_81d.test.ts` | **new** — the focused suite (25 tests) |
| `src/utils/phaseC8_80g.test.ts` | real-tip sampler, 1.8 m measurement, rebased expectations and header |
| `src/utils/phaseC8_80j.test.ts` | the two constants and their rates |
| `src/utils/phaseC8_81c.test.ts` | imports the constants; §F re-measured at the corrected frames; header note |
| `.base44/attack-contact-c881d.md` | this record |
| `.base44/fighter-scale-c881c.md` | a superseded-figures note on §5 |
| `AGENTS.md` | the phase section |

**No production gameplay file other than `attackContact.ts` changed** — `DuelScene.tsx`,
`GladiatorMesh.tsx`, `combatCalculations.ts`, `duelGeometry.ts`, `itemsDB.ts`, every collider, every save
field and every asset byte are untouched (the suites assert the invariants directly).

## 8. Not verified

- **Nothing here is visual acceptance.** The sandbox has no GPU (SwiftShader, ~1–2 fps in the 3D scenes),
  so the *reading* of either impact pose — and above all whether the light cut now lands as a chest hit
  and the heavy chop reads as a deliberate low strike rather than a leg graze — needs **Android device
  evidence**. It has not been obtained, and no claim is made for it.
- The measurement is against `Fighting_Idle` at 0.4 for the defender, the convention C-8.80G established.
  A defender mid-step or mid-block presents a different silhouette, so the contact frame is a property of
  the clip and the standing target, not of every possible pose.
