# C-8.80P — short-viewport and desktop duel composition

Status: implemented and measured (2026-10-24). Layout only: **no camera, combat, canvas, timing,
damage, stamina, AI, movement, reach, spawn or save value changed**. No commit, push, merge or
deployment was performed.

## 1. Preflight (measured)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at start | `da48328c8e35527563c6758fe834f152b02c68c9` |
| Working tree at start | `git status --porcelain` empty; `git diff --check` clean |
| Dev stack | `app-web-1` (oven/bun:1, Vite), `Up 2 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl localhost:3000/` → `200` |
| Records read | C-8.80O (§10 conclusions), C-8.80N (composition + measured contract), AGENTS.md's duel-composition and C-8.74D-A sections |

**Environment note (not an app defect):** `src/index.css` is governed by the repo-root `AGENTS.md`,
which is **847 KB**. The dedicated file tools deliver it to a write in bounded batches and refuse the
write until all of it has arrived (five batches, ~190 KB, without completing), so the CSS and test edits
were applied with assertion-checked in-place scripts instead — each patch asserted the exact anchor
count before writing, and every change is visible in `git diff`.

## 2. What was measured before the change

Real duel, same-origin `<iframe>` at exact CSS sizes, harness banner collapsed, canvas settled
(`canvas.height === stage.height`). Projection uses the rig's own constants (midpoint, `baseDist` 8.5,
`baseHeight` 5.2, `lookAt` y 1.2, vertical fov 45), the spawn offsets ±1.8 and a 1.10-tall body; it
reproduces C-8.80N's eight recorded fractions to the decimal (opening opponent 42.63-53.34%, player
63.30-77.01%; close 46.55-57.91% / 56.63-69.51%). The R3F camera is not reachable from the page
(`canvas.__r3f` is not exposed), so the renderer-observed cross-check is the captured frame, below.

**Panel geometry with an empty and a full chronicle** (HUD harness, real components):

| viewport | stage (full log) | top HUD ends | panel empty | panel cap | opponent head (cap) | clearance (cap) |
| --- | --- | --- | --- | --- | --- | --- |
| **375x667** | 247 | 155.5 | 403 | **420** | 105.3 | **−50.2** |
| **400x720** | 300 | 155.5 | 403 | **420** | 127.9 | **−27.6** |
| **400x740** | 320 | 155.5 | 403 | 420 | 136.4 | **−19.1** |
| **400x760** | 340 | 155.5 | 403 | 420 | 144.9 | **−10.6** |
| **400x800** | 380 | 155.5 | 403 | 420 | 162.0 | **+6.5** |
| **1280x800** | 800 (overlay) | 206.5 | 355 | 355 | 341.0 | +134.5 |

So the short-portrait defect is confirmed at every required size below ~784px tall, and the measured
break-even (panel cap, 155.5 HUD) is `stage ≥ 364.8` → **viewport ≥ 784.8px**.

**Desktop occlusion, confirmed and located.** The stage is the full 800px; the panel occupies
**445-800**; the player projects to **506-616** and the opponent to 341-427. The **player** is behind the
panel for its entire height and the opponent is not — which is exactly the report. The cause is
structural, not a stray offset: the player's feet sit at **77.01%** of the stage, so a bottom panel would
have to end at ≤184px to clear them. The panel measured **355px**, of which the tactic dashboard is
**319px** (banner 34 + grid 198 + strip 35 + gaps 10 + padding 24) — the 4-column grid wraps five cards
into two 95px rows. Stacking alone is therefore insufficient: the stage would be 445px and the
opponent's head would land at 189.7px, **16.8px behind** the 206.5px HUD.

## 3. What shipped (three rules, all in `src/index.css`)

1. **Portrait chrome**, inside the existing `(max-width: 520px) and (orientation: portrait)` block:
   `.chronicle-range { display: none }` (the range row is the strike tiles' own "Out of range — Advance
   to strike" text; short landscape already drops it), card/log/dashboard/grid gaps and paddings
   tightened, log cap `3rem → 2.25rem` (same five-entry slice, same scroll container), panel bottom
   padding `0.5rem → 0.375rem`. **Panel 420 → 338px.** The movement strip's own top padding tightens;
   its buttons stay untouched at 46px.
2. **New `@media (max-height: 720px)`** hiding only `.combat-hud .hype-meter` — the lowest 29.5px of the
   top block, which is precisely what sits over the opponent's head. **HUD 155.5 → 122px.** Hyped state
   is still reported by the chronicle's events and the crowd's reactions; every other readout and control
   stays. This generalizes the short-landscape block's own meter rule rather than inventing a new one.
3. **New `@media (min-width: 1024px) and (min-height: 521px)`**: the two regions **stack** (stage
   `flex: 1 1 auto`, panel `flex: 0 0 auto`, no overlay), the tactic grid becomes **five columns in one
   row** (cards 140px at 1280, every blurb, cost, hit chance and damage intact, no clipping), the
   dashboard's padding/gaps tighten, and the top chrome compacts (vital card padding, health 0.75rem,
   stamina 0.375rem, meter padding). **Panel 355 → 267px; HUD 206.5 → 188.5px.** The gate is disjoint
   from the 520px-tall landscape row block, so 812x375 is untouched.

`DuelScene.tsx`'s composition comment was updated (it still claimed desktop kept the overlay).

## 4. Measured after (real duel, banner collapsed, canvas settled)

| viewport | stage | panel | top HUD ends | opponent head | clearance | player head-feet | feet above panel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **375x667** | 334 | 333 | 122 | 142.4 | **+20.4** | 211.4-257.2 | +76.8 |
| **400x720** | 387 | 333 | 122 | 165.0 | **+43.0** | 245.0-298.0 | +89.0 |
| **400x740** | 407 | 333 | 155.5 | 173.5 | **+18.0** | 257.6-313.4 | +93.6 |
| **400x760** | 427 | 333 | 155.5 | 182.0 | **+26.5** | 270.3-328.8 | +98.2 |
| **400x800** | 467 | 333 | 155.5 | 199.1 | **+43.6** | 295.6-359.6 | +107.4 |
| **1024x768** | 488.5 | 279.5 | 186.5 | 208.2 | **+21.7** | 309.2-376.2 | +112.3 |
| **1280x800** | 533 | 267 | 186.5 | 227.2 | **+40.7** | 337.4-410.5 | **+122.5** |
| **812x375** (unchanged row) | 352x375 | 375 column | 119.8 | 159.9 | **+40.1** | 237.4-288.8 | +86.2 |

With the chronicle at its 2.25rem cap (the state a live fight reaches, panel 338) the worst cases are
**+40.8 at 400x720**, **+18.3 at 375x667**, **+15.9 at 400x740**, +24.4 at 760, +32.9 at 780, +41.5 at
800 and +38.7 at 1280x800. Every number is positive; no control was hit-tested as covered at any size,
and `scrollWidth === clientWidth` everywhere (no sideways overflow).

**Driven close range at 400x720** (the real Advance control, found by its `title`): `DIST: 3.6m` →
**`DIST: 1.8m`**. The stage at that moment was 394.3px, giving opponent 183.5-228.3 and player
223.3-274 — both inside the stage, 61.5px below the HUD and 120.3px above the panel.
**Controls at 400x720:** 12 of 13 hit-test at their own centres; the one miss is `Catch Breath`, which
is `pointer-events-none` while disabled at full stamina (pre-existing, and it enables once stamina is
spent). Tactic tiles: three enabled at the opening (Shield Guard / Dodge / Taunt — the two strikes are out
of range), zero during the opponent's resolution turn.

## 5. Implementation decision (why this and not the alternatives)

- **Portrait, five-across tactics: measured and rejected.** A 5-column grid at 400px wide makes 68.8px
  cards and **all five clip** their text (the "Out of range — Advance to strike" hint needs four lines).
  A 3-column grid gives 183px against the 2-column 186px — no gain, because the cards grow to 89px. The
  space is in padding, gaps and the redundant range row, not in the column count.
- **Portrait, hiding the chronicle or the crowd meter at 740-800px: rejected.** Both cost visible
  information the brief requires (history) or that fits (the meter at 760+ clears by 26.5px). Only the
  ≤720 tier, where the stage genuinely cannot carry it, drops the meter.
- **Desktop, camera or a shorter overlay: rejected outright** — camera math is out of scope, and no
  bottom overlay can clear a 77% foot line at 800px tall.
- **Desktop, a right-hand panel column (as short landscape uses): rejected** because it moves the panel
  out of the established desktop hierarchy, which the brief asks to preserve. Stacking keeps the panel
  across the bottom, full width, chronicle left and dashboard right — exactly the shipped arrangement,
  just no longer on top of the arena.

## 6. Files changed

| file | change |
| --- | --- |
| `src/index.css` | portrait chrome budget, the `max-height: 720px` meter tier, the wide composition block |
| `src/components/duel/DuelScene.tsx` | composition comment only (it claimed desktop kept the overlay) |
| `src/utils/phaseC8_80n.test.ts` | **rebased**: measured table (panel 338 / 267, HUD 155.5 / 188.5), portrait log cap 2.25rem, "desktop keeps the old overlay" → "overlay is the default; the wide block stacks", the portrait block no longer banned from naming `tactic-grid` (only `grid-template-columns`) |
| `src/utils/phaseC8_74D.test.ts` | **rebased**: §C's per-block guards name three responsive blocks instead of two |
| `src/utils/phaseC8_80p.test.ts` | **new**, 33 tests / 216 assertions |
| `AGENTS.md`, this record | documentation |

No assertion was weakened. The two rebases are the same contract restated against the new layout: what
`phaseC8_74D` protects is "no tactic hook rule lives outside a responsive block", and the wide block is
now one of them; what `phaseC8_80n` protects is "both fighters are inside the unobscured stage", and its
table now uses the post-fix panel heights.

## 7. Checks (dev container, after the last edit)

| check | result |
| --- | --- |
| `bun test src/utils/phaseC8_80p.test.ts` | **33 pass / 0 fail**, 216 `expect()` |
| `bun test src/utils/phaseC8_{74D,80n,79A,79B,79C,80B}.test.ts` | **123 pass / 0 fail**, 565 `expect()` |
| `bun test` | **3653 pass / 0 fail**, 129 files, 93 162 `expect()` |
| `bun run scripts/collisionTests.ts` | **123 passed, 0 failed** |
| `bun run lint` (`tsc --noEmit`) | exit 0 |
| `bun run build` | exit 0 |
| `git diff --check` | clean |

## 8. Confirmed / not confirmed

**Confirmed by live measurement** (real duel, banner collapsed, canvas settled): the short-portrait
defect at 667/720/740/760 (opponent's head −50.2 / −27.6 / −19.1 / −10.6 relative to the HUD), the desktop
player occlusion (panel 445-800 against the player's 506-616), and every post-fix clearance in §4; the
panel's content-sizing (333 one line / 338 at the cap); the driven `3.6m → 1.8m` Advance and its
close-range bands; 12/13 controls hit-tested at 400x720 with the single miss being the disabled
`Catch Breath`; no sideways overflow at any of the eight sizes; no card clipping in portrait or wide.

**Confirmed by capture, coarsely:** frames at 400x720, 400x760 and 1280x800 show the arena with **both
gladiators in view** and the panel below them — the sandbox renders through SwiftShader at a few frames
per second, so this is a legible-frame read, not a frame-rate or device judgement. The 400x720 frame also
shows the intended consequence of the ≤720 tier: **no CROWD FAVOR meter** (it returns at 400x760).

**Not confirmed:** (a) how the arrangement *reads* on a real GPU — SwiftShader again; (b) safe-area
insets (they probe 0 inside this harness; the rules that carry them are unchanged and unmeasured);
(c) viewports **768-1023px wide**, which still use the overlay default and can still hide the player at
short heights — measured as out of this phase's scope, not fixed, and recorded here so the next phase
starts from it; (d) any cue/opponent overlap during the player's 700ms wind-up (unchanged by this phase,
and C-8.80O already recorded it).

**Android acceptance: PENDING.** Nothing in this phase is device evidence. The device questions are:
does the 400x7xx portrait layout read with two visible fighters and a usable panel; does the ≤720 crowd
meter's absence feel like a loss; and does the desktop stack read as the same hierarchy the panel had
before (bottom panel, chronicle left, five tactic cards in one row).
