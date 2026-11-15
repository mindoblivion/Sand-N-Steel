# Colosseum Trial of Endurance — implementation contract

Status: approved concept; implementation not yet landed.

## Purpose

Replace the unimplemented Chapter 5 Northern Trial interaction with a Colosseum-only challenge that earns the existing `story.trialDone` evidence. The challenge is a three-bout endurance series, not a city visit, not Doctore's Test, and not a normal tier-ladder rung.

The public campaign name remains **The Northern Trial**. Its Colosseum presentation name is **Trial of Endurance**.

## Player experience

- The Trial appears on the Tournament board only when the player has reached Chapter 5 and has defeated the Tier-3 ladder boss (Valéria).
- The player enters a three-round series: a disciplined veteran, a hard-hitting bruiser, then an elite arena champion.
- Each round uses the existing pre-fight and duel scene. The series does not introduce a second combat engine.
- A loss or confirmed withdrawal ends the attempt. The player can return and restart the series from round one.
- A technical exit, app interruption, malformed result, or rejected reward settlement cannot advance or complete the Trial.
- The final round victory completes the Trial. A retry after completion is disabled unless a future design explicitly allows exhibitions.

## Progress and settlement contract

- Keep all new persistent state inside the existing optional `StoryProgress` object. Do not add a top-level `PlayerProfile` field or a save migration.
- Add a narrowly scoped optional trial ledger (attempt count, current round, wins/losses, completed) with defensive normalization. Legacy saves without it remain valid.
- Each accepted round victory is recorded in the same authoritative `App.handleMatchComplete` profile transaction as its ordinary bout rewards.
- The trial's opponent rows must be fenced from normal ladder progression, boss-kill accounting, defeated-opponent identity, grudge creation, mercy offers, and Codex identity bookkeeping.
- The Chapter 5 `trial-done` gate continues to read `story.trialDone`; only the final accepted round settlement may set it.
- Do not repurpose `doctoreTestPassed`, `defeatedOpponentIds`, city location visits, or the existing Doctore's Test opponent.
- A loss records the failed attempt but leaves the Trial available. It must not award completion.
- Do not write progress from the card, selection flow, pre-fight modal, result animation, or hub dismissal.

## Technical shape

1. Add a dedicated `trialOfEndurance` data module containing three authored opponent configurations. Keep these rows outside `ALL_OPPONENTS` and outside the standard feature-bout roster.
2. Add pure helpers for normalization, availability, stage lookup, accepted-win settlement, failed-attempt settlement, and completion. Helpers must be identity-stable for no-op/rejected inputs.
3. Add a dedicated Tournament card with clear unlock requirements, three-round structure, current attempt record, and restart behavior.
4. Thread a session-only trial-entry marker through the existing duel entry path. Clear it on every ordinary duel entry, technical hub fallback, result settlement, and app return path.
5. Advance to the next round only after the previous round's accepted reward settlement and explicit result-screen continuation. Do not chain bouts automatically before the player has read the result.
6. On a non-final accepted round win, save the next round before offering the next bout. On loss/withdrawal, save the failed attempt and reset the next attempt to round one.
7. On the final accepted round win, set `trialDone: true` in that same save transaction and present a clear completion line.
8. Preserve the existing Chapter 5 gate semantics and all other pending/non-blocking gates.

## Required regression coverage

- Fresh and legacy saves normalize safely; malformed trial state cannot imply completion.
- Only the correct stage can advance; out-of-order or duplicate settlement is a no-op.
- A round win advances exactly one stage only when gold and fame settlement are accepted.
- Loss and confirmed withdrawal end the attempt and permit a clean restart.
- Technical exit, exhibition, grudge bout, malformed stats, and rejected reward settlement cannot advance or complete the Trial.
- The first two wins do not set `trialDone`; the third accepted win does.
- Save/reload between rounds preserves the correct next round.
- Trial opponents never pollute ladder, boss, grudge, mercy, Codex, or ordinary opponent records.
- Chapter 5 remains blocked until the final accepted win; Chapters 6–7 retain their existing rules.

## Acceptance boundary

Passing unit tests, TypeScript, production build, and existing combat/collision harnesses is source/CI evidence only. Android APK installation, process-kill/relaunch between rounds, safe-area/touch checks, and full three-round playthrough still require physical-device testing. No merge, production signing, Play Console upload, or public release is included.
