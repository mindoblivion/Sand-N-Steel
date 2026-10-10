import React from 'react';
import { FighterState } from '../../types/game';
import {
  Swords,
  Shield,
  Zap,
  Wind,
  Footprints,
  Flame,
  BatteryCharging,
  Sparkles,
  ChevronRight,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

export type CombatActionType =
  | 'quick_attack'
  | 'power_attack'
  | 'shield_block'
  | 'dodge'
  | 'advance'
  | 'retreat'
  | 'taunt'
  | 'rest';

export interface CombatLogEntry {
  id: string;
  text: string;
  type: 'player' | 'opponent' | 'system' | 'crit';
  timestamp: string;
}

interface TurnActionPanelProps {
  player: FighterState;
  opponent: FighterState;
  distance: number;
  isPlayerTurn: boolean;
  isExecuting: boolean;
  combatLog: CombatLogEntry[];
  onExecuteAction: (action: CombatActionType) => void;
}

export const TurnActionPanel: React.FC<TurnActionPanelProps> = ({
  player,
  opponent,
  distance,
  isPlayerTurn,
  isExecuting,
  combatLog,
  onExecuteAction,
}) => {
  const isMeleeRange = distance <= 2.5;
  const isSpearRange = distance <= 3.8;
  const weaponType = player.loadout.weapon.type || 'sword_shield';
  const effectiveRange = weaponType === 'spear' ? 3.8 : 2.5;
  const isInWeaponRange = distance <= effectiveRange;

  // Calculate hit probability percentages
  const playerAgi = player.stats.agility;
  const oppAgi = opponent.stats.agility;

  const quickHitPct = Math.max(50, Math.min(95, Math.round(80 + playerAgi * 1.5 - oppAgi * 1.2)));
  const powerHitPct = Math.max(35, Math.min(80, Math.round(60 + playerAgi * 1.2 - oppAgi * 1.2)));

  // Estimated damage ranges
  const str = player.stats.strength;
  const quickDmgMin = Math.round(player.loadout.weapon.damageLight * (0.9 + str * 0.04));
  const quickDmgMax = Math.round(player.loadout.weapon.damageLight * (1.1 + str * 0.05));

  const powerDmgMin = Math.round(player.loadout.weapon.damageHeavy * (0.9 + str * 0.07));
  const powerDmgMax = Math.round(player.loadout.weapon.damageHeavy * (1.2 + str * 0.09));

  return (
    <div className="w-full max-w-5xl mx-auto pointer-events-auto flex flex-col md:flex-row gap-2.5 items-stretch z-20 select-none pb-2 sm:pb-4">
      {/* COMBAT LOG FEED (LEFT / TOP) */}
      <div className="w-full md:w-64 bg-neutral-950/85 border border-amber-600/40 rounded-2xl p-2.5 backdrop-blur-md shadow-2xl flex flex-col justify-between shrink-0">
        <div className="flex items-center justify-between pb-1.5 border-b border-amber-900/40 mb-1.5">
          <span className="font-serif font-bold text-xs text-amber-300 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>ARENA CHRONICLE</span>
          </span>
          <span className="text-[10px] font-mono text-amber-400/70">
            DIST: <strong className="text-yellow-300">{distance.toFixed(1)}m</strong>
          </span>
        </div>

        {/* LOG ITEMS FEED */}
        <div className="combat-log-items flex flex-col gap-1 max-h-24 md:max-h-36 overflow-y-auto pr-1 text-[11px] font-mono">
          {combatLog.length === 0 ? (
            <div className="text-neutral-500 italic text-[10px] text-center py-2">
              The match has begun! Choose your tactic.
            </div>
          ) : (
            combatLog.slice(-5).map((log) => (
              <div
                key={log.id}
                className={`p-1 rounded border leading-tight ${
                  log.type === 'player'
                    ? 'bg-amber-950/40 border-amber-700/40 text-amber-200'
                    : log.type === 'opponent'
                    ? 'bg-red-950/40 border-red-800/40 text-red-200'
                    : log.type === 'crit'
                    ? 'bg-yellow-950/60 border-yellow-500/60 text-yellow-300 font-bold'
                    : 'bg-neutral-900/60 border-neutral-800 text-neutral-300'
                }`}
              >
                {log.text}
              </div>
            ))
          )}
        </div>

        {/* DISTANCE RANGE BADGE */}
        <div className="mt-2 pt-1.5 border-t border-amber-900/40 flex items-center justify-between text-[10px] font-mono">
          <span className="text-neutral-400">Range Status:</span>
          <span
            className={`font-bold px-1.5 py-0.5 rounded border ${
              isInWeaponRange
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                : 'bg-amber-950/80 border-amber-600/60 text-amber-300'
            }`}
          >
            {isInWeaponRange ? 'IN STRIKE RANGE' : 'OUT OF RANGE'}
          </span>
        </div>
      </div>

      {/* TACTICAL COMMAND DASHBOARD (CENTER / RIGHT) */}
      <div className="flex-1 bg-neutral-950/90 border-2 border-amber-600/60 rounded-2xl p-2.5 sm:p-3.5 backdrop-blur-md shadow-2xl flex flex-col justify-between gap-2.5">
        {/* TURN STATE BANNER */}
        <div className="flex items-center justify-between bg-neutral-900/90 border border-amber-700/50 px-3 py-1.5 rounded-xl">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPlayerTurn ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-red-500 animate-ping'
              }`}
            ></span>
            <span className="font-serif font-black text-xs sm:text-sm tracking-wider uppercase text-amber-100">
              {isPlayerTurn
                ? isExecuting
                  ? 'Executing Strike...'
                  : 'YOUR TURN — CHOOSE TACTIC'
                : `${opponent.name} IS STRATEGIZING...`}
            </span>
          </div>

          <div className="text-[10px] font-mono text-amber-300/80 hidden sm:block">
            STAMINA: <strong className="text-amber-100">{Math.round(player.stamina)} SP</strong>
          </div>
        </div>

        {/* COMMAND ACTION BUTTONS GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
          {/* 1. QUICK STRIKE */}
          <button
            onClick={() => onExecuteAction('quick_attack')}
            disabled={!isPlayerTurn || isExecuting || player.stamina < 10}
            className={`group relative p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer active:scale-95 text-left ${
              !isPlayerTurn || isExecuting || player.stamina < 10
                ? 'bg-neutral-900/50 border-neutral-800 opacity-50 pointer-events-none'
                : !isInWeaponRange
                ? 'bg-neutral-900 border-amber-900/60 hover:border-amber-500 text-amber-200'
                : 'bg-gradient-to-br from-amber-950 via-neutral-900 to-amber-900/60 border-amber-500 hover:border-amber-300 text-amber-100 shadow-lg hover:shadow-amber-500/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-serif font-black text-xs sm:text-sm text-amber-200 flex items-center gap-1">
                <Swords className="w-3.5 h-3.5 text-amber-400" />
                <span>Quick Strike</span>
              </span>
              <span className="text-[9px] font-mono bg-amber-950/80 border border-amber-700/60 px-1 py-0.2 rounded text-amber-300">
                10 SP
              </span>
            </div>

            <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
              Fast, reliable attack with high precision.
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-amber-900/40">
              <span className="text-emerald-400 font-bold">{quickHitPct}% Hit</span>
              <span className="text-amber-300 font-bold">
                {quickDmgMin}-{quickDmgMax} Dmg
              </span>
            </div>

            {!isInWeaponRange && (
              <div className="absolute inset-0 bg-neutral-950/85 backdrop-blur-[1px] rounded-xl flex items-center justify-center p-1 text-center text-[10px] font-mono text-amber-400 font-bold border border-amber-700/50">
                Out of Range (Advance)
              </div>
            )}
          </button>

          {/* 2. POWER SLASH / HEAVY ATTACK */}
          <button
            onClick={() => onExecuteAction('power_attack')}
            disabled={!isPlayerTurn || isExecuting || player.stamina < 22}
            className={`group relative p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer active:scale-95 text-left ${
              !isPlayerTurn || isExecuting || player.stamina < 22
                ? 'bg-neutral-900/50 border-neutral-800 opacity-50 pointer-events-none'
                : !isInWeaponRange
                ? 'bg-neutral-900 border-red-900/60 hover:border-red-500 text-red-200'
                : 'bg-gradient-to-br from-red-950 via-neutral-900 to-rose-950 border-red-500 hover:border-rose-300 text-rose-100 shadow-lg hover:shadow-red-500/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-serif font-black text-xs sm:text-sm text-rose-200 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span>Power Slash</span>
              </span>
              <span className="text-[9px] font-mono bg-red-950/80 border border-red-700/60 px-1 py-0.2 rounded text-red-300">
                22 SP
              </span>
            </div>

            <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
              Brutal blow with high critical strike potential.
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-red-900/40">
              <span className="text-yellow-400 font-bold">{powerHitPct}% Hit</span>
              <span className="text-rose-300 font-bold">
                {powerDmgMin}-{powerDmgMax} Dmg
              </span>
            </div>

            {!isInWeaponRange && (
              <div className="absolute inset-0 bg-neutral-950/85 backdrop-blur-[1px] rounded-xl flex items-center justify-center p-1 text-center text-[10px] font-mono text-red-400 font-bold border border-red-700/50">
                Out of Range (Advance)
              </div>
            )}
          </button>

          {/* 3. SHIELD GUARD / BRACE */}
          <button
            onClick={() => onExecuteAction('shield_block')}
            disabled={!isPlayerTurn || isExecuting}
            className={`p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer active:scale-95 text-left ${
              !isPlayerTurn || isExecuting
                ? 'bg-neutral-900/50 border-neutral-800 opacity-50 pointer-events-none'
                : 'bg-gradient-to-br from-blue-950 via-neutral-900 to-slate-900 border-cyan-500 hover:border-cyan-300 text-cyan-100 shadow-lg'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-serif font-black text-xs sm:text-sm text-cyan-200 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                <span>Shield Guard</span>
              </span>
              <span className="text-[9px] font-mono bg-cyan-950/80 border border-cyan-700/60 px-1 py-0.2 rounded text-cyan-300">
                +12 SP
              </span>
            </div>

            <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
              Brace shield to reduce incoming hit damage by 75%.
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-cyan-900/40">
              <span className="text-cyan-300 font-bold">75% Reduction</span>
              <span className="text-emerald-300 font-bold">+Stamina</span>
            </div>
          </button>

          {/* 4. TAUNT CROWD / REST */}
          <button
            onClick={() => onExecuteAction('taunt')}
            disabled={!isPlayerTurn || isExecuting}
            className={`p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer active:scale-95 text-left ${
              !isPlayerTurn || isExecuting
                ? 'bg-neutral-900/50 border-neutral-800 opacity-50 pointer-events-none'
                : 'bg-gradient-to-br from-purple-950 via-neutral-900 to-amber-950 border-purple-500 hover:border-purple-300 text-purple-100 shadow-lg'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-serif font-black text-xs sm:text-sm text-purple-200 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>Arena Taunt</span>
              </span>
              <span className="text-[9px] font-mono bg-purple-950/80 border border-purple-700/60 px-1 py-0.2 rounded text-purple-300">
                +25 SP
              </span>
            </div>

            <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
              Rally the crowd! Restores stamina &amp; hype.
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-purple-900/40">
              <span className="text-purple-300 font-bold">+20% Hype</span>
              <span className="text-yellow-300 font-bold">+25 Stamina</span>
            </div>
          </button>
        </div>

        {/* MOVEMENT & UTILITY SECONDARY STRIP */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-900/40">
          <div className="flex items-center gap-1.5">
            {/* ADVANCE */}
            <button
              onClick={() => onExecuteAction('advance')}
              disabled={!isPlayerTurn || isExecuting || isMeleeRange}
              className={`px-3 py-1.5 rounded-lg border text-xs font-serif font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                !isPlayerTurn || isExecuting || isMeleeRange
                  ? 'bg-neutral-900/50 border-neutral-800 text-neutral-500 opacity-50 pointer-events-none'
                  : 'bg-amber-950/80 hover:bg-amber-900 border-amber-600 text-amber-200'
              }`}
              title="Step forward towards opponent (+1.8m)"
            >
              <Footprints className="w-3.5 h-3.5 text-amber-400" />
              <span>Advance (+1.8m)</span>
            </button>

            {/* RETREAT */}
            <button
              onClick={() => onExecuteAction('retreat')}
              disabled={!isPlayerTurn || isExecuting || distance >= 9.0}
              className={`px-3 py-1.5 rounded-lg border text-xs font-serif font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                !isPlayerTurn || isExecuting || distance >= 9.0
                  ? 'bg-neutral-900/50 border-neutral-800 text-neutral-500 opacity-50 pointer-events-none'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Step backward away from opponent (-1.8m)"
            >
              <Footprints className="w-3.5 h-3.5 text-neutral-400 transform rotate-180" />
              <span>Retreat (-1.8m)</span>
            </button>
          </div>

          {/* CATCH BREATH REST BUTTON */}
          <button
            onClick={() => onExecuteAction('rest')}
            disabled={!isPlayerTurn || isExecuting || player.stamina >= player.stats.staminaMax}
            className={`px-3 py-1.5 rounded-lg border text-xs font-serif font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
              !isPlayerTurn || isExecuting || player.stamina >= player.stats.staminaMax
                ? 'bg-neutral-900/50 border-neutral-800 text-neutral-500 opacity-50 pointer-events-none'
                : 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-600 text-emerald-200'
            }`}
            title="Catch breath to recover +40 Stamina"
          >
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
            <span>Catch Breath (+40 SP)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
