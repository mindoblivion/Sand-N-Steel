# C-8.80O — duel composition acceptance (phase record)

Status: acceptance pass, 2026-10-24. **No production source changed** — measurement,
verification and this record only. No camera, combat, canvas, timing, damage, stamina,
AI, movement, reach, spawn or CSS value moved.

## 1. Git state

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at start | `8e5e67a6f3ae8f0663135adc957ce04b61b5d63f` |
| Working tree at start | `git status --porcelain` empty; `git diff --check` clean |
| Dev stack | `app-web-1` (oven/bun:1, Vite), `Up 2 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl localhost:3000/` → `200` |

## 2. What the reported defect actually is (and is not)

The brief carried one open item from C-8.80N: *"at 400×800 the opponent's head measured 1px
under the HUD's edge, and the final 6px portrait trim that addresses it is derived, not
measured."*

**The 1px does not reproduce on the current source, at any of the four required sizes.** The trim
C-8.80N applied at the end of that phase (dashboard gap −2px, chronicle range row −4px) is real
and can now be measured: the command panel is **403px** with a one-line chronicle (the C-8.80N
measurement used the pre-trim 407) and **420px** with the chronicle at its own 48px cap. Every
measured clearance in §5 and §6 is positive.

The two figures that *did* look like the defect, and what they were:

- **−1px in the harness case is the harness's own banner.** `CharacterTestHarness` wraps the duel
  in a 28px `pt-7` row, so inside the harness the duel root is `800 − 28 = 772` tall and the
  stage is 28px shorter while the HUD's top-down height is unchanged — a 0.426 × 28 ≈ 12px loss of
  head clearance. Measured with the banner collapsed (a device has none): **+13.7px**.
- **The panel is not a constant.** It is content-sized: 403px with one chronicle line, 420px once
  the chronicle reaches its `max-height: 3rem` cap, which moves the stage by 17px. That is the
  lever that sets the clearance, and it is what makes the margin thin — not the trim.

## 3. Measurement technique (reused, with two corrections)

Same-origin `<iframe>` sized in CSS pixels on the live page → `/?devHarness=character` →
`Apply Points` → `Start Test Duel` → measure with `getBoundingClientRect` at each size in one
script (an iframe is its own media-query viewport). Two corrections this phase had to make:

1. **Collapse the harness banner for device geometry.** `[data-testid="harness-banner"]` hidden
   and every `.pt-7` wrapper's `padding-top` zeroed *inside the measuring frame only* (dev-only
   scaffolding; a device has no banner). Without this, every figure is ~12px pessimistic.
2. **Wait for the canvas to settle.** R3F resizes its canvas through a ResizeObserver, and in
   this sandbox it lags one resize: after resizing to 375×812 the canvas was still 369 tall, after
   812×375 it read 381, after 1280×800 it read 347. Projecting before the canvas matches the stage
   measures positions the renderer is not using. Every number below was taken after polling
   `canvas.height === stage.height` (±2px).

**Projection** is computed from the rig's own constants (`DuelCameraRig`: midpoint of the two
fighters, `baseDist` 8.5, `baseHeight` 5.2, `lookAt` y 1.2, vertical fov 45), the spawn offsets
from `duelGeometry` (`±1.8`) and the measured `arena_roman` visible height (1.10; `meshScale` 1
for both — Marcus carries none). This is not a new model: it reproduces **all eight** fractions
C-8.80N recorded, to the decimal — opening opponent 42.63…53.34 %, player 63.30…77.01 %; close
range opponent 46.55…57.91 %, player 56.63…69.51 %.

`devicePixelRatio` is 1 in the measuring frame, so the CSS-pixel figures below are the numbers a
DPR-2 device lays out; DPR affects the canvas backing store, not layout or the projected fraction
of canvas height.

## 4. The layout contract, restated with measured constants

Measured in portrait: top HUD bottom **155.5px** below the stage top; command panel **403px** (one
log line) … **420px** (chronicle capped); opponent head at **43.33 %** of stage height (opening)
and **46.55 %** (after one Advance); player head 63.30 % / 56.63 %.

With a fixed vertical fov the projected band is always that fraction of the stage, so clearance is
`0.4333 × stage − 155.5`. It reaches zero at a stage of **359px**, i.e. a portrait viewport of
**≈779px** with the panel at its 420px cap.

## 5. Measured — opening separation (3.6 m), settled, banner collapsed

CSS px relative to the stage top.

| viewport | stage | top HUD ends | panel | opponent head…feet | player head…feet | opponent head clearance | player head above panel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **400×800** | 397 | 155.5 | 403 | 169.2 … 211.8 | 251.1 … 305.7 | **+13.7** | +145.9 |
| **375×812** | 409 | 155.5 | 403 | 174.3 … 218.2 | 258.7 … 315.0 | **+18.8** | +150.3 |
| **812×375** | 352×375 | 119.8 | 460×375 column, no scroll | 159.8 … 200.0 | 237.2 … 288.8 | **+40.0** | n/a (column, not below) |
| **1280×800** | 1280×800 | 204.5 | 355, top 445 | 341.0 … 426.7 | 506.0 … 616.1 | **+136.5** | **−61.0** |

Worst case — the chronicle at its own 48px cap (5 entries, `combat-log-items` `scrolls: true`),
which is the state a live fight reaches:

| viewport | panel | stage | opponent head clearance |
| --- | --- | --- | --- |
| 400×800 | 420 | 380 | **+9.2** |
| 375×812 | 420 | 392 | **+14.4** |

For reference, the same 400×800 case **with** the harness banner: stage 369, head 159.9, clearance
**+4.4** — the banner, not the layout, produced the reported −1px.

## 6. Measured — close range (driven, not derived)

Driven through the real control (`title="Step forward towards opponent (+1.8m)"`, the only Advance
button; the two strike tiles also contain the word "Advance" in their "Out of range — Advance to
strike" text and are the wrong target).

`DIST: 3.6m` → `DIST: 1.8m`; chronicle `Spartacus advances 1.8m toward their opponent.`; range
badge `IN STRIKE RANGE`. At 400×800, panel 420, stage 380:

| | head | feet | clearance |
| --- | --- | --- | --- |
| opponent | 176.9 | 220.1 | **+21.4** below the top HUD, 159.9 above the panel |
| player | 215.2 | 264.1 | **+164.8** above the panel top, feet 115.9 inside the stage |

Both poses pass: the opponent's head and body are clear of both chrome bands, and the player's
whole body sits above the command panel with room to spare.

**Combat cues.** The player's own 700ms wind-up cue measured **159.5 … 208.0** — directly under the
vitals, overlapping the opponent's band (176.9 … 220.1). The cue is the primary read for that
window and is pointer-inert for the player's own strike; it deliberately paints above the panel
(C-8.74C-H). Recorded as an observation, not a defect: nothing regressed against the pre-C-8.80N
layout, where the same card sat mid-screen over the same fighters.

## 7. Controls, clipping and scroll

All 13 buttons were hit-tested at their own centres with `elementFromPoint` in all four sizes.
**12/13 hit.** The only miss is `Catch Breath`, which is `pointer-events-none` while disabled at
full stamina (pre-existing disabled styling; the driven close-range capture shows it enabled and
green once stamina is spent). No sideways scroll at any size (`scrollWidth === clientWidth`); no
root overflow; the 812×375 column has `clientHeight === scrollHeight` (no scroll) with the movement
strip in one row.

## 8. Safe area

`env(safe-area-inset-top|bottom)` probes to **0px** inside this harness — the preview browser
emulates no notch or gesture bar, and the iframe inherits that. The rules that would carry it
(`body` insets, `.duel-root { height:100% }` under the phone queries) are unchanged and unmeasured
here. **Safe-area behaviour: NOT VERIFIED.**

## 9. Checks (dev container, this phase)

| check | result |
| --- | --- |
| `bun test src/utils/phaseC8_80n.test.ts` | **30 pass / 0 fail**, 143 expect() calls |
| `bun test` | **3620 pass / 0 fail**, 128 files, 92 939 expect() calls — identical to the C-8.80N baseline, confirming no source change |
| `bun run scripts/collisionTests.ts` | **123 passed, 0 failed** |
| `bun run lint` (`tsc --noEmit`) | exit 0 |
| `bun run build` | exit 0 (8 startup assets; pre-existing >500 kB chunk warning only) |
| `git diff --check` | clean |

Combat logic and camera/spawn geometry were confirmed unchanged by reading the diff (no production
file touched) and by the §E scope guard in `phaseC8_80n.test.ts` passing unmodified.

## 10. Conclusion

1. **The reported 400×800 occlusion does not reproduce.** Measured clearance is +13.7px at the
   opening with a one-line chronicle and **+9.2px** in the worst case (chronicle at its cap). No
   adjustment was made: trimming a gap that is not there would have been exactly the guessed 6px
   this phase was told not to ship.
2. **The C-8.80N trim is now measured, not derived** — panel 403 (not 407), and the harness's −1px
   is fully explained by its own 28px banner (device +13.7 vs harness +4.4).
3. **The margin is thin and is set by panel content, not by the HUD.** Clearance reaches zero at a
   portrait viewport of ≈779px. The four required sizes sit above that line; a portrait viewport
   below it (e.g. 400×720 → stage 300 → **−25.5px**) reproduces the reported symptom exactly. That
   is a structural gap worth its own phase, and the fix is a composition decision (a stage floor
   with a bounded panel, or phone-portrait chrome shed the way 812×375 already sheds it) rather
   than another few px off the trim.
4. **Desktop is unchanged and still occludes the player.** At 1280×800 the panel occupies 445…800
   and the player projects to 506…616 — the player is behind the panel, the opponent is not. This
   is the pre-C-8.80N geometry C-8.80N deliberately preserved (its own record lists the identical
   506…616 band), and the desktop capture shows one fighter in the arena. Recorded because this
   phase's brief asked for the player to be confirmed visible above the panel: on desktop it is
   not, by pre-existing design, and changing it would break the established desktop layout this
   phase was told not to broaden.

## 11. Confirmations

**Confirmed by live measurement** (preview browser, real duel, settled canvas): the four required
sizes' stage/HUD/panel geometry; opening clearance +13.7 / +18.8 / +40.0 / +136.5; worst-case
(chronicle capped) +9.2 / +14.4; the driven one-Advance close range and its +21.4 opponent
clearance; the player's body fully above the panel in portrait and landscape; 12/13 controls
hit-tested at their centres; no sideways scroll; the desktop player occlusion; `env()` safe-area
probing 0px.

**Not confirmed:** (a) any judgement of the fighters as *rendered* figures — the sandbox draws
through SwiftShader at a few frames per second, so "two gladiators are visible in the arena" in
the captures is a coarse visual read plus DOM/geometry, not a frame-rate or legibility test;
(b) rendered attack impact and cue readability at speed (the cue was measured in the frame it
appeared, not judged as animation); (c) safe-area behaviour on a notched or gesture-bar phone;
(d) any portrait viewport below ≈779px, or a landscape viewport narrower than ~347px tall;
(e) whether the transient cue/opponent overlap reads acceptably in motion.

**Android acceptance: PENDING.** Nothing in this phase is device evidence.
