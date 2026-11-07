# Gladiator Combat — Source Audit

> Audit baseline: `main` at `7d211d96e226b88130356f9cdefbb28856f39f6b`.
> Scope: source-level inspection only. This is not a full-playthrough or Android device sign-off.

## Findings

### Confirmed implementation present

- Combat calculations are centralized in `src/utils/combatCalculations.ts`: weapon range and stamina costs, hit chance, damage mitigation, critical multiplier, stamina regeneration, rage activation and combo-event handling.
- `TurnActionPanel.tsx` uses the shared calculation helpers for displayed hit chance, damage estimates, weapon range and stamina costs. It disables quick/power strikes while out of range or below the displayed stamina cost.
- `DuelScene.tsx` owns turn resolution. Ordinary attacks begin an attack animation and defer stamina/hit/damage resolution until `ATTACK_WINDUP_MS` has elapsed.
- The attack-resolution branch independently checks weapon range. For a player strike dispatched outside range, stamina is not deducted; it logs OUT OF RANGE and records a missed-out-of-reach result. The HUD normally prevents this dispatch.
- Block and dodge stances are cleared when that fighter next acts, allowing the opponent's intervening attack to interact with the stance.
- Combat timing has a dedicated regression suite (`duelTurnPacing.test.ts`); counter-windup sequencing has a dedicated state-machine/source-wiring suite (`counterWindup.test.ts`); the calculation layer has `scripts/combatTests.ts`.
- Boss-specific mechanics are represented in data and have dedicated coverage, including boss phase/presentation suites.

## No new confirmed defect from this source pass

The earlier out-of-range stamina complaint is guarded in the current source: a player strike beyond weapon reach does not deduct stamina. The action panel also disables the strike. A direct/stale dispatch still enters turn resolution and reports the miss; no change is proposed without evidence that normal gameplay can reach that path.

This audit does **not** establish that combat is bug-free. Source inspection and unit tests cannot verify animation timing on device, touch reliability, AI difficulty, readable telegraphs, or whether a full duel can be completed without a stuck state.

## Remaining combat acceptance work

1. Play a complete standard duel from entry through victory/defeat and result return.
2. Test quick and power attacks at just inside, exactly at, and just outside each weapon's effective range.
3. Verify stamina deductions, insufficient-stamina prevention, recovery, and no-cost out-of-range handling.
4. Verify block and dodge persist through the opponent's response, mitigate/evade correctly, then clear when the player acts.
5. Verify telegraphed heavy attacks and counter windows are visually readable and resolve only once.
6. Exercise every shipped opponent/boss mechanic at least once, prioritizing counter-dodge, rage, weapon-switch and heavy-telegraph behaviours.
7. Confirm damage, hit-stop, animation active frames, defeat handling and rewards remain synchronized.
8. Repeat on the Samsung S24 and record the build SHA, device/Android version, reproduction steps and result.

## Next engineering step

Add or strengthen integration-level tests around the full turn lifecycle, especially the interaction among wind-up timers, turn ownership, match termination/unmount cleanup, and the opponent response. Keep this separate from balance changes. Only fix a reproducible defect; do not rebalance combat from source inspection alone.
