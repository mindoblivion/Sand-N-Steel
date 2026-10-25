import React from 'react';
import { FighterState } from '../../types/game';
import type { FighterModifiers } from '../../utils/combatModifiers';
import {
  TurnActionPanel,
  CombatActionType,
  CombatLogEntry,
  AttackTarget,
  BeastPanelInfo,
} from './TurnActionPanel';
import { Swords, Flame, Sparkles, Volume2, VolumeX, HelpCircle, Camera, Settings, AlertCircle } from 'lucide-react';

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
  /** CH-3a — the two merged blocks the duel resolves with (HUD truth). */
  playerModifiers?: FighterModifiers;
  opponentModifiers?: FighterModifiers;
  opponentIsBoss?: boolean;
  /**
   * CF-6 — a boss's rage. A timestamp (ms) that fires ONE red vignette pulse:
   * the div is keyed by it, so a second pulse restarts the 700 ms animation.
   * Boss fights only — DuelScene never sets it for a standard opponent.
   */
  bossVignettePulse?: number;
  /**
   * D-2 — the beast, when a bout fields one. Drives the wound pips beside the
   * boss's name and the panel's target choice; `null`/absent on every other duel.
   */
  beast?: BeastPanelInfo | null;
  onExecuteAction: (action: CombatActionType, target?: AttackTarget) => void;
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
  playerModifiers,
  opponentModifiers,
  opponentIsBoss,
  bossVignettePulse,
  beast = null,
  onExecuteAction,
}) => {
  const playerHpPct = Math.max(0, Math.min(100, (player.health / player.stats.healthMax) * 100));
  const playerStaminaPct = Math.max(0, Math.min(100, (player.stamina / player.stats.staminaMax) * 100));

  const opponentHpPct = Math.max(0, Math.min(100, (opponent.health / opponent.stats.healthMax) * 100));
  const opponentStaminaPct = Math.max(0, Math.min(100, (opponent.stamina / opponent.stats.staminaMax) * 100));

  const formattedTime = `${Math.floor(matchTimer / 60)}:${(matchTimer % 60).toString().padStart(2, '0')}`;
  const crowdFavorTier = crowdHype > 75 ? 'MAX' : crowdHype > 40 ? 'HIGH' : 'LOW';

  return (
    /* UI-1 (S-3) — the HUD owns its safe-area gutter, rather than relying on the
       global body padding alone.  The max() keeps the existing padding as the floor. */
    <div className="combat-hud absolute inset-0 pointer-events-none flex flex-col justify-between p-2.5 sm:p-5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))] select-none z-10">

      {/* CF-6 — boss moment: one red vignette pulse (700 ms) when a boss's rage
          ignites. Keyed by the timestamp so a later pulse starts a fresh
          animation, and pointer-events-none so it can never intercept a touch. */}
      {bossVignettePulse !== undefined && (
        <div
          key={bossVignettePulse}
          className="boss-vignette-pulse"
          data-boss-vignette={bossVignettePulse}
          aria-hidden="true"
        />
      )}
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
              className="flex items-center justify-center gap-1 min-h-[48px] min-w-[48px] px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer text-xs font-mono"
              title={`Camera: ${cameraMode.replace('_', ' ')} (Tap to switch / press C)`}
            >
              <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
              {/* UI-1 (B-1) — the label IS this control's state, so it shows at every width. */}
              <span className="capitalize">
                {cameraMode === 'cinematic' ? '3/4 Duel' : cameraMode === 'over_shoulder' ? 'Shoulder' : 'Isometric'}
              </span>
            </button>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="min-h-[48px] min-w-[48px] px-2.5 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide"
                title="Game Settings"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                <span>Settings</span>
              </button>
            )}
            <button
              onClick={onOpenHelp}
              className="min-h-[48px] min-w-[48px] px-2 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide"
              title="Controls & Instructions"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Help</span>
            </button>
            <button
              onClick={onToggleMute}
              className="min-h-[48px] min-w-[48px] px-2 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide"
              title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
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
                {/* D-2 — the beast's wounds, beside the boss's name: one pip per
                    wound taken, so "interrupt it three times" is readable at a
                    glance. Only a bout that fields a beast renders this at all. */}
                {beast && (
                  <span
                    data-beast-pips={`${beast.wounds}/${beast.maxWounds}`}
                    title={`${beast.name} — ${beast.wounds} of ${beast.maxWounds} wounds`}
                    className="ml-1.5 flex items-center gap-0.5 shrink-0"
                  >
                    {Array.from({ length: beast.maxWounds }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full border ${
                          i < beast.wounds
                            ? 'bg-amber-400 border-amber-200'
                            : 'bg-neutral-800 border-neutral-600'
                        }`}
                      />
                    ))}
                  </span>
                )}
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
              CROWD HYPE
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
        playerModifiers={playerModifiers}
        opponentModifiers={opponentModifiers}
        opponentIsBoss={opponentIsBoss}
        beast={beast}
        onExecuteAction={onExecuteAction}
      />
    </div>
  );
};

