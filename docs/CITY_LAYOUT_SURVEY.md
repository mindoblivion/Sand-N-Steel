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
| General Store | (22, -5) | (17, -5) | West-facing open frontage |
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
| Arena Medical House | (-29, -5) | Nested group: (+0, +2.4), doorway (0, -0.1) | (-29, -2.7) | North-side doorway |

Additional frontage observations from component geometry:

- **Stable:** open front is on the north side, local Z = -3.3, approximately world Z = 11.7. The north frontage is partly dressed with a paddock fence and props; the approach needs to preserve the opening, not cross the fence.
- **Public Bathhouse:** the source comments identify its portico at local Z = -3.4, approximately world Z = 21.6, facing north.
- **General Store:** the striped awning, display counter and posts face west toward Via Mercatoria; the actual shopfront is an open frontage rather than a centered doorway component.
- **Armor & Leather Workshop:** the component contains a front-wall plane at local Z = +1.2 (world Z ≈ +2.2) and an open arch/post arrangement. The exact player threshold still needs a more careful local-geometry inspection.
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
| General Store | Not confirmed | West-facing awning/counter | Full solid pavilion box in inspected component; no explicit doorway opening found |

The General Store is now a priority design question for the later entrance pass: it currently has a hub interaction and west-facing retail props, but the inspected building component does not show a clear physical doorway. The layout redesign must not conceal this by drawing a path to a solid wall. Resolve whether the pavilion needs a proper opening as part of the doorway/entrance work, without changing its service behavior.

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
| Arena Medical House | Courtyard-to-Medical House Path | 3.23 |
| Training Yard | Via Decumanus West | 0.00 |

*The General Store value is measured to the west-facing counter/awning reference, not a verified door. Its physical entrance remains unresolved as noted above.

### Highest-priority route gaps

1. **Bounty Hall:** its south-facing doorway standoff is about 3.88 units from the nearest authored approach patch. The existing `forum-to-bounty-hall` slab does not reach the doorway area.
2. **Arena Medical House:** its north-facing doorway standoff is about 3.23 units from the nearest authored approach patch. The courtyard-to-medical slab is not currently aligned with the threshold.
3. **Armor Workshop:** the open north frontage is about 1.20 units from the nearest east-extension slab; the east extension currently ends at X = 27 while the frontage is centered at X = 28.2.
4. **Shrine of Fortuna:** the south portico standoff is about 1.03 units from its diagonal approach patch.
5. **Veteran Hall:** the south doorway standoff is about 1.00 unit from the long courtyard approach slab; its nearest edge and the actual door width need a route join.
6. **General Store:** its west-facing service counter reference is not a physical doorway, and the nearest major paving slab is still 1.00 unit away. Resolve the wall opening first, then align the path.

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
