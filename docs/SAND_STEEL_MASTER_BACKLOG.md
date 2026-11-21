# Sand & Steel — Master Development Backlog

> Living project index. Baseline reconciled against `main` at `fc7ac45ed1b988de2db61d88c114c7f2d53cdbdc` (2026-11-21).
> This is a source/GitHub audit, not a claim that every feature has been physically tested.
> Update this file as tasks change state. Keep detailed evidence in the linked issues, PRs, and audit documents.

## Completion policy

A task is **not complete** merely because code exists or CI passes. Use these states:

- **Audited** — current implementation and dependencies inspected.
- **Implemented** — scoped code change committed.
- **Automated checks passed** — relevant tests, typecheck/lint, and production build pass.
- **Device/gameplay verified** — required real-device or in-game acceptance evidence recorded.
- **Done** — all acceptance criteria for that task are satisfied, or remaining exclusions are explicitly accepted.

Never report physical-device validation, measured FPS, or visual acceptance without actual evidence. Distinguish confirmed defects from suspected causes. Keep unrelated fixes in separate PRs. Merge only after required checks and acceptance boundaries are satisfied; public release still requires explicit owner authorization.

## Current active work

| Priority | Work | Current state | Next evidence / action |
|---|---|---|---|
| P0 | Android movement stability — [PR #372](https://github.com/mindoblivion/Sand-N-Steel/pull/372), [PR #411](https://github.com/mindoblivion/Sand-N-Steel/pull/411) | Merged to main (#372, #411, #449). Camera yaw stability and focus-loss/full-screen-scene clearing of held touch/keyboard movement inputs are implemented with regression coverage; physical S24 confirmation remains outstanding. | Test straight/diagonal joystick movement while orbiting, stopping/restarting, camera collision, and hold movement → background app → resume to confirm the gladiator remains stationary on Samsung S24. |
| P0 | Loading artwork and progress transitions — [PR #371](https://github.com/mindoblivion/Sand-N-Steel/pull/371) | Merged to main. Shared artwork/progress treatment covers scene transitions and character-preview loading/recovery. | Verify artwork, truthful progress/indeterminate state, recovery action, and safe-area spacing during real chunk/GLB loading on Samsung S24. |
| P0 | Ferrum beastmaster retreat — [PR #536](https://github.com/mindoblivion/Sand-N-Steel/pull/536) | Rerender-safe retreat target and heading fix with regression coverage. Re-synced to current `main` at `38a108c`; 7 commits ahead / 0 behind, only three Ferrum files differ. Fresh Main quality and Environment gates are running on head `c19106a`. | After fresh CI passes, verify turn direction, retreat distance, ground contact, Run-to-Idle transition, and normal victory/result settlement on Samsung S24 before merge. |
| P1 | Rival chariot drivers — [PR #532](https://github.com/mindoblivion/Sand-N-Steel/pull/532) | Deterministic per-rival driving, overtaking windows, rig separation, and driven finish settlement merged to `main`; automated driver soak and simulation pass gate recorded in PR. Live browser/Samsung visual behaviour and device CPU remain unverified. | Test staggered starts, passing/defence, horse and wheel gait continuity, ground contact, finish order, and device performance with the development profiler on Samsung S24. |
| P0 | Loading artwork file integrity — [PR #496](https://github.com/mindoblivion/Sand-N-Steel/pull/496) | Signature validator correctly rejects the mislabeled JPEG assets. Genuine WebP/PNG replacements are verified and packaged in `colosseum-loading-upload.zip` (archive SHA-256 `06380d9c89b7f3fdc5ec2b6a93d06852f67c56cd534c971113fdc1e97a2ee674`), but not committed. PR #496 is 1 ahead / 209 behind current `main` and must not be merged. | Commit the verified artwork binaries and reapply the validator change on current `main`; retain strict validation, remove lower-cover masking only after the clean artwork is present, and rerun both CI gates. |
| P0 | Android device acceptance — [issue #329](https://github.com/mindoblivion/Sand-N-Steel/issues/329) | Initial install/launch/city walkaround smoke test passed on Samsung device (2026-11-03); remaining acceptance is open. PR #538 adds development-only unexpected-displacement telemetry and a dedicated profiler APK; no newer S24 result is recorded. | Install the current movement-profiler APK and exercise joystick directions/diagonals, camera drag/release, obstacles, panels/input locks, and background/resume. Paste the copied diagnostic snapshot if movement jumps or drifts. Continue save, arena, orientation, offline, long-session, creator, loading, skin-tone, weight, icon and race acceptance. |
| P0 | Race touch-input reliability — [PR #438](https://github.com/mindoblivion/Sand-N-Steel/pull/438), [PR #440](https://github.com/mindoblivion/Sand-N-Steel/pull/440), [PR #445](https://github.com/mindoblivion/Sand-N-Steel/pull/445) | Pointer capture, simultaneous/opposing hold arbitration, blur/background release, and settings-freeze release/disabled controls are merged to main (#438, #440, #445); all required CI gates and the development APK build passed. Physical S24 acceptance is outstanding. | Verify two-finger throttle/steer, opposing-direction release restoration, settings open/close while held, app background/resume, and confirm all inputs stop immediately on Samsung S24. |
| P0 | Duel result timer lifecycle — [PR #379](https://github.com/mindoblivion/Sand-N-Steel/pull/379) | Merged to main (`5b7c0fb`). The 1.4-second victory/defeat callback is owned and cancelled on scene unmount; focused timer scheduling/cancellation and scene-wiring tests passed CI. | Verify a full duel, victory/defeat return, and scene-exit timing on Samsung S24. |
| P1 | Roman city layout visual acceptance — [issue #232](https://github.com/mindoblivion/Sand-N-Steel/issues/232) | Source inventory and automated route/footprint checks exist. No broad repositioning justified by current source audit. | Review current landscape captures of Academy/Doctore/Library cluster, west service court, East Circus crossing, doorways, paving and collision clearance. Only change geometry for reproducible defects. |
| P1 | Android app icon — [PR #404](https://github.com/mindoblivion/Sand-N-Steel/pull/404) | Merged to main in commit `4b618a70a5648207ee3d1f97ecec3c6cb409e2e3`; adaptive foreground uses a safe-zone composition for Android masks. Rehearsal APK now includes the merged icon source, but Samsung launcher appearance is not yet verified. | Inspect home-screen/app-drawer icon on Samsung S24 for title legibility and adaptive-mask crop. Keep Play Store listing upload separate. |
| P1 | Chariot racing acceptance | Current main implements player horse teams, procedural gait, wheel roll, validated full-lap finish, best-time persistence, a presentation-only rival, and career settlement. PR #354 added a once-per-day completion purse (40/60/80 gold by team size) plus 20 gold for a win; repeated same-day finishes still count but pay no extra purse. Wagers and track incidents remain deferred. | Complete a full physical-device race and collect Samsung S24 frame-time/FPS, draw-call, touch-feel, gait, and thermal measurements with the development-only race profiler APK. No device FPS data is currently recorded. |
| P1 | Character customization — [PR #401](https://github.com/mindoblivion/Sand-N-Steel/pull/401), [PR #413](https://github.com/mindoblivion/Sand-N-Steel/pull/413) | Procedural Centurion now has six skin-tone choices plus six tunic and six crest color choices, all gated to that model; selected appearance is wired into preview/save. Regression coverage restores the body-flaw/no-flaw layout assertions. Imported GLBs remain intentionally untinted because each uses a single atlas material with no region masks. Automated checks pass; Samsung visual verification remains outstanding. | On S24, verify all 18 appearance choices update the Centurion preview and persist after save/reopen; confirm other GLB models do not show the procedural-only controls. Revisit GLB recoloring only after proper material masks/texture authoring are available. |
| P2 | Release readiness | Android release/rehearsal workflow and safeguards are documented in `docs/ANDROID_RELEASE.md`. | Maintain package/signing safeguards, complete acceptance, verify release artifact provenance, and do not trigger public release without explicit authorization. |

## Status reconciliation — 2026-11-21

The live status table above supersedes older historical notes below where their PR numbers or mainline SHAs differ. PR #532 superseded the retired rival-clock work in #528 and is merged. PR #536 and #538 have both been re-synchronized with current `main` at `38a108c`; they are each 7 commits ahead / 1 behind (the only intervening commit is this documentation update), with only their intended gameplay/diagnostic files differing. Fresh CI is running on both updated heads. PR #496 is 209 commits behind current `main`; its verified clean artwork package is prepared, but the binaries must be committed and the validator reapplied on a fresh branch before merge.

## System workstreams

These are the standing areas to audit against the live implementation. Items not yet backed by current source evidence remain **audit required**, not automatically missing features.

1. **Living Roman city** — districts, street hierarchy, buildings/interiors, entrances, NPCs, day/night, city activities, route connectivity, collision/visual alignment.
2. **Gladiator combat** — movement, camera, input, attack timing, stamina, block/dodge, opponent telegraphs/AI, weapons, animation, damage/injury presentation, complete duel loop.
3. **Character and progression** — creation, identity/body appearance, archetypes, equipment, stats, XP, skills, injuries, persistent development.
4. **Colosseum and events** — arena access, opponent roster, tournament progression, boss encounters, crowd response, fame and rewards.
5. **Circus and chariot racing** — race entry, controls/physics, horse gait/team, track/laps/finish, rival behaviour, progression/rewards, performance.
6. **Economy and activities** — merchants, inventory/equipment, training, tavern, gambling mechanics, shrines, healing, contracts and city interactions.
7. **Android and performance** — launcher icon, loading transitions, touch controls, safe areas, app lifecycle, save persistence, offline operation, frame-time/memory/thermal behaviour.
8. **Quality and release** — automated regression coverage, device acceptance, accessibility/usability, dependency/security review, rehearsal APK/AAB, store assets and release sign-off.

## Latest mainline reconciliation (2026-11-13)

Main is at `14b8152bc1e116143bf93545602f72106f2ee638` (2026-11-13). The following November 10–13 work is present on main and should be treated as implemented/automated-check candidates, not device-verified:

- [PR #398](https://github.com/mindoblivion/Sand-N-Steel/pull/398): reset mobile movement/camera input after Android focus loss and lifecycle interruptions.
- [PR #399](https://github.com/mindoblivion/Sand-N-Steel/pull/399): body weight affects city walking speed (140 lb 1.05×, 180 lb 1.00×, 300 lb 0.85×).
- [PR #400](https://github.com/mindoblivion/Sand-N-Steel/pull/400): regression contract for reset-key-scoped 3D boundary recovery.
- [PR #401](https://github.com/mindoblivion/Sand-N-Steel/pull/401): six accessible skin-tone choices for the procedural Centurion; imported GLBs remain excluded pending material-tint verification.
- [PR #402](https://github.com/mindoblivion/Sand-N-Steel/pull/402): reject invalid joystick dead-zone parameters while preserving the default 0.15 dead zone.
- [PR #413](https://github.com/mindoblivion/Sand-N-Steel/pull/413): restore body-flaw/no-flaw mobile layout assertions and align the skin-tone regression assertion with the live accessible picker label; both CI gates, typecheck, collision/combat harnesses, production build and startup asset check passed. The PR is test-only and makes no runtime changes.

The PR #402 environment and main quality gates passed on 2026-11-10. This does not replace Samsung device acceptance.

A follow-up movement-direction proposal, [PR #405](https://github.com/mindoblivion/Sand-N-Steel/pull/405), was closed without merging after rechecking the actual `CityCamera` default yaw (`Math.PI`). The proposed replacement basis would have reversed horizontal movement at the default camera orientation. No movement code from #405 reached `main`; keep the existing #372 movement implementation unchanged unless a reproducible device issue and correct camera-coordinate evidence justify a new fix.

## Recent merged engineering work

- [PR #371](https://github.com/mindoblivion/Sand-N-Steel/pull/371): shared artwork loading transitions merged.
- [PR #372](https://github.com/mindoblivion/Sand-N-Steel/pull/372): city movement heading stability merged; device acceptance remains open.
- [PR #375](https://github.com/mindoblivion/Sand-N-Steel/pull/375) and [PR #376](https://github.com/mindoblivion/Sand-N-Steel/pull/376): character creator mobile layout/scroll improvements merged.
- [PR #377](https://github.com/mindoblivion/Sand-N-Steel/pull/377): character preview failure recovery merged.
- [PR #378](https://github.com/mindoblivion/Sand-N-Steel/pull/378): duel timer cleanup regression coverage merged.
- [PR #379](https://github.com/mindoblivion/Sand-N-Steel/pull/379): duel result callback cancellation on scene exit merged (`5b7c0fb`).
- [PR #381](https://github.com/mindoblivion/Sand-N-Steel/pull/381): clarified shared loading-backdrop test coverage merged (`bd099c0`).
- [PR #404](https://github.com/mindoblivion/Sand-N-Steel/pull/404): adaptive launcher icon composition merged (`4b618a7`).
- [PR #406](https://github.com/mindoblivion/Sand-N-Steel/pull/406): rehearsal Gradle wrapper invocation fixed; rehearsal APK/AAB build, signature verification, artifact upload, and signing-material cleanup passed in run [42979733177](https://github.com/mindoblivion/Sand-N-Steel/actions/runs/42979733177).
- [PR #407](https://github.com/mindoblivion/Sand-N-Steel/pull/407): master backlog reconciliation merged (`ca98950`).
- [PR #408](https://github.com/mindoblivion/Sand-N-Steel/pull/408): corrected backlog mainline baseline and merged (`9144040`).
- [PR #409](https://github.com/mindoblivion/Sand-N-Steel/pull/409): tracked and cancelled floating damage-number timeouts on duel scene exit; regression test and both CI gates passed; merged (`57748d0`).
- [PR #410](https://github.com/mindoblivion/Sand-N-Steel/pull/410): reconciled the backlog after PR #409 and corrected the mainline baseline (`ea254ad`).
- [PR #411](https://github.com/mindoblivion/Sand-N-Steel/pull/411): clear held keyboard movement state alongside touch input on blur/hidden visibility; focused regression test and both CI gates passed; merged (`13469d5`).
- [PR #413](https://github.com/mindoblivion/Sand-N-Steel/pull/413): restored the character creator's body-flaw/no-flaw regression assertions and corrected a stale skin-tone accessibility-label expectation; test-only change merged (`01b8581`).
- [PR #414](https://github.com/mindoblivion/Sand-N-Steel/pull/414): reconciled the master backlog after character appearance Phase 1; documentation-only.
- [PR #415](https://github.com/mindoblivion/Sand-N-Steel/pull/415): pinned the attack-windup timer's unmount cleanup in the duel pacing regression suite; test-only change merged (`6ec94a6`).
- [PR #416](https://github.com/mindoblivion/Sand-N-Steel/pull/416): refreshed the combat lifecycle source audit and reconciled the backlog; documentation-only.
- [PR #435](https://github.com/mindoblivion/Sand-N-Steel/pull/435): added the Gladiator Academy interior.
- [PR #438](https://github.com/mindoblivion/Sand-N-Steel/pull/438): added pointer-captured race holds and correct opposing steering/throttle arbitration; both main quality and environment gates passed.
- [PR #440](https://github.com/mindoblivion/Sand-N-Steel/pull/440): added race touch-input reset on blur/background; merged as part of the #438 race-control integration.
- [PR #441](https://github.com/mindoblivion/Sand-N-Steel/pull/441): added duel terminal-turn regression guards; both CI gates passed.
- [PR #443](https://github.com/mindoblivion/Sand-N-Steel/pull/443): releases Academy movement input on focus loss/background; both CI gates passed.
- [PR #445](https://github.com/mindoblivion/Sand-N-Steel/pull/445): releases and disables all race touch controls while settings freeze the race; main quality, environment, and development profiler APK workflows passed.
- [PR #447](https://github.com/mindoblivion/Sand-N-Steel/pull/447): added current-main regression coverage ensuring Centurion skin/tunic/crest appearance pickers remain gated to the procedural model; both CI gates passed.
- [PR #449](https://github.com/mindoblivion/Sand-N-Steel/pull/449): clears held city keyboard/touch input whenever a city panel or full-screen presented scene locks movement; focused regression and both CI gates passed; merged (`df239f2`).
- [PR #450](https://github.com/mindoblivion/Sand-N-Steel/pull/450): reconciled the backlog after #449 and recorded the #439 closure/device-acceptance distinction; documentation-only, both CI gates passed; merged (`14b8152`).
- [PR #446](https://github.com/mindoblivion/Sand-N-Steel/pull/446): reconciled this backlog after race input lifecycle work and corrected the active queue; documentation-only, merged (`982785f`).
- [PR #406](https://github.com/mindoblivion/Sand-N-Steel/pull/406): rehearsal Gradle wrapper invocation fixed; rehearsal build, APK/AAB signature verification, artifact upload, and signing-material cleanup all passed in workflow run [42979733177](https://github.com/mindoblivion/Sand-N-Steel/actions/runs/42979733177). Artifact `rehearsal-aab-do-not-upload` contains an installable rehearsal APK and expires 2026-11-18. Its AAB is signed with a throwaway key and must never be uploaded to Play Store.
- [PR #373](https://github.com/mindoblivion/Sand-N-Steel/pull/373): this master backlog and combat audit index merged (`2c6aa93`).

## Open engineering PRs

The following scoped PRs are open and intentionally remain draft because their remaining acceptance cannot be established by source tests or CI:

- **[PR #496](https://github.com/mindoblivion/Sand-N-Steel/pull/496) — startup image signature validation:** intentionally fails both production-build workflows because `public/colosseum_loading.webp` and `public/colosseum_loading.png` contain JPEG bytes, not the formats declared by their extensions. A clean user-provided WebP has been recovered and byte-verified (1536×864, 409,044 bytes, SHA-256 `bf7d31df887b4894f99de529cf0a44db40a4d46ac312ba0d8386ef9f480a0f58`), but it is not committed. Do not weaken the validator or merge until genuine WebP/PNG assets and copied `dist/` assets pass both build workflows.
- **[PR #528](https://github.com/mindoblivion/Sand-N-Steel/pull/528) — staggered rival race clocks:** rebased onto main `af4ca8e`. Main quality gate run #797 (`44726408373`), Environment gate run #1294 (`44726408367`), and development-only race-profiler APK run #38 (`44726408341`) passed on head `2cd6869173ffe249ffde692cfd20048245a80ae6`. Keep draft pending visual/Samsung acceptance of staggered roll starts, roll-to-lap handoff, horse/wheel gait continuity, ground contact and finish order. The APK artifact is not a release build and expires 2026-11-27.
- **[PR #529](https://github.com/mindoblivion/Sand-N-Steel/pull/529) — Ferrum visible retreat:** rebased onto main `af4ca8e`. Main quality gate run #798 (`44726413629`) and Environment gate run #1295 (`44726413573`) passed on head `c671e69ac24987ab9b46a8fec1e7d8a4fc923818`. Keep draft pending arena/Samsung verification of the turn, retreat direction/distance, ground contact and Run-to-Idle transition.

Superseded PRs #515/#516 and their earlier rebases #523/#524 are closed; #528/#529 are the current-main replacements.

Do not interpret green CI as completion of device or visual acceptance.

**Artwork status (reconciled 2026-11-20):** PR #404's approved two-gladiator launcher icon artwork is merged and its Android/PWA icon resources are generated from the approved source. The separate Colosseum loading artwork is wired into the boot shell, `WaitSurface`, and `AssetLoadingOverlay`, with live measured progress or an indeterminate sweep. However, the committed `public/colosseum_loading.png` and `public/colosseum_loading.webp` files currently contain JPEG bytes despite their extensions; PR #496 adds a signature check and intentionally blocks production builds until this is corrected. A clean 1536×864 WebP source has been recovered and byte-verified, but it is not yet committed. Keep the lower cover over the artwork's baked-in label/bar until the genuine clean background is shipped. Samsung S24 visual/safe-area verification remains outstanding.

## Combat audit status

- The historical [source audit](docs/COMBAT_SOURCE_AUDIT.md) is a dated snapshot, not a current-main verdict. Its timer and combat findings must not be copied forward without checking current source.
- Current main contains dedicated tests for attack wind-up ordering, turn-resolution handoff, terminal-match guards, opponent AI timer ownership, and cleanup of duel timers on unmount (PRs #379 and #409). These include source-wiring checks; they do not simulate or prove a complete live duel.
- The previously reported out-of-range stamina/turn-consumption issue is guarded in current source. No new confirmed combat defect was established in the 2026-11-20 source pass.
- Remaining acceptance is a complete Android duel: victory, defeat, range boundaries, defensive actions/telegraphs, and exiting during pending transitions. Do not rebalance or rewrite combat without reproducible evidence.

## Evidence sources

- [Android release process](docs/ANDROID_RELEASE.md)
- [City transform and route audit](docs/CITY_LAYOUT_AUDIT.md)
- [Character asset acquisition and compatibility audit](docs/character-asset-acquisition-audit.md)
- [Chariot racing implementation audit](docs/engineering-audits/chariot-racing-audit.md)
- [Colosseum rear appearance diagnostic](docs/engineering-audits/colosseum-rear-diagnostic.md)
- [Android race profiler instructions](docs/ANDROID_RACE_PROFILER.md)
- [Racing career settlement](docs/engineering-audits/chariot-racing-audit.md) — current-main status update records PR #354's validated finish settlement, purse limits, and remaining device acceptance.
- [Android acceptance issue #329](https://github.com/mindoblivion/Sand-N-Steel/issues/329)
- [City layout acceptance issue #456](https://github.com/mindoblivion/Sand-N-Steel/issues/456)

## Backlog maintenance rules

- Add newly discovered work here with a priority, linked issue/PR, current state, and concrete next verification.
- Keep detailed implementation plans and raw evidence in focused documents or issues; this file is the index, not a duplicate of every technical report.
- Reconcile this index with open GitHub issues/PRs and current CI before each status report.
- Close or mark an item done only when its acceptance evidence exists.
- If a task is blocked on owner/device input, state exactly what evidence is needed and continue with other safe, independent work.
- Prioritize game-breaking defects and core gameplay correctness over cosmetic polish; do not make broad speculative changes.


## Mainline reconciliation — 2026-11-19

Main is now at `51d853c639aabbd1ca4607c1ebbdfcd385d7eafb`. Recent merged work since the prior 2026-11-13 baseline:

- **PR #485:** compact portrait city HUD; Samsung safe-area and visual verification remain open in issue #329.
- **PRs #487–#489:** Bounty Hall and Tavern paving approaches plus city survey reconciliation; source-level route/clearance checks pass, rendered walk-through remains open in issue #456.
- **PR #490:** loading progress uses the loader's active state and avoids presenting stale completion as active progress.
- **PRs #491 and #495:** body weight now affects attack stamina cost and city stride speed using the existing weight profile; no weapon lock was introduced. Gameplay feel and directional control still require device acceptance.
- **PR #493:** loading overlay hides when idle and retains its completion fade.
- **PR #494:** active/error loading states render immediately rather than waiting for an effect.

### Current blockers and acceptance boundaries

- The clean Colosseum loading artwork is not yet present in the GitHub repository in its verified WebP form. The committed files are JPEG bytes with PNG/WebP names. Keep the dark lower cover in `AssetLoadingOverlay` and `WaitSurface` until the correct clean artwork is committed and inspected; it masks baked-in artwork text/bar. Do not claim the clean progress-bar artwork is integrated.
- Samsung S24 initial launch/city smoke test remains successful, but the remaining device checklist in issue #329 is not complete. This includes save persistence, arena duel, lifecycle/orientation, offline, creator/loading visuals, skin swatches, input release, weight feel, launcher icon, and longer-session performance.
- The city geometry/collider tests are not a substitute for rendered paving review and physical route traversal (issue #456).
- Rehearsal signing infrastructure is merged, but stable in-place APK updates still depend on the owner configuring the five rehearsal-only GitHub Actions secrets and completing the install-over-existing-app/save-preservation check (issue #458).

Do not treat green CI as device acceptance. Keep source-level fixes scoped, and continue with independent auditable work while external artwork or device evidence is pending.

## Mainline reconciliation — 2026-11-20

Main is at `79657dbbd8f8667d620db5591159bdf93284a4c2` after the LADDER-1B rolling-start / multi-rival field merge (PR #514). The current open work is tracked above; PRs #515 and #516 are clean ports/fixes based on this mainline, not candidates for automatic merge because both require rendered acceptance.

### Current acceptance boundaries

- **Movement:** source audit found no confirmed defect in the current joystick/camera/collision path. Do not alter movement direction or camera basis speculatively. Samsung reproduction is needed to isolate joystick input, camera orbit, collision response and animation.
- **Racing:** staggered rival clocks and finish-time comparisons are covered by deterministic regression tests and CI. Horse/wheel animation, ground contact and actual race feel remain device/visual acceptance.
- **Ferrum retreat:** behavior and scene visibility are source-tested; rendered turn, travel, terrain contact and animation transition remain device/visual acceptance.
- **Loading artwork:** the clean background is recovered and byte-verified but is not committed. The current loading components already provide measured progress when available, an indeterminate sweep otherwise, safe-area placement, recovery and fade behavior. Preserve the dark lower cover until a genuine clean artwork asset is shipped; then remove the cover in both `AssetLoadingOverlay` and `WaitSurface` without disturbing the live progress UI.
- **Combat:** current main includes dedicated turn pacing, attack-windup, resolution/AI timer cleanup and terminal-turn source-wiring tests. These tests do not replace a full duel. Samsung acceptance still needs a complete bout, weapon-range boundary checks, block/dodge, telegraphs/counters, defeat/victory and scene exit during pending transitions.
- **Android acceptance:** issue #329 remains the evidence ledger for persistence, offline play, lifecycle/orientation, creator/loading visuals, skin swatches, input release, weight feel, launcher icon and longer-session performance. No new physical-device test is claimed in this reconciliation.

Continue with bounded, independently tested work while external device evidence is pending. Never report visual correctness, measured FPS or device acceptance without actual observation.


## Mainline reconciliation — 2026-11-20 (after PRs #517–#518)

Main advanced from `79657dbbd8f8667d620db5591159bdf93284a4c2` to `7c5e52636c2d2e4ce326ef80318250a5e3fe4246` after the backlog reconciliation (#517) and the artwork/combat status correction (#518). The three open engineering PRs remain based on this current mainline:

- [PR #515](https://github.com/mindoblivion/Sand-N-Steel/pull/515): race rival clocks; quality, environment, and race-profiler APK workflows passed on its head. Device/visual acceptance remains required.
- [PR #516](https://github.com/mindoblivion/Sand-N-Steel/pull/516): Ferrum visible retreat; quality and environment workflows passed on its head. Arena/device visual acceptance remains required.
- [PR #496](https://github.com/mindoblivion/Sand-N-Steel/pull/496): startup image signature validation; both workflows intentionally fail while the committed loading-image files contain JPEG bytes under PNG/WebP extensions. Keep blocked until genuine assets are committed and both workflows pass.

PR #492 is closed as superseded by #516. The movement source audit still has no confirmed defect; do not alter the camera/movement basis without a reproducible Samsung symptom. The remaining device acceptance is tracked in issue #329, and city route rendering/walkability acceptance remains in issue #456.

This reconciliation updates the baseline only. It does not change implementation status or claim new device testing.


## Mainline reconciliation — 2026-11-20 (after PRs #519–#522)

Main advanced to `6efe2b39d7c332a3b4160645feb91402650b8b30` after PR #522 reconciled the handoff baseline. The state-of-game snapshot and this backlog now share the same mainline baseline.

- [PR #523](https://github.com/mindoblivion/Sand-N-Steel/pull/523) carries the race rival-clock fix directly on current main; its main quality, environment, and race-profiler APK workflows passed on the exact head. It remains draft pending visual/Samsung acceptance.
- [PR #524](https://github.com/mindoblivion/Sand-N-Steel/pull/524) carries Ferrum's visible retreat directly on current main; its main quality and environment workflows passed on the exact head. It remains draft pending arena/Samsung visual acceptance.
- [PR #496](https://github.com/mindoblivion/Sand-N-Steel/pull/496) remains open/draft and intentionally blocks production builds until genuine WebP/PNG loading assets are committed and signature validation passes. Do not weaken the validator.
- Superseded PRs #515 and #516 are closed. Issue #329 remains the Android device acceptance ledger.

No new device or visual acceptance is claimed by this documentation update.


## Mainline reconciliation — after PR #530 (2026-11-20)

Main advanced from `af4ca8e551947781ef0e0104bce68207c1103e0d` to `d10eacb0668121c1cc9d9fa708a5278180a7dcf3` when PR #530 merged. The merged change reconciles the active PR references and evidence in this backlog; it changes documentation only and does not alter runtime code.

- PR #530 head `de415827c7124d68439ae23b10d64e5a5677f2fc`: Main quality gate #799 and Environment gate #1296 both passed before merge.
- Current open engineering PRs as of 2026-11-21: #538 (city unexpected-displacement diagnostics), #536 (Ferrum retreat persistence), and #496 (loading-image signature validation). PR #532 is merged; #528 and #529 are closed as superseded.
- #528 and #529 are current-main rebases with passing automated gates; keep them draft pending visual/Samsung acceptance.
- #496 remains intentionally blocked until genuine WebP/PNG binaries replace the mislabeled JPEG-byte assets. Do not weaken signature validation.

This update records the post-merge baseline only. It does not claim new device, visual, or gameplay acceptance.
