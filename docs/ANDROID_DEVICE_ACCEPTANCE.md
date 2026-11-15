# Android device acceptance — Colosseum / Rival Schools

Status: **not yet device-tested**. This checklist is the acceptance record for the rehearsal APK built from the exact `feature/rival-schools` commit under test. A green CI run is not a substitute for these checks.

## Candidate identity

Record these values before installation:

- GitHub branch: `feature/rival-schools`
- Commit SHA: exact SHA shown in the successful Android rehearsal workflow's checkout step
- Workflow run URL / run ID:
- Artifact: `rehearsal-aab-do-not-upload`
- APK path inside extracted artifact: `apk/release/app-release.apk`
- Device model:
- Android version / security patch:
- Available storage before install:
- Install date and tester:

Do not test an APK from an older run or assume that a newly green web CI run has created an Android package.

## Installation and launch

- [ ] Confirm workflow completed successfully and artifact belongs to the intended commit SHA.
- [ ] Extract the artifact ZIP and select the APK, not the AAB.
- [ ] Install on a spare/test device if possible.
- [ ] If the same package is already installed with a different signing certificate, Android will reject the update. Back up any needed local data before uninstalling the previous copy; uninstalling can erase local saves.
- [ ] Install and launch from the Android launcher.
- [ ] Confirm app label and launcher icon; capture a screenshot. Record whether the approved two-gladiator icon is actually present.
- [ ] Confirm no blank/white launch flash, stuck splash, immediate crash, or unexpected orientation.
- [ ] Background the app for 30 seconds and resume. Confirm it returns to a usable screen.

## Core Colosseum loop

Use a fresh disposable test profile unless explicitly testing save compatibility.

- [ ] Create a character and complete the initial setup without clipped or unreachable controls.
- [ ] Enter the Colosseum and start an ordinary bout.
- [ ] Verify movement controls respond once per input, with no drift, runaway movement, or stuck directional state.
- [ ] Verify quick/power attacks are unavailable outside weapon range and do not consume stamina or a turn when attempted out of range.
- [ ] Verify attack wind-up is readable and damage does not resolve before the attack's active moment.
- [ ] Verify block and dodge respond as distinct defensive choices.
- [ ] Complete one victory; confirm result screen, reward, progression and return to hub.
- [ ] Complete one defeat; confirm result screen and return to hub without a stuck state.
- [ ] Withdraw/exit through the supported path; confirm no false victory or reward.

## Rival Schools lifecycle

- [ ] Confirm the Rival Schools challenge appears at its intended Chapter 2 milestone and is not mixed into the ordinary tier ladder.
- [ ] Enter the rival bout and confirm correct opponent, pre-fight flow and arena entry.
- [ ] Lose once; confirm one attempt and one loss, with retry available.
- [ ] Close the app from Android's app switcher after returning to a safe screen. Relaunch and confirm the loss record remains.
- [ ] Win the rival bout; confirm exactly one win and completed status.
- [ ] Force-stop the app after the result has been committed. Relaunch and confirm the completed record persists.
- [ ] Start an ordinary duel after the rival bout; confirm it is not misclassified as a rival result.
- [ ] Exit the rival encounter before settlement; confirm no attempt, win or loss is falsely awarded.
- [ ] If Android kills the process mid-bout, confirm the app returns safely on relaunch and does not invent a result. Mid-bout resume is not currently promised.

## Save and interruption checks

- [ ] Change profile state through normal play, fully close the app, relaunch, and confirm the last committed state is restored.
- [ ] Background and resume during hub use.
- [ ] Background and resume during a bout; record whether the timer/input state recovers safely.
- [ ] Force-stop only after a committed result, then relaunch and verify save state.
- [ ] Confirm no repeated rewards after reopening a result or re-entering the hub.
- [ ] Record any save reset, corrupted profile, duplicate reward or stuck loading state.

## Performance and usability

Run at least 15 minutes of continuous play on the primary Samsung test device.

- [ ] Record frame pacing / visible stutter in city-to-arena transitions and combat.
- [ ] Record touch latency, missed inputs, multi-touch conflicts and accidental page scroll.
- [ ] Check safe areas, system bars, cutouts and landscape/portrait behavior on the actual device.
- [ ] Check loading overlay and progress behavior during arena/model transitions.
- [ ] Check heat and battery drain after 15 minutes.
- [ ] Record crashes, WebView reloads, audio dropouts, missing textures/models and memory-related exits.
- [ ] Repeat the basic launch and one-bout flow after the device has been warm for 15 minutes.

## Result and defect record

For each failed item, include:

- Step number:
- Expected behavior:
- Actual behavior:
- Reproduction steps:
- Screenshot or screen recording:
- Android logcat excerpt, if available:
- Severity: blocker / major / minor

## Acceptance decision

- [ ] Install and launch pass.
- [ ] Full ordinary duel lifecycle passes (win, loss, exit).
- [ ] Rival lifecycle passes (loss, retry, win, save/reload, ordinary duel afterward).
- [ ] No duplicate rewards or false outcomes.
- [ ] No release-blocking touch, safe-area, crash or save defect.
- [ ] 15-minute sustained session completed and observations recorded.
- [ ] Tested commit SHA and APK artifact are recorded.

Decision: **not accepted / accepted with listed issues / accepted for release-candidate consideration**.

Acceptance here means only that the tested rehearsal build passed the recorded device checks. It does not authorize public release or Play Console upload. The rehearsal APK is signed with a temporary key and must never be uploaded to Play Console.
