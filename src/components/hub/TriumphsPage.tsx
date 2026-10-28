/**
 * TRIUMPHS — the second page of the Records & Lore Library.
 *
 * The fame honours a gladiator buys: the three titles and the ludus statue, each
 * with its price in **fame** (never gold), whether it is already owned, and the
 * purchase itself.  The page also prints the player's **derived** rank and fame
 * (`utils/rank.ts` `deriveRank` — never the stored `rank` field, which nothing
 * advances).
 *
 * **The name is "Triumphs"**: the word "Laurel" belongs to the palma, the day's
 * golden laurel, so no string this page prints uses it (`laurels` is only the save
 * field's own identifier).
 *
 * The page owns no rule and writes nothing itself.  Prices, ownership and every
 * refusal come from the pure catalogue in `utils/laurels.ts`; a buy is handed to
 * `onPurchase`, which `App` routes through `purchaseLaurel` and the shipped
 * `setProfile` + `saveProfile` pair.  A refusal (not enough fame, already owned) is
 * shown on the card that raised it, in this page's own voice.
 */
import React, { useState } from 'react';
import { Award, Landmark } from 'lucide-react';
import { PlayerProfile } from '../../types/game';
import { deriveRank } from '../../utils/rank';
import { TRIUMPH_BANNER_PART_ID, getChariotPart } from '../../data/chariotParts';
import { ownsChariotPart } from '../../utils/chariotLoadout';
import {
  Laurel,
  LaurelResult,
  STATUE_OWNED_LINE,
  TRIUMPHS,
  describeTriumphRejection,
  getTriumphPurchaseEligibility,
  ownedTitleOptions,
  resolveLaurels,
} from '../../utils/laurels';
// A8 — the DEEDS this page also lists: every shipped triumph, its plain-language
// requirement, and the record of which of them are earned.  Read-only here; the
// evaluation itself happens at a duel result, never on opening this page.
import {
  SHIPPED_TRIUMPHS,
  TRIUMPH_CATEGORIES,
  resolveRecords,
  triumphFame,
  triumphsInCategory,
} from '../../utils/triumphs';

interface TriumphsPageProps {
  profile: PlayerProfile;
  /** `App`'s one write: `purchaseLaurel` then `setProfile` + `saveProfile`. */
  onPurchase?: (laurelId: string) => LaurelResult;
  /**
   * A8 — put an OWNED title on the record.  Purchased and earned titles are
   * selected the same way (one tap), and `App` writes `profile.title` through the
   * normal save path.  Absent handler = the row still lists them, read-only.
   */
  onSelectTitle?: (titleId: string) => void;
}

/** Fame prices are read at a glance, so they print with their thousands separated. */
const fameLabel = (value: number): string => value.toLocaleString('en-US');

export const TriumphsPage: React.FC<TriumphsPageProps> = ({
  profile,
  onPurchase,
  onSelectTitle,
}) => {
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);
  const rank = deriveRank(profile);
  const owned = resolveLaurels(profile);
  /**
   * A8 — the deeds record (read-only) and every title the player owns, purchased
   * or earned.  The record is read through the pure resolver, so a legacy save
   * (no `records` field) lists every deed as locked and shows no title row.
   */
  const records = resolveRecords(profile);
  const ownedTitles = ownedTitleOptions(profile);
  /**
   * P-BANNER — the Triumph banner set is a chariot cosmetic: its ownership lives
   * in the chariot record exactly like every other part's, so this page only
   * READS it through the workshop's own predicate.  No second ownership record
   * exists, and the page offers no buy control — the Chariot Workshop sells it.
   */
  const bannersOwned = ownsChariotPart(profile, TRIUMPH_BANNER_PART_ID);
  const bannerPart = getChariotPart(TRIUMPH_BANNER_PART_ID);

  const buy = (triumph: Laurel) => {
    if (!onPurchase) return;
    const result = onPurchase(triumph.id);
    setNotice(result.ok ? null : { id: triumph.id, text: describeTriumphRejection(result.reason) });
  };

  return (
    <section
      className="flex flex-col gap-4 max-w-2xl mx-auto w-full"
      aria-label="Triumphs"
      data-triumphs-page
      data-rank={rank}
      data-fame={profile.fame}
    >
      <header>
        <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 uppercase tracking-wider">
          Triumphs
        </h3>
        <p className="text-xs font-serif italic text-neutral-400 mt-1">
          Honours the city grants for fame alone. They win no fight — they name the one who did.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-200 uppercase tracking-wider">
            Rank: {rank}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300">
            Fame: {fameLabel(profile.fame)}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300">
            Owned: {owned.titles.length + (owned.statue ? 1 : 0)} / {TRIUMPHS.length}
          </span>
          <span
            data-earned-count={records.earnedTriumphs.length}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300"
          >
            Deeds: {records.earnedTriumphs.length} / {SHIPPED_TRIUMPHS.length}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TRIUMPHS.map((triumph) => {
          const isOwned =
            triumph.kind === 'title'
              ? owned.titles.includes(triumph.id)
              : owned.statue;
          const eligibility = getTriumphPurchaseEligibility(profile, triumph.id);
          const isDisplayed = triumph.kind === 'title' && profile.title === triumph.name;
          const Icon = triumph.kind === 'title' ? Award : Landmark;
          const cardNotice = notice?.id === triumph.id ? notice.text : null;

          return (
            <article
              key={triumph.id}
              data-triumph={triumph.id}
              data-owned={isOwned ? 'true' : 'false'}
              className={`rounded-2xl border px-3 py-3 flex flex-col gap-2 ${
                isOwned ? 'border-amber-500/60 bg-amber-500/10' : 'border-neutral-700 bg-neutral-900/70'
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${
                    isOwned
                      ? 'bg-amber-500 text-neutral-950 border-amber-300'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-600'
                  }`}
                  aria-hidden="true"
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h4 className="font-serif font-black text-sm uppercase tracking-wider text-amber-100">
                    {triumph.name}
                  </h4>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    {triumph.kind === 'title' ? 'Title' : 'Statue'} · {fameLabel(triumph.price)} Fame
                  </p>
                </div>
              </div>

              <p className="text-[11px] font-serif italic text-neutral-400">{triumph.blurb}</p>

              {isOwned ? (
                <div className="mt-auto flex flex-col gap-1">
                  {triumph.kind === 'statue' ? (
                    <p className="font-serif text-xs text-amber-200">{STATUE_OWNED_LINE}</p>
                  ) : (
                    <p className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
                      {isDisplayed ? 'Owned · shown on your record' : 'Owned'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-auto flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => buy(triumph)}
                    disabled={!eligibility.ok || !onPurchase}
                    aria-label={`Buy ${triumph.name} for ${fameLabel(triumph.price)} fame`}
                    data-buy-triumph={triumph.id}
                    className={`min-h-[44px] px-3 rounded-xl font-serif font-bold text-xs uppercase tracking-wider border transition-all ${
                      eligibility.ok && onPurchase
                        ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-300 cursor-pointer active:scale-95'
                        : 'bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed'
                    }`}
                  >
                    Buy · {fameLabel(triumph.price)} Fame
                  </button>
                  {!eligibility.ok && (
                    <p className="text-[10px] font-mono text-neutral-400" data-triumph-refusal>
                      {describeTriumphRejection(eligibility.reason)}
                    </p>
                  )}
                </div>
              )}

              {cardNotice && (
                <p className="text-[10px] font-mono text-red-300" data-triumph-notice>
                  {cardNotice}
                </p>
              )}
            </article>
          );
        })}
      </div>

      {/* A8 — THE EARNED DEEDS, grouped by the four SHIPPED categories.  No
          Circus section renders while racing is dormant, and every row prints its
          requirement: there are no secret achievements in this game. */}
      <section data-earned-triumphs className="flex flex-col gap-3" aria-label="Deeds">
        <div>
          <h4 className="font-serif font-black text-base sm:text-lg text-amber-100 uppercase tracking-wider">
            Deeds
          </h4>
          <p className="text-xs font-serif italic text-neutral-400 mt-1">
            Won in the sand, not bought with fame. Each one names what it asks of you.
          </p>
        </div>
        {TRIUMPH_CATEGORIES.map((category) => (
          <div key={category.id} data-triumph-category={category.id} className="rounded-2xl border border-neutral-700 bg-neutral-900/70 px-3 py-3">
            <h5 className="font-serif font-bold text-xs uppercase tracking-wider text-amber-300">
              {category.label}
            </h5>
            <ul className="mt-2 flex flex-col gap-1.5">
              {triumphsInCategory(category.id).map((triumph) => {
                const isEarned = records.earnedTriumphs.includes(triumph.id);
                return (
                  <li
                    key={triumph.id}
                    data-earned-triumph={triumph.id}
                    data-earned={isEarned ? 'true' : 'false'}
                    className={`rounded-xl border px-2.5 py-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 ${
                      isEarned ? 'border-amber-500/60 bg-amber-500/10' : 'border-neutral-800 bg-neutral-950/60'
                    }`}
                  >
                    <span
                      className={`font-serif font-bold text-xs uppercase tracking-wider ${
                        isEarned ? 'text-amber-200' : 'text-neutral-400'
                      }`}
                    >
                      {triumph.name}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                      {isEarned ? 'Earned' : 'Locked'} · +{triumphFame(triumph)} Fame
                    </span>
                    <span className="w-full text-[11px] font-serif italic text-neutral-400">
                      {triumph.requirement}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {/* A8 — TITLES: one tap puts an OWNED title on the record, whether it was
          bought (P2) or earned (A8).  The displayed one is marked; the record
          keeps every title owned either way. */}
      {ownedTitles.length > 0 && (
        <section data-title-selection className="flex flex-col gap-2">
          <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-amber-300">
            Titles you own
          </h4>
          <div className="flex flex-wrap gap-2">
            {ownedTitles.map((title) => {
              const isDisplayed = profile.title === title.name;
              return (
                <button
                  key={title.id}
                  type="button"
                  data-title-option={title.id}
                  data-title-selected={isDisplayed ? 'true' : 'false'}
                  onClick={() => onSelectTitle?.(title.id)}
                  disabled={!onSelectTitle || isDisplayed}
                  aria-pressed={isDisplayed}
                  className={`min-h-[44px] px-3 rounded-xl border font-serif font-bold text-xs uppercase tracking-wider transition-all ${
                    isDisplayed
                      ? 'bg-amber-500 text-neutral-950 border-amber-300'
                      : onSelectTitle
                        ? 'bg-neutral-900 border-amber-500/50 text-amber-200 cursor-pointer active:scale-95'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-400'
                  }`}
                >
                  {title.name}
                  {isDisplayed ? ' · shown' : ''}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {bannersOwned && (
        <div
          data-triumph-banners
          data-banners-owned="true"
          className="rounded-2xl border border-amber-500/60 bg-amber-500/10 px-3 py-3 flex items-start gap-2"
        >
          <Landmark className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h4 className="font-serif font-black text-sm uppercase tracking-wider text-amber-100">
              {bannerPart?.name ?? 'Triumph Banners'}
            </h4>
            <p className="text-[11px] font-serif italic text-neutral-300">
              Owned · carried by your chariot. Worn for the procession, never for an edge in the race.
            </p>
          </div>
        </div>
      )}

      <p className="text-[10px] font-serif italic text-neutral-500">
        A title you buy is the title the scribes read from your record, and every title you own stays
        yours. Nothing here carries a price in gold, and nothing here changes a stat.
      </p>
    </section>
  );
};
