# Gladiator Combat — Source Audit

> Original audit baseline: `main` at `7d211d96e226b88130356f9cdefbb28856f39f6b`.
> Current-main re-audit: `ffbd9424d3eeab971b0c3ce0a9f7bbce3cfa8040` (2026-11-09).
> Scope: source-level inspection only. This is not a full-playthrough or Android device sign-off.

## Current-main findings

### Confirmed implementation present

- Combat calculations remain centralized in `src/utils/combatCalculations.ts`: weapon range and stamina costs, hit chance, damage mitigation, stamina regeneration, rage activation, combo events and other pure combat rules.
- `src/components/ui/TurnActionPanel.tsx` consumes the shared range, stamina, hit-chance and damage helpers. The quick/power action controls are disabled for insufficient stamina and for an out-of-range master target. The beast-target exception is explicitly separated from the master range gate.
- `src/components/duel/DuelScene.tsx` uses the same modifier objects for the HUD and combat resolution, including the player's weight impact/recovery profile. The panel's displayed cost and damage estimate therefore use the same helper path as the duel.
- Ordinary attack resolution is deferred through the shared `ATTACK_WINDUP_MS` value (650 ms); the action resolution then schedules a separate presentation/recovery hold. The timing table is exported and covered by `duelTurnPacing.test.ts`.
- The AI turn timer is owned by its effect: its cleanup clears the scheduled timeout and nulls the ref if it still owns it. Its callback checks match termination before choosing an action.
- The duel owns separate refs for attack wind-up, turn resolution, AI turn and result transition timers. The scene-unmount cleanup cancels attack wind-up, turn-resolution and result-transition timers. The AI timer is independently cancelled by the AI effect cleanup.
- Withdrawal clears pending attack/turn timers and the AI timer before settling the withdrawal result.
- Victory and defeat both latch `isMatchOver`, clear pending telegraph/counter state and schedule the result callback through `scheduleDuelResult`; the scene cleanup cancels a pending result callback. Focused timer scheduling/cancellation tests are in `src/utils/duelResultTimer.test.ts`.
- Counter-dodge still has a dedicated announce/resolve state-machine test, and turn pacing still has source-wiring assertions for the telegraph aftermath marker.

### Re-audit conclusion

No new confirmed source defect was established in this pass. In particular, the result callback has explicit unmount cancellation; the AI timer is cleared by its effect cleanup; and the normal player action panel gates out-of-range and insufficient-stamina attacks. The source audit does not establish physical animation synchronization, reliable touch input, correct perceived difficulty, or a complete duel on the Samsung S24.

No gameplay changes are proposed from this inspection alone. Avoid speculative balance changes or rewrites without a reproducible failure.

## Remaining combat acceptance work

1. Complete a standard duel from entry through victory and defeat result return.
2. Test quick and power attacks just inside, exactly at, and just outside each weapon's effective range.
3. Verify stamina deductions, insufficient-stamina prevention, recovery and out-of-range handling.
4. Verify block and dodge persist through the opponent's response, mitigate/evade correctly, then clear when that fighter acts.
5. Verify heavy telegraphs and counter windows are visually readable and resolve exactly once.
6. Exercise shipped boss mechanics, prioritizing counter-dodge, rage, weapon-switch and heavy-telegraph behaviours.
7. Confirm damage, hit-stop, animation active frames, defeat handling and rewards remain synchronized.
8. Repeat on Samsung S24 and record build SHA, device/Android version, reproduction steps and result.

## Original audit notes

The earlier out-of-range stamina complaint is guarded in current source: a player strike beyond weapon reach does not deduct stamina. A stale/direct dispatch can still enter turn resolution and report the miss; no change is proposed without evidence that normal gameplay reaches that path.

The calculation layer is tested by `scripts/combatTests.ts`; combat timing by `duelTurnPacing.test.ts`; counter-windup sequencing by `counterWindup.test.ts`; result timer scheduling/cancellation by `duelResultTimer.test.ts`. This list is source inventory, not proof that every suite was rerun in this documentation-only update.
