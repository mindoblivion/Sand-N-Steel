import React, { useEffect, useMemo, useState } from 'react';
import type { FighterState } from '../../types/game';
import { CombatHUD } from '../ui/CombatHUD';
import type { CombatLogEntry } from '../ui/TurnActionPanel';
import { ALL_WEAPONS } from '../../data/itemsDB';

/**
 * CombatHudHarness — DEVELOPMENT-ONLY verification screen (C-8.74C-H).
 *
 * Reachable ONLY in a Vite dev build, through the exact `?devHarness=hud` query
 * parameter or the equivalent dev-only scratch-storage flag
 * `sand_and_steel_dev_harness = 'hud'` (see `src/main.tsx`). It mounts the REAL
 * `CombatHUD` — the shipped component, no replica markup — inside the same
 * kind of full-viewport container `DuelScene` gives it, with fixed props, so the
 * cue layers can be measured at any viewport without paying for the 3D arena
 * (the sandbox has no GPU and renders the duel at a few frames per second).
 *
 * Why it exists: both telegraph cues are prop-driven and last 700 ms in the real
 * duel (`ENEMY_ATTACK_WINDUP_MS` / `PLAYER_ATTACK_WINDUP_MS`), so a screenshot
 * taken after the fact measures nothing. Here the cue state is held for as long
 * as the harness says, while the timing itself stays pinned by the unit suites
 * (`combatResponsiveness.test.ts`, `playerWindupCue.test.ts`).
 *
 * States — press the digit key on the window (the harness's own affordance; no
 * application code reads it):
 *   1 normal           no cue, five chronicle entries
 *   2 player-windup    the player's own 700 ms strike cue
 *   3 power            opponent Power Slash telegraph, both reactions live
 *   4 quick            opponent Quick Strike telegraph, both reactions live
 *   5 reaction-taken   the telegraph after Shield Guard/Dodge was chosen
 *
 * It saves nothing and never reads the player's save.
 *
 * Removal: delete this file and revert the `?devHarness=hud` branch in
 * `src/main.tsx` (the gate + the conditional). No other file references it.
 */

type CueState = 'normal' | 'player-windup' | 'power' | 'quick' | 'reaction-taken';

const STATE_ORDER: CueState[] = ['normal', 'player-windup', 'power', 'quick', 'reaction-taken'];

const readInitialState = (): CueState => {
  const requested = new URLSearchParams(window.location.search).get('hudState');
  return STATE_ORDER.find((state) => state === requested) ?? 'normal';
};

const readLogCount = (): number => {
  const param = new URLSearchParams(window.location.search).get('logs');
  if (param === null || param.trim() === '') return 5;
  const raw = Number(param);
  return Number.isFinite(raw) && raw >= 0 && raw <= 5 ? Math.floor(raw) : 5;
};

const LOG_TEXTS: Array<[string, CombatLogEntry['type']]> = [
  ['You step forward — 4.2m of sand between you.', 'player'],
  ['Marcus the Unproven raises his shield.', 'opponent'],
  ['A quick strike grazes the shoulder for 7 damage.', 'player'],
  ['The crowd roars its approval.', 'system'],
  ['Critical hit! Power slash tears through the guard for 23.', 'crit'],
];

const makeFighter = (overrides: Partial<FighterState>): FighterState =>
  ({
    id: 'harness-fighter',
    name: 'Harness',
    title: 'Gladiator',
    isPlayer: false,
    position: [0, 0, 0],
    rotationY: 0,
    health: 80,
    stamina: 60,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: { strength: 10, agility: 10, stamina: 60, staminaMax: 100, staminaRegen: 20, defense: 5, healthMax: 100 },
    loadout: { weapon: ALL_WEAPONS[0] },
    comboCount: 0,
    skinColor: '#c9a27a',
    hairColor: '#2b1d12',
    tunicColor: '#7f1d1d',
    ...overrides,
  }) as FighterState;

export const CombatHudHarness: React.FC = () => {
  // Self-guard so a stale import can never render outside a dev build.
  if (!import.meta.env.DEV) return null;

  const [cueState, setCueState] = useState<CueState>(readInitialState);
  const [logCount] = useState<number>(readLogCount);
  // The reactions actually delivered to the shipped handler, so a click that
  // reaches the button is provable rather than inferred from the DOM.
  const [reacts, setReacts] = useState<Array<'shield_block' | 'dodge'>>([]);

  const player = useMemo(
    () =>
      makeFighter({
        id: 'harness-player',
        name: 'Dimachaerus',
        isPlayer: true,
        health: 82,
        stamina: 64,
        comboCount: 2,
      }),
    [],
  );
  const opponent = useMemo(
    () =>
      makeFighter({
        id: 'harness-opponent',
        name: 'Marcus the Unproven',
        health: 61,
        stamina: 48,
      }),
    [],
  );
  const combatLog = useMemo<CombatLogEntry[]>(
    () =>
      LOG_TEXTS.slice(0, logCount).map(([text, type], index) => ({
        id: `harness-log-${index}`,
        text,
        type,
        timestamp: `0:0${index}`,
      })),
    [logCount],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const index = Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= STATE_ORDER.length) {
        setReacts([]);
        setCueState(STATE_ORDER[index - 1]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    // Mirrors DuelScene's own root so the HUD's `absolute inset-0` resolves
    // against the same kind of containing block it has in the arena.
    <div className="relative w-full h-full min-h-[100dvh] bg-neutral-950 overflow-hidden select-none">
      <div
        data-hud-harness={cueState}
        data-hud-log-count={logCount}
        data-hud-reacts={reacts.join(',')}
        className="contents"
      >
        <CombatHUD
          player={player}
          opponent={opponent}
          crowdHype={52}
          comboCount={player.comboCount}
          matchTimer={97}
          isMuted={false}
          onToggleMute={() => {}}
          onOpenArmory={() => {}}
          onOpenHelp={() => {}}
          cameraMode="cinematic"
          onCycleCameraMode={() => {}}
          // C-8.74D-A — DuelScene passes this, so the harness must too: the
          // Settings button carries `min-h-[48px]` and makes the utility row
          // taller, which is exactly the vertical budget landscape is short of.
          // Without it the harness under-measured the top block by ~18px.
          onOpenSettings={() => {}}
          distance={4.2}
          isPlayerTurn={cueState === 'normal' || cueState === 'player-windup'}
          isExecuting={cueState === 'player-windup'}
          combatLog={combatLog}
          onExecuteAction={() => {}}
          pendingEnemyAttack={
            cueState === 'power' || cueState === 'reaction-taken'
              ? 'power_attack'
              : cueState === 'quick'
                ? 'quick_attack'
                : null
          }
          pendingPlayerAttack={cueState === 'player-windup' ? 'quick_attack' : null}
          reactionTaken={
            cueState === 'reaction-taken'
              ? 'shield_block'
              : reacts.length > 0
                ? reacts[reacts.length - 1]
                : null
          }
          onReactToPendingAttack={(action) => setReacts((prev) => [...prev, action])}
        />
      </div>
    </div>
  );
};

export default CombatHudHarness;
