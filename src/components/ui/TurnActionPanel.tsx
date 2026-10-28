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
  Grid3x3,
} from 'lucide-react';
import {
  getWeaponRange,
  getStaminaCost,
  calculateHitChance,
  calculateAttackDamage,
  applyStaminaRegen,
} from '../../utils/combatCalculations';
import {
  EMPTY_MODIFIERS,
  blockReductionFor,
  hitAgilityFor,
  resolveTraitMult,
  staminaCostWithModifiers,
  type FighterModifiers,
} from '../../utils/combatModifiers';
import {
  canCastNet,
  entangledHitChance,
  isEntangled,
  NET_LAND_CHANCE,
  ENTANGLE_HIT_PENALTY,
} from '../../utils/statefulDoctrinae';

/**
 * D-2 — which fighter a PLAYER attack is aimed at. Only a beast bout offers the
 * second target, and only while the beast crouches; every other duel passes
 * `undefined`, which reads as the master.
 */
export type AttackTarget = 'master' | 'beast';

/**
 * D-2 — what the panel needs to know about a beast bout. `null` for every other
 * duel, which is what keeps the target control off a standard fight entirely.
 */
export interface BeastPanelInfo {
  name: string;
  wounds: number;
  maxWounds: number;
  /** The beast's row agility — the denominator of a strike aimed at it. */
  agility: number;
  /** True only while the crouch is live: the one window a strike can take it. */
  targetable: boolean;
}

export type CombatActionType =
  | 'quick_attack'
  | 'power_attack'
  | 'shield_block'
  | 'dodge'
  | 'advance'
  | 'retreat'
  | 'taunt'
  | 'rest'
  | 'telegraph'
  // CH-3b — the retiarius' Cast the Net (once per fight).
  | 'cast_net'
  // D-2 — the beast's crouch, the boss's own action for that slot. It resolves
  // nothing (no hit roll, no damage), which is why it is a boss-only action and
  // never a button the player is offered.
  | 'beast_crouch'
  // D-4 — the Cotta pair's Exposed recovery: the boss's action for that slot
  // after the Crossing has been dodged. It resolves nothing at all (no hit roll,
  // no damage, no stamina) — a tempo beat the player is given, never a button.
  | 'brothers_recovery';

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
  /**
   * CH-3a — the two merged armatura/palma blocks `DuelScene` resolves with.
   * Passing them (rather than rebuilding an approximation here) is what makes
   * every estimate below read the SAME values as resolution.
   */
  playerModifiers?: FighterModifiers;
  opponentModifiers?: FighterModifiers;
  opponentIsBoss?: boolean;
  /** D-2 — the beast, while one is in the arena. Absent on every other duel. */
  beast?: BeastPanelInfo | null;
  onExecuteAction: (action: CombatActionType, target?: AttackTarget) => void;
}

export const TurnActionPanel: React.FC<TurnActionPanelProps> = ({
  player,
  opponent,
  distance,
  isPlayerTurn,
  isExecuting,
  combatLog,
  playerModifiers = EMPTY_MODIFIERS,
  opponentModifiers = EMPTY_MODIFIERS,
  opponentIsBoss = false,
  beast = null,
  onExecuteAction,
}) => {
  // D-2 — the target choice, and it MUST default to the master: a standard duel
  // (and every turn of a beast bout that is not a crouch) is untouched by this
  // control's existence. It resets to the master the moment the window closes.
  const [target, setTarget] = React.useState<AttackTarget>('master');
  const beastTargetable = beast !== null && beast.targetable === true;
  React.useEffect(() => {
    if (!beastTargetable) setTarget('master');
  }, [beastTargetable]);
  const targetingBeast = beastTargetable && target === 'beast';
  const attackTarget: AttackTarget | undefined = targetingBeast ? 'beast' : undefined;
  const effectiveRange = getWeaponRange(player.loadout.weapon);
  const isInWeaponRange = distance <= effectiveRange;
  // D-2 — a strike at the crouching beast is resolved with no range gate
  // (`isBeastStrike` rolls the hit formula alone), so the reach warning belongs
  // to the master only and must never cover a beast strike.
  const strikeOutOfRange = !isInWeaponRange && !targetingBeast;

  // Shield Guard stamina recovery — mirrors the production shield_block
  // action in DuelScene which calls applyStaminaRegen. The displayed value
  // is the *actual* recoverable stamina (clamped by remaining capacity),
  // not the theoretical regen rate.
  const shieldRecovery = applyStaminaRegen(
    player.stamina,
    player.stats.staminaMax,
    player.stats.staminaRegen,
  ) - player.stamina;

  // Calculate hit probability percentages (shared with combat resolution) —
  // CH-3a: the effective AGI the duel actually rolls against. CH-3b: while the
  // player is entangled the displayed figure is the one resolution rolls
  // against, i.e. the −25 pp penalty applied to the formula's RESULT.
  const playerAgi = hitAgilityFor(player.stats.agility, playerModifiers);
  const oppAgi = hitAgilityFor(opponent.stats.agility, opponentModifiers);
  const playerEntangled = isEntangled(player.entangledTurns);
  const quickHitPct = entangledHitChance(calculateHitChance(true, playerAgi, oppAgi), true, playerEntangled);
  const powerHitPct = entangledHitChance(calculateHitChance(false, playerAgi, oppAgi), false, playerEntangled);
  // CH-3b — the net is the retiarius' alone, and only while it is unspent.
  const isRetiarius = playerModifiers.armaturaId === 'retiarius';
  const netReady = canCastNet(player.netAvailable);

  // D-2 — the estimates when the strike is aimed at the crouching beast: the same
  // formula the resolution rolls, with the BEAST's own row agility as the
  // defender. Its "damage" is a wound, not HP, so the card says so.
  const beastAgility = beast?.agility ?? 0;
  const beastQuickHitPct = beast
    ? entangledHitChance(calculateHitChance(true, playerAgi, beastAgility), true, playerEntangled)
    : 0;
  const beastPowerHitPct = beast
    ? entangledHitChance(calculateHitChance(false, playerAgi, beastAgility), false, playerEntangled)
    : 0;
  const quickDisplayHitPct = targetingBeast ? beastQuickHitPct : quickHitPct;
  const powerDisplayHitPct = targetingBeast ? beastPowerHitPct : powerHitPct;

  // Estimated damage using the same calculation pipeline as combat,
  // accounting for the opponent's defense stat. Quick attacks cannot
  // crit, so the estimate is a single value. Power attacks show the
  // non-crit minimum and crit maximum.
  const str = player.stats.strength;
  const oppDef = opponent.stats.defense;
  const weapon = player.loadout.weapon;

  // CH-3a — the damage signature resolution will hand calculateAttackDamage:
  // attacker damageDealtMult ÷ defender damageTakenMult, with the same
  // conditions (health thresholds, boss flag, attack type, Mirror Drill's
  // ledger, Spearman's Ground's bands) evaluated by the same helper.
  const estimateTraitMult = (isQuick: boolean) =>
    resolveTraitMult(playerModifiers, opponentModifiers, {
      isQuick,
      distance,
      effectiveRange,
      attackerHealth: player.health,
      attackerHealthMax: player.stats.healthMax,
      defenderHealth: opponent.health,
      defenderHealthMax: opponent.stats.healthMax,
      defenderIsBoss: opponentIsBoss,
      defenderTypesHit: opponent.mirrorDrillTypes,
    });

  const quickDmgMin = calculateAttackDamage(
    weapon.damageLight, str, false, oppDef, false, 0, 1.0, estimateTraitMult(true),
  );
  const quickDmgMax = quickDmgMin;

  const powerDmgMin = calculateAttackDamage(
    weapon.damageHeavy, str, false, oppDef, false, 0, 1.0, estimateTraitMult(false),
  );
  const powerDmgMax = calculateAttackDamage(
    weapon.damageHeavy, str, true, oppDef, false, 0, 1.0, estimateTraitMult(false),
  );

  // Weapon-specific stamina costs (shared with combat resolution) — CH-3a: the
  // block's staminaCostMult applied exactly as the attack branch applies it.
  const quickStaminaCost = staminaCostWithModifiers(getStaminaCost(weapon, true), true, playerModifiers);
  const powerStaminaCost = staminaCostWithModifiers(getStaminaCost(weapon, false), false, playerModifiers);

  // CH-3a — the block the Shield Guard button will actually absorb with
  // (weapon reduction + the block's add, capped at 0.90).
  const blockAbsorbPct = Math.round(blockReductionFor(weapon.blockReduction, playerModifiers) * 100);

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
        <div className="turn-banner flex flex-wrap items-center justify-between gap-1 bg-neutral-900/90 border border-amber-700/50 px-3 py-1.5 rounded-xl">
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

          {/* D-2 — THE TARGET CHOICE. It lives in this banner so the standard
              duel's layout does not grow a row, it defaults to the master, and it
              is two real buttons: one tap on touch, Enter/Space on a keyboard.
              Each is a 48dp target, so it meets the same floor as every other
              combat control. */}
          {beastTargetable && beast && (
            <div
              className="flex items-center gap-1"
              data-beast-target-control="true"
              role="group"
              aria-label={`Who to strike — ${opponent.name} or ${beast.name}`}
            >
              <button
                type="button"
                data-beast-target="master"
                aria-pressed={!targetingBeast}
                onClick={() => setTarget('master')}
                className={`min-h-[48px] min-w-[48px] px-2 rounded-lg border text-[10px] font-serif font-black uppercase tracking-wide transition-all active:scale-95 cursor-pointer ${
                  !targetingBeast
                    ? 'bg-red-900/80 border-red-400 text-red-100'
                    : 'bg-neutral-900/80 border-neutral-700 text-neutral-400 hover:text-red-200'
                }`}
              >
                {opponent.name.split(' the ')[0]}
              </button>
              <button
                type="button"
                data-beast-target="beast"
                aria-pressed={targetingBeast}
                onClick={() => setTarget('beast')}
                className={`min-h-[48px] min-w-[48px] px-2 rounded-lg border text-[10px] font-serif font-black uppercase tracking-wide transition-all active:scale-95 cursor-pointer ${
                  targetingBeast
                    ? 'bg-amber-700/90 border-amber-300 text-amber-50'
                    : 'bg-neutral-900/80 border-neutral-700 text-neutral-400 hover:text-amber-200'
                }`}
              >
                {beast.name}
              </button>
            </div>
          )}

          <div className="text-[10px] font-mono text-amber-300/80 hidden sm:block">
            STAMINA: <strong className="text-amber-100">{Math.round(player.stamina)} SP</strong>
          </div>
        </div>

        {/* COMMAND ACTION BUTTONS GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
          {/* 1. QUICK STRIKE */}
          <button
            onClick={() => onExecuteAction('quick_attack', attackTarget)}
            disabled={!isPlayerTurn || isExecuting || player.stamina < quickStaminaCost || strikeOutOfRange}
            className={`group relative p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer active:scale-95 text-left ${
              !isPlayerTurn || isExecuting || player.stamina < quickStaminaCost
                ? 'bg-neutral-900/50 border-neutral-800 opacity-50 pointer-events-none'
                : strikeOutOfRange
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
                {quickStaminaCost} SP
              </span>
            </div>

            <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
              Fast, reliable attack with high precision.
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-amber-900/40">
              <span className="text-emerald-400 font-bold">{quickDisplayHitPct}% Hit</span>
              <span className="text-amber-300 font-bold">
                {targetingBeast ? '1 WOUND' : `${quickDmgMin}-${quickDmgMax} Dmg`}
              </span>
            </div>

            {strikeOutOfRange && (
              <div className="absolute inset-0 bg-neutral-950/85 backdrop-blur-[1px] rounded-xl flex items-center justify-center p-1 text-center text-[10px] font-mono text-amber-400 font-bold border border-amber-700/50">
                Out of Range (Advance)
              </div>
            )}
          </button>

          {/* 2. POWER SLASH / HEAVY ATTACK */}
          <button
            onClick={() => onExecuteAction('power_attack', attackTarget)}
            disabled={!isPlayerTurn || isExecuting || player.stamina < powerStaminaCost || strikeOutOfRange}
            className={`group relative p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer active:scale-95 text-left ${
              !isPlayerTurn || isExecuting || player.stamina < powerStaminaCost
                ? 'bg-neutral-900/50 border-neutral-800 opacity-50 pointer-events-none'
                : strikeOutOfRange
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
                {powerStaminaCost} SP
              </span>
            </div>

            <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
              Brutal blow with high critical strike potential.
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-red-900/40">
              <span className="text-yellow-400 font-bold">{powerDisplayHitPct}% Hit</span>
              <span className="text-rose-300 font-bold">
                {targetingBeast ? '1 WOUND' : `${powerDmgMin}-${powerDmgMax} Dmg`}
              </span>
            </div>

            {strikeOutOfRange && (
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
                +{shieldRecovery} SP
              </span>
            </div>

            <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
              Brace to absorb {blockAbsorbPct}% of incoming damage.
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-cyan-900/40">
              <span className="text-cyan-300 font-bold">{blockAbsorbPct}% Absorb</span>
              <span className="text-emerald-300 font-bold">+{shieldRecovery} SP</span>
            </div>
          </button>

          {/* 4. DODGE / EVASION STANCE */}
          <button
            onClick={() => onExecuteAction('dodge')}
            disabled={!isPlayerTurn || isExecuting || player.stamina < 12}
            className={`p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer active:scale-95 text-left ${
              !isPlayerTurn || isExecuting || player.stamina < 12
                ? 'bg-neutral-900/50 border-neutral-800 opacity-50 pointer-events-none'
                : 'bg-gradient-to-br from-teal-950 via-neutral-900 to-emerald-950 border-teal-500 hover:border-teal-300 text-teal-100 shadow-lg'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-serif font-black text-xs sm:text-sm text-teal-200 flex items-center gap-1">
                <Wind className="w-3.5 h-3.5 text-teal-400" />
                <span>Dodge</span>
              </span>
              <span className="text-[9px] font-mono bg-teal-950/80 border border-teal-700/60 px-1 py-0.2 rounded text-teal-300">
                12 SP
              </span>
            </div>

            <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
              Enter an evasion stance — 75% chance to evade the next strike.
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-teal-900/40">
              <span className="text-teal-300 font-bold">75% Evade</span>
              <span className="text-rose-300 font-bold">−12 SP</span>
            </div>
          </button>

          {/* 5. CAST THE NET — retiarius doctrina (CH-3b), once per fight */}
          {isRetiarius && (
            <button
              onClick={() => onExecuteAction('cast_net', attackTarget)}
              disabled={!isPlayerTurn || isExecuting || !netReady}
              className={`group relative p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer active:scale-95 text-left ${
                !isPlayerTurn || isExecuting || !netReady
                  ? 'bg-neutral-900/50 border-neutral-800 opacity-50 pointer-events-none'
                  : 'bg-gradient-to-br from-stone-900 via-neutral-900 to-amber-950 border-amber-400 hover:border-amber-200 text-amber-100 shadow-lg hover:shadow-amber-500/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-serif font-black text-xs sm:text-sm text-amber-100 flex items-center gap-1">
                  <Grid3x3 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Cast the Net</span>
                </span>
                <span className="text-[9px] font-mono bg-amber-950/80 border border-amber-700/60 px-1 py-0.2 rounded text-amber-300">
                  {netReady ? 'ONCE' : 'SPENT'}
                </span>
              </div>

              <div className="tactic-desc text-[10px] text-neutral-300 font-sans leading-tight mb-1">
                {!netReady
                  ? 'The net is spent for this fight.'
                  : targetingBeast
                  ? 'Net the beast — the pounce dies and it loses two cadences. No helm to refuse it.'
                  : 'Hurl the net — entangle them for two turns. Secutors are immune.'}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-amber-900/40">
                <span className="text-amber-300 font-bold">
                  {Math.round(NET_LAND_CHANCE * 100)}% Entangle
                </span>
                <span className="text-emerald-300 font-bold">−{ENTANGLE_HIT_PENALTY}% Foe Hit</span>
              </div>
            </button>
          )}

          {/* 6. TAUNT CROWD / REST */}
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
              disabled={!isPlayerTurn || isExecuting || isInWeaponRange}
              className={`min-h-[48px] px-3 py-1.5 rounded-lg border text-xs font-serif font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                !isPlayerTurn || isExecuting || isInWeaponRange
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
              className={`min-h-[48px] px-3 py-1.5 rounded-lg border text-xs font-serif font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
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
            className={`min-h-[48px] px-3 py-1.5 rounded-lg border text-xs font-serif font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
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
