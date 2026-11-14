# Sand & Steel — 60-Day Colosseum Reset

**Decision baseline:** 2026-11-14  
**Execution window:** 2026-11-14 through 2027-01-12 (60 calendar days, inclusive)  
**Base commit:** `14b8152bc1e116143bf93545602f72106f2ee638`  
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

At the reset baseline, repository `main` is `14b8152bc1e116143bf93545602f72106f2ee638` (Nov 13, 2026). The root `package.json` confirms React 19, Vite 6, Three.js 0.174, React Three Fiber 9, and Capacitor 8.6; retain this stack for the reset.

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

Open PR #451 at the audit time is documentation-only and reconciles the backlog after #450. The backlog's earlier statement that no engineering PRs were open is consistent with that classification; recheck live PR status before integration.

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
