/**
 * LUDI PHASE A — THE LUDI CALENDAR: the day's name, the Acta's three deeds, and Favour.
 *
 * ── THE DESIGN OF RECORD (ideas-retention §4) ────────────────────────────────
 * Rome ran on festivals. The city's week turns, and you do not "do dailies" — you wake in a
 * city whose day has a character, posted each morning in the Acta, Rome's daily gazette.
 * This module is that calendar's whole rule set, and nothing else:
 *
 *   • THE DAY IS THE EXERTION DAY, never the wall clock. `resolveLudiDay` reads
 *     `resolveTimeState(profile).day` — the number the clock already resolves from
 *     `PlayerProfile.time.total` — so two players on the same save see the same Acta at any
 *     hour of any real day, and no part of the game code calls `new Date()`. The seven names
 *     are `dayRollover.ts`'s own `LUDI_ROTATION`, reached through `ludiIndexForDay` /
 *     `ludiDayName`; this module adds no second calendar.
 *
 *   • THE DEED POOL IS FIVE SHAPES, and three are drawn per day by a deterministic hash of
 *     the day number alone (`ludiDeedsForDay`). Same day, same three deeds, on every device
 *     and in every session; the draw is DISTINCT (no deed twice in one Acta) and it contains
 *     **no race deed and no boss deed**, because neither is a thing this build can ask of a
 *     player who may not be able to do it yet. A progress-scaled pool is the design's long
 *     shape; Phase A's pool is the always-available five.
 *
 *   • THE VISIT DEED NAMES ITS PLACE. Four of the five shapes ask the same thing every day;
 *     the visit deed asks for ONE NAMED `HUB_LOCATIONS` — one of the city's twenty-one —
 *     hash-picked per day in the same FNV-1a family as the deed draw (`ludiVisitLocationForDay`)
 *     and printed with that place's own display name (`ludiDeedLabel`). A visit SOMEWHERE ELSE
 *     is recorded in `visitsToday` (the day's list of ids, deduped, in visit order) and does
 *     NOT pay the deed: only the day's own district does. The place and its name come from
 *     `cityCollisions.ts`, so a renamed building renames its deed.
 *
 *   • EACH DEED PAYS 5 FAME + 10 GOLD, once, in the SAME save as the act that completed it.
 *     `settleLudiDeeds` is the one settlement: it reads the profile as it stands, decides
 *     which of today's unfinished deeds the event satisfies, pays them all in ONE
 *     non-recursive pass and stops. Paying a deed's fame can never satisfy another deed in
 *     the same pass (the 100-fame deed reads the fame the transaction ARRIVED with), so
 *     there is no recursion and no double pay; `deedsDone` makes a repeat event a no-op.
 *
 *   • THE THIRD DEED PAYS A LAUREL. Completing all three earns **one** Laurel through the
 *     SHARED counter — `records.laudes`, written by `withLaudes` and read by `resolveLaudes`
 *     (`utils/diceTrail.ts`) — plus **1 Favour**. It pays no extra gold and no extra fame,
 *     and there is no second Laurel field anywhere: a second counter would be a second truth.
 *
 *   • FAVOUR is the persistent daily currency of the Acta's other half: **+1 per alms-day**,
 *     taken at `handleOfferOmen`'s SUCCESS only (`withLudiAlms`), guarded so the shrine pays
 *     it once per exertion day. The Omen's price, its effects and its expiry are untouched.
 *
 *   • THE ROLLOVER resets the day's own state and keeps the rest: `applyLudiRollover` clears
 *     `deedsDone` / `fameBaseline` / `visitsToday` (to an empty list) and re-bases the fame
 *     baseline on the fame the gladiator wakes with. `favour` and `records.laudes` persist.
 *
 * ── WHAT IS NOT HERE ─────────────────────────────────────────────────────────
 * No gameplay modifier of any kind (Phase B), no Grand Deed, no First Sixty Seconds. Nothing
 * here touches `utils/combatCalculations.ts`, a stat, a price, a fight or a gate: the deeds
 * only READ what the shipped systems already wrote (a victory, a training session, a hub
 * visit, fame) and pay two currencies.
 *
 * ── THE ONE LAZY FIELD ───────────────────────────────────────────────────────
 * `PlayerProfile.ludi` (`LudiProgress`, `types/game.ts`). A save written before this slice
 * has no field at all and must keep loading, so `resolveLudiProgress` reads a missing, null
 * or malformed field as a fresh day rather than repairing it — the same total-reader
 * contract `resolveRacingState` and `resolveRecords` keep. Nothing migrates. The field has
 * one tolerance: a PRE-CORRECTION save stored `visitsToday` as a COUNT, which says nothing
 * about WHICH districts were walked, so a stored number reads as `[]` (the game is unshipped
 * and only dev saves hold that shape). `deedsDone` is left exactly as stored — a visit deed
 * paid under the old rule stays paid, because rewriting a save's history is a migration and
 * this module migrates nothing.
 */
import type { LudiProgress, PlayerProfile } from '../types/game';
import {
  LUDI_QUIETUS_INDEX,
  TRAINING_SESSIONS_FULL,
  ludiDayName,
  ludiIndexForDay,
} from './dayRollover';
import { resolveTimeState } from './timeState';
import { resolveLaudes, withLaudes } from './diceTrail';
import { HUB_LOCATIONS } from './cityCollisions';

/* ── The five deed shapes ─────────────────────────────────────────────────── */

/**
 * The deed shapes the Acta can ask for. Deliberately NARROW: every one is a thing any
 * gladiator can do on any day, which is why no race deed and no boss deed is in the pool.
 */
export type LudiDeedId = 'win_duel' | 'peak_hype' | 'train' | 'visit_hub' | 'earn_fame';

/** One deed, as the Acta prints it. */
export interface LudiDeed {
  id: LudiDeedId;
  /** The Acta's one line — what the deed asks, in the gazette's voice. */
  label: string;
}

/** The pool, in its frozen order (the hash draws indexes into this list). */
export const LUDI_DEEDS: readonly LudiDeedId[] = [
  'win_duel',
  'peak_hype',
  'train',
  'visit_hub',
  'earn_fame',
];

/**
 * The four shapes that ask the same thing every day. `visit_hub` is deliberately ABSENT:
 * that deed names the one district today's Acta asks for, which is a property of the DAY and
 * so cannot live in a fixed table — `ludiDeedLabel` is the one way any deed is printed.
 */
const LUDI_FIXED_LABELS: Readonly<Record<Exclude<LudiDeedId, 'visit_hub'>, string>> = {
  win_duel: 'Take a victory on the sand.',
  peak_hype: 'Win a bout with the crowd above 40 hype.',
  train: 'Put in one session at the training yard.',
  earn_fame: 'Earn 100 fame over the mark you woke with.',
};

/** How many deeds a day's Acta posts. */
export const LUDI_DEED_COUNT = 3;

/** What every deed pays, once. */
export const LUDI_DEED_FAME = 5;
export const LUDI_DEED_GOLD = 10;

/** The crowd reading the "peak hype" deed asks the bout to beat (strictly above). */
export const LUDI_PEAK_HYPE_TARGET = 40;

/** How much fame over the day's opening mark the fame deed asks for. */
export const LUDI_DAY_FAME_TARGET = 100;

/** What completing all three deeds pays: one shared Laurel and one Favour. */
export const LUDI_LAUREL_FAVOUR = 1;

/** What one alms-day pays into Favour. */
export const LUDI_ALMS_FAVOUR = 1;

/* ── The seven days' characters ───────────────────────────────────────────── */

/**
 * One line of character per rotation slot — what the city's day FEELS like, in the Acta's
 * own voice. Indexed by `ludiIndexForDay`, exactly like `LUDI_ROTATION` itself, so the name
 * and the character can never disagree. Director-reviewable copy (Phase A writes prose, not
 * rules): the day's character is flavour here and has no mechanical effect of any kind.
 */
export const LUDI_DAY_CHARACTER: readonly string[] = [
  /* 0 Dies Mercatus */ 'The stalls are loud and the purse is loose: a day for coin and talk.',
  /* 1 Dies Ferratus */ "The forges ring from first light: a day for steel and hard work.",
  /* 2 Dies Fortunae */ "Fortuna's smoke is in the street: a day for the shrine and the omen.",
  /* 3 Dies Equorum */ 'The Circus is saddling: a day for horses and the dust of the track.',
  /* 4 Dies Sanguinis */ 'The sand is raked and the crowd is early: a day for blood.',
  /* 5 Ludi Magni */ 'Banners on every corner: a day of games and great names.',
  /* 6 Dies Quietus */ 'The city keeps its voice down: a day of rest and quiet work.',
];

/* ── The deterministic draw ───────────────────────────────────────────────── */

/**
 * FNV-1a over `ludi:<key>` — the ONE hash the Acta's draw is built from. It is written out
 * here rather than imported so the day's three deeds are pinned by this file's own numbers:
 * changing the seed changes every day's Acta, and the suite then fails until it is re-pinned
 * (which is the point — the pick is content, not an accident).
 */
function fnv1a(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The exertion day as the draws see it: whole, and never non-finite. */
function wholeDay(day: number): number {
  return Number.isFinite(day) ? Math.floor(day) : 1;
}

/**
 * The three deeds of one exertion day.
 *
 * PURE and deterministic: the day number is normalised to a whole number, hashed, and then
 * used to draw WITHOUT replacement three times (each draw removes its pick from the pool, so
 * the three are always distinct; the running hash is re-hashed between draws so the picks
 * are not merely `h, h+1, h+2`). No `Math.random`, no clock, no profile — two players on the
 * same exertion day read the same Acta.
 */
export function ludiDeedsForDay(day: number): LudiDeedId[] {
  const whole = wholeDay(day);
  const pool: LudiDeedId[] = [...LUDI_DEEDS];
  const picked: LudiDeedId[] = [];
  let hash = fnv1a(`ludi:${whole}`);
  while (picked.length < LUDI_DEED_COUNT && pool.length > 0) {
    const index = hash % pool.length;
    picked.push(pool.splice(index, 1)[0]);
    hash = fnv1a(`ludi:${hash}`);
  }
  return picked;
}

/** Every `HUB_LOCATIONS` id, in the registry's own order — the Acta's pool of places. */
export const LUDI_VISIT_LOCATION_IDS: readonly string[] = HUB_LOCATIONS.map(
  (location) => location.id,
);

/**
 * THE DAY'S ONE PLACE — the district the visit deed names.
 *
 * The same FNV-1a family as the deed draw, on its own key, so the place is as deterministic
 * as the deed set and the two draws never shadow each other: the same exertion day names the
 * same district on every device, in every session, and it is always a place the city has.
 * PURE, and no clock: the day is the only input.
 */
export function ludiVisitLocationForDay(day: number): string {
  const span = LUDI_VISIT_LOCATION_IDS.length;
  return LUDI_VISIT_LOCATION_IDS[fnv1a(`ludi:visit:${wholeDay(day)}`) % span];
}

/** That place's display name, exactly as the city's registry spells it. */
export function ludiVisitLocationName(day: number): string {
  const id = ludiVisitLocationForDay(day);
  return HUB_LOCATIONS.find((location) => location.id === id)?.name ?? id;
}

/**
 * The Acta's visit line for the day: it NAMES the district, in the gazette's voice. A name
 * that already leads with its article keeps it ("The Grand Colosseum" becomes "Visit the
 * Grand Colosseum."); every other name takes the definite article ("Visit the Ludus Martial
 * Yard.").
 */
export function ludiVisitLabelForDay(day: number): string {
  const name = ludiVisitLocationName(day);
  return name.startsWith('The ') ? `Visit the ${name.slice(4)}.` : `Visit the ${name}.`;
}

/** One deed as the Acta prints it on `day` — the visit deed carries that day's district. */
export function ludiDeedLabel(id: LudiDeedId, day: number): string {
  return id === 'visit_hub' ? ludiVisitLabelForDay(day) : LUDI_FIXED_LABELS[id];
}

/** Today's three deeds, LABELLED — the one way a surface should print them. */
export function ludiDeedsOfDay(day: number): LudiDeed[] {
  return ludiDeedsForDay(day).map((id) => ({ id, label: ludiDeedLabel(id, day) }));
}

/* ── The lazy reader ──────────────────────────────────────────────────────── */

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

/** The stored `ludi` object, or `undefined` when it is absent or not an object. */
function stored(profile: PlayerProfile | null | undefined): Partial<LudiProgress> | undefined {
  const field = profile?.ludi;
  if (!field || typeof field !== 'object' || Array.isArray(field)) return undefined;
  return field as Partial<LudiProgress>;
}

/** A stored deed list: known ids only, deduped, in stored order. */
function knownDeeds(value: unknown): LudiDeedId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: LudiDeedId[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !LUDI_DEEDS.includes(entry as LudiDeedId)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry as LudiDeedId);
  }
  return out;
}

/**
 * A stored visit list: non-empty ids only, deduped, in STORED (visit) order.
 *
 * The tolerance rule lives here: a pre-correction save stored a COUNT, and a number says
 * nothing about which districts were walked — so anything that is not an array reads as `[]`.
 */
function knownVisits(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/**
 * The day's visit list with `locationId` appended once: a repeat visit to the same place is
 * not a second entry, and no id leaves the list as the SAME array (so the settlement's
 * identity-stability check keeps working).
 */
function recordVisit(list: string[], locationId: string | undefined): string[] {
  if (typeof locationId !== 'string' || locationId.length === 0) return list;
  return list.includes(locationId) ? list : [...list, locationId];
}

/**
 * Read the field. TOTAL and repairing nothing, the same contract every lazy reader keeps:
 * an absent, partial or malformed `ludi` resolves to a fresh day (`day: 0`, no deeds, no
 * favour, no alms, baseline 0, no visits) and gains no field by being read.
 */
export function resolveLudiProgress(profile: PlayerProfile | null | undefined): LudiProgress {
  const field = stored(profile);
  return {
    day: finiteOr(field?.day, 0),
    deedsDone: knownDeeds(field?.deedsDone),
    favour: Math.max(0, finiteOr(field?.favour, 0)),
    lastAlmsDay: Math.max(0, finiteOr(field?.lastAlmsDay, 0)),
    fameBaseline: Math.max(0, finiteOr(field?.fameBaseline, 0)),
    visitsToday: knownVisits(field?.visitsToday),
  };
}

/** The exertion day the calendar reads — `resolveTimeState`'s own day, never a wall clock. */
export function resolveLudiDay(profile: PlayerProfile | null | undefined): number {
  return resolveTimeState(profile).day;
}

/**
 * The day-state a write should build on: the stored object when it is already TODAY's,
 * otherwise a fresh day that keeps only what survives a rollover (favour and the alms day).
 * The fame baseline of a day nobody recorded reads as 0 — `applyLudiRollover` is what sets
 * a real one, and every clock advance in the game goes through the rollover seam.
 */
function todayProgress(profile: PlayerProfile, day: number): LudiProgress {
  const field = resolveLudiProgress(profile);
  if (field.day === day) return field;
  return {
    day,
    deedsDone: [],
    favour: field.favour,
    lastAlmsDay: field.lastAlmsDay,
    fameBaseline: 0,
    visitsToday: [],
  };
}

/* ── The resolved state a surface reads ───────────────────────────────────── */

/** One of today's deeds, with its paid/unpaid state. */
export interface ResolvedLudiDeed {
  deed: LudiDeed;
  done: boolean;
}

/** Today's Acta, as a panel or the city card reads it. */
export interface ResolvedLudiState {
  /** The exertion day (`resolveTimeState(profile).day`). */
  day: number;
  /** Its name from `LUDI_ROTATION` (`Dies Mercatus` on Day 1, ...). */
  dayName: string;
  /** The day's one line of character. */
  characterLine: string;
  /** The three deeds, in the order the hash drew them, each with its LABELLED text. */
  deeds: ResolvedLudiDeed[];
  /** The one district the day's visit deed names (`HUB_LOCATIONS` id). */
  visitLocation: string;
  /** The ids already paid today (today's only — a stale day's list never leaks in). */
  deedsDone: LudiDeedId[];
  /** How many of today's deeds are still owed. */
  remaining: number;
  /** True once all three are paid, i.e. once the day's Laurel and Favour are in. */
  allDone: boolean;
  /** The persistent Favour total. */
  favour: number;
  /**
   * The shared honour total (`records.laudes`, `resolveLaudes`). Named for the counter it
   * reads — "Laudes" — because P2's naming law reserves the palma's own word for the fame
   * honours bought in the Library, and no surface of this slice prints it.
   */
  laudes: number;
  /** The fame this gladiator woke with today. */
  fameBaseline: number;
  /** The `HUB_LOCATIONS` ids walked into today, deduped, in visit order. */
  visitsToday: string[];
}

/** Today's Acta, resolved. PURE and total, like every resolver in this repo. */
export function resolveLudiState(profile: PlayerProfile | null | undefined): ResolvedLudiState {
  const source = profile ?? ({} as PlayerProfile);
  const day = resolveLudiDay(source);
  const field = todayProgress(source, day);
  const done = new Set(field.deedsDone);
  const deeds = ludiDeedsOfDay(day).map((deed) => ({ deed, done: done.has(deed.id) }));
  const remaining = deeds.filter((entry) => !entry.done).length;
  return {
    day,
    dayName: ludiDayName(day),
    characterLine: LUDI_DAY_CHARACTER[ludiIndexForDay(day)],
    deeds,
    visitLocation: ludiVisitLocationForDay(day),
    deedsDone: deeds.filter((entry) => entry.done).map((entry) => entry.deed.id),
    remaining,
    allDone: deeds.length > 0 && remaining === 0,
    favour: field.favour,
    laudes: resolveLaudes(source),
    fameBaseline: field.fameBaseline,
    visitsToday: field.visitsToday,
  };
}

/**
 * The training sessions a new day hands back — the SAME allotment `applyDayRollover`
 * restores (`TRAINING_SESSIONS_FULL`, plus Dies Quietus's extra one). Exported so the
 * Acta prints the number the rollover actually applied instead of restating it.
 */
export function ludiSessionsRefreshed(day: number): number {
  return TRAINING_SESSIONS_FULL + (ludiIndexForDay(day) === LUDI_QUIETUS_INDEX ? 1 : 0);
}

/* ── The one settlement ───────────────────────────────────────────────────── */

/**
 * What just happened, as the seam that just happened knows it. Every flag is optional and
 * absent means "nothing of this kind" — a training session settles with `trained` alone.
 */
export interface LudiDeedEvent {
  /** A victory was recorded by this transaction. */
  won?: boolean;
  /** That victory's crowd peak (`DuelStatistics.crowdHypePeak`). */
  crowdHypePeak?: number;
  /** A training session was paid for. */
  trained?: boolean;
  /**
   * The `HUB_LOCATIONS` id of a named interaction that just fired. It is RECORDED on every
   * day (the day's list of places walked) but pays the visit deed only when it names the
   * district today's Acta asks for.
   */
  locationId?: string;
  /**
   * This settlement is the DUEL RESULT's own, i.e. `fame` has just been recomputed by the
   * purse and the bounty. Only that seam may decide the 100-fame deed — which is why the
   * flag exists rather than the fame condition being read everywhere.
   */
  atDuelResult?: boolean;
}

/** What one settlement produced, for the caller's save and the herald. */
export interface LudiSettlement {
  /** The profile to hand to `setProfile()` + `saveProfile()` — identity-stable when nothing moved. */
  profile: PlayerProfile;
  /** The deeds this transaction completed, in the Acta's order. */
  completed: LudiDeed[];
  /** Did this transaction complete the day (and so pay the Laurel + Favour)? */
  laurelEarned: boolean;
  /** The Favour this transaction paid (1 with the Laurel, else 0). */
  favourEarned: number;
}

const NOTHING = (profile: PlayerProfile): LudiSettlement => ({
  profile,
  completed: [],
  laurelEarned: false,
  favourEarned: 0,
});

/** Does this event satisfy this deed, reading the profile the transaction ARRIVED with? */
/**
 * Does this event satisfy this deed, reading the profile the transaction ARRIVED with?
 * `visitsToday` is the day's list INCLUDING the visit this transaction just made, and
 * `visitTarget` is the one district the day's visit deed names — so a visit anywhere else
 * can never pay it.
 */
function deedSatisfied(
  id: LudiDeedId,
  profile: PlayerProfile,
  field: LudiProgress,
  event: LudiDeedEvent,
  visitsToday: string[],
  visitTarget: string,
): boolean {
  switch (id) {
    case 'win_duel':
      return event.won === true;
    case 'peak_hype':
      return event.won === true && (event.crowdHypePeak ?? 0) > LUDI_PEAK_HYPE_TARGET;
    case 'train':
      return event.trained === true;
    case 'visit_hub':
      return visitsToday.includes(visitTarget);
    case 'earn_fame':
      return (
        event.atDuelResult === true &&
        (typeof profile.fame === 'number' && Number.isFinite(profile.fame) ? profile.fame : 0) >=
          field.fameBaseline + LUDI_DAY_FAME_TARGET
      );
    default:
      return false;
  }
}

/**
 * THE ONE SETTLEMENT — a deed (or a hub visit) completed inside an existing save path.
 *
 * Called by the three shipped seams and nothing else: the duel result, `handleTrainStat` and
 * the city's `handleVisitLocation` (which passes the location id it already resolved). It
 *
 *   1. resolves today's Acta, the stored day-state and the day's one visit district;
 *   2. records the visit this transaction made in `visitsToday` (deduped, in visit order);
 *   3. decides which of today's UNPAID deeds the event satisfies, ONCE, from the profile as
 *      it arrived — never from the profile it is about to write;
 *   4. pays every completed deed `LUDI_DEED_FAME` fame and `LUDI_DEED_GOLD` gold;
 *   5. if that completed the day, adds ONE Laurel through the shared `withLaudes` counter and
 *      ONE Favour (no extra gold, no extra fame);
 *   6. records the paid ids.
 *
 * It is IDENTITY-STABLE when nothing moved (no deed, no visit, the stored day already today),
 * so a caller can compare object identity to decide whether a save is needed — the same
 * contract `withPeakGold` and `markTriumphsViewed` keep. A second call with the same event
 * pays nothing, because the ids are already in `deedsDone`.
 */
export function settleLudiDeeds(
  profile: PlayerProfile | null | undefined,
  event: LudiDeedEvent = {},
): LudiSettlement {
  if (!profile) return NOTHING(profile as unknown as PlayerProfile);

  const day = resolveLudiDay(profile);
  const raw = resolveLudiProgress(profile);
  const field = todayProgress(profile, day);
  const drawn = ludiDeedsForDay(day);
  const visitTarget = ludiVisitLocationForDay(day);
  const done = new Set(field.deedsDone);
  // The visit is recorded FIRST, so the deed reads the list the day will actually hold.
  const visitsToday = recordVisit(field.visitsToday, event.locationId);

  // ONE pass, over the profile as it arrived: paying a deed cannot open another.
  const completed: LudiDeed[] = [];
  for (const id of drawn) {
    if (done.has(id)) continue;
    if (!deedSatisfied(id, profile, field, event, visitsToday, visitTarget)) continue;
    completed.push({ id, label: ludiDeedLabel(id, day) });
    done.add(id);
  }

  if (completed.length === 0 && visitsToday === field.visitsToday && raw.day === day) {
    return NOTHING(profile);
  }

  const wasComplete = drawn.length > 0 && drawn.every((id) => field.deedsDone.includes(id));
  const allDone = drawn.length > 0 && drawn.every((id) => done.has(id));
  const laurelEarned = allDone && !wasComplete;
  const favourEarned = laurelEarned ? LUDI_LAUREL_FAVOUR : 0;

  const fame = (typeof profile.fame === 'number' && Number.isFinite(profile.fame) ? profile.fame : 0)
    + completed.length * LUDI_DEED_FAME;
  const gold = (typeof profile.gold === 'number' && Number.isFinite(profile.gold) ? profile.gold : 0)
    + completed.length * LUDI_DEED_GOLD;

  let next: PlayerProfile = {
    ...profile,
    fame,
    gold,
    ludi: {
      day,
      deedsDone: [...field.deedsDone, ...completed.map((deed) => deed.id)],
      favour: field.favour + favourEarned,
      lastAlmsDay: field.lastAlmsDay,
      fameBaseline: field.fameBaseline,
      visitsToday,
    },
  };
  if (laurelEarned) next = withLaudes(next, LUDI_LAUREL_FAVOUR);

  return { profile: next, completed, laurelEarned, favourEarned };
}

/* ── The shrine's alms ───────────────────────────────────────────────────── */

/**
 * THE ALMS-DAY — one Favour, once per exertion day, at the shrine's SUCCESSFUL offering.
 *
 * Called from `handleOfferOmen` after `offerOmen` has already accepted the offering, and
 * that is deliberate: a refusal (an omen already taken, too little gold) pays nothing, so
 * the favour is a reward for the alms and never for a click. `lastAlmsDay` is the whole
 * guard — the same day again returns the SAME profile object, so the caller's save is
 * skipped. The Omen's own price, effects and expiry are untouched by this function.
 */
export function withLudiAlms(profile: PlayerProfile | null | undefined): PlayerProfile {
  if (!profile) return profile as unknown as PlayerProfile;
  const day = resolveLudiDay(profile);
  const raw = resolveLudiProgress(profile);
  if (raw.lastAlmsDay === day) return profile;
  const field = todayProgress(profile, day);
  return {
    ...profile,
    ludi: {
      ...field,
      day,
      favour: field.favour + LUDI_ALMS_FAVOUR,
      lastAlmsDay: day,
    },
  };
}

/* ── The rollover ─────────────────────────────────────────────────────────── */

/**
 * THE DAY'S RESET — run by `App.onDayRollover` in the SAME save as the day's other effects.
 *
 * `deedsDone`, `fameBaseline` and `visitsToday` are the day's own and are cleared; the fame
 * baseline is re-based on the fame the gladiator wakes into this day with; `favour` and the
 * shared Laurel total persist, because both are lifetime counters. Nothing is owed for an
 * unfinished Acta — the design's own rule, and the reason no "unfinished business" line is
 * ever printed.
 */
export function applyLudiRollover(profile: PlayerProfile, day: number): PlayerProfile {
  const field = resolveLudiProgress(profile);
  return {
    ...profile,
    ludi: {
      day,
      deedsDone: [],
      favour: field.favour,
      lastAlmsDay: field.lastAlmsDay,
      fameBaseline:
        typeof profile.fame === 'number' && Number.isFinite(profile.fame)
          ? Math.max(0, Math.floor(profile.fame))
          : 0,
      visitsToday: [],
    },
  };
}
