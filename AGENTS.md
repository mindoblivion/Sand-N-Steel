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

## C-8.69D rear appearance diagnostic (development only)

- Open `/__dev/colosseum-rear` (or `/?devHarness=colosseum-rear`) directly for fixed-camera A/B/C comparisons; it mounts instead of the game and accesses no saves.
- Implementation, reversibility, measured sectors, evidence limits and removal: [.base44/colosseum-rear-diagnostic.md](.base44/colosseum-rear-diagnostic.md). Keep future diagnostic details there rather than enlarging this file.
- `bun test src/components/dev/colosseumRearDiagnostic.test.ts` checks material restoration, unchanged surfaces, production gating and light-rig parity. Production geometry/lighting are untouched; Android acceptance remains pending.

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

## Rear gateway ↔ drawbridge separation (Phase C-8.39 — audit, no production code changed)

- **Reported:** the Colosseum's rear gateway and the drawbridge "still look too connected" on
  device after C-8.38. Audited against the shipped constants and against the running scene:
  **there is no unintended mesh overlap, no interpenetration across the gap and no water at the
  gateway threshold**, so no production geometry was changed. The residual is compositional — the
  two structures are exactly collinear, width-nested, and separated by a *flat, featureless*
  six-metre apron that sits at a single ground level.
- **Measured values (throwaway harness run in the `web` container importing `/app/src` directly,
  so every figure is the rendered value rather than a group origin):**

  | quantity | measured |
  |---|---|
  | Colosseum rear-most rendered stone — gate plinth cut edge (r 19.5 at ±`GATE_HALF`) | Z = −44.308 |
  | — tier-1 cornice / lintel ring spanning the gate (r 19.5, X = 0) | Z = −44.5 |
  | — registered jamb face (r 19.3) | Z = −44.11 |
  | bridge southern-most rendered point (deck **and** both side beams share one south face) | Z = −50.5 |
  | horizontal sand gap — plinth edge → deck / lintel line → deck / jamb line → deck | **6.19 / 6.00 / 6.39** |
  | moat water span on X = 0 (25.0 → 31.0 about −81.5) | Z = −50.5 → −56.5 |
  | water outer shoreline vs the deck's south end | **0.000 — exactly tangent** |
  | water inner shoreline vs the deck's north end | **0.000 — exactly tangent** |
  | mound visible slope foot (X = 0) / flat bank behind the water | −62.001 / 5.50 |
  | gateway floor (walk plane) Y at Z = −42, and deck top Y | 0.00 / 0.16 |
  | sand Y / water Y / deck underside Y / deck top Y | −0.05 / 0.06 / 0.09 / 0.16 |
  | gate clear width / deck width / bridge footprint | 5.40 / 4.00 / 4.22 (ratios 0.741 / 0.781) |

- **Root cause — composition, not geometry.** Three measured properties, none of them a defect:
  (a) the gateway, the drawbridge **and the front portal** are all on X = 0, so a player on the
  axis looks along one line straight through the building; (b) the deck's 4.00 sits inside the
  gate's 5.40 about the same centre, so the portal's rectangle frames the bridge's rectangle
  almost concentrically (0.741 × 0.781); and (c) the whole run is flat — sand −0.05 → water 0.06 →
  deck underside 0.09 → deck top 0.16, a 0.21 spread over 12 units — so the gate floor, the apron,
  the water film and the deck read as one continuous level surface distinguished by colour alone,
  and the six-metre apron foreshortens to a few pixels when viewed from the arena side.
- **What is *not* the cause, measured.** No mesh of either structure reaches the other (closest
  approach 6.19). The side beams and hinge blocks are 6.0–6.5 from the gateway stone — the hinges
  are at the *motte* end (Z = −56.5). The gate's podium/cavea cut and the C-8.33 seals are interior
  and unchanged. The water does **not** reach the threshold: its nearest edge is 6.0 north of the
  gate, so the C-8.36 note about water lapping the gateway describes the pre-C-8.37 centre only.
  One genuine but **invisible** interpenetration was found: each side beam (X ±[1.89, 2.11],
  Y 0.09–0.37) is centred *on* the deck's edge, so it shares a 0.11 × 0.07 × 6.0 volume with the
  deck slab and a coplanar underside at Y = 0.09. That volume is fully enclosed and sits above the
  water, so it cannot produce the reported connection; its correction would widen the bridge
  footprint from ±2.11 to ±2.22 and rebase the C-8.38 corridor sweep for no visual gain.
- **Rendered inspection *was* possible this time** (C-8.36/C-8.37 could not capture it). The whole
  chain runs in the preview browser at ~2 fps through SwiftShader: title → `Play as Guest` → city
  map → fast travel to the Northern Roman Fortress, then walk south with `ArrowDown` and orbit the
  chase camera with a synthetic pointer drag — the camera yaw is decoupled from the player's facing
  and only the drag offset turns it, so the view must be orbited back by ≈π to face the gate. Two
  frames were legible and read: sand → wooden deck spanning the teal water → the Colosseum's rear
  gateway, with the front portal's pediment and portcullis visible *through* the gate. **No GPU
  artifact, overlap or stray band appeared in either frame** — the single-line reading the report
  describes, and still to be confirmed on device.
- **Recommended treatment (NOT implemented — a visual judgement call, not a defect repair).**
  Nothing about the apron, the moat, the group position or the bridge's span is wrong, so the
  options are: (1) **leave it** — a level, collinear run is what a bridge level with the gateway it
  serves actually looks like; (2) give the bridge a visible **abutment** — carry the two existing
  side beams ~0.6 south past the deck's south face so the bridge visibly *lands on* the outer bank
  instead of beginning exactly on the waterline (no new node, no walkability change, but it
  *shortens* the sand gap to ≈5.6, trading against the apron separation C-8.38 bought); or
  (3) revet the moat's outer shoreline with a low travertine kerb band so the water reads as a
  bounded moat and the gate side reads as land (new geometry, must stay clear of the |X| ≤ 2.6
  walking corridor).
- **Verified 2026-10-18** in the dev container: `bun test` → **1033 pass / 0 fail (35 files)**,
  `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**, `bun run lint` (`tsc --noEmit`) →
  exit 0, `bun run build` → exit 0, `git diff --check` → clean. The C-8.38 baseline is intact and
  this note is the only change in the branch.
- **Documentation debt found, deliberately not fixed (this phase changed no production file):**
  `Drawbridge.tsx`'s own comments still carry C-8.37-era figures — `DECK_Z_INNER … // -51.5` where
  the code derives **−56.5**, and `DECK_CENTER_Z … // -48.5` where it derives **−53.5**, plus the
  header's "Z = −51.0 → −51.5 since C-8.37" / "grass rim at Z = −51.34" narrative. Every exported
  value is derived correctly; only the annotations are stale. **Phase C-8.40 corrected every one
  of them**, plus two more inaccuracies in the same file — see its section below.

## Moat shoreline definition (Phase C-8.40 — audit, no production geometry changed)

- **Reported:** the Colosseum's rear gateway and the drawbridge still read as too connected on
  device after C-8.38. C-8.39 explained the residual as composition and named a shoreline kerb as
  one of three possible treatments; C-8.40 measures whether that kerb is justified. **Conclusion:
  it is, and it is the only one of the three options that buys a boundary without spending the
  C-8.38 apron** — but it remains a visual judgement call, so this phase changed no geometry. The
  full proposal is recorded below for a future, explicitly authorized phase.
- **Every figure below is the rendered geometry**, re-derived in a throwaway harness in the `web`
  container (real imports of `terrainHeight` / `Drawbridge` / `NorthernMotte` + a source read of
  `GrandColosseum`), not a group origin and not a collider:

  | quantity | measured |
  |---|---|
  | Colosseum rear-most *rendered* stone — gate plinth cut edge (r 19.5 at ±`GATE_HALF`, X ±2.728) | Z = −44.308 |
  | — gate lintel ring, on the deck's own axis (r 19.5, X = 0) | Z = −44.5 |
  | — registered jamb line (collision only, r 19.3 at ±2.700) | Z = −44.110 |
  | moat water, rendered ring (r 25.0 → 31.0 about −81.5, 48 segments, Y 0.06) | Z −56.5 → −50.5 |
  | deck **and** both side beams, southern face (all three share one plane) | Z = −50.5 |
  | water's outer shoreline vs the deck's south face | 0.000 — tangent |
  | — vs the deck's widest corner (±2.11 → radius 31.072, 3.894°) | corner 0.072 *outside* the arc, i.e. resting on the bank |
  | apron: sand between the waterline and the rear stone (plinth edge / lintel / jamb line) | **6.192 / 6.00 / 6.39** |
  | flat bank behind the water (waterline −56.5 → visible slope foot −62.001) | 5.501 |
  | sand / water / deck underside / deck top | −0.05 / 0.06 / 0.09 / 0.16 |
  | water ring as a polygon — 48-gon chord sagitta at r 31 | 0.0664 |
  | motte surface above the water plane (analytic level 1.543, diagonal) | 24.456 (asset-measured 24.456) |
  | clearance, water's inner shoreline (25.0) → that surface / the 24.666 silhouette | 0.544 / 0.334 |
  | `getTerrainY` and superellipse level across the whole kerb band (Z −50.15 … −50.6) | 0 / 2.46 — far outside the visible slope |
  | nearest collider to the motte centre | `fortress-*` at 9.90 (summit, Y ≥ 4.72); then `motte-wall-*` at 21.75 |
  | colliders inside the proposed band (r 29.4 … 32.85), 109 scanned | **none** |
  | nearest city *structure* to the motte centre | the Colosseum's rear stone — 37.292 (min distance to the drum circle) |

- **Why a kerb is justified, and what it cannot do.** The water is a transparent ring lying flat
  on the sand, so its outer edge is a pure colour transition with **no form**: the measured level
  run is sand −0.05 → water 0.06 → deck underside 0.09 → deck top 0.16, a 0.21 spread over 12
  units. A raised, shadowed stone lip along that edge is the one thing the current composition
  cannot produce. It **cannot** remove the collinearity or the width nesting (only another group
  move, or a bridge redesign, could), so the gateway→bridge reading is improved, not eliminated.
- **Proposed option B (NOT implemented — needs authorization).** A low travertine revetment along
  the moat's **outer** (city-side) shoreline, cut for the bridge:
  - Radial band **r 30.90 → 31.35** (0.45 wide). Its inner face stands 0.10 inside the water
    ring's outer edge — 0.034 more than the 48-gon's 0.0664 chord sagitta — so the water's own
    hard edge is always hidden under the stone and **no sand sliver can appear between water and
    kerb at any segment alignment**.
  - Vertical band **Y −0.10 → 0.14**: 0.05 buried below the sand plane (−0.05) so no gap or
    z-fight is possible; 0.19 exposed above the sand; 0.08 of freeboard above the water; 0.02
    below the deck top, so the bridge stays the highest walking plane. No face is coplanar with
    the sand, the water or the deck.
  - **Gap |X| ≤ `GATE_HALF_W` = 2.70** (±4.997° about the +Z axis) — the kerb's gap is exactly the
    gate's own 5.40 clear width, the same module the drum is cut to. Clearance to the widest point
    of the bridge (side beams ±2.11) is **0.598**, the same 0.59 the gate jambs leave. The gap is
    mandatory: the deck's corners lie 0.072 *outside* the 31.0 arc, so any band on the waterline
    would otherwise run through the deck's south end.
  - Cost to the apron: 5.842 of clear sand remains between the kerb's south face (−50.15) and the
    Colosseum's rear stone (−44.308), against 6.192 today — **0.35**, where C-8.39's option 2
    (bridge abutment) would have cost 0.6+ and moved the bridge's silhouette.
  - Geometry: three concentric arc bands (outer face + top slab + inner face) plus two end caps =
    **5 meshes, ~312 triangles**, one shared travertine material, no new asset, no dependency, no
    collider, and no change to `getTerrainY`, `MOAT_*`, `DECK_*` or `BRIDGE_*`.
  - Legibility (eye 1.7, 60° vertical FOV, 800 px): the stone reads as a **~35 px band at the gate
    (6.19 away), ~19 px at 10, ~13 px at 14** — the order of the 0.28-high bridge beams that
    already read on device. The full ring minus the gap is 190.1 units of arc, ~98 of it inside
    the ±45° window the apron approach sees.
  - Do **not** revet the *inner* (motte-side) shoreline: its edge (25.0) is only 0.544 from the
    motte's surface where it crosses the water plane (24.456), so a 0.45-wide kerb would run into
    the mound.
- **What the kerb must not be relied on for.** It adds no collider, so the player can still walk
  north at |X| > 2.70 and pass *through* the lip onto the moat — the pre-existing off-bridge
  wading, unchanged here. The natural route (|X| ≤ 2.6 through the gate, deck ±2.11) never touches
  it. Bounding the moat with colliders is a movement change and must be argued on its own.
- **Phase 4 documentation cleanup — the only production file this phase touched.**
  `Drawbridge.tsx`'s comments were corrected against the values its own expressions derive:
  `DECK_Z_INNER` is now annotated −56.5 (was −51.5) and `DECK_CENTER_Z` −53.5 (was −48.5); the
  Alignment-2 narrative's "Z = −51.0 → −51.5 since C-8.37" / "grass rim at Z = −51.34" / "mound
  slope (Z = −57.00)" became `BRIDGE_Z_INNER −56.0 → −56.5` / −56.34 / −62.00; and the "6.00 units
  north of the Colosseum's rear-most stone (its gate lintel at Z = −44.5)" claim (it appeared
  twice) now names the measured rear-most *rendered* stone — the plinth cut edge at −44.308
  (6.192) — with the on-axis lintel (6.00) and the registered jamb line (6.39) stated separately.
  The construction note's "4 meshes" is now 5 (deck + two beams + two hinges). **No exported value
  changed; the diff is comment-only.**
- **Verified 2026-10-18** in the dev container: `bun test` → **1033 pass / 0 fail (35 files)**,
  `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**, `bun run lint` (`tsc --noEmit`) →
  exit 0, `bun run build` → exit 0, `git diff --check` → clean. No new regression suite was added,
  because no geometry changed; the C-8.38 baseline is intact.
- **Not automatically verified / not attempted:** no preview capture this phase — the sandbox city
  hub runs at ~2 fps through SwiftShader (C-8.36 and C-8.37 could not reach the northern approach
  at all; C-8.39's two legible frames remain the only successful ones), so the visual conclusion
  rests on the measured geometry above plus the reported Android behaviour. If a future phase
  implements option B, its suite must pin: the band radii and Y range, the 0.0664 < 0.10 water
  overlap margin, the ±`GATE_HALF_W` gap and its 0.598 clearance to the beam corners, the 5.842
  remaining apron, the absence of any collider in r 29.4 … 32.85, `getTerrainY`/`MOAT_*`/`DECK_*`
  unchanged, and the driven X = 0 route through the gate and across the deck (still collision-free,
  still continuous in elevation).
- **Open device checklist for the northern approach (unchanged, plus this phase's question):**
  (a) the 6.0 apron between the rear gateway and the moat's outer bank; (b) whether the drawbridge
  reads as landing on the bank with no stone or water inside the gateway; (c) the fortress and
  mound at their position; (d) **new:** whether the water's outer edge reads as a bare colour
  transition (the condition a kerb would address). Still open from earlier phases: the C-8.28 bowl
  cut, the C-8.29 Store ↔ Workshop junction, and the C-8.31/C-8.33 rear-gate stonework. Do not
  claim visual acceptance without device evidence.

## Moat shoreline kerb (Phase C-8.41 — implemented)

- **What shipped.** C-8.40's option B, implemented: a low travertine revetment along the moat's
  **outer (city-side) shoreline**, cut for the drawbridge. `NorthernMotte.tsx` gained
  `MoatShorelineKerb` — 5 meshes (top slab + outer face + inner face + two end caps), 312
  triangles, one shared double-sided `MeshStandardMaterial` built from `ROMAN_PALETTE.travertineDark`
  with the shared `NOISE_TEXTURE` bump — mounted beside `<MoatWater />` inside the existing error
  boundary. No new asset, no new dependency, no collider, and no change to `getTerrainY`, `MOAT_*`,
  `DECK_*`, `BRIDGE_*` or the collision registry. The phase's files: `NorthernMotte.tsx` (the kerb),
  `src/utils/phaseC8_41.test.ts` (new suite) and this document.
- **Final geometry.** Radial band `KERB_INNER_RADIUS` **30.90** → `KERB_OUTER_RADIUS` **31.35**
  (0.45 wide): the inner face stands 0.10 inside the water ring's 31.0 outer edge — 0.034 more than
  the 48-gon's 0.0664 chord sagitta — so the water's hard edge is always hidden under the stone and
  no sand sliver can open at any segment alignment; the stone's own chords dip only to
  `KERB_INNER_RADIUS_TIGHT` = 30.8338, still 0.0998 inside the water's 30.9336 chord minimum.
  Vertical band `KERB_BASE_Y` **−0.10** → `KERB_TOP_Y` **0.14** (0.24 tall): 0.05 buried below the
  sand plane (−0.05), 0.19 exposed, 0.08 of freeboard over the water (0.06), 0.02 under the deck top
  (0.16), so no face is coplanar with the sand, the water or the deck. Both cylinder faces and the
  slab's rim share the water ring's own 48-segment module starting from the same edge, so they join
  with no seam.
- **The opening, and why its angle differs from the audit's ±4.997°.** The audit derived the gap at
  the *shoreline* (`asin(2.7 / 31.0)` = 4.997°), which — measured at the band's inner face — pinches
  the opening to **2.687**, i.e. 0.013 *narrower* than the 2.70 gate it copies. The shipped
  derivation is taken at the band's tightest inner radius instead,
  `KERB_GAP_HALF_ANGLE = asin(2.70 / 30.8338)` = **5.0236°**, which makes `|X| ≥ 2.70` a property of
  every stone point rather than of the vertices alone: 5.4009 at the tightest point and 2.7452 at
  the outer face's corner. The clearance to the widest rendered bridge footprint (the side beams'
  outer faces, ±2.11) grows from the audit's 0.598 to **0.6127** measured perpendicular to the
  gap's end plane — and is **0.59** in X against the beams themselves, the same margin the gate
  jambs leave. Each end cap's face lies *on* that radial plane and runs back into the band by
  `KERB_CAP_THICKNESS` (0.10), so the two cannot part at any segment alignment; the whole
  revetment mirrors onto itself about X = 0 to floating-point precision.
- **The bridge still fits through the opening, measured.** The worst point of the bridge's own
  footprint is the side beam's outer face where it meets the band's inner edge —
  `asin(2.11 / 30.9)` = **3.9155°**, the analytic bound over the whole footprint (the deck's corner
  is 3.8938°, at the same X but further out radially, hence closer to the axis). Against the gap's
  5.0236° that leaves **1.1081°** of angular margin, a 0.05 grid over the footprint (deck plus both
  beams, |x| ≤ 2.11, Z −56.5 → −50.5) finds nothing worse, and no kerb vertex lies inside the
  bridge's box.
- **Cost, and what did not move.** 5.842 of clear sand remains between the kerb's south face
  (−50.15) and the Colosseum's rear-most *rendered* stone (−44.308), against 6.192 before — **0.35**,
  still above the 5.0 C-8.38 apron rule (6.0 against the on-axis lintel at −44.5). The deck's south
  face stays 0.35 inside the kerb's outer face, so the stone reaches *under* the landing instead of
  standing in front of it, and the bridge stays the highest walking plane. `MOTTE_CENTER_Z`
  (−81.5), the moat's 25.0 / 31.0 radii, the water elevation 0.06, the deck's span and Y values, the
  six-metre apron, `getTerrainY` and the entire collision registry (109 colliders, 46 `colo-*`, both
  C-8.33 `colo-gateseal-l/r` seals) are exactly what C-8.38 left; the designed X = 0 walk through the
  gate and across the deck is *driven* with the real resolver in the suite and still reaches the same
  north wall at −90.82, collision-free at every step.
- **Regression suite: `src/utils/phaseC8_41.test.ts`** — 39 tests across 11 sections: §A the band's
  dimensions and the restated-not-imported 2.70; §B the *shipped* mesh rebuilt from the component's
  own exported geometry arguments (5 meshes, 312 triangles, one shared double-sided travertine
  material, the water ring's 48-segment module); §C the shoreline join (the water still the C-8.36
  complete annulus, sagitta 0.0664 < the 0.10 overlap, the built inner face never reaching the
  water's chord minimum); §D the opening — symmetry, `|X| ≥ 2.70` everywhere, and the whole bridge
  footprint inside the gap; §E the clearance (0.6127 against the audit's 0.598, plus a full 3-D grid
  sweep of the two rendered volumes); §F vertical clearances and the C-8.36 water still continuous
  beneath the deck; §G the apron cost and the landing; §H no new collision geometry (nothing in
  r 29.4 … 32.85, 109 colliders unchanged, the kerb module importing nothing from the collision
  system, the driven route re-checked step by step); §I the C-8.38 baseline and its no-literal
  guard; §J the C-8.33 seals, the fortress derivation and `getTerrainY`; §K controls — the audit's
  shoreline derivation, a shallower inner face, a gap at the deck's own width and a coplanar Y band
  all fail the rules above, so the checks are shown to be sensitive to the values they pin.
- **Harness corrections this phase — no expected geometry changed.** (1) §C's built inner-face
  radius was checked at precision 6 against positions held in a `Float32Array`, where a 30.9 radius
  carries up to a float32 half-ulp of error (2⁻¹⁹/2 = 9.54e-7); the built face measures
  30.90000072 (7.22e-7 over). It now uses the suite's own precision 5 for built radii **plus an
  explicit `diff < 1e-6` bound**, which states the real tolerance instead of an arbitrary one.
  (2) §D pinned the grid's worst footprint angle at 3.917° — a value nothing supports, since the
  analytic bound for the footprint is 3.9155° and the grid's own worst sample is 3.9127° (±2.11,
  z − c 30.85, r 30.9221) — and then compared the worst angle against `KERB_GAP_HALF_ANGLE` at
  precision 2, a comparison that could not hold (0.0683 vs 0.0877 rad). Both were replaced by four
  supported checks: the analytic bound (3.9155°), the measured sample (3.9127°),
  `worstAngle ≤ beamCornerAngle`, and the 1.1081° margin to the gap's edge. No assertion was
  removed or weakened — two replaced expectations became four. (3) The new suite also introduced a
  type error: the triangle-count reduction concatenated `BoxGeometry` onto a
  `(Ring | Cylinder)Geometry[]` array, so `bun run lint` (`tsc --noEmit`) failed with TS2769; the
  array is now typed `THREE.BufferGeometry[]` and lint is back to exit 0. **No production geometry
  was changed by any of these corrections** — the kerb implementation the C-8.40 audit proposed is
  the one that shipped.
- **Verified 2026-10-18** in the dev container: `bun test` → **1072 pass / 0 fail (36 files)**,
  `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**, `bun run lint` (`tsc --noEmit`) →
  exit 0, `bun run build` → exit 0, `git diff --check` → clean. The validation's starting point was
  37 pass / 2 fail in the new suite plus the lint failure above.
- **Not automatically verified — the rendered look, and this is a device question.** The sandbox has
  no GPU (SwiftShader, ~2 fps in the city hub; C-8.36, C-8.37 and C-8.38 could not capture the
  northern approach at all, and C-8.39's two frames are the only legible ones), so the kerb's
  appearance is **unconfirmed here**. Android checklist for the northern approach, now including the
  kerb: (a) does the water's outer edge read as a **bounded moat** — a shadowed travertine lip
  rather than a bare colour transition — from the gateway approach; (b) does the lip stay **below**
  the bridge's silhouette and clear of the deck at the opening, with no stone or water inside the
  gateway; (c) is the bridge still the highest plane at the landing (kerb top 0.14 vs deck top 0.16);
  (d) does the lip hold at the 48-gon's chords — no sand sliver between water and stone at any
  viewing angle; (e) does the 5.842 apron still read as land between the gateway and the kerb.
  Still open from earlier phases: the C-8.28 bowl cut, the C-8.29 Store ↔ Workshop junction, and the
  C-8.31/C-8.33 rear-gate stonework. Do not claim visual acceptance without device evidence.

## Tavern & Caravanserai collider reconciliation (Phase C-8.43 — implemented)

- **The defect was a registry/render mismatch on two building rectangles, nothing else.** C-8.42's
  read-only audit flagged `city-tavern` and `caravanserai` as wider than the plinths they stand for.
  Re-derived from the component sources: `BuildingFoundation` builds its lower ground step as
  `size[0] + projection * 2` (`src/components/3d/city/BuildingFoundation.tsx`), and both buildings
  are unrotated roots with `projection = 0.25` — CityTavern `size [8.4, 7.2]` at `[-16, 0, 14]` →
  **8.9 × 7.7**; CaravanseraiInn `size [8.6, 7.6]` at `[16, 0, 14]` → **9.1 × 8.1**. The registry
  carried 9.4 and 9.6, i.e. **0.5 wider than the rendered lower step on each**, and the tavern's
  own registry comment (`foundation [8.4, 7.2], proj 0.25 → 9.4 × 7.7`) contradicted its arithmetic
  by the same 0.5 — a transcription error, not a design decision.
- **The fix is two widths in `collisionShapes.ts`.** `city-tavern` 9.4 → **8.9**, `caravanserai`
  9.6 → **9.1**. Both centres (−16, 14) / (16, 14) and both depths (7.7 / 8.1) are untouched, so the
  rectangles only lose the outer 0.25 on each X side. No building moved, no mesh changed, no
  collider was added or removed and no other collider was touched — the registry still holds 109
  colliders (30 rectangles) with unique ids, and the six pre-existing rect/rect overlaps are the
  Ishtar composite and the fortress wall chain, unchanged.
- **The Smithing Forge's 9.5 width is deliberately exempt and stays.** Its registered rectangle is
  intentionally narrower than the 10.0 its C-8.19 dimensions derive, because C-8.10 narrowed it to
  align with the wall face at X ≈ 22.75 and open the Forge ↔ Armor & Leather Workshop passage.
  The C-8.43 comment now states this explicitly so a future audit does not "correct" it.
- **Measured before → after, every neighbour of the two buildings (2-D rect separation in world
  units; "walkable" = wider than the 0.80 player diameter):** tavern ↔ roman-shrine 3.150 → 3.400,
  ↔ ishtar-tower-l 3.219 → 3.256, ↔ bathhouse 3.875 → 3.965, ↔ bounty-hall 5.150 (unchanged, no
  X overlap), ↔ ishtar-central 5.278 → 5.467; caravanserai ↔ stable 1.450 → 1.700,
  ↔ ishtar-tower-r 3.010 → 3.041, ↔ smithing-forge 3.350 (unchanged), ↔ ishtar-central
  5.071 → 5.263, ↔ armor-workshop 6.641 → 6.756. **Every gap widened or held; no gap changed
  across the 0.80 threshold in either direction**, so no route, corridor or dead pocket is created
  or closed. The nearest-neighbour pairs were already walkable before the change (tavern ↔ shrine
  3.150; caravanserai ↔ stable 1.450), so the reconciliation only widens existing passages.
- **Arrival clearances improved, as expected, and no arrival conflicts appear.** The fast-travel
  arrivals are unchanged (`tavern [-10, 14]`, `caravanserai [10, 14]`); their separation from the
  building edge grows **1.300 → 1.550** and **1.200 → 1.450**, and both remain outside the collider
  by more than the 0.4 player radius (collides@R: false → false). The `cityCollisions.ts` arrival
  rationale comments, which quoted the old east/west edges (x = −11.3 / 11.2), now quote the new
  ones (−11.55 / 11.45) and the derived offsets.
- **Rebased, not weakened: five test sites that pinned the old widths.**
  `phaseC8_19b.test.ts` (caravanserai `hw: 4.8` → `9.1 / 2`), `phaseC8_21.test.ts`,
  `phaseC8_22.test.ts` (both buildings), `phaseC8_23.test.ts` and `phaseC8_24.test.ts`
  (city-tavern). Each is a scope guard from its own phase ("these neighbours are unchanged"), so
  the pinned value moved to the new canonical width and the depths stayed as literal divisors.
  A repo-wide sweep of `src/`, `scripts/`, `README.md` and this file finds no remaining reference to
  `9.4 × 7.7`, `9.6 × 8.1`, `hw: 4.8` or `9.4 / 2` / `9.6 / 2` — no test or doc still expects the
  old geometry. The C-8.19b forge-north-face test is depth-based (3.35) and needed no change.
- **Scope guard — everything else is untouched.** No movement formula, collision padding, terrain
  value, fast-travel destination, building position or prop collider changed; the C-8.33
  `colo-gateseal-l/r` seals, the C-8.36 water ring, the C-8.38 `MOTTE_CENTER_Z` (−81.5), the C-8.41
  kerb constants and the C-8.31 rear gate are exactly as they were (their suites re-run green).
- **Verified 2026-10-18** in the dev container: focused
  `bun test src/utils/phaseC8_{19b,21,22,23,24,41}.test.ts` → **177 pass / 0 fail** (6 files);
  `bun test` → **1072 pass / 0 fail (36 files)** (the C-8.41 count, unchanged);
  `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0; `git diff --check` → clean. The before/after clearance table
  above was produced by a throwaway harness kept in `/tmp`, importing the shipped registry.
- **Not automatically verified — nothing visible to verify.** A collider is invisible; this phase
  changes no rendered pixel, so there is no appearance to accept here and no new Android item.
  The C-8.41 kerb, C-8.38 northern approach, C-8.28 bowl cut, C-8.29 junction and C-8.31/C-8.33
  rear-gate device inspections remain open exactly as before. Do not claim device acceptance.

## Training Hall collider (Phase C-8.45 — implemented)

- **The defect was the one confirmed omission from C-8.44's registry-vs-render audit: the Training
  Hall had no collider at all,** so the player could walk straight through its walls. Every other
  rendered city building was already registered; this was the only one missing.
- **The measurement, re-derived from source (it matches the audit).** `TrainingYard.tsx` mounts
  `<TrainingHall />` inside its root group `[-18, 0, 0]`; the hall's own group is
  `[-12.35, 0, 3.00]` with yaw `+π/2`, so its **world root is `[-30.35, 0, 3.00]`**.
  `BuildingFoundation`'s lower ground step is `(HALL_W + 2 × projection) × (HALL_D + 2 × projection)`
  = `(7 + 0.5) × (2.2 + 0.5)` = **7.5 × 2.7** in component-local X × Z, and the π/2 yaw swaps the
  axes, giving the world footprint **X `[-31.70, -29.00]`, Z `[-0.75, 6.75]`**. The veranda, its
  posts and the equipment under it extend past that on world +X (to X ≈ −26.26), exactly as every
  other building's props do — they are not collidable here either.
- **The fix is one rectangle in `collisionShapes.ts`**, using the file's existing convention:
  `RECT('training-hall', -30.35, 3.00, 2.7, 7.5)`. No rendered geometry, transform, orientation or
  surrounding structure changed, and no other collider moved — the registry goes from **109 to 110
  colliders (30 → 31 rectangles)**. Only `phaseC8_41.test.ts`'s absolute count pin (109, "the count
  C-8.38 left") was rebased, with a comment naming this phase as the addition; every other count
  assertion in the repo is relative (`phaseC8_27`'s delta constants, `phaseC8_33`'s per-prefix
  counts, `scripts/collisionTests.ts`'s `> 50`).
- **The hall is solid, measured with the real `resolveCityMovement`** (`phaseC8_45.test.ts` §B, a
  3.8 u/s walk at 0.1 s steps = 0.38 per step): west-bound from the east stops at X ≥ −28.60
  (east face −29.00 + the 0.40 player radius); east-bound from the west stops at X ≤ −32.10;
  south-bound from the north stops at Z ≥ 7.15; north-bound out of the medical corridor stops at
  Z ≤ −1.15. No step of any of those walks enters the footprint, so neither principal axis can be
  crossed. §C confirms the hall is still walkable *around*: the west side runs from the corridor
  past its north end, and the north side runs across to the −35 boundary.
- **The Arena Medical House ↔ Training Hall passage stays traversable end to end.** The corridor's
  plan gap is **1.5** (medical north face −2.25 → hall south face −0.75), so a 0.4-radius player
  keeps 0.35 clear of each face and has a **0.70** band of usable centres — the resolver agrees
  (clear at the centre line, blocked within a radius of either face). §D drives a *complete* route:
  entering from the east at (−25.5, −1.5), holding the corridor centre line, crossing the narrowest
  section (7 steps inside the hall's own X band) and exiting at the −35 boundary, **collision-free
  at every step**. Nothing was widened, no building moved and no test was weakened to make it pass.
- **Regression suite: `src/utils/phaseC8_45.test.ts`** — 32 tests across 8 sections: §A the
  registry entry (the footprint re-derived from the two component sources and compared to the
  rectangle, a unique id, 110 colliders / 31 rectangles, and a 25 × 25 interior sweep showing no
  other collider covers the footprint); §B the four blocking walks plus the axis-crossing check;
  §C the two go-around walks; §D the passage; §E the yard's 14 `yard-wall` segments, the two
  `street-wall` rects, the two return segments, the east entrance gap and a walk in through it;
  §F all 20 hub triggers reachable and all 20 arrivals collision-free with a clear step out;
  §G preservation (the C-8.43 tavern 8.9 × 7.7 / caravanserai 9.1 × 8.1, the Forge's deliberate
  9.5, `arena-medical`, the C-8.33 seal endpoints recomputed from the Colosseum constants, the 46
  `colo-*` ids, `MOTTE_CENTER_Z` −81.5 with the 20 `motte-wall` chords and 5 `fortress-*` rects,
  the C-8.41 `KERB_*` values, the C-8.36 water ring and the drawbridge deck); §H the control — with
  `training-hall` spliced out the same walk runs clean through the building to the boundary, which
  is the C-8.44 defect, and the registry restores intact.
- **Verified 2026-10-18** in the dev container: focused
  `bun test src/utils/phaseC8_45.test.ts src/utils/phaseC8_41.test.ts` → **71 pass / 0 fail**;
  `bun test` → **1104 pass / 0 fail (37 files)** (C-8.43 left 1072 / 36; the delta is this suite);
  `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0; `git diff --check` → clean. The dev server
  still serves the shell and the changed module (HTTP 200, the new `RECT` present in the
  transformed output).
- **Not automatically verified — nothing visible to verify.** A collider is invisible: this phase
  changes no rendered pixel, so there is no appearance to accept and no new Android item. Movement
  was verified by driving the shipped `resolveCityMovement`, not in the 3D hub (SwiftShader, ~2 fps).
  The C-8.41 kerb, C-8.38 northern approach, C-8.28 bowl cut, C-8.29 junction and C-8.31/C-8.33
  rear-gate device inspections remain open exactly as before. Do not claim device acceptance.

## Hub interaction reachability (Phase C-8.46 audit / C-8.47 implemented)

- **The defect was reachability, not selection alone: eight city buildings could not raise their own
  interaction prompt from the entrance they are entered by.** A hub trigger is a disc of radius `r`
  centred on its *building root*, and `getNearbyHubLocation` (called every frame by `CityHubScene`)
  answers when the player's own centre is inside that disc — so the usable part of a trigger is the
  ring outside the building's collider, and the closest a 0.4-radius player can stand on the entrance
  side is `(collider half-extent along the approach axis) + 0.40`. For eight hubs that distance was at
  or beyond `r`, so their own doorway produced no prompt at all.

- **C-8.46 was the read-only audit that found it** (no production file changed): all 20 hubs' approach
  standoffs re-derived from each building's own component source plus the shipped registry, all 20
  fast-travel arrivals, and a walk out of each arrival driven with the real `resolveCityMovement` at
  the shipped 3.8 u/s. Measured, the eight were:

  | hub | collider | entrance face | closest standable | old r | old band |
  |---|---|---|---|---|---|
  | Smithing Forge | 9.5 × 8.0 | west (local −4.75) | 4.75 + 0.40 = 5.15 | 4.50 | −0.65 |
  | Bazaar & General Store | 7.7 × 6.3 | west (awning −2.8) | 3.85 + 0.40 = 4.25 | 4.50 | +0.25 |
  | Golden Palm Tavern | 8.9 × 7.7 | east (local +4.22) | 4.45 + 0.40 = 4.85 | 4.50 | −0.35 |
  | Caravanserai Inn | 9.1 × 8.1 | west (portico −4.32) | 4.55 + 0.40 = 4.95 | 4.75 | −0.20 |
  | Elite Merchant House | 7.7 × 7.0 | west (portico −3.62) | 3.85 + 0.40 = 4.25 | 4.50 | +0.25 |
  | Imperial Stable | 7.5 × 7.7 | north (open front) | 3.85 + 0.40 = 4.25 | 4.50 | +0.25 |
  | Gladiator Academy | 7.7 × 7.3 | west (portico −3.62) | 3.85 + 0.40 = 4.25 | 4.50 | +0.25 |
  | Public Bathhouse | 8.0 × 7.0 | north (portico −3.4) | 3.50 + 0.40 = 3.90 | 4.50 | +0.60 |

  The walks out of the Forge's, the Tavern's and the Caravanserai's arrivals raised **nothing** (the
  Forge's stopped at 5.15 from its centre — just outside its disc), and the Academy's raised the
  **Records Library's** prompt instead, because that disc is entered before the academy's along the
  walk.

- **The fix has two parts, both in `cityCollisions.ts`.**

  (1) **The eight radii**, each the smallest 0.25 step that leaves a usable band on the entrance side
  at least the player's own diameter deep — `radius ≥ standoff + 0.80`:

  | hub | old → new | band at the doorway |
  |---|---|---|
  | Smithing Forge | 4.50 → **6.00** | 0.85 |
  | Bazaar & General Store | 4.50 → **5.25** | 1.00 |
  | Golden Palm Tavern | 4.50 → **5.75** | 0.90 |
  | Caravanserai Inn | 4.75 → **5.75** | 0.80 |
  | Elite Merchant House | 4.50 → **5.25** | 1.00 |
  | Imperial Stable | 4.50 → **5.25** | 1.00 |
  | Gladiator Academy | 4.50 → **5.25** | 1.00 |
  | Public Bathhouse | 4.50 → **4.75** | 0.85 |

  No centre moved, no collider was touched and no movement constant (`PLAYER_RADIUS`, `BOUNDARY_X`,
  `BOUNDARY_Z_MAX`) changed. The Forge's arrival `[11.5, 2.6]` stays deliberately **0.50 outside** the
  new disc, so the prompt appears on the walk in (8 steps) rather than on the teleport itself.

  (2) **The lookup rule: nearest hub, not first match.** A radius large enough to reach a 9.5 × 8.0
  forge's west doorway at 5.15 also reaches 6.0 out on every other side, so the eight corrected radii
  make **nine pairs of discs overlap** — `smithing_forge` ↔ `general_store` 8.59, ↔ `caravanserai`
  11.57, ↔ `armor_workshop` 10.32; `general_store` ↔ `merchant_house` 8.94, ↔ `armor_workshop` 8.63;
  `caravanserai` ↔ `stable` 10.05; `merchant_house` ↔ `doctore_house` 6.21; `gladiator_academy` ↔
  `doctore_house` 8.50, ↔ `records_house` 7.98. The previous first-match-in-list-order rule answered
  with the *earlier* hub across every one of those lenses; `getNearbyHubLocation` now returns the
  **nearest** containing hub, an exact tie going to the earlier `HUB_LOCATIONS` entry so the answer
  stays deterministic. Measured: a walkable point in the alley between the Gladiator Academy and the
  Doctore House — the Doctore House 3.27 away, the academy 5.24 — used to say "Enter Ludus Academy"
  (297 cells of that one lens alone, 300+ across the city) and now answers the Doctore House. No lens
  covers another hub's doorway or arrival, so every door and every fast-travel arrival still answers
  its own building.

- **What did not move:** every hub centre, every fast-travel arrival, every collider (still **110
  colliders, 31 rectangles**), the two C-8.43 widths, the Forge's deliberate 9.5, the Training Hall
  rectangle and its 1.5-wide passage, `MOTTE_CENTER_Z` (−81.5), the C-8.33 seals, the C-8.36 water and
  the C-8.41 `KERB_*` values. Radii are interaction-only: they add no collision, and a point on each
  new rim is collision-free exactly as the old rim was. The twelve unaffected hubs keep their radii
  (`northern_fortress` 10.0 included) and still answer at their own entrance.

- **Regression suite: `src/utils/phaseC8_47.test.ts`** — 36 tests across 7 sections: §A the
  configuration (the eight new radii, the twelve unchanged ones, the untouched positions, and the
  standoff rule itself shown to be tight — each radius the smallest 0.25 step over `standoff + 0.80`);
  §B each affected hub enterable from its own entrance, driven from its arrival with the shipped
  resolver; §C the Smithing Forge explicitly, with a control that reproduces the pre-fix silence at
  4.50; §D the nine overlaps at their measured centre distances, nearest-hub selection at every
  arrival and entrance, the order-based tie-break (the Store ↔ Merchant House midpoint, an exact float
  tie) and the hijacked alley above; §E the twelve unaffected hubs; §F all 20 triggers reachable and
  all 20 arrivals collision-free, with clearance, inside the boundary and free to step out; §G the
  scope guard — registry count, movement constants, the C-8.45 hall and its passage, the C-8.43
  widths, the Forge's 9.5, the C-8.33 seals, the C-8.38 motte centre, the C-8.41 kerb and the
  drawbridge, all re-checked.

- **Rebased, not weakened: two sites that pinned the old rules.** `phaseC8_12.test.ts`'s Merchant House
  radius pin moved `4.5 (C-8.12) → 5.25 (C-8.47)`, and `scripts/collisionTests.ts`'s two Phase-31F
  caravanserai assertions were re-derived from the C-8.47 radii.

- **Verified 2026-10-18** in the dev container: `bun test` → **1140 pass / 0 fail (38 files)** (C-8.45
  left 1104 / 37; the delta is this suite); `bun run scripts/collisionTests.ts` → **122 passed, 0
  failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0; `git diff --check` →
  clean. The dev server still serves the shell (`HTTP 200`).

- **Not automatically verified — the prompt in the running hub.** Reachability and selection were
  verified by driving the shipped `resolveCityMovement` and the shipped `getNearbyHubLocation` (the
  method every movement phase here uses), not by standing in the 3D city: the sandbox has no GPU
  (SwiftShader, ~2 fps), and the change moves no rendered pixel, so there is no appearance to accept
  and no new Android item. The open device checklist is unchanged — the C-8.41 kerb, C-8.38 northern
  approach, C-8.28 bowl cut, C-8.29 junction and C-8.31/C-8.33 rear-gate inspections. Do not claim
  device acceptance.

## Imperial Stable roof alignment (Phase C-8.49 — implemented)

- **The defect was the one real geometric finding of the C-8.48 rooftop audit: the Stable's timber
  box closed only 6.6 of the 7.0-unit depth its roof assembly already spanned**, so every timber face
  stopped **0.20** short of the gable plane on all four sides — the rear wall's outer face at +3.3
  against the roof's +3.5, the two front posts at −3.3 against −3.5, and both 6.6-deep side walls at
  ±3.3. `Stable.tsx`'s travertine base ring (`[6.8, 0.8, 7.0]`), its eave cornice (`size=[6.8, 7.0]`)
  and its corner quoins (`buildingSize=[6.8, 7.0]`) had always used the full 7.0, so the roof and the
  stonework agreed and only the oak walls were short. The fix is the smallest correction that closes
  it: the box grows 6.6 → 7.0 **about its existing Z = 0 centreline**, outward on each side.

  | element | before | after |
  |---|---|---|
  | rear wall (0.4 thick, 6.8 wide) | faces Z [2.9, 3.3] | faces Z **[3.1, 3.5]** |
  | front posts (0.4 square) | faces Z [−3.3, −2.9] | faces Z **[−3.5, −3.1]** |
  | side walls (0.4 × 6.6 → 0.4 × **7.0**) | ±3.3 | **±3.5** |
  | timber box depth / centreline | 6.6 / Z 0 | **7.0 / Z 0** |
  | gap to the roof gable plane | 0.20 per side | **0.00** |

- **What did not move: nothing else.** Each wall keeps its thickness, width, height, Y position,
  material and X position; the roof keeps its `width` 6.8, `depth` 7.0, `height` 1.3,
  `eaveOverhang` 0.35, `ridgeAlong="z"`, transform `[0, 3.4, 0]` and all three colours; the
  foundation, cornice, quoins, base ring, paddock, props and the building's own position `[26, 0, 15]`
  are untouched. The wall faces land **coplanar** with the gable line (±3.5) and 0.02 *inside* the
  tympanum panels (placed `depth / 2 + 0.02`), so the roof — including its 0.35 eave overhang, which
  still projects exactly 0.35 past every wall face — is unchanged; this closes the slit rather than
  enlarging or redesigning anything. No shared primitive, neighbouring building, collision rectangle,
  hub radius or fast-travel entry was edited.
- **Collision, hub and neighbour figures, all re-measured rather than assumed.** `stable` is still
  `7.5 × 7.7` at `[26, 15]` — exactly `BuildingFoundation`'s lower step `(7.0 + 2 × 0.25) ×
  (7.2 + 2 × 0.25)` — and the deepest timber face now sits 0.35 *inside* it, so the walls stayed
  strictly inside the collider the player is stopped by. The hub keeps `radius 5.25` at `[26, 0, 15]`
  and the arrival keeps `[26, 10]` (C-8.47; 1.15 clear of the collider face, 0.80+ band at the door).
  The **Caravanserai Inn clearance is 1.55** measured roof eave to roof eave across X (the Inn's eave
  at 20.70 against the Stable's at 22.25 — 16 + 8.6/2 + 0.4 vs 26 − 6.8/2 − 0.35); the collider-to-
  collider figure stays the C-8.43 **1.70**. This phase changes no X extent at all, so neither can
  have moved — note the request quoted 1.55, which is the *rendered* roof-eave clearance, not the
  collider gap; both are pinned in the suite.
- **Regression suite: `src/utils/phaseC8_49.test.ts`** — 33 tests across 8 sections, every value
  derived from the sources or the shipped tables (a structural parser reads the meshes' real box
  args/positions, the post map's own geometry and each shared primitive's props): §A the fix itself
  (side walls 7.0 deep at ±3.2 and Z 0, the rear wall's outer face at +3.5 with its inner face still
  at 3.1, the posts at −3.5/−3.1, the 7.0 box centred on Z 0, no 6.6 box left anywhere in the file,
  and X/height/thickness/root unchanged); §B alignment with the roof envelope (every wall face within
  0.02 of ±`depth/2`, none past the tympanum panels, flush with the base ring and the quoin corner
  planes, the overhang still exactly `eaveOverhang`, and the shared primitive's own eave/slope/tile
  expressions still the live ones); §C the posts against the building faces and the mirrored 7.0 box;
  §D the rendered footprint against the collider (the collider re-derived from the foundation
  formula, every rendered X/Z extent inside it, its widest element exactly on the line, and ≥ 0.3 of
  margin around the walls); §E the Caravanserai (the 1.55 rendered clearance, the 1.70 collider gap,
  disjoint X bands, and the Inn's own root/foundation/cornice pinned); §F the C-8.47 radius, the
  standoff rule, the arrival and the driven `getNearbyHubLocation([26, 0, 10]) === 'stable'`; §G the
  scope guard (110 colliders / 31 rectangles with unique ids, `PLAYER_RADIUS`, the Workshop's root and
  rectangle, the primitives still the live source, the paddock and props); §H the control — the
  pre-fix 6.6 / +3.1 / −3.1 numbers are shown to miss the plane by 0.20, ten times the 0.02 tolerance,
  while the shipped ones are exact.
- **Verified 2026-10-18** in the dev container: focused
  `bun test src/utils/phaseC8_{18,19,19b,21,22,29,49}.test.ts` → **197 pass / 0 fail (7 files)**;
  `bun test` → **1173 pass / 0 fail (39 files)** (C-8.47 left 1140 / 38; the delta is this suite's
  33); `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0; `git diff --check` → clean. `Stable.tsx` is
  the only production file this phase touched.
- **Not automatically verified — the rendered gap, and it is a device question.** The sandbox has no
  GPU (SwiftShader, ~2 fps in the city hub) and at the mobile preview width the building is a small
  part of the frame, so a 0.20-unit slit — and its closure — is below the resolution this environment
  can settle. The geometry above is measured and pinned, not seen. **Android visual acceptance of the
  four closed wall-to-gable junctions (front, rear and both side walls) therefore remains pending
  until the roof is checked in the device preview**, together with the still-open C-8.41 kerb, C-8.38
  northern approach, C-8.28 bowl cut, C-8.29 junction and C-8.31/C-8.33 rear-gate checks. Do not
  claim device acceptance. The second C-8.48 finding — the Armor & Leather Workshop's lean-to standing
  0.41 above its support — was **not** touched by this phase.

## General Store awning seat (Phase C-8.51 — implemented)

- **The defect was the C-8.50 rooftop audit's second finding and it was measured, not assumed: the
  bazaar's crimson canvas awning stood 0.4841 INSIDE both of its timber support posts.** The awning
  group sits at local `[-2.8, 2.6, 0]` with `rotation={[0, 0, 0.2]}`, and the canopy box
  `[2.8, 0.08, 5.2]` is mounted at the group's own origin — so the group's Y is *not* the canopy's
  height: the 0.2-rad pitch about Z puts the canopy's **underside 0.2841 below the group origin at
  the posts' own axis** (local X −4.0). Re-derived from the component's real transforms (not taken
  from the audit's rounded figures):
  `underside = groupY + (postX − groupX)·tan 0.2 − (0.04 / cos 0.2)` = **2.3159 at group Y 2.6**,
  against post tops of **2.8** (`POST_Y` 1.4 + `POST_H` 2.8 / 2 — the posts stand from the ground
  to 2.8).

- **The fix is one number, in the awning group only: Y 2.6 → 3.0841** (= 2.8 + 0.2841), the lift
  that puts the underside exactly on the post tops. Measured before → after, in world space (root
  `[22, 0, −5]`):

  | quantity | before | after |
  |---|---|---|
  | canopy underside at the posts' axis (world X 18.0) | 2.3159 | **2.800034** |
  | post-top intersection | −0.4841 | **+0.000034** (a seat, 0.00003 of clearance) |
  | canopy lowest corner (outer, bottom) | 2.2827 | **2.7668** |
  | canopy highest corner (at the wall, top) | 2.9173 | **3.4014** |
  | underside over the amphora stack's west edge (world X 18.166) | 2.3496 | **2.8337** |
  | lantern bottom / top | 2.925 / 3.475 | **3.4091 / 3.9591** |
  | lantern clearance above the canvas (its east rim) | 0.4423 | **0.4423** (unchanged) |

- **The seat is at the post's own axis, which is the best a flat-topped post can do under a pitched
  canopy.** The tilt runs `2 × 0.12 × tan 0.2` = **0.0487** across the post's 0.24-wide top face, so
  the underside sits ±0.0243 at the top's two edges and exactly on it at the axis — equal and
  opposite, and centred, because the axis is that face's own centre. The requested 0.02 tolerance is
  therefore a statement about the post's axis, which is how the audit measured it. The canopy's own
  wind flutter (unchanged: ±0.01 pitch about 0.2, ±0.015 roll about X) moves the seating ±0.0126 in
  Y as the pitch trims — still inside the 0.02 — while its roll pivot at the group origin swings the
  canvas at the post line by 2.4·sin(0.015) ≈ 0.036, a pre-existing animation property pinned in the
  suite and not a seating figure.

- **The bazaar lantern rides up with the awning, by the same 0.4841, and that is part of the same
  repair.** The lantern sits directly over the canvas (`[-3.8, 3.2, 1.8]`, bottom disc radius 0.22):
  at group Y 2.6 its bottom face cleared the canopy's top plane by 0.4423, but once the awning is
  seated the un-moved lantern's south-east rim would be **0.0418 inside** the raised canvas. Moving
  it by the awning's own lift keeps the 0.4423 clearance exactly (to machine precision, asserted in
  the suite) and leaves it 0.70 below the eave cornice. Its X and Z transforms are untouched, as is
  every other prop.

- **What did not move: the awning itself, the posts, the wall, the collision registry and the hub.**
  The canopy keeps its box `[2.8, 0.08, 5.2]`, its trim sheet `[2.7, 0.02, 5.1]` at local Y 0.05, its
  `#991b1b` / `#fef08a` materials and its pitch (`rotation={[0, 0, 0.2]}`); the group's X (−2.8) and
  Z (0) are unchanged, so the awning's horizontal footprint, its wall attachment and its outward
  projection over the market are exactly what they were — it still runs 2.16 into the 4.8-high timber
  wall (from X −1.44 back to the wall's east face at +3.6), juts 0.564 past the wall's west face, and
  now sits 1.26 below the eave cornice's underside (4.66) where it was 1.74. The posts are the same
  two tapered cylinders (X −4.0, Z ±2.4, 0.12/0.14 radii, 2.8 high, `#451a03`); the foundation, eave
  cornice, quoins and roof are the ones they were; and `general-store` is still `7.7 × 6.3` at
  `[22, −5]` — exactly `BuildingFoundation`'s lower step — with the hub at `radius 5.25` and the
  arrival `[17, −5]` (the awning has no collider and is above the counter's own table top by more
  than a metre). No shared primitive, neighbouring building, collider, hub radius or movement
  constant changed.

- **Regression suite: `src/utils/phaseC8_51.test.ts`** — 21 tests / 123 assertions across 6 sections,
  all derived (the suite parses the awning group's own position and rotation, the canopy box and its
  local origin, the post map's four literals, the lantern group, the wall box, the cornice/foundation
  props, the counter and its four amphorae from both component sources, and both flutter amplitudes,
  then transforms the canopy's own corners through the group's Z rotation): §A the frame the fix had
  to work in (root, awning transform, canopy/trim, post map, flutter amplitudes and their base); §B
  the seat itself — the underside as a real slope (`tan 0.2`), both post tops within 0.02 and never
  below them, the axis-centred ±0.0243 spread, the posts inside the canopy's X and Z spans, and a
  sweep over the flutter's own pitch trim; §C what was preserved (box, materials, pitch, the 2.16 of
  wall embedment inside the wall's height band, the Z span inside the wall's band, the 0.5+ jutting
  over the market, ≥ 1.0 under the eave cornice, the primitives still the live source); §D no new
  interpenetration (the counter goods re-derived from both sources, the raised canopy's clearance over
  them ≥ 0.4 and greater than before, and the lantern's 0.4423 clearance pinned identical
  before/after plus its 0.5+ margin under the cornice); §E the scope guard (110 colliders / 31
  rectangles with unique ids, the store's rectangle re-derived from the foundation formula,
  `PLAYER_RADIUS`, the awning over the building's own Z band, the hub/arrival and a driven
  `getNearbyHubLocation([17, 0, −5]) === 'general_store'`, the other props' transforms); §F the
  control — the pre-fix 2.6 is shown to miss the post tops by 0.4841 (24× the 0.02 tolerance) while
  the shipped geometry passes the identical check, and the lift is shown to be the minimum the seat
  requires (within 1e-3) with X, Z and the pitch exactly as they were.
- **Rebased, not weakened: one site that pinned the old transform.** `phaseC8_19b.test.ts`'s
  "store-only street furniture is parsed with its real transform" scope guard, which pinned the
  awning group at `[-2.8, 2.6, 0]`, now pins `[-2.8, 3.0841, 0]` with a comment naming this phase; its
  `0.2` pitch, box, post X/Z and every Forge ↔ Store clearance it derives from those parsed values
  are unchanged and still pass. The other suites that read the awning (`phaseC8_21`, `phaseC8_29`)
  take the group's Y from the source and needed no change.
- **Verified 2026-10-18** in the dev container: focused
  `bun test src/utils/phaseC8_51.test.ts` → **21 pass / 0 fail** (123 expect() calls); `bun test` →
  **1194 pass / 0 fail (40 files)** (C-8.49 left 1173 / 39; the delta is this suite's 21);
  `bun run scripts/collisionTests.ts` → **122 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only);
  `git diff --check` → clean. `GeneralStore.tsx` is the only production file this phase touched.
- **Not automatically verified — the rendered junction, and it is a device question.** A
  source-geometry suite proves the canopy's underside now meets the post tops in the component's own
  transforms; it does **not** establish visual acceptance. The sandbox has no GPU (SwiftShader, ~2 fps
  in the city hub) and at the mobile preview width the bazaar is a small part of the frame, so a
  0.48-unit seat correction is below the resolution this environment can settle. **Android preview
  check: view the General Store awning from the front (from the Via Mercatoria side, looking east at
  the bazaar's open front) and from the side (along the wall, so the pitch is visible) and confirm the
  canopy meets both posts with no visible penetration through the post tops and no floating gap —
  i.e. the two post tops read as carrying the canvas, with the stripes and the lantern unchanged.**
  Still open from earlier phases: the C-8.49 wall-to-gable junctions, the C-8.41 kerb, the C-8.38
  northern approach, the C-8.28 bowl cut, the C-8.29 junction and the C-8.31/C-8.33 rear-gate checks.
  Do not claim device acceptance. The C-8.48 audit's third finding — the Armor & Leather Workshop's
  lean-to standing 0.41 above its support — was **not** touched by this phase either.

## Armor & Leather Workshop lean-to bearing (Phase C-8.53 — implemented)

- **The defect was the C-8.48/C-8.50 rooftop audit's third finding, re-measured here from the
  shipped transforms rather than restated.** The lean-to roof matched neither of its two supports.
  With the group at `[0, 4.25, 0.2] rotation={[0.16, 0, 0]}` its underside plane ran **4.4695 over
  the timber architrave's front edge and 4.4332 over its centre-line against a beam top of 4.02** —
  it floated 0.4132–0.4495 above the beam it exists to bear on — while at the rear brick wall it ran
  **3.9975 at the wall's front face and 3.8038 at its rear face against a 4.0 wall top**, so the
  brick wall drove *through* the slab: its top rear edge stood **0.0139 proud of the slab's top face
  (3.9861)**. The 0.16 rad pitch pointed the wrong way as well — it shed water down the building's
  own back wall.

- **The arrangement shipped: the lean-to leans on the rear wall — HIGH at the wall, LOW at the open
  front, draining to the street — seated on both *existing* supports at the author's own 0.16 rad.**
  Three transforms changed, nothing else:

  | quantity | before | after |
  |---|---|---|
  | roof group | `[0, 4.25, 0.2]`, `rotation 0.16` | **`[0, 4.4218, 0.2]`, `rotation −0.16`** |
  | rear wall mesh | `[0, 2.0, 1.8]`, box 8.0 × **4.0** × 1.2 | `[0, 2.2517, 1.8]`, box 8.0 × **4.5034** × 1.2 |
  | flashing mesh (in the roof group) | `[0, 0.1, 2.7]` | **`[0, −0.18, 2.1149]`** |
  | underside at the beam's front edge (world Z −0.725) | 4.4695 (gap **+0.4495**) | **4.0200 (gap 0.0000)** |
  | underside at the beam's centre-line (Z −0.5) | 4.4332 (+0.4132) | 4.0563 (+0.0363) |
  | underside at the beam's rear edge (Z −0.275) | 4.3969 (+0.3769) | 4.0926 (+0.0726) |
  | underside / top face at the wall's front face (Z 2.2) | 3.9975 / 4.1798 | **4.4920 / 4.6743** |
  | underside / top face at the wall's rear face (Z 3.4) | 3.8038 / 3.9861 | **4.6857 / 4.8680** |
  | wall top vs the slab | wall top **0.0139 proud of the slab's top face** | beds **0.0114** into the underside, **0.1709 below** the top face at the wall's front face and **0.3646 below** it at the rear face |
  | flashing bottom-rear edge (world Y, Z) | (3.8186, **3.9362**) — behind the wall | (**4.5033**, **3.4000**) — on the wall's top at its rear face |
  | flashing far face past the wall's rear face | **0.5649** (its centre-line 0.4814) | **0.0000** |
  | roof's front-bottom edge (world Z) | −1.4799 | **−1.4512** (0.0287 further from the General Store) |
  | eave fascia's front face (world Z) | −1.5471 | **−1.5279** (0.0192 rearward) |

  The wall's world Z band [2.2, 3.4] and X band [24.2, 32.2] are unchanged, and so is the slab's own
  8.6 × 0.18 × 5.4 box. One measurement trap worth recording: the slab's axis-aligned minimum Z is
  **−1.4799 in both frames** — before, that extreme is attained by its front-*bottom* corner and
  after by its front-*top* corner — so comparing AABB extrema would hide the 0.0287 move; the suite
  compares the transformed corners instead.

- **The 0.5034 wall increase is exactly the underside plane's height at the wall's front face**
  (4.0 → 4.5034), i.e. the amount by which the old wall fell short of the plane it had to carry. The
  arrangement was then re-derived end to end and is internally coherent — checked for gaps *and*
  interpenetrations, not only the two the phase set out to fix:
  - the front bearing is exact (0.0000) on the beam's down-slope edge, and the wedge the pitch leaves
    behind that line — 0.0726 at the beam's rear edge — is **enclosed** by the beam and the slab: the
    contact line itself is closed to 0, the pocket opens only inward/rearward, and the beam's top face
    stays 0.2549 below the slab's top face there, so nothing pokes through;
  - the wall's top beds 0.0114 into the underside at the wall's front face — inside the project's own
    0.02 seat tolerance (the architrave uses 0.02 on the piers, the C-8.52 canopy 0.01545 on its
    tie-beam) — its crossing line is Z 2.2706, inside the wall's own 1.2 depth, and the wall stands
    0.1709/0.3646 below the slab's top face at its two faces;
  - the flashing's bottom face beds **0.0224** into the wall's top at its outer end — its own
    0.14 · tan 0.16 tilt run, hidden below the top plane it bears on — its bottom-rear corner lands
    **1.5e-5 past** the wall's rear face (the 4 dp the group's Y literal is written to, two orders
    below the tolerance), its rear face is flush with the wall's rear face (0.0000) and its top-rear
    edge meets the underside exactly (0.0000);
  - the eave fascia still clears the pier heads (its lowest face 3.8439 against the impost tops 3.8)
    and stands 0.8029 ahead of the beam's front face.
  **No unresolved geometric conflict remains** — the residuals are the three intended seats above,
  each inside the project's stated tolerance.

- **What did not move: everything else in the building and everything around it.** The slab, fascia
  and flashing keep their boxes and materials; the architrave (`[0, 3.9, −1.5]`, 8.2 × 0.24 × 0.45),
  both piers (stepped base, shaft and impost cap at ±3.6, Z −1.5), the `BuildingFoundation`, the three
  prop groups (`[−2.4, 0, −1.0]`, `[2.6, 0, −1.2]`, `[0, 0, −1.2]`) and the building's root
  `[28.2, 0, 1]` are untouched; `armor-workshop` is still 8.9 × 5.7 at `[28.2, 1.15]` — the plinth
  `BuildingFoundation`'s formula derives — and its hub keeps `radius 4.5` at `[28.2, 0, 1]` with the
  arrival `[28.2, 5.5]`. **No collider, navigation route, hub radius, movement constant, shared
  primitive or neighbouring building was edited**, and the whole rendered change sits at or above the
  architrave's underside (3.78), i.e. above the player's own plane.

- **The General Store ↔ Workshop junction only improves, and it is re-pinned.** The closest approach
  of the two buildings is still the measured 0.150 plinth gap (neither root, plinth, collider nor
  registry entry moved); the *next* closest pair — the Store's west roof slab against this eave
  fascia — widened from 0.203 to **0.748**, because the lean-to's eave dropped from Y 4.62 to 3.93
  and its front edge moved 0.0287 away. `phaseC8_29.test.ts` was **rebased, not weakened**: it pins
  the flipped rotation (−0.16) and the measured 0.748, and its "nothing anywhere comes closer than
  the plinth gap" assertion is unchanged.

- **Regression suite: `src/utils/phaseC8_53.test.ts`** — 29 tests across 6 sections, every value
  parsed from the component's own literals and transformed through the group's own rotation and
  position (the way three.js composes them): §A the frame (root, the kept 0.16 pitch, the three
  boxes, the architrave and piers as the front bearing, the wall as the only raised element); §B the
  load path (the underside as a real plane at `tan 0.16`, the exact front seat, the enclosed wedge,
  the wall's bed and its clearance under the slab's top face, the eave over the beam and past the
  pier heads, the building's new peak); §C the flashing (its bottom edge on the wall's top at the
  wall's rear face, its top edge on the underside, no overhang, the wall's top shown to be the value
  that makes that fit exact, and the bedded end inside the wall's own footprint); §D what was not
  touched (the props' transforms, both roots and the neighbours, the C-8.49/8.51/8.52 landmarks, and
  the roof edge moving *away* from the Store); §E collision and navigation (the collider re-derived
  from the foundation formula, 110 colliders / 31 rectangles with unique ids, the hub and a driven
  `getNearbyHubLocation`, and every moved face above the player's plane); §F the control, which
  replays the pre-fix transform through the identical checks and shows the 0.4495/0.4132/0.3769
  float, the 0.0139 poke-through, the wrong-way fall and the 0.5649 flashing overhang.

- **Harness repairs this phase — no expected geometry changed and no assertion weakened.** The suite
  as committed did not run at all, and three of its expectations were wrong:
  1. §C's last test was missing the brace that closes its `for` loop, so the file failed to *parse*
     — bun reported it as an unhandled error between tests, not as a failed assertion. Fixed.
  2. the rack / display-rack / workbench parsers captured only two of the three coordinates, so
     `triple()` handed §D an `undefined` Y and compared garbage against a three-number literal. They
     now capture the literal `0` as well.
  3. §D compared the shipped **fascia** against the pre-fix **slab's** front edge — two different
     pieces, with the fascia standing 0.06 proud of that edge, so the comparison could never hold. It
     now compares fascia against the pre-fix fascia (its own box): 0.0192 rearward.
  4. §F's control keyed its expected gaps on `z === -1.5`, the architrave's **local** Z, which
     matches no sample — the centre line (−0.5) and the rear edge (−0.275) were both silently
     compared against the rear-edge value. The samples are now a table of the three **world** Z
     values (−0.725 / −0.5 / −0.275) with the independently recomputed gaps 0.4495 / 0.4132 / 0.3769,
     and both ends are asserted so the check cannot drift again.
  5. §F's flashing figure **0.4814 is the beam's centre-line** overhang; the box's own far face stood
     **0.5649** past the wall and its near face 0.3980. The test — and this document — now state all
     three, and the shipped flashing is still pinned at 0.0000.
  6. §C's "the bedded end is inside the wall's own footprint" bound is now the suite's own `EXACT`
     (1e-4, the precision the component's literals are written to) rather than an unstated exact
     inequality: the corner lands 1.5e-5 past the wall's rear face.
  Every corrected number was independently recomputed in a throwaway harness in the `web` container
  by composing the real roots, groups, rotations and box `args` with **three.js itself** and reading
  its own world matrices (`Box3.setFromObject` / `localToWorld`), corner by corner — so the suite's
  hand-rolled `rotX` model is cross-checked against the renderer's, not merely against itself.

- **Verified 2026-10-18** in the dev container: focused
  `bun test src/utils/phaseC8_53.test.ts src/utils/phaseC8_29.test.ts` → **45 pass / 0 fail**
  (244 expect() calls: 29 + 16); `bun test` → **1257 pass / 0 fail (42 files)** (C-8.51 left 1194 /
  40; the delta is the C-8.52 and C-8.53 suites); `bun run scripts/collisionTests.ts` → **122 passed,
  0 failed**, exit 0; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the
  pre-existing >500 kB chunk warning only); `git diff --check` → clean. The validation's starting
  point was that syntax error (0 pass / 1 error), and no other suite needed a change.

- **Not automatically verified — the rendered junction, and it is a device question.** A
  source-geometry suite proves the arrangement in the component's own transforms; it does **not**
  establish visual acceptance, and no preview capture can settle it here: the sandbox has no GPU
  (SwiftShader, ~2 fps in the city hub) and at the mobile preview width this building is a small part
  of the frame, so a 0.50-unit junction and a 0.0114 bed are below the resolution this environment can
  resolve. **Android preview check: stand at the workshop's open front looking at the rear wall and
  confirm the lean-to reads as leaning ON the wall — high edge carried by the brick, eave over the
  timber beam with no floating gap above it, no brick poking through the tiles, and the stone flashing
  capping the wall-plate junction on the roof's weather side; then view it from the via side to
  confirm the fall is toward the street and that the General Store's roof still clears the eave.**
  Still open from earlier phases: C-8.52's veranda canopy, C-8.49's wall-to-gable junctions, the
  C-8.51 awning, the C-8.41 kerb, the C-8.38 northern approach, the C-8.28 bowl cut, the C-8.29
  junction and the C-8.31/C-8.33 rear-gate checks. Do not claim device acceptance.

- **Two documentation gaps found, deliberately not fixed** (this phase documents C-8.53 only): this
  file has **no C-8.52 section**, although `TrainingHall.tsx` carries that phase's canopy and post
  changes and `src/utils/phaseC8_52.test.ts` (34 tests) documents them in its own header; and
  `ArmorLeatherWorkshop.tsx`'s C-8.53 comment still says the flashing "hung 0.48 behind the wall" —
  0.48 is its centre-line, its far face was 0.5649.

## Ishtar Gatehouse facade order seating (Phase C-8.55 — implemented)

- **The defect was the C-8.54 audit's Ishtar finding, re-derived here from the shared primitive's real
  formulas rather than restated.** `ClassicalColumn` puts the **top of the order ON `height`**: the
  capital drum is centred `height − capitalHeight / 2` with half-extent `capitalHeight / 2`, and the
  square abacus is centred `height − 0.04` with half-extent `0.08 / 2` — so both end exactly at
  `height`, and the shipped `height={10.4}` put them at **10.08 … 10.40**. The attic storey
  (`[0, 10.6, 0]`, box `[15.2, 2.0, 5.0]`) has its underside at **9.60**, so the capital sat 0.48 …
  **0.80 above** that soffit — entirely inside the attic's volume, its top plane and the attic's top
  plane identical. The order read as running into the storey, not seating beneath it. The audit's
  rounded figures were reproduced exactly (capital 10.08–10.40), so nothing about the finding was in
  doubt; what the audit did not do was reconcile the numbers with the primitive's `Math.min` caps,
  which the suite and this record now do.

- **The correction is one source literal: `height` 10.4 → 9.62**, the value the seat derives to
  (attic soffit 9.60 + the project's own 0.02 seating tolerance — the same 0.02 the architrave uses on
  its piers, the C-8.52 canopy on its tie-beam and the C-8.53 wall on the lean-to's underside). Both
  coefficients are capped at this height, so the order keeps its proportions and the whole 0.78 went
  into the shaft:

  | quantity | before (10.4) | after (9.62) |
  |---|---|---|
  | plinthHeight / capitalHeight (capped at 0.25 / 0.32) | 0.25 / 0.32 | 0.25 / 0.32 |
  | shaft | 0.33 … 10.16 | 0.33 … **9.38** |
  | astragal / necking ring | 10.01 … 10.07 | **9.25 … 9.31** |
  | capital drum | 10.08 … 10.40 | **9.30 … 9.62** |
  | square abacus | 10.32 … 10.40 | **9.54 … 9.62** |
  | order's top vs the attic soffit (9.60) | **+0.80 embedded** | **+0.02 seated** |
  | the capital's own engagement with the attic | the whole 0.32 drum | **0.02**, the rest 0.30 below |
  | capital / abacus / shaft front face vs the attic's +Z face (2.50) | — | **+0.44 / +0.35 / +0.26 proud** |

- **What did not move: everything else in the gatehouse and everything around it.** Four columns at
  X ±6.2 / ±2.8, all at Z 2.4, radius 0.36, Corinthian, the same `marbleWhite` shaft and `goldAccent`
  capital; the attic transform, box, materials, frieze and roof; the central block, the arch rhythm
  (central 5.2 × 6.4 recess, the ±4.6 side arches, the keystones), the upper cornice, both towers
  (their shaft, both `WallCornice` belts at 6.2 / 11.8, the merlons, the lanterns), the torches at
  ±3.2 and the `BuildingFoundation` podiums are untouched. The two intentional composite
  relationships C-8.54 recorded are **plan-only**, so the height change cannot have moved them and
  the suite re-derives both: the shafts still engage the central block's facade by **0.21** and the
  capitals by **0.39**, and the outer columns still engage the flanking towers by **0.16** in X and
  **0.16** in Z. **No collider, hub, navigation route, fast-travel entry, movement constant, shared
  primitive or neighbouring building was edited** — the registry is still 110 colliders / 31
  rectangles with exactly the three `ishtar-*` rectangles, `town_gate` keeps `radius 4.5` at
  `[0, 0, 24]` with the arrival `[0, 20]`, and the driven walk north from that arrival still stops
  at 20.76 (the last 0.38 step that is clear) and reverses.

- **Regression suite: `src/utils/phaseC8_55.test.ts`** — 42 tests / 186 assertions across 8 sections,
  every value parsed and then derived, never copied: §A the column run (the four X offsets, Y 0 / Z
  2.4, radius, order, materials, the 9.62 literal); §B the attic datum from source (soffit 9.60, +Z
  face 2.50, all four columns under it in plan); §C the primitive's own coefficients (0.25 / 0.07,
  0.32 / 0.09, the abacus's 0.04 drop, 0.08 thickness, 2.5·r width, the capital's 1.5·r top, the
  0.92 shaft taper) applied as real formulas, showing the caps make the capital the same size in both
  frames and that **both the capital and the abacus end on `height`**; §D the seat (exactly 0.02, a
  contact and not a gap, only the top 0.02 of the drum crossing the soffit while 0.30 of it stays
  below, every element below the capital clear of it, the 0.44 / 0.35 / 0.26 protrusions in front of
  the attic's face, and the height shown to be the derived soffit + tolerance rather than a rounded
  guess); §E the control — 10.4 through the **identical predicate** (capital 10.08–10.40, abacus
  10.32–10.40, 0.80 of interpenetration, 40× the tolerance, the whole drum above the soffit);
  §F the central-block and tower engagements, shown to be plan-only and therefore identical in both
  frames; §G the registry (counts, unique ids, the three rectangles re-derived from
  `BuildingFoundation`'s `size + 2 · projection`, no collider for the columns), the hub and its
  arrival, and the driven walks; §H the scope guard — the arch rhythm, keystones, side arches,
  cornices, merlons, lanterns and torches re-parsed, exactly one `<ClassicalColumn` usage in the
  file, and the shared primitive's declarations still the live ones.

- **Verified 2026-10-18** in the dev container: focused `bun test src/utils/phaseC8_55.test.ts` →
  **42 pass / 0 fail** (186 expect() calls); `bun test` → **1299 pass / 0 fail (43 files)** (C-8.53
  left 1257 / 42; the delta is this suite's 42); `bun run scripts/collisionTests.ts` → **122 passed,
  0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing
  >500 kB chunk warning only) — `dist/` is gitignored, so the build adds nothing to the diff;
  `git diff --check` → clean. The only files changed are `IshtarGatehouse.tsx` (the literal plus a
  phase comment), the new suite and this record. Two of the suite's own expectations were wrong on
  first run and were corrected, not the geometry: the walk stops on the last clear 0.38 step
  (20.76, not the 20.95 face line), and the tower-cornice / merlon parsers each matched only one
  occurrence until a global scanner was used.

- **Preview evidence, and what could not be captured.** Live checks in the preview browser: the dev
  server serves the corrected module (`/src/components/3d/city/IshtarGatehouse.tsx` contains
  `height: 9.62` and no `height: 10.4`); the app boots (title → `Play as Guest` → city hub renders)
  with **zero console errors**; and fast travel to the Monumental Ishtar Town Gate lands at `[0, 20]`
  and raises the gate's own `INSPECT CITY GATE` prompt, i.e. the arrival, prompt and navigation are
  unchanged. **No legible frame of the four columns was obtainable, and this is an environment limit
  rather than a defect:** the sandbox renders the hub through SwiftShader at ~2 fps with the movement
  step clamped to 0.08 s (0.304 units per frame, ≈0.6 units per second of wall time), and the four
  columns stand on the gatehouse's **+Z (outward, desert-facing) face** at world Z 26.4 — behind the
  central block, whose Y reaches 10, as seen from the city side. Reaching that outer face means
  walking around the building (~35 units, ~57 s of wall time) because `ishtar-central` registers the
  whole footprint as one solid rectangle with no gate passage. **The rendered capital/attic reading
  therefore remains a device question and is NOT automatically verified** — and note that from inside
  the city the gatehouse presents its undecorated inner face, so the change is visible from the desert
  approach rather than from the reachable plaza. No geometry change is implied by that observation;
  it is recorded so a future phase does not spend a preview budget hunting for the same vantage.
  Still open from earlier phases: the C-8.53 lean-to bearing, the C-8.52 veranda canopy, the C-8.49
  wall-to-gable junctions, the C-8.51 awning, the C-8.41 kerb, the C-8.38 northern approach, the
  C-8.28 bowl cut, the C-8.29 junction and the C-8.31/C-8.33 rear-gate checks. **Do not claim Android
  visual acceptance** — no source measurement or suite result substitutes for it.

## Veteran Gladiator Hall entrance portico (Phase C-8.57 — implemented)

- **The defect, re-derived here from the shipped primitives' own formulas rather than restated.** The
  hall's two-column entrance portico stood *inside* the roof's eave plate. `RomanGabledRoof` builds
  that plate as its `[width + 1.2·ov] × 0.16 × [depth + 1.2·ov]` bearing cornice at the group's own
  `Y − 0.08`, and `ClassicalColumn` puts the top of the order **ON `height`** — the capital drum ends
  at `height`, and the square abacus spans `height − 0.08 … height`. With the roof at `[0, 2.8, 0]`,
  `eaveOverhang` 0.35, the portico group at `Z 2.7` and the order at `height` 2.5, the shipped frame
  measurably had:

  | pre-fix intersection | X | Y | Z |
  |---|---|---|---|
  | column capital ∩ eave fascia | 0.39 | 0.16 | 0.305 |
  | column abacus ∩ eave fascia | 0.375 | 0.06 | 0.2975 |
  | pediment architrave ∩ eave fascia | 4.6 | 0.03 | 0.61 |
  | pediment architrave ∩ wall cornice (its projecting band) | 4.6 | 0.06 | 0.12 |

  **No eave depth could have cleared it.** The capital's back face sat at **Z 2.505**, i.e. 0.095
  *inside* the wall's own front face (2.60), so any fascia band wide enough to be an eave crossed it;
  the order had either to end below the plate's underside (2.64) or to move clear of the plate's
  front edge. Two further pre-fix conflicts were measured in the same frame: the pediment's raking
  cornices buried in the roof's front slope, and the acroterion's Z back face **0.015 inside** the
  ridge cap's front (2.975 against 2.99 — a 0.32 × 0.135 × 0.015 sliver).

- **The correction is seven coordinated values, all inside the hall** (verified 2026-10-18 with a
  throwaway harness in the `web` container that parses both sources and applies the primitives'
  coefficients, and by the suite's own control frame):

  | quantity | before | after |
  |---|---|---|
  | roof `eaveOverhang` | 0.35 | **0.20** |
  | eave fascia (2.64 … 2.80 tall) front face | Z 2.81 | **Z 2.72** |
  | roof's front slope face | Z 2.90 | **Z 2.80** |
  | portico group Z | 2.7 | **2.82** |
  | column `height` | 2.5 | **2.30** |
  | order's top, against the fascia's underside (2.64) | 2.82 — **0.18 inside the plate's band** | **2.62 — 0.02 below it** |
  | pediment `height` / `position` | 0.85 / `[0, 2.45, 0]` | **1.05 / `[0, 2.25, 0.58]`** |
  | architrave underside (the seat's plane) | 2.77 | **2.57** |
  | architrave / raking cornices' back faces | Z 2.20 / 2.525 | **Z 2.90 / 2.825** |
  | acroterion's Z back face vs the ridge cap's front | 0.015 **inside** | **0.835 clear** |
  | banner groups Z | 2.85 | **2.97** |
  | upper plinth step | 5.6 deep at Z 0 (front 2.80) | **5.72 deep at Z 0.06 (front 2.92)** |

  Every clearance the fix buys, measured: the order's top stands **0.02** under the plate's underside
  — the project's own seating tolerance, the same 0.02 the architrave uses on its piers (C-8.55), the
  C-8.52 canopy 0.01545 on its tie-beam and the C-8.53 wall 0.0114 on the lean-to's underside; the
  architrave's back face (2.90) is **0.18** beyond the fascia's front (2.72) and **0.18** beyond the
  wall cornice's own front (2.72); both raking cornices' back faces (2.825) stand **0.025** clear of
  the roof's front slope (2.80); the plinth's front face (3.015) is **0.035 inside** the lower step's
  front edge (3.05 — the collider's own line), the basering being the tightest element at **0.0275**
  and the abacus 0.0425; and the order keeps the **same 0.095 cantilever** past its upper step that
  the shipped plinth had. The column-to-architrave seat is preserved at **0.05** exactly. The
  acroterion's *height* did not move at all — the pediment's base dropped 0.20 and its gable grew
  0.20, so its top is still 4.24, still 0.045 below the ridge cap (4.285); only its Z followed the
  pediment forward. **Phase C-8.62 has since lifted the finial by the shared primitive's own
  `crownLift` (0.0715541753) so it seats on the two raking cornices' crowns: its top is now
  4.3115541753, i.e. 0.0265541753 ABOVE the ridge cap's own top, with the two solids still 0.835
  apart in Z. The 4.24/0.045 pair above is this phase's own frame; the suite's §E pin was rebased in
  place.**

- **What did not move: everything else in the hall and everything around it.** The doorway
  (`[0, 0.32, 2.58]`, 1.6 × 2.2 — **Phase C-8.60 later moved this group 0.08 back, 2.58 → 2.50** to
  clear its projecting cornice cap from the pediment's raking cornices; its Y, its width/height/depth
  and its threshold are as this phase left them), the window, the wall cornice, the quoins, the trophy-shield group
  (`[0, 1.6, 2.62]`), the lower step (`6.6 × 0.16 × 6.1` at `[0, 0.08, 0]`) and the hall's root
  `[-24, 0, -25]` are untouched, as are the banners' own transforms (X ±1.8, Y 1.0) and their wind
  animation. **The collider is untouched**, because the lower step — its own rendered geometry — is:
  `veteran-hall` is still the rectangle `cx -24, cz -25, hw 3.3, hd 3.05`, i.e. the registry is still
  **110 colliders / 31 rectangles** with unique ids, the hub keeps `radius 4.5` at `[-24, 0, -25]` and
  the fast-travel arrival `[-24, -29]`, and the doorway's own prompt still comes up from the stand
  point outside the collider (driven in the suite). No movement constant, navigation route, hub,
  neighbouring building or shared primitive was edited — `ClassicalArchitecture.tsx` is exactly as
  C-8.55 left it. The phase's files: `VeteranGladiatorHall.tsx` (the seven values plus comments),
  `src/utils/phaseC8_57.test.ts` (new suite) and this record.

- **Regression suite: `src/utils/phaseC8_57.test.ts`** — 42 tests / 235 assertions across 8 sections,
  every value parsed from the sources and then derived (the hall's own literals, the primitives'
  coefficients from `ClassicalArchitecture.tsx`, and the rotated pieces transformed through the
  group's own rotation the way three.js composes them): §A the hall and its portico as shipped (root,
  both steps, the roof/cornice props, the portico group, the order and the pediment, the banners);
  §B the shared primitives applied as formulas (the fascia from `width + ov·1.2`, the slopes, the
  ridge, the order topping out on `height`, the pediment's own boxes); §C the clearances — no
  capital, abacus, shaft, necking ring or plinth against the fascia or the wall cornice, the
  architrave clear of both, nothing else in the pediment reaching either, and the pediment still on
  the entrance axis; §D the 0.05 column-to-architrave seat, shown to be a bearing and not a knife
  edge, with the order's top exactly the tolerance below the plate; §E the acroterion's seating on
  the rake crowns — **rebased by C-8.62**, which moved this pin from 0.045 to
  `0.045 − crownLift` = −0.0265541753 (the finial's top now stands above the ridge cap's while the
  two stay 0.835 apart in Z) and which the taller gable still holds; §F the portico's symmetry about X = 0, the
  pediment included; §G the collider, hub and arrival untouched, the registry/render invariant (the
  rectangle still equals the rendered lower step), the driven prompt, and the scope guard on the
  doorway, window and trophies; §H the control — the pre-fix frame replayed through the **identical
  predicates**, reproducing all four intersection volumes exactly, the capital's 0.095 burial in the
  wall, the rakes in the roof slope and the acroterion's 0.015 ridge sliver.

- **Verified 2026-10-18** in the dev container: focused `bun test src/utils/phaseC8_57.test.ts` →
  **42 pass / 0 fail** (235 expect() calls); `bun test` → **1341 pass / 0 fail (44 files)** (C-8.55
  left 1299 / 43; the delta is this suite's 42); `bun run scripts/collisionTests.ts` → **122 passed,
  0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing
  >500 kB chunk warning only); `git diff --check` → clean. Live preview: the dev server serves the
  corrected module (the transformed `/src/.../VeteranGladiatorHall.tsx` carries `eaveOverhang: 0.2`,
  `height: 2.3` and `position: [0, 0.32, 2.82]`, and neither 0.35 nor 2.5), and the app boots to its
  title screen with **zero console errors**.

- **Two harness repairs this phase — no geometry changed in either.** (1) The suite as committed
  **failed 1 of 42**: its hub-prompt test compared `getNearbyHubLocation(...)` — which returns the
  hub **object** — against the id string. It now asserts `?.id`, the shape every other suite uses
  (`phaseC8_19/31/33/37/51/53`); the geometry, the collider and the arrangement were never in doubt.
  (2) `VeteranGladiatorHall.tsx`'s C-8.57 comment and this suite's header both said the plinths
  "land 0.045 inside the lower step's front edge"; the measured inset is **0.035** (the plinth's front
  face 3.015 against the step's 3.05 — the basering is the tightest element at 0.0275, the abacus
  0.0425). Neither figure was ever an assertion; both statements are corrected, and the values above
  are the measured ones.

- **Not automatically verified — the rendered junction, and it is a device question.** A
  source-geometry suite proves the arrangement in the component's own transforms; it does **not**
  establish visual acceptance, and no preview capture can settle it here: the sandbox has no GPU
  (SwiftShader, ~2 fps in the city hub) and every correction in this phase is 0.02–0.18 units on a
  building that is a small part of the frame in the WEST district — the limit C-8.53 and C-8.55
  recorded. **Android preview check: stand in front of the Veteran Gladiator Hall and confirm the
  pediment and the two crimson columns read as standing UNDER the eave — neither capital nor the
  architrave crossed by the roof plate, the gable's raking cornices clear of the roof slope, the
  finial clear of the ridge cap, and the banner boards still hanging beside the shafts; then look
  along the window wall to confirm the eave plate no longer cuts across the order.** Still open from
  earlier phases: the C-8.53 lean-to bearing, the C-8.52 veranda canopy, the C-8.49 wall-to-gable
  junctions, the C-8.51 awning, the C-8.41 kerb, the C-8.38 northern approach, the C-8.28 bowl cut,
  the C-8.29 junction and the C-8.31/C-8.33 rear-gate checks. Do not claim Android visual acceptance.

## Veteran Gladiator Hall decoration clearance (Phase C-8.60 — implemented)

- **The defect was C-8.59's read-only audit, re-derived here from the shipped transforms and the
  primitives' own formulas rather than restated.** C-8.57 moved the hall's portico 0.12 forward and
  0.20 up, and left the entrance's two decorations where they had been: the doorway group at local
  Z 2.58, and the laurel wreath at `[0, 1.1, 0.1]` inside the trophy group at `[0, 1.6, 2.62]` —
  local (0, 2.70, 2.72) — with `rotation={[Math.PI / 2, 0, 0]}`. Measured on the real solids (a
  box/box separating-axis test, and a torus whose distance to a box is computed from the box's own
  radial reach about the ring's axis), the pre-fix frame had:

  | pre-fix conflict | measured |
  |---|---|
  | wreath ∩ pediment architrave | the ring's front arc reaches Z 3.13; the architrave's band is Z 2.90 … 3.90, and the ring's tube spans Y 2.64 … 2.76 against its 2.57 … 2.87 |
  | wreath ∩ LEFT raking cornice | 0.0331 into the rake's own box |
  | wreath ∩ RIGHT raking cornice | 0.0331, mirrored |
  | doorway's projecting cornice cap ∩ BOTH raking cornices | **0.05** deep in Z, over a 1.334 × 0.10 share (the cap's Z 2.405 … 2.875 against the rakes' 2.825 … 3.975) |

  **Four more solids the audit did not name — and the reason the wreath read wrong.** `[Math.PI / 2,
  0, 0]` is a quarter turn about X, which turns a torus's own XY plane into the ground plane: the
  ring lay FLAT, edge-on to the street, and its tube also passed through the doorway's lintel, the
  wall cornice, the roof's eave plate and the wall box itself. Seven solids in total, not three.

- **The correction is one transform and one literal, both inside the hall:**

  | quantity | before | after |
  |---|---|---|
  | doorway group Z | 2.58 | **2.50** |
  | wreath position (local to the trophy group) | `[0, 1.1, 0.1]` | **`[0, 1.81, 1.19]`** |
  | wreath rotation | `[Math.PI / 2, 0, 0]` | **`[0, 0, 0]`** |
  | wreath torus | `[0.35, 0.06, 6, 12]` | **`[0.28, 0.06, 6, 12]`** |

  The doorway steps 0.08 back. `ClassicalDoorway` puts its projecting cornice cap at local
  `Y height + lintelHeight + 0.05` and makes it `depth + 0.12` (0.47) deep about local Z 0.06, so
  the cap's front face moves 2.875 → **2.795** and clears the rakes' 2.825 by **0.03**; the lintel
  clears by **0.08**, and the jambs follow the group back, still proud of the wall's 2.60 face.
  2.50 is the smallest 0.02-step that holds the tolerance — measured on the same predicate, 2.52
  gives 0.01 and 2.54 gives −0.01.

- **The wreath is re-hung face-on in the pediment's tympanum, and its readability is the point of
  the change, not a side effect.** With no rotation a torus lies in the plane it is drawn in, so the
  ring faces the street and its back face seats on the tympanum panel's own plane at Z 3.75 (local
  Z 1.19 from the trophy group's 2.62 origin), reading as a wreath hung in the gable. **0.28 is the
  largest major radius that satisfies both ends of the free band there:** the V the two rakes
  describe on the axis (their bands cross the pediment's centre at Y 2.727 … 2.993) pushes the
  centre UP, and the gable's apex (Y 3.82, half-base 1.95) pulls it back DOWN. Measured, and pinned
  as failing in the suite: 0.30 needs the centre at Y 3.4176, where the rake clearance is 0.0198 —
  under the 0.02 tolerance — and the silhouette crosses the triangle's raking edges by 0.0018; 0.35
  needs Y 3.4714, whose top then stands **0.0614 proud of the apex**. At 0.28 with the centre at
  hall Y 3.41 / Z 3.81: rake clearance **0.0330** to each, architrave **0.20**, acroterion
  **0.17**, lunette 0.30+, keystone 0.9975, and the silhouette stays **0.0286** inside each raking
  edge of the tympanum triangle, 0.20 above its base, 0.07 below its apex. The band keeps the weight
  it had: the tube is still 0.06, only the diameter comes in, 0.70 → 0.56. **Superseded figures —
  Phase C-8.62 corrected the shared primitive and lifted the finial by its own `crownLift`: the ring
  now clears each rake by 0.0361578674 (was 0.0330) and the finial by 0.2415541753 (was 0.17), and
  the finial's 0.045 below the ridge cap became 0.0265541753 above it. The suite's pins were rebased
  in place; the C-8.62 section below is the record.**

- **The audit's own candidate was measured and rejected, not adopted.** C-8.59 proposed radius
  0.35 → 0.10 with Y 1.10 → 1.047 and the rotation untouched. Rebuilt from the source, that ring
  still sits **inside the doorway's lintel (−0.033) and the wall cornice (−0.06)** — the audit's
  three pairs were clear, but the ring was still buried — and it is still FLAT, i.e. still edge-on,
  which is the appearance the audit itself flagged. It is pinned as failing in §H through the same
  predicates the shipped frame passes.

- **What did not move: everything else in the hall and around it.** The doorway's own box
  (1.6 × 2.2 × 0.35), its Y (0.32), its jamb/lintel/cap sizes, its threshold and its recess; the
  window `[-2.86, 1.7, 0]`; the trophy group `[0, 1.6, 2.62]` with its two shields and crossed
  weapons; the banners `[±1.8, 1.0, 2.97]`; both steps; the portico `[0, 0.32, 2.82]`, the order
  (2.3) and the pediment (`[0, 2.25, 0.58]`, 4.2 × 0.8 × 1.05); every roof prop; the hall's root
  `[-24, 0, -25]`. **The collider is untouched** — `veteran-hall` is still `cx -24, cz -25, hw 3.3,
  hd 3.05`, the registry is still **110 colliders / 31 rectangles**, the hub keeps `radius 4.5` at
  `[-24, 0, -25]` and the arrival `[-24, -29]`, and the doorway's own prompt still comes up from the
  stand point outside the collider (driven in the suite). No movement constant, navigation route,
  hub, neighbouring building, material or shared primitive was edited. The phase's files:
  `VeteranGladiatorHall.tsx` (the transform, the literal and their comments),
  `src/utils/phaseC8_60.test.ts` (new suite), `src/utils/phaseC8_57.test.ts` (one rebased pin) and
  this record.

- **Regression suite: `src/utils/phaseC8_60.test.ts`** — 39 tests / 291 assertions across 8
  sections, every value parsed from the sources and then derived, and the solids real rather than
  axis-aligned bounds: §A the frame as shipped (root, both steps, the doorway group and its box, the
  trophy group and the wreath's position/rotation/torus, the portico, the order, the pediment);
  §B the primitives applied as formulas (the cap's own drop, thickness and depth, the rakes' Z band
  2.825 … 3.975, the architrave's 2.57 … 2.87 and 2.90 … 3.90, the wreath's centre derived from its
  group, its back face exactly on the tympanum's plane); §C the three conflicts — the wreath against
  the architrave (0.20) and against BOTH rakes (0.0330 each, shown mirror-symmetric), the cap
  against BOTH rakes (0.03, plus the lintel's 0.08 and the cap's 0.105 to the architrave), the
  doorway still framed into the wall and proud of its face; §D the appearance — the orientation
  (identity ⇒ the ring's normal is +Z and it faces the street; the old quarter turn about X sends
  that normal to −Y), the silhouette's margin inside the tympanum triangle on all three edges and
  its clearance from the finial, the lunette and the keystone, and both rejected rings (0.30's
  0.0198 and 0.35's 0.0614 over the apex); §E the C-8.57 arrangement intact (the 0.02 under the
  fascia, the 0.05 seat, the 0.045 acroterion, the 0.025 rake-to-slope and 0.18 architrave-to-eave
  clearances, every part of the order clear of the eave and the wall cornice, the plinths inside the
  lower step); §F the collider, hub, arrival and the driven prompt; §G the scope guard plus THE
  SWEEP — **no solid in the building holds wreath material except the tympanum panel it seats on**,
  with the two rakes the nearest at **0.0361578674** (0.0330 before C-8.62 rebased this pin); §H the
  control — the pre-fix frame replays the audit's
  three intersections, the cap's 0.05 × 0.10 × 1.334 share with each rake, the four extra solids the
  flat ring passed through (the sweep returns exactly
  `['wall', 'cornF', 'fascia', 'doorLintel', 'architrave', 'rakeL', 'rakeR']`), and the audit's
  candidate failing the same predicates.

- **Mutation check — the suite is shown to be sensitive to the values it pins, not to agree with
  itself.** Five single-literal mutations of the production file, each restored byte-for-byte
  afterwards (`cmp` clean): wreath Z 1.19 → 0.90 (10 tests fail), wreath Y 1.81 → 1.70 (22), major
  radius 0.28 → 0.35 (20), rotation back to `[Math.PI / 2, 0, 0]` (18), doorway Z 2.50 → 2.58 (14).
  With the file restored the suite passes all 39.

- **Rebased, not weakened: one site that pinned the doorway.** `phaseC8_57.test.ts`'s §G scope
  guard pinned the doorway's group at `[0, 0.32, 2.58]`; it now pins `[0, 0.32, 2.50]` with a
  comment naming this phase. Nothing else in that suite reads the doorway or the wreath, and its
  other 41 tests — the portico, the pediment, the eave, the collider and its control frame — are
  unchanged and still pass. `phaseC8_47.test.ts`'s approach table names the doorway's old Z in a
  documentation string only (`veteran_gladiator_hall: { dir: [0, 1], collider: 'veteran-hall', … }`);
  the resolver reads its `dir` and `collider` fields, both unchanged, so it needed no edit and none
  was made. A repo-wide sweep finds no other test, script or document that pins the wreath's or the
  doorway's old values.

- **Verified 2026-10-18** in the dev container: focused `bun test src/utils/phaseC8_60.test.ts` →
  **39 pass / 0 fail** (291 expect() calls); `bun test src/utils/phaseC8_57.test.ts` → **42 pass /
  0 fail** (235 expect() calls); `bun test` → **1380 pass / 0 fail (45 files)** (C-8.57 left
  1341 / 44; the delta is this suite's 39); `bun run scripts/collisionTests.ts` → **122 passed,
  0 failed**, exit 0; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the
  pre-existing >500 kB chunk warning only); `git diff --check` → clean. The diff is exactly three
  files: the hall component, the C-8.57 suite's one pin, and the new suite.

- **Preview evidence, and what could not be captured.** In the preview browser: the dev server
  serves the corrected module (`/src/components/3d/city/VeteranGladiatorHall.tsx` carries
  `position: [0, 0.32, 2.5]`, `position: [0, 1.81, 1.19]`, `rotation: [0, 0, 0]` and
  `args: [0.28, 0.06, 6, 12]`, with no executable `0.35` / `[0, 1.1, 0.1]` / `[0, 0.32, 2.58]`
  left); the app boots to its title screen and, from `Play as Guest`, enters the **3D city hub**
  with **zero console errors** on either screen. **No frame of the hall itself was obtainable, and
  that is an environment limit rather than a defect:** the player starts in the central plaza
  facing the Colosseum, the hall is 24 units west of it, the hub renders through SwiftShader at
  ~2 fps with the movement step clamped (≈0.6 units per second of wall time), and the hub's
  `Main Menu` returns to the title screen rather than offering a travel list — so the walk and the
  camera orbit needed to see the gable both exceed a script budget. **The rendered wreath, its
  face-on reading and the cleared raking cornices therefore remain a device question and are NOT
  automatically verified here.**

- **Remaining shared-primitive issue — deferred HERE, IMPLEMENTED in Phase C-8.62 (next section).**
  The primitive rotates its LEFT raking cornice by `−slopeAngle` and its right by `+slopeAngle`
  about centres at `∓halfBase / 2`, so **both descend toward the axis** and meet low over the
  pediment's centre as a V instead of rising to the apex along the gable's edges. Measured
  consequences, all left alone: the rakes cross the axis at Y 2.727 … 2.993, i.e. below the
  architrave's own top at 2.87, so they intersect the primitive's own entablature band near the
  centre; they leave the gable's upper triangle as the only free area for a decoration, which is
  what fixed the wreath's size; and the same V appears at every `ClassicalPediment` call site. The
  suite states the orientation as an assumption (it is why 0.28 is the largest ring that fits)
  rather than asserting it away. Repairing it means changing a shared primitive and every building
  that mounts it — a different, explicitly authorized phase — so C-8.60 does not. **(Phase C-8.62
  did exactly that — the signs, the run, the section and the finial lift, no call site moved. This
  paragraph is history now: its measurement stands, its deferral does not.)** One further
  pre-existing, out-of-scope conflict was found while sweeping and is recorded, not fixed: the
  hall's doorway lunette — drawn by `ClassicalDoorway` as a half-cylinder about a vertical axis —
  overlaps the RIGHT raking cornice; the doorway's 0.08 setback shrank that share by 0.08 in Z but
  did not remove it, and it is unchanged in kind by this phase.

- **Android visual acceptance: PENDING.** The check to run on device: stand in front of the
  Veteran Gladiator Hall and confirm a **face-on gold laurel wreath hangs in the pediment's
  tympanum** — a ring, not a flat bar — centred on the entrance axis, its whole silhouette inside
  the gable's triangle and clear of both raking cornices, with the doorway's projecting stone cap
  no longer standing inside them and the doorway's jambs still proud of the stucco. Still open from
  earlier phases: the C-8.57 pediment/order-under-the-eave reading, the C-8.53 lean-to bearing, the
  C-8.52 veranda canopy, the C-8.49 wall-to-gable junctions, the C-8.51 awning, the C-8.41 kerb,
  the C-8.38 northern approach, the C-8.28 bowl cut, the C-8.29 junction and the C-8.31/C-8.33
  rear-gate checks. Do not claim Android visual acceptance.

## Classical pediment raking cornices (Phase C-8.62 — implemented)

- **The defect was in the shared primitive, at every `ClassicalPediment` call site.**
  `ClassicalArchitecture.tsx` rotated its LEFT raking cornice by `−slopeAngle` and its RIGHT by
  `+slopeAngle` about centres at `∓halfBase / 2`, so both bars descended from their own eave corner
  toward the axis and met low over the pediment's centre as a **V** — the opposite of the gable they
  exist to trace. Each bar was also `rafterLen + 0.2` (0.1 past its own eave corner and 0.1 past the
  apex) and its section was 0.22. The V left the gable's upper triangle as the only free area a
  decoration could use — measured at the Veteran Hall, its arms crossed the axis at Y 2.727 … 2.993 —
  which is what bounded that hall's wreath in C-8.60 (that phase recorded the V and deferred it to an
  explicitly authorized phase).

- **The correction is four quantities inside the primitive; no call site, no collider, no hub and no
  movement constant moved.**

  | quantity | before | after |
  |---|---|---|
  | LEFT / RIGHT rake rotation | `−slopeAngle` / `+slopeAngle` | **`+slopeAngle` / `−slopeAngle`** |
  | rake run (box X) | `rafterLen + 0.2` | **`rafterLen`** |
  | rake section (box Y) | 0.22 | **`rakeThickness` = 0.16** |
  | apex acroterion Y | `0.3 + height + 0.16` | **`0.3 + height + 0.16 + crownLift`** |

  With the signs corrected, each bar's own axis runs exactly from its eave corner `(∓halfBase, 0.3)`
  to the apex `(0, 0.3 + height)`; with the run reduced to that length the two bars **meet at the
  apex** instead of crossing through it; and the thinner section keeps the bar clear of the tympanum
  panel's edges and of the roof behind the gable. `crownLift` = `cos(slopeAngle) · (rakeThickness /
  2)` is the one derived quantity the correction needs: where the two bars meet on the axis their
  crowns stand that far above the apex, so the acroterion is lifted by exactly that much and its
  underside seats on the joint instead of sinking into it.

- **The four call sites, each re-measured after the correction** (props parsed from each component's
  own source; world frames from each ancestor chain):

  | site | width × depth × height | own position | ancestor chain | slope | `crownLift` |
  |---|---|---|---|---|---|
  | Veteran Gladiator Hall | 4.2 × 0.8 × 1.05 | `[0, 2.25, 0.58]` | `[-24,0,-25]` → `[0,0.32,2.82]` | 26.5651° | 0.0715541753 |
  | Roman Shrine | 4.6 × 1.2 × 0.95 | `[0, 2.85, 1.4]` | `[-27,0,11]` | 22.4428° | 0.0739409138 |
  | Records Library | 5.6 × 1.4 × 1.1 | `[0, 2.2, 0]` | `[23.10,0,-30]` → `[0,0.5,1.6]` | 21.4477° | 0.0744601195 |
  | Grand Colosseum (portal) | 11.0 × 3.8 × 2.2 | `[0, 8.8, 0]` | `[0,0,15.2]` → `[0,0,2.2]` | 21.8014° | 0.0742781352 |

  At every site each bar reaches its own eave corner and the apex (to the suite's 1e-9 precision), the
  bar's length is exactly the corner-to-apex `rafterLen` (zero difference), both bars therefore
  contain the apex, and the two bars share volume only in the joint within 0.15 of the apex — where
  the V shared volume far below it. A repo sweep confirms these four components are the only ones
  mounting the primitive.

- **The Veteran Gladiator Hall wreath: the clearance grew, and this is the site the correction was
  argued from.** The C-8.60 ring (major 0.28, tube 0.06, face-on, its back face seated on the
  tympanum panel at Z 3.75) now clears each corrected rake by **0.0361578674** — up from the 0.0330
  the V left, because a rake that traces the gable stands further from a ring hung inside the
  tympanum than the V's arms did — and above the project's 0.02 tolerance. The ring shares the rakes'
  own Z band, so the margin is a real 3-D clearance rather than an interval artefact. On the corrected
  rake the pre-fix doorway cap (the C-8.60 frame at Z 2.58) is clear by **0.297895488**, where under
  the old V it stood **0.05 inside** the rake — the pair no longer meets at all.

- **Rebased, not weakened: only the pins that genuinely depended on the corrected rake.** Two existing
  suites read the primitive's own coefficients and had pinned its old numbers:
  - `phaseC8_57.test.ts` §E — the acroterion's absolute top, 4.24 → **4.3115541753**, i.e. the
    derived lift (0.0715541753) added to the sum that phase pinned. The identity it exists to pin —
    the taller gable, not a moved finial, holds the finial's elevation — is unchanged, and the
    finial's top now stands 0.0265541753 *above* the ridge cap's top plane instead of 0.045 below
    it; `phaseC8_60` §E's unchanged no-intersection check still shows the two solids 0.835 apart in
    Z, so the vertical overlap costs nothing. 17 lines changed.
  - `phaseC8_60.test.ts` — the two rake clearances 0.0330 → **0.0361578674**, the finial↔wreath gap
    0.17 → **0.2415541753**, the finial-vs-ridge-cap relationship 0.045 → −0.0265541753, and §H's
    pre-fix control, whose flat ring no longer reaches the corrected rakes. 109 lines changed, all of
    them rake-dependent.
  Every other C-8.57 / C-8.60 regression constraint — the portico and the eave, the doorway setback,
  the column seats, the collider and its control frame, both scope guards — is untouched and still
  passes. Nothing was weakened to make a test pass.

- **Residual defect — Records Library only, measured and deliberately NOT fixed.** The Library mounts
  a `RomanGabledRoof` on the same axis as its pediment, and its LEFT corrected rake still passes
  clean through that roof's eave plate: X overlap **2.8092522**, Y overlap **0.16** (the plate's own
  full thickness — a complete penetration), Z overlap **0.655**; the rake's Y band contains the
  plate's, extending 0.3744601 above the plate's top and 0.7144601 below its bottom. This is a
  **Library layout** question (the gable and the roof sit too close on Z — the plate's near face
  reaches 1.38 while the rake's band begins at 0.725), not a rake-orientation one: the Hall's and the
  Shrine's rakes stand clear of their own roofs by **0.105** and **0.575** in Z respectively, and the
  Colosseum's portal has no roof on its axis at all. C-8.62 does **not** expand to fix it; the suite
  pins the measurements so a future authorized phase starts from them.

- **The controls (mutations), each shown to fail the predicate the shipped frame passes**
  (`phaseC8_62` §H): reverting the signs puts the bars back on the axis as a V — their joint lands
  0.8+ below the apex, where the shipped frame's joint is within 0.15 of it; restoring the `+0.2` run
  overshoots both the apex and the bar's own eave corner by exactly 0.1; the 0.22 section costs the
  wreath its tolerance (**0.0061578674**, below the 0.02 requirement, against the shipped
  0.0361578674); and a mis-set finial — lift removed or doubled — leaves its underside off the crown
  plane by the full lift, outside tolerance. A closing check confirms the corrected frame passes every
  predicate the four mutations fail.

- **Regression suite: `src/utils/phaseC8_62.test.ts`** — **93 tests** across 9 sections: §A the
  primitive's corrected construction; §B gable-edge alignment at all four sites (each bar runs eave
  corner → apex over `rafterLen`, reaches only its own corner, and meets the other bar only at the
  apex joint); §C left/right symmetry about each pediment's axis; §D finial seating on the crowns
  (seated, touching both rakes, not sunk, clear of the entablature); §E the real solids (bearing on
  the entablature, the gable carried by the rakes alone, the primitive's three sections, the rakes'
  own Z overhang); §F the Veteran Hall wreath's clearance and the C-8.60 doorway setback; §G the
  Library's residual intersection, measured and left alone; §H the four mutation controls; §I the
  scope guard (the four sites keep their props, every ancestor literal present, the repo sweep, the
  collider/hub/player constants untouched at 110 colliders / 31 rectangles / 46 `colo-*`, and the
  primitive's exports unchanged). Every figure is parsed from source and applied as the real formula,
  and the solids are the real Z-rotated boxes tested with a separating-axis predicate (the wreath's
  torus folded against a box's own radial reach, as in C-8.60).

- **Verified 2026-10-18** in the dev container: focused
  `bun test src/utils/phaseC8_62.test.ts src/utils/phaseC8_57.test.ts src/utils/phaseC8_60.test.ts` →
  **174 pass / 0 fail** (93 + 42 + 39); `bun test` → **1473 pass / 0 fail (46 files)** (C-8.60 left
  1380 / 45; the delta is this suite's 93); `bun run scripts/collisionTests.ts` → **122 passed,
  0 failed**, exit 0; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the
  pre-existing >500 kB chunk warning only); `git diff --check` → clean. The phase's files:
  `ClassicalArchitecture.tsx` (the primitive), `src/utils/phaseC8_62.test.ts` (new), the two rebased
  suites, and this document.

- **Android visual acceptance: PENDING.** The check to run on device: stand in front of the Veteran
  Gladiator Hall and confirm the gable's **raking cornices now rise from the eave corners to the
  apex along the roof's own edges** — a gable, not a V — with the gold wreath hanging in the
  tympanum below them and the acroterion seated on the joint where the two rakes meet. Then check the
  Roman Shrine, the Records Library and the Colosseum's portal gable for the same reading (and the
  Library's residual roof-plate/rake crossing, recorded above, which is knowingly left). Still open
  from earlier phases: the C-8.57 pediment/order-under-the-eave reading, the C-8.53 lean-to bearing,
  the C-8.52 veranda canopy, the C-8.49 wall-to-gable junctions, the C-8.51 awning, the C-8.41 kerb,
  the C-8.38 northern approach, the C-8.28 bowl cut, the C-8.29 junction and the C-8.31/C-8.33
  rear-gate checks. Do not claim Android visual acceptance.

## East Circus District — chariot arena placement (Phase C-8.64A — implemented, corrected and validated)

- **What the phase ships** (`44721b9` placement; `64e31a8` entrance-alignment correction):
  `EastCircusArena.tsx` loads `public/_workspace_arena.glb`
  once through the shared `useGLTF` pipeline (preload + its own `Suspense` in `CityHubScene`, the
  `ColosseumSignPrototype` pattern) and renders `gltf.scene` in place — no `clone()`, no material or
  wrap override, every mesh static (`matrixAutoUpdate = false`). `collisionShapes.ts` registers a
  **31-segment** `circus-*` perimeter (7 straights + 12 chords per side of the 13-point outline) that
  follows the arena's measured outer silhouette and is now a **closed ring** at both axial ends —
  the placement prototype shipped a 26-segment ring that left an 18.00 mouth at the carceres and a
  7.92 mouth at the north tip, and the entrance-alignment correction **shut both** after measuring
  that neither corresponds to a rendered passage a player can walk through (see below).
  `cityCollisions.ts` adds the **district-access envelope** as a *union* with the city square.
- **The transform, the footprint and the ground contact, measured from the shipping asset.** All 76
  nodes carry the SAME matrix — the Z-up → Y-up correction
  `[1,0,0,0, 0,0,−1,0, 0,1,0,0, 0,0,0,1]`, which GLTFLoader applies when it builds the scene graph —
  so the group's yaw and scale act on each node's own POSITION data: the raw vertex extents are NOT
  the world extents, and a harness that skips the node matrix reports the model Z-up. Measured with
  it applied, root `[52.34, −0.05, 43.80]`, yaw `π/2`, scale `0.20`:

  | part | X | Y | Z |
  |---|---|---|---|
  | whole asset | 37.600 … 66.344 | −0.250 … 5.710 | −30.157 … 46.000 |
  | shell `Marble_01` (27.92 × 73.957) | 38.380 … 66.300 | −0.050 … 4.010 | −30.157 … 43.800 |
  | sand track `Sand_00` | 43.940 … 60.740 | −0.250 … −0.050 | −24.598 … 43.800 |
  | carceres `Travertine_25` | 43.340 … 61.340 | −0.050 … 1.850 | 43.800 … 46.000 |
  | triumphal arch `Travertine_30` | 49.840 … 54.840 | −0.050 … 3.750 | −23.900 … −22.500 |

  **Ground contact is exact and needs no new ground:** the shell's base and the track's *top* face
  both sit at Y −0.050, i.e. on `GROUND_PLANE_ELEVATION_Y`, with the track slab's underside 0.20
  buried. The fabric awning reaches 0.78 further west (X 37.600) than the outer wall, but only at
  Y 3.479 … 4.490 — far above the player — so the perimeter follows the shell's 38.380 / 66.300.
- **The two mouths, and what is actually behind them.** The perimeter leaves **18.00** at the
  carceres end (X 43.34 … 61.34, carried out to the block's front face Z 46.00 by its two 2.2-deep
  cheeks) and **7.92** at the north end (X 48.380 … 56.300). Both are clear of every collider, and
  the phase's §C/§D drive them: a 0.4-radius channel sweep across each mouth at every 0.25 in both
  planes, plus in through the carceres, out through the north mouth, back in, and a full circuit of
  the outside — all with the real `resolveCityMovement`. **The rendered structures do not offer the
  same openings**, measured on the asset with a ray-parity occupancy test (0.25 columns; openings
  re-measured at 0.02): the carceres block is an arcade of **twelve through-openings of 0.500**
  (pitch 1.35, first at X 44.66, narrowing to 0.280 at Y 1.30) — every one narrower than the 0.80
  player diameter — and the sphendone's north tip is **solid at ground level** from Z −30.157 south
  to ≈ −28.1 across the whole mouth. The `Travertine_30` monument is a **triple-arched structure
  standing INSIDE the arena**, 4.6 south of the ring's end, whose passages measure **1.380** (centre,
  X 51.64 … 53.02) and **0.700** either side; only the centre arch admits a 0.4-radius player. So the
  phase's documented prototype mismatch (no colliders for the seating banks, the carceres piers or
  the spina) is now *measured* — and the correction below acts on it: the two mouths are **closed**,
  so the ring is a single closed perimeter and the player is stopped outside rendered stone. (As
  first shipped, the collider's mouths were wider than any rendered opening — the player walked
  through rendered stone on both lines, and the north mouth had no rendered portal behind it at all.)
- **The entrance-alignment closure (corrective follow-up, `64e31a8`).** Both axial mouths were
  re-measured against the shipping asset, and **neither is a passage a player can enter**, so the
  ring was closed rather than left to admit movement through stone. The three kinds of evidence are
  kept separate here, because they carry different weight.
  - *Measured geometry (read off the asset itself, not asserted by a test).* The carceres block is
    an arcade of **twelve through-openings of 0.49–0.51** (pitch 1.35, the first on X ≈ 44.66, the
    last ending X ≈ 60.02) pierced through the 1.85-high block, each narrowing with height (**0.280
    at Y 1.30**) — none is anywhere near the 0.80 player diameter at any height in the player's band,
    and a body-cylinder sweep finds no player-sized column on the block's front line (Z 46.00) or
    through its 2.20 depth. The sphendone's north **tip is solid stone at ground level** from the
    shell's own north extreme (Z −30.157) south to Z ≈ −27.8 across the whole mouth; its only
    ground-level voids are sub-0.45 slivers (0.09 at Z −29.72) that do not pass through. So **there
    is no player-sized rendered passage at either end**, and `Travertine_30` is an **interior**
    triple-arch monument standing 4.6 south of the cap (passages 0.700 / 1.380 / 0.700), not a gate.
  - *What changed in the registry (`collisionShapes.ts`).* The ring is **closed**: a new
    `circus-carceres-front` segment spans the carceres' own face plane (Z 46.00) between the two
    cheeks, and the north mouth is closed by **two chords laid in open air NORTH of the tip** —
    `[50.0, −30.5]` to the axis apex `[CIRCUS_AXIS_X, −30.65]` and their mirrors — so no rendered
    geometry is left outside the ring and the player is stopped *before* the stone rather than inside
    it (the cap clears the player-blocked boundary by 0.14–0.18 at every sample; the tip's stone
    stops at Z −30.157 while the boundary reaches Z −30.45 on the axis). The perimeter goes 26 →
    **31 segments** (7 straights + 24 chords of the now **13-point** outline), i.e. `circus-*` is
    **31**, the registry is **141** colliders (110 non-circus + 31) with the same **31 rectangles**,
    the same **46 `colo-*` ids** and all ids unique; and it has **zero dangling endpoints** — the
    cap's apex sits on the arena axis, so it is its own mirror and the two halves meet there.
    `CIRCUS_ARCH_WEST_X` / `CIRCUS_ARCH_EAST_X` stay exported as the measured interior span they
    are. **The GLB is untouched — `public/_workspace_arena.glb` is byte-identical** (blob
    `d701424aab906c0b6af850cb7874505efe3d4809`, unmodified by every C-8.64A commit) **and the arena
    transform is unchanged** (`[52.34, −0.05, 43.80]`, yaw `π/2`, scale `0.20`).
  - *Automated movement tests (the shipped `resolveCityMovement`, in the suite).* §B asserts the ring
    is closed with no free end, that every west-profile point is on-or-outside the measured
    silhouette and none is inside stone; §C re-derives the rendered openings from the asset and shows
    the carceres cross-section and the north mouth refuse a player-sized sweep at every height; §D
    walks in from the southern apron (stopped at Z 46.40, outside the block) and from the north
    (stopped outside the cap), sweeps every approach and shows the whole arena can still be walked
    *around*; §G's control replays the pre-correction ring and shows its two mouths let the player
    cross through stone — so the closure is what stops it, not a coincidence of the walk's start
    point. This is **the movement guarantee**: the resolver blocks entry into the arena's solid
    geometry at both ends and never leaves the player inside rendered stone.
  - *Not verified — appearance.* None of the above is visual acceptance. **The rendered arena has
    never been seen in this sandbox** (see the NOT-verified bullet below), so a **future, explicitly
    authorized art/geometry change is required before either entrance can become traversable**: this
    correction closed the colliders, it did not widen a gate past the player's 0.80 diameter and it
    changed no art. C-8.64B remains explicitly **not** started.
- **Nothing else is reachable and nothing else moved.** Exact nearest clearance from the arena
  perimeter to every other collider (`gladiator-academy` 5.2451 to `circus-oval-w-2`, then
  `armor-workshop` 5.7300, `doctore-house` 7.3800, `merchant-house` 8.5300, `stable` 8.6300,
  `general-store` 12.5300); no non-circus collider's box overlaps the arena's; the non-circus
  registry is the same **110 colliders / 31 rectangles / 46 `colo-*`** with identical ids; and the
  **easternmost non-circus collider is `gladiator-academy` at x 34.350**, i.e. nothing at all in the
  city lies east of the ±35 square — so the envelope reaches only open ground around the arena. The
  city square's own limits are untouched (`BOUNDARY_X` 35, `BOUNDARY_Z_MAX` 35, `BOUNDARY_Z_MIN`
  −101); the envelope is `CIRCUS_ENVELOPE_X_EAST` **67.5** (= the east wall 66.30 + 1.20),
  `CIRCUS_ENVELOPE_Z_MIN` **−35.0**, `CIRCUS_ENVELOPE_Z_MAX` **47.5** (= the carceres' front face
  46.00 + 1.50), and it applies **east of x > 35 only** — inside that band the Z limits are the
  district's, outside it the city's, so no city region other than the arena's own surroundings is
  opened. Note the band spans Z −35.0 … 47.5 and therefore *contains* the city's whole +Z extent:
  the +X limit at Z 40 (and at Z 0) is the district's 67.5, and the city's ±35 is now reached only
  at Z < −35 or Z > 47.5 — exactly what `scripts/collisionTests.ts` asserts in two tests.
- **One real data defect fixed: the perimeter's north jamb was inside the stone.** The outline's
  last point was `[CIRCUS_ARCH_WEST_X, −30.08]` = (49.84, −30.08), described as "the arch's west edge
  on the silhouette". Measured by the outline's own documented method (±0.6-window minimum of the
  Y ≤ 4.5 cloud) that point departs **+1.460** from the silhouette — every other point matches its
  own window minimum within 0.094 — and is ~0.66 inside the stone even at its own Z. The window
  minimum there is the sphendone's shoulder at Z −29.587 (`Marble_01`, X 48.380, Y −0.05 … 4.01), so
  the point is now `[48.38, −30.08]` and the north mouth measures **7.92**, not 5.00. The correction
  moves the ring **outward**, never inward: the perimeter is now on-or-outside the measured
  silhouette everywhere, and the ring's free ends are the outline's last point and its mirror. The
  arch's own 5.00 span stays exported (`CIRCUS_ARCH_WEST_X` / `CIRCUS_ARCH_EAST_X`) as the measured
  fact it is; it is an interior monument, not this mouth.
- **Rebased, not weakened.** `scripts/collisionTests.ts`'s `+X clamped to 35` was the one assertion
  the envelope genuinely obsoleted — it pushed from `[34, 0, 0]`, a Z the district band now covers —
  so it is taken at `CIRCUS_ENVELOPE_Z_MIN − 5` (the same ±35 semantics, unchanged) and a **new**
  test asserts the district's 67.5 inside the band, i.e. one assertion became two. Ten suites pinned
  the registry with an absolute count from their own phase (110) as a *scope guard* ("no collider
  moved"); each was rebased to **141** with a comment naming C-8.64A's added `circus-*` segments —
  26 at placement, then **31** after the entrance-alignment closure — keeping the 31 rectangles, the
  46 `colo-*` ids and every id-uniqueness check. Every count change is explained by the registry
  change alone (110 + 31, nothing else touched), and the ten suites' ids, rectangles and per-prefix
  counts were re-verified unchanged; the closure's five extra segments are `circus-carceres-front`
  plus the four cap chords. Nothing was relaxed, and no count assertion was deleted.
- **The phase's own suite was committed broken and is now repaired, not accommodated.** It measured
  the asset in the raw Z-up frame (it asserted that every node was untransformed) and so failed 15
  of its 35 tests — its "track surface flush" check read Y 8.35 against the real −0.05. It now
  multiplies each node's world matrix in first, asserts the 76 identical node matrices instead of
  their absence, counts the segments the ring actually registers (26 before the closure, **31**
  after), names the carceres cheeks' *front* ends as the dangling ends (it had named their
  south-face ends, which are interior corners),
  derives the north jambs from the outline, tolerates the resolver's 0.38 step when a walk is
  stopped by a wall, starts its two apron walks inside the envelope (a start beyond Z 47.5 is
  out-of-bounds and the clamp snaps it to `[35, 35]`), tests the city square against the band's
  south edge rather than Z 40 (which the band covers), and strips comments before asserting the
  component contains no `clone(`. `phaseC8_41`'s and `phaseC8_47`'s test names, and the C-8.62
  suite's own prose, now say what they mean. The two negative assertions that had been defeated by
  the component's own docstring are comment-proof.
- **Verified 2026-10-18 (placement, `44721b9` / `507558b`)** in the dev container: focused
  `bun test src/utils/phaseC8_64a.test.ts` → **35 pass / 0 fail**; `bun test` → **1508 pass / 0 fail
  (47 files, 23867 expect() calls)**; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) → **exit 0** (the suite had six TS18047 `getArray()` null errors,
  never linted before — now guarded); `bun run build` → exit 0 (the pre-existing >500 kB chunk
  warning only); `git diff --check` → clean. The validation's starting point was **27 failing
  `bun test` cases and one failing collision test**, all of them this phase's. Preview: the hub boots
  from `Play as Guest` with the canvas mounted, `/_workspace_arena.glb` is requested and answers
  **HTTP 200**, and there are **zero console errors and zero failed requests**; the dev server serves
  the corrected `collisionShapes.ts` (`[48.38, -30.08]` present in the transformed module).
- **Verified 2026-10-19 (entrance-alignment closure, `64e31a8`)** in the dev container — re-run in
  full rather than inferred from the earlier pass: focused `bun test src/utils/phaseC8_64a.test.ts` →
  **38 pass / 0 fail** (2530 expect() calls; the suite grew 35 → 38 with the closed-ring,
  no-dangling-end, rendered-opening and driven-walk sections); `bun test` → **1511 pass / 0 fail
  (47 files, 25156 expect() calls)**; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**,
  exit 0; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing
  >500 kB chunk warning only); `git diff --check` → clean (the turn's only change is this document).
  The registry was read directly from the shipped module rather than from a test: **141 colliders —
  110 non-circus + 31 `circus-*` — 31 rectangles, 109 segments, 1 circle, 46 `colo-*`, 141 unique
  ids**; the arena GLB's blob hash was compared to `HEAD`'s and matches
  (`d701424aab906c0b6af850cb7874505efe3d4809`), and `EastCircusArena.tsx` still carries
  `[52.34, −0.05, 43.8]` with yaw `π/2` and scale `0.20`, so **the asset and the transform are
  demonstrably unchanged**.
- **NOT automatically verified — the rendered arena.** No frame of the arena itself was obtained:
  it stands 26+ units east of the plaza the player spawns in, the hub renders through SwiftShader at
  ~2 fps with the movement step clamped (~0.6 units per second of wall time), so a walk to the
  district exceeds a script budget — the same limit C-8.36, C-8.37 and C-8.55 recorded. **A device
  (Android) look is therefore required** before anything about the arena's *appearance* is claimed:
  whether the GLB's eight materials and authored UV tiling read correctly at scale 0.20, whether the
  closed perimeter's faces read as *stopping* the player outside the stone at both ends (the
  closure's whole point — the player is refused at the carceres' front face and at the cap laid north
  of the solid tip), and whether the district reads as reachable from the city's east edge. Still open from earlier phases: the C-8.57
  pediment/order-under-the-eave reading, the C-8.53 lean-to bearing, the C-8.52 veranda canopy, the
  C-8.49 wall-to-gable junctions, the C-8.51 awning, the C-8.41 kerb, the C-8.38 northern approach,
  the C-8.28 bowl cut, the C-8.29 junction and the C-8.31/C-8.33 rear-gate checks. **Do not claim
  Android visual acceptance, and do not claim the arena renders correctly on the target GPU** — this
  sandbox cannot settle it.
- **Known limitations of this phase, carried forward (updated by the closure):** (a) **the arena
  cannot be entered at all** — both ends are closed by a collider-only ring because neither has a
  player-sized rendered passage, so this is now a documented *refusal* rather than the placement
  prototype's walk-through-stone defect; **a future, explicitly authorized art/geometry change is
  required before either entrance can become traversable**, and nothing in this phase changed the
  art. (b) The seating banks, the carceres piers and the spina still carry no colliders — they all
  now lie inside the closed ring, which the player can no longer reach, so the interior is documented
  as unreachable rather than collided. (c) No chariot, no racing gameplay, no hub, no fast travel and
  no racing loop exists yet — the arena is a placement prototype, and C-8.64B (the district's
  remaining shell) was explicitly **not** started — **Phase C-8.64B built it; its record, and the
  completion pass that finished and re-validated it, are the section below.**

## East Circus District — access roads, forecourt and boundary (Phase C-8.64B — implemented, completed and validated)

- **What the phase ships** (`28145c2`, the branch's tip when this phase was closed):
  `src/utils/circusDistrictGeometry.ts` — the pure layout module that is the single source of the
  pavement the component draws *and* the pavement the suite asserts, so the two can never drift;
  `src/components/3d/city/EastCircusDistrict.tsx` — the paved shell (four runs, the carceres
  forecourt, the parapet, three kerbs; 20 static meshes, no per-frame work, no new material, no new
  texture — the forecourt's bump map is a clone of the shared `NOISE_TEXTURE`, which shares its
  canvas image), mounted **exactly once**, from `CityHubScene.tsx:625`; one new collider in
  `collisionShapes.ts` (`forecourt-parapet`); and the district-access envelope's south limit in
  `cityCollisions.ts`. No file under `public/` changed.

- **The layout, with centre lines and world footprints** (every figure below was recomputed from the
  shipped module and the shipped registry in a throwaway harness in the `web` container, and is also
  pinned in `src/utils/phaseC8_64b.test.ts`):

  | run | centre | size | world footprint |
  |---|---|---|---|
  | `circus-approach` (east–west) | (30.375, 7.50) | 15.25 × 6.00 | X 22.75 … 38.00, Z 4.50 … 10.50 |
  | `circus-approach-link` (east–west) | (19.025, 8.25) | 7.45 × 3.00 | X 15.30 … 22.75, Z 6.75 … 9.75 |
  | `circus-via` (north–south, the arena frontage) | (36.50, 28.30) | 3.00 × 35.60 | X 35.00 … 38.00, Z 10.50 … 46.10 |
  | `circus-service-lane` (east–west) | (32.375, 20.50) | 5.25 × 5.00 | X 29.75 … 35.00, Z 18.00 … 23.00 |
  | `circus-forecourt` (plaza) | (50.25, 50.30) | 30.50 × 8.40 | X 35.00 … 65.50, Z 46.10 … 54.50 |

  **Ground coverage: 503.1 sq units of new paving** (roads 246.9 — 91.5 + 22.35 + 106.8 + 26.25 —
  plus the forecourt's 256.2). The four junctions are shared *edges*, not gaps: the link meets the
  approach along X 22.75 (Z 6.75 … 9.75), the approach meets the frontage run along Z 10.50
  (X 35 … 38), the service lane meets it along X 35.00 (Z 18 … 23), and the frontage run opens into
  the forecourt along Z 46.10 (X 35 … 38). No two paved surfaces overlap on both axes, so no slab
  z-fights another.

- **Usable walking width, with the player's own 0.40 radius applied** — the request's 0.15–0.50
  figures are *pavement-to-collider clearances*, not passages, and every route's real usable band
  was measured rather than assumed:

  | passage | plan gap between colliders | usable centre band (r 0.40) | pavement under the band |
  |---|---|---|---|
  | forum link (Forge north face 6.60 ↔ Inn south face 9.95) | 3.35 | **2.55** (Z 7.00 … 9.55) | fully paved — the 3.00-wide link covers it |
  | frontage run (city limit X 35.00 ↔ arena wall 38.38) | 3.38 | **2.98** (X 35.00 … 37.98) | fully paved (0 bare samples at 0.05 spacing) |
  | approach (Workshop north face 4.00 ↔ Stable south face 11.15) | 7.15 | **6.35** (Z 4.40 … 10.75) | the 6.00 pavement covers its middle; 0.35 of bare kerb-side ground remains at each building line, which is where its two kerbs are laid |
  | service lane (Stable east face 29.75 ↔ the frontage run at 35.00) | 5.25 | **4.85** | fully paved |

  So the tightest *passage* a player walks through is the forum link's 2.55 of usable width — 3.2×
  the player's own 0.80 diameter — and the two "0.15 / 0.20" figures are the link's kerb-side
  clearances to the Forge and the Inn, deliberately narrow because the link is a paved corridor laid
  between two buildings, not a gap a player must thread.

- **Measured clearances, all recomputed** (registry rectangles/segments read directly):
  approach → Armor Workshop **0.5000**, approach → Imperial Stable **0.6500**, link → Smithing Forge
  **0.1500**, link → Caravanserai **0.2000**, frontage run → arena west wall **0.3800**, forecourt →
  carceres front face **0.1000**, forecourt → arena shell's south face **2.3000**, forecourt → arena
  east wall line **0.8000**, forecourt south edge → parapet near face **0.0000** (flush), parapet's
  outer face **= the envelope's south limit 55.00**, parapet → nearest other collider
  (`circus-carceres-w`) **8.5000**, and the nearest pavement point to the arena ring **0.1000** (the
  forecourt/carceres line above).

- **The movement envelope is a union with the city square, and only its south limit changed.**
  `CIRCUS_ENVELOPE_X_EAST` **67.5** (= the arena east wall 66.30 + 1.20) and `CIRCUS_ENVELOPE_Z_MIN`
  **−35.0** are C-8.64A's; `CIRCUS_ENVELOPE_Z_MAX` **47.5 → 55.0**, which is the forecourt parapet's
  outer face. The city square's own limits (`BOUNDARY_X` 35, `BOUNDARY_Z_MAX` 35, `BOUNDARY_Z_MIN`
  −101) are untouched, and the two rules that make the shared edge X = 35 consistent are unchanged:
  the district band's west floor is `BOUNDARY_X` south of the city (so a westward walk stops there
  instead of being clamped into the square), and `clampBoundaryZ` treats X = 35 itself as
  district-side (so a player stopped on the limit is not pulled north).

- **Collider changes: exactly one.** `forecourt-parapet` — centre (50.25, 54.75), 30.50 × 0.50, i.e.
  X 35.00 … 65.50, Z 54.50 … 55.00, the body of the 0.90-high travertine wall (0.10 coping
  overhanging 0.05, above the player's shoulder line). Read from the shipped module: **142 colliders
  — 111 non-circus + 31 `circus-*` — 32 rectangles, 109 segments, 1 circle, 46 `colo-*`, 142 unique
  ids.** The kerbs carry **no** colliders (the city's own 0.16-high curbs are equally collider-free:
  a curb is stepped over, not walked around), and no existing collider moved.

- **What did not move: the arena.** `public/_workspace_arena.glb` is byte-identical (git blob
  `d701424aab906c0b6af850cb7874505efe3d4809`, unchanged at this pass), `EastCircusArena.tsx` still
  carries `[52.34, −0.05, 43.8]` with yaw `π/2` and scale `0.20`, and the perimeter is still C-8.64A's
  **closed 31-segment ring** with the same ids (`circus-south-w/e`, the two carceres cheeks plus
  `circus-carceres-front`, the two flanks, and `circus-oval-w/e-0…11`). Nothing inside the ring was
  touched, and the forecourt faces the closed carceres end without covering it (0.10 clear of the
  block's own face plane).

- **Regression suite: `src/utils/phaseC8_64b.test.ts`** — 34 tests across 7 sections, every figure
  derived from the two layout modules and the shipped registry: §A the layout (the four runs' derived
  rectangles, no two pavements overlapping, the junctions shown to be shared edges, every road's
  usable width, the forecourt facing the closed carceres end); §B clearances and the registry (no
  pavement blocked by any collider, the named neighbours' measured clearances, the arena ring's
  clearances, the registry grown by exactly one rectangle — the parapet — and the kerbs shown
  decorative and outside their roads); §C the routes **driven with the real `resolveCityMovement`**
  (3.8 u/s, 0.1 s steps = 0.38/step) in both directions, every road traversed across its full width,
  and the junctions shown to turn; §D the forecourt (the parapet closing its south edge and stopping
  a walk at every point across its length, the ring refusing entry through the carceres end, the
  forecourt opening east into the perimeter corridor, and every reachable cell of its pavement
  standable); §E the envelope (the city square bit-for-bit, the band reaching the parapet and no
  further, the driven limits, the shared edge X = 35 consistent in both axes, and no pavement outside
  the envelope); §F the **control** replaying C-8.64A's own band (47.5) through the same predicates,
  showing the old band left the forecourt's south half out of bounds and teleported a player walking
  west off it; §G the scope guard (the asset and its transform, the 31-segment ring, the city's own
  road materials, the layout module's purity and the district mounted exactly once, the roads on the
  existing ground plane).

- **Completion pass (2026-10-19) — what this turn actually changed, and why.** The implementation was
  already committed; the suite failed **1 of 34** and the repo's absolute registry pins were stale.
  Every change is a *test* change — no production file was touched.
  1. **The failing test started inside the arena.** §E's southward walk began at `(50, 40)`, which
     C-8.64A's band made sense of (`CIRCUS_ENVELOPE_Z_MAX − 0.5` = 47.0, the carceres apron) but which
     is, in this world, **inside the arena's closed ring** — the ring's south boundary is the carceres
     front face at Z 46.00, and the start is 6.0 north of it. The walk therefore never left the
     arena's interior and ended on the carceres' own face (45.32). It now starts on the forecourt's
     own north band, 0.5 south of the apron line, and the test is **stronger** than before: it asserts
     the walk passes the city square's limit, reaches the forecourt's south half, stays short of the
     envelope limit, is never inside the parapet, and is **stopped within one 0.38 walk step of the
     parapet's own contact line** (54.50 − 0.40 = 54.10), with every step collision-free.
  2. **One assertion became several: the old band's limit is no longer pinned as a walk start.**
     C-8.64A's four driven routes in `phaseC8_64a.test.ts` wrote their apron start as
     `CIRCUS_ENVELOPE_Z_MAX − 0.5`, i.e. from a boundary the district has since moved past; they now
     read the named `CARCERES_APRON_Z = CIRCUS_CARCERES_FRONT_Z + 1.5` (**47.5**), derived from the
     geometry the apron is named after. Its envelope test now pins `CIRCUS_ENVELOPE_Z_MAX` **55.0**
     and asserts it is greater than that apron; its clamp test derives both bounds from the constant
     and gained an in-band case (5 assertions where there were 4).
  3. **Twelve scope guards rebased 141 → 142 and 31 → 32** (`phaseC8_41`, `45`, `47`, `49`, `51`,
     `52`, `53`, `55`, `57`, `60`, `62` and C-8.64A's own `110 → 111` non-circus count), each with a
     comment naming C-8.64B's `forecourt-parapet` as the one addition. Every id-uniqueness check, the
     46 `colo-*` count, the movement constants and the 31 `circus-*` segments are unchanged: the
     arithmetic is entirely explained by 110 + 31 + 1 = 142 and 30 + 1 + 1 = 32. Nothing was relaxed
     and no assertion was deleted.
  4. **The parapet was confirmed not to introduce a movement discontinuity.** A throwaway harness
     (kept in `/tmp`) drove the shipped resolver: 30 walks south across the parapet's whole 30.50
     length are each stopped **0.1400** short of its contact line (within one 0.38 step) with no
     colliding endpoint; all four kerb lines are crossed by a walk with max step **0.3800** and no
     collision; the forecourt's east opening runs to the envelope's east limit (67.50) and the
     perimeter corridor runs north round the arena, both collision-free; and 36 westward walks across
     the city/district seam at Z 36 … 54 drift **0.000000** in Z (the teleport C-8.64B removed).
     One honest edge case, reported rather than fixed: because the union is enforced by a *clamp*, a
     start **outside both envelopes** (e.g. (33.10, 39.20) — west of the city limit at a Z south of
     the city's own bound) is projected onto the district's west floor X 35 in one 1.9-unit step. No
     reachable path can produce such a position (the city side's Z clamp holds Z ≤ 35 while X < 35,
     and X ≥ 35 is district-side), and every driven route's step is ≤ 0.38 with zero clamp-bitten
     frames.

- **Verified 2026-10-19** in the dev container, re-run in full rather than inferred from the earlier
  pass: focused `bun test src/utils/phaseC8_64b.test.ts` → **34 pass / 0 fail** (3535 expect() calls;
  the starting point was 33/1) and `src/utils/phaseC8_64{a,b}.test.ts` together → **72 pass / 0 fail**;
  `bun test` → **1545 pass / 0 fail (48 files, 28710 expect() calls)** (the starting point was 1526/19
  — all 19 were the stale registry pins and the one in-ring start, i.e. this pass's own list);
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only);
  `git diff --check` → clean. The registry counts above were read from the shipped module rather than
  from a test, the GLB's git blob hash was compared with C-8.64A's record, and `EastCircusDistrict` is
  referenced from exactly one mount site. The 13 changed files are all suites under `src/utils/`.

- **Independent route measurements (throwaway harness, `/tmp`, the shipped resolver and registry).**
  Forum → west link → approach → frontage run → forecourt: 198 steps, ending (36.60, 53.85) at the
  parapet, max step **0.3800**, **0 blocked** and **0 clamp-bitten** frames; the return route
  (forecourt → frontage run → approach → link → forum): 178 steps, ending (13.70, 7.92), max step
  **0.3800**, 0 blocked, 0 clamp-bitten. **The ring refusal**: the 31 segments chain into a simple
  closed polygon (31 vertices, closed), and 24 radial approaches from outside — 2686 steps — leave
  **0 steps inside the ring**; the arena's interior also reads as inside the ring while the apron and
  tip probes read as outside. **Overlaps**: no pavement interpenetrates any collider, no kerb stands
  on a slab, and the parapet overlaps nothing (its nearest neighbour is 8.50 away). The only
  pre-existing rectangle/rectangle interpenetrations are the six known ones (the two Ishtar
  composites and the four fortress wall joins), unchanged.

- **One measured seam, reported rather than "fixed": the forum's paving and the link do not meet.**
  The forum plaza is a 16.5-radius disc about [0, 0], so its east reach falls away from the link's
  west face (X 15.300) as Z increases: at the link's north edge (Z 6.75) the bare gap is **0.244**
  (the figure the module documents as the design intent — the two paved surfaces are deliberately
  kept from coinciding), at the link's centre (Z 8.25) it is **1.011**, and at its south edge
  (Z 9.75) **1.989**. Both driven routes therefore cross 2 bare steps at the link's centre line. This
  is geometry the C-8.64B record's own clearance rule produces, not a regression from this pass, and
  it is left alone here: changing it means moving the link's west terminus (or extending the plaza's
  paving), which is a layout decision for an explicitly authorized phase, not a validation fix.
  **Phase C-8.65 was that phase, and it did neither: it filled the wedge with one flat slab tucked
  under the plaza's own edge, so the link's terminus and the plaza's paving are exactly as recorded
  here — see its section below for the measured gap (0.311 … 2.061 drawn, 0.244 … 1.989 true
  circle), the 3.295 sq units it covers, and the control that shows every sample bare before it.**

- **Not automatically verified — the rendered district, and it is a device question.** The preview
  boot was checked (title → `Play as Guest` → the 3D hub renders, canvas mounted, `/_workspace_arena.glb`
  **HTTP 200**, 0 failed requests, **0 console errors**; warnings are the known
  `BuilderBridge`/`MusicEngine`-missing-track pair and one `WebGLHealthMonitor` GPU-stall notice from
  the software renderer). The live dev server was separately confirmed to serve the district's own
  source (all four modules HTTP 200, with `forecourt-parapet` present in the transformed
  `collisionShapes.ts` and `CIRCUS_ENVELOPE_Z_MAX = 55` in `cityCollisions.ts`). **But no frame of the
  district itself was obtained**: it stands 26+ units east of the plaza the player spawns in, the hub
  renders through SwiftShader at ~2 fps with the movement step clamped (≈0.6 units per second of wall
  time), so a walk to it exceeds a script budget — the same limit C-8.36/C-8.37/C-8.55/C-8.64A
  recorded. **Android visual acceptance is therefore PENDING** for: the four runs reading as paved
  stone joined at their junctions, the forecourt reading as a gathering space facing the closed
  carceres end, the parapet reading as the district's visible south wall (and the player *stopping* at
  it), the three kerbs reading as curbs rather than walls, and the bare seam between the forum plaza
  and the link's west end. Still open from earlier phases: C-8.64A's arena appearance and closed-ring
  reading, the C-8.62 pediment rakes, the C-8.60 wreath, the C-8.57 portico, the C-8.53 lean-to, the
  C-8.52 veranda canopy, the C-8.49 wall-to-gable junctions, the C-8.51 awning, the C-8.41 kerb, the
  C-8.38 northern approach, the C-8.28 bowl cut, the C-8.29 junction and the C-8.31/C-8.33 rear-gate
  checks. Do not claim Android visual acceptance.

- **Remaining limitations of the district (carried forward, unchanged by this pass).** (a) **The
  arena still cannot be entered** — C-8.64A's closed 31-segment ring stands, and a future, explicitly
  authorized art/geometry change is required before either entrance can become traversable. (b) No
  chariot, no racing gameplay, no hub, no fast-travel arrival and no racing loop exists in the
  district yet; it is a paved approach and a forecourt, not a racetrack. (c) The arena's seating
  banks, carceres piers and spina still carry no colliders — they lie inside the closed ring, which
  the player cannot reach. (d) The kerbs and the parapet's coping are decorative/above the player
  plane respectively; the parapet's *body* is the only new collidable surface. (e) The forum ↔ link
  seam measured above — **Phase C-8.65 closed it, and its record follows; the other four
  limitations stand unchanged.**

## East Circus District — forum-link mouth apron (Phase C-8.65 — audit + implemented)

- **The audit found one gap worth fixing, and nothing else moved.** Every other item on the C-8.65
  list re-measured as C-8.64B left it (see "what did not move" below). The seam is a *rendered*
  gap, not a documentation artefact: the forum's plaza paving is a disc about [0, 0]
  (`ProcessionAvenue`, `<circleGeometry args={[16.5, 36]}>` on a mesh at Y 0.005) while the
  district link's west face is a straight line at X 15.30, so across the link's own 3.00 Z band the
  plaza's **36-gon** edge — not its circumscribing circle — falls away from the link:

  | Z (the link's band) | plaza edge X | gap to the link — drawn (36-gon) | (true circle) |
  |---|---|---|---|
  | 6.75 — north edge, the Forge side | 14.9889 | **0.311** | 0.244 |
  | 8.25 — band centre | 14.2894 | **1.011** | 1.011 |
  | 9.75 — south edge, the Inn side | 13.2391 | **2.061** | 1.989 |

  **3.295 sq units of bare sand** — up to 2.06 of the link's 3.00 width — at the mouth of the only
  paved route from the forum into the district, and 0.055 below the plaza's surface (plaza plane
  0.005, city ground plane −0.05), so it read as a paved break with a lip. C-8.64B's recorded 0.244
  / 1.011 / 1.989 are the **true-circle** clearances; a 36-gon's chords sit up to 0.063 inside its
  circle, so the drawn gap is the wider figure the player actually sees. It is a visible gap; it is
  **not** a bottleneck (bare ground is walkable) and it confuses no route.

- **The refinement is one slab, not a layout change.** `CIRCUS_LINK_MOUTH_APRON` (and its derived
  `CIRCUS_LINK_MOUTH_APRON_RECT`) in `circusDistrictGeometry.ts` plus ONE plane mesh in
  `EastCircusDistrict.tsx` (**20 → 21 static meshes**): X 13.10 … 15.30, Z 6.75 … 9.75, Y **0.003**,
  in the plaza's own `ROMAN_PALETTE.forumPaving` stone. Its east edge **is** the link's west face
  and its Z band **is** the link's band, so the link starts exactly where the slab ends; its west
  edge is deliberately **inside** the plaza's rendered paving (0.139 clear of the polygon at the
  band's south edge), where the plaza's disc (0.005) and its gilded ring (0.008) both stand above
  it and cover the join. It is therefore visible only in the bare wedge: plaza stone runs unbroken
  into the Via Circensis, the gold ring is **not** notched, the slab overlaps no other pavement on
  both axes, and 2 mm of separation is ~8× the depth precision at that distance, so nothing
  z-fights. **It carries no collider** — like the four runs, the plaza and the kerbs it is pavement
  the player walks over.

- **What did not move.** The link's west terminus, centre and width; the plaza and its component;
  the four runs, the forecourt, the parapet and the kerbs; the arena — GLB byte-identical (blob
  `d701424aab906c0b6af850cb7874505efe3d4809`), transform `[52.34, −0.05, 43.8]` with yaw `π/2` and
  scale `0.20`, and the **closed 31-segment ring** untouched; the collision registry (**142
  colliders — 111 non-circus + 31 `circus-*` — 32 rectangles, 109 segments, 1 circle, 46 `colo-*`**,
  all ids unique, unchanged by this phase); the movement envelope (`CIRCUS_ENVELOPE_X_EAST` 67.5,
  `Z_MIN` −35.0, `Z_MAX` 55.0; the city square's 35 / 35 / −101); the ground plane; fog, lighting
  and shadows; and C-8.64B's measured clearances — the apron sits 0.15 clear of the Smithing
  Forge's collider face and 0.20 clear of the Caravanserai's across the band. No decorative
  structure, no new asset, no new material, texture or light.

- **Regression suite: `src/utils/phaseC8_65.test.ts`** — 21 tests / 7331 assertions across 5
  sections, every figure re-derived (the plaza's 36-gon is **parsed out of `ProcessionAvenue.tsx`**
  and its boundary computed from the polygon's own vertices, never restated): §A the seam (the
  derived gaps above, the wedge's integrated area, the true-circle pair, the 0.055 sand lip and the
  ground plane's coverage); §B the apron (its edges and band, the 0.139 minimum tuck, the 2 mm /
  0.053 mm depth margins, no interpenetration with any pavement, no collider, and the component's
  source guard re-run: exactly one draw, no literal 13.1, only the plaza's material, still exactly
  one `clone(`, no light, no per-frame state, no GLTF); §C **driven with the real
  `resolveCityMovement`** (3.8 u/s, 0.1 s steps = 0.38/step) — the plaza → link route started from
  *inside the plaza at X 13.0* (the C-8.64B suite starts at 16.0, already east of the seam) and the
  return leg, every centre across the apron's usable band standable, three Z-level crossings each
  way, and the carceres end still refusing entry at four X samples; §D preservation (registry,
  the four runs / forecourt / parapet / kerbs re-derived, the envelope, the asset hash and
  transform, the single mount site); §E the **control** — the pre-fix pavement set (everything but
  the apron) leaves **all 2623 wedge samples bare** and the shipped set covers every one of them,
  while a polar sweep of the gilded ring's own annulus shows the ring still lies wholly on the
  plaza's paving.

- **Verified 2026-10-19** in the dev container: focused
  `bun test src/utils/phaseC8_{64a,64b,65}.test.ts` → **93 pass / 0 fail** (13409 expect() calls);
  `bun test` → **1566 pass / 0 fail (49 files, 36041 expect() calls)** (C-8.64B's completion pass
  left 1545 / 48; the delta is this suite's 21 tests and 1 file); `bun run scripts/collisionTests.ts`
  → **123 passed, 0 failed**, exit 0; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` →
  exit 0 (the pre-existing >500 kB chunk warning only; `dist/` is gitignored); `git diff --check` →
  clean. The phase's files are three: `src/utils/circusDistrictGeometry.ts`, the district component
  and the new suite.

- **Preview evidence, and what could not be captured.** Live checks in the preview browser: the dev
  server serves the changed modules — the transformed `circusDistrictGeometry.ts` carries
  `CIRCUS_LINK_MOUTH_APRON` and `westX: 13.1`, and the transformed `EastCircusDistrict.tsx` reads
  the module's own numbers with no `13.1` literal — and the app boots (`Play as Guest` → the **3D
  city hub** renders, canvas mounted) with **0 console errors and 0 failed requests** after the
  change. **No frame of the district was obtained.** The player spawns at [0, 0, 16] — the plaza's
  south exit — so the seam stands ~16 units north-east of it; the hub renders through SwiftShader at
  ~2 fps with the movement step clamped (≈0.6 units per second of wall time), and a scripted
  21-second W+D walk produced **no visible change in position** (the captured frame still shows the
  plaza, its fountain and the Colosseum), so the vantage was not reached and no further attempt was
  made — the environment limit C-8.36/C-8.37/C-8.55/C-8.60/C-8.64A/C-8.64B all recorded.
  **Android visual acceptance is therefore PENDING**, for the apron specifically: stand at the
  forum's eastern exit and confirm the marble paving runs unbroken from the plaza's gilded ring into
  the Via Circensis' link — no sand strip and no step at the link's west face — with the ring's own
  outer edge still terminating cleanly on the plaza's boundary. Still open from earlier phases:
  C-8.64B's four runs / forecourt / parapet / kerb readings, C-8.64A's arena appearance and
  closed-ring reading, the C-8.62 pediment rakes, the C-8.60 wreath, the C-8.57 portico, the C-8.53
  lean-to, the C-8.52 veranda canopy, the C-8.49 wall-to-gable junctions, the C-8.51 awning, the
  C-8.41 kerb, the C-8.38 northern approach, the C-8.28 bowl cut, the C-8.29 junction and the
  C-8.31/C-8.33 rear-gate checks. Do not claim Android visual acceptance.

- **One documentation inconsistency found, deliberately not "fixed".** `circusDistrictGeometry.ts`'s
  reference list labels the Smithing Forge's Z 6.60 face "north 6.60" and the Caravanserai's Z 9.95
  face "south 9.95", which is inverted against the city's own convention (the plaza's NORTH exit is
  at Z −16 toward the Colosseum at Z −25, and the SOUTH exit at Z +16 toward the tavern and the town
  gate at Z +14/+24 — so +Z is south). The *numbers* are the collider faces the resolver uses and
  are correct; only the two words are inverted, and the C-8.64B record uses the same labels, so this
  phase changed no wording and states the band by its world Z instead (6.75 … 9.75, the Forge side
  to the Inn side).

## Chariot Workshop (Phase C-8.66B — implemented; UI validated, purchase click unverified)

- **What it is.** A chariot fit-and-finish screen mounted as a **subview of the existing Armory (gear)
  tab** — no sixth global tab. The **Imperial Stable** hub location (`cityCollisions.ts`, `tabKey:
  'gear'`, `subTab: 'chariot'`) opens it through the existing `onOpenTab(tabKey, subTab)` callback;
  the Armory also offers it as its own pill. Two slots, `wheels` (a real, separately modelled kit
  variant) and `finish` (material recolours of the chariot's own `Wood`/`DarkWood`/`Bronze`/`Leather`
  materials, the GLB left byte-identical); Spiked and Bladed wheels are in the uploaded kit but are
  deliberately not sold (their rims reach 0.8025 / 0.8429 against the reinforced set's 0.7025).
  Purchases use the existing `gold` field and the existing `saveProfile()` path — no second currency,
  no second storage key. Nothing here feeds combat or stats.

- **Catalogue isolation.** Chariot parts are their own catalogue (`src/data/chariotParts.ts`); nothing
  was added to `ITEMS_DB`, whose `'damageLight' in i` / `'defense' in i` narrowing every shop and gear
  screen depends on. The loadout module (`src/utils/chariotLoadout.ts`) is pure: it imports neither the
  storage layer nor `localStorage`, returns a **new** profile on success and the caller's own object on
  refusal, and resolves a legacy save (no `chariot` field), a partial loadout and an unknown id to the
  stock chariot instead of throwing.

- **The missing type declarations (repaired this turn).** Phase C-8.66B shipped the feature without
  adding `ChariotSlot`, `ChariotLoadout` and `PlayerProfile.chariot?` to `src/types/game.ts`, so the
  repo's own `lint` (`tsc --noEmit`) failed with 23 errors even though the app ran — Vite strips types
  and never type-checks. They are now declared there (`chariot` is **optional**: every pre-workshop save
  has no such field, and `createNewProfile()` still writes none).

- **`src/utils/phaseC8_66b.test.ts` — test-side corrections.** Five assertions were wrong about the
  code or the assets, not the other way round, and were fixed as such: the two GLB paths were
  `../public/…` (resolving to the non-existent `src/public/`); the purchase/equip tests ran against
  `createNewProfile`'s **100 gold** while every paid part costs 180–450, so the tester now starts with
  5000 gold and the genuinely-poor path keeps its own test; the "App writes only through the pure
  helpers" check asserted no `gold: profile.gold - ` anywhere in `App.tsx`, which the **pre-existing**
  training and shop handlers legitimately contain, so it is now scoped to the phase's two chariot
  handlers; the registry check banned the string `chariot` from `cityCollisions.ts`, which the stable's
  legitimate `subTab: 'chariot'` hint contains — it now pins that the only two mentions are that hint
  (type and value); and the fitted rim's X thickness was pinned at an invented 0.07 when the asset
  measures **0.136** (thin against its 1.37 diameter). Two precision-9 comparisons of kit geometry put
  through a 90° rotation were relaxed to 6 — the accessor min/max are float32, so the re-measurement
  carries ~1e-8, and the assertion stays a re-measurement of the shipping GLB rather than a restatement.

- **Verified 2026-10-19** in the dev container: focused `bun test src/utils/phaseC8_66b.test.ts` →
  **50 pass / 0 fail** (489 expect() calls); `bun test` → **1616 pass / 0 fail (50 files, 36530
  expect() calls)**; `bun run lint` (`tsc --noEmit`) → clean; `bun run build` → exit 0 (the pre-existing
  >500 kB chunk warning only); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**;
  `git diff --check` → clean. This turn's source changes are two files: `src/types/game.ts` (the three
  declarations) and the suite above.

- **Preview evidence.** Drove the real route in the preview browser: title → `Play as Guest` → 3D city
  → nav drawer → fast travel to the **Imperial Stable** → its own `Visit Chariot Workshop` prompt →
  the Armory's Chariot Workshop subview. There the **3D chariot preview renders** (the model on the
  viewport's platform, via SwiftShader — the first captured frame of this feature), the cards show
  their prices, slot and class tags, descriptions, `Equipped` on the two stock parts and `Insufficient
  gold` with a **disabled** buy button for the four paid parts, the per-card `Preview` gesture moves the
  model to that part and raises `Reset preview`, and `Reset preview` returns it. At a 375 px viewport
  the cards stack to one column with **no sideways scroll** (`scrollWidth` = `clientWidth` = 375). One
  pre-existing console warning ("Attempted to synchronously unmount a root while React was already
  rendering") appears on the city → hub transition; it is React's own message from the WebGL guard's
  remount and predates this phase.

- **What is NOT verified — the purchase click.** The preview profile carries **100 gold** and the
  cheapest part costs 180, so neither the **Buy** nor an **Equip** click could be exercised in the UI: a
  run that seeded 2000 gold into the save could not be made to stick, because the preview session
  replays the account's own save on every fresh load, and faking the app's React state to afford a
  purchase is not an acceptable check. The underlying logic is covered by the suite (one deduction,
  no duplicates, no in-place mutation, refusals on insufficient gold / repeat buy / unknown id /
  missing profile, equip never touching gold, and a real `saveProfile()`/`loadSavedProfile()` round
  trip), but the **UI click path stays not automatically verified** — earn 180+ gold and buy a part to
  confirm it by hand. **Android visual acceptance is PENDING** for the workshop cards and the chariot
  preview on the target GPU. Cleanup: the preview browser's save was put back to its original value
  (gold 100, no `chariot` field) and the temporary backup key removed.

## Chariot Workshop transaction and visual-fit audit (Phase C-8.66C — audited, verified live)

- **Scope: verification only.** This phase changed **no workshop behaviour**. The whole shipped
  feature — `chariotParts.ts`, `chariotLoadout.ts`, `chariotGeometry.ts`, `ChariotPreview.tsx`,
  `ChariotWorkshopTab.tsx`, `GearTab.tsx`, `App.tsx`'s two handlers and the collision registry — is
  byte-identical, and the two chariot GLBs still hash to their audited values
  (`49e132e6…` and `d5b36add…`). What it *adds* is a **dev-only transaction harness** and a focused
  suite that closes the two gaps the audit found; the feature it verifies is the C-8.66B one.

- **`src/components/dev/ChariotWorkshopHarness.tsx` + one branch in `src/main.tsx`.** A
  DEVELOPMENT-ONLY screen (`import.meta.env.DEV`, so it is dead-code-eliminated from a production
  build) that mounts the **real** Armory subview — `GearTab` → `ChariotWorkshopTab` → the real
  `ChariotPreview` — against a **disposable** profile, so the purchase and equip clicks C-8.66B could
  not exercise (its profile has 100 gold; the cheapest part costs 180) can be driven end to end. It
  never calls `saveProfile` / `loadSavedProfile` and never names `PROFILE_STORAGE_KEY`: the disposable
  profile lives under its own key (`sand_and_steel_chariot_workshop_harness_v1`) in **per-tab scratch
  storage**, seeded from `?gold=<n>` (default 600) only when no disposable record exists. Buy and
  equip go through the **same** `purchaseChariotPart` / `equipChariotPart` calls and the same
  state-then-save flow App uses. Reachable by `?devHarness=chariot` **or** the equivalent dev-only
  `sand_and_steel_dev_harness = 'chariot'` scratch flag. Removal: delete the file and revert the
  branch (the import + the conditional); nothing else references it.

- **Two environment facts the audit measured, both worth remembering for future phases.**
  (1) **A query-parameter URL is delivered only when the preview tool performs the initial
  navigation.** After any shell command the platform re-loads the **home route**, and a
  `path`-based navigation then no longer carried `?devHarness=chariot` — the frame came back the
  title screen. (2) **Every fresh load restores the account's own session snapshot and clears the
  browser's storage**: canaries planted in `localStorage` *and* `sessionStorage` were both gone after
  the next fresh load, and so was the harness's disposable record. A **page-initiated reload inside
  the live document is not one of those loads** — it preserves scratch storage. So the transaction
  flow was driven in an in-page `<iframe>` that loads the harness URL itself: the top document stays
  the real app, the harness is a real second instance, and a reload of that frame is a real reload
  with the same disposable profile. The clicks were dispatched on the **real buttons** (the preview
  click helper refuses elements that live in the frame, so `element.click()` was used — a real DOM
  click delivered to React, not a state injection). Everything was cleaned up afterwards: the
  disposable record deleted from both stores, the frame removed, and the player's save verified
  byte-identical (1959 chars) before and after.

- **Transaction evidence, driven through the real UI** (each row is an assertion the harness read
  back from the rendered DOM *and* from the persisted profile):

  | step | observed |
  |---|---|
  | disposable profile on mount | gold **600**, owned `wheels_standard, finish_stock`, equipped stock |
  | **Buy (450)** on Reinforced wheels | gold 600 → **150** — exactly the listed price, one deduction |
  | ownership | `wheels_reinforced` appears **once** in `owned`; equipped is **unchanged** (`wheels_standard`) |
  | the card afterwards | `Preview` + **`Equip`** — the Buy control is gone, so a repeat purchase cannot be issued |
  | **Equip** Reinforced | equipped → `wheels_reinforced`, gold **still 150** (equipping never charges) |
  | **repeat Equip** click | control disabled; gold and loadout unchanged |
  | **Preview** Standard wheels | header reads `PREVIEWING (NOT EQUIPPED)` and `Reset preview` appears; gold and loadout **unchanged** |
  | **Reset preview** | back to `CURRENTLY EQUIPPED`; gold and loadout unchanged |
  | **insufficient gold** at 150 | all three paid finishes (180 / 240 / 320) read `Not enough gold.` with a **disabled** button; clicking them changes nothing |
  | **reload with the same disposable profile** | rehydrated from storage: gold **150**, `owned` still one `wheels_reinforced`, the Reinforced card reads **`Equipped`** and the preview shows the reinforced set |
  | the player's own save | **untouched** — byte-identical before and after, and never read by the harness |

- **The fitted wheels, re-measured from the shipping GLBs through the shipped transform** (a
  throwaway harness in the `web` container composed every glTF node matrix and moved the kit's real
  VERTICES, not just the accessor bounds):

  | quantity | standard | reinforced |
  |---|---|---|
  | mounted hub, both sides | **(±0.7000, 0.6500, 0.0000)** — the axle's own axis (Y 0.605…0.695) | **the same point** |
  | mounted bottom Y | **−0.0350** — the stock wheel's own bottom, to the digit | **−0.0525**, i.e. the recorded 0.0175 deeper |
  | the disc's X band | −0.7680…−0.6320 (left) / 0.6320…0.7680 (right) — **bit-identical to the fitted stock wheel**, so the mounting interface is unchanged | **the same band** |
  | nearest tub/rail vertex | 0.1728 (`CarBody_Wood`) | **0.1726** |
  | nearest handle-grip vertex | 0.1331 (`Handle_Grip`) | **0.1159** — the bigger rim passes that much nearer the grip |
  | rim top against the tub's own top rail (1.222) | 1.335 → **+0.113** | 1.3525 → **+0.1305** |
  | body AABBs overlapping the wheel | the **axle and that side's own cap only** — the mounting contact, which the stock wheel occupies identically | **the same two** |

- **`src/utils/phaseC8_66c.test.ts` — 21 tests / 118 assertions, the two real coverage gaps.**
  §A drives both variants on both sides through the shipped transform and pins the table above
  (the stock X band, the hub, the bottom, the axle-only overlap, the tub/handle clearances, the
  wheel as the model's lowest point, and the mirrored instances); §B runs the shipped
  `applyChariotFinish` against real `THREE` objects that share materials the way `Object3D.clone()`
  makes them share — so the "no material leaks through the shared cached GLB" property is
  **exercised** rather than grepped (the cached scene keeps its colours and its material objects;
  two different finishes cannot bleed into one another; the stock finish is a no-op); §C pins the
  harness's isolation (its own key, per-tab scratch storage, no `saveProfile` / `PROFILE_STORAGE_KEY`
  reference, the real UI and the real helpers, and the `DEV`-gated mount). The transaction rules
  themselves are deliberately **not** restated — `phaseC8_66b.test.ts` already pins them.

- **Verified 2026-10-19** in the dev container: focused `bun test src/utils/phaseC8_66c.test.ts` →
  **21 pass / 0 fail** (118 expect() calls); `bun test` → **1637 pass / 0 fail (51 files, 36644
  expect() calls)** (C-8.66B left 1616 / 50; the delta is this suite); `bun run
  scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only); `git diff --check`
  → clean. The phase's source changes are three files: `src/main.tsx` (the harness branch),
  `src/components/dev/ChariotWorkshopHarness.tsx` (new) and `src/utils/phaseC8_66c.test.ts` (new).

- **Runtime health during the live pass.** No failed requests (`getNetworkRequests({filter:
  'failed'})` → 0) — the chariot GLB, the wheel kit and the workshop's other assets all answered.
  Two console errors appeared, **both at the teardown of the temporary frame**: the documented
  pre-existing `"Attempted to synchronously unmount a root while React was already rendering"`
  (C-8.66B records the same message on the city → hub transition; it comes from the WebGL guard's
  remount) and an `"Uncaught "` with an empty message immediately after it, i.e. when the frame
  holding the harness was removed. Neither was observed while the workshop was in use.

- **Not verified — the wheel swap's appearance on the target GPU, and this is a device question.**
  The live frames do show the chariot rendering with a kit wheel set fitted (the preview viewport
  renders through SwiftShader), but the fine difference between the two wheel sets is **not
  resolvable at this environment's frame quality**, so **Android visual acceptance of the reinforced
  wheel swap, the hub alignment and the 0.0175-lower tyre stays PENDING** exactly as C-8.66B
  recorded it. Do not claim it.

- **The real route, driven end to end in the preview browser (2026-10-19).** title → `Play as Guest`
  → the **3D city hub** (HUD up) → the map drawer (`City Map & Navigation`) → **fast travel to the
  Imperial Stable** → the stable's own prompt → its banner button → the **Armory's Chariot Workshop
  subview**. All six cards render, the two subview pills read `Gladiator Loadout` / `Chariot
  Workshop` (the workshop one active), and the player's own **100 gold** makes all four paid parts
  read `Not enough gold.` with their buy controls disabled — exactly the behaviour C-8.66B recorded,
  on an untouched save. **0 failed requests** (21 buffered) and the only console error is the
  documented pre-existing React unmount message on the city → hub transition. Two honest notes:
  (a) the prompt text is matched case-insensitively because Tailwind's `uppercase` is reflected in
  `innerText` — the captured frame shows `VISIT CHARIOT WORKSHOP [E / SPACE]`, i.e. the prompt was
  up; and (b) the workshop's **3D preview canvas was still initializing** when the frame was taken
  (the WebGL guard's "initializing 3D world context" state), so this pass does not *re-establish*
  the preview's first render — the disposable-harness frames in this same phase show the chariot
  rendering in that viewport, and C-8.66B captured it first.

## Dev-harness safety and workshop acceptance prep (Phase C-8.66D — audited, one fix, verified)

- **Scope.** An audit of C-8.66C's dev-only transaction harness, plus one narrowly necessary fix.
  The workshop feature is untouched: `chariotParts.ts`, `chariotLoadout.ts`, `chariotGeometry.ts`,
  `ChariotPreview.tsx`, `ChariotWorkshopTab.tsx`, `GearTab.tsx`, both `App.tsx` handlers, the
  collision registry and the two chariot GLBs are byte-identical, and **no price, wheel geometry,
  city layout, combat stat or player save was changed.** The phase's files are three:
  `src/components/dev/ChariotWorkshopHarness.tsx` (the bounded purse, plus three helpers exported for
  the new suite), `src/utils/phaseC8_66d.test.ts` (new) and this record.

- **The question the audit had to answer was the difference between "dev" as a name and "dev" as a
  fact — and the two are not equivalent.** Measured against a real production build
  (`bun run build`, then grepping its output): **the harness is ABSENT from the production runtime,
  not merely hidden in the UI.** The built bundle contains no occurrence of `devHarness`,
  `sand_and_steel_dev_harness`, `sand_and_steel_chariot_workshop_harness_v1`,
  `ChariotWorkshopHarness`, `MAX_HARNESS_GOLD`, `readSeedGold` or even `import.meta.env.DEV` (Vite
  substitutes it), and the output consists of five assets only — `index`, `CityHubScene`,
  `DuelScene`, `useCameraDrag` and the stylesheet. **No harness chunk is emitted at all**: both dev
  harnesses are dynamically imported *inside* their own `import.meta.env.DEV` branch, so Rollup's
  dead-code elimination removes the branches, the imports and the chunks together. That is what makes
  `?devHarness=chariot` a no-op in production rather than a hidden screen a curious visitor could
  reach.

- **Why that is structural, not coincidental — the gates, read out of the shipped source.**
  `main.tsx` computes `import.meta.env.DEV && (…)` for each harness and mounts them in an
  `if / else if / else` chain whose final `else` is `<App />`; there is no static import of anything
  under `components/dev`, which would have shipped a harness in the main chunk of every build. The
  new suite lifts both gate *expressions* out of the file, substitutes `import.meta.env.DEV` the way
  a build does (`false`) and evaluates them (`Function(...)`, the technique `phaseFortressRotation`
  already uses for source expressions) across 10 query strings × 7 scratch-flag values: with `DEV`
  false **neither gate can be true for any input**, and — because `false && …` never evaluates its
  right-hand side — a production load does not even read the harness flag. Its control removes the
  `DEV` conjunct from the same expression and shows the ungated shape would open the harness in a
  production build from both routes, so the checks are sensitive to the thing they pin.

- **The one real gap found, and the fix: the URL purse was unbounded.** `?gold=<n>` reached a
  currency field through `Number(raw)` guarded only by `isFinite && >= 0`, so `?gold=1e308` seeded a
  1e308-gold purse, `?gold=` (empty) seeded **0** instead of the default, and `12.5`, `0x10`, `1e21`
  were all read as purses. It is dev-only input, but it is untrusted input to a balance, so it is now
  bounded (`DEFAULT_HARNESS_GOLD` 600, `MAX_HARNESS_GOLD` **1 000 000**): plain decimal digits only —
  a sign, a fraction, an exponent, a hex prefix or an empty value falls back to the default, and an
  accepted value is clamped, which also catches a digit string long enough to read as `Infinity`.
  Measured live in the preview browser (two real `<iframe>` instances of the harness against the dev
  server, the C-8.66C technique): `?gold=1e308` → **`gold: 600`** and `?gold=999999999999` →
  **`gold: 1000000`**, each with the workshop's real cards mounted (`Reinforced Wheel Set` present,
  `owned: wheels_standard, finish_stock`), so the harness still drives the shipping UI.

- **Storage isolation, now exercised rather than grepped.** The harness's own key
  (`sand_and_steel_chariot_workshop_harness_v1`) lives in per-tab scratch storage and the player's
  key (`sand_and_steel_gladiator_save_v2`) is a different key in a different store. The three storage
  helpers are **exported** (the only change to them) so the suite can drive them against recording
  fake stores: a save writes exactly one key into `sessionStorage` and nothing into `localStorage`; a
  load reads only that key and returns `null` when the store holds only the player's save (it does not
  fall back to it); `sessionStorage` is preferred, `localStorage` is the fallback when session storage
  is blocked, and neither store being reachable is survivable; and a full harness session — seed,
  `purchaseChariotPart`, persist, reload — leaves a pre-seeded real-save record **byte-identical** and
  never reads the real store. `createNewProfile` is pure (it writes no storage), and nothing in
  `GearTab` / `ChariotWorkshopTab` / `ChariotPreview` touches `localStorage`, `sessionStorage` or
  `saveProfile` either, so no path in the harness can reach the real save. The module's export list is
  pinned exactly, so a future edit cannot quietly hand the harness a save writer.

- **Routing is unchanged.** The harness mounts *instead of* `<App />` and only under the gate; it is
  referenced from `main.tsx` alone — `App.tsx`, `GearTab.tsx` and `CityHubScene.tsx` name it nowhere.
  Title screen, guest entry, sign-in, cloud save, city hub and the workshop route are the shipped
  ones, and the suite pins the branch order (character branch → chariot branch → `<App />`), the
  single dynamic import of each harness and the absence of any static one.

- **`src/utils/phaseC8_66d.test.ts`** — **22 tests / 428 expect() calls** in four sections: §A the
  production gate (§above, including the branch-order and no-static-import guards, and the control);
  §B storage isolation (§above); §C the bounded purse, table-driven over 20 inputs plus the
  invariants (whole, ≥ 0, ≤ the ceiling) and a control replaying the pre-fix parser, which is shown to
  pass 1e308, 0, 12.5 and 16 through; §D the shipped workshop unchanged — the wheel slot still sells
  exactly `wheels_standard` (0) and `wheels_reinforced` (450), the three finishes keep their 180 / 320
  / 240 prices, **no spiked or bladed wheel exists anywhere in the catalogue and no entry mentions a
  racing number**, the two kit variants keep their audited specs (`Wheel_Standard` r 0.685 /
  `kitBottomY` 0.065, `Wheel_Reinforced` r 0.7025 / `kitBottomY` 0.0475 — the mounted fit itself is
  still pinned by `phaseC8_66c.test.ts`), and the Imperial Stable still routes `tabKey: 'gear'` +
  `subTab: 'chariot'` with `getNearbyHubLocation([26, 0, 10])?.id === 'stable'`.

- **Workshop acceptance prep, driven live (2026-10-19).** The real route was driven in the preview
  browser: title → `Play as Guest` (which continues the replayed save rather than writing one) → the
  **3D city hub** → the map drawer → **fast travel to the Imperial Stable** → its prompt
  `VISIT CHARIOT WORKSHOP [E / SPACE]` → its **banner button**. Every step reported itself performed
  and the workshop subview opened. Read back from the rendered DOM: `Standard Wheel Set`,
  `Reinforced Wheel Set`, `Charred Ebony Timber` and `Gilded Parade Trim` all present, the
  `GLADIATOR LOADOUT` / `CHARIOT WORKSHOP` pills with the workshop one active, the 450 / 180 / 320 /
  240 prices, **four `NOT ENOUGH GOLD` refusals and 7 disabled controls** on the player's own 100
  gold, `EQUIPPED` on the two stock parts, and no sideways scroll. A legible frame was captured
  showing the Armory tab, the active Chariot Workshop pill, `CURRENTLY EQUIPPED`, the 3D chariot on
  its platform (SwiftShader) and `Wheels: Standard Wheel Set` / `Finish: Workshop Stock Finish`.
  **The player's own save was byte-identical before and after every check (1959 chars), and the
  disposable record was deleted from both stores afterwards.** Two honest notes: (a) the first capture
  of the opened workshop was blocked by the game's own asset preloader (`ENTERING THE ARENA`, 50 %),
  so the drive was re-checked once the overlay had cleared — the earlier frame is not evidence of the
  workshop, the later one is; and (b) Tailwind's `uppercase` is reflected in `innerText`, so the DOM
  assertions match case-insensitively (`NOT ENOUGH GOLD`, not the authored casing).

- **Verified 2026-10-19** in the dev container: focused
  `bun test src/utils/phaseC8_66d.test.ts src/utils/phaseC8_66c.test.ts src/utils/phaseC8_66b.test.ts`
  → **94 pass / 0 fail** (1040 expect() calls: 22 + 21 + 50 + the 66b additions); `bun test` →
  **1660 pass / 0 fail (52 files, 37081 expect() calls)** (C-8.66C left 1637 / 51; the delta is this
  suite's 22 tests and its file); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**,
  exit 0; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing
  >500 kB chunk warning only; `dist/` is gitignored); `git diff --check` → clean.
  The bundle greps above were re-run after the edits, so they describe the shipped code.

- **Not verified / not attempted.** (a) The production build was **grepped, not served**: no static
  server was started over `dist/`, so `?devHarness=chariot` was not probed against a served production
  bundle — but that bundle contains no harness code and emits no harness chunk, so there is nothing
  there to mount. (b) The phase's suite checks the *production* gate by substituting `DEV` in the real
  expressions and by the bundle grep; it does not run Vite inside the test. (c) **Android visual
  acceptance remains PENDING** for the workshop cards and the reinforced wheel swap on the target GPU,
  exactly as C-8.66B and C-8.66C recorded — and the purchase/equip **click** path on real hardware is
  still the open device item (the transaction logic is covered by `phaseC8_66b`/`phaseC8_66c`, and
  this phase changed none of it). Still open from earlier phases: the C-8.65 apron, the C-8.64B
  district, the C-8.64A arena, the C-8.62 pediment rakes, the C-8.60 wreath, the C-8.57 portico, the
  C-8.53 lean-to, the C-8.52 veranda canopy, the C-8.49 wall-to-gable junctions, the C-8.51 awning,
  the C-8.41 kerb, the C-8.38 northern approach, the C-8.28 bowl cut, the C-8.29 junction and the
  C-8.31/C-8.33 rear-gate checks. Do not claim device acceptance.

- **One dev-only caveat, deliberately left as-is.** The `sand_and_steel_dev_harness = 'chariot'`
  scratch flag exists so a preview browser that cannot deliver a query parameter on a reload can still
  reach the harness. **No application code writes that key** (both harnesses only read it, and only
  under the `DEV` gate), so it cannot trigger itself; but a developer who sets it once and forgets it
  will have the dev server come up on the harness instead of the title screen until they clear it.
  That is a development convenience, not a production exposure — in a production build the flag is not
  read at all.

## Racing progression data model and transactions (Phase C-8.67B — implemented, no UI)

- **What shipped, and what deliberately did not.** Types, pure progression logic, persistence
  compatibility and a focused suite — **no racing screen, no race loop, no horse assets, no
  animation, no arena entry, no physics, no rewards and no UI**. Three files changed:
  `src/types/game.ts` (the declarations, 33 added lines), `src/utils/racingProgression.ts` (new) and
  `src/utils/phaseC8_67b.test.ts` (new). No existing behaviour, price, save key, collider or city
  mesh was touched, and the module is consumed by nothing yet — the suite asserts that by sweeping
  `src/` (excluding the module and the suite itself) for any reference to `racingProgression`.

- **The data model.** `ChariotTeamSize = 2 | 3 | 4` and an **optional** `PlayerProfile.racing`:
  `{ unlocked?: number[]; selected?: number }`. `unlocked` stores the *bought* sizes only — 3
  (Triga) and/or 4 (Quadra) — because **Biga (2) is implicit and is never written**; `selected` is
  the team size the player races with. Both members are optional so a partial save stays loadable.
  A missing, partial or malformed field resolves to **Biga selected, Triga and Quadra locked** rather
  than being repaired, and `Quadra` is dropped unless `Triga` is unlocked — a state no legitimate
  transaction can produce is not honoured on read either.

- **The module is pure, and it is the single source of truth for the catalogue.** `RACING_CONFIGS`
  is `Biga` (2, 0 gold), `Triga` (3, **750**, requires biga) and `Quadra` (4, **1,500**, requires
  triga). `resolveRacingState(profile) → { unlocked, selected, horses }` is total: junk entries,
  duplicates, a fraction, a string, an array, `null` and an unknown size all fall back. The
  operations are `getRacingPurchaseEligibility` / `purchaseRacingConfig` /
  `getRacingSelectionEligibility` / `selectRacingConfig`, plus `isRacingConfigUnlocked` and
  `describeRacingRejection`. Every one accepts a configuration **by team size or by name**
  (`3` or `'triga'`) and rejects everything else as `unknown-config`. Refusals are
  `no-profile | unknown-config | already-unlocked | prerequisite-locked | insufficient-gold |
  not-unlocked`; a refusal returns `{ ok:false, reason }` and leaves the caller's profile — its gold
  included — untouched, exactly the C-8.66B chariot pattern. A success returns a **new**
  profile for the existing `saveProfile()` path; nothing is mutated in place, and the suite pins that
  on frozen inputs. A purchase **never selects** (mirroring "buying never equips"), and a selection
  **never moves gold**. A profile whose `gold` is missing or non-finite is treated as unable to
  afford anything, so a malformed save can never produce a `NaN` balance by subtraction.

- **Persistence: no migration, and none is needed.** `racing` is optional and whole-profile JSON, so
  it rides the existing paths unchanged: the local `saveProfile()` / `loadSavedProfile()` pair
  (`PROFILE_STORAGE_KEY`, untouched) and the Google Drive path, which serializes the **whole profile**
  (`const fileContent = JSON.stringify(profile, null, 2)` up; `await response.json()` down; App then
  calls its existing `saveProfile(loadedProfile)`). `createNewProfile()` still writes no `racing`
  field, so a legacy save round-trips **byte-identical** and is never rewritten just to carry
  defaults. `src/services/storage.ts`, `googleDrive.ts` and `App.tsx` are unchanged — the phase's
  only production edits are the two type declarations.

- **Regression suite: `src/utils/phaseC8_67b.test.ts` — 46 tests / 443 expect() calls** in five
  sections: §A the catalogue, the effective state for a legacy save and for eleven malformed shapes
  (with a control showing the same predicate passes a real unlock), partial fields, orphan Quadra,
  junk/duplicate entries, Biga un-lockable from every shape, `selected ∈ {2,3,4}` and always
  unlocked, and purity on a frozen profile; §B purchase — Triga 750 once, Quadra 1,500 once only
  after Triga, duplicates never charging twice, insufficient gold (including exactly-enough paying to
  zero, and a missing/non-finite balance), unknown refs, the eligibility read-out matching the
  purchase, deterministic repeats from one base profile and frozen-input purity; §C selection — free
  on every path, refused when locked, idempotent, both reference forms, unknown refs and no profile;
  §D independence — owning every wheel and finish leaves both upgrades locked, a racing purchase
  leaves the chariot loadout byte-identical, the racing module imports no catalogue or storage, the
  chariot prices are re-pinned, no screen consumes the module, and the type is declared optional;
  §E persistence — a real local save/load round trip with and without the field, a purchase
  round-tripped, the cloud path's own serialization technique (and a source-level check that it has
  no field whitelist), and the preview metadata. **No cloud upload, download or account-save
  mutation is performed by the suite**, and it never touches a browser's real save.

- **Verified 2026-10-19** in the dev container: focused `bun test src/utils/phaseC8_67b.test.ts` →
  **46 pass / 0 fail** (443 expect() calls); `bun test` → **1706 pass / 0 fail (53 files, 37524
  expect() calls)** (C-8.66D left 1660 / 52; the delta is this suite's 46 tests and its file);
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only;
  `dist/` is gitignored); `git diff --check` → clean. The dev server still answers `HTTP 200` for the
  shell and serves the new module transformed.

- **No C-8.67A record exists in this file.** The C-8.67A audit was executed in the previous window
  (racing traced in `App.tsx`/city services, the chariot assets re-parsed, the absence of both racing
  gameplay and horse assets documented) but never written up here, so a future phase should not
  assume a record exists; the C-8.66 sections above are the nearest baseline. This phase changed no
  gameplay, so **there is nothing to see on device** and no new Android item: the racing items that
  remain open are still the C-8.66B/C-8.66C/C-8.66D workshop and wheel-swap checks, and racing
  gameplay itself does not exist yet (no arena entry, no horses, no loop).

## Chariot team formation geometry (Phase C-8.67D — audited, suite finished and validated)

- **Scope, and what deliberately did not ship.** A pure geometry plan for the Biga / Triga /
  Quadra horse teams, plus the horse-asset inventory: `src/utils/chariotTeamFormation.ts` (the
  module) and `src/utils/phaseC8_67d.test.ts` (its suite). **No racing gameplay, no horse rendering,
  no animation, no placeholder mesh, no arena entry, no collider, no city geometry, no UI and no
  save change.** The module is consumed by nothing — the suite sweeps `src/` to prove it — so it
  cannot affect rendering or gameplay yet, and it imports only the `ChariotTeamSize` type: no
  renderer, no storage, no catalogue, no progression module.

- **The measured chariot anchors**, re-derived node by node in the rendered Y-up frame from
  `public/_workspace_chariot_model_RomanChariot.glb` (26 nodes / 23 meshes / 9,768 triangles / no
  skin / no animation / no textures / 202,280 bytes / sha256 `49e132e6…`): draught pole ON the
  centre line, X ±0.049, Y 0.671…1.029, Z −0.293…−2.107; yoke bar centre line Z −2.020, X ±0.650,
  faces Y 0.935 / 1.025; **two** pegs at X ±0.500, base 0.970, top 1.190; wheels X ±0.700 at
  Y 0.650, disc 0.070 thick (inner face ±0.665), leading edge Z −0.685, tyre bottom −0.035; hub caps
  ±0.768 (the model's widest point); axle ±0.750; tub's bronze front rail Z −0.482 at X ±0.480. The
  suite re-measures every one of them, so a re-export that moves the yoke, the pole or a wheel fails
  rather than silently invalidating the layout.

- **The formation proposal** — designed, and every value derived from a measured anchor. **Biga**
  (2) is the yoke's own peg stations ±0.500, both horses yoked, i.e. exactly what the asset already
  describes. **Quadra** (4) is those two lanes plus one OUTER lane per side at ±1.220 (lane pitch
  0.720), the outer horses being TRACE horses made fast to a staple on the yoke's top face at
  X ±0.600 — no chariot change at all. **Triga** (3) is the same yoked pair plus ONE outer trace
  lane, on +X. Horse envelope: withers 0.935 (the yoke's underside), barrel half width 0.250,
  rearmost point Z ≤ −0.785 (the wheel disc's leading edge less 0.100) and hooves on the asset's own
  ground plane, giving a 1.235 torso budget behind the withers. Every team stands abreast on the
  yoke line (Z −2.020) with its lanes ascending in X.

- **The one arrangement the model FORBIDS, measured.** Three abreast with a horse on the centre line
  is impossible: the pole lies on the centre line at a horse's own barrel height, so a centre
  horse's chest and belly would be inside it, and moving the pole off-centre would break the
  chariot's own X symmetry (axle, tub and both handles are symmetric about X = 0). The alternative —
  a lead horse entirely forward of the pole — needs its rearmost point past Z −2.207, which puts its
  withers 1.422 ahead of the yoke line. An odd team therefore fields the yoked pair plus one trace
  horse, and is asymmetric by construction.

- **Verified asset inventory — no animation-ready horse exists anywhere in the project.**
  - `public/_workspace_chariot.glb` is the only horse-shaped asset in the repo: **88 nodes / 88
    meshes, 7 textures, materials Bronze/Hide/Iron/Leather/Mane/Wicker/Wood, and ZERO skins and ZERO
    animations** — no skeleton, no joints, no gait. Two horse-shaped bodies stand abreast, mirrored
    about the Z = 0 plane (verified as multisets of measured boxes, 22 distinct shapes each), with
    rigid leg blocks. **44 of the 88 meshes carry Hide/Mane — 24 Hide + 20 Mane, i.e. 12 Hide + 10
    Mane per body, 22 horse components per body** — the per-body number, not the total. It is dead
    weight: no `.ts`/`.tsx` file outside its own suite names it.
  - `public/models/arena_roman.glb` (the player) is the only rigged model in the project: 1 skin, 66
    joints, 178 clips — all humanoid, with no trot / canter / gallop / gait / hoof / neigh clip.
  - `public/_workspace_arena.glb` (76 meshes), the wheel kit (15 meshes, sha256 `d5b36add…`) and
    every other GLB under `public/` are static scenery with no skin and no animation, and the wheel
    kit ships no horse.
  - **So horse meshes and horse animation remain unresolved prerequisites for any racing phase:**
    this phase supplies the numbers a future renderer needs, not an asset to render.

- **Regression suite: `src/utils/phaseC8_67d.test.ts` — 34 tests / 414 expect() calls** across eight
  sections: §A the shipping asset re-measured from the file; §B every published constant against
  that measurement plus every clearance re-derived from the raw accessors; §C the three teams (lanes,
  symmetry, spacing, attachments, and a determinism/purity check that the plan hands out fresh
  objects each call); §D the clearances, the applied-row contract, the tolerance check and the team
  widths; §E the fit inside the East Circus track (its 16.8 × 68.4 bounds parsed from the arena
  component); §F the arrangement the pole forbids and the model change the alternative would need;
  §G the asset inventory above; §H the scope guards — purity, unconsumed, no horse asset added, the
  C-8.67B catalogue and prices untouched, the purchase/selection contract, and both chariot GLB
  hashes. **The phase's files are three:** the module, the suite and this record.

- **Corrections this phase — one in production, the rest in the suite; each determined from the
  evidence rather than from the failing expectation.**
  1. **Production defect: the `chariot-body` clearance was a trace-lane rule applied to a team that
     fields no trace lane.** `getTeamClearanceReport(2)` reported −0.518 against its 0.15 limit, i.e.
     `ok === false`, for a Biga whose horses stand *between* the pole and the wheel — the
     configuration the wheel-Z rule governs, and nothing the hub-cap rule was ever about. The rule is
     now scoped to the trace lanes, so Biga's report carries five rows where Triga and Quadra carry
     six; the documented reason is that a yoked lane's barrel reaches inside the disc's own X band by
     design (0.750 against 0.665…0.735), which is exactly why the rear-Z rule exists. **Nothing was
     relaxed for the teams the rule applies to** — Triga and Quadra still check 0.202 against 0.15.
  2. **§D's team-width bound compared the team with three chariots:** `> 3 × 2 × 0.768` (4.608)
     could never hold for a 2.94-wide team. The measured statements now stand: the trace teams
     (2.94) are wider than the chariot's own 1.536, while the yoked pair alone (1.50) is narrower
     than it, because both its horses stand between the wheels' faces.
  3. **§F's centre-ahead arithmetic had the withers offset's sign inverted:** `requiredRearZ +
     HORSE_MAX_WITHERS_TO_REAR` (−0.972) lands *behind* the yoke line, so the comparison it fed
     could not pass. The withers must move the torso budget FURTHER forward from that rear limit —
     station Z −3.442, i.e. 1.422 ahead of the trace horses' — and the 0.187 figure belongs to the
     rear limit's own distance ahead of the yoke line; both are now asserted separately.
  4. **§G conflated two counts:** it expected 22 Hide/Mane meshes and read 44. It now distinguishes
     **44 Hide/Mane meshes** (24 Hide + 20 Mane) from **22 components per horse body** (12 Hide + 10
     Mane each), and adds the mirror check described above.
  5. **§H asserted that BUYING selects.** `purchaseRacingConfig` deliberately does not select — the
     racing analogue of "buying never equips" — so a purchased Quadra still resolved `horses` = 2.
     The test now asserts the real contract: purchase unlocks and leaves the selection at Biga, a
     separate free selection moves it, and only then does the profile resolve to 4.
  6. **§C's description check was a degenerate ternary** — both branches read `'yoked pair'`, so it
     could never have distinguished anything and failed on Biga's own text ("both on the yoke"). It
     now asserts what each description says: the yoke for Biga, the yoked pair for the trace teams.
  7. **The peg and tub-rail assertions were re-run, not assumed.** §A's peg test (exactly two pegs,
     mirror-symmetric, rooted in the bar, topping out 0.255 above the withers plane) and §A's tub-rail
     test (narrower than the pegs' own span, entirely behind every station) pass unchanged.
  8. **The float tolerance was verified against the real constraint, not loosened.** The
     `wheel-z-leading-edge` rule is satisfied EXACTLY by construction — the rear limit IS the wheel's
     leading edge less the clearance — so its own subtraction rounds to 0.09999999999999998 against a
     limit of 0.1, a 2.2e-17 departure the helper's 1e-9 epsilon covers and nothing more: that
     epsilon is seven orders below the suite's 5e-4 published precision, so a real violation (1e-3
     and up) cannot hide behind it. A new test pins the value-to-limit difference at < 1e-12, the
     limit as `HORSE_REAR_CLEARANCE`, the raw accessor's agreement to float32 rounding (< 1e-6, and
     > 0.09 in absolute terms) and the epsilon's size against the published precision.
  9. **Two failures in this turn's NEW assertions were mine, not the code's.** (a) The lane pitch is
     the distance between an outer lane and the inner lane BESIDE it (0.720); the two yoked lanes
     straddle the pole at ±0.500 and are 1.0 apart by design, which is what the test now states
     instead of expecting a uniform adjacent gap. (b) The raw accessor is float32, so a 12-decimal
     comparison of the wheel's leading edge (a 2.4e-9 departure) was impossible; the raw check now
     states the accessor's own precision.
  10. **Lint was failing before this phase and is fixed, not worked around.** `tsc --noEmit` reported
     a pre-existing TS2300 duplicate identifier: the suite imported `CHARIOT_WHEEL_HUB_X` from both
     `chariotTeamFormation` and `chariotGeometry`. The workshop's is now imported as
     `WORKSHOP_WHEEL_HUB_X`, and the cross-module check that mattered — the two constants agreeing
     on the axle's hub X — is asserted explicitly instead of being implied by the shared name.

- **Verified 2026-10-19** in the dev container, after the last edit: focused
  `bun test src/utils/phaseC8_67d.test.ts` → **34 pass / 0 fail** (414 expect() calls; the starting
  point was 26 pass / 6 fail); `bun test` → **1768 pass / 0 fail (55 files, 38189 expect() calls)**
  (C-8.67B left 1706 / 53, the delta being the C-8.67C work in between plus this suite's two new
  tests); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → **exit 0** (exit 1 before this turn's duplicate-import fix); `bun run build` →
  exit 0 with the pre-existing >500 kB chunk warning only; `git diff --check` → clean. **The
  player's real save was never read or written:** every purchase/selection check runs against an
  in-memory `createNewProfile` object, no browser storage was touched, and no record was left behind.

- **Unresolved design decisions, carried forward.**
  1. **Triga is a DESIGN HYPOTHESIS, not a final, historically or visually approved formation.** An
     odd team with a single central pole cannot be symmetric, so this plan fields the yoked pair plus
     ONE outer trace horse on the RIGHT (+X). The left lane is geometrically equivalent — the choice
     is one constant (`TEAM_LANES[3]`) — and no artist or historian has accepted the arrangement, so
     a future phase must treat it as open, not settled.
  2. **A lead horse ahead of the pole is a model change**, not a layout option: it needs the draught
     pole shortened (or the chariot re-symmetrised) and would read as a detached lead horse.
  3. **No horse asset exists** — and the one horse-shaped asset is unrigged, unreferenced and carries
     no animation, so a racing phase cannot start from it as-is.
  4. **The outer horse's fitting is a plan, not geometry:** the trace staple at X ±0.600 on the
     yoke's top face does not exist on the model; adding it is a chariot change nobody has authorized.
  5. **The plan stays unconnected to rendering and gameplay by design**, and must remain pure until
     an explicitly authorized phase wires it up.

- **Documentation gap, deliberately not fixed:** this file still has **no C-8.67C section** (the
  Racing Configuration UI and its live validation), so a future reader should not assume that record
  exists; `src/utils/phaseC8_67c*.test.ts` is the nearest record. This phase documents C-8.67D only.

- **Android visual acceptance: not applicable yet, and PENDING when it becomes applicable.** Nothing
  in this phase renders a pixel — no horse, no trace staple, no racing screen — so there is no
  appearance to accept here and no new device item. **Do not claim a raceable team or an
  animation-ready horse:** when one ships, the device check this plan exists to inform is whether the
  horses stand abreast on the yoke line with the pole between the inner pair, whether a trace horse
  reads as running alongside the chariot clear of the wheel, and whether Triga's single outer horse
  reads as intentional. The C-8.66B/C-8.66C/C-8.66D workshop and wheel-swap checks, and everything
  before them, remain open.

## Horse assets (Phase C-8.68A — audited, documentation only)

- **The C-8.67D inventory is stale and must not be read as current.** Its "Verified asset inventory
  — no animation-ready horse exists anywhere in the project" paragraph, its "No horse asset exists"
  decision item and its §G assertion were true of the repo as it stood when that phase closed. Three
  horse GLBs were uploaded **afterwards** (the three "Add files via upload" commits, 2026-10-19), so
  a reader must take the rest of this section as the current inventory and treat the C-8.67D wording
  as a historical record of what existed then. The C-8.67A note ("a future phase should not assume a
  record exists") is unaffected. **Everything else in the C-8.67D record still holds**: the legacy
  `public/_workspace_chariot.glb` really is 88 unrigged horse-shaped meshes, the wheel kit really
  ships no horse, and `public/models/arena_roman.glb` really is the only rigged *humanoid*.

- **The three uploads, byte-for-byte.** `public/_workspace_dist_horse_weak.glb` 15,248,136 bytes
  sha256 `0a00300e…`; `public/_workspace_dist_horse_better.glb` 15,783,980 bytes sha256 `639b75d5…`;
  `public/_workspace_dist_horse_great.glb` 16,342,056 bytes sha256 `f7e1b698…`. All three are
  exported by Khronos glTF Blender I/O v3.4.50 with `KHR_materials_specular` + `KHR_materials_ior`
  (no Draco, no `KHR_texture_basisu`, no quantization). **No `.ts`/`.tsx` file references any of
  them** (`git grep` and the rebased §G agree), so they are inert data in `public/`, not a feature.

- **One shared rig, 31 joints, identical in all three files** — the same joint-name list *and* the
  same rest world positions, so the three differ in skins and tack only:
  `root (0, 0, 0)` → `pelvis (−0.95, 1.30)` → `spine (−0.45, 1.34)` → `chest (0.05, 1.34)` →
  `neck1 (0.60, 1.36)` → `neck2 (0.90, 1.64)` → `head (1.20, 1.88)` → `muzzle (1.62, 1.74)`;
  fore leg `shoulder (±0.62, 1.22, ∓0.17)` → `forearm (0.60, 0.80)` → `fcannon (0.60, 0.55)` →
  `fpastern (0.60, 0.26)` → `fhoof (0.60, 0.10)`; hind leg `thigh (−0.62, 1.24, ±0.155)` →
  `gaskin (−0.55, 0.78)` → `hcannon (−0.62, 0.58)` → `hpastern (−0.60, 0.26)` → `hhoof (−0.60, 0.10)`;
  `tail1 (−0.95, 1.30)` → `tail2 (−1.10, 1.05)` → `tail3 (−1.22, 0.78)`. 1 root + pelvis + spine +
  chest + 2 neck + head + muzzle + 10 fore-leg + 10 hind-leg + 3 tail = **31**. Both leg chains are
  complete five-joint chains, which is what a gait needs.

- **Three clips each, identical names, durations, key counts and channel counts** (93 channels =
  31 joints × translation/rotation/scale): `Gallop` 0.7083 s / 17 keys, `Idle` 4.0417 s / 97 keys,
  `Walk` 1.0417 s / 25 keys.

- **The decisive motion fact: the shipped clips do not animate the legs, so they are not gaits.**
  Measured per joint over every key (degrees of rotation away from key 0, and translation span):
  - `Gallop` — **every leg-joint rotation is 0.000°** (the two shoulders 0.022°, from a rounded key)
    and **every leg-joint translation is 0.000**. All the motion is trunk and hair: `tail3` 14.605°,
    `tail2` 11.789°, `head` 10.954°, `neck2` 8.842°, `tail1` 6.000°, `neck1` 5.000°, `chest` 3.473°,
    `spine` 3.000°; the only translation with any span is `root` ±0.05 (a vertical bob).
  - `Walk` — the same pattern: leg rotations 0.000° (shoulders 0.022°), leg translations 0.000;
    `tail2` 10.354°, `tail1` 6.000°, `neck1` 2.500°, `head` 2.000°, `spine` 0.040°; `root` ±0.018.
  - `Idle` — the only clip that touches the legs at all, and only just: shoulders 2.400°, thighs
    2.000°, forearms 1.500°, gaskins 0.900°, `hcannon` 0.660°, `fcannon` 0.525°, pasterns 0.18–0.22°.
  - **Evaluated forward-kinematically** (composing the real bone matrices over every key, so this is
    the posed world position, not a channel reading): in `Gallop` the front hooves travel **0.220
    forward and 0.229 up** while the hind hooves travel **0.000 forward and 0.100 up**; in `Walk`
    every hoof's forward travel is **0.000** and its vertical travel **0.036**; in `Idle` 0.032–0.040.
    The hooves move only because the trunk rotates under them. A horse driven by these clips stands
    still and bobs its head — **the clips cannot be used as walk or gallop**, and this is measured,
    not inferred.

- **Measured proportions** (rest pose, model units, forward **+X**, up **+Y**, lateral Z; the coat
  mesh's minY is exactly **0** = the hoof plane; the only geometry below it is the tail, −0.0695):

  | quantity | weak | better | great |
  |---|---|---|---|
  | body (coat) length nose→rump | 3.0389 (nose +1.9946, rump −1.0443) | 3.0425 (rump −1.0475) | 3.0453 (rump −1.0504) |
  | withers — max Y over x 0.15…0.45 | **1.6907** @ x 0.426 | 1.7265 @ 0.426 | 1.7516 @ 0.426 |
  | croup — max Y over x −0.8…−0.5 | 1.6841 | 1.7185 | 1.7426 |
  | ear tip — coat max Y | 2.2447 | 2.2447 | 2.2447 |
  | barrel half-width — max over x −0.7…0.4 | 0.3496 | 0.3660 | 0.3894 |
  | mane half-width — widest slice (at x ≈ 0.316, the withers end) | 0.4505 | 0.4505 | 0.4505 |
  | fore-leg column (verts below y 0.9) x | 0.5208…0.6792 | 0.5139…0.6970 | 0.3822…0.7013 |
  | hind-leg column x | −0.7113…−0.4508 | −0.7243…−0.4276 | −0.7287…−0.4194 |
  | hoof band (verts below y 0.12) | x ±0.6792, z ±0.264 | x ±0.6789, z ±0.264 | x ±0.6789, z ±0.264 |
  | tail tip x | −1.2439 | −1.2439 | −1.2440 |

  Two facts matter downstream: the **mane is the widest part of the animal (0.901 wide)**, wider than
  the barrel, and it is widest exactly over the withers where the yoke sits; and the horse's **nose
  sits 1.57 ahead of the withers while its rump sits 1.47 (body) / 1.67 (tail tip) behind it**.

- **Asset economy as shipped.** weak 39 nodes / 7 meshes / 7 draw calls / **90,184 tris**;
  better 41 / 9 / 9 / **98,480**; great 42 / 10 / 10 / **108,714**. Textures: weak 4 — `hair_n_weak`
  1024² 2.43 MB, `coat_fur_weak` 2048² 7.54 MB, `coat_detail_weak` 1024² 0.23 MB, `coat_r_weak` 512²
  0.09 MB (10.29 MB of PNG payload, ≈33 MB VRAM at RGBA + mips); better 6 (adds `leather_better_tex`
  1024² and `velvet_better_tex` 1024², 10.53 MB, ≈44 MB VRAM); great 6 (adds `gold_great_tex`
  1024², 10.57 MB, ≈44 MB VRAM). The 2048² coat PNG alone is 7.5 MB of every file.

- **`better` and `great` carry riding tack, and a riding bridle is not a racing harness.** `Bridle`
  (leather_better 176 tris at x 1.384…1.691, y 1.646…1.896; gold_great 204 tris at x 1.284…1.711,
  y 1.644…2.006) is a headstall around the horse's head; `Saddle_Blanket`/`Saddle_Cloth` (880 tris
  each, x −0.30…0.44, y 1.49…1.73) is a riding saddle pad on the back; `great`'s `Armor_Gold`
  (6,040 tris, x −0.93…1.95, y 0.85…2.13) is a barding shell over the neck and back. None of them
  transmits a draught load: there are **no hames, no traces, no yoke straps and no girth** on any of
  the three assets.

- **The phase's one code change: §G of the C-8.67D suite was rebased, not weakened.**
  `src/utils/phaseC8_67d.test.ts`'s `no horse asset exists anywhere in the project` assertion became
  false the moment the uploads landed, so `bun test` was **1767 pass / 1 fail** before this phase.
  The test is now *"the only horse files are the three uploads, and nothing references them"*: the
  horseish-name sweep still walks `public/` **and** `src/`, but it now pins the **exact** three
  paths, pins each file's **sha256**, and adds the property the section was really protecting — no
  source file outside the suite names `_workspace_dist_horse_`. Every other assertion in the file
  (§A–§H) is untouched: the legacy chariot's 88 meshes / 0 skins / 0 animations / 7 materials, both
  chariot GLB hashes and the scope guards all still pass unchanged. The §G header comment and the new
  test's body record what was rebased and why.

- **Verified 2026-10-19** in the dev container: focused `bun test src/utils/phaseC8_67d.test.ts` →
  **34 pass / 0 fail** (418 `expect()`, up from 414); `bun test` → **1768 pass / 0 fail (55 files,
  38,193 `expect()`)** (the start of this phase was 1767 / 1); `bun run lint` (`tsc --noEmit`) →
  exit 0; `git diff --check` → clean. The dev server was checked **because the uploads added 46 MB to
  `public/`**, which is where the Tailwind content-scanner incident happened: `curl
  'localhost:3000/src/index.css?direct'` answers 200 in **0.12 s** and the `web` container's memory
  moves **283 → 298 MiB** across a full forced rescan, so `@source not "../public";` still covers the
  new files and there is no SIGKILL loop. (`public/` is now 218 MB in total; Vite copies it into any
  production build — see the C-8.68B section's last recommendation.)

- **Nothing was verified visually, and nothing was supposed to be.** This phase renders no pixel and
  changes no production file: it is an audit of three inert assets plus the suite rebase above. The
  three GLBs were not modified, opened for writing, renamed or deleted.

## Horse–chariot proportion and harness design decision (Phase C-8.68B — decision report, nothing implemented)

- **What this phase is.** A read-only decision: how the three verified horse GLBs would be scaled to
  the shipping chariot, what harness they would need, whether a gait can be authored on their rig,
  and what a four-horse team costs on mobile. **No production file, no asset, no model, no constant,
  no formation value, no renderer, no gameplay and no save was changed**; the two files this phase
  touched are this document and the §G rebase described above. The C-8.67D formation plan
  (`src/utils/chariotTeamFormation.ts`) is unchanged and still consumed by nothing.

- **The chariot, re-measured node by node this phase** (unchanged from C-8.66B/C-8.67D — so the
  anchors those records cite are still accurate): whole model X ±0.768, Y −0.035…1.335,
  Z −2.1071…0.685 (1.536 × 1.370 × 2.792); `DraughtPole` X ±0.0495, Y 0.671…1.029,
  Z −2.1071…−0.2929; `Yoke` X ±0.650, Y 0.935…1.025, Z −2.0639…−1.9761 (centre line −2.020);
  `Yoke_Peg_L/R` X ±0.47…0.53, Y 0.970…1.190; `Wheel_L/R_Wood` X ±0.665…0.735, Y −0.035…1.335,
  Z ±0.685 → hub (±0.70, 0.65), **radius 0.685, diameter 1.370**, disc 0.070 thick; `Axle` X ±0.750,
  Y 0.605…0.695; `CarBody_Bronze` (tub) X ±0.4799, Y 0.850…1.222, Z −0.482…0.4121;
  `Handle_Grip_L/R` Y 1.254…1.326; `Footboard` Y 0.595…0.645. **The model's tallest points are its
  wheels (1.335)**; the yoke's underside sits 0.400 below the wheel top and 0.319 below the driver's
  handrail grip, and the whole front assembly (pole + yoke + pegs, Y 0.671…1.190) sits at
  tub-handrail height rather than up at a horse's back.

- **The proportion mismatch, measured.** Horse withers : yoke underside = **1.6907 : 0.935 = 1.808**
  (weak; 1.847 better, 1.873 great). The model's yoke therefore describes an animal about **0.94 m**
  at the withers, i.e. a pony, while its **1.370 wheel** is 0.81 × the weak horse's withers height.
  For comparison — and these are **assumptions, not established facts**: a Roman racing horse is
  commonly estimated at ≈1.35–1.5 m at the withers, a racing chariot's yoke is built to rest on the
  horses' withers (so that ratio is ≈1.0), and modern reconstructions of a biga usually show wheels
  ≈0.8–0.95 m across, i.e. ≈0.6 × the horse's withers height; those figures are repeated in
  secondary sources rather than measured from an artefact. Against them the shipped asset's wheel
  corresponds to a ≈2.2 m horse and its yoke to a ≈0.94 m one. **The honest conclusion is that the
  two assets are mutually inconsistent by ≈1.8× and no single scale derived from history satisfies
  both** — any resolution is a visual/product choice, which is why this section reports two
  alternatives with exact numbers instead of asserting one.

- **Alternative A — scale the horse to the shipping chariot.** `s = yokeUnderside / withersAboveHoof`
  = **0.5530** (weak), 0.5416 (better), 0.5338 (great); the horse's hooves then stand on the asset's
  own ground plane with the yoke bar resting on its withers. Resulting numbers (weak / better /
  great): withers **0.935** by construction; ear-top 1.241 / 1.215 / 1.198; nose-to-tail 1.791 /
  1.754 / 1.729; barrel width 0.387 / 0.396 / 0.416 (half 0.1934 / 0.1982 / 0.2079); **mane width
  0.498** (half 0.2491 / 0.2440 / 0.2405 — inside the 0.250 half-width the C-8.67D envelope
  assumes); rump 0.813 / 0.798 / 0.788 behind the withers and tail tip 0.924 / 0.904 / 0.891
  (against the plan's 1.235 budget). Every C-8.67D clearance passes with margin, re-derived from the
  measured horse rather than from the envelope's 0.500-wide placeholder:

  | clearance rule | weak | limit |
  |---|---|---|
  | inner barrel to the pole's face | 0.2571 | ≥ 0.100 |
  | adjacent-lane air, barrels | 0.3333 | ≥ 0.150 |
  | adjacent-lane air, **manes** (the binding case) | 0.2217 | ≥ 0.150 |
  | trace-lane inner edge to the hub cap | 0.2586 | ≥ 0.150 |
  | rump / tail tip forward of the wheel's leading edge | 0.5219 / 0.4115 | ≥ 0.100 |

  Cost: the team reads **pony-scale in a human-scale world** — 0.935 at the withers and 1.241 at the
  ears against a 1.370 wheel and a 1.326 handrail, so the horses are shorter than the chariot's own
  wheels, and a player whose eye line is 1.7 towers over them. It needs **no chariot change at all**
  beyond the C-8.67D trace staple, changes no formation constant, and is reversible in one scale
  value.

- **Alternative B — keep the horse at scale 1.0 and correct the chariot's front assembly.** The yoke
  underside must rise 0.935 → 1.6907 (weak) / 1.7265 / 1.7516, i.e. **+0.7557 / +0.7915 / +0.8166
  (×1.81 / ×1.85 / ×1.87)**, taking the pegs with it and steepening the draught pole from **11.16° to
  31.45° / 32.27° / 32.83°** (the tip kept at its current 0.094 above the yoke's underside). The lane
  pitch must then be re-derived from the **mane** rather than the barrel — `2 × 0.4505 + 0.15 =
  **1.051**` against today's 0.720 — which moves the outer lane to ±1.551 and the team width to
  **3.80 / 3.83 / 3.88** (the chariot itself is 1.536 wide). The rump forces the station line forward
  from −2.020 to **−2.2552**, i.e. the **pole lengthens 0.2352 (13.0 %)**; and the **tail still
  reaches 1.6699 behind the withers against the plan's 1.235 budget (over by 0.4349)**, so the tail
  would have to be shortened or retracted, or the wheel-Z rule rewritten. Every one of those is a
  change to the shipped chariot GLB — a model change nobody has authorized — plus a rebase of the
  C-8.67D anchors and suite. Its benefit is the one thing A cannot buy: a horse that is plausible
  beside a 1.7-unit player, with the horses' backs 0.37 above the driver's handrail, which is
  roughly the ratio a real biga shows.

- **Alternative C (split, recorded but not recommended).** Horse at `s = 0.80` (withers ≈1.35 m, the
  middle of the assumed historical band) with the yoke raised 0.415, the pole lengthened ≈0.19 and
  the lane pitch widened to ≥ 0.87 (the mane again binding). It pays B's cost — the same
  unauthorized front-assembly re-authoring — while leaving the 1.370 wheel as tall as the horse, so
  it buys the least for the same risk.

- **Recommended scale strategy: A, now; B only if the device read fails.** A leaves the shipped
  chariot, the wheel kit and its audited transform, the workshop preview and every C-8.67D constant
  intact and satisfies every measured clearance — the only strategy that fits the project's
  "no model change without authorization" rule — and a prototype must be seen on a device before the
  art direction is committed; it is also reversible in a single constant. **The cost that has to be
  accepted with it is A's pony read**, so the recommendation is explicitly conditional: if the team
  on device reads as miniature (a 0.935-withers animal under 1.37 wheels beside a 1.7 eye line), the
  answer is B, and B's price is the front-assembly rebuild and pole lengthening quantified above.
  **Which one is right is a product/art decision, not a geometry one, and it is this phase's first
  unresolved item.**

- **Harness and team formation** — the C-8.67D formation is retained unchanged (Biga = the yoke's own
  pegs at ±0.500; Quadra = those plus outer lanes at ±1.220 on a 0.720 pitch with staples at ±0.600;
  Triga = the yoked pair plus one right-hand trace lane, still provisional). What a team needs, none
  of which exists on any of the three assets:
  1. **Yoke pad / saddle** on each yoked horse's withers, under the bar (bar Y 0.935…1.025, X ±0.650).
  2. **Neck strap** over each yoked horse's neck between the peg and the withers — the peg rises to
     1.190, 0.255 above the bar's underside, which is the strap's guide.
  3. **Girth** around each yoked horse's barrel behind the forelegs (weak's girth-band half-width
     0.3127 at scale 1, 0.173 at A's scale), stopping the yoke lifting.
  4. **Hame / breast strap** at each trace horse's shoulder (model x ≈ 0.62, y ≈ 1.22).
  5. **Trace strap** from that hame back to the yoke-top staple: under A the endpoints are the staple
     at (X 0.600, Y 1.025, Z −2.020) and the outer horse's shoulder at about (X 1.31, Y 0.675,
     Z −2.127), i.e. **≈0.80 long** — an estimate from those two measured points, not a modelled part.
  6. **Reins** from each bit to the driver. Not modelled anywhere, and not part of the list above
     because they are a dynamic line rather than a fitting — but a driven team without them reads as
     riderless horses, and the chariot's `Handle_Grip` (Y 1.254…1.326) is the driver's handrail, not
     a rein bar.
  **Chariot mesh changes required under A: exactly one** — the trace-staple pair on the yoke's top
  face that C-8.67D already specified (X ±0.600, Y 1.025, Z ≈ −2.020, 0.050 in from the yoke's ±0.650
  end). Under B the staple goes with the rest of the rebuilt front. **The `Bridle`, `Saddle_Blanket` /
  `Saddle_Cloth` and `Armor_Gold` meshes are NOT a racing harness** — they are riding tack and
  barding, they carry no draught load, and a racing team would drop them (another reason to prefer the
  untacked `weak` asset). Triga stays a design hypothesis: nothing here approves its asymmetry.

- **Animation plan, with the verified/speculation split made explicit.**
  **Verified:** the rig can *carry* a gait — 31 joints with two complete five-joint leg chains, every
  joint carrying translation/rotation/scale channels in all three shipped clips, exported by Blender
  I/O 3.4.50 — so a new clip can drive every leg joint, and the shipped clips already provide a usable
  head/neck/tail layer. **Verified:** the shipped clips are not gaits (0.000° leg rotation in both
  `Walk` and `Gallop`; hooves moving 0.000 forward in `Walk`; measured above). **Not verified, i.e.
  speculation if claimed:** whether the coat's skinning deforms acceptably at full stride — it has
  never been exercised, because no shipped clip moves a leg, so the weights are untested at gait
  angles; whether hoof-ground contact can be held without inverse kinematics; whether a re-export
  preserves the node and joint layout; and the authoring cost itself, which is a Blender task outside
  this repo. **Plan:** author in place on the existing rig — a `Walk` loop of ≈1.0 s (the shipped
  1.0417 s is the natural grid) and a `Gallop` loop of ≈0.7 s (shipped 0.7083 s) driving
  shoulder/forearm/fcannon/fpastern and thigh/gaskin/hcannon/hpastern, keeping the shipped head, neck
  and tail channels and the root's ±0.05 bob, with **no in-clip forward translation** (the chariot
  carries the world motion) and a fixed **quarter-cycle phase offset per lane** so four horses do not
  read as one mechanism. Runtime cost is small: four skeletons × 31 joints = 124 joints and four
  mixers, with the draws dominated by the skinned meshes, not the animation.

- **Mobile budget.** As shipped, one horse is **14.54–16.34 MB, 90,184–108,714 tris, 7–10 draw calls
  and ≈33–44 MB of VRAM**, so a naive four-horse team is **58–65 MB of download, 361–435 k triangles,
  28–40 draw calls and 132–176 MB of VRAM** — not shippable on mobile. Recommended for the team:
  **one** horse asset, loaded once and shared by all four instances (skinning rules out a single
  `InstancedMesh`, so the four are four `SkinnedMesh` draws, but they share one geometry and one
  texture set); **≤ 20,000 tris per horse** (the team ≤ 80,000 — less than one imported horse renders
  today); **≤ 3 materials** (coat, hair, eye) for **≤ 12 draw calls**, against the chariot's own 23;
  textures **1024² coat base + 512² hair normal, WebP or KTX2, no separate `coat_detail`/`coat_r`**
  for ≤ 1.5 MB of payload and ≤ 8 MB of shared VRAM; **≤ 3 MB per team asset**. The repo's existing
  `scripts/gltf-transform-optimize.js` (`bun run compress:glb --no-draco`) already does
  dedup/weld/resample/quantize but **does not resize images**, so a texture resize/re-encode step has
  to be added. One LOD is enough for the prototype; a ≈6 k-tri LOD1 is the next lever. **Frame cost
  cannot be measured in the sandbox** (no GPU; SwiftShader ≈2 fps in the city hub), so the budget
  above is a source- and file-size-based recommendation whose real test is on device.

- **Unresolved decisions, and what each costs if it goes the other way.** (1) **The target withers
  height in world units** — the deciding datum is 0.935 (A) versus 1.6907 (B); choosing A accepts a
  miniature team, choosing B accepts a re-authored chariot front. (2) **Whether the chariot GLB may
  be re-authored at all** — B and C both need it, and no one has authorized it. (3) **Skin deformation
  at gait angles** — unverified, and the main re-authoring risk. (4) **Who authors the clips and when**
  — a Blender task, outside this repo, with no owner. (5) **Triga's asymmetric formation** — still a
  hypothesis, and the mane's 0.901 width makes the yoked pair's own spacing tighter than the bare
  barrel suggests (0.720 pitch − 0.901 × s at A's scale = 0.222 of air; at scale 1.0 it would be
  −0.181, i.e. the manes would interpenetrate). (6) **Reins** — unmodelled, and required for a driven
  team to read correctly. (7) **The 46 MB of horse GLBs sitting in `public/`** — Vite copies `public/`
  into any production build, so they should move out of `public/` (or be excluded) before a
  production build once a racing phase picks one. (8) **C-8.67C still has no record in this file**,
  unchanged from C-8.67D. (9) **De-tacking the chosen asset** — `better` and `great` ship riding tack
  and barding that a racing team should not wear.

- **Recommended candidate: `public/_workspace_dist_horse_weak.glb`.** All three share the identical
  31-joint rig and the identical three clips, so the choice is asset economy and tack: `weak` has the
  fewest meshes (7), the lowest triangle count (90,184), the smallest file (14.54 MB) and **no riding
  tack or barding to strip**, and its mane half-width (0.4505) is the same as the other two while its
  barrel is the narrowest (0.3496), which is the tightest fit to the lane plan. `better` (+8,296 tris,
  +0.54 MB) is the alternative if the art direction wants a richer coat, and `great` (+18,530 tris,
  +1.09 MB) only adds gold barding.

- **Verified 2026-10-19** in the dev container: every number in this section is re-derived from the
  four GLB files by throwaway harnesses kept in `/tmp` (a dependency-free GLB parser and an FK
  evaluator over the clips, plus a re-measurement of the chariot node by node). `bun test` →
  **1768 pass / 0 fail (55 files)**; `bun run lint` (`tsc --noEmit`) → exit 0; `git diff --check` →
  clean; the dev shell still answers HTTP 200. **Not verified, and not verifiable here:** anything
  visual or performance-related — this phase ships no rendering, the sandbox has no GPU, and the
  horses are not loaded, posed or drawn by any code. The racing items that remain open are still the
  C-8.66B/C-8.66C/C-8.66D workshop and wheel-swap device checks; racing gameplay itself still does
  not exist (no arena entry, no horse, no loop).

## Isolated horse ↔ chariot fit prototype (Phase C-8.68C — implemented, development-only, verified)

- **What this phase is, and what it deliberately is not.** A **disposable, isolated** scale-and-
  alignment viewer that puts the real `weak` horse and the real chariot in the renderer so the
  C-8.68B proportion decision can be judged by eye: one horse in the plan's Biga station, one in a
  diagnostic staging lane, reference guides for the wheel radius, the yoke height, the draught pole,
  the ground plane and the horse's withers, and a slider for nearby scales. **No horse ships, no
  racing exists, nothing is wired into the city, the arena or any hub, no gameplay hook, no collider,
  no city mesh, no save read or write and no model change of any kind.** The three horse GLBs and
  both chariot GLBs are byte-identical to the hashes C-8.68A/C-8.66B pinned, `chariotTeamFormation.ts`
  is untouched, and the prototype is reachable only in a dev build. It renders a **pony-scale**
  arrangement and says so in numbers rather than claiming it reads well.

- **The phase's files are five — two new modules, one new suite, one gate, one rebased suite.**
  `src/utils/horseFitPrototype.ts` (numbers only: the measured horse, the scale, the placement, the
  live readout and the guide geometry), `src/components/dev/HorseChariotFitPrototype.tsx` (the
  R3F screen), `src/utils/phaseC8_68c.test.ts` (33 tests), the `?devHarness=horsefit` branch in
  `src/main.tsx`, and two **rebased, not weakened** guards in `src/utils/phaseC8_67d.test.ts`.

- **How it is reached, and why that is the existing pattern.** `main.tsx` gains a fourth gate,
  `import.meta.env.DEV && (…get('devHarness') === 'horsefit' || readDevHarnessFlag() === 'horsefit')`,
  mounted in an `else if` chain whose final `else` is still `<App />`; the component is imported
  **dynamically**, so Rollup's dead-code elimination removes the branch and its chunk together. The
  suite pins the branch order, the single dynamic import, the absence of any static `components/dev`
  import, the component's own `import.meta.env.DEV` self-guard, and the fact that `App.tsx`,
  `CityHubScene.tsx`, `GearTab.tsx`, `DuelScene.tsx` and the three city/service modules name the
  prototype nowhere. **Confirmed against a real production build**: the output holds five assets
  (`index` ×2, `CityHubScene`, `DuelScene`, `useCameraDrag`) and **no harness chunk**, and contains
  no occurrence of `horsefit`, `useHorseFitHarness`, `HorseChariotFitPrototype`, `horseFitPrototype`
  or `HORSE_FIT`. *(One pre-existing property to keep in mind: Vite copies `public/` into `dist/`, so
  the three 46 MB horse uploads land in any build's output — they are unreferenced by that build, and
  that is C-8.68B's own unresolved item 7, not something this phase introduced.)*

- **The asset, re-measured from its own buffer this phase** (`public/_workspace_dist_horse_weak.glb`,
  15,248,136 bytes, sha256 `0a00300e…` — unchanged, byte-for-byte): one skin of **31 joints**, three
  clips (`Gallop` 0.7083 s, `Idle` 4.0417 s, `Walk` 1.0417 s), materials `Coat_weak` / `Eye_weak` /
  `Hair_weak`, **7 skinned meshes** (`Horse_weak`, `Mane`, `Tail`, `Forelock`, `Feathers`, `Eye_L`,
  `Eye_R`). Every mesh-carrying node carries an **identity transform and no children**, which is why
  the accessor bounds *are* the rendered bounds — the suite asserts that property rather than
  assuming it. Re-derived figures: hoof plane minY −1.3e-7 (zero to float32), nose **+1.9946**, rump
  **−1.0443**, tail tip **−1.2439**, ear tip **2.2447**, **withers 1.6907 at x 0.42599**, croup
  1.6841, barrel half-width **0.34965**, mane half-width **0.45048** (the widest part of the animal,
  and the lane rule's binding case). **The non-gait measurement is re-derived too, not restated:**
  evaluated over every key of every leg-joint rotation channel, `Walk` and `Gallop` move no leg joint
  at all (**< 0.5°**, the audited 0.000°/0.022°) while `Idle` — the only clip that touches them —
  moves 1–5° (the audited 2.4°/2.0°/1.5°).

- **The orientation conversion, derived rather than copied.** The horse faces **+X** in its own
  frame; the chariot faces **−Z** (`CHARIOT_FORWARD_AXIS`), and a draught horse faces the direction
  of travel, so one yaw does it: `Ry(θ)·(1,0,0) = (cos θ, 0, −sin θ) = (0,0,−1) ⇒ θ = +π/2`. The
  suite evaluates the real rotation matrix and pins **`Ry(+π/2)·(1,0,0) = (0,0,−1)`**, that `−π/2`
  would face the horse +Z (up the pole), that up stays up and the horse's lateral axis (Z) becomes
  the world's **X**. **The placement** then follows from the anchor the plan uses: the ground point
  directly beneath the withers sits at model `(withersX, 0, 0)`, which the yaw sends to
  `(0, 0, −withersX·s)`, so the group's position is
  `[laneX, CHARIOT_GROUND_Y, stationZ + withersX·s]` — withers **on the station line at the lane's
  centre**, hooves on the chariot's own ground plane. At A's scale the Biga horse's station reads
  `[0.5000, 0.0000, −1.7844]`, yaw **+90°**.

- **The scale hypothesis, and every rule applied to the MEASURED animal** (not to the plan's
  0.500-wide placeholder). `HORSE_FIT_SCALE = yokeUnderside / withersAboveHoof = 0.935 / 1.6907 =
  **0.5530**` — the one scale at which the yoke rests on the withers and the hooves stay on the
  ground. Read out live at that scale: withers **0.9350** against the yoke's underside **0.9350**
  (seat **−0.0000**), ear tip **1.2414**, nose→rump **1.6806**, barrel ±**0.1934**, mane ±**0.2491**
  (inside the envelope's 0.250), pole clearance **0.2576** (rule ≥ 0.100), lane air at the manes
  **0.2217** (rule ≥ 0.150), lane air at the barrels 0.3333, rear clearance **0.4115** (rule
  ≥ 0.100), Biga width **1.3867** against the plan's envelope-based 1.500. **The wheel-Z rule is
  shown to be load-bearing rather than decorative:** the inner barrel's outer edge reaches **0.6934**
  into the disc's own X band (rim inner 0.665), so it is the rear-clearance rule that keeps the horse
  *beside* the wheel. *(One figure differs from the C-8.68B report's table by 5e-4: the pole
  clearance derives to **0.2576** from the re-measured barrel, where that report printed 0.2571 —
  the report's own A-table prints the same 0.1934 half-width this figure comes from. Recorded, not
  smoothed over.)*

- **The controls the suite is pinned against — the same readout at scales the hypothesis is not.**
  At **1.00** (C-8.68B's Alternative B) the seat is **+0.7557**, the manes **interpenetrate**
  (−0.1810, the report's −0.181), the rear clearance is **−0.3349**, and exactly three rules fail —
  `yoke-seat`, `adjacent-lanes-manes`, `wheel-z-leading-edge` — while the pole rule still passes by
  **0.00135**. At **0.80** (Alternative C) the tail tip sits **−0.0009** — on the wheel's leading
  edge — with the seat +0.4176. The hypothesis scale is the only one of the three presets whose
  every rule passes, so the readout is demonstrably sensitive to the value it is given rather than
  constant. The scale is clamped to a diagnostic range (0.4 … 1.2) and a non-finite value falls back
  to the hypothesis.

- **The guides are LINES, and nothing here invents a harness.** Wheel radius (the wheel's own disc
  edge drawn at both hubs, radius **0.685** = hub Y 0.65 − tyre bottom −0.035, whose top is the
  model's own 1.335), tyre low point, yoke underside/top, both yoke pegs, the draught pole
  (0.671 → 1.029 at the tip's own Z), the ground plane (Y = 0), and — in the rule colour — the
  station line, the wheel's leading edge and the plan's rear limit; plus the horse's withers plane,
  its ground post and its rearmost plane. Each is a thin `THREE.Line` with `depthTest` off, drawn
  over the model, with six distinct colours and a legend in the panel. **The withers-plane guide and
  the yoke-underside guide coincide exactly at A's scale** — the coincidence the prototype exists to
  show — and differ by exactly the yoke seat at any other scale. There is **no yoke pad, no neck
  strap, no girth, no hame, no trace and no staple marker**: the suite asserts the module carries no
  such word and no guide carries mesh geometry, so no fitting can be mistaken for a real one.

- **Animation integrity, kept explicit.** The screen plays the **supplied** clips only and labels
  each one for what it does: `Idle` reads *"Idle — the supplied idle clip (4.0417 s)"*, and `Walk`
  and `Gallop` read *"supplied clip; legs static (C-8.68A: 0.000° leg rotation) — NOT a gait"*. No
  clip is authored, replaced, retimed or edited, no placeholder locomotion exists, each instance
  clones the skeleton with its own mixer (`SkeletonUtils.clone`, so one instance's animation cannot
  drive another's bones), and the default is the **rest pose** — the pose every measurement in this
  record was taken in.

- **Regression suite: `src/utils/phaseC8_68c.test.ts` — 33 tests across six sections**, every figure
  derived and none restated. §A the asset (byte-for-byte, the rig/clips/materials, the identity
  transform property, the proportions and the withers re-measured from the buffers, and the
  non-gait measurement); §B the orientation matrix, the nose's own +X, and the anchor landing on the
  station; §C the scale and every rule at it, against the plan's own report; §D the 1.00 / 0.80
  controls, the presets and the clamp; §E the guides, the wheel's own radius, the pole's measured
  ends, the withers/yoke coincidence and the no-harness property; §F scope (numbers-only module,
  DEV-gated harness, main.tsx's branch order, no production consumer, every formation constant
  unchanged, and no new file in `public/`).

- **Two existing guards were rebased, not weakened, and both rebases were determined by evidence.**
  1. `phaseC8_67d.test.ts` **§G** (`the only horse files are the three uploads, and nothing
     references them`). The phase deliberately names one upload, so the sweep's two halves were
     separated exactly: the *file-name* sweep now allows C-8.68C's own two prototype source files in
     addition to the three assets, and the *reference* sweep now excludes suites (which never ship,
     and this one must name the file in order to hash it) and asserts an **exact list** — the
     numbers module is the **only** source file in `src/` that names a horse asset, because the
     component reads the URL from it. That is a stronger statement than the emptiness it replaces.
  2. `phaseC8_67d.test.ts` **§H** (`nothing consumes the module yet`). The plan now has exactly two
     consumers, both dev-only; the guard's real property — no screen, no city file, no arena, no
     gameplay — is restated as that exact list plus three new checks (the module knows no renderer,
     the component is `DEV`-gated, the gate is in `main.tsx`). Every other assertion in the file
     (§A–§F, §G's other four tests, §H's other four) is untouched and still passes.

- **Verified 2026-10-19** in the dev container: focused
  `bun test src/utils/phaseC8_68c.test.ts src/utils/phaseC8_67d.test.ts` → **67 pass / 0 fail**
  (781 `expect()`); `bun test` → **1801 pass / 0 fail (56 files, 38,556 `expect()`)** (C-8.68B left
  1768 / 55; the delta is this suite's 33 tests and its file); `bun run scripts/collisionTests.ts` →
  **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the
  pre-existing >500 kB chunk warning only); `git diff --check` → clean. The diff is exactly five
  files: `src/main.tsx` and `src/utils/phaseC8_67d.test.ts` modified, and the three new files. The
  dev server serves both new modules (HTTP 200), the shell, a transformed `main.tsx` carrying the
  `horsefit` token, and the **15,248,136-byte** GLB (HTTP 200, byte count exact). *The suite's
  starting point was 7 failures in its own new assertions and one in each rebased guard — three of
  them mine (a 4-dp comparison that rounded a value sitting exactly on a boundary, a reversed
  rear-limit inequality, and an assumed component reference the component does not contain) and the
  rest the expected rebase churn. None was "fixed" by loosening a check: the comparisons were moved
  to the precision the constants are written to, the inequality was corrected, and the guide
  allowance was narrowed to the file that actually names the asset.*

- **Live evidence, and its limits.** The harness was opened in the preview browser
  (`/?devHarness=horsefit`) and driven. Read back from the DOM: **`loaded: horse=true (7 skinned
  meshes, 31 joints, clips [Gallop, Idle, Walk]) chariot=true`** — the real GLB with its real
  skeleton, in the renderer; **0 failed requests**; scale 0.5530 with every readout above and
  *"EVERY MEASURED RULE PASSES AT THIS SCALE"*; the `B` preset reading scale 1.0000 with seat
  +0.7557, manes −0.1810, rear −0.3349 and *"RULE(S) FAILING: YOKE-SEAT, ADJACENT-LANES-MANES,
  WHEEL-Z-LEADING-EDGE"*; the inspection toggles hiding the chariot (**horse alone renders**),
  hiding the horses (**chariot alone renders**) and hiding the guides; the clip labels exactly as
  quoted above; and the **mobile width (375 px) with `scrollWidth === clientWidth`, zero overflow**.
  Captured frames show the grey horse and the bronze chariot on the grid with the coloured guides,
  in the side and three-quarter views, with and without the Biga pair. **Successful asset loading is
  NOT visual acceptance, and the three console entries are the documented pre-existing pair** (the
  WebGL guard's *"Attempted to synchronously unmount a root…"* plus an empty *"Uncaught"*, the same
  two C-8.66B/C-8.66C/C-8.66D recorded on other screens at a canvas teardown/remount).

- **Android visual acceptance: PENDING, and it is the whole point of the phase.** The sandbox has no
  GPU (SwiftShader), so the captures above are legible but coarse, and **nothing about how the
  arrangement *reads* — only that it loads, places and measures as specified — is settled here**. The
  device check this prototype exists to inform: (a) does the Biga pair read as **pony-scale** in a
  human-scale world — 0.935 at the withers and 1.241 at the ears under a **1.370** wheel, beside a
  1.7 eye line — i.e. is Alternative A acceptable, or is the answer B (a re-authored chariot front,
  which no one has authorized)? (b) does the horse sit **between the pole and the wheel** with the
  pole clearly between the two inner horses and the draught pole passing the horses' chests? (c) does
  the staging horse beside the chariot make the size comparison obvious? (d) is the horse's head
  reaching past the pole's tip acceptable? (e) do the guide lines read as **diagnostic markers**
  rather than as fittings? Still open from earlier phases: the C-8.66B/C-8.66C/C-8.66D workshop,
  wheel-swap and racing-UI checks, and everything before them.

- **Carried forward, unchanged by this phase.** (1) The **target withers height** remains the open
  product/art decision (C-8.68B's first unresolved item) — this prototype supplies the evidence, not
  the answer. (2) **No harness exists** and none is modelled here: a raced team still needs a yoke
  pad, neck straps, girths, hames, traces and reins, and the chariot still needs C-8.67D's trace
  staple before a trace team can be assembled. (3) **No gait exists** — the shipped clips still
  cannot drive a walk or a gallop, and skin deformation at stride angles is still unverified. (4)
  Nothing connects the arrangement to rendering or gameplay: no arena entry, no racing loop, no
  rewards, no hub, and the prototype is disposable by construction (delete its two files, its suite
  and the `main.tsx` branch). (5) The **46 MB of horse GLBs in `public/`** are still copied into any
  production build (C-8.68B item 7) and should move out of `public/` before a racing phase ships one.
  (6) **C-8.67C still has no record in this file**, unchanged since C-8.67D.

## Horse ↔ chariot fit prototype — comparison views (Phase C-8.68D — implemented, dev-only; Android acceptance PENDING)

- **What this phase is: the review's preparation, and nothing past it.** C-8.68C's disposable
  prototype gains the three fixed views the phase names (exact side, front ¾, rear ¾) under ONE
  fixed framing, so **A (0.5530) / B (0.70) / C (1.00) / D (chariot alone)** are compared under the
  same camera; the phase's exploratory 0.70 preset, labelled as not validated; a collapsible readout,
  because the control box otherwise covers the ground line and the wheel contact; and the horse's
  guide lines now follow the horses toggle, so view D is the chariot's own wheel/yoke/pole/ground
  references alone. **No scale is chosen, no chariot front is redesigned, no harness geometry is
  invented, no gait is fabricated, horses are still not integrated into the city, racing is still not
  implemented, nothing is committed and no player save is read or written.** The three files are
  `src/utils/horseFitPrototype.ts`, `src/components/dev/HorseChariotFitPrototype.tsx` and
  `src/utils/phaseC8_68c.test.ts` — **no production game file, no collider, no service, no asset and
  no `public/` change.**

- **Preflight, measured rather than assumed.** Branch `colosseum-exterior-architecture`, HEAD
  **9d4503add7**, `git status --short` **empty** before the first edit. The three horse GLBs are
  byte-identical to the C-8.68A hashes (weak **15,248,136 bytes / sha256 `0a00300e…`**,
  `better 639b75d5…`, `great f7e1b698…`) and the chariot GLBs to C-8.66B/C-8.67D's (`49e132e6…`,
  `d5b36add…`, `_workspace_chariot.glb` and `_workspace_arena.glb` untouched) — `git status` after
  the phase names **exactly the three files above**, so every asset is demonstrably unchanged rather
  than merely unmentioned. The `?devHarness=horsefit` route is still DEV-gated, still a dynamic
  import in `main.tsx`'s `else if` chain, and the prototype still cannot reach a save (§F re-run).

- **The three views, as shipped** (numbers in the pure module, so the suite checks them instead of
  grepping the component):

  | view | id / label | camera direction (chariot frame) | elevation |
  |---|---|---|---|
  | exact side | `side` / "side" | `[1, 0, 0]` | **0°** — no elevation at all; the wheel discs sit square to the camera |
  | front three-quarter | `front-quarter` / "front ¾" | `[0.72, 0.196, -0.57]` | ≈12°, **ahead of the horses' heads** (the horse is yawed to face the chariot's −Z) |
  | rear three-quarter | `rear-quarter` / "rear ¾" | `[0.72, 0.196, 0.57]` | ≈12°, **behind the chariot's wheels**; differs from the front view ONLY in that sign |

  The ids are short compounds rather than the full English term because **the C-8.68C §F scope
  guard sweeps the module's code for the renderer library's own name as a substring**, and
  `"three-quarter"` contains it. The labels and comments still say "front ¾" and "three-quarter" in
  words, and the guard was left as it was rather than loosened for a new feature's convenience.

- **The framing is one camera for every scale, and its size was MEASURED, not guessed.**
  `HORSE_FIT_TARGET [0, 0, 0]` is the chariot's own ground plane, so the ground line — and the wheel
  contact standing on it — projects to the **middle of the canvas at every aspect**, above the
  control panel's `max-h-[46%]` overlay. `HORSE_FIT_VIEW_HALF_WIDTH 4.25` / `HALF_HEIGHT 2.9` were
  then fixed from the arrangement's own solids (the chariot, both Biga lanes and the staging lane,
  each by its measured bounds — *not* one box around all of them, which would invent corners no
  geometry occupies and demand a much larger frame). A throwaway harness in the `web` container
  projected all four solids through each view's real horizontal and vertical axes:

  | quantity (at scale 1.00, the widest) | measured |
  |---|---|
  | ear tips, world height | **2.2447** (1.5713 at 0.70, 1.2414 at A) |
  | rear ¾ — projected vertical maximum (the draught horse's muzzle and ears, far ahead of the target) | **2.8158** |
  | front ¾ — projected vertical maximum (the staging horse's tail, far behind it) | 2.4389 |
  | side — projected vertical maximum | 2.2447 |
  | front ¾ — projected horizontal maximum | **4.1244** |
  | every view's projected minimum | ≥ −1.34 |

  An elevated view's own vertical axis is **not** world +Y, which is why the frame is taller than
  the animal and why the elevation is ≈12° rather than a steeper look-down: at 20° the same
  measurement reaches **3.1275**, which would have cost another 8 % of the subject's size in every
  view for no better reading of the fit. The suite re-derives all of this from the module's constants
  and the four solids, and asserts it holds at **all three comparison scales**.

- **What the collapsible readout is for, and why it is a fix rather than a nicety.** The canvas is a
  full-height layer behind the absolutely positioned control box, so with the framing centred on the
  ground plane the wheel contact sits at the 50 % line — **behind** the panel. The panel now carries
  a `hide readout` / `show readout` control that collapses the numeric grid and the legend (the view
  row, the toggles, the scale row and the rule-status line all stay visible), which is what makes
  "keep the ground plane and wheel contact visible" true of the default screen and not only of a
  cropped one. Driven live: the grid takes the `hidden` class and the status line keeps reading
  *"EVERY MEASURED RULE PASSES AT THIS SCALE"*.

- **The comparison scales, and the preset rebase.** `HORSE_FIT_SCALE_EXPLORATORY = 0.7` is the
  phase's middle rung, recorded so the comparison is reproducible; its label reads **"B — exploratory
  0.70 (not validated)"** and the legend says the rule line above it is its evidence. The labelled
  set is now A / B / C in the phase's own order, and **the 0.80 split C-8.68C's preset offered is
  still reachable on the slider and still asserted** — only the shortcut button moved, so nothing the
  old set could do was lost. Measured at 0.70 (pinned in the suite and read back live): withers
  **1.1835**, seat **+0.2485**, ear tip **1.5713** against the wheel top **1.3350**, mane ±**0.3153**,
  lane air at the manes **0.0893**, rear clearance 0.1661, pole clearance 0.2062, and exactly **two**
  rules failing — `yoke-seat`, `adjacent-lanes-manes`. Its one measured virtue over A is that **the
  ear tip clears the wheel** (1.5713 > 1.335) where A's (1.2414) does not; that is a reading, not a
  fit, and the phase does not present it as one.

- **Regression suite: `phaseC8_68c.test.ts` — 33 → 36 tests.** The new **§G** covers the view
  ids/labels/directions (the two three-quarters differing only in the sign of their Z component, the
  side view's zero elevation), the one-fixed-camera property checked against the four solids at
  every preset scale, the ground line's coincidence with the target's height, and that the harness
  draws the module's own list (no second copy of the views) and hides the horse guides with the
  horses. §D's preset test was **rebased, not weakened** (A / B / C, with the exploratory value and
  its "not validated" label pinned, and the 0.80 readout still asserted in the test above it), and a
  new §D test pins the 0.70 numbers above. The suite's starting point was **one failing assertion**
  plus one rebase-driven failure: the module's new view ids tripped §F's substring sweep, which was
  **fixed by naming rather than by loosening the guard**.

- **Live evidence, and its limits.** The harness was driven in the preview browser. Two environment
  facts, both recorded elsewhere and re-confirmed here: the platform's own fresh loads **clear the
  dev-only scratch flag** (`sand_and_steel_dev_harness`, replayed from the account's snapshot), and a
  `path`-based navigation carries `?devHarness=horsefit` **only on the tool's first navigation of a
  turn**. The working route is C-8.66C's: load the harness URL **inside an in-page `<iframe>`**, drive
  its real controls with real DOM clicks, capture, then remove the frame (done — the frame is gone
  and no harness record was left behind). Read back from the running screen: `loaded: horse=true
  (7 skinned meshes, 31 joints, clips [Gallop, Idle, Walk]) chariot=true` — the real GLB, its real
  skeleton, in the renderer; the view row **`side` / `front ¾` / `rear ¾` / `free (orbit)`**; the
  presets **`A — fit the chariot (0.5530)`**, **`B — exploratory 0.70 (not validated)`**,
  **`C — unscaled horse (1.00)`**; at A `0.5530` with *"every measured rule passes at this scale"*
  and seat `-0.0000`; at B `0.7000` with *"rule(s) failing: yoke-seat, adjacent-lanes-manes"*; at C
  `1.0000` with three rules failing and lane air `-0.1810`; the collapse taking the readout grid to
  the `hidden` class; and **375 px with `documentElement.scrollWidth === clientWidth` in both the top
  document and the frame**, so nothing overflows sideways on a phone. **0 console errors. Screenshots
  of the side, front ¾ and rear ¾ views, of B, of C, of the chariot-only view and of the collapsed
  panel were captured through SwiftShader.** *Successful asset loading, a correct numerical readout
  and a legible software-rendered frame are not visual acceptance.*

- **Android visual acceptance: PENDING, and this phase deliberately decides nothing.** The sandbox
  has no GPU (SwiftShader), so **nothing about how the arrangement READS on the target device is
  settled here, and no claim is made that it was seen there.** The device review this preparation
  exists for, in the phase's own terms: (a) is the horse at **0.5530** — 0.935 at the withers, 1.241
  at the ears, under a **1.370** wheel beside a 1.7 eye line — visually acceptable, or is the answer
  a **redesigned chariot front** that accommodates a larger horse (C-8.68B's Alternative B, which
  **no one has authorized**); (b) what does **0.70** read as — it is exploratory, it fails two
  measured rules, and its only measured advantage is the ear tip clearing the wheel; (c) does
  **1.00** show the predicted failure (seat +0.7557, manes interpenetrating, rear −0.3349); (d) does
  **chariot alone** read as the wheel and yoke proportions the team is judged against; (e) do the
  guide lines still read as **diagnostic markers** rather than fittings; and (f) does the one fixed
  framing hold the whole arrangement in all three views **on the device's own aspect** — a phone in
  portrait has a wide arrangement in a narrow canvas, so the solver zooms out, and the FREE orbit
  view is the close-inspection path there.

- **Verified 2026-10-19** in the dev container, after the last edit: `bun test` → **1805 pass / 0
  fail (56 files, 39,173 `expect()`)** (C-8.68C left 1801 / 56; the delta is this phase's three new
  tests); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only);
  `git diff --check` → clean. The diff is exactly **3 files / 315 insertions / 43 deletions** — the
  two prototype sources and the suite.

- **Carried forward, unchanged by this phase.** (1) The **target withers height** is still the open
  product/art decision — this phase supplies the comparison, not the answer, and its instruction not
  to choose a scale was honoured. (2) **No harness exists** (yoke pad, neck straps, girth, hames,
  traces, reins and C-8.67D's trace staple all still absent), **no gait exists** (the shipped
  `Walk`/`Gallop` still move 0.000° of leg rotation and the screen still labels them *"NOT a
  gait"*), and skin deformation at stride angles is still unverified. (3) Nothing connects the
  arrangement to rendering or gameplay, and the prototype remains disposable by construction. (4) The
  **46 MB of horse GLBs in `public/`** still land in any production build. (5) **C-8.67C still has no
  record in this file.** (6) New here: the fixed framing is sized for the **three comparison
  scales**; dragging the slider past them (up to 1.2) can push the staging horse's tail outside a
  three-quarter frame, which is expected and is why the FREE view exists.

## East Circus Arena ground clearance (Phase C-8.69B — implemented; Android acceptance PENDING)

- **Demonstrated cause — a coplanarity, not a modelling error.** C-8.63/C-8.64A placed the arena's
  root on `GROUND_PLANE_ELEVATION_Y` (−0.05), i.e. *exactly* on `ProcessionAvenue`'s ground plane —
  a single quad spanning X ±70 / Z −114 … +70 that therefore also runs underneath the arena. The pair
  that matters is the arena's own floor: `Sand_00`'s top face is upward-facing and was also at −0.05,
  so the floor was resolved against the ground plane instead of against itself, per fragment and per
  frame. Measured on the shipping GLB under the pre-lift transform, **18 of the asset's 76 meshes had
  their lowest vertex exactly on the ground plane** (`Marble_01`, `Travertine_02`, `Marble_05`–`10`,
  `Granite_11`, `Granite_12`, `Marble_13`, `15`, `17`, `19`, `21`, `23`, `Travertine_25`,
  `Travertine_30`) — the coplanar set, and the reason the artifact is visible only where the floor is
  seen from outside the bowl: over the 2.13-high carceres block, i.e. from the paved forecourt on the
  arena's far south side.

- **The correction is a 0.05 Y lift and nothing else.** `EastCircusArena.tsx` now derives
  `CIRCUS_ARENA_POSITION[1]` as `GROUND_PLANE_ELEVATION_Y + CIRCUS_ARENA_GROUND_CLEARANCE`, with
  `CIRCUS_ARENA_GROUND_CLEARANCE = 0.05` — the clearance this project already gives a ground-contact
  surface (C-8.35: the motte's crest rings sit exactly 0.05 proud of the sand).

  | quantity | before (C-8.63/C-8.64A) | after (C-8.69B) |
  |---|---|---|
  | root position Y | **−0.05** | **0.00** |
  | root X / Z | 52.34 / 43.80 | 52.34 / 43.80 — unchanged |
  | yaw / scale | π/2 / 0.20 | π/2 / 0.20 — unchanged |
  | `Sand_00` top face (the arena floor) | −0.05 | **0.00** |
  | floor clearance above the ground plane | 0.000 | **0.05** |
  | whole-asset world Y span | −0.25 … 5.71 | **−0.20 … 5.76** |
  | `Sand_00` X / Z extents | 43.94 … 60.74 / −24.598 … 43.80 | **identical** |
  | `Marble_01` / `Travertine_25` / `Travertine_30` X-Z extents | — | **identical** |

  Every X and Z extent is byte-identical before and after (throwaway harness in `/tmp`, parsing the
  shipping GLB through gltf-transform and the component's own transform), so the horizontal position,
  scale and yaw — and therefore the whole collision footprint — are untouched. The asset, its
  materials and its transforms inside the group are not edited at all.

- **The collision registry is provably inert to the change: it carries no Y at all.** Measured over
  all 142 colliders (111 non-`circus` + 31 `circus-*`, 32 rectangles — the count C-8.64B's completion
  pass left), **none** holds a `y`, `minY`, `maxY`, `height` or `h` field — colliders use only
  `type`, `id`, `cx`, `cz`, `hw`, `hd`, `x1`, `z1`, `x2`, `z2`, `r`, and all **31 `circus-*`
  segments are pure X/Z segments** (`{type:'segment', id, x1, z1, x2, z2}`). There is therefore no
  "perimeter collider height" for the lift to change, and the ring's footprint is unchanged:
  X 38.38 … 66.30, Z −30.65 … 46.00. The East Circus District has **no fast-travel arrival of its
  own**, and all 20 entries in `FAST_TRAVEL_ARRIVALS` are unchanged.

- **Entrances and the forecourt are unchanged.** The carceres' front face stays at Z 46.00 and the
  forecourt pavement (Z 46.10 … 54.50) is a separate, unlifted district mesh, so the single vertical
  relationship that moved is the arena's: it now stands 0.05 proud of the district paving and of the
  ground plane, which is the intended clearance and a fraction of the shell's own wall thickness.

- **Files changed.** `src/components/3d/city/EastCircusArena.tsx` (the new constant, the derived
  position and the header's measured figures) plus four suites **rebased, not weakened**, each of
  which had pinned the old literal `[52.34, -0.05, 43.8]` as a scope guard:
  `phaseC8_64a.test.ts` (the transform pin became the derivation and its operands, and "flush with the
  ground plane" became the clearance test — `TRACK.maxY − GROUND_PLANE_ELEVATION_Y = 0.05`),
  `phaseC8_64b.test.ts` and `phaseC8_65.test.ts` (same scope guards),
  `phaseC8_67d.test.ts` (its documented-track parser gained the new Y column and now asserts the track
  at Y 0.00 … −0.20). `src/utils/collisionShapes.ts`'s header comment, which still read
  `group [52.34, -0.05, 43.80]`, now reads `0.00`. **No assertion was removed or relaxed and no other
  production file changed.**

- **Verified 2026-10-19** (the C-8.69A closeout) in the dev container: focused
  `bun test src/utils/phaseC8_64a.test.ts src/utils/phaseC8_64b.test.ts src/utils/phaseC8_65.test.ts src/utils/phaseC8_67d.test.ts`
  → **127 pass / 0 fail** (4 files); `bun test` → **1805 pass / 0 fail (56 files)**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0; `git diff --check` → clean.

- **Not automatically verified — the rendered look, and this is a device question.** The sandbox has
  no GPU (SwiftShader; the city hub measures ~1.4–1.7 fps here). The player **was** driven into the
  East Circus District in the preview (title → `Play as Guest` → city map → fast travel to the
  Armory & Leather Workshop, then walked east and south through the district envelope) and frames do
  render legibly there, but **no frame legibly resolves the arena's far-south facade over the
  carceres**, and a 0.05-unit coplanarity is below what a software rasterizer can adjudicate in any
  case. One further observation, recorded but **not** attributed to this phase: a frame captured
  mid-walk came back with the canvas blank; it recovered on the next fast travel, with no console
  errors, no failed requests and `isContextLost() === false` — a capture/software-renderer artifact
  rather than an app fault. **So visual acceptance of the z-fighting fix remains PENDING**, to be
  judged on an Android device from the paved forecourt south of the carceres, the one viewpoint where
  the arena's floor is seen over the block. Do not claim the artifact is gone from a green test run.

- **Open device checklist — unchanged, plus this phase's question:** (a) does the
  floor-over-carceres flicker / dropped-patch artifact disappear from the far-south forecourt;
  (b) does the arena read as standing *on* the paving rather than sunk into it (a 0.05 hairline, not
  a visible lip)? Still open from earlier phases: the C-8.64A/B district envelope, forecourt and
  entrances, the C-8.28 bowl cut, the C-8.29 Store ↔ Workshop junction and the C-8.31/C-8.33
  rear-gate stonework. Do not claim visual acceptance without device evidence.

## Colosseum rear wall "missing" on device (Phase C-8.69C — audit, **no production code changed**)

- **Reported:** on Android, viewed directly from behind, "large sections of the rear wall are
  missing or invisible". Treated as the unresolved defect. **Result: the shipping drum has no
  missing sector, no culled or hidden rear surface, no depth conflict and nothing occluding it, so
  no production geometry was changed.** What the rear *is* exposed to, measured below, is a
  see-through arcade on the building's unlit side. This section records the measurements and the
  evidence still needed; documentation is all this phase changed.

- **The drum shell is closed everywhere except the designed openings.** A full-360° occupancy sweep
  of `GrandColosseum.tsx`'s own constants (0.25° θ × 0.05 y grid, every band at its shipped radius)
  reports the non-stone intervals at each height:

  | y | non-stone sectors (θ from +Z; 180° = rear gate) |
  |---|---|
  | 0.05 | gate floor 172.0…188.3° only |
  | 1.5 | entrance 335.5…360.0 + 0.0…24.8; gate 172.0…188.3 |
  | 3.0 / 4.0 / 6.5 | entrance, gate, and the **18 arch bays** (8.3° wide at y 3–4, narrowing to the crown at 7.35) |
  | 7.6 / 8.3 / 9.0 / 12.0 | **entrance only** — the rear gate zone is solid (spandrel 7.35–8.0, tier-1 cornice 7.8–8.6 as its lintel, tier-2 sill, liner) |
  | 15.0 / 16.5 / 17.2 | **FULL RING — solid stone** |

  **No unintended gap appears anywhere on the circle**, and the gate is open only over y 0.16…7.35 —
  exactly the C-8.31 cut. From behind, the rear quadrant therefore shows the gate (171.96…188.04°,
  5.40 wide at the facade, to y 7.35) and the four bays nearest the axis (143.25…151.55,
  159.65…167.95, 192.05…200.35, 208.45…216.75 at y ≤ 6 — each arch centre ±4.148°, narrowing to the
  crown at 7.35; the remaining bays are seen at a grazing angle). Bay pitch 16.369°, jamb 1.3141 wide, opening
  2.70 wide × 4.85 tall; the bays tile each drum arc exactly — no half-bay, no slit at either
  opening's jamb.

- **Nothing hides the rear stone.** Every band, jamb, arch head and portal surface uses
  `side: THREE.DoubleSide` (`facadeMat`, `recessMat`, `interiorMat`, `corniceMat`, `portalStoneMat`
  and the inline plinth/cornice materials), so back-face culling cannot remove a rear-facing
  surface; no mesh in the file carries `visible`, a conditional render or a depth-write override
  (the city's only `mesh.visible = false` calls are `NorthernMotte`'s GLB `Ramp_Dirt` /
  `Moat_Water`). The only same-radius pairs in the facade are **tangentially adjacent** (jamb ↔
  arch head in the same bay) or meet edge-to-edge (the tier-1 ledge ring at y 8.6 against the
  cornice's top edge) — no coplanar overlap exists on the drum, so there is no depth-conflicting
  duplicate surface to remove. The one sub-millimetre interaction is the 36-segment cylinder chord
  sagitta (0.0122 at r 19.3) against the flat jamb/arch-head faces, which *protrudes* by ≤0.012
  rather than fighting.

- **The collision registry cannot produce a rendering symptom, and it is unchanged.** All 46
  `colo-*` colliders are X/Z only — 42 `segment`s (`x1,z1,x2,z2`) and 4 `rect`s (`cx,cz,hw,hd`, the
  two portal piers and their C-8.27 closure pair) — and **none of the registry's 142 colliders
  carries a `y`/`minY`/`maxY`/`height` field**, so there is nothing for a render to be hidden
  behind; the rear pairs
  (`colo-rearwall-l/r-0…1` on r 19.3, `colo-rearpodium-l/r-0…1` on r 15.3) and the two C-8.33
  `colo-gateseal-l/r` seals are the ones C-8.31/C-8.33 verified. The known registry/rendered delta
  stands: the rear-most *rendered* stone is the plinth cut edge at Z = −44.308 (on-axis lintel
  −44.5), 0.198 north of the registered jamb line at −44.110.

- **Measured: the rear facade is the building's unlit side.** `CityHubScene` lights it with
  `directionalLight [30, 42, 22] intensity 2.15` (the sun), `directionalLight [−25, 20, −25]
  intensity 0.28` (a cool fill), `hemisphereLight 0.45` and `Environment 0.35`. Lambert terms on the
  vertical facade:

  | normal | sun 2.15 | cool fill 0.28 | hemisphere | sum |
  |---|---|---|---|---|
  | front (θ 0, +Z) | 0.843 | 0.000 | 0.225 | 1.068 |
  | θ 45° | 1.409 | 0.000 | 0.225 | 1.634 |
  | **rear (θ 180°, −Z)** | **0.000** | 0.172 | 0.225 | **0.397** |
  | θ 225° | 0.000 | 0.244 | 0.225 | 0.469 |

  `N·L(sun)` on the rear normal is **−0.392**: the sun contributes nothing, so the rear receives
  **20.4%** of the front's directional light (0.172 vs 0.843) and **37.2%** of its directional +
  hemisphere total, against a warm fog/sky (`fog ['#e0a96d', 35, 115]`).

- **Two rear-versus-front asymmetries exist, and both are by design — neither is a defect.**
  (a) **Tier 1 is a see-through arcade**: each bay is 2.70 of a 5.33 pitch (51%), and because
  Phase 25.4 removed the tier-1 liner those openings reveal the bowl (podium r 15.3, seating
  frustums to r 17.8) and the sunlit arena floor behind them rather than a recessed dark panel; at
  the front the identical arcade is largely masked by the portal mass (8.6-wide piers, lintel,
  pediment, columns, frieze), which is why the same construction reads as an opening there and as a
  void from behind. (b) **Tier 2 carries no pilaster over a 48.80° zone about θ = π** (the last
  pilaster each side stands at 155.60° / 204.40°, because the rule places pilasters only above
  piers *between* two arches and the gate has no arch beyond its jamb). There the dark recess liner
  (`recessMat` #3d352a, roughness 0.92, r 17.0) is exposed directly above the gate; the analogous
  49.26° front zone is filled by the portal. It is stone, not a hole — but in shade it is nearly
  black, and in the chase camera's framing it is the top band of the rear view.

- **Framing at the reported vantage, measured.** The only outside approach to the rear is the
  northern route; the nearest fast-travel arrival is `northern_fortress` [0, −69]. `CityCamera`
  places the chase camera at `player − (sin yaw, cos yaw) · distance` with `baseDistance` **5.5** and
  `baseHeight` **2.8**, looking at the player's chest +1.5 with a 0.66 forward offset — so the view
  sits **11.9° below horizontal** and its top edge is **+17.1°** (58° vertical FOV). After the walk
  that vantage needs (the camera must clear the fortress's south wall at Z = −71), the camera stands
  at Z ≈ −68.7, y ≈ 3.6 and the rear stone plane is 24.4 away, so the visible top edge is
  **≈ y 11.1**: the frame holds tier 1 (the arcade and the gate), the tier-1 cornice, and the tier-2
  recess only over y 9.5 → ≈ 11.8 — the attic and crest are far above it. That exposed liner band
  becomes visible only above the tier-1 cornice's own top edge (11.7° at that distance), i.e. from
  ~12.5° upwards.

- **Live reproduction in the sandbox.** The player was driven to the rear (title → `Play as Guest`
  → city map → fast travel to the Northern Roman Fortress → walk south → orbit the chase camera) and
  a frame was captured: **the rear wall renders complete with its arch openings and the gate**, the
  gate opening onto the darkened interior, no blank or torn regions, **0 console errors and no
  failed requests**. A second capture (rear ¾) and the mobile-portrait framing were **not** obtained:
  the sandbox has no GPU (SwiftShader ~1.5 fps) and the travel + walk + orbit sequence alone
  consumed the script budget — that attempt timed out after the first frame.

- **No cause was established, so nothing was changed.** Untouched: the drum's arcs, the gate, the
  arcade, every material, every collider, the Colosseum's position and every other city component.
  This phase's diff is **this file only** (documentation).

- **Evidence needed to continue.** (a) A device screenshot/recording from behind, at the same spot
  with the camera panned left and right, plus the front for comparison, so the *shape* of the
  missing region is visible; (b) the device model, GPU and browser; (c) whether what is missing is
  **stone** (the facade surface between/below/above the openings) or the **openings themselves**
  (the arches and the gate showing the interior) — the two have opposite remedies; (d) whether it
  changes with camera angle/distance or is stable, and whether the tier-2 band above the gate is
  part of what looks missing; (e) whether it appears in both portrait and landscape, since portrait
  narrows the horizontal window to ~27° and the arcade's openings then dominate the frame.

- **Ranked candidate mechanisms, each with the remedy it would imply** (none authorised; none
  applied): (1) **perception, not geometry** — the unlit rear, the 51%-open arcade and the exposed
  dark liner over the gate read as a missing wall; the remedy is a *design* choice (a north-side
  fill light, or carrying the rear's tier-2 pilaster rhythm across the gate zone as the front's
  portal does), not a geometry repair. (2) **tone-mapping/ambient response** differing on the
  device, crushing the already dim rear surface; the remedy is again a city-wide lighting/contrast
  change. (3) **environment-map (PMREM) failure or loss on the mobile GPU**, which removes most of
  the shade-side fill and would make the rear the first thing to disappear; the remedy is
  diagnostic — read `[WebGL 3D Context - CityHubMetropolis]` and the console on the device — before
  any code change. (4) **WebGL context loss/restore** leaving stale buffers; C-8.69A recorded one
  blank-canvas frame under SwiftShader with `isContextLost() === false`, so this needs a device log,
  not a code change. A device screenshot is what separates these.

- **Verified 2026-10-19** in the dev container: `bun test` → **1805 pass / 0 fail (56 files,
  39,186 `expect()`)**; `bun test src/utils/phaseC8_{24,28,31,33}.test.ts` → **101 pass / 0 fail**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only); `git diff --check`
  → clean. No test, constant or collider was touched.

## C-8.70A chariot racing audit (read-only)

- The full record — arena, start-line and perimeter measurements, the movement and camera constants, the measured horse-asset feasibility and the Stage 1–3 roadmap — lives in [.base44/chariot-racing-audit.md](.base44/chariot-racing-audit.md). Keep racing audit detail there rather than enlarging this file.
- Headline finding: the three horse GLBs (15.2 / 15.8 / 16.3 MB) each carry one 31-joint skin and three clips, and **`Gallop` and `Walk` move no leg joint** (largest leg rotation 0.02°); `Idle` moves the legs 2°. The clips are not gaits, so a hitched team either stands in the rest pose or needs a procedural leg cycle.
- Stage 1's remaining acceptance is the hitched team plus rolling wheels; Stage 2 (the finish line) is unstarted, so `finishRace` still has no caller.

## Rolling wheels on the race chariot (Phase C-8.70B Stage 1, Slice 3 — implemented)

- **What ships.** The fitted wheels now turn with the ground instead of sliding. `chariotMovement.ts` gains `CHARIOT_WHEEL_RADIUS` (**0.685** = the measured hub Y 0.650 less the tyre bottom −0.035; `CHARIOT_MODEL_SCALE` is 1, so the model radius is the world radius) and `advanceWheelRoll(roll, speed, frameDt)` — a pure `distance / radius` reading whose frame delta is clamped at `CHARIOT_MOVEMENT.maxFrameDt` exactly as `advanceChariot` clamps its own, and which reads a non-finite speed or angle as zero. **Forward DECREASES the angle**: the model's forward is local −Z and a positive rotation about +X carries a crown toward +Z.
- **The scene's half.** `RaceScene.tsx` re-parents each of the GLB's two parentless wheel nodes (`Wheel_L`, `Wheel_R`) onto a pivot placed at that wheel's own MEASURED bounding-box centre — their geometry is centred on the hub at (±0.700, 0.650, 0.000), so rotating the node in place would swing the wheel around the chariot — and writes the roll onto the pivots' `rotation.x`. The angle advances from `motion.speed` and only while the scene's own `racing` gate is true, so the countdown, an aborted race and a race frozen behind the settings panel leave the wheels still. The cached `useGLTF` scene is cloned before any of this, so the workshop's shared entry is untouched.
- **Two corrections this turn, both in the new suite and both mine.** The circumference assertion drove one second-long frame, which the module deliberately clamps to 0.1 s, so it now accumulates 60 frames; and the poisoned-angle case expected `0` where the rule (by design) resets the angle and still applies the frame's turn.
- **Verified 2026-10-20** in the dev container: `bun test src/utils/phaseC8_70bStage1Wheels.test.ts` → **14 pass / 0 fail**; focused with `chariotMovement.test.ts` + `phaseC8_70bStage1Slice2.test.ts` → **96 pass / 0 fail**; `bun test` → **2437 pass / 0 fail (81 files)** (the 2423 / 80 baseline plus this suite's 14 and its file); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 with the startup-asset check passing (8 assets). A throwaway harness in the `web` container loaded the shipping GLB through three's own `GLTFLoader` and measured each pivot at (±0.700, 0.650, 0.000) with the wheel's world bounding box **identical at 0, π/2, π and 2π** — so the wheel spins on its axle and does not orbit.
- **Live evidence.** The real route was driven in the preview browser (CONTINUE → city map → East Circus Race Forecourt → `ENTER THE CIRCUS RACE [E / SPACE]` → `Start Race`): the scene mounted on `data-race-state="racing"`, the clock ran and a captured frame shows the chariot standing whole on the sand with the carceres arcade behind it — i.e. the re-parenting leaves the model intact. **Not automatically verified: the roll itself as a rendered motion** — the sandbox runs SwiftShader at ~1–2 fps, so neither the direction nor the rate can be read from a frame; the rule is pinned by the suite and by the pivot measurement above. Android remains the place to confirm that the wheels read as turning at speed (and that a spoked wheel at 13 u/s does not strobe).

## Circus race scene and state machine (Phase C-8.70B Stage 1, Slice 1 — implemented, verified live)

- **What ships, and on which screen machine.** The race is a **fifth value of the existing screen
  machine**, reached exactly the way the duel is: `App.tsx` gains `'race'` in its `GameScreen` union,
  one `React.lazy()` import and one conditional render (`RaceScene` behind the same `Suspense`
  fallback as `CityHubScene` / `DuelScene`), so the city **unmounts** for the race rather than being
  overlaid. No router, no second scene manager, no scene registry. The files are
  `src/components/3d/RaceScene.tsx` (new), `src/utils/raceState.ts` (new),
  `src/utils/raceState.test.ts` (new, 60 tests), `src/utils/phaseC8_70bStage1.test.ts` (new, 26
  tests), and the Slice 0 wiring they extend — `App.tsx`, `CityHubScene.tsx` (`handleStartRace`
  captures the live pose, `initialPosition` / `initialRotationY` spawn the city back at it),
  `PreRacePanel.tsx` ("Start Race" hands off instead of showing the Slice 0 notice) and
  `circusDistrictGeometry.ts` (the derived start line and camera).

- **The state machine is a pure module, and it owns the vocabulary.** `raceState.ts` imports
  **nothing** — no React, no three.js, no clock, no storage — and holds the five states `idle |
  countdown | racing | finished | aborted` in a transition table: `idle → countdown` on `start`,
  `countdown → racing` on `countdown-elapsed`, `racing → finished` on `finish` (**from `racing`
  only**), any state → `aborted` on `abort`. Every other pair is a no-op returning the state it was
  handed, so a stray second `start` (a StrictMode double-mount) or a `finish` arriving early cannot
  move the machine. Presentation timing lives here too but is *derived*, never stored:
  `COUNTDOWN_STEPS` / `COUNTDOWN_STEP_MS` / `COUNTDOWN_MS` (3 s), `getCountdownStep(elapsed)` →
  `"3" | "2" | "1" | null`, `GO_LABEL` / `GO_DISPLAY_MS` (a beat inside `racing`, not a sixth state)
  and `formatRaceElapsed` → mm:ss.t. **`finishRace` is the finish-line API: nothing calls it yet**,
  which is why `finished` is a state the suite drives and the scene cannot reach — Stage 2's job.

- **The scene owns the two clocks the machine is not allowed.** It mounts in `idle`, dispatches
  `start` once on mount, runs a 100 ms interval that reads `getCountdownStep` and dispatches
  `countdown-elapsed` the moment it answers `null`, and derives the race clock from that instant.
  `GO` clears itself after `GO_DISPLAY_MS`. Abort is an oversized touch target **and** Esc (a desktop
  addition to a control that is always on screen), and either path dispatches `abort` and hands
  control back to `App`, which tears the scene down and returns the player to the city at the pose
  captured on entry. The scene renders the **shipping** `EastCircusArena` (same GLB, transform,
  static-mesh handling and preload — the paved district is deliberately not mounted) and the
  **shipping** chariot through `CHARIOT_MODEL_URL` / `CHARIOT_MODEL_SCALE`, cloned per the workshop's
  rule, on the start line `CIRCUS_RACE_START` (`CIRCUS_AXIS_X` 52.34, Y 0 — the track's top face — and
  Z 42.5, on the track's centre line 1.30 north of the carceres block's rendered north face at
  43.80 and 3.50 north of its registered front line at 46.00), under the city hub's own calibrated
  light rig.

- **Both race poses are derived in the layout module, not typed into the scene.** `CIRCUS_RACE_START`
  (`{x: CIRCUS_AXIS_X, y: 0, z: 42.5, rotationY: 0}` — the chariot's pole faces −Z) and `CIRCUS_RACE_CAMERA`
  (`position [start.x + 3.66, 3.4, start.z − 8.5]`, target `[start.x, 0.9, start.z − 0.5]`) live in
  `circusDistrictGeometry.ts`; the camera stands north-east of the model looking back at it because
  the 2.18-high carceres block behind the start line would hide the chariot from any camera placed
  there. The scene reads both, so the line the model stands on and the line the suite asserts cannot
  drift, and **no collider, movement constant or city mesh was touched** — the whole slice adds
  geometry to no city file.

- **Read-only, and it is pinned both ways.** Neither handler (`handleStartRace`, `handleExitRace`)
  nor the scene names `saveProfile`, `localStorage`, `sessionStorage` or the storage service, and the
  suite asserts that over the sources *and* over the scene's comment-stripped code (so prose cannot
  satisfy or defeat the check). Entering, racing and aborting therefore cannot move gold, unlocks or
  progression — which the live pass below measured against the save itself.

- **Harness repairs (this turn — no production file changed).** The Slice 1 suite was committed in a
  state that could not run: its §C `describe` block was missing its closing brace (bun reported the
  file as an *unhandled error between tests*, and `bun run lint` failed with TS1005 at
  `phaseC8_70bStage1.test.ts:319`), and the "CONTROL: the pose is not the city's own spawn" test had
  an empty body. Both were finished, and two further expectations were stale against the shipped
  code: the §D import assertion pinned a bare `import { CIRCUS_RACE_START }` where the scene
  legitimately imports `{ CIRCUS_RACE_CAMERA, CIRCUS_RACE_START }` in one line, and §E's scope-guard
  strip removed only the start line and then failed on the **derived** `CIRCUS_RACE_CAMERA`, which
  references it. The strip now lifts both constants out (they are exactly this slice's additions)
  before asserting no other mention survives. **No assertion was deleted or weakened** — the
  control test gained a body (four assertions), the import check gained a second member, and the
  scope guard now removes the whole race block instead of half of it.

- **Verified 2026-10-19** in the dev container: focused
  `bun test src/utils/{raceState.test.ts,phaseC8_70bStage1.test.ts,phaseC8_70b.test.ts}` →
  **81 pass / 0 fail** (the starting point was 79 / 2 fail / 1 error); `bun test` →
  **1895 pass / 0 fail (60 files, 40,297 `expect()`)**; `bun run scripts/collisionTests.ts` →
  **123 passed, 0 failed**, exit 0; `bun run lint` (`tsc --noEmit`) → **exit 0** (TS1005 before the
  repair); `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only); `git diff --check`
  → clean.

- **Preview evidence — the whole flow driven through the real UI.** In the preview browser
  (anonymous visitor: **no session was replayed**, so the run used the app's own guest path —
  `PLAY AS GUEST` → the creation screen with its defaults accepted → the city hub, which wrote the
  guest profile the app itself writes, **1960 chars**): the map drawer's **`East Circus Race
  Forecourt`** fast-travel entry (`[CIRCUS_RACE_ENTRY.x, z − 2]`, inside the entry disc) landed on
  the district's own prompt **`ENTER THE CIRCUS RACE [E / SPACE]`**; that opened the read-only
  pre-race panel (`BIGA · 2 horses on the yoke`, the "nothing is wagered and nothing is written to
  your gladiator" notice); **`Start Race`** unmounted the city and mounted the race scene on
  `data-race-state="countdown"` with the step overlay reading **3**; the countdown elapsed into
  `data-race-state="racing"` with the **GO** overlay up and the clock ticking (`00:00.0` → `00:00.8`
  across a 600 ms gap); **`Abort race`** — the control the touch path uses, present in both running
  states — unmounted the race, remounted the city and brought the district's prompt back up,
  i.e. **the pose captured on entry was restored**; and a **second** full cycle left the save
  **byte-identical** (1960 chars before and after, gold 100). **0 console errors** in every call.
  Captured frames: the creation screen, the forecourt prompt, the pre-race panel, the countdown
  (`STARTING GATES` + the step), the running race (`RACE CLOCK 00:01.0`) and the city after the
  abort. The guest profile this check created was **deleted from storage afterwards**, and the
  preview browser's save was otherwise never written by the race.

- **Not automatically verified, and out of this slice's scope.** (1) **The rendered arena and
  chariot read on device** — the sandbox has no GPU (SwiftShader, ~1–2 fps), so the frames above
  establish that the arena shell, the chariot on the sand and the countdown/clock overlays *render*,
  which is not visual acceptance of their appearance, scale or lighting; that check belongs with the
  open C-8.64A/B/C-8.65 district items. (2) **The `finished` state and `finishRace`** — nothing calls
  the finish-line API and the scene cannot reach `finished`; it is exercised only by
  `raceState.test.ts`, and **Stage 2 (the finish line) is not started**. (3) **Horses, opponents and
  any locomotion** — this slice renders one static chariot at the start line: no horse asset, no
  trace staple, no harness, no gait and no rival, exactly as C-8.67D/C-8.68B left them. (4) **The
  race's own camera is fixed** (`RaceCameraRig` sets it once; nothing moves this slice), so no
  driving/steering behaviour is claimed. **This file had no C-8.70B section before this one**, so
  Slice 0's entry point — the district signpost trigger, the `east_circus_arena` hub entry and
  fast-travel arrival, and the read-only panel — is documented only in `phaseC8_70b.test.ts`'s header
  and `cityCollisions.ts`'s own comments.

## Chariot movement, touch controls and the chase camera (Phase C-8.70B Stage 1, Slice 2 — implemented)

- **What ships.** `src/utils/chariotMovement.ts` (new) is the chariot's motion as a **pure module** —
  no React, no three.js, no clock, no storage; `src/components/ui/RaceTouchControls.tsx` (new) is the
  touch surface; `src/components/dev/RaceHarness.tsx` (new, dev-only) is the reach-the-race-without-
  walking harness. They extend Slice 1's `src/components/3d/RaceScene.tsx` (the frame loop, the
  keyboard map, the chase camera and the racing HUD), `src/components/hub/PreRacePanel.tsx` (the
  read-only "How to drive" diagram) and `src/main.tsx` (the harness branch). New suites:
  `src/utils/chariotMovement.test.ts` (52 tests) and `src/utils/phaseC8_70bStage1Slice2.test.ts`
  (30 tests). No collider, no city geometry, no combat / workshop / progression module and no saved
  value was touched; both suites assert that over the sources as well as over comment-stripped code.

- **The module's one import is the arena's own collision data, deliberately.** The area the chariot
  may drive in IS the arena ring's authored outline — `chariotMovement.ts` walks `CIRCUS_WEST_X` /
  `CIRCUS_SOUTH_Z` / `CIRCUS_OVAL_START_Z` / `CIRCUS_WEST_OUTLINE` (with `CIRCUS_AXIS_X` /
  `CIRCUS_EAST_X`) as one closed polygon, so the boundary the movement clamps against and the ring
  the walking resolver stops a player at cannot drift apart. Three of the ring's 31 segments are
  deliberately NOT edges of it — `circus-carceres-w`, `circus-carceres-e` and `circus-carceres-front`
  — because those bound the carceres block's own belly, which is stone at Z ≥ `CIRCUS_SOUTH_Z`. The
  suite re-derives every edge from the registry and pins exactly that exclusion (`circus-*` stays 31).

- **The forward axis is read off the shipping model, not chosen.** `CHARIOT_MODEL_FORWARD = '-Z'`
  with `CHARIOT_MODEL_YAW_OFFSET = 0`: `chariotGeometry.ts` measures the draught pole ahead of the
  axle on the model's local −Z, the team plan's own audit states `-Z` as a constant of its own, and
  `circusDistrictGeometry.ts` places the start line with `rotationY: 0` for that reason. So
  `rotation.y = heading` needs no correction, the world direction travelled is `(−sin θ, −cos θ)`,
  and `steer +1` is the driver's RIGHT (it DECREASES the heading, because increasing θ turns the
  model's −Z nose toward −X).

- **Every constant is one exported object.** `CHARIOT_MOVEMENT` holds the forward cap (13), the lower
  reverse cap (3.2), acceleration / brake / reverse / drag, the turn rates at rest (0.35 rad/s
  crawl) and at the cap (1.5), the fixed step (1/60 s), the frame clamp (0.1 s), the two boundary
  probes (body 1.05 behind, yoke 0.70 at 2.02 forward) and the Clean Start windows.
  `CHARIOT_CHASE_CAMERA` held the camera's — distance 7.5, height 6.6 (measured to clear the
  2.18-high carceres block, which sits south of the start line), look-ahead 5, follow rate 5/s.
  **Superseded by the camera addendum below:** the camera's constants left this module for
  `src/utils/chaseCamera.ts`, where the same object now carries the surveyed standard — 55°/65° FOV,
  the Near/Standard/Far distance presets, the `4 + 0.9 × speed` look-ahead and the start-line rest
  framing. Nothing else in the slice hard-codes one of these.

- **Steering scales with speed, the boundary STOPS the chariot, and the frame cannot tunnel.** The
  turn rate runs linearly between the standstill crawl and the cap, so there is no pivoting on the
  spot; boundary contact resolves as a position projection plus `speed = 0` (a slide was rejected as
  the more complex of two correct behaviours, and this slice's criterion is only that the chariot
  cannot leave the arena); and `advanceChariot` clamps the frame delta at 0.1 s and then runs whole
  fixed 1/60 s steps, so a backgrounded tab freezes the race instead of teleporting the chariot. The
  suite drives full throttle into the boundary from sixteen headings and asserts
  `isChariotInsideArena` after EVERY step, plus an absurd-dt case and a corner hit.

- **Clean Start is a `racing`-state MODIFIER, not a sixth state.** `raceState.ts` keeps its five
  states and its transition table untouched; `trackChariotLaunch` / `launchAccelScale` read the
  throttle and the elapsed time since GO and hand `advanceChariot` an acceleration multiplier only
  (1.35 for 1200 ms after a clean release, 0.5 for the same window after a held-through-GO bog).
  The scene dispatches only Slice 1's own three events, and the suite asserts that too.

- **Both input paths write the SAME two fields.** The keyboard map and the touch clusters feed
  `throttle` / `steer`, merged per frame by clamped sum, so either path alone produces identical
  motion and using both at once cannot exceed full deflection. A window `blur` releases every key, so
  a tab switch cannot hold the throttle. The touch surface is two bottom-corner clusters, every
  control visible and labelled with its own `data-race-control`, in the shipped `TouchControls`
  Block-button hold idiom; **Lefty Mode mirrors the entire cluster as one unit**; and the first race
  of a session teaches on the controls from session state only — nothing is saved.

- **The harness is dev-only and dynamically imported.** `RaceHarness` mounts the REAL `RaceScene`
  (not a copy) with no title screen, creation, hub or fast travel to walk, reachable only through
  `?devHarness=race` or the scratch flag `sand_and_steel_dev_harness = 'race'`, inside `main.tsx`'s
  `import.meta.env.DEV` gate and before the final `<App />` else; the module carries the same
  self-guard. Removal: delete the file and revert that branch.

- **Suite repair (this turn — no production file changed).** The Slice 2 suite's harness-ordering
  assertion compared `mainSrc.indexOf('<App />')` on the RAW `main.tsx`, where the header *prose*
  mentions `<App />` at character 324 while the branch itself sits at 6,515 — so the comparison
  could never hold, however the branches were ordered. It is now read comment-stripped through the
  suite's own `code()` helper, which exists for exactly this ("prose cannot satisfy — or defeat — a
  check"). No assertion was removed or weakened.

- **Verified 2026-10-20** in the dev container: focused
  `bun test src/utils/chariotMovement.test.ts src/utils/phaseC8_70bStage1Slice2.test.ts` →
  **82 pass / 0 fail** (22,978 `expect()` calls; the starting point was 81 / 1 fail);
  `bun test` → **1977 pass / 0 fail (62 files, 63,275 `expect()`)**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only);
  `git diff --check` → clean.

- **Not automatically verified — the drive itself, and it is a device question.** The sandbox has no
  GPU (SwiftShader, ~1–2 fps in the 3D scenes) and an automated end-to-end drive in the preview was
  already attempted and abandoned for that reason, so no browser evidence is claimed for driving.
  What the two suites do establish: the pure module's own behaviour — acceleration and both caps,
  speed-scaled steering, the no-tunnelling frame, the boundary invariant after every step of every
  drive, both launch outcomes and the gait bands — which needs no renderer at all; plus the
  source-level wiring (the scene drives the module, only while `racing`, with the model's own axis,
  both input paths, and the chase camera's measured height). **Remaining for the device (Android):**
  the touch controls' feel and their Lefty mirroring, the chase camera's smoothness and its framing
  relative to the carceres block, and the racing HUD's legibility on a phone. Stage 2 (the finish
  line) is not started, so `finishRace` still has no caller.

## Chase camera at the surveyed standard (Phase C-8.70B Stage 1, Slice 2 — camera addendum, implemented)

- **What ships, and what deliberately did not.** A surgical CAMERA-only change to Slice 2's race
  chase rig, at the studio's camera/FOV survey: the camera's constants move into a module of their
  own and the rig reads the surveyed standard from it. `src/utils/chaseCamera.ts` (new, PURE:
  no React, no three.js, no clock, no storage), `src/utils/chaseCamera.test.ts` (new, 25 tests),
  `src/utils/phaseC8_70bStage1Camera.test.ts` (new, 20 tests), `src/components/3d/RaceScene.tsx`
  (the rig, the Canvas's FOV and one optional prop), `src/utils/chariotMovement.ts` (the camera
  constants leave it — **the movement physics is untouched, constant for constant**) and
  `src/utils/chariotMovement.test.ts` (its import list, and its one camera test replaced by the
  module boundary that now holds). **No movement constant, race state, control, collider, collision
  response, countdown, save, city mesh or draw call changed, and no settings UI was built.**

- **The standard, before → after.** Every value is asserted in the two new suites rather than
  restated from this document:

  | quantity | Slice 2 (before) | after (the survey) |
  |---|---|---|
  | vertical FOV | fixed `fov: 50` on the Canvas | **55 at rest → capped 65 at `maxSpeed`** |
  | chase distance | 7.5 | **8.5** (Standard; presets Near 7.0 / Standard 8.5 / Far 10.5) |
  | camera height | 6.6 | **3.4** (Near 3.0 / Standard 3.4 / Far 4.0) |
  | look-ahead | constant 5 | **`4 + 0.9 × speed`** — 4 at rest, 15.7 at the 13 u/s cap, signed |
  | look height / follow rate | 0.9 / 5 s⁻¹ | 0.9 / 5 s⁻¹ — **unchanged** (Slice 2's smoothing) |
  | steering bias | none | **±2.2 at full deflection, on the look target only** |
  | start-line framing | none — the rig took its pose and followed the preset everywhere | **Slice 1's measured start pose at rest**, easing to the preset as the chariot gets going |

- **The FOV is coupled to the movement module's own speed fraction, and nothing else.** It reads
  `getChariotPace` (|speed| / `CHARIOT_MOVEMENT.maxSpeed`, already clamped and NaN-guarded — the same
  reading the HUD's pace bar uses, so there is one definition of "how fast is that") and smoothsteps
  it: **55° at 0, 65° at the cap**, monotonic between, clamped beyond, and a pure function of the
  CURRENT speed, so it settles back exactly as the chariot slows. Measured: over a 1000-sample sweep
  of the cap the largest single step is **< 0.02°** (no step, no jitter), and a non-finite reading
  resolves to rest rather than widening the frame. The projection matrix is rebuilt only when the
  value moves, and a state that is not `racing` restores the rest FOV with the static camera. This
  adds **no draw call, material, light or geometry**.

- **The look-ahead is the survey's formula plus a lean into the steering.** The look point is
  `chariot + heading × (4 + 0.9 × speed)` at the unchanged 0.9 look height, and it is leaned
  `2.2 × steer` toward the driver's RIGHT (`chariotMovement.ts`'s own sign — the scene passes the
  SAME merged `input.steer` the physics is driven with, so the lean and the turn cannot disagree).
  Only the look target moves; the camera's own position is untouched by steering. The distance/height
  pair is **one named preset config** — `CHASE_DISTANCE_PRESETS` (`near` / `standard` / `far`) with
  `CHASE_DISTANCE_PRESET_DEFAULT = 'standard'` — and the composed pose is written into a
  preallocated object, so the frame loop still allocates nothing.

- **No settings module exists, so the preset is the config constant plus a named attachment point.**
  Searched: there is no settings store in this repo — the only player preference, Lefty Mode, is a
  **field on the saved profile** (`src/types/game.ts`, toggled by `SettingsModal` and written by
  `App` through `saveProfile`), and this addendum must not write a save. So the preset is read from
  `CHASE_DISTANCE_PRESETS` through **`resolveChaseDistancePreset(name?)`** — total by construction,
  an unknown or missing name resolving to Standard — and reaches the rig through `RaceScene`'s new
  optional **`chaseDistancePreset`** prop. Those two names are the settings row's attachment point:
  when the row lands it passes its stored name in, and nothing else changes. **No UI was built and no
  caller passes a preset yet**, so Standard is what runs today.

- **The rest framing: why it exists, and what it does.**
  1. **Measured, not a taste call.** The carceres block (2.18 high, `Travertine_25` + `Marble_26`,
     Z 43.800 … 46.000, 18 wide) stands SOUTH of the start line, i.e. exactly where a chase camera
     goes. At the surveyed 8.5 behind / 3.4 high the sight line to the 1.335-high model crosses
     Y 2.18 at **Z 45.978 — inside the block**, so at rest the whole model is hidden; its top only
     clears the block's north-top corner once the chariot is **2.18** of travel clear of it (the whole
     model, 4.15). Slice 1's own record says the same thing about "behind" from the other side, which
     is why Slice 1's camera is north-east of the line in the first place.
  2. **So the rig holds Slice 1's measured pose while the chariot is at the line and slow.** The
     offsets are **derived** from `CIRCUS_RACE_CAMERA` and `CIRCUS_RACE_START` (camera 8.5 ahead,
     3.66 to the driver's right, 3.4 up; look point 0.5 ahead at 0.9 up), expressed in the chariot's
     own frame, so the framing and the layout module's measured pose cannot drift apart. **At the
     start line at rest the composed pose IS `CIRCUS_RACE_CAMERA`** (asserted to 1e-12), which also
     makes the take-over at GO **continuous** with the countdown's static camera instead of Slice 2's
     snap — verified live below.
  3. **The hand-over is the product of two smooth fades**, because the rest framing is the START
     LINE's framing and not "what a stopped chariot looks like": the distance from the start line
     (full at 0, zero at **5.0** of travel) × the speed fraction (full at 0, zero at **0.55** of the
     cap, i.e. 7.2 u/s). The distance fade is what stops a camera swing to the FRONT of the chariot
     every time it stops mid-track — a boundary hit zeroes the speed — and the speed fade is what
     stops one when a chariot crosses the line at speed. Both fades are smooth and monotonic, so the
     hand-over never reverses while the player accelerates: measured across a real 180-frame launch
     (the shipped `advanceChariot` at its fixed 1/60 s step), the largest single-frame move of any
     pose component is **< 1.5 world units** and the largest single-frame FOV change **< 0.35°**.

- **Measured open risk — the interior triumphal arch at the north end (NOT fixed, and not fixable
  inside the survey's numbers).** Live, driving straight north at full gallop: with the chariot at
  Z −27.93 the camera sits at Z −19.43, SOUTH of `Travertine_30` (the triple-arched monument,
  X 49.840 … 54.840, **Y −0.050 … 3.750**, Z −23.900 … −22.500), and its 3.750 top is above the
  3.4-high camera, so the sight line to the model's top passes **1.44 below** that top — the chariot
  is occluded for as long as it is north of the monument inside the camera's 8.5. The Slice 2 rig
  (7.5 behind, 6.6 high) cleared the same top by **0.41** at the same moment. This is the survey's
  own height, not a coding slip, and the addendum is explicitly a surgical change to the surveyed
  numbers — so it is **recorded here rather than repaired**: a future, explicitly authorized phase
  would have to raise the Standard (or make the rig occlusion-aware) and re-run the survey. The
  carceres block is the same family of risk and is why the rest easing exists.

- **Verified 2026-10-20** in the dev container: focused
  `bun test src/utils/{chaseCamera.test.ts,phaseC8_70bStage1Camera.test.ts,chariotMovement.test.ts,phaseC8_70bStage1Slice2.test.ts,phaseC8_70bStage1.test.ts}`
  → **153 pass / 0 fail**; `bun test` → **2022 pass / 0 fail (64 files, 64,803 `expect()`)** (the
  starting point was 1977 / 62 — the delta is this addendum's 45 tests and 2 files);
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only);
  `git diff --check` → clean. The validation's starting point was **5 failing assertions in the two
  new suites plus three `tsc` errors** — one wrong sign, a monotonicity probe that sampled past its
  own zone, a FOV case that read a *guarded* non-finite speed as "at the cap" when the movement
  module deliberately reads it as rest, a scene-wide token sweep that matched the city's own
  `directionalLight`, and the r3f camera union's missing `.fov` — every one of them fixed in the
  suite or by narrowing the type, **none by loosening a check**.

- **Preview evidence — driven through the app's own route, and what it establishes.** The
  `?devHarness=race` shortcut was **NOT reachable this turn**: the platform's preview navigation
  rewrites the query string to its own (`_preview_token`, `base44_data_env=prod`,
  `analytics-enable=false`, `hide_badge=true`), so the parameter never reaches the app — the route
  below is the shipped one. Driven in the preview browser (an anonymous visitor; **no session
  replayed**, so the app's own guest path was used): `PLAY AS GUEST` → the creation screen with its
  defaults → `APPLY POINTS & ENTER METROPOLIS` → the **3D city hub** → `City Map & Navigation`
  (by accessible name — it is an icon control, so a text locator does not match it) → the map's
  **East Circus Race Forecourt** entry → the district's prompt `ENTER THE CIRCUS RACE [E / SPACE]`
  (`keydown KeyE`) → the read-only pre-race panel → **`Start Race`** → `data-race-state="countdown"`
  → `"racing"`. Read back at **6.7 s into `racing`, with no throttle** (so the rig — not the
  countdown's static camera — owned the frame): gait **HALT**, position **(52.34, 42.50)**, the race
  clock ticking, and a captured frame showing **the chariot centred on the sand with the carceres
  arcade behind it**, i.e. Slice 1's framed start, with the chariot **visible** rather than hidden
  behind the 2.18-high block. Then the app's own keyboard path was held (`keydown` `KeyW` on
  `window`): the gait read **Walk → Trot → Gallop**, the chariot travelled **Z 42.50 → −27.93**
  (70.4 units down the track, stopped by the arena's own boundary), the chase framing and the wider
  FOV are visible in the second captured frame, and there were **0 console errors** — the north-end
  frame is the occlusion recorded above.

- **Not automatically verified.** (1) **The FOV curve as a rendered number** — it is unit-verified
  (55/65, monotonic, smooth, clamped) but the sandbox's SwiftShader frames cannot be measured for it.
  (2) **The camera's smoothness and its framing on the target device** — SwiftShader runs the 3D
  scenes at ~1–2 fps, so the lerp, the launch hand-over and the steering lean were exercised only as
  a live drive at a coarse frame rate; the device check this addendum leaves open is exactly Slice 2's
  (the chase camera's smoothness and its framing relative to the carceres block). (3) **The preset
  prop path with a non-default value** — no settings row exists, so nothing passes `near` or `far`;
  the presets are unit-verified and the resolver is exercised, but no live run has used one.
  (4) The preview-call budget was exhausted by the route search, so no cleanup call followed: the
  preview browser holds the guest profile the app's own `PLAY AS GUEST` path wrote, and the platform's
  fresh loads clear browser storage anyway.


## Offline service worker (store-quality offline launch — implemented)

- **What ships.** `public/sw.js` (hand-written, no workbox), `public/offline.html` (the designed
  offline screen) and a production-gated registration at the end of `src/main.tsx`:
  `if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`
  — fire-and-forget, so an unsupported or blocked browser cannot break boot. The suite is
  `src/utils/serviceWorker.test.ts` (32 tests); its §F is *driven*: it evaluates the shipped `sw.js`
  against a fake `self` / `caches` / `fetch`, so the fallback chain, the 200 status, the cache
  write-back and every bypass are exercised rather than grepped.
- **The contract, and why each piece is the way it is.** One versioned cache,
  `sand-steel-shell-v1`: **bumping `VERSION` is the upgrade path**, `activate` deletes every other
  `sand-steel-*` cache so an old shell cannot linger (the file is copied verbatim into `dist/` and
  never hashed, so the cache name is the only version marker) and claims the open clients. `install`
  precaches `/`, `/index.html`, `/offline.html`, the manifest and the four icons, each entry fetched
  and stored independently (`cache: 'reload'`, one failure tolerated) so a missing icon cannot abort
  the install. Navigations are network-first → the cached shell → `/offline.html` → an inline
  fallback document, **always answered as a normal 200** (a failed main document is a crash in store
  review). A successful navigation refreshes ONE fixed key (`/index.html`) — never a per-route or
  per-query entry, so the cache cannot grow. Static game assets (`.glb`, `.ogg`, images, fonts,
  built js/css) are network-first with a cache fallback. **Nothing authenticated is ever intercepted
  or stored**: another origin; `googleapis.com` / `googleusercontent.com` / `firebaseapp.com` /
  `firebaseio.com` / `gstatic.com` / `accounts.google.com`; the `/identitytoolkit`, `/securetoken`,
  `/drive/v3`, `/__/auth`, `/oauth` paths; any request carrying `authorization` or `range` (the
  soundtrack plays through `Audio()`); every non-GET; the `/__dev/` harness routes; and `sw.js`
  itself. Only a same-origin `status === 200 && type === 'basic'` response is ever stored.
- **Non-obvious: the worker exists only in a production build.** `import.meta.env.PROD` is statically
  false under `vite` / `bun run dev`, so the dev server registers nothing and the dev-harness
  branches in `main.tsx` are untouched — which also means the sandbox preview cannot reach it
  through the app. To exercise it, serve the **built** `/sw.js` (`bun run build`, then serve `dist/`)
  or register `/sw.js` by hand in the preview browser: the shipped worker then installs, caches
  exactly the eight shell entries and claims the open client. `public/offline.html` is deliberately
  self-contained — inline style and script, no font/image/link request of any kind — because it has
  to render with no network at all; its type stack starts at Cinzel and falls back to the device
  serif.
- **Verified 2026-10-20** in the dev container: `bun test` → **2054 pass / 0 fail (65 files)**,
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, `bun run lint` (`tsc --noEmit`) →
  exit 0, `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only), with `sw.js`,
  `offline.html`, `manifest.webmanifest` and all four icons in `dist/` and the registration present
  in the built bundle. In the preview browser the shipped `/sw.js` was registered for real (then
  unregistered and its cache deleted): it activated, `clients.claim()` took over the page, and
  `sand-steel-shell-v1` held exactly `/`, `/index.html`, `/offline.html`, `/manifest.webmanifest`
  and the four icons; `/offline.html` was served 200 and rendered its designed copy with no
  external reference in the file. The validation's starting point was **one failing test** in the
  new suite — the offline-navigation case asserted `/offline.html` where the documented chain serves
  the **cached shell**, so it became two tests (the cached shell; and `/offline.html` once both
  shell keys are gone), with no assertion removed — plus eight `tsc` errors in the test harness
  (a nullable helper return), fixed by typing it.
- **Not automatically verified — the offline launch itself.** The sandbox cannot cut the network
  mid-run, so a genuine cold start with no connection, and the installed-app (Android / TWA)
  launch, still need a device check: start the app with the connection off and confirm the shell
  (or, on a very first run, the designed offline screen) appears instead of the browser error page.

## START-1 — "The Front Gate" (the designed startup sequence — implemented, verified live)

- **What ships.** The startup SEQUENCE the PWA hardening exists to serve, on a new branch
  (`startup-sequence`) from `colosseum-exterior-architecture`. No game system, no auth change and no
  save write: the nudge is session-scoped, and every new surface is read-only.
  1. **The boot shell** — an inline `<style>` block and `#boot-shell` div in `index.html`, painted
     before any bundle or stylesheet exists, faded out and removed by `src/utils/bootShell.ts` once
     React has committed a frame (`src/main.tsx` dismisses it inside a double `requestAnimationFrame`).
     Its field colour is the manifest's `background_color` (`#0c0a09`), matched by the `theme-color`
     meta and by `<html>`/`<body>`, and its art is the SAME `.title-backdrop` rule `TitleScreen`
     wears, so the splash → title hand-off shows one picture twice rather than a blank frame.
  2. **The title art, compressed and named in one place** — `public/title_screen.webp` (285,498 bytes)
     is the primary with the 2,670,368-byte PNG as the fallback, declared once in `index.html`'s
     `image-set`. `src/utils/startupAssets.ts` is the registry; `scripts/startupAssetCheck.ts` is the
     build check (`bun run check:startup-assets`, and the second half of `bun run build`), which
     verifies the registry against `public/` AND `dist/`, verifies every URL the boot path names
     (`index.html`'s inline style and links, the manifest's icons, `sw.js`'s precache list) is
     registered, and verifies `TitleScreen` wears the shared class rather than naming the files.
  3. **The title hierarchy** — ONE primary action (`Play` for a fresh profile, `Continue` for a
     returning one) and ONE `Account` entry (`TitleAccountPanel` + `src/components/hub/TitleScreen.tsx`).
     Every sign-in path — the repo's existing `EmailAuthScreen` and the four existing social buttons —
     is mounted unchanged behind that entry, so nothing asks for input before the player chooses to
     give it.
  4. **The post-Oath nudge** — `src/components/hub/PostOathNudge.tsx` + `src/utils/postOathNudge.ts`:
     offered ONCE per session after character creation completes, dismissible twice over, and
     `pointer-events-none` everywhere but its own card so it never blocks the hub. Its only state is a
     `sessionStorage` flag (`sand_and_steel_post_oath_nudge_seen`) — the module names neither the
     profile key nor any save path — and its "keep him safe" action reuses the existing cloud-save
     entry point rather than adding auth.
  5. **The wait surface** — `src/components/ui/WaitSurface.tsx` + `waitSurfaceLines.ts` replace the
     bare "Loading City Hub…" text at all three destination fallbacks (city / arena / circus) inside
     `LazySceneBoundary`: the destination in the fiction plus a plain gloss, one Acta line that
     rotates (and can be tapped), and honest progress — a real asset count when Drei's loader knows
     one, an indeterminate sweep when it does not, never a fake percentage. Motion is
     transform/opacity only, paused while the tab is hidden, stilled under `prefers-reduced-motion`.
  6. **The failure surfaces** — `src/components/ui/GameFailureSurface.tsx`: an offline notice
     (non-blocking, dismissible, clears itself when the connection returns), a load-failure screen
     that names the tier that failed, and a no-3D screen. All plain language, each with the one honest
     recovery (reload); `LazySceneBoundary` catches a failed lazy chunk, and `App.tsx` resolves
     `checkWebGLAvailability()` once at boot.
  7. **The two-stage preload** — `src/utils/preloadAssets.ts` exposes `preloadTitleStage()` (stage 1,
     called at title mount) and `preloadTapStage()` (stage 2, called on the primary tap), each
     idempotent. The TIER CONTENTS are deliberately unchanged in this slice: both stages read the same
     `CORE_3D_ASSETS` list, so what a later slice's tier split decides is what is fetched and when the
     fetch starts — not what this slice ships.
  8. **The title's audio beat** (`src/audio/titleAudio.ts`) and **the title's phase**
     (`src/hooks/useTitlePhaseBackdrop.ts`) — the title paints silent and unlocks its motif on the
     first tap anywhere; the phase backdrop resolves through ONE named function that returns the dawn
     variant today, so START-1b replaces its body and nothing else.
  9. **`src/utils/start1.test.ts`** (20 tests) — the sequence's own contract: §A the shell's colour
     and backdrop, §B the hand-off (id/class/fade/order), §C the assets (present, the WebP smaller,
     the art named only in `index.html`, the build wired), §D the sequence (both preload beats, every
     destination's copy and mount, the Acta wrap, the three failure surfaces' plain language), §E the
     nudge (once per session, driven against a recording store, and provably unable to name the save).

- **A real defect the new build check found, fixed this turn.** `scripts/startupAssetCheck.ts`
  harvested EVERY `href`/`src` in `index.html`, so the bundle entry point `<script src="/src/main.tsx">`
  was reported as an unregistered startup asset and `bun run build` **exited 1** — i.e. the check as
  committed made every build fail. It now carries an explicit `SOURCE_ENTRY_POINTS` list (holding only
  `/src/main.tsx`), named rather than pattern-matched so a new asset cannot slip through by being
  mistaken for an entry point. `bun run build` is green and prints all eight assets in both `public/`
  and `dist/`.

- **Two repairs this turn — both determined by the evidence, neither by weakening a check.**
  1. **`src/components/dev/CharacterTestHarness.tsx` still called `preloadCoreGameAssets()`**, which the
     preload split removed, so `bun run lint` (`tsc --noEmit`) failed with TS2305 on the import. It now
     calls `preloadTitleStage()`, the harness's stated purpose being parity with App's boot
     side-effects. (`bun test` never saw it: the harness is a DEV-gated dynamic import and no suite
     loads it.)
  2. **`src/utils/phaseC8_70bStage1.test.ts` §A pinned the fallback TEXT START-1 replaced** — it
     asserted `'Entering the Circus...'`, the bare div that no longer exists. It is **rebased, not
     weakened**: the property it exists to pin (the race scene is a lazy chunk behind a Suspense
     fallback) now reads through the shipped form — `React.lazy(() => import('./components/3d/RaceScene')`,
     `<React.Suspense fallback={<WaitSurface destination="circus" />}>`, `<LazySceneBoundary tier="circus">`.

- **Verified 2026-10-20** in the dev container, after the last edit: `bun test` → **2074 pass / 0 fail
  (66 files, 65,061 `expect()`)** (2054 / 65 before, 1 of which was the stale fallback assertion;
  the delta is this suite's 20 tests and its file); `bun run scripts/collisionTests.ts` → **123 passed,
  0 failed**; `bun run lint` (`tsc --noEmit`) → **exit 0** (one TS2305 before the harness repair);
  `bun run build` → **exit 0** with the startup-asset check passing (the pre-existing >500 kB chunk
  warning only). The check reports every startup asset with its byte count in `public/` and `dist/`.

- **Live evidence in the preview browser (anonymous visitor — no session was replayed).** Part 1, the
  title: the served document carries `#boot-shell` with the shared `title-backdrop` class, and the live
  document has **no shell** once React has mounted, i.e. the hand-off ran; `meta[name=theme-color]` is
  `#0c0a09` and both `<html>` and `<body>` compute to `rgb(12, 10, 9)`; `.title-backdrop`'s computed
  `background-image` resolves to an `image-set` whose **WebP member is first and whose PNG member is
  the fallback**; there is **exactly one** primary action (labelled `Play` on a fresh visitor) and
  **exactly one** `Account` entry, and **zero** OAuth buttons are on the title until Account is opened;
  Account opens the panel (8 controls: the repo's email form plus the four social buttons) and its
  `← Back` control closes it, returning the title to its one-action state. Frames were captured of the
  title and of the open panel. Part 2, the sequence: the `Play` tap unmounted the title for the
  creation screen; taking the Oath surfaced the **wait surface** with its designed copy and a REAL
  asset count — *"The Ishtar Gate opens onto the Via Mercatoria. / LOADING THE CITY / Loading asset 10
  of 10 / FROM THE ACTA — The keeper inks another name into the Acta; the sand decides the rest."*; it
  cleared itself, the city hub mounted, and the **post-Oath nudge** appeared once over it; `Not now`
  dismissed it, the session flag read `1`, and there were **0 console errors** throughout. The guest
  profile this run wrote was **deleted from storage afterwards** — nothing was left behind, and no
  existing save was touched (`profileExistedBeforeThisRun: false`).

- **Not automatically verified, and what each would need.** (a) **The splash frame itself** — the first
  paint happens before any script, so what was checked is the served HTML, the colour contract and the
  fact that the shell is gone after mount; seeing the shell *painted* (and the installed-app splash
  above it) needs a device or a slowed network. (b) **The offline notice and the no-3D screen** — the
  sandbox cannot cut the network or remove WebGL, so both are covered by source and suite only; the
  offline launch is already an open device item from the service-worker phase. (c) **Sign-in** — the
  Account panel is verified to open and close, NOT to authenticate: no session was replayed and
  Google sign-in still needs an authorized domain. (d) **The once-per-session promise across a reload**
  — the live run offered the nudge exactly once and the suite drives the refusal of a second offer in
  the same session, but no reload was exercised live. (e) **The title's phase** — only the dawn
  variant exists (START-1b's resolver is a named stub). (f) The visual reading of the sequence on the
  **target device**, as with every other phase in this file.

## Sand & Steel polish pack — six value/copy fixes (Polish Pack §3 — implemented, validated)

- **Scope honoured: values and copy only.** Six single-site edits across four files — no logic, no
  save format, no test, no new file, no dependency. `git diff` is exactly six changed lines.
- **Item 1 — Doctore House notice (`src/components/3d/city/CityHubScene.tsx`).** The path the request
  named (`src/components/3d/CityHubScene.tsx`) resolves to
  `src/components/3d/city/CityHubScene.tsx` — the only `CityHubScene.tsx` in the repo; the *code*
  matched the description, so the item was completed rather than stopped. The sentence carrying the
  "special combat stances will be unlocked soon!" promise (no stance system exists) was replaced:
  - before: `Doctore Tactical House: Chief Doctore is currently supervising advanced conditioning. Advanced tactics and special combat stances will be unlocked soon!`
  - after: `Doctore Tactical House: Chief Doctore is currently supervising advanced conditioning. Train hard, fight well, and Rome will learn your name.`
  The first sentence is byte-identical; the replaced sentence is the whole second sentence, which is
  the one that carried the promise.
- **Item 2 — Settings panel title (`src/components/hub/SettingsModal.tsx`).** `Touch &amp; Movement
  Calibration` → `Touch &amp; Movement` (the panel carries no calibration control).
- **Item 3 — Settings footer button (same file).** `Apply &amp; Return` → `Done`. The handler is
  untouched: it plays the click sound and calls `onClose()`; every toggle still applies instantly.
- **Item 4 — Creation preview header (`src/components/hub/CharacterCreation.tsx`).** The
  `procedural_gladiator` fallback of the header mapping: `'Custom Gladiator'` →
  `'Centurion (Animated Rig)'`, matching that archetype's own model button (`🛡️ Centurion`). The five
  named rigs' labels are unchanged.
- **Item 5 — Viewport meta (`index.html`).** `width=device-width, initial-scale=1.0,
  maximum-scale=1.0, user-scalable=no, viewport-fit=cover` → `width=device-width, initial-scale=1.0,
  viewport-fit=cover`. Only the two zoom locks are dropped; width, initial-scale and viewport-fit are
  byte-identical. This is the authorized exception to the PWA workstream's "don't touch the viewport"
  note, and it applies to this tag only.
- **Item 6 — Hub footer label floor (`CityHubScene.tsx`).** The bottom district shortcut bar's label
  span: `text-[9px] sm:text-[11px]` → `text-[10px] sm:text-[11px]`. Only the 9px floor moved. The
  other three `text-[9px]` sites in the file are deliberately untouched: the 2-in-1 Attack/Interact
  button's two labels (`text-[9px] sm:text-xs`) and the quick-travel drawer's district badge
  (`text-[9px] font-mono …`), none of which is a footer shortcut-bar label.
- **Validation (2026-10-20, dev container — all five commands run and evidenced).** `bun test` →
  **2074 pass / 0 fail (66 files, 65,061 expect() calls)** — the START-1 count, unchanged;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  **exit 0**; `bun run build` → **exit 0** with the startup-asset check passing (8 assets; the
  pre-existing >500 kB chunk warning only); `git diff --check` → **clean (exit 0)**.
- **Live evidence (preview browser, anonymous visitor — no session replayed).** Served document:
  `meta[name=viewport]` content is `width=device-width, initial-scale=1.0, viewport-fit=cover`, with
  `maximum-scale` and `user-scalable` both absent. Creation screen: selecting the `🛡️ Centurion`
  archetype (real click) made the preview header read **`Centurion (Animated Rig)`**. City hub at a
  375 px viewport: all five footer shortcut labels compute to **10px** with the class
  `text-[10px] sm:text-[11px]`, and `scrollWidth === clientWidth === 375` (no sideways scroll).
  Settings panel, opened from the hub's own gear button (real click): the section reads
  **Touch & Movement**, `Calibration` is absent, the footer button reads **Done**, `Apply & Return`
  is absent, and clicking **Done** closed the panel. The dev server separately serves all four edited
  modules with the new values and none of the old ones (the viewport tag; the new notice sentence
  with `special combat stances` gone; `text-[10px] sm:text-[11px]` with the old 9px floor gone;
  `Centurion (Animated Rig)` with `Custom Gladiator` gone; and `"Touch & Movement"` / `"Done"`
  present with `Calibration` / `Apply & Return` absent). The guest profile the run created was
  deleted from storage afterwards.
- **Files (4 production + this note):** `index.html`,
  `src/components/3d/city/CityHubScene.tsx`, `src/components/hub/SettingsModal.tsx`,
  `src/components/hub/CharacterCreation.tsx`.
- **Not automatically verified.** (a) **The Doctore House notice banner itself** — it renders only
  after interacting with the Doctore House in the 3D city, and two scripted attempts to reach it
  (a walk, then fast travel through the city map) exceeded the preview tool's 30 s budget while the
  hub mounted through SwiftShader at ~2 fps; the change is confirmed in source and in the module the
  dev server serves, but the rendered banner has not been seen. (b) **The zoom behaviour the viewport
  change enables** — that pinch-zoom now works is a device question; the sandbox only confirms the
  served tag. (c) The visual reading of the 10px footer labels and the retitled settings panel on
  the target device, as with every other phase here. Two capture caveats worth recording: the first
  run's inline capture labelled as the creation header in fact landed on the Oath's wait surface, and
  a second attempt showed the hub instead — so the header evidence is the DOM read above, and no
  frame of that header exists.

## One settings menu (Phase C-8.70B \u00a7SET-1 \u2014 implemented)

- **What ships: one settings record, one panel, every row it shows live.** Before this slice the
  game had exactly one player preference \u2014 Lefty Mode \u2014 saved as a field on the profile, and
  everything else (camera distances, audio levels, vibration) was a module constant or session
  state. Now there is **one** settings store and **one** menu that reaches it from every screen, and
  a row is only shown when its control actually does something: the panel's own rule is "every wired
  row live", so the sections hold the rows whose consumer exists and say so where none does yet.
  The phase's files: `src/services/settings.ts` (new), `src/hooks/useSettings.ts` (new),
  `src/utils/haptics.ts` (new), `src/components/3d/SceneBrightness.tsx` (new),
  `src/components/hub/SettingsModal.tsx` (rebuilt), `src/App.tsx`, `src/components/3d/RaceScene.tsx`,
  `src/components/3d/city/CityHubScene.tsx`, `src/components/3d/city/CityCamera.tsx`,
  `src/components/duel/DuelScene.tsx`, `src/components/3d/GladiatorPreview.tsx`,
  `src/components/hub/TitleScreen.tsx`, `src/components/hub/CharacterCreation.tsx`,
  `src/components/hub/GladiatorSchoolHub.tsx`, `src/components/ui/CombatHUD.tsx`,
  `src/hooks/useCameraDrag.ts`, `src/audio/musicEngine.ts`, `src/audio/soundEffects.ts`,
  `src/utils/settings.test.ts` (new suite, 30 tests) and two rebased pins in
  `src/utils/phaseC8_70bStage1Camera.test.ts`.

- **`src/services/settings.ts` is the whole store, under one key.** `SETTINGS_STORAGE_KEY` =
  `sand_and_steel_settings_v1` holds the record; `resolveSettings(stored, legacyLefty)` is **pure and
  total** \u2014 the `resolveRacingState`/`resolveTimeState` idiom \u2014 so any stored value, however
  partial or damaged, resolves to a complete record field by field (unknown enum names, wrong types
  and non-finite numbers fall back; volumes clamp to 0\u20261 and the sensitivity to 1\u202610 and stays
  whole). `loadSettings()`/`saveSettings()` use the `storage.ts` try/catch idiom, so a browser that
  refuses storage degrades to the defaults instead of throwing. `getSettings()` is a module-level
  resolved cache with `subscribeSettings()`/`updateSettings()`; the frame loops read the cache and
  **never** re-render, and React surfaces subscribe through `useSettings()` (a
  `useSyncExternalStore` over the module). `screenMotion` is deliberately **absent** by default: an
  absent field is what lets the OS decide (`prefers-reduced-motion`), and the resolver never invents
  it.
- **Lefty Mode moved into the record, and the settings path never touches the save.**
  `saveSettings` mirrors the value into the legacy `sand_and_steel_lefty_mode` key (so a Lefty chosen
  before this slice stays Lefty), and a record that says nothing about lefty still falls back to that
  key. A `lefty` field on the record always wins. The suite proves the separation the hard way:
  **every field is cycled through `saveSettings` and the profile key
  (`sand_and_steel_gladiator_save_v2`) is compared byte-for-byte after each individual write**, plus
  a comment-stripped source scan showing the module names no save path
  (`saveProfile`/`loadSavedProfile`/`PROFILE_STORAGE_KEY`). `App`'s old profile-writing lefty toggle
  (`isLeftyMode: nextLefty` via `saveProfile`) is gone.

- **The panel (`SettingsModal.tsx`) is rebuilt around a category rail, and it has no Apply.** Five
  sections (Picture & Camera, Controls, Sound, Game, Accessibility) as a rail beside the panel, and
  the same rail as a chip row under 640px; the panel lands on the section a screen asked for
  (the duel HUD's help button opens Controls), otherwise on the last one looked at this session
  (module memory, never storage). Every change is written to the record the moment it is made, so the
  panel only ever shows what is already stored and `Done`/`Esc` is just `onClose()`. Controls are at
  least 48dp, the full-row cards at least 56dp, no label under 10px. **Reset save is menu-only and
  armed in the panel** (tap, then "Tap again to erase everything" within 3 s) \u2014 never
  `window.confirm`, and the duel and the race do not offer it at all; cloud save (row 16) opens
  `App`'s existing Drive modal, reset (row 18) calls `App`'s existing reset.

- **Which rows are live, and which settings are named attachment points with no consumer yet.**
  Live: Brightness (exposure on all four Canvases through `SceneBrightness`, which subscribes to the
  module and re-applies on every change), City Camera Distance (`CityCamera`), **Race Camera
  Distance** (below), Lefty Mode, Camera Sensitivity (`useCameraDrag`'s yaw/pitch through
  `getCameraSensitivityScale`, 0.6\u00d7\u20261.5\u00d7 with 1.0 at the default 5), Vibration (haptics), All
  sound + Music (the engines). **No row is shown for a setting with no consumer yet**, and the
  module carries those as named attachment points: `qualityPreset` (SF-1's governor),
  `atmosphereMotion` (no animated-atmosphere module exists \u2014 `useTitlePhaseBackdrop`'s own note),
  `sfxVolume`, `crowdVolume`, `screenMotion`, `cameraShake` and `enhancedColor`. The Accessibility
  section therefore says so in as many words rather than offering a dead switch; `cameraShake` and
  `screenMotion` already have their readers (`getCameraShakeMultiplier`, `getEffectiveScreenMotion`,
  the latter capping shake at 0.4 whenever motion is reduced or off) so the rows are one consumer
  away.

- **Race Camera Distance lands the row the camera addendum pre-arranged \u2014 no camera number moved.**
  The addendum (Slice 2, below) deliberately left `RaceScene`'s optional `chaseDistancePreset` prop
  as "the settings row's attachment point", with no UI and no caller. `App` now passes
  `chaseDistancePreset={settings.raceCamDistance}`, and `RaceScene` resolves it through
  `resolveChaseDistancePreset` exactly as before, so the panel offers Near / Standard / Far on the
  same `CHASE_DISTANCE_PRESETS` config the addendum surveyed (7.0 / 8.5 / 10.5 behind, 3.0 / 3.4 /
  4.0 high). The prop stays optional and the config default stays Standard for a caller that passes
  nothing (the dev `RaceHarness` still does). Two of the addendum suite's pins were **rebased, not
  weakened**: its "no caller passes a preset yet" and "no settings screen was touched" tests now
  assert the opposite \u2014 App is the one caller, the panel offers the row, and the race scene still
  reads no settings module itself and still adds no default of its own.

- **The other consumers.** `vibrate()` (`src/utils/haptics.ts`) is the only place
  `navigator.vibrate` is touched: it reads `getSettings().vibration`, checks the API and stays a
  silent no-op otherwise; the duel calls it at exactly two sites (the player's landed hit, 15 ms;
  defeat, `[30, 40, 30]`). `sounds.setMuted`/`toggleMute` and `music.setVolume` follow the record
  from `App`, whose effect re-applies them on boot and on every change; the music engine's own
  default volume is the designed 0.8. The race's freeze is a **gate, not a sixth race state**: while
  the panel is open over a race the movement loop does not advance, the launch does not accrue and
  the clock holds its reading (its origin moves forward by the frozen interval on close), and Esc
  belongs to the panel \u2014 `utils/raceState.ts` is untouched.

- **Verification (2026-10-20, dev container).** `bun test src/utils/settings.test.ts` \u2192 **30 pass /
  0 fail**; `bun test src/utils/phaseC8_70bStage1Camera.test.ts` \u2192 **20 pass / 0 fail**;
  `bun test` \u2192 **2104 pass / 0 fail (67 files, 65,248 expect() calls)** \u2014 the starting point was
  2102 / 2, the two stale "no caller passes a preset yet" pins in the camera addendum's suite, now
  rebased (no assertion removed); `bun run scripts/collisionTests.ts` \u2192 **123 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) \u2192 **exit 0**; `bun run build` \u2192 **exit 0** with the startup
  asset check passing (8 assets); `git diff --check` \u2192 clean.
- **Live evidence (preview browser, anonymous visitor \u2014 no session replayed).** Opened the panel
  from the **title screen's** own gear (real click): the dialog mounted with the five sections
  (Picture & Camera, Controls, Sound, Game, Accessibility), the Picture & Camera section showing
  Brightness, City Camera Distance **and Race Camera Distance**, whose description reads "How far the
  chase camera sits behind your chariot in the circus." Clicking **Far** on that row wrote
  `raceCamDistance: "far"` into `sand_and_steel_settings_v1` and moved the chip's `aria-pressed`
  (Near false / Standard false / Far true); no label in the panel computes under 10px; **zero console
  errors**; `Done` closed it. The record was absent before the run and was removed again afterwards,
  so nothing was left changed.
- **Not automatically verified.** (a) **The race itself**: that the chase camera visibly moves to the
  chosen preset needs the circus screen, reached through the 3D city at ~2 fps through SwiftShader
  \u2014 the wiring is pinned in source (`App` \u2192 prop \u2192 `resolveChaseDistancePreset` \u2192
  `CHASE_DISTANCE_PRESETS`, asserted by both suites) but no frame of the race camera at Far was
  captured here. (b) **Brightness, sensitivity, vibration and the audio levels in situ** \u2014 the
  readers are unit-tested and mounted in source, but their on-screen effect is not captured in this
  environment. (c) Anything behind a login. (d) **The on-device (Android) reading** of the panel
  \u2014 the sandbox preview is a desktop-width browser, so the rail-as-chip-row layout under 640px
  and the touch targets want a phone look. Also worth stating: the design of record
  (`settings-design.md`, \u00a71 findability / \u00a72 menu) is not committed in this repository, so the
  row set above is the one the shipped module and its suite pin; if \u00a72 lists a row this panel does
  not show, the design governs and the row should be added the same way Race Camera Distance was
  (wire the consumer first, then show the row).

## STORY-1 — campaign state and the campaign card (implemented)

- **What ships.** `PlayerProfile.story?` (`src/types/game.ts`, every subfield optional); the pure
  read path `src/utils/storyState.ts` (`resolveStoryState`) plus the derived rank in
  `src/utils/rank.ts`; and the presentational `src/components/hub/CampaignCard.tsx`, mounted at the
  head of `StatsTab` — the Records & Lore Library view (`records_house` opens `tabKey: 'stats'`).
  Nothing writes `story`: `createNewProfile()` still emits no field, there is no migration, and both
  new modules import no storage. The stored `rank` field is ignored; the rank the campaign reads is
  derived from fame / `currentTier` / `defeatedOpponentIds`.
- **The campaign's rules, all in `storyState.ts`.** The chapter (0–7) is DERIVED, never stored: the
  current chapter is the first one that still has an unmet gate, and a gate is `'pending'` when its
  owning system has not landed (the District race beats and the omen), so pending gates never hold a
  chapter shut. Both consequences are load-bearing and are asserted directly in the suite: a
  Goliath-down profile resolves to Chapter 3 (not 2), and a profile that has met every available gate
  reaches Chapter 7 and the Legend state. The Oath gate is also met by the grandfather rule
  (`fightsWon > 0`, or a `road.oathSworn === true` field read structurally), which is how saves
  written before this slice stay playable. Malformed input of any shape resolves to the defaults and
  never throws or mutates the profile — the `resolveRacingState` contract.
- **Three test assertions had been failing; all three were test-side, and no source changed.**
  (1) The rank suite's object-literal guard `/rank:\s*\w+,/` was satisfied by `rankAtLeast`'s own
  **parameter declaration** (`rank: GladiatorRank,`) — a rank *value*, not the stored field — so it is
  now anchored on `{`/`,` (`/[{,]\s*rank\s*:/`) and the two fixtures are typed. (2) §B7 read the dice
  gate off a profile that had already met it: a met gate closes Chapter 4 and moves the player to
  Chapter 5, so the gate is no longer among the gates the resolver returns; the test now asserts that
  advance (and that an unknown enum name does not move the chapter) instead of re-reading the gate.
  (3) §B9's final walk step never raised fame to the Legend threshold, so Chapter 7 resolved as
  current-but-unclosed; the step now carries `RANK_THRESHOLDS.legend`. No assertion was weakened and
  no production file was involved in the repair.
- **Verified 2026-10-20** in the dev container: `bun test src/utils/storyState.test.ts` → **34 pass /
  0 fail** (188 expect() calls); `bun test` → **2169 pass / 0 fail (69 files, 65688 expect()
  calls)**; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only);
  `git diff --check` → clean. The dev server serves all four modules (HTTP 200).
- **Live check, and what could not be captured.** Drove the real route in the preview browser (no
  save in that browser): title → `Play` → the character-creation confirm →
  **3D city hub** → the footer's own `Gladiator Stats` shortcut → the Records & Lore Library view,
  where the card was present in the DOM with `data-chapter="0"`, `data-campaign-complete="false"`,
  `data-story-gate="oath-sworn:unmet"`, the Chapter-0 title/beat and the unmet requirement — i.e. the
  fresh-profile state, **0 console errors** throughout, and the card shown as the first child of the
  view. **No clean frame of it was obtained:** the capture caught the city's asset-loading overlay
  (`ENTERING THE ARENA`), and the follow-up attempt to re-reach the view did not land inside the
  script budget (the hub renders at ~2 fps through SwiftShader, the limit C-8.36…C-8.65 recorded).
  **The card's rendered appearance is therefore a device question and is NOT automatically verified
  here** — check it on Android: the card heads the library view, the chapter line reads
  `Campaign · Chapter 0` with a serif title, the three dot states (met ✔ / unmet ◆ / pending …) read
  distinctly, and the Legend line appears only once every chapter is closed.
- **Not attempted:** anything that would write `story`. The slice is a read path; the race and omen
  systems that would meet the two `'pending'` gates do not exist on this branch, and the card says so
  in words rather than showing an unmet requirement the player could not satisfy.

## Storefront catalogue layer (hub shops) — implemented, data layer only

- **What ships.** `src/data/shops.ts` (new) is a pure data module: the type
  `StorefrontId = 'forge' | 'armorer' | 'bazaar' | 'merchant' | 'market'` and
  `getStorefrontStock(id)` → the item ids that storefront offers. Every list is **derived only from
  `ITEMS_DB`'s own fields** (its `id`, its `rarity`, and the `damageLight` narrowing `isWeapon()`
  uses), kept in `ITEMS_DB` order, and returned as a **fresh array** on every call, so a caller
  cannot mutate the catalogue through it. The module owns no item, price or stat of its own.
- **The five storefronts, measured.** `forge` = every weapon **except the starter** — the 10 ids
  `spatha_legion, hoplite_spear, trident_retarius, dual_sicae_daggers, dual_vipers, bronze_mace,
  titan_colossus_mace, dagger_pugio, dirk_desert, shamshir_curved` (the starter is excluded through
  `item.id !== DEFAULT_PLAYER_WEAPON.id`, not a literal id). `armorer` = all 6 armor pieces
  (`!isWeapon(item)`). `merchant` = the items whose own `rarity` is `rare` or `legendary` — exactly
  6: `trident_retarius, dual_vipers, titan_colossus_mace, shamshir_curved, helm_centurion,
  chest_golden_muscled`. `bazaar` = `[]` — consumables arrive in a later phase, so an empty list is
  the correct answer today rather than a missing filter. `market` = the whole catalogue (`ITEMS_DB`,
  17 ids), i.e. the hub tab's current behaviour. forge ∪ armorer = market minus the starter (16 ids)
  and the two sets are disjoint.
- **Nothing else moved.** No price, stat or array-order change: `ALL_WEAPONS` (11 — the starter at
  index 0 and the spare starter at index 2) and `ALL_ARMORS` (6) are byte-identical, no existing
  export was renamed, and no component, handler, collider or save path was touched. `ShopTab.tsx`
  still renders `ALL_WEAPONS` / `ALL_ARMORS` directly — **nothing consumes `shops.ts` yet**, which the
  suite pins — and the module reads neither storage nor a profile, so player saves stay read-only.
- **Regression suite: `src/utils/storefrontCatalogue.test.ts`** — 18 tests / 67 `expect()` calls in
  seven sections: §A the resolver's contract (order-preserving, a fresh array per call, and
  `ITEMS_DB` unchanged after resolving every storefront); §B each storefront's exact id list (forge
  10, armorer 6, merchant 6, bazaar `[]`, market = `ITEMS_DB`); §C the forge excludes the starter and
  nothing else; §D the merchant set equals the rare/legendary subset of `ITEMS_DB` and no
  common/uncommon item is merchant stock; §E forge ∪ armorer = market minus the starter, and the two
  are disjoint; §F the catalogue counts (11 / 6 / 17) and the load-bearing `ALL_WEAPONS` order (index
  0 starter, index 2 = `STARTING_SPARE_WEAPON`); §G the scope guard — `shops.ts` imports from
  `itemsDB` and carries no id or price table of its own (comments stripped before the scan), and no
  file under `src/components` imports it yet.
- **Verified 2026-10-20** in the dev container: focused
  `bun test src/utils/storefrontCatalogue.test.ts` → **18 pass / 0 fail** (67 `expect()`);
  `bun test` → **2153 pass / 0 fail (69 files, 65,567 `expect()` calls)** — this suite's 18 tests and
  1 file are the whole delta, so the branch tip read 2135 / 68 before them;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup-asset check passing
  (8 assets); `git diff --check` → clean. The dev server still answers HTTP 200 for the shell and
  serves the new module transformed, and `itemsDB.ts` is unchanged in the served source.
- **Not applicable / nothing visual.** This is a data layer no screen renders yet, so there is no
  appearance to accept and no new Android item: `ShopTab`'s rendered shop is exactly what it was, and
  no preview capture was needed.

## Duel hit-stop and scaled screen shake (Combat impact — implemented, validated; Android read PENDING)

- **What ships: two files, and they are the phase's whole production diff.**
  `src/components/duel/DuelScene.tsx` (the outcome tables, the shared impact ref, the shake in
  `DuelCameraRig`, the settings read) and `src/components/3d/GladiatorMesh.tsx` (the hit-stop on the
  animation clock, plus the `ImpactState` type and the one pure helper both of them read). **No new
  file, no new dependency, no new React state, no collider, no save, no combat constant and no
  timer.** `git diff --stat` is exactly those two production files.

- **The shared object, and why it is a ref.** `DuelScene` owns
  `impactRef = useRef<ImpactState>({ freezeUntil: 0, trauma: 0 })` — `freezeUntil` is a
  `performance.now()` deadline in ms, `trauma` is 0…1 shake energy — and passes the same object to
  `DuelCameraRig` and to **both** `GladiatorMesh` instances. `ImpactState` and
  `impactAnimationScale(impact, now) → 0 | 1` live in `GladiatorMesh.tsx` (exported, pure), so the
  type travels the import edge the component already had and nothing else has to know about it.
  Reading and writing it costs no re-render, and **no `useState` was added to `DuelScene`**: the two
  new refs (`impactRef`, `telegraphLandingRef`) plus the shake-multiplier ref are the whole addition.

- **Hit-stop, outcome → duration (ms), as implemented:**

  | outcome | `freezeUntil` |
  |---|---|
  | quick attack | +60 |
  | power attack | +110 |
  | crit (a power attack that crit) | +170 |
  | blocked (any strike stopped by a shield) | +40 |
  | telegraphed heavy landing (the boss's overhead smash) | +200 |

  Precedence, in the order the branch reads it: **blocked wins** (a shield stops the blow, however
  hard it was), then the telegraphed heavy, then crit, then quick/power. The write sits in the landed
  branch of `executeCombatTurn`, immediately before the two `hitFlashTimer: 0.3` state writes, so it
  happens at exactly the points the brief named. The freeze itself is
  `mixer.timeScale = impactAnimationScale(impactRef?.current)` in `RomanWarriorGLB`'s frame loop —
  three's `AnimationMixer.update` multiplies its delta by `timeScale`, so this is literally
  "animation advances by `delta * 0`", every clip on that fighter stopping together while the hit
  reaction's first pose (set by the action effect's own `reset()`, not by the clock) is the frame
  that holds. `ProceduralGladiator` — the fallback used only when the GLB is missing — has no mixer,
  so it accumulates its own clock and multiplies it the same way, keeping both paths identical.
  **No game logic waits on the freeze:** the 1100 ms resolution timeout, the 750 ms AI delay and
  every state write are untouched.

- **Shake, outcome → trauma, as implemented:**

  | outcome | trauma added |
  |---|---|
  | the player's quick attack lands | +0.25 |
  | the player's power attack lands | +0.45 |
  | the player's crit lands | +0.7 |
  | **the player receives any hit** | **+0.2 — replacing the dealt value rather than adding to it** |

  The total is capped at 1.0. The rig then, each frame, **after** the existing
  `camera.position.lerp`: decays `trauma` by `1.6 × delta`, forms
  `shake = trauma² × getCameraShakeMultiplier(...)`, and when `shake > 0` adds
  `shake × 0.18 ×` a bounded two-frequency sum — ~31 Hz and ~47 Hz, weights summing to 1 per axis, so
  the peak displacement is the 0.18 itself — to `camera.position` on all three axes, and offsets the
  `lookAt` target laterally by `shake × 0.6° ×` the camera-to-target distance (the rotational half of
  the same effect). Trauma decays whether or not an offset is applied, so **Camera Shake = Off**
  (multiplier 0) still winds the state down rather than freezing it.

- **How the multiplier is read — the contract honoured exactly.** `DuelScene` holds
  `shakeMultiplierRef`, refreshed **through the settings module's cache and listener**, never through
  React state and never per frame: one mount-time `useEffect` calls
  `getCameraShakeMultiplier(getSettings(), motionQuery?.matches ?? false)` immediately and again on
  every `subscribeSettings` notification, and the rig reads `shakeMultiplierRef.current` inside its
  frame loop. The second argument is the OS's `prefers-reduced-motion` preference, read once through
  `window.matchMedia('(prefers-reduced-motion: reduce)')` with a change listener and guarded exactly
  as `WaitSurface` guards it — because the module's own doc says an ABSENT `screenMotion` field is
  what lets the platform decide, and `getEffectiveScreenMotion` can only answer that if it is told.
  So the applied offset is 1.0 at Camera Shake = Full, 0.4 at Reduced (the shipped default) and 0 at
  Off, and never more than 0.4 while the effective screen motion is reduced or off.

- **"No shake and no freeze on a quiet player turn" holds by construction.** Trauma is only ever
  written inside the landed branch of `executeCombatTurn`, which can only run while `isExecuting` is
  true; and 1.6/s of decay empties even the largest single addition (a crit's 0.7) in **0.44 s**,
  well inside the **1100 ms** resolution window `isExecuting` covers. The freeze is ≤200 ms, inside
  the same window. Both are therefore spent before the turn can be handed back with nothing
  executing.

- **The telegraphed heavy needed one new ref, because the AI clears the existing one first.** The
  boss's telegraph resolves as `pendingHeavyAttackRef.current = false; … executeCombatTurn('opponent',
  'power_attack')` — that marker is already gone when the resolution runs — so `telegraphLandingRef`
  is set by that branch and **read-and-cleared at the top of `executeCombatTurn`**, before any branch
  can return: a miss, an evade or an out-of-range swing cannot leave it set for a later attack. No
  existing flag's lifecycle changed.

- **Scope kept: what deliberately did not move.** No value in `src/utils/combatCalculations.ts`; no
  damage, hit chance, stamina, combo or hype outcome; not the 1100 ms or 750 ms timers; no
  `isLeftyMode` handling and no line of `GladiatorMesh`'s handedness or shield-constraint code (the
  shield slews on the real delta, so only the animation clock is held); no dependency, no save, no
  collider, no settings row (the Camera Shake row and its reader already existed — this is the
  consumer the SET-1 record said was one away). The duel Canvas keeps `fov: 45`,
  `getCameraSensitivityScale(useSettings())` and both `vibrate(` call sites, which `settings.test.ts`
  pins.

- **Validation (2026-10-20, dev container — all five commands run, every one green):**
  `bun test` → **2135 pass / 0 fail (68 files, 65,500 expect() calls)** — the suite set is identical
  to the pre-change one (no test file was touched), so the count is directly comparable and the
  unchanged turn timing and outcomes are the existing suite's own evidence;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) → **exit 0**;
  `bun run build` → **exit 0** with the startup asset check passing (8 assets; the pre-existing
  >500 kB chunk warning only);
  `git diff --check` → **clean (exit 0)**.

- **Live evidence (preview browser, anonymous visitor — no session replayed), and what it does and
  does not establish.** The dev harness's own duel (`?devHarness=character`, loaded in an in-page
  iframe and driven through the real HUD) mounted the shipping `DuelScene` with this change in place,
  and **a full turn resolved end to end**: `Quick Strike` disabled itself while executing, the Arena
  Chronicle gained its lines (`Spartacus strikes with Quick Slash, but is OUT OF RANGE!`, then the
  opponent's own turn and log line), the health bars and the 3D arena kept rendering, and the frame
  loops — the rig's new shake maths and both meshes' new `impactAnimationScale` reads — ran with **no
  console error attributable to the change** (the only entries seen anywhere were the documented
  pre-existing WebGL-guard teardown pair, "Attempted to synchronously unmount a root…" plus an empty
  "Uncaught", which appear when the temporary harness frame is removed — the same pair C-8.66B/
  C-8.66C/C-8.66D/C-8.68C record). **The landed-hit branch itself was NOT exercised:** the two strikes
  that could be driven fell out of range (a gladius reaches 2.5 and the fighters close 1.8 a turn),
  and a third click was swallowed at a turn boundary, so no blow landed inside the script budget.
  **The hit-stop and the shake are therefore NOT automatically verified** — the run proves their
  wiring runs clean, and their *feel* is the developer's Android read, exactly as the brief said it
  would be. The sandbox has no GPU (SwiftShader, ~1–2 fps in the 3D scenes), so no frame here could
  adjudicate a 40–200 ms hold or a sub-degree camera wobble in any case.

## Tempering — pure logic (P1 — implemented)

- **Scope.** Data + logic only, no UI: `src/utils/tempering.ts` (new), one optional
  `temper?: Record<string, number>` on `PlayerProfile` (`src/types/game.ts`), and the stat seam
  (`src/services/storage.ts`). The owned `WeaponItem` / `ArmorItem` objects are **never** modified
  — the upgrade lives only in `profile.temper`, keyed by item id, and is written only by a
  successful `purchaseTemper()` (never by `createNewProfile()`), so the save format gains exactly
  one lazy optional field, like `chariot` and `racing`.
- **The stat seam existed and is wired.** `calculateTotalStats()` (`services/storage.ts`) is the one
  aggregation both combat (`components/duel/DuelScene.tsx`) and the hub (`components/hub/StatsTab.tsx`)
  already read, so it now resolves each equipped item's level with `resolveTemperLevel()` and adds
  `getEffectiveWeaponStats()` / `getEffectiveArmorStats()`. At level 0 each helper returns a copy
  equal to the base item, so a legacy save (no `temper` field) is unchanged — the whole suite is
  green with no existing expectation touched. `combatCalculations.ts` formulas are untouched:
  weapon **damage** still comes from the item object, so a later slice must read the effective
  weapon wherever damage is consumed (`DuelScene`'s `loadout.weapon.damageLight|damageHeavy`).
- **Numbers.** Cost = 40 / 80 / 140 % of the item's own `price`, rounded to the nearest 5
  (starter gladius 50 → 20 / 40 / 70; Colossus Titan Skullcrusher 920 → 370 / 735 / 1,290).
  Weapon: `damageLight` / `damageHeavy` +8 % of **base** per level (linear, rounded), +1
  `bonusStrength` at +2 and again at +3. Armour: +1 `defense` per level, and at +3 +1 to each bonus
  stat it already lists (a temper never invents a bonus; a piece with two listed bonuses gets +1 to
  both — `helm_murmillo`'s `bonusDefense` 2 → 3, `defense` 4 → 7). Sell value = `sellPrice` + 25 %
  of the temper gold spent, rounded (`getTemperSellValue(profile, item)`). Gold can never go
  negative: an unaffordable level is refused before any object is built.
- **Validation — all five commands, run in the `web` container.** `bun test` → **2176 pass / 0 fail
  (70 files)**, this slice contributing the 23 tests in the new `src/utils/tempering.test.ts` with
  **no existing test file modified** (`git status`: only `storage.ts`, `game.ts` edited, two files
  added); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0; `git diff --check` → clean.
- **Verified in the preview:** the app boots with the new module in its graph (title screen renders,
  0 console errors; the dev server serves the transformed `tempering.ts` and the wired
  `storage.ts`). **Not automatically verified:** the hub's Stats screen and the duel's stat readout —
  this app is sign-in gated and the preview browser had no session, so the wiring is pinned by the
  unit test that drives `calculateTotalStats` with a `temper` record instead.

## Screen motion tokens & foundation (MO-1 — implemented, validated)

- **What ships: three production files and one suite.** `src/index.css` (a new SCREEN MOTION
  section: the tokens, six keyframe families, five utility classes, the two reduced-motion paths and
  the pause-on-hidden rule, plus the one in-place retime of `.animate-fadeIn`),
  `src/services/settings.ts` (one pure resolver, `resolveMotionAttribute`), `src/App.tsx` (two
  small root effects and the import), and `src/utils/motionTokens.test.ts` (new suite, 17 tests /
  251 `expect()` calls). **No animation library, no dependency, no per-screen redesign, no save, no
  collider and no gameplay value changed** — `git diff --stat` is exactly those three production
  files.

- **The tokens, exactly as the design names them** (all in the section's own `:root`, read out
  live): `--dur-press` 90ms, `--dur-micro` 160ms, `--dur-panel` 220ms, `--dur-screen` 420ms,
  `--dur-ceremony` 700ms, `--dur-phase` 1200ms, `--stagger-step` 45ms; `--ease-out`
  `cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-inout` `cubic-bezier(0.65, 0, 0.35, 0)`, `--ease-in`
  `cubic-bezier(0.5, 0, 0.75, 0)`, `--ease-spring` `cubic-bezier(0.34, 1.4, 0.64, 1)` (the one curve
  whose y1 exceeds 1, which is what "the spring's overshoot" means and what the reduced paths
  remove).

- **The classes shipped, and what each one is for:**

  | class | what it does | reads |
  |---|---|---|
  | `.anim-panel` | a panel/modal entrance, with **per-origin variants** through `data-origin` — `bottom` (the default, also what no attribute and an unknown origin get), `top`, `left`, `right`, `center`, each its own `@keyframes` (`anim-panel-in`, `…-top`, `…-left`, `…-right`, `…-center`) selected by `animation-name` | `--dur-panel`, `--ease-out` |
  | `.anim-screen` | a whole screen arriving: one fade with a small lift, the screen moving rather than its contents | `--dur-screen`, `--ease-out` |
  | `.anim-stagger` | each **direct child** fades in `--i × --stagger-step` after the one before it, `--i` being the child's own 0-based index | `--dur-micro`, `--ease-out`, `--stagger-step` |
  | `.anim-stamp` | a verdict landing: oversize → settle, with the spring's overshoot on the way | `--dur-panel`, `--ease-spring` |
  | `.btn-press` | press feedback (`:active` → `scale(0.97)`), its transition **naming its three properties** | `--dur-press`, `--ease-out` |

- **The two laws are encoded as mechanics, not as hopes.** (1) **Transform, opacity and colour only,
  never `transition-all`**: the suite parses every keyframe in the section and asserts the union of
  its declared properties is a subset of `{opacity, transform}`, scans the comment-stripped section
  for `transition-all` / `transition: all` / `transition-property: all`, and scans it for
  `width`/`height`/`top:`/`left:`/`margin` — geometry is moved with `translate3d`/`scale` throughout,
  so a moving element never re-runs layout or paint. (2) **At most 12 animations concurrent, by
  construction**: the stagger's delay is `calc(var(--stagger-step) * min(var(--i, 0), 7))`, i.e.
  clamped at its **8th step** (7 × 45 ms = **315 ms**) however long the list is, so a 40-row list
  keeps at most those 8 distinct steps in flight plus the `ceil(220 / 45) − 1 = 4` predecessors still
  fading when the clamp bites — twelve, fixed. Both laws are stated in the section's own header
  comment, and the arithmetic is re-derived in the suite from the shipped tokens.

- **`.animate-fadeIn` is retimed onto the panel token, and that is the whole of the feel change it
  makes.** The house precedent (modals, the pre-race panel, the race's verdict text, the city's
  notices) now reads `animation: fadeIn var(--dur-panel) ease-out forwards` — the token carries
  **exactly the 220 ms** (`0.22s`) the rule already used, and the suite asserts the literal is gone
  while the curve deliberately stays the **shipped `ease-out` keyword**: codifying a duration onto a
  token is not a re-grade of the curve, and swapping in `--ease-out` would have been a (small) feel
  change to every modal in the game. Its one visible consequence is the intended one: under either
  reduced-motion path the same rule retimes to **132 ms**.

- **Reduced motion is two paths and ONE set of reductions, and the suite proves they are the same
  set.** `[data-motion="reduced"]` (the player's own setting, mirrored onto the root by App) and the
  app-wide `@media (prefers-reduced-motion: reduce)` block both apply, through one shared assertion
  helper: fades at **60% duration** (54 / 96 / 132 / 252 / 420 / 720 ms — each compared against 60%
  of the base token the suite read from `:root`, so they cannot drift from the tokens they scale),
  **`--stagger-step: 0ms`** (every child at once), **`--ease-spring: var(--ease-out)`** (the
  overshoot removed, and read back as the *identical* curve), and **press = an opacity flash**
  (`transform: none; opacity: 0.7` — the feedback is dimmed, not taken away).
  The OS block is scoped `:root:not([data-motion="full"])`, so the platform governs only while the
  player's record is silent or asks for reduction — an **explicit `full` is not quietly over-ridden
  by the media query**, which is exactly how `getEffectiveScreenMotion` resolves the same record.
  Nothing is disabled outright: this is a *reduction*, not the title screen's own `animation: none`
  (whose block, and the wait surface's, are untouched). Verified live: with the attribute set, every
  base token, the fade's computed duration (`0.132s`) and the stagger delays (`0s`, `0s`, `0s`) all
  move, and removing it restores `220ms` / `0.22s`.

- **The wiring point: `App`'s root, two attributes, no re-render.** One small effect
  (`[settings.screenMotion]`) calls the pure `resolveMotionAttribute(settings)` and writes
  `data-motion` on `document.documentElement` — **removing the attribute when the record is silent**,
  so the OS query is what governs a player who has never chosen. A second, mount-only effect toggles
  `motion-paused` on the same root from `visibilitychange`, the title screen's own
  `title-anim-paused` precedent taken app-wide; the CSS rule that consumes it freezes
  `.anim-panel`, `.anim-screen`, `.anim-stagger > *`, `.anim-stamp` **and** `.animate-fadeIn`
  (`animation-play-state: paused`), so hidden work costs nothing and nothing is caught half-way
  through a fade on the way back. Both are root attributes rather than React output, so neither
  re-renders anything, and `screenMotion`'s **absence stays absent** — the resolver never invents a
  value, and a chosen `'off'` is carried **verbatim** rather than folded into `'reduced'`: MO-1 ships
  the reduced block, and the stilling `'off'` treatment is a later slice's to add, so the attribute
  has to keep the two distinct from the moment it is first written. Nothing in the settings panel
  changed — SET-1's rule is that a row appears only when its consumer exists, and the Screen Motion
  row is still one consumer away (the class set is that consumer's toolkit, not a rebuild of any
  screen).

- **Validation (2026-10-20, dev container — all five commands run, every line green):**

  | command | result |
  |---|---|
  | `bun test` | **2170 pass / 0 fail (70 files, 65,818 `expect()` calls)** — the branch tip read 2153 / 69 before it, so this suite's 17 tests and its file are the whole delta |
  | `bun run scripts/collisionTests.ts` | **123 passed, 0 failed** (exit 0) — unchanged, as expected: no collider is touched |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `bun run build` | **exit 0**, with the startup-asset check passing (8 assets in `public/` and `dist/`; the pre-existing >500 kB chunk warning only) |
  | `git diff --check` | **clean (exit 0)** |

  The suite's own starting point was **2 failing assertions, both of them mine** — a comment-stripped
  scan that the slice's own partial header comment defeated, and a selector-list slice that landed
  inside the comment preceding it. Both were fixed in the harness, **not by loosening a check**, and
  no assertion was removed.

- **Live evidence (preview browser, anonymous visitor — no session replayed; 0 console errors, 0
  failed requests), and what it establishes.** Read out of the running app after the change: the
  title screen renders; every base token computes to the design's own value; a probe element carrying
  the shipped classes resolves `.anim-panel[data-origin="right"]` to `anim-panel-in-right` / `0.22s`
  / the `--ease-out` curve, `.anim-screen` to `anim-screen-in` / `0.42s`, `.anim-stamp` to the
  **spring** curve, `.animate-fadeIn` to **0.22s** (the house duration, unchanged) and `.btn-press`
  to `transition-property: transform, opacity, color` / `0.09s`; the stagger's three children resolve
  **`0s`, `0.135s` (3 steps) and `0.315s` (12 → the clamp at the 8th step)** — the concurrency
  ceiling, measured in a real browser rather than reasoned about; setting `data-motion="reduced"`
  moves every token to its 60% value, the spring to the ease-out curve, the stagger to `0s/0s/0s` and
  the fade to `0.132s`, and removing it restores `220ms`; `motion-paused` puts all five utilities at
  `animation-play-state: paused`; and with the settings record **absent** the app wrote **no**
  `data-motion` attribute (the OS path), which is the shipped effect running. The probe was removed
  and the attribute and class cleared afterwards, and the settings record was never written (absent
  before and after).

- **Not automatically verified, and each for a stated reason.** (a) **The positive settings→attribute
  path in the live app** — the resolver's mapping and App's effect are pinned by the suite and by the
  source contract, and the *absent*-record path (no attribute) was read live, but driving the
  *chosen* value end to end needs a `screenMotion` in the settings record and a fresh load to read it,
  and this environment restores the account's own snapshot and clears browser storage on every fresh
  load (the C-8.66C finding), so a written record cannot survive the reload the app needs. No row
  exists in the settings panel to set it from the UI either (SET-1's attachment-point rule), so this
  path is **not automatically verified**. (b) **The OS `prefers-reduced-motion` path live** — the
  sandbox cannot emulate the media feature, so that block is source- and suite-verified only.
  (c) **Any screen's appearance** — no screen mounts these utilities yet, so this slice changes **no
  rendered pixel**: the utilities are a toolkit whose first consumer is a later slice, and no
  per-screen redesign was attempted here. The one screen whose motion *did* change is none: the
  `.animate-fadeIn` retime carries the same 220 ms and the same curve, which is a codification, not
  a feel change.

## Records & Lore Library — the Road of Glory (Progression Slice 1 — implemented)

- **What shipped.** `src/utils/rank.ts` (`deriveRank` + its threshold constants),
  `src/utils/roadOfGlory.ts` (`resolveRoadState`, `resolveRoadProgress`, `ROAD_STAGES`,
  `AURELIUS_OPPONENT_ID`, `CHAMPION_RECORD_LINE`), `src/components/hub/RoadOfGloryPage.tsx`,
  `src/components/hub/LibraryTab.tsx`, and the `RoadProgress` field on `PlayerProfile`
  (`src/types/game.ts`). The view is reachable two ways, both through the hub's existing `onOpenTab`:
  the bottom nav / tab row's new **Records & Lore** entry, and the Records & Lore Library
  building itself — `HUB_LOCATIONS`' `records_house` now carries `tabKey: 'library'` where it
  previously fell back to the stats tab (its centre, radius 4.5, prompt, colour and district are
  unchanged, and `InteractiveLocation.tabKey` gains the `'library'` member).
- **Derived, never stored.** Seven stages stand in order — nobody → sworn → blooded → known →
  feared → champion → legend — each `'reached' | 'current' | 'ahead'`, the current one being the
  **highest** the profile qualifies for (so a skipped stage is `'reached'`, never `'ahead'`, and
  exactly one stage is ever current). The gates read only: `deriveRank(profile)` (imported from
  `rank.ts` — its thresholds are never restated, so the road cannot promise a gate the rank does
  not enforce), `fightsWon`, `defeatedOpponentIds`, and the optional `profile.road`
  (`oathSworn` / `bannerDevice` / `milestonesSeen`, resolved lazily: absent, partial and
  hand-edited all read as unsworn). **The stored `PlayerProfile.rank` is not read**, nothing
  writes a save, and `profile.road` has no writer in this slice — the oath slice owns that.
- **The Champion gate names the roster's own boss.** `AURELIUS_OPPONENT_ID` is read from
  `ALL_OPPONENTS` as the tier-4 boss (`opp_aurelius_boss`), not copied as a literal, so the gate
  follows the roster if the entry ever moves.
- **No Codex module — Legend's Codex condition is NOT implemented.** There is no
  `src/utils/codex.ts` in this tree, so the progression design's "Rudis-ready" condition for the
  Legend stage was left out rather than invented: legend is `deriveRank`'s Legend alone
  (fame >= 1,500, the tier-4 circuit, a boss kill). The Codex slice owns that condition; if it
  lands, the legend gate in `resolveRoadState` is the one line to extend.
- **Suites: `src/utils/rank.test.ts`** (16 tests — the three gates on both sides of every
  boundary with each half required, precedence and monotonicity, malformed saves reading as zero,
  the stored rank not being read, the rank table and `rankAtLeast`) and
  **`src/utils/roadOfGlory.test.ts`** (26 tests — the road's shape and contiguity, every gate,
  the roster-derived champion id, the cumulative rule, the optional road field, and purity: the
  resolvers mutate nothing). Both state their boundaries against `rank.ts`'s exported constants,
  so a threshold change moves the assertions with it.
- **Fixed in this pass.** `CityHubScene.tsx`'s new nav entry used `BookOpen` without importing it
  (`tsc --noEmit` TS2304), so the 3D hub's Records & Lore button had no icon; the import is added.
- **Verified 2026-10-20** in the dev container: `bun test` → **2177 pass / 0 fail (70 files)**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0; `git diff --check` → clean. Live in the preview: title →
  character creation → city hub → the new Records & Lore entry → the Library renders page one with
  its seven stage nodes, exactly one of them current (`nobody` on a fresh save, six ahead), the
  requirement line on the next node only, the champion record line on the Champion node, the
  page's own tab marked `aria-current="page"`, no console errors, and no sideways overflow at a
  375 px viewport (the tab row wraps to a 2x3 grid; the new tab's icon renders). The changed door
  was driven with the shipped `getNearbyHubLocation`: every step in from Records & Lore's
  fast-travel arrival `[23.1, -26]` answers `records_house`, whose `tabKey` is now `library`.
- **Not automatically verified.** Nothing here needs an account (the Library is not gated), so
  the anonymous preview covers it end to end; no 3D rendering changed, so this slice adds no
  device-visual item to the open Android checklist.

## Herald & Banner — milestone cries, the device and the banner (RG-3 — implemented)

- **What rides what.** RG-3 is stacked on the two sibling slices it was specced against, and this branch
  carries both: `origin/road-glory` (RG-1 — `src/utils/roadOfGlory.ts`: `resolveRoadState`,
  `resolveRoadProgress`, `ROAD_STAGES`; `src/utils/rank.ts`; the `road` field and the Road page) and
  `origin/gladiator-oath-beat` (RG-2 — `src/utils/gladiatorOath.ts`, `withOathSworn`, `OathBeat`, the
  session-scoped `cityHerald`). **`src/utils/heraldry.ts` did not exist on any branch** — RG-3 creates it —
  and neither did any herald/toast surface or any ludus banner row, so RG-3 builds those too.
- **The merge conflict, and how it was settled.** Both slices declared the same `road` field, in the same
  region of `src/types/game.ts`, under different names (`RoadProgress` vs `GladiatorRoad`). The branch keeps
  RG-1's name — one `interface RoadProgress` with a `road?: RoadProgress` field — and RG-2's writer;
  `gladiatorOath.ts` imports `RoadProgress`. Two of RG-2's own assertions needed widening for the merge and
  no assertion was weakened: its "no other file in src/ writes the field" scan now skips `*.test.ts` (the road
  suites' fixtures name the field) and `roadOfGlory.ts` (which reads it into a resolved value, never writes it).
- **The two call sites, and the only writers.** `src/utils/roadMilestones.ts` is evaluated in exactly two
  places in `src/App.tsx`: `handleMatchComplete` (both duel outcomes) and `enterCity` (which every entry into
  the city passes through). `evaluateRoadMilestones(before, after)` compares `resolveRoadState` and returns the
  profile to save; it is the **only** writer of `road.milestonesSeen`, appending the ids of the stages this
  event newly reached. `chooseBannerDevice` is the **only** writer of `road.bannerDevice` and refuses a second
  choice outright. Nothing else is stored: the stripes come from `bossKills`, the gate from the road.
- **Why a stage below the jump is recorded too.** The road is cumulative (`resolveRoadState` marks every stage
  below the current one `'reached'`), so a gladiator who jumps to Veteran records `sworn`/`blooded`/`known` in
  one go; only `known` and `feared` have cries. Suppression is `milestonesSeen` plus "not reached before this
  event", so a repeated or replayed evaluation is silent — there is no watcher and no timer.
- **The surfaces RG-3 had to build.** `src/components/hub/HeraldToast.tsx` (the herald's cries, above every
  screen — a duel ends into the city, so a cry must outlive the screen it was raised from),
  `src/components/hub/DeviceChoosingPanel.tsx` (the four devices, Latin name + gloss, field colour from
  `ROMAN_PALETTE`), `src/components/hub/BannerRow.tsx` (the ludus banner row; not drawn below Veteran) and
  `src/components/3d/city/ChampionBannerPole.tsx` (raised at the Colosseum gate once the road stands at
  Champion — four meshes and one 192x288 canvas texture).
- **Grandfathering.** A gladiator at or past Veteran with no `bannerDevice` is offered the panel at the next
  evaluation — `enterCity` is the site that catches them. "Not yet" closes it and the next evaluation offers it
  again, so nobody is ever silently deviceless.
- **Verified 2026-10-20** in the dev container: `bun test` → **2252 pass / 0 fail (73 files, 66,192 expect()
  calls)**, 23 of them new in `src/utils/roadMilestones.test.ts`; `bun run scripts/collisionTests.ts` → **123
  passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the
  startup asset check passing; `git diff --check` → **clean**. The new suite pins each stage firing once,
  seen-id suppression, both rank cries with the gladiator's name, the boss cry named from the roster, the
  one-time device write, stripes at 0/1/4 kills, a save with no `milestonesSeen`, grandfathering and the four
  device specs.
- **Live evidence, and what it does NOT establish.** Driving the real flow in the preview browser (Play →
  character creation → `APPLY POINTS & ENTER METROPOLIS` → the city's Colosseum button) reached the ludus hub
  with the banner row wired and correctly **not** drawn for a level-1 profile, and the run produced **no
  console errors**. **Not automatically verified:** the *chosen* banner's field/device/stripes, the Device
  Choosing panel and the herald toast in a rendered state, and the champion gate pole. The managed preview
  browser does not keep `localStorage` between preview calls, so a seeded Veteran save cannot be carried into
  the page, and the city hub renders at ~1–2 fps through SwiftShader; both need a hand look on a real device.

## Quality preset and the city's adaptive DPR (SF-1 — implemented)

- **What ships: the picture-quality preset becomes live, and the city Canvas stops asking for
  whatever the device reports.** The city's Canvas carried `dpr={[1, 2]}` — a constant that renders at
  up to 2 × on a device reporting 2, far past the studio budget's 1.5 cap for the city. It is now
  `dpr={cityDpr}`, where the value comes from the player's preset and is then adapted inside that
  preset's band by a frame-time engine; the city's drifting dust is part of the same row. The phase's
  files: `src/hooks/useAdaptiveDpr.ts` (new — the tier table, the pure engine and the hook),
  `src/services/settings.ts` (the preset's type, its legacy spellings and the first-run default),
  `src/components/3d/city/CityHubScene.tsx` (the Canvas prop, the tier's dust and the transition
  suspension), `src/components/hub/SettingsModal.tsx` (the row the new consumer makes wired),
  `src/utils/adaptiveDpr.test.ts` (new suite, 38 tests) and two rebased pins in
  `src/utils/settings.test.ts`.

- **The tier table — one row per preset, and every number exported.** `CITY_TIERS` holds
  `dpr: { min, max, start }` and `sparkles` per preset; `start` is the band's ceiling for the two
  tiers that ask for pixels (a device that cannot hold it is stepped down — that is what the engine
  is for) and Swift opens at its floor. Cinematic 1.5–2.0 starting at 2.0, **Balanced 1.0–1.5
  starting at 1.5** (the default, and the budget fix this slice exists for), Swift 1.0–1.25 starting
  at 1.0. Dust: **Cinematic 90 — the count the city already had — Balanced 60, Swift 0.** Every
  band boundary sits on a multiple of `DPR_STEP` (0.25), which is what lets a step land exactly on a
  floor and never one past it. A later slice attaches its shadow tier to the same row, which is why
  the row is a record of named fields rather than loose constants.

- **The engine lives in a hook inside the Canvas, and it is pure at its core.**
  `stepAdaptiveDpr(state, tier, frameMs, suspended)` is total and returns a new state: the evidence is
  a **trimmed EMA** — a 30-frame window (`EMA_WINDOW`) with its two worst samples dropped
  (`EMA_TRIM`), so one hitch or a garbage collection cannot move the picture — over a
  `SAMPLE_CLAMP_MS` (100 ms) clamp, with a sustained hold on each side: over `STEP_DOWN_MS` (17.5 ms)
  for `STEP_DOWN_SUSTAIN_MS` (1.5 s) steps **down** one `DPR_STEP`, under `STEP_UP_MS` (12 ms) for
  `STEP_UP_SUSTAIN_MS` (5 s) steps **up**, and never twice inside `DWELL_MS` (3 s). A frame that
  cannot be measured (NaN, Infinity, zero, negative) is not a frame and leaves the state untouched.
  `useAdaptiveDpr` keeps that state in a **ref** and publishes through `onDprChange` only when the
  value actually moved, so a steady device renders nothing per frame — at most one publication per
  3 s, and the callback itself is held in a ref so an inline arrow cannot reset the engine.

- **One holder of the value: the scene owns the Canvas's `dpr`.** The engine renders nothing and
  returns nothing; a step is published into the scene's own `useState`, which the Canvas follows, so
  the scene and the engine cannot disagree. The tier is applied **at mount and on a preset change by
  the scene** (`useEffect [qualityPreset]`) and never mid-frame by the engine; the scene reads the
  preset through the settings module's existing `useSettings` — no second store, no new key, and the
  hook imports the preset's *type* from `services/settings` so there is one owner of the names.

- **The preset resolves three ways in order, and the heuristic is a FIRST-RUN default, not a policy.**
  `resolveQualityPreset(stored, device)`: a value the design names (`cinematic` / `balanced` /
  `swift`); a record written before SF-1 — **`high` → Cinematic, `low` → Swift**, because a stored
  choice is a choice and those were the most- and least-pixels spellings; and otherwise the first-run
  default, which consults the cheap-device heuristic **`devicePixelRatio > 2.5` AND
  `hardwareConcurrency ≤ 4`** (`isCheapDevice`; BOTH halves must hold, and a browser that withholds a
  fact is not evidence of a cheap device) — **Swift on such a device, Balanced everywhere else.** A
  stored or translated preset always wins over the heuristic, so it can only ever decide a first run.

- **How the preset coexists with the World Motion toggle — the toggle stays the player's switch, and
  Swift overrides it while it is active.** `getEffectiveAtmosphereMotion(settings)` is the city's dust
  reader: the player's own `atmosphereMotion`, and **false while the preset is Swift**. The stored
  toggle is never rewritten, so the player's choice is back the moment they leave Swift, and the two
  controls cannot disagree about whether the city's atmosphere drifts. The city's dust obeys it twice
  over: `count` is `atmosphericMotion ? cityTier.sparkles : 0`, and the `<SandDrift />` group is
  `visible={atmosphericMotion}`. **No panel row was added for `atmosphereMotion`** in this slice: it
  now has exactly one consumer (the city's dust) and its row's own wording is a Motion/Accessibility
  decision that belongs with the accessibility pass, not here — it stays a named attachment point,
  and this note is the record that the consumer exists.

- **Adaptation is suspended for a transition, and the suspension is the scene's.** Mounting IS a
  transition (the first compiles and the `demand`→`always` switch are not a slow device), and a fast
  travel is another, so `suspendAdaptation()` sets a ref for `POST_TRANSITION_MS` (1 s) after each —
  the scene writes the ref, the engine reads it per frame, and the same exported constant drives both
  so they cannot drift apart. While suspended every frame is ignored and the two sustain timers are
  held at zero (the measured window and the dwell carry over, so a device is not forgotten — it just
  is not judged on a scene build's hitches).

- **The draw-call count does not depend on the tier.** The dust is still **one** element whose `count`
  is the tier's, never a conditional mount, so a tier changes a vertex count and not the number of
  objects in the scene; the DPR band changes pixels, not scene content. (Swift's 0 draws no dust.)

- **Rebased, not weakened: SET-1's two preset pins.** `settings.test.ts`'s storage round-trip and its
  every-field cycle both pinned `qualityPreset: 'high'`; they now pin `'cinematic'` with a comment
  naming this phase. No other assertion moved, and no test file was otherwise touched.

- **Regression suite: `src/utils/adaptiveDpr.test.ts`** — 38 tests / 8,358 expect() calls across five
  sections: §A the tier table (one row per preset, every band's numbers on the step grid, Balanced's
  1.5 ceiling, the descending ceilings, Swift opening at its floor, the dust budget, and the engine's
  own constants pinned from the module); §B the trimmed EMA (the two worst dropped, order
  sensitivity, at least one survivor, no mutation of the window); §C the engine driven over real
  frame traces — a smooth 60 fps holds its start, a sustained 30 fps is stepped to the floor one step
  at a time and held (never twice inside the dwell, never before the sustain), a recovered device is
  stepped back to the ceiling, a chaotic 900-frame trace never leaves the band for any tier, one 5 s
  stall is clamped and then swallowed by the trim, unmeasurable frames are ignored, a transition's
  frames are ignored with the timers restarted, and every step is exactly one `DPR_STEP`; §D the
  wiring read out of the shipped sources (the engine inside the Canvas, no React work per frame, the
  old `dpr={[1, 2]}` gone, the tier read from settings, the dust through one element, the motion
  switch, the two suspensions, and no second store or save path); §E the settings side (the three
  ways in, the legacy spellings, the heuristic's both-halves rule and its thresholds, the first-run-only
  property, and the panel row).

- **Verified 2026-10-20** in the dev container: `bun test` → **2191 pass / 0 fail (70 files, 73,925
  expect() calls)** (the starting point was 2152 pass / 1 fail across 69 files — the one failure was
  SET-1's stale `'high'` pin, and the delta is this suite's 38); `bun run scripts/collisionTests.ts`
  → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → **exit 0**;
  `bun run build` → **exit 0** with the startup asset check passing (8 assets; the pre-existing
  >500 kB chunk warning only); `git diff --check` → **clean**.

- **Live evidence (preview browser, anonymous visitor — no session replayed), and what it does and
  does not establish.** The panel's new row was driven from the title screen's own Settings entry:
  it opens showing the stored choice painted (Balanced), **choosing an option writes the one settings
  record** (`sand_and_steel_settings_v1.qualityPreset` read back as `swift`, then `balanced`) and the
  painted selection follows within **3 ms**; the row fits a phone viewport with no sideways scroll;
  Done closes the panel; **zero console errors** throughout. The check restored the storage it found
  (there was no record, so the key was removed again). **The city's own rendered DPR and dust are NOT
  automatically verified:** the sandbox has no GPU (SwiftShader, ~2 fps in the city hub), and a
  preview browser reporting `devicePixelRatio` 1 would read 1.0 in every tier there, so no frame in
  this environment can adjudicate a band or a step — the engine's behaviour is pinned instead by the
  deterministic frame traces in §C, and the Canvas wiring by the source pins in §D.
  **Android check list:** (a) that Cinematic and Balanced are visibly sharper than Swift on the same
  device and that the frame rate improves as the preset descends; (b) that Swift draws no drifting
  dust and that the atmosphere motion switch brings it back on leaving Swift; (c) that a genuinely
  cheap device lands on Swift at first run (`devicePixelRatio` > 2.5 with ≤ 4 cores) while a record
  that already carries a choice keeps it; (d) that a fast travel and the first second in the hub do
  not visibly drop the resolution (the suspension). Do not claim device acceptance.

## Selling — market buy-back (P1 sell-refund — implemented)

- **What ships.** `src/utils/selling.ts` (new) is the transaction that pairs with the value rule
  `utils/tempering.ts` already owned: `getSellValue()` returns the item's own `sellPrice` plus 25 %
  of the temper gold spent on it (`getTemperSellValue`), `getSellEligibility()` states the rules, and
  `sellItem()` is the transaction. Same purity contract as the chariot / racing / tempering helpers:
  a refusal returns the caller's own profile object untouched, a success returns a NEW profile with
  the value added to `gold` and the item dropped from `inventory`.
- **Selling clears that item's temper record**, because `ITEMS_DB` objects are shared data — a
  re-bought sword must start at level 0, not inherit the levels its previous owner paid for. A save
  with no `temper` field never gains one by selling.
- **Only a carried, unequipped item is sellable** (`not-owned` / `equipped` / `unknown-item` /
  `no-profile` refusals). `equipped.weapon` is required, so unequipping-by-selling would leave a
  state no other code expects; the player unequips first, exactly as in a real armoury.
- **UI.** The Bazaar & Forge (`components/hub/ShopTab.tsx`) now shows a `Sell for N Gold` control on
  an owned, unequipped card, below the disabled `Owned` button; it is wired `ShopTab → onSellItem →
  GladiatorSchoolHub → App.handleSellItem → saveProfile`, the same path every other profile change
  uses. The Armory (`GearTab`) is unchanged — it equips, the market trades.
- **Verified.** `bun test` → **2346 pass / 0 fail (77 files)**, this slice contributing the 16 tests
  in the new `src/utils/selling.test.ts` (eligibility, value, transaction purity, inert refusals);
  `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0. In the preview the market
  renders the control with the correct figure (`SELL FOR 45 GOLD` on the 45 g Dory Hoplite Spear,
  the equipped gladius correctly offered none).
- **Not automatically verified: the click-through.** The button was rendered and read, but the
  sale click was not dispatched in that run (the selector missed the label because Tailwind's
  `uppercase` class uppercases `innerText`), so the gold credit + inventory removal + save write
  through the UI are pinned only by the unit tests that drive `sellItem()` itself. Reaching the
  market also costs the full creation → press-and-hold oath → city fast-travel path, so it was not
  repeated in the same session.

## Arena purse — victory gold (P1 rewards — implemented)

- **What ships.** `src/utils/duelRewards.ts` (new, pure: no profile, no storage, no clock) is the
  rule that turns a finished duel's own statistics into the gold a victory pays; `DuelGoldBreakdown`
  and an optional `goldBreakdown` on `DuelStatistics` (`src/types/game.ts`); `DuelScene` computes the
  purse at the victory resolution and writes it onto the ONE stats object App already credits; the
  result modal itemises it and shows the settled purse. **No new currency, no second save field, no
  change to the reward path**: `App.handleMatchComplete` still does `profile.gold + stats.goldEarned`
  and still refuses to pay on a loss.
- **The rule.** Base = the opponent's own `rewardGold` (35 … 1,000 across the roster), plus crowd
  favour (+10 % of the base per full 25 hype above 50, so +7 on a 35-gold bounty at hype 100), plus
  precision (5 gold per perfect block, capped at five), plus flawless (+50 % of the base when no
  damage was taken). Marcus at peak value pays **85**; the tier-4 boss at peak value pays over
  **1,700**. A loss pays **0** — every field zero — which is what keeps the arena a reward for risk.
- **Why the flat bounty was kept as the base:** `rewardGold` is the roster's balance data (and what
  the Colosseum list and pre-fight panel quote), so the purse is written over it rather than
  replacing it; a quiet win therefore pays exactly what the game always paid and only a showy or
  flawless one pays more.
- **Where the gold goes.** Straight into `profile.gold` through the existing `saveProfile()` write, so
  it is the same purse `purchaseTemper()` spends — a tempered gladius' first level (20 g) is one
  Marcus victory, and the whole gladius curve (130 g) is under two.
- **Validation (2026-10-20).** `bun test` → **2366 pass / 0 fail (78 files, 78,928 expect() calls)**,
  this slice contributing the 18 tests in `src/utils/duelRewards.test.ts` (loss pays nothing, base
  bounty, the hype steps and their monotonicity, the block cap, flawless and its removal by one point
  of damage, integer/non-negative totals for malformed input, the "a win never pays less than the
  bounty" invariant, and the wiring: the duel pays `purse.total` onto `statsRef`, a defeat zeroes it,
  App credits `stats.goldEarned`, the modal renders the breakdown); `bun run lint` (`tsc --noEmit`) →
  exit 0. The dev server serves the new module and the changed scene/modal/App transformed (HTTP 200).
- **Preview evidence, and what it does NOT establish.** The dev harness's own screens mount with the
  change in place — creation, the test profile, the "START TEST DUEL" hand-off — with **0 console
  errors**, so the new import chain is clean. **The purse itself is NOT automatically verified in the
  browser:** paying it requires actually winning a duel, and the sandbox renders the arena through
  SwiftShader at ~1–2 fps (the duel-mount attempt timed out at 30 s), so neither the paid figure nor
  the breakdown rows were seen rendered. They are pinned by the suite above; confirm by winning one
  Colosseum duel on a device.

## CORR-2 — the three unlanded story gates as pending (C-1; implemented)

- **What shipped.** `StoryPendingKind` gained a third member, `'beat'`, with its own authored pending
  line `PENDING_GATE_LINES.beat` = "That hour has not been written yet." Three design gates that were
  absent from the chapter table are now present as pending, in their chapters: `doctore-test` in
  Chapter 1 (First Sand), `vexus-race` in Chapter 4 (The Vulture's Wheel, beside the pending
  `league-promotion` gate) and `statue-ceremony` in Chapter 7 (Legend). Each is authored through the
  same `pendingGate()` helper the race gates use, so the day its beat lands the entry becomes a
  `{ id, requirement, confirmation, met }` gate in one line — no table restructuring, no new field.
- **The rules did not move.** Pending still never blocks: a chapter closes when every gate whose
  evidence can exist is met, so Chapters 1, 4 and 7 close exactly as before and the Legend state
  stays reachable (`complete` true with the statue ceremony pending). No gate reads evidence that
  does not exist — no profile field, writer, threshold, chapter or save was added or changed, and
  the resolver stays pure and writes nothing. The only existing assertion that moved is §B6's gate
  list for Chapter 7 (`['met']` → `['met', 'pending']`), because the chapter now carries its
  ceremony beat; nothing was weakened.
- **Regression suite: `src/utils/storyState.test.ts` §G** — G1 the three gates exist in their
  chapters with `pendingKind: 'beat'` and `state: 'pending'`; G2 each renders
  `PENDING_GATE_LINES.beat` through `storyGateLine`, and the card prints that line (never the
  requirement it stands in for); G3 a profile meeting every available gate still closes Chapters 1,
  4 and 7 (Legend complete); G4 pending gates are never `'unmet'` and a fresh profile is still held
  at Chapter 0.
- **Verified 2026-10-20** in the dev container: `bun test src/utils/storyState.test.ts` → 38 pass /
  0 fail (227 expect() calls); `bun test` → 2404 pass / 0 fail (79 files, 79155 expect() calls);
  `bun run scripts/collisionTests.ts` → 123 passed, 0 failed; `bun run lint` (`tsc --noEmit`) → exit
  0; `bun run build` → exit 0; `git diff --check` → clean.
- **Not automatically verified — the card's live appearance.** The campaign card is rendered through
  `renderToStaticMarkup` in §G2 (the beat line, `data-state="pending"`, `data-story-gate="doctore-test"`,
  requirement never printed), but the running hub was not re-walked: it renders at ~2 fps through
  SwiftShader and the library view was last reached under the STORY-1 budget. The card's on-screen
  look with the added rows is a device (Android) check, together with the open C-8.28/C-8.29/
  C-8.31/C-8.33/C-8.38/C-8.41 items.

## UI-1 — button & safe-area sweep (implemented)

- **Scope.** Presentation only: class names, two labels/captions (B-15's "Move", B-18's "Hold"),
  one retitle (B-16) and one printed sentence (B-17). No handler, route, save or layout change;
  Lefty/Righty parity untouched.
- **The shared control.** `src/components/ui/controlStyles.ts` exports `CLOSE_BUTTON_CLASS` — the
  C-8.70B §SET-1 header ✕ lifted out of `SettingsModal` (`w-12 h-12` + `min-h-[48px] min-w-[48px]`).
  Every close control now uses it with its own `aria-label`: HelpModal, GoogleDriveSyncModal, the
  city drawer and its notice banner, DeleteAccountModal, the offline banner (GameFailureSurface) and
  SettingsModal itself. `settings.test.ts`'s `w-12 h-12` assertion now reads that one constant,
  because the literal moved there — the 48×48 guarantee is unchanged, not relaxed.
- **What the sweep touched.** CombatHUD (utility cluster at 48dp, camera state label at all widths,
  own safe-area gutter), TurnActionPanel movement strip, CityHubScene + GladiatorSchoolHub headers,
  both tab bars, CharacterCreation steppers (48px, real disabled state at the stat floor),
  GoogleDriveSyncModal (labelled Refresh / Sign out / Delete / Load), the four OAuth buttons
  (compact 48×48), TitleScreen account pill + privacy link, the tab primaries and Equip/Buy rows,
  RaceTouchControls (permanent "Hold" micro-label under each gait word, 48px floor + `max()` on the
  steer/brake sizing), RaceScene's Abort (now carries its icon), and the SettingsModal privacy row
  (the panel's last icon-less row).
- **B-14.** `src/components/ui/TouchControls.tsx` was deleted. Fresh grep before deleting:
  no `from '…/TouchControls'` and no `ui/TouchControls.tsx` import anywhere in `src/`, `scripts/`
  (only prose mentions in `phaseC8_70bStage1Slice2.test.ts`, which name the idiom, not the module).
  `RaceTouchControls.tsx` is now the tree's only touch-control implementation.
- **Not applicable here.** `CoachCard.tsx` does not exist on this branch (S-1's second half lands
  with the onboarding branch). S-5 (the city's double bottom inset) was left alone, by instruction.
- **Regression suite: `src/utils/uiControls.test.ts`** — §A the shared close class and its
  labelled sites, §B the 48dp floor per audited file plus the negative pins (no `w-7 h-7`, no
  `w-8 h-8 rounded-xl`, no `w-9 h-9`, no `min-h-[44px]`, no `hidden sm:inline capitalize`), §C
  B-14 against the tree, §D the copy items (B-15 … B-19), §E the safe-area items (S-1 … S-4).
  Assertions match class *names*, not whole class strings, so reformatting does not break them.
- **Verified 2026-10-20** in the dev container: `bun test` → **2424 pass / 0 fail (80 files,
  79,245 expect())**, `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, `bun run lint`
  (`tsc --noEmit`) → exit 0, `bun run build` → exit 0, `git diff --check` → clean.
- **Preview evidence.** Title screen: the account pill, the privacy link and the settings entry all
  measure 48px (`min-height: 48px`). Account panel: `← Back` and the submit 48px, and the four
  compact OAuth circles are 48×48, still one row with 0 horizontal overflow at 375×812. Settings
  panel: the close is 48×48 with `aria-label="Close settings"`, and all four Game rows (Cloud save,
  Reset save, Privacy policy, Erase device data) now carry an icon. 0 console errors throughout.
- **Not automatically verified.** The city, hub, duel and race screens were not rendered here —
  the sandbox draws them through SwiftShader at ~2 fps — so their 48dp/inset changes rest on the
  class pins above and need the on-device (Android) look, together with the still-open northern
  approach and Colosseum checks recorded above.

## Boss-kill counter writer (FIX-A — implemented, validated; the win path itself not driven live)

- **The defect was a field with readers and no writer.** `PlayerProfile.bossKills` was written only
  as `0` by the two creation paths (`services/storage.ts` `createNewProfile`, `hub/CharacterCreation`),
  so everything reading it was silently dead: `utils/heraldry.ts`'s `bannerStripeCount` never drew a
  stripe, and `rank.ts`'s `bossKills` half of the Legend gate was only ever satisfied by its
  `defeatedOpponentIds` evidence path (untouched here).
- **The one writer is `src/utils/bossKills.ts` → `nextBossKills(before, after, opponent)`.** It is
  pure (types only, no storage, clock or randomness) and reads the write it is handed: the count rises
  by exactly one only when `opponent.isBoss === true` **and** the opponent's id was absent from
  `before.defeatedOpponentIds` **and** present in `after.defeatedOpponentIds` — i.e. the id newly
  entering the record in that same write. Rematches, non-boss wins, losses and malformed saves all
  return the stored count unchanged (a non-finite or negative count reads as 0).
- **The single call site is `App.handleMatchComplete`'s victory write**, one line beside the existing
  `defeatedOpponentIds: defeated` it reads:
  `bossKills: nextBossKills(profile, { defeatedOpponentIds: defeated }, activeOpponent)`. The defeat
  branch is untouched and never mentions the field. Every other value of that write — gold, fame, XP,
  level, tier, `fightsWon`, the hype peak and the `defeatedOpponentIds` expression itself — is
  byte-for-byte as it was, and `evaluateRoadMilestones` still receives the same `before`/`after` pair.
- **The invariant is pinned, not assumed:** `src/utils/bossKills.test.ts` (22 tests) sweeps the whole
  roster for a first kill, drives rematches, non-boss wins, loss writes and malformed saves, derives
  Legend from one Tier-4 boss's first defeat (count and felled id agreeing), checks the stripes at
  0 / 1 / 4, and **scans every shipped `.ts`/`.tsx` under `src/`** to prove no file but `bossKills.ts`
  adds to the field and that `App`'s handler names it exactly once, in the win branch.
- **Validation (2026-10-20, `web` container):** `bun test` → **2422 pass / 0 fail (80 files, 79,188
  `expect()`)** (the branch tip read 2400 / 79 before this suite's 22); `bun run
  scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → **exit 0**;
  `bun run build` → **exit 0** with the startup-asset check passing (8 assets); `git diff --check` →
  clean.
- **Not automatically verified — the win path in a running game.** A first boss defeat cannot be
  driven here: it needs a duel won in the 3D arena, which renders through SwiftShader at ~1–2 fps (the
  duel-mount attempts recorded in earlier phases exceed the script budget), and the dev character
  harness deliberately uses its own in-memory `onMatchComplete` rather than App's write. The rule, its
  one caller and the stripes it feeds are pinned by the suite; confirm on device by putting a boss
  down and checking the ludus banner gains a stripe (and that a rematch adds none).

## Duel result screen staged reveal — implemented (one file; ceremony not automatically verified)

- **What ships: one production file.** `src/components/hub/DuelResultModal.tsx` is the whole code
  diff. Nothing else moved: `DuelStatistics`' shape and its computation in `DuelScene`, `App`'s
  `handleMatchComplete` / `handleDuelResultDismiss`, `onContinue`, the confetti call, the card's own
  layout and every gold / fame / xp amount are exactly as they were. The reveal is display-only —
  mount timers plus Tailwind `transition-[opacity,transform]`, no animation library.
- **The stage timings as shipped.** Win: header at **0** (unchanged — the card's own
  `animate-fadeIn`), the recap block at **250**, the two recap lines the result never showed
  (`Max Combo: x{N}`, `Crowd Peak: {P}%`) at **550**, the rewards block at **800**, then the count-up
  runs **600** from the rewards' appearance, so the ceremony ends at ≈1400 ms. A defeat multiplies
  every stage by **1.4** (`DEFEAT_PACE`) — recap **350**, extra lines **770** — and has no rewards
  stage, no count-up and no coin (confetti and the defeat copy are unchanged). Every unrevealed block
  keeps its space (`opacity-0 translate-y-3`), so the card never changes height mid-ceremony.
- **The Continue button is deliberately outside the ceremony.** It renders at t=0, stays enabled, and
  closes the modal through the existing `onContinue` however early it is tapped — no skip logic was
  added, which the request did not require.
- **The three reward figures count up and end exact.** Gold, Fame and XP animate from 0 to their
  stats over `COUNT_UP_MS` (600 ms) on `requestAnimationFrame`; the frames are cancelled on unmount;
  the last frame writes `stats.goldEarned` / `fameEarned` / `xpEarned` verbatim rather than a
  rounding of them. `sounds.playCoin()` is called once on the count-up's first frame and once on its
  completion (two call sites; the first sits inside the frame callback so React StrictMode's
  double-mounted effect cannot double-play it). The engine self-checks the app's mute state, so
  nothing had to be wired for it. XP is a new recap row (`+{xp} XP`, `text-cyan-400` — the colour
  `TournamentTab` already uses for XP).
- **Addendum A — "Fell at X% of <opponent>'s HP remaining": IMPLEMENTED, with no plumbing rewired.**
  The modal is handed no final-HP value, but it needs none: `DuelScene` puts the opponent on
  `opponent.stats.healthMax` (`DuelScene.tsx`:191) and removes exactly `stats.damageDealt` from it
  (`statsRef.damageDealt += rawDamage`, :580, applied as `Math.max(0, prev.health - rawDamage)`, :589)
  with no healing anywhere in the scene, so `round((healthMax − damageDealt) / healthMax × 100)` is the
  fight's final share. Defeat-only, revealed with the recap block (350 ms), and omitted entirely when
  `healthMax` is missing or unusable. `DuelStatistics`' shape and `App`'s plumbing are untouched.
- **House motion rule.** Transform and opacity only, and `prefers-reduced-motion: reduce` stills the
  ceremony: every block is already in place on mount (`setStage(didWin ? 3 : 2)`) while the count-up
  and its two clinks still mark the reward figures. The rule's "paused while the tab is hidden" clause
  is not applied to this one-shot reveal — nothing loops, and a hidden tab simply reaches the end
  state.
- **Validation (2026-10-20, dev container — all five run on the final code state).** `bun test` →
  **2153 pass / 0 fail (69 files, 65,567 `expect()` calls)** — the branch tip's own count, so the diff
  moved nothing; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0;
  `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup-asset
  check passing (8 assets); `git diff --check` → **clean (exit 0)**. The diff is the modal plus this
  note.
- **Live evidence, and what is NOT verified (preview browser, anonymous visitor — no session was
  replayed).** Verified: the app boots to its title screen with **0 console errors and 0 failed
  requests**; the dev server serves the changed module transformed (HTTP 200) carrying
  `STAGE_RECAP_MS = 250` / `STAGE_EXTRA_MS = 550` / `STAGE_REWARDS_MS = 800` / `DEFEAT_PACE = 1.4` /
  `COUNT_UP_MS = 600`, both `playCoin` call sites, `cancelAnimationFrame`, all three reward rows with
  their test ids, the `Fell at` line with its `opponent.stats?.healthMax` source, and the
  reduced-motion branch; and the app's own route still walks (title → `PLAY` → the creation screen
  renders). **NOT automatically verified: the ceremony itself.** `DuelResultModal` renders only after
  a duel ends, and reaching one means title → creation → the 3D city hub → the map drawer → fast
  travel → the Colosseum prompt → the hub's tournament tab → `Enter Arena Duel` → `Step into Sand` →
  a turn-based fight to death (~8-10 exchanges at ~3 s each): three heavy scenes plus the fight on a
  sandbox with no GPU (SwiftShader, ~1-2 fps), and in this run the preview page did not carry its
  state between calls, so the route could not be driven inside the call budget. **The stage timings,
  the count-up's start/completion clinks, the exact on-screen final values and the defeat variant
  (including the Addendum-A line) therefore need the developer's own look** — which is where the
  request placed the pacing judgement anyway (a real Android device). Nothing was left behind: the
  run stopped at the creation screen, so no profile was written and no fight was fought — no
  gold/fame/xp was awarded or persisted.

## Motion foundation corrections (CORR-3 — implemented)

- **Four conformance corrections, one new settings row; no architecture change.** The MO-1 motion
  system (`src/index.css`'s Screen Motion section, `src/utils/motionTokens.test.ts`, App's root
  `data-motion` effect, `settings.screenMotion`) was already shipped; this slice brought four
  declarations back to the design and closed the missing consumer.
- **C-1 — `--ease-inout` is `cubic-bezier(0.65, 0, 0.35, 1)`** (it read `…, 0`, a curve that never
  reaches its endpoint). The suite pin that ratified the wrong value was changed in the same
  commit, so the pin and the declaration can no longer disagree.
- **C-3 — `.anim-stamp` runs on `--dur-ceremony` (700 ms), not `--dur-panel` (220 ms).** A new pin
  asserts the class contains `var(--dur-ceremony)` and explicitly not `var(--dur-panel)`.
- **C-4 — the geometry values.** Every `anim-panel-in*` origin travels **12 px** (was 10 vertical /
  14 horizontal) with `from` scale **0.97** (was 0.985); the `center` variant keeps its transport-free
  `scale(0.97)`, so all five origins now share one starting scale. `.btn-press:active` is
  **`scale(0.95)`** (was 0.97) and the press transition splits its durations: the base rule
  releases on `var(--dur-micro)` (160 ms), the `:active` rule presses in on `var(--dur-press)`
  (90 ms). Three pins were added beside the existing ones (`animate-panel` travel/scale per origin,
  the press scale, both press durations), read from the base rules above the reduced blocks.
- **C-2 — the Screen Motion row.** `SettingsModal`'s Accessibility section now carries a
  `ChoiceRow` — the panel's existing SET-1 segmented-rail control, the same one Picture Quality and
  Brightness use — with **Auto / Full / Reduced** and a `Waves` icon. `auto` is not a fourth stored
  value: it is the DEFAULT state, and choosing it clears the field
  (`set({ screenMotion: undefined })`, which `updateSettings` already deletes), so the root
  attribute is removed and the device's own `prefers-reduced-motion` governs again. The field's
  shape, the resolver and App's effect are untouched. The Accessibility placeholder card
  ("Nothing to set here yet") was replaced by the row it was standing in for — no other row moved.
- **Untouched by design:** the transform/opacity-only law (still no `transition-all`, `.btn-press`
  still names `transform, opacity, color`), both reduced-motion blocks and their 60 % columns, every
  other token, the save/profile path, and every consumer of `screenMotion`.
- **Validation (2026-10-20, dev container — all five commands run):** `bun test` → **2403 pass /
  0 fail (79 files, 79,152 expect() calls)**, the delta being three new tests in
  `motionTokens.test.ts`; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup asset
  check passing (8 assets in `public/` and `dist/`; the pre-existing >500 kB chunk warning only);
  `git diff --check` → **clean**.
- **Live evidence (preview browser, anonymous visitor — no session replayed).** From the title
  screen's own Settings entry: the Accessibility section renders the row with its icon, label,
  description and the three chips (Auto painted as the default on a record that carries no
  `screenMotion`); choosing **Reduced** writes `screenMotion: 'reduced'` into
  `sand_and_steel_settings_v1` **and** sets `data-motion="reduced"` on the document root within
  ~200 ms; choosing **Auto** removes the field from the stored record and removes the root
  attribute (checked by presence, not by value). The storage the check found was restored
  afterwards (there was no record, so the key was removed again). No console errors. The animation
  values themselves are pinned by the suite, not by eye — the sandbox renders through SwiftShader,
  so the curve/travel/scale change is not visually adjudicated here.

## Motion token adoption — duel flow (CORR-4 — implemented)

- **Two files, class names only.** `PreFightModal`'s dialog card carries `.anim-panel` with
  `data-origin="center"` (replacing `animate-fadeIn`) and both of its buttons carry `.btn-press`
  (`active:scale-95` dropped: the token rule presses to `scale(0.95)` on `--dur-press` and releases on
  `--dur-micro`). `DuelResultModal`'s verdict heading carries `.anim-stamp`, and its Continue button
  carries `.btn-press` in place of `transition-all active:scale-95`; the staged reveal, the count-up,
  the copy and the card layout are untouched. No props, state or gameplay changed.
- **Verified live 2026-10-20** (preview browser, anonymous visitor): title → Play → creation →
  "Apply Points & Enter Metropolis" → the 3D city hub's Colosseum shortcut → the tournament list's
  "Enter Arena Duel" → the Arena Challenge modal rendered with computed
  `animation-name: anim-panel-in-center`, `animation-duration: 0.22s`,
  `cubic-bezier(0.22, 1, 0.36, 1)`, `fill-mode: both`, and both buttons
  `transition-property: transform, opacity, color` at `0.16s`; Retreat closed it. `bun test` →
  2403 pass / 0 fail, `bun run lint` (`tsc --noEmit`) → exit 0, `bun run build` → exit 0 with the
  startup-asset check passing. The test save this run created was removed afterwards.
- **Not automatically verified:** `.anim-stamp` on a real result card. Reaching one needs a full
  turn-based duel, and the sandbox renders the arena at ~1–2 fps through SwiftShader; the class and
  its 700 ms ceremony beat are pinned by `motionTokens.test.ts`, and the pacing still wants an
  on-device look.
## Payload trim — `public/` workspace scratch (branch `payload-trim` — implemented)

- **Branch.** The slice's branch `payload-trim` was forked from `colosseum-exterior-architecture`
  (its tip `445cab9` **is** the merge base), so the required base is the one the brief named. No code,
  no referenced asset, no collider, no save or storage path was touched: the whole diff is four file
  deletions under `public/`.
- **Method.** Every file > 100 KB under `public/` (29 files) was classified by searching **all** of
  `src/` (including `.ts`/`.tsx` string literals and dynamic path construction), `index.html`,
  `public/sw.js`, `public/manifest.webmanifest` and **every** test file; a file named by any test, or
  whose hash a test checks, counts as REFERENCED even when no shipping code names it. Result of the
  dynamic-path audit: **every `_workspace_*` reference in the repo is a literal filename** — there is
  no template-, prefix- or lookup-built asset path anywhere — so nothing needed the ambiguous
  treatment. No `.zip` is named by anything in the searched set.
- **Deleted — 4 files, 20,497,192 bytes (19.55 MiB).** `public/` **230,863,848 → 210,366,656 bytes**
  (`du -sh` 221M → 201M):

  | file | bytes | why dead |
  |---|---|---|
  | `_workspace_gladiator_era_signs.zip` | 19,869,379 | delivery archive of the sign pack; the unpacked, live copies are `public/signs/<id>/<id>.glb` |
  | `_workspace_chariot_model_RomanChariot_GLB_Assets.zip` | 490,733 | delivery archive; its payload is unpacked as `_workspace_chariot_model_RomanChariot{,_WheelKit}.glb` |
  | `_workspace_roman_fortress.glb` | 77,404 | superseded by `_workspace_roman_fortress_normals_candidate.glb` (`NorthernFortress.tsx` `FORTRESS_URL`) |
  | `_workspace_motte.glb` | 59,676 | superseded by `_workspace_motte_normals.glb` (`NorthernMotte.tsx` `MOTTE_URL`) |

  The last two are below the 100 KB inventory threshold, but they are exactly the "unreferenced
  `_workspace_*` scratch" the slice names as its deletion candidate, and both are provably dead (0
  hits in every searched location), so they were included rather than left behind.
- **Kept although scratch-looking — test-pinned, so untouchable here.** `public/_workspace_chariot.glb`
  (1,506,872 B) is REFERENCED: `phaseC8_67d.test.ts` reads it as `LEGACY_CHARIOT_GLB` and asserts 88
  meshes / 0 skins / 0 clips / the 7 named materials, and line 848 asserts that no other source file
  names it. The same suite hash-pins the three horse uploads
  (`_workspace_dist_horse_{weak,better,great}.glb`, sha256 `0a00300e…` / `639b75d5…` / `f7e1b698…`) and
  `_workspace_chariot_model_RomanChariot.glb` + its WheelKit (`49e132e6…` / `d5b36add…`), and
  `phaseC8_66b/66c/68c`, `phaseC8_64a/64b/65/67d`, `phaseC8_35/36`, `phaseMotteTerrain`,
  `phaseFortressRotation` and `phaseC8_70b*` all read these files or their component sources. Deleting
  any of them was never on the table: the tests are the contract.
- **AMBIGUOUS list: empty.** No pattern-built path exists for any inventoried file, so no file needed
  to be kept "because it could not be fully resolved". (Outside this slice's inventory: the ten
  `public/signs/<id>/<id>.glb` files are all 77–97 KB, below the 100 KB threshold; only
  `grand_colosseum/grand_colosseum.glb` is named by shipping code
  (`ColosseumSignPrototype.tsx` `SIGN_GLB_PATH`), the other nine only by `public/signs/manifest.json`,
  which nothing in `src/` reads.)
- **Restore incidents: none.** No deletion broke a check, so nothing had to be restored.
- **REFERENCED-BUT-FAT — the compression backlog's input** (every referenced file > 2 MB, 20 files,
  **206,017,828 bytes ≈ 196.5 MiB = 98.0 % of the surviving `public/`**):

  | file | bytes |
  |---|---|
  | `models/amazonian.glb` | 24,178,572 |
  | `models/dimachaerus.glb` | 21,589,980 |
  | `models/netfighter.glb` | 21,263,388 |
  | `models/minotaur.glb` | 19,285,660 |
  | `_workspace_dist_horse_great.glb` | 16,342,056 |
  | `models/arena_roman.glb` | 16,177,472 |
  | `_workspace_dist_horse_better.glb` | 15,783,980 |
  | `_workspace_dist_horse_weak.glb` | 15,248,136 |
  | `music/boss_final.ogg` | 8,744,875 |
  | `models/weapons/spatha.glb` | 6,531,404 |
  | `models/weapons/dagger.glb` | 5,943,296 |
  | `models/weapons/gladius.glb` | 5,862,904 |
  | `models/weapons/shamshir.glb` | 5,763,084 |
  | `models/weapons/dirk.glb` | 5,065,728 |
  | `music/arena_combat.ogg` | 4,630,302 |
  | `music/ludus_train.ogg` | 3,504,456 |
  | `_workspace_arena.glb` | 3,202,640 |
  | `title_screen.png` | 2,670,368 |
  | `music/victory_cue.ogg` | 2,155,311 |
  | `music/title_main.ogg` | 2,074,216 |

  Where each is referenced: the four character GLBs and the five weapon GLBs in
  `components/3d/GladiatorMesh.tsx` (+ `data/itemsDB.ts` for the weapons); `models/arena_roman.glb`
  also at `utils/preloadAssets.ts`; the seven music tracks in `data/musicTracks.ts`;
  `title_screen.png`/`.webp` in `index.html`'s `.title-backdrop` rule and `startupAssets.ts`;
  `_workspace_arena.glb`, `_workspace_motte_normals.glb`,
  `_workspace_roman_fortress_normals_candidate.glb` and the two chariot GLBs as the city's shipping
  asset URLs. **No compression, re-encode or resize was done in this slice, by design** — this table is
  the separate pipeline backlog's input.
- **One factual note for that backlog.** The three horse uploads (47.4 MB together) are referenced only
  by test-pinned hashes and by `HORSE_FIT_ASSET_URL` in `utils/horseFitPrototype.ts`, whose only
  consumer is the dev-only `HorseChariotFitPrototype.tsx` reached through `main.tsx`'s
  `import.meta.env.DEV` branch — so no production build loads them. They stay because three suites hash
  them; shrinking or dropping them is a test-decision, not a payload-trim one.
- **Verified 2026-10-20 in the dev container, all five commands on the post-deletion tree** (with the
  same five re-run on the pre-deletion tree as a baseline, so any failure could be attributed to a
  deletion rather than inherited): `bun test` → **2153 pass / 0 fail (69 files)** — identical to the
  baseline; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed** (baseline 123/0);
  `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0**, including
  `scripts/startupAssetCheck.ts` ("8 assets in public/ and dist/"), which also shows the four files are
  gone from the regenerated `dist/`; `git diff --check` → **clean**. Live check against the running dev
  server: `/`, `/models/arena_roman.glb`, `/music/title_main.ogg`, `/title_screen.webp` and
  `/_workspace_motte_normals.glb` still serve their real bytes with the right content type, while the
  four deleted paths no longer resolve to a file (Vite's SPA fallback answers with the 3218-byte
  `index.html`, `text/html`), and a browser load of `/` renders the title screen with **0 console
  errors and 0 failed requests** and **no request for any deleted path**. Player saves untouched:
  nothing in this slice reads or writes storage.

## Tier integrity — first-defeat advancement and legal door bouts (FIX-B — implemented)

- **The two defects were both measured, and they are one rule each.** (1) `App.handleMatchComplete`
  advanced the tier on `activeOpponent.isBoss && nextTier < 4` — ANY boss victory, so rematching
  Goliath from the hub tab after he was already in `defeatedOpponentIds` wrote tier 3 without Ignis
  ever being faced. (2) `CityHubScene.handleInteract` handed the Colosseum door's duel
  `onEnterDuel(activeOpponent)` — the *stored* selection from whichever tab fight was last picked —
  so a stale tier-1 selection could be duelled at the door of a tier-2 gladiator. Story gates keyed on
  defeated ids stayed honest; every gate keyed on `currentTier` (`utils/rank.ts`, `utils/storyState.ts`)
  leaked.
- **What ships.** `src/utils/tierAdvancement.ts` (new, pure: no profile write, no storage, no clock):
  `resolveVictoryTier({ currentTier, opponent, defeatedOpponentIds })` answers
  `{ currentTier, firstDefeat, advanced }`, where `firstDefeat` is exactly "the boss's id is not in
  the record yet" — the same test the win path already used to decide whether to append it — and
  `advanced` is `firstDefeat && currentTier < FINAL_TIER (4)`. `resolveDoorDuelTarget(tier, ids)`
  answers `{ opponent, rematch } | null`: the tier's first UNDEFEATED boss, else that tier's boss as a
  rematch, else `null`. `App.handleMatchComplete` now writes `tierAfterVictory.currentTier` and nothing
  else in that path changed — gold, XP, fame, level, `fightsWon`, hype, `defeatedOpponentIds` semantics
  and `evaluateRituals` are untouched, so a repeat victory still pays exactly what it always paid.
- **The door's fallback is the tier's boss rematch (`rematch: true`), not the tab.** Chosen because a
  door that silently redirects to a menu is a worse answer at a physical door, the rematch is already
  a supported fight in this game, and the new tier rule makes it provably inert (the boss is already
  in the book, so `firstDefeat` is false). It is reached at the top tier once Aurelius is down, and by
  a legacy save that arrived mid-tier with that tier's boss already felled. `null` — the tier has no
  boss in the shipped roster at all — is the only case that opens the tournament tab instead.
- **The city scene no longer accepts `activeOpponent` at all.** The prop was removed from
  `CityHubSceneProps`, from the destructure and from `App`'s JSX, so a stored selection cannot be
  read by the door even by accident; `handleInteract` resolves through `resolveDoorDuelTarget` at
  interact time from the live `playerProfile`. Rematches remain exactly as they were in the hub tab
  (training and rewards unchanged) — only the door's targeting and the tier rule moved.
- **No save shape changed.** No new field, no migration, no reset: `defeatedOpponentIds` keeps its
  meaning and `currentTier` keeps its meaning, so an existing save is read as it is.
- **Regression suite: `src/utils/tierAdvancement.test.ts`** — 23 tests / 93 expect() calls in four
  sections: §A the rule (the roster's one boss per tier, a first defeat advancing, a repeat boss win
  not advancing, a non-boss never advancing, the tier-by-tier climb, the tier-4 cap still recording
  the felled id, malformed opponent/record/tier input); §B the audit repro end to end (Goliath falls
  through the tab → the door's target is Ignis → Goliath rematches at tier 2 keep it at 2 → Ignis's own
  first defeat writes 3 → the door then offers Valéria) plus the reconstructed pre-fix expression shown
  to have advanced; §C the door targeting (each tier's boss, a deliberately stale `activeOpponent`
  from an earlier AND a later tier both ignored, the all-bosses-down rematch fallback shown inert, a
  legacy mid-tier save, the no-boss tier, malformed input); §D the shipped wiring (App composes the
  helper and the old unconditional block is gone, the tier is written in the same update as the book,
  App no longer passes `activeOpponent` to the city, the scene calls the helper inside `handleInteract`
  and contains no stored selection outside its explanatory comment, and the module touches no storage,
  no `saveProfile`, no `localStorage`, no clock and no randomness).
- **Validation (2026-10-20, in the `web` dev container).** `bun test` → **2423 pass / 0 fail (80
  files, 79,209 expect() calls)** — up from the 2400 / 79 baseline by exactly this suite's 23;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  **exit 0**; `bun run build` → **exit 0**, startup asset check passing (8 assets; the pre-existing
  >500 kB chunk warning only); `git diff --check` → **clean**.
- **Live evidence, and what it does NOT establish.** The preview browser was seeded with a tier-2
  save (Goliath down) and the dev server serves the changed modules with **0 console errors on the
  title screen**, but **the door flow itself is NOT automatically verified**: this browser does not
  keep `localStorage` between preview calls (the seed read back inside its own call and was gone at
  the next load — the same limitation earlier phases recorded), so the app boots to `PLAY` and the
  tier-2 profile never reaches the city; the alternative route (character creation → oath → city) is
  a fresh tier-1 save, whose door target is Goliath either way, so it would not distinguish the fixed
  door from the stale one. **And the tier write cannot be exercised live at all without winning a
  duel**, which the SwiftShader city/arena (~1–2 fps) will not sustain. Both rules are pinned by the
  suite above and by the source pins in §D; confirm by winning a Colosseum duel on a device.
- **Open risks, stated rather than buried.** (a) A save that already climbed a tier through a rematch
  keeps that tier — the fix is forward-only and no migration was written, per the "saves untouched"
  constraint. (b) The door still does not apply the hub tab's level lock (it never did; it used
  whatever was stored), so the door can offer the tier's next boss below its `recommendedLevel`; that
  is unchanged behaviour, and adding a lock there is a design decision, not part of this fix. (c) The
  tier's "first undefeated boss" is read from the shipped roster order (`fightIndex`), so a future
  tier with two bosses answers the earlier one first and the later one after the first falls.
## Progression P0 — armor material ladder (data only)

- **What shipped: ten armor entries APPENDED to `ALL_ARMORS`, and nothing else in the file.** Branch
  `armor-progression-data` (from `colosseum-exterior-architecture`), HEAD `b7e7bb0` at the preflight,
  `git status --short` empty before the first edit. `src/data/itemsDB.ts` goes **6 → 16 armor pieces**;
  no entry was reordered (registry order is load-bearing for the `ITEMS_BY_CATEGORY` slot filters and,
  for weapons, `STARTING_SPARE_WEAPON`), no existing entry's id, name, price, rarity or stat was
  edited, and the only other addition is the new suite `src/utils/armorLadder.test.ts` (16 tests).
- **The ten pieces, with the values the suite pins exactly:** `arms_manica_iron` Banded Iron Manica 5
  (+1 STR, 180 / 80), `arms_manica_steel` Toledo-Steel Manica 7 (+2 STR, 420 / 185),
  `arms_galerus_gilded` Gilded Galerus of the Retiarius 9 (+2 STR, +2 AGI, 780 / 345),
  `legs_greaves_iron` Iron Ocrea Greaves 7 (+1 AGI, 260 / 115), `legs_greaves_steel` Steel War Greaves 9
  (+2 AGI, 480 / 210), `legs_greaves_gilded` Gilded Champion Greaves 11 (+3 AGI, 820 / 360),
  `helm_galea_iron` Iron Galea 6 (+1 DEF, 170 / 75), `helm_champion_gilded` Champion's Gilded Galea 11
  (+2 STR, +3 DEF, 760 / 335), `chest_lorica_hamata` Lorica Hamata Mail 14 (+3 DEF, 520 / 230),
  `chest_champion_gilded` Gilded Champion Cuirass 20 (+3 STR, +6 DEF, 1200 / 530).
- **The two conventions assigned, both the catalogue's own.** *Rarity by price band* — uncommon below
  320, rare below 760, legendary at or above it (so iron = uncommon, steel = rare, gilded = legendary:
  the three steel pieces are the only *rare* new entries, the four gilded ones the only legendary).
  *`sellPrice` = `round(price × 0.44 / 5) × 5`* — four of the six legacy entries already satisfy it
  (`helm_murmillo` 35, `helm_centurion` 140, `arms_manica` 30, `legs_greaves_bronze` 55); the
  segmentata 100 and the golden muscled 420 predate the rule and were left exactly as they shipped.
  Colors follow the metal (`iron #64748b/#94a3b8`, `steel #475569/#cbd5e1`, `gilded #ca8a04/#fef08a`),
  `style: 'crested'` on both new helmets and `'heavy'` on both new chests, matching their slots.
- **`staminaRegenBonus` is the one required `ArmorItem` field the brief did not state, and it is
  tier-scaled inside each slot** (arms 0.5 / 0.6 / 0.8, legs 1 / 1.2 / 1.5, helm 0.5 / 2, chest 0.5 / 2),
  mirroring the existing pattern where the higher tier grants more regen (`helm_murmillo` 0 →
  `helm_centurion` 1; `chest_lorica_segmentata` 0 → `chest_golden_muscled` 2). **`healthBonus` was
  deliberately not invented** — it is optional in `ArmorItem`, the brief fixed only defense and the
  named stat bonuses, and `ShopTab` / `GearTab` already render an armor row with no HP line for the
  pre-existing `arms_manica`, so the ten new rows simply show none. No `bonusStamina` was added either.
- **The ladder is complete for arms and legs and NOT for helm and chest — stated, not filled.** The
  specified ten give `arms` and `legs` a full bronze → iron → steel → gilded set (3 < 5 < 7 < 9 and
  5 < 7 < 9 < 11). **`helm` ships no steel rung** (bronze `helm_murmillo` 4 → iron `helm_galea_iron` 6 →
  gilded `helm_champion_gilded` 11, with the pre-existing `helm_centurion` 8 sitting between iron and
  gilded) and **`chest` ships neither a bronze nor a steel rung** (iron `chest_lorica_segmentata` 10 →
  iron `chest_lorica_hamata` 14 → gilded `chest_champion_gilded` 20, with `chest_golden_muscled` 18
  now the second gilded chest). The suite pins exactly the rungs that ship (`helm: bronze, iron,
  gilded`; `chest: iron, iron, gilded`) so a future rung is a deliberate edit to the table rather than
  a silent drift, and it asserts the ordering property that does hold everywhere: within a slot the
  rungs are non-decreasing in material and **strictly increasing in defense**. Adding the missing
  steel helm (and a bronze / steel chest) is a data follow-up, not a defect in this phase's scope.
- **Everything else is untouched.** No UI, component, handler, combat formula, Lefty/Righty path or
  save code changed; player saves are read-only here and no test writes one. `ITEMS_BY_CATEGORY` and
  `getItemById` pick the new pieces up by construction (the slot filters derive from `ALL_ARMORS`), so
  `ShopTab`'s armor list grows from six rows to sixteen with no edit; `scripts/combatTests.ts` and
  every existing item suite pass unmodified (`phase36.test.ts` finds its six fixtures by id).
  `src/data/shops.ts` does not exist in this checkout — if the parallel storefront lands, it resolves
  the new stock from the same fields and needed no change here.
- **Verified 2026-10-20** in the dev container, after the last source edit: `bun test` → **2151 pass /
  0 fail (69 files, 65,808 `expect()` calls)** — the preflight baseline was 2135 / 0 (68 files, 65,500
  `expect()`), so the delta is exactly this suite's 16 tests and its file, with no other suite's count
  moved; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint`
  (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup-asset check passing
  (8 assets; the pre-existing >500 kB chunk warning only); `git diff --check` → **clean (exit 0)**.
  `src/data/itemsDB.ts` is the only production file the phase touched.
- **Live evidence in the preview browser (anonymous visitor — no session was replayed).** The shop
  screen was driven through the app's own route: title → `Play` → the creation screen's
  `Apply Points & Enter Metropolis` → the 3D city hub → `City Map & Navigation` → fast travel to the
  Imperial Smithing Forge → its own `Buy Weapons & Armor [E / Space]` prompt (the arrival sits 0.50
  outside the hub's 6.0 disc, so a short `KeyD` walk brings the prompt up) → the hub's `Bazaar & Forge`
  tab. Read back from the rendered DOM: the armor section holds **16 rows** (six legacy + ten new); all
  **ten new rows carry their exact price badge and their exact `Defense: +N`** (`Banded Iron Manica`
  180 / +5, `Toledo-Steel Manica` 420 / +7, `Gilded Galerus of the Retiarius` 780 / +9,
  `Iron Ocrea Greaves` 260 / +7, `Steel War Greaves` 480 / +9, `Gilded Champion Greaves` 820 / +11,
  `Iron Galea` 170 / +6, `Champion's Gilded Galea` 760 / +11, `Lorica Hamata Mail` 520 / +14,
  `Gilded Champion Cuirass` 1200 / +20); **none of the ten renders an `HP:` line** (the legacy cards
  do), which is the documented consequence of not inventing `healthBonus`; the six legacy names are
  still present; and the run had **0 console errors**. A frame of the armor grid was captured and shows
  the legacy rows followed by the new ones. No purchase was made and nothing was bought, equipped or
  saved: the guest profile this run wrote was **deleted from storage afterwards**, so no record was
  left behind.
- **Not automatically verified — nothing needs a device.** This is catalogue data: no geometry, no
  material, no lighting, no collider, no rendered pixel and no new asset, so there is no appearance to
  accept and no Android item. Two things remain unexercised: **buying or equipping a new piece** (the
  guest profile's 100 gold affords none of them, and a purchase would write a save this phase must not
  touch), and the **gear screen's** rendering of an owned piece — the shop list above is the one screen
  checked live, the data pins are the suite's.

## Storefront wiring — each building opens its own stock (Phase SHOP-2 — implemented, validated)

- **What ships.** Phase SHOP-1's catalogue (`src/data/shops.ts`) now has consumers: every
  commercial building in the city opens the SHOP tab on its OWN storefront, and `ShopTab` renders
  that storefront's ids. Seven files: `src/utils/cityCollisions.ts` (the optional `shopId`),
  `src/components/3d/city/CityHubScene.tsx` (it hands the id to `onOpenTab`), `src/App.tsx` (the
  `shopId` state and the tab router), `src/components/hub/GladiatorSchoolHub.tsx` (it passes the id
  through), `src/components/hub/ShopTab.tsx` (the storefront screen), `src/data/shops.ts` (its
  header comment now names its consumer), plus the new suite `src/utils/storefrontWiring.test.ts`
  (20 tests) and **two rebased guards** (`src/utils/storefrontCatalogue.test.ts` §G,
  `src/utils/phaseC8_66b.test.ts` §G).
- **The mapping, and why each building's id is the one it is.**
  `smithing_forge → 'forge'` (every weapon but the starter), `armor_workshop → 'armorer'` (all six
  armor pieces), `general_store → 'bazaar'` (empty by design), `merchant_house → 'merchant'` (the
  rare/legendary six), and the hub's own tab — which no city building raises — keeps `'market'`
  (the whole catalogue), exactly what that tab always showed. `shopId` is optional and
  back-compatible in the same style as C-8.66B's `subTab`, so a hub that sells nothing passes
  nothing.
- **The one defect this fixes: the Armor & Leather Workshop opened the Armory.** Its `tabKey` was
  `'gear'`, and the Armory equips owned gear — it has nothing to sell, so walking to the tannery
  and pressing interact led to a screen with no wares at all. It now opens the SHOP tab's armorer
  storefront. Its id, position, radius, icon, colour, district, prompt behaviour and arrival are
  unchanged, as is the stable's `subTab: 'chariot'` (which gained no `shopId`).
- **The screen.** `ShopTab` takes an optional `shopId` (default `'market'`), resolves
  `getStorefrontStock(shopId)` and renders those ids — grouped into the existing Weapons / Armor
  sections so the open market is pixel-for-pixel the screen it was, with the section that has no
  stock simply absent. Each storefront has its own title/subtitle, and a storefront with no stock
  says so instead of listing goods it does not trade in: the bazaar reads **"The Bazaar's potion
  stock arrives with the medicus trade"**, and nothing else about it pretends to be a stock list.
  **Purchase behaviour is untouched**: the same `onBuyItem` handler, the same owned/afford logic and
  the same button sizes (the touch-parity floor the hub buttons already set).
- **The tab router.** `handleOpenHubTab(tab, gearSubview?, shopStorefront?)` sets the storefront
  only when the SHOP tab is opened, defaulting to `'market'`, and the hub's own navigation row goes
  through a new `handleHubTabChange`, so choosing "Bazaar & Forge" from the hub itself always means
  the open market — a city building's storefront can only arrive through the city interaction.
- **Copy fixes in the same pass** (`cityCollisions.ts` actionPrompts; the prompt banner in
  `CityHubScene` renders them verbatim): forge `Buy Weapons & Armor → Buy Weapons`; armor_workshop
  `Forge Armor & Accessories → Buy Armor & Accessories`; tavern `Gather Intel & Rest → Hear Rumors`;
  bathhouse `Rest in Bathhouse Thermae → Visit the Thermae`. The general store's and the merchant
  house's prompts are unchanged. **The doctore_house notice was already fixed by the Polish Pack §3
  and was not touched.** (`CityHubScene` carries no separate tavern/bathhouse notice copy — checked
  — so the banner is the only surface those two strings reach.)
- **Two guards rebased, not weakened.** `storefrontCatalogue.test.ts` §G's "no component consumes
  the storefront layer yet" is now an **exact list** of the three components that consume it (the
  screen that renders a storefront's stock, and the two that carry the id to it), scanned
  comment-stripped so prose cannot satisfy it; `phaseC8_66b.test.ts` §G's
  `onOpenTab(nearbyLoc.tabKey, nearbyLoc.subTab)` became the three-argument call, with the chariot
  subview still asserted (`subTab?: 'chariot'`, `subTab: 'chariot'`, and the file's `chariot` token
  count still exactly 2). No assertion was removed or relaxed.
- **Validation (2026-10-20, dev container — all five commands run and evidenced).** `bun test` →
  **2173 pass / 0 fail (70 files, 65,667 `expect()` calls)** — the branch tip before this phase read
  2153 / 69, so the delta is this suite's 20 tests and its file; `bun run scripts/collisionTests.ts`
  → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` →
  **exit 0** with the startup-asset check passing (8 assets; the pre-existing >500 kB chunk warning
  only); `git diff --check` → **clean (exit 0)**.
- **Live evidence (preview browser, anonymous visitor — no session was replayed).** Driven through
  the app's own route: title → `Play as Guest` → the creation screen's CTA → the 3D city hub → the
  map drawer's fast-travel entries. The player's save was snapshotted before the runs and restored
  afterwards (`saveRestored: true`; the disposable guest profile was removed, and no purchase record
  was left behind).
  | building | driven | seen |
  |---|---|---|
  | Imperial Smithing Forge | fast travel, then walked east (`KeyD`) to its doorway | prompt **`BUY WEAPONS`** → the shop tab reading **IMPERIAL SMITHING FORGE / Weapons & Armaments**, 10 weapon cards (9 "Buy Weapon" + the spare starter already `OWNED`), **no armor section** |
  | (the purchase) | clicked `Buy Weapon (90 Gold)` on the forge screen | gold **100 → 10** — one deduction — the card became `OWNED`, the Armory then listed **Legionary Pugio Dagger**, and the hub's own **Bazaar & Forge** tab showed **14 buy + 3 owned = all 17 items**, i.e. the full market |
  | Armor & Leather Workshop | fast travel `Armor & Leather Workshop` → prompt → interact | **ARMOR & LEATHER WORKSHOP / Armor, Helmets & Accessories**, six armor cards, **no weapons section** (captured frame; that call reached the 30 s script budget before returning its log, so this row is screenshot evidence rather than a returned assertion) |
  | Bazaar & General Store | fast travel → prompt `VISIT BAZAAR MERCHANT` → interact | **BAZAAR & GENERAL STORE**, the empty-state sentence exactly, and **0 buy buttons** |
  | Elite Merchant House | fast travel → prompt `INSPECT HIGH-TIER WARES` → interact | **ELITE MERCHANT HOUSE / Rare & Legendary Wares**, 6 cards (4 weapons + 2 armor), and no common/uncommon item anywhere on the screen |
- **Not automatically verified.** (a) **The rendered storefront copy on the target device** — the
  sandbox frames are software-rendered (SwiftShader, ~1–2 fps in the city hub) and two of the four
  travel cycles each cost a whole preview call's budget, so the reading of the new titles, subtitles
  and prompt strings on a phone remains a device item. (b) **The tavern's and the bathhouse's new
  prompt strings in the running banner** — they are pinned in source and asserted by the suite, but
  neither building was walked to in the live pass. (c) Anything behind a login: no session was
  replayed, so every run used the app's own guest path.

## Main-branch merge (2026-10-20)

- `40acb8f` ("Stabilize WebGL and optimize game assets") was merged into this branch; its four conflicts
  were resolved in favour of this branch's architecture, with main's performance intent kept:
  - **`CityHubScene.tsx`** — kept the SF-1 adaptive `dpr={cityDpr}` tier (its ceiling is the same 1.5
    main set) and the branch's wider `shadow-camera-left={-70}` (main's is -50, from before the city
    grew), but adopted main's `shadow-mapSize={[1024, 1024]}`. `DuelScene.tsx` took main's 1024 too
    (it auto-merged). Shadow cost is now half the texture memory it was in both 3D scenes.
  - **`TitleScreen.tsx`** — kept the START-1 `TITLE_BACKDROP_CLASS` (`title-backdrop`, WebP with a PNG
    fallback declared in `index.html`); main's inline `url(/title_screen.webp)` is superseded by it.
  - **`public/title_screen.png` / `.webp`** — both kept as this branch ships them. Main deleted the PNG,
    but `STARTUP_ASSETS` and the boot shell's `image-set` fallback both name it, and
    `scripts/startupAssetCheck.ts` (run by `bun run build`) fails without it. The branch's 285 KB WebP
    is kept over main's 393 KB encode of the same art.
  - **`components/dev/ColosseumRearDiagnostic.tsx`** — its light rig mirrors production by design, so its
    `shadow-mapSize` moved to 1024 as well; `colosseumRearDiagnostic.test.ts` pins the pair.
  - Main's optimized models and music (`public/models/*`, `public/music/*`) are taken as-is.
- Verified after the merge: `bun run lint` exit 0, `bun run build` exit 0 (startup asset check: 8 assets),
  `bun test` → 2473 pass / 0 fail (83 files), `bun run scripts/collisionTests.ts` → 123 passed.

## Onboarding coach marks — foundation and creation/hub walk-through (CL-1 + CL-2 — implemented)

- **What ships.** `src/utils/coachMarks.ts` (new) — the whole data + helper layer: `COACH_CARDS`
  (the one registry of card copy), `getCoachCard`, `resolveSeenState`, `hasSeenCard` and `markSeen`.
  `src/data/glossary.ts` (new) — the glossary appendix as data (`GLOSSARY`, `GLOSSARY_SECTIONS`,
  `getGlossaryEntry`, `getGlossaryGloss`), no UI. `src/components/ui/CoachCard.tsx` (new) — one
  presentational card, non-modal, at a screen edge by `placement`, 44px ✕. `src/types/game.ts` —
  the optional `seen?: Record<string, true>` field. `CharacterCreation.tsx` — the label/sub-line
  work, "Stat Points", and the live derived preview. `GladiatorSchoolHub.tsx` — the first-open
  `HUB-1` card and its one-off Help mark. `HelpModal.tsx` — "Combat Notes" + its header line.
  `App.tsx` — the single seen-write. `src/utils/coachMarks.test.ts` (new suite, 21 tests).

- **The `seen` field is written ONLY on display, and only by `markSeen`.** `resolveSeenState` is the
  `resolveRacingState` idiom: `seen` absent (every pre-CL save), partial, or of the wrong type
  (string, number, `null`, array) all resolve to `{}`, an entry that is not exactly `true` is
  dropped, the returned record is a fresh object, and the input profile is never mutated. `markSeen`
  returns a NEW profile carrying the existing ids plus this one and returns the SAME reference when
  the card is already recorded, so the hub's mount effect (and a double-mounted dev render) is a
  true no-op that never reaches `saveProfile`. `createNewProfile()` does not set the field and no
  migration touches it — a legacy save JSON without `seen` round-trips byte-identical.

- **`COACH_CARDS` is the single source of truth for card copy** — 37 entries: `D1`–`D9`, `S1`–`S7`,
  `HUB-1` and 20 `BRIEF_<building slug>` briefings (the slug is the building's own `HUB_LOCATIONS`
  id). Every entry carries `codexEntry` (the id, its future Codex page stem); no trigger is wired
  for the `D`/`S`/briefing cards in this slice — registry data only. The suite asserts the id set,
  the verbatim copy, ≤ 48 words per entry, the no-speaker cards, and that neither
  `GladiatorSchoolHub.tsx` nor `CoachCard.tsx` repeats the `HUB-1` sentence (comments stripped
  first) while `App.tsx` is the one `markSeen(` caller.

- **Creation-screen state found for the "Fighter's Look" copy:** this screen has **no** armatura /
  class selection — the six-button picker is `appearance.characterModel` only, and the fighting
  class is earned in the ludus later — so the plain branch was taken: the label became
  "Fighter's Look" with the one sub-line, and no class pick / doctrina gloss exists to relabel. (The
  glossary module carries `Armatura`/`Doctrina` for the future class work.)

- **The derived preview reads the SAME object creation submits.** `CharacterCreation` now builds the
  profile once (`buildProfile()` — the exact literal `handleFinish` used to inline) and runs
  `calculateTotalStats` on it for the preview, so the creation screen and the camp's own
  "Derived Combat Statistics" can never disagree. With the starter gladius equipped (`+2` Defense)
  the default reading is **Health 138 · Stamina 120**; the appendix's 132 is the same formula on
  base stats alone (`80 + 10×4 + 12`), i.e. without the weapon's own bonus. No formula, pool or
  floor changed — the 10-point pool, the `10/10/10/4` bases and the `≤10` / `≤4` decrement floors
  are untouched.

- **The `HUB-1` card and its Help mark.** `GladiatorSchoolHub` decides once per mount from the
  profile it was opened with: a profile that already carries `HUB-1` shows no card and no mark; a
  first-time profile shows the card at the bottom edge and marks the header's `?` control
  (`data-help-marked="1"`, amber ring + dot). The mark clears when Help is opened or the card is
  dismissed. The card is non-modal (wrapper `pointer-events-none`, card `pointer-events-auto`), so
  the camp stays usable while it is up.
  - **Mobile note (a real finding, fixed in the same slice):** on the session's first camp open the
    post-Oath nudge (`PostOathNudge`, `z-[65]`, bottom-centred under 640px) occupies the same bottom
    band as the card, and the mobile capture showed it covering the card. The card's bottom
    placement therefore lifts by 8rem under 640px (`max-sm:bottom-32`); above 640px the nudge sits
    at the bottom-right corner and the edge is free.

- **Verified 2026-10-20** in the dev container: `bun test` → **2156 pass / 0 fail (69 files)** (the
  new suite contributes 21); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB
  chunk warning only); `git diff --check` → clean. Live in the preview browser, driving the real
  screens: a stranger's creation screen reads "Fighter's Look" + the sub-line, "Stat Points" and the
  preview at **Health 138 · Stamina 120**, and two Strength points moved it to **146 · 120** with
  the pool at 8; creating that fighter and opening the camp showed the `HUB-1` card with the
  registry copy verbatim, `data-help-marked="1"`, `seen: {"HUB-1": true}` in `localStorage`, the
  camp's own Stats tab still switching while the card was up (non-modal), the ✕ measuring 44×44, and
  dismissal clearing both the card and the mark; leaving the camp and re-entering it with that
  profile showed **no card, no mark**, with `seen` still recorded — the "once per profile" rule
  driven end to end. At a 375×812 viewport the creation screen and the camp both report no
  horizontal overflow. Test fighters were removed afterwards.

- **Not verified:** the 3D city itself is untouched by this slice and the camp was reached through
  its existing shortcut bar, so nothing here re-tests the city; the post-Oath nudge's own overlap
  with the card was confirmed at 375px and fixed by the offset above, but the desktop capture (where
  the two sit side by side) is the only frame of the two notices together. Signed-in (account) paths
  are untouched: the preview browser runs as an anonymous visitor.

## Golden save corpus — fixture profiles and load-compatibility tests (GC20 — implemented, tests + fixtures only)

- **What ships, and what deliberately did not.** The corpus that proves the save's lazy-resolution
  design still holds for every shape the game has shipped: **`src/utils/saveFixtures/`** (eight frozen
  profile `.json` files, an `index.ts` registry carrying each fixture's one-line provenance and the
  shapes it covers, and `MANIFEST.md`) and **`src/utils/saveCorpus.test.ts`** (80 tests / 400
  `expect()` calls). **Zero production changes and zero changes to existing tests** — `git status
  --short` names only the new directory and the new suite. No new dependency, no dev-harness change,
  no save format change, and no fixture derived from a real player's data: every one is synthetic,
  built in this repository.
- **Why it exists.** The profile is whole-profile JSON under `sand_and_steel_gladiator_save_v2`
  (`services/storage.ts`) with **no version field and no migration**; new fields (`chariot` in
  C-8.66B, `racing` in C-8.67B) resolve lazily through `resolveRacingState` / `resolveChariotLoadout`
  and nothing proved that a historical shape keeps resolving. It does — the whole corpus is green —
  but the design was resting on an unproven assumption until now.
- **The eight fixtures.** `minimal-legacy` (the import-era creation shape, reconstructed from git
  `76984d6`), `current-fresh` (generated from `createNewProfile('Tester')` at HEAD and frozen),
  `mid-career` (hand-aged through the fields the shipped handlers advance), `racing-era` (the
  mid-career save driven through the real `purchaseChariotPart` / `equipChariotPart` /
  `purchaseRacingConfig` / `selectRacingConfig` transactions, so it is byte-for-byte what those
  handlers persist), and four malformed-adjacent shapes: `null` where an object is expected, a
  partial `racing` record (`unlocked: [4]`, `selected: 3`), a partial `chariot` record (no `equipped`,
  a retired id), and unknown extra fields.
- **What the suite drives.** For each fixture: the fixture's own bytes are put under the real save key
  and read back through `loadSavedProfile()` exactly as `App` calls it; **every profile-facing lazy
  resolver in the tree** runs (`resolveRacingState`, `resolveChariotLoadout` and every pure reader
  built on them — `getSelectedRacingConfig`, `isRacingConfigUnlocked`, the four eligibility readers,
  `ownsChariotPart`, `isChariotPartEquipped`, `equippedChariotPartId`) plus the boot-path
  `calculateTotalStats`; the serialized bytes are compared before and after (resolution never mutates
  a save, and never rewrites the stored JSON); and every absent field is shown to resolve to its
  documented default (absent `racing` → Biga, Triga and Quadra locked; absent `chariot` → the stock
  loadout; absent `injury` → no penalty). The other resolvers in the tree are not profile-shaped and
  are listed as out of scope in the manifest.
- **Findings recorded, production untouched (each pinned by an assertion).**
  (1) **`bossKills`, `tierProgress`, `newGamePlus` and `trainingSessionsLeft` are written once at
  creation and never advanced** — nothing in `src/` increments `bossKills`, and tier advancement is
  `currentTier += 1` on a boss kill, so **no played save can carry a non-zero `bossKills`**; the
  mid-career fixture keeps the creation values for exactly that reason.
  (2) **The shipped creation and the factory write different shapes**: `CharacterCreation.handleFinish`
  (the path a real player's save comes from) writes `isLeftyMode`; `createNewProfile()` does not — so a
  fixture built from the factory alone does not represent a real save, and the suite pins the
  difference.
  (3) **`profile.isLeftyMode` is read by no production code any more** (`App` reads `settings.lefty`);
  the field is still written at creation and stays in the corpus as a shape to keep loadable.
  (4) **No `road`, `story`, `seen`, `temper` or `stable` state exists in this tree** — the only save
  fields added since import are `chariot` and `racing`, and the corpus covers both.
- **The corpus rule, and how it is enforced.** A slice that adds a field to the save adds a fixture for
  the shape it writes **in the same PR that adds the field** (stated in the manifest and the registry).
  `saveCorpus.test.ts` §J makes that mechanical: it parses `PlayerProfile`'s optional members out of
  `src/types/game.ts` and fails unless the set is exactly `injury`, `isLeftyMode`, `chariot`, `racing`
  — each with a fixture carrying it and a fixture omitting it. §A fails if a `.json` file in the
  directory is unregistered or a registered one is missing, so a fixture cannot be silently dropped;
  §H proves no production file imports the corpus, that every fixture is synthetic, and that the only
  storage key the suite ever writes is the real save key.
- **Open risks, recorded not covered.** A `null` in a field **no resolver guards** (`equipped`,
  `appearance`, `baseStats`) is not exercised — the corpus's null coverage is the optional object
  fields the load path resolves, which is what this slice's brief specifies — and the Google Drive
  cloud-save client is not driven (it needs an account and a network; the stored shape it writes is
  covered by the same load path).
- **Verified 2026-10-20** in the dev container: focused `bun test src/utils/saveCorpus.test.ts` →
  **80 pass / 0 fail** (400 `expect()`), then `bun test` → **2233 pass / 0 fail (70 files, 65,967
  `expect()` calls)** — the branch tip read 2153 / 69 files / 65,567 `expect()` before this suite, so
  this suite's 80 tests and 400 `expect()` calls are the whole delta; `bun run
  scripts/collisionTests.ts` → **123 passed, 0 failed**, exit 0; `bun run lint` (`tsc --noEmit`) →
  **exit 0**; `bun run build` → **exit 0** with the startup-asset check passing (8 assets); `git diff
  --check` → clean. The validation's starting point was 3 failing assertions in the new suite — all
  three mine, in the suite's own checks (the racing invariant did not yet reject an orphan Quadra, and
  one eligibility expectation ignored the fixture's 100 gold) — **no production file and no other
  suite was touched to make anything pass**.
- **Not applicable / nothing visual, and not attempted.** This slice ships no screen, no scene and no
  style: the app's own boot path is unchanged, so there is no appearance to accept and no new Android
  item. The corpus's verification is the `bun test` run above. The preview browser was opened once on
  the fresh tree to confirm the app itself is undisturbed — the dev server answers HTTP 200 for the
  shell and the title screen renders (PLAY, PRESS TO START, ACCOUNT, SETTINGS) with **0 console
  errors** and no horizontal overflow — which is the only app-level claim this slice makes.

## Day/night cycle T0 — the clock's data model, resolver and phase table (implemented, validated; nothing consumes it yet)

- **What ships: one optional field, one pure module and one suite — and no call site anywhere** (on
  branch `day-night-cycle`, off `colosseum-exterior-architecture`). `PlayerProfile.time?: { total:
  number }` (`src/types/game.ts`, optional exactly like `chariot` and `racing`),
  `src/utils/timeState.ts` (new) and `src/utils/timeState.test.ts` (new, 36 tests). **No screen, no
  scene, no renderer, no collider, no save write, no new dependency and no existing behaviour
  changed:** nothing advances the clock, no scene reads the phase table, and `createNewProfile()`
  still writes no `time` field, so a legacy save round-trips byte-identical. The suite asserts the
  module is consumed by nothing (a `src/` sweep) and that no shipped file writes `time:` to a
  profile — the same scope-guard discipline `racingProgression` was held to.

- **ONE lazily-advanced integer drives everything: `total` counts phases from the save's
  beginning.** `resolveTimeState(profile)` returns `{ total, day, phaseIndex, phase,
  phasesUntilDawn, isNight }` with `phaseIndex = total % PHASES_PER_DAY` and
  `day = floor(total / PHASES_PER_DAY) + 1`, so **Day 1 is the first seven phases and the day
  increments at night → dawn**.

- **The seven phases, in cycle order: `dawn, morning, midday, afternoon, golden, dusk, night`**
  (labels Dawn … Golden Hour … Night). **No day/night design sheet is committed in this
  repository** — the `day-night-cycle.md` the brief points at does not exist here and a `git grep`
  finds no other phase list — so these ids are the ones this slice states and pins. The suite writes
  its own `EXPECTED_PHASES` / `EXPECTED_NAMES` out as the specification rather than reading them back
  from the module, so a future slice adopting a different naming sheet rebases those two literals and
  nothing else. (The title's phase resolver, `useTitlePhaseBackdrop` from START-1, already records
  that "nothing under `src/` resolves a day/night state" and returns the dawn variant; that named
  stub is now one consumer away from this module.)

- **The resolver's discipline, pinned the way `resolveRacingState` is: a LAZY, forgiving read —
  never validated, never repaired, never migrated.** Absent (every pre-T0 save), `null`, non-number,
  `NaN`, `±Infinity` and any **negative** `total` all resolve to **0** — Day 1, dawn — and a
  **fractional** value is floored (`6.99` is night of Day 1; `7.1` is dawn of Day 2). A legacy save
  therefore wakes on Day 1 at dawn and is deliberately **not** retro-credited for the time it was
  played before this slice. `phasesUntilDawn` is `7 − phaseIndex` — **7 at dawn, 1 at night** — and
  `isNight` is the `night` phase only; both are stated as conventions in the module and pinned as
  such.

- **The two advance functions are PURE: they RETURN a new profile and never mutate or persist.**
  `advanceTimeBy(profile, steps)` steps by whole phases — a negative, fractional or nonsense `steps`
  is normalised to a whole non-negative count, so the clock can only move forward, and a malformed
  save advances from 0 rather than from garbage. `advanceToNextDawn(profile)` rounds up to the next
  multiple of seven and is the **identity from dawn** (the pinned dawn-stay rule: there is no "next"
  dawn without spending a whole cycle). Both are driven against **deep-frozen** inputs in the suite,
  so an in-place write would throw rather than pass quietly. T0 wires neither to anything —
  persisting the returned profile stays a later slice's job through the existing `saveProfile()`.

- **`PHASE_PROFILES` is DATA, interpolated between two anchors, and it renders nowhere.** There is
  no atmosphere package in the repo, so the anchors are the *shipped* ones rather than documented
  ones: the midday anchor is `CityHubScene`'s own calibrated noon rig value for value (sun `#fffbeb`
  at 2.15, hemisphere `#fef3c7` / `#8a7a5f` at 0.45, fog `#e3dbc6` at 45…160, sky dome `#fef3c7` at
  0.35), and the night anchor — a cool moonlight key over a dark warm ground with a warm torch key —
  is **authored here and flagged proposed, not measured**, because no shipped scene paints night
  yet. The seven phases are a linear sRGB interpolation of those two, driven by per-phase daylight
  weights. **It is Director-reviewable data, not settled art direction**, and the suite pins its
  *shape* (the anchors exact in both directions, every value between them field by field, a
  monotonic key light, every colour a well-formed hex) rather than its taste.

- **Validation (2026-10-20, dev container — all five commands run, every one green):** focused
  `bun test src/utils/timeState.test.ts` → **36 pass / 0 fail** (784 `expect()` calls); `bun test` →
  **2189 pass / 0 fail (70 files, 66,351 `expect()` calls)** — the branch tip read 2153 / 69, so
  this suite's 36 tests and its file are the whole delta; `bun run scripts/collisionTests.ts` →
  **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` →
  **exit 0** with the startup asset check passing (8 assets; the pre-existing >500 kB chunk warning
  only); `git diff --check` → **clean**. The dev server still answers HTTP 200 for the shell and
  serves the new module transformed.

- **One test-side repair this turn, determined by the evidence rather than by weakening a check.**
  The suite's §G "no scene consumes it in T0" guard swept `src/` for the module's name over **raw**
  source, so the cross-reference comment this phase adds in `types/game.ts` counted as a consumer and
  the suite failed 1 of 36. It now reads **comment-stripped** through the suite's own `code()` helper
  — the helper that exists precisely so "prose can never satisfy (or defeat) an assertion" — so it
  still fails on a real import while a documentation mention is not a consumer. No assertion was
  removed or relaxed, and the module itself was unchanged by the repair.

- **Not automatically verified — and there is nothing to see, by construction.** This slice renders
  no pixel and advances no clock: the module has no call site, no scene reads `PHASE_PROFILES`, and
  no screen shows `day` or `phase`. So there is no appearance to accept and **no new Android item**;
  the visual acceptance of the seven phases belongs to the slice that wires this resolver to the
  title background and the scene lighting. Still open from earlier phases: the C-8.41 kerb, the
  C-8.64A/B district, the C-8.65 apron and the rest of the device checklist this file carries.
## Selling corrections — CORR-1 (C-2 / C-3 / C-4 / C-6 — implemented)

- **A sale is one instance (C-3).** `utils/selling.ts`'s `sellItem()` no longer filters every
  entry of the sold id: it finds the FIRST matching index and removes only that entry, paying once.
  Two copies of one id therefore leave one copy and one credit.
- **Eligibility counts copies, it does not look the id up (C-4).** `getSellEligibility()` is
  `carried > equipped`, where `equipped` is how many equipped slots hold that id. The starter
  gladius sits in BOTH `equipped.weapon` and `inventory`, so the worn copy explains one entry and
  any further entry is a spare that sells; when the inventory holds no more copies than the
  equipment explains, the only copy left is the worn one and the refusal stays `equipped`. The same
  rule covers the four armor slots. Prices, `sellPrice` values, the 25 % temper refund rate and the
  refusal set are unchanged; `sellItem` is still pure and still writes only through `saveProfile()`.
- **The sell surface moved to the Armory (C-2, one surface only).** `components/hub/GearTab.tsx`
  puts a two-tap Sell control on every carried weapon/armor card that is not the worn copy, showing
  `getTemperSellValue(profile, item)` (`sellPrice` + 25 % of temper gold). The first tap arms it
  (`Confirm?`, red), the second sells through the existing `onSellItem → App.handleSellItem →
  saveProfile` path; the arm lapses after `SELL_CONFIRM_ARM_MS` (3 s) or when the profile changes
  under it. Cards are keyed `id#index` and the worn copy is resolved by index, so a spare with the
  worn id renders as a spare (Equip + Sell) instead of a second `Equipped`. `ShopTab`'s catalogue
  cards no longer offer any sell control and its `onSellItem` prop is gone — the Bazaar buys only,
  and every other ShopTab behaviour is untouched. **After the update from `colosseum-exterior-architecture`
  the Bazaar keeps its SHOP-2 storefront resolution (`shopId`, `getStorefrontStock`) and its
  `min-h-[48px]` buy controls, so a city building still opens its own stock and the open market still
  shows the whole catalogue; only the sell controls are absent.**
- **Purse wording (C-6).** `PreFightModal`'s "Base Bounty" row and `TournamentTab`'s reward row now
  read `from {rewardGold} Gold`; the bounty has been a floor rather than the payout since the
  performance purse landed. Layout and every other line are unchanged; no test pinned the old
  string.
- **Tests.** `src/utils/selling.test.ts` gained the S3 cases (two copies → one sale → one copy and
  one credit; starter gladius worn + a spare → the spare sells; the armor-slot equivalent).
  `src/utils/sellingSurface.test.ts` (new) renders the real components with `react-dom/server`:
  the Bazaar markup carries no sell control, the Armory offers one control per spare at its
  effective value (temper refund included) and none on the worn card, a second copy of the worn id
  is a spare, and both purse surfaces read "from N Gold".
- **Validation.** `bun test` → **2413 pass / 0 fail (80 files)** and `bun run lint` (`tsc --noEmit`)
  → exit 0 were run on this branch before the update from `colosseum-exterior-architecture`; the
  merged state is re-validated in the merge commit, which is the count to trust.
- **Not automatically verified — the browser gesture.** The Armory is only reachable through
  title → character creation → the oath beat → the city, and this sandbox renders those 3D screens
  through SwiftShader, so the two-tap confirm (arm → sell, and the 3 s lapse), the gold credit and
  the saved-inventory shrink were **not** dispatched in a browser. They are pinned by the suites
  above plus the shipped `sellItem`/`onSellItem` path; confirm on a device by selling a spare from
  the Armory.

## STORY-2 — Arrival, Oath, First Sand (Chapters 0–1) — implemented

- **What ships, in the design's three beats.** BEAT 1 — the novice bout's framing:
  `src/utils/storyBeats.ts` (new, pure) holds `NOVICE_BOUT_BRIEFING` (Niger names the bout, Marcus
  answers) and `isNoviceBoutDue()`, wired into `PreFightModal` as a `narration` prop that draws a
  voices-only block above the shipped intel rows; `App.handleMatchComplete` reads the FIRST attempt
  before the write and sends `doctoreAttemptLine(didWin)` to `DuelResultModal`. BEAT 2 — the
  Doctore's Test: `src/components/hub/DoctoreTestCard.tsx` offers the two restrictions (each with
  its rule AND its reason, the Clarity law) at the Doctore House (`tabKey: 'training'`, above the
  conditioning cards); the chosen rule travels through the hub's `PreFightModal` (printed back on
  the card) and into `App`, where the victory write judges it off the duel's own
  `DuelStatistics`. BEAT 3 — `src/components/hub/PrimusPalusBoard.tsx` sits in the Colosseum's
  Tournament tab beside the tournament card.
- **The ladder fight is untouched; the Test is off-ladder.** `opp_marcus` is still Tier 1, Fight 1
  in `ALL_OPPONENTS`. The Test is fought against `DOCTORE_TEST_OPPONENT` (`opp_doctore_sextus`,
  "Sextus the Yard Measure"), declared in `src/data/opponents.ts` and deliberately NOT in
  `ALL_OPPONENTS`/`PRIMUS_PALUS_LADDER`: `fightIndex: 0`, no `isBoss`, so `tierAdvancement`,
  `bossKills` and the banner's stripes cannot be moved by taking it, while the ordinary victory
  write still records his id — which is the evidence the campaign gate needs.
- **Fresh-profile-only, both halves of the predicate.** `isNoviceBoutDue()` is true while the
  record has won NO duel and has not put Marcus down; a profile that lost to him has no win and so
  is still due on the next attempt ("a loss costs nothing and ends nothing" — the defeat branch of
  the write still only increments `fightsLost`). A legacy save with any win, or with the Marcus id
  already in the record, never sees the framing again.
- **The campaign gate STORY-1 left `'pending'` is now real, and that is the one behavioural change
  to chapter resolution.** Chapter 1's `doctore-test` gate was already in the table with
  `pendingKind: 'beat'`; STORY-2 lands its owning system, so the gate reads evidence —
  the test opponent's id in `defeatedOpponentIds` AND `story.doctoreTestPassed` — and a record that
  has only won a duel waits in Chapter 1 until it takes the Test. The two rules above it are
  unchanged: the id alone is not a pass (every win records it), the flag alone is not either, and
  neither is a stored verdict. A legacy save simply has not passed yet, and the entry stays open in
  the world so it can.
- **Save shape — no new top-level field.** The pass lives in the existing lazy `story` object as
  `story.doctoreTestPassed?: boolean` (`src/types/game.ts`), written by the same victory update that
  records the id, so the two can never disagree. `DuelStatistics` gained
  `lowestStaminaFraction: number` — the stamina low-water mark, tracked exactly the way `maxCombo`
  is (`Math.min` over the duel, initialised to 1, expressed as a fraction of the maximum the player
  entered with, clamped to 0…1). It is a reading of the fight, not a rule of it: no combat formula
  consults it. `createNewProfile()` still writes neither `story` nor anything else new.
- **Primus Palus is a derivative, not a record.** The board reads only the profile it is handed and
  the roster it imports: Aurelius's plaque (the roster's tier-4 boss, found by data not by an id
  literal), the challengers' row in ladder order with the champion excluded, and the player's line
  at the bottom — an UNCHALKED blank until `fightsWon >= 1`, then the gladiator's name with
  `road.bannerDevice` (or "No device sworn"). No state, no storage, no save field, no per-frame
  work.
- **Suites: the existing story suite was REBASED, not weakened.** `src/utils/storyState.test.ts`
  (39 tests / 226 `expect()` calls) gained two fixtures — `withDoctoreTest()` (the id *and* the
  flag, written the way the victory write writes them) and `withStory()` (a story patch that keeps
  the other flags) — and every boundary assertion still measures the boundary it names: B2 now
  shows a legacy win closing Chapter 0 and waiting in Chapter 1, with the Test's evidence advancing
  it to 2; B3 splits into "the win meets one half" + "win and Test close it"; B4 re-reads Chapter 2's
  duel gate before Goliath falls and lists Chapter 3's states after; B5/B6/B7/B9 carry the evidence
  instead of restating the record, and B5's "missing Ignis" case now filters the id out rather than
  replacing the array (which would have dropped the Test's). §C's resolved-flag objects gained
  `doctoreTestPassed: false`, §E's import list gained `./storyBeats`, and §F's fixtures carry the
  evidence so the card assertions still test the chapter they name. §G was retitled and re-framed:
  two beats are still unlanded (`vexus-race`, `statue-ceremony`; G1/G2 assert them pending), the
  third landed (new G3 asserts no pending kind and both halves of its evidence), and G4/G5 keep the
  "pending never holds a chapter shut / nothing closes early" properties.
- **New suite: `src/utils/storyChapterOne.test.ts` — 30 tests / 165 `expect()` calls, seven
  proofs.** P1 the bout is the shipped rung and the Test is off-ladder; P2 the framing is
  fresh-profile-only (won a duel / already faced Marcus / a loss / a malformed record); P3 it is
  narration, not intel (two speakers, no digit in either line, the narration block reads no
  `opponent.` field, the intel rows are still exactly three); P4 the Doctore reads the first attempt
  win or lose, the line is decided before the write, and a loss records only `fightsLost`; P5
  exactly two rules, each printed with its reason, one choice each, and a passed Test still offered
  as a bout; P6 the verdict reads `maxCombo` / `lowestStaminaFraction` (at target yes, one below no;
  0.5 yes, 0.49 no; unknown rule or no reading passes nothing), the result line names the shortfall,
  the low-water mark is the only new reading in `DuelScene`, and the gate needs both pieces of
  evidence; P7 the board's champion/challengers/player line and its statelessness.
- **Verified 2026-10-21** in the dev container: `bun test src/utils/storyState.test.ts` → **39 pass
  / 0 fail** (226 expect()); `bun test src/utils/storyChapterOne.test.ts` → **30 pass / 0 fail**
  (165 expect()); `bun test` → **2784 pass / 0 fail (93 files, 82692 expect() calls)**; `bun run
  scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0;
  `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only); `git diff --check` → clean.
- **Not automatically verified — the rendered surface and the in-browser gesture.** No frame of the
  Doctore's Test card, the narrated pre-fight card, the result lines or the Primus Palus board was
  captured this phase: all four sit behind the 3D city hub (title → character creation → the oath →
  the city → a hub building), which this sandbox renders through SwiftShader at ~2 fps, and the
  static markup above is `react-dom/server` output rather than a browser paint. **Android check,
  pending:** open the Doctore House's Training Yard and confirm both rules read with their reasons
  and one button each, take one and confirm the rule is reprinted on the pre-fight card, read the
  Doctore's line on the result, then confirm the Tournament tab's Primus Palus board shows the
  champion's plaque, the ladder row, and the player's own line still blank before the first win and
  chalked after it. The Test's combat difficulty against a fresh gladiator is a balance question
  this suite does not measure.

## CL-3 — the Doctore's guided beats engine (implemented, verified live)

- **The pure engine lives in `src/utils/coachMarks.ts`** (the CL-1 registry module, extended —
  no card copy changed). `evaluateBeats(snapshot, seen)` returns the ONE beat to show next or
  `null`: the lowest-numbered unseen beat whose state is true. `CombatSnapshot` is a union —
  `FightSnapshot` (everything DuelScene already holds: `phase`, `opponentId`, `isBoss`,
  `playerTurn`, `playerActing`, `inReach`, `playerStamina`/`Max`, `quick`/`powerStaminaCost`,
  `lastPlayerStrike`, `opponentHealth`/`Max`, `hype`, `telegraph`) and `ResultSnapshot`
  (`phase: 'result'`, `result`, `losses`). D1–D7 never fire on the result screen and D8 never
  fires in a fight.
- **D5 is "low", not "staggered or low" — a deliberate, reported limit.** Nothing in the shipped
  combat produces a staggered state (no `FighterState` field, no action, no AI branch produces
  one), so the "staggered" half cannot be evaluated from state DuelScene holds. It was **not**
  approximated with an invented flag: D5 fires on `playerStamina >= playerStaminaMax` plus
  `opponentHealth / opponentHealthMax <= OPPONENT_REELING_HEALTH_FRACTION` (0.25). D6 uses
  `HYPE_HIGH` (40) with the HUD's own `> 40` HIGH reading.
- **DuelScene supplies the snapshot** in one effect keyed on the combat state it already keeps
  plus two counters it now holds (`playerTurnCount`, incremented when the AI hands the turn back;
  `resolvedActionCount`, incremented in the 1100 ms resolution tail) and `lastPlayerStrike`, set
  in the three places a player strike resolves (out of range / blocked / landed). Nothing pauses,
  queues or blocks: an action that resolves while a card is up behaves exactly as before.
- **Dismissal is the only writer, and it runs after the card has rendered:** the ✕, the action the
  beat teaches (`beatDismissesOn`: D1 quick, D2 advance, D3 guard/taunt, D4 power, D5 power,
  D6 taunt, D7 dodge), or `BEAT_EXPIRY_ACTIONS` (2) further resolved actions. DuelScene keeps its
  own seeded `SeenState` (`seenBeatsRef`) so a card cannot re-fire before App's profile update
  lands, and records through App's single `markSeen` write (`onMarkCardSeen`).
- **`CoachCard` gained a fifth placement, `panel`** — the duel's own edge, `bottom-[19rem]` with
  `max-sm:bottom-[24rem]`. Measured live (DOM rects, not by eye): the card's bottom sits 31 px
  above the action grid at 1280×800 and 58 px above it at 375×812, so it never covers a control;
  its wrapper stays `pointer-events-none`, so the fight is not intercepted even where it overlays
  the arena floor. The UI-1 safe-area guard's four `max(0.75rem,env(safe-area-inset-*))` insets
  are unchanged (the panel edge is not a device edge).
- **D8 is decided by App, not the modal:** App runs `evaluateBeats({ phase: 'result', result,
  losses: profile.fightsLost }, resolveSeenState(profile))` and passes the id to
  `DuelResultModal`, which renders the registry card at the top edge and reports its ✕ (and
  Continue) to the same `handleMarkCardSeen`. `losses === 1` is the "first loss" reading, so a
  second loss can never show it.
- **CombatHUD's hype meter is labelled "CROWD HYPE"** (it read "CROWD FAVOR"); no other markup,
  no layout change, and `crowdFavorTier` keeps its own HIGH/LOW wording.
- **Suite: `src/utils/coachMarks.beats.test.ts`** (25 tests, 102 assertions) — per-beat
  fires/doesn't-fire/never-re-fires, priority (lowest number, one at a time, D1 outranks all),
  purity (same inputs, no snapshot/seen/profile mutation), D8 first-loss-only, a full simulated
  turn sequence (D1–D7 in order for a fresh profile, **zero** cards once every D-beat is seen) and
  the dismissal map. No storage is read or written by it.
- **Verified 2026-10-21:** `bun test` → **2809 pass / 0 fail (94 files, 82 794 expect())**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`)
  → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only);
  `git diff --check` → clean. Live in the preview browser (the dev character harness, driven in an
  in-page frame so no save is touched): D1 renders the registry copy verbatim on Marcus's opening
  turn, one card only; ✕ dismisses it; an out-of-range Quick Strike raises D2; Advance (its taught
  action) dismisses it and nothing comes back; the card clears the action grid at both 1280×800 and
  375×812 with no sideways scroll; the meter reads CROWD HYPE. **Not automatically verified:** D8 on
  the result screen — it needs a profile's first real loss in App's own duel flow, which the harness
  does not mount (its result screen is its own), so that card is covered by the engine suite and the
  wiring only; check it on device on a first defeat.

## P2 — Triumphs and the derived rank (implemented, validated)

- **What shipped.** One optional save field, one pure transaction, one Library page and one sheet panel.
  `PlayerProfile.laurels?: { titles?: string[]; statue?: boolean }` (`src/types/game.ts`) is **optional and
  never backfilled** — a pre-Triumphs save has no field and `resolveLaurels` reads it as "owns nothing".
  `src/utils/laurels.ts` holds the four-honour catalogue (Crowd Favourite 300 fame, Champion of the Sands
  800, Living Legend 2,000, Ludus Statue 1,200 — **fame only, never gold**) and the pure
  `purchaseLaurel` / `getTriumphPurchaseEligibility` / `resolveLaurels` / `ownsTriumph` /
  `ownedTriumphs`, in the `racingProgression.ts` / `chariotLoadout.ts` idiom: success returns a NEW profile,
  refusal returns `{ ok: false, reason }` and no profile. A title buy also points `profile.title` at the
  title's own name; owning is permanent, the displayed title is a pointer. **Zero power** — nothing here
  touches a stat, price, reward or gate, pinned by `laurels.test.ts` §F, which also allowlists the only
  files permitted to name the field.
- **Surface naming: the umbrella is "Triumphs".** "Laurel" belongs to the palma (the day's golden laurel),
  so no string either surface prints uses it; `laurels` / `purchaseLaurel` are the design's own code
  identifiers (§11 C1d renames the surface, not the field).
- **Where it is.** `TriumphsPage.tsx` is the second page of the **Records & Lore** tab's own rack (beside
  the Road) — it adds **no** hub tab and no nav entry. `StatsTab.tsx` gains a **Career** panel: the
  **derived** rank from `deriveRank` (`utils/rank.ts`, the Road page's own answer — never the stored
  `rank` field), the fame balance, and the owned Triumphs with the statue's fixed line.
- **Corpus discipline.** The added optional field fired the GC20 tripwire by design: `saveCorpus.test.ts`
  §J's optional-field list now includes `laurels` in `game.ts` declaration order, and a new **triumphs-era**
  fixture (`saveFixtures/triumphsEraProfile.json`, registered in `saveFixtures/index.ts` and `MANIFEST.md`)
  carries three owned titles plus the statue and displays the newest. Every pre-existing fixture still
  resolves as before, and no factory save writes the field.
- **Suites.** `src/utils/laurels.test.ts` (transactions, refusals, purity, the naming law, §F's zero-power
  sweep) and `src/utils/triumphsSurface.test.tsx` (server-rendered Library page and sheet: prices, refusal
  copy, owned/displayed/statue states, the derived rank over deliberately stale stored values, the empty
  state, the wiring read out of the sources). **The surface suite is `.tsx`, not `.ts`** — it renders JSX and
  bun's `.ts` transform rejects it; a `.ts` name silently becomes an unhandled parse error.
- **Validated 2026-10-21** in the dev container: focused
  `bun test src/utils/{laurels,triumphsSurface,saveCorpus,rank,roadOfGlory,roadMilestones,saveValidation,phaseC8_67b,phaseC8_66b}.test.*`
  → **337 pass / 0 fail** (3,101 expect() calls); `bun run scripts/collisionTests.ts` → **123 passed,
  0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB
  chunk warning only); `git diff --check` → clean. This turn changed **test-side code only** — the feature
  commit was already in place; the fixes were the suite's `.tsx` naming, §F's allowlist (its walk now
  descends into `saveFixtures` so the registry's own `index.ts` is accounted for like any source), §D
  narrowed to the Triumphs page (**the Library rack opens on the Road, whose pre-existing palma copy
  legitimately says "the laurel hill" — that is not the surface this naming law governs**), and one
  `as unknown as` cast in the malformed-save test that had made `lint` fail.
- **Preview evidence.** Live in the hub on a fresh profile: **Records & Lore → Triumphs** renders all four
  honours with their fame prices, the `RANK: ROOKIE` badge, `Fame: 0`, `Owned: 0 / 4`, and a disabled buy
  plus `Not enough fame.` on every card; **Gladiator Stats → Career** shows `RANK Rookie`, `FAME 0`,
  `TRIUMPHS OWNED` / `No Triumphs yet.`; no sideways scroll at 1280 or 375. **Not automatically verified:**
  the **owned** states on the live surfaces (a title owned/displayed and the statue's line) — a fresh
  profile has 0 fame and the cheapest Triumph costs 300, so no purchase could be driven; those states are
  covered by `triumphsSurface.test.tsx` §A/§C against the same components. **Android visual acceptance
  remains pending** for the two surfaces. The verification profile exists only in the preview browser's
  own storage; nothing in the repo, the user's save or the user's preview was touched.

## S4 — injuries happen (disease before cures — implemented)

- **The defect was one end of a finished loop.** `PlayerInjury { fightsRemaining, penaltyStrength,
  penaltyAgility }` has existed on the profile since import, `createNewProfile()` writes `injury:
  null`, and `calculateTotalStats` has always subtracted the penalties (floored at 1) — but nothing
  in the game ever wrote a non-null injury, so the penalty branch was dead. This slice writes the
  missing inflictor. **No new save field and no migration:** the existing field is written through
  the existing `saveProfile` path, so the save format is unchanged.
- **The helper is `src/utils/injury.ts` (pure, deterministic, no RNG).**
  `resolveInjuryAfterDuel(profile, won)` returns `{ profile, event }` with a NEW profile: a loss with
  no active injury sets `{ fightsRemaining: 3, penaltyStrength: 2, penaltyAgility: 2 }`; ANY completed
  duel (win or loss) with a live injury decrements `fightsRemaining` by 1 and clears to `null` at 0; a
  loss while injured neither stacks nor refreshes. Order of operations is explicit — the fresh
  infliction branch returns before the decrement, so a new wound starts at the full 3. `event` is
  `{ kind: 'inflicted', injury }`, `{ kind: 'healed' }` or `null` (a plain decrement says nothing).
  `resolveActiveInjury()` is the one "is the wound live" read; `injuryBannerLine()` is the one
  player-facing line, built from the injury's own numbers. The module never reads
  `calculateTotalStats` or `combatCalculations` (pinned).
- **One call site: `App.handleMatchComplete` (src/App.tsx:648).** The helper is resolved ONCE before
  the win/loss branch, and both branches spread `...afterInjury` into the `updatedProfile` they commit
  through the existing `setProfile` + `saveProfile(settledProfile)` pair — the same transaction that
  credits gold/fame/xp and records story progress. Wins and losses both run it; racing and every
  other handler never touch the field. The outcome travels to the result modal in the same
  `setDuelResult` payload, so the screen and the save cannot disagree. Boss fights and the Doctore's
  Test go through that one handler, so the rule is uniform — no boss-only exception, no Test exception.
- **Surfaces.** `DuelResultModal` shows a red banner on an inflicting loss ("Injured: −2 STR / −2 AGI
  for 3 fights", from the injury written) and a short emerald "Injury healed." line when a duel closes
  one; a plain decrement adds nothing. `StatsTab` shows an "Injured" block with the penalties and
  fights remaining above Primary Attributes, only while `resolveActiveInjury` says the wound is live —
  this is where the player sees why the stats `calculateTotalStats` renders are netted. Neither
  surface restates the penalty numbers; both read the helper.
- **Tests.** `src/utils/injury.test.ts` (30 tests / 71 `expect()`) — §A infliction on a loss only,
  §B a fresh wound starts at 3 and is not decremented by its own duel, §C the cadence across
  subsequent duels (win or loss), §D clear at 0 → `null`, §E no stacking/refreshing, §F
  `calculateTotalStats` applies −2/−2 floored at 1 (the first non-null-injury coverage in the repo),
  §G purity (frozen input, no mutation; a no-op returns the caller's object), §H the wiring (one call
  site, before the branch, both writes, the result payload, no other caller in `src/`).
  `src/utils/injurySurface.test.tsx` (6 tests / 15 `expect()`) renders the real components with
  `react-dom/server`: the modal's three states and the stats tab's live/absent/cleared states.
  One existing assertion was **rebased, not weakened**: `storyChapterOne.test.ts`'s exact
  `setDuelResult({ didWin, stats, storyLines })` now includes `injuryEvent`, which is the same
  payload it exists to pin.
- **Validated 2026-10-21** in the dev container (all five, on the final tree): `bun test` → **2896
  pass / 0 fail (98 files, 83,796 `expect()` calls)**; `bun run scripts/collisionTests.ts` → **123
  passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the
  pre-existing >500 kB chunk warning; startup asset check 8 assets); `git diff --check` → clean.
  The one startup failure was mine — `const { injuryEvent }` read a property the helper calls
  `event`, caught by `tsc` and fixed by `event: injuryEvent`.
- **Preview evidence.** Live in the preview browser (anonymous visitor, no session): title → PLAY →
  creation → the city hub → the footer's **Gladiator Stats** tab renders the full stats screen with
  **no "Injured" block** (`data-injury` absent), no sideways scroll at 1280, and 0 console errors —
  the no-injury state. **Not automatically verified: the injury states in the running UI.** Putting a
  wound on a live profile needs a *duel loss* in App's own flow (the 3D city → arena at ~2 fps
  through SwiftShader), and seeding `localStorage` cannot survive the app's next fresh load, so the
  positive states are covered by `injurySurface.test.tsx` against the real components instead. Check
  on device: lose one duel and confirm the red banner's numbers, then open Gladiator Stats and watch
  the wound's count fall across three duels and the block disappear when it heals. **Android visual
  acceptance remains pending.** The guest profile this live run wrote was deleted from the preview
  browser's storage afterwards; the repo, the user's save and the user's preview were not touched.
## S5 — the cures: the Medical House treats, the Caravanserai rests (implemented)

- **The other half of S4's loop, and it writes the same one field.** S4 made a loss inflict
  `{ fightsRemaining: 3, penaltyStrength: 2, penaltyAgility: 2 }`; this slice sells the cures.
  **No new save field and no migration:** the existing `injury` field is cleared or shortened and
  `gold` is deducted through the existing `setProfile` + `saveProfile` pair, so the save format is
  unchanged, `createNewProfile()` is untouched and a legacy save round-trips byte-identical.
- **Both helpers live in `src/utils/injury.ts`, beside the inflictor, and both are pure.** The
  prices are the design's §1.6 values: `TREAT_PRICE` **75**, `REST_PRICE` **25**,
  `REST_FIGHTS_RESTORED` **2**. `treatmentPrice(service)` is the one reader of the two prices;
  `getTreatmentEligibility(profile, service)` returns `{ ok: true, price }` or
  `{ ok: false, reason: 'no-injury' | 'insufficient-gold' }`. `treatInjury(profile)` clears the
  wound outright; `restAtInn(profile)` takes two fights off its clock and clears it to `null` at
  zero (the floor is zero, never a wound worth nothing) with the penalties riding along until then.
  **A refusal returns the caller's own profile object and never charges**, and a missing or
  non-finite `gold` can afford nothing, so a malformed save cannot produce a NaN balance. Neither
  helper reads or advances the day/time — rest is a treatment service here, not the exertion
  clock — and neither imports the combat formulas or storage (all pinned).
- **App transacts; the city only reports the choice.** `App.tsx` holds the only two call sites:
  `handleTreatInjury` and `handleRestAtInn` each call the helper once, treat a returned-same-reference
  as a refusal (`return false`, no `saveProfile`), and on success write the new profile through
  `setProfile` + `saveProfile` exactly once. `CityHubScene` declares `onTreatInjury` / `onRestAtInn`
  as `() => boolean` props, calls them from its one treatment panel, and names neither `setProfile`
  nor `saveProfile` — no transaction is re-implemented on the screen.
- **The panel is the injury module's own reading.** `HUB_LOCATIONS`' `arena_medical_house` and
  `caravanserai` have **no `tabKey`**, so `handleInteract` reaches its own branch: with a live injury
  (`resolveActiveInjury`) it opens the panel keyed `data-treatment-panel={service}`; a healthy visit
  keeps the flavour notice the hub has always printed, with no buttons at all. The panel prints
  `injuryBannerLine(injury)` and `treatmentPrice(service)`, shows the refusal as
  `data-treatment-refusal={reason}`, and its one action is a `min-h-[48px]` target. Esc closes it,
  and no other key is read while it is up.
- **The Caravanserai's Armory redirect is gone.** Its `tabKey` was removed (it pointed at the gear
  tab), so it can never open a tab again; its service is rest, and its `actionPrompt` reads
  `Rest at the Inn`. Centre, radius, icon, colour, district and fast-travel arrival are unchanged,
  and the four other flavour notices (shrine, barracks, veteran hall, the neutral fallback) are
  untouched.
- **Tests: `src/utils/treatment.test.ts` — 29 tests / 110 `expect()` calls.** §A treat (the 75 gold
  price, an outright cure, exactly one deduction, a purse exactly at the price paying to zero,
  nothing else on the profile moving, a second visit refused); §B rest (25 gold / two fights,
  3→1, 2→null, 1→null, no negatives, two rests taking 3→null for 50, the clock field
  untouched); §C both refusals with the profile untouched (no injury, an exhausted or malformed
  wound, a purse one gold short, a malformed balance, and the eligible path answering its price);
  §D purity (frozen inputs, no mutation, a refusal returning the caller's own object, two calls
  agreeing but not sharing); §E the wiring (App the only caller and each handler saving once, the
  scene passing both callbacks and writing no save, the panel's own reads and its 48dp button, the
  Inn's removed redirect, the untouched notices, and racing never treating or resting).
- **Two test-side repairs this turn — the production wiring was already correct.** §E's
  "hands both callbacks through" test asserted `onTreatInjury={handleTreatInjury}` in the *scene*
  source, where that pass-through legitimately lives in `App.tsx`; it now reads the props off
  `APP_SOURCE` and the scene's own declaration and call off `SCENE_SOURCE` (four assertions became
  six). The "racing never treats or rests" test contradicted itself — `not.toContain('restAtInn(')`
  followed by `match(/restAtInn\(/g).length === 1` — so it now keeps the single-call-site counts and
  asserts neither call appears inside a racing handler. No production file was touched to make
  either pass.
- **Validated 2026-10-21** in the dev container, on the final tree: focused
  `bun test src/utils/{treatment,injury}.test.ts src/utils/injurySurface.test.tsx` → **65 pass / 0 fail**
  (196 `expect()`); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → **exit 0**; `git diff --check` → clean. The full `bun test` suite and
  `bun run build` were **not re-run here** (the sandbox's CPU also runs the preview, so only the
  suites covering this change were run); CI runs both on the pull request.
- **Not automatically verified — the panel in the running hub.** The panel only opens on a live
  injury, and a live injury needs a *duel loss* in App's own flow: the preview session restores the
  account's save and clears browser storage on every fresh load, so a seeded `injury` cannot survive
  the reload the city needs, and no dev harness mounts the city hub. Both services' logic, refusals and
  purity are covered by the suite and the wiring is pinned in source, but the gold deduction, the save
  write and the panel itself through the UI **remain a device check**: lose one duel, walk to the
  Arena Medical House, confirm the 75 g button cures the wound and the stats penalties disappear,
  then take a second injury and confirm a night's rest shows 25 g and takes two fights off the clock.

## S7 — tavern rumours: intel as a service (implemented)

- **One module owns the rules: `src/utils/intel.ts`.** `INTEL_PRICE = 15`, `resolveIntel` (a save with
  no/null/malformed `intel` reads `[]`; unknown ids and duplicates are dropped), `hasIntel`,
  `intelTargets` (roster order, minus what is owned), `getIntelPurchaseEligibility` and
  `purchaseIntel` — pure, a NEW profile, refusals (`unknown-opponent` / `already-owned` /
  `insufficient-gold`) carry no profile, so a refused buy can never reach `saveProfile()`.
  `PlayerProfile.intel?: string[]` is optional exactly like `chariot`/`racing`/`consumables`: nothing
  migrates it and `createNewProfile()` never writes it.
- **INTEL IS INFORMATION ONLY.** No file in the combat path imports `intel.ts`; the write touches
  `gold` and `intel` and nothing else. The tavern panel and the tournament card both say so in words.
- **Wiring:** `App.handleBuyIntel` is the only caller of the purchase (one `setProfile` +
  `saveProfile`) and hands the answer back; `CityHubScene` adds the `intelPanel` view state beside
  `treatmentPanel` (Esc closes it, the primary action is its own while it is up) and opens it for the
  `tavern` location, whose `tabKey: 'stats'` redirect is gone. `TournamentTab` renders the opposing
  dossier only when `hasIntel(profile, opp.id)`.
- **Validated 2026-10-22** in the dev container, on the final tree: `bun test` → **3008 pass / 0 fail
  (103 files)**; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → built + startup asset check passed; `git diff --check`
  → clean.
- **Verified live 2026-10-22** in the preview (anonymous visitor, a gladiator created through the
  real creation screen, oath skipped by holding): quick-travel to the Golden Palm → "Hear Rumors"
  opened the panel listing **8 opponents at 15 g** with the "Information only" line; six purchases
  moved gold **85 → 70 → 55 → 40 → 25 → 10** (exactly 15 each) and removed each bought name from the
  list; at 10 g every remaining row was disabled and the panel printed "Not enough gold. You carry
  10g."; the stored save carried `intel: [opp_marcus … opp_centurion_drusus]`. The Colosseum tab then
  showed rumour blocks on exactly the three tier-1 cards bought (`opp_marcus`, `opp_flaccus`,
  `opp_goliath_boss`) reading `Aggressive fighter · Sword & Shield · STR 8 · AGI 8 · STA 80 · REG 14 ·
  DEF 2 · HP 90`. The bought save was removed afterwards; the browser's storage is cleared per fresh
  load anyway, so a seeded save cannot survive one.
- **Not visually captured:** the card-level screenshot was taken with the Colosseum page at the top, so
  the rumour block's own frame was asserted in the DOM (text and `data-intel` ids) but not seen in a
  capture — a one-glance device check.

## S8 — Spiked & Bladed wheels: the measured fit pass (report only; nothing admitted)

- **The slice was measurement-gated and the measurement FAILED, so the catalogue is untouched.** A full
  record lives in [.base44/wheel-fit-s8.md](.base44/wheel-fit-s8.md); keep S8 detail there. The wheels
  slot still sells exactly `wheels_standard` (0) and `wheels_reinforced` (450), and
  `ChariotWheelVariantKey` still admits only `'standard' | 'reinforced'`.
- **The numbers, re-derived from the shipping kit's own vertices** through the shipped mount (the two
  shipping variants reproduce `getChariotWheelPlacement` to 12 dp, which is the control): spiked
  **radius 0.7940**, tyre bottom **−0.1440** (0.1090 deeper than standard), wheel-Z clearance
  **−0.0090**; bladed **radius 1.0947**, tyre bottom **−0.2429** (0.2079 deeper), wheel-Z **−0.3097**
  — both against a 0.100 rule. Hubs land on (±0.70, 0.65, 0) exactly for both, so the stop is ground
  penetration plus the inner horse's rear envelope, not the mount. The withheld comments' 0.8025 /
  0.8429 were unmeasured guesses; the asset says 0.7940 / **1.0947** (the bladed wheel is 2.19 across,
  60 % larger than the stock 1.37).
- **The reinforced set that ships is already 0.0175 short on the same recomputed rule** — that is the
  recorded fit discrepancy, and it is why the gate is read as diagnostic rather than binary.
- **The bladed set's mirror seam is `scale: [1, 1, −1]` on the right-hand wrapper, i.e. the kit frame's
  Z** (the disc normal, hence the axle after the yaw) — **not X**, which would leave both blades raked
  the same way. Measured on the real vertices: the mirrored side is the left side reflected through the
  chariot's centre plane and the blades' rake sign reverses while its magnitude holds to 1e-6.
- **`src/utils/chariotWheelFit.ts` is the dev-only measuring module** (its own `WheelFitVariantKey`, so
  the catalogue's type is untouched); its only consumer is `components/dev/HorseChariotFitPrototype.tsx`,
  whose `?devHarness=horsefit` screen now carries a wheel-set selector and the fit readout.
  `src/utils/phaseS8WheelFit.test.ts` (21 tests) pins §A the fit, §B the mirror, §C the radius
  consumption trace (one stock radius in `chariotMovement.ts`, a hub-centred workshop mount, a race
  scene that never mounts the kit) and §D report-only.
- **Verified 2026-10-22** in the dev container: `bun test src/utils/phaseS8WheelFit.test.ts` → 21 pass /
  0 fail (217 expect); `bun run scripts/collisionTests.ts` → 123 passed / 0 failed; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 with the startup-asset check passing;
  `git diff --check` → clean. Live in the dev harness: spiked and bladed mounted through the shipping
  transform, the readout printing exactly the figures above (including `mirror right wheel (scale.z −1)`
  for the bladed pair) and the standard set reproducing 0.6850 / −0.0350 / 0.1000 as the control.
- **Not automatically verified — the rendered reading.** The sandbox has no GPU (SwiftShader), so
  whether the spikes and the mirrored blades *read* correctly at a glance is an on-device (Android)
  check. Making either variant shippable needs a ride lift / hub drop of exactly the measured
  penetration, a decision on the horse's rear envelope, and a variant-aware roll radius — none of which
  this slice was authorised to change.

## P3 — chariot catalogue expansion (types + data + resolver; NO UI — implemented, validated)

- **What ships.** `ChariotSlot` widens to `'wheels' | 'finish' | 'axle' | 'harness' | 'chassis'`
  (`src/types/game.ts`); nine parts are APPENDED to `CHARIOT_PARTS` (`src/data/chariotParts.ts`) after the
  six shipped rows, each declaring an inert `raceEffect` of plain numbers; and `resolveChariotLoadout`
  (`src/utils/chariotLoadout.ts`) iterates the catalogue's slot list so a legacy save resolves each newer
  slot to its stock part at READ time. Prices (pinned from the brief): `axle_stock` / `harness_stock` /
  `chassis_stock` free; `axle_ironbound` 260, `axle_bronzehub` 520, `harness_padded` 300,
  `harness_russata` 580, `chassis_reinforced` 350, `chassis_lightweight` 700.
- **The defaults map.** `DEFAULT_CHARIOT_PART_IDS: Record<ChariotSlot, string>` (+ `CHARIOT_SLOTS`) in
  `chariotParts.ts` replaces the resolver's old `slot === 'wheels' ? … : …` branch:
  `{ wheels: wheels_standard, finish: finish_stock, axle: axle_stock, harness: harness_stock,
  chassis: chassis_stock }`. Both are derived from the catalogue, so a future slot needs no resolver edit.
- **Stored shape unchanged — the load-bearing decision.** `ChariotLoadout.equipped` (STORED) is still
  `{ wheels; finish }`; the five-key record is a separate read-side type, `ChariotEquippedResolved`
  (`Record<ChariotSlot, string>`), returned by the resolver as `ChariotLoadoutState.equipped`. No profile
  field was added and the corpus stays green. **Trap found and closed:** `purchaseChariotPart` and
  `equipChariotPart` used to spread `loadout.equipped` into the stored record; with a five-key resolved
  record that would have WRITTEN `axle/harness/chassis` into every save on the next buy or equip. They now
  persist through `storedEquipped()` (wheels + finish only). A mutation that removes it fails
  `phaseP3ChariotCatalogue.test.ts` §D.
- **`owned` keeps its pre-P3 meaning.** The two original stock parts are always owned and the new stock
  parts are implicit — never listed in `owned` — because the pinned corpus assertion
  (`saveCorpus.test.ts` §F) and every purchase/equip test compare `owned` exactly. A paid new-slot part
  still needs to be in `owned` to resolve as equipped.
- **`raceEffect` is inert.** Only `data/chariotParts.ts` names it; `phaseP3ChariotCatalogue.test.ts` §E
  sweeps every non-test module under `src/` (comments stripped) and fails if any other one mentions it or
  reads an effect key. Racing Stage 3 owns consumption.
- **Exclusions held.** No UI (the workshop still queries `chariotPartsBySlot('wheels')` and `('finish')`
  only, pinned in §G — it mentions "axle" in prose about wheel height, so the guard pins the slot QUERIES,
  not the word); the wheels slot is exactly as shipped (no Spiked/Bladed; no 480/620/600/800 price); no
  Triumph banner parts.
- **Existing assertions widened, not weakened.** The old tests pinned a 6-part, 2-slot world:
  `phaseC8_66b` (slot allow-list; resolved `equipped` now carries the three stock ids),
  `phaseC8_67b` (the six shipped price rows are now pinned as a `slice(0, 6)` prefix),
  `phaseS8WheelFit` (15 parts; the wheels/finish rows still exactly 6, wheels still exactly 2) and
  `saveCorpus` (resolved `equipped` includes the stock ids). Every wheels/finish value is still asserted.
- **Corpus note.** `saveCorpus.test.ts` §H pins that ONLY that file imports `saveFixtures`, so the
  corpus-wide P3 checks are `saveCorpus.test.ts` §K (additive), not in the P3 suite — found by the bare
  repo-wide run, which an isolated run of the new suite could not have shown.
- **Verified 2026-10-22** in the dev container: `bun test` → **3067 pass / 0 fail (105 files)** (baseline
  3029 / 104); `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → exit 0, 0 TS errors; `bun run build` → exit 0, startup-asset check passing (8 assets);
  `git diff --check` → clean. Four single-literal mutations (transactions leak the 5-key record; resolver
  iterates only wheels/finish; a price off by 50; production reads `raceEffect`) each fail exactly the
  intended tests, with the files restored byte-identical. **Not verified:** nothing visual — no pixel changes.

## P5 — facility progression (implemented, validated)

- **What shipped.** One optional save field, one pure module and four read-time gates — no screen.
  `src/utils/facilityProgression.ts` follows the `stableProgression.ts` / `racingProgression.ts`
  idiom (catalogue → resolve → eligibility → purchase, a NEW profile on success, a refusal that
  carries no profile): `FACILITIES` (Imperial Stable 500 / 1,200 — Stone Stalls, Stud & Training
  Paddock; Ludus Training Yard 500 / 1,200 — Doctore's Yard, Master's Ludus; Smithing Workshop
  600 / 1,400 — Master's Forge, Imperial Armoury), bought IN ORDER — only the level above the one
  owned is ever offered, so a skipped level is a level that does not exist to buy. The whole ludus
  costs 5,400 gold.
- **The save field.** `PlayerProfile.facilities?: { stable?: number; yard?: number; workshop?: number }`
  (`src/types/game.ts`), optional and **never backfilled**: absent, partial and malformed values all
  resolve to level 0 per building, and `createNewProfile()` still writes nothing. `purchaseFacility`
  is the single writer.
- **The gates are read-time facts, restated nowhere.** `tempering.ts` asks
  `getFacilityLevel(profile, 'workshop')` for temper levels 2–3; `stableProgression.ts` asks
  `getFacilityLevel(profile, 'stable')` for quality grades 2–3 and conditioning levels **4 and 5**
  (both need the L2 paddock); `data/shops.ts`'s `getVisibleStorefrontStock` withholds exactly the
  two `GILDED_FORGE_ITEM_IDS` rows (`chest_champion_gilded`, `helm_champion_gilded`) until workshop
  L2 — the gilded galerus and greaves stay on sale at every level; and the yard sets **stat
  training's price** at a flat 25 / 22 / 20 gold per character level through
  `trainingCost(profile)`, the one call shape in both consumers (`App.tsx`'s `handleTrainStat` and
  `components/hub/TrainingTab.tsx`). A gate outranks the purse and never charges. The buy path
  re-checks the gate: `src/utils/itemPurchase.ts` (`getItemPurchaseEligibility` / `purchaseItem`,
  the `selling.ts` idiom — a new profile on success, a refusal that carries none) is what
  `App.handleBuyItem` now calls, so a stock list cannot be bypassed.
- **Corpus discipline.** The new optional field fired the GC20 tripwire by design: `saveCorpus.test.ts`
  §J's optional-field list ends with `facilities` in `game.ts` declaration order, a **facilities-era**
  fixture (`saveFixtures/facilitiesEraProfile.json`, registered in `saveFixtures/index.ts` and
  `MANIFEST.md`) carries all three buildings at L2 with 600 gold, and every pre-existing fixture still
  resolves as before.
- **Suites.** `src/utils/phaseP5FacilityProgression.test.ts` — §A the catalogue, §B the resolver over
  absent / partial / malformed shapes, §C the in-order purchase with refusals that move nothing and
  frozen-profile purity, §D the four gates, §E the flat 25 / 22 / 20 training price and its
  consumers, §F the two-row Master Forge stock gate, **§F2 the purchase refusal layer**
  (`purchaseItem` refuses a gated row below workshop L2 and an unaffordable one without charging,
  never mutating its input), §G the profile field and the corpus, §H the scope guards (one writer,
  one consumer set, no facility screen yet).
- **Scope guards worth knowing.** §E is a **repo-wide sweep**, not a hand-written list: every
  non-test source file naming `trainingCost` must be exactly `App.tsx`,
  `components/hub/TrainingTab.tsx` and `utils/facilityProgression.ts`, so a new gold sink that
  reaches for the helper fails without the suite naming it. The P2 `laurels.test.ts` §F allowlist is
  untouched — the sweep keeps this suite from writing another module's name.
- **One open design item, deliberately not invented.** The yard L2 brief mentions a "+1
  creation-style point" that no shipped system consumes; nothing implements it, because no system
  reads such a point today. Every price and name lives in `FACILITIES` and every consumer reads the
  constants rather than duplicating a price — change them in the module, nowhere else.
- **Repaired 2026-10-22 (build error this turn).** `src/App.tsx` imported
  `./utils/itemPurchase`, which had never been committed, so the dev server failed to resolve it and
  the app could not render. The module is now written (the pure transaction described above) and
  the P5 suite — which still pinned the pre-update values — was rebased, not weakened: the workshop
  rows 500 / 1,200 → **600 / 1,400** (total 5,400, the frozen workshop purchase 5,000 → 4,400), the
  conditioning table's level 4 **1 → 2** (both levels need the paddock), the 0 / 10 / 25 % discount
  → the flat **25 / 22 / 20** base with a malformed-level case, the four `_gilded` rows → the two
  `GILDED_FORGE_ITEM_IDS` (arms/legs asserted to stay on sale), and `shops.ts`'s gate read
  `gildedUnlocked` → `isItemUnlocked`. **Verified:** `tsc --noEmit` exit 0 (it reported 10 stale-pin
  errors before); the P5 suite 50 pass / 0 fail (331 `expect()`); the repo-sweeping guards
  (`storefrontCatalogue`, `storefrontWiring`, `saveCorpus`, `laurels`, `phaseP3ChariotCatalogue`)
  237 pass / 0 fail; the dev server serves `/src/utils/itemPurchase.ts` and `/src/App.tsx` HTTP 200
  with no further resolve error, and the app boots to the title with 0 console errors and 0 failed
  requests. **Driven live in the preview** (guest profile): market at workshop 0 shows the gilded
  galerus and greaves and **not** the gilded cuirass or galea; buying the 90 g pugio through the real
  button moved gold 100 → 10, added exactly one `dagger_pugio` to a 2 → 3-entry inventory, and
  persisted it to the save key — the `purchaseItem` path end to end. The disposable guest save was
  removed afterwards.
- **Verified 2026-10-22** in the dev container, on the final tree: `bun test` → **3181 pass / 0 fail
  (107 files, 87,044 `expect()` calls)**; `bun run scripts/collisionTests.ts` → **123 passed, 0
  failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 with the startup-asset
  check passing (8 assets); `git diff --check` → clean. **Not verified:** nothing visual — this slice
  ships no screen and changes no pixel, so there is no appearance to accept on device.
- **Six single-literal mutations, each caught (2026-10-22, throwaway harness in `/tmp`, nothing added
  to the repo).** Applied one at a time to `facilityProgression.ts`, reverted and compared
  byte-identical (sha256) before the next: temper L3's workshop requirement 2 → 1 (**2 fails**, §D);
  conditioning's `level === 4 || level === 5` → `level === 5` (**2**, §D); the yard's 20 base → 25
  (**3**, §E); the helm gilded id struck from `GILDED_FORGE_ITEM_IDS` (**1**, §F); `levels[level]` →
  `levels[MAX_FACILITY_LEVEL - 1]`, i.e. a skippable level (**4**, §C); the workshop's L2 price
  1,400 → 1,200 (**2**, §A/§C). Every gate, the price ladder, the in-order rule and the training
  curve therefore fail a test when broken — none is pinned only by agreeing with its own constant.
  Post-restore run: **288 pass / 0 fail** across the five suites the gates reach (P5, P4 stable,
  tempering, storefront wiring, save corpus).

## P6 — progression UI wiring (tempering, chariot slots, stable, facilities) — implemented, validated

- **What shipped (surfaces only; every transaction still lives in `App`).** The four progression
  slices that had shipped data + pure logic and no screen now have one each:
  `components/hub/TemperControl.tsx` (mounted on BOTH Armory cards — weapon and armour — through
  `GearTab`'s one `onTemperItem` callback); `ChariotWorkshopTab` renders one section per
  `CHARIOT_SLOTS` entry from `chariotPartsBySlot`, with a Preview control only on the parts the 3D
  kit can show (`part.wheelVariant !== undefined || part.finish !== undefined`); `StablePanel.tsx`
  mounted in `RacingConfigSection` under the team cards; `FacilitiesPanel.tsx` mounted in
  `GladiatorSchoolHub` above every tab. `ChariotLoadout.equipped` widened to
  `Partial<Record<ChariotSlot, string>>` (`storedEquipped()` persists only non-stock slots), and
  `ownsChariotPart` treats the new stock axle/harness/chassis as implicitly owned, so a legacy save
  still stores nothing.
- **The rule the suite pins: a surface DERIVES, `App` WRITES.** Every price, cap, gate and refusal
  sentence is read from the owning module (`getTemperCost`, `TEMPERS_MAX_LEVEL`,
  `getStableQualityEligibility`, `nextConditioningCost`, `getFacilityUpgradeEligibility`, …); no
  surface names `saveProfile`, `localStorage` or `setProfile`, and no surface restates a catalogue
  price. `src/utils/phaseP6UiWiring.test.ts` (19 tests) holds both halves, plus save/load round
  trips for a five-slot non-stock chariot.
- **Three test-side corrections this pass — each determined by the shipped data, none by weakening a
  check.** (1) The stable refusal case assumed grade 1 costs 500; the catalogue's `STABLE_QUALITIES`
  says **400**, so the test now reads `getStableQuality(1).price` and asserts one gold short fails
  and exactly the price succeeds. (2) The "no surface re-states a price" sweep flagged `300` inside
  the workshop's `text-amber-300` Tailwind token, so it now matches a **standalone** number
  (`(?<![\w-])300(?![\w-])`) — a class token is not a price, a literal is. (3) `phaseC8_67c`'s
  `RacingConfigSection` guard pinned its exact import list; P6 legitimately adds
  `./StablePanel`, so that list gained the entry with a comment naming this phase. The P6 suite also
  needed the repo's `// @ts-ignore — bun:test is available at runtime via bun test` line above its
  `bun:test` import, which is what made `bun run lint` exit 0 again.
- **Verified 2026-10-23** in the dev container, on the final tree: `bun test` → **3207 pass / 0 fail
  (108 files, 87,136 `expect()` calls)**; `bun run scripts/collisionTests.ts` → **123 passed, 0
  failed**; `bunx tsc --noEmit` → **exit 0**; `bun run build` → exit 0 with the startup-asset check
  passing (8 assets); `git diff --check` → clean.
- **Live evidence (preview browser, anonymous visitor — no session replayed, so the run used the
  app's own guest path and wrote the guest profile it normally writes).** Driven through the real
  route — title → `Play` → creation → `Apply Points` → the camp: `LUDUS FACILITIES` renders all three
  buildings at `LV 0 / 2` with the catalogue's own next rung and price (500 / 500 / 600) and a
  disabled BUILD plus "Not enough gold." on a 100-gold profile; the Armory carries **2**
  `[data-temper-level]` rows (weapon and armour); the Chariot Workshop subview opens and the stable
  panel below it mounts with `data-stable-quality="0"`, `data-stable-conditioning="0"`,
  `data-conditioning-price="120"`, both actions present, the refusal `data-stable-rejection` on both,
  and its own copy reading `Next: Trained Team · 400 Gold` — i.e. the 400 my corrected test now
  reads. `scrollWidth === clientWidth` at 1280, 0 console errors.
- **Not automatically verified.** (a) **Buying through the UI** — every paid rung costs more than the
  guest profile's 100 gold, so only the refusal paths were exercised; the transactions themselves are
  pinned by the phase suites and the P1/P4/P5 suites they build on. (b) **The stable panel's position
  under the team cards** — pinned by source contract in the suite, not read from the live DOM in that
  run. (c) The panels' rendered look on the target device (SwiftShader here, ~2 fps in the 3D hub),
  together with the device checklist this file already carries.

## P-BANNER — Triumph banner set, priced in FAME (implemented)

- **One catalogue row, and the design's one deliberate currency extension.** `finish_triumph_banners`
  is a finish-slot cosmetic in `CHARIOT_PARTS` (finish key `triumph`: bleached ash wood, oxblood hide,
  gilded bronze). Its row names `currency: 'fame'`; every other row omits the field, which means gold —
  `chariotPartCurrency(part)` is the single reader of that default, so a gold part behaves exactly as
  it always has (the sweep in `phasePBannerTriumphSet.test.tsx` pins that this stays the only fame row).
- **Price: 500 FAME.** The design lists the set among the §3.6 fame sinks but never prices it (titles
  300 / 800 / 2,000 + statue 1,200 = 4,300); 500 is the director's ruling for this slice and the suite
  pins the literal `500`, not a value read back from the catalogue.
- **`purchaseChariotPart` spends the row's own currency.** A fame row deducts from `profile.fame` and
  leaves `gold` byte-identical (and a gold row leaves `fame` byte-identical); the refusal is
  `insufficient-fame` and, per the house idiom, returns **no profile at all**, so a short balance can
  never reach a writer. Malformed (`NaN` / `Infinity` / missing) fame affords nothing. `App`'s
  `handleBuyChariotPart` still holds no currency logic — it persists what the transaction returns.
- **Ownership stays in the one chariot record.** No second storage key and no second ownership field:
  the Triumphs page only READS the set through `ownsChariotPart` and offers no buy control — the
  Chariot Workshop is the only seller, through the existing data-driven finish section.
- **The workshop reads, never restates, the currency.** Badge and buy button print `${price} Fame` with
  a violet palette (`text-violet-300 bg-violet-950/70 border-violet-700`) where gold rows keep
  amber/yellow, and the refusal sentence is `Insufficient fame` (`Not enough fame.` on the button).
- **Verified 2026-10-23** in the dev container on the final tree: `bun test` → **3224 pass / 0 fail
  (109 files, 87,315 `expect()` calls)**; `bun run lint` (`tsc --noEmit`) → **exit 0**; `git diff
  --check` clean. **Live evidence** (preview browser, anonymous visitor): driven through the app's own
  guest route — title → `Play` → `Apply Points & Enter Metropolis` → city hub `Armory` → `Chariot
  Workshop` — the finish section renders **Triumph Banners** with a violet `500 Fame` badge (computed
  `oklch(0.811 0.111 293.571)`) beside the unchanged gold rows (`450 Gold` at
  `oklch(0.852 0.199 91.936)`), the card's state line reads **Insufficient fame** and its buy button is
  **disabled** reading **Not enough fame.**; `scrollWidth === clientWidth` at 1280. The console shows
  only the pre-existing React unmount warning recorded elsewhere in this file. The guest save the walk
  wrote was removed afterwards.
- **Not automatically verified.** (a) **The fame purchase CLICK** — the preview profile carries 0 fame
  and the preview session replays its own save on every fresh load, the same limit C-8.66B recorded for
  gold; the transaction, both refusals, the idempotence and a real `saveProfile()` / `loadSavedProfile()`
  round trip are pinned by `src/utils/phasePBannerTriumphSet.test.tsx`. (b) The set's **rendered
  appearance on the chariot** (the `triumph` finish's three material overrides) — SwiftShader only
  here, so it needs the on-device look. (c) The Triumphs page row, verified by markup assertions (it
  only appears once the set is owned, which the guest profile never is).

## CH-1 — Armatura & palmae data (implemented, data only)

- **What shipped, and what deliberately did not.** The seven classes and the sixteen
  palmae as data, two optional profile fields, and the pure read model a later
  combat slice will consume. **No combat, `DuelScene`, `App.tsx`, storage behaviour
  or UI changed**, `createNewProfile()` writes neither field (they are written only
  by later successful actions, exactly like `racing`), and the only `itemsDB.ts`
  edit is the trident's display name (`Barbed Retiarius Trident` → `Retiarius
  Trident`; id, stats and array order untouched — `ALL_WEAPONS[2]` is still the
  spare starter weapon).
- **The type seam** (`src/types/game.ts`): `ArmaturaId` (the seven ids),
  `PalmaeState { unlocked?, equipped? }`, and `PlayerProfile.armatura?` /
  `PlayerProfile.palmae?` appended last, so GC20 §J's optional-field list ends
  `…, 'facilities', 'armatura', 'palmae'`. No save-version field was added; no
  existing field or type changed.
- **`src/data/armaturae.ts`** — `ARMATURAE` (id, name, fantasy, stat template,
  doctrina, starting kit, `forgeKit: 'kit_<id>'`), `ARMATURA_IDS`,
  `DEFAULT_ARMATURA_ID` (`murmillo`), `getArmatura`, `isArmaturaId`. Kits:
  murmillo/secutor/provocator `gladius_standard`; retiarius `trident_retarius`
  equipped + `gladius_standard` carried; thraex `shamshir_curved` (the file's only
  curved `sword_shield`); hoplomachus `hoplite_spear`; dimachaerus
  `dual_sicae_daggers` + `dagger_pugio` (two `dual_blades`-family items, one
  equipped, one carried).
- **Doctrinae — block-expressible vs noted.** `onBlockStamina: 6` (murmillo),
  `staminaCostMult: 0.85` (secutor), `damageTakenMult: 0.92` (provocator) live in
  `doctrina.modifiers`. Retiarius (net), thraex (`blockPenetration 0.40`),
  hoplomachus (distance-band damage) and dimachaerus (twin strike) carry empty
  blocks with the magnitude/condition named in `doctrina.notes` — no new formula
  hook was invented.
- **`src/data/palmae.ts`** — `PALMAE` (16), `PALMAE_PLAYER_POOL` (12, derived by
  filtering), `PALMAE_BOSS_ONLY` (4), `getPalma`. Each row carries `id` (snake_case
  from the name), `name`, `description`, `source` + `sourceDetail`, `hookStages`,
  an `effect: TraitModifierBlock`, and `notes` for what the block cannot hold.
  `bossOnly` rows are structurally excluded from the pool (tested), and
  `resolvePalmae` also drops them from a hand-edited save.
- **`src/utils/traitModifiers.ts`** — `TraitModifierBlock` (the design §2.4 field
  set; `statFlat {str,agi,sta,def}`), `mergeModifiers`, `applyBlockReduction`,
  `BLOCK_REDUCTION_CAP` (0.90), `MAX_EQUIPPED_PALMAE` (3), `resolvePalmae`,
  `resolveArmatura`. Merge rules: adds add, multipliers multiply, `statFlat` adds
  per stat, `comboShield` ORs, and the pooled `blockReductionAdd` is clamped to
  0.90 — `applyBlockReduction(base, add)` is the call-site half that clamps the
  weapon's own base plus the add to the same 0.90. `resolvePalmae` accepts the
  profile or the raw record, reads absent/null/garbage as
  `{ unlocked: [], equipped: [] }`, keeps only strings the player pool offers,
  de-duplicates, filters `equipped` to `unlocked` and caps it at 3.
  `resolveArmatura`: explicit valid `armatura` wins, else `characterModel`
  `retiarius` / `dimachaerus`, else `murmillo`.
- **Findings (effects the block shape cannot express):** the retiarius net and
  dimachaerus's twin strike are stateful; thraex's 0.40 block penetration has no
  field at all; hoplomachus's distance-band damage is a table, not a multiplier;
  secutor's stamina discount is power-attack-only and its entangle immunity has no
  field; provocator's and Viper's Patience's per-attack-type / post-counter
  conditions ride as notes; Pyre Brand's heal and Pit Bellower's stamina drain
  have no field either. `Heavy Hand` keeps its two multipliers but notes the
  power-attack restriction. All fifteen other effects are fully expressible.
- **Corpus (GC20-X style).** New fixture `armatura-palmae`
  (`armaturaPalmaeProfile.json`) — the `facilities-era` save plus `armatura:
  "retiarius"` and `palmae { unlocked: [iron_lungs, second_wind], equipped:
  [iron_lungs] }` — registered in `saveFixtures/index.ts`, added to
  `REQUIRED_FIXTURE_IDS` (count now 17) and documented in
  `saveFixtures/MANIFEST.md`. `saveCorpus.test.ts` now drives `resolveArmatura` /
  `resolvePalmae` from `driveEveryResolver`, asserts their shaped state per
  fixture, their absent-field defaults in §E and the new fixture's own values in
  §F, and §J's expected optional list gained exactly `'armatura'`, `'palmae'`
  (both also added to §J's with/without-fixture loop). No §J assertion weakened.
- **Tests:** `src/utils/traitModifiers.test.ts` (46 tests / 7 sections) — resolver
  defaults on undefined/garbage, the 3-cap and unlocked filter, unknown/boss-only
  dropping, purity, merge identity + arithmetic + the 0.90 cap +
  `applyBlockReduction`, the `resolveArmatura` table, all seven classes (stats,
  fantasy, doctrinae, kit ids verified against `itemsDB`, retiarius/dimachaerus
  kit rules, Forge kit names), all sixteen palmae (snake_case ids, 12/4 split,
  boss-only never in the pool, every effect magnitude), and a pre-CH-1 save
  (`createNewProfile` → `saveProfile` → `loadSavedProfile`) resolving to Murmillo +
  empty palmae with no console errors.
- **Verified 2026-10-23** in the dev container on the final tree: `bun test` →
  **3277 pass / 0 fail (110 files, 87,861 `expect()` calls)**; `bun run
  scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup
  asset check passing (8 assets); `git diff --check` → clean. The corpus suite
  gained the new fixture's five per-fixture cases plus one §F case, and this slice
  adds one test file and one fixture.
- **Not attempted, and why:** no preview/visual check — this slice changes no
  rendered pixel, no route and no interaction, so there is nothing on screen to
  accept. The dev server still serves the shell (HTTP 200) and the build is clean.

## CH-2 — creation & roster wiring (armatura picker, templates, legacy re-pledge)

- **What ships.** The seven classes are now chosen at creation, the choice sets the stat
  template the ten points are spent on, the class kit replaces the one-size starter for NEW
  profiles, and a legacy save can re-pledge its inferred class once. Five production files:
  `utils/characterCreation.ts` (new — the pure creation write path + the two picker reducers),
  `utils/armaturaPledge.ts` (new — the one-time re-pledge), `components/hub/CharacterCreation.tsx`
  (the seven-card picker), `components/hub/StatsTab.tsx` (+ hub/App prop chain), `services/storage.ts`
  (the factory's optional class argument). Three suites: `characterCreation.test.ts`,
  `armaturaPledge.test.ts`, `armaturaSurface.test.tsx`.
- **The creation write path is pure and shared.** `buildCreatedProfile({name, appearance, armatura,
  allocation})` is what `onComplete` receives and what the screen's live derived preview runs
  `calculateTotalStats` on; `baseStats` = the class template + the points SPENT (the allocation is
  held as deltas, so the template IS the per-stat floor and the pool is still ten). The profile is
  written WITH `armatura` and never with `palmae`. Retiarius pins: 9/13/11/1, trident equipped,
  gladius carried, HP 119 from the base stats alone (135 once the trident's +4 STR is counted —
  `calculateTotalStats` reads equipment, which is why the two numbers differ).
- **The factory's argument.** `createNewProfile(name, model = 'roman_warrior', armatura?)`:
  with NO argument the output is byte-identical to pre-CH-2 (the frozen `PRE_CH2_FACTORY_JSON`
  literal in `characterCreation.test.ts` compares the serialised bytes, including key order), and
  an unknown id writes nothing. With a valid id it writes that class, its template and its kit, so
  the added keys are exactly `armatura` and the class values.
- **The re-pledge.** `withArmaturaPledge(profile, id)` returns a NEW profile whose only difference
  is `armatura` (nested objects are shared references) and refuses `already-pledged` /
  `unknown-armatura` / `no-profile` with no profile at all. `App.handleRepledgeArmatura` is the only
  caller and the only save writer; `StatsTab` offers it only while `canRepledgeArmatura(profile)`
  AND a handler is wired, so an explicit class hides it. No other existing-profile field is written.
- **Picker independence.** `selectArmatura` moves the look only to the class's natural model
  (retiarius / dimachaerus) while `modelPicked` is false; `selectCharacterModel` only sets the look.
  Verified live: choosing Retiarius suggested its rig, then choosing Amazonian kept the class.
- **Not touched:** `createNewProfile()`'s no-argument shape, the ten-point pool, `calculateTotalStats`'
  formula, combat, Lefty mode, the save key, `palmae`, and every existing profile's stats/gear/gold.
- **Verified 2026-10-23**: `bun test` → **3313 pass / 0 fail (113 files, 88,238 expect())**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0 (startup check, 8 assets); `git diff --check` → clean.
- **Preview evidence (anonymous visitor, 0 console errors).** Through the real UI: the picker renders
  seven cards with Murmillo selected (Health 152 · Stamina 120); choosing Retiarius moved the derived
  read to **135 · 125** and the rig label to The Retiarius; choosing Amazonian left the class card
  selected; +1 STR read **139 · 125** with 9 points left; finishing persisted
  `armatura: "retiarius"`, `baseStats {10,13,11,1}`, the trident equipped, the gladius carried,
  `unspentStatPoints: 9`, no `palmae`. A second creation (Murmillo) was carried through the oath into
  the hub: Gladiator Stats rendered `data-armatura="murmillo"` / `data-doctrina="fish_scale_wall"`
  and offered **no** re-pledge. Both preview saves were deleted afterwards.
- **NOT automatically verified:** the re-pledge button in a running hub (it needs a save with no
  `armatura`, and a seeded save does not survive this environment's fresh load — server-rendered
  `armaturaSurface.test.tsx` covers the offered/hidden states); the class cards' rendered look,
  touch feel and landscape framing on the target device (SwiftShader here — **visual acceptance
  defers to Walter's Android device**); and the class-argument factory path, which no production
  caller passes yet (the Google/cloud new-profile path is its intended consumer).

## CH-3a — combat plumbing (palmae + passive doctrinae through the hooks; NO new action)

- **What ships.** One merged block per fighter, read at every combat stage. New
  `utils/combatModifiers.ts` (the block builders plus one pure helper per stage);
  `utils/combatCalculations.ts` gains ONE optional trailing parameter and ONE helper;
  `services/storage.ts` folds the stat stage; `components/duel/DuelScene.tsx` resolves with it;
  `components/ui/CombatHUD.tsx` + `TurnActionPanel.tsx` estimate with the SAME block objects;
  `types/game.ts` adds `MirrorDrillLedger` / `FighterState.mirrorDrillTypes` (runtime only, never
  saved). Suites: `combatPlumbing.test.ts` (64 tests) and three CH-3a assertions in
  `scripts/combatTests.ts`.
- **The formulas are frozen.** No constant in `combatCalculations.ts` changed and no stage moved:
  `calculateAttackDamage` gained a trailing `traitMult: number = 1.0` multiplied at the rage stage
  (`rawDamage = base × strBonus × critMult × rageMultiplier × traitMult`), and `applyPalmaEvent`
  sits beside `applyComboEvent`. The default is the identity, so every pre-CH-3a expectation and
  every fixed-seed trace reproduces exactly (§R of the suite pins both).
- **The block.** `buildPlayerModifiers(profile)` = `mergeModifiers([...equipped palma effects,
  class doctrina])`, read through the SAME resolvers the save uses, so locked/boss-only palma ids
  never arrive. `buildOpponentModifiers(config)` is deliberately tolerant (a bare id list or the
  save's `{equipped: [...]}`, unknown ids dropped, three max) because **opponent `armatura`/`palmae`
  do not exist until CH-4**: every opponent resolves to the empty block today, which is the
  identity. `DuelScene` builds both ONCE per duel with `useMemo` and hands the same objects to the HUD.
- **Stage order, and where the conditions live.** Weapon: `staminaCostMult` is a POWER-attack
  discount only (secutor 0.85 × Heavy Hand 0.90), `blockReductionAdd` capped at 0.90, and the
  thraex's 0.40 block penetration (CH-1 could only record it in `notes`) keeps `(1 − 0.40)` of a
  block. Hit: effective AGI = AGI + `hitAgiAdd`; crit = 0.25 + `critChanceAdd`, capped at 0.60.
  Evasion: `passiveEvadeAdd` applies only OUT of the dodge stance (`isInvulnerable`) and the draw is
  skipped at 0, so a fighter with no palma consumes exactly the same randomness as before. Damage:
  attacker `damageDealtMult` ÷ defender `damageTakenMult`, passed as `traitMult`. Conditions a
  `TraitModifierBlock` cannot express are evaluated at the call site: health thresholds (Executioner
  <25 % target, Blood Price <40 % self), the boss flag (Colossus Bane), quick-vs-power (Heavy Hand,
  Colossus Hide), Mirror Drill's per-type ledger (`recordHitType`: the first hit of a type at full
  damage, later ones ×0.92) and the hoplomachus distance bands (§2.2 exactly: outer third of reach, ratio ≥ 2/3 → ×1.15; inside half reach, ratio < 0.5 → ×0.90; the span between is neutral → ×1.00 — there is no middle modifier. **Corrected after review:** the slice first shipped an invented table (0.75 → 1.15, 0.45 → 1.05, else 0.90), which drifted on all three boundaries; `spearmansGroundMult` now pins 0.49 → 0.90, 0.50 → 1.00, 0.66 → 1.00, exactly 2/3 → 1.15 and 0.75 → 1.15 in §P of the suite).
  Viper's Patience stays inert — it needs the counter state CH-4 lands.
- **The event stage.** `applyPalmaEvent(block, event)` returns data only; `DuelScene` owns the clamp,
  the hype update and the once-per-fight flag. Block → `onBlockStamina` (Fish-Scale Wall +6), rest →
  `restStaminaAdd` (Second Wind: 40 + 15), taunt (+20 base) and crit → `hypeAdd` (First Palm +4),
  miss → `comboShield` (Phoenix Nerves, guarded by a ref).
- **The stat stage.** `calculateTotalStats` folds `statFlat`, `healthMaxAdd`, `staminaMaxAdd` and
  `staminaRegenAdd` right after the equipment bonuses and BEFORE the injury penalty, through the same
  `buildPlayerModifiers` the duel reads. With no palmae every term is the identity — the suite pins
  the output against the pre-CH-3a numbers byte for byte, and no CH-1 doctrina carries a stat-stage
  field, so legacy saves read exactly as before.
- **HUD parity by construction.** `TurnActionPanel` receives `playerModifiers` / `opponentModifiers`
  through `CombatHUD` and calls `staminaCostWithModifiers`, `hitAgilityFor`, `resolveTraitMult` and
  `blockReductionFor` — the raw-field estimates (`getStaminaCost(weapon, …)`,
  `Math.round(weapon.blockReduction * 100)`) are gone, so an estimate cannot drift from resolution.
- **Not touched:** the duel's action set (still the same nine), every formula constant, the save shape
  and key, boss passives, and the AI branch, which still picks with the raw stamina costs.
- **Verified 2026-10-23 (inside the compose `web` service — bun is not on the sandbox host, so use
  `docker compose -f docker-compose.base44.yml exec web …`):** `combatPlumbing.test.ts` → **64 pass /
  0 fail**; the combat-related subset (`traitModifiers`, `characterCreation`, `saveCorpus`, `injury`,
  `consumables`, `phase36`, plus the above) → **345 pass / 0 fail (2,700 expect())**;
  `scripts/combatTests.ts` → **67 pass, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0;
  `bun run build` → exit 0 (startup check, 8 assets).
- **Preview evidence:** the title screen loads with **0 console errors** at this commit.
- **NOT automatically verified — no duel was driven live this slice.** A palmae-equipped corpus
  fixture (`armaturaPalmaeProfile.json`, retiarius + Iron Lungs) was seeded into
  `sand_and_steel_gladiator_save_v2` and was gone by the next call — the app's own save validation
  discards it — so the hub never carried palmae and neither the palmae-equipped stat readout nor a
  palmae duel could be exercised. The stage arithmetic, the fixed-seed traces and the wiring are
  covered by the suites above; the arena's feel with palmae equipped, and its render on the target
  device, defer to manual play. Nothing was left behind: no save key remained in the preview.

## CH-4 — opponents & ladder (identities, boss palmae, four new rivals)

- **What ships.** `OpponentConfig` gains two optional fields — `armatura?: ArmaturaId` and
  `palmae?: string[]` (`types/game.ts`) — and `data/opponents.ts` uses them. No second resolver was
  written: CH-3a's `buildOpponentModifiers` already read exactly these two keys off a config
  (tolerant: a bare id list or `{equipped: […]}`), so it needed only its stale "do not exist until
  CH-4" doc comment replaced. `DuelScene` builds that block once per duel with `useMemo`, and it now
  carries a class and palmae for the AI, the doctrina branches and the HUD.
- **The roster's identities.** Every existing config keeps its id, name, tier, stats, rewards,
  weapon, personality and difficulty exactly; the only additions are the two new fields.

  | opponent | tier / rung | armatura | palma | doctrina / boss mechanic |
  |---|---|---|---|---|
  | Marcus the Rookie | 1 / 1 | `murmillo` | — (tutorial) | — |
  | Flaccus the Nimble | 1 / 2 | `thraex` | `sand_sprinter` | 0.40 block penetration |
  | Goliath the Pit Behemoth (BOSS) | 1 / 3 | `provocator` | `pit_bellower` | Mirror Drill + bellow drain |
  | Cassius the Phalanx | 2 / 1 | `hoplomachus` | `shieldwall_discipline` | Spearman's Ground |
  | Ignis the Pyre Champion (BOSS) | 2 / **4** | `dimachaerus` | `pyre_brand` | Twin Fangs + phase-switch heal |
  | Centurion Drusus | 3 / 1 | `murmillo` | `iron_lungs` | — |
  | Valéria the Viper Queen (BOSS) | 3 / **4** | `retiarius` | `vipers_patience` | net + counter bonus |
  | Aurelius the Invincible Titan (BOSS) | 4 / 1 | `murmillo` | `colossus_hide` | quick-attack mitigation |

- **Four new rivals, appended inside their tier** (`fightIndex` is ordering/display only): tier 2
  = Cassius (1) → **Brutus "The Anvil"** (2, `provocator`, Mirror Drill) → **Naija the Fisher**
  (3, `retiarius`, the CH-3b net) → Ignis (4); tier 3 = Drusus (1) → **Kallias of Sparta** (2,
  `hoplomachus`, Spearman's Ground) → **The Pale Twins** (3, `dimachaerus`,
  `characterModel: 'dimachaerus'`, one config fought as a single opponent) → Valéria (4). None
  ships a `loadout`, so each resolves its weapon through `getWeaponByType` as every other config
  does.
- **Director ruling — Ignis and Valéria move `fightIndex` 2 → 4, and that is the only rung change
  in the roster.** The six other pre-existing rungs are untouched (Marcus 1, Flaccus 2, Goliath 3,
  Cassius 1, Drusus 1, Aurelius 1; the Doctore's 0 means "no rung"). Safe because **tier
  advancement keys on boss identity, not on the rung** — the unlock reads `isBoss` plus
  `defeatedOpponentIds`, so no save's progress changes meaning (§D of the suite pins it against
  the real `tierAdvancement` / `intel` helpers).
- **`utils/bossPalmae.ts` (new) owns the two event-shaped boss palmae's magnitudes and clamping**,
  so the mechanic sites stay a call and the arithmetic stays testable without a browser.
  `PIT_BELLOWER_STAMINA_DRAIN` = 8 stamina; `PYRE_BRAND_HEAL_FRACTION` = 0.1 (rounded to a whole
  point, as every health value in the duel is). `applyPitBellowerDrain` floors at 0;
  `applyPyreBrandHeal` caps at `healthMax`; a non-boss can never reach either, because `bossOnly`
  rows are structurally excluded from non-boss configs (§A asserts that sweep).
- **The four boss palmae, at their existing mechanic sites — palmae ADD, nothing was replaced.**
  1. **Pit Bellower** (Goliath) — the `heavy_telegraph` announce branch in `executeCombatTurn`
     drains 8 stamina from the defending side and logs it. The telegraph, the pending heavy and its
     landing are untouched.
  2. **Pyre Brand** (Ignis) — inside the `phase_weapon_switch` effect, after `phaseSwitchedRef` is
     set, the boss heals 10 % of maximum health. "Once per fight" IS that ref: it is set before the
     heal and the effect returns early while set. `opponentMods` joined the effect's dep array.
  3. **Viper's Patience** (Valéria) — CH-3a shipped the row inert (`() => false`). The AI's
     `counter_dodge` branch now sets `counterStrikeRef`; `executeCombatTurn` read-and-clears it into
     the new `DamageContext.isCounterAttack` exactly as `telegraphLandingRef` works, so the +20 %
     lands on that one resolution and on nothing else (a miss or evade cannot carry it forward).
  4. **Colossus Hide** (Aurelius) — no new site needed: it is a `damageTakenMult` already evaluated
     in `damageTakenMultiplier` for quick attacks only, which CH-3a shipped.
- **Regression suite: `src/utils/opponentsLadder.test.ts`** — 36 tests across 7 sections: §A the
  config shape and the structural sweep (palma ids are real rows, no non-boss carries a boss
  mechanic or a boss-only palma, one boss-only palma per boss, no opponent hands out Lefty mode);
  §B the eight originals frozen against their pre-CH-4 values plus the Director ruling
  (`fightIndex` 2 → 4 and nothing else); §C the ladder order, the four new rivals' identities, and
  `PRIMUS_PALUS_LADDER` still the whole roster tier-then-rung; §D old saves (same ids, same
  advancement); §E every new config's weapon resolving through `getWeaponByType`; §F the new
  classes reaching the CH-3a stage helpers through `buildOpponentModifiers`; §G each boss palma
  firing at its own site, never on a non-boss, plus a source read showing `DuelScene` calls each
  helper at the intended branch. `combatPlumbing.test.ts` went 64 → 65 for `isCounterAttack`.
- **Verified 2026-10-24** in the dev container
  (`docker compose -f docker-compose.base44.yml exec web …`): `opponentsLadder` → **36 pass /
  0 fail**, `combatPlumbing` → **65 pass / 0 fail**, the roster-dependent suites (`bossKills`,
  `intel`, `intelSurface`, `injurySurface`, `phase37`, `roadMilestones`, `roadOfGlory`,
  `saveCorpus`, `sellingSurface`, `storyChapterOne`, `storyState`, `tierAdvancement`) → **383
  pass / 0 fail (11 files)**, `scripts/combatTests.ts` → **67 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (startup check, 8 assets);
  `git diff --check` → clean.
- **Not automatically verified — no boss fight was driven live.** The sandbox preview has no GPU
  (SwiftShader) and the dev harness's duel is hard-wired to `ALL_OPPONENTS[0]` (Marcus, no palma),
  so Goliath's drain, Ignis's heal and Valéria's counter bonus could not be exercised in the arena
  here. Their arithmetic and clamping are covered by the pure helpers and the suites above; the
  on-device feel of the four boss palmae defers to manual play. Nothing is persisted by any of
  this: the modifiers live in `useMemo` for the duel's lifetime only.

## CF-3 — the crowd reacts to hype (implemented, validated; device feel PENDING)

- **The tier rule is CombatHUD's, not a second one.** `src/utils/crowdHype.ts` (new, pure,
  dependency-free) reads `> 75 → MAX` / `> 40 → HIGH` — both STRICT, exactly
  `CombatHUD`'s `crowdHype > 75 ? 'MAX' : crowdHype > 40 ? 'HIGH' : 'LOW'`. So hype **40 is still
  LOW and 75 is still HIGH**: an upward crossing fires on the value that PASSES the boundary
  (41 / 76), and the crowd and the meter change together. The suite reads the HUD expression from
  its source, so the two cannot drift.
- **The one detection point is inside `DuelScene`'s existing `updateCrowdHype`** — the only place
  hype changes. It reads the previous value (already mirrored in `crowdHypeRef`), calls
  `detectCrowdHypeCrossing(prev, next)` and, on a crossing, `sounds.setCrowdLevel(level)`; on an
  UPWARD crossing it adds `sounds.playCrowdSwell()` and `crowdPulseRef.current += 1`. Downward
  crossings only set the level (no swell, no bounce). **No hype value, award site or
  `combatCalculations.ts` line changed** — 18 / 8 / 20 / TWIN_FANGS / the 25 seed are byte-identical.
- **`src/audio/soundEffects.ts` gained the bed**: one looping 2 s generated brown-noise
  `AudioBufferSourceNode` → 500 Hz lowpass `BiquadFilter` → **level gain** → **swell gain** →
  destination. Two gain nodes, not one, so a 0.4 s tier ramp and a 350 ms swell never cancel each
  other's automation. `CROWD_BED_GAINS` = **0.015 / 0.04 / 0.075** with 0.4 s ramps;
  `playCrowdSwell()` is 1.8× for 350 ms. `startCrowdBed` is idempotent and no-ops while muted;
  `toggleMute` now tears the bed down (keeping it "wanted") and restores it on unmute; the bed is
  started at the opening tier (hype 25 = LOW) on `DuelScene` mount and stopped on unmount.
- **The arena bounce owns `position.y` of ONE group.** `DuelArena` wraps both 56 spectator meshes in
  a single `<group ref={crowdGroupRef}>`; a `useFrame` advances `stepCrowdBounce` with the frame
  delta and writes only that group's `position.y`. The curve is 600 ms, two hops, first hop's crown
  exactly **0.12** at 150 ms, second 0.042 at 450 ms, exactly 0 elsewhere. The `crowdPulseRef` prop
  is optional, so an arena without a duel never celebrates. Walls, cavea, braziers, loge and gates
  are outside the group and unmoved.
- **Regression suite: `src/utils/crowdHype.test.ts`** — 38 tests / 16,158 `expect()` calls: §A the
  tier reading and crossings (including the no-event-at-the-boundary cases from both sides), §B the
  gain table and the bed's whole lifecycle against a recording fake `AudioContext` (one shared
  context — two engine instances build two contexts and read the wrong one), §C the bounce curve and
  the pulse step, §D the scene wiring plus the byte-identical hype numbers, §E the arena's structure
  (one group, balanced tags, one `position.y` assignment, unchanged geometry).
- **Two production defects found by the suite and fixed, not worked around**: the first bounce curve
  normalised by the sine crown and actually peaked at **0.1226** (now each hop is its own half-sine
  scaled by `CROWD_BOUNCE_HOP_DECAY`, so the peak is exactly the design's 0.12); and
  `setCrowdLevel`'s "clamp" was a whitelist that mapped 7 → LOW (now it saturates to the nearest
  tier).
- **Verified 2026-10-24** in the dev container, the full battery on the final tree: `bun test` →
  **3530 pass / 0 fail (118 files, 106,201 `expect()`)**; `bun run scripts/collisionTests.ts` →
  **123 passed, 0 failed** (exit 0); `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` →
  exit 0 with the startup-asset check passing (8 assets); `git diff --check` → clean.
- **Not automatically verified — the crowd's feel, and that is a device question.** The sandbox has
  no GPU (SwiftShader) and no way to capture Web Audio, so **browser preview proves nothing about
  the crowd feel on a real device**: whether the 0.12 bounce reads as a surge rather than a jitter,
  whether the bed is audible under combat at 0.015/0.04/0.075, whether the swell is a swell and not
  a clip, and how tier-up feels on a phone's speakers. That acceptance is Walter's Android device
  check. The suite pins the arithmetic; it cannot pin the feel.

## CF-4 — impact particles (sparks + sand), pooled (implemented, validated; device feel PENDING)

- **What ships: one new component and one file's wiring.** `src/components/3d/ImpactParticles.tsx`
  (new) and `src/components/duel/DuelScene.tsx` (an import, one `useRef`, one mount inside the
  existing `Suspense`, and three `burst()` calls). `src/utils/impactParticles.test.ts` (new, 41
  tests) + this note. **No combat outcome, timing, formula, `combatCalculations.ts`, `GladiatorMesh`,
  handedness, save field or dependency was touched**, and the component is imported by `DuelScene`
  alone (asserted over the whole tree), so nothing renders outside the duel.
- **The budget is exact: ONE `THREE.Points` = +1 draw call.** 128 pre-allocated particles in one
  `BufferGeometry` with only `position` + `color` (no index), one `PointsMaterial` (`size` 0.06,
  `sizeAttenuation`, `vertexColors`, `AdditiveBlending`, `depthWrite: false`, `transparent: true`),
  rendered as a single `<primitive object={points} />`. No second object, no per-burst mesh, no
  React state (`useRef` + `useImperativeHandle` + one `useFrame` only).
- **Recipes, as briefed and pinned:** spark 14 particles, `#fff7cc`→`#f97316` lerp, speed 2.2–3.6,
  gravity −4, life 0.35 s; sand 10 particles, `#c29b62`, speed 0.6–1.2 upward cone, gravity −1.5,
  life 0.5 s; crit 28 spark-recipe particles + 6 `#fbbf24`, life 0.5 s, wider cone (34 slots).
- **Emission axis (the brief's implementer choice, documented in the module):** sparks and crit open
  their cone along a caller-supplied direction, and `DuelScene` passes **the blow's own axis** — the
  sign of `defender.position[2] − attacker.position[2]`, i.e. from the attacker toward the defender,
  so the spray is biased away from the attacker. The duel's fighters only ever separate along Z, so
  that sign is the whole axis; with no direction the cone points at world +Z. **Sand is the
  exception**: it always fountains along world up (a dust kick, not a ricochet).
- **Zero per-frame allocation, structurally and behaviourally.** The update path is
  `integrateImpactPool(pool, dt)` — semi-implicit Euler over the fixed 128 slots, reading and writing
  only the typed arrays it is handed, with no `new`, no literal, no collection-returning array method
  and no `Math.random`. The spawn path is allocation-free too: module-scope temps (`_axis`, `_dir`,
  two tangents, three scratch `THREE.Color`s) mirror `GladiatorMesh`'s house pattern, and
  `createImpactPool` / `createImpactPoints` allocate exactly once per instance inside `useMemo`. The
  suite pins both halves: 600 steps keep every array identity, byte length and the pool's key set,
  and a source scan of the function body finds no allocating construct.
- **Dead particles sit at `y = IMPACT_PARKED_Y` (−10)** and are skipped; a spent burst frees its
  slots, and a full pool recycles its oldest slot through a round-robin cursor rather than growing.
- **Two non-obvious implementation requirements, both found while building it.**
  (1) **`points.frustumCulled = false` is mandatory.** A `Points`' bounding sphere is computed from
  its position data and never refreshed, and every slot starts parked at y = −10 — so with culling on
  the whole pool would be rejected the moment it left those initial bounds and no burst would ever
  draw. (2) **The frame delta is clamped** at `IMPACT_MAX_STEP_SECONDS` (0.1 s): a backgrounded tab
  hands back a multi-second delta, and without the clamp a burst teleports off-screen on the first
  frame after the tab returns. Neither is a preference; both are load-bearing.
- **Call sites: exactly three, all in the landed branch of `executeCombatTurn`**, beside the
  pre-existing feedback lines and replacing none of them: blocked → `burst('spark', …)`;
  unblocked crit → `burst('crit', …)` **instead of** sand; unblocked non-crit → `burst('sand', …)`.
  The impact point is `defender.position + [0, 1.2, 0]`, computed once per landed blow. Nothing is
  awaited or assigned, so a burst cannot influence an outcome; the twin-fangs bonus strike and every
  other resolution point deliberately have no call site (per the brief).
- **Regression suite: `src/utils/impactParticles.test.ts` — 41 tests / 1,026 expect() calls**, eight
  sections: §A the pool budget and the single-Points/single-material/single-draw-call shape plus the
  material props and the component's one-element tree; §B the recipes' counts, colours, speed bands,
  gravity and life; §C a burst's shape (slot count, spawn point, speed band, cone axis for sparks and
  up for sand, the colour lerp, the degenerate-axis fallback); §D gravity/life integration per
  recipe, the Euler order and the per-particle gravity that lets sand and sparks share one pool;
  §E parking, slot reuse and in-place recycling; §F the zero-allocation proofs above; §G the three
  call sites read out of `DuelScene` (branch by branch, `'crit'` in place of `'sand'`, the import, the
  single mount inside `Suspense`, and the tree-wide sweep that finds no other importer); §H the
  hit-stop table, the single 1100 ms resolution window and `combatCalculations.ts` unchanged, plus
  the structural proof that every call is fire-and-forget. Because the pool's arrays are
  `Float32Array`, stored-value comparisons use precision 4 and speed/colour bounds 1e-4 — far below
  the quantities asserted and far above the storage's own rounding (the suite says so in its header).
- **Validated 2026-10-24** in the dev container, the full battery on the final tree:
  `bun test` → **3571 pass / 0 fail (119 files, 107,231 `expect()` calls)** — the branch tip read
  3530 / 118 before this suite, so the 41 new tests and one new file are the whole delta, and the
  existing outcome/timing suites pass unchanged; `bun run scripts/collisionTests.ts` → **123 passed,
  0 failed** (exit 0); `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0**
  with the startup-asset check passing (8 assets in `public/` and `dist/`; the pre-existing >500 kB
  chunk warning only); `git diff --check` → **clean (exit 0)**. The only production file the phase
  edits is the duel scene; the rest is the new component and the new suite.
- **Live evidence, and its limits.** The real route was driven in the preview browser (anonymous
  visitor, no session replayed): title → `PLAY` → creation defaults → the Oath's four space-bar holds
  → the 3D city hub → the Colosseum tab → `Enter Arena Duel` → `Step into Sand`. The duel's canvas
  mounted with the pooled `Points` in the scene graph, turns resolved both ways (the player's
  out-of-range swings, and Marcus's landed blows that took 152 → 136 HP), and there were **0 console
  errors** throughout — no error boundary, no exception, no scene-graph complaint.
  **The particles themselves were NOT seen in a frame, and that is why no visual claim is made**:
  the sandbox has no GPU (SwiftShader, ~1–2 fps in the arena), and a 0.06-unit point with a 0.35–0.5 s
  life is not reliably catchable at that frame rate. **Browser preview proves nothing about particle
  feel on a real device — that is Walter's device check:** whether sparks read as sparks at the
  briefed size, whether the sand kick is visible at the fighters' feet, whether the crit's gold
  flakes separate from the orange, and whether the +1 draw call and the 128-slot pool cost anything
  measurable on a phone.
- **Finding worth carrying forward — the character dev harness is unreachable in this preview.** The
  platform's navigation rewrites the query string, so `?devHarness=character` never reaches the app
  (the preview tool's own `search` carries only `_preview_token` / `base44_data_env` / …), and unlike
  `race`, `chariot` and `horsefit` the character harness has **no `sand_and_steel_dev_harness` scratch
  fallback**. A future phase that needs a live `DuelScene` either adds that flag or accepts the long
  route above, which cost several preview calls to reach one resolved hit.

## CF-5 — turn pacing by action weight (implemented, validated; pacing feel is a device question)

- **What ships: one production file, and only the timing seam inside it.** `DuelScene.tsx` gains
  `TURN_RESOLUTION_MS` (a `Record<CombatActionType, number>`), `TURN_RESOLUTION_DEATH_MS` and the two
  exported resolvers `turnResolutionMs(actionType, fightEnded)` / `aiTurnDelayMs(afterTelegraphedHeavy)`,
  plus one ref (`telegraphAftermathRef`). The fixed `setTimeout(…, 1100)` at the end of
  `executeCombatTurn` now reads `turnResolutionMs(actionType, fightEnded)`, and the AI effect's fixed
  `750` reads `aiTurnDelayMs(telegraphAftermathRef.current)`. **No outcome, formula, stamina value,
  state write, `combatCalculations.ts` line, Lefty path, save field or profile field changed**, and
  the CF-3 crowd pulse, CF-4 particles, CH-4 boss palmae and the modifier blocks are untouched.
- **The table, as implemented:** `quick_attack` 880, `power_attack` 1300, `telegraph` 1450,
  `advance`/`retreat`/`shield_block`/`dodge`/`taunt`/`rest` 800, **`cast_net` 880** — the net throw
  postdates the design, so a Director ruling placed it with `quick_attack`: an offensive action with a
  throw animation and a land/miss resolution is not an 800 ms utility beat — and
  **1600 for any turn that leaves a fighter at 0 health**, whatever the action was.
- **`fightEnded` is a READ, not a rule.** It is assigned from the same arithmetic the damage branches
  apply (`defender.health - rawDamage <= 0`, and the twin's `- bonusDamage`). It must be computed
  BEFORE the timer is scheduled: the timeout callback's own `opp.health <= 0 || player.health <= 0`
  check reads the closure's pre-resolution state, so it cannot answer "did this turn kill".
- **The AI's 900 ms beat is the turn AFTER the telegraph resolves**, not the resolving turn. The
  `pendingHeavyAttackRef` branch sets `telegraphAftermathRef` beside `telegraphLandingRef`; the AI
  effect reads it when it schedules and clears it inside the callback (before the AI chooses), so the
  next AI turn is back to 750. A boolean read-once-and-clear, exactly like the landing marker.
- **Regression suite: `src/utils/duelTurnPacing.test.ts`** — 21 tests: §A the table (every
  `CombatActionType`, the weight order, the shared 800 beat, the death override for all ten actions),
  §B the AI delay (750 / 900 / back to 750, and the source order of the read-then-clear), §C the
  full-fight bound (standard 24-turn duel 26,400 → 23,160 ms = **0.877×**, power-heavy 0.95×,
  telegraph-heavy boss 1.03× — all ≤ the design's ~8 % ceiling; the standard hand-off with AI delays
  is 32.2 s, under a 45 s bound), §D the seam (one scheduling call, no `}, 1100);` left, the timer
  body still only resets and toggles, the repo sweep finds no second pacing system).
- **`src/utils/impactParticles.test.ts` §H carried the one 1100 ms assertion** (CF-4 pinned
  `duel.match(/\}, 1100\);/g)?.length === 1`); it is **updated to pin the shipped CF-5 call** instead,
  and that is the only pre-existing assertion this phase touched.
- **Verified 2026-10-25** in the dev container: `bun test` → **3592 pass / 0 fail (120 files, 107,339
  `expect()`)**; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 with the startup-asset check passing (8 assets);
  `git diff --check` → clean.
- **Not automatically verified — the pacing itself, and that is Walter's Android device check.** The
  sandbox has no GPU (SwiftShader, ~1–2 fps in the arena), so how an 880 ms quick strike, a 1300 ms
  power blow, a 1450 ms telegraph and the 1600 ms death beat *feel* cannot be judged from a frame
  rate that coarse; the arithmetic is pinned by the suite. The one game-rule consequence to watch on
  device: `turnResolutionMs` is also the window `isExecuting` covers, and the CF-4 hit-stop (≤200 ms)
  plus trauma decay (0.44 s for a crit) still fit inside the shortest 800 ms hold — so no shake or
  freeze can now outlive the resolution it belongs to.

## CF-6 — boss moments get boss treatment (implemented, validated; boss-moment feel is a device question)

- **What ships — and what deliberately did not.** Presentation only, on the merged tree, for the four
  boss mechanics that had a log line and a sound apiece. `src/components/duel/DuelScene.tsx` (four
  gated call sites), `src/audio/soundEffects.ts` (`playWeaponDraw()`), `src/components/ui/CombatHUD.tsx`
  (the `bossVignettePulse` prop and its div), `src/components/3d/GladiatorMesh.tsx` (the
  `telegraphGlow` prop, consumed by the mesh's EXISTING emissive path), `src/index.css` (one keyframe
  family), `src/utils/bossPresentation.ts` (new: the gate, the numbers, the pulse curve) and
  `src/utils/bossPresentation.test.ts` (new suite, 35 tests). **No mechanic trigger, rate, damage,
  threshold or timing changed; no `combatCalculations.ts` line; no handedness code; no new profile
  field, save write, collider, dependency or timer.**
- **The gate is one pure function, and it is the acceptance core.** `bossPresentsMoment(opponent,
  mechanic)` answers true only when `isBoss === true` AND the config owns that mechanic;
  `bossPresentationMoments(opponent)` is the same rule read as "which moments does this identity own"
  and answers `[]` for a standard opponent. All four sites are wrapped: the rage effect
  (`rage_mode_colossus`), the phase-switch effect (`phase_weapon_switch`), the evasion branch that
  queues `pendingCounterRef` (`counter_dodge`) and the render's telegraph prop (`heavy_telegraph`).
  Standard opponents were already excluded by the mechanics' own guards; the gate makes that explicit
  and testable as a NEGATIVE, and it costs one comparison per site.
- **The four moments, as wired.**
  1. **Rage (Aurelius)** — after `shouldActivateRage` has resolved (so `isRaged` is already set):
     `impactRef.current.trauma = Math.min(1, trauma + 0.5)` into **CF-1's** own ref (the rig's 1.6/s
     decay spends it in ~0.31 s), `sounds.playCrowdSwell()` on **CF-3's** bed, and
     `setBossVignettePulse(Date.now())` — the HUD's red vignette pulse. The div is keyed by the
     timestamp (a second pulse restarts the animation), `pointer-events: none`, and its keyframes
     declare **opacity only** (the house motion law). `BOSS_VIGNETTE_MS` = 700.
  2. **Telegraph (Goliath)** — `<GladiatorMesh fighter={opp} telegraphGlow={Boolean(opp.telegraphText)
     && bossPresentsMoment(opponent, 'heavy_telegraph')} />`. The mesh writes
     `TELEGRAPH_GLOW_COLOR` (#ff2222) into the materials it already flashes, and pulses
     `emissiveIntensity` on a 2 Hz sine (`telegraphGlowIntensity`, `TELEGRAPH_GLOW_MIN` 0.25 →
     `MAX` 0.8 — the same peak the hit flash uses). The existing "write on change" optimisation is
     kept: the traverse happens once per mode change, the per-frame pulse is a loop over the
     materials it collected, so idle fighters cost exactly what they did before. A landed blow always
     wins (`!isHit && telegraphGlow`), so the flash and the glow cannot fight over one material. The
     prop is derived from `opp.telegraphText`, the field the telegraph is the only writer of, so it
     clears exactly when the telegraph clears; **the telegraph's timing is untouched** (no new flag,
     timer or delay in the announce branch or the AI's resolution), so the player still has exactly
     one full turn.
  3. **Phase switch (Ignis)** — `sounds.playWeaponDraw()` inside the `phaseSwitchedRef` effect, gated.
     The sound is procedural in the engine's existing style: a 0.25 s white-noise draw through a
     highpass whose corner sweeps 600 → 6000 Hz, with one 1200 Hz sine ping (0.2 gain, 0.4 s decay)
     on top. **The 300 ms WHITE flash was SKIPPED, and the reason is a property of the shipped mesh,
     not a choice:** `GladiatorMesh`'s flash is the fixed red hit reaction
     (`HIT_FLASH_COLOR = '#ff0000'`) fired only by an action transition to `'hit'`. The phase switch
     is triggered by the health drop of a blow that is *already* flashing red, so a white flash would
     need a second trigger AND a colour override — i.e. a fork of the flash system, which the brief
     forbids. Nothing was faked (no `action: 'hit'`, no `hitFlashTimer`) and the suite pins that.
  4. **Counter-dodge (Valéria)** — in the branch that queues `pendingCounterRef` (the turn her passive
     dodge actually succeeded), `impactParticlesRef.current?.burst('sand', boss position + 1.2 m)` —
     **CF-4's** pool, its own sand recipe, fire-and-forget, so a burst cannot influence the
     counterattack queued beside it.
- **Two existing suites were rebased, not weakened.** CF-4's `impactParticles.test.ts` pinned
  "exactly three bursts". The truth is now four (spark 1, crit 1, sand 2 — one outcome, one
  boss-gated), and its scope guard went 5 → 6 `impactParticlesRef` occurrences; the outcome-sand
  assertion now uses `lastIndexOf`, because CF-6's call site sits earlier in the file. Each rebase
  carries a comment naming CF-6, and the count test additionally asserts the fourth call sits behind
  the counter gate. No assertion was deleted or relaxed.
- **`src/utils/bossPresentation.test.ts` — 35 tests / 1,263 `expect()` calls, six sections:**
  §A the gate (each boss on its own mechanic and on no other's; **the whole roster swept for
  standard opponents, each proving ZERO of the four moments and `[]` from the identity read**; a
  non-boss carrying a mechanic still presenting nothing; `isBoss` alone; `undefined`/`null`; the four
  moment owners are exactly the four bosses, one moment each; the four call sites and each effect
  inside its own gate block); §B rage (the exact `+0.5` write, one `trauma:` in the scene, no
  `setTimeout`, CF-3's own swell, the timestamp state and the HUD prop, the order after the mechanic,
  and the CSS — 700 ms, opacity-only keyframes, `pointer-events: none`, the keyed div); §C the glow
  (colour/rate, a 2 Hz periodic curve with eight crests in 4 s and never outside its band, a
  non-finite clock reading as the trough, the boss-only prop derivation, the player's mesh untouched,
  ONE `.emissive.copy(` and two intensity writers, `isTelegraphing` precedence, the clearing path, and
  the telegraph's own timing/pace pins); §D the draw (driven against a recording fake
  `AudioContext`: one source, one `highpass` sweeping to the target over exactly 0.25 s, one sine at
  1200 Hz; muted plays nothing; the call site inside the phase effect; and the skipped flash, with the
  mesh's fixed red path pinned as the reason); §E the counter (sand at `defender.position + 1.2`, no
  direction, no allocation; the gate inside the queueing branch; the counter itself unchanged);
  §F the mechanics (telegraph 30 % and its four guards, both 50 % thresholds, the CF-5 pace table and
  AI delays, the CF-1 hit-stop/trauma tables, the damage call untouched by any presentation token, and
  the new module's purity — no storage, no clock, no randomness).
- **Validation (2026-10-25, dev container — all five commands on the final tree):**
  `bun test` → **3627 pass / 0 fail (121 files, 108,613 `expect()` calls)** (the branch tip read 3592 /
  120; the delta is this suite's 35 tests and its file, with the four CF-4 tests rebased in place);
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  **exit 0**; `bun run build` → **exit 0** with the startup-asset check passing (8 assets in
  `public/` and `dist/`); `git diff --check` → **clean (exit 0)**.
- **Live evidence (preview browser, anonymous visitor — no session replayed; 0 console errors).**
  Read out of the running document: the vignette's stylesheet contract is real —
  a probe carrying `.boss-vignette-pulse` computes `animation-name: boss-vignette-pulse`,
  `animation-duration: 0.7s`, `pointer-events: none`, `position: absolute` and a radial-gradient
  background. The shipping `DuelScene` was then mounted through the dev character harness
  (`?devHarness=character` in an in-page frame, the C-8.66C technique) and driven with real clicks:
  creation → `Start Test Duel` → the combat HUD reading **SPARTACUS 152 / 152 · MARCUS THE ROOKIE
  90 / 90**, and one turn resolved (`Advance`: the Arena Chronicle gained
  "Spartacus advances 1.8m toward their opponent.", the distance readout 7.0 m → 5.2 m). Across that
  standard duel the HUD held **zero** `[data-boss-vignette]` elements and no telegraph banner — the
  live form of the negative the acceptance core asks for — and the frame loops (the mesh's new
  emissive path included) ran with no console error.
- **NOT automatically verified — the four boss moments' rendered behaviour, and it is a device
  question.** The dev harness's duel is hard-wired to `ALL_OPPONENTS[0]` (Marcus, a standard
  opponent), and reaching Goliath, Ignis, Valéria or Aurelius needs a levelled save, so **no boss
  fight was driven here**: the 0.5 shake, the crowd swell, the red vignette, the #ff2222 telegraph
  pulse, the weapon-draw sound and the counter's dust are pinned by the suite and by their gating,
  not seen. The sandbox also has no GPU (SwiftShader, ~1–2 fps in the arena), so no frame could
  adjudicate a 700 ms pulse or a 2 Hz emissive in any case. **Boss-moment FEEL — whether the rage
  lands as a punch, whether the telegraph glow reads at a glance without obscuring the boss, whether
  the draw is audible under the crowd bed — is Walter's Android device check.** Do not claim it.
- **Open device checklist for this phase:** (a) Aurelius's rage: one clean camera kick, a crowd
  swell and a single red vignette that never dims the sand or the fighters; (b) Goliath's telegraph:
  a red pulse you can read from the chase camera while you still have the full turn to answer it;
  (c) Ignis's switch: the draw audible over the crowd bed (and no flash — see above); (d) Valéria's
  slip: sand at her feet as the counter is queued; (e) a standard duel (Marcus, Flaccus) producing
  none of it. Still open from earlier phases: C-8.28, C-8.29, C-8.31/C-8.33, C-8.38, C-8.41,
  C-8.64A/B, C-8.65 and the CL-1/CL-2 coach-mark readings.

## Boss rosters — Feature Bouts framework and boss data (Slice D-1 — implemented)

- **What ships.** Five Feature Bout bosses appended to `src/data/opponents.ts`, the ten palms that go
  with them (`src/data/palmae.ts`), a pure availability resolver (`src/utils/featureBouts.ts`), the
  five authored presentation-state NAMES (`src/data/bossPresentationStates.ts`), a Feature Bouts
  section on the Colosseum tab and the boss card line on the pre-fight card.
- **The one structural rule: `isLadderBoss()`** (`src/data/opponents.ts`, also exported as
  `LADDER_OPPONENTS` / `FEATURE_BOUT_OPPONENTS`). A feature bout carries `isBoss: true` **and**
  `featureBout: true`; every ladder consumer asks the predicate rather than `isBoss` alone —
  `resolveVictoryTier` + `resolveDoorDuelTarget` (`utils/tierAdvancement.ts`), `nextBossKills`
  (`utils/bossKills.ts`, which keeps its zero-import purity and therefore repeats the two-line test)
  and `deriveRank`'s tier-4 evidence (`utils/rank.ts`). Otherwise a tier-2 feature win would advance
  `currentTier` to 3 with Ignis still standing. `PRIMUS_PALUS_LADDER` is the ladder only.
- **Feature mechanics are INERT data this slice.** `BossMechanic` is now
  `LadderBossMechanic | FeatureBossMechanic`; `DuelScene` branches on the four ladder literals and
  ignores the rest, `bossPresentation`'s moment table and gate are keyed on
  `isLadderBossMechanic`, and `TournamentTab`'s `BOSS_MECHANIC_LABELS` needs a text for all nine
  because the record is exhaustive. A feature bout duels as a clean standard boss fight.
- **Carried palms are EMPTY blocks on purpose.** `blood_scent`, `two_faces`, `vainheart`,
  `survivors_oath`, `old_craft` are `bossOnly: true` with `effect: {}` and their magnitude in
  `notes`, because `buildOpponentModifiers` merges a carried palm's block unconditionally — a
  magnitude there would be a live combat change. The five drops (`hunters_patience`, `wards_breath`,
  `shieldbreaker`, `the_open_flank`, `undying_name`) DO carry block data at their §2.4 stage, with
  the sequence/attack-type/stance/class condition flagged in `notes`; `the_open_flank` is the only
  row in the game carrying `critChanceAdd`.
- **Gates are data.** `OpponentConfig.gate` is `{ rank, bossDefeatedId?, tierReached? }`;
  `featureBoutGateText` builds Part A's sentence from `RANK_THRESHOLDS` and the roster, so no gate
  wording or purse lives in a component. Gnaeus's gate names no boss — it is `tierReached: 4`, per the
  design.
- **Deferred, deliberately:** the **AI-4 presentation key map**. The five state names are stored
  (`authorPresentationState`), every boss stands in `STANDARD_BOSS_AMBIENT_STATE`
  (`presentationStateInForce`), and nothing in the tree dresses an authored name yet.
- **Verify with** `bun test src/utils/featureBouts.test.ts` — it deep-equals the twelve pre-D-1 rows
  against `src/utils/preD1Opponents.ts` (a generated fixture: **do not edit it**; a change means a
  pre-existing row moved), drives the gate matrix, and asserts the result-flow invariants above.
  `opponentsLadder`, `bossKills`, `tierAdvancement`, `palmaeState`, `traitModifiers`,
  `combatPlumbing`, `intel`, `bossPresentation` and `storyChapterOne`'s P7 counts were rebased to
  the new roster (12 ladder + 5 feature bouts; 26 palms = 17 pool + 9 carried).

## Beast Hunt (D-2) — validation status and the harness opponent parameter

- **The dev character harness takes an optional `?opponent=<id>`** (`src/components/dev/CharacterTestHarness.tsx`),
  defaulting to `ALL_OPPONENTS[0]` exactly as before. It exists so one boss bout can be mounted without
  climbing the ladder: `/?devHarness=character&opponent=opp_marcellin_boss` (Marcellin / Ferrum). The gate is
  unchanged and still **query-only** (`phaseC8_66d.test.ts` §A pins that), and an unknown id falls back to the
  default — the harness never invents an opponent.
- **D-2 validation, 2026-10-25:** `bun test` → 3710 pass / 0 fail (123 files; the beast suite
  `src/utils/beastHunt.test.ts` is 45 of them), `bun run lint` (`tsc --noEmit`) → clean, `bun run build` → ok.
- **NOT automatically verified — the live arena interaction.** The whole beast cycle (crouch telegraph → target
  control → strike at the crouch → wound pip → pounce / flight) is covered by the suite and by
  `DuelScene`'s own code paths, but it has **not** been driven in the preview browser: the Base44 preview
  reloads every preview call at the home route and clears `localStorage` between calls, so a
  `?devHarness=` deep route cannot be held from one call to the next, and the beast bout sits behind a
  ladder gate. Do the by-hand check with the URL above (creation → **Start Test Duel**); the states to look
  for are Ferrum standing beside the master, the three wound pips beside Marcellin's name, the
  `FERRUM CROUCHES — POUNCE INCOMING` banner at the third boss action with the Master / Ferrum target
  buttons, one pip lighting on a landed strike, a third wound driving the beast off, and its absence from
  the arena afterwards.
- **Authored (not design) numbers.** `boss-rosters.md` Part A carries no beast values, so Ferrum's row in
  `src/data/opponents.ts` is authored against the tier-2 band and says so in its own comment: agility 18
  (one above Ignis' 17), strength 12 (below Cassius' 13), pounce damage 24 (the tier's light-damage ceiling),
  `quick` hit profile, cadence 3 and 3 wounds (the card line's own words).
- **D-2 live pass (2026-10-25) — two defects the arena showed, both fixed in the same two files, and the
  full beast cycle then driven end to end.** (a) **The reach warning covered a beast strike.**
  `TurnActionPanel` painted the "Out of Range (Advance)" overlay from `!isInWeaponRange` alone, but
  `isBeastStrike` resolves with no range gate, so a strike aimed at a crouching Ferrum was shown as
  impossible — it is now a single derived `strikeOutOfRange = !isInWeaponRange && !targetingBeast`, used by
  both attack cards' overlay and their out-of-range styling. (b) **The crouch banner outlived the leap.** The
  `FERRUM CROUCHES — POUNCE INCOMING` telegraph was cleared only in the pounce's LANDED branch, so a pounce
  that was evaded, missed or fell short left the banner standing over a beast that was no longer crouched
  (until the next crouch or a strike at it). It is now cleared — with the "springs out of the crouch" line
  written beside it — where the pounce is DISPATCHED (the AI's `plan === 'pounce'` branch), so it comes down
  however the blow ends; only Blood-Scent still rides the landed branch. That same branch's miss log read
  `${attacker.name}`, i.e. "Marcellin the Beastmaster's attack MISSED!" for the beast's own whiff — it now
  reads `attackerLabel`. **No cadence, formula, damage, wound, target-gate or pipeline stage changed**, and
  `beastHunt.test.ts`'s source pins still hold (its `if (isBeastPounce) {` anchor now finds the landed
  block, whose Blood-Scent lines are what it asserts). Suites re-run green: `beastHunt`, `statefulDoctrinae`,
  `duelTurnPacing`, `impactParticles`, `bossPresentation`, `uiControls`, `combatPlumbing` → 311 pass / 0 fail;
  `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (startup asset check, 8 assets).
  **Driven live** in the dev harness (`?devHarness=character&opponent=opp_marcellin_boss`, mounted in an
  in-page frame — the C-8.66C technique, since the preview rewrites a top-level query string), Retiarius
  creation → `Start Test Duel`: at the first crouch the cards read `Out of Range (Advance)` while the master
  was targeted and **none** after switching to Ferrum (`84% Hit · 1 WOUND`), the net card re-worded to "Net
  the beast … No helm to refuse it" and spent on the cast, a missed net logged "The net flies wide of Ferrum
  — it is still crouched!" and the following spring logged "**Ferrum** springs out of the crouch!" / "Ferrum
  strikes with Quick Slash, but is OUT OF RANGE!" with the banner gone; wounds then went 0/3 → 1/3 → 2/3 →
  **3/3**, the third logging "Ferrum is struck a third time — it clears the wall and the crowd roars!" plus
  `BEAST_FLIGHT_WORDS`, the arena frame showing the sand empty of the beast afterwards. **Still NOT
  automatically verified:** the beast's rendered flight animation on a real GPU (SwiftShader here), and the
  `3/3` pip row, which stays visible beside Marcellin's name after the flight — a HUD reading worth a
  Director's look rather than a silent change.

## Boss rosters — false telegraph (Varro) and unbroken panoply (Gnaeus) (Slice D-3 — implemented)

- **The two hinges, inspected first and reported as the prompt asks.** Heavies are telegraphed by
  Goliath's mechanic: the AI may choose the existing `'telegraph'` action (30 %, three guards), which
  sets `pendingHeavyAttackRef` + `opp.telegraphText`; on the boss's next turn the AI effect's
  `pendingHeavyAttackRef` branch clears the banner, sets `telegraphLandingRef` (the long hit-stop) and
  `telegraphAftermathRef` (the 900 ms beat), and calls `executeCombatTurn('opponent', 'power_attack')`
  — the standard power pipeline, one full turn later. The pace table is untouched
  (`telegraph: 1450`, `quick_attack: 880`, `power_attack: 1300`). A blocked power attack reaches the
  landed branch with `isBlocked = defender.isBlocking` and is reported there as
  `BLOCKED by …` / `notePlayerStrike('blocked')` / sparks; a missed, evaded or out-of-range blow never
  enters it. That landed branch is the event stage both mechanics hang off.
- **`false_telegraph` (Varro), gated `isBoss && featureBout && bossMechanic === 'false_telegraph'`
  and a valid `falseTelegraph` block** (`utils/falseTelegraph.ts`). Every heavy he chooses is announced
  rather than thrown silently (the wind-up is where the tell lives); `initiateHeavy` decides the kind at
  the ANNOUNCE with a deterministic seed drawn once per duel (`seededRoll`, murmur-family integer
  avalanche), the teaching pair forced first, and publishes `tell` (`light` for a feint, `planted` for a
  true heavy). At resolution `falseTelegraphAction(kind)` dispatches `quick_attack` (feint — standard
  quick profile, damage, stamina, 880 ms) or `power_attack` (true heavy — byte-identical to a normal
  heavy). The tell is cleared in `executeCombatTurn` whatever the blow becomes; the announce is the
  shipped telegraph action, so its 1450 ms turn is never shortened. The tell is WEIGHT-based:
  `tellFor(kind)` takes no side input and the stance cue is a transform on the model group, so Lefty
  mode cannot change it.
- **`unbroken_panoply` (Gnaeus), same fence** (`utils/panoply.ts`). Three pieces with 2 cracks each;
  **there is no strike-line model in this combat system, so the design's fallback ships: cracks accrue
  to the first unbroken piece in the row's order `facing → crest → pauldron`**, one per player POWER
  attack that lands (hit or blocked), never on a quick. While a piece shines: crest `+0.10` aggression
  (0.60 → 0.70), facing `+0.10` blockChance (0.75 → 0.85), pauldron `damageTakenMult 0.90`. Each break
  removes exactly that benefit, pays the player `breakHype` 15, speaks
  `His {piece} splits — the crowd loves it.`, and arms Vainheart (his own palma) for his next 2 attacks
  at `×1.12`. All three broken: **Humiliated** — blockChance `−0.10` (0.65), aggression `+0.10` (0.70),
  permanent, announced once (`The gold is gone — Gnaeus stands humiliated before the crowd.`). The AI
  reads the live values through `panoplyAggression` / `panoplyBlockChance`; the player's blows read
  `panoplyDamageTakenMult` into the same `traitMult` every other modifier uses. No formula changed.
- **Naming note, stated rather than silently resolved:** the prompt's item 3 is headed "Vainheart" but
  describes the effect `palmae.ts` gives **Two Faces** ("after a feint, his next true heavy +15 %"), and
  item 4 attributes "Vainheart" to Gnaeus — which is what his row carries ("a break arms his next two
  attacks at +12 %"). Both shipped under the palma each row actually carries: Varro's `two_faces`
  (1.15 via `followUpMultiplier`, spent on the next TRUE heavy, win or lose the exchange) and Gnaeus's
  `vainheart` (1.12 for two attacks). This is the only reading in which both the ids and the
  descriptions are true.
- **Presentation, property-only.** `high-noon` (hard white sun, low ambient) and `gilded` (warm gold key)
  joined `BOSS_PRESENTATION_DELTAS` — the arena's existing light/fog properties, +0 draw calls. The
  duel arena holds no standalone banner, so Gnaeus's third break swaps the **imperial loge canopy's
  colour** (`#eab308` → the house `#881337`) through a `bannerAllegiance` prop — one material property,
  no new mesh. The panoply's crack pips render beside the boss name in D-2's pip language
  (`data-panoply-pips` / `data-panoply-humiliated`), in the vital card, so they cannot crowd
  `TurnActionPanel`.
- **Suites:** `src/utils/falseTelegraph.test.ts` (25 tests) and `src/utils/panoply.test.ts` (26 tests)
  cover the fence (including string-copy and every non-boss row), the teaching pair, the seeded roll's
  determinism, feint-vs-quick and true-vs-heavy profile equality, the telegraph duration, the tell's
  lefty-independence, Two Faces, cracks on power-only (hit or blocked), the crack order, each benefit's
  removal, the Humiliated values, Vainheart's two attacks, the presentation deltas/banner/pips, and that
  no duel state reaches a save. **Rebased, not weakened:** `beastHunt.test.ts`'s presentation-delta keys
  (`['dawn']` → the three authored states) and its `executeCombatTurn(` count (6 → 7, Varro's resolution);
  `crowdHype.test.ts`'s arena mount (now also carries the banner allegiance) and its hype-award count
  (4 → 5, the panoply break's row value); `duelTurnPacing.test.ts`'s aftermath-marker count (1 → 2, the
  second telegraph branch); `featureBouts.test.ts`'s D-1 inertness sweep (the two mechanics D-3 wires are
  named, the other three stay inert, and **no feature mechanic still owns a presentation moment**) and
  its DuelScene state-name sweep (`'gilded'` now appears once, structurally as the banner's allegiance,
  the other four names still absent).
- **Verified 2026-10-25** in the dev container: `bun test` → **3759 pass / 0 fail (125 files, 110 144
  `expect()`)**; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 with the startup-asset check passing (8 assets);
  `git diff --check` → clean.
- **Live evidence (preview browser, anonymous visitor, dev harness in an in-page frame).** vs Varro
  (`?devHarness=character&opponent=opp_varro_boss`): creation → Start Test Duel mounted on
  `VARRO "THE MIRAGE" 300/300`, turns resolved, and on the fifth exchange he **wound up** — the
  `HEAVY ATTACK INCOMING` banner up with the Doctore's telegraph beat, **0 console errors** — proving
  the announce path runs for a feature bout through the shipped telegraph action. vs Gnaeus: the HUD
  read `data-panoply-pips="shield facing:0/2|crest:0/2|pauldron:0/2"`, `data-panoply-humiliated="0"`,
  boss name present, 0 console errors, no sideways scroll at 1280. The frames are SwiftShader
  (~1–2 fps).
- **NOT automatically verified — the human checks the prompt asks for.** (a) Whether a player can call
  feint-vs-true from the feet tell alone by the third heavy: the tell is a 0.12 rad forward lean plus a
  0.03 dip on the model group, which a software-rendered, ~2 fps frame at this subject size cannot
  adjudicate; it is a Director/device reading. (b) Whether the first-feint words read well and whether
  the teaching pair is unmistakable. (c) Gnaeus's deliberate power-into-block strip, the per-break
  announcements and the Humiliated shift in play (unit-pinned; no fight was driven to six landed power
  attacks). (d) The gilded/high-noon lighting and the banner swap's look. The harness cannot seed a
  levelled save, so these belong to the Android pass.
- **Open risks:** the panoply's benefit values and Varro's `feintChance 0.45` are AUTHORED (Part A
  carries no numbers) and want a balance pass; a feint still costs Varro the heavy's announced turn, so
  a feint-heavy streak is tempo-negative for him (measured by feel, not tuned); the seed is drawn once
  per duel, so a rematch replays a different sequence; and the Humiliated blockChance/aggression values
  ride the AI's standard chooser only — the player-blocking branch's fixed 0.45/0.30 split is unchanged.

## Boss rosters — the Cotta brothers (Slice D-4 — implemented; live arena pass PENDING)

- **What ships.** One boss row (the D-1 `opp_cotta_boss` entry, unchanged in every
  field it already had) gains its pair sub-data; a pure module (`src/utils/yokedBrothers.ts`)
  owns the fence, the alternation, the Crossing, the withdrawal and the Oath; the duel mounts
  the pair as two models; the HUD and the tavern's deep card read the published numbers.
  Files: `types/game.ts` (`YokedBrotherProfile`, `YokedBrothersConfig`, `OpponentConfig.brothers`),
  `data/opponents.ts` (the authored sub-data), `utils/yokedBrothers.ts` (+ its suite),
  `components/duel/DuelScene.tsx`, `components/3d/BrothersPair.tsx` (new),
  `components/ui/CombatHUD.tsx`, `components/hub/TournamentTab.tsx`,
  `data/bossPresentationStates.ts` (`brothers` deltas), `components/3d/DuelArena.tsx`
  (the banner's third tone), `components/ui/TurnActionPanel.tsx` (`brothers_recovery`).

- **What the Pale Twins precedent gave for free, and what was genuinely new.** The Twins are
  ONE `OpponentConfig` fought as a single opponent: `DuelScene` already binds an opponent row to
  a `FighterState` + one model, and the duel already resolves every strike through one pipeline
  with per-attacker values. So the row, the purse, the gate, the result flow, the boss HUD,
  `getWeaponByType` weapon resolution, the `traitMult` damage hook and the AI's chooser all came
  free — D-4 adds no second roster entry, no second HP pool and no new damage formula. What was
  new: (a) a SECOND rendered fighter, which the Twins never had; (b) per-brother profiles
  (weapon + aggression + blockChance) that change between slots; (c) a slot-level state machine
  (alternation, the Crossing's cadence, the Exposed recovery, the survivor phase); (d) a
  second-strike dispatch at exchange end; (e) a withdrawal that changes the pair's numbers.

- **The mechanic, as shipped.** One row, one pool (`healthMax` 195). Every boss action is one of
  four slots: an ordinary **act** by the brother whose turn it is (his published aggression,
  blockChance and weapon — reach, stamina and base damage all follow the man), the **Crossing**
  on every fourth slot while both stand and in reach (the front telegraphs a standard heavy and
  the rear traverses to the flank), the Crossing's **resolution** (the heavy through the normal
  power-attack branch; at exchange end a dodge auto-misses the flank and leaves the pair
  **Exposed**, otherwise the rear's flank strikes through the normal quick-attack branch with
  Gaius's sicae), and the Exposed **recovery** (`brothers_recovery`, resolves nothing — a tempo
  beat, 1000 ms AUTHORED pacing). At half the pair the front brother is withdrawn (attendants),
  the rear becomes the survivor with **+15 % damage** (one more factor on the existing
  `traitMult`) and **+0.10 aggression**, the Crossing never fires again, and both announcements
  are one-shot. Cast the Net suppresses the next Crossing (an entangled front cannot lead it).

- **The reading taken where the prompt was ambiguous, stated rather than silently resolved.**
  "If the player BLOCKS the front heavy … UNLESS the player is in dodge stance, in which case it
  misses by the standard evasion rule; if the player DODGES … the flank strike auto-misses and the
  pair enters Exposed (dodge stance OR the evasion resolves)" is read as ONE condition — the
  player's evasion stance at the front heavy's resolution is the dodge that takes both blades and
  exposes the pair. A block or an unshielded answer sends the flank through the pipeline, where
  the standard block reduction still applies (a blocked flank is chip damage, floored at 1 by the
  shipped formula — the trap punishes blocking, it does not ignore the shield).

- **Sub-data as landed — every value AUTHORED.** Part A fixes the rule and the names, not the
  numbers, so the row says so: Lucius (front, `sword_shield`, aggression 0.72, block 0.50) and
  Gaius (rear, `dual_blades`, aggression 0.88, block 0.20) average exactly to the row's own
  published 0.80 / 0.35 (pinned in the suite); `crossingEveryNthAction` 4, `survivorDamageMult`
  1.15, `survivorAggressionBonus` 0.10, `withdrawalAtHealthFraction` 0.5.

- **Presentation, and the honest cost.** The `brothers` state joins
  `BOSS_PRESENTATION_DELTAS` (sun/ambient/fog only — **+0 draw calls**), and the loge's heraldic
  cloth gains a third tone (`bannerAllegiance: 'brothers'` → canopy `#7f1d1d`, trim `#dc2626`):
  two MATERIAL PROPERTY changes on meshes the arena already draws, so still **+0**. "Twin
  banners" as two separate cloths is **+2 draw calls and was not shipped** — the arena has one
  heraldic cloth, and the state's twin-ness is carried by the low hard side sun (one long shadow
  per brother) plus the pair's two tones. The second FIGHTER model is the real cost: one extra
  `GladiatorMesh` = **11 meshes / 11 draw calls in the main pass** (1 skinned GLB body — one
  primitive, one material — + 5 weapon meshes + 5 shield meshes) plus **6 shadow-map draws**
  (the body and five equipment meshes are `castShadow`), i.e. **~17 draws** for the rear brother.
  No new asset is fetched: the pair's two models are `arena_roman.glb` (already in
  `CORE_3D_ASSETS` for the player) and `dimachaerus.glb` (the row's own `characterModel`).
  **`performance-budget.md` is not in this repository**, so the budget this must fit could not be
  read or compared: the delta is reported above, measured from the render tree and the GLBs, not
  from a GPU. The primary (two live models) shipped; the presentation-only fallback was not used.

- **Suites.** `src/utils/yokedBrothers.test.ts` — **38 tests**: §A the fence (including the
  string-copy row that must fight as ONE standard man), §B the alternation and the slot
  sequence, §C the two profiles, §D the cadence (every fourth, both-standing only, in reach,
  never re-planned), §E the three answers, §F the withdrawal line, §G the Oath, §H the net,
  §I presentation (the flank mirroring with Lefty Mode, the deltas, the deep-card line), §J the
  wiring. **Rebased, not weakened:** `duelTurnPacing` (the twelfth action type and the marker
  count), `beastHunt` (the deltas' key list, the dispatch count 7 → 11), `bossPresentation` (the
  announce's banner ternary), `featureBouts` (the third wired mechanic and the `'brothers'`
  banner mention), `panoply` and `featureBouts`'s loge pin (the canopy's three arms),
  `combatPlumbing` (the chooser's named reads), `tempering` (the one `attackerWeapon` variable).

- **Verified 2026-10-26** in the dev container: `bun test` → **3796 pass / 0 fail (126 files)**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`)
  → exit 0; `bun run build` → exit 0 with the startup-asset check passing (8 assets);
  `git diff --check` → clean.

- **NOT automatically verified — the live bout.** The dev harness route
  (`?devHarness=character&opponent=opp_cotta_boss`) mounts only through the preview tool's FIRST
  navigation of a turn (a query string is stripped otherwise, and any shell command reloads the
  home route). Two attempts inside an in-page frame reached the harness but not a duel: its
  creation form must be submitted before the harness renders its `Start Test Duel` control, and
  the sandbox renders the 3D screens through SwiftShader (~1–2 fps), so the budget went on the
  form. **The Crossing's telegraph, the Exposed tempo, the withdrawal and the survivor phase were
  therefore not seen in the arena** — they are pinned by the suite and by the source, and the
  device checklist is: (a) does the pair read as two men with one HP pool; (b) does the Crossing
  read as a built trap a full telegraph ahead (banner + the front's glow + the rear's traverse to
  the flank); (c) does dodging it produce a visible Exposed beat and a free tempo; (d) does the
  survivor phase read as a distinct, angrier single fight; (e) does the whole bout hold the duel
  frame budget on a mid-range Android device. Do not claim device acceptance.

- **Open risks.** (1) The second model's device cost is unmeasured (no GPU here) — the report's
  ~17 draws is a render-tree count; if it breaks the duel budget, the presentation-only rear
  presence is the prepared fallback. (2) Every pair number is authored and wants a balance pass.
  (3) A blocked flank is chip damage because the standard block reduction applies — the trap's
  teeth are its tempo loss (Exposed) more than its damage. (4) The alternation hands the slot
  after a Crossing resolution to the brother who did NOT lead it, so the front can act three
  slots running across a Crossing (telegraph, heavy, next act); this is pinned by the suite and
  reads as the pair committing to the trap.

## Boss rosters — Hermas's long memory (Slice D-5 — implemented; the arena read itself PENDING)

- **What ships.** The D-1 `opp_hermas_boss` row (unchanged in every field it already
  had) gains its `longMemory` sub-data; a pure module (`src/utils/longMemory.ts`) owns the
  fence, the **LIVE OFFENSIVE-MIX COUNTER (built new in this slice — the tree had none)**,
  the two thresholds, the counter-shift, its caps and every word; the duel counts the
  player's attacks and reads the effective block value into the AI's own chooser; the
  result modal prints the adaptation log in numbers; the tavern's deep card prints his
  base profile and labels the one honest unknown. Files: `types/game.ts`
  (`LongMemoryConfig`, `OpponentConfig.longMemory`, `DuelStatistics.adaptationLines`),
  `data/opponents.ts` (the authored sub-data), `utils/longMemory.ts` (+ its suite),
  `components/duel/DuelScene.tsx`, `components/hub/DuelResultModal.tsx`,
  `components/hub/TournamentTab.tsx`, `data/bossPresentationStates.ts` (`dusk` +
  `emberEmissive`), `components/3d/DuelArena.tsx` (the banner's fourth tone, the ember
  property).

- **What the engine already gave, and what is genuinely new.** The duel already hands
  `executeCombatTurn` the player's `CombatActionType` on every resolved action, and its
  combat log is prose — so the ACTION STREAM was there and the DATA was not. This slice
  adds (a) a counts-only live mix in memory (`notePlayerAction` → `{ quick, power }`, no
  second log, nothing saved), (b) the threshold read + counter-shift rule, (c) one extra
  named read in the AI chooser (`aiBlockChance`, exactly where D-3's panoply and D-4's
  brothers already sit), (d) the in-memory result log, (e) a fourth banner tone and one
  emissive property. **Nothing was imported from the Grudge Bouts slice: C-A is not
  merged, there is no grudge shift and no mix counter in the tree, and D-5 builds its
  counter fresh.** C-D is likewise not merged: the "explainable lines" are a small
  addition to the EXISTING `DuelResultModal` (a `data-long-memory-lines` block fed by
  `DuelStatistics.adaptationLines`, the same in-memory pattern D-2's `beastEpilogue` uses),
  not C-D machinery.

- **The mechanic, as shipped.** At Hermas's HP crossing 66 % and again at 33 % (each once,
  never mid-telegraphed-action — the read is deferred while `opp.telegraphText` or the
  pending-heavy marker stands, and re-runs when the banner clears; a read on the killing
  blow is skipped) he reads the player's offensive mix from the live counter. A class past
  60 % of that mix triggers its counter-shift plus Old Craft; neither past 60 % triggers
  nothing. Only `blockChance` moves — the one knob `chooseAIStandardAction` reads — and the
  dodge share is its exact complement (`1 − blockChance` of his defensive actions), which
  is what B4's "the dodge share falls" names. Hermas's `dodgeChance` row field is untouched
  because a non-`counter_dodge` opponent never reads it.

- **The values as landed, and which ones are whose.** `readAtHealthFractions` `[0.66,
  0.33]`, `dominanceThreshold` 0.60, `maxDeltaPerAdoption` 0.15, `clamp` `[0.05, 0.95]` —
  the design's. `blockChanceDelta.power` **+0.10 — PUBLISHED** (B4's own example).
  `blockChanceDelta.quick` **−0.15 — AUTHORED** (B4 publishes no quick-spam mirror; it is
  authored inside the same cap, and its size is chosen so that after Old Craft's +0.05 the
  net is −0.10 per adoption). `oldCraftBlockChancePerAdoption` **+0.05** (his carried
  `old_craft` palma). **The cap is read PER ADOPTION** — that is the only reading under
  which the mechanic's second beat is real: two power adoptions take block **0.65 → 0.80 →
  0.95** (exactly the published clamp ceiling) with the dodge share **35 % → 20 % → 5 %**,
  and two quick adoptions take it **0.65 → 0.55 → 0.45** with the dodge share **35 % → 45 %
  → 55 %**. Under a cumulative reading the second adoption could add nothing at all, which
  would make the card line's "twice" dead. His base stats never change — the suite pins all
  seventeen rows byte-identical across a full power-spam bout.

- **The balanced rule, and the boundary.** A 50/50 synthetic mix produces a Hermas whose
  profile equals his row at BOTH thresholds (block 0.65, aggression 0.70, dodgeChance 0.50,
  dodge share 35 %), with no shift, no Old Craft, an empty HUD line, and a result line that
  says so. A mix sitting **exactly** on 60 % is balanced too (the rule is "past
  three-in-five"); one extra action past it is not — both cases pinned.

- **The words print his real row values.** The announcement is built from the computed
  before/after pair, e.g. *"The old man has seen enough of your power attacks — he sets
  himself to block. Old Craft settles his guard. (Block 0.65 → 0.80; his dodge share 35% →
  20%)"*. The staged prompt's `0.60 → 0.70` is asserted **absent** from every shipped line,
  and the module carries no bare decimal pair in its prose. The line goes through
  `addLog` — the duel log `.combat-log-items` that `index.css` already compacts for a short
  landscape phone — plus one floating `HE HAS READ YOU` tag, so the touch HUD reads the same
  words as the desktop one.

- **Presentation: `dusk`, property-only, +0 draw calls.** `BOSS_PRESENTATION_DELTAS.dusk`
  is a DEEPENED dusk (sun `#c2703f` at 1.05, ambient `#a98a6d` at 0.34, fog `#7d5a3f`) and
  raises the eight existing braziers' ember emissive **3 → 5.4** through a new
  `emberEmissive` delta on the arena's existing material. The loge's one heraldic cloth
  gains a fourth tone (`bannerAllegiance: 'dusk'` → canopy `#4c0519`, trim `#a16207`).
  **"His banner beside the player's" is carried as that one cloth's tones, not a second
  cloth:** the arena has a single heraldic cloth (D-3/D-4's finding) and a second one would
  be **+1 draw call**, which this slice's "+0 calls" constraint forbids. The arena's mesh
  count is unchanged (32 `<mesh>` nodes, pinned by the suite).

- **The honesty re-run (scope 5).** The suite extends the roster-wide assertions to the
  FINAL nine-mechanic table: each of the four ladder + five feature mechanics resolves on
  exactly one row and that row is `isBoss`; every feature mechanic additionally requires
  `featureBout`; no non-boss row carries a mechanic; no ladder boss carries a feature one;
  and all seventeen rows survive a full power-spam bout byte-identical. **The staged
  prompt's "Sand/Steel/Invictus" honour suite does not exist in this repository** — a
  case-insensitive sweep of the whole tree returns nothing for "Invictus" — so there was no
  such suite to re-run; the roster-wide assertions that DO exist (D-1's byte-identical row
  check plus these) are what was extended.

- **Suites.** `src/utils/longMemory.test.ts` — **38 tests / 371 expect() calls**: §A the
  fence (including the sub-data copied onto a standard man, a ladder boss, another mechanic
  and a row with no sub-data, plus nine malformed shapes), §B the live counter (only the
  two attacks count; a class dominates only when it EXCEEDS the threshold; immutability),
  §C the thresholds (450 max, 297 / 148.5, each once, both from one blow, junk health), §D
  the values and the caps (the published power pattern, the authored mirror, the per-
  adoption cap, the clamp ceiling, base stats untouched), §E the balanced rule (§above),
  §F the words, §G the presentation, §H the result lines, §I the wiring, §J the roster-wide
  honesty. **Rebased, not weakened:** `beastHunt.test.ts`'s presentation-delta key list
  (four → five entries, `dusk` appended) and `featureBouts.test.ts` (the fifth wired
  mechanic in the inertness sweep, and the DuelScene state-name sweep now allowing `'dusk'`
  once, structurally as the banner's allegiance — exactly as D-4 rebased `'brothers'`).

- **Verified 2026-10-26** in the dev container: `bun test` → **3835 pass / 0 fail (127
  files, 372 `expect()` in this suite)**; `bun run scripts/collisionTests.ts` → **123
  passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0; `bun run build` → exit 0
  with the startup-asset check passing (8 assets); `git diff --check` → clean.

- **Live evidence, and what is NOT automatically verified.** The dev harness route
  (`?devHarness=character&opponent=opp_hermas_boss`, mounted in an in-page frame — the
  C-8.66C technique) drove the real `DuelScene` against Hermas: creation → **Start Test
  Duel (opponent: Hermas the Legend Returned)** → `harness-stage="duel"`, the HUD reading
  `HERMAS THE LEGEND RETURNED 450/450`, the tactical cards in strike range, **0 console
  errors** — so the new module, its memos, the counting call and the threshold effect all
  initialise and run in the real scene. **The adaptation announcement itself was NOT
  observed:** a level-1 harness profile deals 29–44 on 41 %-hit power slashes into a
  450 HP / defense-17 boss, so reaching 66 % (153 damage) needs roughly ten landed heavies
  and the run instead spent its budget missing while Spartacus fell to 62/152; the sandbox
  also renders the arena through SwiftShader (~1–2 fps). **So the on-device check stands:**
  take a power-spam build into the bout and watch for the block line at 66 %, a varied
  build all the way down for silence, and the result card's "The long memory" block naming
  which happened — in numbers.

- **Open risks.** (1) The cap is read per adoption (stated above); a Director who meant a
  CUMULATIVE ±0.15 would make the second adoption a no-op, and that is a one-constant
  decision in the row. (2) The quick mirror's −0.15 is authored and wants a balance pass
  (its net −0.10 per adoption is the authored choice, not a published one). (3) The
  announcement is a log line plus a floating tag; whether the block pair reads clearly on a
  phone is a device question. (4) The live counter counts a swing that falls short of range
  (it is still an offensive action) — pinned, but it means a whiffed approach can feed the
  read. (5) His `dodgeChance` row field stays 0.50 although his live dodge share is derived
  from block; that is a pre-existing row/datum mismatch this slice deliberately does not
  "fix".

## C-8.70C — two-edged crowd hype (Slice C-B — implemented; device feel PENDING)

- **What ships, and what deliberately did not.** `src/data/crowdConfig.ts` (new — the tuning, one
  place), `src/utils/crowdDynamics.ts` (new — the pure rule), `src/utils/crowdHypeDynamics.test.ts`
  (new suite, 41 tests), and four touched files: `components/duel/DuelScene.tsx` (the live loops),
  `components/ui/CombatHUD.tsx` (the two lines), `components/hub/DuelResultModal.tsx` (the reward
  lines), `index.css` (one compact-landscape rule). `services/duelRewards.ts` changed by one
  value-identical migration (below) and `types/game.ts` gained three OPTIONAL read-only stats fields.
  **`utils/combatCalculations.ts` is byte-identical: no formula, no threshold, no selection math.** No
  save field, no profile write, no collider, no new asset, no dependency, no handedness change.

- **The config, every value marked design or authored. DESIGN (the brief's own numbers):** embolden
  threshold **70**, cap **0.15**, full threshold **90**, floor shift **0.05**, turned threshold **20**.
  **AUTHORED (anchored where a number existed):** decay per second **1.0 / 1.2 / 1.4 / 1.6** (tiers
  1–4; 1.0 is one landed blow's +8 over a CF-5 exchange's ≈1.85 s), passive multiplier **2.0**,
  passive window **6 s** (two exchanges), expected duel **90 s** (so the second half starts at 45 s —
  the duration the phase-39C fixtures already use), turned fame factor **0.8**, peak fame factor
  **0.25**, peak gold factor **0.1** (one favour step), rage feed factor **0.5**, rage accumulation
  **0.5/s**. **Value-identical migrations:** the hype ceiling **100** and the purse's crowd-favour
  ladder **50 / 25 / 0.1**, which `duelRewards.ts` now re-exports from the config
  (`PURSE_HYPE_*` keep their names and values, so no caller or test moved).

- **What was NOT migrated, on purpose (a move would have changed a value or a pinned reading):** the
  opening seed `25`, the award magnitudes `+8 / +18 / +20` and the beast/panoply/flight awards (award
  EVENTS, pinned byte-identical by the CF-3 suite), the tier boundaries `40 / 75` (CombatHUD's own
  meter reading, pinned from its source) and the CF-3 crowd-audio gains `0.015 / 0.04 / 0.075`.

- **The live loop.** The duel's existing 1 s match-timer tick now also runs the crowd's clock:
  `applyCrowdHypeDecay` at the tier's rate (× the passive multiplier while
  `Date.now() − lastOffensiveActionAtRef ≥ the window`), floored at 0; a downward tier crossing lowers
  CF-3's bed level and nothing else; `crowdHypePeak` still only rises, and only `updateCrowdHype`
  raises it. `lastOffensiveActionAtRef` is stamped at the TOP of `executeCombatTurn` for
  `quick_attack` / `power_attack` only (both fighters, one dispatch). **Hype awards and the 100 cap are
  untouched.**

- **Embolden enters as an INPUT, in `DuelScene`, and `combatCalculations.ts` was not opened.** The
  shift is folded into the `aiAggression` VALUE the existing chooser is handed (`let aiAggression`,
  then `crowdEmboldenedAggression(aiAggression, crowdHypeRef.current, CROWD_CONFIG)`), and an
  emboldened opponent takes the named-read branch (`panoplyCfg || longMemoryCfg || emboldenShift > 0`)
  — so the shipped `chooseAIStandardAction(aiAggression, aiBlockChance)` and
  `chooseAIStandardAction(opponent.aggression, opponent.blockChance)` calls are both still present,
  unchanged, and a cold crowd is byte-identical to before. The beast branch's
  `masterAloneAggression(…)` is wrapped by the same helper. The HUD shows
  **"The crowd roars — {name} fights emboldened"** plus the shift (`data-crowd-embolden`, and
  "+N% aggression" in words) inside the hype meter it describes.

- **The crowd turns: the second half is ELAPSED TIME, not HP.** `expectedDuelSeconds / 2` = **45 s**
  against `statsRef.durationSeconds`. `crowdTurnsNow` needs BOTH the second half and
  `hype < 20` (strict), the flag latches in `crowdTurnedRef`, and the result flow multiplies FAME only
  (`crowdDuelReward`). **Gold is never reduced.** The peak bonus is its own line item:
  `round(base × peak/100 × factor)` for fame and for gold, computed in the existing victory effect
  after the shipped purse write (`statsRef.current.goldEarned = purse.total;` is unchanged; the peak
  gold is added immediately after), reported through `crowdPeakFameBonus` / `crowdPeakGoldBonus` /
  `crowdTurned`. `DuelResultModal` prints **"Crowd's favor: +N fame"** and
  **"The crowd turned — fame reduced"** (plus a "Crowd Peak" gold row). No other reward math changed.

- **Rage feed — the rate is NEW, and that is the honest finding (addendum D).** CF-6's rage is a
  TRIGGER (`shouldActivateRage`, 50 % health, once), and **no accumulation-rate variable existed**
  anywhere in the tree. The minimal definition added on top of those trigger semantics: on ignition
  `rageChargeRef` starts at 0 and builds at `0.5/s × (1 + hype/100 × 0.5)` (2 s to full at hype 0,
  ≈1.33 s at hype 100), and the charge ramps the EXISTING `RAGE_DAMAGE_MULTIPLIER` input from 1.0 to
  the shipped 1.25 — no second rage system, no formula change, and the 50 % trigger is untouched. The
  fence is `crowdRageFeedApplies`: `isBoss === true` AND `bossMechanic === 'rage_mode_colossus'`, so
  Aurelius alone reads hype as power; Goliath (another boss) and a regular row are the suite's
  controls, and a non-boss carrying the copied string is refused. The HUD shows
  **"The roar feeds his rage"** for that mechanic while hype ≥ 70.

- **Touch layout.** Both lines sit INSIDE `.hype-meter` (one line each, 11px → `sm:text-xs`), so they
  cannot overlap the vital cards or `TurnActionPanel`; the short-landscape block
  (`orientation: landscape and max-height: 520px`) tightens them to 10px — the size the boss pair line
  already uses there — rather than hiding required information.

- **Verified 2026-10-26** in the dev container, the full battery on the final tree:
  `bun test` (repo-wide, bare) → **3926 pass / 0 fail (129 files, 112,195 `expect()`)**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0 with the startup-asset check passing (8 assets); `git diff --check`
  → clean. **Every existing hype test passed UNMODIFIED** (`crowdHype` 38, `phase39c`, `phase39b`,
  `phase37`, `phase38`, `duelRewards`, `beastHunt`, `combatPlumbing`, `longMemory`,
  `statefulDoctrinae`, `yokedBrothers`, `settings`) — no pin was rebased and no assertion weakened.

- **Live evidence in the preview browser (anonymous visitor — no session replayed, 0 console errors).**
  The real duel was driven end to end: title → creation → city hub → `Colosseum` → `Enter Arena Duel`
  → `Step into Sand` → the duel arena, where the HUD read `CROWD HYPE · LOW 25%`.
  **The decay is VERIFIED LIVE:** with neither fighter attacking, the meter fell **25 % → 0 %** over
  ~23 s (6 s of window, then ≈2/s), and five taunts each moved it by exactly **+20** with decay
  resuming between them (0 → 20 → 30 → 40 → 50 → 60 → 52). At **375 px** the layout has **no sideways
  overflow** (`scrollWidth − clientWidth = 0`).

- **NOT automatically verified, and why.** (1) **The embolden line and the rage line were not observed
  in band:** reaching hype ≥ 70 needs ~7 taunts at the preview's ~1–2 fps turn cadence and the run's
  budget peaked at 60; their markup, wording, shift attribute and the `≥ 70` gate are pinned by the
  suite and by the HUD source. (2) **The result screen's two lines and the reward arithmetic** need a
  WON duel (the boss/regular bouts here are long at that frame rate); the math and the wiring are
  unit-pinned, the modal render is not. (3) **Aurelius's rage feed in the arena** needs his 50 %-health
  trigger plus a high-hype band, so it is unit-pinned only. (4) The **feel** of the cooling crowd and
  of the embolden shift is a device question, like every other feel item in this file.

- **Open risks.** (a) The rage ramp means Aurelius's rage damage RISES over ~2 s from ignition instead
  of being instantly 1.25× — the one shipped behaviour this slice genuinely changes, chosen because a
  rate was requested and a cosmetic meter would have been a decoy; flag it if instant rage is
  preferred. (b) Decay runs on the 1 s timer, so the passive window and rates are quantised to 1 s.
  (c) `expectedDuelSeconds` 90 is a guess at the venue's pace; it only decides when the turning is
  possible, never the rewards' correctness. (d) The turned verdict is latched for the whole bout, so a
  crowd that goes cold at 45 s and roars back still pays the turned fame.
