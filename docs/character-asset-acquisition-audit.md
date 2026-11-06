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

## Proposed proof of concept

- Compare one base body from Universal Base Characters against one character from an explicitly modular pack.
- Prototype three hairstyles, three headgear options, three torso options, and two weapon appearances only if the actual archives contain suitable parts.
- Reuse one existing combat sequence and one locomotion sequence.
- Compare assembled model against the current Roman model for scale, animation fidelity, mobile load time, and visual clipping.
- No broad character-creation UI expansion until the rig and attachment proof passes.

## Acquisition log

No assets have been downloaded or committed as part of this research document. This log must be updated only after files are actually acquired and verified.
