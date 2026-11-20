# STATE OF THE GAME

**Snapshot:** 2026-11-20  
**Cleanup baseline:** `v0.1-cleanup` → `b4faedeb92131fd10392989360a850cc310cda8e`  
**Current branch heads:** `main` at `b2d7855aa01ef1e6274ea67ab0589e8f9c4ab192`; `release/colosseum-60d` is divergent (3 commits ahead, 211 behind at this snapshot). `main` is authoritative; do not merge the release branch wholesale.  
**Product target:** *Sand & Steel: Rival of the Arena* — Android-first, Colosseum-only career vertical slice  
**Stack:** React 19, Vite 6, Three.js 0.174, React Three Fiber 9, Capacitor 8.6  
**Primary development environment:** Google AI Studio  
**Verification rule:** CI proves only the checks it actually ran; it does not prove physical-device playability or release readiness.

## What works today

- The React/Vite/Three.js/Capacitor application and production build pipeline are established.
- Character creation uses one fighter/class selection to choose both class mechanics and its mapped 3D model; there is no separate model picker.
- The character preview displays an indeterminate loading cover while a different mapped model becomes ready.
- Rival Schools is implemented as a separate campaign challenge with configurable rival data, result settlement, retry/loss tracking and save-backed completion.
- Trial of Endurance is implemented as a separate three-round challenge with progression and persistence tests.
- Rival and Trial bouts reuse the existing duel and pre-fight flow while remaining separate from ordinary ladder progression and opponent identity records.
- An Android rehearsal workflow exists. Stable rehearsal signing is supported but requires five repository Actions secrets; the temporary-signing mode is test-only and must never be used for Play Store release.
- Repository cleanup completed: 193 branches retired using the audited workflow; 127 branches were retained because they were protected or had unique/unmerged/insufficiently verified history. The annotated `v0.1-cleanup` tag pins the cleanup baseline.

## What's half-done

- **Android release verification:** build a rehearsal APK from the intended current commit, install it, and complete the Samsung device acceptance checklist.
- **Gameplay acceptance:** ordinary duel win/loss/withdrawal, Rival Schools loss/retry/win, Trial progression, save/reload and force-stop behavior still need end-to-end physical-device verification.
- **Movement and touch:** an earlier APK was reported to have erratic movement. Current source and automated checks do not prove target-device behavior is correct.
- **Performance and presentation:** frame pacing, memory, thermal behavior, safe areas, loading transitions, audio and sustained 15-minute play remain device acceptance items.
- **Release process:** no production-signed APK, Play Console upload or public release has been approved or completed.
- **Current CI status:** the cleanup workflow passed. Do not infer that the main quality or environment gates passed on the tagged cleanup commit unless a run for that exact SHA is recorded.

## What's completely broken

- No completely broken core subsystem is currently confirmed by the available evidence. This is not a claim that the game is bug-free.
- Physical-device acceptance is an incomplete release gate, not a confirmed gameplay defect: no completed current-baseline device test record is available.
- Record reported defects with exact build SHA, reproduction steps and evidence before calling them fixed.

## What's cut from scope

Deferred from the 60-day Colosseum release candidate; preserve existing work unless separately reviewed:

- Further Circus/chariot-racing expansion beyond the existing playable racing prototype.
- Full living-city expansion and optional city activities.
- Tavern/gambling systems and unrelated economy expansion.
- Dynasty/inheritance systems.
- Hidden luck/happiness mechanics.
- New large-scale dismemberment or body-simulation systems.
- Broad engine migration or renderer rewrite.

## Rules for future AI coding sessions

1. Read this file and the linked acceptance checklist before proposing or changing code.
2. Treat live `main` and `release/colosseum-60d` refs as authoritative; verify their SHAs rather than trusting historical notes.
3. Do not rebuild, reintroduce or expand cut systems without explicit owner approval.
4. Prefer the smallest evidence-based fix. Audit before editing and add/update tests for changed behavior.
5. Never claim device verification from CI. Record the exact APK commit SHA and physical test results.
6. Preserve the 127 retained branches unless each is individually reviewed; use the audited cleanup workflow for any future retirement. Never force-push or rewrite history.
7. Public release, production signing and Play Console upload require separate explicit approval.

**Primary acceptance record:** [Android device acceptance](ANDROID_DEVICE_ACCEPTANCE.md)  
**Scope and schedule:** [60-day Colosseum reset](COLOSSEUM_60_DAY_RESET.md)


## Current-main reconciliation — 2026-11-20

This section supersedes the 2026-11-15 snapshot statements where they conflict with the current `main` branch. Current main at the start of this reconciliation was `b2d7855aa01ef1e6274ea67ab0589e8f9c4ab192`; the follow-up is documentation-only.

### Mainline status

- PR #453 is merged to `main`. The Colosseum vertical slice includes Rival Schools challenge/result persistence, Chapter 2 evidence integration, Road of Glory and Northern Fortress evidence actions, Trial of Endurance, and unified fighter/class-model selection. Automated checks passed on the merged implementation; a fresh-career end-to-end playthrough on the target Android device remains unverified.
- Ludi Phase A is also present on main: daily calendar/Acta, three daily deeds, Favour, and associated save-backed transactions. Do not assume later-phase gameplay modifiers or Grand Deed/goal tracking exist merely because the Phase A calendar is present.
- The existing chariot-racing prototype remains in main. The release-scope deferral applies to further racing expansion (wagers, incidents and additional career progression), not deletion of the existing implementation.
- The current Android acceptance checklist remains open in issue #329. CI and source-level tests do not replace physical-device verification.

### Branch divergence — action required before using the release branch

At this snapshot, `release/colosseum-60d` compares as **3 commits ahead and 211 commits behind** `main`. Its three unique files are route-clearance tests for East Market, Scholaris paving, and the west service route. The branch is not synchronized with main, despite the earlier snapshot statement. Preserve it; do not merge it wholesale or force-update it. If those three tests remain valuable, port/reconcile them individually against current-main geometry and test helpers.

### Rehearsal signing

Stable rehearsal signing is implemented in the workflow, but issue #458 remains open until the owner configures the five rehearsal-only GitHub Actions secrets and verifies that a later rehearsal APK installs over an earlier one while preserving local saves. Temporary signing remains unsuitable for in-place updates and is never a production release credential.

### Current acceptance boundary

No new Samsung S24 test, measured FPS result, or complete fresh-career playthrough is claimed by this document update. Use issue #329 for Android acceptance evidence and the master backlog for current engineering PR status.
