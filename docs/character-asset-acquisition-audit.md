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
| Quaternius Universal Base Characters | https://quaternius.com/packs/universalbasecharacters.html | Evaluate humanoid base mesh and hairstyles | glTF/GLB-compatible source formats; publisher states CC0 | Research candidate; files not acquired |
| Quaternius Modular Character Outfits – Fantasy | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html | Evaluate modular clothing/armor attachment and material options | glTF/GLB-compatible source formats; publisher states CC0 | Research candidate; files not acquired |
| Quaternius Universal Animation Library | https://quaternius.itch.io/universal-animation-library | Evaluate locomotion/combat clips for gaps in current animation set | Publisher states CC0; downloadable formats vary by pack/version | Research candidate; files not acquired |
| Quaternius Universal Animation Library 2 | https://quaternius.com/packs/universalanimationlibrary2.html | Compare newer combat/parkour clips with existing needs | Verify current page and exact archive licence before use | Research candidate; files not acquired |

Source-page statements are not a substitute for retaining the actual downloaded archive's licence/readme. Recheck the exact file version and licence at acquisition time.

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

## Proposed proof of concept

- One selected base body.
- Three hairstyles, three headgear options, three torso options, and two weapon appearances, only if the archive actually contains suitable parts.
- One existing combat sequence and one locomotion sequence.
- Compare the assembled model against the current Roman model for scale, animation fidelity, mobile load time, and visual clipping.
- No broad character-creation UI expansion until the rig and attachment proof passes.

## Acquisition log

No assets have been downloaded or committed as part of this research document. This log must be updated only after files are actually acquired and verified.
