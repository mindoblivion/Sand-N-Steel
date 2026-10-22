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

## Arena combat responsiveness — announced enemy strikes, tactical stamina, legal door bouts (§R1–R3B — implemented; strike window and range gate verified live)

- **Phase label.** This workstream is labelled **§R1–R3B** in the source. It is **not** `C-8.70B`:
  that label belongs to the chariot-racing workstream above, and an earlier draft of these comments
  reused it, so the `DuelScene` comment headers were renamed to "Combat responsiveness §R1". A future
  record for this work belongs under a new title again, not under `C-8.70B`.
- **It landed as two commits, not as a working-tree change.** `ff82313` ("Implement telegraphed enemy
  strikes and reaction windows", 14 files, +997/−93) sits on top of `d220bee` ("Implement enemy attack
  wind-up and tactical stamina adjustments", 2 files) on `development-focus-strategy`, and the tree was
  clean when this record was written. The hand-off premise — the work uncommitted with HEAD at
  `d220bee` — was stale; nothing was discarded or rewritten to reconcile it.
- **§R1 — the strike is announced, held, then resolved.** `src/utils/pendingStrike.ts` (new) is the
  whole bookkeeping layer and is deliberately non-React: `createPendingStrike()` over an injectable
  `StrikeTimer` owns the pending action, its **one** scheduled impact and the player's **one**
  reaction. It guarantees three things — an `announce` while a strike is pending is refused, so no
  damage can be queued twice; `cancel()` clears the scheduled impact *and* makes an in-flight callback
  inert, so a victory, a defeat or an unmount cannot resolve into a scene that has gone; and
  `claimReaction()` succeeds at most once per announcement, so mashing both buttons cannot stack a
  block with a dodge. The impact reads the pending action *at impact time*, not from a closure.
  `DuelScene.tsx` drops its own `pendingEnemyAttackRef` / `reactionTakenRef` / `windupTimerRef` for
  this controller, holds the damage for `ENEMY_ATTACK_WINDUP_MS` (**700 ms**, `combatCalculations.ts`),
  and resolves through the **same** `executeCombatTurn` the attack always went through — no formula,
  hit chance, weapon value or boss mechanic moved. `reactToPendingAttack` claims the reaction *before*
  applying the stance, and the unmount cleanup cancels the strike as well as the 1100 ms turn timer.
- **The cue and its controls.** `CombatHUD.tsx` renders the announcement (`data-windup-cue`), a
  draining 700 ms bar and the two answers — `data-reaction="shield_block"` and `data-reaction="dodge"`
  (44 px minimum, Dodge disabled below `DODGE_STAMINA_COST`); once claimed, the pair is replaced by
  `data-reaction-taken="true"`. `src/index.css` adds `.windup-bar` / `@keyframes windup-drain`, which
  animates `transform: scaleX` so the timer costs no layout.
- **§R2 — the guard is no longer free stamina.** Shield Guard spends and restores nothing by itself;
  recovery is credited only when the guard actually stops a blow (`shieldGuardStaminaGain`), still
  clamped by remaining capacity through `applyStaminaRegen`. The old unconditional Shield-Guard regen
  made the guard strictly better than Dodge. Copy follows the rule: `TurnActionPanel` shows
  "NO COST" / "SP on block" and takes Dodge's cost from `DODGE_STAMINA_COST` instead of a literal 12;
  `HelpModal` drops "Restores: 12 SP".
- **§R3A — the range rule is one rule.** `isAttackInRange` now also refuses a negative distance, and
  `TurnActionPanel` uses it (not its own `distance <= getWeaponRange(...)`) to disable **both** Quick
  Strike and Power Strike and to show "Out of range — Advance to strike". The engine keeps the
  authoritative guard, so an out-of-range strike cannot spend stamina even if a control slips through.
- **§R3B — the Colosseum door briefs and gates like the tab.** `CityHubScene` resolves the door's
  ticket (`resolveDoorDuelTarget`, unchanged: the tier's first undefeated boss) and then reads the new
  pure `resolveBoutLevelGate` — the *same* gate `TournamentTab` now uses, so a door cannot offer a bout
  its own tab would lock. Locked replies with a 4 s gatekeeper notice naming the required level;
  otherwise the existing `PreFightModal` opens and the duel starts only on "Step into Sand". A bout
  whose gate cannot be evaluated (no fighter, no id) reports **locked**.
- **Changed files (all in `ff82313`; `DuelScene.tsx` and `combatCalculations.ts` also in `d220bee`).**
  New: `src/utils/pendingStrike.ts`, `src/utils/pendingStrike.test.ts`,
  `src/utils/combatResponsiveness.test.ts`. Modified: `src/components/duel/DuelScene.tsx`,
  `src/components/ui/CombatHUD.tsx`, `src/components/ui/TurnActionPanel.tsx`,
  `src/components/3d/city/CityHubScene.tsx`, `src/components/hub/TournamentTab.tsx`,
  `src/components/hub/HelpModal.tsx`, `src/utils/combatCalculations.ts`, `src/utils/tierAdvancement.ts`,
  `src/utils/tierAdvancement.test.ts`, `src/index.css`, `scripts/combatTests.ts`.
- **Checks actually run (2026-10-20, in the `web` dev container).** `bun test` → **2517 pass / 0 fail,
  85 files, 79,943 expect() calls** (the merge record above stood at 2473 / 83, so this workstream adds
  the two new files and 44 tests); the two new suites alone → **44 pass / 0 fail, 149 expect() calls**;
  `bun run scripts/combatTests.ts` → **65 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0;
  `bun run build` → exit 0 with the startup-asset check passing (8 assets); `git diff --check` clean.
- **Verified live in the preview browser** (guest path, 400 px mobile viewport, SwiftShader software
  rendering), driving the app's own route: New Game → character sheet → city → Colosseum tab →
  pre-fight briefing → "Step into Sand" → duel.
  - **The cue precedes the damage.** With `data-windup-cue="power_attack"` up ("POWER SLASH INCOMING",
    draining bar), health stood at **138/138**; only after the window did it read **132/138** with
    `BLOCK! -6` and the chronicle sequence "winds up a power slash — brace or dodge!" →
    "snaps the shield up!". A second announced strike (quick strike) resolved the same way
    (`BLOCKED -3`).
  - **A reaction can be taken during the window and it affects that strike.** "Shield Guard" was
    offered inside the cue and claiming it replaced *both* buttons with the stance line; the blow then
    resolved against the raised guard rather than the bare fighter.
  - **Out-of-range strikes are disabled by the shared rule.** At the start of the bout (`DIST: 7.0m`,
    weapon range 2.1) the panel read "Range Status: OUT OF RANGE", both strikes were disabled under an
    "Out of range — Advance to strike" overlay while Advance was enabled; at `DIST: 1.6m` both strikes
    were enabled and the status read "IN STRIKE RANGE".
  - **The §R2 copy is on screen**: Shield Guard "NO COST" / "SP on block", Dodge "12 SP" / "−12 SP".
    No console errors were recorded during the duel.
- **Not automatically verified — do not read the list above as covering it.**
  - **Dodge during a wind-up** was never taken (only Shield Guard was), so the evade path is pinned by
    its suite, not by a live run.
  - **A second reaction inside one window.** After the claim the two buttons are gone, which closes the
    UI path, but no second click was attempted inside a live window; the guarantee rests on
    `claimReaction()` and its suite.
  - **The Colosseum door itself** (§R3B) was not reached in the live pass — the preview budget went to
    the strike window and the range gate. Its gate rule is pinned by `tierAdvancement.test.ts`, and the
    briefing it opens was verified through the tab, not through the door.
  - **Fight end / scene exit** (no delayed strike, no duplicate payout) was not exercised: the bout was
    still running when the preview budget ran out, so the exit path is unverified.
  - **Android remains manual acceptance**: 700 ms is a short read at arm's length, the cue and both
    reaction targets must be reachable one-handed on a phone in landscape, and neither was tested on
    hardware.
- **Risk worth a design decision, not a bug.** Tier 1's only boss is Goliath the Pit Behemoth
  (`recommendedLevel: 3`) and `resolveDoorDuelTarget` returns the tier's first undefeated boss, so a
  LVL 1–2 gladiator is now **refused at the Colosseum door** (gatekeeper notice, no briefing) until
  LVL 3 or a beaten boss, while the Colosseum tab still offers Marcus and Flaccus. That is consistent
  with FIX-B's "legal door bouts", but it is a player-facing change from a door that used to drop
  straight into the sand.

### Second live verification pass (§R1–R3B, 2026-10-20, at `c59695a`)

- **Scope and outcome.** Re-checked on `development-focus-strategy` at `c59695a` (this record's own
  commit, on top of `ff82313`), tree clean, desktop preview browser with SwiftShader software
  rendering. **No defect was found**, so no source file was changed: the combat loop, damage, weapon,
  boss and reward code are untouched and no new regression suite was added.
- **Dodge, taken live for the first time, follows the existing evade rules.** With
  `data-windup-cue="quick_attack"` up the pair read `Dodge −12 SP` / `Shield Guard`; claiming Dodge took
  stamina **120 → 108 — exactly one charge**, logged "Verifier throws themselves into a dodge!", and the
  strike then resolved through the ordinary roll: "Verifier swiftly EVADED Marcus the Rookie's strike!",
  health unchanged at **138/138** and stamina still **108**. The end-of-turn reset billed nothing more.
- **A second reaction inside one window is refused, not merely hidden.** The guard button was still live
  in the DOM when the same tick clicked it *after* the dodge claim, so its handler really ran — and no
  "snaps the shield up!" line appeared, the stance stayed the dodge and stamina stayed at 108. Only then
  were both buttons replaced by `data-reaction-taken="true"`. The guarantee is `claimReaction()`, not the
  re-render.
- **The Colosseum door gates the player itself, and the route onward is the tab.** Reached as a door
  (fast travel to "The Grand Colosseum", then **Enter Arena Duels**), a LVL 1 profile got "The gatekeeper
  bars the way: Goliath the Pit Behemoth requires LVL 3, and you are LVL 1. Train, and return." — with
  **no briefing, no duel, and the player still in the city**. The tab in the same session listed Marcus
  (`ENTER ARENA DUEL`, LVL 1), Flaccus (locked LVL 2) and Goliath (locked LVL 3), so a legitimate route
  exists and there is **no progression dead end**; nothing was changed. The notice's "Train, and return"
  still does not point at that tab — a copy/design question, not a defect.
- **Still unverified — the same two gaps.**
  - **Fight end and payout.** The bout was driven to Marcus at **24/90 HP** (player 106/138) but no result
    screen was reached within the preview budget, so "one payout, no duplicate result" is unproven live.
    The poll loop spent most rounds on the opponent's turn; a future pass should click only while a strike
    button is enabled and budget ~3 s per round.
  - **Leaving during a pending strike.** The duel itself offers no leave control — the only exit is
    finishing the bout — so it cannot be driven from the preview at all; the unmount `cancel()` path stays
    pinned by `pendingStrike.test.ts` alone.
- **Two verification-environment facts worth knowing before the next live pass.** A save does **not**
  survive a page reload in the preview browser, so a pass must create the profile and finish every check
  inside one document (seeding `localStorage` and reloading loses it — two attempts were spent on that).
  And a fresh save can raise the first-visit oath beat over the city; the entry steps above were driven
  programmatically, which bypasses that overlay, so the oath itself was not exercised (the reaction and
  gate results are unaffected by it).

### Final verification pass — fight completion, payout and pending-action cleanup (§R1–R3B follow-up, 2026-10-20, at `33f6ac4`)

- **Preflight.** Branch `development-focus-strategy`, HEAD **`33f6ac46d1`**, `git status --porcelain`
  empty, no unstaged and no staged diff. Both live passes above stand as written; nothing was reset,
  reverted or rewritten.
- **What was attempted live, and where it stopped.** The arena route was driven once more in the
  preview browser (title → character creation → city → Colosseum tab → "Step into Sand" → duel). The
  3D character sheet alone consumed the tool's 30 s script budget before its confirm button existed;
  the call timed out and the platform reset the browser, so **no duel was reached and no live
  fight-completion evidence was obtained this pass.** That is the environment limit the earlier passes
  recorded, measured more sharply: the route's *first* screen is the expensive one, and the hub's
  ~2 fps SwiftShader rendering sits behind it.
- **Automated evidence instead — `src/utils/duelResultLifecycle.test.ts` (new; 20 tests / 74
  `expect()` calls, all passing).** Five sections, written in the two registers the neighbouring
  suites already use (pure functions and a hand-advanced `StrikeTimer` for behaviour; ordered source
  assertions for the React wiring, exactly as `combatResponsiveness.test.ts` §D and
  `tierAdvancement.test.ts` §D do — this repo has no DOM-testing library to render `DuelScene` under):
  - **§A one settlement per fight** — exactly two `onMatchComplete` call sites in the whole scene; both
    inside the victory/defeat effect; `isMatchOver.current = true` in both branches; the string
    `isMatchOver.current = false` nowhere in the file; both settlements delayed by the same bounded
    ceremony (equal, finite, ≤ 5 s).
  - **§B the purse is one object** — the win branch computes `calculateDuelGold` from the opponent's
    bounty and the fight's own hype / perfect blocks / damage taken, writes `purse.total` to
    `statsRef.current.goldEarned` and `purse` to `goldBreakdown` **before** the settlement, and the
    result screen counts up those same three figures verbatim.
  - **§C App's credit** — gold, fame and xp each added exactly once; `fightsWon` / `fightsLost` once
    each on their own branch; the opponent id appended only when absent; **no gold, fame or xp token in
    the loss branch**; exactly two `saveProfile(getProfile)`-shaped writes (one per branch); the tier
    moved only through `resolveVictoryTier` — a boss's first defeat advances, a rematch and a non-boss
    do not.
  - **§D nothing lands after the fight** — both outcome branches call `cancelPendingEnemyAttack()`
    *before* scheduling the settlement; a cancelled strike resolves no impact when the clock is
    advanced past its window and again 10 s later; a stale callback fired after the cancel resolves
    nothing; a second announcement inside one window is refused so exactly one impact follows; the
    unmount cleanup clears the turn timer and cancels the strike; and the engine, the reaction and the
    announce callback all refuse once the latch is set.
  - **§E a defeat pays nothing** — the loss branch writes `goldEarned = 0`, never calls
    `calculateDuelGold` and never sets a breakdown; `calculateDuelGold` totals 0 for a loss at every
    set of statistics tried.
- **No defect was found, so no combat source changed.** The only source edit this pass is a comment in
  `DuelScene.tsx`'s unmount effect (below). Damage, weapon, boss, progression and reward formulas,
  timers and thresholds are untouched, and there is no change to `combatCalculations.ts`,
  `duelRewards.ts`, `pendingStrike.ts`, `tierAdvancement.ts` or `App.tsx`.
- **Correction to the earlier passes' premise — the duel DOES have a leave control.** "The duel itself
  offers no leave control — the only exit is finishing the bout" is wrong. `CombatHUD`'s top-left
  **Armory badge** (labelled with the equipped weapon) calls `onOpenArmory` for the whole fight, and
  App's handler switches to `hub_2d`, unmounting `DuelScene` mid-bout. Three consequences, stated
  rather than fixed:
  1. **Leaving with a strike pending is reachable**, and the cancel path is the one this record already
     pins: `strikeRef.current?.cancel()`, the 1100 ms turn timer cleared, and the engine / reaction /
     announce guards behind `isMatchOver`. It remains **not automatically verified live**.
  2. **Leaving mid-fight records no defeat** — the defeat branch is the only writer of `fightsLost` and
     it needs `player.health <= 0`. A losing gladiator can therefore walk out through the badge. That
     is a **design question** (should the badge confirm, or count as a forfeit?), not a code defect;
     nothing was changed, and it is the next decision owed to the duel's exit.
  3. **The 1400 ms result settlement is deliberately not cancelled on unmount.** The fight is already
     decided when it is scheduled, so its purse (or its defeat) is earned and is kept. The comment now
     says exactly that instead of promising the opposite; cancelling it would rob a legitimately won
     purse, which is the worse failure. **The guarantee that does hold is that it cannot settle
     twice** — the latch is set before the timer is scheduled and is never cleared.
- **Still not verified, and not implied by the evidence above.** The rendered result screen appearing
  exactly once, the payout reaching the saved purse, a defeat's result and its rules, and leaving with
  a strike pending — all four need a live bout this environment cannot reach. They are pinned by the
  suite; **confirm them by winning and by losing one Colosseum duel on a device.** The suite's
  sensitivity to its own values (the mutation check the geometry phases run) was **not** performed:
  every assertion is an ordering or counting predicate over the live source, so it fails on exactly the
  change it describes — reasoned, not demonstrated.
- **Checks actually run (2026-10-20, `web` dev container, on the final tree).** `bun test` →
  **2537 pass / 0 fail, 86 files, 80,017 `expect()` calls** (the preflight baseline was 2517 / 85, so
  this pass adds exactly this suite's 20 tests and its file); `bun run scripts/combatTests.ts` →
  **65 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0**
  with the startup-asset check passing (8 assets); `git diff --check` → **clean** after removing one
  trailing blank line it caught at the end of this file.
- **Three assertions failed on the suite's first run, and all three were mine — the anchors, not the
  code.** Retitling the unmount comment (below) emptied the source slices three tests read
  (`''` receives `toContain`), and `combatResponsiveness.test.ts` pinned the same comment as two of its
  own slice markers. Fixed by anchoring the new suite's unmount slice on **code**
  (`if (resolutionTimerRef.current !== null) clearTimeout(resolutionTimerRef.current);`) instead of
  prose, and by rebasing those two markers in `combatResponsiveness.test.ts` to the new wording with a
  comment naming this pass. **No assertion was removed, relaxed or weakened** — each one now reads a
  boundary it can actually find, which is what it always meant.
- **Files this pass touched: four.** `src/utils/duelResultLifecycle.test.ts` (new), `AGENTS.md` (this
  record and the audit below), `src/components/duel/DuelScene.tsx` (**comment only** — the unmount
  effect's invariant now names what is dropped and what is deliberately kept), and
  `src/utils/combatResponsiveness.test.ts` (**two slice markers only**).

## Living City discovery audit (READ-ONLY — no code changed, no feature implemented)

- **Scope and status.** A read-only audit for the proposed Living City (a shared in-game clock, rotating
  shop stock, rotating Ludus classes, occasional visitors, rare chariot parts, and a readable mobile
  city). **No production file, test, asset, save or collider was touched for this section**; its only
  artefact is the text below. Every claim is traced to source, and the files that were read are named
  in each part.

- **A. Shared in-game clock — DOES NOT EXIST. This is the missing foundational system.**
  - **No clock, calendar, day counter or rest mechanic exists.** `src/utils` has no time module;
    `grep` for `resolveTimeState` finds only a *comment* in `src/services/settings.ts` naming it as an
    idiom, not an implementation. Nothing under `src/` reads `Date.now()` for progression (the one
    hit is `src/utils/webglDebugger.ts`, diagnostics only).
  - **Time is not persisted at all.** `PlayerProfile` (`src/types/game.ts`) carries no time, day or
    calendar field; the save is one localStorage key
    (`sand_and_steel_gladiator_save_v2`, `src/services/storage.ts`).
  - **Time does not advance from any activity.** Exploration: no clock. Combat: `DuelScene`'s
    `matchTimer` / `statsRef.durationSeconds` are per-duel presentation only and are discarded.
    Racing: `RaceScene`'s elapsed clock is per-race and discarded. Travel: fast travel is a teleport.
    Resting: there is no city rest; the duel's `rest` action is a +40 stamina turn and nothing else.
  - **The only "time" in the game is a light preset.** `src/utils/cityLightProfile.ts` holds
    `'day' | 'oathDawn'` and `resolveCityLightProfile()`, selected by App from whether the oath beat is
    up (`oathBeatMode ? 'oathDawn' : undefined`), i.e. by *entry state*, not by time. `src/hooks/useTitlePhaseBackdrop.ts`
    exposes a `dawn` variant whose own header says there is "no day/night state to read (nothing under
    `src/` resolves a …)" and that a real resolver is a later slice. `OATH_SCENE_LABEL` ("Ludus Martial
    Yard · dawn") is copy.
  - **Therefore:** a Living City must **create** the clock first. The house pattern for it is already
    established twice — a pure, total `resolveXState(stored)` plus an event-driven evaluator
    (`evaluateRoadMilestones`, `src/utils/roadMilestones.ts`, called only from `App.handleMatchComplete`
    and `App.enterCity`); no watcher, no interval, no timer. That is the pattern the clock should copy.
  - **Real-world time is currently irrelevant** to progression, so the "do not default to real-world
    time" rule costs nothing to honour — but it does mean nothing exists to fall back on.

- **B. Shops — reusable catalogue, no rotation, no per-visit state.**
  - `src/data/shops.ts` is pure and derived: `StorefrontId` (`forge | armorer | bazaar | merchant |
    market`), `STOCK_PREDICATES` over the item's own fields, `getStorefrontStock(id) → string[]` in
    `ITEMS_DB` order, returning a fresh array. It owns no price or item.
  - `src/components/hub/ShopTab.tsx` renders exactly those ids, grouped into Weapons / Armor, with the
    buy/own/afford logic; App wires `onBuyItem` → `handleBuyItem` and `onSellItem` → `handleSellItem`.
  - `App.handleBuyItem` (`src/App.tsx`) is the whole purchase transaction: `profile.gold < item.price`
    → return; otherwise `inventory: [...profile.inventory, item]`, `setProfile`, `saveProfile`. **It
    permits buying the same id repeatedly** (each purchase is another inventory copy) — pre-existing
    and correct for gear, but it is the reason a rotated slot must record what was bought rather than
    infer it from ownership. Selling (`src/utils/selling.ts`) and tempering
    (`src/utils/tempering.ts`) are pure helpers returning a NEW profile or the caller's own on refusal.
  - **Nothing can reroll today because nothing is random** — the stock is a pure function of the item
    catalogue. **So the reload/duplicate risk is entirely a property of the design that will be added**:
    if the rotation is computed on mount, on shop entry or from `Math.random()`, a reload or a re-entry
    rerolls it and a purchase can be repeated. It must be a pure function of persistable state.
  - Core stock vs rotating slots: `forge` / `armorer` / `market` are the permanent spine (they are what
    progression needs); `merchant` (rare/legendary) and the empty `bazaar` are the natural rotation
    slots; `market` should stay complete so no item becomes unreachable.

- **C. Ludus School classes — cost-per-stat exists; no classes, and two dormant fields.**
  - `src/components/hub/TrainingTab.tsx`: one session costs `25 × profile.level` gold, four stat
    buttons, nothing else. `App.handleTrainStat` is the transaction: gold deducted, `baseStats[stat] + 1`,
    saved. Progression is **permanent and permanent only** — no temporary bonuses, no classes, no
    specialisations, no daily limit.
  - `calculateTotalStats()` (`src/services/storage.ts`) is the single aggregation, and it applies
    `profile.injury` as a strength/agility penalty.
  - **Two dormant fields worth knowing before adding classes.** `PlayerProfile.trainingSessionsLeft`
    is written as `2` at creation (`CharacterCreation.tsx`, `createNewProfile`) and **read nowhere** —
    a ready-made per-period limit, or dead residue. `PlayerProfile.injury` (`fightsRemaining`,
    penalty fields) is **read** by `calculateTotalStats` but **written nowhere and never decremented**,
    so a save that ever carried an injury would carry it forever. A rest/day system is the natural
    owner of both; today neither is wired, and nothing should assume otherwise.
  - Classes should therefore be **offerings over the existing `handleTrainStat` transaction** (same gold,
    same +1, same save path) with eligibility and price modifiers — not a second training or stat system.

- **D. Rare NPCs and city events — no NPC/event system exists; the trigger pattern does.**
  - `src/utils/cityCollisions.ts` holds `HUB_LOCATIONS` (**21 entries**: id, position, radius, prompt,
    `tabKey`, optional `subTab`, `shopId`, colour, district). `getNearbyHubLocation(pos)` scans all 21
    discs and returns the **nearest containing** one (a C-8.47 rule). `CityHubScene` calls it every
    frame and raises that hub's prompt; interacting opens a tab or a modal.
  - There is **no NPC entity, no dialogue system, no schedule, no event queue, no visit history**.
    Persistence of "has this happened" has exactly two precedents: `profile.defeatedOpponentIds` and
    `profile.road.milestonesSeen` (ids of road stages already *shown*), both plain string arrays on the
    profile. `profile.story` is a read-only derived campaign view.
  - Notifications exist: `src/utils/cityHerald.ts` + `HeraldToast` (cries) and the city's 4 s notices —
    but the herald lives in **`sessionStorage`** (`sand_and_steel_herald_v1`), so it is a display
    mechanism, **never** the record that an event happened.
  - **Reroll risk, stated precisely:** a visitor's stock must be a pure function of (`day`, visitor id,
    slot) so that leaving and re-entering, or reloading, cannot produce a better roll; and the visitor's
    arrival window must be a pure function of `day` so a reload cannot re-roll *which* visitor appears.
    Both need the clock from part A and a persisted `day`, not `Date.now()`.

- **E. Chariot — one ownership model already extends cleanly.**
  - Ownership: `PlayerProfile.chariot?: ChariotLoadout` = `{ owned: string[]; equipped: { wheels;
    finish } }` (`src/types/game.ts`). Catalogue: `src/data/chariotParts.ts` (`ChariotPart` with
    `slot`, `price`, `defaultOwned`, finish overrides; 7 parts across 2 slots). Transactions:
    `src/utils/chariotLoadout.ts` (`purchaseChariotPart`, `equipChariotPart` — pure, refusal-safe), wired
    through `App.handleBuyChariotPart` / `handleEquipChariotPart`, each `setProfile` + `saveProfile`.
  - Team progression is a **separate, also-optional** model: `profile.racing?: RacingProgression` =
    `{ unlocked?: number[]; selected?: number }` with `RACING_CONFIGS` / `purchaseRacingConfig` /
    `selectRacingConfig` in `src/utils/racingProgression.ts` (Biga free, Triga 750, Quadra 1,500).
  - Rare chariot parts should therefore be **new `ChariotPart` entries (or a third slot) in the same
    catalogue**, owned through the same `owned[]` array and the same `purchaseChariotPart` rule — never a
    parallel inventory, never a second currency. Note the racing plan's own constraint: the team
    formation (`chariotTeamFormation.ts`) and the fit decisions are still unapproved, so a "rare
    component" that changed geometry would collide with an open design decision.

- **F. Mobile performance and city presentation — the budget rules already exist.**
  - `src/services/settings.ts` `CITY_TIERS` give per-preset DPR bands and a **dust count** (90 / 60 / 0);
    `src/hooks/useAdaptiveDpr.ts` adapts DPR inside the band from a trimmed frame-time EMA. The city's
    Canvas takes `dpr={cityDpr}`.
  - The city's own render discipline: static meshes with `matrixAutoUpdate = false`, shared materials,
    no per-frame `useState`; the only per-frame React-visible work is `getNearbyHubLocation` (21
    distance comparisons) and the movement loop.
  - **Therefore:** visible visitors should be a small number of static meshes whose *visibility* is a
    render-time predicate over the persisted day (`visible={visitor.activeToday}`), with their own
    `HUB_LOCATIONS`-style disc for the prompt — no mixers, no per-visitor animation loops, no always-on
    effects, no new lights. Notifications reuse `HeraldToast`. The one caution: `HUB_LOCATIONS` is
    already a nearest-wins scan of 21 discs, so visitor discs must be added sparingly and must not
    overlap an existing door (the C-8.47 hijack rule).

- **Persistence and migration patterns (all of the above rests on these).** One key
  (`sand_and_steel_gladiator_save_v2`), whole-profile JSON, `saveProfile` on every mutation; the Google
  Drive path serialises the entire profile. **No migration has ever been written**: every feature added
  since has used an **optional field** with a total resolver (`chariot`, `racing`, `temper`, `road`,
  `story`), and a missing/garbage value resolves to a defined default rather than being repaired. A
  Living City must follow that exactly — one new optional field, resolved totally, written only by a
  successful action.

- **Existing tests and the missing coverage.** Baseline on this HEAD: **2517 pass / 0 fail, 85 files**.
  Relevant suites: `storefrontCatalogue`, `storefrontWiring`, `selling`, `tempering`, `phaseC8_66b/c/d`
  (chariot shop), `phaseC8_67b` (racing), `duelRewards`, `duelResultLifecycle` (new, above),
  `tierAdvancement`, `rank`, `roadOfGlory`, `roadMilestones`, `storyState`, `settings`,
  `adaptiveDpr`, `motionTokens`, `cityHerald`'s consumers. **Missing entirely:** anything about time,
  day advancement, rotation determinism, per-day limits, visitor scheduling, or event history — there
  is no system to test yet.

- **Risks to design against (each one traceable to the code above).** (1) **Rerolls** — entry/reload
  rerolling stock or visitors if the roll is not a pure function of persisted `day` + slot + seed.
  (2) **Duplicated purchases** — `handleBuyItem` has no per-slot record; a rotated slot needs one, or a
  reload plus a re-entry can buy the same roll twice. (3) **Stale timers** — the repo's hard-won rule
  (the `pendingStrike` cancel discipline, the RG-3 event-driven milestone evaluator) is "no watcher,
  no periodic timer"; a Living City must schedule from `day`, not from `setInterval`. (4) **Save
  compatibility** — optional field only; a legacy save must resolve to day 1 with nothing visited.
  (5) **Mobile** — no per-visitor frame work, no new lights, no unbounded disc scans.
  (6) **Dead fields** — `trainingSessionsLeft` and `injury.fightsRemaining` are read/written
  asymmetrically today; a day/rest system is the right owner for them, and a class system must not
  silently rely on either being wired.

- **Deliverable 1 — reusable as-is.** `ITEMS_DB` and the item fields; `src/data/shops.ts`'s predicate
  style and `getStorefrontStock`'s purity; `ShopTab`'s rendering/buy/own/afford logic; the pure
  transactions `purchaseChariotPart` / `equipChariotPart` / `purchaseRacingConfig` / `sellItem` /
  `purchaseTemper` and App's `setProfile` + `saveProfile` pattern; `TrainingTab` + `App.handleTrainStat`
  (cost `25 × level`, `baseStats + 1`); `CHARIOT_PARTS` + `ChariotLoadout` + `RacingProgression`;
  `HUB_LOCATIONS` + `getNearbyHubLocation`'s nearest-wins rule and the interaction prompt; `HeraldToast`
  / `cityHerald` for notifications; `CITY_TIERS` / `useAdaptiveDpr`; and the optional-field +
  total-resolver persistence pattern.

- **Deliverable 2 — requires modification.** `getStorefrontStock` (needs `(storefrontId, day)` so a
  rotation is a pure function, with the permanent spine untouched); `ShopTab` (render the day's slots
  and say when they change); `App.handleBuyItem` (record a per-slot purchase against the day);
  `TrainingTab` (offer the day's classes, still calling `handleTrainStat`); `CityHubScene` +
  `cityCollisions` (visitor discs and their prompts, sparingly); `PlayerProfile` (one new optional
  field); and `cityLightProfile` — the natural consumer of a day phase, which today has only `'day'`
  and `'oathDawn'`.

- **Deliverable 3 — the missing foundational system.** **The shared in-game clock**: a persisted day
  counter, one pure `advanceCityDay`-style transition, and one named set of event sites that call it
  (the same shape as RG-3's two call sites). Everything else in the vision is a consumer of it.

- **Deliverable 4 — proposed implementation sequence, each phase independently testable.**
  1. **L1 — the clock.** `profile.city?: { day: number }` (optional, resolved to 1), a pure
     `resolveCityState` + `advanceCityDay(state)` and **one** `advanceDay` call site wired to a single
     existing event (the duel result is the most defensible: it is already the credit point). No UI
     beyond the day's own readout. Tests: default for a legacy save, one increment per settlement, no
     increment on a repeated evaluation, monotonic and clamped.
  2. **L2 — deterministic rotation resolver.** A pure `rotatedStock(storefrontId, day)` over
     `getStorefrontStock`, with a documented hash (below). Tests: stable across calls and reloads,
     changes only at a day boundary, covers the pool over N days, never removes the permanent spine.
  3. **L3 — the shops.** `ShopTab` renders the day's slots; purchases are recorded per slot+day so a
     reload cannot re-buy. Tests: buy once per slot per day, refused second time, stock identical
     across a simulated reload.
  4. **L4 — the Ludus classes.** Day-scoped offerings over the existing `handleTrainStat`, with
     eligibility (level/gold, and the dormant `trainingSessionsLeft` if it is adopted) and a stated
     bonus rule; permanent +1 remains the only stat effect.
  5. **L5 — visitors.** A small visitor catalogue with an arrival window derived from `day`, a
     persisted `seenVisitors` / `completedVisitors`, their own stock resolved by the L2 hash, and one
     optional, non-progression-critical offer each. Tests: arrival is stable for a day, a completed
     visit cannot be repeated, and the core progression path is reachable with zero visitors.
  6. **L6 — rare chariot parts.** New `ChariotPart` entries in the existing catalogue and `owned[]`,
     sold only by the relevant visitor, through the existing purchase rule.
  7. **L7 — city presentation & performance.** Static visitor meshes gated on `activeToday`, prompts via
     the existing disc rule, one herald cry; measured against the existing city tiers (no new lights,
     no per-frame React).
- **Deliverable 5 — suggested data models and deterministic scheduling rules.**
  - `PlayerProfile.city?: { day?: number; seenVisitors?: string[]; completedVisitors?: string[];
    boughtSlots?: string[] }` — every member optional; a missing object resolves to day 1 with empty
    lists. One field, written only by a successful action.
  - **Deterministic slot rule:** `index = fnv1a(`${dayBucket}:${storefrontId}:${slotIndex}`) % pool.length`,
    where `dayBucket = floor(day / periodDays)`; a small integer hash implemented in-repo (no new
    dependency), pure, and identical on every device and reload. `periodDays` is per storefront
    (e.g. 1–3), never a real-world clock.
  - **Purchase record:** `boughtSlots` entries of the form `${dayBucket}:${storefrontId}:${slotIndex}`,
    so the same roll cannot be bought twice, and the record stays small.
  - **Visitor rule:** a visitor is active when `fnv1a(`${day}:${visitorId}`) % cadence === 0` inside its
    own window, and its offers are resolved by the same slot hash; completion is recorded in
    `completedVisitors` and excludes it permanently.
- **Deliverable 6 — acceptance criteria and regression tests per phase.** L1: a legacy save resolves to
  day 1; exactly one increment per settlement; no increment on a repeated evaluation. L2: byte-identical
  stock for the same (`dayBucket`, storefront, slot) across calls and a simulated reload; different on
  the next bucket; the union over many buckets covers the pool; the permanent spine is invariant. L3:
  one purchase per slot per day, a second refused with no gold moved; a reload shows the same stock and
  the same purchase state. L4: the day's offering is stable, a class call is the existing +1 transaction,
  and an ineligible class is refused before any gold moves. L5: an arrival is stable for a day, a
  completed visit cannot repeat, and a "no visitors ever" run still reaches the next tier. L6: a rare
  part is owned once, equips through the existing rule and never bypasses a price. L7: the city's frame
  cost does not depend on the number of visitors (visibility only), and no new light or mixer is added.

- **Nothing was implemented, and no save was touched.** This section is analysis only; the next step is a
  decision on the clock's advance events (part A), because every other phase reads it.

## Living City L1 — foundational in-game clock (implemented)

- **Scope, and what this phase deliberately is not.** The first step of the audit's own sequence
  (Deliverable 4, item 1): one optional `profile.city.day`, one authoritative resolver, one pure
  advance, and exactly one call site in the existing settlement path. **No rotation, no classes, no
  visitors, no rare chariot parts, no encounters, no UI, no rest button, no lighting change, no shop,
  training, chariot, NPC, combat or reward change, no timer, no interval, no real-world clock.** The
  clock is a passive progression primitive; nothing reads it for behaviour yet.

- **Preflight (measured, not assumed).** Branch `development-focus-strategy`, HEAD **`070252c4b0`**,
  `git status --porcelain` **empty** and `git diff` empty before the first edit. The branch's own
  baseline suite read **2537 pass / 0 fail (86 files)** — the `duelResultLifecycle` record's count —
  and this phase ends at **2567 / 87**, the delta being this phase's own suite. Nothing in the tree
  was stashed, reverted or overwritten.

- **The data model — one field, optional on purpose.** `src/types/game.ts` gains
  `CityState { day?: number }` and `PlayerProfile.city?: CityState`, declared exactly like
  `chariot`, `racing`, `temper`, `road` and `story`. A new profile starts at **day 1 by resolution**:
  `createNewProfile()` still writes **no** `city` field (the house rule for every optional slice), and
  there is **no migration** — a legacy save is never rewritten just to gain the field.

- **`src/utils/cityClock.ts` (new) is the whole clock, and it is pure.** No React, no storage, no
  timers, no `Date`, no randomness (asserted over comment-stripped source):
  - `CITY_DAY_START = 1`, `CITY_DAY_MAX = Number.MAX_SAFE_INTEGER`;
  - `normalizeCityDay(value)` — the one validity rule: anything that is not a finite number, and any
    value below 1 (zero, negatives), resolves to **day 1**; a fraction is **floored** (`3.7 -> 3`,
    `0.9 -> 1`); the value is **capped** at the largest safe integer, so no later `+ 1` can leave the
    safe range;
  - `resolveCityDay(profile)` — **the single authoritative reader** (there is no second counter and
    nothing else in the app resolves a day);
  - `nextCityDay(profile)` / `advanceCityDay(profile)` — exactly **one** day later, returning a **new**
    profile with a **new** `city` object. Every unrelated field is carried over (by identity for the
    nested records), a future member already stored inside `city` survives the advance, and the input
    profile is never mutated.
  A malformed `city` **container** (a string, a number, an array, `true`) is ignored rather than spread
  into the new state, so a hand-edited save cannot smuggle junk keys forward.

- **The one event that spends a day: a completed duel's settlement.** `App.handleMatchComplete` — the
  same handler that credits gold/fame/xp, the fight count, the tier and the road's rituals. The
  advanced clock is computed **once**, before the outcome branches, and carried into **whichever
  branch settles the fight**:
  `const city = advanceCityDay(profile).city;` -> `city,` in both the victory and the defeat profile
  literals -> the existing `saveProfile(settledProfile)`. So it lands in the **same** profile update
  the duel already persists (no second write that could race or overwrite the purse), and victory and
  defeat each count as exactly one completed duel.

- **Exactly-once, enforced at two levels, and the latch is App's own.** `DuelScene`'s `isMatchOver`
  latch already refuses a second outcome; App now also carries `duelSettledRef` (a `useRef`, view
  lifetime, saved nowhere): `if (duelSettledRef.current) return; duelSettledRef.current = true;` runs
  **before** the clock is computed, so a callback that fires twice, a StrictMode remount or a stale
  delayed `setTimeout` cannot credit the fight or turn the day again. It is cleared in exactly one
  place — `handleEnterDuel`, the only route onto the duel screen — so a **new** bout re-arms it and a
  repeated callback for the same bout cannot. Merely opening, leaving (the HUD's Armory exit) or
  cancelling a duel never reaches the settlement and therefore never advances the day.

- **Backward compatibility, measured through the real save path.** A pre-L1 save is JSON with no
  `city` field: it loads unchanged (`saveProfile`/`loadSavedProfile` round trip is **byte-identical** —
  loading never rewrites it), resolves to **day 1**, and its first completed duel writes `day: 2`. The
  Drive path needs nothing: `googleDrive.ts` serializes the whole profile with no field whitelist. The
  changed profile is still a plain whole-profile JSON write under the one existing key
  (`sand_and_steel_gladiator_save_v2`).

- **Files changed — four.** `src/types/game.ts` (the `CityState` interface and the optional `city`
  field, with the "one clock, resolved totally, never written by a migration" contract in the docs);
  `src/utils/cityClock.ts` (**new**); `src/utils/cityClock.test.ts` (**new**, 30 tests); `src/App.tsx`
  (the `useRef` import, the `advanceCityDay` import, the `duelSettledRef` declaration, the re-arm in
  `handleEnterDuel`, and the settle-side latch + one `city` computation carried into both branches).
  Plus this record.

- **Regression suite: `src/utils/cityClock.test.ts` — 30 tests / 157 `expect()` calls**, in the
  repo's two registers (behaviour for pure logic, ordered source assertions for React wiring):
  §A the resolver — a new profile and a legacy save both read day 1, fifteen malformed shapes
  (`undefined`, `null`, `{}`, `'3'`, `true`, `[]`, `NaN`, `Infinity`, `0`, `-7`, `-0.5`, ...) all
  normalize, malformed containers are not spread, valid values round-trip, and exactly one `city?:`
  field exists on the profile type; §B advancing — 1 -> 2, a legacy save advances too, 25 successive
  advances are exactly 2...26, corrupt inputs never yield an invalid day, the ceiling holds and stays a
  safe integer, the input is untouched (profile *and* `city` object), every unrelated field survives
  by identity, a future `city` member survives, one completed duel advances once for **both** a win
  and a loss, a replayed settlement cannot compound while a genuinely new bout does, and the module
  names no storage/clock/timer/React token; §C persistence — the legacy round trip is byte-identical,
  a settled duel reloads at day 2, a raw pre-L1 JSON string under the real key reads as day 1, and the
  cloud serialization keeps the day; §D the wiring — `advanceCityDay` appears exactly **once** in the
  credit handler and **zero** times in either outcome branch, both persisted literals carry `city`,
  the two existing `saveProfile`/`setProfile` calls per branch are unchanged and no extra save exists,
  the latch is checked -> set -> used in that order and cleared in exactly one place, entering /
  leaving / dismissing never advances, `handleEnterDuel` is the only re-arm, the handler is the only
  `onMatchComplete`, and `advanceCityDay` is the application's only call site with no `setInterval`
  anywhere in `App.tsx`.

- **Checks actually run (2026-10-20, `web` dev container, on the final tree).** `bun test` ->
  **2567 pass / 0 fail (87 files, 80,174 `expect()` calls)** (baseline 2537 / 86 -> the delta is this
  suite's 30 tests and its file); `bun run scripts/combatTests.ts` -> **65 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) -> **exit 0**; `bun run build` -> **exit 0** with the startup-asset
  check passing (8 assets in `public/` and `dist/`, the pre-existing >500 kB chunk warning only);
  `git diff --check` -> **clean**. No existing assertion was touched, weakened or deleted — no other
  test file changed at all.

- **Live evidence, and what is NOT verified.** The dev server serves the changed modules (the
  transformed `/src/utils/cityClock.ts` carries `advanceCityDay`/`resolveCityDay`, and
  `/src/App.tsx` carries **one** `advanceCityDay(profile)`, **one** `duelSettledRef.current = true`
  and **one** `= false`), and the app boots to its title screen (`PLAY`, `ACCOUNT`, Alpha 1.0) with
  **0 console errors** on an anonymous preview. **The day advance itself is NOT automatically verified
  live:** it can only happen by finishing a duel, and this environment cannot reach one — the route
  (title -> creation -> 3D city -> Colosseum -> pre-fight -> "Step into Sand" -> a ~10-exchange fight)
  costs far more than the preview tool's 30 s script budget at SwiftShader's ~1-2 fps, which is the
  same limit the `duelResultLifecycle` final pass recorded (its character sheet alone timed out). The
  exactly-once rule is therefore pinned by the suite (the pure replay test and §D's source ordering)
  rather than observed. **Device check owed:** win one Colosseum duel and lose one, and confirm the
  save gains `city.day` **2** after the first and **3** after the second (`localStorage` key
  `sand_and_steel_gladiator_save_v2`), that leaving mid-bout through the HUD's Armory badge leaves the
  day unchanged, and that a pre-existing save starts at day 1.

- **Risks and limitations, stated rather than buried.** (a) Nothing consumes the day yet — L2's
  rotation resolver is the first reader, so a wrong day would currently be invisible in play and only
  visible in the save. (b) The clock advances on **duels only**; racing, travel and training do not
  spend a day, which is a deliberate L1 choice (one authoritative event, per the audit) and not an
  oversight — adding a second site is a later, explicit decision. (c) A save that arrives with a huge
  or fractional `day` (a hand edit) is normalized on read, never repaired on write, so the stored value
  stays as it was until the next completed duel. (d) The training/injury dormant fields
  (`trainingSessionsLeft`, `injury.fightsRemaining`) are still unwired; the clock is the owner they
  were waiting for, but nothing decrements them in this phase.

### L1 verification gate — settlement idempotency and profile persistence (implemented)

- **Scope.** A verification-first pass over L1 *before* L2: audit the settlement latch, the profile the
  settlement writes, and the day advance, then fix only a concrete defect. No L2 work, no day/night
  visual, timer, shop, rotation, class, rest mechanic, NPC, combat, reward, progression or save-key
  change, and no migration. The Living City audit and the L1 record above are preserved verbatim.

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`fcd0309`**
  ("Implement city day clock logic"), `git status --porcelain` **empty** and no diff before the first
  edit; the tree was clean after every later step too (no reset, stash or overwrite). The baseline
  suite read **2567 pass / 0 fail (87 files)**, the figure the L1 record ended on, so the L1 report's
  description matched the code that actually shipped — **no material discrepancy** was found.

- **Audit result: one concrete defect, in the latch's identity.** `DuelScene` reports an outcome
  `1400 ms` after the deciding blow (`setTimeout` in its victory/defeat effect), and that timer
  deliberately survives unmount so an Armory exit cannot drop an earned purse. The L1 latch was a
  boolean checked and set in `App.handleMatchComplete` and cleared only in `handleEnterDuel`, so it
  answered "has anything settled since the last bout began?" — which cannot distinguish **a repeated
  callback for the same bout** (it refuses those correctly) from **a callback for a bout that has
  already finished** (it does not): if the player exits through the HUD's Armory badge after the
  deciding blow and a new bout is entered before that timer fires, `handleEnterDuel` re-arms the
  latch, the stale callback then consumes it and settles the *old* bout, and the **new** bout's own
  settlement is dropped — no purse and no day for it — while its result modal would also have shown
  the previous bout's outcome. The window is ~1.4 s and needs several navigation taps, so it is not
  humanly reachable in normal play today, but the architecture could not tell the two callbacks
  apart, which is exactly the property this gate exists to establish.

- **The correction is identity, not a new mechanism: one small pure module plus the id threaded
  through the existing callback.** `src/utils/duelSettlement.ts` (new) exports
  `createDuelSettlementLatch()` → `{ arm(), currentId(), claim(id) }`; ids are 1-based and `claim(id)`
  is true **at most once per id**, only for an **armed** id, and only **in increasing order**
  (`id > current || id <= settled` is refused). `App` holds one latch in a `useRef` (view lifetime,
  never saved), `handleEnterDuel` is still the only arm site (`setDuelId(duelSettlementRef.current.arm())`),
  and the callback handed to the scene is
  `onMatchComplete={(stats, didWin) => handleMatchComplete(stats, didWin, duelId)}` — so every
  callback **names the bout it belongs to**. `DuelScene` is **unchanged**: its `(stats, didWin)`
  signature, its `isMatchOver` guard and its two call sites are exactly as they were, so a scene
  remount cannot re-declare the token. Consequences, all pinned: a repeated callback for the same
  bout is refused; a callback naming a bout that never existed is refused; a previous bout's late
  callback settles **its own** purse and one day and can never settle the current bout; and a
  callback whose bout already settled is refused even if a newer bout is in progress, so an
  out-of-order arrival cannot write an older snapshot over newer data. The claim is the first
  statement after the null-profile guard, so a refused settlement never reaches the clock.

- **Profile freshness and persistence — audited, unchanged.** The settlement reads the `profile`
  React state captured by the callback identity from the render in which the scene's outcome effect
  ran; rewards are applied in the two outcome branches, the clock is computed **once** before them
  (`const city = advanceCityDay(profile).city;`), and both branches build **one** `updatedProfile`
  that carries `city` alongside gold/fame/xp/level/tier/defeats — then `evaluateRituals` (which
  spreads `after`, so `city` survives) and **one** `setProfile` + **one** `saveProfile` per
  settlement. `saveProfile` writes the whole profile as JSON under the one existing key
  (`sand_and_steel_gladiator_save_v2`), and the Drive path serializes the whole profile with no field
  list, so `city.day` rides both unchanged. A stale snapshot could only be written inside the same
  ~1.4 s window analysed above, where the ordering is fixed (the old bout's timer is always scheduled
  before the new bout can begin), so the latch change leaves no reachable lost update; the App-level
  ordering is pinned by source assertions, not executed, because this repo has no DOM renderer.

- **Files changed — four (one production path, one new module, two suites).**
  `src/utils/duelSettlement.ts` (**new**, the latch); `src/App.tsx` (the import, the latch ref plus
  `duelId` state, the arm in `handleEnterDuel`, the third handler argument and its `claim` guard, the
  inline `onMatchComplete` adapter); `src/utils/duelSettlement.test.ts` (**new**, 20 tests);
  `src/utils/cityClock.test.ts` (**rebased, not weakened** — the three §D assertions that named
  `duelSettledRef` now pin the id-aware claim/order, the single arm site and the id-carrying
  callback, and one `onMatchComplete` regex became an exact-match assertion). No save format, key,
  combat, reward or progression rule changed.

- **Regression suite: `src/utils/duelSettlement.test.ts` — 20 tests / 214 `expect()` calls.**
  §A the latch (ids count up; one claim per bout; unarmed, fractional, `NaN`, `Infinity` and future
  ids refused; an older bout refused once a newer one settled; a late callback for the previous bout
  accepted while the new bout is unsettled, and the new bout still settles itself; arming never
  resurrects a settled id). §B the settlement it guards, through a **mirror** of App's arithmetic
  (victory 1 → 2 exactly once with its purse and a refused replay; defeat 2 → 3 exactly once with no
  purse; a new bout after a completed bout settles normally; a stale callback settles its own bout
  and never the current one, which then settles itself, with the stale one inert afterwards; a replay
  arriving after a new bout began is refused; abandoning before settlement leaves day and gold
  untouched; the day and the rewards arrive in the **same** object and survive **one** real
  `saveProfile`/`loadSavedProfile` round trip with only the one key present; a legacy save with no
  `city` stays byte-identical on load and writes day 2 on its first settlement; the Drive-style
  whole-profile JSON keeps both). §C the wiring (handler names its bout, claims once, before the
  clock; the adapter carries `duelId` from state set only on entry; one latch instance, one arm site,
  no reset on dismissal or navigation; `DuelScene` still reports `(stats, didWin)`, never passes a
  third argument, and names no latch; the module imports no React, storage, timer, `Date` or
  randomness).

- **Checks actually run (2026-10-20, `web` dev container, on the final tree).** `bun test` →
  **2587 pass / 0 fail (88 files, 80,281 `expect()` calls)** (baseline 2567 / 87 → the delta is this
  suite's 20 tests and its file); `bun run scripts/combatTests.ts` → **65 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup-asset
  check passing (8 assets, the pre-existing >500 kB chunk warning only); `git diff --check` →
  **clean**. No existing assertion was deleted or relaxed — the three `cityClock` §D pins were
  rebased onto the new wiring and one regex became an exact match.

- **Live evidence, and what is NOT verified.** The dev server serves the change (the transformed
  `/src/utils/duelSettlement.ts` carries `createDuelSettlementLatch`, `/src/App.tsx` carries
  `setDuelId(duelSettlementRef.current.arm())`, `duelSettlementRef.current.claim(settledDuelId)` and
  **exactly one** `advanceCityDay(profile)`), and the app boots to its title screen (`PLAY`, `ACCOUNT`,
  Alpha 1.0) with **0 console errors and 0 failed requests** on an anonymous preview. **No duel was
  played, so no settlement was observed live:** the preview had no save and the route (title →
  creation → 3D city → Colosseum → pre-fight → a many-exchange fight) exceeds the preview tool's
  script budget at SwiftShader's ~1–2 fps — the same limit the L1 record and `duelResultLifecycle`
  recorded. Startup is therefore *not* evidence of settlement behaviour, and the exactly-once and
  stale-callback rules rest on the suite plus §C's source ordering. **Device check still owed:** win
  one duel and lose one, confirming `city.day` reads **2** then **3** in
  `sand_and_steel_gladiator_save_v2` with the purse credited in the same write, that leaving mid-bout
  through the Armory badge leaves the day unchanged, and that a pre-existing save still starts at
  day 1.

- **Remaining limitations.** (a) The App-level orchestration is verified by source assertions plus a
  behavioural mirror, not by executing React — this repo has no DOM renderer and its suites use that
  two-register convention throughout. (b) The latch is per App instance and per page load, which is
  sufficient because a settlement call is a `setTimeout` in the same document; a full page reload
  cannot deliver one. (c) Nothing consumes the day yet (L2 is the first reader), so a wrong day is
  still visible only in the save. (d) `trainingSessionsLeft` and `injury.fightsRemaining` remain
  unwired, as L1 recorded.

### L1 final identity audit — callback closure, verified behaviourally (audited, no production change)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`a159c665ca`**,
  `git status --porcelain` **empty** and no diff before the first edit; the tree stayed clean after
  every step (nothing stashed, reverted or overwritten). The working tree matched the L1
  verification gate's shipped code: `src/utils/duelSettlement.ts`, the `duelId` state, the single
  arm site and the id-carrying `onMatchComplete` adapter are exactly as that record describes, so
  no material discrepancy was found.

- **Verdict: the L1 identity fix PASSES; no production wiring was changed.** The six properties the
  audit had to establish, each traced to the exact mechanism:
  1. **Every duel gets a stable, unique id.** `handleEnterDuel` — the only route onto the duel
     screen — calls `duelSettlementRef.current.arm()` and stores the result in `duelId` state; the
     latch is one `useRef` for the App's lifetime and its counter only ever increments, so 50 bouts
     yield exactly ids 1…50 with no reuse.
  2. **The callback is captured at render time, not read at invocation time.** The scene receives
     `onMatchComplete={(stats, didWin) => handleMatchComplete(stats, didWin, duelId)}` — an arrow
     closed over that render's `duelId` **state**. Nothing in the path reads a mutable
     latest-id ref, and `DuelScene` knows no id at all (its `onMatchComplete(stats, didWin)`
     signature is unchanged, and its `setTimeout` holds the closure React gave it).
  3. **A stale callback cannot impersonate a newer bout.** §D of `duelSettlement.test.ts` now
     **executes** the pattern (a closure-bound app model, not a source assertion): bout A's
     callback, fired after bout B has started, settles A's own purse and one day, leaves the latch
     pointing at B, and B still settles itself. A **control** runs the rejected "read the current id
     at call time" wiring through the same model and shows it would consume B's token and lose A's
     purse — so the test discriminates between the two designs rather than agreeing with itself.
  4. **Settlement stays idempotent per bout.** `claim(id)` is true at most once per id; a replay
     hands back the caller's own profile object (asserted by identity in §D and §B).
  5. **A duel cannot settle unless its id was armed** — future ids, `0`, negative, fractional,
     `NaN` and `Infinity` are all refused (§D).
  6. **Starting a new duel does not invalidate an earned pending result**, and **the id lifecycle
     cannot collide or reset** inside a session (§D's 50-bout test).

- **What the audit deliberately did not change.** `DuelScene`'s combat timing, its 1400 ms result
  delay, the wind-up windows, `handleMatchComplete`'s arithmetic, the save shape and the one storage
  key are exactly as L1 shipped. One documented limit stands: a callback for A arriving **after** B
  has already settled is refused (out of order) because it would replay an older profile snapshot —
  that is the designed trade-off, and it is pinned as a test rather than left implicit.

- **Files changed this phase: one suite** (`src/utils/duelSettlement.test.ts` — the new §D,
  5 tests). No production file. `bun test src/utils/duelSettlement.test.ts` → **25 pass / 0 fail**.

## Living City L2 — deterministic day-based rotation foundation (implemented; no shop wiring)

- **What ships.** `src/utils/cityRotation.ts` (new, pure) and `src/utils/cityRotation.test.ts`
  (new, 20 tests). **No shop screen, purchase handler, stock persistence, daily limit, transaction
  record, training schedule, rest mechanic, NPC, day/night visual, timer, combat, reward or save
  change** — and no save key or migration: the rotation is *derived* from the saved day, never
  stored, so it is identical after a reload and on a local or a Drive save alike.

- **The contract.** `resolveCityRotation(profile)` → `{ day, storefronts }`, where
  `storefronts[id] = { storefront, rotates, slots, itemIds }`. The day is
  `resolveCityDay(profile)` from `utils/cityClock.ts` — the one clock, with no second reader and no
  wall clock; `rotateStorefrontStock(id, day)` takes an explicit day (normalized through the same
  `normalizeCityDay`) for a caller that already has one. Selection is a contiguous window of the
  storefront's **eligible** list, its start an FNV-1a hash of `sand-and-steel:city-rotation:${id}:${day}`
  mod the pool length, re-sorted into `ITEMS_DB` order: same day + same inputs → same window; the
  next day → a different window; no randomness, no time, nothing persisted.
  **Eligibility is `getStorefrontStock(id)`, unchanged and authoritative** — rotation only selects
  from it, so it can never offer an item the storefront does not stock.

- **Supported categories (exactly what L2 covers).**
  - **`merchant` — ROTATES**: `MERCHANT_ROTATION_SLOTS = 4` of its **13** rare/legendary goods are
    on offer each day (tuned constant, not a rule; the pool is 13, so the window is ~31 % of it).
  - **`forge` (10), `armorer` (16), `market` (27) — do NOT rotate**: they resolve to exactly
    `getStorefrontStock(id)`, so wiring a later phase's shop screen to this resolver cannot change
    what those shops sell. `market` stays complete so no item is ever unreachable.
  - **`bazaar` — empty on every day** (its consumables are a later phase); an empty list is the
    correct answer, not a rotation.
  The slot table is a `Record<StorefrontId, number | null>`, so a newly added storefront is a type
  error here rather than a silently non-rotating shop; `ROTATING_STOREFRONTS` is derived from it.

- **Measured behaviour (the suite's own numbers).** Day 1's merchant window is
  `helm_centurion, chest_golden_muscled, arms_manica_steel, arms_galerus_gilded`; day 2 differs;
  days 1–13 produce **9** distinct windows (the hash wraps the pool, so a collision is expected and
  harmless); over days 1–40 **every one of the 13 merchant goods appears** at least once, so nothing
  is rotated away permanently; `3.7 → 3`, and `'7'`, `true`, `NaN`, `Infinity`, `0`, `-7`, `-0.5`,
  `null`, `{}`, `[]` all resolve to day 1 — exactly as `resolveCityDay` resolves them.

- **Regression suite: `src/utils/cityRotation.test.ts` — 20 tests**, in the repo's two registers:
  §A stability (repeated calls equal, fresh arrays, 25 consecutive calls byte-identical, a fresh
  resolution repeats it, the day-1 window pinned, catalogue order kept, no duplicates); §B day
  sensitivity (day 1 ≠ day 2, ≥ 2 and measured 9 distinct windows in 13 days, full-pool coverage over
  40 days, order-independent); §C the clock (legacy profile → day 1, eleven malformed day values
  matching `normalizeCityDay`, fractional flooring, malformed `city` containers ignored, and the
  module naming no `Date` / timer / storage / randomness and importing the clock); §D eligibility
  (every id stocked by its own storefront and resolvable via `getItemById`, merchant window
  rare/legendary only, the three permanent storefronts exactly equal to `getStorefrontStock` on five
  days, bazaar empty, `merchant` the only rotating category, forge still excluding the starter);
  §E purity and scope (profile and its `city` object untouched by identity and JSON, `ITEMS_DB`
  byte-identical after 60 resolutions despite callers mutating the returned arrays, no id/price/
  rarity table of its own, and `ShopTab` / `GladiatorSchoolHub` / `CityHubScene` / `App` naming
  `cityRotation` nowhere — the proof that shop behaviour is unchanged).

- **Boundaries honoured.** No `ShopTab`, purchase handler, `App` wiring, saved value, item, price,
  eligibility rule, collider or asset was touched. Nothing consumes the resolver yet — that is L3's
  job, and wiring it is an explicit later decision.

- **Verified 2026-10-20** in the dev container on the final tree: `bun test` → **2616 pass / 0 fail
  (89 files, 80,792 `expect()` calls)** — this phase contributes 25 tests (the new
  `cityRotation` file's 20 plus the 5 added to `duelSettlement`), so the branch tip carried 2591 /
  88 before it by arithmetic; the L1 record's own 2587 was measured at `fcd0309`, an earlier
  commit, and is not this HEAD's baseline. `bun run scripts/combatTests.ts` → **65 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup-asset
  check passing (8 assets; the pre-existing >500 kB chunk warning only); `git diff --check` →
  **clean**. The day/rotation numbers above were produced by a throwaway harness in the container
  importing the shipped module, not by a test that agrees with itself.

- **Not verified / limitations.** (a) **No live duel was played and no live day was advanced** — the
  audit and the rotation are pinned by executed pure logic plus source ordering, and the sandbox's
  SwiftShader city/arena (~1–2 fps) cannot reach a completed bout inside a script budget, exactly as
  L1 recorded. The same device check is still owed: win one duel and lose one, confirm `city.day`
  reads 2 then 3, and confirm the merchant window changes with it once L3 wires the screen. (b) The
  rotation has no UI, so nothing about it is visible in play yet. (c) `triga`-style per-storefront
  period lengths, daily purchase limits and per-day transaction records are deliberately **not**
  built — L2 is the pure foundation only.

## Living City L3 — merchant daily stock (implemented; L1/L2 records preserved above)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`2713ee4bb6`**,
  `git status --porcelain` **empty** and `git diff` empty before the first edit. Nothing in the tree was
  stashed, reset or overwritten. The L1 and L2 records above are unchanged; this section appends L3.

- **L2 correctness audit — the shipped hash-window PASSES, so no algorithmic correction was made.** Every
  property was re-derived from the shipped modules in a throwaway harness in the `web` container, not
  taken from the L2 report:
  - **Pool.** `getStorefrontStock('merchant')` is **13** ids in `ITEMS_DB` order —
    `trident_retarius, dual_vipers, titan_colossus_mace, shamshir_curved, helm_centurion,
    chest_golden_muscled, arms_manica_steel, arms_galerus_gilded, legs_greaves_steel,
    legs_greaves_gilded, helm_champion_gilded, chest_lorica_hamata, chest_champion_gilded`.
  - **Catalogue safety.** Every id a day offers is in `ITEMS_DB` **and** in the merchant's own eligible
    list; every id in the catalogue and in every storefront pool is unique.
  - **The misspelled id.** `arms_galerus_gilded` is a real legendary entry ("Gilded Galerus of the
    Retiarius", 780 / 345, +2 STR +2 AGI). `arms_galerus_rilded` **does not exist** — `getItemById`
    returns `undefined` and no id in `ITEMS_DB` contains `rilded`. The L2 report's spelling was a typo in
    prose, never in code or data.
  - **Shape.** Days **1–500** each return exactly **4** distinct ids, all inside the pool, in catalogue
    order — no duplicate, no short list, no invalid index. Day 1 is still
    `helm_centurion, chest_golden_muscled, arms_manica_steel, arms_galerus_gilded`.
  - **Determinism.** Repeated calls, a fresh `resolveCityRotation`, reversed evaluation order and a fresh
    resolution all agree; days 1–13 give **9** distinct windows (hash wrap, expected); all 13 goods appear
    over days 1–40.
  - **Unchanged storefronts.** `forge` (10), `armorer` (16) and `market` (27) resolve to exactly
    `getStorefrontStock(id)` on every day tried; `bazaar` is `[]`. `merchant` is the only category the
    resolver marks `rotates: true`.
  - **Purity.** The profile and its `city` object are untouched; `ITEMS_DB` is byte-identical after 60
    resolutions whose returned arrays were mutated; the module still names no storage and no wall clock;
    `resolveCityDay` remains the only day reader.

- **The one change inside the resolver is a testability refactor, not a behaviour change.** The hash-window
  arithmetic moved verbatim into an exported pure helper, `selectDailyWindow(eligible, slots, id, day)`,
  and `rotateStorefrontStock(id, day)` is now `selectDailyWindow(getStorefrontStock(id), ROTATION_SLOTS[id], id, day)`.
  This is what makes the short-pool and reordered-catalogue cases assertable without touching `ITEMS_DB`
  (the guard order — `slots === null || slots >= eligible.length || eligible.length === 0` — is
  unchanged, and the whole-pool branch now returns a copy, which is still a fresh array). No id, price,
  rarity, slot count, hash key or eligibility rule changed; day 1 still yields the same four ids.

- **L3 wiring — one authoritative offer, used by both the screen and the purchase gate.** Two helpers join
  the L2 module: `resolveStorefrontOffer(profile, id)` (the day's ids for the profile's own city day,
  through `resolveCityDay`) and `isStorefrontItemOnOffer(profile, id, itemId)` (the gate). Because both
  are the same pure selection over the same profile, the merchant's cards and the purchase check cannot
  disagree.
  - **Screen.** `ShopTab` no longer reads `getStorefrontStock` directly: `stock` comes from
    `resolveStorefrontOffer(profile, shopId)` and is then mapped through `getItemById` exactly as before,
    so forge/armorer/market render their whole stock and the merchant renders the day's four.
  - **Purchase.** `App.handleBuyItem` keeps its gold check first, then refuses anything
    `isStorefrontItemOnOffer(profile, shopId, item.id)` does not list, then builds the update. `shopId` is
    the same App state that reaches `ShopTab`, so an eligible-but-not-selected merchant item has no card
    and is also refused by the handler — the rotation cannot be bypassed by calling the handler directly.
  - **Clock untouched.** Buying/opening/leaving a storefront never advances the day: `advanceCityDay`
    still has exactly one call site (settlement), and neither `ShopTab` nor the buy body names the clock.
    No new persisted field, no stock snapshot, no second day.

- **Files changed — six (five source/test + this record).** `src/utils/cityRotation.ts` (the helper, the
  two L3 helpers, the header note), `src/components/hub/ShopTab.tsx` (the offer as the stock source),
  `src/App.tsx` (the import and one guard line), `src/utils/cityRotation.test.ts` (**one** L2 scope guard
  rebased: "no shop screen imports the rotation yet" became "L3 consumes this module through the shared
  offer helper on both sides" — every other L2 assertion untouched), `src/utils/storefrontWiring.test.ts`
  (**one** pin rebased from `getStorefrontStock(shopId)` to `resolveStorefrontOffer(profile, shopId)`, with
  the same intent), and **new** `src/utils/cityRotationL3.test.ts`.

- **Regression suite: `src/utils/cityRotationL3.test.ts` — 32 tests** in six sections: §A catalogue safety
  (the gilded id, the misspelling's absence, 200 days of real/stocked ids, unique ids everywhere);
  §B shape and stability (four unique per day over 200 days, repeated calls, catalogue order, day 1);
  §C the clock (legacy profile → day-one stock, eleven malformed day values matching `normalizeCityDay`,
  fractional flooring, malformed `city` containers, day 1 ≠ day 2); §D the permanent spine (`forge`,
  `armorer`, `market` equal to `getStorefrontStock` on six days, `bazaar` empty, only `merchant` rotates);
  §E short/reordered catalogues via `selectDailyWindow` (empty, 1–3 items, 8 items, `null` slots, a
  reversed pool, day normalisation); §F the shared boundary (every displayed id passes the gate, an
  eligible-but-withheld merchant item fails it and is offered on another day, unknown ids refused
  everywhere, the market still offers all 27, the screen renders `resolveStorefrontOffer(profile, shopId)`
  and no longer `getStorefrontStock(shopId)`, the handler's gold check → offer check → mutation order,
  and no day advance / no second storage on either path).

- **Checks actually run (2026-10-21, `web` dev container, on the final tree).** `bun test` → **2642 pass /
  0 fail (90 files, 83,717 `expect()` calls)** (this phase's 32 tests and its file are the delta, so the
  branch tip read 2610 / 89); `bun run scripts/combatTests.ts` → **65 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup-asset check passing (8
  assets; the pre-existing >500 kB chunk warning only); `git diff --check` → **clean**.

- **Live evidence (preview browser, anonymous visitor — no session replayed).** Drove the shipped route:
  title `Play` → character creation → `Apply Points & Enter Metropolis` → 3D city → `City Map &
  Navigation` → **Elite Merchant House** → its own prompt `INSPECT HIGH-TIER WARES [E / SPACE]` → the
  merchant screen. It rendered **exactly four cards**, matching the resolver's day-1 window by name:
  *Transverse Centurion Galea* (320), *Emperor Imperial Muscled Cuirass* (900), *Toledo-Steel Manica*
  (420), *Gilded Galerus of the Retiarius* (780) — i.e. `helm_centurion`, `chest_golden_muscled`,
  `arms_manica_steel`, `arms_galerus_gilded`. The hub's own **Bazaar & Forge** tab then rendered **27
  cards** (the whole market, unchanged), and there were **0 console errors** on either screen. The
  automation browser's own storage was cleared afterwards; no real save was read or written.

- **Not automatically verified / limitations.** (a) **The purchase click** — the fresh guest profile held
  100 gold and every merchant good costs more, so every buy control was disabled and no purchase could be
  driven; the gate is pinned by §F (behavioural helper + the handler's source order) but not by a live
  click. (b) **A day change in the live UI** — no duel was fought (the sandbox renders the arena at ~1–2
  fps), so the merchant was only seen on day 1; the day-2 window is pinned by the suite. (c) **No device
  check** — nothing visual changed beyond which cards are listed, so this adds no Android item. (d) As
  scoped: no daily purchase limits, no transaction history, no rotation of forge/armorer/market, no
  rest/training/NPC/day-night systems, no combat, reward or clock change, and no save migration.

## Living City L4 — merchant purchase lifecycle and daily limits (implemented; L1–L3 records preserved above)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD `157f25cdcc`, `git status --porcelain`
  **empty** and no diff before the first edit; nothing was stashed, reset or overwritten. The branch's
  baseline suite read **2642 pass / 0 fail (90 files)**, the figure the L3 record ended on, so L3's
  description matched the code that shipped.

- **What ships — the smallest change that makes the rule enforceable, and testable.** The purchase
  transaction moved out of `App.handleBuyItem` into a pure module, `src/utils/storefrontPurchase.ts`,
  in the repo's established helper style (`purchaseChariotPart`, `purchaseRacingConfig`, `sellItem`);
  the merchant's day is one optional number on the existing `city` object; the shop screen says the
  purse is closed. **No price, item, eligibility rule, combat, reward, collider or save key changed**,
  and no migration was written.

- **The rule, and nothing more.** The Elite Merchant House allows **one purchase per city day**
  (`DAILY_LIMITED_STOREFRONTS = ['merchant']`). The allowance is *derived*: the stored
  `city.merchantPurchaseDay` and `resolveCityDay(profile)` are compared on read, so it resets by
  itself when a settled duel advances the clock — no timer, no wall clock, no second clock, no
  advancing on purchase. The forge, armorer, market and bazaar are untouched: unlimited and
  repeatable, exactly as before. A rejection consumes nothing (nothing is written until every check
  passes), so an unaffordable or off-offer attempt leaves the day's allowance intact.

- **The data model — one optional number, total on read.** `src/types/game.ts` adds
  `CityState.merchantPurchaseDay?: number` (documented as ONE number, not a log, so the record cannot
  grow). `resolveMerchantPurchaseDay(profile)` returns the stored day or **`null`** for anything
  unusable (absent, wrong type, `NaN`, `Infinity`, ≤ 0, a malformed `city` container) — i.e. corrupt
  data can only ever GRANT the allowance, never lock a player out of a day they never spent.
  `isMerchantPurchaseSpent(profile)` is the derived answer the screen and the transaction both use.
  A legacy save resolves to day 1 with no record, so it is treated as day 1 with nothing bought —
  consistently. `city.day` is carried over **as stored** (never normalized, never fabricated): a
  legacy profile that buys gains `city: { merchantPurchaseDay: 1 }` and still has no `day` field, and
  `resolveCityDay` keeps answering 1.

- **The transaction (one base, checks in order, one commit).**
  `purchaseStorefrontItem(profile, storefront, itemId)` → `{ ok: true, profile }` or
  `{ ok: false, reason }` with reasons `no-profile | unknown-item | insufficient-gold | not-on-offer |
  merchant-daily-limit`. Order: the profile → the item resolved **from `ITEMS_DB` by id** (so the
  committed object is the catalogue's own entry) → the purse → the L3 offer gate
  (`isStorefrontItemOnOffer` — the same helper the screen renders from) → the merchant allowance.
  Only then is ONE new profile built: `gold − price`, the item appended, and (merchant only)
  `city: { ...city, merchantPurchaseDay: day }` **in the same literal**, so there is no second write
  to race. The caller's profile is never mutated; every unrelated field is carried over by identity.

- **Duplicate clicks cannot charge twice.** React state only changes on the next render, so two
  purchase callbacks in one tick would otherwise read the same stale purse and the same unspent
  allowance. `App` now holds `profileRef` (the newest committed profile, synced by an effect on
  `[profile]` and written **immediately** after a successful commit); `handleBuyItem` reads that ref,
  never the render's `profile`. The suite drives this composition behaviourally — two clicks in one
  tick charge once and the second is refused — and its **control** shows the stale-base shape would
  charge twice. This also removes the pre-existing same-tick double-charge on the other storefronts
  without changing their rules.

- **Files changed — six (five source/test + this record).** `src/types/game.ts` (the optional field
  and its contract); `src/utils/storefrontPurchase.ts` (**new**: the record resolver, the derived
  allowance and the transaction); `src/App.tsx` (the import swap, `profileRef` + its effect, the
  handler delegating to the transaction); `src/components/hub/ShopTab.tsx` (the closed-purse note and
  `disabled` on the two buy controls — a *notice*, not the enforcement);
  `src/utils/storefrontPurchase.test.ts` (**new**, 25 tests); **two rebased, not weakened pins** —
  `cityRotation.test.ts`'s L2 scope guard now pins the gate in the module that holds it and App as
  its caller, and `cityRotationL3.test.ts` §F reads the gold-check → offer-check → mutation order from
  `storefrontPurchase.ts` and pins App as the single caller.

- **Regression suite: `src/utils/storefrontPurchase.test.ts` — 25 tests / 159 `expect()` calls** in
  nine sections, driving the REAL transaction over real catalogue items and real profiles: §A the
  record (twelve malformed values → `null`; malformed containers ignored; only the current day spends
  the allowance); §B a first purchase (exact gold, one appended copy, the day recorded, `city.day`
  unchanged); §C the allowance (second purchase refused with `merchant-daily-limit` and a
  byte-identical snapshot; the ref-backed gate charges once; **the stale-base control** charges twice;
  the limited list is `['merchant']`); §D refusals (unaffordable does **not** consume the allowance;
  an off-offer item, an unknown id and a missing profile leave everything untouched); §E the other
  storefronts (forge / armorer / market repeatable, no record written, the bazaar still refuses
  everything; a merchant purchase does not close another shop); §F the day (a later day buys again;
  buying never advances the clock); §G legacy and malformed saves (no `city`, junk values, a string
  container); §H atomicity and purity (one update, unrelated fields by identity, the input never
  mutated, an existing `city` member preserved); §I the wiring (App buys only through the transaction
  and writes its ref before committing; the screen renders the note from the same helper; the module
  names no storage, timer, wall clock, randomness or `advanceCityDay`).

- **Checks actually run (2026-10-21, `web` dev container, on the final tree).** `bun test` →
  **2667 pass / 0 fail (91 files, 83,877 `expect()` calls)** (the 2642 / 90 baseline plus this
  suite's 25 tests and its file); `bun run scripts/combatTests.ts` → **65 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup-asset
  check passing (8 assets; the pre-existing >500 kB chunk warning only); `git diff --check` →
  **clean**. The suite's own starting point was two wrong expectations of mine in §E/§F (an assumed
  pre-existing inventory copy, and buying a day-1 item on day 7); both were corrected in the suite —
  no assertion was loosened, and no production file changed for them.

- **Live evidence (preview browser, anonymous visitor — no session replayed).** Drove the shipped
  route past the Oath beat (five real press-and-hold gestures: four lines plus the vow) → `City Map &
  Navigation` → fast travel to the **Elite Merchant House** → its own `INSPECT HIGH-TIER WARES
  [E / SPACE]` prompt → the merchant screen. It rendered **four cards** — *Transverse Centurion Galea*
  (320), *Emperor Imperial Muscled Cuirass* (900), *Toledo-Steel Manica* (420), *Gilded Galerus of the
  Retiarius* (780), i.e. the day-1 window — under **ELITE MERCHANT HOUSE / Rare & Legendary Wares**,
  with **four disabled `BUY ARMOR` controls** on the guest's 100 gold, **no closed-purse note** (nothing
  bought today), **0 console errors**, and the dev server serving the new module
  (`/src/utils/storefrontPurchase.ts` carries `DAILY_LIMITED_STOREFRONTS`). The guest profile the run
  created lives only in that throwaway browser.

- **Not automatically verified — the purchase click and the second refusal.** The fresh guest profile
  holds **100 gold** and the cheapest merchant good costs **320**, and nothing in the game awards gold
  without winning duels (the sandbox renders the arena at ~1–2 fps), so no purchase could be driven
  in the UI. The rule, the record, the refusals and the atomicity are pinned behaviourally by the
  suite above; **confirm by hand on a device**: buy one merchant good (gold drops by exactly the
  price, the item appears in the inventory, `city.day` is unchanged, `city.merchantPurchaseDay`
  equals the current day and the note appears with the buys disabled), then reload and confirm a
  second merchant purchase is refused, while a forge/armorer/market purchase still works.

- **Scope kept: what deliberately did not move.** No training schedule, rest, injury, NPC schedule or
  day/night visual; no change to the day-advancement event (`advanceCityDay` still has exactly one
  call site, the duel settlement); no merchant price, item definition, combat, reward or other shop
  behaviour; no timer, randomness, wall clock or second clock; no save key, no migration, no
  commit/push/deploy. The remaining Living City work (L5+ classes, visitors, rare chariot parts) is
  unchanged and unstarted.

## Living City L5 — day-based training schedule foundation (implemented; L1–L4 records preserved above)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`4a33c95669`**,
  `git status --porcelain` **empty** and no diff before the first edit; nothing was stashed, reset or
  overwritten. The branch's baseline suite read **2667 pass / 0 fail (91 files)**, the figure the L4
  record ended on, so L4's description matched the code that shipped. The L4 record's closing line
  ("the remaining Living City work (L5+ …) is unchanged and unstarted") is history from this point on.

- **The training model as it actually shipped (audited before any edit).**
  - **Four drills, one stat each**: `strength` (Heavy Log Sleds), `agility` (Reflex Speed Target),
    `stamina` (Sand Endurance Drills), `defense` (Shield Deflection Stance). Each session adds
    **exactly +1** to that one `baseStats` entry and touches nothing else.
  - **Cost**: `25 × profile.level` gold, computed **twice** — once in `TrainingTab` for the disabled
    state and once in `App.handleTrainStat` for the charge. No per-drill price, no discount, no cap.
  - **No session limit and no training record existed.** `PlayerProfile.trainingSessionsLeft` is
    written as `2` by `createNewProfile` (`services/storage.ts`) and by `CharacterCreation`, and is
    **read nowhere** in `src/` — it is dormant, and this phase deliberately neither adopts nor
    removes it (nothing reads it, nothing writes it during training).
  - **No shared validation boundary existed**: the screen duplicated the cost formula, and the handler
    re-checked only the purse. Nothing checked *which* drill was being asked for beyond the union type.
  - **The profile update was already atomic**: `handleTrainStat` built ONE object literal with the new
    gold and the new `baseStats` and made ONE `saveProfile` call. That property is preserved exactly.
  - **The catalogue was inline in the component**, so a schedule built on it could not have been
    shared with the handler. That is the one structural change this phase makes (below).

- **What ships — three new modules, three edited files, two new suites.** The drills moved out of
  `TrainingTab` into `src/data/training.ts` (the one catalogue, unchanged in content: same four ids,
  names, descriptions, the same `25` per level), so the screen and the decision path read the same
  data. `src/utils/trainingSchedule.ts` is the pure, deterministic schedule; `src/utils/trainingSession.ts`
  is the authoritative transaction. **No cost, stat formula, progression rule, combat value, save key,
  migration, collider or merchant limit changed**; the city day is not advanced anywhere new.

- **The schedule, and why this cadence.** `scheduleTrainingDay(catalogue, day)` (explicit day,
  normalized through the SAME `normalizeCityDay`) and `resolveTrainingSchedule(profile)` (the day from
  `resolveCityDay`) answer `{ day, actions, resting }` — the drills that drill today and the drill(s)
  resting, both in catalogue order. **One discipline rests each day** (`TRAINING_RESTING_PER_DAY = 1`),
  so three of four are available: the game establishes no cadence of its own and has no session limit,
  so this is the **least disruptive** schedule that still varies day by day — any narrower window would
  withhold more of the existing training than the phase needs, and a full four would not be a schedule.
  The resting drill is chosen by an FNV-1a hash of `sand-and-steel:training-schedule:${day}` mod the
  catalogue length — the same integer-only hash the L2 rotation uses, no randomness, no clock, no
  storage, nothing persisted (the timetable is *derived* from the saved day, so it is identical after a
  reload and on a local or a Drive save). Measured: day 1 rests `stamina`, day 2 `defense`, day 3
  `strength`, day 4 `agility`, and days 1–9 cover every discipline both drilling and resting.

- **Catalogue safety, by construction.** The resolver only ever SELECTS from the catalogue it is
  handed, deduplicated by id (first entry wins), so a schedule can never list a drill twice or name one
  that does not exist; it is total for short catalogues (an empty catalogue answers an empty
  timetable, a single-drill catalogue rests nothing) and it never mutates `TRAINING_ACTIONS`.

- **The authoritative transaction (one base, checks in order, one commit).**
  `trainStat(profile, stat)` → `{ ok: true, profile, action, cost }` or `{ ok: false, reason }` with
  reasons `no-profile | unknown-action | not-scheduled | insufficient-gold`, checked in that order:
  the profile → the catalogue entry (`getTrainingAction`) → **today's membership**
  (`isTrainingActionScheduled`, the same resolver the screen renders) → the purse
  (`trainingCost(profile.level)`, the same formula the screen shows). Only then is ONE new profile
  built — `gold − cost` and the single `baseStats` point in the same literal — so the caller's profile
  is never mutated and a refusal commits nothing. `App.handleTrainStat` now delegates to it, reading
  the newest committed profile through the existing `profileRef` (the L4 pattern) and writing that ref
  before `setProfile`/`saveProfile`, so a double click trains twice (each a legal session) rather than
  charging a stale base.

- **"Unavailable actions cannot be executed by calling the handler directly" is enforced in the
  transaction, not in the button.** The `TrainingTab` disabled state is a *notice*: the drill resting
  today is refused by `trainStat` with `not-scheduled` no matter how the handler is reached, and the
  suite drives exactly that path. **Training never advances the city day** — `advanceCityDay` still has
  one call site (the duel settlement), and the spread carries `city` over untouched.

- **The screen.** `TrainingTab` renders the catalogue's four cards (icons/ink are presentation only),
  states the day and the timetable in its header ("Day 1 of the Ludus — 3 of 4 disciplines drill
  today; Sand Endurance Drills rests."), and disables a card that is resting *or* unaffordable with the
  resting copy alongside it, so the drill is visible and clearly not offered rather than silently
  missing. Existing layout, copy, icons, gold line and touch sizes are unchanged; the cost and the
  timetable both come from the shared helpers. `GladiatorSchoolHub`'s `onTrainStat` prop is typed with
  the shared `TrainingStat` — a type-only change.

- **Files changed — nine (three new modules, two edited components, `App.tsx`, two new suites, this
  record).** `src/data/training.ts` (**new** — the catalogue, `trainingCost`, `getTrainingAction`);
  `src/utils/trainingSchedule.ts` (**new**); `src/utils/trainingSession.ts` (**new**);
  `src/components/hub/TrainingTab.tsx` (the shared catalogue, timetable and cost);
  `src/components/hub/GladiatorSchoolHub.tsx` (the prop type);
  `src/App.tsx` (the imports and the four-line handler);
  `src/utils/trainingSchedule.test.ts` (**new**, 24 tests); `src/utils/trainingSession.test.ts`
  (**new**, 22 tests); `AGENTS.md`.

- **Regression suites: 46 tests / 631 `expect()` calls, behaviour first.**
  `trainingSchedule.test.ts` — §A determinism (repeated calls, a fresh resolution, 25 consecutive
  resolutions, fresh arrays a caller may mutate); §B day sensitivity (the pinned day-1 timetable, day 1
  ≠ day 2, all four disciplines both drilling and resting over nine days, exactly one rest per day);
  §C the clock (legacy/no-city profile → day 1, a missing profile, twelve malformed day values compared
  against `normalizeCityDay` itself, fractional flooring, a malformed `city` container, and the module
  naming no `Date`/timer/storage/randomness and no `advanceCityDay`); §D catalogue safety (only
  existing ids, no duplicates on 60 days, an extended catalogue with repeated ids absorbed without
  duplicates or invalid entries, total for empty/one/two-drill catalogues, `TRAINING_ACTIONS`
  byte-identical after 90 resolutions); §E purity and wiring (profile and `city` untouched, membership
  agreeing with the timetable, and the screen + transaction proven to read this one resolver — with
  `TrainingTab` shown to no longer carry its own drill names).
  `trainingSession.test.ts` — §A the schedule is the gate (a resting drill refused on five days even
  when `trainStat` is called directly, the same drill refused today and accepted another day, unknown
  id, missing profile, refusal leaves the profile byte-identical); §B the purse (insufficient gold
  unchanged, exactly-enough leaves zero, the schedule is checked before the purse); §C the session (the
  shipped 25 gold and one point, cost scaling at levels 1/2/5/12, only the trained stat moving, two
  sessions charging twice); §D the clock (never advances on days 1/4/9, a legacy save still has no
  `day` field afterwards and reads day 1, the module names no clock advance); §E atomicity and purity
  (one new profile, `city`/`equipped`/`inventory` by identity, the input untouched on every path, a
  refusal carrying no profile, an existing `city` record carried through, `trainingSessionsLeft`
  untouched); §F the wiring (App trains only through the transaction and computes no cost, gold or
  stat itself; the screen renders the shared timetable, cost and disabled state; the transaction reads
  the one catalogue and the one schedule).

- **Checks actually run (2026-10-21, `web` dev container, on the final tree).** `bun test` →
  **2713 pass / 0 fail (93 files, 84,508 `expect()` calls)** (the 2667 / 91 baseline plus these two
  suites and their files); `bun run scripts/combatTests.ts` → **65 passed, 0 failed**;
  `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the startup-asset
  check passing (8 assets; the pre-existing >500 kB chunk warning only); `git diff --check` →
  **clean**. The suite's starting point was **one failure in another suite**: `storefrontPurchase`
  §I pins the *first* `const base = profileRef.current` / `profileRef.current = result.profile` in
  `App.tsx` as the purchase's, and this phase's handler initially used the same two statements ahead
  of it. It was fixed **in the new production code, not in the pin** — `handleTrainStat` now passes
  `profileRef.current` straight into the transaction and writes the ref as `profileRef.current =
  updated` — so L4's assertion is untouched and still means what it says. No assertion anywhere was
  loosened, and the two new suites were 46/46 on their first run after that change.

- **Live evidence, and what is NOT automatically verified.** In the preview browser (anonymous
  visitor, no session replayed) the app boots to its title screen with **0 console errors and 0 failed
  requests**, and the dev server serves the changed modules transformed — `/src/components/hub/TrainingTab.tsx`
  carries `resolveTrainingSchedule` and `trainingCost(profile.level)` with **no** `25 *` left in it,
  and `/src/utils/trainingSchedule.ts` carries the `sand-and-steel:training-schedule:` hash key.
  **The rendered timetable was NOT seen.** Reaching the training tab needs title → character creation
  → the five press-and-hold oath lines (`OATH_HOLD_MS` = 1500 each) → the 3D city → the footer's
  Training Yard shortcut, and this sandbox renders the city through SwiftShader at ~1–2 fps: two
  scripted attempts timed out (one at the creation CTA, one mid-oath) and the browser resets between
  calls, so the run never reached the tab. That is the same environment limit L1–L4 and the combat
  passes recorded, and it is **not** evidence of a defect. **Device check owed:** open the Ludus
  training tab (via the city footer or the Training Yard building) and confirm the header reads the
  current day with three drills listed and one named as resting, that the resting card's Train button
  is disabled while the other three are live on a purse that covers `25 × level`, that the resting
  drill rotates after a settled duel, and that a completed session still costs exactly `25 × level`
  and raises exactly one stat.

- **Limitations, stated rather than buried.** (a) The schedule has **no per-day session limit** and no
  training record — the phase establishes the *schedule* only, and `trainingSessionsLeft` stays
  dormant. (b) The resting drill is a tuned constant (`TRAINING_RESTING_PER_DAY = 1`), not a game
  rule; a second resting drill is one constant away and is a design decision, not a code change. (c)
  The day advances on **duels only** (unchanged), so the timetable changes at that rate. (d) The
  App-level wiring is pinned by source assertions plus the pure transaction's behaviour, per this
  repo's no-DOM-renderer convention; the handler itself is not executed by a test. (e) No rest mechanic,
  injury recovery, NPC schedule, day/night visual, new exercise, new stat effect or new cost was
  added, and nothing outside training changed.

## Living City L7 — core injury system (implemented; L1–L5 records preserved above)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`bd3df754a9`**,
  `git status --short` **empty** before the first edit; nothing was stashed, reset or overwritten. The
  branch's baseline suite read **2713 pass / 0 fail (93 files)**, the figure the L5 record ended on, so
  L5's description matched the code that shipped.

- **`PlayerInjury` was dead code, and this phase gives it exactly one writer.**
  `src/utils/injurySettlement.ts` (new, PURE — no React, storage, timer, wall clock or randomness) owns
  the one injury slot. Rules as approved: a **completed defeat** inflicts
  `{ fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 }`; **every completed duel, won or
  lost,** spends one fight of the injury the fighter entered with; at zero the slot is `null`; a
  defeat while injured **refreshes the duration to 2 and keeps the fixed penalties** (one slot, never
  stacked, never accumulated). An abandoned or cancelled bout never reaches the settlement, so it
  neither inflicts nor spends one. **No rest action, no city-day cost, no injury UI** shipped.

- **Ordering is the rule.** `settleInjury(profile, didWin)` snapshots the entry injury, spends one
  fight of **that** record, and only then applies the defeat rule — which is what makes a freshly
  inflicted injury start at 2 instead of 1. Consequence worth knowing: after a defeat the slot reads
  **2**, not 1 (rules 4 and 5 together), and the brief's test-list line "two remaining becomes one …
  for both victory and defeat" cannot hold for a defeat; the rules win and the suite states the
  refresh explicitly.

- **Malformed legacy data, normalized narrowly and totally.** `normalizeInjury(value)` is the ONE
  reader of a stored injury (both the settlement and `calculateTotalStats` use it): a missing / `null`
  / non-object record, or a `fightsRemaining` that is not finite or is `<= 0` once floored, reads as
  **`null`**; a fractional duration **floors** (like `normalizeCityDay`); a non-finite penalty
  resolves to the canonical **2** and a negative one clamps to **0**. No migration and no save rewrite
  — `calculateTotalStats` (`services/storage.ts`) now reads the same resolver, so a NaN penalty can no
  longer poison strength/agility (the audit's latent NaN risk is closed) while valid records behave
  exactly as before, floor of 1 included.

- **Wiring: still one settlement boundary.** `App.handleMatchComplete` computes
  `const injury = settleInjury(profile, didWin).injury;` **once**, beside the L1 clock, and carries it
  into both outcome literals — no second settlement path, `advanceCityDay` still has its one call site,
  the duel-id latch and the one `setProfile`/`saveProfile` per branch are untouched.

- **Files — four.** `src/utils/injurySettlement.ts` (new); `src/utils/injurySettlement.test.ts` (new,
  36 tests); `src/App.tsx` (the import, the one computation, `injury,` in both literals);
  `src/services/storage.ts` (the normalization guard). Nothing else changed.

- **Verified 2026-10-21** in the dev container: `bun test` → **2749 pass / 0 fail (94 files, 84,718
  `expect()`)** (baseline 2713 / 93 → this suite's 36 tests and its file); `bun run
  scripts/combatTests.ts` → **65 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0;
  `bun run build` → exit 0 with the startup-asset check passing; `git diff --check` → clean. The dev
  server serves the changed modules and the app boots to its title screen with **0 console errors and
  0 failed requests**.

- **Not automatically verified — no live duel.** A completed defeat and the recovery after it were
  **not** observed live: paying them needs a finished bout, and the sandbox renders the arena through
  SwiftShader at ~1–2 fps (the limit L1–L5 and the combat passes recorded). The lifecycle is pinned by
  the suite (behavioural helper + the settlement's source ordering). **Device check owed:** lose one
  Colosseum duel and confirm `injury` reads 2/2/2 in `sand_and_steel_gladiator_save_v2` and that
  strength/agility are 2 lower in the armory, then win one and confirm it drops to 1, win another and
  confirm it is `null`; abandon a bout and confirm no injury appears.

- **Remaining limitations.** (a) An injury is invisible in play until a UI reads it — no injury
  indicator, no rest button, no `advanceCityDay` cost (all out of scope). (b)
  `trainingSessionsLeft` stays dormant. (c) The stat penalty is per-record and uncapped by design
  beyond the floor of 1.

## Living City L8 — injury visibility and player feedback (implemented; presentation only)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`4698a93cd5`** ("Implement Living
  City L7 injury mechanics"), `git status --short` **empty** — the L7 audit's own report named `4698a93`,
  and that is what the tree held. Nothing was stashed, reset or overwritten. The starting suite was
  **2749 pass / 0 fail (94 files)**.

- **What shipped: one pure presentation model, read by three screens.** `src/utils/injuryStatus.ts`
  exports `describeInjury(value) → InjuryStatus | null`, where `InjuryStatus` carries
  `penaltyStrength`, `penaltyAgility`, `fightsRemaining` and `durationLabel` ("Affects the next 2
  completed duels", singular at one). It **delegates every validity decision to `normalizeInjury`** —
  no rule is restated (the suite asserts the module contains no `Number.isFinite` / `Math.floor`), so a
  screen can never show a wound the stat calculation is not applying. `null` (absent / malformed /
  spent) is the "render nothing" answer, which is what keeps every surface free of an empty container.
  Pure: no React, storage, clock, timer or randomness; nothing is written.

- **Stats screen (`StatsTab`).** New `data-testid="stats-injury-status"` panel between the identity card
  and the unspent-points banner: a `Bandage` glyph, the word **Injured**, the two penalties in their own
  tiles (`-{penaltyStrength}`, `-{penaltyAgility}`), and the duration sentence plus "A wound, not a change
  to your base attributes." — the attributes' own `Base:` line and derived totals are untouched, so it
  cannot read as an equipment or permanent-base change. Rendered only when `describeInjury` is non-null.

- **Pre-fight screen (`PreFightModal`).** New optional `injury?: PlayerInjury | null` prop (one line of
  markup, above the Retreat / Step into Sand row, `data-testid="prefight-injury-status"`): `-2 STR ·
  -2 AGI · Affects the next 2 completed duels.` Both briefing call sites hand it `playerProfile.injury`
  (`CityHubScene` for the Colosseum door, `GladiatorSchoolHub` for the tournament tab). Uninjured, the
  block does not exist at all, so the card's layout and height are exactly what they were.

- **Duel result screen (`DuelResultModal`).** New optional `injury?: PlayerInjury | null` prop rendered
  after the combat recap, `data-testid="duel-injury-status"`, headed **Still injured** on a victory and
  **Injured** on a defeat, with the same penalties and the settled duration.

- **How the post-settlement injury reaches the result screen — one presentation-data connection, and it
  is the minimum.** `duelResult` carried only `{ didWin, stats }`, so the modal had no wound to show and
  inferring one from `didWin` is exactly what the brief forbids. `App.handleMatchComplete` already
  computes `const injury = settleInjury(profile, didWin).injury;` once, before both branches, and writes
  it into the settled profile; that **same value** now rides the result state
  (`setDuelResult({ didWin, stats, injury })`, `useState<{ didWin; stats; injury: PlayerInjury | null }>`)
  and the modal reads `injury={duelResult.injury}`. Nothing else in the handler changed — the claim, the
  clock, the rewards, the losses, the rituals, the one `setProfile`/`saveProfile` per branch and the
  latch are untouched — and the one type fix needed was `?? null` on that already-computed value (the
  profile field is optional, the state field is `PlayerInjury | null`). So a defeat shows the **refreshed**
  2, a surviving injury shows **1**, and an expired one shows **nothing** — all from the settlement's own
  result, never from the outcome.

- **No gameplay change.** `injurySettlement.ts`, `settleInjury`, `advanceCityDay`, the latch, rewards and
  persistence are byte-identical. `settleInjury(` still appears exactly once in `App.tsx`, `advanceCityDay(`
  once, `saveProfile(` twice (one per branch), and no UI component imports `settleInjury` or
  `normalizeInjury`, touches `localStorage` or calls `saveProfile`. No rest button, healing item, gold or
  day cost, stacking, severity scaling, migration, new injury type, timer or storage write was added.

- **Tests — `src/utils/injuryStatus.test.ts`, 30 tests / 117 `expect()` in five sections.** §A the model
  (2/2/2 shown, the singular duration, a legacy 5, `null` for eleven unusable shapes, `NaN`/`Infinity`→2,
  negatives→0, 1.5→1, agreement with `normalizeInjury` record by record, no mutation, and the no-restated-
  rules guard); §B the stats screen (reads the helper, names the penalties and duration, `{injury && (`
  guard, no settlement/storage); §C the pre-fight modal (the prop, the wording, the guard, both call
  sites); §D the result screen (the prop, the wording, the `Still injured`/`Injured` split, the guard,
  App's `settleInjury(...)` → `setDuelResult(...)` → `injury={duelResult.injury}` chain, and the real
  settlement outputs that must read 2 / 1 / nothing); §E the guards (one settlement, one clock call site,
  the claim before the injury, two saves, no UI component reaching the lifecycle, the helper absent from
  the settlement path). The screens have no component-test renderer in this repo, so §B–§D are
  pure-helper behaviour plus source-wiring assertions — stated here as the limitation it is.

- **One L7 guard caught this phase's own prose, and the prose was fixed rather than the guard.**
  `injurySettlement.test.ts` §G's "no other source file settles an injury (the boundary is App alone)"
  sweep flags any non-test file containing `settleInjury`; `DuelResultModal.tsx`'s new doc comment named
  it, so the comment now says "what the settlement wrote". No assertion was weakened.

- **Verified 2026-10-21** in the dev container, on the final code state: `bun test` → **2779 pass / 0 fail
  (95 files, 84,835 `expect()`)** (baseline 2749 / 94 → this suite's 30 tests and its file);
  `bun run scripts/combatTests.ts` → **65 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → exit 0
  (one real error was fixed on the way: the `?? null` above); `bun run build` → exit 0 with the
  startup-asset check passing; `git diff --check` → clean.

- **Live evidence — the uninjured half, captured.** Driven in the preview browser (anonymous visitor; the
  run created a throwaway gladiator and the save was removed afterwards): title → `PLAY` → character
  creation → `ENTER METROPOLIS` → the 3D hub → `Colosseum` → the hub's **`Gladiator Stats`** tab, and
  separately the tournament tab → `Arena Duel` → the briefing. Measured in the DOM: **no
  `stats-injury-status` panel and no `prefight-injury-status` block**, no "injured" wording anywhere, the
  stats screen's `PRIMARY ATTRIBUTES` and derived totals rendering as before, no sideways scroll, **0
  console errors** and **0 failed requests**; the captures show both screens legible and unchanged.
  **NOT verified live: the injured state.** This browser is an anonymous visitor whose storage is reset
  on every fresh load, and no UI can inflict an injury, so the panel's rendered appearance at 400 px and
  the result-screen variant were not seen. **Device check owed:** lose one Colosseum duel and confirm the
  stats tab shows `Injured -2 -2 / Affects the next 2 completed duels`, the briefing warns before the next
  bout, and the result card reads `Injured` with 2 duels; win one and confirm the result card reads
  `Still injured` with 1, the stats panel follows, and after the second win both disappear.

## Living City L9 — rest and recovery at the Arena Medical House (implemented; interaction not verified live)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`90bb82d0e3`** ("Add injury
  status visibility to stats and duel screens"), `git status --short` **empty** before the first edit;
  nothing was stashed, reset or overwritten. The starting suite read **2779 pass / 0 fail (95 files)**,
  the figure the L8 record ended on, and the audit's premises all held: no `restDay` anywhere, the
  Medical House still showed a static description, `advanceCityDay` had one call site and `CityState`
  carried only `day` / `merchantPurchaseDay`.

- **What shipped: one pure transaction, one optional field, two wiring points.** A wound could only be
  spent by fighting while wounded (L7), so `src/utils/restRecovery.ts` (new) is the medicus's
  treatment, following the house contract of `trainStat` / `purchaseStorefrontItem`:
  `REST_DAY_FIELD = 'restDay'`, `RestRefusal` (`no-profile | already-rested | no-injury |
  insufficient-gold`), `RestResult` (`{ ok: true, profile, cost, day }` | `{ ok: false, reason }`),
  `resolveRestDay`, `isRestSpentToday`, `restCost` and `restAtMedicalHouse`. It is **PURE** — no
  storage, React, timer, wall clock or randomness — and it is **not a duel settlement**: nothing is
  awarded, no win/loss statistic moves, and the injury lifecycle module is only *read* through
  `normalizeInjury` (the sole validity reader; no rule restated).

- **Exact semantics.** Checks run in the approved order — profile, today's allowance, the wound
  (through `normalizeInjury`, so `null` / spent / malformed all refuse), then the purse — and nothing
  is built until all pass, so a refusal returns only its reason and leaves the profile and every
  nested object untouched. On success: `entryDay = resolveCityDay(profile)` is captured **first**,
  `cost = trainingCost(profile.level)` (**25 × level**, the Ludus's own helper, not a new constant),
  the clock is turned **exactly once** by `advanceCityDay`, and ONE new profile carries the advanced
  `city` (with `restDay: entryDay` written beside the new day, never over it), `gold − cost` and
  `injury: null`; unrelated fields survive by identity, other `city` fields are preserved, and no
  migration exists — a legacy profile with no `city` rests from day 1 into **day 2** with
  `restDay: 1`. The result's `day` is the day **consumed**; the resulting profile stands on the next.

- **The field.** `CityState.restDay?: number` (`src/types/game.ts`) — optional, documented as ONE
  number rather than a log, read as "never rested" when absent, and never introduced by a migration.
  No other profile or city field changed.

- **The wiring, through the existing patterns.** `App.handleRest` (beside the training and purchase
  handlers) reads `profileRef.current` — the L4/L5 newest-committed pattern, so a double click cannot
  treat twice off a stale base — returns the refusal untouched on failure, and on success writes the
  ref, calls `setProfile` once and `saveProfile` once (no second persistence path, and **no** clock
  work in the handler). It is handed to `CityHubScene` as the narrow `onRest: () => RestResult` prop.
  The scene's existing `arena_medical_house` branch now calls it and reports through the **existing**
  `stableNotice`: success reads *"The medicus cleans and binds your wound, and you sleep until dawn.
  Day {day} — the treatment cost {cost} gold."* (the day read from the committed profile with
  `resolveCityDay`, so no arithmetic in the UI); refusals read the approved *"The medicus finds
  nothing to treat."*, a distinct already-treated line, and a fee line quoting `restCost`. The
  prompt (**"Visit Arena Medical House"**), its radius/position and the proximity rules are
  unchanged; the Bathhouse and Caravanserai still fall through to their own tabs, untouched.

- **Files — five production/test files plus this record.** `src/utils/restRecovery.ts` (new),
  `src/utils/restRecovery.test.ts` (new, **41 tests / 464 `expect()`**), `src/types/game.ts` (the
  field), `src/App.tsx` (import, handler, `onRest` prop), `src/components/3d/city/CityHubScene.tsx`
  (the prop, the branch, a local `restNotice` builder, the `onRest` dep). `storage.ts`,
  `trainingSession.ts`, `storefrontPurchase.ts`, `injurySettlement.ts`, `cityClock.ts` and every
  other UI file are **untouched**.

- **The suite (seven sections).** §A the treatment (wound cleared, fee, one day, nothing awarded);
  §B the fee through `trainingCost` at six levels plus `restCost`'s totality and the exact-enough /
  one-short boundary; §C every refusal with the input profile, `city`, `inventory` and `baseStats`
  byte-identical and object-identical; §D the clock (a later day re-opens the allowance, the advance
  never overwrites itself with the entry day, other `city` fields survive, `resolveRestDay` total over
  junk, the legacy day-1 → day-2 path); §E purity (identity of unrelated fields, no mutation, no
  storage/React/timer/clock/randomness token, exactly the four house imports); §F the neighbours —
  the merchant's allowance reopens and its offer resolves from the resulting day through
  `resolveStorefrontOffer` / `rotateStorefrontStock`, the training schedule resolves on that day
  (resting drill refused, scheduled accepted, no training rule changed), and injury normalization
  plus the win/loss settlement behave exactly as before; §G the wiring guards — App keeps **one**
  `advanceCityDay(` and **one** `settleInjury(`, the credit handler keeps its one clock call and two
  `saveProfile(settledProfile)`, this module is the **only other** production caller of the clock
  (a recursive `src/` scan proves it), no component names the clock or the settlement, the Medical
  House phrase and radius are pinned, the Bathhouse and Caravanserai are unchanged, and the handler's
  ref → state → save order is pinned. Source guards are comment-stripped and narrowly scoped to those
  properties; no test counts arbitrary strings.

- **One prose fix, no guard weakened.** The L7 boundary guard in `injurySettlement.test.ts` scans raw
  source for the settlement's name, and this module's first draft named it in a doc comment. The
  **comment** was reworded (L8's precedent) — the guard and its expectation list are exactly as they
  were.

- **Verified 2026-10-21** in the `web` dev container, on the final tree: focused
  `bun test src/utils/restRecovery.test.ts` → **41 pass / 0 fail** (464 `expect()`; the starting
  point was 37 / 4, all four a fixture bug of mine — `woundedOn(day, { city })` discarded the city
  override — fixed in the helper, not by weakening an assertion); `bun test` → **2820 pass / 0 fail
  (96 files, 85,299 `expect()`)** (the 2779 / 95 baseline plus this suite); `bun run
  scripts/combatTests.ts` → **65 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) → **exit 0**;
  `bun run build` → **exit 0** with the startup-asset check passing (8 assets; the pre-existing
  >500 kB chunk warning only); `git diff --check` → **clean**.

- **NOT automatically verified — the interaction itself.** Three preview attempts were made and all
  three exhausted the 30 s script budget before reaching the Medical House: the route needs title →
  character creation → the five press-and-hold oath lines (1.5 s each) → the 3D city mount (lazy
  chunk plus the WebGL-ready gate) → the map drawer → fast travel → the prompt → interact, and this
  sandbox renders the hub through SwiftShader at ~1–2 fps. The third attempt then hit the preview
  tool's per-turn retry cap, so no frame or DOM assertion from the running city exists for this
  phase. **What remains unproven live:** the banner's wording and dismissal, the refusal/success
  branches as *rendered* output, and the saved profile gaining `city.restDay` + `day: 2` with the
  wound cleared and the gold reduced. It is also **not reachable without a duel**: a fresh profile
  has no injury, so the success branch needs a lost bout first (the arena is the same ~1–2 fps).
  **Device check owed:** lose one Colosseum duel (injury 2/2/2), walk or fast-travel to the Arena
  Medical House, interact once and confirm the prompt is unchanged, that the notice names the wound,
  dawn, the new day and the gold, that the save shows `injury: null`, `gold − 25 × level`,
  `city.day` + 1 and `city.restDay` = the day you rested on — then interact again the same day and
  confirm the already-treated refusal writes nothing, and that the merchant's allowance and the
  Ludus's timetable have moved to the new day. An uninjured gladiator must read
  "The medicus finds nothing to treat."

## Living City L10 — visitor schedule foundation (implemented; no UI, no interaction)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`143edd0d50`**
  ("Implement L9 rest and recovery mechanics"), `git status --short` **empty** before the first edit.
  The branch's baseline suite read **2820 pass / 0 fail (96 files)** — the figure the L9 record ended
  on — so L9's description matched the code that shipped. Nothing was reset, stashed or overwritten.

- **What ships: a catalogue, one pure resolver, two optional fields, one suite.** `src/data/visitors.ts`
  (new — three visitors, their seasons and their offers), `src/utils/visitorSchedule.ts` (new — the
  schedule), `src/types/game.ts` (`CityState.seenVisitors?` / `completedVisitors?`),
  `src/utils/visitorSchedule.test.ts` (new, 46 tests) and this record. **No mesh, no disc, no prompt,
  no collider, no scene, no purchase, no reward and no interaction**; `App.tsx`, `CityHubScene.tsx`
  and `cityCollisions.ts` carry **no mention of a visitor at all** (asserted in §J), and the day is
  not advanced anywhere new.

- **The two roadmap fields, and the one reading this phase had to choose.** The audit states the rule
  exactly — `fnv1a(`${day}:${visitorId}`) % cadence === 0` **inside its own window** — but never says
  what a window *is*. This phase reads it as the visitor's **arrival window: an inclusive range of
  city days (`from ≤ day ≤ to`)**, which is the only reading that matches "an arrival window derived
  from `day`" and the phrase "window boundaries are respected". `cadence` is then "one day in
  `cadence`" inside that range. **This is the phase's single documented interpretation**, stated in the
  catalogue's own header so a reviewer can overrule it in one place; it is not a stay length, and the
  alternative (dwell days) would have needed a start anchor nothing in the documentation supplies.

- **The catalogue, measured.** `numidian_bladesmith` (cadence 3, days 1–150), `campanian_armorer`
  (cadence 4, days 6–240) and `emesan_weapon_trader` (cadence 5, days 24–365). Bounds are exported and
  asserted: cadence an integer in **2…7** (never 1, which would make the rule vacuous) and a window
  ending no later than **`VISITOR_WINDOW_MAX_DAY` = 365**, so no visitor is permanent. Staggered on
  purpose: **first arrivals on days 5, 8 and 31**, and over the first 90 days **52 have a visitor and
  10 have two** — a visitor is an occasion, not a fixture. Every entry, window, offer and pool is
  `Object.freeze`d, and the ids are pinned in the suite as a stability record.

- **The offers reference real content and are non-progression-critical by construction.** Each visitor
  has one `offer: { summary, pool }` whose pool is drawn **only from goods the permanent spine already
  stocks** (`getStorefrontStock('forge')` ∪ `('armorer')` — daggers, the bronze armor pieces, the mace,
  the shamshir, the spatha), so nothing is visitor-exclusive and a zero-visitor run still reaches the
  next tier. The day's single offer is `selectDailyWindow(pool, 1, visitorId, day)` — **the L2 rotation
  reused, not reimplemented** — so it rotates exactly as a shop's stock does and cannot be re-rolled by
  a reload. No item id was invented, no price was added and no purchase exists.

- **The resolver.** `scheduleVisitorDay(catalogue, day, completedIds)` (explicit day, normalized through
  the SAME `normalizeCityDay`) and `resolveVisitorSchedule(profile)` (the day from `resolveCityDay`,
  completion from the profile) answer `{ day, arrivals: [{ visitor, offerItemId }] }` in catalogue
  order, plus two total readers — `readSeenVisitors` / `readCompletedVisitors`. A catalogue is
  deduplicated by id (first entry wins) and only ever SELECTED from, so a schedule can never name a
  visitor that does not exist; an empty pool answers `offerItemId: null` rather than inventing one.

- **Seen is not done, and completion is permanent.** `completedVisitors` removes a visitor from **every**
  later schedule (asserted across all of its arrival days and past its window); `seenVisitors` is read,
  defended against junk and **never** excludes anyone; a malformed or unknown id excludes nobody. **This
  phase writes neither field** — no initialization, no migration, no visit transaction — and the
  resolver's own source is asserted not to assign either. Both fields are optional on `CityState`, so a
  legacy save resolves to day 1 with empty histories and `createNewProfile()` still writes no `city`.

- **One compatibility change outside the new files, and it is type-only.**
  `selectDailyWindow`'s `id` (and its private `rotationStart`) is now typed `string` instead of
  `StorefrontId`, because it is a NAMESPACE IN THE HASH KEY, not a storefront lookup — that is what lets
  the visitors reuse the one rotation instead of growing a second hash. No expression changed;
  `rotateStorefrontStock` still takes a `StorefrontId`, and the merchant/rotation suites re-run green
  with the day-1 window still `helm_centurion, chest_golden_muscled, arms_manica_steel,
  arms_galerus_gilded`.

- **What deliberately did not change.** `advanceCityDay` still has its one call site (the duel
  settlement), and the merchant offer, the training timetable (day 1 still rests `stamina`), the
  injury/rest transactions and the collision registry are re-pinned unchanged in §J. `cityClock.ts` is
  untouched; `cityRotation.ts` carries the type widening above and nothing else.

- **Regression suite: `src/utils/visitorSchedule.test.ts` — 46 tests / 2,389 `expect()` calls**, ten
  sections: §A the catalogue (ids, bounds, well-formed offers, real content, spine-only pools, frozen
  data); §B determinism (repeated calls, 30 consecutive days, fresh arrays); §C the arrival rule
  (an **independent** `fnv1a` reimplementation compared on 400 days, a failing-cadence day, both
  window boundaries shown respected *where the hash matches*, the end of a season, catalogue order);
  §D day sensitivity (the pinned days 1/5/8/15/31, per-visitor arrival counts, the 52/10 density
  record); §E completion (permanent exclusion on every arrival day, independence from the other
  visitors, seen-is-not-done, junk ids, the explicit-day form); §F the clock (legacy save, no profile,
  12 malformed days against `normalizeCityDay` itself, fractional flooring, malformed container, and
  that resolving never advances the day); §G the readers; §H offers (equality with `selectDailyWindow`,
  one real item per arrival, rotation, empty pool); §I purity and scope (nothing mutated, a frozen
  profile answerable, exactly the four house imports, and no `Date`/timer/storage/randomness token in
  either new file); §J the neighbours and the wiring guard.

- **Verified 2026-10-21** in the `web` dev container, on the final tree: focused
  `bun test src/utils/visitorSchedule.test.ts` → **46 pass / 0 fail** (2,389 `expect()`, first run);
  `bun test` → **2866 pass / 0 fail (97 files, 87,688 `expect()`)** (the 2820 / 96 baseline plus this
  suite); `bun run scripts/combatTests.ts` → **65 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  **exit 0** after one real fix the widening exposed (`rotationStart`'s parameter had to follow
  `selectDailyWindow`'s — a type error, not a behaviour change); `bun run build` → **exit 0** with the
  startup-asset check passing (8 assets; the pre-existing >500 kB chunk warning only);
  `git diff --check` → clean.

- **Nothing to see on device, and no new open item.** This phase renders no pixel and mounts no UI: no
  preview capture was needed and none was taken, and the open Android checklist (the C-8.41 kerb, the
  northern approach, the arena and district reads, the workshop, the race camera, the injury and rest
  flows) is exactly as before. The next phase in the audit's own sequence (L5 step 2) is the visitor
  interaction and its offer purchase, which is the only thing allowed to write `seenVisitors` /
  `completedVisitors`.

## Living City L11 — visitor encounters (implemented; meeting recorded, completion NOT implemented)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`7d206c11a6`** ("Implement
  visitor schedule and arrival system"), parent `143edd0d50`, `git status --short` **empty** — the
  state the L10 record and the L10B audit both described. **There is no separate L10B record in this
  file**: that audit was read-only and changed nothing, so its findings live in the phase report, not
  here. Nothing was reset, stashed or overwritten.

- **The window semantics are adopted as this phase's approved reading.** A visitor's `window` is an
  **inclusive range of city days** (`from ≤ day ≤ to`), on which the L10 cadence predicate
  `fnv1a(`${day}:${visitorId}`) % cadence === 0` decides the day; eligibility is that predicate **and**
  schedule membership **and** absence from `completedVisitors`. No time-of-day clock, dwell duration,
  wall-clock timer or random scheduling was introduced, the L10 resolver and the L2 rotation are
  untouched, and **no catalogue bound, cadence or offer changed** (`src/data/visitors.ts` and
  `src/utils/visitorSchedule.ts` are byte-identical to L10).

- **The interaction surface: one HUD entry and one panel — no mesh, no disc, no collider.**
  `CityHubScene` reads `resolveVisitorSchedule(playerProfile).arrivals` in a `useMemo` keyed on the
  profile (so nothing is resolved per frame), and shows a **`VISITORS n` chip in the header only when
  `arrivals.length > 0`** — a visitor is an occasion, so on a day with nobody in town the chip does not
  exist. `src/components/hub/VisitorPanel.tsx` (new) is the focused interaction: a `PreFightModal`-
  shaped overlay listing the day's visitors, a selectable row per visitor (name, title, a `MET` badge
  once seen) and a detail pane with the visitor's flavour, the day's offer item (name and description
  from `ITEMS_DB`) and the line **"No trade is offered yet."** It displays **no price and has no buy
  control**, because no purchase is approved in this phase. **The physical-visitor work the audit
  sequenced as "L7 — city presentation & performance" (static meshes gated on `activeToday`, discs
  under the C-8.47 nearest-wins rule) is deliberately NOT started**: `cityCollisions.ts` carries no
  visitor entry, so `HUB_LOCATIONS` is still 21 discs and the frame's cost is unchanged.

- **Seen is a meeting; completion is undefined, so completion is NOT implemented.** Choosing a visitor
  in the panel is the encounter, and it is the **only** thing that writes history:
  `src/utils/visitorEncounter.ts` (new, pure) exposes `recordVisitorEncounter(profile, visitorId)` —
  the one write of `seenVisitors` — plus `isVisitorInTown` and `resolveVisitorEncounter` (the view the
  panel renders: visitor, offer id, resolved item, `seen`). It refuses (`no-profile`,
  `unknown-visitor`, `not-in-town`) before writing anything, deduplicates against the stored history
  (a repeat answers `ok: true, recorded: false` with the caller's own profile object, so **no second
  save**), preserves every other profile and city field, never advances the day and **never writes
  `completedVisitors`**. `App.handleVisitorEncounter` reads `profileRef.current` (so a stale panel
  callback cannot overwrite newer state) and commits through the existing `setProfile` + `saveProfile`
  pair exactly once, only when `recorded` is true.

- **The unresolved product decision, stated precisely.** The roadmap defines `completedVisitors`
  ("completion → excluded permanently") and the L10 catalogue calls its pool the visitor's *offer*, but
  **nothing in this repository says what action completes a visit** — neither the roadmap's L5/L6
  entries nor the L10 record name the event, and L6 is the first phase allowed to sell anything
  visitor-specific. So this phase stops at `seenVisitors`. The decision the next phase needs:
  **does buying the day's offered item — through the existing purchase rule, at its `ITEMS_DB` price —
  mark the visitor completed (and, if so, permanently, as the roadmap says, which also means one
  purchase ends all future trades with that visitor for a 2–3 item pool)?** The alternatives are a
  separate completion step (a courtesy, a gift, a dismissal) or deferring completion to L6's rare
  chariot parts. No reward, cost, price or completion condition was invented here to make the UI work.

- **Two App slice placements, and one guard, were rebased — not weakened.** (1) `handleVisitorEncounter`
  sits after `handleResetGame`, at the end of the mutator list, because three existing suites slice
  `App.tsx` by handler boundaries (`restRecovery` §G between `const handleRest` and `const handleBuyItem`;
  `trainingSession` between `const handleTrainStat` and `const handleBuyItem`; `storefrontPurchase` §I
  and `cityRotationL3` between `const handleBuyItem` and `const handleSellItem`, the latter asserting
  exactly one `saveProfile(`). Placing it anywhere inside those spans made a neighbour's slice count two
  saves — a genuine overlap, so the handler moved rather than the neighbours' assertions being relaxed.
  (2) The L10 suite's `§J  no screen, scene or collider carries visitor wiring` became false the moment
  this phase wired the panel; it is now **"visitors still have no geometry, collider or disc"** and
  asserts the properties that must still hold: `cityCollisions.ts` names no visitor, the scene carries
  no `VisitorMesh`/`visitorDisc`/`visitorCollider`/`activeToday`, exactly one `<VisitorPanel` is
  mounted, and `App.tsx` never assigns `completedVisitors`. Every other L10 assertion is untouched.

- **Regression suite: `src/utils/visitorEncounter.test.ts` (new) — 30 tests / 93 `expect()`** in six
  sections: §A the transaction (one meeting records one id; a repeat records nothing; dedupe against a
  stored history; two visitors accumulate in the order met; every profile and city field survives —
  pinned as a whole `city` object; a malformed container is refused; a junk-filled history is filtered);
  §B eligibility (not in town today, past its window, unknown id, no profile, a **completed** visitor,
  and the view agreeing with the schedule); §C seen is not done (a met visitor still arrives, the same
  schedule is produced, `completedVisitors` stays unwritten, the day never moves, and a source scan of
  the module finds no writer for anything but `seenVisitors`); §D purity (no mutation, a frozen profile
  answerable and a new object returned, passive resolution writing nothing); §E the neighbours (the
  merchant window on day 1, the training timetable, the rest fee, `advanceCityDay` and the catalogue's
  spine-only pools); §F the wiring (`App` is the one caller and reads `profileRef.current`, the handler
  is handed to the scene once, the scene lists the schedule and mounts one panel, the panel calls
  `onEncounter` only from a click and never from an effect, the panel names no purchase, `.price` or
  `saveProfile`, and the L10 resolver still has no writer).

- **Verified 2026-10-21** in the dev container, after the last edit: focused
  `bun test src/utils/visitorEncounter.test.ts src/utils/visitorSchedule.test.ts` → **76 pass / 0 fail**
  (2,483 `expect()`); `bun test` → **2896 pass / 0 fail (98 files, 87,784 `expect()`)** (the 2866 / 97
  baseline plus this suite's 30 tests and its file); `bun run lint` (`tsc --noEmit`) → exit 0;
  `bun run build` → exit 0 with the startup-asset check passing (8 assets; the pre-existing >500 kB
  chunk warning only; `dist/` is gitignored); `git diff --check` → clean. The validation's starting
  point was **2 failures in the new suite** (both mine: an expected history order, and the merchant
  window read on day 5 instead of the day-1 baseline) and **3 in existing suites** — the two
  App-slice overlaps and the L10 §J guard above. No assertion was loosened to pass.

- **Live evidence — the encounter driven through the real interface.** The preview browser is an
  **anonymous visitor (no session replayed)**, so a profile was created through the app's own creation
  path and seeded to **city day 5 with the Oath sworn** (a new gladiator opens the city on the Oath
  beat, which has no HUD). Driven in an in-page frame against the dev server — C-8.66C's technique, so
  the app re-reads the seeded save without a platform fresh load — the real clicks produced: the
  header chip reading **`VISITORS 1`** (day 5 is the bladesmith's first day); the panel opening on
  **`CITY DAY 5`**, listing **Hanno of Cirta · Wandering Bladesmith**; and, after selecting him, the
  stored profile gaining exactly **`city.seenVisitors: ["numidian_bladesmith"]`** with
  `completedVisitors` still **absent**, `city.day` still **5**, **gold unchanged** (100), and the same
  profile otherwise byte-identical. The rendered frame after the meeting shows the row's green **`MET`**
  badge and the detail pane's **"Brought to trade — Desert Dirk"** with **"No trade is offered yet."**
  A **second click on the same row wrote nothing** (the stored string was identical before and after),
  which is the dedupe + no-second-save rule observed end to end rather than inferred. Cleanup: the
  frame was removed and the seeded save deleted, leaving `localStorage` **empty**, as it was before the
  run.

- **Not automatically verified, and the honest caveats.** (a) The `MET` badge was read from the
  **captured frame**, not from a DOM read after the click — that read returned a stale panel node
  (`rowShowsMet: false`) while the screenshot taken at the same moment shows the badge, so the badge is
  visually confirmed and the DOM read was an automation artefact, not a defect. (b) The two earlier
  captures in that run landed on the game's own asset preloader overlay; only the third frame is
  evidence of the panel. (c) **Not exercised at all:** a day with **no** visitors (the chip is then
  absent by construction and by the source guard), a visitor the player has **already met** on a later
  day, a **completed** visitor (impossible to reach — nothing writes completion), and the panel at a
  phone breakpoint. (d) **Android / device acceptance is PENDING** for the chip's fit in the header
  cluster (gold · fame · settings · cloud · mute · menu), the panel's legibility in landscape and its
  scroll behaviour on a small screen, as with every other phase here. (e) No browser or device evidence
  is claimed for anything outside the city hub: this phase adds no other route or screen.

## Living City L12 — visitor purchase and permanent completion (implemented)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`18512af109`** ("Implement visitor encounter system and
  interaction panel", the tip this phase started from), `git status --short` **empty** before the
  first edit. The L11 baseline was present exactly as recorded: `src/utils/visitorEncounter.ts`,
  `src/components/hub/VisitorPanel.tsx`, the scene's visitor chip/panel mount, App's
  `handleVisitorEncounter`, and the two optional `CityState` history fields. Nothing was reset,
  stashed or overwritten.

- **The product decision L11 left open is now settled, as the phase approved it.** **One successful
  visitor purchase permanently completes that visitor.** The day's offer — the exact item the L10
  schedule resolves for that visitor on that city day — is sold at its canonical `ITEMS_DB` price;
  the purchase grants one copy through the existing `[...inventory, item]` convention and appends the
  visitor id to `city.completedVisitors` in the SAME profile literal. `seenVisitors` is preserved;
  the L10 schedule already excludes completed ids, so a finished visitor never appears again. The
  purchase pays no fame, XP or bonus, does not advance the day, does not touch the merchant's daily
  allowance, adds no visitor-exclusive item and invents no price.

- **What ships: one pure transaction, one App handler, the panel's buy control, one suite.**
  **New** `src/utils/visitorPurchase.ts` and `src/utils/visitorPurchase.test.ts` (42 tests);
  **modified** `src/components/hub/VisitorPanel.tsx` (price, buy control, success/refusal message),
  `src/components/3d/city/CityHubScene.tsx` (the `onPurchaseVisitor` prop passed to the one panel),
  `src/App.tsx` (`handleVisitorPurchase`, placed after `handleVisitorEncounter` so the existing
  App-slice guards in `storefrontPurchase`, `cityRotationL3`, `restRecovery` and `trainingSession`
  stay outside it), and `src/utils/visitorEncounter.test.ts` (one guard rebased, below).
  `src/data/visitors.ts`, `src/utils/visitorSchedule.ts`, `src/utils/cityClock.ts`, the item
  catalogue and every other transaction are byte-identical.

- **The transaction contract.** `purchaseVisitorOffer(profile, visitorId)` checks in a fixed order —
  profile, catalogue, **already-completed** (before the schedule, so a finished visitor reads as
  finished), schedule membership (`resolveVisitorEncounter`), the offer belonging to that visitor's
  pool, the item in `ITEMS_DB`, its price, the purse shape, the inventory shape, then affordability —
  and only then returns ONE new profile. Refusals are `no-profile | unknown-visitor |
  already-completed | not-in-town | no-offer | unknown-item | invalid-price | invalid-gold |
  invalid-inventory | insufficient-gold`; a refusal carries no profile at all, so nothing can be
  partially written. The offer is re-resolved from the schedule at purchase time, so a stale panel
  selection cannot buy anything the visitor is not offering today.

- **Malformed data cannot produce a free or duplicated purchase.** `resolveVisitorItemPrice` (exported
  for its own tests) refuses `NaN`, `Infinity`, negatives and non-numbers — a `NaN` price would
  otherwise pass every `gold <` comparison and sell for nothing; a finite zero stays legitimate.
  Gold must be a finite, non-negative number and the inventory a real array, or the transaction
  refuses instead of rebuilding either. The completion entry is itself the replay guard: a second
  callback sees `already-completed` and stops before charging.

- **UI.** The panel shows the actual item name and `{price} gold`, disables the control below the
  price (`Not enough gold`, with the player's purse stated), sends only the visitor id, and renders
  the transaction's own result: a success reads "*<name>* has departed — the trade is complete." and
  the completed row disappears (the schedule no longer lists it); a refusal names the reason in plain
  language. `MET` still means met — only a purchase completes.

- **One L11 guard was rebased, not weakened.** `visitorEncounter.test.ts`'s "the panel sells nothing:
  no purchase, no price, no completion" asserted exactly what L12 changes, so it is now "the panel
  sells only through the one visitor transaction": it still forbids the storefront/chariot purchase
  helpers, `saveProfile` and `completedVisitors` inside the panel, and now pins the single
  `onPurchase(` call site. Every other L10/L11 assertion is untouched and still passes.

- **Verified 2026-10-21** in the `web` dev container, on the final tree: focused
  `bun test src/utils/visitorPurchase.test.ts src/utils/visitorEncounter.test.ts
  src/utils/visitorSchedule.test.ts` → **118 pass / 0 fail** (2,701 `expect()`); related
  `visitorPurchase + visitorEncounter + visitorSchedule + storefrontPurchase + cityRotation +
  cityRotationL3 + trainingSession + restRecovery + injurySettlement + storefrontWiring` →
  **314 pass / 0 fail** (7,084 `expect()`); `bun test` → **2938 pass / 0 fail (99 files,
  88,012 `expect()`)** (the L11 baseline was 2896 / 98, so the delta is this suite's 42 tests and
  its file); `bun run lint` (`tsc --noEmit`) → **exit 0**; `bun run build` → **exit 0** with the
  startup-asset check passing (8 assets); `git diff --check` → clean. The suite's starting point was
  three failures, all in its own new assertions (an over-eager `Number.isFinite` on the deliberately
  negative gold case, the merchant's window read on day 5 instead of day 1, and an App slice anchored
  on a comment the suite strips); each was corrected in the test, none by loosening the transaction.

- **NOT automatically verified — the purchase driven in the browser.** The preview browser is an
  anonymous visitor with **no save**, so the app starts at the title on **day 1**, and the city has
  no visitors until day 5 (the L10 schedule's first arrival). Visitors only exist from day 5 and the
  day advances only on a settled duel, so reaching a visitor needs character creation → the 3D city →
  the Colosseum → a full fight, which this environment cannot sustain (SwiftShader ~2 fps). A seeded
  save cannot substitute: the platform's fresh loads **clear browser storage** — a day-5 profile
  written and reloaded inside the page read back **absent** (`hasSave: false`) on the next load,
  which is the C-8.66C finding re-confirmed here. The dev server does serve the changed modules
  (`/src/utils/visitorPurchase.ts` and `/src/components/hub/VisitorPanel.tsx` → HTTP 200), and the
  wiring is pinned by the suite. **The rendered successful purchase and the insufficient-gold
  refusal therefore remain a manual/device check** — reach day 5 (or earn a visitor’s offer) and buy;
  and note the panel opens only on a day the schedule lists someone.

## Profile-mutation handlers read the committed profile (§L12-hardening — implemented, verified live)

- **The gap.** Four App handlers — `handleSellItem`, `handleEquipWeapon`, `handleEquipArmor`,
  `handleAllocateStatPoint` — built their update from the render's `profile` state rather than the
  newest committed profile, unlike the training / rest / storefront / visitor transactions, which
  read `profileRef.current` and write it back immediately. `profile` is one render behind a click
  that fires twice before React re-renders, so a duplicated sell or equip could rebuild the profile
  from the older snapshot and overwrite what the first call had already committed.
- **The change is App-local and behaviour-preserving for a single click:** each handler now takes
  `const base = profileRef.current`, applies the same pure transaction / same field writes, then
  writes `profileRef.current = updated` before `setProfile` + `saveProfile`. No transaction module,
  save shape, price, stat or storage key changed; the refusal semantics are identical (`sellItem`
  still hands back the caller's own object on refusal, compared against the ref's base).
- **Verified live (2026-10-21, preview browser, throwaway profile in an in-page frame, removed
  afterwards):** allocating one stat point moved `baseStats.strength` 10 → 11 and
  `unspentStatPoints` 5 → 4 in the saved profile; equipping the spare weapon moved
  `equipped.weapon.id` `gladius_standard` → `hoplite_spear`; exactly one storage key was written.
  Suites: `storefrontPurchase`, `cityRotationL3`, `restRecovery`, `trainingSession`, `selling`
  (132 pass), `bun run lint` exit 0. **Not driven live:** the sell click (same handler shape and
  pinned by `selling.test.ts`).

## L12C — profile-ref hardening verification closeout (verified, no production code changed)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`487f6747b6`**
  ("Refactor state updates to use profileRef for consistency"), `git status --short` **empty** before
  the first edit — the hardening itself is that commit (`src/App.tsx` +36/−14, this file +21), so
  L12C is a verification phase and this turn's diff is the new suite plus this section.
- **Confirmed in the shipped source.** `handleSellItem`, `handleEquipWeapon`, `handleEquipArmor` and
  `handleAllocateStatPoint` each take `const base = profileRef.current`, apply the same pure
  transaction / field writes as before, then write **`profileRef.current = updated`** and only then
  call `setProfile(updated)` + `saveProfile(updated)` — one identical object through all three, in
  that order. Refusal semantics are unchanged: `sellItem` hands back the caller's own object and is
  compared against the ref's base, so a refused sale touches nothing. Prices, inventory behaviour,
  stat rules and the save shape are untouched by the hardening.
- **New regression suite: `src/utils/profileMutationCommit.test.ts` (19 tests, 95 `expect()`).**
  There is no DOM renderer in this repo, so `<App/>` cannot be mounted; instead of duplicating the
  handlers next to the real ones, the suite **extracts each handler's own source text out of
  `src/App.tsx`** (brace-matched, comments stripped), transpiles it with Bun's own transpiler and
  executes it against the **real** `sellItem` / `purchaseVisitorOffer` transactions. `setProfile` only
  records the commit and a `render()` helper syncs the ref — React's `useEffect` semantics — so a
  handler that forgot its ref write is caught: §F replays the same source with the `profileRef.current
  = …` lines spliced out and the sale is silently lost (the purchase rebuilds from the pre-sale
  snapshot), which is the pre-hardening defect. Sections: §A extraction/ordering guards; §B **the
  critical regression** — sale then visitor purchase in one tick, both changes in the one saved
  profile, one save each; §C refusals (equipped item, unowned item, no visitors in town,
  insufficient gold, no stat points) write nothing; §D a duplicated purchase charges once
  (`already-completed`); §E equip weapon / equip armor / stat allocation, including a three-step
  sequence in one tick; §F the control. **Limitation, stated in the file header:** this executes the
  production handler source with the production transactions, but it does not render React — the
  click path in a browser is still the manual check.
- **Stale-ref risk in seven more App paths — identified by L12C, since RESOLVED (kept for the record).**
  Out of L12C's scope (no behaviour changes were authorised there), that phase found and deliberately
  did not change six other App handlers that still built their update from the render's `profile`
  state rather than `profileRef.current` — `handleBuyChariotPart`, `handleEquipChariotPart`,
  `handleMatchComplete`, `handleChooseBannerDevice`, `handleBuyRacingConfig`,
  `handleSelectRacingConfig` — plus `enterCity`'s `arrivalProfile` write. Each was either single-shot
  or guarded by its own latch/refusal (the duel settlement `duelSettlementRef`, the one-time banner
  choice, the ownership checks in the chariot/racing transactions), so none was a known live defect,
  and they were recorded so the hardening could be extended deliberately rather than rediscovered.
  **The L13 hardening phase did exactly that, so this paragraph describes L12C's tree, not today's:**
  every one of the seven now derives its base from `profileRef.current` (with `?? profile` as the
  first-render fallback where a render snapshot is still needed), writes the ref **before**
  `setProfile` + `saveProfile`, and commits the one resulting object through all three — the same
  triad L12C established. See the L13C closeout at the end of this file, which also pins the
  city-entry path that now owns its own arrival write.
- **Verified 2026-10-20** in the dev container: focused
  `bun test src/utils/profileMutationCommit.test.ts` → **19 pass / 0 fail**; focused with the
  transaction neighbours (`visitorPurchase`, `visitorEncounter`, `visitorSchedule`, `selling`,
  `storefrontPurchase`, `trainingSession`, `restRecovery`, `cityRotation`, `cityRotationL3`) →
  **293 pass / 0 fail (10 files, 6,882 `expect()`)**, exit 0; `bun test` → **2957 pass / 0 fail
  (100 files, 88,107 `expect()`)**, exit 0; `bun run lint` (`tsc --noEmit`) → **exit 0**;
  `bun run build` → **exit 0** with the startup-asset check passing (8 assets; the pre-existing
  >500 kB chunk warning only); `git diff --check` → **clean, exit 0**.
- **Not automatically verified.** No browser/device pass this turn, because no production file
  changed: the rendered sell / purchase / equip / allocation clicks are outside what a `bun test`
  suite can drive here. The prior session's live record (one stat point 10 → 11 with the point spent,
  the spare weapon equipped, exactly one storage key written) stands for the equip and allocation
  paths; **the sell click has never been driven in the UI**, only through `selling.test.ts` and this
  suite's handler execution.

## L13C — silent milestone grandfathering, and its closeout (implemented; herald regression added)

- **Preflight (measured at the closeout).** Branch `development-focus-strategy`, HEAD
  **`be5f0367f49f4d22c8db6d9d63cbdf9fb4729480`** ("Add silent option to ritual evaluator for city
  entry"), `git status --porcelain` **empty** before the closeout's first edit — so L13C itself is
  that commit (`src/App.tsx` +18/−6, `src/utils/roadMilestones.ts` +29/−6,
  `src/utils/profileWritersCommit.test.ts` +138/−22, `src/utils/roadMilestones.test.ts` +122/−1,
  4 files, +307/−35), and this closeout's own diff is two test files plus this record. **No
  L13A/L13B/L13C section existed in this file before this one**, so the L13 series' only written
  record is here; the hardening commits themselves (`0bd88a3`, `4165026`) are documented by the code
  they shipped and by the suites below.

- **The defect L13C fixed.** City entry evaluated the road against **the profile itself**
  (`evaluateRituals(forProfile, forProfile)`), so no stage could ever be "fresh" and the arrival write
  never fired: a legacy, imported or cloud-loaded save — a gladiator already past Veteran with no
  `road` field — kept no milestone history at all, and its device-panel offer was the only thing that
  ever fired. The call is now a genuine null baseline, recorded silently:
  `evaluateRituals(null, forProfile, { silent: true })`.

- **The contract, confirmed in the shipped source (read, not assumed).**
  1. **Null baseline, silent register.** `App.enterCity` passes `null` and `{ silent: true }`; the
     self-comparison is gone.
  2. **Silent suppresses the herald only.** In `evaluateRoadMilestones` the `cries` array is the one
     silent-gated quantity; `changed`, `profile`, `rituals` and `offerDeviceChoice` are computed
     outside that branch, so recording still happens and the device offer is untouched. Silent also
     suppresses the **boss** cries, which matters because a null baseline would otherwise read the
     save's whole boss history back as news.
  3. **The duel settlement is unchanged and loud.** Both branches still call
     `evaluateRituals(base, updatedProfile)` with a real before/after pair and no options, where
     `base = profileRef.current ?? profile`.
  4. **History is deduplicated and append-only.** `!seen.includes(id)` plus the `seen`+`fresh` spread;
     the appended ids follow road order, while an existing entry keeps its stored position (a save
     holding `['blooded']` becomes `['blooded', 'sworn', 'known']`) — append-only, not sorted.
  5. **One object through ref → state → disk.** `profileRef.current = arrivalProfile` first, then
     `setProfile`/`saveProfile` with the same reference, and only when `arrivalProfile !== forProfile`
     (an already-recorded road writes nothing and still syncs the ref).
  6. **Nothing else moved.** The evaluator spreads `after` and replaces only `road.milestonesSeen` —
     rank derivation, oath state, rewards, fame, tier, boss history, inventory, injury and the city
     day are carried by identity, and `road.oathSworn` / `road.bannerDevice` are never written by it.
  7. **Device-choice eligibility is unchanged.** `offerDeviceChoice = pastVeteran && bannerDevice ===
     null`, independent of `silent`; the panel renders only while `deviceChoiceOpen && profile`, and
     the hub's manual opener lives inside `BannerRow`'s no-device branch, so a recorded choice cannot
     reopen it (a "Not yet" dismissal still re-offers at the next evaluation, by design).

- **Call sites swept.** `evaluateRoadMilestones` has exactly three call sites in `src/` — `enterCity`
  (silent, null baseline) and the two duel branches (loud, real baseline). Ordinary entry into the
  city with an already-recorded road stays quiet: no save, no render, no herald, no device offer
  (pinned by `profileWritersCommit` §F).

- **The closeout's additions (the L13D pass) — four tests, no production change.** Both are in the
  suites that already execute production source; no gameplay file was touched.
  1. **`duelSettlementCommit.test.ts` §G (3 tests) — the herald channel §A–§F built but never read.**
     That harness extracts App's own `evaluateRituals` and `handleMatchComplete` text, transpiles it
     and runs it against the **real** `evaluateRoadMilestones`, and it already recorded
     `setHeraldCries`; the recorder was simply never asserted. §G now drives a genuine settlement on
     a profile five fame short of Veteran and asserts (a) the bout itself crossed the gate
     (`deriveRank` Rookie → Veteran) and recorded `['sworn','blooded','known']`, (b) the herald was
     called **exactly once**, with exactly `The herald cries: Audax, Veteran of the Ludus!`, and no
     Champion or boss cry rode along, (c) a bout reaching only a cry-less stage (`blooded` on a first
     win) records it and says nothing, and (d) a second bout that re-treads the already-recorded stage
     does not call the herald again. So the duel settlement's announcement is now **observed** rather
     than inferred from the helper.
  2. **`roadMilestones.test.ts` §F (1 test) — a torn history that also owes stages.**
     `road: { milestonesSeen: ['blooded', 42, null, {id:'known'}] }` on a Veteran save yields
     `['blooded','sworn','known']`: valid ids preserved in stored order, junk dropped by the resolver,
     each earned id added once, no duplicates, and a second arrival writes nothing (same profile
     object). Previously only the "torn but owes nothing" path was pinned.
  3. Both file headers were updated to describe the sections they now contain (§G in the settlement
     suite; §F's torn case and the previously undocumented §I in the road suite).

- **Checks actually run (2026-10-21, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/roadMilestones.test.ts` | **30 pass / 0 fail**, 121 `expect()` |
  | `bun test src/utils/profileWritersCommit.test.ts` | **24 pass / 0 fail**, 150 `expect()` |
  | `bun test src/utils/duelSettlementCommit.test.ts` | **21 pass / 0 fail**, 104 `expect()` |
  | the three together | **75 pass / 0 fail**, 375 `expect()` |
  | herald/settlement neighbours (`roadOfGlory`, `duelSettlement`, `duelResultLifecycle`, `gladiatorOath`) | **105 pass / 0 fail**, 733 `expect()` |
  | `bun test` (full) | **3015 pass / 0 fail (103 files, 88,432 `expect()`)** — this closeout's four tests are the delta, the file count unchanged because both suites already existed |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `bun run build` | **exit 0**, startup-asset check passing (8 assets in `public/` and `dist/`; `dist/` is gitignored) |
  | `git diff --check` | **clean (exit 0)** |

  The earlier counts recorded elsewhere in this file (2957 / 100 at L12C, and the L13A commits after
  it) are **earlier measurements, not this phase's**; only the rows above were run here. No assertion
  was loosened and no existing test was edited for these additions.

- **What the evidence does and does not prove.** Verified by execution: the evaluator's silent/aloud
  registers, the recording and dedup rules, the single commit object, and — through the extracted
  App source and the real helper — the settlement's one cry, its absence for a cry-less stage and its
  suppression on a repeat. **Modeled, not rendered:** there is no DOM renderer in this repo, so the
  harness supplies `setProfile`/`saveProfile`/`setHeraldCries` recorders and a `render()` that syncs a
  ref; React batching and `HeraldToast` itself are not exercised. **Source pins, not behaviour:** the
  duel-vs-city call shapes are also pinned as text (a reformat would fail them), and they prove call
  shape rather than semantics. The torn-history rewrite drops non-string entries only when something
  is owed — that repair is now asserted, but it remains a side effect of the rewrite rather than a
  declared sanitizer. **No browser or device pass was made or is claimed here:** this phase changes no
  production file, so there is no rendered pixel to accept, and nothing in it may be read as Android
  acceptance. The pre-existing live items (the visitor chip/panel on target hardware, the Medical
  House rest interaction, the wind-up cue, duel settlement and payout on device) are unchanged.

- **Follow-ups worth a decision, not defects.** (a) `silent` is opt-out: a future call site pairing a
  null baseline with the default would replay the save's entire boss history as herald cries — making
  silence implicit when `before == null`, or asserting every call site's options, would close that.
  (b) The evaluator computes `newlyDefeatedBosses` even when silent (its result is discarded); harmless,
  but it is work done for nothing on every arrival.

## Living City L14 — a night at the Caravanserai (implemented; the stay verified live, the refusals not)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`d5090928b8`** ("Implement
  lodging system and caravanserai functionality"), the L13C record above being the branch's previous
  Living City entry. L14 landed as that commit (`src/utils/lodging.ts`, `src/utils/lodging.test.ts`,
  `src/types/game.ts`, `src/App.tsx`, `src/components/3d/city/CityHubScene.tsx`,
  `src/utils/cityCollisions.ts`, `src/utils/restRecovery.test.ts`; 7 files, +968/−13) and was
  **written up nowhere** until this record. This turn's own diff is one suite fix (below) plus this
  section — **no production file changed**.

- **What ships: the second way to spend a city day without a bout.** Until L14 the clock only moved on
  a settled duel (L1) and on a treatment at the Arena Medical House (L9), so a player who wanted
  tomorrow's merchant stock, tomorrow's training timetable or tomorrow's visitors had to fight for it.
  `src/utils/lodging.ts` is the inn's transaction, in the house contract of `restAtMedicalHouse` /
  `trainStat` / `purchaseStorefrontItem`: **one base, checks before the commit in a fixed order, one
  new profile, a refusal that writes nothing.** It is PURE — no storage, React, timer, wall clock or
  randomness, asserted over comment-stripped source — and it is **not a second clock**: the day is
  read and advanced only through `utils/cityClock.ts`.

- **The contract, exactly as shipped.** `LODGING_DAY_FIELD = 'lodgingDay'`; refusals
  `no-profile | already-lodged | insufficient-gold`, checked in that order; on success
  `entryDay = resolveCityDay(profile)` is captured **first**, `cost = trainingCost(profile.level)`
  (**25 × level**, the Ludus's own helper, so there is one price formula and not two), the clock turns
  **exactly once** by `advanceCityDay`, and ONE new profile carries the advanced `city` (with
  `lodgingDay: entryDay` beside the new day, never over it, and every other city field preserved),
  `gold − cost`, and **the injury slot carried across untouched** — a room is not the medicus: nothing
  is healed, awarded, equipped or settled, and no statistic moves. `resolveLodgingDay` /
  `isLodgingSpentToday` are total on read (absent, wrong type, `NaN`, zero, negative → `null`, i.e.
  malformed data can only ever GRANT the stay), `lodgingCost` quotes the level-1 floor for a malformed
  level, and a legacy profile with no `city` lodges from day 1 into day 2. `RestResult`'s own `day` is
  the day the stay **consumed**, not the day the profile now stands on.

- **The wiring — one handler, one prompt, one notice, and the inn stops being the Armory.** A new
  `CityState.lodgingDay?: number` (`src/types/game.ts`) is the record (ONE number, not a log).
  `App.handleLodging` reads `profileRef.current` (the L4/L5 newest-committed pattern, so a double click
  cannot treat twice off a stale base), writes the ref, `setProfile` once and `saveProfile` once, and
  does no clock work of its own. `CityHubScene` takes the narrow `onLodging: () => LodgingResult`
  prop, and its `caravanserai` branch now calls it and reports through the **existing** `stableNotice`
  via a local `lodgingNotice(result, level)` — the same "render the result, never the request"
  discipline as `restNotice`, so a refusal says why and claims no night, and a success names the day
  from the committed profile (`resolveCityDay(result.profile)`) and the fee actually charged, adding
  in so many words that no wound is tended there. `cityCollisions.ts`'s `caravanserai` entry loses its
  `tabKey: 'gear'` (it used to open the **Armory**, which equips rather than sells or sleeps), its
  prompt becomes **"Take a Room"**, and its centre, radius (5.75, the C-8.47 value), colour, district
  and fast-travel arrival (`[10, 14]`) are unchanged — so no collider, hub distance or arrival moved.
  The Armory keeps its own footer tab, and the Bathhouse/Medical House neighbours are untouched.

- **Measured behaviour (the suite's own numbers, `src/utils/lodging.test.ts`, 48 tests).** Day 1 at
  level 1 pays **25** and wakes on day 2 with `lodgingDay: 1`; `cost === trainingCost(level)` at levels
  1/2/5/9; the clock advances exactly one day from days 1/4/9/40; nothing is awarded (xp, fame,
  inventory, base stats, tier and defeats identical); every refusal leaves the input profile, its
  `city`, `inventory` and `baseStats` untouched; a legacy save with no `city` lodges 1 → 2; the fee,
  the allowance and the advanced day arrive in ONE object and survive one real
  `saveProfile`/`loadSavedProfile` round trip; and the day-dependent systems the stay exists for
  resolve from the **new** day through their own existing resolvers (the merchant's offer and
  allowance, the Ludus's timetable and the visitors' arrivals), with no rule of theirs restated. The
  L9 record's clock-caller assertions were **rebased, not weakened**, because `utils/restRecovery.ts`
  is no longer the only non-settlement caller of `advanceCityDay` — `utils/lodging.ts` is the second.

- **The suite repair this turn — and why it was the suite, not the handler.** The L14 commit left
  `bun test` at **3062 pass / 1 fail**: `visitorPurchase.test.ts` §H ("App calls the transaction once,
  from the newest profile, and saves once") counts `saveProfile(` inside App's visitor handler and
  bounded that slice at `if (!webglAvailable)`. L14's `handleLodging` now sits between the two, so the
  slice held **two** saves. The handler is correct — the §H property is about **this transaction's**
  handler — so the slice is now bounded at the **next top-level declaration**
  (`APP_CODE.indexOf('\n  const ', handlerStart + 1)`), which is the property it always meant: one save,
  one `setProfile`, and the `if (!result.ok) return result;` guard, inside the visitor handler and
  nothing else. **No assertion was removed, relaxed or reordered**; the same three counts are asserted
  on a correctly bounded slice, and a future handler added between them cannot break it again.

- **Checks actually run (2026-10-21, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/visitorPurchase.test.ts` | **42 pass / 0 fail**, 228 `expect()` (was 41/1) |
  | `bun test` (full) | **3063 pass / 0 fail (104 files, 88,685 `expect()`)** |
  | `bun run scripts/collisionTests.ts` | **123 passed, 0 failed** |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `bun run build` | **exit 0**, startup-asset check passing (8 assets in `public/` and `dist/`) |
  | `git diff --check` | **clean (exit 0)** |

- **Live evidence — the stay driven through the real interface, and it matches the numbers.** The
  preview browser is an **anonymous visitor (no session replayed)**, so a profile was seeded into its
  own storage (`sand_and_steel_gladiator_save_v2`: city day **3**, gold **500**, level 1,
  `road.oathSworn: true` so the Oath beat stays out of the HUD) and the app was loaded **inside an
  in-page frame** — the C-8.66C/L11 technique, so the app re-reads the seeded save without a platform
  fresh load clearing it. Driven with real clicks and key events: the title's `Continue` → the 3D city
  hub → the map drawer → the **Caravanserai Inn** row → one `KeyD` step east into the inn's disc →
  the prompt **`TAKE A ROOM [E / SPACE]`** → `KeyE`. The notice read *"The innkeeper takes 25 gold and
  shows you to a room. You sleep until dawn and wake on day 4 — no wound is tended here, only a
  night's rest."*, and the persisted profile afterwards was **gold 475** (exactly `25 × level`), **day
  4**, **`city.lodgingDay` 3** (the day consumed), `injury: null`, and **xp 0 / fame 0 / inventory
  length 1 unchanged** — one save, one day, nothing awarded. Cleanup: the frame was removed and the
  seeded save deleted, leaving `localStorage` as it was found.

- **Not automatically verified.** (a) **The refusals.** `insufficient-gold` and `already-lodged` were
  not driven live: the seeded purse covered the fee, and — see the limitation below — the allowance
  cannot be hit by two interactions in normal play. Both are pinned by `lodging.test.ts`. (b) **The
  rendered notice and prompt on the target device**, as with every phase in this file: the sandbox
  renders the city through SwiftShader (~1–2 fps), so the frame is legible but the reading on a phone
  is still owed. (c) Nothing else: L14 adds no geometry, material, light, collider or asset — the
  notice reuses the existing banner — so there is no other appearance to accept.

- **Limitations and observations, stated rather than buried.** (a) **`already-lodged` is unreachable
  through normal play**, and that is by design rather than a defect: a successful stay advances the
  day, so `lodgingDay` can never equal the current day afterwards, and every subsequent interaction is
  a legal *new* night (one day each). The refusal exists to make the transaction total and idempotent
  against a hand-edited or future-state save, and the suite reaches it that way. (b) **Lodging is not
  healing** — the medical house remains the only cure, so an injured gladiator can now lose days
  without mending; that is the intended split between the two buildings. (c) The stay spends a **day
  and gold only**: no fame, xp, reward, item or statistic, and no duel is settled. (d) `advanceCityDay`
  now has exactly **three** production call sites (the duel settlement, `utils/restRecovery.ts`,
  `utils/lodging.ts`) and `advanceCityDay` is still not called from any component — the scene only
  asks the transaction and renders its result.

## Living City L15 — the visitor's bargain price (implemented; the purchase verified live)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD
  **`cde7db5d6c9b3bf1412b195b5279d6e413107eea`** ("Implement visitor bargain pricing and discounts"),
  `git status --short` **empty** before the first edit — so L15 landed as that commit
  (`src/data/visitors.ts`, `src/utils/visitorPurchase.ts`, `src/components/hub/VisitorPanel.tsx`,
  `src/utils/visitorPurchase.test.ts`, `src/utils/profileMutationCommit.test.ts`; 5 files,
  +355/−50) and was written up nowhere until this record. The hand-off premise (an uncommitted tree
  with two failing assertions) was stale; nothing was reset, stashed, discarded or overwritten.

- **What ships: a reason to walk to a visitor instead of the shop.** Each visitor carries one
  **rate**, and the asking price is `ceil(canonical × rate)` — derived from the catalogue's own
  `ITEMS_DB` price, never a second price table. `src/data/visitors.ts` gains
  `Visitor.bargainRate?: number` and three values; nothing else in the catalogue changed (cadences,
  windows and pools are L10's, re-pinned in the suite).

  | visitor | rate | offer measured | canonical | bargain |
  |---|---|---|---|---|
  | `numidian_bladesmith` | **0.70** | `dirk_desert` / `dagger_pugio` | 170 / 90 | **119 / 63** |
  | `campanian_armorer` | **0.75** | `arms_manica` / `legs_greaves_bronze` / `helm_galea_iron` | 70 / 130 / 170 | **53 / 98 / 128** |
  | `emesan_weapon_trader` | **0.80** | `bronze_mace` / `shamshir_curved` / `spatha_legion` | 230 / 340 / 180 | **184 / 272 / 144** |

- **The one resolver, and the fallback that can only cost the player more.**
  `resolveVisitorBargainPrice(item, rate)` in `src/utils/visitorPurchase.ts` returns
  `Math.ceil(canonical × rate)`; `ceil` because a bargain must never round to a coin the offer did not
  promise (`ceil(170 × 0.75)` = 128, `ceil(70 × 0.75)` = 53, `ceil(90 × 0.7)` = 63 — 62.999… before
  rounding). A rate is valid only strictly inside `(0, 1)`: `0` would make the item free, `1` is no
  bargain and above it is a markup, so a **missing, `NaN`, non-finite, non-numeric or out-of-band**
  rate reads as "no bargain" and the **canonical price is charged**. The canonical price itself is
  still validated by the L12 safeguard (`resolveVisitorItemPrice` — `NaN`/`Infinity`/negatives/non-
  numbers are refused, a finite zero stays a legitimate free gift), so malformed catalogue data can
  never produce a free item, a `NaN` balance or a price the panel cannot explain.

- **The UI/transaction price contract: one function, two callers, no third opinion.**
  `VisitorPanel` renders `resolveVisitorBargainPrice(selected.item, selected.visitor.bargainRate)`
  and `purchaseVisitorOffer` charges `resolveVisitorBargainPrice(item, visitor.bargainRate)` — the
  same call on the same catalogue entry, so the price shown and the price charged cannot disagree.
  The panel shows **both** figures (`Asks 119 gold — the shops charge 170`), states the saving only
  when there is one (`price < canonical`), and the buy control reads **`Buy for 119 gold`** /
  `Not enough gold` from that same bargain price, so the affordability check, the button and the
  charge are one number. The panel still sends **only the visitor id** — a UI cannot name a price the
  trade honours. The transaction's own order (profile → catalogue → `already-completed` → schedule →
  offer → item → price → purse → inventory → affordability) is L12's, unchanged.

- **The economic floor — eight offers, measured against canonical AND sell prices.** §J of
  `visitorPurchase.test.ts` walks every shipped offer and asserts it is **strictly below its canonical
  price** and **strictly above its own `sellPrice`**, then pins the whole measured table (the eight
  rows above) so a data change cannot quietly narrow a margin. That is the property that makes the
  bargain a bargain rather than a laundering loop: buying from the visitor and selling back at the
  market's own refund is always a loss (e.g. `dirk_desert` 119 → sell 75), and the visitor stays
  cheaper than the permanent spine it undercuts.

- **Why four `profileMutationCommit.test.ts` assertions needed rebasing, and what each protects.**
  That suite executes App's **real handler source** against the **real** transactions, so a price
  change moves its gold arithmetic. The four affected assertions were each about the visitor
  purchase's **charged amount**, and each was rebased onto the **shared resolver** rather than a
  literal:
  1. §B "the sale survives the next purchase" — `expect(price).toBe(BLADESMITH_BARGAIN)` with the
     canonical base still pinned beside it (`expect(getItemById(...).price).toBe(170)`), so the test
     proves the discount is applied **to** the catalogue price, not instead of it;
  2. §B "the sale's gold is intact" — `saved.gold === 5000 + saleValue − BLADESMITH_BARGAIN`;
  3. §D "a duplicated purchase charges once" — the purse after one charge is `5000 − BLADESMITH_BARGAIN`
     (it had still pinned 170, and was one of the two failures this turn resolved);
  4. §F "the CONTROL: the sale is lost" — that control replays the same source with the
     `profileRef.current = …` writes stripped and asserts the purchase rebuilt from the **pre-sale**
     snapshot (`5000 − price`, the sold item back). Its subject is the lost sale, not the price, so it
     now subtracts the same bargain figure (it was the second failure).
  `BLADESMITH_BARGAIN` is derived once at the top of the file from `getItemById` +
  `getVisitor(...).bargainRate` through `resolveVisitorBargainPrice`, so the suite cannot drift from
  the production rule and **no price table is duplicated**. Nothing was deleted, no assertion was
  weakened, and the file's one-save-on-success and ref-write guarantees (§B, §D, §E, §F) are exactly as
  they were — §F still splices out the ref write and still loses the sale.

- **Checks actually run (2026-10-21, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/profileMutationCommit.test.ts src/utils/visitorPurchase.test.ts src/utils/visitorSchedule.test.ts src/utils/visitorEncounter.test.ts` | **149 pass / 0 fail** (2,935 `expect()`; the starting point was 147 / 2 — the §D and §F pins) |
  | `bun test` (full) | **3075 pass / 0 fail (104 files, 88,814 `expect()`)** |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `bun run build` | **exit 0**, startup-asset check passing (8 assets in `public/` and `dist/`) |
  | `git diff --check` | **clean (exit 0)** |

- **Live evidence — the bargain purchase driven through the real interface.** The preview browser is an
  **anonymous visitor (no session replayed)**, so a profile was seeded into its own storage
  (`sand_and_steel_gladiator_save_v2`: city day **5**, gold **2,000**, level 1, `road.oathSworn: true`
  so the Oath beat stays out of the HUD) and the app was loaded **inside an in-page frame** — the
  C-8.66C/L11/L14 technique, so the app re-reads the seeded save without a platform fresh load clearing
  it. Driven with real clicks: the title's **`Continue`** → the 3D city hub → the header chip reading
  **`VISITORS 1`** → the panel on **`CITY DAY 5`** → the **Hanno of Cirta** row → the detail pane
  reading **`Asks 119 gold — the shops charge 170`** with the control **`BUY FOR 119 GOLD`** → the
  control clicked. Result, read back from the persisted profile: **gold 2,000 → 1,881 — exactly 119**,
  `dirk_desert` **granted once** (inventory 2 → 3, dirk count 1), `city.completedVisitors:
  ["numidian_bladesmith"]`, `city.seenVisitors` retained from the row click, `city.day` still **5**, the
  visitor's row **gone** from the panel, the message *"Hanno of Cirta has departed — the trade is
  complete."*, and **three** writes to the save key in the whole run (hub entry, the encounter, the
  purchase) — i.e. **one save for the purchase**. The same script was run before and after the fix
  below, which is what makes the charge attributable to the code rather than to luck.

- **One environment defect found live, and fixed without a code change: the dev server served a STALE
  `visitorPurchase.ts`.** The first live run showed the panel and the button reading **119** while the
  profile was charged **170** — a real disagreement, but not one in the repository: `curl
  http://localhost:3000/src/utils/visitorPurchase.ts` returned a cached transform whose
  `purchaseVisitorOffer` still said `const price = resolveVisitorItemPrice(item);` (the pre-L15 body)
  while the same transform already exported `resolveVisitorBargainPrice` — a half-updated module from
  the previous session's edits, which Vite had never re-transformed. A direct
  `purchaseVisitorOffer(day-5 profile, 'numidian_bladesmith')` in the container charges **119**
  (gold 2,000 → 1,881), which is what the repository's source says. After
  `docker compose restart web`, the served module carries
  `const price = resolveVisitorBargainPrice(item, visitor.bargainRate)` and the live run charges
  **exactly 119**. **No production file was changed for this** — but it is worth knowing that a stale
  transform can make a correct repository look broken in the preview, so re-fetch the module before
  diagnosing a UI/transaction disagreement.

- **Not automatically verified / limitations.** (a) **The panel's rendered frame** was not obtained in
  the passing run — the inline capture came back as a failed upload — so the live evidence above is
  **DOM and persisted-profile** evidence: the price line and button labels were read from the running
  DOM, and the charge/inventory/completion from the saved profile. An earlier run's capture did show the
  panel with the post-trade message; treat the **visual reading on a device as still owed**. (b) **The
  refusals** (`insufficient-gold`, `already-completed`) were not driven live this turn; both are pinned
  by the suites. (c) **The armorer's and the trader's rates** were not driven live — only the
  bladesmith was traded with, on day 5. (d) **No physical Android device was used**, and nothing here
  should be read as device acceptance: the panel's fit and legibility at a phone breakpoint, and the
  chip in the header cluster, remain on the open device checklist with every other phase's items.
  (e) The bargain rate is deliberately a **rate**, not a price: an item whose canonical price changes
  moves its visitor price with it, and a future visitor-exclusive stock would need a rate too rather
  than a table of its own.

## Living City L17 — visitors standing in the city (implemented; bodies, prompt and VISIT label NOT verified live)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`198578a1e7`** ("Implement
  visitor presence and interaction system"), `git status --short` **empty** — the phase had already
  landed as that commit and was written up nowhere until this record. Five files, +875/−27:
  `src/utils/visitorPresence.ts` (**new**, 214 lines), `src/utils/visitorPresence.test.ts` (**new**,
  462 lines), `src/components/3d/city/CityHubScene.tsx` (+191/−7), `src/data/ambientCharacters.ts`
  (+8/−1, an export only), `src/utils/visitorSchedule.test.ts` (one §J guard rebased). Nothing was
  reset, stashed or discarded.

- **What ships: the missing half of a fact L10 already decided.** L10 chose *who* is in town on a day;
  L11/L12 gave them a meeting and a trade in the panel. Until L17 a visitor existed **only** in that
  panel — the city had no body for them. `resolveVisitorPresence(profile)` is now the ONE answer to
  "who is standing here, and where": it calls `resolveVisitorSchedule` and **joins** the arrivals to a
  frozen stall table, carrying `offerItemId` along. Presence is **derived, never stored**, so a visitor
  who leaves town (the day turns) or completes a trade disappears in the same render that changed the
  profile. Three frozen stalls, and no entry for any id the catalogue does not list:

  | visitor | stall (X, Z) | facing | measured clearance |
  |---|---|---|---|
  | `numidian_bladesmith` | **(−6, 18)** | +π/2 | tightest hub rim in the city: 3.985 from the town gate's disc |
  | `campanian_armorer` | **(12.5, −6.5)** | −π/3 | **moved** from the audited (15, −6) — see below |
  | `emesan_weapon_trader` | **(6.5, −3.5)** | −π/4 | clears the Colosseum facade and every hub disc |

- **The one anchor that had to move, and the measured reason.** At (15, −6) the armorer's 2.5 disc
  contained the **Bazaar & General Store's own fast-travel arrival `[17, −5]`** at 2.236 — arriving at
  the bazaar would have raised *"Speak with Gaius the Armorer"* instead of the store's door — and the
  disc reached 0.679 into that hub's interaction disc while the arrival sits exactly 5.000 from its
  centre. At (12.5, −6.5) the arrival is 5.656 away and no hub is touched. §B keeps the old anchor as
  an **executable CONTROL**: replaying (15, −6) through the shipped rule at that arrival answers the
  armorer, while the shipped table answers `null`.

- **Geometry re-measured on the real registry, not assumed.** Baselines pinned first — `CITY_COLLIDERS`
  **142**, `HUB_LOCATIONS` **21**, `FAST_TRAVEL_ARRIVALS` **21** — so a new building or landmark that
  lands on a stall fails here. Per visitor: **1,947 cells** at 0.1 spacing inside the 2.5 disc,
  **0 blocked** by `collidesWith(..., PLAYER_RADIUS, ...)`, anchor standable; **no** visitor disc
  reaches a hub disc or approach ring (`distance − hub.radius ≥ 2.5`, all 63 pairs); **no** arrival
  lands inside a disc (63 pairs); and seven approaches driven through the real `resolveCityMovement`
  at 3.8 u/s for one second from six units out all end inside the disc.

- **The interaction rule, and it fails safe towards what already worked.**
  `resolveVisitorTarget(pos, presence, competingHub)`: only a visitor whose own disc contains the
  player is eligible, the **nearest** wins (ties keep the earlier catalogue entry), and when the player
  is **also** inside a hub's disc the visitor owns the action only if **strictly** nearer than that
  hub's centre. A tie, a nearer hub, or an unusable hub distance (`NaN`) answers `null`, leaving the
  hub's established behaviour as it was before visitors had bodies. The hub handed in is the very one
  `getNearbyHubLocation` answered (C-8.47's nearest-hub rule), so no second hub rule exists. A **stale**
  day-five list re-resolved against a day-eight profile cannot produce a target (§D).

- **Rendering reuses what the city already has — no second character system.** `createAmbientFighter`
  (now exported, behaviour unchanged) + the shipping `GladiatorMesh`, one idle fighter per presence,
  dyed `#2b3a67` tunic with a `#d4a017` crest so a visitor reads differently from the undyed extras.
  Each pitch is marked by **one existing `TimberCrate`** at their right hand — three meshes against a
  `MerchantCart`'s twenty, which matters at three visitors. Bodies and crates come from one memo over
  the presence list, so a departed visitor's body and cue vanish together. Stalls are **not**
  `HUB_LOCATIONS` entries and **not** colliders (no fast-travel entry, district, audio zone or collision
  shape), which is why the registry baselines are unchanged.

- **The prompt, and one control that keeps its identity.** `visitorPrompt(target)` reads *"Speak with
  Hanno of Cirta"*; the desktop banner shows only for the selected target and the hub banner stands
  down while it is up. On touch the existing 2-in-1 action button **relabels itself** — `VISIT` with
  the visitors icon, `ENTER [E]` at a hub, `ATTACK` otherwise — and the press order is Visit →
  Interact → Attack, so a valid visitor target can never fire an attack. Speaking **opens the existing
  L11 panel and nothing else**: `onEncounterVisitor` is not called by walking past or by VISIT, so
  `seenVisitors` is still written only by the panel's own selection and the L12 purchase still
  re-validates against the newest profile. Proximity state is written **only when the target id
  changes** (`lastVisitorIdRef`), so the 60 fps loop allocates nothing per frame.

- **Checks actually run (final tree, `web` dev container).**

  | command | result |
  |---|---|
  | `bun test src/utils/visitorPresence.test.ts src/utils/visitorSchedule.test.ts` | **77 pass / 0 fail** (3,083 `expect()`; 31 are the new suite) |
  | `bun test` (full) | **3106 pass / 0 fail (105 files, 89,507 `expect()`)** — L15's 3075 plus the 31 new |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `bun run build` | **exit 0** |

- **Not automatically verified live — the honest status of the phase.** The preview browser is an
  **anonymous visitor**. Two attempts at the established in-page-frame technique (seed a day-five
  profile into `sand_and_steel_gladiator_save_v2`, load the app inside a frame so the save survives,
  click through, walk the gate spawn to the bladesmith at (−6, 18)) both **timed out at the 30 s
  budget**, and the follow-up read showed only the landing screen (**Settings / Play / Account**,
  **0 canvases**) — the city's WebGL scene never reached a drivable state, the same SwiftShader limit
  (~2 fps) that left the Medical House interaction and the C-8.36/C-8.37 northern approach outstanding.
  **So L17's three visible outcomes — the bodies at their pitches, the "Speak with …" banner, and the
  mobile label reading VISIT — have no live evidence.** What is pinned instead is source-and-geometry
  evidence: §E reads the cleaned `CityHubScene.tsx` and asserts the scene derives its bodies from the
  presence resolver, names the prompt through `visitorPrompt`, relabels the action to `VISIT`, and
  records an encounter **only** through the panel's selection. With a real GPU or a device, walk to one
  stall and confirm: body + crate appear, the banner names the visitor, the touch button reads
  **VISIT**, the panel opens on that same visitor — then that the body disappears after a trade.

- **Known limits.** (a) **Maximum concurrent visitors is three** — measured over a year: 225 days with
  none, 119 with one, 18 with two, **exactly 3 days with three (51, 99, 145)**; a fourth catalogue
  visitor needs a fourth stall *and* re-measuring §B. (b) Stalls are not colliders, so the player can
  walk **through** a visitor — deliberate (people, not doorways). (c) The stall table is level design
  **keyed by catalogue id**: a renamed visitor id silently loses their body, and a hub anchor moved
  into a stall fails §B — the guard is the suite, not a runtime warning. (d) No physical Android device
  was used; the relabelled button's touch ergonomics join the open device checklist. Do not claim
  device or visual acceptance without that evidence.

## Arena progression reachability — earlier-division rematches (L19 — implemented; the rendered section NOT verified live)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`b31c7c84e3`**,
  `git status --porcelain` **empty** and no diff before the first edit; nothing was reset, stashed or
  discarded. The L18 audit's finding was re-derived from the shipped roster and the shipped
  settlement, not taken on faith: a natural run (each division in `fightIndex` order, rematching the
  best-paying fighter already beaten **in the current division** whenever a boss's level gate is shut)
  reaches **tier 4 at LVL 9 with `xp` 1845 / `xpToNextLevel` 2570**, Aurelius asks for LVL 10, and the
  pre-L19 tab listed the current division only — so the list had **zero** legal bouts and the final
  boss was unreachable. The economy, XP curve, rewards and tier rule were all correct; the fights that
  could pay the missing experience were simply not listed.

- **What ships: one pure list helper, one tab section, one notice rewording.** No rule moved.
  `src/utils/tierAdvancement.ts` gains `listTournamentBouts(currentTier, defeatedOpponentIds)` →
  `{ currentTier: TournamentBout[]; rematches: TournamentBout[] }`, where `TournamentBout` is
  `{ opponent, rematch }` carrying the roster entry itself. `currentTier` is the division in its
  existing `fightIndex` order (the same `tierFighters` read), and `rematches` is every **earlier**
  division's fighter whose id is in `defeatedOpponentIds`, in division-then-`fightIndex` order with
  `rematch: true`. It reuses `readTier` / `readDefeatedIds`, so a broken tier reads as division 1 and
  junk entries are dropped exactly as the tier rule drops them. **`resolveVictoryTier`,
  `resolveBoutLevelGate`, `resolveDoorDuelTarget`, the roster, `rewardXp`/`rewardGold`/`rewardFame`,
  `recommendedLevel`, the XP curve and the settlement are byte-identical** — the helper lists, it does
  not gate, and `resolveBoutLevelGate` stays the one eligibility rule (the card still calls it).

- **The tab.** `TournamentTab` now renders through the helper and keeps its current-division layout
  unchanged; the card was extracted into a local `OpponentCard` so both sections render the **same**
  card and both call the same `onSelectOpponent(opp)` — i.e. a rematch takes the normal duel-entry and
  settlement path, with no second entry route. The new **Earlier Divisions** section renders only when
  `rematches` is non-empty, uses the existing card at the same grid, and marks each entry
  `Division {n} Rematch` in the badge slot (the button still reads "Fight Again (Rematch)" for any
  defeated fighter). Its heading carries one line of copy ("Fighters you have already bested still
  answer the sand…"). Both the current and the rematch cards keep `resolveBoutLevelGate(`.

- **The Colosseum notice.** The door's locked-boss line no longer says "Train, and return" — which
  named no way to earn the levels and was the misleading half of the dead end. It now reads "…
  Earn the experience in the Colosseum's tournament list — rematches, earlier divisions included,
  stay open." The door's eligibility logic, its `resolveDoorDuelTarget` ticket and its
  `resolveBoutLevelGate` check are untouched; only the sentence moved.

- **Regression suite: `src/utils/arenaReachability.test.ts` — 25 tests / 132 `expect()`** in six
  sections. §A the current division's order (every tier, `rematch: false`, roster objects by identity,
  roster/tier table untouched); §B exposure (the tier-4 book lists the seven beaten fighters in
  division order, an **undefeated** earlier-division opponent is never exposed, a defeated
  current-division fighter stays in the current list, the division being fought is never in the
  rematches, a fresh profile gets none); §C malformed input (unknown/misspelled ids, duplicates,
  junk entries, `null`/`undefined`, a `NaN`/`0`/negative/missing tier, a fractional tier); §D the
  natural path and the **control** — the run reaches tier 4 at LVL 9 with the seven-id book, Aurelius
  is `{ locked: true, requiredLevel: 10 }`, the pre-fix current-tier-only list yields **zero** legal
  bouts (so this suite fails against the old behaviour) while the shipped list yields a legal bout;
  §E two Valéria rematches take the player to LVL 10 (xp 1845 → 2295 → 2745, the threshold 2570 crossed,
  the next threshold 3855 = `round(2570 × 1.5)`) and Aurelius reads `{ locked: false }`, with the
  rematch paying its own gold/fame and **not** moving the tier or the book; §F the shipped wiring
  (the tab lists through the helper with no `ALL_OPPONENTS.filter` of its own, the section and its
  single `onSelectOpponent(opp)` call site, the door's gate/ticket/settlement untouched, and the old
  "Train, and return" string gone from the **code** — the phase's own comment quotes it).

- **Settlement arithmetic was DIRECTLY EXERCISED, not simulated.** There is no DOM renderer here, so
  `<App/>` cannot be mounted; instead the suite extracts App's own `evaluateRituals` and
  `handleMatchComplete` source (brace-matched, comments stripped), transpiles it with Bun's transpiler
  and runs it against the **real** `advanceCityDay`, `settleInjury`, `resolveVictoryTier`,
  `evaluateRoadMilestones` and `createDuelSettlementLatch` — the `duelSettlementCommit.test.ts`
  technique — modelling only React (`profileRef`/`profile`/`setProfile`/`saveProfile`). So every XP,
  level, threshold, tier and book value in §D/§E is produced by the shipping settlement. What that
  leaves unexercised is the UI and the duel itself (see below).

- **Checks actually run (2026-10-22, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/arenaReachability.test.ts src/utils/tierAdvancement.test.ts` | **48 pass / 0 fail** (210 `expect()`; 25 are this suite's) |
  | related duel/wiring suites (`combatResponsiveness`, `duelSettlement`, `duelSettlementCommit`, `duelRewards`, `duelResultLifecycle`, `storefrontWiring`) | **133 pass / 0 fail** (769 `expect()`) |
  | `bun test` (full) | **3131 pass / 0 fail (106 files, 89,621 `expect()`)** — the 3106 / 105 L17 baseline plus this suite's 25 tests and its file; no existing assertion was edited, loosened or deleted |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `bun run build` | **exit 0**, startup-asset check passing (8 assets in `public/` and `dist/`; `dist/` is gitignored) |
  | `git diff --check` | **clean (exit 0)** |

- **Live evidence, and what is NOT verified.** The preview browser loads as an **anonymous visitor**:
  the app boots to its title screen (`PLAY`, `ACCOUNT`, Alpha 1.0) with **0 console errors**, and the
  dev server serves both changed modules transformed (200; the tab carries `listTournamentBouts(`,
  `Earlier Divisions` and `resolveBoutLevelGate(`, the city scene no longer contains the old
  sentence). **The rendered Earlier Divisions section was NOT seen**: it only exists for a profile
  that has beaten earlier-division fighters, and reaching one means title → creation → the Oath beat →
  the 3D city (SwiftShader ~1–2 fps) → the Colosseum tab, or seeding a save that the platform's fresh
  loads clear (the C-8.66C/L11/L14/L15 finding). **Device check owed:** on a save at tier 4 with the
  earlier divisions beaten, open the Colosseum tab and confirm the current division is unchanged, that
  Earlier Divisions lists the beaten fighters each badged `Division n Rematch`, that Aurelius still
  reads `Locked (Requires LVL 10)` at LVL 9, and that selecting a rematch → briefing → "Step into
  Sand" settles one bout that pays its gold/fame/XP without moving the tier — twice, until Aurelius
  unlocks. Also confirm the door's locked notice now reads the new sentence.

- **Scope kept.** No change to Aurelius's level, XP rewards, the XP threshold formula, tier
  advancement, reward settlement, boss first-defeat behaviour, the visitor system, the save schema,
  combat presentation or 3D geometry. No opponent, division, currency or grind mechanic was added, and
  nothing was committed, pushed or deployed by the phase.

## Tournament gate regression guard and early-game door guidance (L20a — implemented)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`6c499aebf7`**,
  `git status --porcelain` **empty** and `git diff` empty before the first edit; nothing was reset,
  stashed, discarded or overwritten. The L20 audit's finding held: the tab's §F checks were
  **source strings** (`toContain('resolveBoutLevelGate(')`), so a card whose gate result was no longer
  bound to its button would have passed them. This phase closes that gap with a suite and adjusts one
  sentence of door copy; **no gate, list, roster, reward, settlement or geometry rule moved**.

- **What the guard actually EXERCISES, and what it only inspects.** `src/utils/arenaReachability.test.ts`
  gains **§G (6 tests)**. It extracts `OpponentCard`'s own declaration out of `TournamentTab.tsx`
  (brace-matched), transpiles it with Bun's own TSX transpiler in **classic `React.createElement`**
  form (`tsconfig: { jsx: 'react' }`) and **renders it against the shipped `resolveBoutLevelGate`**,
  with a small React stub recording the element tree — so the assertions read the **button the card
  produces**: its `disabled` prop and its visible label. Genuinely executed: the gate result for a
  real profile, the `disabled` value it yields at that profile's level, and the label branch taken
  (locked / eligible / defeated). Structurally inspected only: that `isLocked` is the `.locked` of
  `resolveBoutLevelGate(profile.level, opp, profile.defeatedOpponentIds)` (one whitespace-insensitive
  expression) and that the button's `disabled` attribute is bound to exactly `isLocked` — read from
  the declaration's own start tag, brace-aware because `onClick={() => …}` contains `>`. **L20b added
  one more structural pin to that same test** (so the six-test count is unchanged): the card's
  `resolveBoutLevelGate` must be a **single named import** of the tab's, and its specifier must
  resolve — relative to `TournamentTab.tsx`, extension-insensitive — to the same module this suite
  imports (`utils/tierAdvancement`), with no local re-declaration and no alias of the name. That closes the
  harness's one blind spot: it *injects* the canonical resolver, so a same-named local or duplicate
  resolver would never be executed and the guard would pass on wiring the game does not ship.

- **The six cases.** (1) gate→`isLocked`→`disabled` wiring, and no second level rule in the card;
  (2) at the natural path's tier-4/LVL-9 profile, Aurelius is `{ locked, requiredLevel: 10 }`, the
  button is **`disabled: true`** and reads **`Locked (Requires LVL 10)`**; (3) the **same fighter at
  LVL 10** is `disabled: false` and reads `Enter Arena Duel` — the gate decides, not the copy;
  (4) a fresh profile's Marcus is enabled (`Enter Arena Duel`) while Flaccus, one level short, is
  disabled and reads `Locked (Requires LVL 2)` from the same card; (5) every earlier-division rematch
  `listTournamentBouts` offers is **in `defeatedOpponentIds`**, resolves unlocked and renders enabled
  as `Fight Again (Rematch)` — an unbeaten earlier-division fighter is still never listed (L19 §B);
  (6) the controls below.

- **The guard is shown to be sensitive, twice over.** In-suite, the extracted source is mutated three
  ways: `disabled={isLocked}` removed (the prop is `undefined`), replaced with `disabled={false}`, and
  the locked label branch turned into `: false ? (` (a disabled button that says "Enter Arena Duel").
  Each mutant fails the same assertion the shipped card passes. Then the **production file itself**
  was mutated and restored (`cmp` byte-identical afterwards): removing the `disabled={isLocked}` line
  fails **6 of 31** tests in the suite, and disconnecting the locked label branch fails **2 of 31**
  (**L20b re-measured this one**: the same `: false ? (` mutation, replayed in memory, fails the two
  locked-label reads — Aurelius at LVL 9 and one-level-short Flaccus — while §6's own post-mutation
  label expectation still holds, so 2 is the reproducible count; the 6 was reproduced exactly) —
  both detected by §G, not merely by a substring.

- **One harness correction, no expectation weakened.** The label reader joined an element's children
  with a space, so `Locked (Requires LVL 10)` read back as `… LVL 10 )`; JSX concatenates children, so
  it now joins with nothing. The failing expectations were the shipped text, unchanged.

- **The door copy now covers both cases, and nothing else changed.** `CityHubScene`'s locked-door
  notice (L19's sentence named only rematches, which a player early in the ladder does not have yet)
  now reads: "The gatekeeper bars the way: *name* requires LVL *n*, and you are LVL *m*. Earn the
  experience in the Colosseum's tournament list — **an open rank match, or a rematch of an earlier
  division you have already beaten**." It is **one sentence, no branch and no new data**: `listTournamentBouts`
  ordering, `resolveBoutLevelGate`, `resolveVictoryTier`, `resolveDoorDuelTarget`, the roster, XP
  rewards, thresholds, settlement, the latch, the visitor system, the save schema and every 3D
  geometry value are byte-identical. `arenaReachability` §F's guidance pin was **rebased, not
  weakened**: it still requires the old "Train, and return" string to be absent from the code and the
  list to be named, and now requires both routes (`an open rank match`, `rematch of an earlier
  division`) — **4** assertions where there were 3 (L20b corrected an earlier miscount; the four are
  the absence check, the list-naming check and the two route strings).

- **Checks actually run (2026-10-22, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/arenaReachability.test.ts src/utils/tierAdvancement.test.ts` | **54 pass / 0 fail** (264 `expect()`; 6 are §G — **L20b raised this to 268 `expect()`**, the four additions being the import pin (module, count, shadow and alias), with the test count unchanged) |
  | related wiring suites (`combatResponsiveness`, `duelSettlement`, `duelSettlementCommit`, `duelRewards`, `duelResultLifecycle`, `storefrontWiring`) | **133 pass / 0 fail** (769 `expect()`) |
  | `bun test` (full) | **3137 pass / 0 fail (106 files, 89,675 `expect()`)** — the L19 baseline of 3131 / 106 plus this phase's 6 tests. **L20b correction:** exactly one pre-existing assertion was *replaced*, not left untouched — §F's guidance pin `toContain('earlier divisions')` was split into two narrower strings, so both routes must now be named. That is stricter, not looser (any mention of the phrase used to satisfy it), the old "Train, and return" absence check and the list-naming check are kept, and the suite's test count is unchanged because the pin's title was reworded rather than a test added; every other pre-existing assertion is untouched |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `bun run build` | **exit 0**, startup-asset check passing (8 assets in `public/` and `dist/`; `dist/` is gitignored) |
  | `git diff --check` | **clean (exit 0)** |

  Files changed: `src/utils/arenaReachability.test.ts`, `src/components/3d/city/CityHubScene.tsx`
  (the sentence plus its comment) and this record — 2 production/test files, +264/−5.

- **Not automatically verified — the rendered notice.** The dev server serves the changed module
  transformed (the new sentence is present at `/src/components/3d/city/CityHubScene.tsx`); no preview
  capture was taken, because the notice renders only after interacting with a **level-locked**
  Colosseum door, and reaching one costs the full creation → Oath → 3D city → fast travel route on a
  SwiftShader renderer (~1–2 fps) — the limit L1–L19 recorded. The button's rendered `disabled` state
  is likewise **not** claimed from a live DOM here: §G proves the card's element, not its pixels.
  **Device check still owed:** on a save one level short of the next boss, confirm the tournament
  card's button is visibly disabled and reads `Locked (Requires LVL n)`, and that the Colosseum door's
  notice now names both an open rank match and an earlier division's rematch.

## Combat action validation and wind-up audit (C-8.71A — one ordering fix; the delay DEFERRED)

- **Preflight (measured).** Branch `development-focus-strategy`, HEAD **`8856ff6c3a`**,
  `git status --porcelain` **empty** and `git diff` empty before the first edit — the baseline the
  brief named. Nothing was reset, stashed, discarded, committed or pushed. The combat path was read
  in source before anything was changed: `src/components/duel/DuelScene.tsx` (`executeCombatTurn`,
  `announceEnemyAttack`, `reactToPendingAttack`, the AI effect, the victory/defeat effect),
  `src/utils/combatCalculations.ts` (`isAttackInRange`, `getStaminaCost`, `ENEMY_ATTACK_WINDUP_MS`),
  `src/utils/pendingStrike.ts`, `src/components/ui/TurnActionPanel.tsx`,
  `src/components/ui/CombatHUD.tsx`, and the focused suites `combatResponsiveness.test.ts`,
  `pendingStrike.test.ts`, `duelResultLifecycle.test.ts`.

- **The report's headline symptom does NOT reproduce at this HEAD, and that is stated rather than
  "fixed".** "An out-of-range attack consumes stamina and the player's turn" cannot happen on this
  tree, for two independent reasons, both read from the shipped code and pinned in the new suite:
  1. **The engine refuses before anything is spent.** The authoritative guard
     (`if (!isAttackInRange(gap, attackerNow.loadout.weapon))`) sits ABOVE
     `resolvingRef.current = true`, `setIsExecuting(true)`, the animation write, the stamina
     deduction, the hit roll, the damage roll and the 1100 ms turn timer — its refusal body holds
     nothing but a chronicle line and a `return`. A refused strike therefore costs no stamina and
     never schedules the turn toggle.
  2. **No control can issue one.** `TurnActionPanel` disables BOTH strike buttons through the same
     shared helper (`isAttackInRange(distance, player.loadout.weapon)`) and covers them with an
     "Out of range — Advance to strike" overlay; `distance` is the very expression the engine's
     `gap` re-computes (`Math.abs(player.position[2] - opp.position[2])`). There is no keyboard
     path, no second duel component (`grep` finds exactly one `executeCombatTurn`) and no direct
     caller outside the HUD.
  So the guard's value is defence-in-depth (a stale render, a direct call), not a live bug fix —
  and the phase's own tests assert the properties the brief asked for *and* record that they already
  held, rather than claiming a defect that was not there.

- **The two real action-order defects the audit found, and fixed.** Both are in the same guard, and
  both are order-of-operations faults rather than rule faults:
  1. **A refused strike left the telegraphed-heavy marker set (reachable).** `telegraphLandingRef`
     is set by the boss's heavy-telegraph branch and is documented as "read-and-cleared at the top
     of `executeCombatTurn`, before any branch can return". It was not: the read-and-clear sat
     *below* the range guard, so a telegraph the player had walked out of (`resolveDoorDuelTarget`
     aside, this is exactly the Goliath case: telegraph → player retreats → the pending heavy is
     resolved out of range and refused) returned first and kept the marker. The next ordinary
     landing then took the **200 ms telegraphed-heavy hit-stop** it never earned. The clear now
     precedes the guard.
  2. **A refused announced strike could latch the scene (structural).** `announceEnemyAttack` sets
     `isExecuting` for the whole cue, and the announcement's impact is the only path that would
     clear it — via the 1100 ms timer inside a completed resolution. A refusal returns before that
     timer is scheduled, so the HUD would stay locked with `isPlayerTurn` still false and no way to
     act. It is not reachable today (the AI only announces in range and the player cannot move
     during the cue), so this is a guarantee rather than an observed bug: the refusal now releases
     the announcement's lock and hands the turn back, scoped to `!isActorPlayer && isExecuting` so a
     player action is never affected.

- **Feedback.** The refusal line read "… is out of reach — Advance before striking."; it now reads
  "… is out of range — Advance before striking.", matching the panel's own "OUT OF RANGE" badge and
  its "Out of range — Advance to strike" overlay. Copy only: no rule, threshold or outcome moved.

- **What did NOT change.** No damage formula, weapon stat, stamina cost, hit chance, crit rate,
  defence curve, opponent balance, reward/xp/fame/gold, tier advancement, settlement, block/dodge/
  shield rule, AI strategy, arena visual, lighting, particle, performance setting, save field,
  authentication or city content. `combatCalculations.ts` is **byte-identical**; the suite re-pins
  its five audited constants (dodge 12, wind-up 700, defence factor 2.5, crit 1.5, strength 0.05) as
  a scope guard. `pendingStrike.ts`, `CombatHUD.tsx`, `TurnActionPanel.tsx` and `App.tsx` were read
  and are untouched.

- **Files changed: two.** `src/components/duel/DuelScene.tsx` (the marker read-and-clear moved above
  the guard; the refusal's lock release; the copy; comments) and
  `src/utils/combatActionOrder.test.ts` (**new**, 17 tests / 113 `expect()`), plus this record.

- **The trace the phase established (all synchronous unless marked).**
  1. *Action selection* — the panel calls `onExecuteAction` → `executeCombatTurn('player', action)`.
  2. *Refusal check* — `resolvingRef` / `isMatchOver` latches (synchronous).
  3. *Range validation* — `isAttackInRange(gap, attacker.loadout.weapon)` (synchronous, shared).
  4. *Stamina + animation + hit/miss + damage* — one synchronous commit inside the attack branch.
  5. *Turn commitment* — `resolvingRef.current = true` immediately; the panel locks via
     `setIsExecuting(true)`.
  6. *Wind-up* — **player: none**; **opponent: 700 ms** (`ENEMY_ATTACK_WINDUP_MS`) on the scheduled
     announcement path.
  7. *Resolution window* — a single `setTimeout(…, 1100)` resets the animation, releases
     `resolvingRef`, and toggles `setIsPlayerTurn`.
  8. *AI response* — a `setTimeout(…, 750)` effect fires once the turn belongs to the opponent, picks
     an action, and either announces a strike (returning to step 6 for 700 ms) or resolves at once.
  Races checked: a doubled click is refused by `resolvingRef` (set in the same tick); a repeated
  announcement is refused by `strikeRef.announce`; a strike resolved after a cancel is inert; the
  1400 ms result settlement is latched by `isMatchOver` and by App's per-bout `duelSettlement` id.

- **Wind-up audit — evidence, and why the delay is DEFERRED (no timing changed).**
  - **The opponent's damage is NOT in the commit that starts its swing.** `announceEnemyAttack`
    starts the clip (`setOpp(action: 'attack_light' | 'attack_heavy')`), logs the cue and schedules
    the impact; the damage lands 700 ms later through `executeTurnRef.current('opponent', landing)`
    and the SAME `executeCombatTurn`. That decoupling already shipped (§R1) and is re-pinned here.
  - **The player's damage IS in the commit that starts its swing.** The attack branch writes
    `action: 'attack_light' | 'attack_heavy'` and rolls/applies damage in one synchronous block,
    with no timer between them. That is the readability asymmetry a delayed hit would address — and
    it is the *player's* side, not the opponent's.
  - **A 600–800 ms delayed player hit is not safe in this lifecycle without a separate phase:**
    `resolvingRef` is taken at commit and released only inside the 1100 ms timer, so a wind-up would
    either hold the latch across the delay (locking the panel for ~1.8 s) or need a second latch;
    `pendingStrike` is enemy-shaped (`claimReaction` exists so the *player* answers an announcement —
    reusing it would let the opponent "react" to the player's swing, a rules change); the
    cancellation set grows by "the target died during the wind-up", which also moves the 1400 ms
    victory settlement; and stamina is spent at commit today, so a cancelled delayed strike must
    either refund (a balance change) or remain a paid miss (a design decision).
  - **What is safe, measured:** positions only change on `advance`/`retreat`, which are themselves
    turns and are locked while a resolution or an announcement is in flight, so a 600–800 ms window
    cannot let the target move; duplicate input is already excluded by `resolvingRef` + the panel's
    `isExecuting` lock; death/cancel is already covered by `strikeRef.cancel()` on victory, defeat
    and unmount, plus App's Armory exit (which unmounts the scene).
  - **The tests a delayed hit would need before it ships** (stated, not written, because the
    behaviour does not exist): one impact per click; stamina charged exactly once, at commit;
    damage applied exactly once, at the delayed impact; a cancelled strike (victory, defeat,
    unmount, Armory exit) applies none; the turn toggles only after the delayed resolution; a stale
    impact from the previous bout cannot settle the next one (the `duelSettlement` id rule); and the
    hit-stop/shake read the state at impact time, not at click time.
  - **Recommendation:** a separate phase ("player strike anticipation"), designed against the
    cancellation and payment rules above. Timing was left exactly as it shipped — no 600–800 ms
    constant was introduced anywhere.

- **Checks actually run (2026-10-22, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/combatActionOrder.test.ts` | **17 pass / 0 fail** (113 `expect()`) |
  | focused combat set (`combatActionOrder`, `combatResponsiveness`, `pendingStrike`, `duelResultLifecycle`, `duelSettlement`, `duelSettlementCommit`, `duelRewards`) | **145 pass / 0 fail** (793 `expect()`, 7 files) |
  | `bun test` (full) | **3154 pass / 0 fail (107 files, 89,792 `expect()`)** — the L20b baseline of 3137 / 106 plus this suite's 17 tests and its file; no existing assertion was edited, loosened or deleted |
  | `bun run scripts/combatTests.ts` | **65 passed, 0 failed** |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `git diff --check` | **clean (exit 0)** |

  The suite's sensitivity was **demonstrated, not assumed**: the same predicates were replayed
  against `git show HEAD:src/components/duel/DuelScene.tsx` in a throwaway script (kept in `/tmp`,
  deleted afterwards) — on the pre-fix source the marker clear sits at character 21874 against a
  guard at 21292 (so "clear precedes guard" is **false**), the lock release is **absent**, the
  `setIsPlayerTurn(` count is **1** (not 2) and the old copy is still present — i.e. three of the
  suite's assertions fail on exactly the code this phase changed.

- **Not automatically verified — and nothing here is device-verifiable.** The refusal path cannot be
  driven from the UI (both strike buttons are disabled out of range, which is itself the evidence
  that the symptom cannot occur), so no browser run can exercise it: the fix is proven by the
  source-order suite plus the pre-fix replay above, and the app boots and the dev server serves the
  changed module (200). **No Android or visual acceptance is claimed**: this phase moves no pixel,
  adds no animation and changes no timing, so the open device items (the wind-up cue's legibility,
  the duel settlement/payout, the injury and rest flows, the C-8.41 kerb and northern approach) are
  exactly as they were. **Still owed by hand, if desired:** confirm in a live bout that stepping out
  of a boss telegraph no longer makes the following ordinary hit feel heavier than a normal landing
  — a hit-stop difference of 140 ms (200 vs 60), which the sandbox's ~1–2 fps cannot adjudicate.

## Safe player attack wind-up (C-8.71B — implemented; the deferred delay, now shipped)

- **Preflight (measured).** Repository root `/app`; branch `development-focus-strategy`, HEAD
  **`74bad41cb3`**; `git status --porcelain` **empty** and `git diff --check` clean before the first
  edit — the baseline C-8.71A's record names. Nothing was reset, stashed, discarded, committed or
  pushed. The C-8.71A record (the section above) was read first, then the shipped combat path:
  `src/components/duel/DuelScene.tsx` (`executeCombatTurn`, `announceEnemyAttack`,
  `reactToPendingAttack`, the AI effect, the victory/defeat effect, the unmount cleanup),
  `src/utils/combatCalculations.ts`, `src/utils/pendingStrike.ts`, and the suites
  `combatActionOrder` / `combatResponsiveness` / `pendingStrike` / `duelResultLifecycle`. The two
  C-8.71A fixes are present exactly as that record describes (the telegraph marker's read-and-clear
  above the range guard; the refusal's lock release), and they are **untouched** here.

- **The lifecycle, traced before any code was written.** `TurnActionPanel` →
  `onExecuteAction` → `executeCombatTurn('player', actionType)` → `resolvingRef`/`isMatchOver`
  latch → `isAttackInRange(gap, weapon)` guard (before anything is spent) → commit
  (`resolvingRef = true`, `setIsExecuting(true)`, stance pre-clear, stamina spend, swing animation)
  → hit roll → damage → **one** `setTimeout(…, 1100)` that resets the animation, releases the latch
  and toggles `setIsPlayerTurn` → the AI effect's 750 ms timer → the opponent's own announce (700 ms)
  or an immediate resolution.

- **The change: the player's blow moves from the commit to the end of a wind-up — and only that.**
  `PLAYER_ATTACK_WINDUP_MS = 700` (`src/utils/combatCalculations.ts`) is ONE explicit duration for
  every weapon and both strike types, matched to `ENEMY_ATTACK_WINDUP_MS` so both fighters anticipate
  at the same speed. At the commit the engine now: spends stamina (the established point, unchanged),
  sets `attack_light`/`attack_heavy` (the swing IS the telegraph — it is driven for the whole
  window), logs `"<name> winds up a quick strike…"`, and hands the resolution to a new one-impact
  controller. The damage block itself was **not rewritten** — it was enclosed unchanged in
  `const resolveImpact = () => { … }` inside the same attack branch, so there is still exactly one
  `calculateHitChance(` and one `calculateAttackDamage(` call site in the engine (pinned).
  **The turn did not get longer:** the impact is scheduled at 700 ms and the existing 1100 ms
  turn-end timer is untouched and still scheduled after it in the same tick, so a player turn is
  still 1100 ms — the strike simply lands 400 ms before the turn passes instead of at its start.
  The opponent cannot answer before the blow: the latch and `isExecuting` are held across the whole
  window, and the AI effect is gated on `isPlayerTurn || isExecuting`.

- **`src/utils/playerStrike.ts` (new) is the bookkeeping, and it is deliberately NOT
  `pendingStrike`.** That controller carries `claimReaction` — the player's answer to an enemy
  announcement — and reusing it would have let the opponent "react" to the player's swing, a rules
  change. Its contract: `strike(action, onImpact)` schedules exactly one impact and **refuses** while
  one is pending; `cancel()` clears the timer and makes any in-flight callback inert; the pending
  action is read **at impact**, never from the closure. Timers are injectable, which is what makes
  the timing testable on a controlled clock. `canResolveStrikeImpact({ isMatchOver, attackerHealth,
  defenderHealth, distance, weapon })` is the impact-point rule (pure, total, NaN-refusing) and the
  engine calls it **before** any roll.

- **Cancellation, target invalidity and defeat — the explicit answers.**
  - *Target moves out of range during the wind-up:* impossible in the shipped lifecycle (positions
    change only on advance/retreat, which are turns, locked by the latch) — but the impact re-reads
    live positions through `canResolveStrikeImpact`, so if that ever changed the swing lands on air,
    logs `"…slips out of reach…"`, deals nothing, and the turn still ends through the 1100 ms timer.
  - *Target dies or becomes invalid before resolution:* the impact resolves nothing (health ≤ 0 or
    non-finite, or the fight already decided) — **no stale damage**. Unreachable today (the player's
    own impact is the only damage source while its turn is resolving); the rule is defence-in-depth,
    the same shape C-8.71A gave the range guard.
  - *Player or opponent defeat during a pending attack:* both end-of-fight effects call
    `playerStrikeRef.current?.cancel()` next to the existing `cancelPendingEnemyAttack()`, so nothing
    resolves into a decided fight (inert today, for the reason above). The 1400 ms settlement is
    untouched, and the `duelSettlement` id rule still latches it.
  - *Duplicate taps / a second action:* three layers — `resolvingRef` (same-tick), the panel's
    `isExecuting` lock, and the controller's own refusal while pending. A second strike cannot queue.
  - *Unmount, duel exit, timer cleanup:* the unmount effect cancels the pending swing as well as the
    enemy's and the turn-end timeout, and the 1100 ms timer cancels any impact that has not fired
    (inert on the normal path) — so nothing lands after the player has left, including via the HUD's
    Armory shortcut (which unmounts the scene).
  - *Superseding actions:* none exist — every other action is locked while the window is open.
  - **Stamina is spent once, at the commit, and is NOT refundable on cancellation.** That is the
    established rule a miss or an evade already follows, it is what the opponent's side already does,
    and refunding would be a balance change this phase is not authorized to make.

- **Files changed: five.** `src/utils/playerStrike.ts` (**new**: the controller + the impact rule),
  `src/utils/combatCalculations.ts` (`PLAYER_ATTACK_WINDUP_MS` and its doc comment; **no existing
  value touched** — the file's five audited constants are re-pinned as a scope guard),
  `src/components/duel/DuelScene.tsx` (the import, `playerStrikeRef` + `fightersRef`, the
  `resolveImpact` enclosure and its impact validation, the player/opponent dispatch, the wind-up log
  line, and the four cancel sites), `src/utils/playerStrikeWindup.test.ts` (**new**, 27 tests) and
  `src/utils/combatActionOrder.test.ts` (**rebased, not weakened**: §F's third pin and its describe
  title — that test asserted the old synchronous player hit, which C-8.71A wrote deliberately so a
  delayed hit would have to move it on purpose; it now pins the deferred impact, the one controller
  and the unchanged 1100 ms turn timer; 113 → 115 `expect()` calls), plus this record.

- **What did NOT change.** No damage formula, hit chance, crit rate, stamina cost, defense curve,
  dodge/block/shield rule, combo/hype rule, AI strategy, opponent balance, reward/xp/fame/gold,
  tier advancement, settlement, save field, collider, city content, visual, lighting, particle or
  performance setting. The 1100 ms resolution window, the 750 ms AI delay, the 700 ms enemy wind-up,
  the 1400 ms result settlement, the range refusal and its copy, the two turn toggles
  (`setIsPlayerTurn(` is still 2), the two stamina spend sites and the telegraphed-heavy hit-stop
  path are exactly as they were.

- **Tests added (`src/utils/playerStrikeWindup.test.ts`, 27 tests / 127 `expect()`), all
  deterministic — `fakeTimer`, no wall-clock sleeps.** §A the window (nothing before
  `PLAYER_ATTACK_WINDUP_MS`, exactly one impact at it, the injected-window path, the action carried
  through, the 600–800 band, and that the window is shorter than the 1100 ms turn); §B at-most-once
  and cancellation (a second strike refused with no leaked timer, cancel wins, a callback fired after
  a cancel is inert, a doubled callback resolves once, the next swing still lands once); §C the
  impact rule table (live fight in reach / at the border; match over; defender at 0, negative or NaN;
  attacker down; out of reach, NaN and Infinity; a per-weapon reach); §D the wiring in the shipped
  source (the commit spends and starts the swing before any roll, the player schedules while only the
  opponent resolves inline, `resolveImpact` exists once and is referenced twice, the validation
  precedes the roll and the first `Math.random(`, the turn is still advanced exactly once by the
  unchanged timer, the AI gate still guards it, four cancel sites, the controller created once,
  `resolveImpact();` exactly once); §E scope (the five audited constants, the C-8.71A guard and its
  refusal text intact, one damage formula, one hit roll, no per-weapon timing, no `windupTimerRef`,
  no `pendingPlayerStrike`).

- **Checks actually run (2026-10-22, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/playerStrikeWindup.test.ts` | **27 pass / 0 fail** (127 `expect()`) |
  | focused combat set (`playerStrikeWindup`, `combatActionOrder`, `combatResponsiveness`, `pendingStrike`, `duelResultLifecycle`, `duelSettlement`, `duelSettlementCommit`, `duelRewards`) | **172 pass / 0 fail** (922 `expect()`, 8 files) |
  | `bun test` (full) | **3181 pass / 0 fail (108 files, 89,921 `expect()`)** — the C-8.71A baseline of 3154 / 107 plus this suite's 27 tests and its file; no existing assertion was deleted or loosened |
  | `bun run scripts/combatTests.ts` | **65 passed, 0 failed** |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `git diff --check` | **clean (exit 0)** |

  The suite's sensitivity was **demonstrated, not assumed**: the same predicates were replayed against
  `git show HEAD:src/components/duel/DuelScene.tsx` in a throwaway script (kept in `/tmp`, deleted
  afterwards) — on the pre-fix source `resolveImpact` is **absent**, the controller dispatch is
  **absent**, the cancel sites are **0** (not 4) and `canResolveStrikeImpact({` is **absent**, while
  the invariants that must not move (2 stamina-spend sites, 2 turn toggles) read identically.

- **Not automatically verified — the feel, and it is a device question.** A live end-to-end drive was
  attempted in the preview browser (the dev duel harness `?devHarness=character` in an in-page
  frame: creation → `Apply Points & Enter Metropolis [Town Gate]` → `Start Test Duel` → four Advance
  turns to close the 7.0 gap → a Quick Strike, sampling the chronicle for the wind-up line and its
  impact) and **timed out at the 30 s cap** while the duel scene mounted — the sandbox has no GPU
  (SwiftShader, ~1–2 fps in the 3D scenes), the limit C-8.71A, C-8.70B and the district phases all
  recorded. A boot check was run instead and passed: the shell renders (title screen, "PLAY"), the
  dev server serves the changed modules (the transformed `DuelScene.tsx` carries the dispatch and the
  impact check; `src/utils/playerStrike.ts` answers), and the page reports **0 console errors and 0
  failed requests**. **So the wind-up's rendered read — that a swing now reads as a swing, that the
  damage number arrives ~0.7 s after the tap, and whether that delay feels right for a heavy strike
  versus a quick one — is NOT automatically verified and needs an on-device look.** Nothing here is
  device acceptance; no Android or visual acceptance is claimed.

## Stale strike callback hardening (C-8.71D — demonstrated defect fixed, suite added)

- **Preflight (measured).** Repository root `/app`; branch `development-focus-strategy`, HEAD
  **`3b5b7686d2`**; `git status --porcelain` **empty** and no stash entries before the first edit —
  the baseline the C-8.71B record's tree left. Nothing was reset, stashed, overwritten, committed,
  pushed or deployed. **No C-8.71C record exists in this file** (that audit was read-only and appended
  nothing), so this section is the C-8.71B-to-C-8.71D record; the C-8.71B section immediately above is
  its baseline, and the two C-8.71A fixes it describes are untouched here.

- **The defect, REPRODUCED on the shipped controller before anything was changed.** `createPlayerStrike`
  kept one shared `action` / `handle` pair, and its callback read the pending action *at impact* rather
  than at commit. A probe in the `web` container (`createPlayerStrike` with a hand-advanced clock)
  drove the audit's own sequence — start A, `cancel()`, start B, then fire A's already-queued callback —
  and printed, verbatim: `before stale fire — pending: power_attack live timers: 1`;
  `after stale fire — pending: null live timers: 1`; `A fired? true`;
  `cancel B returned: false live timers: 1 B handle cleared?: false`;
  `callbacks resolved: ["A:power_attack"]`. So a stale callback **invoked A's closure with B's action**,
  **cleared B's pending state**, **orphaned B's timer** (still live, handle still scheduled) and made
  **`cancel()` unable to reach it** — B could then neither resolve nor be cancelled. All four are the
  hazards the brief names, in one ordering.

- **The fix is an ownership token, and nothing else.** Each accepted strike takes a serial number
  (`owner += 1`, captured as `mine`), and the callback returns **first** on `mine !== owner` — before
  it touches `handle`, `action` or the closure. `cancel()` retires the pending strike's token
  (`owner += 1`) after clearing, so a callback queued by the strike it dropped is a complete no-op:
  no impact, no pending-state write, no handle nulled, timer untouched. The at-impact read of `action`
  is kept as a second, independent guard for repeated delivery of a *valid* callback. The public API is
  byte-identical (`pending`, `strike(action, onImpact) → boolean`, `cancel() → boolean`), `cancel()` is
  still idempotent (a second call returns `false` and clears nothing), the timer injection point and
  `canResolveStrikeImpact` are unchanged, and **the file's only consumer**
  (`src/components/duel/DuelScene.tsx`, the sole importer, grep-verified) needed **no change at all** —
  no integration adjustment was necessary.

- **Regression tests: five, and they reproduce the audit's ORDERING rather than asserting tokens exist.**
  `src/utils/playerStrikeWindup.test.ts` gains **§B2 (5 tests)** on the existing deterministic
  `fakeTimer` harness, which gained one accessor (`lastHandle()`) so a *specific* queued callback can be
  fired out of order: (1) the audit sequence above — after A's stale callback neither closure resolves,
  `pending` is still `POWER`, `clock.live` is still 1, and B then lands exactly once at its deadline;
  (2) B resolves exactly once even when its own callback is delivered twice after the stale one;
  (3) `cancel()` after the stale callback **still returns `true` and clears B's timer** (live → 0, no
  impact); (4) repeated cancellation and repeated delivery stay harmless, and a later swing C still
  lands exactly once (`['B:power_attack', 'C:quick_attack']`); (5) a *spent* callback delivered again
  cannot resolve a later strike — the same ownership hazard in the other ordering, where the old code
  would have fired A's closure with C's action. **The suite was shown to be sensitive to the fix, not
  merely green:** replaying the file against `git show HEAD:src/utils/playerStrike.ts` (temporary
  replacement, restored byte-for-byte and `cmp`-verified) gave **27 pass / 5 fail — exactly the five
  new tests**, on the assertions quoted above.

- **Scope honoured.** `PLAYER_ATTACK_WINDUP_MS` is still **700** and a player turn still **1100**; no
  damage/hit formula, stamina rule, weapon stat, AI, block/dodge, reward or settlement value moved; no
  `DuelScene` edit; no save schema, visual, city content or unrelated file touched. Files changed:
  `src/utils/playerStrike.ts` (the token and its doc comment), `src/utils/playerStrikeWindup.test.ts`
  (§B2, the harness accessor, the header's section list) and this record.

- **Checks actually run (2026-10-22, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/playerStrikeWindup.test.ts` | **32 pass / 0 fail** (155 `expect()`; was 27 / 127) |
  | focused set (`playerStrikeWindup`, `combatActionOrder`, `pendingStrike`, `combatResponsiveness`, `duelResultLifecycle`, `duelSettlement`, `duelSettlementCommit`, `duelRewards`) | **177 pass / 0 fail** (950 `expect()`, 8 files) |
  | `bun run scripts/combatTests.ts` | **65 passed, 0 failed** |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `git diff --check` | **clean (exit 0)** |

  The **full suite was deliberately not run**: the change is inside one pure controller with one
  production importer and one test file, and the eight-suite focused set covers every consumer of it —
  the branch's `bun test` baseline stays the C-8.71B record's 3181 / 108. No temporary probe or mutation
  artifact remains: the reproduction script lived in the container's `/tmp`, the mutation was restored
  and `cmp`-checked, and `git status --porcelain` reads exactly the two modified files above.

- **Not automatically verified — and nothing here is device-verifiable.** The hazard is a
  same-tick callback ordering that no shipped lifecycle produces today (every cancellation site is a
  victory, a defeat, the turn's end or an unmount, none of which can commit a new strike before the old
  callback fires), so it cannot be driven from the UI and no browser run can exercise it. **No Android
  or visual acceptance is claimed**; the wind-up's feel and its rendered read remain the open device
  item the C-8.71B record left.

## Defensive balance correction (C-8.72B — Dodge documented, Shield Guard regen halved, validated)

- **Preflight (measured).** Repository root `/app`; branch `development-focus-strategy`, HEAD
  **`f9f205bbe3`**; `git status --porcelain` **empty** and `git diff --check` clean before the first
  edit. Nothing was reset, stashed, overwritten, committed, pushed or deployed. **No C-8.72A record
  exists in this file** — that audit was read-only and appended nothing, so its findings were
  re-derived here from the shipped code rather than taken on faith: `shieldGuardStaminaGain` and its
  **one** production caller (`DuelScene.tsx`:828, grep-verified), the `shield_block`/`dodge` branches
  of `executeCombatTurn`, the reaction handler `reactToPendingAttack`, `applyStaminaRegen` /
  `applyDefensiveAction` / `clearDefensiveStance`, `TurnActionPanel` and the manual.
- **The brief's path is stale, the change was made at the canonical one.** `src/components/ui/HelpModal.tsx`
  does not exist; the manual lives at **`src/components/hub/HelpModal.tsx`**, the only `HelpModal.tsx`
  in the repo, and its content matches the description, so the entry was added there.
- **Where the guard credit actually happens, and that it cannot exceed the cap.** One place: the
  resolution's `if (isBlocked)` branch, which reads `defender.stats.staminaRegen` and writes the OTHER
  fighter through `applyStaminaRegen(prev.stamina, prev.stats.staminaMax, gain)`. `applyStaminaRegen`
  clamps to `[0, staminaMax]`, so no guard credit can pass the normal ceiling. Recovery happens
  **only** on a stopped blow: the `shield_block` action branch spends and credits nothing, the evade
  branch, the miss branch and an unblocked hit credit nothing, and a reaction guard writes a STANCE
  only (measured by source slice, pinned in the suite). Both defensive paths therefore share the one
  credit — a normal-turn guard and a reaction guard alike.
- **The measured comparison, through the shipped helpers** (`calculateTotalStats`,
  `calculateAttackDamage`, `calculateHitChance`, `shieldGuardStaminaGain`, `applyStaminaRegen`; a
  throwaway harness in the `web` container, kept in `/tmp`). Shield build = gladius 0.82 block,
  `helm_centurion` + full plate, str 18 / agi 16 / sta 14 / def 10 → `defense 42`, `staminaMax 140`,
  **`staminaRegen 31.9`**. Non-shield build = `dagger_pugio` (0.35), str 18 / agi 20 / sta 12 →
  `staminaRegen 37.5`, `staminaMax 130`. Attacker: strength 12, 26 heavy, **58.0 % hit** against the
  shield build's agility.

  | quantity | shield build | non-shield build |
  |---|---|---|
  | damage taken, blocked | **4** | **14** |
  | damage taken, unblocked | 20 | 21 |
  | guard credit, existing rule | **31.9 SP** | **37.5 SP** |
  | guard credit, candidate 50 % | **15.95 SP** | **18.75 SP** |

  Stamina scenarios under both rules (shield build, regen 31.9): full stamina 140 → **140 / 140** (no
  room, neither rule can exceed the cap); mid stamina 50 → **81.9 / 65.95**; **low stamina 0 →
  31.9 / 15.95**; near-defeat (health 6, stamina 40) → **71.9 / 55.95**; **an unblocked attack → no
  gain under either rule (0)**. **Damage is identical under both rules in every scenario** — the
  change touches recovery only. Expected value per defensive turn at that hit chance: guard **2.32
  damage and +18.50 SP**, candidate **2.32 and +9.25**; dodge **2.90 and −12 SP**; undefended 11.60.
- **The decision: the 50 % reduction is supported and was shipped.** Before, a shield build's blocked
  exchange paid **31.9 SP** against Dodge's **12 SP** cost *and* absorbed 82 % of the blow — the guard
  dominated on both axes for the archetype it belongs to. Halving the credit leaves the mitigation,
  the block reduction, Dodge's cost, the 75 % evade, every AI probability, the damage formula and the
  turn timing **byte-identical**, narrows the resource swing to ≈ 16 SP, and cannot introduce an
  exploit: a smaller credit cannot do anything the larger one did not, it is still only paid on a
  stopped blow, still exactly once per resolution, and still clamped to `staminaMax`. No severe
  defensive disadvantage follows, because a guard costs **0 SP** and its absorption is untouched. The
  non-shield build's guard (14 damage through 35 % block) stays clearly worse than its dodge, which is
  the archetype split that was always intended. **No stamina refund was added to Dodge.**
- **The rule lives in one place and only one place.** `SHIELD_GUARD_REGEN_MULTIPLIER = 0.5`
  (`src/utils/combatCalculations.ts`, beside `DODGE_STAMINA_COST`) and `shieldGuardStaminaGain` returns
  `regen * SHIELD_GUARD_REGEN_MULTIPLIER`. **No call site changed** — `DuelScene` neither names the
  constant nor restates the halving (pinned). The helper has **one** production caller, so the change
  has no unintended consumer; it is also read by `scripts/combatTests.ts` and two suites, all rebased.
- **Dodge documented in the manual** (`HelpModal`, a new §4 between Shield Guard and Arena Taunt; the
  remaining section comments were renumbered, no other entry's copy or markup changed): cost **12 SP**,
  **75 %** evade chance, the 12 SP is spent **whether the dodge succeeds or fails**, **a failed dodge
  still takes the damage**, and the timing split verified from production code — a normal-turn Dodge
  is the turn's action and its stance **persists into the opponent's next strike** (`isInvulnerable` is
  deliberately not cleared at turn end), while an **announced** strike offers a **reaction** dodge for
  the same 12 SP, **one per announcement** (`claimReaction`), refused below 12 SP before the claim. The
  cost and the evade chance were **not** changed.
- **Files changed — five plus this record.** `src/utils/combatCalculations.ts` (the constant, the
  helper's arithmetic and its doc comment); `src/components/hub/HelpModal.tsx` (the Dodge entry, one
  `Wind` icon import, comment renumbering); `src/utils/combatResponsiveness.test.ts` (**rebased, not
  weakened**: §A's title and the two pins that asserted the full regen — 24 → 12, and the clamp case
  50 → **62** instead of 74 — plus **one new test** pinning that an unblocked hit credits nothing);
  `scripts/combatTests.ts` (the one assertion that read 24, and the two clamp cases that described
  "full regen", now feeding the engine's own credit through the same arithmetic); **new**
  `src/utils/defensiveBalance.test.ts` (24 tests).
- **Regression suite: `src/utils/defensiveBalance.test.ts` — 24 tests, 6 sections-worth of cases.**
  §A the reduced gain (the 0.5 multiplier; the measured 31.9 → 15.95 and 37.5 → 18.75; whole and
  fractional regen; nothing when no blow is stopped, on a miss, or on a malformed `NaN`/`Infinity`/0/-
  regen; the credit still clamped by the normal cap and unable to exceed it; and the rule living in the
  shared helper with **no** restatement at the call site). §B both defensive paths (the reaction's guard
  writes a stance only — no stamina, no credit; the engine's `shield_block` turn spends and credits
  nothing; the single credit sits inside the shared resolution and credits the fighter who was struck;
  an evade credits nothing; a miss credits nothing). §C Dodge's 12 SP (the constant is 12 with no
  hardcoded literal; the dodge turn debits once per fighter write and applies no regen; the reaction
  debits once and refuses below the cost **before** the claim; **the resolution never refunds a
  successful dodge or recharges a failed one**; the evade roll is the unchanged `Math.random() < 0.75`;
  and the manual carries cost, odds, failure and both timings). §D the 700 ms wind-up (700 < 1100; a
  **delivered-twice impact resolves once**, so one swing cannot credit the guard twice; a second swing
  is refused while one is pending; the stance is read **at impact** and survives the turn boundary,
  consumed once by the pre-clear — 2 occurrences, one per fighter — while the reaction **replaces**
  the stance rather than stacking).
- **Checks actually run (2026-10-22, `web` dev container, on the final tree).**

  | command | result |
  |---|---|
  | `bun test src/utils/defensiveBalance.test.ts src/utils/combatResponsiveness.test.ts` | **54 pass / 0 fail** (220 `expect()`) |
  | focused combat set (`playerStrikeWindup`, `combatActionOrder`, `pendingStrike`, `duelResultLifecycle`, `duelSettlement`, `duelSettlementCommit`, `duelRewards`) | **148 pass / 0 fail** (836 `expect()`, 7 files) |
  | `bun run scripts/combatTests.ts` | **65 passed, 0 failed** |
  | `bun test` (full) | **3211 pass / 0 fail (109 files, 90,055 `expect()`)** — the true HEAD baseline was **3186 / 108** (the C-8.71B record's 3181 / 108 plus C-8.71D's five §B2 tests, which that phase deliberately did not full-run); this phase's delta is exactly 24 + 1 tests and one file |
  | `bun run lint` (`tsc --noEmit`) | **exit 0** |
  | `bun run build` | **exit 0**, startup-asset check passing (8 assets in `public/` and `dist/`; `dist/` is gitignored) |
  | `git diff --check` | **clean (exit 0)** |

  No existing assertion was deleted or loosened: the two full-regen pins were rebased onto the shipped
  rule and the two clamp cases now feed the engine's own credit rather than the raw stat. No temporary
  probe or artifact remains — the comparison harness and all throwaway scripts lived in `/tmp`, and
  `git status --porcelain` reads exactly the five files above plus this record.
- **Compile and boot evidence.** The dev server compiles and serves the edited manual
  (`/src/components/hub/HelpModal.tsx` → 200, carrying `Cost: 12 SP`, `one per announcement` and the
  `Wind` icon), `bun run build` bundles the whole app, and a preview load of `/` renders the title
  screen with **0 console errors and 0 failed requests** (anonymous visitor, no session replayed).
- **Not automatically verified — the rendered manual entry, and it is a device/manual check.** The
  HelpModal mounts only from the city hub (and the duel HUD), and reaching it needs creation → the five
  hold-to-oath gestures → the 3D city on a sandbox with no GPU (SwiftShader, ~1–2 fps) — the limit
  C-8.36…C-8.72 all recorded. So the **Dodge entry's rendered appearance in the manual is NOT
  automatically verified**: its content is pinned by the suite and its module compiles and serves, but
  no frame of it was captured. **Device check owed:** open the Tactical Combat Manual from the city hub
  and confirm the Dodge card reads 12 SP / 75 % / the failure rule / both timings, and that it sits
  between Shield Guard and Arena Taunt. Also outstanding: whether the halved credit *feels* right
  (a shielded exchange now returns ≈ 16 SP rather than ≈ 32) — a balance read that only play can
  settle, alongside the open wind-up and hit-stop device items. No Android or visual acceptance is
  claimed.
- **Scope kept.** No damage, hit chance, crit rate, defence curve, block reduction, evade chance, AI
  probability, stamina cost, turn timing, reward, settlement, save field, collider, asset or 3D
  geometry value moved. `DODGE_STAMINA_COST` is still 12, `PLAYER_ATTACK_WINDUP_MS` still 700, a player
  turn still 1100, and no save was read or written by this phase.

## Player attack wind-up cue (Phase C-8.73B — implemented; live harness verified, Android acceptance PENDING)

- **Preflight.** Repository root `/app`; branch `development-focus-strategy`, HEAD **`f2bb04ef66`**;
  `git status --porcelain` and `git diff --check` clean before the first edit. **No C-8.73A document
  exists in this repo** — that audit was read-only and appended nothing — so its finding is stated
  here from the shipped code: the player's 700 ms wind-up was legible only through the swing
  animation and the `"…winds up a quick strike…"` log line, while the opponent's identical window
  had a HUD telegraph (`data-windup-cue`) with a draining bar. Read first: the C-8.71B and C-8.71D
  records above, `playerStrike.ts`, `DuelScene`'s attack branch and cancel sites, the HUD's enemy cue,
  and `combatResponsiveness` / `playerStrikeWindup` / `combatActionOrder` / `duelResultLifecycle`.

- **The cue is a MIRROR of the strike controller, never a second timer.** `playerStrike.ts` gained
  one optional config field, `onPendingChange`, and its `pending` field now has exactly one writer
  (`setPending`), which notifies **only on an actual change** and only for the strike that owns the
  controller — the C-8.71D ownership token already guarantees a cancelled strike's queued callback
  is a complete no-op, so it cannot clear a newer strike's cue either. `DuelScene` holds
  `pendingPlayerAttack` (`useState<PlayerStrikeAction | null>`) and feeds it from that callback; the
  HUD renders it. **No `setTimeout`, no interval, no derived duration anywhere in the cue** — the
  window it draws is `PLAYER_ATTACK_WINDUP_MS`, the same constant the controller schedules with.

- **The lifecycle is the controller's own, so every path is already covered.** It appears only when
  `strike()` accepts a swing (a refused second strike notifies nothing); it clears **before** the
  impact closure runs (`setPending(null)` precedes `onImpact`), so the cue is never up during the
  damage/feedback that follows; and it clears on `cancel()`, which is the same call the turn-end
  timer, the victory path, the defeat path and the unmount cleanup already make — **the four
  `playerStrikeRef.current?.cancel()` sites are unchanged and none needed a new clear**, so the
  existing count pin (`= 4`) still holds. A refused out-of-range action never reaches `strike()`:
  the authoritative range guard returns above the commit.

- **Ownership rule, extracted and pure.** `resolvePlayerWindupCue(pendingPlayerAttack,
  pendingEnemyAttack)` returns `null` unless a player strike is pending **and** no opponent
  announcement is up — the opponent's cue always wins because that is the one the player must answer.
  (In the shipped lifecycle the two cannot overlap: the resolution latch holds the player's window
  closed until the opponent can act at all. The rule makes that deterministic rather than incidental.)
  Labels are `Your quick strike` / `Your power slash`, deliberately distinct from the enemy banner's
  "…incoming", and carry **no "incoming"** wording.

- **UI: the enemy telegraph's own treatment, in the player's amber.** Below the vital cards, above the
  tactic dashboard, the same bordered panel + `.windup-bar` draining bar (with
  `animationDuration: ${PLAYER_ATTACK_WINDUP_MS}ms`), `data-player-windup-cue={action}`, the panel
  reading `COMMITTED`. **Inert by construction** — `pointer-events-none` throughout, no button, no
  handler — so it cannot block a control, and it sits under the health/stamina cards rather than over
  them. The red enemy cue and its two reactions are untouched.

- **What did not change.** `PLAYER_ATTACK_WINDUP_MS` 700, `ENEMY_ATTACK_WINDUP_MS` 700, the 1100 ms
  turn-end timer, the 750 ms AI delay, the 1400 ms result settlement, attack animations, damage
  formula, hit chance, stamina costs, hit-stop, turn order, the range guard, the enemy announcement
  and both of its reactions. No dependency, no asset, no new HUD section, no collider, no save field.

- **Tests — `src/utils/playerWindupCue.test.ts` (new, 22 tests / 94 `expect()`).** §A the pure rule
  (nothing pending, light, heavy, the two labels distinct and never "incoming", the opponent's
  announcement owning the cue for all four combinations, totality over the scene's value space); §B
  the lifecycle **driven on the C-8.71B fake clock** — the cue appears at commit and is still up at
  699 ms, is gone at 700 ms with the impact firing once, the same for heavy, cleared *before* the
  impact closure reads the controller, cleared by `cancel()` with nothing resolving afterwards, no
  spurious clear when nothing was pending, a refused second strike raising nothing, **no stale cue
  after cancel → new strike** (the cancelled callback fired on purpose leaves the newer strike's cue
  up and resolvable), and a refused out-of-range action reaching neither the controller nor the cue;
  §C the wiring (the scene's mirror state + the single creation with `onPendingChange`, the HUD prop,
  the shared rule, the cue being inert and below the vitals, `.windup-bar` + the 700 ms duration, no
  timer in the HUD and exactly one `timer.set(` in the controller); §D scope (the two 700 ms
  constants, the 1100 ms timer, the two turn toggles, the enemy cue and both reaction controls, and
  all four cancel sites).
  **One existing pin was rebased, not weakened:** `playerStrikeWindup.test.ts` §D asserted
  `createPlayerStrike()` exactly once; the creation now carries `onPendingChange`, so it pins
  `createPlayerStrike(` **plus** the `onPendingChange: setPendingPlayerAttack` wiring — a stronger
  statement than the empty-argument form it replaces.

- **Verified 2026-10-22** in the dev container: focused
  `bun test src/utils/playerWindupCue.test.ts src/utils/playerStrikeWindup.test.ts
  src/utils/combatActionOrder.test.ts src/utils/combatResponsiveness.test.ts
  src/utils/duelResultLifecycle.test.ts src/utils/pendingStrike.test.ts` → **136 pass / 0 fail**
  (599 `expect()`); `bun test` (full) → **3233 pass / 0 fail (110 files, 90,150 `expect()`)**;
  `bun run scripts/combatTests.ts` → **65 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only; `dist/` is
  gitignored); `git diff --check` → clean.

- **Live harness evidence (not device acceptance).** `?devHarness=character` → complete the in-memory
  creation → `Start Test Duel` → two real `Advance` clicks → a real `Quick Strike` click. Read back
  from the DOM during the wind-up: `[data-player-windup-cue="quick_attack"]` visible, text
  `YOUR QUICK STRIKE / COMMITTED`, `pointer-events: none`, bar `animation-duration: 0.7s`, **no**
  enemy cue at the same time, cue top **331** against the vitals' bottom **184** (below them, not
  over them), and `elementFromPoint` over the Quick Strike button **not** inside the cue; the cue was
  **gone one second later**, and the log carried the matching wind-up line. Repeated at the **mobile
  (400 px)** viewport: cue top **259** vs vitals bottom **206**, **0 px** of horizontal overflow,
  control still hittable, cleared after impact, and **no console errors**. The frame captured during
  the window shows the amber `YOUR QUICK STRIKE — COMMITTED` panel over the arena. **The power slash
  cue was not driven live** (it shares the one rule and is unit-tested); no Android/GPU pass was done,
  so how the cue *reads* at speed on a phone — including whether 700 ms is long enough to notice it
  beside the 1.1 s turn — remains a device question, as does the 140ms hit-stop and 700 ms wind-up
  feel already open from C-8.71B/C-8.73A.

- **Files.** `src/utils/playerStrike.ts` (the notifier, the single pending writer, the pure cue rule),
  `src/components/duel/DuelScene.tsx` (the mirror state, the creation wiring, the HUD prop),
  `src/components/ui/CombatHUD.tsx` (prop, rule, the cue panel), `src/utils/playerWindupCue.test.ts`
  (new), `src/utils/playerStrikeWindup.test.ts` (one rebased pin), and this record.

## Hit-stop device acceptance preparation (Phase C-8.73D — preparation only, no production change)

- The full procedure — the five outcome holds and their precedence as read from source, the recording
  protocol, the pass/fail discriminator, the five scenario checklists (quick, power/crit, blocked,
  killing blow, telegraphed heavy), the scenarios that cannot be set up safely, and the smallest
  recommended step after the device results — lives in
  [.base44/hit-stop-device-acceptance.md](.base44/hit-stop-device-acceptance.md). Keep hit-stop
  acceptance detail there rather than enlarging this file.
- **Nothing was changed for this phase but these two documents**: HEAD `40bad99932`, empty
  `git status --porcelain`, focused combat set 136 pass / 0 fail. Two facts a future phase should not
  re-derive: `?devHarness=character` hardcodes `ALL_OPPONENTS[0]` (Marcus, not a boss), so the
  telegraphed-heavy hold is **not** reachable in the harness; and the harness does not exist in a
  production/device build at all (`import.meta.env.DEV`), so device acceptance must use the shipping
  routes — the tier-1 bout against Goliath, gated at `recommendedLevel 3` unless he is already beaten.
- **No test anywhere pins `HIT_STOP_MS`, `SHAKE_TRAUMA` or `impactAnimationScale`** — the only
  references to them are `DuelScene.tsx` and `GladiatorMesh.tsx`. Android acceptance of every hold
  (40/60/110/170/200 ms) remains PENDING; the sandbox renders the duel at ~1–2 fps and cannot resolve
  them.
