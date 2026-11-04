# Roman City Layout — Transform and Route Audit

**Original inventory baseline:** `3af1c9c781832cbc5a5bc1b0d18c306b5c3a52ae`  
**Latest validation baseline:** `main` at `e36786dd2989ad3ff7bc5fb229493b62c5615d1f`  
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
| East | Armor & Leather Workshop | [28.2, 0, 1] | [28.2, 0, 1] | North-facing arch; arrival [28.2, -3.6] is 1.9m north of the plinth, outside the interaction disc and clear of the Bazaar footprint. |
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
- Physical Android acceptance: still outstanding; no device test is claimed.
