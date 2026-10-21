/**
 * CL-1 — the coach-mark foundation: one seen-state resolver, one card registry
 * and the single write that records a card as seen.
 *
 * The design follows the module it is modelled on — `resolveRacingState` in
 * `racingProgression.ts`:
 *
 *   • `resolveSeenState(profile)` is the effective state of any profile.  It is
 *     pure and total: a save with no `seen` field at all (every pre-CL save,
 *     local or in the cloud), a partial field, a `seen` value of the wrong type
 *     and a hand-edited entry that is not `true` all resolve to a record that
 *     simply holds fewer ids.  It never throws, never repairs the save and never
 *     mutates the profile it is handed.
 *   • `markSeen(profile, id)` is the ONLY writer.  It returns a NEW profile with
 *     the id recorded and touches nothing else, so the caller hands the result to
 *     the existing `saveProfile()` path exactly as the chariot and racing
 *     transactions do.  `createNewProfile()` never sets `seen`, and no migration
 *     exists: a card is recorded only when it is actually put on screen.
 *   • `COACH_CARDS` is the one source of truth for every card's copy.  The cards
 *     and the future Codex shelf read the same strings from here, so a card's text
 *     can never drift between the two.
 *
 * Nothing in this module reads or writes storage, and nothing reads a setting or
 * an environment: it is data plus a few pure functions.
 */

import { PlayerProfile } from '../types/game';

/**
 * The profile field's shape: the card ids already shown, each mapped to `true`.
 * A legacy save has no `seen` field at all — see `PlayerProfile` in `types/game.ts`.
 */
export type SeenState = Record<string, true>;

/** One registry entry: who says it (when anyone), what they say, and its Codex page. */
export interface CoachCard {
  /** The speaker's name, when the card is spoken by a named keeper. */
  speaker?: string;
  text: string;
  /**
   * The future Codex page this copy lives on — the card id is its stem, so a
   * briefing card's page is its building's own page.
   */
  codexEntry: string;
}

/** The card the first hub open shows, once per profile. */
export const HUB_FIRST_OPEN_CARD_ID = 'HUB-1';

/**
 * THE CARD REGISTRY — every card's copy, verbatim, in one place.
 *
 * `D1`–`D9` are the Doctore's duel beats, `S1`–`S7` the Stablemaster's racing
 * beats, `HUB-1` the camp's own first-open card, and `BRIEF_<building slug>` the
 * building briefings (the slug is the building's own `HUB_LOCATIONS` id in
 * `utils/cityCollisions.ts`).  No trigger is wired for the `D`/`S`/briefing cards
 * in this slice — they are registry data only, and their beats wire in later
 * slices.
 */
export const COACH_CARDS: Record<string, CoachCard> = {
  D1: {
    speaker: 'The Doctore',
    text: 'Two ways to strike, boy. Quick is cheap and sure. Power costs breath and can break a man. Try Quick.',
    codexEntry: 'D1',
  },
  D2: {
    speaker: 'The Doctore',
    text: "You're swinging at air. Advance first — close the distance, then strike.",
    codexEntry: 'D2',
  },
  D3: {
    speaker: 'The Doctore',
    text: 'Winded already? Guard to catch your breath — or Taunt the crowd and let them carry you.',
    codexEntry: 'D3',
  },
  D4: {
    speaker: 'The Doctore',
    text: 'He hid behind his shield. Power strikes and patience crack a guard — watch his stamina, not just his health.',
    codexEntry: 'D4',
  },
  D5: {
    speaker: 'The Doctore',
    text: "He's reeling. Now spend it — Power, while the crowd is loud.",
    codexEntry: 'D5',
  },
  D6: {
    speaker: 'The Doctore',
    text: "Hear that? That's hype — fight bold and the crowd feeds your fame. They remember the loud ones.",
    codexEntry: 'D6',
  },
  D7: {
    speaker: 'The Doctore',
    text: "See him wind up? That's a telegraph. When a big man glows like that — Dodge. Do not trade with it.",
    codexEntry: 'D7',
  },
  D8: {
    speaker: 'The Doctore',
    text: 'Down, not done. Losing costs you nothing but pride here — eat, train, come back. The sand keeps everyone who returns.',
    codexEntry: 'D8',
  },
  // Registered now; its trigger belongs to a later slice.
  D9: {
    speaker: 'The Doctore',
    text: 'A Palma — a victory palm. Your deeds, carried into the fight. Equip up to three.',
    codexEntry: 'D9',
  },
  S1: {
    speaker: 'The Stablemaster',
    text: "A chariot is nothing without a team. You start with a Biga — two horses. Earn, and we'll talk of three and four.",
    codexEntry: 'S1',
  },
  S2: {
    speaker: 'The Stablemaster',
    text: 'Buying unlocks a team. Selecting fields it. Two different acts, driver — the workshop sells the first, the config chooses the second.',
    codexEntry: 'S2',
  },
  S3: {
    speaker: 'The Stablemaster',
    text: "This panel shows the team you'll actually field — the one selected, not the best you own. Change it at the workshop.",
    codexEntry: 'S3',
  },
  S4: {
    speaker: 'The Stablemaster',
    text: "On GO — ease the reins. A chariot that's thrown wide at the meta is a chariot walking home.",
    codexEntry: 'S4',
  },
  S5: {
    speaker: 'The Stablemaster',
    text: 'Thumbs are reins. Push to run, hold back to brake, lean into the turn before the posts — the team answers late.',
    codexEntry: 'S5',
  },
  S6: {
    speaker: 'The Stablemaster',
    text: 'Wrong way, driver! The arrow points to your next gate. Follow the gates in order and the laps will count.',
    codexEntry: 'S6',
  },
  // Panel text — no speaker.
  S7: {
    text: 'Stage 1 fields your yoked pair — your full team takes the track in a later stage.',
    codexEntry: 'S7',
  },
  // No speaker: the camp explains itself.
  'HUB-1': {
    text: "This camp is your career: train, buy, fight. The Scribe's Library explains everything — it's all in the Codex.",
    codexEntry: 'HUB-1',
  },
  BRIEF_training_yard: {
    speaker: 'The Doctore',
    text: 'My yard. Gold buys lessons here — one session, one stronger limb. Come poor, leave dangerous.',
    codexEntry: 'BRIEF_training_yard',
  },
  BRIEF_gladiator_academy: {
    speaker: 'The Doctore',
    text: "The Academy is my yard's harder brother: the Intensive Course, two lessons at once, for fighters of level 3 and up.",
    codexEntry: 'BRIEF_gladiator_academy',
  },
  BRIEF_doctore_house: {
    speaker: 'The Doctore',
    text: "My house. Lessons I've already taught live in your Codex — and two Palmae are mine to sell, when you've the gold.",
    codexEntry: 'BRIEF_doctore_house',
  },
  BRIEF_smithing_forge: {
    speaker: 'The Faber',
    text: "Weapons, and weapons only. Bring me a blade you've bought and I'll temper it hotter — that's the anvil by the door.",
    codexEntry: 'BRIEF_smithing_forge',
  },
  BRIEF_armor_workshop: {
    speaker: 'The Armorer',
    text: "Armor. Every slot, every metal — bronze today, gilded steel when you're famous. If it stops a blade, it's on my wall.",
    codexEntry: 'BRIEF_armor_workshop',
  },
  BRIEF_general_store: {
    speaker: 'The Merchant',
    text: 'Small goods for hard days: poultices and salves for fighters carrying an injury. No steel here — the Forge is that way.',
    codexEntry: 'BRIEF_general_store',
  },
  BRIEF_merchant_house: {
    speaker: 'The Factor',
    text: "Rare and legendary pieces, for purses that no longer count coppers. If it's on my shelf, it has a name.",
    codexEntry: 'BRIEF_merchant_house',
  },
  BRIEF_tavern: {
    speaker: 'The Keeper',
    text: "Rumors are my stock: fifteen gold, and I'll tell you exactly what the next man across the sand can do.",
    codexEntry: 'BRIEF_tavern',
  },
  BRIEF_caravanserai: {
    speaker: 'The Innkeeper',
    text: 'Rest is a medicine here: a night under my roof shortens any injury. Cheaper than the medicus, slower too.',
    codexEntry: 'BRIEF_caravanserai',
  },
  BRIEF_arena_medical_house: {
    speaker: 'The Medicus',
    text: "Bring me your injuries. Seventy-five gold and I take them off entirely — or rest and potions, if you're poor and patient.",
    codexEntry: 'BRIEF_arena_medical_house',
  },
  BRIEF_stable: {
    speaker: 'The Stablemaster',
    text: 'Teams, wheels, finishes — everything that rolls. What you buy here, you select here too. Be sure which is which.',
    codexEntry: 'BRIEF_stable',
  },
  BRIEF_colosseum: {
    speaker: 'The Herald',
    text: "The tournament ladder lives here. Beat a tier's boss and the next tier opens. The crowd is already chanting.",
    codexEntry: 'BRIEF_colosseum',
  },
  BRIEF_bounty_hall: {
    speaker: 'The Herald',
    text: "The Board posts the day's deeds each morning — three small jobs, one Laurel if you finish them all.",
    codexEntry: 'BRIEF_bounty_hall',
  },
  BRIEF_records_house: {
    speaker: 'The Scribe',
    text: 'Your career, written down: Triumphs, the Codex, and every word of the arena explained. Nothing here is lost.',
    codexEntry: 'BRIEF_records_house',
  },
  BRIEF_shrine_temple: {
    speaker: 'The Attendant',
    text: "On Fortuna's Day, leave alms and take an Omen into one fight — you'll always see what it does before you fight.",
    codexEntry: 'BRIEF_shrine_temple',
  },
  BRIEF_veteran_gladiator_hall: {
    speaker: 'The Scribe',
    text: 'Where Legends hang their names. Earn the Rudis — the wooden sword — and your name joins them.',
    codexEntry: 'BRIEF_veteran_gladiator_hall',
  },
  // No speaker.
  BRIEF_bathhouse: {
    text: 'The thermae. No business here but steam — the city lets even fighters breathe.',
    codexEntry: 'BRIEF_bathhouse',
  },
  BRIEF_gladiator_barracks: {
    text: 'The barracks. Your brothers eat, mend, and lie about their scars here.',
    codexEntry: 'BRIEF_gladiator_barracks',
  },
  BRIEF_town_gate: {
    text: 'The Ishtar Gate. The city behind you, the road ahead — everything you need is inside the walls for now.',
    codexEntry: 'BRIEF_town_gate',
  },
  BRIEF_northern_fortress: {
    text: 'The fortress watches the northern road. It has no door for fighters — its story comes later, if it comes.',
    codexEntry: 'BRIEF_northern_fortress',
  },
};

/**
 * The registry entry for a card id, or `undefined` for an id that is not a card.
 * A caller draws nothing rather than guessing at copy.
 */
export function getCoachCard(id: unknown): CoachCard | undefined {
  if (typeof id !== 'string' || id.length === 0) return undefined;
  return COACH_CARDS[id];
}

/**
 * The player's seen state, resolved.
 *
 * Never throws and never returns something a caller cannot use:
 *   • no profile, no `seen` field, or a `seen` value that is not a plain object
 *     (a string, a number, `null`, an array) resolves to `{}` — the fresh profile's
 *     state, and the state a legacy save without the field loads as;
 *   • an entry whose value is not exactly `true` is dropped, so a hand-edited or
 *     half-written save cannot mark a card seen;
 *   • the returned record is a fresh object: mutating it cannot touch the profile.
 */
export function resolveSeenState(profile: PlayerProfile | null | undefined): SeenState {
  const stored = profile?.seen;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};

  const seen: SeenState = {};
  for (const [id, value] of Object.entries(stored)) {
    if (value === true) seen[id] = true;
  }
  return seen;
}

/** Has this profile already been shown this card? Read-only, never writes. */
export function hasSeenCard(
  profile: PlayerProfile | null | undefined,
  id: unknown
): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  return resolveSeenState(profile)[id] === true;
}

/**
 * Record a card as seen on display.
 *
 * Returns a NEW profile — the caller's own object and its `seen` record are never
 * mutated — carrying the existing ids plus this one, and nothing else changes.
 * It is idempotent in both senses that matter: a card already seen returns the
 * SAME profile reference and writes nothing, so a repeated call (a double-mounted
 * effect, a second click) is a true no-op.  A card id that is not a string, or is
 * empty, records nothing and returns the profile unchanged; a missing profile
 * returns `null`.
 */
export function markSeen(
  profile: PlayerProfile | null | undefined,
  id: unknown
): PlayerProfile | null {
  if (!profile) return null;
  if (typeof id !== 'string' || id.length === 0) return profile;
  if (hasSeenCard(profile, id)) return profile;

  return { ...profile, seen: { ...resolveSeenState(profile), [id]: true } };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * CL-3 — the Doctore's guided beats: the pure trigger engine.
 *
 * `evaluateBeats(snapshot, seen)` answers ONE question: which beat, if any,
 * should be on screen next. It reads a snapshot of the duel's own state and the
 * profile's resolved `seen` record, and returns the lowest-numbered unseen beat
 * whose state is true — or `null` when there is nothing to say. It is a
 * decision, not a side effect: it renders nothing, records nothing and never
 * touches the profile, so the same inputs always answer the same id.
 *
 * The snapshot is only what DuelScene already holds (turn phase, range, the
 * player's stamina and the two strike costs, the last resolved player strike,
 * both fighters' health, crowd hype, the boss telegraph flag) plus, on the
 * result screen, the duel's result and the profile's loss count. No beat reads
 * a screen side (Lefty/Righty safe): the triggers name ACTIONS and STATE, never
 * a hand or a panel position.
 *
 * Every trigger is state-based, not opponent-scripted: a player who never meets
 * Marcus still learns D2–D7 in their actual first fights, and a beat already in
 * `seen` never fires again for any opponent.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The opponent D1 walks a first-timer through their opening turn against. */
export const FIRST_DUEL_OPPONENT_ID = 'opp_marcus';

/** The hype reading CombatHUD calls HIGH — D6 fires when the meter crosses it. */
export const HYPE_HIGH = 40;

/**
 * D5's "low" half: an opponent at or below a quarter of its health is reeling
 * enough to finish. **The shipped combat has no staggered state** — no
 * `FighterState` field, no action and no AI branch produces one — so the
 * "staggered" half of the design's "staggered or low" cannot be evaluated from
 * state DuelScene holds and is deliberately NOT approximated with an invented
 * flag. D5 therefore triggers on the "low" reading alone.
 */
export const OPPONENT_REELING_HEALTH_FRACTION = 0.25;

/** What the last resolved PLAYER strike did — the outcomes D2 and D4 read. */
export type PlayerStrikeResult = 'landed' | 'blocked' | 'missed_out_of_reach';

/** Everything DuelScene already holds while a duel is running. */
export interface FightSnapshot {
  phase: 'fight';
  /** The opponent config's own id (D1 is Marcus's opening turn only). */
  opponentId: string;
  /** `opponent.isBoss` — the telegraph is boss-gated in the shipped combat. */
  isBoss: boolean;
  /** How many player turns have begun this duel; the opening turn is 1. */
  playerTurn: number;
  /** It is the player's turn and no action is resolving. */
  playerActing: boolean;
  /** The range status: the player's weapon reaches the opponent right now. */
  inReach: boolean;
  playerStamina: number;
  playerStaminaMax: number;
  quickStaminaCost: number;
  powerStaminaCost: number;
  /** The last resolved player strike, or null before the first one. */
  lastPlayerStrike: PlayerStrikeResult | null;
  opponentHealth: number;
  opponentHealthMax: number;
  hype: number;
  /** The boss's telegraph warning is up (`opp.telegraphText`). */
  telegraph: boolean;
}

/** What the result screen knows: the outcome and the profile's loss record. */
export interface ResultSnapshot {
  phase: 'result';
  result: 'win' | 'loss';
  /** The profile's lifetime losses AFTER this duel was written. */
  losses: number;
}

/** The minimal state a beat is decided from — the fight, or the result screen. */
export type CombatSnapshot = FightSnapshot | ResultSnapshot;

/** The in-fight beats, in priority order (lowest number first). */
export const DUEL_BEAT_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] as const;

/** How many further resolved actions dismiss a shown beat. */
export const BEAT_EXPIRY_ACTIONS = 2;

/**
 * The action each in-fight beat teaches, so performing it dismisses the card.
 * These are the panel's own `CombatActionType` names; D8 is a result-screen card
 * and is dismissed by its ✕ (or by leaving the result).
 */
const BEAT_DISMISS_ACTIONS: Record<string, readonly string[]> = {
  D1: ['quick_attack'],
  D2: ['advance'],
  D3: ['shield_block', 'taunt'],
  D4: ['power_attack'],
  D5: ['power_attack'],
  D6: ['taunt'],
  D7: ['dodge'],
};

/** Does performing `action` dismiss `beatId`? Unknown ids or actions answer false. */
export function beatDismissesOn(beatId: unknown, action: unknown): boolean {
  if (typeof beatId !== 'string' || typeof action !== 'string') return false;
  return BEAT_DISMISS_ACTIONS[beatId]?.includes(action) ?? false;
}

/** Is the opponent in D5's "low" reading — alive, and at or below a quarter? */
function opponentIsReeling(snapshot: FightSnapshot): boolean {
  const { opponentHealth, opponentHealthMax } = snapshot;
  if (!Number.isFinite(opponentHealth) || !Number.isFinite(opponentHealthMax)) return false;
  if (opponentHealthMax <= 0 || opponentHealth <= 0) return false;
  return opponentHealth / opponentHealthMax <= OPPONENT_REELING_HEALTH_FRACTION;
}

/** The state trigger for one beat, exactly as the design words it. */
function beatTriggered(id: string, snapshot: CombatSnapshot): boolean {
  if (id === 'D8') {
    return snapshot.phase === 'result' && snapshot.result === 'loss' && snapshot.losses === 1;
  }

  // D1–D7 are in-fight beats and never fire on the result screen.
  if (snapshot.phase !== 'fight') return false;

  switch (id) {
    case 'D1':
      return (
        snapshot.opponentId === FIRST_DUEL_OPPONENT_ID &&
        snapshot.playerTurn === 1 &&
        snapshot.playerActing
      );
    case 'D2':
      return snapshot.lastPlayerStrike === 'missed_out_of_reach';
    case 'D3':
      return (
        Number.isFinite(snapshot.playerStamina) &&
        Number.isFinite(snapshot.powerStaminaCost) &&
        snapshot.playerStamina < snapshot.powerStaminaCost
      );
    case 'D4':
      return snapshot.lastPlayerStrike === 'blocked';
    case 'D5':
      return (
        Number.isFinite(snapshot.playerStamina) &&
        Number.isFinite(snapshot.playerStaminaMax) &&
        snapshot.playerStaminaMax > 0 &&
        snapshot.playerStamina >= snapshot.playerStaminaMax &&
        opponentIsReeling(snapshot)
      );
    case 'D6':
      return Number.isFinite(snapshot.hype) && snapshot.hype > HYPE_HIGH;
    case 'D7':
      return snapshot.isBoss === true && snapshot.telegraph === true;
    default:
      return false;
  }
}

/**
 * The next beat to show, or `null`.
 *
 * Priority is the beat number: when several triggers are true at once the
 * lowest-numbered unseen beat wins, so exactly one card is ever on screen. A
 * beat already in `seen` never fires again. Pure and total — it never throws,
 * never mutates `seen` and never reads a profile.
 */
export function evaluateBeats(
  snapshot: CombatSnapshot,
  seen: SeenState | null | undefined
): string | null {
  const isSeen = (id: string) => seen !== null && seen !== undefined && seen[id] === true;

  for (const id of [...DUEL_BEAT_IDS, 'D8']) {
    if (!isSeen(id) && beatTriggered(id, snapshot)) return id;
  }
  return null;
}
