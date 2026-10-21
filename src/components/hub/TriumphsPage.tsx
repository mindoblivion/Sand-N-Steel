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
import {
  Laurel,
  LaurelResult,
  STATUE_OWNED_LINE,
  TRIUMPHS,
  describeTriumphRejection,
  getTriumphPurchaseEligibility,
  resolveLaurels,
} from '../../utils/laurels';

interface TriumphsPageProps {
  profile: PlayerProfile;
  /** `App`'s one write: `purchaseLaurel` then `setProfile` + `saveProfile`. */
  onPurchase?: (laurelId: string) => LaurelResult;
}

/** Fame prices are read at a glance, so they print with their thousands separated. */
const fameLabel = (value: number): string => value.toLocaleString('en-US');

export const TriumphsPage: React.FC<TriumphsPageProps> = ({ profile, onPurchase }) => {
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);
  const rank = deriveRank(profile);
  const owned = resolveLaurels(profile);

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

      <p className="text-[10px] font-serif italic text-neutral-500">
        A title you buy is the title the scribes read from your record, and every title you own stays
        yours. Nothing here carries a price in gold, and nothing here changes a stat.
      </p>
    </section>
  );
};
