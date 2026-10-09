import React from 'react';
import { FighterState } from '../../types/game';
import { TurnActionPanel, CombatActionType, CombatLogEntry } from './TurnActionPanel';
import { Swords, Shield, Flame, Sparkles, Volume2, VolumeX, HelpCircle, Camera, Settings } from 'lucide-react';

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
  isLeftyMode?: boolean;
  onToggleLeftyMode?: () => void;
  onOpenSettings?: () => void;
  // Turn-Based Swords & Sandals Combat Props
  distance: number;
  isPlayerTurn: boolean;
  isExecuting: boolean;
  combatLog: CombatLogEntry[];
  onExecuteAction: (action: CombatActionType) => void;
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
  isLeftyMode,
  onToggleLeftyMode,
  onOpenSettings,
  distance,
  isPlayerTurn,
  isExecuting,
  combatLog,
  onExecuteAction,
}) => {
  const playerHpPct = Math.max(0, Math.min(100, (player.health / player.stats.healthMax) * 100));
  const playerStaminaPct = Math.max(0, Math.min(100, (player.stamina / player.stats.staminaMax) * 100));

  const opponentHpPct = Math.max(0, Math.min(100, (opponent.health / opponent.stats.healthMax) * 100));
  const opponentStaminaPct = Math.max(0, Math.min(100, (opponent.stamina / opponent.stats.staminaMax) * 100));

  const formattedTime = `${Math.floor(matchTimer / 60)}:${(matchTimer % 60).toString().padStart(2, '0')}`;
  const hypeMultiplier = crowdHype > 75 ? '3.0x' : crowdHype > 40 ? '2.0x' : '1.0x';

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2.5 sm:p-5 select-none z-10">
      {/* TOP HEADER: HEALTH, STAMINA, HYPE & UTILITY BUTTONS */}
      <div className="w-full flex flex-col gap-2">
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

          {/* ACTION BUTTONS (LEFTY MODE, CAMERA, HELP, AUDIO) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {onToggleLeftyMode && (
              <button
                onClick={onToggleLeftyMode}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all active:scale-95 cursor-pointer ${
                  isLeftyMode
                    ? 'bg-amber-600/90 border-amber-300 text-neutral-950 font-bold shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                    : 'bg-black/60 hover:bg-neutral-900 border-amber-600/40 text-amber-300 hover:text-amber-100'
                }`}
                title={isLeftyMode ? 'Lefty Mode: ON (Weapon in Left Hand)' : 'Lefty Mode: OFF (Weapon in Right Hand)'}
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isLeftyMode ? 'Lefty: ON' : 'Lefty: OFF'}</span>
                <span className="sm:hidden">{isLeftyMode ? 'L' : 'R'}</span>
              </button>
            )}

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
                className="p-1.5 sm:p-2 rounded-lg bg-black/60 hover:bg-neutral-900 border border-amber-600/40 text-amber-300 hover:text-amber-100 transition-all active:scale-95 cursor-pointer"
                title="Game Settings"
              >
                <Settings className="w-4 h-4 text-amber-400" />
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
          <div className="bg-gradient-to-r from-neutral-950/90 via-neutral-900/85 to-transparent border-l-2 sm:border-l-4 border-amber-500 rounded-r-xl p-2 sm:p-3 shadow-2xl backdrop-blur-md">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50 shrink-0"></span>
                <span className="font-serif font-black tracking-wider text-[11px] sm:text-sm text-amber-100 uppercase truncate">
                  {player.name}
                </span>
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
          <div className="bg-gradient-to-l from-neutral-950/90 via-neutral-900/85 to-transparent border-r-2 sm:border-r-4 border-red-600 rounded-l-xl p-2 sm:p-3 shadow-2xl backdrop-blur-md text-right">
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
        <div className="w-full max-w-md mx-auto bg-neutral-950/80 border border-amber-600/40 rounded-xl p-1.5 px-3 shadow-xl backdrop-blur-md flex flex-col gap-0.5">
          <div className="flex justify-between items-center text-[11px] font-serif font-bold text-amber-300">
            <span className="flex items-center gap-1">
              <Flame className={`w-3.5 h-3.5 ${crowdHype > 50 ? 'text-orange-500 animate-bounce' : 'text-amber-500'}`} />
              CROWD FAVOR
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-amber-400/80 uppercase font-mono">
                Bonus: <strong className="text-yellow-300">{hypeMultiplier}</strong>
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

