/**
 * The one writer of `profile.bossKills` — the count the banner's boss stripes are cut from.
 *
 * `bossKills` is a plain count of bosses actually put down **for the first time**. It is
 * not a score and not a tally of rematches: the arena may be re-entered as often as the
 * player likes, but a boss already felled is already on the scribes' tablet.
 *
 * `App.handleMatchComplete`'s victory write is the only caller. That write already
 * composes the profile it is about to save (gold, fame, XP, tier and the newly recorded
 * `defeatedOpponentIds`); this module is the pure seam that tells that same write what
 * the kill count must be, so the count can never drift from the record beside it. The
 * defeat path composes no kill at all — a loss writes `fightsLost` and the hype peak and
 * nothing else — so a defeat leaves the count exactly as it stands.
 *
 * The rule, in full:
 *
 *   • a victory over an opponent that is not a boss (`isBoss !== true`) → unchanged,
 *     even though its id is still recorded in `defeatedOpponentIds`;
 *   • a victory over a boss whose id was already felled before this fight (a rematch)
 *     → unchanged, because it is not a new kill;
 *   • a victory over a boss whose id is **newly entering** `defeatedOpponentIds` in this
 *     same write → the stored count plus exactly one.
 *
 * It is pure: it reads the profile as it was before the victory and the profile that
 * victory is about to write, and returns the number that write must carry. It touches
 * no storage, no clock and no randomness, and it never mutates what it is handed.
 * Malformed input (a missing, non-finite or negative count, a non-array id list) is
 * read as zero rather than throwing — the same contract `rank.ts` and `heraldry.ts` keep.
 */

/** The fields the rule reads off a save.  Structural, so a bare literal in a suite satisfies it. */
export interface BossKillRecord {
  bossKills?: number;
  defeatedOpponentIds?: string[];
}

/** The one field the rule needs from the opponent fought. */
export interface BossOpponent {
  id: string;
  isBoss?: boolean;
  /** D-1 — carried so the rule can tell a LADDER boss from a Feature Bout. */
  featureBout?: true;
  /** STORY-4b — a BOUNTY BOUT is not a campaign kill either (the Deserter is a boss). */
  bountyBout?: true;
}

/** A missing, non-finite or negative count reads as zero — never as NaN. */
function countOrZero(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** The felled ids, dropped unless they are really ids (strings). */
function felledIds(record: BossKillRecord | null | undefined): string[] {
  const stored = record?.defeatedOpponentIds;
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string');
}

/**
 * The `bossKills` value the victory write must carry.
 *
 * `before` is the profile as it stood when the fight ended (its `bossKills` and the
 * `defeatedOpponentIds` the fight was fought against); `after` is the profile that same
 * write is about to save; `opponent` is the gladiator who was beaten. Reading the write
 * itself — rather than a pre-computed "is this a first defeat" flag — keeps this the
 * single statement of the rule: the count and the record are read from one place.
 */
export function nextBossKills(
  before: BossKillRecord | null | undefined,
  after: BossKillRecord | null | undefined,
  opponent: BossOpponent | null | undefined,
): number {
  const stored = countOrZero(before?.bossKills);

  // D-1 — only a LADDER boss is a campaign kill. A Feature Bout is a boss the
  // player chose to face OUTSIDE the ladder, so it adds no stripe (and can never
  // satisfy a rank or campaign gate that reads the count). The check is local on
  // purpose: this module keeps its zero-import, pure contract.
  // STORY-4b — and neither is a BOUNTY BOUT: the Deserter is a boss, but the
  // board's ladder is not the campaign's, so his fall adds no stripe.
  if (opponent?.isBoss !== true || opponent.featureBout === true || opponent.bountyBout === true) {
    return stored;
  }
  const id = opponent.id;
  if (typeof id !== 'string' || id === '') return stored;

  const alreadyFelled = felledIds(before).includes(id);
  const recordedInThisWrite = felledIds(after).includes(id);
  if (alreadyFelled || !recordedInThisWrite) return stored;

  return stored + 1;
}
