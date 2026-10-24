# C-8.80N — phone duel composition (phase record)

Status: implemented and measured (2026-10-24). Layout only: **no camera, combat, canvas,
timing, damage, stamina, AI, movement, reach or spawn value changed**. No commit, push,
merge or deployment was performed by the phase.

## 1. Preflight (measured)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at start | `b93f9ea7fe2844b1748abb6ffb41236befb16fb5` |
| Working tree | `git status --porcelain` empty; `git diff --check` clean |
| Dev stack | `app-web-1` (oven/bun:1, Vite), `Up 2 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl localhost:3000/` → `200` |
| C-8.80L / C-8.80M records | **not present in the repo** (both prior audits were read-only and never
written up), so every C-8.80M figure was re-derived live here |

Read before editing: `AGENTS.md` (the C-8.74A/B/C and C-8.74D-A layout sections, the C-8.80
duel-phase sections), `.base44/mobile-combat-audit.md`, `DuelScene.tsx`, `CombatHUD.tsx`,
`TurnActionPanel.tsx`, `index.css`, `duelGeometry.ts`, `CharacterTestHarness.tsx`,
`CombatHudHarness.tsx`.

## 2. The measurement technique this phase established

The preview browser only offers fixed presets (mobile 375×812 at DPR 2, tablet 768×1024,
desktop 1280×800), which is why C-8.74D-A recorded that a true 812×375 frame "is not
reproducible here". **It is: an iframe is its own media-query viewport.** A same-origin
`<iframe>` in the live page, sized in CSS pixels, loads `/?devHarness=character`, is driven
through the real creation → duel flow (two clicks: `Apply Points`, `Start Test Duel`), and
then measured with `getBoundingClientRect` at exactly 400×800, 375×812, 812×375 and
1280×800 — no reload between sizes, so one script measures all four. The harness adds a
28px banner (`pt-7`); every figure below is reported relative to the duel root or the
stage, and the real-device geometry is derived from the unbannered viewport height.

## 3. The layout contract (established before editing)

Camera rig (unchanged, cinematic): midpoint of the two fighters, `baseDist` 8.5 behind,
`baseHeight` 5.2 up, `lookAt` 1.2 up, vertical `fov` 45. With a fixed vertical FOV the
fighters project to the **same fraction of canvas height at every width** — so the lever is
how tall the canvas is, not how wide:

| pose | opponent (top … feet) | player (top … feet) |
| --- | --- | --- |
| opening, 3.6 m apart (C-8.80J) | 42.6 % … 53.4 % | 63.3 % … 77.0 % |
| after one 1.8 m Advance (1.8 m) | 46.5 % … 57.9 % | 56.6 % … 69.5 % |

Measured before the change (400×800): the top HUD block ended at y 227, the stacked
chronicle began at y 290 and the tactic dashboard ended at y 818. The fighters sat at
341–427 and 506–616 — **100 % of both fighter bands was behind HUD chrome**.

Contract therefore: the canvas must be a region the panel does not cover, its top HUD must
end above 42.6 % of its height, and both fighters' feet must stay inside it. Persistently
visible: both fighters' health and stamina, the turn state, both wind-up cues, all five
tactics, Advance/Retreat/Catch Breath, a readable chronicle, Withdraw/camera/settings/help/
mute.

## 4. What shipped

1. **`DuelScene.tsx`** — the canvas and the HUD overlay are now a `.duel-stage`; the
   `TurnActionPanel` is a **sibling** `.duel-command` region. Desktop/tablet keep the old
   geometry exactly (stage `absolute inset-0`, panel absolute across the bottom at the same
   20px/16px insets the HUD padding gave it).
2. **`CombatHUD.tsx`** — owns the stage overlay only (vitals, crowd meter, cues, telegraph).
   The panel and its five props moved out; `justify-between` was dropped (with the panel no
   longer last, it would have pushed the zero-height cue wrappers to the stage's bottom).
   Two hooks (`vital-health-bar`, `vital-stamina-bar`) and `data-hud-label` on the utility
   row's text spans were added for the phone rules.
3. **`TurnActionPanel.tsx`** — `tactic-panel`, `chronicle-card`, `chronicle-range`,
   `tactic-strip` hooks. No content, control, size or behaviour changed.
4. **`index.css`** — default stage/panel placement, plus two phone blocks:
   **portrait** (`max-width: 520px` + portrait) stacks the stage above the panel;
   **short landscape** (`orientation: landscape` + `max-height: 520px`) puts the panel in a
   460px right-hand column, so the panel and the fighters occupy different columns.
   Compaction is chrome only: shortened vital bars, a one-line crowd meter in portrait, the
   utility row's label text hidden (icons + `title` remain), tactic blurbs hidden (the
   C-8.74D-A precedent), chronicle list capped (still scrollable, still `slice(-5)`).
   In short landscape only, the crowd meter and the chronicle's redundant range row are
   dropped, and the tactic grid becomes three columns of three.

## 5. Measured after (preview browser, real duel)

Relative to the stage top. `columnScroll` = the panel's own overflow.

| viewport | stage | top HUD ends | opening: opponent | opening: player | close: opponent/player | panel |
| --- | --- | --- | --- | --- | --- | --- |
| 400×800 portrait¹ | 365 | 156 | 155–195 (**−1**) | 231–281 (+75) | 170–211 / 207–254 | 407 tall, no scroll |
| 375×812 portrait¹ | 377 | 156 | 161–201 (**+5**) | 239–290 (+83) | 175–218 / 213–262 | 407 tall, no scroll |
| 812×375 landscape | 352×347 | 120 | 148–185 (**+28**) | 220–267 (+100) | 161–201 / 196–241 | 460×347, 3px overflow, strip 11px clear |
| 1280×800 desktop | 1280×800 | 205 | 341–427 (+136) | 506–616 (+301) | 372–463 / 453–556 | 355 tall across the bottom, no scroll |

¹ the harness banner case. A device has no banner, so the stage is 28px taller and the
fighter bands move down by 0.426 × 28 ≈ 12px: derived clearance **+11 / +17**.

After those measurements a final portrait trim (dashboard gap −2px, chronicle range row
−4px ≈ 6px off the panel) was applied to give the 400×800 case margin; it is **not
re-measured** (preview budget spent) — by arithmetic it moves the opponent's head to about
**+7** in the harness case and **+18** on a real 400×800 viewport. Treat it as derived.

Every core action was hit-tested in all four sizes (`elementFromPoint` at each control's
centre): all present and inside the viewport. `Catch Breath` did not hit-test because it is
`pointer-events-none` while disabled at full stamina — a pre-existing disabled style, not
clipping. No sideways scroll at any size (`scrollWidth === clientWidth`); zero console
errors.

## 6. Files changed

`src/components/duel/DuelScene.tsx`, `src/components/ui/CombatHUD.tsx`,
`src/components/ui/TurnActionPanel.tsx`, `src/index.css`,
`src/components/dev/CombatHudHarness.tsx` (dev harness mirrors the new composition),
`src/utils/phaseC8_80n.test.ts` (new, 30 tests), and three rebased fixtures
(`phaseC8_79B`, `phaseC8_79C`, `phaseC8_80B`) plus two rebased layout/contract suites
(`phaseC8_74D`, `phaseC8_79A`).

**Rebased, not weakened.** `phaseC8_74D` (landscape chrome) — its selectors follow the
panel out of `.combat-hud`, "one row of five" became "two rows of three" for the 460px
column, the dashboard body and the hidden-surface set were restated, and the "no other
media query mentions the hooks" guard now expects both phone blocks. `phaseC8_79A` — the
"one distance reaches the panel" contract is now stated on DuelScene (the HUD forwards
nothing), the same untouched `currentDistance`, no offset arithmetic. The three `79B/79C/80B`
fixtures simply stopped passing panel props to the HUD (they only assert cue/weapon markup).

## 7. Checks

- focused: `bun test src/utils/phaseC8_80n.test.ts` → **30 pass / 0 fail** (143 expect)
- full suite: `bun test` → **3620 pass / 0 fail (128 files, 92 939 expect)**
- combat script: `bun run scripts/collisionTests.ts` → **123 passed, 0 failed**
- `bun run lint` (`tsc --noEmit`) → exit 0
- `bun run build` → exit 0 (startup asset check, 8 assets)
- `git diff --check` → clean

## 8. Confirmed / not confirmed

**Confirmed by live measurement:** the composition (harness → stage → HUD, panel sibling);
the desktop/tablet layout unchanged (overlay 185/205, panel across the bottom, chronicle
256 wide, dashboard 758, 4-column grid, descriptions visible, log cap 144px); no sideways
scroll at any of the four sizes; zero console errors; every control reachable except the
disabled `Catch Breath`; the landscape panel fits a 347px column with the movement strip
11px clear.

**Not confirmed:** (a) the opponent's clearance in the 400×800 portrait case is **−1px at
the moment of measurement** (the final 6px trim that addresses it is derived, not measured);
(b) any rendered-fighter acceptance — the frames show the arena and two small figures
legibly in portrait and landscape, but this sandbox renders through SwiftShader at a few
frames per second, so "the fighters read as meaningful figures" is a DOM/geometry
conclusion plus a coarse visual check, not a frame-rate or on-device judgement; (c) the
safe-area-inset case (a gesture-bar phone eating the bottom band) — `body` carries the
insets and the duel root is `height:100%` under the phone queries, but no device was
tested; (d) a device narrower than 375px or shorter than 347px in landscape (the panel is a
fixed 460px column there, so a 700px-wide landscape phone leaves a 240px stage).

**Android acceptance: PENDING.** Nothing here is device evidence.
