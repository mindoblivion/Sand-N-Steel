# Sand & Steel — Master Development Backlog

> Living project index. Baseline reconciled against `main` at `2f564036ee69195373911eae3b22dd0f849948ec` (2026-11-10).
> This is a source/GitHub audit, not a claim that every feature has been physically tested.
> Update this file as tasks change state. Keep detailed evidence in the linked issues, PRs, and audit documents.

## Completion policy

A task is **not complete** merely because code exists or CI passes. Use these states:

- **Audited** — current implementation and dependencies inspected.
- **Implemented** — scoped code change committed.
- **Automated checks passed** — relevant tests, typecheck/lint, and production build pass.
- **Device/gameplay verified** — required real-device or in-game acceptance evidence recorded.
- **Done** — all acceptance criteria for that task are satisfied, or remaining exclusions are explicitly accepted.

Never report physical-device validation, measured FPS, or visual acceptance without actual evidence. Distinguish confirmed defects from suspected causes. Keep unrelated fixes in separate PRs. Do not merge or release without explicit owner authorization.

## Current active work

| Priority | Work | Current state | Next evidence / action |
|---|---|---|---|
| P0 | Android movement stability — [PR #372](https://github.com/mindoblivion/Sand-N-Steel/pull/372) | Merged to main. Source fix stabilizes camera yaw while moving; physical S24 confirmation remains outstanding. | Test straight/diagonal joystick movement while orbiting, stopping/restarting, and camera collision on Samsung S24. Record result before calling device-verified. |
| P0 | Loading artwork and progress transitions — [PR #371](https://github.com/mindoblivion/Sand-N-Steel/pull/371) | Merged to main. Shared artwork/progress treatment covers scene transitions and character-preview loading/recovery. | Verify artwork, truthful progress/indeterminate state, recovery action, and safe-area spacing during real chunk/GLB loading on Samsung S24. |
| P0 | Android device acceptance — [issue #329](https://github.com/mindoblivion/Sand-N-Steel/issues/329) | Initial install/launch/city walkaround smoke test passed on Samsung device (2026-11-03); remaining acceptance is open. | Record force-close/relaunch save, device restart save, full duel, orientation, background/resume/process recreation, offline play, longer session/thermal/memory/performance, and second-device results if available. |
| P0 | Duel result timer lifecycle — [PR #379](https://github.com/mindoblivion/Sand-N-Steel/pull/379) | Merged to main (`5b7c0fb`). The 1.4-second victory/defeat callback is owned and cancelled on scene unmount; focused timer scheduling/cancellation and scene-wiring tests passed CI. | Verify a full duel, victory/defeat return, and scene-exit timing on Samsung S24. |
| P1 | Roman city layout visual acceptance — [issue #232](https://github.com/mindoblivion/Sand-N-Steel/issues/232) | Source inventory and automated route/footprint checks exist. No broad repositioning justified by current source audit. | Review current landscape captures of Academy/Doctore/Library cluster, west service court, East Circus crossing, doorways, paving and collision clearance. Only change geometry for reproducible defects. |
| P1 | Android app icon — [PR #404](https://github.com/mindoblivion/Sand-N-Steel/pull/404) | Approved two-gladiator artwork is wired into the icon generator on PR #404. Adaptive foreground uses a 4% edge crop and centered 46%-canvas square designed to fit Android's central circular safe zone; both CI gates passed. Not merged, no APK built, and Samsung launcher appearance is not yet verified. | After authorized merge, build a rehearsal APK and inspect the home-screen/app-drawer icon on Samsung S24 for title legibility and adaptive-mask crop. Keep Play Store listing upload separate. |
| P1 | Chariot racing acceptance | Current main implements player horse teams, procedural gait, wheel roll, validated full-lap finish, best-time persistence, a presentation-only rival, and career settlement. PR #354 added a once-per-day completion purse (40/60/80 gold by team size) plus 20 gold for a win; repeated same-day finishes still count but pay no extra purse. Wagers and track incidents remain deferred. | Complete a full physical-device race and collect Samsung S24 frame-time/FPS, draw-call, touch-feel, gait, and thermal measurements with the development-only race profiler APK. No device FPS data is currently recorded. |
| P1 | Character customization | Existing character creation and enemy model architecture audited; modular appearance asset research is recorded in `docs/character-asset-acquisition-audit.md`. | Compare actual shipped creation options against the intended body/skin/hair/build/identity experience; verify model/rig/licence/memory compatibility before acquiring or integrating new assets. |
| P2 | Release readiness | Android release/rehearsal workflow and safeguards are documented in `docs/ANDROID_RELEASE.md`. | Maintain package/signing safeguards, complete acceptance, verify release artifact provenance, and do not trigger public release without explicit authorization. |

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

## Latest mainline reconciliation (2026-11-10)

Main is at `2f564036ee69195373911eae3b22dd0f849948ec`. The following November 10 work is now present on main and should be treated as implemented/automated-check candidates, not device-verified:

- [PR #398](https://github.com/mindoblivion/Sand-N-Steel/pull/398): reset mobile movement/camera input after Android focus loss and lifecycle interruptions.
- [PR #399](https://github.com/mindoblivion/Sand-N-Steel/pull/399): body weight affects city walking speed (140 lb 1.05×, 180 lb 1.00×, 300 lb 0.85×).
- [PR #400](https://github.com/mindoblivion/Sand-N-Steel/pull/400): regression contract for reset-key-scoped 3D boundary recovery.
- [PR #401](https://github.com/mindoblivion/Sand-N-Steel/pull/401): six accessible skin-tone choices for the procedural Centurion; imported GLBs remain excluded pending material-tint verification.
- [PR #402](https://github.com/mindoblivion/Sand-N-Steel/pull/402): reject invalid joystick dead-zone parameters while preserving the default 0.15 dead zone.

The PR #402 environment and main quality gates passed on 2026-11-10. This does not replace Samsung device acceptance.

## Recent merged engineering work

- [PR #371](https://github.com/mindoblivion/Sand-N-Steel/pull/371): shared artwork loading transitions merged.
- [PR #372](https://github.com/mindoblivion/Sand-N-Steel/pull/372): city movement heading stability merged; device acceptance remains open.
- [PR #375](https://github.com/mindoblivion/Sand-N-Steel/pull/375) and [PR #376](https://github.com/mindoblivion/Sand-N-Steel/pull/376): character creator mobile layout/scroll improvements merged.
- [PR #377](https://github.com/mindoblivion/Sand-N-Steel/pull/377): character preview failure recovery merged.
- [PR #378](https://github.com/mindoblivion/Sand-N-Steel/pull/378): duel timer cleanup regression coverage merged.
- [PR #379](https://github.com/mindoblivion/Sand-N-Steel/pull/379): duel result callback cancellation on scene exit merged (`5b7c0fb`).
- [PR #381](https://github.com/mindoblivion/Sand-N-Steel/pull/381): clarified shared loading-backdrop test coverage merged (`bd099c0`).
- [PR #373](https://github.com/mindoblivion/Sand-N-Steel/pull/373): this master backlog and combat audit index merged (`2c6aa93`).

## Open engineering PRs

- [PR #404](https://github.com/mindoblivion/Sand-N-Steel/pull/404): adaptive launcher icon composition and safe-zone regression test; both CI gates passed, pending review and device verification. Continue from the active work table; do not interpret green CI as completion of device acceptance.
- The approved two-gladiator icon artwork is now included in the PR #404 source branch and processed by `scripts/generateIconAssets.cjs`; it is not yet on `main` or in an APK. The owner-selected Colosseum loading artwork remains a separate Library source input and is not claimed as repository/APK content.

## Combat audit status

- [Source audit](docs/COMBAT_SOURCE_AUDIT.md): calculations, HUD gating, attack wind-up, range/stamina handling, defensive stance lifecycle, and existing regression suites inspected at its recorded baseline (`7d211d9`). This predates current main (`3d4d58b`); re-audit combat source before treating the findings as current.
- No new confirmed combat defect was established by this source pass. The historical out-of-range stamina issue is guarded in current source; physical/full-duel acceptance and turn-lifecycle integration coverage remain outstanding.
- Lifecycle follow-up: [PR #379](https://github.com/mindoblivion/Sand-N-Steel/pull/379) merged result-timer ownership and unmount cancellation, with focused schedule/cancel and source-wiring regression tests. Both reported CI gates passed; device/full-duel acceptance remains open.
- Next: complete a full Android duel acceptance run, including victory, defeat, and exiting the duel during pending transitions. Do not rebalance or rewrite combat without reproducible evidence.

## Evidence sources

- [Android release process](docs/ANDROID_RELEASE.md)
- [City transform and route audit](docs/CITY_LAYOUT_AUDIT.md)
- [Character asset acquisition and compatibility audit](docs/character-asset-acquisition-audit.md)
- [Chariot racing implementation audit](.base44/chariot-racing-audit.md)
- [Colosseum rear appearance diagnostic](.base44/colosseum-rear-diagnostic.md)
- [Android race profiler instructions](docs/ANDROID_RACE_PROFILER.md)
- [Racing career settlement](.base44/chariot-racing-audit.md) — current-main status update records PR #354's validated finish settlement, purse limits, and remaining device acceptance.
- [Android acceptance issue #329](https://github.com/mindoblivion/Sand-N-Steel/issues/329)
- [City layout issue #232](https://github.com/mindoblivion/Sand-N-Steel/issues/232)

## Backlog maintenance rules

- Add newly discovered work here with a priority, linked issue/PR, current state, and concrete next verification.
- Keep detailed implementation plans and raw evidence in focused documents or issues; this file is the index, not a duplicate of every technical report.
- Reconcile this index with open GitHub issues/PRs and current CI before each status report.
- Close or mark an item done only when its acceptance evidence exists.
- If a task is blocked on owner/device input, state exactly what evidence is needed and continue with other safe, independent work.
- Prioritize game-breaking defects and core gameplay correctness over cosmetic polish; do not make broad speculative changes.
