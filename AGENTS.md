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
