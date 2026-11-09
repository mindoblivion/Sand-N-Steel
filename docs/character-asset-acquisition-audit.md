# Character Asset Acquisition and Compatibility Audit

Status: research baseline only. No third-party asset files are bundled by this document.

## Goals

- Add meaningful player customization without replacing the existing combat animation/controller architecture.
- Keep the five shipped GLB models assigned to enemy archetypes.
- Preserve mobile startup, memory, and frame-time budgets.
- Record source, version, format, licence, and integration status for every acquired asset.

## Candidate sources

| Asset | Official source | Candidate use | Published format/licence | Status |
|---|---|---|---|---|
| Quaternius Universal Base Characters | https://quaternius.com/packs/universalbasecharacters.html | Evaluate humanoid base mesh and hairstyles | FBX, OBJ, Blend, glTF; current pack page identifies CC0; six base models and 20 hairstyles | Research candidate; files not acquired |
| Quaternius Modular Character Outfits – Fantasy | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html | Evaluate modular clothing/armor attachment and material options | FBX, OBJ, Blend, glTF; current per-pack licence not revalidated | Research candidate; fantasy aesthetic needs Roman-fit review; files not acquired |
| Quaternius Ultimate Modular Men Pack | https://quaternius.com/packs/ultimatemodularcharacters.html | Compare explicitly swappable character-part approach | FBX, OBJ, Blend, glTF; current per-pack licence not revalidated | Research candidate; rig and actual part boundaries unverified |
| Quaternius Ultimate Modular Women Pack | https://quaternius.com/packs/ultimatemodularwomen.html | Compare a second modular topology and proportion set | FBX, OBJ, Blend; current pack page identifies CC0; page describes four swappable models per character | Research candidate; rig and actual part boundaries unverified |
| Quaternius Universal Animation Library | https://quaternius.com/packs/universalanimationlibrary.html | Evaluate locomotion/combat clips for gaps in current animation set | FBX, GLB, Blend; current per-pack licence not revalidated | Research candidate; files not acquired |
| Quaternius Universal Animation Library 2 | https://quaternius.com/packs/universalanimationlibrary2.html | Compare newer melee combos and recovery clips with existing needs | FBX, GLB, Blend; current per-pack licence not revalidated | Research candidate; files not acquired |

The publisher describes the Modular Character Outfits pack as compatible with Universal Base Characters and the Universal Animation Libraries as humanoid-retargetable. Those claims make these candidates worth testing, but they do not prove bone-for-bone compatibility with Sand & Steel's current rig.

### Licence verification note — 2026-11-06

Quaternius now publishes a site-wide Quaternius Asset License (QAL) v1.0, last updated 2026-08-28. The live Universal Base Characters and Ultimate Modular Women pack pages currently identify those specific packs as CC0. Do not infer that every Quaternius pack has the same terms from the publisher name or from this older research table: verify the exact pack page and the licence/readme inside the downloaded archive before acquisition or distribution. Preserve that licence file with the asset and record the source archive hash. If the page and archive disagree or the terms are unclear, do not bundle the asset until the publisher's applicable terms are resolved.

The publisher's current general licence summary permits commercial use without credit but prohibits redistributing the assets themselves as standalone assets; the exact licence governing a pack must still be checked at acquisition time.

## Existing integration facts

- Player creation UI: `src/components/hub/CharacterCreation.tsx`.
- Player creation logic: `src/utils/characterCreation.ts`.
- Enemy model catalogue: `src/data/enemyCharacterAssets.ts`.
- Combat model/animation controller: `src/components/3d/GladiatorMesh.tsx`.
- Five existing enemy GLBs are `arena_roman.glb`, `amazonian.glb`, `netfighter.glb`, `minotaur.glb`, and `dimachaerus.glb`. Do not remove or repurpose these away from enemy use.

## Compatibility gates before integration

1. Inspect the downloaded archive structure, exact licence file, model dimensions, mesh/material counts, textures, and external dependencies.
2. Inspect skeleton hierarchy, bone names, rest transforms, inverse-bind matrices, and skin weights. Do not assume different packs share an identical rig.
3. For a separately loaded skinned part, implement and test explicit skeleton/bone mapping or attachment. Visibility toggling only applies to meshes already present in the assembled scene.
4. Verify animation clip names, frame rate, root-motion convention, coordinate axes, scale, and rest-pose alignment before connecting any new clip to the current action map.
5. Keep appearance IDs separate from gameplay stats and equipment IDs. Persist stable IDs rather than full assembled meshes.
6. Avoid loading all variants at once. Load selected assets on demand; measure decoded texture and GPU memory, not only compressed archive size.
7. Run visual checks for body clipping, missing materials, weapon grip, foot sliding, shield orientation, and transition continuity.
8. Keep a per-asset manifest with source URL, pack/version, acquisition date, licence/readme path, original filename, SHA-256, transformations made, and in-game destination.

## Current runtime integration contract (source audit, 2026-11-06)

The existing player/enemy GLB renderer is not a generic drop-in humanoid importer. Before a candidate model can replace or join the current catalogue, verify these concrete contracts in `src/components/3d/GladiatorMesh.tsx`:

- **Skinned animation:** the model must contain a skinned mesh and animation clips. The loader's validity check accepts an animated skinned model (or a model with more than six meshes), but that check alone does not establish gameplay compatibility.
- **Action clip mapping:** the runtime resolves the first available clip from each ordered list: idle `Fighting_Idle`, `Idle_Sword`, `Idle_Shield`, `Idle_A`, `Idle_Subtle`; walk `Walk`, `Jog`, `Sprint`, `Crouch_Walk`; light attack `Sword_Attack`, `Sword_Regular_A`, `Sword_Regular_Combo`, `Fighting_Right_Jab`; heavy attack `Sword_Regular_C`, `Sword_Attack_Air_Vertical`, `Attack_Ground_Pound`, `Melee_Hook`; block `Defend`, `Sword_Block`, `Idle_Shield`, `Shield_OneShot`; dodge `Roll`, `Dodge_back`, `Dodge_left`, `Slide`; hit `Hit_Chest`, `Hit_Head`, `Hit_Knockback`; death `Death_A`, `Death_B`, `Death_C`. A candidate that supplies none of an action's clips silently falls back to its first clip, which is not acceptable evidence of a usable combat rig. Map and visually verify every gameplay action.
- **Body-weight and training silhouette:** the current deformation path recognizes exact anatomical joint names `pelvis`, `spine_01`, `upperarm_l`, `upperarm_r`, `thigh_l`, and `thigh_r`. It changes transverse bone scale only. If these names differ, weight and physique development will not affect the new model until an explicit mapping is implemented and tested.
- **Bruise/swelling attachment:** existing damage markers attach to `upperarm_l`, `spine_01`, and `thigh_r`. Confirm their positions and local coordinate frames; do not assume the current offsets fit another skeleton.
- **Equipment attachment:** hand bones are currently discovered by name heuristics containing `hand` or `wrist` plus a side indicator. Weapon/shield portals are only mounted when the corresponding hand bone is found. Verify both hand transforms, grip orientation, lefty mode, shield constraint, and weapon placement on the candidate model.
- **Scale and origin:** `arena_roman.glb` is the baseline model with a visible height of approximately 1.10 units above the ground (its mesh extends below Y=0). Existing alternatives have explicit per-model root corrections. Measure candidate bounds and ground origin in the same animated pose before assigning any scale correction.
- **Performance:** the candidate must not be preloaded with every customization variant. Measure compressed size, decoded textures, GPU memory, draw calls, and Android load time for the selected model only.

The source test `src/utils/gladiatorBodyRig.test.ts` verifies the baseline `arena_roman.glb` has one mesh, one skin, 66 joints, 178 animation clips, no morph targets, and no animation scale tracks. This is a baseline fact for the shipped Roman model, not a guarantee about any external pack. Candidate compatibility must be demonstrated from the acquired file itself.

### Consequence for the proposed proof of concept

Start with one candidate base body and inspect its actual skeleton and clip names. Build a mapping report against the contract above before writing any runtime adapter. If the rig cannot support all actions, hand equipment, and the existing body-weight/physique deformation without fragile per-frame heuristics, keep the current Roman model and treat the candidate as a separate appearance pipeline rather than replacing the combat rig.

## Proposed proof of concept

- Compare one base body from Universal Base Characters against one character from an explicitly modular pack.
- Prototype three hairstyles, three headgear options, three torso options, and two weapon appearances only if the actual archives contain suitable parts.
- Reuse one existing combat sequence and one locomotion sequence.
- Compare assembled model against the current Roman model for scale, animation fidelity, mobile load time, and visual clipping.
- No broad character-creation UI expansion until the rig and attachment proof passes.

## Acquisition log

No assets have been downloaded or committed as part of this research document. This log must be updated only after files are actually acquired and verified.


## Current character-creator options re-audit — 2026-11-09

Baseline: `ffbd9424d3eeab971b0c3ce0a9f7bbce3cfa8040`.

### Editable creation choices confirmed in `src/components/hub/CharacterCreation.tsx`

- Gladiator name (20-character input).
- Body weight (140–300 lb in 5 lb increments). The UI describes effects on build, impact, and recovery; this source inspection does not prove that each GLB visibly deforms across the range.
- Seven class/armatura cards, including class stats, doctrine, and starter kit.
- Six fighter-look choices: Roman Warrior, Amazonian, Centurion/procedural, Retiarius, Minotaur, and Dimachaerus.
- Three body-build presets under Corpus, with stat deltas.
- Optional birthplace/province and flaw selections.
- Four-stat point allocation.

### Appearance controls confirmed missing from the audited screen

`skinColor`, `tunicColor`, and `crestColor` are initialized with `useState` but their setters are not captured; `hairColor` is a fixed literal in the `PlayerAppearance` object. The component contains no colour inputs or swatches for these values. They are therefore fixed defaults, not player-editable controls in the current creator.

### Limits and next gate

This is a source-level UI audit, not a visual or device test. Before adding colour controls, inspect the material names and material ownership for each selectable GLB and the `GladiatorPreview` material update path. A colour picker that changes React state but cannot safely recolour the selected model would be a false feature. Likewise, the weight label alone does not establish that all six looks support the same body-shape deformation. No runtime changes or asset acquisitions were made in this audit.
