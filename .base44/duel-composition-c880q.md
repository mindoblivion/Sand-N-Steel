# C-8.80Q — intermediate-width duel composition (768–1023px)

Status: implemented and measured (2026-10-24). Layout only: **no camera, spawn, combat,
timing, damage, stamina, AI, movement, reach or save value changed.** No commit, push,
merge or deployment was performed.

## 1. Preflight (measured)

| Item | Value |
| --- | --- |
| Repository root | `/app` |
| Branch | `development-focus-strategy` |
| HEAD at start | `5f1a5ebf959bd6b1d52d1a90c3b313acb669a17e` |
| Working tree at start | `git status --porcelain` empty; `git diff --check` clean |
| Dev stack | `app-web-1` (oven/bun:1, Vite), `Up 2 days (healthy)`, `0.0.0.0:3000->3000/tcp` |
| Web entry | `curl localhost:3000/` → `200` |
| Records read | C-8.80P (§3 shipped rules, §4 measured table, §8 open items), C-8.80N/O conclusions, AGENTS.md's duel-composition sections |

The C-8.80P record's own open item (c) is what this phase starts from: *"viewports
768-1023px wide, which still use the overlay default and can still hide the player at
short heights."*

## 2. The measurement method

Real components (`CombatHUD` + `TurnActionPanel`) driven through the shipped
`?devHarness=hud` harness mounted in a **same-origin `<iframe>` at exact CSS sizes** — an
iframe is its own media-query viewport, so every size is measured without a reload and
without the 3D arena (SwiftShader renders it at a few frames per second). Chronicle held
at its five-entry cap (`logs=5`); each frame settled on two animation frames plus a
250 ms pause before reading. All coordinates are CSS pixels.

Fighter body bounds are projected from the rig's own constants — `baseDist` 8.5,
`baseHeight` 5.2, `lookAt` y 1.2, vertical fov 45 — with the `duelGeometry` spawn offsets
(±1.8) and a 1.10 m body. Because three.js treats `fov` as **vertical**, the projected
fractions of the canvas height do not depend on width, which is what makes one table
valid across the band. Re-derived here and matching C-8.80N's eight recorded fractions to
the decimal:

| state | opponent head | opponent feet | player head | player feet |
| --- | --- | --- | --- | --- |
| opening (3.6 m) | 42.63% | 53.34% | 63.30% | 77.01% |
| one Advance (1.8 m) | 46.55% | 57.91% | 56.63% | 69.51% |

**Distinguish:** the DOM geometry below is measured; the fighter bands are the rig's
projection, not a renderer read. The R3F camera is not exposed (`canvas.__r3f` absent),
so no phase has been able to read the live camera matrix from the page.

## 3. Measured BEFORE (the shipped overlay)

| viewport | stage | panel | panel top | top HUD ends | player's feet | feet behind panel | cards clipped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **768×1024** | 1024 | 451.5 | 572.5 | 206.5 | 788.6 | **−216.1** | 0 |
| **800×1024** | 1024 | 451.5 | 572.5 | 206.5 | 788.6 | **−216.1** | 0 |
| **900×800** | 800 | 437.5 | 362.5 | 206.5 | 616.1 | **−253.6** | 0 |
| **960×800** | 800 | 395 | 405 | 206.5 | 616.1 | **−211.1** | 0 |
| **1023×768** | 768 | 375 | 393 | 206.5 | 591.4 | **−198.4** | 0 |

The opponent stayed clear at every size (+120.9 … +230.0) — this is the *player*
occlusion, exactly the desktop finding of C-8.80P, and it is structural: the player's feet
sit at 77.01% of the canvas, so a bottom overlay would have to stop at 23% of the viewport
height. The 375–451.5px panel height comes from the 4-column grid wrapping five cards into
two rows of ~145px cards (blurbs visible). No sideways overflow at any size; all 13
controls hit-tested at their own centres.

## 4. What shipped (two rules, both in `src/index.css`)

1. **The stacked composition's gate moves from 1024px to 768px**
   (`@media (min-width: 768px) and (min-height: 521px)`), declarations unchanged
   byte-for-byte — the diff touches only the query line and its comment. Stacked, the
   stage is `viewport − panel`, so the foot line is always inside it and the only remaining
   constraint is the opponent's head against the top HUD.
2. **A narrow tier, `(min-width: 768px) and (max-width: 879px) and (min-height: 521px)`**:
   the tactic blurb is dropped (the rule portrait and short landscape already use — name,
   stamina cost, hit chance and damage stay) and the cards' own `div.flex` label/value rows
   wrap instead of colliding (`flex-wrap: wrap; row-gap: 1px`).

**Why the tier exists (measured).** With the wide rules alone at 768×1024, five cards
across the 728px panel are **82.4px** each and every card clipped horizontally
(`scrollWidth > clientWidth`) by 5, 7, 19, 7 and 11px — the offending rows are
"Shield Guard" beside "NO COST" (89px intrinsic) and "82% Absorb" beside "SP on block".
Clipping disappears at **880px** wide (cards 104.8px), so the tier stops at 879.

## 5. Measured AFTER

**Gate only** (the real stylesheet, before the tier was added):

| viewport | stage | panel | opponent clears HUD by | player's feet above panel |
| --- | --- | --- | --- | --- |
| 768×1024 | 718 | 306 | +117.6 | +165.1 |
| 800×1024 | 718 | 306 | +117.6 | +165.1 |
| 900×800 | 519 | 281 | +32.7 | +119.3 |
| 960×800 | 520.5 | 279.5 | +33.4 | +119.7 |
| 1023×768 | 488.5 | 279.5 | +19.7 | +112.3 |

**With the narrow tier** (identical declarations injected into the same measuring iframe):

| viewport | stage | panel | opponent clears HUD by | feet above panel | cards clipped |
| --- | --- | --- | --- | --- | --- |
| **768×1024** | 753.5 | 270.5 | **+132.7** | +173.2 | **0** |
| **768×768** (inside the gate, not required) | 497.5 | 270.5 | **+23.6** | +114.4 | 0 |
| **800×1024** | 757 | 267 | **+134.2** | +174 | 0 |
| **800×800** | 533 | 267 | **+38.7** | +122.5 | 0 |
| **850×800** | 533 | 267 | **+38.7** | +122.5 | 0 |
| **879×768** | 501 | 267 | **+25.1** | +115.2 | 0 |
| **880×800** (tier ends; blurb back) | 519 | 281 | +32.7 | +119.3 | 0 |
| **900×800** | 519 | 281 | +32.7 | +119.3 | 0 |
| **1023×768** | 488.5 | 279.5 | +19.7 | +112.3 | 0 |
| **1024×768** | 488.5 | 279.5 | +19.7 | +112.3 | 0 |
| **1280×800** | 533 | 267 | +38.7 | +122.5 | 0 |

Close range (one Advance, opponent head 46.55% / player feet 69.51%) is strictly safer
than the opening bands at every size, so no size was re-driven for it here; the opening
numbers above are the worst case.

**Regression controls, unchanged** (their blocks are disjoint from the new gate — portrait
is `max-width: 520px`, short landscape is `max-height: 520px`):

| viewport | mode | stage | top HUD | opponent clears HUD by |
| --- | --- | --- | --- | --- |
| 375×667 | portrait column | 329 | 122 | +18.3 |
| 400×720 | portrait column | 382 | 122 | +40.8 |
| 812×375 | landscape row | 375 (full height, 347 wide) | 119.8 | +40.1 |

Every control hit-tested at its own centre (13 of 13, including the movement strip), no
sideways overflow (`scrollWidth === clientWidth`) and no vertical overflow at any size.

## 6. The bounded band (explicitly NOT fixed)

**521–767px wide** keeps the overlay default. It was not measured this phase and no rule
changed there. The same arithmetic predicts the same defect (at 600px wide the grid falls
back to `grid-cols-2`, three rows of cards), but that is a prediction, not a measurement.
Recorded for the next phase rather than changed, per this phase's scope.

## 7. Files changed

| file | change |
| --- | --- |
| `src/index.css` | the wide gate 1024 → 768 (declarations untouched) + the new narrow tier |
| `src/utils/phaseC8_80q.test.ts` | **new**, 23 tests / 95 assertions |
| `src/utils/phaseC8_74D.test.ts` | **rebased**: §C's guards name four responsive blocks (`NARROW` added to the strip list and to the hook-order expectation) |
| `src/utils/phaseC8_80n.test.ts` | **rebased**: `WIDE` constant 768, and the comment that said "tablet-width still gets the overlay" |
| `src/utils/phaseC8_80p.test.ts` | **rebased**: `WIDE` constant 768 |
| `AGENTS.md`, this record | documentation |

No assertion was weakened; the three rebases are the same contract restated against a gate
that now starts at 768px.

## 8. Checks (dev container, after the last edit)

| check | result |
| --- | --- |
| `bun test src/utils/phaseC8_80q.test.ts` | **23 pass / 0 fail**, 95 `expect()` |
| `bun test` on the 8 layout/combat suites (80q, 80p, 80n, 74D, 79A, 79B, 79C, 80B) | **179 pass / 0 fail**, 876 `expect()` |
| `bun test` (full suite) | **3676 pass / 0 fail**, 130 files, 93 257 `expect()` |
| `bun run scripts/collisionTests.ts` | **123 passed, 0 failed** |
| `bun run lint` (`tsc --noEmit`) | exit **0**, no output |
| `bun run build` | exit **0**, startup asset check passed |
| `git diff --check` | clean (exit 0) |
| `curl 'localhost:3000/src/index.css?direct'` | serves both new queries (compiles) |

## 9. Confirmed / unverified / device-pending

**Confirmed by live measurement:** the pre-change defect at all five required widths (the
player's feet 198.4–253.6px behind the overlay panel); the gate change measured on the real
stylesheet at those five widths; the narrow tier's declarations measured in the same
harness (identical selectors and values) with zero card clipping and panel 267–270.5px; the
880px boundary where clipping ends; the three accepted phone sizes and the 1024/1280
desktop sizes unchanged.

**Not re-measured after the edit:** the geometry of the *shipped* stylesheet as compiled by
the dev server. This turn's preview-verification budget was spent on the probes above, so
the file was not re-driven once the tier was written into `src/index.css`. The evidence is
that the shipped declarations are byte-identical to the ones measured (enforced by
`phaseC8_80q`), that the dev server serves them, and that the accepted sizes' declarations
are untouched (the diff touches only the query line). A single confirming sweep of the five
required sizes is the outstanding check.

**Not confirmed:** (a) how the 82.4px cards *read* at 768px wide — every string fits and
nothing clips, but type this narrow has not been judged on a screen; (b) safe-area insets
(they probe 0 inside this harness, and the rules carrying them are unchanged);
(c) the bounded 521–767px band, per §6.

**Android acceptance: PENDING.** No device was involved. The device questions are: does the
five-across row at 768–879 read as usable cards with the blurb gone and the two label/value
rows stacked, and does the stacked stage/panel composition feel right on a tablet in both
orientations.
