# AGENTS.md

## Project

"Sand & Steel: 3D Gladiator Arena RPG" — a Vite + React 19 + TypeScript + three.js
(react-three-fiber) single-page game, exported from Google AI Studio. There is **no backend**:
player progress is stored in `localStorage` (`src/services/storage.ts`).

## Running it (Base44 dev environment)

- `docker compose -f docker-compose.base44.yml up -d` starts the Vite dev server on host port 3000.
- Dependencies are installed from the committed `bun.lock` at container startup
  (`bun install --frozen-lockfile`); `node_modules` lives in the `web_node_modules` volume, not in the repo.
- Live reload (Vite HMR) is on — edits under `/app` appear without a rebuild or restart.

## Non-obvious notes

- **No environment variables are required to boot.** The upstream README mentions `GEMINI_API_KEY`,
  but `@google/genai` is an unused dependency — nothing under `src/` reads it.
- `firebase-applet-config.json` holds a hardcoded Firebase config used only by the optional Google
  Drive cloud-save (`src/services/googleAuth.ts`, `googleDrive.ts`, `components/hub/GoogleDriveSyncModal.tsx`).
  Google sign-in needs the serving host to be an authorized domain in that Firebase project, so sign-in
  is expected to fail in the sandbox; the game plays fully without it. Do not treat sign-in errors as a boot defect.
- `vite.config.ts` already sets `host: '0.0.0.0'`, `port: 3000` and `allowedHosts: true`, so the preview host
  is accepted as-is and no host/origin override is needed.
- The AI Studio ZIP contained `public/models/arena_roman.glb.backup.glb`, a throwaway backup produced by
  `scripts/gltf-transform-optimize.js` and referenced nowhere; it was excluded on import.
- The AI Studio export shipped two import bugs that broke the 3D screens and were fixed on import:
  a duplicated `Banner` import in `src/components/3d/city/IshtarGatehouse.tsx` (Vite "Identifier already declared"),
  and `React.lazy()` calls in `src/App.tsx` that expected a default export from `CityHubScene`/`DuelScene`,
  which only export named components. If a 3D screen ever goes blank after re-importing, check these first.
- `public/models/arena_roman.glb` is the player's character model: a 66-joint UE-style skeleton (`root`,
  `pelvis`, `spine_01`-`03`, `arm`/`hand_l`/`hand_r`/`leg`) with 178 animation clips. `GladiatorMesh` clones it
  per fighter, attaches the procedural sword/shield to the `hand_r`/`hand_l` bones, and maps ~29 of the clips
  (`Walk`, `Sword_Attack`, `Sword_Regular_C`, `Defend`, `Roll`, `Hit_Chest`, `Death_A`, `Fighting_Idle`, ...).
  If the file is missing or not rigged it silently falls back to a procedural gladiator, so check the network
  tab for `/models/arena_roman.glb` when the character looks blocky.
- **Tailwind's content scanner walks `public/`.** Tailwind 4 auto-detects sources across the project and only
  skips extensions it knows to be binary (`.ogg` is fine), so a multi-MB `.glb` was read as text — memory grew
  ~100 MB/s until the dev process was killed and the container restart-looped (symptoms: `bun`/`vite` dying with
  SIGKILL/segfault, and a huge untracked `core` dump appearing at the repo root — delete it before committing).
  `src/index.css` now carries `@source not "../public";` (the `not` form needs Tailwind >= 4.1; 4.3.3 is installed).
  Verified after the fix: the CSS build takes ~1 s and the dev server holds steady around 190 MB, with no SIGKILLs.
  `curl 'localhost:3000/src/index.css?direct'` forces a full scan if you need to re-check. Add the same exclusion
  for any new large non-audio asset folder under `public/`.
- `scripts/gltf-transform-optimize.js` (`bun run compress:glb`) runs inside the `web` container and shrinks a
  model with dedup/weld/resample/quantize — useful for load time. Pass `--no-draco`: Draco output needs
  `useGLTF(url, true)` plus a decoder, which `GladiatorMesh` does not configure. KHR_mesh_quantization output
  is fine. Note it writes a `.backup.glb` beside the file when input and output are the same path.

- **Shield upright constraint (Phases 111–132) — settled, don't re-tune.** `GladiatorMesh` corrects the
  shield's world orientation each frame so the board stays approximately upright in idle/walk/block, with
  per-action strength and a Phase-131 rate ceiling on the correction itself (`SHIELD_CORRECTION_MAX_RATE`,
  600°/s = 10°/frame at 60 Hz). A Phase-132 **read-only** audit (throwaway harness kept outside the repo,
  real `Roll` clip, both stances, 60 Hz and 240 Hz, results in `/tmp/phase132`) compared the shipped
  two-factor construction against swing / anti-parallel / azimuth / waypoint alternatives and swept the cap.
  Findings: the shipped target family (shipped + its waypoint variants) is the only one that never flips the
  board's facing (0 crossings); every swing/anti/azimuth target traded the transient for a visible facing
  flip; and the cap only trades whip vs lag (300°/s halves the step to 5° but raises peak tilt from 152° to
  164°; 1200°/s doubles the step to 20°). 600°/s is the measured middle and the shipped setting. The one
  residual is a ~10° single-frame shield step during the dodge, already documented as game-safe. No
  production change is warranted.
- **Dev-only shield diagnostic harness (Phases 129–135).** `src/components/dev/ShieldDiagnostics.tsx` is mounted
  from `App.tsx` only when `import.meta.env.DEV` (`import.meta.env.DEV && <ShieldDiagnostics />`), and renders a
  `shield diag (dev)` button bottom-left; it is a second `Canvas` with its own copy of the rig and writes nothing
  outside its own DOM. Since Phase 135 it can hold its own canvas (`frameloop: 'never'`, which also zeroes the
  r3f clock, so `advance(t)` uses `t` as the frame delta) and step the mixer in fixed 1/60 s increments, which
  makes a chosen clip time reproducible regardless of the browser's frame rate. The panel drives an explicit
  handshake — freeze → drive the mesh onto a pivot clip → swap back onto Roll — because GladiatorMesh only resets
  a clip when the action it is driven with *changes*; each step waits on the `data-status` / `data-seen-action`
  reports the canvas subtree writes, never on a guessed delay. Every step renders a frame, so the sampled pose is
  exactly what the canvas shows (verified 2026-10-10 on the 1.833 s `Roll` clip: 0.275 s/17 steps, 0.733 s/44,
  1.192 s/72, 1.65 s/99, four distinct board world quaternions, board on `hand_l` with `attachMatchesHand`). One
  sample takes a few seconds because the sandbox has no GPU, so drive it with a generous budget. Nothing here
  touches production rendering or combat logic.
- **All player-acquirable items live in `src/data/itemsDB.ts`** (single source of truth): `ITEMS_DB`,
  `ALL_WEAPONS`, `ALL_ARMORS`, `ITEMS_BY_CATEGORY` (`weapon` + one key per armor slot) and `getItemById()`.
  `ALL_WEAPONS[2]` is the spare starter weapon (`STARTING_SPARE_WEAPON`, used by `services/storage.ts` and
  `CharacterCreation.tsx`), so **keep the array order when appending** new entries. Weapons may carry an
  optional `modelPath`; the five meshes in `public/models/weapons/` (gladius, spatha, dagger, dirk, shamshir)
  are single static unrigged meshes ~1 unit long, currently referenced as data only — nothing renders them yet.

- **Opponent weapons come from the opponent's own config (D1 fix).** `DuelScene` builds the
  opponent's `loadout` as `opponent.loadout?.weapon ?? getWeaponByType(opponent.weaponType)` — never
  from `playerProfile.equipped` — and that one resolved weapon drives the rendered mesh
  (`GladiatorMesh` reads `fighter.loadout?.weapon` for `type`/`modelPath`), attack damage
  (`attacker.loadout.weapon.damageLight|damageHeavy`) and reach (`weapon.type === 'spear' ? 3.8 : 2.5`).
  `getWeaponByType` (`data/itemsDB.ts`) maps each `WeaponType` to the FIRST `ALL_WEAPONS` entry of that
  type, so weapon stats stay single-sourced; an unknown type falls back to the canonical gladius. The
  roster is not populated with per-opponent `loadout`s today, so every opponent resolves by `weaponType`.
  In-game this is nearly invisible on a fresh save: the only unlocked tier-1 opponent (Marcus,
  `sword_shield`) resolves to the same gladius the player starts with, so reaching a different type
  needs a leveled profile (or a `loadout` on the config).

- **Northern motte terrain is mesh-aligned (Phase Motte-Terrain Alignment 1).** The rendered mound
  (`public/_workspace_motte_normals.glb`, `Motte_Grass`) is a family of scaled superellipses (exponent 6)
  built from the summit edge (cardinal 12.58 world): the summit is that shape at level 1, and the visible
  slope reaches Y=0 at level **1.55** (model radius 62 of 40; world radius 19.499 cardinal / 24.554
  diagonal — the foot is neither a circle nor the collision perimeter). `getTerrainY` interpolates linearly
  in that level between `SUMMIT_Y` and 0, via `summitLevel()` in `src/utils/terrainHeight.ts`. Previously it
  interpolated radially out to `MOTTE_PERIMETER_RADIUS` (22.0), floating the player up to 1.252 units above
  the visible mound (worst at X=0, Z=-52) and up to 1.389 units below it on the diagonals.
  `MOTTE_PERIMETER_RADIUS` stays collision-only and unchanged. The reference samples in
  `phaseMotteTerrain.test.ts` come from a downward raycast onto the GLB, not from the formula.

- **City-layout geometry suites parse sources and compare bands, not just footprints.**
  Phase labels are reused across workstreams: `src/utils/phaseC8_19.test.ts` is the
  *Doctore House depth reduction*, while the Smithing Forge ↔ General Store correction
  (forge root Z 2 → 2.6, clearing the store's ridge cap by 0.16) lives in
  `src/utils/phaseC8_19b.test.ts` under the repo's `phase39b`/`phase39c` letter suffix.
  These suites read the 3D component sources and the shared primitives
  (`BuildingFoundation`, `WallCornice`, `CornerQuoins`, `RomanGabledRoof`) by regex and
  compare only pairs that share **both** an X and a Y band, so a pair whose vertical bands
  never meet (the two eave cornices sit at 5.55 and 4.75) is not evaluated — a name-based
  `clearanceOf()` assertion must name a same-band pair. Every rotation in these two
  buildings is about Z, so each piece's Z extent equals its own box Z dimension exactly:
  the reported Z clearances are exact rather than AABB approximations.

## Verifying

- `curl -s localhost:3000/` should return the HTML shell (title: "Sand & Steel: 3D Gladiator Arena RPG").
- Live flow that works: title screen → character creation → **3D city hub** → `Colosseum` tab →
  `Enter Arena Duel` → `Step into Sand` → **3D duel arena**. The 3D scenes are heavy to build, so give them a
  few seconds after navigating.
- Landing on the title screen with a save already in `localStorage`, the tap should go straight to the city
  hub (the artwork's "CONTINUE" path), not to character creation. `TitleScreen` runs the tap handler from both
  a React `onClick` and a `window` listener, guarded by a ref; if a future edit re-introduces a double-fire,
  the symptom is a returning player dumped into character creation.
- **Short-landscape duel HUD.** On a phone held sideways (or any window flatter than tall with a height of
  520px or less) the duel HUD's stacked content (~400px) exceeded the viewport and pushed the bottom of the
  tactic dashboard below the fold. `src/index.css` carries an `@media (orientation: landscape) and
  (max-height: 520px)` block that compacts it, using the `.combat-hud` / `.combat-top` / `.vital-card` /
  `.hype-meter` / `.combat-log-items` / `.tactic-desc` hooks added in `CombatHUD`/`TurnActionPanel` (the
  tactic blurbs are hidden; name, cost, hit chance and damage stay). Those rules are unlayered, so they
  outrank Tailwind's utilities layer without `!important`. **Verification caveat:** the sandbox's preview
  browser only offers fixed viewport presets (no ~812x375), so the compacted layout was measured by replaying
  those declarations unconditionally over the live duel HUD — content dropped from 403px to 347px against a
  365px budget. A true 812x375 render is not reproducible here; check it on a real landscape phone.
- `bun run lint` (`tsc --noEmit`) reports several **pre-existing** type errors inherited from the AI Studio export
  (e.g. `screen.orientation.lock` missing from the DOM lib, extra fields on `FighterStats`/`WeaponItem`,
  `isBone` on `Object3D`). Vite's dev server does not type-check, so they do not block the app — don't chase
  them as setup failures.

## Development-only character test harness (Phase 4)

- **What it is.** `src/components/dev/CharacterTestHarness.tsx` is a dev-only screen that mounts the real
  `CharacterCreation` (3D model preview) and a live `DuelScene` with an **in-memory** profile, so a character
  like Dimachaerus can be selected, previewed and dueled without passing through the GPU-heavy 3D city hub and
  without touching the player's real save.
- **How to enter it.** In the dev environment only, open the app with the exact query parameter
  `?devHarness=character` (e.g. `https://3000-<host>/?devHarness=character`). `src/main.tsx` checks this in a
  branch gated on `import.meta.env.DEV`; when active it mounts the harness **instead of** `<App />`.
- **Development-only restriction.** `import.meta.env.DEV` is `true` only under `vite`/`bun run dev` and is
  statically `false` in a production build (`bun run build`), so the harness branch is dead-code-eliminated
  from the production bundle. Supplying `?devHarness=character` in production has no effect — normal `<App />`
  startup runs unchanged. Verified by building into `/tmp` and grepping the output.
- **Save isolation.** The harness imports no function that writes to localStorage, sessionStorage, IndexedDB,
  or Google Drive. The profile from `CharacterCreation.onComplete` is held in React state only. `CharacterCreation`
  itself only calls back (it never calls `saveProfile`); `DuelScene` imports only the pure `calculateTotalStats`
  and reports results via callbacks. The harness's `onComplete`/`onMatchComplete`/etc. are local state setters,
  NOT App's `handleCharacterCreated`/`handleMatchComplete` (which persist). A save fingerprint taken before and
  after a full harness run must match.
- **Sandbox GPU note (not a production defect).** The preview browser has no GPU and renders through SwiftShader
  (CPU). The 3D city hub runs at ~2 fps there (median ~467 ms/frame, main thread busy ~84% of wall time) with no
  console errors — the automation stall that blocked earlier Dimachaerus acceptance was a software-rendering
  limit, not an app bug. The character-creation preview (one skinned mesh) is much lighter and is usable. The
  duel arena is heavier; if it is too slow to exercise actions reliably, stop expensive retries and document
  what was observed instead.
- **Removal.** Delete `src/components/dev/CharacterTestHarness.tsx` and revert the `useCharacterHarness`
  branch in `src/main.tsx` (the import + the conditional). No other file references the harness.

## Colosseum interior boundary (Phase C-8.28)

- **The arena bowl is cut at the doorway.** In `GrandColosseum.tsx` sections 4a–4c the podium ring and
  both seating frustums used the full 306° arc, so they ran straight across the monumental entrance: a
  1.2-unit-high travertine wall stood at Z = −9.7 in the doorway with the cavea slope rising behind it.
  `collisionShapes.ts` modelled only the facade (radius 19.3) and the portal piers, so the real resolver
  walked the player through both rendered surfaces and left them standing inside the facade wall band
  (r = 18.62 east/west, 18.81 on the diagonals). The bowl now stops at the portal's own 5.2-unit passage
  (`PORTAL_PASSAGE_HALF_W` = 2.6 — the lintel half-width and the piers' inner faces — taken as a radial
  cut at the podium radius), matching the file's existing convention for every other entrance band, and
  `colo-podium-l/r-0…7` (16 segments on the rendered radius 15.3, same 306° arc and the same gap) make it
  physical. The cut edge lands on the pier's inner-face line, so the vestibule wall runs unbroken from the
  pier into the podium. The arena now has exactly two ways in or out: the doorway and the rear gap below.
- **The 54° rear Colosseum gap was an unguarded render opening — C-8.28 left it alone, C-8.31 closed it.**
  `ARC_THETA_LENGTH = 1.7π` was a render-cost choice for the partial cylinder ("invisible from the player's
  normal viewing position"), not architecture and not a designed route: walking around the north side
  led in and out through an opening with no stone in it at all. Closing it as-is would have taken a
  ~10-unit invisible collider on bare ground, so C-8.28 left the gap and its traversal unchanged (the
  reasoning is preserved in `src/utils/phaseC8_28.test.ts` §G, which now asserts the opposite: the drum
  is stone there). Phase C-8.31 completed the drum around a designed rear gate — see below.
- `phaseC8_27.test.ts`'s `withPreFixRegistry()` now splices out the C-8.28 podium polyline as well as the
  two flank closures: that suite's frozen replay is the registry the bypass was reported against, which
  predates both. Everything else in C-8.27's assertions is unchanged.

## General Store ↔ Armor & Leather Workshop junction (Phase C-8.29)

- **The reported "0.15 clearance / 2.10 overlap" is a genuine gap, not a defect — and was measured, not
  assumed.** Both buildings are unrotated, so their world-axis footprints are exact rather than
  conservative bounds. General Store: root `[22, 0, −5]`, foundation `[7.2, 5.8]`, projection 0.25 → plinth
  X `[18.15, 25.85]`, Z `[−8.15, −1.85]`. Armor & Leather Workshop: root `[28.2, 0, 1]`, foundation
  `[8.4, 5.2]`, projection 0.25 **plus a `position={[0, 0, 0.15]}` plinth offset** → plinth X
  `[23.75, 32.65]`, Z `[−1.70, 4.00]` — hence its collider centre Z is **1.15, not 1.0**. The two Z bands
  are 0.150 apart and their X bands overlap by 2.10: diagonal neighbours, not an interpenetration.
- **Every visible solid of both buildings was enumerated** (plinth steps, wall, quoins, cornice, both roof
  assemblies, awning, posts, counter, crates, barrel, lantern, piers, architrave, tanning/display racks,
  workbench): no Store solid intersects any Workshop solid. The closest approach in 3D is exactly the
  0.150 plinth-to-plinth gap; the next closest is the Store roof slab against the Workshop eave fascia at
  0.203, clear in both Z (0.203) and Y (0.060). The extreme overhangs — Store ridge cap at Z = −1.710 vs
  Workshop plinth at Z = −1.700 — are 0.010 apart in Z but sit in disjoint vertical bands (≈6.2 m against
  0.0–0.14 m). The registry rects equal the rendered plinth lower steps to machine precision, so this was
  never a collider/render mismatch either.
- **No production transform changed and no collider moved.** The phase rule holds: a collider is never
  moved to solve a mesh problem, and there was no mesh problem. The 0.15 band is narrower than the 0.80
  player diameter, so it is a dead pocket; `src/utils/phaseC8_29.test.ts` pins the measured geometry and
  drives the real resolver to show no push enters it and a blocked push is immediately reversible.
- **Transform-convention note for future audits of these two files.** three.js applies an object's own
  rotation about its own origin, so the mesh *position* stays the centre and only the half-extents rotate —
  that is the Store's two roof slabs (`rotation={[0, 0, ±slope]}` on the mesh). A PARENT group's rotation
  instead turns each child's centre as well — that is the Workshop's lean-to (`rotation={[0.16, 0, 0]}` on
  the group). Treating the two the same misplaces the Store roof by ~0.7 in Y.

## Colosseum rear opening (Phase C-8.30 audit — measured, no production code changed)

- **The opening is the complement of `ARC_THETA_LENGTH = 1.7π`**: θ ∈ (153.0°, 207.0°), 54.0° wide, centred
  on θ = 180° (local −Z). The root group is world [0, 0, −25], so the two facade ends land on
  **(±8.762, −42.196)** — chord **17.524**, subtended arc **18.190** — and the podium ends on
  **(±6.946, −38.632)** (chord 13.892). The void runs the building's full height (y 0 → 17.35).
- **Nothing renders and nothing collides inside it.** Every band in `GrandColosseum.tsx` stops at ±153°:
  11 bands are split into seg1/seg2, and the four "full-arc" bands (lower plinth, golden cornice, attic wall,
  attic crest) use the same 306° arc — so no geometry floats, and the visible artifact is just the raw
  `openEnded` arc-end of each band. `colo-wall-*` and `colo-podium-*` stop on the same ±153°;
  `phaseC8_28.test.ts` §G asserts that absence of any blocker.
- **It is the on-axis north route, and the motte's moat + drawbridge occupy the same sector.** The portal
  (θ = 0) and the gap (θ = π) are diametrically opposite on X = 0, and the drawbridge deck (Z −40.5 … −46.5,
  X ±2.0) runs straight through it — its southern 3.8 units lie inside the Colosseum's footprint, entering at
  r ≈ 15.5 (just outside the podium). The whole rear arc (motte-radius 27.0 … 30.6 about [0, −71.5]) sits
  inside the moat band (25.8 … 31.0), and the moat's south gap (±10.31°) is narrower than the rear arc
  (±16.65°), so ~44% of the would-be rear facade arc is over water. `scripts/collisionTests.ts`
  ("fortress: does not overlap Colosseum colliders") already asserts the X = 0 corridor from the building to
  the ramp is clear, i.e. the suite depends on the opening.
- **Consequence.** Completing the drum to 360° as-is would run the bridge through the new wall and stand the
  wall base in the moat film, so "close" effectively means "close around a designed rear gate". That is
  what Phase C-8.31 implemented (see below): a ≈16° rear gate on θ = π, 5.40 wide at the facade, with the
  podium cut on the portal's 5.2-unit passage line and the colliders extended to match — draw-call neutral.

## Colosseum rear axial gate (Phase C-8.31 — implemented)

- **The drum runs the full circle and is cut at exactly two axial openings.** `GrandColosseum.tsx` no longer
  has `ARC_THETA_START` / `ARC_THETA_LENGTH` / `ARC_END` / `BOWL_SEG1_LEN`. The two openings both sit on the
  seam between the drum's two arcs (`DRUM_ARCS`), so **every band still draws as two meshes and the
  draw-call count is exactly what it was for the 306° partial cylinder**:
  - the monumental entrance, θ = 0 (+Z) — `ENTRANCE_MIN…MAX`, ±24.6°, untouched;
  - the rear axial gate, θ = π (−Z) — ±`GATE_HALF` = ±8.03°, i.e. **16.08°, exactly 5.40 wide at the
    facade** (`GATE_HALF_W = 2.7`; the chord is `2 × GATE_HALF_W` because `GATE_HALF = asin(GATE_HALF_W /
    R_FACADE)`). An earlier note in this repo said 5.39 — that figure was simply wrong.
  Three cut policies drive the bands: `DRUM_ARCS` (upper plinth + sill — cut at both openings),
  `FRONT_CUT_ARCS` (six bands that stop at the entrance only, so they run straight over the gate as its
  head/lintel/upper storeys), and one `GATE_ARC_START, GATE_ARC_LEN` band (the flared base ring, cut at
  the gate only — the gate's floor is the ground, not a step). Above the tier-1 cornice (7.8…8.6, the
  gate's lintel) three bands are complete rings (`FULL_TURN`), one mesh each as before.
- **The gate spans tier 1 only** (clear opening 0.16…7.35): the spandrel band closes its head and the
  tier-1 cornice spans it as its lintel — the real outer ring has no rear notch in its upper storeys. Its
  floor is the arena's own ground; the drawbridge deck (X ±2.0, ±2.11 across the side beams, `DECK_TOP_Y`
  0.16) passes through with ~0.59 clear either side, and its southern 3.8 units enter the bowl at r ≈ 15.5.
- **Inside, the bowl is cut at the gate on the doorway's own 5.2-unit passage line** (`BOWL_ARCS`,
  `PORTAL_PASSAGE_HALF_W`), not on the gate's jamb faces — the passage is set by the structure the player
  walks through, exactly as the 8.6-wide doorway is cut to that same line. The cavea cut is therefore a
  little wider than the gate, so no seating projects into the opening; the arena now has two ways in/out.
- **Collision (`collisionShapes.ts`): the originals are untouched and the rear quadrants are appended.**
  `colo-wall-l/r-0…7` and `colo-podium-l/r-0…7` keep their ids, endpoints, 306° arc and 8-way subdivision,
  so every measured clearance in the other suites still holds. Added: `colo-rearwall-l/r-0…1` on the facade
  radius (19.3) and `colo-rearpodium-l/r-0…1` on the podium radius (15.3), each ending on its own gate edge.
  `colo-*` is now 44 colliders (was 36; the eight appended rear segments are the only addition) —
  **Phase C-8.33 later appended two more, the gate's lateral seals; see its section below.**
- **Regression suite: `src/utils/phaseC8_31.test.ts`** (§A rend/arc, §B gate geometry, §C registry,
  §D traversal both ways + the fortress bridge corridor, §E drawbridge alignment, §F entrance/unrelated
  invariants). `phaseC8_28.test.ts` §G was inverted to assert the rear drum is stone, and `phaseC8_27`'s
  frozen replay is unchanged.
- **Verified 2026-10-18** in the dev container: `bun test` → 881 pass / 0 fail (30 files),
  `bun run scripts/collisionTests.ts` → 122 passed, 0 failed, `bun run lint` (`tsc --noEmit`) → exit 0.
  **Not automatically verified:** the gate's appearance (stonework, arch head, lintel) — the sandbox
  preview has no GPU and the city hub renders at ~2 fps through SwiftShader, so it needs an on-device look,
  together with the still-open C-8.28 bowl cut and C-8.29 junction checks.

## Colosseum rear gate lateral seal (Phase C-8.33 — implemented)

- **The defect was a movement-boundary gap, not a mesh defect.** C-8.31's rendered gate is exactly
  what that phase built; the registry simply had nothing between the facade (r 19.3) and the podium
  (r 15.3), so the 1.3-wide band the cavea and the arcade occupy was open ground to the resolver.
  Measured with the real `resolveCityMovement` (throwaway harness, kept in `/tmp`): 11 steps north
  from (0, −38) reach (0, −42.18) — r 17.18, mid-passage — and a `+X` push from there leaves the
  passage on the eighth step, (3.04, −42.18), past the 9.784° bowl cut, and runs on to
  (7.60, −42.18), r 18.79 — i.e. **standing inside the rendered arcade pier** (the r 18.0 … 19.3
  tier-1 wall band). Everything mirrors on the west. A −12 … +12 X sweep at z = −40.5 is entirely
  free, and the same sweep at every rear depth is free outside the passage.
- **The seal is the C-8.27 remedy applied to the gate: bridge the strip between the two structures
  that already end there.** `colo-gateseal-l` / `colo-gateseal-r` are single segments from
  `podiumPoint(π ∓ COLO_PODIUM_GAP)` = (∓2.600, −40.077) to `coloPoint(π ∓ COLO_GATE_HALF)` =
  (∓2.700, −44.110). **Both endpoints ARE existing endpoints** — the last point of the
  `colo-rearpodium-r/l` polyline and the last point of the `colo-rearwall-r/l` polyline — so no new
  corner and no slit appears. Two colliders total; `colo-*` is now 46 (was 44). No rendered geometry,
  gate dimension, podium/cavea cut, material or unrelated collider changed, and the seals sit on the
  θ = π axis, nowhere near the front portal.
- **The passage stays wide enough.** The clear opening is 5.2 (|X| ≤ 2.6 at the podium, 5.40 at the
  facade). With a 0.4-radius player, a wall on that face leaves |X| ≈ 2.21 … 2.33 of usable corridor
  (measured per 0.25 of depth), which is wider than the drawbridge deck plus both side beams together
  (±2.11) — the whole crossing stays walkable — and as wide as the corridor C-8.27 pins at the
  doorway (|X| ≤ 2.2). The tightest approach between a seal and the deck's outer edge is 0.49.
- **Regression suite: `src/utils/phaseC8_33.test.ts`** (§A registry and endpoint coincidence, §B the
  frozen reproduction — the escape replays with the seals spliced out and is gone with them, §C gate
  traversal both ways plus usable width, §D the drawbridge deck and its beams, §E the front portal
  and the C-8.27 closures, §F arrivals and the Store ↔ Workshop junction). The three suites that
  enumerate the Colosseum id set (`phaseC8_27`, `phaseC8_28`, `phaseC8_31`) were updated for the two
  new ids; C-8.27's frozen pre-fix replay now splices the seals out too (its delta constant 26 → 28),
  so its historical replay is unchanged. No assertion was weakened.
- **Verified 2026-10-18** in the dev container: `bun test` → 906 pass / 0 fail (31 files),
  `bun run scripts/collisionTests.ts` → 122 passed, 0 failed, `bun run lint` (`tsc --noEmit`) → exit 0,
  `git diff --check` → clean. **Not automatically verified / not attempted:** any visual acceptance of
  the gate or the seal — the sandbox renders the city hub at ~2 fps through SwiftShader, and C-8.32
  already could not reach the rear gate there; the C-8.28 bowl cut and C-8.29 junction device checks
  remain open too.

## Northern motte flat ground apron (Phase C-8.35 — implemented)

- **The oversized flat sage-green surface on the northern approach was the asset's own outer
  flange — not the mound, and not any code-built mesh.** `public/_workspace_motte_normals.glb`'s
  `Motte_Grass` is a family of scaled superellipse rings (exponent 6, cardinal radius 40 model units
  at the summit edge) that does not stop at the mound's foot: it continues as an outer flange whose
  rings oscillate around the city ground plane (`ProcessionAvenue`, Y = −0.05). Measured from the
  asset with the motte transform ([0, 0, −71.5], scale 0.3145, no extra rotation — the GLB nodes
  carry the Z-up→Y-up matrix): rings at levels 1.55 (Y 0), 1.625 (−0.472), 1.70 (−0.881),
  1.775 (−0.472), 1.85 (0) and 2.00 (0 … −0.315), with cardinal/diagonal world radii up to
  25.16 / 31.70. **The crest rings sit at exactly Y = 0, i.e. 0.05 ABOVE the sand, while the trough
  rings sink below it where the opaque ground plane hides them** — so one flat, untextured material
  rendered as concentric ground-level green bands out to a 63.4-unit width with sand showing through
  between them. That is both the "oversized flat green surface" and the "abrupt horizontal colour
  bands". The material is `Grass`, `baseColorFactor` [0.3608, 0.4510, 0.2392] (sage green #A2B386
  after the linear→sRGB conversion), roughness 1, no texture and no UVs. No mesh anywhere else in
  the city is green, so the colour identifies it unambiguously; the mound itself is not the offender,
  since from its foot (Y = 0) it rises 4.7175 to the summit, exactly what `getTerrainY` mirrors.
- **The correction sinks the flange and touches nothing else.** New `src/utils/motteSurface.ts`
  exports `buryMotteFlange`, which lowers every vertex past the visible foot to at most
  `MOTTE_FLANGE_BURIED_WORLD_Y` = ground elevation − 0.55 = −0.60, using `Math.min`, so it is
  idempotent and never raises a vertex that is already deeper. The cutoff is `MOTTE_FLANGE_LEVEL`
  = 1.5875, midway between the foot ring (1.55) and the next ring (1.625), because the foot ring's
  own computed level spreads ~4e-8 either side of 1.55 and 68 of its 128 vertices land fractionally
  above it — a strict `> 1.55` test would misfile part of the foot and bury the mound's own edge.
  `NorthernMotte.tsx` applies it at mount time inside the same traverse that already hides
  `Ramp_Dirt` and `Moat_Water`. **It must copy the positions out first: this asset interleaves
  POSITION with NORMAL in one 24-byte-strided buffer view**, so three's GLTFLoader hands back an
  `InterleavedBufferAttribute` whose array is shared with the normals and must not be edited in
  place. The copy is read through `getX/getY/getZ`, which is correct for an interleaved attribute
  and a plain one alike, so the wiring does not depend on the asset's layout.
- **What did not move:** the mound's foot ring (Y = 0), its slope, the summit (4.7175), the fortress,
  the moat ring, the drawbridge, `getTerrainY()`, `MOTTE_PERIMETER_RADIUS` and the entire collision
  registry — so the traversable route stays exactly the one C-8.31 and C-8.33 verified. The rendered
  green/sand junction shifts by ~0.02 world units, because the skirt between the foot and the next
  ring already crossed the ground plane before this phase. The mesh keeps its 1410 vertices and 2816
  triangles, so the shell stays closed (no holes, no exposed back faces) and no material, no GLB byte
  and no other mesh changes.
- **Regression suite: `src/utils/phaseC8_35.test.ts`** — §A measures the defect in the shipping
  asset itself (1410 vertices = 642 mound + 768 flange; crests exactly 0.05 proud of the sand,
  reaching 31.70 world units against the mound's 24.55 diagonal foot); §B drives the real
  `buryMotteFlange` over the asset's real position buffer (no vertex above the ground plane outside
  the mound, all 642 mound vertices byte-identical, the single interior apex vertex at model
  (0, 0, −1) noted, idempotence, and the threshold slack shown to be load-bearing); §C pins the
  mound's south approach profile, the terrain contract, the drawbridge corridor, the untouched Grass
  material, the interleaved accessor layout and every gameplay constant including the C-8.33 seals.
  The suite parses the GLB with `@gltf-transform/core`, the library the tooling scripts already use.
- **Verified 2026-10-18** in the dev container: `bun test` → 925 pass / 0 fail (32 files),
  `bun run scripts/collisionTests.ts` → 122 passed, 0 failed, `bun run lint` (`tsc --noEmit`) → exit 0,
  `bun run build` → exit 0. **Not automatically verified:** the rendered appearance — the sandbox
  city hub runs at ~2 fps through SwiftShader, so the removed bands still need the on-device
  (Android) look, together with the open C-8.28 bowl cut, C-8.29 junction and C-8.31/C-8.33
  rear-gate checks.

## Northern moat: water beneath the drawbridge (Phase C-8.36 — implemented)

- **The defect was the water ring's own south gap, plus an inner edge that stopped short of the
  deck.** `NorthernMotte`'s `<MoatWater>` ring was drawn with `MOAT_GAP_HALF_ANGLE = 0.18 rad`
  (±10.31° about the +Z axis) — a wedge far wider than the bridge it sheltered: 9.238 units across
  at the ring's inner edge against a bridge footprint only 4.22 wide (deck ±2.0; the side beams
  reach ±2.11). The gap therefore removed the water over the *entire* crossing, leaving a dry
  terrain channel under the deck and along both sides of it — the reported "dry strip under the
  drawbridge". Independently, the inner radius (25.8) left the deck's last 0.71–0.80 (at the
  footprint's inner corners, radius 25.089, and at the centreline, radius 25.000) with no water
  beneath it at all.
- **The correction is water-mesh only: two constants.** `MOAT_GAP_HALF_ANGLE` 0.18 → **0** (the ring
  is a complete annulus) and `MOAT_INNER_RADIUS` 25.8 → **25.0**, so the water reaches under the
  bridge's north end. The moat is now 6.0 wide instead of 5.2 and its inner shoreline sits exactly
  at the deck's north end. Nothing else moved: the outer shoreline (31.0), the water elevation
  (0.06), the bridge's dimensions and transforms, the terrain contract, the motte/mound, the
  Colosseum's geometry and the whole collision registry are untouched. The ring is still one mesh
  with the same 48 segments / 98 vertices / 96 triangles, so the draw-call count is unchanged.
- **The new inner edge was chosen from measured clearances, not by shrinking the ring as far as it
  would go.** Measured on the shipping asset with the C-8.35 flange burial applied
  (`phaseC8_36.test.ts` §D, per-azimuth interpolation of the rendered surface): the motte's surface
  stands above the water plane (Y = 0.06) out to **radius 24.456** at the worst azimuth (the
  diagonals), and its visible silhouette — where the buried skirt crosses the ground plane at
  Y = −0.05 — reaches **24.666**. So 25.0 keeps 0.544 of clearance from the waterline and 0.334
  from the silhouette: the water neither cuts nor climbs the mound. The 24.456 figure is
  cross-checked analytically against `terrainHeight`'s own slope model (the water plane cuts the
  slope at level 1.55 − 0.55·0.06/4.7175 = 1.543, widest on the diagonal at `summitEdgeRadius(45°)`).
- **Coverage measured over the real footprint, before and after** (`phaseC8_36.test.ts` §A–§B, a
  0.05 grid over the deck box plus both side beams, |x| ≤ 2.11, Z −46.5 … −40.5): before, **0** of
  the samples inside the moat band had water beneath them (the whole crossing was dry); after,
  every sample inside the outer shoreline (all 9,000+ of them) is covered, and no covered sample
  lies inside the new inner edge. The only footprint the water does not reach is the approach-end
  landing — the outer corners overshoot the 31.0 shoreline by at most **0.072**, i.e. the deck
  rests on the outer bank there, which is where a bridge belongs. No water was pushed out over the
  sand to cover it.
- **Vertical clearances are unchanged and re-measured** (§C): water 0.06 sits 0.03 below the deck's
  underside (0.09), below the side beams' bottom (flush at 0.09) and below the hinges (0.085), and
  0.11 above the city ground plane (−0.05) so it cannot z-fight with the sand.
- **Regression suite: `src/utils/phaseC8_36.test.ts`** — §A footprint coverage before/after, §B the
  complete ring and its reach under the north end, §C vertical clearance, §D the asset-measured
  mound clearances, §E the untouched outer shoreline, §F everything that did not move (terrain,
  bridge/terrain constants, no water colliders, the C-8.33 `colo-gateseal-l/r` seals and the 46
  `colo-*` colliders, the Colosseum's `GATE_HALF_W`/`R_FACADE`/`R_LINER`). Three suites pinned the
  old ring and were **rebased, not weakened**: `phase35e` (the two "bridge fits inside the gap"
  tests are inverted — the ring now covers the bridge instead of the bridge fitting inside a dry
  hole — and the ring-vs-deck checks now use the drawn deck's `DECK_Z_*`), `phase35c` (its "outside
  the motte base footprint" test now compares against the *rendered* mound, 24.666, since C-8.35
  buried the 25.16 flange it was written against) and `phaseNorthernGroundCoverage` (constant
  values).
- **Verified 2026-10-18** in the dev container: `bun test` → 953 pass / 0 fail (33 files),
  `bun run scripts/collisionTests.ts` → 122 passed, 0 failed, `bun run lint` (`tsc --noEmit`) → exit
  0, `bun run build` → exit 0, `git diff --check` → clean. The ring geometry itself was validated
  directly (a full 2π sweep yields 98 vertices / 96 triangles, radius 25.0 … 31.0, all coordinates
  finite and no degenerate triangles).
- **Not automatically verified — the rendered look.** The sandbox does render the city hub through
  SwiftShader (~2 fps at the mobile viewport; frames are legible), fast-travel to the Northern Roman
  Fortress works and the player can walk, but a legible frame of the moat/drawbridge could not be
  captured: orienting the chase camera needs a hold-and-drag orbit of the camera (the yaw is
  decoupled from the player's facing and recenters while moving) and that gesture plus the scene's
  settle time exceeded the script budget. **So the appearance still needs the on-device (Android)
  look**, together with the open C-8.28 bowl cut, C-8.29 junction and C-8.31/C-8.33 rear-gate
  checks. Two things worth looking at specifically: (a) water is now visible right up to the deck at
  both ends and along both sides; (b) because the ring fills the wedge the drawbridge crosses, the
  water now also laps the Colosseum's rear-gate threshold beside the deck (inside the gateway the
  deck spans 4.22 of the 5.2–5.4 opening), where the old gap deliberately kept water out of the
  gateway.

## Northern landmark separation (Phase C-8.37 — implemented)

- **The defect was the group standing too close to the Colosseum: the moat's outer shoreline and
  the drawbridge's south end were inside the rear gateway.** Measured against the collision
  registry (not the render): the Colosseum's rear-most stone is its gate jamb line at
  **Z = −44.1102**; at the old centre (Z = −71.5) the moat's outer shoreline sat at **Z = −40.5**,
  i.e. 3.61 units *inside* it, and the deck's south end (`DECK_Z_OUTER`) shared that line, which is
  what the C-8.30/C-8.31 notes recorded as "the deck's southern 3.8 units enter the bowl". The
  nearest city structure to the motte centre measured **27.52** — less than the 31.0 moat radius, so
  the ring encircled the Colosseum's rear stone.
- **The correction moved the whole northern group 5.0 units north, and it moved as one group.**
  `terrainHeight.ts`'s `MOTTE_CENTER_Z` is now **−76.5** (was −71.5) and every dependent transform
  is *derived* from it instead of repeating a literal: `NorthernMotte`'s mound group
  (`position={[0, 0, MOTTE_CENTER_Z]}`) and its `MOTTE_MOAT_CENTER`, `NorthernFortress`'s group
  (`position={[0, SUMMIT_Y, MOTTE_CENTER_Z]}`), `Drawbridge`'s span, `collisionShapes.ts`'s five
  `fortress-*` rects and the 20 `motte-wall` chords, and `cityCollisions.ts`'s
  `BOUNDARY_Z_MIN = MOTTE_CENTER_Z − MOTTE_PERIMETER_RADIUS + 2.5`, the fortress hub centre and the
  fast-travel arrival (`MOTTE_CENTER_Z + 12.5`). `phaseC8_37.test.ts` §B fails if an absolute
  `−76.5`/`−71.5` literal reappears in executable code in any of those five files.
- **Before → after, measured** (`phaseC8_37.test.ts` §A and §F; "before" is the same registry
  evaluated at the recorded pre-shift centre):
  | landmark | before | after |
  |---|---|---|
  | motte centre Z | −71.5 | **−76.5** |
  | motte south foot (visible slope foot, radius 19.499) | −52.0 | **−57.0** |
  | moat outer shoreline on the X = 0 axis | −40.5 | **−45.5** |
  | moat inner shoreline | −45.7 (25.8) | **−51.5** (25.0) |
  | deck span `DECK_Z_OUTER` → `DECK_Z_INNER` | −40.5 → −46.5 | **−45.5 → −51.5** |
  | drawbridge terrain constants `BRIDGE_Z_OUTER` / `BRIDGE_Z_INNER` | −40.5 / −46.0 | **−45.5 / −51.0** |
  | fortress footprint Z | [−82.0, −61.0] | **[−87.0, −66.0]** |
  | fortress hub centre / arrival Z | −71.5 / −59.0 | **−76.5 / −64.0** |
  | motte mesh footprint Z (radius 25.16) | [−96.66, −46.34] | **[−101.66, −51.34]** |
  | moat ring north extent | −102.5 | **−107.5** |
  | ground-plane north edge | −104 | **−109** |
  | `BOUNDARY_Z_MIN` | −91 | **−96** |
  | ground bump-repeat Z | 40 | **41** (179 / 41 = 4.366 m per tile) |
  Clearances that matter: Colosseum rear facade plane (−44.3) to the motte's south foot **7.7 →
  12.7**; moat outer shoreline to the Colosseum's rear stone **−3.61 (overlapping) → +1.39**; the
  nearest city structure to the motte centre **27.52 → 32.50**, i.e. 1.50 of clearance from the
  31.0 ring and 7.34 from the 25.16 mesh footprint; the deck's south end **3.61 inside the gateway
  → 1.39 clear of it**. The group's whole box (|X| ≤ 31, Z ∈ [−107.5, −45.5]) is now disjoint from
  every city collider, and the Colosseum's rear gate remains the nearest at 1.39.
- **Only the centre moved — no dimension, material or ratio changed.** X centre 0, scale 0.3145,
  perimeter radius 22.0, summit 4.7175, the whole mound-slope model, both moat radii' 6.0 width, the
  water elevation 0.06, the deck's 4.22 × 6.0 deck and its Y values, the ground plane's width,
  south edge (+70) and elevation (−0.05) are untouched; the moat's outer shoreline is still exactly
  the deck's south end (the bridge still lands on the outer bank). One sub-millimetre consequence:
  `NorthernFortress`'s group now reads `SUMMIT_Y` (4.7175) instead of the rounded literal 4.72, so
  the fortress base sits **0.0025 lower** and its composed top is 12.6375 (was 12.64) —
  `phaseFortressRotation.test.ts` now asserts the exact summit value plus the cross-check against
  `SUMMIT_Y`.
- **`phaseFortressRotation.test.ts` was rebased, not weakened.** Its source parser evaluated the
  outer `<group>` attributes with `Function(...)`, which threw `ReferenceError: SUMMIT_Y is not
  defined` on the new derived position and took the file's whole module load with it (bun reported
  it as a file-level *error*, not a failure). `evalComponent` now resolves the shared terrain
  constants (`SUMMIT_Y`, `MOTTE_CENTER_X`, `MOTTE_CENTER_Z`, `MOTTE_SCALE`) through a named
  parameter list and reports the unresolved identifier in its own error, so a numeric literal and a
  `Math.PI` term still evaluate exactly as before and section C's composed bounds can be
  re-derived (Z [−87.0, −66.0], base Y 4.7175, top 12.6375). Section D — the duplicate-rotation
  guard — is unchanged and still passes.
- **`scripts/collisionTests.ts` was part of the unfinished rebase and is now green too.** It carried
  eight pre-shift literals (the −59.0 arrival, the −61.0 south-wall/gate line, the −82.0 north wall,
  the −71.5 wall and motte centres, the "−Z clamped to −91" boundary and the Colosseum-overlap
  corridor). They are now derived from `MOTTE_CENTER_Z` and the fortress's own 10.5 half-footprint,
  with the wall faces stated explicitly (−65.4 outer / −66.6 inner on the south, −86.4 inner on the
  north) and the motte-perimeter helper reading `MOTTE_CENTER_Z`. No assertion was relaxed: the
  clamp test now starts from `BOUNDARY_Z_MIN + 1`, and the "walk around the fortress" tests reach
  the north wall's outer face instead of a fixed −80.
- **`phaseNorthernGroundCoverage.test.ts` was rebased from the transforms, not by text
  substitution.** Mesh footprint bounds −101.66/−51.34, moat north extent −107.5, bump repeat 41,
  the five mesh-slope samples re-stated as `MOTTE_CENTER_Z + {19.0, 18.5, 17.5, 16.5, 12.5}` (same
  radii about the moved centre, same measured Y), the bridge span from `BRIDGE_Z_*`, the fortress
  rects at `MOTTE_CENTER_Z ± 10.5`, the arrival at `+12.5`, the boundary as
  `MOTTE_CENTER_Z − MOTTE_PERIMETER_RADIUS + 2.5`, and the two derived regression figures
  (required depth 159, depth delta 19.5).
- **Regression suite: `src/utils/phaseC8_37.test.ts`** — §A the move and the increased separation
  (including the measured before/after clearances above), §B one derived transform per part plus the
  no-literal guard, §C drawbridge-to-gate alignment and the *driven* route (one straight X = 0 walk
  with the real `resolveCityMovement` from inside the arena at (0, −38) through the rear gate, the
  deck, the mound and the fortress gate, stopping at the north wall at z = −85.88; plus the reverse
  walk, the continuous ascent and a collision-free sweep of the whole deck footprint), §D ground
  coverage and margins (1.5 past the moat, 7.34 past the mesh bound, 13 past the walkable limit),
  boundaries, arrivals and hub detection, §E the C-8.33 seals (endpoints unchanged and still
  coincident with the cut-face endpoints, 0.49 of corridor beside the deck) and the C-8.36 water
  (grid re-run about the moved centre: 225 samples, 217 covered, the 8 uncovered ones exactly the
  approach-end landing line), §F no city collider overlaps the group's box, and §G a
  reversed-shift control that fails the same checks at −71.5.
- **Verified 2026-10-18** in the dev container: `bun test` → **997 pass / 0 fail (34 files)**,
  `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**, `bun run lint` (`tsc --noEmit`) →
  exit 0, `bun run build` → exit 0, `git diff --check` → clean. The starting point for the
  validation was 931 pass / 11 fail / 1 error, all of it stale pre-shift geometry in
  `phaseNorthernGroundCoverage`, `phaseFortressRotation` and `scripts/collisionTests.ts`.
- **Not automatically verified — the rendered look.** The sandbox has no GPU (SwiftShader, ~2 fps
  in the city hub), so **the northern approach still needs the on-device (Android) inspection**:
  (a) the 5.0 of newly opened ground between the Colosseum's rear gateway and the moat's outer
  bank, (b) whether the drawbridge's south end now reads as landing on the bank with no stone or
  water left inside the gateway, and (c) the fortress and mound at their new position. Still open
  from earlier phases: the C-8.28 bowl cut, the C-8.29 Store ↔ Workshop junction, and the
  C-8.31/C-8.33 rear-gate stonework. Do not claim visual acceptance without device evidence.

## Northern approach composition (Phase C-8.38 — implemented)

- **The second 5.0 north move opened the northern approach.** C-8.37's own 1.39 of clearance
  between the moat's outer shoreline and the Colosseum's rear-most *registered* stone (1.0 against
  the gate's rendered tier-1 cornice / lintel ring, which reaches Z = −44.5) still read as gateway
  crowding: the water lapped the threshold and the deck began inside the gateway's silhouette.
  Phase C-8.38 moves the same group a further 5.0 north — `terrainHeight.ts`'s `MOTTE_CENTER_Z`
  −76.5 → **−81.5**, 10.0 from the layout this workstream started at (−71.5) — which opens the
  apron to **6.39** against the registered rear stone and exactly the moat's own **6.0** width
  against the rendered lintel. The Colosseum, its rear gate, its bowl cut and its C-8.33 seals did
  not move.
- **Only the centre moved; every dependent transform followed because it is derived.** No
  dimension, material or ratio changed: X centre 0, scale 0.3145, perimeter radius 22.0, summit
  4.7175, the mound-slope model, the moat's 25.0 / 31.0 radii and 6.0 width, the water elevation
  0.06, the deck's 4.22 × 6.0 box and its Y values, the ground plane's 140 width / +70 south edge /
  −0.05 elevation. What followed the centre: the motte group and moat ring, the fortress group, the
  drawbridge span, `collisionShapes.ts`'s five `fortress-*` rects and 20 `motte-wall` chords, and
  `cityCollisions.ts`'s `BOUNDARY_Z_MIN` (now −101), fortress hub centre and fast-travel arrival
  (now −69.0). The ground plane's north edge followed one for one, −109 → **−114** (depth 179 →
  **184**, bump repeat 41 → **42**: 4.381 m per tile against the 4.375 calibrated density).
- **Regression suite: `src/utils/phaseC8_38.test.ts`** — §A the second 5.0 move and the apron rule
  it buys (≥ 5.0; 6.0 now, 1.0 at C-8.37's centre, −4.0 pre-shift) plus the measured clearances,
  §B one motte-centre-derived transform per part and the no-literal guard over the five files (the
  property that lets the group move again as a group), §C the *driven* route (one straight X = 0
  walk from inside the arena at (0, −38) through the rear gate, the deck, the mound and the fortress
  gate, stopping at the north wall at −91.0; plus the reverse walk and the continuous ascent),
  §D ground coverage, boundary, arrival and hub detection, §E the C-8.33 seals and the C-8.36 water
  re-run about the moved centre, §F no city collider overlaps the group's box (nearest structure
  37.4872) and the approach corridor is clear, and §G a reversed-shift control that fails the apron
  rule and shortens the nearest-structure clearance at C-8.37's centre.
- **Five suites and the collision script carried stale C-8.37 values and were rebased, not
  weakened** (`phaseC8_37.test.ts` had already been rebased onto the −81.5 centre):
  `phaseNorthernGroundCoverage` (mesh footprint −106.66 / −56.34, moat north −112.5, plane north
  −114, boundary −101, bump repeat 42, required depth 164, void 31, margin delta 22), `phase35e`
  (ramp bounds −58.227 / −68.92, boundary −101, moat / deck span −56.5 → −50.5),
  `phaseFortressRotation` (group Z −81.5, composed Z span [−92.0, −71.0]),
  `phaseDrawbridgeAlignment2` (mesh landmarks, the five slope samples now derived as
  `MOTTE_CENTER_Z + {19.0 … 12.5}`, boundary −101, header measurements), `phase34g` (fortress lines
  −71.0 / −92.0, boundary −101, hub centre −81.5, motte south edge −56.34) and
  `scripts/collisionTests.ts` (its fortress test names, wall faces and the −69.0 arrival label; the
  assertions themselves were already derived). Comment-only mentions in `phaseC8_35` /
  `phaseMotteTerrain` were aligned too.
- **Verified 2026-10-18** in the dev container: `bun test` → **1033 pass / 0 fail (35 files)**,
  `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**, `bun run lint` (`tsc --noEmit`) →
  exit 0, `bun run build` → exit 0, `git diff --check` → clean. The starting point was 17 failures
  in five suites (`phaseNorthernGroundCoverage` 9, `phase35e` 2, `phaseFortressRotation` 2,
  `phaseDrawbridgeAlignment2` 2, `phase34g` 2), all stale pre-C-8.38 geometry.
- **Not automatically verified — the rendered look.** The sandbox has no GPU (SwiftShader, ~2 fps
  in the city hub), so the northern approach still needs the on-device (Android) inspection:
  (a) the now-6.0-wide apron between the Colosseum's rear gateway and the moat's outer bank,
  (b) whether the drawbridge reads as landing on the bank with no stone or water left inside the
  gateway, and (c) the fortress and mound at their new position. Still open from earlier phases:
  the C-8.28 bowl cut, the C-8.29 Store ↔ Workshop junction, and the C-8.31/C-8.33 rear-gate
  stonework. Do not claim visual acceptance without device evidence.
