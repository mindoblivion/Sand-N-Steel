import React, { useEffect, useState } from 'react';
import { PlayerProfile, WeaponItem, ArmorItem, ChariotTeamSize } from '../../types/game';
import { Layers, Shield, Swords, Check, Wrench, Coins, Hammer } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { getItemById } from '../../data/itemsDB';
import { getTemperSellValue } from '../../utils/tempering';
import {
  describeForgeCraftRejection,
  getArmorRecipeForInput,
  getForgeCraftEligibility,
  getForgeRecipeForInput,
} from '../../utils/forgeCrafting';
import { gildedUnlocked, requiresMasterForge } from '../../utils/facilityProgression';
import { TemperControl } from './TemperControl';
import { ChariotWorkshopTab } from './ChariotWorkshopTab';
import { RacingConfigSection } from './RacingConfigSection';

/** The Armory's own subview (Phase C-8.66B): the gear list, or the Chariot Workshop. */
export type GearView = 'armory' | 'chariot';

interface GearTabProps {
  profile: PlayerProfile;
  onEquipWeapon: (wpn: WeaponItem) => void;
  onEquipArmor: (armor: ArmorItem) => void;
  /**
   * C-2 — the Armory is the one sell surface: a spare card sells for its
   * `sellPrice` plus 25 % of the temper gold sunk into it (`getTemperSellValue`),
   * through App's existing sell path.  Optional so the tab works unwired.
   */
  onSellItem?: (item: WeaponItem | ArmorItem) => void;
  /** Which subview is open.  Optional so the tab works with no chariot wiring. */
  gearView?: GearView;
  onGearViewChange?: (view: GearView) => void;
  onBuyChariotPart?: (partId: string) => void;
  onEquipChariotPart?: (partId: string) => void;
  /**
   * Phase C-8.67C — the Racing Configuration section shown below the workshop's
   * fit and cosmetic cards.  App wires these to the pure racing-progression
   * helpers and the existing `saveProfile()` path.  Both optional so the tab
   * works with no racing wiring.
   */
  onBuyRacingConfig?: (horses: ChariotTeamSize) => void;
  onSelectRacingConfig?: (horses: ChariotTeamSize) => void;
  /**
   * P6 — the temper row on every owned card.  `App` runs `purchaseTemper` and
   * the existing save path; this tab never computes a level, a price or a cap.
   */
  onTemperItem?: (itemId: string) => void;
  /**
   * FORGECRAFT-1 — the forge-crafting section below the weapon cards.  `App`
   * runs `craftForgeItems` and the existing save path; this tab never
   * computes a recipe, a fee or a refusal.  The indices are inventory
   * indices — two copies of one id are distinct entries.
   */
  onCraftItems?: (aIndex: number, bIndex: number) => void;
  /** P6 — the Stable panel inside the workshop subview; `App` runs the P4 helpers. */
  onBuyStableQuality?: (grade: number) => void;
  onBuyStableConditioning?: (level: number) => void;
  onUpdateProfile?: (updated: PlayerProfile) => void;
}

/** C-2 — how long a Sell control stays armed before its confirmation lapses. */
const SELL_CONFIRM_ARM_MS = 3000;

/**
 * C-2 — the Armory's two-tap sell control.  The first tap arms it (the label turns
 * into `Confirm?` and the control goes red), the second sells; a single tap never
 * removes an item.
 */
const SellButton: React.FC<{
  value: number;
  armed: boolean;
  onArm: () => void;
  onSell: () => void;
}> = ({ value, armed, onArm, onSell }) => (
  <button
    onClick={() => (armed ? onSell() : onArm())}
    title={armed ? 'Tap again to sell' : `Sell for ${value} Gold`}
    className={`px-3 py-2 rounded-xl text-xs font-serif font-bold cursor-pointer transition-all active:scale-95 border flex items-center gap-1.5 ${
      armed
        ? 'bg-red-600 border-red-300 text-white shadow-lg'
        : 'bg-neutral-950 text-red-300 border-red-900/70 hover:text-red-200 hover:border-red-700'
    }`}
  >
    <Coins className="w-3.5 h-3.5" />
    <span>{armed ? 'Confirm?' : `Sell for ${value} Gold`}</span>
  </button>
);

const GEAR_VIEWS: { key: GearView; label: string; icon: typeof Layers }[] = [
  { key: 'armory', label: 'Gladiator Loadout', icon: Layers },
  { key: 'chariot', label: 'Chariot Workshop', icon: Wrench },
];

/**
 * FORGECRAFT-1 — the forge-crafting section in the Armory.
 *
 * This component owns NO transaction and NO rule.  The recipe, the fee,
 * whether the craft is allowed and the sentence a refusal prints all come
 * from `utils/forgeCrafting.ts` — the section therefore cannot disagree
 * with the craft that fires behind it, and it never computes a fee of its
 * own.  The two pickers name INVENTORY indices (two copies of one id are
 * distinct entries); the equipped copy is labelled as such and refuses with
 * the module's own sentence when picked.
 */
const ForgeCraftSection: React.FC<{
  profile: PlayerProfile;
  onCraftItems?: (aIndex: number, bIndex: number) => void;
}> = ({ profile, onCraftItems }) => {
  const [pickA, setPickA] = useState<number | null>(null);
  const [pickB, setPickB] = useState<number | null>(null);

  // A profile write (a craft, a sale, an equip, a purchase) clears the picks:
  // the indices they named may point at different items afterwards.
  useEffect(() => {
    setPickA(null);
    setPickB(null);
  }, [profile]);

  // The carried weapons with their inventory indices — the pickers name
  // entries, not ids, so two copies of one weapon stay distinct.
  const carriedWeapons = profile.inventory
    .map((entry, index) => ({ entry, index }))
    .filter(
      (carried): carried is { entry: WeaponItem; index: number } =>
        'damageLight' in carried.entry
    );
  const equippedIndex = carriedWeapons.find(
    (carried) => carried.entry.id === profile.equipped.weapon?.id
  )?.index;

  const eligibility =
    pickA !== null && pickB !== null
      ? getForgeCraftEligibility(profile, pickA, pickB, 'weapon')
      : null;
  const rejection = eligibility && !eligibility.ok
    ? describeForgeCraftRejection(eligibility.reason)
    : null;

  const handleForge = () => {
    if (!eligibility?.ok || pickA === null || pickB === null) return;
    sounds.playCoin();
    onCraftItems?.(pickA, pickB);
  };

  // One option per carried weapon.  The label names the forge path where one
  // exists, so an uncraftable piece says so in the list itself.
  const optionLabel = (carried: { entry: WeaponItem; index: number }) => {
    const copies = carriedWeapons.filter((other) => other.entry.id === carried.entry.id);
    const occurrence = copies.findIndex((other) => other.index === carried.index) + 1;
    const copySuffix = copies.length > 1 ? ` #${occurrence}` : '';
    const equippedSuffix = carried.index === equippedIndex ? ' (equipped)' : '';
    const recipe = getForgeRecipeForInput(carried.entry.id);
    if (recipe) {
      const result = getItemById(recipe.resultId);
      return `${carried.entry.name}${copySuffix}${equippedSuffix} → ${result?.name ?? '?'}`;
    }
    const wooden = ['wooden_sword_shield', 'wooden_spear', 'wooden_daggers'].includes(
      carried.entry.id
    );
    return `${carried.entry.name}${copySuffix}${equippedSuffix} — ${
      wooden ? 'wooden, no forge path' : 'no forge path'
    }`;
  };

  const picker = (
    label: string,
    value: number | null,
    onPick: (index: number | null) => void
  ) => (
    <label className="flex flex-col gap-1 min-w-0 flex-1">
      <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      <select
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          sounds.playClick();
          onPick(event.target.value === '' ? null : Number(event.target.value));
        }}
        className="min-h-[48px] w-full rounded-xl bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm font-serif text-amber-100 cursor-pointer"
      >
        <option value="">Choose a weapon…</option>
        {carriedWeapons.map((carried) => (
          <option key={carried.index} value={carried.index}>
            {optionLabel(carried)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      data-forge-craft
      data-forge-craft-ok={eligibility?.ok ? '1' : '0'}
      className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg"
    >
      <h4 className="font-serif font-bold text-lg text-amber-300 mb-1 flex items-center gap-2">
        <Hammer className="w-5 h-5 text-amber-400" />
        <span>Forge Crafting</span>
      </h4>
      <p className="text-sm text-neutral-300 font-serif mb-4">
        Two copies of one weapon, plus the forge fee, hammer into the next weapon up its
        ladder. Armor is crafted at the armorer — see Armorer Crafting below.
      </p>

      {carriedWeapons.length < 2 ? (
        <p className="text-xs text-neutral-500 italic">
          Carry two copies of a weapon to forge. A spare can be bought at the forge.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {picker('First weapon', pickA, setPickA)}
            {picker('Second weapon', pickB, setPickB)}
          </div>

          {eligibility?.ok && 'damageLight' in eligibility.result ? (
            <p className="text-sm font-serif text-amber-100">
              Forges into <strong className="text-yellow-300">{eligibility.result.name}</strong>{' '}
              ({eligibility.result.damageLight}/{eligibility.result.damageHeavy} dmg) for{' '}
              <strong className="text-yellow-300">{eligibility.fee} Gold</strong>.
            </p>
          ) : (
            <p className="text-sm font-serif italic text-neutral-400">
              {rejection ??
                'Choose two copies of the same weapon to see what the forge makes of them.'}
            </p>
          )}

          <div>
            <button
              onClick={handleForge}
              disabled={!eligibility?.ok}
              title={rejection ?? (eligibility?.ok ? `Forge for ${eligibility.fee} gold` : undefined)}
              className={`min-h-[48px] px-4 py-2 rounded-xl text-xs font-serif font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                eligibility?.ok
                  ? 'bg-amber-600 hover:bg-amber-500 text-neutral-950 active:scale-95'
                  : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
              }`}
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>
                {eligibility?.ok ? `Forge (${eligibility.fee} Gold)` : 'Forge'}
              </span>
            </button>
            {/* UI-1 (B-17) — a touch player never sees a title attribute, so the
                refusal is printed under the disabled control as well. */}
            {rejection && (
              <p
                data-forge-craft-rejection="1"
                className="text-[11px] font-serif leading-snug text-red-300 mt-1.5"
              >
                {rejection}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * FORGECRAFT-2 — the armorer-crafting section in the Armory, beside the
 * forge-crafting section.
 *
 * The mirror of `ForgeCraftSection`, for armor: it owns NO transaction and
 * NO rule.  The recipe, the fee, whether the craft is allowed and the
 * sentence a refusal prints all come from `utils/forgeCrafting.ts` — the
 * section therefore cannot disagree with the craft that fires behind it,
 * and it never computes a fee of its own.  The two pickers name INVENTORY
 * indices (two copies of one piece stay distinct); the equipped copy is
 * labelled as such and refuses with the module's own sentence when picked.
 * The two champion-gilded results wait for the Smithing Workshop at L2 —
 * the gate shows in the option label and in the refusal sentence, like
 * tempering's workshop gates.
 *
 * Copy note: the honest economics, not a discount claim — a craft turns two
 * spares you'd otherwise trade in into a better piece for less than the
 * shop price.  (And no `sell` wording anywhere in this section: the CORR-1
 * selling-surface test asserts an unwired Armory shows no /sell/i text.)
 */
const ArmorCraftSection: React.FC<{
  profile: PlayerProfile;
  onCraftItems?: (aIndex: number, bIndex: number) => void;
}> = ({ profile, onCraftItems }) => {
  const [pickA, setPickA] = useState<number | null>(null);
  const [pickB, setPickB] = useState<number | null>(null);

  // A profile write (a craft, a sale, an equip, a purchase) clears the picks:
  // the indices they named may point at different items afterwards.
  useEffect(() => {
    setPickA(null);
    setPickB(null);
  }, [profile]);

  // The carried armor with its inventory indices — the pickers name
  // entries, not ids, so two copies of one piece stay distinct.
  const carriedArmors = profile.inventory
    .map((entry, index) => ({ entry, index }))
    .filter(
      (carried): carried is { entry: ArmorItem; index: number } =>
        'defense' in carried.entry
    );

  // The equipped copy for a piece is the first carried entry with the id
  // equipped in that piece's slot (the selling.ts / GearTab rule).
  const equippedIndexFor = (entry: ArmorItem): number => {
    const equippedId = profile.equipped[entry.slot]?.id;
    if (!equippedId) return -1;
    return carriedArmors.find((carried) => carried.entry.id === equippedId)?.index ?? -1;
  };

  const eligibility =
    pickA !== null && pickB !== null
      ? getForgeCraftEligibility(profile, pickA, pickB, 'armor')
      : null;
  const rejection = eligibility && !eligibility.ok
    ? describeForgeCraftRejection(eligibility.reason)
    : null;

  const handleCraft = () => {
    if (!eligibility?.ok || pickA === null || pickB === null) return;
    sounds.playCoin();
    onCraftItems?.(pickA, pickB);
  };

  // One option per carried piece.  The label names the forge path where one
  // exists, so an uncraftable piece says so in the list itself — and a
  // champion result behind the Master Forge gate says so too.
  const optionLabel = (carried: { entry: ArmorItem; index: number }) => {
    const copies = carriedArmors.filter((other) => other.entry.id === carried.entry.id);
    const occurrence = copies.findIndex((other) => other.index === carried.index) + 1;
    const copySuffix = copies.length > 1 ? ` #${occurrence}` : '';
    const equippedSuffix = carried.index === equippedIndexFor(carried.entry) ? ' (equipped)' : '';
    const recipe = getArmorRecipeForInput(carried.entry.id);
    if (recipe) {
      const result = getItemById(recipe.resultId);
      const locked = requiresMasterForge(recipe.resultId) && !gildedUnlocked(profile);
      return `${carried.entry.name}${copySuffix}${equippedSuffix} → ${result?.name ?? '?'}${
        locked ? ' (needs Master Forge)' : ''
      }`;
    }
    return `${carried.entry.name}${copySuffix}${equippedSuffix} — no forge path`;
  };

  const picker = (
    label: string,
    value: number | null,
    onPick: (index: number | null) => void
  ) => (
    <label className="flex flex-col gap-1 min-w-0 flex-1">
      <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      <select
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          sounds.playClick();
          onPick(event.target.value === '' ? null : Number(event.target.value));
        }}
        className="min-h-[48px] w-full rounded-xl bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm font-serif text-amber-100 cursor-pointer"
      >
        <option value="">Choose a piece…</option>
        {carriedArmors.map((carried) => (
          <option key={carried.index} value={carried.index}>
            {optionLabel(carried)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      data-armor-craft
      data-armor-craft-ok={eligibility?.ok ? '1' : '0'}
      className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg"
    >
      <h4 className="font-serif font-bold text-lg text-amber-300 mb-1 flex items-center gap-2">
        <Shield className="w-5 h-5 text-amber-400" />
        <span>Armorer Crafting</span>
      </h4>
      <p className="text-sm text-neutral-300 font-serif mb-4">
        Two copies of one piece of armor, plus Salvia&apos;s fee, become the next piece up
        its ladder. A craft turns two spares you&apos;d otherwise trade in into a better
        piece for less than the shop price.
      </p>

      {carriedArmors.length < 2 ? (
        <p className="text-xs text-neutral-500 italic">
          Carry two copies of a piece of armor to craft. A spare can be bought at the armorer.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {picker('First piece', pickA, setPickA)}
            {picker('Second piece', pickB, setPickB)}
          </div>

          {eligibility?.ok && 'defense' in eligibility.result ? (
            <p className="text-sm font-serif text-amber-100">
              Crafts into <strong className="text-yellow-300">{eligibility.result.name}</strong>{' '}
              (+{eligibility.result.defense} Def) for{' '}
              <strong className="text-yellow-300">{eligibility.fee} Gold</strong>.
            </p>
          ) : (
            <p className="text-sm font-serif italic text-neutral-400">
              {rejection ??
                'Choose two copies of the same piece to see what the armorer makes of them.'}
            </p>
          )}

          <div>
            <button
              onClick={handleCraft}
              disabled={!eligibility?.ok}
              title={rejection ?? (eligibility?.ok ? `Craft for ${eligibility.fee} gold` : undefined)}
              className={`min-h-[48px] px-4 py-2 rounded-xl text-xs font-serif font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                eligibility?.ok
                  ? 'bg-amber-600 hover:bg-amber-500 text-neutral-950 active:scale-95'
                  : 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>
                {eligibility?.ok ? `Craft (${eligibility.fee} Gold)` : 'Craft'}
              </span>
            </button>
            {/* UI-1 (B-17) — a touch player never sees a title attribute, so the
                refusal is printed under the disabled control as well. */}
            {rejection && (
              <p
                data-armor-craft-rejection="1"
                className="text-[11px] font-serif leading-snug text-red-300 mt-1.5"
              >
                {rejection}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const GearTab: React.FC<GearTabProps> = ({
  profile,
  onEquipWeapon,
  onEquipArmor,
  onSellItem,
  gearView = 'armory',
  onGearViewChange,
  onBuyChariotPart,
  onEquipChariotPart,
  onBuyRacingConfig,
  onSelectRacingConfig,
  onTemperItem,
  onCraftItems,
  onBuyStableQuality,
  onBuyStableConditioning,
  onUpdateProfile,
}) => {
  const currentWeapon = profile.equipped.weapon;
  const currentHelm = profile.equipped.helm;
  const currentChest = profile.equipped.chest;
  const currentShield = profile.equipped.shield;

  const inventoryWeapons = profile.inventory.filter((i): i is WeaponItem => 'damageLight' in i);
  const inventoryArmors = profile.inventory.filter((i): i is ArmorItem => 'defense' in i);

  // C-2 — which card is armed for its confirming second tap.
  const [armedSell, setArmedSell] = useState<string | null>(null);

  // The arm lapses on its own after ~3 s, and it never outlives the card it was
  // armed on: any profile write (a sale, an equip, a purchase) clears it.
  useEffect(() => {
    if (!armedSell) return;
    const timer = window.setTimeout(() => setArmedSell(null), SELL_CONFIRM_ARM_MS);
    return () => window.clearTimeout(timer);
  }, [armedSell]);

  useEffect(() => {
    setArmedSell(null);
  }, [profile]);

  // C-4 — the carried copy an equipped id explains is the first one; a second copy
  // of that id is a spare, so it keeps its Equip/Sell card.
  const equippedWeaponIndex = inventoryWeapons.findIndex((w) => w.id === currentWeapon?.id);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      {/* SUBVIEW SWITCH — the Armory keeps its own tab; the workshop lives inside it. */}
      <div className="flex flex-wrap gap-2">
        {GEAR_VIEWS.map((view) => {
          const Icon = view.icon;
          const isActive = gearView === view.key;
          return (
            <button
              key={view.key}
              onClick={() => {
                sounds.playClick();
                onGearViewChange?.(view.key);
              }}
              disabled={isActive}
              className={`min-h-[48px] py-2.5 px-4 rounded-2xl font-serif font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                isActive
                  ? 'bg-amber-500/20 border border-amber-400 text-amber-200 shadow-md cursor-default'
                  : 'bg-neutral-900/80 border border-neutral-800 text-neutral-400 hover:text-amber-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{view.label}</span>
            </button>
          );
        })}
      </div>

      {gearView === 'chariot' ? (
        <>
          <ChariotWorkshopTab
            profile={profile}
            onBuyPart={onBuyChariotPart ?? (() => {})}
            onEquipPart={onEquipChariotPart ?? (() => {})}
            onUpdateProfile={onUpdateProfile}
          />
          {/* Phase C-8.67C — horse-team progression, below the workshop's own cards. */}
          <RacingConfigSection
            profile={profile}
            onBuyConfig={onBuyRacingConfig}
            onSelectConfig={onSelectRacingConfig}
            onBuyStableQuality={onBuyStableQuality}
            onBuyStableConditioning={onBuyStableConditioning}
          />
        </>
      ) : (
        <>
      <div className="bg-neutral-900/80 border-2 border-cyan-500/60 rounded-3xl p-6 shadow-xl">
        <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mb-1">
          Gladiator Loadout & Armory
        </h3>
        <p className="text-sm text-neutral-300 font-serif">Equip owned weapons, helmets, and cuirasses.</p>
      </div>

      {/* CURRENTLY EQUIPPED WEAPON */}
      <div className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg">
        <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
          <Swords className="w-5 h-5 text-amber-400" />
          <span>Equipped Weapon: <strong className="text-yellow-300">{currentWeapon?.name}</strong></span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {inventoryWeapons.map((wpn, index) => {
            const isEquipped = currentWeapon?.id === wpn.id && index === equippedWeaponIndex;
            const sellKey = `weapon#${index}`;
            return (
              <div
                key={`${wpn.id}-${index}`}
                className={`p-4 rounded-2xl border transition-all flex flex-col gap-3 ${
                  isEquipped ? 'bg-amber-950/60 border-amber-400' : 'bg-neutral-950/80 border-neutral-800'
                }`}
              >
                <div className="flex justify-between items-center gap-2">
                <div>
                  <div className="font-serif font-bold text-sm text-amber-100">{wpn.name}</div>
                  <div className="text-xs font-mono text-neutral-400">
                    Dmg: {wpn.damageLight}/{wpn.damageHeavy} • Range: {wpn.range}m
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      sounds.playClick();
                      onEquipWeapon(wpn);
                    }}
                    disabled={isEquipped || (arm.slot === 'shield' && profile.equipped.weapon.type === 'spear')}
                    className={`min-h-[48px] px-4 py-2 rounded-xl text-xs font-serif font-bold cursor-pointer transition-all ${
                      isEquipped
                        ? 'bg-green-800 text-green-200 cursor-default'
                        : 'bg-amber-600 hover:bg-amber-500 text-neutral-950 active:scale-95'
                    }`}
                  >
                    {isEquipped ? 'Equipped' : 'Equip'}
                  </button>
                  {!isEquipped && onSellItem && (
                    <SellButton
                      value={getTemperSellValue(profile, wpn)}
                      armed={armedSell === sellKey}
                      onArm={() => {
                        sounds.playClick();
                        setArmedSell(sellKey);
                      }}
                      onSell={() => {
                        sounds.playCoin();
                        setArmedSell(null);
                        onSellItem(wpn);
                      }}
                    />
                  )}
                </div>
                </div>
                {/* P6 — the item's temper level and its one action. */}
                <TemperControl profile={profile} item={wpn} onTemper={onTemperItem} />
              </div>
            );
          })}
        </div>
      </div>

      {/* FORGECRAFT-1 — two copies of one weapon + the forge fee → the next
          weapon up its ladder.  Lives with the temper rows, where the player
          already manages gear. */}
      <ForgeCraftSection profile={profile} onCraftItems={onCraftItems} />

      {/* CURRENTLY EQUIPPED & OWNED ARMOR */}
      <div className="bg-neutral-900/80 border border-amber-600/50 rounded-3xl p-6 shadow-lg">
        <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber-400" />
          <span>Equipped Armor</span>
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Helm</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.helm?.name || 'None'}</div>
          </div>
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Chest</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.chest?.name || 'None'}</div>
          </div>
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Arms</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.arms?.name || 'None'}</div>
          </div>
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Legs</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.legs?.name || 'None'}</div>
          </div>
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="text-[10px] uppercase font-mono text-neutral-400">Shield</div>
            <div className="text-xs font-bold text-amber-200 truncate">{profile.equipped.shield?.name || 'None'}</div>
          </div>
        </div>

        <h5 className="font-serif font-bold text-sm text-neutral-300 mb-3 uppercase tracking-wider">
          Owned Armor & Shields
        </h5>
        {inventoryArmors.length === 0 ? (
          <p className="text-xs text-neutral-500 italic">No armor owned yet. Visit the Armorer in the Market.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inventoryArmors.map((arm, index) => {
              const equippedArmorId = profile.equipped[arm.slot]?.id;
              const isEquipped =
                equippedArmorId === arm.id &&
                index === inventoryArmors.findIndex((a) => a.id === equippedArmorId);
              const sellKey = `armor#${index}`;
              return (
                <div
                  key={`${arm.id}-${index}`}
                  className={`p-4 rounded-2xl border transition-all flex flex-col gap-3 ${
                    isEquipped ? 'bg-amber-950/60 border-amber-400' : 'bg-neutral-950/80 border-neutral-800'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-sm text-amber-100">{arm.name}</span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-amber-400 border border-neutral-700">
                        {arm.slot}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-neutral-400 mt-0.5">
                      {arm.blockReduction !== undefined ? `Block: ${Math.round(arm.blockReduction * 100)}%` : `Def: +${arm.defense}`} {arm.healthBonus ? `• HP: +${arm.healthBonus}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        sounds.playClick();
                        onEquipArmor(arm);
                      }}
                      disabled={isEquipped || (arm.slot === 'shield' && profile.equipped.weapon.type === 'spear')}
                      className={`min-h-[48px] px-4 py-2 rounded-xl text-xs font-serif font-bold cursor-pointer transition-all ${
                        isEquipped
                          ? 'bg-green-800 text-green-200 cursor-default'
                          : 'bg-amber-600 hover:bg-amber-500 text-neutral-950 active:scale-95'
                      }`}
                    >
                      {isEquipped ? 'Equipped' : arm.slot === 'shield' && profile.equipped.weapon.type === 'spear' ? 'Spear equipped' : 'Equip'}
                    </button>
                    {!isEquipped && onSellItem && (
                      <SellButton
                        value={getTemperSellValue(profile, arm)}
                        armed={armedSell === sellKey}
                        onArm={() => {
                          sounds.playClick();
                          setArmedSell(sellKey);
                        }}
                        onSell={() => {
                          sounds.playCoin();
                          setArmedSell(null);
                          onSellItem(arm);
                        }}
                      />
                    )}
                  </div>
                  </div>
                  {/* P6 — the piece's temper level and its one action. */}
                  <TemperControl profile={profile} item={arm} onTemper={onTemperItem} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FORGECRAFT-2 — two copies of one piece of armor + Salvia's fee →
          the next piece up its ladder.  Lives with the armor cards, where
          the player already manages armor. */}
      <ArmorCraftSection profile={profile} onCraftItems={onCraftItems} />
        </>
      )}
    </div>
  );
};
