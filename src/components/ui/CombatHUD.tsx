import React from 'react';
import { FighterState } from '../../types/game';
import { TurnActionPanel, CombatActionType, CombatLogEntry } from './TurnActionPanel';
import { Swords, Flame, Volume2, VolumeX, HelpCircle, Camera, Settings, AlertCircle, Shield, Wind } from 'lucide-react';
import {
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
  PLAYER_ATTACK_WINDUP_MS,
} from '../../utils/combatCalculations';
import { resolvePlayerWindupCue, type PlayerStrikeAction } from '../../utils/playerStrike';

interface CombatHUDProps {
  player: FighterState;
  opponent: FighterState;
  crowdHype: number;
  comboCount: number;
  matchTimer: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenArmory: () => void;
  onOpenHelp: () => void;
  cameraMode: string;
  onCycleCameraMode: () => void;
  onOpenSettings?: () => void;
  // Turn-Based Swords & Sandals Combat Props
  distance: number;
  isPlayerTurn: boolean;
  isExecuting: boolean;
  combatLog: CombatLogEntry[];
  onExecuteAction: (action: CombatActionType) => void;
  // Combat responsiveness §R1 — the enemy strike that has been announced but has
  // not landed yet, the player's one reaction to it, and the reaction itself.
  pendingEnemyAttack: 'quick_attack' | 'power_attack' | null;
  // C-8.73B — the player's own strike, held for its 700 ms wind-up. Mirrored
  // from the strike controller (`playerStrike.ts`), never timed here.
  pendingPlayerAttack: PlayerStrikeAction | null;
  reactionTaken: boolean;
  onReactToPendingAttack: (action: 'shield_block' | 'dodge') => void;
}

export const CombatHUD: React.FC<CombatHUDProps> = ({
  player,
  opponent,
  crowdHype,
  comboCount,
  matchTimer,
  isMuted,
  onToggleMute,
  onOpenArmory,
  onOpenHelp,
  cameraMode,
  onCycleCameraMode,
  onOpenSettings,
  distance,
  isPlayerTurn,
  isExecuting,
  combatLog,
  onExecuteAction,
  pendingEnemyAttack,
  pendingPlayerAttack,
  reactionTaken,
  onReactToPendingAttack,
}) => {
  // The player's cue, as the shared rule decides it: nothing unless a strike is
  // genuinely pending, and never alongside an opponent announcement.
  const playerWindupCue = resolvePlayerWindupCue(pendingPlayerAttack, pendingEnemyAttack);
  const playerHpPct = Math.max(0, Math.min(100, (player.health / player.stats.healthMax) * 100));
  const playerStaminaPct = Math.max(0, Math.min(100, (player.stamina / player.stats.staminaMax) * 100));

  const opponentHpPct = Math.max(0, Math.min(100, (opponent.health / opponent.stats.healthMax) * 100));
  const opponentStaminaPct = Math.max(0, Math.min(100, (opponent.stamina / opponent.stats.staminaMax) * 100));

  const formattedTime = `${Math.floor(matchTimer / 60)}:${(matchTimer % 60).toString().padStart(2, '0')}`;
  const crowdFavorTier = crowdHype > 75 ? 'MAX' : crowdHype > 40 ? 'HIGH' : 'LOW';

  return (
    <div className="combat-hud absolute inset-0 pointer-events-none flex flex-col justify-between p-2.5 sm:p-5 select-none z-10">
      {/* TOP HEADER: HEALTH, STAMINA, HYPE & UTILITY BUTTONS */}
      <div className="combat-top w-full flex flex-col gap-2">
        {/* TOP UTILITY BAR */}
        <div className="w-full flex flex-wrap items-center justify-between gap-1.5 pointer-events-auto">
          {/* PLAYER WEAPON BADGE & ARMORY SHORTCUT */}
          <button
            onClick={onOpenArmory}
            className="flex items-center gap-2 bg-black/60 hover:bg-neutral-900 border border-amber-600/50 hover:border-amber-400 text-amber-200 px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer text-xs sm:text-sm font-semibold tracking-wide"
            title="Armory & Opponents"
          >
            <Swords className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Armory:</span>
            <span className="text-amber-100 font-bold">{player.loadout.weapon.name}</span>
          </button>

          {/* ARENA MATCH TIMER */}
          <div className="bg-black/60 border border-amber-700/40 px-3 py-1 rounded-md text-amber-300 font-mono text-sm tracking-widest backdrop-blur-sm">
            {formattedTime}
          </div>

          {/* ACTION BUTTONS (CAMERA, HELP, AUDIO) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={onCycleCameraMode}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer text-xs font-mono"
              title={`Camera: ${cameraMode.replace('_', ' ')} (Tap to switch / press C)`}
            >
              <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
              <span className="hidden sm:inline capitalize">
                {cameraMode === 'cinematic' ? '3/4 Duel' : cameraMode === 'over_shoulder' ? 'Shoulder' : 'Isometric'}
              </span>
            </button>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="min-h-[48px] px-2.5 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-semibold tracking-wide"
                title="Game Settings"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
            <button
              onClick={onOpenHelp}
              className="p-1.5 sm:p-2 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer"
              title="Controls & Instructions"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleMute}
              className="p-1.5 sm:p-2 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer"
              title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            </button>
          </div>
        </div>

        {/* GLADIATOR VITAL BARS (PLAYER vs OPPONENT) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-6 mt-0.5 sm:mt-1">
          {/* PLAYER VITAL CARD */}
          <div className="vital-card bg-gradient-to-r from-neutral-950/90 via-neutral-900/85 to-transparent border-l-2 sm:border-l-4 border-amber-500 rounded-r-xl p-2 sm:p-3 shadow-2xl backdrop-blur-md">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50 shrink-0"></span>
                <span className="font-serif font-black tracking-wider text-[11px] sm:text-sm text-amber-100 uppercase truncate">
                  {player.name}
                </span>
                {comboCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/50 text-orange-300 text-[10px] sm:text-xs font-mono font-bold shrink-0 animate-pulse">
                    COMBO ×{comboCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-mono font-bold text-amber-300">
                {Math.round(player.health)} / {player.stats.healthMax}
              </span>
            </div>

            {/* Health Bar */}
            <div className="w-full bg-neutral-950 h-3 sm:h-4 rounded border border-red-900/60 overflow-hidden mb-1 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 rounded transition-all duration-300 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                style={{ width: `${playerHpPct}%` }}
              ></div>
            </div>

            {/* Stamina Bar */}
            <div className="w-full bg-neutral-950 h-1.5 sm:h-2 rounded border border-amber-900/50 overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 rounded transition-all duration-200"
                style={{ width: `${playerStaminaPct}%` }}
              ></div>
            </div>
          </div>

          {/* OPPONENT VITAL CARD */}
          <div className="vital-card bg-gradient-to-l from-neutral-950/90 via-neutral-900/85 to-transparent border-r-2 sm:border-r-4 border-red-600 rounded-l-xl p-2 sm:p-3 shadow-2xl backdrop-blur-md text-right">
            <div className="flex justify-between items-center mb-1 flex-row-reverse">
              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50 shrink-0"></span>
                <span className="font-serif font-black tracking-wider text-[11px] sm:text-sm text-red-200 uppercase truncate">
                  {opponent.name}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-red-300">
                {Math.round(opponent.health)} / {opponent.stats.healthMax}
              </span>
            </div>

            {/* Health Bar */}
            <div className="w-full bg-neutral-950 h-3 sm:h-4 rounded border border-red-900/60 overflow-hidden mb-1 p-0.5">
              <div
                className="h-full bg-gradient-to-l from-red-600 via-rose-500 to-amber-400 rounded transition-all duration-300 shadow-[0_0_10px_rgba(239,68,68,0.5)] ml-auto"
                style={{ width: `${opponentHpPct}%` }}
              ></div>
            </div>

            {/* Stamina Bar */}
            <div className="w-full bg-neutral-950 h-1.5 sm:h-2 rounded border border-amber-900/50 overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-l from-amber-600 via-amber-400 to-yellow-300 rounded transition-all duration-200 ml-auto"
                style={{ width: `${opponentStaminaPct}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* CROWD HYPE METER */}
        <div className="hype-meter w-full max-w-md mx-auto bg-neutral-950/80 border border-amber-600/40 rounded-xl p-1.5 px-3 shadow-xl backdrop-blur-md flex flex-col gap-0.5">
          <div className="flex justify-between items-center text-[11px] font-serif font-bold text-amber-300">
            <span className="flex items-center gap-1">
              <Flame className={`w-3.5 h-3.5 ${crowdHype > 50 ? 'text-orange-500 animate-bounce' : 'text-amber-500'}`} />
              CROWD FAVOR
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-amber-400/80 uppercase font-mono">
                <strong className="text-yellow-300">{crowdFavorTier}</strong>
              </span>
              <span className="font-mono text-amber-100">{Math.round(crowdHype)}%</span>
            </div>
          </div>
          <div className="w-full bg-neutral-900 h-2 rounded-full overflow-hidden p-0.5 border border-amber-900/50 relative">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-full transition-all duration-200"
              style={{ width: `${crowdHype}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* ENEMY STRIKE WIND-UP (Combat responsiveness §R1) — the announced
          strike, its shrinking timer and the two reactions that answer it. This
          is NOT a turn: Shield Guard or Dodge here only sets the stance the
          incoming blow already resolves against. */}
      {pendingEnemyAttack && (
        <div className="relative h-0 w-full pointer-events-none z-10">
         <div className="absolute inset-x-0 top-1 sm:top-2 flex justify-center pointer-events-none">
          <div
            data-windup-cue={pendingEnemyAttack}
            className="pointer-events-auto w-full max-w-lg bg-red-950/95 border-2 border-red-500 rounded-xl px-2.5 py-2 shadow-2xl backdrop-blur-md flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-300 shrink-0 animate-pulse" />
              <span className="font-serif font-black text-[11px] sm:text-sm text-red-100 tracking-wider uppercase">
                {pendingEnemyAttack === 'quick_attack' ? 'Quick strike incoming' : 'Power slash incoming'}
              </span>
              <span className="ml-auto text-[9px] sm:text-[10px] font-mono text-red-300/80 uppercase">React</span>
            </div>

            {/* The 700 ms window, drawn as it runs down. */}
            <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden">
              <div
                className="windup-bar h-full w-full bg-gradient-to-r from-amber-400 to-red-500 rounded-full"
                style={{ animationDuration: `${ENEMY_ATTACK_WINDUP_MS}ms` }}
              ></div>
            </div>

            {reactionTaken ? (
              <p data-reaction-taken="true" className="text-[10px] font-mono text-emerald-300 text-center">
                Stance set — the strike lands against your guard.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  data-reaction="shield_block"
                  onClick={() => onReactToPendingAttack('shield_block')}
                  className="min-h-[44px] px-2 py-2 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/70 text-cyan-100 font-serif font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span>Shield Guard</span>
                </button>
                <button
                  data-reaction="dodge"
                  onClick={() => onReactToPendingAttack('dodge')}
                  disabled={player.stamina < DODGE_STAMINA_COST}
                  className={`min-h-[44px] px-2 py-2 rounded-lg border text-[11px] sm:text-xs font-serif font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                    player.stamina < DODGE_STAMINA_COST
                      ? 'bg-neutral-900/70 border-neutral-700 text-neutral-500 cursor-not-allowed'
                      : 'bg-teal-950/80 hover:bg-teal-900 border-teal-500/70 text-teal-100 cursor-pointer'
                  }`}
                >
                  <Wind className="w-3.5 h-3.5 shrink-0" />
                  <span>Dodge −{DODGE_STAMINA_COST} SP</span>
                </button>
              </div>
            )}
          </div>
         </div>
        </div>
      )}

      {/* PLAYER STRIKE WIND-UP (C-8.73B) — the mirror of the enemy telegraph,
          in the player's own amber rather than the incoming red. It is inert
          (pointer-events-none throughout, no controls) so it cannot block the
          tactic dashboard, and it sits below the vitals so it never covers
          health or stamina. It lasts exactly as long as the strike is pending:
          the controller clears it at impact and on every cancellation. */}
      {playerWindupCue && (
        <div className="relative h-0 w-full pointer-events-none z-10">
         <div className="absolute inset-x-0 top-1 sm:top-2 flex justify-center pointer-events-none">
          <div
            data-player-windup-cue={playerWindupCue.action}
            className="pointer-events-none w-full max-w-lg bg-amber-950/95 border-2 border-amber-500 rounded-xl px-2.5 py-2 shadow-2xl backdrop-blur-md flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-2">
              <Swords className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0 animate-pulse" />
              <span className="font-serif font-black text-[11px] sm:text-sm text-amber-100 tracking-wider uppercase">
                {playerWindupCue.label}
              </span>
              <span className="ml-auto text-[9px] sm:text-[10px] font-mono text-amber-300/80 uppercase">Committed</span>
            </div>

            {/* The same 700 ms window, drawn as it runs down. */}
            <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden">
              <div
                className="windup-bar h-full w-full bg-gradient-to-r from-amber-300 to-orange-600 rounded-full"
                style={{ animationDuration: `${PLAYER_ATTACK_WINDUP_MS}ms` }}
              ></div>
            </div>
          </div>
         </div>
        </div>
      )}

      {/* BOSS TELEGRAPH WARNING BANNER */}
      {opponent.telegraphText && (
        <div className="w-full flex justify-center mt-1 sm:mt-2 pointer-events-none z-10">
          <div className="bg-red-950/90 border-2 border-red-500 rounded-xl px-4 py-2 shadow-2xl backdrop-blur-md animate-pulse flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="font-serif font-black text-sm sm:text-base text-red-200 tracking-wider uppercase">
              {opponent.telegraphText}
            </span>
          </div>
        </div>
      )}

      {/* SWORDS & SANDALS TURN ACTION DASHBOARD (BOTTOM) */}
      <TurnActionPanel
        player={player}
        opponent={opponent}
        distance={distance}
        isPlayerTurn={isPlayerTurn}
        isExecuting={isExecuting}
        combatLog={combatLog}
        onExecuteAction={onExecuteAction}
      />
    </div>
  );
};

