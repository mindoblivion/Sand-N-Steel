# City Layout Survey — Existing World Baseline

**Survey source:** `fix/mobile-city-hud-clarity` (read-only source inspection)  
**Survey status:** Initial measured inventory; not yet a final placement blueprint.  
**Implementation branch:** `docs/city-layout-survey`  
**Purpose:** Establish a verified coordinate baseline before any building relocation or collision rewrite.

## Executive finding

The city is not a blank or wholly random layout. It already has named avenues, district groupings, building footprints, door-interaction hubs, and a centralized player collision registry. The problem is that these systems are authored independently:

- `streetGeometry.ts` defines paved mesh rectangles and explicitly describes them as **visual only**.
- `collisionShapes.ts` independently defines building and wall collision.
- `cityCollisions.ts` defines interaction trigger centers/radii and fast-travel arrival points.
- Building components own their rendered transforms, entrance geometry, and local orientation.

This split makes it possible for paving to appear to lead somewhere while the player is blocked, or for a trigger/arrival to be near a building without providing a clear physical route to its actual doorway. The redesign should introduce a shared, testable layout description (or a rigorously tested mapping) rather than continuing to patch these files independently.

## Coordinate conventions and constraints

- World horizontal plane: **X/Z**; Y is terrain/elevation.
- Main city movement envelope: **X = -35…+35**, **Z = -101…+35** (the north limit follows the Northern Motte perimeter).
- East Circus is a separate extension outside the core square, east of X=35; it is recorded in the source but is outside this initial city-core layout pass.
- Player collision radius: **0.40 world units** (diameter 0.80).
- Design target for primary pedestrian routes: **2.0 units of clear width** after collision geometry, not merely 2.0 units of paving width. Narrower service passages must be explicitly justified and tested.
- Existing fast-travel coordinates are useful survey references, not proof that a route from the street network or the doorway is unobstructed.

## Measured building collision footprints

The rectangles below are the current registered building footprints. Bounds are calculated from the registry's center and full width/depth. They are collision footprints, not necessarily the complete visual envelope (columns, stairs, awnings, verandas and props may extend beyond them).

| Building | Center (X, Z) | Footprint (W × D) | Approx. bounds X / Z |
|---|---:|---:|---|
| Ishtar central gatehouse | (0, 24) | 14.7 × 5.3 | [-7.35, 7.35] / [21.35, 26.65] |
| Ishtar west tower | (-8.5, 24) | 4.9 × 5.9 | [-10.95, -6.05] / [21.05, 26.95] |
| Ishtar east tower | (8.5, 24) | 4.9 × 5.9 | [6.05, 10.95] / [21.05, 26.95] |
| Smithing Forge | (18, 2.6) | 9.5 × 8.0 | [13.25, 22.75] / [-1.4, 6.6] |
| Golden Palm Tavern | (-16, 14) | 8.9 × 7.7 | [-20.45, -11.55] / [10.15, 17.85] |
| General Store | (22, -5) | 7.7 × 6.3 | [18.15, 25.85] / [-8.15, -1.85] |
| Caravanserai Inn | (16, 14) | 9.1 × 8.1 | [11.45, 20.55] / [9.95, 18.05] |
| Merchant House | (26, -13) | 7.7 × 7.0 | [22.15, 29.85] / [-16.5, -9.5] |
| Armor & Leather Workshop | (28.2, 1.15) | 8.9 × 5.7 | [23.75, 32.65] / [-1.7, 4.0] |
| Stable | (26, 15) | 7.5 × 7.7 | [22.25, 29.75] / [11.15, 18.85] |
| Gladiator Academy | (30.5, -27) | 7.7 × 7.3 | [26.65, 34.35] / [-30.65, -23.35] |
| Doctore House | (28, -18.875) | 6.0 × 3.75 | [25, 31] / [-20.75, -17] |
| Records Library | (23.1, -30) | 6.5 × 5.7 | [19.85, 26.35] / [-32.85, -27.15] |
| Public Bathhouse | (-26, 25) | 8.0 × 7.0 | [-30, -22] / [21.5, 28.5] |
| Shrine of Fortuna | (-27, 11) | 6.3 × 5.5 | [-30.15, -23.85] / [8.25, 13.75] |
| Bounty & Mercenary Hall | (-15, 26) | 7.0 × 6.0 | [-18.5, -11.5] / [23, 29] |
| Gladiator Barracks | (-27, -14) | 7.1 × 6.1 | [-30.55, -23.45] / [-17.05, -10.95] |
| Veteran Gladiator Hall | (-24, -25) | 6.6 × 6.1 | [-27.3, -20.7] / [-28.05, -21.95] |
| Arena Medical House | (-29, -5) | 5.5 × 5.5 | [-31.75, -26.25] / [-7.75, -2.25] |
| Training Hall (inside Training Yard) | (-30.35, 3) | 2.7 × 7.5 | [-31.7, -29.0] / [-0.75, 6.75] |
| Forum fountain basin | (10, 30) | 5 × 5 | [7.5, 12.5] / [27.5, 32.5] |

**Colosseum:** root at (0, -25); outer facade radius 19.3. Its curved perimeter is represented by line segments rather than a rectangular building footprint. Its front gate is south-facing and is a special entrance case. The new city gate interaction should remain outside the facade; the unfinished interior is not a public walkable destination.

**Northern Fortress:** mounted on the Northern Motte, centered on the motte axis. Its position and terrain elevation are handled by dedicated components and perimeter geometry; do not treat it as an ordinary flat city block.

## Existing interaction / arrival references

The following are the registered interaction centers and fast-travel arrivals. **They are not surveyed door coordinates.** Source comments provide explicit facade directions for some buildings; other actual door positions still need to be read from their component geometry before moving anything.

| Destination | Interaction center (X, Z) | Fast-travel arrival (X, Z) | Source-noted entrance orientation |
|---|---:|---:|---|
| Ishtar Town Gate | (0, 24) | (0, 20) | Gate approach |
| Grand Colosseum | (0, -6.2) | (0, -6.2) | South-facing gate |
| Ludus Martial Yard | (-18, 0) | (-18, 2) | Inspect TrainingYard component |
| Smithing Forge | (18, 2.6) | (11.5, 2.6) | West face |
| General Store | (22, -5) | (17.3, -5) | West-facing open counter service point |
| Golden Palm Tavern | (-16, 14) | (-10, 14) | East face |
| Caravanserai Inn | (16, 14) | (10, 14) | West-facing portico |
| Merchant House | (26, -13) | (21, -13) | West-facing colonnade |
| Armor Workshop | (28.2, 1) | (28.2, -3.55) | Inspect component geometry |
| Stable | (26, 15) | (26, 10) | North-facing open front |
| Gladiator Academy | (30.5, -27) | (25.5, -23) | West-facing recessed portal |
| Doctore House | (28, -18.875) | (23.5, -18.875) | Inspect component geometry |
| Records Library | (23.1, -30) | (23.1, -26) | Inspect component geometry |
| Public Bathhouse | (-26, 25) | (-21, 25) | North-facing portico |
| Shrine of Fortuna | (-27, 11) | (-22.5, 11) | Inspect component geometry |
| Bounty Hall | (-15, 26) | (-15, 30) | Inspect component geometry |
| Gladiator Barracks | (-27, -14) | (-22, -14) | Inspect component geometry |
| Veteran Gladiator Hall | (-24, -25) | (-24, -29) | Inspect component geometry |
| Arena Medical House | (-29, -5) | (-29, -9) | Inspect component geometry |
| Northern Fortress | (0, motte center) | (0, motte center + 12.5) | Dedicated fortress gate |
| Forum | (10, 30) | (5, 28) | Open civic space |

## Existing named street / paving geometry

The current visual street module contains these independently authored pieces:

- Via Triumphalis: central north–south bed (14 × 72), with west/east carriageway strips and a 5-unit central runner.
- Via Decumanus: west and east cross-street slabs, plus an east extension toward the forge/workshop quarter.
- Via Mercatoria: narrow connector and an alley between the General Store and Merchant House.
- Via Tabernaria: two diagonal pieces through the tavern and inn quarter.
- Via Socialis: southern civic lane toward Forum Socialis.
- Via Scholaris: diagonal paving patches near the Academy, Library and Doctore House.
- Smaller disconnected approach patches: tavern-to-forum, forum-to-bathhouse, forum-to-bounty hall, forum-to-shrine, courtyard-to-barracks, courtyard-to-veteran hall, courtyard-to-medical house, northwest temple, southeast crafting, and southwest guild.

The list above is not yet proof of a connected graph. Each segment endpoint and overlap must be computed and checked against actual walkable clearances. Paving meshes are visual-only; road slabs do not create walkable corridors by themselves.

## Known pinch points / risks already documented in source

1. **Merchant House ↔ Doctore House:** the registered foundation/plinth gap is only 0.50 units. This is below the 0.80 player diameter, so it is intentionally not a traversable passage. The redesign must route around the block, not pretend this is an alley.
2. **Academy ↔ Records Library:** their registered footprint gap is 0.30 units. The Library was shifted west to clear visual/plinth interpenetration with the Academy, but this is not a player passage.
3. **Forge / Workshop quarter:** previous phases narrowed the Forge collider and adjusted paving to preserve a passage toward the Armor Workshop. The actual clear corridor must be remeasured including player radius and rendered lower steps, not assumed from comments.
4. **General Store ↔ Merchant House:** the store south edge and Merchant House north edge leave a nominal 1.35-unit Z gap. A 0.40-radius player leaves only 0.55 units for centerline movement; this is below the 2.0-unit primary-route target and should not be the principal street.
5. **Training Hall:** the collider was added because the rendered hall previously had no registered collision. Verify the surrounding Training Yard perimeter and the route to the hall entrance.
6. **Colosseum approach:** the circular facade, front gate gap, piers and flanks require a dedicated exterior forecourt route; do not place a generic rectangle across the south gate.
7. **Fountain / Forum:** the fountain is a registered obstacle within the civic space. Design a continuous ring or bypass around it; don't route the main path through its basin.

These are geometry risks from source comments and footprint arithmetic, not claims that every point has been physically reproduced on device.

## Proposed planning structure (not yet implemented)

1. Preserve the city boundary and existing service inventory.
2. Establish a legible primary north–south spine and east–west cross street.
3. Organize buildings into readable blocks/frontages on either side of those streets, preserving a civic Forum and a distinct Colosseum forecourt.
4. Route secondary lanes around building blocks; avoid sub-0.8 gaps entirely and target at least 2.0 units of clear pedestrian width for primary routes.
5. Give each building a short, direct approach from its door to a secondary lane or plaza.
6. Keep the Northern Motte/fortress as a separate northern landmark approach.
7. Defer the East Circus extension and any new districts/buildings; they are not part of this core-city redesign.

## Next survey tasks before moving assets

- Read each mounted building component's root transform, local door transform, facing/yaw, foundation dimensions, steps, columns and protruding props.
- Inventory non-building obstacles and street-wall segments that affect player movement.
- Convert the current paving pieces into candidate graph edges and report disconnected components, overlaps, gaps and dead ends.
- Produce a top-down coordinate blueprint with building rectangles, doors, route centerlines and collision buffers.
- Only after review, propose the smallest set of building moves and street reroutes.
- Add geometry/reachability tests using the real `PLAYER_RADIUS` and the movement resolver; include door approach points, not just fast-travel points.

## Non-goals

No new buildings, districts, gameplay systems, city expansion, or decorative population pass. This milestone is a coherent layout and collision/navigation correction of the existing city.


## Door-transform survey — confirmed component-level entries

A second read-only pass inspected the mounted building JSX. The following world points are calculated from each component's root transform plus its doorway/portico local transform. They are **doorway reference points**, not player standing positions; the approach centerline must stop outside the building collider with at least the player radius of clearance.

| Building | Component root (X, Z) | Local doorway / opening (X, Z) | Calculated world reference (X, Z) | Facing |
|---|---:|---:|---:|---|
| Smithing Forge | (18, 2.6) | (-4.75, 0) | (13.25, 2.6) | West |
| Golden Palm Tavern | (-16, 14) | (+4.22, 0) | (-11.78, 14) | East |
| Caravanserai Inn | (16, 14) | (-4.32, 0) | (11.68, 14) | West |
| Merchant House | (26, -13) | (-3.62, 0) | (22.38, -13) | West |
| Gladiator Academy | (30.5, -27) | (-3.62, 0) | (26.88, -27) | West |
| Doctore House | (28, -18.875) | (-2.77, 0) | (25.23, -18.875) | West |
| Records Library | (23.1, -30) | (0, +1.2) | (23.1, -28.8) | South-facing doorway (local +Z) |
| Bounty Hall | (-15, 26) | (-1.2, +2.52) | (-16.2, 28.52) | South-side doorway |
| Gladiator Barracks | (-27, -14) | (0, +2.82) | (-27, -11.18) | South |
| Veteran Gladiator Hall | (-24, -25) | (0, +2.50) | (-24, -22.50) | South |
| Arena Medical House | (-29, -5) | Nested group: (+0, +2.4), doorway (0, -0.1) | (-29, -2.7) | South-facing doorway |

Additional frontage observations from component geometry:

- **Stable:** open front is on the north side, local Z = -3.3, approximately world Z = 11.7. The north frontage is partly dressed with a paddock fence and props; the approach needs to preserve the opening, not cross the fence.
- **Public Bathhouse:** the source comments identify its portico at local Z = -3.4, approximately world Z = 21.6, facing north.
- **General Store:** the striped awning, display counter and posts face west toward Via Mercatoria; the actual shopfront is an open frontage rather than a centered doorway component.
- **Armor & Leather Workshop:** source inspection confirms a solid rear brick wall at local Z = +1.8 (world Z = +2.8) and two front arch-support piers at local Z = -1.5 (world Z = -0.5), centred at local X = ±3.6. The clear opening between the pier inner faces is approximately 6.25 units wide. The entrance is north-facing; the 0.50-offset player standoff is (28.2, -2.2).
- **Roman Shrine:** no dedicated doorway component was identified in the inspected excerpt; its usable approach/front threshold must be identified from the full mesh arrangement before route planning.
- **Training Yard:** the component includes a separately mounted Training Hall under a rotated parent group. Its local-to-world transform must be applied before mapping its actual entry.
- **Grand Colosseum:** the front portal is on local +Z at the south-facing facade of the world root (0, -25); the facade radius is 19.3 and the portal is a dedicated wide opening. The city interaction point at (0, -6.2) is an exterior trigger, not the doorway threshold.

These values materially improve the survey but do not complete it: remaining entrances and detailed frontage/prop geometry still need inspection. No transforms were changed during this pass.


## Entrance audit corrections and additional measured frontages

The doorway table above has been corrected: the Records Library opening at local +Z is **south-facing**, not north-facing. This correction matters because a north-side approach would send the player toward the rear of the library.

Further confirmed entrance/frontage data:

| Destination | Entrance / frontage reference (X, Z) | Approach side | Status |
|---|---:|---|---|
| Training Yard | (-11.23, 0) | East | 2.5-unit gate opening; Via Decumanus corridor is 3.0 units wide between street walls |
| Stable | (26, 11.7) | North | Open front cutout, with posts at local X ±2.0; paddock fence sits farther north |
| Public Bathhouse | (-26, 21.6) | North | Open colonnade portico |
| Roman Shrine | (-27, 12.4) | South | Open colonnade; stepped platform edge around Z 13.4 |
| Armor & Leather Workshop | (28.2, -0.5) | North | Open arch/post frontage; solid rear wall is south of it |
| General Store | Not applicable — open-counter stall | West-facing awning/counter | Exterior counter protrudes through west wall; service frontage, not a walk-through doorway |

The General Store is an open-counter market stall rather than a door-entry building. The route should lead to the west-facing counter service point. The visual pass should make the counter/wall intersection intentional with an open service aperture or open-sided pavilion treatment, while preserving its existing interaction behavior.

The Training Yard gate and its approach corridor are a useful example of the desired relationship: the rendered gate, the collision opening, and the main street approach have a consistent measured alignment. Other buildings should reach the same standard.


## Paving-to-entrance alignment check

A geometric check compared each surveyed entrance's nominal player standing point (0.40 units outside the threshold, in the outward-facing direction) against the rotated/axis-aligned rectangles in `streetGeometry.ts`. This is a **local coverage test only**: it does not prove that a path is connected to the main street, clear of props, or collision-safe along its entire length. A distance of 0 means the standing point lies inside that paving rectangle.

| Entrance / service frontage | Nearest authored paving patch | Distance from standing point to patch |
|---|---|---:|
| Smithing Forge | Via Decumanus East | 0.00 |
| Golden Palm Tavern | Via Tabernaria West | 0.00 |
| Caravanserai Inn | Via Tabernaria East | 0.00 |
| General Store west counter reference* | Via Decumanus East | 1.00 |
| Merchant House | Via Mercatoria Path | 0.00 |
| Armor & Leather Workshop | Via Decumanus East Extension | 1.20 |
| Stable | Caravan Bypass | 0.20 |
| Gladiator Academy | Via Scholaris Academy Approach | 0.00 |
| Doctore House | Via Scholaris Main | 0.00 |
| Records Library | Via Scholaris Library Approach | 0.32 |
| Public Bathhouse | Forum-to-Bathhouse Path | 0.19 |
| Shrine of Fortuna | Forum-to-Shrine Path | 1.03 |
| Bounty & Mercenary Hall | Forum-to-Bounty Hall Path | 3.88 |
| Gladiator Barracks | Courtyard-to-Barracks Path | 0.00 |
| Veteran Gladiator Hall | Courtyard-to-Veteran Hall Path | 1.00 |
| Arena Medical House | No valid south-side approach identified | — |
| Training Yard | Via Decumanus West | 0.00 |

*The General Store value is measured to the west-facing counter service point, not a door; this is intentional for the open-counter stall.

### Highest-priority route gaps

1. **Bounty Hall:** its south-facing doorway standoff is about 3.88 units from the nearest authored approach patch. The existing `forum-to-bounty-hall` slab does not reach the doorway area.
2. **Arena Medical House:** the component's entrance is on the SOUTH side (world Z increases), but the current Courtyard-to-Medical House paving patch is north of the building. The old 3.23-unit comparison used the wrong facing and is withdrawn; no valid south-side approach has been confirmed.
3. **Armor Workshop:** the open north frontage is about 1.20 units from the nearest east-extension slab; the east extension currently ends at X = 27 while the frontage is centered at X = 28.2.
4. **Shrine of Fortuna:** the south portico standoff is about 1.03 units from its diagonal approach patch.
5. **Veteran Hall:** the south doorway standoff is about 1.00 unit from the long courtyard approach slab; its nearest edge and the actual door width need a route join.
6. **General Store:** route to the west-facing counter at approximately (17.3, -5). Make the counter's service aperture visually clear; do not invent a separate door or pave into the pavilion collider.

The bathhouse, stable and library approach slabs come close to their standoffs (0.19, 0.20 and 0.32 units respectively) but do not contain them. These small gaps may be visually acceptable transitions, but they should be joined deliberately and checked against the player-radius-expanded collision shapes. The distances are to mesh footprints, not measurements of bare-ground walkability.

The next blueprint should prioritize connecting the six gaps above, while verifying every segment-to-segment junction and every approach against the expanded collision registry. Do not move buildings simply to make these paving rectangles touch; first test whether a short path reroute or a corrected approach segment solves the gap.


## Visual paving connectivity graph

A second graph pass includes the central 16.5-radius forum plaza, the four cardinal exit slabs, Via Triumphalis carriageways/runner, Via Socialis, Forum Socialis square, and the authored street/approach rectangles. Two paving regions are considered joined when their footprints overlap or their closest edges are no more than 0.20 units apart. This measures **visual surface continuity only**; it does not prove collision clearance, player reachability, or door-to-road continuity.

The authored paving surfaces form **three disconnected components** under that rule:

1. **Central / east / civic network:** central forum and cardinal exits, Decumanus west/east, Tabernaria west/east, Via Socialis and Forum Socialis square, the Forum Socialis approach patches, Caravan Bypass, and the Decumanus east extension / Mercatoria connector.
2. **Merchant / Scholaris pocket:** Via Mercatoria Path, Via Scholaris Main, and the Academy, Library and Doctore approach patches. This group is disconnected from the Decumanus east extension / Mercatoria connector: the closest gap between the authored Mercatoria Path and connector rectangles is 3.2 units.
3. **Western combat-services pocket:** courtyard approaches to the Barracks, Veteran Hall and Medical House, plus the Northwest Temple and Southeast Crafting extension patches. This group has no paved connection to the west Decumanus exit or central forum surfaces in the current authored rectangles.

The Forum Socialis paving patches do join the square and civic lane in this simplified graph; the central/civic component therefore does not require the earlier assumption that the tavern-to-forum patch is isolated. The corrected graph accounts for the plaza and cardinal thresholds that were absent from the first path-only calculation.

### What this means for the layout pass

- The east commercial / academy pocket needs a real connection from the Decumanus extension to Via Mercatoria / Via Scholaris, while keeping the General Store and Forge foundations clear.
- The western combat-services pocket needs a legible route from the west Decumanus exit around the Colosseum's exterior to its courtyard, with a continuous approach to each of its three doors.
- The Forum Socialis paths need their terminal segments adjusted to the actual Bathhouse, Bounty Hall and Shrine entrance standoffs, especially the Bounty and Shrine approaches.
- Every new link must be checked against the 0.40 player radius and all registered building, yard, street-wall and Colosseum colliders. A visual overlap alone is insufficient.

This graph is a reproducible planning diagnostic, not a replacement for a swept-player reachability test. The final blueprint should show both the paving graph and the collision-expanded walkable graph as separate layers, then reconcile them.


## Collision-expanded reachability — existing automated baseline

A source search found an existing city-wide connectivity test that was not listed in the first survey pass:
`src/utils/cityRouteReachability.test.ts`.

It already does more than the earlier local collision checks:

- Rasterizes the actual `CITY_COLLIDERS` registry at 0.25-world-unit spacing.
- Expands every registered obstacle by the actual `PLAYER_RADIUS = 0.40`.
- Flood-fills four-neighbour walkable cells from the normal city spawn `[0, 16]`, avoiding diagonal corner-cutting.
- Requires every `HUB_LOCATIONS` destination's `FAST_TRAVEL_ARRIVALS` coordinate to snap to that same reachable component.

This is meaningful evidence that all registered fast-travel arrivals belong to one collision-free sampled component in the test's defined city-plus-circus movement envelope. It changes the diagnosis: **the three disconnected paving components are a visual street-continuity problem, not evidence that the player is currently trapped in three disconnected walkable regions.** The unpaved ground between them remains walkable wherever the collision registry and world boundary permit it.

### What the existing test does not prove

- It checks fast-travel arrival coordinates, not the surveyed physical door thresholds or the player standing point outside each door.
- It samples the collision registry on a 0.25-unit grid; it is not a continuous swept-body proof.
- It calls `collidesWith` against the registry rather than exercising every movement step through `resolveCityMovement`.
- It does not prove the paving mesh is visible, continuous, correctly aligned, or free of decorative clutter.
- It does not verify that the interaction trigger is reachable from the door-facing side, nor that the door prompt appears at the intended standoff.

One small documentation discrepancy was also found in the test: its comment says goal snap is within 0.36 m, while the implemented `MAX_GOAL_SNAP = 0.25 × √2 × 0.75` is approximately 0.265 m. Treat the implementation constant as authoritative until that comment is corrected.

### Non-building collision inventory

The master `CITY_COLLIDERS` registry is assembled from these non-building groups:

- Colosseum portal piers, facade flanks, podium ring, gate seals and curved exterior wall.
- Central forum fountain basin.
- Training Yard curved enclosure wall.
- Two Training Yard street-wall rectangles and two mitred return-wall segments.
- Northern Fortress wall rectangles and Northern Motte perimeter.
- East Circus arena perimeter and its forecourt parapet.

The city-street component also renders benches, lamps, carts, crates, barrels, amphorae, notice boards, trees and other dressing. Those props are not listed in the master collision registry. They therefore cannot currently stop the player through this registry, even if they visually occupy a route. The layout pass must audit them as *visual clearance / clutter* separately from collision obstacles, and should not add colliders indiscriminately to every decorative prop.

### Revised verification target

Retain the existing arrival-connectivity test. Extend the survey and eventual regression coverage to add a surveyed player standoff for every actual door/frontage, then verify:

1. the standoff is collision-free with the 0.40 player radius;
2. it belongs to the spawn-connected component;
3. a short outward-facing approach from the standoff reaches the door interaction zone without entering the building footprint;
4. the paved route visibly joins that approach and the main street/plaza network;
5. any non-collidable prop near the route leaves the intended 2.0-unit clear pedestrian envelope visually legible.

Do not interpret paving overlap as collision clearance, or arrival connectivity as door accessibility.


## Confirmed paving / foundation intersections — explicit regression baseline

A targeted read of `src/utils/viaMercatoriaClearance.test.ts` found a second important fact: the city already has a suite that records paving/foundation intersections as an **expected baseline**. Its green result does not mean all paving is clear of buildings. The suite deliberately expects the following sets to remain unchanged until a scene-level layout review decides what each one should become.

### Axis-aligned paving intersections

| Paving slab | Intersecting building footprint |
|---|---|
| Caravan Bypass | Caravanserai Inn |
| Caravan Bypass | Stable |
| Via Decumanus East | Smithing Forge |
| Via Decumanus East Extension | Armor & Leather Workshop |
| Via Decumanus East Extension | General Store |
| Via Decumanus East Extension | Smithing Forge |
| Via Mercatoria Connector | Armor & Leather Workshop |
| Via Mercatoria Connector | General Store |
| Via Mercatoria Connector | Smithing Forge |
| Via Socialis | Golden Palm Tavern |

### Rotated pedestrian paving intersections

| Paving slab | Intersecting building footprint |
|---|---|
| Courtyard-to-Barracks | Gladiator Barracks |
| Courtyard-to-Medical House | Arena Medical House |
| Courtyard-to-Medical House | Gladiator Barracks |
| Forum-to-Bathhouse | Public Bathhouse |
| Forum-to-Bounty Hall | Bounty & Mercenary Hall |
| Forum-to-Shrine | Shrine of Fortuna |
| Tavern-to-Forum | Golden Palm Tavern |
| Via Tabernaria West | Golden Palm Tavern |
| Via Tabernaria East | Caravanserai Inn |
| Via Tabernaria East | Smithing Forge |

### Outer-district diagonal paving intersections

| Paving slab | Intersecting building footprint |
|---|---|
| Northwest Temple Approach | Veteran Gladiator Hall |
| Southeast Crafting Approach | Stable |
| Southwest Guild Approach | Public Bathhouse |
| Southwest Guild Approach | Bounty & Mercenary Hall |

The test uses axis-aligned overlap checks for the straight slabs and a Separating Axis Theorem check using the Three.js yaw orientation for rotated slabs. It is a footprint intersection baseline, not a measurement of how much stone is visibly buried, and not every intersection is necessarily equally wrong: an approach may intentionally meet a building's entrance apron. However, the axis-aligned Caravan Bypass intersections with both the Inn and Stable, plus the multiple east-market road intersections, require direct scene review before any new paving is laid.

The separate `VIA_MERCATORIA_PATH` alley is different: its dedicated test explicitly verifies that it does **not** overlap a registered building footprint and that the Merchant House arrival lies within it. Preserve that proven clearance while redesigning the surrounding connector.

### Why this matters for the redesign

- Do not use the current paving-intersection test's passing status as evidence that all roads clear foundations; it is a snapshot/pinning test for known overlaps.
- Re-route or trim the slabs listed above, preserving only those portions that deliberately terminate at a measured entrance apron.
- Recalculate every rotated footprint using the same Three.js yaw convention as the scene; an axis-aligned bounding-box approximation can misclassify diagonal approaches.
- Keep the paving surface and the collision registry as separate validation layers: a paving mesh can overlap a foundation visually without changing movement collision, and a player can walk on bare ground where no paving exists.
- Add an explicit *allowed contact* list for doorway aprons, then make all other paving/foundation intersections fail the regression suite.

This is now the highest-confidence explanation for the "roads/buildings look randomly piled together" aspect of the city: several paving meshes were authored to overlap building footprints and the tests currently preserve those intersections rather than requiring a clean street-to-frontage plan.


## Doorway reference points versus collision-safe path endpoints

The component-level doorway coordinates above are architectural reference points, not valid player standing coordinates. The building collision registry uses solid footprint rectangles; it does not carve a doorway opening out of each rectangle. A route therefore needs to terminate at a **player-radius-safe exterior standoff**, not blindly at the doorway reference or at a fixed 0.40 offset from that reference.

For an axis-aligned footprint, the standoff is measured from the exterior foundation face in the direction the player approaches, with the player centre at least 0.40 beyond that face. Several examples show why this matters:

| Entrance | Doorway reference | Relevant exterior collider face | Minimum centre standoff |
|---|---:|---:|---:|
| Tavern, east | (-11.78, 14) | east face X = -11.55 | X = -11.15 |
| Records Library, south | (23.1, -28.8) | south face Z = -27.15 | Z = -26.75 |
| Bounty Hall, south | (-16.2, 28.52) | south face Z = 29.0 | Z = 29.40 |
| Veteran Hall, south | (-24, -22.50) | south face Z = -21.95 | Z = -21.55 |
| Shrine, south | (-27, 12.4) | south face Z = 13.75 | Z = 14.15 |
| Armor Workshop, north | (28.2, -0.5) | north face Z = -1.70 | Z = -2.10 |
| Doctore House, west | (25.23, -18.875) | west face X = 25.0 | X = 24.60 |
| Gladiator Academy, west | (26.88, -27) | west face X = 26.65 | X = 26.25 |
| Stable, north | (26, 11.7) | north face Z = 11.15 | Z = 10.75 |
| Bathhouse, north | (-26, 21.6) | north face Z = 21.50 | Z = 21.10 |

The difference is especially large at the Records Library: its doorway reference is recessed well inside the registered south footprint edge, so a player cannot stand 0.40 from that reference without overlapping the building collider. The same principle applies to the other recessed porticos and open-front structures.

This does not automatically mean every building needs a doorway-shaped collider cutout. The current interaction model may intentionally let the player activate a building from a safe point outside its facade. The layout blueprint must explicitly choose between:
- an exterior interaction apron, where the player stops at the safe standoff and the prompt opens the service/interior; or
- a physically traversable doorway, which requires a verified collider opening, jamb geometry, and a continuous interior transition.

Do not create paving that appears to enter a solid collider, and do not move the route endpoint inside the footprint merely to make it visually touch a door mesh. The General Store is the exception: it is an open-counter stall and its route should end outside the west counter.


### Coverage gap in the existing paving-intersection tests

The measured intersection lists above are the exact arrays currently asserted by `viaMercatoriaClearance.test.ts`, not a complete audit of every paving constant. In particular, that test does **not** import or test the four Via Scholaris rectangles (`VIA_SCHOLARIS_MAIN`, Academy Approach, Library Approach, Doctore Approach). It also does not test the paving against every non-building prop or wall collider. Those patches therefore remain unverified for foundation overlap and must be included in the full blueprint's SAT sweep.

The broad `VIA_TRIUMPHALIS_BED` is a separate ground/bedding layer rather than a pedestrian paving segment; do not count its intentional underlay as a street route or use it to infer a door approach.


### Corrected Arena Medical House orientation and arrival mismatch

A direct source check of `ArenaMedicalHouse.tsx` corrected the earlier orientation assumption. Its root is `[-29, 0, -5]`; the recessed doorway group is at local `[0, 0, 2.4]`, with the door at local `[0, 0.2, -0.1]`. With no parent yaw, the doorway reference is world `(-29, -2.7)`, on the **south-facing** side of the building, not the north.

The current building collider spans Z `[-7.75, -2.25]`; the south foundation face is `Z = -2.25`. The minimum safe player-centre standoff is therefore `(-29, -1.85)`, at least 0.40 beyond the south face. The existing `FAST_TRAVEL_ARRIVALS.arena_medical_house = [-29, -9]` lands on the opposite (north) side, and the `COURTYARD_TO_MEDICAL_HOUSE_PATH` is also north of the building. The arrival can still be within the hub's interaction radius, but it does not establish a paved approach to the actual door.

This is a confirmed orientation/approach mismatch, not a reason to move the Medical House immediately. The blueprint should route from the south standoff around the building's west or east side into the wider western pedestrian network, and should decide separately whether the fast-travel arrival should move to the south frontage. Re-run the arrival reachability test and check interaction overlap before changing that arrival coordinate.


## Via Scholaris foundation-intersection sweep — now measured

The four previously untested Via Scholaris rectangles were swept against all 17 registered building-footprint rectangles using the exact Three.js yaw convention and Separating Axis Theorem already used by `viaMercatoriaClearance.test.ts`. This is a footprint intersection calculation; it does not imply every contact is visibly wrong, nor does it test props or non-rectangular colliders.

**Nine current intersections were found:**

| Paving rectangle | Intersecting building footprint |
|---|---|
| Via Scholaris Main | Merchant House |
| Via Scholaris Main | Doctore House |
| Academy Approach | Gladiator Academy |
| Academy Approach | Doctore House |
| Academy Approach | Records Library |
| Library Approach | Gladiator Academy |
| Library Approach | Records Library |
| Doctore Approach | Merchant House |
| Doctore Approach | Doctore House |

This closes the earlier test-coverage gap: the four Scholaris rectangles are no longer unexamined. Their nine intersections are now a measured baseline, not a green clearance result. The Academy/Library/Doctore approaches in particular cross multiple foundations and need a proper block-level redesign rather than independent endpoint nudges.

### Implication for the Scholaris block

The three buildings form a tightly packed cluster:

- Records Library: X [19.85, 26.35], Z [-32.85, -27.15].
- Gladiator Academy: X [26.65, 34.35], Z [-30.65, -23.35].
- Doctore House: X [25, 31], Z [-20.75, -17].

The Academy and Library have only 0.30 units between their registered X faces, below the 0.80 player diameter. That gap is not a pedestrian alley. The Academy's west-facing entrance standoff is also adjacent to the Library's eastern footprint, so its approach needs to be tested as a specific player-circle point and not assumed clear from the paving rectangle.

Do not move these buildings based only on the overlap table. The top-down blueprint must compare three constraints simultaneously: door-facing standoffs, the Colosseum's curved outer facade, and the city boundary at X = ±35. A shift that opens the Academy/Library gap can create a new Colosseum or boundary conflict. Treat the cluster as one planning unit and show candidate alternatives before touching transforms.

### Remaining coverage after this sweep

- All current registered building footprints are now included in the Scholaris SAT sweep.
- Non-building street walls, fountain, Colosseum arc, decorative props and unregistered visual structures still need a separate visual/collision clearance pass.
- The paving sweep does not establish route continuity or safe player standoffs; those remain separate checks.


## Provisional top-down route blueprint — candidate centerlines only

This is the first coordinate-level routing proposal derived from the measured footprints and entrances. It is **not an implementation instruction yet**: every segment must pass the full `CITY_COLLIDERS` player-circle sweep and the live `resolveCityMovement` test before it becomes a paving mesh. Coordinates below are world X/Z. A 0.50-unit facade offset is preferred for route endpoints where possible; the earlier 0.40 values are mathematical minimums with effectively no tolerance.

### Block organization

| Quarter | Buildings / landmarks | Street role |
|---|---|---|
| Civic / Forum | Ishtar Gatehouse, fountain, Bathhouse, Bounty Hall, Shrine, Tavern | Main civic plaza and short frontage spurs |
| East market / craft | Forge, General Store, Armor Workshop, Merchant House, Inn, Stable | Decumanus east branch, west-of-store service lane, eastern Stable frontage |
| West training / medical | Training Yard, Medical House, Barracks, Veteran Hall, Colosseum | West-side service lane with three short door branches; separate Colosseum forecourt |
| Scholar block | Academy, Records Library, Doctore House | One block-level route with separate Library and Academy frontage approaches; no route through the 0.30-unit Academy/Library gap |

### Candidate west-side service lane

The west-side service buildings can be connected without moving their foundations by using the available strip between the city boundary and the west face of the Medical House:

- Medical House west foundation face: X = -31.75.
- Player-radius-expanded face: X = -32.15.
- City movement boundary: X = -35.
- Available player-centre corridor: 2.85 units (from -35 to -32.15).

**Candidate spine:** X = -33.575, from approximately Z = -21.45 (Veteran Hall south frontage) to Z = 15.3 (south of the Shrine). The 2.85-unit envelope is enough for a 2.0-unit clear pedestrian route, but it is a constrained secondary lane, not a broad avenue. Keep all props outside its measured envelope.

Candidate short branches:
- Veteran Hall: from the west spine eastward to a south-facing standoff near (-24, -21.45).
- Barracks: from the west spine eastward to a south-facing standoff near (-27, -10.45).
- Medical House: from the west spine eastward to a south-facing standoff near (-29, -1.75). The Training Hall is north of this standoff, so the branch must stay on the south side of its collider.
- Shrine of Fortuna: from the west spine eastward to a south-facing standoff near (-27, 14.25).

**Preferred candidate connection to the Training Yard gate — south of the Yard and between the Shrine and Tavern:**

- Cross east from the west spine at Z = 15.3 to X = -22.15, south of the Shrine's foundation.
- Turn north/south along X = -22.15 from Z = 15.3 to Z = 8.575. This runs in the 3.40-unit gap between the Shrine east face (X = -23.85) and Tavern west face (X = -20.45).
- Turn east along Z = 8.575 to X = -11.0. This runs in the 3.15-unit gap between the Training Yard south edge (Z = 7.0) and Tavern north face (Z = 10.15).
- Continue east to X = -9.4, then north along X = -9.4 to Z = 0, outside the Training Yard's east wall.
- Cross the existing 2.5-unit east-facing gate opening; the player then reaches the Training Yard's interior interaction radius.

The Shrine/Tavern gap provides 2.60 units of player-centre clearance after expanding both building footprints by the 0.40 player radius. The Yard/Tavern gap provides 2.35 units of player-centre clearance, just above the 2.0-unit target; its lateral offsets and nearby props need explicit checks. The approach along X = -9.4 has 1.2 units of one-sided player-centre clearance to the Training Yard's east wall. The 2.5-unit physical gate opening leaves about 1.7 units of player-centre width after the 0.40 radius on both sides; record it as a named doorway-threshold exception, not a 2.0-unit street.

The 3.20-unit gap between Medical House and Barracks remains a possible local service passage, but it is **not** the preferred Training Yard connector: continuing east at Z = -9.35 runs into the Colosseum's curved facade. The southern route above avoids that conflict and connects the western services to the Yard without crossing the arena perimeter. All segments, turns and gate entry still require continuous movement-resolver verification.

### Candidate east-market route logic

- Keep the Forge's actual west-facing entrance as the primary frontage. Its minimum west standoff is X = 12.85 at Z = 2.6; prefer X = 12.75 for a 0.50 facade offset.
- Do not use the current Via Decumanus East slab beneath the Forge as evidence of a clear route; its foundation intersection is already pinned in the existing baseline.
- The General Store is served at its west-facing counter, not a door. Its candidate player standoff is near (17.3, -5), 0.50 west of the counter edge and inside the configured interaction radius.
- A secondary service lane west of the Store / Merchant House is geometrically plausible around X ≈ 17.65, with a branch east to the Merchant House west frontage near (21.65, -13). This lane must join the Decumanus by routing around the Forge's south-west corner; it must not squeeze through the 0.45-unit Forge/Store gap or the 1.35-unit Store/Merchant gap.
- The Merchant House arrival at (21, -13) is already inside its interaction radius, but the visible paved route needs a continuous approach from the south/west side, not a path through the narrow gap behind the General Store.
- The Armor Workshop's north-facing arch is now measured: its opening is between the two front piers at world Z = -0.5, and the safe exterior standoff is (28.2, -2.2). The east-extension slab contains the approach point at X = 27, Z = -2.2, so a 1.2-unit frontage spur to X = 28.2 is geometrically plausible; the remainder of that slab still overlaps the Workshop foundation and must be trimmed/re-routed.
- The Stable's north-facing frontage has usable open space to the east. Prefer an eastern approach around the stable's northeast corner rather than the current Caravan Bypass slab, which intersects both the Inn and Stable foundations.

### Civic and Scholar frontage rules

- Preserve the fountain as a central obstacle and route around its basin; do not pave across it.
- Keep the Bathhouse's north portico, Bounty Hall's south doorway and Shrine's south colonnade as separate frontage spurs off the civic plaza. The current Bounty and Shrine patches do not reach their safe standoffs.
- The Scholar block must be approached as one planning unit. The Academy/Library 0.30-unit side gap is not a street. A viable Academy approach may come around the south-west corner of the Academy, but its standing point must clear the Library's south-east corner by more than the player radius and should not be treated as a through-alley.
- Doctore House's west-facing entrance is approached from its west side; connect it to the Scholar route without sending paving through the Merchant House or Doctore House foundations.
- The Records Library's south-facing entrance should be served from its south frontage. Its current fast-travel arrival is north of the door, so arrival placement and route layout need a separate decision.

### Blueprint acceptance before geometry edits

1. Plot every candidate route and the expanded building/wall/facade colliders on one X/Z plan.
2. Sample every centerline at no more than 0.10-unit intervals with the real 0.40 player radius; include turns and door standoffs.
3. Verify each path with `resolveCityMovement`, not only `collidesWith`.
4. Require at least 2.0 units of continuous player-centre corridor for primary routes. Record any narrower frontage threshold as a named exception, not as a general street.
5. Add visual prop envelopes and a 0.5-unit no-dressing margin at door approaches.
6. Only then select paving widths and mesh endpoints; the paving must never run under a foundation except for a specifically approved doorway apron.
7. Review the coordinate plan before any building transform is changed. The Scholar block and General Store entrance are explicit design decisions, not automatic relocation tasks.


### Refined Scholar-block frontage option — avoid moving the Academy or Library prematurely

The 0.30-unit Academy/Library side gap is not usable, but the two buildings do not need to be connected through that gap. The hub interaction radii allow separate approaches from the open south/west side:

| Service | Candidate player position | Distance to hub centre | Facade / neighbour clearance |
|---|---:|---:|---|
| Doctore House | (24.50, -18.875) | 3.50 | 0.50 west of Doctore west face |
| Gladiator Academy | (26.25, -24.00) | 5.20 | 0.40 west of Academy face; 3.15 south of Library south face |
| Records Library | (23.10, -25.70) | 4.30 | 1.45 south of Library south face |

The hub radii are 4.5 (Doctore), 5.25 (Academy) and 4.5 (Library), respectively. These candidate positions are therefore inside the configured interaction radii while staying outside the registered building footprints. The Academy point is deliberately south of the Library rather than inside the 0.30-unit side gap.

A plausible connection, still requiring full collision-resolver sampling, is:
- From the Merchant House south-west lane, reach Doctore's west standoff.
- Pass around Doctore's north side at approximately Z = -21.25, then turn east to X = 26.25 and south to the Academy standoff at (26.25, -24.00).
- Serve the Library separately from the west at X = 23.10, approaching its south frontage at Z = -25.70.
- Keep the Academy and Library paths as separate branches of a small open forecourt; do not draw a through-street between their facing side walls.

This shows why the 0.30-unit gap should be recorded as a non-passage, not treated as automatic evidence that one building must move. The three standoff coordinates are geometry-derived candidates; the final route still needs sampled `resolveCityMovement` verification and a visual check of actual door interaction behavior.

### Refined west-side service route geometry

The west-side candidate route is based on the actual movement boundary (`BOUNDARY_X = 35`, symmetric ±35) and the player-expanded Medical House west face at X = -32.15. The strip from X = -35 to -32.15 is 2.85 units wide, so a centreline at X = -33.575 has 1.425 units of centre clearance to either limit. This is the measured available width, not a guessed street width.

The 3.20-unit Medical House/Barracks gap is a possible local service passage, but it does not provide a direct eastward route to the Training Yard: the Colosseum facade blocks that continuation. The preferred gate connector instead routes south of the Yard at Z = 8.575, between the Yard and Tavern, after passing east of the Shrine. This avoids both the Colosseum wall and the narrow 0.30-unit Academy/Library gap.

### Remaining east-side frontage questions

The East market has promising routes that do not use the known narrow gaps:
- Approach the Forge from its west side.
- Route around the Forge's south-west corner before passing south of the General Store.
- Continue south on the Store's west side, then approach Merchant House around its south-west corner.
- Approach the Stable from its north/east open frontage rather than through the Inn/Stable gap.
- Approach the Armor Workshop from its north side, checking the short connector against the east extension and the full frontage width.

These are candidate directions only. The General Store should be treated as a west-facing service counter rather than given an invented door. The counter protrudes 0.60 units through the pavilion's west wall and needs an explicit open-front/aperture treatment in the visual pass. The Armor Workshop frontage is now measured, but its paving spur and the existing slab/foundation intersection still need full collision and visual review. No route is approved until it passes the collider and movement-resolver sweep.


### Armor Workshop frontage — component source now confirmed

A direct read of `ArmorLeatherWorkshop.tsx` resolves the earlier ambiguity:

- Root: (28.2, 1.0).
- Rear solid brick wall: local Z = +1.8, world Z = +2.8.
- Front arch-support piers: local Z = -1.5, world Z = -0.5; centres at local X = ±3.6.
- Clear width between the inner pier faces: approximately 6.25 units.
- Frontage faces north (toward decreasing world Z).
- Collider north face: Z = -1.70.
- Candidate player standoff: (28.2, -2.20), 0.50 north of the collider face and 3.20 from the hub centre (inside its 4.5 interaction radius).

The existing Via Decumanus East Extension includes the candidate standoff's X/Z point at its east edge X = 27, so a short 1.2-unit spur from (27, -2.2) to (28.2, -2.2) is geometrically plausible. However, the larger extension slab still intersects the Workshop foundation elsewhere. The route fix must separate the north frontage apron from the paving that currently runs under the building. No component or collider has been changed.


### General Store — correct classification as an open-counter market stall

The full `GeneralStore.tsx` component shows no `ClassicalDoorway` or door mesh. It is a timber market pavilion with a west-facing service counter:

- Pavilion root: (22, -5); registered footprint X [18.15, 25.85], Z [-8.15, -1.85].
- Counter group local X = -3.6; counter width = 1.2, so its world west edge reaches X = 17.8.
- Counter Z span is approximately [-7.1, -2.9] in world coordinates.
- The counter protrudes about 0.60 units through the pavilion's nominal west wall; it is intended as an exterior service frontage, not a walk-through door.
- Candidate player standoff: (17.3, -5), 0.50 west of the counter edge and 4.70 from the General Store hub centre (inside its 5.25 interaction radius).

The city route should terminate at this west-facing counter. Do not invent a door on another facade. The visual layout pass should decide whether to cut a clean open service aperture around the counter or make the west pavilion wall intentionally open-sided, so the counter no longer appears to intersect a solid wall. The building footprint collider remains a solid service boundary unless a real walk-through interior is explicitly designed.


## Decorative-prop clearance audit — blockers the collider registry does not see

A scene-source pass over `CityStreets.tsx` found that several visually placed props sit directly in the candidate pedestrian corridors. These objects are not registered in `CITY_COLLIDERS`; movement-resolver tests can pass while the rendered path still runs through a cart, bench or crate. The route test PRs must therefore be read as **collision-registry verification only** until this separate prop layer is cleared.

### Confirmed west-side obstruction

The south-of-Training-Yard candidate cross-street at Z = 8.575 intersects the Tavern's north-terrace dressing:

| Prop | Current world position | Measured concern |
|---|---:|---|
| RomanBench | (-13.8, 8.4), yaw π/4 | Rotated 2.0 × 0.7 footprint spans the candidate cross-street |
| WineBarrel | (-15.5, 9.1) | Radius about 0.35; overlaps the player-radius-expanded cross-street |
| Lying WineBarrel | (-16.9, 9.1) | Radius about 0.35; overlaps the same route |

The earlier C-8.22 placement audit moved these props outward in X to clear a nearby cypress and the Tavern plinth; that local fix did not consider the later pedestrian route. Do not undo the cypress clearance by moving them back to their old coordinates. The layout implementation needs a new Tavern side-terrace location outside both the pedestrian route and the Via Socialis approach. A south-west side-yard near X ≈ -21.5, Z ≈ 18.5 is a *candidate only* and still needs prop-to-prop, paving and building clearance checks.

### Confirmed east-market obstruction

| Prop | Current world position | Route impact |
|---|---:|---|
| MerchantCart | (10.8, -1.7), yaw π/4, 2.28 × 2.28 | Pinches the vertical connector between Decumanus and the Store; the centreline can be walked in the collision registry, but a 2.0-unit visual corridor cannot be assumed |
| RomanBench | (12.5, -3.8), yaw -π/2, 2.0 × 0.7 | Blocks the earlier Z = -3.0 cross-street proposal; the newer Z = -5.0 proposal still requires relocating this bench |
| MerchantPropsCluster | (17, -4) | Its barrels/amphora occupy the General Store's west-counter approach |
| TimberCrate | (17.5, -6), 0.8 × 0.7 × 0.8 | Too close to the counter approach and west-side service lane |
| RomanAmphora | (18, -3.5), scale 0.8 | Decorative clutter beside the same counter frontage |

At the proposed General Store service standoff (17.3, -5), the closest cluster amphora has only about 0.11 units of clearance beyond the player radius; the crate leaves about 0.22. That is not a comfortable frontage. The later layout pass should consolidate these props into a small storage/display pocket east of the Store (outside its X = 25.85 footprint edge), not leave them in the customer approach. A possible staging zone around X = 27–29, Z = -5 to -7 is provisional and must be checked against the Workshop north apron and city boundary.

### Fountain bypass — newly confirmed central route constraint

`FOUNTAIN_SPEC` places the central fountain at (0, 0.6), with a 4.0-unit base radius. The player-expanded exclusion radius is therefore 4.4. A direct Cardo line through X = 0, Z = 2.6 is blocked by the fountain; the visual avenue does not mean the player can walk through its basin.

The candidate route to the Forge approaches the fountain's east side:
- Spawn-side approach: (0, 16) → (5.8, 16)
- East bypass: (5.8, 16) → (5.8, 2.6)
- Decumanus/Forge frontage: (5.8, 2.6) → (12.75, 2.6)

The west edge of the sampled 2.0-unit corridor is X = 4.8 at the fountain's centreline Z = 0.6, 0.4 units beyond the player-expanded fountain boundary. This is collision-clear in the current registry, but it remains a narrow pinch that needs visual confirmation against the fountain paving and nearby props.

### Required implementation order for props

1. Relocate the cart and Forge-side bench so the east-market connector can retain a real 2.0-unit pedestrian envelope.
2. Move the Storefront display cluster, crate and amphora out of the counter apron; preserve a clear west-facing service point.
3. Relocate the three Tavern terrace props without reintroducing their documented cypress/plinth intersections.
4. Re-run prop-footprint tests and the collision-resolver route tests together.
5. Walk the rendered routes on the Samsung device; automated collider tests cannot verify visual legibility or perceived obstruction.

No prop has been moved in this survey PR.
