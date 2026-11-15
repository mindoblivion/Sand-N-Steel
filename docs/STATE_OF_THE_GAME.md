# STATE OF THE GAME

**Snapshot:** 2026-11-15  
**Baseline commit:** `932124e0993ed7dc776d6ba2e06c9ef3618041d1` (update this value whenever the state document is refreshed)  
**Product target:** *Sand & Steel: Rival of the Arena* — Android-first, Colosseum-only career vertical slice  
**Stack:** React 19, Vite 6, Three.js 0.174, React Three Fiber 9, Capacitor 8.6  
**Primary development environment:** Google AI Studio  
**Verification rule:** automated CI proves code/build checks only; it does not prove device playability or release readiness.

## What works today

- The repository's mainline has a passing Environment gate and Main quality gate on the current cleanup baseline.
- The React/Vite/Three.js/Capacitor application builds through the repository's production build pipeline and startup-asset check.
- Character creation uses one fighter/class selection to choose both class mechanics and its mapped 3D model; there is no separate model picker.
- The character preview has a loading cover while a different mapped model becomes ready. Its indicator is indeterminate, not a measured download percentage.
- Rival Schools is implemented as a separate campaign challenge with a configurable rival, result settlement, retry/loss tracking and save-backed completion.
- Trial of Endurance is implemented as a separate three-round challenge with progression and persistence tests.
- Rival and Trial bouts reuse the existing duel and pre-fight flow while being excluded from ordinary ladder progression and standard opponent identity records.
- The Android rehearsal workflow exists and produces a temporarily signed test artifact when manually dispatched.

## What's half-done

- **Android release verification:** a rehearsal APK must be built from the exact baseline commit and installed. The currently documented Samsung device acceptance checklist is not completed.
- **Gameplay acceptance:** full ordinary duel win/loss/withdrawal, Rival Schools loss/retry/win, Trial progression, save/reload and force-stop behavior have not been verified end-to-end on a physical device.
- **Movement and touch:** an earlier APK was reported to have erratic movement. Current source/CI checks are not proof that this is fixed on the target Samsung device.
- **Performance and presentation:** frame pacing, memory, thermal behavior, safe areas, loading transitions, audio and sustained 15-minute play remain device acceptance items.
- **Repository hygiene:** the open PR queue is empty and a dedicated release branch exists, but the repository still has 320 branches. They have not been individually classified for safe retirement.
- **Release process:** no production-signed APK, Play Console upload or public release has been approved or completed.

## What's completely broken

- **No currently verified, completely broken core subsystem is established by the available automated evidence.** Do not interpret this as proof that the game is bug-free.
- **Physical-device acceptance is currently a failing/not-run release gate**, not a confirmed gameplay defect: there is no completed current-baseline device test record.
- Any defect reported by a tester must be recorded with exact build SHA, reproduction steps and evidence before being called fixed.

## What's cut from scope

Deferred from the 60-day Colosseum release candidate; preserve existing work unless separately reviewed:
- Circus and chariot racing expansion.
- Full living-city expansion and optional city activities.
- Tavern/gambling systems and unrelated economy expansion.
- Dynasty/inheritance systems.
- Hidden luck/happiness mechanics.
- New large-scale dismemberment or body-simulation systems.
- Broad engine migration or renderer rewrite.

## Rules for future AI coding sessions

1. Read this file and the linked acceptance checklist before proposing or changing code.
2. Treat the current `main`/release baseline as authoritative; inspect live Git state rather than trusting old branch notes or stale commit hashes in historical documents.
3. Do not rebuild, reintroduce or expand cut systems without explicit owner approval.
4. Prefer the smallest evidence-based fix. Audit before editing; add or update tests for the behavior changed.
5. Do not claim device verification from CI. Record exact APK commit SHA and physical test results.
6. Preserve unique branch work. Never bulk-delete branches, force-push, rewrite history or delete unreviewed work.
7. Public release, production signing and Play Console upload require separate explicit approval.

**Primary acceptance record:** [Android device acceptance](docs/ANDROID_DEVICE_ACCEPTANCE.md)  
**Scope and schedule:** [60-day Colosseum reset](docs/COLOSSEUM_60_DAY_RESET.md)
