# Mobile combat usability & performance audit (Phase C-8.74A — read-only)

**No production code was changed for this phase.** Two documents were added
(this file and the AGENTS.md pointer). No combat rule, timing, damage, stamina,
reward or progression value was changed, and none was read for modification.

## 1. Preflight

| item | value |
|---|---|
| repository root | `/app` |
| branch | `development-focus-strategy` |
| HEAD | `f8e296e824536d0fd396ffd83935aea48f81534f` |
| `git status --porcelain` | empty before the audit |
| `git diff --check` | clean, exit 0 |
| dev stack | `app-web-1` (`oven/bun:1`, Vite dev server), healthy, `localhost:3000` → 200 |

Nothing was reset, stashed, overwritten, committed, pushed or deployed. Records read
before touching code: the C-8.71A, C-8.71B, C-8.71D, C-8.72B, C-8.73B and C-8.73D
sections of `AGENTS.md`, and the short-landscape HUD note in its "Non-obvious notes".

## 2. Files inspected

- `src/components/duel/DuelScene.tsx` — Canvas props, frameloop state, camera rig,
  `FloatingDamage3D`, unmount cleanup, HUD wiring.
- `src/components/ui/CombatHUD.tsx` — top utility bar, vital cards, crowd meter,
  enemy wind-up cue + reaction buttons, player wind-up cue.
- `src/components/ui/TurnActionPanel.tsx` — chronicle panel, five tactic tiles,
  movement strip.
- `src/components/3d/DuelArena.tsx` — every arena mesh, brazier point lights.
- `src/components/3d/GladiatorMesh.tsx` — shadow flags on the skinned meshes.
- `src/index.css` — short-landscape block, `.windup-bar`, `body` safe-area padding,
  `html/body/#root { overflow: hidden }`.
- `src/components/hub/DuelResultModal.tsx`, `src/App.tsx` (duel mount + result overlay),
  `src/hooks/useAdaptiveDpr.ts` (city-only governor), `src/services/settings.ts`
  (`qualityPreset`), `src/components/dev/CharacterTestHarness.tsx`.

## 3. Live measurements

Harness: `?devHarness=character` → complete the in-memory creation → `Start Test Duel`
(opponent is `ALL_OPPONENTS[0]`, Marcus). Browser viewport **375 × 812 CSS px,
`devicePixelRatio` 2** (the mobile preset; the sandbox offers no 812 × 375 preset).
**The harness wraps `DuelScene` in `pt-7`, so every absolute Y below carries a 28 px
banner offset** — comparisons that matter are stated against the HUD's own rect, which
is banner-independent.

### 3.1 Touch targets (measured `getBoundingClientRect`)

| control | W × H (px) | ≥ 48 × 48 | note |
|---|---|---|---|
| Quick Strike | 162.5 × 87.0 | yes | |
| Power Slash | 162.5 × 87.0 | yes | |
| Shield Guard | 162.5 × 87.0 | yes | |
| Dodge | 162.5 × 87.0 | yes | |
| Arena Taunt | 162.5 × 87.0 | yes | |
| Advance (+1.8m) | 98.2 × 46.0 | **no** (2 px short) | |
| Retreat (−1.8m) | 92.0 × 46.0 | **no** (2 px short) | |
| Catch Breath (+40 SP) | 126.8 × 46.0 | **no** (2 px short) | |
| Shield Guard (reaction) | 162.5 × 44.0 | **no** (4 px short) | `min-h-[44px]` in source |
| Dodge −12 SP (reaction) | 162.5 × 44.0 | **no** (4 px short) | `min-h-[44px]` in source |
| Armory: Standard Gladius & Scutum | 193.4 × 30.0 | **no** (18 px short) | `px-3 py-1.5` |
| Camera (3/4 Duel) | 36.0 × 28.0 | **no** | `px-2.5 py-1.5` |
| Settings | 38.0 × 48.0 | **no** (width) | `min-h-[48px]` already |
| Help (?) | 30.0 × 30.0 | **no** | `p-1.5` |
| Mute | 30.0 × 30.0 | **no** | `p-1.5` |

At the desktop preset (1280 × 800) the same cluster measures Armory 272.2 × 34.0,
Camera 99.6 × 30.0, Settings 87.7 × 48.0, Help 34.0 × 34.0, Mute 34.0 × 34.0 — so the
utility cluster is under the 48 px baseline at **every** breakpoint, not only on phones.
The result modal's `Return to Metropolis [Town Gate]` button was **not** measured; from
source it is `w-full py-4` (~56 px tall) and is the only settlement control.

### 3.2 Overlap, obscuring, reachability

- **No overlap.** All 13 hittable controls were tested pairwise; intersecting area was
  zero for every pair. No control was hidden behind HUD chrome.
- **No horizontal overflow**: `scrollWidth 375 = clientWidth 375` (1280 = 1280 desktop).
- **Vertical budget is the constraint.** With the chronicle in its 5-entry state
  (`combatLog.slice(-5)`, the list already at its `max-h-24` = 96 px cap): the HUD rect is
  812 tall, the tactic dashboard's bottom sits **13.5 px past the HUD's own bottom edge**
  (its bottom padding and rounded border are clipped; `html/body/#root` are
  `overflow: hidden`, so there is nothing to scroll), and the movement strip's bottom sits
  **6.5 px inside** the HUD bottom. Every one of those buttons still hit-tests true at its
  centre.
- **Cues do not obscure the vitals or the controls.**
  - Player wind-up cue: 355 × 48.5 at y 258.5–307, `pointer-events: none`, **52.5 px
    clear** of the vital cards' bottom (206); `elementFromPoint` over the Quick Strike
    button is not inside the cue.
  - Enemy wind-up cue: 355 × 98.5 at y 258.5–357; both reactions hit-test true at their
    centres. It pushes the tactic dashboard down 49.5–98.5 px, but during that window
    every tactic and movement control is disabled by the `isExecuting` latch anyway, so no
    input is lost — the two reactions are the only live targets and stay reachable.
- **Console:** zero errors during a full advance-advance-strike-exchange run.

### 3.3 Canvas and DPR

| measurement | value |
|---|---|
| canvas CSS box | 375 × 812 |
| drawing buffer | **750 × 1624** |
| effective DPR | **2.00** at `devicePixelRatio` 2 |

`<Canvas>` in `DuelScene` passes **no `dpr` prop**, so the buffer follows
`window.devicePixelRatio` with no cap: on a 3× Android phone the duel renders **9× the CSS
pixel count** (2.25× what the 2× case costs). The city hub caps and steers this through
`useAdaptiveDpr` / `CITY_TIERS`; the duel has **no governor of any kind**
(`grep useAdaptiveDpr` → `CityHubScene.tsx` only).

## 4. Rendering configuration (source evidence)

- **Shadows:** `<Canvas shadows>` (three's default soft PCF). One shadow-casting
  `directionalLight` (intensity 1.9) with `shadow-mapSize={[1024, 1024]}`; a second
  directional fill light does not cast; `ambientLight` 0.65. Casters re-drawn into the map
  each frame: podium wall, 8 brazier bowls, the imperial loge podium, 2 gate grates and
  **both skinned gladiators** (`GladiatorMesh` sets `castShadow`/`receiveShadow` on every
  GLB child). The 56 crowd boxes correctly do not cast.
- **Point lights: 8.** The brazier loop emits one `<pointLight intensity={3.5}
  distance={12}>` per torch, so every lit `meshStandardMaterial` fragment evaluates 8 point
  lights + 2 directional + ambient. This is the largest per-pixel multiplier in the scene
  and it scales linearly with the pixel count in §3.3.
- **Particles:** one drei `<Sparkles count={50} scale={[20,10,20]} size={2}>` — a single
  `Points` draw call, cheap in itself, animated every rendered frame.
- **Mesh/draw-call count (counted from source, not `renderer.info`):** 87 meshes in
  `DuelArena`, of which **56 are crowd boxes each created with its own
  `meshStandardMaterial`** (one material instance per box → 56 separate draw calls), 16
  brazier meshes, 6 seating/base surfaces, 5 loge pieces, 4 gate pieces; plus the two
  skinned gladiators and `Sky`.
- **Frame loop:** `frameloop` starts `'demand'` and is switched to `'always'` 200 ms after
  mount, **and never returns**. Nothing in the duel calls `invalidate`, so the scene
  renders continuously while idle, while a turn resolves, while the fight is over, and
  while an overlay is open. The arena keeps rendering behind `DuelResultModal`
  (`currentScreen` stays `'duel'` until the player taps Return, and the modal is a
  `backdrop-blur-md` overlay, so the arena is redrawn under a full-screen blur), and behind
  the Settings sheet — `RaceScene` already takes a `frozen` prop for exactly this case;
  `DuelScene` does not.
- **Cleanup:** the turn-end timer, AI timer, pending-strike controller and player-strike
  controller are all released on unmount/outcome (pinned by `duelResultLifecycle` §D), and
  `CanvasWebGLMonitor` disposes its monitor. No leaked interval or per-frame allocator was
  found in the inspected paths.

## 5. Tests run

`bun test` over `combatResponsiveness`, `combatActionOrder`, `playerWindupCue`,
`playerStrikeWindup`, `duelResultLifecycle`, `pendingStrike`, `defensiveBalance`
→ **160 pass / 0 fail · 694 expect() · 7 files**

The full suite, `bun run lint` and `bun run build` were **not** run: no source changed, so
a green full run would prove nothing this phase did not already assume.

## 6. Findings by evidence class

**Measured in the live browser (high confidence)**
1. The duel canvas renders at an uncapped `devicePixelRatio` (2.00 measured; no `dpr`
   prop, no governor) while the city hub caps and steers its own.
2. Ten of the fifteen duel controls are under the 48 × 48 baseline: six by 2–4 px
   (movement strip 46, reactions 44) and five by much more (the 28–34 px utility cluster,
   30 px Armory height, 38 px Settings width).
3. At 375 × 812 portrait the tactic dashboard overflows its own HUD box by 13.5 px and the
   movement strip has only 6.5 px of clearance, with the chronicle already at cap.
4. Both wind-up cues clear the vitals and never cover a live control; zero console errors;
   zero controls overlap.

**Source-only (high confidence, not rendered here)**
5. 8 point lights, 1 × 1024² shadow map with ~13 casters, 56 individually-materialled crowd
   boxes, one 50-point `Sparkles` system.
6. `frameloop` never leaves `'always'`; no pause on match over, result modal, settings sheet
   or help overlay.
7. `body` carries the safe-area padding while the duel root is `min-h-[100dvh]` inside
   `#root` (`overflow: hidden`): **if** the device reports a non-zero
   `safe-area-inset-bottom` (iOS, or Android standalone/edge-to-edge), the HUD's last
   inset-height band — where the movement strip lives with 6.5 px to spare — is clipped.

**Pending Android acceptance (cannot be resolved in this sandbox)**
- Real frame time and thermal behaviour on a mid-range GPU, and therefore whether a DPR cap
  buys the frame rate it should.
- A true 16:9 landscape render (812 × 375). The compacted `@media (orientation: landscape)
  and (max-height: 520px)` block exists and was previously measured by replaying its
  declarations (403 → 347 px against a 365 px budget), but the preview browser still offers
  no such preset, so no real landscape frame was produced.
- Whether 44 px reactions are comfortable inside the 700 ms window, and whether the 28–34 px
  utility cluster actually mis-taps in play.
- The visual cost of a DPR cap (does the sand/stone read as soft?), and the warm brazier
  pooling from the 8 point lights.

## 7. Recommended next changes (max three, not implemented)

Ranked by mobile impact → evidence strength → regression risk → offline validatability.

1. **Cap the duel's pixel ratio.** Give the duel `dpr={[1, cap]}` (2 by default, lower for
   the `swift` preset the settings module already stores) or wire the existing
   `useAdaptiveDpr` governor to it. *Impact* high (the only lever that scales every fragment
   cost at once); *evidence* measured effective DPR 2.00 uncapped; *risk* low (fragment
   resolution only — no geometry, light, material or combat change); *validatable offline*
   yes (`canvas.width / clientWidth` in the preview).
2. **Reclaim the HUD's bottom band at ≤400 px-wide portrait.** Shave stacked chrome
   (chronicle/list cap, card padding, or the crowd meter's second row) so the tactic
   dashboard's bottom edge and the movement strip clear the HUD box with the chronicle full
   **and** with either cue up. *Impact* high (clipped panel today, controls inside the
   safe-area band on gesture-bar devices); *evidence* measured 13.5 px overflow / 6.5 px
   clearance; *risk* low (layout only, the `.combat-hud` hooks already exist);
   *validatable offline* yes at 375 × 812.
3. **Lift the sub-48 px targets.** Utility cluster to ≥ 44–48 px, Armory to ≥ 44 px tall,
   Settings to ≥ 48 px wide, movement strip 46 → 48, reactions 44 → 48. *Impact* medium (the
   small targets mis-tap, but they are mostly non-combat); *evidence* measured at both
   breakpoints; *risk* low, **but it spends vertical budget — ship it with, or after, item 2.**

Deliberately **not** recommended yet: turning off shadows, cutting the point lights or
merging the crowd boxes. Each is a real cost, but each changes the arena's look, and none has
been weighed against a device frame trace. Take the DPR cap first, measure it on Android, and
only then decide whether the light rig needs a quality-preset lever.

## 8. Recommended next phase

**C-8.74B — duel pixel budget (DPR cap).** Scope: `DuelScene`'s `<Canvas>` `dpr` prop and,
if needed, a single reader of `settings.qualityPreset`; nothing else. Out of scope: lights,
shadows, materials, geometry, particles, HUD layout, touch targets, and every combat
rule/timing/value. Acceptance: the measured `canvas.width / clientWidth` equals the cap at
`devicePixelRatio` 2 and 3 (and the lower cap under `swift`); the focused combat set stays
160 pass / 0 fail; a captured duel frame shows no missing or displaced arena content; and an
on-device note records the frame-rate change and whether the softened edges are acceptable.
