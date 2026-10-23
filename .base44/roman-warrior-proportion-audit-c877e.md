# Roman Warrior / Centurion proportion audit (C-8.77E — read-only, nothing changed)

Audit of the character-creation preview's small, flat hands and the short forearm/hand proportions in
`public/models/arena_roman.glb`. **No production file, asset, test, save or configuration changed.**
Measurement used a dependency-free GLB decoder in `/tmp/c877e` (never committed). No commit, push,
merge, deploy, reset or stash.

## 1. Preflight

- `/app`; branch `development-focus-strategy`; HEAD `37cba78f36`; `git status --porcelain` empty
  before and after.
- C-8.77C read (AGENTS.md). **C-8.77D does not exist** in AGENTS.md, and no
  `.base44/character-preview-audit*` file exists on this branch, so every finding below was
  re-derived from the files rather than carried forward.
- C-8.77C's repair is intact: `netfighter.glb` = `a0e0d4dc…`, `minotaur.glb` = `46dafe41…` — exactly
  that record's post-repair hashes.

| asset | sha256 | bytes | verts / tris / joints / clips |
|---|---|---|---|
| arena_roman.glb | `a93ee70206d6b4b462ebe5d3401e599b955b26f030200c005e9f12feb09269d7` | 7,054,440 | 31,292 / 51,726 / 66 / 178 |
| amazonian.glb | `49e5830b2c90d4a770cabd14d1bee6084c501d53015739d8fb496fdddc5c7016` | 12,153,100 | 127,700 / 214,158 / 66 / 178 |
| dimachaerus.glb | `62627ab5ade9c2b44222d05e35ddad927b759e08f159c4af352c3dddf7d2a26b` | 11,063,748 | 114,661 / 198,876 / 56 / 178 |
| minotaur.glb | `46dafe41a24a123ed20af74ee70bfe11450e53940bff38f10047e51b8afb0cf6` | 9,759,552 | 88,510 / 157,734 / 56 / 178 |
| netfighter.glb | `a0e0d4dcdf59cf2eda84a06ace43883b2297522a0e4f620514b5bdc3ec2d7e2d` | 10,670,992 | 106,139 / 179,270 / 56 / 178 |

All five share **one identical 178-clip library matched by name**, and each is a single skinned mesh,
single primitive, single material, three 1024x1024 WebP textures. No armour, helmet or shield
geometry exists inside any of them.

## 2. Character design intent — what "Centurion" is

The `🛡️ Centurion` button sets `characterModel = 'procedural_gladiator'`
(`CharacterCreation.tsx:193`), a legacy name. `GladiatorMesh.tsx:1509-1517` resolves the URL by
ternary: amazonian / retiarius / minotaur / dimachaerus get their own files and **everything else
falls through to `/models/arena_roman.glb`**. Centurion and Roman Warrior therefore load the same
file — same rig, same 178 clips, same `MODEL_SCALE_CORRECTIONS` value (none, so 1.0), same loadout.
Verified live: with Centurion selected the only model request is `arena_roman.glb` (+
`weapons/gladius.glb`); switching to Roman Warrior issues no new request. Zero console errors.

No other code branches on `procedural_gladiator`. There is no mechanical or loadout difference: six
buttons, five bodies.

Existing assets inspected: five static weapon GLBs in `public/models/weapons/` (reachable via
`itemsDB.modelPath`); the shield is **not** an asset but procedural geometry
(`GladiatorMesh.tsx:415`, bone-attached, Phase 111-132 constraint); `itemsDB` armour has
`slot: helm|chest|arms|legs` and `style: 'crested'` but **nothing renders armour** — no armour
renderer exists and `'crested'` is consumed nowhere. A distinct Centurion therefore cannot be
assembled from existing armour pieces; it needs a texture variant, new bone-attached procedural
geometry, or a new skinned body.

## 3. Measured proportions

Bone positions read from inverse bind matrices (hierarchy and mesh sit in different spaces; all five
carry a uniform ≈0.9489 hierarchy-vs-IBM scale mismatch). Percentages are of each model's own
bind-pose height H. **Arm bones are bilaterally identical to 4 dp.**

| model | H | humerus | forearm | shoulder→wrist | hand (wrist→tip) | hand/forearm |
|---|---|---|---|---|---|---|
| **arena_roman** | 2.0000 | 0.1813 / **9.06 %H** | 0.1528 / **7.64 %H** | 0.3341 / **16.71 %H** | 0.1316 / **6.58 %H** | **0.86** |
| amazonian | 2.0000 | 0.2311 / 11.56 | 0.2065 / 10.32 | 0.4376 / 21.88 | 0.2154 / 10.77 | 1.04 |
| dimachaerus | 2.0000 | 0.3269 / 16.34 | 0.2060 / 10.30 | 0.5329 / 26.65 | 0.1938 / 9.69 | 0.94 |
| minotaur | 1.9031 | 0.2872 / 15.09 | 0.2710 / 14.24 | 0.5582 / 29.33 | 0.1781 / 9.36 | 0.66 |
| netfighter | 2.0000 | 0.2424 / 12.12 | 0.1858 / 9.29 | 0.4281 / 21.40 | 0.1842 / 9.21 | 0.99 |

Adult norms: humerus ≈18.6 %H, radius ≈14.6 %H, shoulder→wrist ≈33 %H, hand length ≈10.8 %H. Every
model is stylised short-armed; **arena_roman is the extreme** — 78 % of the next-shortest sibling and
51 % of anatomical.

Fingers (base→tip, left; right differs only in the thumb): arena_roman index 0.0420, middle 0.0461,
ring 0.0427, pinky 0.0379, thumb 0.0571 L / 0.0468 R; amazonian 0.0688 / 0.0754 / 0.0699 / 0.0620 /
0.0934. arena_roman's fingers are **61 % of amazonian's**.

Hand region (all vertices dominated by `hand_*` or a finger chain; arm runs along +X so the first
number is length):

| model | side | length | breadth | thickness | verts | hand tris | mean edge |
|---|---|---|---|---|---|---|---|
| **arena_roman** | L | 0.1315 | 0.1266 | **0.0472** | 939 | 1,436 | 0.0059 |
| **arena_roman** | R | 0.1342 | 0.1463 | **0.0530** | 966 | — | — |
| amazonian | L | 0.2675 | 0.1696 | 0.0863 | 2,003 | 3,286 | 0.0074 |
| dimachaerus | L | 0.2322 | 0.2021 | 0.1160 | 2,044 | 3,433 | 0.0064 |
| minotaur | L | 0.2965 | 0.1275 | 0.1101 | 2,524 | 4,288 | 0.0078 |
| netfighter | L | 0.2244 | 0.1319 | 0.0958 | 1,875 | 3,152 | 0.0064 |

Palm box (vertices between the wrist plane and the first knuckle, so fingers cannot contaminate it):

| model | palm length | width | thickness | W/L |
|---|---|---|---|---|
| **arena_roman** L / R | **0.0723 / 0.0774** | 0.1229 / 0.1186 | **0.0477 / 0.0468** | **1.70 / 1.53** |
| amazonian L / R | 0.1273 / 0.1269 | 0.1165 / 0.1096 | 0.1068 / 0.1052 | 0.92 / 0.86 |
| dimachaerus L | 0.1454 | 0.2010 | 0.1110 | 1.38 |
| minotaur L | 0.1500 | 0.2457 | 0.1101 | 1.64 |
| netfighter L | 0.1198 | 0.1715 | 0.0958 | 1.43 |

arena_roman's palm is **57 % of a sibling's length, 105 % of its width, 45 % of its thickness** — the
only model whose palm is markedly wider than long. (Width is the least comparable column: models
weighting fingers to `hand_*` report a wider "palm". Length and thickness are unaffected, and the
arena_roman / amazonian comparison is unaffected — 47 % vs 40 % hand-dominant.)

Finger weighting (dominant-vertex counts, left hand): arena_roman hand 443, ring 423, middle 27,
pinky 20, thumb 26, **index 0**; amazonian hand 795, ring 914, middle 178, pinky 107, thumb 9,
index 0; dimachaerus hand 1090, ring 51, middle 537, pinky 0, thumb 271, index 95. arena_roman's
finger geometry sits almost entirely on the **ring** chain, leaving essentially one articulated
finger and a static slab.

## 4. Diagnosis

The visible "small, flat hands" resolve to **authored geometry plus the matching rest-pose bone
lengths** and nothing else.

- **Mesh proportions — primary cause.** Hand 0.1315 x 0.1266 x 0.0472 vs 0.224-0.297 x 0.128-0.202 x
  0.086-0.116. Length 49-59 %, thickness 41-55 %, width ~75-96 %. Short along the arm, wide across
  it — exactly the flat-paddle read.
- **Bone rest lengths — consistent with the mesh, not a separate bug.** Metacarpals (`hand →
  middle_01`) 0.0667 vs 0.105-0.115; shoulder→wrist 16.71 %H vs 21.4-29.3 %H. Bones and geometry
  agree within a few percent: the hand is authored small, the skin is not mis-scaling it.
- **Skin weights — real but secondary.** The hand is 14-26 shells on a hard weight partition (no
  vertex blends two finger chains), fingers collapse onto ring, index is unweighted. Costs finger
  definition and stretches seams under motion; cannot make the hand larger.
- **Animation — ruled out.** Across all 178 clips the arm chain carries **rotation channels only**
  (179 each for hand/lowerarm/upperarm/clavicle) and **zero** translation or scale channels.
- **Runtime transforms — ruled out.** Every joint scale is 1.0; the only global factor is the uniform
  ≈0.9489 IBM basis scale all five share. `MODEL_SCALE_CORRECTIONS` has no arena_roman entry (1.0).
- **Preview framing — amplifier.** Camera `[0,1.2,3.2]`, fov 42, ~400 px panel: a 0.132-unit hand is
  ~30 px on screen; at family parity ~50 px.
- **Not texture.** All maps are 1024² in every model; only WebP compression differs (63 KB vs 77-87 KB
  base colour). Mean hand edge 0.0059 is finer than the siblings' 0.0064-0.0078, so the hand is not
  under-tessellated for its size — it is simply smaller (51,726 total tris vs 157,734-214,158).

**Diagnosis:** arena_roman is a lower-density asset whose hand was authored ~55 % of family length and
~45 % of family thickness with the metacarpal bone shortened to match, so the skin is faithful to a
hand that is genuinely too small and too thin, compounded by a weight partition leaving four of five
fingers unarticulated.

## 5. Options, not implemented

**A — correct arena_roman's hand geometry, preserving rig and 178 clips.** Anisotropic retarget about
the wrist (length x1.55-1.65, thickness x1.6-1.7, width x1.0-1.1) plus metacarpals 0.0667 → ~0.107.
*Benefit:* the only option that fixes the defect; deterministic, no draw-call change, improves both
archetypes. *Risk:* low and bounded — arm clips are rotation-only so nothing overrides the change;
weapon/shield portal onto `hand_r`/`hand_l` whose origins stay at the wrist, so the grip point holds,
but a thicker hand can clip shield boss or hilt, so grip clearance must be measured. The real risk is
the **wrist seam** — hand shells are separate, so the scale must be blended across one wrist ring.
*Scope:* one asset + a throwaway script. *Validation:* weight sums, bind-pose reproduction, seam
deviation across idle/attack/defend/hit/roll, grip clearance, bilateral symmetry, 178 clips resolve.

**B — skin weights only.** Blend one or two edge rings across the hard finger steps. Removes seam
stretch and adds articulation, but by the evidence above it **cannot fix size** — bones and mesh
agree, so the hand is authored small. A companion to A, not an alternative.

**C — differentiate Centurion from existing assets.** Feasible only as a texture variant or as
procedural geometry bone-attached to `head` (the `ShieldModel` pattern), because no armour/helmet GLB
assets exist. Low cost, animation-safe, 1-2 draw calls; must fit the head and clear head motion in
the clips.

**D — author a new Centurion.** Must carry the **same 178-clip library by name** to stay compatible,
so it is really a re-skin — full modelling/texturing/re-skinning plus a new 7-12 MB asset budget, and
every downstream acceptance pass (scale correction, shield constraint, grip) restarts. Not justified
now, and it would inherit the same hand defect if built before A.

**Why not a universal 1.75x hand scale:** the hand is short and thin but *not* narrow. 1.75x gives a
correct 0.230 length but a 0.215-wide, 0.083-thick palm — still nearly square, wider than any
sibling, colliding with shield and hilt, with the palm alone as long as the whole hand should be. The
shortfall is anisotropic (length 0.55x, width ~0.95x, thickness 0.45x) and the correction must be.

## 6. Recommendation and smallest next step

1. **A** — repair arena_roman's hand proportions (anisotropic, with the metacarpal). Best
   improvement-to-risk, benefits both archetypes, provably animation-safe.
2. **C** — differentiate Centurion with a bone-attached procedural galea/crest (or a base-colour
   variant), after A.
3. **B** — finger weight blending, as polish inside A's validation window.
4. **D** — new model, only if C proves insufficient.

**Smallest justified implementation:** an asset-only pass on arena_roman.glb that (i) scales the hand
region anisotropically about the wrist — length x1.6, thickness x1.65, width x1.05, blended across one
wrist ring — and (ii) moves `middle_01_*` and the finger chain origins to a matching metacarpal length
≈0.107, leaving forearm, humerus, weights, textures, skeleton names and all 178 clips untouched. Then
measure before deciding whether the forearm needs the separate x1.25 correction.

**Explicitly not proposed:** a uniform 1.75x hand scale; any change to amazonian / dimachaerus /
minotaur / netfighter.

## 7. Regression tests the fix must carry

- **Asset integrity:** the four untouched hashes pinned; arena_roman's byte diff confined to POSITION
  spans and the affected node translations; size, vertex/triangle counts, material and texture byte
  ranges unchanged.
- **Clips:** exactly 178 with the pinned names; channel sets unchanged (rotation-only on the arm);
  sampled poses reproduce every non-arm joint bit-identically.
- **Weights:** weight sums 1.0, joint indices in range, per-joint totals unchanged (no re-binding), so
  C-8.77C-style guards stay green.
- **Proportions:** bilateral hand length/thickness and `hand → middle_01` within tolerance; width within
  tolerance; palm W/L below 1.1; `head`-dominant count unchanged (C-8.77C signature).
- **Grip:** minimum clearance between hand vertices and shield boss / hilt attach across Fighting_Idle,
  Sword_Attack, Defend, Roll; attach point still coincides with the hand bone origin.
- **Wrist seam:** max edge-gap at the wrist ring stays inside the pre-existing band measured on
  untouched models (0.013-0.057).

## 8. Limitations

- Geometry measured **statically** from the GLB (bind pose + inverse bind matrices), not from a running
  renderer; animated silhouette not sampled.
- The preview browser has **no GPU** (SwiftShader). The live capture confirms the asset mapping and
  zero console errors, but at ~1-2 fps cannot adjudicate hand shape, seam behaviour under motion or
  grip clipping. Those need a real device and are **not verified** here.
- Palm width is weight-partition dependent across models; length and thickness are not.
- Texture maps read for dimensions only; surface detail quality not judged.
- No Android/device acceptance performed, and none claimed.
