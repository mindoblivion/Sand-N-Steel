# C-8.69D — Colosseum rear appearance diagnostic

## Baseline and scope

Preflight: branch `colosseum-exterior-architecture`, HEAD
`0a5c20fa0772222b2796941669189838ae58213a`; `git status --short` was empty.
Read the complete governing AGENTS.md, its C-8.69C findings, the current
GrandColosseum and the city's lighting before editing. No existing rear
comparison harness was present.

No production geometry, material, transform, asset, lighting, fortress route,
collider, progression or save code was changed. The only existing game-entry
change is a development-gated dynamic import in `src/main.tsx`. No git commit,
push, merge or deployment commands were run.

## Open and compare (development server only)

Open `/__dev/colosseum-rear` directly, or `/?devHarness=colosseum-rear`.
The diagnostic mounts **instead of the game**, without mounting its save loader.
It needs no character, sign-in, scratch-storage flag or save reset.

- **A · Production:** the real `GrandColosseum` component, its original materials,
  and the production city light/sky/fog/environment parameters.
- **B · Neutral rear:** unlit grey (`MeshBasicMaterial`, #b8b8b8) on the rear exterior
  triangles only, θ 90–270°. This bypasses bump, PBR/environment response, tone
  mapping and fog on those triangles, preserving the original side/depth/opacity
  settings. Interior seating, floor, front portal and avenue are not recoloured.
- **C · Rear fill:** original materials and original lights plus a white directional
  fill at [0,18,-65], target [0,8,-25], intensity 1.5, no added shadow map. This is
  a diagnostic stimulus, **not a proposed production intensity**.

Use A → B → C → A **without changing camera, orientation or screen dimensions**.
`Rear overview` shows the complete building, solving only distance for narrow
screens; `Rear approach` uses the reported low vantage [0,3.6,-68.7], a 58° FOV
and 11.9° downward pitch. Its cropped attic is intentional camera framing, not a
missing mesh. Neither camera depends on the material mode.

The scene is deliberately isolated: the real Colosseum and avenue are mounted,
not other buildings, NPCs, fortress or their shadow casters. The light rig's
parameters are source-compared against CityHubScene in the test suite. This is
not proof that a full-city, memory-pressure-dependent GPU failure is absent.

### Reversibility and geometry integrity

No mesh is added to cover the rear. For spanning ring meshes B makes temporary
geometry copies **only to assign material groups** to existing triangles;
positions, indices, normals, UVs, winding, drawRange and world transforms remain
identical. Each original index is drawn exactly once. Triangle-centroid selection
has at most one original triangle of boundary granularity at ±90°, far from the
rear gate. Mode exit restores original geometry/material references and disposes
only diagnostic copies. Original shared materials are never mutated.

The on-screen surface signature covers exterior buffers and world transforms,
not material groups or animated front-portal props. The probe table raycasts the
actual generated exterior at θ 148/164/180/196/212° and y 1.5/4/7.6/9/12/16.2.
Probe hits establish geometry presence, **not GPU visibility or visual acceptance**.
A context-loss notice invalidates the comparison; reload before taking evidence.

## Comparison observed here — not Android acceptance

Renderer identified itself as **ANGLE / SwiftShader**, not Android/hardware GPU.

| Surface | A | B | C | Interpretation supported here |
|---|---|---|---|---|
| Lower sill, piers, arch heads, cornice, attic | Present, shaded | Present, opaque grey | Present, brighter stone | No disappearing solid reproduced here; shade/contrast changes the reading. |
| Central upper recess | Nearly black, apparently empty | Continuous opaque grey surface | Dark brown surface; clearer but still much darker than the pilasters | Dark recess material plus north-side lighting, not an absent wall in this renderer. A material/render-path issue on Android is not ruled out. |
| Tier-1 arches and axial gate | Interior visible | Same openings, interior unchanged | Same openings, brighter surroundings | Designed through-openings, not missing wall geometry. |

### Located sectors and height bands

Convention: X = R·sin θ, Z = R·cos θ; 0° front, 180° rear;
building root [0,0,-25], with unscaled building-local y equal to world y.

- **Central upper recess:** y **9.5–14.5**, radius **17.0**. The broad rear
  pilaster-free bay lies between pilaster centres **155.589° and 204.411°**;
  the pilasters' finite widths bound the exposed surface inside those centre lines.
  Probes θ **164°, 180°, 196°**, y **12**, all hit the solid recess liner in A/B/C.
  This is the principal low-contrast region visible in the overview comparison.
- **Rear gate:** θ **171.958–188.042°**, below y **7.35**. This is the intentional
  5.40-wide passage, not failed wall coverage. Probes θ180°, y1.5 and y4 remain open.
- **Nearest four arcade bays:** centres **147.405°, 163.774°, 196.226°, 212.595°**,
  opening bottoms y **2.5**, spring y **6.0**, crowns y **7.35**. Nominal angular
  spans at the arch's wall-mid tangent plane are respectively
  **143.264–151.545°, 159.633–167.914°, 192.086–200.367°, 208.455–216.736°**;
  the curved crown and wall depth make their actual aperture depend on y and ray
  direction. Probes θ148/164/196/212°, y4, hit no exterior stone, as intended.
- **Solid bands above the openings:** all five probes hit stone at y **7.6**
  (spandrel), **9** (tier-2 sill), **16.2** (attic). No unexpected missing sector
  was reproduced in any mode. Exact sectors of the *reported Android loss* remain
  unknown until device captures identify which of these surfaces disappear.

### Smallest next step / possible fix

**Do not add a rear wall or redesign the drum.** First collect A/B/C on the
reported Android device, keeping one camera and orientation. The software
comparison supports a **lighting/material-contrast explanation**, not a proven
root cause for the Android report. If C restores the allegedly absent stone,
trial the smallest restrained north-side fill in a separately approved phase.
If only B restores it, investigate the device's material/environment/tone path
before changing geometry; a scoped recess-contrast adjustment may suffice. If
solid stone is absent in A/B/C, inspect actual device buffers/transforms/context
and the affected θ/y band. If the same interior remains visible through arches,
classify the complaint as architectural openness, not a missing mesh.

No candidate fix was implemented. **Android visual acceptance remains PENDING.**
Capture the three modes in both orientations if the defect differs, and include
device model, browser, displayed renderer, camera readout, and affected θ/y band.

## C-8.69D closure — persisted audit findings (C-8.69E)

Persistence check first, because it was not assumed: everything above **is** the persisted record.
It already carries the A/B/C comparison table, the **ANGLE / SwiftShader** renderer limitation, the
dark rear upper recess as an appearance concern, the outstanding Android hardware-GPU verification
and the audit's validation figures, and those sections are left untouched below. Two findings from
the completed audit were **absent** and are the only things this closure adds. Nothing above is
duplicated.

### 360° roofline coverage — measured

Re-derived from the shipped `GrandColosseum.tsx` constants and the real three.js geometry of every
band (throwaway harness `/tmp/phase869d-roof.mjs`, run in the `web` container against `/app/src`):

- **The topmost exterior stone is identical at every azimuth:** roofline **min = max = Y 17.35**, the
  **attic crest** being the top-most band at all 72 sampled azimuths (5° step). The crest is
  continuous — there is no azimuth where the building is lower.
- **Complete rings (no gap anywhere on the circle)** at y ≈ 14.95 (tier-2 / golden cornice), 16.20
  (attic wall) and 17.10 (attic crest). Above y 8.6 the rear gate zone is solid stone (spandrel
  7.35–8.0, tier-1 cornice 7.8–8.6 as its lintel), so the only non-stone sector at y 7.6–12.0 is the
  monumental entrance. Below y 7.35 the only openings are the rear gate and the tier-1 arcade bays —
  exactly the C-8.31 cut.
- **No band exists entirely above the crest** (y > 17.35) and the source contains no roof, velarium
  or cap mesh (no `roof`/`velarium`/`cap` token, no `FlatArcRing` usage): **the building has no
  conventional roof.**
- Every drum band is a real open-ended `CylinderGeometry` with 36 radial segments; all 72 face
  normals and all 74 vertex normals point **outward** (0 inward, 0 degenerate, no inverted winding),
  and all five facade materials are `THREE.DoubleSide`. Back-face culling therefore cannot remove a
  rear surface.

### Conclusion

**No conventional roof exists and no confirmed geometry gap exists in the inspected source.** The
drum is closed everywhere except the designed openings, the roofline is a continuous crest at
Y = 17.35 the whole way round, nothing occludes or depth-conflicts with the rear stone, and there is
no culled or hidden rear surface. The **dark rear upper recess is recorded as an appearance concern,
not a proven geometry defect** — it is the building's unlit side (tier 1 a see-through arcade, the
tier-2 liner exposed over the gate where no pilaster is placed), and the A/B/C comparison above
supports a lighting/material-contrast explanation. A material/render-path issue specific to Android
hardware is **not** ruled out.

### Outstanding verification

**Android hardware-GPU verification remains PENDING.** No device capture has yet established whether
the "missing" surface is stone or the designed openings, so no production lighting or geometry change
is authorised. The evidence still needed is the list in `AGENTS.md` under the C-8.69C section:
a device screenshot/recording from behind (plus the front for comparison), device model/GPU/browser,
whether the missing region is stone or an opening, whether it is stable with camera angle/distance,
and whether it differs between portrait and landscape.

### Exact tests and validation

- Completed C-8.69D audit: `bun test` → **1814 pass / 0 fail (57 files)** including **9** new
  diagnostic tests; `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint`
  (`tsc --noEmit`) → exit 0; `bun run build` → exit 0 (the pre-existing >500 kB chunk warning only).
- C-8.69E re-run against the unchanged source: focused
  `bun test src/components/dev/colosseumRearDiagnostic.test.ts` → **9 pass / 0 fail** (136 expect);
  `bun test` → **1814 pass / 0 fail (57 files, 39322 expect)**;
  `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**; `bun run lint` (`tsc --noEmit`) →
  exit 0; `bun run build` → exit 0, with the built `dist/` containing **no** diagnostic token
  (`colosseum-rear`, `ColosseumRearDiagnostic`, `colosseumRearDiagnostic`, `applyRearNeutral`,
  `probeRear`, `useColosseumRearHarness`, `__dev`) and **no harness chunk**; `git diff --check` →
  clean.

## Verification

- Development compose reused successfully; service healthy; shell and diagnostic
  entry serve current Vite source (not dist/prebuilt content).
- **1814 tests pass / 0 fail** across 57 files, including **9 new diagnostic tests**.
- **123 collision checks pass / 0 fail**; `bun run lint` (TypeScript) passes.
- Production build passes; pre-existing >500 kB chunk warning remains.
  Built assets contain no diagnostic token, entry path, controls or harness chunk.
- Live `/__dev/colosseum-rear`: A/B/C/A gestures performed and rendered; identical
  camera position/quaternion, exterior signature **7b40c557**, and radial probes;
  fill present only in C; restoration passes. Real player localStorage fingerprint
  byte-identical before/after; no test records created.
- Mobile overview and approach render; no document sideways overflow, including
  the opened probe details. Details open/close and camera selection pass.
- No console errors or failed requests during the live comparison.
- Normal `/` entry still renders the original game title/sign-in screen; no login
  or gameplay was attempted. The alternate query entry is gate-tested, not
  separately browser-verified.
- Production city/asset/save/collision files are byte-identical to preflight HEAD.
- **Not verified:** Android/hardware GPU rendering; device-specific full-city
  failure; portrait-vs-landscape device acceptance; appearance of any proposed fix.

## Files and removal

Changed: `src/main.tsx` (gate), `AGENTS.md` (short documentation pointer).
Added: `src/components/dev/ColosseumRearDiagnostic.tsx` (viewer),
`src/components/dev/colosseumRearMaterials.ts` (reversible assignment/probes),
`src/components/dev/colosseumRearDiagnostic.test.ts` (safety/parity tests),
this report. Delete the three new dev source/test files and remove the
`useColosseumRearHarness` gate/branch to remove the diagnostic. Neither production
build behaviour nor saved data needs migration or cleanup.

## C-8.69F — Android visual review evidence pack (verification only, no production change)

**Preflight.** Branch `colosseum-exterior-architecture`, HEAD
`7368e46144a4cc1e34e0895cf144756d7c86f4ce`, `git status --short` empty. This phase changed no
production source, geometry, material, light rig, collider or save code, and added no diagnostic
control. Nothing below supersedes the C-8.69D/E findings — it re-confirms that the diagnostic still
behaves as recorded, and states exactly what a device capture must show.

### Verified entry points

- **`/__dev/colosseum-rear`** (pathname) — **verified live.** `src/main.tsx`'s
  `useColosseumRearHarness` gate tests the pathname (and the `?devHarness=colosseum-rear` query) and
  mounts `ColosseumRearDiagnostic` **instead of** `App`, so the save loader, player and collision
  system never mount. It reached `Ready · A · overview` at the **mobile viewport (375 px client
  width)** with the three mode buttons, both fixed cameras and the probe table present. The query
  entry is the same gate on `URLSearchParams`; it is source-checked, not separately browser-verified.

### Narrow-viewport and A/B/C/A checks (driven in one pass at 375 px)

A · Production → B · Neutral rear → C · Rear fill → A · Production, without changing camera,
orientation or viewport:

| check | result |
|---|---|
| modes reached, in order | **A → B → C → A** |
| exterior surface signature | **`7b40c557` in all four states** — buffers and world transforms unchanged |
| camera position | `[0, 8, −76.563]`, identical in all four states |
| rear fill present | `true` **only** in C |
| radial probes (θ 148/164/180/196/212°) | identical in A, B and C — y 4 = **opening**, y 12 = **recess liner**, y 16.2 = **stone** |
| horizontal overflow | `scrollWidth` 375 = `clientWidth` 375 — no sideways scroll |
| console errors / failed requests | **0 / 0** |

Read from the captures taken inside that pass: **A** — production shading, the tier-2 band above the
gate dark, the arches open onto the lit interior; **B** — the rear exterior flat unlit grey with
**the openings still open** and the lit interior still visible through them; **C** — the same stone
brightened, the tier-2 band reading as a lit band rather than a void. **No state shows a hole, a
torn surface or a blank region.**

### Renderer limitation

The preview identifies itself as **`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)),
SwiftShader driver)`** — CPU software rendering, no Android GPU, ~1.5–2 fps. This environment can
establish that the rear geometry is present and that lighting/contrast changes its reading; it
**cannot** adjudicate a hardware render path (environment/PMREM, tone mapping, precision) and does
not reproduce the reported device symptom. Nothing here is Android acceptance.

### Roofline and rear-wall findings

**Source-confirmed (measured in this repo):**

- The drum is closed at every height except the designed openings — the rear gate
  (θ 171.96–188.04°, to y 7.35), the tier-1 arcade bays and the monumental entrance. Above y 8.6 the
  rear gate zone is solid stone; y 15.0 / 16.5 / 17.2 are a **full ring**.
- The roofline is a **continuous crest at y 17.35** at every azimuth, and the source contains **no
  roof, velarium or cap mesh** — the building has no conventional roof, and no band sits above the
  crest.
- Every drum band is `DoubleSide` with outward normals, so back-face culling cannot remove a rear
  surface, and no coplanar duplicate surface exists on the drum.
- The rear is the building's **unlit side** — 0.397 against 1.068 for the front (37.2% of the
  directional + hemisphere total), with `N·L(sun)` = −0.392 there.
- Two by-design rear asymmetries: tier 1 is a **51%-open see-through arcade** (liner removed in
  Phase 25.4), and tier 2 carries **no pilaster over a 48.80° zone** about θ = π (pilasters end at
  155.60° / 204.40°), exposing the dark recess liner (`recessMat` #3d352a, r 17.0) above the gate.

**Unresolved / device-dependent:**

- Whether on the device the dark band is **stone rendered dark** (lighting / material / tone
  mapping) or **absent geometry** — this renderer cannot distinguish them, and A/B/C here supports
  only a *contrast* explanation.
- Whether a device-specific **environment-map (PMREM) failure**, tone-mapping difference or WebGL
  **context loss** is involved (the C-8.69A closeout recorded one blank-canvas frame under
  SwiftShader with `isContextLost() === false`).
- Whether it changes with camera angle/distance, and between portrait and landscape.

### Required device evidence (Android)

Capture **A, B and C without switching camera or orientation**, at the reported vantage, and
include:

1. **Rear overview**, **rear approach**, the **front** for comparison, and the **attic crest**.
2. **Device model, GPU and browser** (and, if shown, the diagnostic's own renderer line).
3. Which surface appears missing — **stone** (the facade between/below/above the openings) or the
   **openings themselves** (arches and gate showing the interior).
4. Whether it is stable with camera angle/distance, and whether it differs between **portrait and
   landscape** (portrait narrows the horizontal window to ~27°).

### Validation obtained

- Focused diagnostic suite at this HEAD:
  `bun test src/components/dev/colosseumRearDiagnostic.test.ts` → **9 pass / 0 fail, 136 `expect()`
  calls** (material restoration, geometry/transform/resource preservation, one-draw-per-index, probe
  parity across A/B/restored-A, B→A cycle disposal, production short-circuit, no
  storage/player/collision dependencies, light-rig parity, mode-independent camera).
- Live comparison at the mobile viewport: the table above — signature `7b40c557` stable across
  A→B→C→A, camera fixed, probes identical, fill only in C, **0** console errors, **0** failed
  requests, no horizontal overflow.
- The full `bun test`, collision-script, lint and build figures are the C-8.69E ones above; no
  implementation code changed, so they were **not** re-run.

**No fix was selected, no production file was touched, and Android visual acceptance remains
PENDING.** Persisting this record and the capture request are all this phase produces.
