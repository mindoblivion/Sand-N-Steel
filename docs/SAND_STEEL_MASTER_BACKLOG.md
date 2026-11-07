# Sand & Steel — Master Development Backlog

> Living project index. Baseline captured from `main` at `7d211d96e226b88130356f9cdefbb28856f39f6b`.
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
| P0 | Android movement stability — [PR #372](https://github.com/mindoblivion/Sand-N-Steel/pull/372) | Implementation committed; Main quality gate and Environment gate passed on head `5879d625`; PR open, unmerged. Cause is plausible, not yet device-confirmed. | Install a build containing the PR and test straight/diagonal joystick movement while orbiting, stopping/restarting, and camera collision on Samsung S24. Record result before calling fixed. |
| P0 | Loading artwork and progress transitions — [PR #371](https://github.com/mindoblivion/Sand-N-Steel/pull/371) | Implementation committed; Main quality gate and Environment gate passed on head `0544dd0b`; PR open, unmerged. Recovery action spacing was adjusted above the safe-area-aware progress bar. | Verify artwork, truthful progress/indeterminate state, recovery action, and safe-area spacing during real chunk/GLB loading on Samsung S24. |
| P0 | Android device acceptance — [issue #329](https://github.com/mindoblivion/Sand-N-Steel/issues/329) | Initial install/launch/city walkaround smoke test passed on Samsung device (2026-11-03); remaining acceptance is open. | Record force-close/relaunch save, device restart save, full duel, orientation, background/resume/process recreation, offline play, longer session/thermal/memory/performance, and second-device results if available. |
| P1 | Roman city layout visual acceptance — [issue #232](https://github.com/mindoblivion/Sand-N-Steel/issues/232) | Source inventory and automated route/footprint checks exist. No broad repositioning justified by current source audit. | Review current landscape captures of Academy/Doctore/Library cluster, west service court, East Circus crossing, doorways, paving and collision clearance. Only change geometry for reproducible defects. |
| P1 | Android app icon | Selected two-gladiator Sand & Steel artwork is known; current committed launcher/PWA artwork was previously audited as the older gladius/laurel design. | Replace Android adaptive/legacy and PWA icon assets together, update icon tests, build APK, and verify launcher appearance. Play Store listing icon is a separate Play Console upload. Original image binary transfer into GitHub remains a tooling constraint; do not substitute an approximation and claim it is the supplied art. |
| P1 | Chariot racing acceptance | Source audit says horse teams, procedural gait, wheel roll, lap/finish timing, best-time persistence and presentation-only rival are implemented on main. Wagers, incidents and reward progression are not established as shipped. | Re-audit current main implementation, then collect physical-device visual/performance measurements using the development-only race profiler APK. No device FPS data is currently recorded. |
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

## Evidence sources

- [Android release process](docs/ANDROID_RELEASE.md)
- [City transform and route audit](docs/CITY_LAYOUT_AUDIT.md)
- [Character asset acquisition and compatibility audit](docs/character-asset-acquisition-audit.md)
- [Chariot racing implementation audit](.base44/chariot-racing-audit.md)
- [Colosseum rear appearance diagnostic](.base44/colosseum-rear-diagnostic.md)
- [Android race profiler instructions](docs/ANDROID_RACE_PROFILER.md)
- [Android acceptance issue #329](https://github.com/mindoblivion/Sand-N-Steel/issues/329)
- [City layout issue #232](https://github.com/mindoblivion/Sand-N-Steel/issues/232)

## Backlog maintenance rules

- Add newly discovered work here with a priority, linked issue/PR, current state, and concrete next verification.
- Keep detailed implementation plans and raw evidence in focused documents or issues; this file is the index, not a duplicate of every technical report.
- Reconcile this index with open GitHub issues/PRs and current CI before each status report.
- Close or mark an item done only when its acceptance evidence exists.
- If a task is blocked on owner/device input, state exactly what evidence is needed and continue with other safe, independent work.
- Prioritize game-breaking defects and core gameplay correctness over cosmetic polish; do not make broad speculative changes.
