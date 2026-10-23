import React, { useState } from 'react';
import { PlayerProfile, ArmaturaId } from '../../types/game';
import { calculateTotalStats } from '../../services/storage';
import { Swords, Shield, Heart, Zap, Flame, Activity, Crown, HeartPulse, FlaskConical, ScrollText } from 'lucide-react';
import { ARMATURAE, getArmatura } from '../../data/armaturae';
import { resolveArmatura } from '../../utils/traitModifiers';
import { canRepledgeArmatura } from '../../utils/armaturaPledge';
import { resolveActiveInjury } from '../../utils/injury';
import { getConsumableCount, ownedConsumables } from '../../utils/consumables';
import { CampaignCard } from './CampaignCard';
import { deriveRank } from '../../utils/rank';
import { STATUE_OWNED_LINE, ownedTriumphs, resolveLaurels } from '../../utils/laurels';

interface StatsTabProps {
  profile: PlayerProfile;
  onAllocatePoint: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
  /** S6 — one-tap use of an owned consumable; `App` applies it and writes the save. */
  onUseConsumable?: (itemId: string) => void;
  /**
   * CH-2 — the one-time legacy re-pledge.  A profile whose class was only INFERRED
   * gets this action; `App` writes the chosen id (and nothing else) through its
   * single save path.  Absent handler = no action offered.
   */
  onRepledgeArmatura?: (armatura: ArmaturaId) => void;
}

export const StatsTab: React.FC<StatsTabProps> = ({
  profile,
  onAllocatePoint,
  onUseConsumable,
  onRepledgeArmatura,
}) => {
  const total = calculateTotalStats(profile);
  /**
   * CH-2 — the class and its doctrina, read through the one resolver the game
   * already owns (an explicit `armatura` wins; otherwise the model infers it).
   * Read-only: this panel writes nothing.  The re-pledge action below is the only
   * write this screen offers, and only while the field was never explicitly set.
   */
  const armatura = getArmatura(resolveArmatura(profile));
  const canRepledge = canRepledgeArmatura(profile);
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const totalStamina = total.stamina ?? profile.baseStats.stamina;
  /**
   * P2 — the rank shown here is DERIVED from the record (`utils/rank.ts`
   * `deriveRank`), never the stored `rank` field: nothing advances that field after
   * creation, so printing it as truth would tell a Champion he is a Rookie.  The
   * Triumphs beside it are read through the pure `resolveLaurels`/`ownedTriumphs`
   * helpers — this view writes nothing.
   */
  const rank = deriveRank(profile);
  const laurels = resolveLaurels(profile);
  const triumphs = ownedTriumphs(profile);
  /**
   * S4 — the live injury. `calculateTotalStats` above has already netted its
   * penalties, so this is where the player can see where the missing STR/AGI went.
   * Read-only; no injury means nothing is added here.
   */
  const activeInjury = resolveActiveInjury(profile.injury);
  /**
   * S6 — the consumables this gladiator could use RIGHT NOW. The row exists only
   * while there is a live wound and at least one item is owned, so a healthy
   * profile (or an empty satchel) adds nothing at all.
   */
  const usableConsumables = activeInjury ? ownedConsumables(profile) : [];

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full pb-12">
      {/* STORY-1 — the campaign card heads this view, above everything already
          here.  This tab is the Records & Lore Library's own screen on this
          branch: the library building's hub entry (`cityCollisions.ts`,
          `records_house` — "Records & Lore Library") opens `tabKey: 'stats'`,
          and there is no separate Library page tree or Road page in the tree at
          this point.  Read-only: it renders the chapter resolved from the
          profile and writes nothing. */}
      <CampaignCard profile={profile} />

      <div className="bg-neutral-900/80 border-2 border-purple-500/60 rounded-3xl p-6 shadow-xl flex justify-between items-center">
        <div>
          <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mb-1">
            {profile.name}
          </h3>
          <div className="text-xs font-serif text-purple-300 italic">{profile.title}</div>
        </div>
        <div className="text-right">
          <div className="font-serif font-bold text-sm text-amber-300">Level {profile.level}</div>
          <div className="text-[11px] font-mono text-neutral-400">
            XP: {profile.xp} / {profile.xpToNextLevel}
          </div>
        </div>
      </div>

      {/* CH-2 — ARMATURA & DOCTRINA (read-only).  The class sets the stat template
          and the signature technique; nothing here is editable except the one-time
          re-pledge a legacy save is offered below. */}
      {armatura && (
        <div
          data-armatura={armatura.id}
          className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg"
        >
          <h4 className="font-serif font-bold text-sm text-amber-300 mb-4 uppercase tracking-wider flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-amber-400" />
            <span>Armatura &amp; Doctrina</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl">
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Armatura</div>
              <div className="font-serif font-black text-xl text-amber-200 mt-1">{armatura.name}</div>
              <p className="text-[11px] font-serif italic text-neutral-400 mt-1">{armatura.fantasy}</p>
              <p className="text-[10px] font-mono text-amber-400/70 mt-1">
                STR {armatura.stats.strength} · AGI {armatura.stats.agility} · STA{' '}
                {armatura.stats.stamina} · DEF {armatura.stats.defense}
              </p>
            </div>
            <div
              className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl"
              data-doctrina={armatura.doctrina.id}
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Doctrina</div>
              <div className="font-serif font-black text-xl text-amber-200 mt-1">
                {armatura.doctrina.name}
              </div>
              <p className="text-[11px] font-serif text-neutral-300 mt-1">{armatura.doctrina.text}</p>
            </div>
          </div>

          {canRepledge && onRepledgeArmatura && (
            <div className="mt-4" data-repledge-armatura>
              <button
                type="button"
                onClick={() => setPledgeOpen((open) => !open)}
                aria-expanded={pledgeOpen}
                className="min-h-[48px] w-full px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-amber-200 font-serif font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                Re-pledge your Armatura
              </button>
              <p className="text-[11px] font-serif text-neutral-400 mt-2">
                Your class was read from your look. Choose it once, free — your stats, gear and honours stay exactly as they are.
              </p>
              {pledgeOpen && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2" data-repledge-options>
                  {ARMATURAE.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      data-repledge-choice={option.id}
                      onClick={() => onRepledgeArmatura(option.id)}
                      className="min-h-[48px] text-left px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-700 hover:border-amber-500 text-neutral-200 cursor-pointer"
                    >
                      <span className="block font-serif font-bold text-sm text-amber-200">{option.name}</span>
                      <span className="block text-[10px] font-serif italic text-neutral-400">{option.fantasy}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CAREER — the derived rank beside fame, and every Triumph owned. */}
      <div
        className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg"
        data-career
      >
        <h4 className="font-serif font-bold text-sm text-amber-300 mb-4 uppercase tracking-wider flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          <span>Career</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl" data-rank={rank}>
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Rank</div>
            <div className="font-serif font-black text-xl text-amber-200 mt-1">{rank}</div>
            <div className="text-[10px] font-mono text-neutral-500 mt-1">Earned from fame and the circuit.</div>
          </div>
          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl" data-fame={profile.fame}>
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Fame</div>
            <div className="font-mono font-black text-xl text-yellow-300 mt-1">
              {profile.fame.toLocaleString('en-US')}
            </div>
            <div className="text-[10px] font-mono text-neutral-500 mt-1">Spent on Triumphs, never on gold.</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            Triumphs owned
          </div>
          {triumphs.length === 0 ? (
            <p className="mt-1.5 font-serif text-xs italic text-neutral-500" data-triumphs-none>
              No Triumphs yet.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {triumphs.map((triumph) => (
                <li
                  key={triumph.id}
                  data-owned-triumph={triumph.id}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/50 text-[11px] font-mono uppercase tracking-wider text-amber-200"
                >
                  {triumph.name}
                </li>
              ))}
            </ul>
          )}
          {laurels.statue && (
            <p className="mt-2 font-serif text-xs text-amber-200" data-statue-line>
              {STATUE_OWNED_LINE}
            </p>
          )}
        </div>
      </div>

      {/* UNSPENT POINTS BANNER */}
      {profile.unspentStatPoints > 0 && (
        <div className="bg-amber-500/20 border border-amber-400 p-4 rounded-2xl flex justify-between items-center animate-pulse">
          <span className="font-serif font-bold text-sm text-amber-200">
            You have {profile.unspentStatPoints} unspent stat point(s)!
          </span>
        </div>
      )}

      {/* S4 — THE INJURY */}
      {activeInjury && (
        <div
          data-injury={activeInjury.fightsRemaining}
          className="bg-red-950/40 border border-red-600/60 rounded-2xl p-4 flex flex-wrap items-center gap-3"
        >
          <HeartPulse className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <div className="font-serif font-bold text-sm text-red-200 uppercase tracking-wider">
              Injured
            </div>
            <p className="text-xs font-mono text-red-300/90 mt-0.5">
              −{activeInjury.penaltyStrength} STR / −{activeInjury.penaltyAgility} AGI ·{' '}
              {activeInjury.fightsRemaining}{' '}
              {activeInjury.fightsRemaining === 1 ? 'fight' : 'fights'} remaining
            </p>
          </div>

          {/* S6 — the compact one-tap use row. It appears only while injured and
              only for what is actually carried; each button spends one item and
              hands the wound back to `App`'s transaction. */}
          {usableConsumables.length > 0 && (
            <div className="w-full flex flex-wrap gap-2" data-consumable-row>
              {usableConsumables.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-use-consumable={item.id}
                  onClick={() => onUseConsumable?.(item.id)}
                  className="min-h-[40px] px-3 rounded-xl bg-red-900/60 hover:bg-red-800/70 border border-red-500/70 text-neutral-100 text-[11px] font-mono uppercase tracking-wider cursor-pointer active:scale-[0.98] transition-all flex items-center gap-1.5"
                >
                  <FlaskConical className="w-3.5 h-3.5 text-amber-300" />
                  <span>
                    Use {item.name} ({getConsumableCount(profile, item.id)})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PRIMARY ATTRIBUTES */}
      <div>
        <h4 className="font-serif font-bold text-sm text-amber-300 mb-3 uppercase tracking-wider">
          Primary Attributes
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'strength', name: 'Strength', val: total.strength, base: profile.baseStats.strength, icon: Swords, color: 'text-red-400', desc: 'Increases light & heavy attack damage.' },
            { key: 'agility', name: 'Agility', val: total.agility, base: profile.baseStats.agility, icon: Zap, color: 'text-yellow-400', desc: 'Movement speed & hit probability.' },
            { key: 'stamina', name: 'Stamina', val: totalStamina, base: profile.baseStats.stamina, icon: Heart, color: 'text-green-400', desc: 'Max energy pool & recovery rate.' },
            { key: 'defense', name: 'Defense', val: total.defense, base: profile.baseStats.defense, icon: Shield, color: 'text-blue-400', desc: 'Damage reduction & block resistance.' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 shadow-lg flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                    <span className="font-serif font-bold text-base text-amber-100">{item.name}</span>
                  </div>
                  <p className="text-xs text-neutral-400">{item.desc}</p>
                  <div className="text-[11px] font-mono text-amber-400/70 mt-1">Base: {item.base}</div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono font-black text-xl text-yellow-300">{item.val}</span>
                  {profile.unspentStatPoints > 0 && (
                    <button
                      onClick={() => onAllocatePoint(item.key as 'strength' | 'agility' | 'stamina' | 'defense')}
                      aria-label={`Raise ${item.name}`}
                      className="w-12 h-12 min-h-[48px] min-w-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-lg flex items-center justify-center cursor-pointer shadow-md"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DERIVED COMBAT STATISTICS */}
      <div className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg">
        <h4 className="font-serif font-bold text-sm text-amber-300 mb-4 uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <span>Derived Combat Statistics</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-4 h-4 text-red-400" />
              <span className="font-serif font-bold text-xs text-amber-100">Max Health</span>
            </div>
            <div className="font-mono font-black text-2xl text-red-400 mt-1">
              {total.healthMax} <span className="text-xs font-normal text-neutral-400">HP</span>
            </div>
            <div className="text-[10px] font-mono text-neutral-500 mt-2">
              Formula: 80 + Str×4 + Def×3
            </div>
          </div>

          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-green-400" />
              <span className="font-serif font-bold text-xs text-amber-100">Max Stamina</span>
            </div>
            <div className="font-mono font-black text-2xl text-green-400 mt-1">
              {total.staminaMax} <span className="text-xs font-normal text-neutral-400">SP</span>
            </div>
            <div className="text-[10px] font-mono text-neutral-500 mt-2">
              Formula: 70 + Sta×5
            </div>
          </div>

          <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-4 h-4 text-yellow-400" />
              <span className="font-serif font-bold text-xs text-amber-100">Stamina Recovery</span>
            </div>
            <div className="font-mono font-black text-2xl text-yellow-400 mt-1">
              {total.staminaRegen.toFixed(1)} <span className="text-xs font-normal text-neutral-400">SP/s</span>
            </div>
            <div className="text-[10px] font-mono text-neutral-500 mt-2">
              Formula: 12 + Agi×0.8 + Sta×0.4
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
