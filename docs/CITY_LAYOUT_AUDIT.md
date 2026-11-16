# Roman City Layout — Transform and Route Audit

> **Current status — 2026-11-06:** This inventory remains a source-level baseline, not a visual sign-off.
> The automated route-connectivity and foundation-footprint checks referenced below have since
> landed. The initial Samsung device smoke test (install, launch, Roman-city walkaround) also passed
> on 2026-11-03 with no reported crashes/freezes. That is not exhaustive acceptance and does not
> prove visible doorway clearance, upper-level/prop separation, paving continuity, or sightlines.
> The outstanding city task is a focused landscape screenshot/video review of the live installed
> scene, especially the north-east Academy/Doctore/Library cluster, west service court, and East
> Circus boundary crossing. Do not move building roots or collision geometry without a reproducible
> visual, movement, or collision defect.

**Original inventory baseline:** `3af1c9c781832cbc5a5bc1b0d18c306b5c3a52ae`  
**Latest validation baseline:** `main` as checked on 2026-11-06 (the route and footprint suites were merged at the SHAs recorded below)  
**Scope:** source-level transform, interaction, approach, and street inventory for issue #232.  
**Status:** inventory complete for primary mounted buildings; no transforms changed. This is not a visual acceptance sign-off.

## Coordinate conventions

- World X increases east; world Z increases south in the current city map.
- Building roots below are world-space `[x, y, z]` transforms unless marked otherwise.
- Most building roots are hard-coded inside their component. The matching interaction centers are separately maintained in `src/utils/cityCollisions.ts` as `HUB_LOCATIONS`.
- Entrances below describe the local side indicated by doorway/portico mesh placement. Confirm sightlines and walkable clearances in the live landscape scene before changing a root.

## Primary building and interaction inventory

| District | Destination | Building root | Interaction center | Entrance / approach evidence |
|---|---|---:|---:|---|
| South gate | Ishtar Gatehouse | [0, 0, 24] | [0, 0, 24] | Gate opening faces the city (north, local/world -Z); Procession Avenue continues north from the gate. |
| North arena | Grand Colosseum | [0, 0, -25] | [0, 0, -25] | Main portal is on the south side (local +Z); central avenue approaches the forecourt. |
| West | Training Yard | [-18, 0, 0] | [-18, 0, 0] | Yard gate is part of its perimeter; entrance is on the east-facing side toward the cross-street. |
| East | Smithing Forge | [18, 0, 2.6] | [18, 0, 2.6] | Colonnade doorway on local -X (west); fast-travel arrival [11.5, 2.6]. |
| East | General Store / Bazaar | [22, 0, -5] | [22, 0, -5] | Open counter/awning on local -X (west); arrival [17, -5]. |
| South-west | Golden Palm Tavern | [-16, 0, 14] | [-16, 0, 14] | Portal on local +X (east); arrival [-10, 14]. |
| South-east | Caravanserai Inn | [16, 0, 14] | [16, 0, 14] | Portico on local -X (west); arrival [10, 14]. |
| East | Merchant House | [26, 0, -13] | [26, 0, -13] | Colonnade portal on local -X (west); arrival [21, -13]. |
| East | Armor & Leather Workshop | [28.2, 0, 1] | [28.2, 0, 1] | North-facing arch; arrival [28.2, -3.55] is 1.85m north of the plinth, just outside the interaction disc and clear of the Bazaar footprint. |
| East | Stable / Chariot Workshop | [26, 0, 15] | [26, 0, 15] | Open front is local -Z (north); arrival [26, 10]. |
| North-east | Gladiator Academy | [30.5, 0, -27] | [30.5, 0, -27] | Recessed portal on local -X (west); arrival [25.5, -23]. |
| North-east | Doctore House | [28, 0, -18.875] | [28, 0, -18.875] | West-side doorway; arrival [23.5, -18.875]. |
| North-east | Records Library | [23.1, 0, -30] | [23.1, 0, -30] | Main entrance is on local +Z (south); arrival [23.1, -26]. |
| South-west | Public Bathhouse | [-26, 0, 25] | [-26, 0, 25] | Portico on local -Z (north); arrival [-21, 25]. |
| South-west | Shrine of Fortuna | [-27, 0, 11] | [-27, 0, 11] | Altar/approach faces local +Z (south); arrival [-22.5, 11]. |
| South-west | Bounty & Mercenary Hall | [-15, 0, 26] | [-15, 0, 26] | Front porch/board on local +Z (south); arrival [-15, 30]. |
| North-west | Gladiator Barracks | [-27, 0, -14] | [-27, 0, -14] | Main porch/doorway on local +Z (south); arrival [-22, -14]. |
| North-west | Veteran Gladiator Hall | [-24, 0, -25] | [-24, 0, -25] | Recessed entrance on local +Z (south); arrival [-24, -29]. |
| West | Arena Medical House | [-29, 0, -5] | [-29, 0, -5] | Entrance porch on local +Z (south); arrival [-29, -9]. |
| Far north | Northern Fortress | [0, summitY, MOTTE_CENTER_Z], scale 0.30 | [0, 0, MOTTE_CENTER_Z] | Gate gap faces south; arrival [0, MOTTE_CENTER_Z + 12.5]. |
| East expansion | East Circus Arena | [CIRCUS_ARENA_POSITION], yaw +90°, scale 0.20 | [CIRCUS_RACE_ENTRY.x, 0, CIRCUS_RACE_ENTRY.z] | Dedicated forecourt/signpost trigger and approach; not part of the ordinary city envelope. |

**Inventory result:** the primary building roots and their `HUB_LOCATIONS` interaction centers agree at the audited coordinates. The fortress intentionally uses the motte center for its interaction point, and the circus uses its shared race-entry geometry constants. No root/interaction-center drift was identified in this pass.

## Street and public-space structure found in source

- **Procession Avenue:** central north/south spine, with the main paving plane centered at [0, 0, 0] and sized 14 × 72; the imperial runner is centered at [0, 0.01, 10] and sized 5 × 21. Its gate/Colosseum forecourts sit around Z +16 and Z -16.
- **Central cross-street:** `CityStreets` has west/east road surfaces centered at [-11, 0, 0] and [11, 0, 0], each 14 × 8, with crossings at X ±5.8. Additional paving branches east and west toward the southern service clusters.
- **East market connection:** Via Mercatoria paving is data-driven by `VIA_MERCATORIA_PATH`; the Bazaar and Forge approaches are intended to meet this east-side network.
- **West service courtyard:** paved court centered [-23, 0, -10], radius 3; branches connect toward the central west street, Barracks, Veteran Hall, and Medical House.
- **North-east academy courtyard:** paved court centered [25, 0, -21], radius 5.2, with branches toward Academy, Library, and Doctore House.
- **South public square:** paved court centered [-21, 0, 20], with paths toward Bounty Hall, Bathhouse, Shrine, and the west/south street.
- **East Circus:** custom navigation envelope X 35…67.5 and Z -35…55; the ordinary city boundary remains X ±35 outside that district band. The expansion therefore requires its own route/collision checks.

## Risks and next verification steps

1. **Source geometry is not a visual proof.** The root/interaction-center match is strong evidence against stale hub coordinates, but it does not prove a clear approach corridor, a visible door, or a collision-free path.
2. **Doorway-side review is the next highest-value step.** Check each arrival-to-entrance corridor in landscape, especially the tight north-east cluster (Academy, Doctore House, Library), the west service court, and the East Circus boundary crossing.
3. **Decorative paving and navigable ground are distinct.** Several `CityStreets` branches are decorative planes. Confirm that the player can traverse the intended route and that no curb, prop, collider, or building footprint blocks it.
4. **Collision geometry must be compared with visible footprints.** The city collision registry contains hand-authored rectangles/circles and comments documenting previous clearance adjustments. Do not infer collision extents from a hub's interaction radius.
5. **No broad repositioning is justified by this inventory alone.** Preserve current coordinates until a reproducible overlap, blocked entrance, broken route, or sightline defect is demonstrated.

## Validation record

- Source inspected: `CityHubScene.tsx`, `cityCollisions.ts`, `CityStreets.tsx`, `ProcessionAvenue.tsx`, and the primary building component files listed above.
- Original source inventory confirmed at `3af1c9c781832cbc5a5bc1b0d18c306b5c3a52ae`.
- Follow-up navigation regression: `src/utils/cityRouteReachability.test.ts` rasterizes the live collision registry at 0.25 m, flood-fills from the normal spawn, and verifies every registered hub arrival is in the same reachable component. PR #239 merged at `93415d40f85c74d67e3c0eab53ccf32e353cc035`; both independent CI workflows passed.
- Follow-up foundation regression: `src/utils/cityBuildingFootprints.test.ts` verifies 20 named building footprints exist and that only the two intentional Ishtar arch/tower intersections remain. PR #240 merged at `e36786dd2989ad3ff7bc5fb229493b62c5615d1f`; both independent CI workflows passed.
- The two follow-up tests are automated source-level safeguards. They do not validate visible doorway alignment, upper-floor/roof/prop overlap, paving continuity, or actual device movement.
- Mobile landscape visual review: still outstanding; the source-only audits do not substitute for a live scene review.
- Physical Android acceptance: the initial Samsung install/launch/city-walkaround smoke test passed on 2026-11-03; broader acceptance remains outstanding and is tracked in issue #329.

## Current acceptance update — 2026-11-06

- **Automated geometry/navigation coverage is in place:** PR #239 verifies walkable connectivity from the normal gate spawn to every registered hub/fast-travel arrival on a 0.25 m grid; PR #240 verifies the 20 audited building plinth footprints and allows only the two intentional Ishtar Gatehouse compound overlaps. The C-8.22/C-8.23 street-prop clearance suites add source-derived prop/building and prop/prop checks. These tests do not certify upper-level visual clearance or rendered door visibility.
- **Initial physical-device city smoke test passed:** the owner installed the workflow-generated rehearsal APK on a Samsung device on 2026-11-03, launched the game, walked around the Roman city, and reported good appearance/playability with no crashes or freezes. This is a limited smoke test, not exhaustive Android acceptance; the remaining checks are tracked in issue #329.
- **Still outstanding for this city issue:** inspect a current landscape screenshot/video from the installed app. Review visible entrances and walk-in corridors, especially Academy/Doctore/Library, the west service court, and the East Circus crossing; verify paving reads as traversable ground and inspect upper-floor, roof, and decorative-prop clearances.
- **No speculative transform changes:** retain the current measured building placements until the visual/device review identifies a reproducible defect. A source-level route or footprint pass cannot establish sightlines or appearance.

## Follow-up — south-district entrance and paving audit (2026-11-16)

This pass compared the south-west entrance faces with the four authored Forum paving patches and the separate arena-quarter courtyard approaches. These patches are rendered meshes only: they do not add navigation collision, and the city reachability flood-fill does not prove that their visible stone surfaces join continuously.

### South public-square cluster

| Building | Verified entrance face | Building footprint from collision registry | Existing paving candidate |
|---|---|---|---|
| Public Bathhouse | Local -Z (north); portico group local Z = -3.4 | X [-30, -22], Z [21.5, 28.5] | `FORUM_TO_BATHHOUSE_PATH`: center [-23.5, 22.5], 3.2 × 5, yaw +π/4 |
| Shrine of Fortuna | Local +Z (south) | X [-30.15, -23.85], Z [8.25, 13.75] | `FORUM_TO_SHRINE_PATH`: center [-24, 15.5], 3.2 × 6, yaw +π/4 |
| Bounty & Mercenary Hall | Local +Z (south); doorway local [-1.2, 0.6, 2.52] | X [-18.5, -11.5], Z [23, 29] | `FORUM_TO_BOUNTY_HALL_PATH`: center [-18, 23], 3.2 × 5, yaw -π/4 |

The Bathhouse's registered fast-travel arrival [-21, 25] is east of its footprint, while its rendered portico faces north. Treat the arrival as a safe interaction/teleport point, not evidence that the portico has a continuous paved approach. Likewise, the Shrine's arrival [-22.5, 11] is east of the shrine footprint although its front faces south. The paving patches must be evaluated against the actual doorway/portico standoff and swept player corridor, not merely against the HUB_LOCATIONS arrival coordinates.

The paving branches occupy a compact triangle between the Forum/Tavern side and three separate foundations. Extending any one patch by simply increasing its length risks running beneath a foundation or merging visually into a neighbouring branch at the wrong angle. Preserve the current transforms until a complete route has been checked against all three building envelopes and the shared Forum approach.

### Arena-quarter west approaches

| Building | Verified entrance face | Existing paving candidate | Survey note |
|---|---|---|---|
| Arena Medical House | Local +Z (south); porch group at local Z = +2.4 | `COURTYARD_TO_MEDICAL_HOUSE_PATH`: center [-26, -7.5], 4 × 6, yaw +π/4 | The nominal approach is the largest measured local paving gap after Bounty Hall; its nearby Training Hall creates an additional narrow-corridor constraint. |
| Veteran Gladiator Hall | Local +Z (south); recessed doorway local Z = +2.50 | `COURTYARD_TO_VETERAN_HALL_PATH`: center [-21.5, -17.5], 3 × 15 | The long north-south slab does not by itself prove that its southern end joins the hall's doorway standoff without clipping the hall plinth. |

The preliminary local paving-coverage pass reported nominal gaps of approximately 3.88 units at Bounty Hall, 3.23 at Arena Medical House, 1.03 at Shrine of Fortuna and 1.00 at Veteran Hall. The Medical House figure is superseded by the doorway/collider remeasurement below (approximately 4.12 units from the nearest legal player-center standoff). All are nearest-paving distances, not traversable-route proofs; the whole swept corridor still needs checking before geometry changes. The Bathhouse was not among those four largest reported gaps and is not declared visually accepted by that omission.

### Implementation gate

1. Keep the current building roots, collision registry and paving transforms unchanged during this survey.
2. For each candidate, calculate the actual doorway/portico standoff from the component transform and the player's 0.40 radius.
3. Test the full swept player corridor against every registered collider, including the Medical House–Training Hall passage.
4. Check the rendered paving polygon and its join to the neighbouring court; a collision-safe route can still have a visible paving gap.
5. Only then propose the smallest paving-only adjustment. Any prop or building relocation remains a separate, higher-risk change.

No scene geometry, collider, interaction center or gameplay code changed in this pass. No Samsung visual walk-through was performed.

## Follow-up — doorway transform versus collision standoff (2026-11-16)

A second, more exact pass found that the arena-quarter paving gaps cannot be assessed from the nominal doorway plane alone. The full registered building rectangle is the movement boundary, and two older approach comments in `phaseC8_47.test.ts` no longer match the current rendered components.

### Arena Medical House — stale orientation record

- Current component root: `[-29, 0, -5]`.
- Current porch group: local `[0, 0, +2.4]`; doorway local Z `-0.1`. The rendered entrance is therefore on the **+Z face**, at world Z = `-2.7`.
- Current collision rectangle: `5.5 × 5.5`, bounds X `[-31.75, -26.25]`, Z `[-7.75, -2.25]`.
- The nominal 0.40-radius doorway standoff `[-29, -2.3]` still overlaps that rectangle: its center is 0.05 inside the north boundary. The nearest center that clears the full rectangle by a 0.40 radius is approximately `[-29, -1.85]` (0.85 from the doorway plane).
- From that legal center, the current rotated 4 × 6 paving polygon has a nearest-edge distance of approximately **4.12 units**. This is a geometric nearest-edge measurement, not proof of a clear route; props and the Training Hall corridor still need a swept check.
- Contradiction: `phaseC8_47.test.ts` lines 141–142 still describe the infirmary entrance as +X and its portico as +X. That does not match the current `ArenaMedicalHouse.tsx` porch and doorway transforms. The old approach table is therefore not authoritative for this building until reconciled.

### Veteran Gladiator Hall — current doorway and full-footprint constraint

- Current component root: `[-24, 0, -25]`; current doorway group local Z is **+2.50**, so its world doorway plane is Z = `-22.50`.
- The collision rectangle is `6.6 × 6.1`, bounds X `[-27.3, -20.7]`, Z `[-28.05, -21.95]`.
- A nominal 0.40-radius doorway standoff at Z = `-22.10` remains inside the registered rectangle. The nearest center that clears its south/front edge by 0.40 is Z ≈ `-21.55`, about 0.95 from the doorway plane.
- At that legal center, the existing 3 × 15 north-south paving rectangle is approximately **1.00 unit** away at its nearest edge. Its northern/front portion is the relevant approach; the polygon also overlaps the registered hall footprint behind the entrance, so its whole rectangle must not be treated as exposed walkable paving.
- Contradiction: `phaseC8_47.test.ts` line 140 describes the doorway at local Z = +2.58, while the current component and the dedicated C-8.60/C-8.62 source checks pin it at +2.50. The old approach-table comment is stale.

### Required correction before any geometry edit

The existing approach test table is a historical interaction-radius audit, not a current doorway/collider contract. Do not use its Medical House +X or Veteran Hall +2.58 comments as current geometry. A future test should derive the doorway plane from the current component, compute the nearest legal player-center standoff against the registered collider, and then sweep the approach corridor through the live collision registry. For Medical House, also reconcile the stale +X source note before using the old approach direction in any automated route assertion.

No collision or component code changed in this pass. These findings are source-derived and mathematically checked; no live scene or Samsung device verification was performed.
## Follow-up — arena-quarter paving corridor constraints (2026-11-16)

The C-8.73 source regression now passes, but it deliberately validates doorway transforms and collider-safe player centers only. A further plan-view check shows why the two existing paving patches need different treatment.

### Arena Medical House

- The existing rotated 4 × 6 patch has corners approximately `[-29.536, -8.207]`, `[-26.707, -11.036]`, `[-22.464, -6.793]`, and `[-25.293, -3.964]`.
- The legal collider-only player-center standoff is approximately `[-29, -1.84]`. A straight segment from the nearest paving corner to that point cuts through the expanded Medical House footprint and is not a valid route.
- The first candidate frontage line at Z `-1.84` was too close to the rendered porch step: its front edge is Z `-2.20`, leaving only `0.36 m` for a `0.40 m` player radius. It is rejected.
- The Training Yard's west curved wall constrains the passage, so a 2 m-wide Medical corridor is not viable in the available gap. The revised source-derived candidate is a **1 m-wide corridor**: it leaves the existing patch at `[-26.3891, -5.0607]`, turns east of the Medical House's northeast foundation corner at `[-25.70, -1.60]`, then follows the frontage at Z `-1.60` to `[-29, -1.60]`. The full 0.5 m corridor radius is supported by the existing patch at the start. A review caught and corrected the test helper's inverse-yaw transform before treating this join as valid; the earlier CI result did not prove this paving containment. The 5 cm sweep clears the Training Yard wall, Medical foundation, porch step, column plinths, table and amphora. This is still a candidate corridor, not paving or rendered acceptance.
- The Medical House table and amphora have now also been included as conservative source-derived plan-view envelopes in the 5 cm sweep; both clear the candidate route. The Medical House–Training Hall separation remains clear in the full registered-collider sweep. Visible paving continuity and other unregistered scene details still require rendered review before a paving strip can be dimensioned.

### Veteran Gladiator Hall

- The existing 3 × 15 patch occupies X `[-23, -20]`, Z `[-25, -10]`; the registered hall foundation occupies X `[-27.3, -20.7]`, Z `[-28.05, -21.95]`.
- The patch overlaps the hall foundation by 2.3 m in X and 3.05 m in Z. The exposed east-side sliver is only 0.7 m wide. A 0.40 m player radius needs 0.80 m of clear paving width, so this sliver cannot contain a fully supported player-center corridor.
- The north/front area of the patch remains the plausible approach region, but the door-center standoff `[-24, -21.54]` is about 1.00 m west of the nearest paving edge. Any new spur must join the north/front edge, terminate outside the foundation, and be checked against the full player sweep.

### Decision

Do not lengthen either existing rectangle blindly. The Medical House needs a tested east-flank/frontage bypass and a porch-prop check; Veteran Hall needs a short north/front spur with a proper foundation-safe termination. These are separate paving-only candidates, not permission to alter building or collider geometry. The live collision registry does not model the steps, columns, or other decorative props, so source-level collision clearance alone cannot certify the final rendered corridor.

The initial C-8.73 collider-only regression passed Environment workflow run `43804565713`. The corrected rotated-paving containment check and source-envelope sweep are now in the draft branch; the post-correction CI result is pending. No Samsung visual walk-through was performed.