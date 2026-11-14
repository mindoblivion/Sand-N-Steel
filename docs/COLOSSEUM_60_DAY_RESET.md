# Sand & Steel — 60-Day Colosseum Reset

**Decision baseline:** 2026-11-14  
**Execution window:** 2026-11-14 through 2027-01-12 (60 calendar days, inclusive)  
**Verified PR base / main commit:** `14b8152bc1e116143bf93545602f72106f2ee638` (2026-11-13)  
**Scope:** Colosseum-only gladiator career release candidate  
**Primary stack:** Three.js + React + Capacitor Android  
**Primary AI development environment:** Google AI Studio  
**Product hook:** Rival Schools — a recurring named champion from a competing gladiator school

This document records the owner's selected direction. It does not authorize destructive repository operations, public release, signing-key changes, or merging the release branch into `main`.

## 1. Product definition

A gladiator career game in which the player fights through a Colosseum ladder, earns rewards and improves their fighter, while a named champion from a rival school repeatedly challenges them, adapts to their fighting style, and becomes the personal climax of the career.

### Core loop

Fight a Colosseum bout → earn gold, fame and progression → improve equipment and prepare → encounter the rival at escalating milestones → compete in the final tournament.

### Rival Schools acceptance

- The rival is a named, recognizable character introduced early in the career.
- The rival returns at planned career milestones; encounters are not random filler.
- Rival encounters are connected to the existing opponent, grudge, story and result-settlement systems wherever those systems satisfy the requirements.
- The game records rivalry outcomes and presents a clear escalation toward a final confrontation.
- Any tactical adaptation is bounded, legible to the player and covered by deterministic tests.
- A completed rivalry has an explicit resolution and cannot accidentally restart through ordinary progression.
- The rival must not require a parallel save or combat-modifier system if existing data structures can support it.

**Important architecture finding:** `src/utils/grudgeBouts.ts` already generates rematches from the opponent roster, reads the existing offensive-mix counter, applies bounded tactical shifts, and settles/closes records through existing duel-result writes. This is a reusable foundation, not proof that the full Rival Schools product hook is already implemented. The current grudge mechanic is generic and tier-based; the new work is the authored recurring rival identity, encounter cadence, narrative escalation and conclusion.

**Colosseum-only campaign blocker:** `src/utils/storyState.ts` currently holds Chapter 2 open on a pending District race gate (`holdsChapterOpen: true`). Later chapters also contain race-dependent gates for the District final, League promotion, Vexus incident race, League top-half and League final. `src/utils/mercyBouts.ts` explicitly states that its Chapter 3 mercy/returning-rival offer is dormant until the race-results write unlocks Chapter 3. Simply hiding racing would therefore strand the campaign and suppress existing rival-story content. Before implementation, map every race gate to a meaningful Colosseum/rival milestone and preserve legacy-save behaviour. The recommended approach is to change gate evidence in the existing derived chapter resolver, not introduce a second campaign progression system.

## 2. Release boundary

### In scope

- Android-first Colosseum career flow.
- Character creation sufficient to begin a career.
- Complete, reliable duel lifecycle.
- Opponent ladder and tournament milestones.
- Rival Schools narrative and progression.
- Gold, fame, equipment and upgrades required by the loop.
- Essential training/recovery only where needed for a coherent career.
- Loading, touch controls, save persistence and mobile performance.
- Audio and arena presentation sufficient to make bouts feel responsive and consequential.

### Deferred from this release

- Circus/chariot racing and its further expansion.
- Full living-city expansion and optional city activities.
- Tavern/gambling systems and unrelated economy expansion.
- Dynasty/inheritance systems.
- Hidden luck/happiness mechanics.
- New large-scale dismemberment or body-simulation systems.
- Broad engine migration or renderer rewrite.

Deferred work is preserved unless separately reviewed. Do not delete existing systems merely because they are outside the first release.

## 3. 60-day milestones

| Window | Milestone | Exit evidence |
|---|---|---|
| Days 1–7 (Nov 14–20) | Baseline and repository stabilization | Confirm main SHA, classify all branches and PRs, preserve valuable unmerged commits, map current Colosseum flow, define one release branch and acceptance checklist. No mass deletion or history rewrite. |
| Days 8–15 (Nov 21–28) | Combat release readiness | Complete source audit and full-duel test plan; verify attack timing, range, stamina, block/dodge, AI tells, victory/defeat, rewards, scene exit and timer cleanup. Fix only reproduced defects. |
| Days 16–23 (Nov 29–Dec 6) | Rival Schools vertical slice | Select an existing roster character or define the smallest new authored rival; implement first introduction, recurring encounter trigger, rivalry record and one meaningful rematch escalation. Add tests for progression and save compatibility. |
| Days 24–32 (Dec 7–15) | Career loop integration | Connect bouts, tournament gates, rewards, gear and preparation into one understandable path. Remove dead-end progression and verify fresh-save and existing-save paths. |
| Days 33–40 (Dec 16–23) | Opening and presentation | Polish first 60 seconds, trainer introduction/tutorial fight, rival reveal, arena staging, crowd/audio feedback and loading transitions. |
| Days 41–49 (Dec 24–Jan 1) | Android performance and device acceptance | Profile on Samsung S24; inspect frame pacing, memory, thermal behaviour, touch controls, safe areas, app lifecycle, offline operation and save/relaunch. Test a lower-cost Android device if available. |
| Days 50–56 (Jan 2–8) | External playtest and fixes | Give a clean APK to at least 10 people unfamiliar with the project where feasible; collect completion, confusion and crash feedback; fix release blockers only. |
| Days 57–60 (Jan 9–12) | Release candidate | Run regression suite, build/install APK, complete fresh-career playthrough, verify save/reload and rival conclusion, record build SHA and known limitations. Release/public distribution remains a separate explicit approval. |

Dates are planning anchors, not claims that the milestones have been completed.

## 4. Repository and integration policy

Target long-lived branches after review:

- `main`: protected stable baseline.
- `release/colosseum-60d`: integrated release candidate.
- `feature/rival-schools`: rivalry implementation.
- `feature/combat-release`: combat corrections and acceptance.
- `feature/android-polish`: Android performance and device fixes.

Do not create all branches before their work is ready. Start by inventorying the existing 316 branches in pages and classifying them:

1. Already merged or exactly superseded.
2. Valuable unmerged work ready to integrate.
3. Valuable work requiring verification.
4. Experimental work to preserve.
5. Abandoned/redundant work.

Before closing or deleting a branch, compare its commits against the verified mainline and preserve unique useful commits. Do not force-push, rewrite history, delete branches in bulk, or merge without the required review/authorization.

## 5. Current baseline evidence (source audit only)

The live PR metadata identifies the `main` base SHA as `14b8152bc1e116143bf93545602f72106f2ee638` (Nov 13, 2026). The master-backlog document contains a stale embedded baseline (`982785f6cc7404c06a0a0aecdcb30937969f2e5e`); it is a document claim, not the live branch tip. Use the live `main` ref again before any implementation branch is cut. The root `package.json` confirms React 19, Vite 6, Three.js 0.174, React Three Fiber 9, and Capacitor 8.6; retain this stack for the reset.

The branch inventory returned 316 pre-existing branches before this reset-plan branch was created; the current count is 317 including this documentation branch. The master backlog reports these implemented/merged candidates, with physical verification still outstanding where stated:

- Shared loading artwork and progress transitions.
- Character creator mobile scroll/layout and preview recovery.
- Duel timer and transient damage-label cleanup coverage.
- City movement/camera input stability and focus-loss cleanup.
- Race touch-input lifecycle fixes.
- Android adaptive launcher icon.
- Procedural Centurion appearance choices.
- Rehearsal Android build/signature workflow.

The backlog also reports initial Android install/launch/city walkaround smoke testing, but full duel, save/restart, background/resume, offline, thermal/memory/performance and broader device acceptance remain open.

Live PR search now returns #451 and #452 as open; both are documentation-only. #452 is this reset-plan PR. No open engineering PR was returned by the current backlog audit.

The current combat audit is not a full gameplay or device sign-off. It explicitly leaves full Android duel acceptance outstanding.

## 6. Definition of done

The release candidate is acceptable only when:

- It installs and launches on Android.
- A new player can create a fighter and understand the first objective.
- A complete duel can be played through victory and defeat without a stuck state.
- Tournament progression, rewards and upgrades work.
- The rival appears at the intended milestones, escalates coherently and reaches a clear conclusion.
- Save data survives app close/relaunch and supported app lifecycle interruptions.
- Touch controls, safe areas and loading transitions work on the target device.
- Sustained gameplay is acceptably responsive; build success alone is not performance evidence.
- At least one clean fresh-save playthrough and one compatible existing-save check are completed.
- Known limitations and the exact tested APK/build SHA are recorded.

## 7. Working rules

1. One scoped change per PR wherever practical.
2. Read-only audit before runtime edits.
3. No speculative refactors or unrelated features.
4. Tests, lint/typecheck and production build are required as appropriate; green CI is not device acceptance.
5. Never claim FPS, visual quality or device success without measurements or direct evidence.
6. Protect save compatibility and final/public-launch data.
7. Do not alter signing credentials or trigger public release as part of ordinary development.
8. Update the master backlog with evidence and status, not optimistic assumptions.
9. If a task is blocked on physical-device access, continue independent safe work and state exactly what remains unverified.
10. Preserve deferred systems and valuable branch work; scope reduction is not destructive deletion.

## 8. Immediate next actions

1. Complete commit-uniqueness classification for the 317 current branches and reconcile every open PR. The five-page branch-name inventory is complete; ancestry/unique-commit classification is not.
2. Reconcile PR #451 and current mainline/backlog status.
3. Map the actual Colosseum entry → bout → result → reward → next-bout flow from source.
4. Map opponent roster, grudge records, story progression and save schema to determine the smallest safe Rival Schools implementation.
5. Produce a prioritized P0/P1 issue list with file paths, acceptance tests and explicit blockers.
6. Only then begin the first runtime implementation PR.

**Status:** plan recorded; no runtime code changed; no branch deleted; no PR merged; no public release action taken.


## 9. Campaign gate mapping — required before Colosseum-only implementation

The current story resolver has more than the single Chapter 2 blocker. Its full gate table must be treated as a campaign contract, not edited by hiding the Circus screen.

| Chapter | Current gate | Current evidence/state | Colosseum-only direction to evaluate (not implemented) |
|---|---|---|---|
| 2 | `district-race` | Pending and explicitly holds Chapter 2 open after the Tier-1 boss and omen | Replace with the first authored Rival School challenge; it must be a real, recorded career milestone. |
| 3 | `district-final` | Pending race gate; Chapter 3 also requires Veteran rank, Tier-2 boss and Library visit | Replace with a later Rival School encounter or a Colosseum tournament qualification milestone. Keep the existing Veteran and Tier-2 boss requirements unless playtesting shows duplication. |
| 4 | `league-promotion` | Pending race gate; the same chapter already checks Tier 3 | Likely redundant for a Colosseum career: evaluate removing the pending gate rather than inventing a second promotion condition. |
| 4 | `vexus-race` | Pending story-beat gate; chapter also requires the dice-ending choice | Re-author as a Rival School escalation beat only if the Vexus race incident is excluded from release. |
| 5 | `league-top-half` | Pending race gate; chapter also requires Champion rank, Tier-3 boss and Northern Trial | Replace with a Colosseum tournament bracket/semi-final result or a defined rival milestone. |
| 6 | `league-final` | Pending race gate; chapter also requires Tier-4 boss and summit visit | Replace with the final Colosseum tournament / Rival Schools confrontation, with one authoritative result record. |

Additional non-race dependencies need an explicit scope decision: Chapter 3 requires `librarySeen`; Chapter 4 requires a `diceEnding`; Chapter 5 requires `trialDone`; Chapter 6 requires `summitSeen`. Chapter 7's statue ceremony is pending but does not currently hold the chapter open. These are not race gates, but if their owning city/story activities are removed from the first release, they can still leave chapters unresolved. Preserve the minimum existing interactions or replace them with equivalent career evidence; do not silently mark them complete.

### Save and resolver constraints

- `resolveStoryState` derives the chapter from existing profile evidence; it does not store a chapter number. Keep that single resolver authoritative.
- `mercyOfferFor` reads the chapter at the time the bout was fought and intentionally starts at Chapter 3. Unlocking Chapter 3 through a Colosseum milestone will activate existing mercy/returning-rival content; add boundary tests for this transition.
- `grudgeBouts.ts` tracks generic ladder rematches by base opponent ID and settles them independently. It does not by itself identify one recurring school champion across multiple career milestones.
- `defeatedOpponentIds` is a set-like history of opponent IDs, so it cannot safely represent repeated wins/losses against one same-ID champion. If the rival needs a multi-encounter record, design one small, version-tolerant optional record and test absent/malformed/legacy saves before adding it.
- Do not change gate IDs, gate copy, story flags, save shape or chapter ordering until the acceptance mapping and compatibility tests are agreed. Current tests explicitly pin the District race gate as the sole pending gate that holds Chapter 2 open and pin mercy dormancy before Chapter 3.

## 10. Branch recovery findings — ancestry, not name-based cleanup

The current branch-name inventory is not a uniqueness audit. Comparisons against current `main` show several historically interesting branches have heavily diverged and must not be merged wholesale:

| Branch | Ahead of main | Behind main | Decision |
|---|---:|---:|---|
| `recovery/integrated-combat-windup` | 131 | 503 | Do not merge; inspect individual commits only if a current defect is reproduced. |
| `fix/duel-adaptive-dpr` | 9 | 407 | Do not merge; first verify whether the current renderer already contains the required cap. |
| `fix/android-input-reset-on-focus-loss` | 2 | 187 | Do not merge; current backlog reports lifecycle fixes already merged. |
| `feat/shared-artwork-loading-transitions` | 21 | 208 | Do not merge; shared loading work is already merged in PR #371. |
| `fix/mobile-character-creator-scroll-mainline` | 1 | 206 | Do not merge; mobile creator fixes are already merged in PRs #375/#376. |
| `fix/native-launcher-icon-branding` | 13 | 225 | Do not merge; approved launcher artwork is reported merged in PR #404. |
| `fix/city-movement-camera-stability` | 4 | 207 | Do not merge; movement stability is reported merged in PR #372. |
| `recovery/android-rehearsal-apk` | 0 | 440 | Historical branch; current mainline is far ahead. |

These counts describe commit ancestry, not whether each old commit contains a unique useful patch. No branch was deleted, rewritten or merged. Further branch cleanup requires per-commit review and preservation of any genuinely unique work.


## 11. Colosseum result-flow audit — current authoritative write

The current source pass identifies `src/App.tsx:handleMatchComplete` as the authoritative duel settlement path. The flow already centralizes the records the career and Rival Schools feature need:

1. Read chapter/story conditions and result-specific lines from the profile as it stood when the bout was fought.
2. Resolve injury and omen settlement; calculate bounty settlement where applicable.
3. Validate gold and fame settlement before applying victory progression.
4. On an accepted victory, award gold/fame/XP and level progression, record the defeated opponent ID (except generated grudge and exhibition exceptions), and write the grudge result in the same profile transaction.
5. Advance `currentTier` only when a tier boss is defeated for the first time; ordinary wins and rematches do not bypass boss progression.
6. On a loss, increment `fightsLost`; a generated grudge loss closes that rematch until a standard win at its tier.
7. Render the result through `DuelResultModal`; the mercy choice is a separate, explicit result-screen action and is eligible only from Chapter 3 onward.

**Rival Schools integration implication:** use this existing result transaction as the single place to record a new rival milestone. Do not write rivalry progress from the pre-fight card, scene selection, result animation, or a second independent save path. Decide whether the new rival encounter is a standard ladder posting, a boss milestone, or a dedicated story bout before implementation: those categories intentionally have different rules for tier advancement, defeated-ID history, grudge generation and mercy eligibility. A same-ID recurring rival cannot rely on `defeatedOpponentIds` alone because the array records first-defeat identity, not a sequence of rematch outcomes.

**Verification status:** source-flow inspection only. No runtime code was changed and no tests, APK, or physical-device playthrough were run during this audit.


## 12. Corrected campaign gate semantics — only one pending race currently blocks

A deeper read of `isClosed()` and the campaign tests corrects the earlier broad shorthand that "race gates" generally block progression:

- **Only Chapter 2's `district-race` gate has `holdsChapterOpen: true`.** Its pending state explicitly blocks closure. This is the release-critical race dependency.
- Chapter 3's `district-final`, Chapter 4's `league-promotion` and `vexus-race`, Chapter 5's `league-top-half`, Chapter 6's `league-final`, and Chapter 7's `statue-ceremony` are pending but do **not** hold their chapters open. The resolver deliberately treats pending gates as non-blocking unless that flag is set.
- Do not add rival requirements to all these later placeholder gates merely because they mention racing. Doing so would invent extra campaign requirements and risk over-gating the Colosseum career.
- The active, evidence-backed requirements in Chapters 3–6 still matter: `librarySeen`, `diceEnding`, `trialDone`, `summitSeen`, rank thresholds, and tier-boss defeats. If any owning activity is removed from the Colosseum release, it needs a deliberate replacement or a scope-preserving route; it must not be auto-completed.

This is pinned by `storyState.test.ts` (§B4–B9) and `storyChapterTwo.test.ts` (§D1–D3). The Chapter 2 race gate is the one pending gate the tests expect to hold the campaign. `mercyBouts.test.ts` also explicitly expects Chapters 0–2 to offer no mercy choice and Chapter 3+ to allow it; the test notes that this is dormant today because the Chapter 2 race hold prevents Chapter 3 from opening.

## 13. Recommended Rival Schools campaign integration — design proposal, not implemented

Keep the existing eight-chapter resolver and its single evidence path. The smallest coherent first-release design is:

1. **Chapter 2 — first Rival Schools challenge.** Replace the *meaning* of the blocking `district-race` gate with an authored first encounter against the rival school's champion. It must be a real, recorded bout result, not a button press or a free completion flag. Keep the existing Tier-1 boss and Fortuna omen requirements.
2. **Chapter 3 — rivalry becomes public.** Once the first challenge closes Chapter 2, the existing Chapter 3 mercy eligibility can activate as designed. Do not make the non-blocking `district-final` placeholder another required rival fight.
3. **Mid-career return — rival escalates at a clear arena milestone.** Trigger a later encounter from a real tier/rank milestone (candidate: Tier 3 / Champion), with authored tactical adaptation and a result record. It can be offered as an optional bout if the player should retain control of the career pace.
4. **Final tournament — rivalry resolution.** Use the existing highest-tier Colosseum/tournament finale as the rival's final authored encounter or final opponent reveal. Do not add a second parallel final boss ladder.

### Record and settlement constraints

- Keep `resolveStoryState` as the only chapter resolver. A rivalry milestone is written in the existing `App.tsx:handleMatchComplete` result transaction, alongside the accepted duel result; it must not be written by the pre-fight card, selection screen, modal animation or a separate storage call.
- Preserve the existing boss-tier rule: only the first defeat of the actual tier boss advances `currentTier`. A Rival Schools feature bout must not accidentally count as a ladder boss unless deliberately authored as the tier boss itself.
- Avoid reusing one opponent ID for every rematch if the career's `defeatedOpponentIds` first-defeat semantics are relied upon. Either give each authored rival stage a stable stage-specific bout ID while keeping the same visible champion identity, or add a small optional `story.rivalry` record that explicitly tracks encounter stage and outcome. Do not infer repeated outcomes from `defeatedOpponentIds`.
- If adding `story.rivalry`, keep it optional and lazy inside the existing `story` object (no new top-level profile field), and test absent, partial, malformed and legacy-save cases. Record both wins and losses only from the accepted result write. Do not let exhibitions, withdrawn/invalid reward settlements or generated grudge bouts advance the authored rivalry.
- Decide whether the first rival challenge is mandatory (the recommended Chapter 2 gate replacement) and whether later returns are optional before coding. The mandatory first bout is a meaningful campaign design choice; do not silently make the whole rival arc optional and leave Chapter 2 blocked.

### Existing activities to preserve or explicitly replace

| Evidence field | Existing owner / evidence | Release handling |
|---|---|---|
| `librarySeen` | Library / Records & Lore, with a story flag in `story` | Preserve the minimal Library visit/record interaction or replace with a Colosseum record-board interaction that writes the same evidence. |
| `diceEnding` | Piso's dice choice, written in `story.diceEnding` by the existing dice-trail flow | Either keep this one small hub interaction or replace with an authored arena-side choice; never silently choose for the player. |
| `trialDone` | Northern Trial story flag | Confirm the current activity is accessible in the intended release; otherwise replace with a Colosseum trial/test that writes the same story evidence. |
| `summitSeen` | Summit visit story flag | Confirm whether the summit scene remains in the release; otherwise replace with a final-arena ceremony/overlook beat. |

The Library chain and Piso's dice choice have explicit owning modules in the current tree. The exact current write paths and in-game accessibility for the Northern Trial and summit still need a focused source/device verification before implementation. The first release can retain a lightweight hub wrapper for these interactions without expanding the whole city.

### Acceptance tests required before the first runtime patch

- Chapter 2 remains open until the first rival challenge has a settled, valid result AND the Tier-1 boss and omen requirements are met.
- A win advances the rival stage exactly once; a loss is recorded and allows a fair retry without duplicating rewards or permanently soft-locking the story.
- Chapter 3 opens after the Chapter 2 requirements are all genuinely met; the existing Chapter 3 mercy-offer rules then activate without a chapter override.
- Legacy saves with no rivalry field load unchanged and receive the first challenge when their actual chapter evidence qualifies them.
- Missing, partial and malformed `story.rivalry` data never throws, fabricates a win, or advances the chapter.
- Generated grudge bouts, exhibitions, invalid reward settlements and unrelated opponents do not write Rival Schools progression.
- Pending later race/ceremony gates remain non-blocking and are not turned into new required fights.
