import React from 'react';
import { PlayerProfile, WeaponItem, ArmorItem } from '../../types/game';
import { getItemById, isWeapon } from '../../data/itemsDB';
import { getVisibleStorefrontStock, StorefrontId } from '../../data/shops';
import {
  getKeeperForStorefront,
  nightClerkLine,
  resolveSeenKeepers,
  selectRepeatLine,
} from '../../data/keepers';
// Day/Night T3 — the counter's line follows the clock's phase. Display only, read
// through the day-boundary seam's own display reader.
import { resolveDisplayClock } from '../../utils/dayRollover';
// K4 — the storefront's STATE line (a purse below the shelves' cheapest price).
// Inserted at the top of the line precedence below; it reads no price of its own.
import { keeperStateLineFor } from '../../utils/keeperStateLines';
import { KeeperPlate } from './KeeperPlate';
import { CONSUMABLES, ConsumableItem } from '../../data/consumables';
import { getConsumableCount } from '../../utils/consumables';
import { ShoppingCart, Coins, Shield, Swords, Check, FlaskConical } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface ShopTabProps {
  profile: PlayerProfile;
  onBuyItem: (item: WeaponItem | ArmorItem) => void;
  /**
   * S6 — the Bazaar's counted consumables. Bought through `App`'s transaction like
   * every other purchase; this screen writes no save and deducts no gold itself.
   */
  onBuyConsumable?: (item: ConsumableItem) => void;
  /**
   * Phase SHOP-2 — which storefront is open.  A city building the player walked
   * into passes its own id; the hub's own Bazaar & Forge tab uses the default,
   * the open market (the whole catalogue, as it has always shown).
   */
  shopId?: StorefrontId;
  /**
   * K1 — the keeper's first visit, recorded through `App`'s existing save path
   * (the same shape as CL-2's `onMarkCardSeen`).  Called at most once per mount,
   * and only when this profile has not met the keeper before; a repeat visit
   * saves nothing at all.
   */
  onRecordKeeperVisit?: (keeperId: string) => void;
}

/**
 * What each storefront calls itself, and what it says when it has nothing to
 * sell.  A storefront with no stock is honest about it rather than listing
 * goods it does not trade in.
 */
const STOREFRONT_COPY: Record<
  StorefrontId,
  { title: string; subtitle: string; empty?: string }
> = {
  forge: { title: 'Imperial Smithing Forge', subtitle: 'Weapons & Armaments' },
  armorer: { title: 'Armor & Leather Workshop', subtitle: 'Armor, Helmets & Accessories' },
  merchant: { title: 'Elite Merchant House', subtitle: 'Rare & Legendary Wares' },
  // S6 — the potions have arrived: the Bazaar's stock is the consumables
  // catalogue (not `ITEMS_DB`), so it is never "empty" and carries no `empty` line.
  bazaar: {
    title: 'Bazaar & General Store',
    subtitle: 'Potions & Trade Wares',
  },
  market: {
    title: 'Imperial Smithing Forge & Bazaar',
    subtitle: 'Purchase weapons, shields, and gladiator armor.',
  },
};

/**
 * C-2 — the Bazaar is where a gladiator spends; selling lives in the Armory
 * (`GearTab`), which owns the cards for what the player actually carries.  This
 * catalogue therefore offers no sell control at all.
 */
export const ShopTab: React.FC<ShopTabProps> = ({
  profile,
  onBuyItem,
  onBuyConsumable,
  shopId = 'market',
  onRecordKeeperVisit,
}) => {
  const ownedItemIds = new Set([
    profile.equipped.weapon?.id,
    profile.equipped.helm?.id,
    profile.equipped.chest?.id,
    profile.equipped.arms?.id,
    profile.equipped.legs?.id,
    ...profile.inventory.map((i) => i.id),
  ]);

  const copy = STOREFRONT_COPY[shopId];
  /**
   * K1 — who stands behind this counter.  The hub's own market tab trades from
   * no one counter, so `keeper` is undefined there and nothing is shown or
   * recorded.  A first visit shows the greeting; every later visit shows the
   * keeper's repeat line, chosen by `selectRepeatLine` and not by chance.  The
   * save stores the ids met and not a count, so a repeat open is visit two — and
   * with one repeat line per keeper that is the same line at any count.
   */
  const keeper = getKeeperForStorefront(shopId);

  /**
   * K1 — whether this gladiator had already met the keeper when the counter was
   * opened.  Decided ONCE per keeper, from the profile the visit started with:
   * the first-visit save lands a frame later, and reading the live profile would
   * otherwise swap the greeting for the repeat line under the player's eyes.  A
   * different storefront is a different keeper and decides again.
   */
  const keeperMetRef = React.useRef<{ id: string; met: boolean } | null>(null);
  if (keeper && keeperMetRef.current?.id !== keeper.id) {
    keeperMetRef.current = { id: keeper.id, met: resolveSeenKeepers(profile).includes(keeper.id) };
  }
  const keeperMet = keeper ? keeperMetRef.current?.met === true : false;
  const keeperLine = keeper
    ? keeperMet
      ? selectRepeatLine(keeper, 2)
      : keeper.firstVisitLine
    : '';
  /**
   * Day/Night T3 — after dark the stall is kept by the NIGHT CLERK, so the plate speaks
   * his line instead of the keeper's. Only the line swaps: the same stock, the same
   * prices, the same buttons, and no keeper visit is un-recorded by the hour.
   */
  const shopIsNight = resolveDisplayClock(profile).phase === 'night';
  const nightLine = keeper ? nightClerkLine(keeper) : '';
  /**
   * K4 — STATE > NIGHT > own: a broke purse is the most specific thing a counter
   * can be told, so its line overrides both the greeting and the night clerk.
   * Evaluated per render, like the hour above; the visit record below is
   * untouched, and nothing here reaches a price or a button.
   */
  const stateLine = keeper ? keeperStateLineFor(keeper, profile, shopId) : '';
  const displayedKeeperLine = stateLine || (shopIsNight && nightLine ? nightLine : keeperLine);
  const keeperId = keeper?.id;

  // K1 — the first visit is recorded once per mount, at the moment the plate is
  // on screen, and never on a repeat.  `keeperMet` is the frozen reading above
  // and App's handler returns the SAME profile for an id already saved, so a
  // re-render, a second mount or a stale click cannot write the save twice.
  React.useEffect(() => {
    if (!keeperId || keeperMet) return;
    onRecordKeeperVisit?.(keeperId);
    // The profile is deliberately read at counter-open time, not per render.
  }, [keeperId]);
  /**
   * S6 — only the Bazaar sells consumables. The hub's own market tab keeps the whole
   * GEAR catalogue, and the other three storefronts keep their own stock, so no other
   * storefront's list changes.
   */
  const showsConsumables = shopId === 'bazaar';
  // The storefront's own stock, resolved to the catalogue entries behind it.
  // `getStorefrontStock` hands back ids from `ITEMS_DB` and `getItemById` reads
  // that same table, so every id resolves; the guard keeps the array typed.
  const stock = getVisibleStorefrontStock(shopId, profile)
    .map((id) => getItemById(id))
    .filter((item): item is WeaponItem | ArmorItem => item !== undefined);
  const weapons = stock.filter(isWeapon);
  const armors = stock.filter((item): item is ArmorItem => !isWeapon(item));

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      {/* K1 — the keeper's plate heads the storefront; the market tab has none. */}
      {keeper && <KeeperPlate keeper={keeper} line={displayedKeeperLine} />}
      <div className="bg-neutral-900/80 border-2 border-yellow-500/60 rounded-3xl p-6 shadow-xl flex justify-between items-center">
        <div>
          <h3 className="font-serif font-black text-2xl text-amber-100 uppercase mb-1">
            {copy.title}
          </h3>
          <p className="text-sm text-neutral-300 font-serif">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 px-4 py-2 rounded-2xl border border-yellow-500/60 font-mono font-bold text-yellow-400 text-lg shadow-inner">
          <Coins className="w-5 h-5" />
          <span>{profile.gold}</span>
        </div>
      </div>

      {stock.length === 0 && !showsConsumables && (
        <div className="bg-neutral-900/80 border border-amber-700/40 rounded-3xl p-8 text-center shadow-lg">
          <p className="font-serif text-amber-100 text-base sm:text-lg">
            {copy.empty ?? 'No wares are on offer here yet.'}
          </p>
        </div>
      )}

      {/* S6 — THE BAZAAR'S POTIONS: the counter's stock, with the count already
          owned. These are their own catalogue, never `ITEMS_DB` entries, so
          `getStorefrontStock('bazaar')` stays empty of gear and nothing here can
          enter the gear inventory. */}
      {showsConsumables && (
        <div>
          <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            <span>Potions & Salves</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CONSUMABLES.map((item) => {
              const owned = getConsumableCount(profile, item.id);
              const canAfford = profile.gold >= item.price;

              return (
                <div
                  key={item.id}
                  data-consumable={item.id}
                  data-owned={owned}
                  className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 hover:border-amber-500/80 transition-all flex flex-col justify-between shadow-lg"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h5 className="font-serif font-bold text-base text-amber-100">{item.name}</h5>
                      <span className="font-mono text-xs font-bold text-yellow-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                        {item.price} Gold
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mb-3">{item.description}</p>
                    <div className="text-xs font-mono text-neutral-300 flex items-center gap-3 mb-4">
                      <span>
                        Owned: <strong className="text-amber-300">{owned}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      sounds.playCoin();
                      onBuyConsumable?.(item);
                    }}
                    disabled={!canAfford}
                    className={`w-full min-h-[48px] py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2 ${
                      canAfford
                        ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300'
                        : 'bg-neutral-900 text-neutral-600 border border-neutral-800 opacity-50'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>Buy ({item.price} Gold)</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEAPONS */}
      {weapons.length > 0 && (
        <div>
          <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
            <Swords className="w-5 h-5" />
            <span>Weapons & Armaments</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {weapons.map((wpn) => {
              const isOwned = ownedItemIds.has(wpn.id);
              const canAfford = profile.gold >= wpn.price;

              return (
                <div
                  key={wpn.id}
                  className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 hover:border-amber-500/80 transition-all flex flex-col justify-between shadow-lg"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h5 className="font-serif font-bold text-base text-amber-100">{wpn.name}</h5>
                      <span className="font-mono text-xs font-bold text-yellow-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                        {wpn.price} Gold
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mb-3">{wpn.description}</p>
                    <div className="text-xs font-mono text-neutral-300 flex items-center gap-3 mb-4">
                      <span>Light: <strong className="text-red-400">{wpn.damageLight}</strong></span>
                      <span>Heavy: <strong className="text-red-400">{wpn.damageHeavy}</strong></span>
                      <span>Range: <strong className="text-cyan-400">{wpn.range}m</strong></span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      sounds.playCoin();
                      onBuyItem(wpn);
                    }}
                    disabled={isOwned || !canAfford}
                    className={`w-full min-h-[48px] py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2 ${
                      isOwned
                        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        : canAfford
                        ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300'
                        : 'bg-neutral-900 text-neutral-600 border border-neutral-800 opacity-50'
                    }`}
                  >
                    {isOwned ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        <span>Owned</span>
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4" />
                        <span>Buy Weapon ({wpn.price} Gold)</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ARMOR */}
      {armors.length > 0 && (
        <div>
          <h4 className="font-serif font-bold text-lg text-amber-300 mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <span>Armor & Helmets</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {armors.map((arm) => {
              const isOwned = ownedItemIds.has(arm.id);
              const canAfford = profile.gold >= arm.price;

              return (
                <div
                  key={arm.id}
                  className="p-5 rounded-3xl bg-neutral-900/80 border border-amber-700/40 hover:border-amber-500/80 transition-all flex flex-col justify-between shadow-lg"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h5 className="font-serif font-bold text-base text-amber-100">{arm.name}</h5>
                      <span className="font-mono text-xs font-bold text-yellow-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                        {arm.price} Gold
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mb-3">{arm.description}</p>
                    <div className="text-xs font-mono text-neutral-300 flex items-center gap-3 mb-4">
                      <span>Defense: <strong className="text-blue-400">+{arm.defense}</strong></span>
                      {arm.healthBonus && <span>HP: <strong className="text-green-400">+{arm.healthBonus}</strong></span>}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      sounds.playCoin();
                      onBuyItem(arm);
                    }}
                    disabled={isOwned || !canAfford}
                    className={`w-full min-h-[48px] py-3 rounded-2xl font-serif font-black text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2 ${
                      isOwned
                        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        : canAfford
                        ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-neutral-950 border border-yellow-300'
                        : 'bg-neutral-900 text-neutral-600 border border-neutral-800 opacity-50'
                    }`}
                  >
                    {isOwned ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        <span>Owned</span>
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4" />
                        <span>Buy Armor ({arm.price} Gold)</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
