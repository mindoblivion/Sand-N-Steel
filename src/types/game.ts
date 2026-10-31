export type WeaponType = 'sword_shield' | 'spear' | 'dual_blades' | 'mace';

/**
 * C-8.70C — the three bout modes a player may choose on the pre-fight card.
 * Session-only: the mode is chosen per bout and is never written to a save (the
 * result record carries it in memory only — see `DuelStatistics.boutMode`).
 */
export type BoutMode = 'sand' | 'steel' | 'invictus';

/** The two profile values a mode's Steel delta moves (and the values are clamped to). */
export interface SteelDelta {
  aggression: number;
  blockChance: number;
}

export type ArmorSlot = 'helm' | 'chest' | 'arms' | 'legs';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type AIPersonality = 'Aggressive' | 'Defensive' | 'Tricky' | 'Berserker';

/**
 * The four LADDER bosses' mechanics — the ones the duel actually runs, each with
 * its own branch in `DuelScene` and its own presentation moment
 * (`utils/bossPresentation.ts`).
 */
export type LadderBossMechanic =
  | 'heavy_telegraph'
  | 'phase_weapon_switch'
  | 'counter_dodge'
  | 'rage_mode_colossus';

/**
 * D-1 — the five FEATURE bouts' signature mechanics. Carried as inert data in
 * this slice: no branch in the duel reads them, so a feature bout plays exactly
 * as a standard boss fight until each boss's own D-slice wires its mechanic.
 */
export type FeatureBossMechanic =
  | 'beast_hunt'
  | 'false_telegraph'
  | 'unbroken_panoply'
  | 'yoked_brothers'
  | 'the_long_memory';

export type BossMechanic = LadderBossMechanic | FeatureBossMechanic;

/**
 * D-3 — Varro's false telegraph, as data (boss-rosters.md Part A).
 *
 * `feintChance` is the seeded roll a heavy makes once the teaching sequence is
 * spent; `teachingSequence` FORCES the first heavies so the player learns the
 * tell (true, then feint) before the dice take over. The tell itself is never
 * data: a feint is always `light`, a true heavy always `planted`.
 */
export interface FalseTelegraphConfig {
  /** P(feint) once the teaching pair is spent — a number in [0, 1]. */
  feintChance: number;
  /** The heavies 1..n, forced in this order, before the roll governs. */
  teachingSequence: ('true' | 'feint')[];
  /** Two Faces: the next TRUE heavy after a feint deals this much damage (1.15). */
  feintFollowUpMult: number;
}

/** D-3 — the three pride pieces of Gnaeus's panoply. */
export type PanoplyPieceId = 'crest' | 'facing' | 'pauldron';

/** One pride piece: cracks 0 … `breakAt`, broken at `breakAt`. */
export interface PanoplyPieceConfig {
  id: PanoplyPieceId;
  /** The piece as the HUD names it ("shield facing", "crest", "pauldron"). */
  name: string;
  /** Cracks that break it (2). */
  breakAt: number;
}

/**
 * D-3 — Gnaeus's unbroken panoply, as data.
 *
 * There is NO strike-line model in this combat system (no high/mid/low), so the
 * crack order is the `pieces` array's own order — the shipped fallback the
 * design permits, stated in the row and in the report.
 */
export interface PanoplyConfig {
  /** In CRACK ORDER: the first unbroken piece takes each crack. */
  pieces: PanoplyPieceConfig[];
  /** The crest's aggression, added to the row's base while it shines. */
  crestAggressionBonus: number;
  /** The facing's blockChance, added to the row's base while it shines. */
  facingBlockChanceBonus: number;
  /** The pauldron's damage-taken multiplier while it shines (0.90). */
  pauldronDamageTakenMult: number;
  /** Crowd hype the player gains on each piece that breaks. */
  breakHype: number;
  /** Vainheart: attacks armed by a break. */
  vainheartAttacks: number;
  /** Vainheart's damage multiplier (1.12). */
  vainheartDamageMult: number;
  /** The permanent shift once all three are broken. */
  humiliated: { blockChanceDelta: number; aggressionDelta: number };
}

/**
 * D-1 — a feature boss's authored presentation state name (boss-rosters.md
 * Part A). In this slice the NAME is data only: the AI-4 presentation key map
 * that would dress it is not in the tree, so every feature boss keeps the
 * standard boss loge dressing (`data/bossPresentationStates.ts`).
 */
export type BossPresentationState = 'dawn' | 'high-noon' | 'gilded' | 'brothers' | 'dusk';

/**
 * D-1 — what a Feature Bout asks of a profile before it can be entered. Every
 * condition is inclusive and every value is data: no gate is restated in a
 * component, and the words the tab prints are built from this shape.
 */
export interface FeatureBoutGate {
  /** The DERIVED rank (`utils/rank.ts`) the bout demands. */
  rank: PlayerProfile['rank'];
  /** A ladder boss whose first defeat the bout demands, by roster id. */
  bossDefeatedId?: string;
  /** The tier the player must have REACHED (`currentTier` >= this). */
  tierReached?: number;
}

export type CharacterModelType = 'roman_warrior' | 'procedural_gladiator' | 'amazonian' | 'retiarius' | 'minotaur' | 'dimachaerus';

export interface WeaponItem {
  id: string;
  name: string;
  type: WeaponType;
  rarity: ItemRarity;
  description: string;
  damageLight: number;
  damageHeavy: number;
  staminaLight: number;
  staminaHeavy: number;
  range: number;
  speed: number;
  blockReduction: number;
  price: number;
  sellPrice: number;
  color: string;
  metalColor: string;
  icon: string;
  /** Optional real mesh asset for this weapon (see data/itemsDB.ts). */
  modelPath?: string;
  bonusStrength?: number;
  bonusAgility?: number;
  bonusStamina?: number;
  bonusDefense?: number;
}

export interface ArmorItem {
  id: string;
  slot: ArmorSlot;
  name: string;
  rarity: ItemRarity;
  description: string;
  defense: number;
  staminaRegenBonus: number;
  healthBonus?: number;
  price: number;
  sellPrice: number;
  color: string;
  trimColor: string;
  style?: string;
  bonusStrength?: number;
  bonusAgility?: number;
  bonusDefense?: number;
  bonusStamina?: number;
}

export interface FighterStats {
  strength: number;
  agility: number;
  stamina?: number;
  staminaMax: number;
  staminaRegen: number;
  defense: number;
  healthMax: number;
}

export interface FighterLoadout {
  weapon: WeaponItem;
  helm?: ArmorItem;
  chest?: ArmorItem;
  arms?: ArmorItem;
  legs?: ArmorItem;
}

export type FighterAction = 
  | 'idle' 
  | 'walk' 
  | 'attack_light' 
  | 'attack_heavy' 
  | 'block' 
  | 'dodge' 
  | 'hit' 
  | 'death';

export type ClothingStyle = 'gladiator_sash' | 'roman_tunic' | 'centurion_harness' | 'champion_mantle';

/**
 * CH-3a — the Provocator's Mirror Drill ledger: which attack types have already
 * landed on this fighter.  "After the first hit of each attack type, you take
 * 8% less damage from that type", so the FIRST hit of a type resolves at full
 * damage and every later hit of that type takes the doctrina's multiplier.
 *
 * Runtime state only — it lives on `FighterState` for the length of one duel
 * and is never written to a save.
 */
export interface MirrorDrillLedger {
  light?: boolean;
  power?: boolean;
}

export interface FighterState {
  id: string;
  name: string;
  title: string;
  isPlayer: boolean;
  position: [number, number, number];
  rotationY: number;
  health: number;
  stamina: number;
  action: FighterAction;
  actionTimer: number;
  isBlocking: boolean;
  isInvulnerable: boolean;
  hitFlashTimer: number;
  stats: FighterStats;
  loadout: FighterLoadout;
  comboCount: number;
  skinColor: string;
  hairColor: string;
  tunicColor: string;
  crestColor?: string;
  sashColor?: string;
  clothTrimColor?: string;
  clothingStyle?: ClothingStyle;
  characterModel?: CharacterModelType;
  meshScale?: number;
  isRaged?: boolean;
  /** CH-3a — Mirror Drill's per-type ledger (Provocator only; see the type). */
  mirrorDrillTypes?: MirrorDrillLedger;
  /**
   * CH-3b — Cast the Net's transient duel state: how many of this fighter's own
   * actions the entangle still covers. 0/undefined = not entangled. Runtime
   * state only — never written to a profile or a save.
   */
  entangledTurns?: number;
  /** CH-3b — the retiarius' net is still in hand this fight (runtime only). */
  netAvailable?: boolean;
  telegraphTimer?: number;
  telegraphText?: string;
  isPhase2?: boolean;
  isLeftyMode?: boolean;
  /** Optional Living City day and visitor history; legacy saves remain valid. */
  city?: CityState;
}

export interface DamageNumber {
  id: string;
  text: string;
  type: 'damage' | 'crit' | 'blocked' | 'dodge' | 'hype';
  position: [number, number, number];
  createdAt: number;
}

export interface ArenaParticle {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
  color: string;
  scale: number;
  life: number;
  maxLife: number;
  type: 'spark' | 'dust' | 'flower' | 'coin';
}

/**
 * D-2 — the beast a `beast_hunt` Feature Bout fields, as DATA on its master's row.
 *
 * Every number here is AUTHORED for this slice (boss-rosters.md Part A carries no
 * beast numbers); each one states the Tier-2 value it is anchored to in
 * `data/opponents.ts`. The duel reads these values and nothing else: the beast has
 * no `FighterState`, no save and no stat block of its own, so a pounce consumes the
 * EXISTING hit/evasion/damage pipeline with these numbers substituted for a
 * fighter's.
 */
export interface BeastConfig {
  /** The beast's name, as the arena and the log lines call it. */
  name: string;
  /**
   * Which of the two published hit formulas the pounce rolls
   * (`calculateHitChance`'s quick or power variant). The pounce is dispatched as
   * that same action type, so it needs no branch of its own.
   */
  hitProfile: 'quick' | 'power';
  /** The agility the pounce's hit roll — and an attack aimed at the crouch — uses. */
  agility: number;
  /** The strength `calculateAttackDamage` is handed for the pounce. */
  strength: number;
  /** The pounce's base damage: the value a weapon's `damageLight` would hold. */
  pounceDamage: number;
  /** One crouch every this many boss action slots. */
  crouchEveryNthAction: number;
  /** Wounds that drive the beast off. */
  maxWounds: number;
  /** The master's aggression shift once the beast is gone, for the rest of the duel. */
  masterAloneAggressionBonus: number;
  /** Hype the crowd pays when the beast flees. */
  flightHype: number;
}

/**
 * D-4 — one brother of the Cotta pair, as DATA on the row.
 *
 * Each brother fights with HIS OWN published profile: the weapon his armatura
 * carries, and the aggression / blockChance the AI chooses with while he leads.
 * The duel reads these values and nothing else, so the pair's two halves can
 * differ without a second opponent row, a second HP pool or a second result flow.
 */
export interface YokedBrotherProfile {
  /** The brother as the arena, the log and the deep card name him. */
  name: string;
  /** The weapon his share of the pair fights with (`getWeaponByType`). */
  weaponType: WeaponType;
  /** The aggression the AI chooses with on his slots. */
  aggression: number;
  /** The blockChance the AI chooses with on his slots. */
  blockChance: number;
}

/**
 * D-4 — the Cotta brothers (Lucius & Gaius), as data on their ONE row.
 *
 * The pair is a single `OpponentConfig`: one row, one HP pool, one result flow,
 * one purse. `front` leads and takes the damage (his share is the pool above
 * the withdrawal line); `rear` circles and strikes the flank. Every strike —
 * the front's heavy, the rear's flank — is resolved by the duel's existing
 * attack pipeline with these published values substituted for a fighter's.
 */
export interface YokedBrothersConfig {
  /** The brother who leads, takes the damage and telegraphs the Crossing. */
  front: YokedBrotherProfile;
  /** The brother who circles to the flank and leads the survivor phase. */
  rear: YokedBrotherProfile;
  /** One Crossing every this many boss actions (4), while both brothers stand. */
  crossingEveryNthAction: number;
  /** The survivor's Oath: the remaining brother's damage multiplier (1.15). */
  survivorDamageMult: number;
  /** The survivor's Oath: the remaining brother's aggression shift (+0.10). */
  survivorAggressionBonus: number;
  /** The pair HP fraction at or below which the front brother is withdrawn (0.5). */
  withdrawalAtHealthFraction: number;
}

/**
 * D-5 — Hermas's long memory, as data (boss-rosters.md Part A, as published in
 * the Director addendum).
 *
 * He reads the PLAYER'S OWN offensive mix at two HP thresholds and sets himself
 * against whatever class the player leaned on. The values are the published
 * pattern's bounds rather than a second set of numbers: the power read's +0.10
 * blockChance is B4's own example, the quick read's mirror is AUTHORED (B4
 * publishes only the power case — see `utils/longMemory.ts`), and the caps are
 * the design's: no single adoption moves a value more than ±0.15, and every
 * effective value stays inside `clamp`.
 */
export interface LongMemoryConfig {
  /** The HP fractions he reads the mix at, highest first (0.66, then 0.33). */
  readAtHealthFractions: number[];
  /** A class must EXCEED this share of the player's offensive actions (0.60). */
  dominanceThreshold: number;
  /**
   * The blockChance move for the class the player leaned on. `power` is B4's
   * published +0.10; `quick` is the AUTHORED mirror (−0.15, so that Old Craft's
   * +0.05 leaves a net −0.10 per adoption, the same visible size the power read
   * leaves after its own stacking).
   */
  blockChanceDelta: { power: number; quick: number };
  /** Old Craft: the blockChance every adoption carries on top of its shift (+0.05). */
  oldCraftBlockChancePerAdoption: number;
  /** The cap on how far ANY single adoption may move a value (0.15). */
  maxDeltaPerAdoption: number;
  /** The absolute clamp on every effective value ([0.05, 0.95]). */
  clamp: { min: number; max: number };
}

/* ── C-8.70C — GRUDGE BOUTS ──────────────────────────────────────────────── */

/**
 * C-8.70C — the three-way summary of the player's own offensive mix over a bout:
 * the two attack classes D-5's live counter tracks, plus the balanced case.
 */
export type DominantOffensiveClass = 'quick' | 'power' | 'even';

/** The two profile values a grudge's rematch shifts (and the card prints). */
export interface GrudgeProfileValues {
  aggression: number;
  blockChance: number;
}

/**
 * C-8.70C — a generated GRUDGE BOUT: the beaten rival, come back having studied
 * the way the player beat them. Carried as data on the generated row, which is
 * produced by `utils/grudgeBouts.ts` from a regular `data/opponents.ts` row and
 * never stored in the roster.
 *
 * The row's `stats` are the base row's BYTE-IDENTICAL block: only `aggression`
 * and `blockChance` move, inside the published ±0.15 cap and the [0.05, 0.95]
 * clamp, and the AI reads them exactly as it reads any opponent's.
 */
export interface GrudgeBoutConfig {
  /** The roster row this rematch was generated from (`data/opponents.ts`). */
  baseId: string;
  /** The class the rival studied — the player's dominant mix in the bout he lost. */
  studied: DominantOffensiveClass;
  /**
   * THE EVOLVED-TRAIT SLOT — never null (design C3b; the Oct 19 QA amendment
   * retires addendum A's null fallback). A `Palma.id` from the safe subset,
   * resolved by `utils/extraPalmae.ts` from the BASE row at generation time and
   * ALSO appended to the generated row's own `palmae` array. Derived, never
   * stored: no save field carries it.
   */
  evolvedTrait: string;
  /** The base row's profile, before the studied shift. */
  baseProfile: GrudgeProfileValues;
  /** The profile the AI actually reads. */
  adjustedProfile: GrudgeProfileValues;
}

/**
 * C-8.70C — one rival's grudge, as stored on the save.
 *
 * Written only at the existing duel-result moments (`App.handleMatchComplete`):
 * the record is created on the FIRST victory over a regular opponent, `closed`
 * is set by a lost grudge (the anti-farm rule) and cleared by any standard bout
 * won at that grudge's own tier, and `settled` is set once the grudge itself has
 * been won. Nothing writes it on display or selection.
 */
export interface GrudgeRecord {
  /** The player's offensive mix over the bout they won against this rival. */
  dominant: DominantOffensiveClass;
  /** The grudge was taken and lost: closed until a standard bout at its tier is won. */
  closed?: boolean;
  /** The grudge was fought and won: settled permanently, never offered again. */
  settled?: boolean;
}

/**
 * C-8.70C — the grudges a save carries, keyed by the BASE roster row's id.
 * Optional on `PlayerProfile` exactly like every other lazy field: absent on a
 * save written before this slice, which `resolveGrudges` reads as "no grudges"
 * rather than repairing.
 */
export type GrudgeState = Record<string, GrudgeRecord>;

export interface OpponentConfig {
  id: string;
  name: string;
  title: string;
  tier: number;
  fightIndex: number;
  isBoss?: boolean;
  difficulty: 'rookie' | 'veteran' | 'champion';
  weaponType: WeaponType;
  personality: AIPersonality;
  recommendedLevel: number;
  stats: FighterStats;
  skinColor: string;
  hairColor: string;
  tunicColor: string;
  armorColor: string;
  aggression: number;
  blockChance: number;
  dodgeChance: number;
  /**
   * C-8.70C — the Steel profile delta this row carries. The published default
   * (+0.05 aggression / +0.05 blockChance) is applied to EVERY row; a row with a
   * different value would be an AUTHORED variation and must say so in its own
   * comment. Sand never reads it; Steel and Invictus add it and clamp the
   * result to [0.05, 0.95] (`data/boutModes.ts`).
   */
  steelDelta?: SteelDelta;
  rewardGold: number;
  rewardFame: number;
  rewardXp: number;
  meshScale?: number;
  characterModel?: CharacterModelType;
  /**
   * CH-4 — the opponent's fighting class. `DuelScene` resolves it into the
   * opponent's merged modifier block (`buildOpponentModifiers`), which is what
   * routes the class's doctrina (provocator's Mirror Drill, hoplomachus's
   * Spearman's Ground, retiarius's net, thraex's block penetration, …) through
   * the CH-3a/CH-3b plumbing. Absent means no class: the empty block.
   */
  armatura?: ArmaturaId;
  /**
   * CH-4 — the palmae the opponent carries, as `Palma.id` strings. Resolved
   * through the same `mergeModifiers` the player's save uses; an unknown id is
   * dropped and three is the cap. A `bossOnly` palma may only appear here on an
   * `isBoss` config, and its hand-wired effect lands at that boss's own
   * mechanic site (see `utils/bossPalmae.ts`).
   */
  palmae?: string[];
  bossMechanic?: BossMechanic;
  /**
   * D-3 — Varro's false telegraph, for a `false_telegraph` Feature Bout only.
   * `utils/falseTelegraph.ts`'s fence is what decides whether it can ever be used.
   */
  falseTelegraph?: FalseTelegraphConfig;
  /**
   * D-3 — Gnaeus's unbroken panoply, for an `unbroken_panoply` Feature Bout only.
   * `utils/panoply.ts`'s fence is what decides whether it can ever be used.
   */
  panoply?: PanoplyConfig;
  /**
   * D-4 — the Cotta brothers' pair data, for a `yoked_brothers` Feature Bout
   * only. `utils/yokedBrothers.ts`'s fence is what decides whether it can ever
   * be used: a row without the mechanic, the feature flag or the boss flag
   * fights as one standard fighter no matter what sub-data it carries.
   */
  brothers?: YokedBrothersConfig;
  /**
   * C-8.70C — the grudge marker on a GENERATED rematch row. Absent on every
   * roster row; `utils/grudgeBouts.ts` is the only producer, and its presence is
   * what makes a row a Grudge Bout (`isGrudgeBout`). Such a row is never
   * `isBoss`, never carries a boss mechanic and is never in `ALL_OPPONENTS`.
   */
  grudge?: GrudgeBoutConfig;
  /**
   * D-5 — Hermas's long memory, for a `the_long_memory` Feature Bout only.
   * `utils/longMemory.ts`'s fence is what decides whether it can ever be used: a
   * row without the mechanic, the feature flag or the boss flag never reads a
   * mix, no matter what sub-data it carries.
   */
  longMemory?: LongMemoryConfig;
  /**
   * D-1 — a Feature Bout: a boss faced outside the tier ladder. Appended to the
   * roster so saves keep their ids; it is NOT a ladder rung (`fightIndex` 0), it
   * never advances `currentTier`, never counts as a `bossKills` kill and never
   * satisfies another bout's boss gate (`isLadderBoss` in this module's data).
   */
  featureBout?: true;
  /**
   * STORY-4b — a BOUNTY BOUT: a rung of the Deserter's Price ladder (or its
   * final), fought from the Bounty Hall's board rather than a tier rung.
   * Appended to the roster so a save's ids resolve; `fightIndex` 0 (no rung).
   * Every ladder consumer fences it exactly as it fences a Feature Bout: it
   * never advances `currentTier`, never adds a `bossKills` stripe, never
   * generates a grudge, never earns an extra palma, never satisfies another
   * bout's gate and is never offered STORY-4a mercy. Read by
   * `utils/bountyLadder.ts` only.
   */
  bountyBout?: true;
  /**
   * STORY-4b — Director ruling R5: this opponent fights LEFT-HANDED. Implemented
   * with the shipped lefty stance (`FighterState.isLeftyMode` → `GladiatorMesh`
   * swaps the sword and shield hands), never as a stat change: the row carries no
   * phantom modifier and the duel computes exactly what it always computed.
   */
  leftHanded?: true;
  /** D-1 — the bout's gate, as data. Read by `utils/featureBouts.ts` only. */
  gate?: FeatureBoutGate;
  /**
   * D-1 — the boss card's line, verbatim from boss-rosters.md Part A. Printed on
   * the pre-fight card at identity-intel depth; never restated in a component.
   */
  cardLine?: string;
  /** D-1 — the authored presentation state NAME (the AI-4 key map is deferred). */
  presentationState?: BossPresentationState;
  /**
   * D-2 — the beast this row fields, for a `beast_hunt` Feature Bout only. Absent
   * on every other row; `utils/beastHunt.ts`'s fence is what decides whether it can
   * ever be used (a mechanic string alone is not enough).
   */
  beast?: BeastConfig;
  phase2WeaponType?: WeaponType;
  guaranteedDrop?: WeaponItem | ArmorItem;
  loadout?: FighterLoadout;
  clothingStyle?: ClothingStyle;
  sashColor?: string;
  clothTrimColor?: string;
}

export interface DuelStatistics {
  damageDealt: number;
  damageTaken: number;
  hitsLanded: number;
  perfectBlocks: number;
  dodgesPerformed: number;
  maxCombo: number;
  /**
   * STORY-2 — the stamina low-water mark, tracked the way `maxCombo` is: a
   * `Math.min` over the player's live stamina each time it moves, expressed as a
   * fraction of the maximum the player entered the duel with (1 = never dropped).
   * It is a reading of the fight, not a rule of it: no combat formula reads it.
   * The Doctore's "win fresh" restriction is the one consumer.
   */
  lowestStaminaFraction: number;
  /**
   * STORY-4b — the player's health low-water mark, tracked exactly the way
   * `lowestStaminaFraction` is: a `Math.min` over the player's live health each
   * time it moves, expressed as a fraction of the maximum he entered the duel
   * with (1 = never dropped). It is a reading of the fight, not a rule of it: no
   * combat formula reads it. The Unscarred's "never below half" bounty twist is
   * the one consumer. IN-MEMORY only — nothing saves `DuelStatistics`, so no save
   * format and no profile field changes; absent reads as 1 (never dropped).
   */
  lowestHealthFraction?: number;
  /**
   * PITCH A6 — the WINNER's remaining health, read at result time by `DuelScene`
   * exactly the way `lowestHealthFraction` is: the player's own fraction on a
   * player win, the opponent's on a player defeat, against the maximum that
   * fighter entered the duel with (1 = untouched).  It is the victory card's
   * margin (Director ruling R-MARGIN) and nothing else: a READING of the fight,
   * never consulted by any combat formula. IN-MEMORY only — nothing saves
   * `DuelStatistics`, so no save format and no profile field changes, and an
   * absent value simply omits the card's margin line.
   */
  winnerHealthFraction?: number;
  crowdHypePeak: number;
  durationSeconds: number;
  goldEarned: number;
  fameEarned: number;
  xpEarned: number;
  wagerEarned?: number;
  lootDrop?: WeaponItem | ArmorItem | null;
  /** The victory purse itemised (see `utils/duelRewards.ts`); absent on a defeat. */
  goldBreakdown?: DuelGoldBreakdown;
  /**
   * D-2 — the beast-hunt result screen's flavour line, computed in the duel from
   * its own beast state. IN-MEMORY only: it rides this object to the result modal
   * and is never written to a profile (nothing saves `DuelStatistics`).
   */
  beastEpilogue?: string;
  /**
   * D-5 — Hermas's adaptation log, computed IN MEMORY at result time from the
   * duel's own live mix counter and adaptation state: one line per threshold he
   * read, in numbers (what the mix was, and what it did to him). Like
   * `beastEpilogue` it rides this object to the result modal and is never
   * written to a profile — nothing saves `DuelStatistics`.
   */
  adaptationLines?: string[];
  /**
   * C-8.70C — the player's own offensive mix over this bout, READ at result time
   * from D-5's live counter (`utils/longMemory.ts`'s `LiveMixCounter`, counted by
   * `DuelScene` for every duel). Only the three-way summary rides this object to
   * App, which persists it on the first victory over a regular opponent.
   * IN-MEMORY only, exactly like `adaptationLines`: nothing saves DuelStatistics.
   */
  dominantOffensiveClass?: DominantOffensiveClass;
  /**
   * C-8.70C — the crowd's own line items on a victory, read off the duel's peak
   * hype and its turning. `fameEarned` and `goldEarned` ALREADY include them;
   * these three exist so the result screen can itemise them and say the crowd
   * turned. IN-MEMORY only, exactly like `adaptationLines`: nothing saves
   * `DuelStatistics`, so no save format and no profile field changes.
   */
  crowdPeakFameBonus?: number;
  crowdPeakGoldBonus?: number;
  crowdTurned?: boolean;
  /**
   * C-8.70C — the bout mode this result was fought under, recorded IN MEMORY
   * only (nothing saves `DuelStatistics`). The result screen uses it to print the
   * mode's own purse/renown lines; no profile field and no save format changes,
   * so the mode is session-only (see `data/boutModes.ts`).
   */
  boutMode?: BoutMode;
  /**
   * C-8.70C Slice C-D — "why you fell": at most three plain-language lines
   * computed IN MEMORY from this defeat's own tallies (`utils/whyYouFell.ts`).
   * Absent on every victory — the result screen is unchanged for a win except
   * where Slice C-B already added its crowd lines. Like `adaptationLines` it
   * rides this object to the result modal and is never written to a profile:
   * nothing saves `DuelStatistics`, so no save format changes.
   */
  whyYouFell?: string[];
}

/**
 * An itemised arena purse: the opponent's base bounty plus the performance
 * bonuses a victory pays. `total` is the gold credited to the player's purse.
 */
export interface DuelGoldBreakdown {
  base: number;
  hype: number;
  precision: number;
  flawless: number;
  total: number;
}

export interface TournamentTierInfo {
  tier: number;
  name: string;
  subtitle: string;
  description: string;
  minLevel: number;
}

export interface ArenaTheme {
  sandColor: string;
  sandRimColor: string;
  stoneColor: string;
  wallColor: string;
  bannerColors: [string, string];
  skyAmbient: string;
  sunLightColor: string;
  sunLightIntensity: number;
  rimLightColor: string;
  crowdCount: number;
}

export interface PlayerAppearance {
  skinColor: string;
  hairColor: string;
  tunicColor: string;
  crestColor: string;
  clothingStyle?: ClothingStyle;
  sashColor?: string;
  clothTrimColor?: string;
  characterModel?: CharacterModelType;
}

export interface PlayerInjury {
  fightsRemaining: number;
  penaltyStrength: number;
  penaltyAgility: number;
}

/**
 * Phase C-8.66B — the chariot slots.  P3 widened this from `wheels` | `finish` to
 * five: `axle`, `harness` and `chassis` are catalogue-only in that slice (no UI
 * sells them yet) and are resolved at READ time — see `ChariotEquippedResolved`.
 */
export type ChariotSlot = 'wheels' | 'finish' | 'axle' | 'harness' | 'chassis';

/**
 * Phase C-8.66B — the player's chariot ownership and fit-out, stored on the
 * gladiator save alongside gold and inventory.
 *
 * Optional on `PlayerProfile` on purpose: a save written before this phase has
 * no `chariot` field at all and must keep loading, so the workshop resolves a
 * missing or partial loadout to the stock chariot rather than repairing it.
 */
export interface ChariotLoadout {
  /** Owned chariot part ids.  The two stock parts are always owned. */
  owned: string[];
  /**
   * The equipped part id per slot, AS STORED.
   *
   * P3 wrote `wheels` and `finish` only, because no screen sold the newer slots.
   * P6's workshop sells all five, so the stored record now carries any slot
   * whose equipped part is NOT the slot's stock part; a slot on its stock part
   * is omitted and `resolveChariotLoadout` restores it at read time
   * (`ChariotEquippedResolved`).  A legacy wheels/finish-only record therefore
   * reads identically, and a stock chariot still stores no entry at all.
   */
  equipped: Partial<Record<ChariotSlot, string>>;
}

/**
 * P3 — the equipped part id for EVERY chariot slot, as resolved at read time.
 * Never stored: it is what `resolveChariotLoadout` returns, with the slots a
 * legacy save does not carry filled in with their stock parts.
 */
export type ChariotEquippedResolved = Record<ChariotSlot, string>;

/**
 * Phase C-8.67B — the three historical horse-team configurations:
 * Biga (2), Triga (3), Quadra (4).
 */
export type ChariotTeamSize = 2 | 3 | 4;

/**
 * Phase C-8.67B — racing progression, stored on the gladiator save alongside
 * gold, inventory and the chariot loadout.
 *
 * Optional on `PlayerProfile` on purpose, exactly like `chariot`: a save written
 * before this phase has no `racing` field at all and must keep loading, so the
 * pure helpers in `src/utils/racingProgression.ts` resolve a missing, partial or
 * malformed field to "Biga selected, Triga and Quadra locked" rather than
 * repairing the save.  Every field is optional for the same reason — a save may
 * carry only one of them and still be valid.
 */
export interface RacingProgression {
  /**
   * The team sizes the player has bought: only 3 (Triga) and/or 4 (Quadra).
   * Biga (2) is never stored — it is unlocked for every profile by definition.
   */
  unlocked?: number[];
  /** The team size the player races with.  2 | 3 | 4; anything else resolves to Biga. */
  selected?: number;
}

/**
 * STORY-1 — the campaign's own evidence, stored on the gladiator save.
 *
 * Optional on `PlayerProfile` on purpose, exactly like `chariot` and `racing`: a
 * save written before this slice has no `story` field at all and must keep
 * loading.  Every subfield is optional for the same reason — a save may carry
 * one of them and still be valid — so a partially-written field is a normal
 * state, not a corrupt one.
 *
 * Nothing writes this on creation: `createNewProfile()` never emits the field,
 * there is no migration, and the campaign reads it through the pure
 * `resolveStoryState()` (`src/utils/storyState.ts`) rather than repairing it.
 */
export interface StoryProgress {
  /** The player has read their own name in the Records & Lore Library. */
  librarySeen?: boolean;
  /** Fragment ids the player has found, in the order they were found. */
  fragmentsFound?: string[];
  /** The Northern Trial has been walked. */
  trialDone?: boolean;
  /** How the vulture's dice fell: cut, or refused. */
  diceEnding?: 'cut' | 'refused';
  /** What became of the deserter: spared, or taken. */
  deserterChoice?: 'spared' | 'taken';
  /** The player has stood on the summit above the city. */
  summitSeen?: boolean;
  /**
   * STORY-2 — the Doctore's Test was WON under the restriction the player chose.
   *
   * The duel's own victory write records it, in the same update that puts the test
   * opponent's id into `defeatedOpponentIds`. It is needed because the id alone
   * cannot tell a win that met the chosen rule from a win that did not: every win
   * records the id, only a compliant one records this. The campaign's
   * `doctore-test` gate reads both, so a legacy save (no field) simply has not
   * passed yet — and can, whenever it takes the Test.
   */
  doctoreTestPassed?: boolean;
  /**
   * STORY-4b — the Deserter's Price rungs CLEARED, by opponent id, in the order
   * they were cleared. A rung is only cleared by a victory that also met its
   * twist, and `defeatedOpponentIds` cannot say that (it records every win,
   * clearing or not), so the clear is a separate record — kept INSIDE this
   * existing object so no top-level profile field is added (§J stays at 21).
   */
  bountyRungs?: string[];
  /**
   * STORY-5a — THE LOADED DICE: the Quiet Dice chain's and the rumour board's
   * own state (`utils/diceTrail.ts`), kept INSIDE this existing object exactly as
   * `bountyRungs` is, so NO top-level profile field is added (§J stays at 22) and
   * `createNewProfile()` still writes no `story` field at all. Chain steps 1 and
   * 2 are DERIVED (the deep card in `intel`, the champion in
   * `defeatedOpponentIds`) and stored nowhere; only `boardOpen` (step 3's return,
   * which is also the chain's completion), the cards won and the house cup are
   * written. The ending is the sibling `diceEnding` flag below — Story-design
   * §9's own name for it — which this slice writes and Chapter 4 will read.
   */
  diceTrail?: DiceTrailProgress;
  /**
   * STORY-5b — THE NAME IN THE STONE: the Librarian chain's own record
   * (`utils/librarianChain.ts`), kept INSIDE this existing object exactly as
   * `bountyRungs` and `diceTrail` are, so NO top-level profile field is added
   * (§J stays at 22) and `createNewProfile()` still writes no `story` field.
   * Only the chain's boundary and its completion are stored; step 2 is DERIVED
   * from `defeatedOpponentIds` against that boundary, and the fragments ride
   * §9's `fragmentsFound` below.
   */
  librarianChain?: LibrarianChainProgress;
  /**
   * STORY-5b — the echo bout's FIRST victory has been spoken (the reveal line is
   * owed once). A story subfield, not a top-level field; the bout itself stays
   * repeatable afterwards.
   */
  echoWon?: boolean;
}

/**
 * STORY-5b — the Librarian chain's stored state (see
 * `StoryProgress.librarianChain`). Every member is optional: a partial record is
 * a normal state, and `resolveLibrarianChain` reads anything missing or
 * malformed as "not read, no boundary, not closed".
 *
 * STEP 1 (the Codex was opened) is the one recorded boundary — `felledAtRead` is
 * how many names `defeatedOpponentIds` held at that moment, which is what makes
 * STEP 2 ("a FIRST defeat after step 1") derivable without per-bout tracking.
 * STEP 3 is `closed`, and it opens the fragment sequence.
 */
export interface LibrarianChainProgress {
  /** The Codex page of the Library rack has been opened (step 1). */
  codexRead?: boolean;
  /** How many felled ids the record held when the Codex was read (step 2's boundary). */
  felledAtRead?: number;
  /** The return to Dionysios at Veteran was made — the chain is complete (step 3). */
  closed?: boolean;
}

/**
 * STORY-5a — the dice trail's stored state (see `StoryProgress.diceTrail`).
 *
 * Optional throughout, exactly like every other story subfield: a partial record
 * is a normal state, not a corrupt one, and `resolveDiceTrail` reads anything
 * missing or malformed as "not opened, no card won, no cup".
 */
export interface DiceTrailProgress {
  /** The Quiet Dice chain is complete: her closing line was spoken, the board open. */
  boardOpen?: boolean;
  /** The rumour cards WON, by id ('rumor1' | 'rumor2' | 'rumor3'), in clear order. */
  rumorsWon?: string[];
  /**
   * The house cup (keeper-lives §2.4's cosmetic). A flag and nothing else: it
   * wears NO mechanic — the tavern's watered-wine line changes, and that is all.
   */
  cup?: boolean;
}

/**
 * The road — the gladiator's arrival path through the city and the Road of Glory's
 * own field: the oath, the banner device sworn under, and the milestones shown.
 *
 * Optional on `PlayerProfile` on purpose, exactly like `chariot` and `racing`: a save
 * written before the road has no `road` field at all and must keep loading, so the
 * pure helpers resolve a missing, partial or malformed field to unsworn / no device /
 * none seen rather than repairing the save. Every subfield is optional for the same
 * reason, and `createNewProfile()` writes no `road` field.
 *
 * One writer per subfield: `oathSworn` is set only by the oath beat's completion
 * (`withOathSworn`, `src/utils/gladiatorOath.ts`); `bannerDevice` only by the Device
 * Choosing panel and `milestonesSeen` only by the milestone evaluation
 * (`src/utils/roadMilestones.ts`) — never by a migration.
 */
export interface RoadProgress {
  /** Set `true` once, on the oath beat's completion. Absent means the words are still owed. */
  oathSworn?: boolean;
  /** The banner device sworn under, as the player chose it. */
  bannerDevice?: string;
  /** Ids of the road milestones the player has been shown. */
  milestonesSeen?: string[];
}

/**
 * CH-1 — the seven gladiator classes (armaturae).  The class sets a character's
 * stat template, its signature technique (doctrina) and its starting kit; the
 * catalogue and its data live in `src/data/armaturae.ts`.
 */
export type ArmaturaId =
  | 'murmillo'
  | 'retiarius'
  | 'secutor'
  | 'thraex'
  | 'hoplomachus'
  | 'dimachaerus'
  | 'provocator';

/**
 * CH-1 — the palmae a gladiator has earned and wears.  A palma is a victory palm
 * (a trait), never a Laurel — `laurels` above is the separate Triumphs record.
 * At most three are equipped at once; `resolvePalmae` enforces that on read.
 */
export interface PalmaeState {
  /** Palma ids the player has earned. */
  unlocked?: string[];
  /** Palma ids the player wears, a subset of `unlocked`, capped at three. */
  equipped?: string[];
}

/**
 * PITCH A4 — CORPUS ET ORIGO: the gladiator's life before the sand.
 *
 * Build (the body he grew into), Origo (the province he came from) and Vitium
 * (the one flaw he carried in with him) are chosen at creation and frozen.  The
 * ids are a closed authored set (`src/data/corpusEtOrigo.ts`); every list and
 * every value there is a Director ruling, not a design transcription
 * (Pitch A4 — Director ruling R-BUILD / R-ORIGO / R-VITIUM).
 */
export type BuildId = 'even' | 'sturdy' | 'swift';
export type ProvinceId =
  | 'italia'
  | 'hispania'
  | 'gallia'
  | 'graecia'
  | 'aegyptus'
  | 'thracia';
export type VitiumId = 'old_knee' | 'quick_temper' | 'superstitious' | 'night_terrors';

/**
 * PITCH A4 — Director ruling R-FIELD: ONE lazy top-level profile field holding
 * all three choices, never three separate fields.  Every member is optional,
 * because a save written before this slice has no `identity` at all and must keep
 * loading — no build delta, no Origo passive, pool 10, no retroactive changes
 * (Pitch A4 — Director ruling R-DEFAULTS).
 */
export interface CorpusEtOrigoIdentity {
  build?: BuildId;
  origo?: ProvinceId;
  vitium?: VitiumId;
}

/**
 * PITCH A1 — FORTUNA'S OMEN: the two words her shrine can give, as the design
 * published them (`ideas-story.md` §5 Hook A: a kind omen or an ill one).
 */
export type OmenKind = 'kind' | 'ill';

/**
 * PITCH A1 — the omen's published field shape, a LAZY optional object on
 * `PlayerProfile`: absent = no omen.  `expiresAtBout` is the bout the omen waits
 * for — total bouts (`fightsWon + fightsLost`) + 1 at the moment of offering, so
 * it is always the next duel the player fights.
 */
export interface OmenState {
  kind: OmenKind;
  expiresAtBout: number;
}

/**
 * LUDI PHASE A — THE LUDI CALENDAR's one lazy field: the whole day-state of the Acta in a
 * single object. `day` is the EXERTION DAY (`resolveTimeState(profile).day`) the state
 * belongs to, so the calendar never reads a wall clock; `deedsDone` holds the ids paid
 * today; `favour` is the persistent daily currency; `lastAlmsDay` is the day the shrine's
 * alms was last taken (the once-a-day guard); `fameBaseline` is the fame the gladiator woke
 * with (the 100-fame deed's own mark) and `visitsToday` lists the `HUB_LOCATIONS` ids walked
 * into today (deduped, in visit order) — the evidence the day's ONE named visit deed reads.
 *
 * Optional and LAZY, exactly like `chariot`, `racing` and `records`: a save written before
 * this slice has no field and must keep loading, so `resolveLudiProgress`
 * (`utils/ludiCalendar.ts`) reads a missing, null or malformed field as a fresh day rather
 * than repairing it. Written ONLY by the calendar's own three seams (a deed settlement, the
 * shrine's alms, the day rollover) — never by `createNewProfile()` and never by a migration.
 * The day's Laurel is NOT here: it is `records.laudes`, the shared counter, never a second one.
 */
export interface LudiProgress {
  /** The exertion day (`resolveTimeState(profile).day`) this state belongs to. */
  day: number;
  /** The deed ids already paid TODAY, in the order they completed. */
  deedsDone: string[];
  /** The cumulative Favour total — persists across days. */
  favour: number;
  /** The exertion day the shrine's alms was last taken on (0 = never). */
  lastAlmsDay: number;
  /** The `fame` the gladiator woke with on `day` — the 100-fame deed's baseline. */
  fameBaseline: number;
  /**
   * The `HUB_LOCATIONS` ids walked into today, deduped, in visit order. A PRE-CORRECTION save
   * stored a count here instead; a stored number reads as `[]`, because a count says nothing
   * about which districts were walked (`resolveLudiProgress`).
   */
  visitsToday: string[];
}

export interface CityState {
  /** The current in-game day. Positive integer; 1 when absent or unusable. */
  day?: number;
  /**
   * L4 — the last city day on which a purchase at the Elite Merchant House
   * succeeded. ONE number, not a log: the day's allowance is spent exactly while
   * this equals the current day, so a later purchase overwrites it and the field
   * can never grow with play. Absent on every save made before L4 and read as
   * "nothing bought yet"; `city.day` is preserved beside it untouched, and no
   * migration ever introduces it.
   */
  merchantPurchaseDay?: number;
  /**
   * L9 — the last city day on which a rest at the Arena Medical House succeeded.
   * ONE number, not a log (the same shape as the merchant's allowance): the
   * treatment is available exactly while this does NOT equal the current day, so
   * a later rest overwrites it and the field can never grow with play. Absent on
   * every save made before L9 and read as "never rested"; `city.day` is preserved
   * beside it untouched, and no migration ever introduces it.
   */
  restDay?: number;
  /**
   * L14 — the last city day on which a night's lodging at the Caravanserai was
   * paid for. ONE number, not a log (the same shape as the merchant's allowance
   * and the medicus's): the room is available exactly while this does NOT equal
   * the current day, so a later stay overwrites it and the field can never grow
   * with play. Absent on every save made before L14 and read as "never lodged";
   * `city.day` is preserved beside it untouched, and no migration ever
   * introduces it. Lodging spends a day but never heals — the injury slot is
   * carried across as it was.
   */
  lodgingDay?: number;
  /**
   * L10 — the visitors this profile has already met. An optional history of
   * visitor ids, exactly the shape of `defeatedOpponentIds` and
   * `road.milestonesSeen`, and read defensively (anything that is not an array
   * of non-empty strings resolves to an empty history). Meeting a visitor is NOT
   * completing them: this field never removes a visitor from the schedule, and
   * it is written only by a later successful visitor action — never by the
   * schedule resolver, never by `createNewProfile()`, never by a migration.
   */
  seenVisitors?: string[];
  /**
   * L10 — the visitors this profile has completed, whom the roadmap excludes
   * PERMANENTLY: a valid id here removes that visitor from every later
   * schedule. Optional and resolved defensively like `seenVisitors`, absent on
   * every save written before this phase, and written only by a later successful
   * visitor action.
   */
  completedVisitors?: string[];
}


export interface PlayerProfile {
  name: string;
  title: string;
  rank: 'Rookie' | 'Veteran' | 'Champion' | 'Legend';
  appearance: PlayerAppearance;
  level: number;
  xp: number;
  xpToNextLevel: number;
  unspentStatPoints: number;
  baseStats: {
    strength: number;
    agility: number;
    stamina: number;
    defense: number;
  };
  gold: number;
  fame: number;
  currentTier: number;
  tierProgress: Record<number, number>;
  defeatedOpponentIds: string[];
  bossKills: number;
  newGamePlus: number;
  trainingSessionsLeft: number;
  injury?: PlayerInjury | null;
  equipped: {
    weapon: WeaponItem;
    helm?: ArmorItem;
    chest?: ArmorItem;
    arms?: ArmorItem;
    legs?: ArmorItem;
  };
  inventory: (WeaponItem | ArmorItem)[];
  fightsWon: number;
  fightsLost: number;
  peakCrowdHypeOverall: number;
  isLeftyMode?: boolean;
  /** Phase C-8.66B — chariot ownership/fit-out; absent on every pre-workshop save. */
  chariot?: ChariotLoadout;
  /**
   * Phase C-8.67B — Biga/Triga/Quadra progression; absent on every pre-racing
   * save, and written only by a successful purchase or selection (never by a
   * migration, and never by `createNewProfile()`).
   */
  racing?: RacingProgression;
  /**
   * STORY-1 — the campaign's own evidence; absent on every save written before
   * this slice, and written by nothing yet (the campaign is read-only, so
   * `resolveStoryState()` derives every chapter from the record that exists).
   */
  story?: StoryProgress;
  /**
   * P1 — per-item temper (upgrade) level, keyed by item id; absent on every
   * pre-tempering save.  Exactly like `chariot` and `racing`, a missing
   * field, a missing id and a malformed value all resolve to level 0 in
   * `src/utils/tempering.ts` rather than repairing the save, and the field
   * is written only by a successful `purchaseTemper()` — never by
   * `createNewProfile()`.  The owned `WeaponItem` / `ArmorItem` objects are
   * never modified: an item's upgrade state lives only here.
   */
  temper?: Record<string, number>;
  /**
   * The road; absent on every save written before it, and written only by the writers
   * named on `RoadProgress` above.
   */
  road?: RoadProgress;
  /**
   * CL-1 — the coach-mark cards this profile has already been shown, keyed by
   * card id (`COACH_CARDS` in `utils/coachMarks.ts`).
   *
   * Optional on purpose, exactly like `chariot` and `racing`: a save written
   * before this slice has no `seen` field at all and must keep loading, so
   * `resolveSeenState()` reads a missing, partial or malformed field as "nothing
   * seen yet" rather than repairing the save.  Written ONLY by `markSeen()` on an
   * actual card display — never by `createNewProfile()` and never by a migration.
   */
  seen?: Record<string, true>;
  /**
   * Day/night cycle T0 — the whole game clock, as ONE lazily-advanced integer.
   * Optional on purpose, exactly like `chariot` and `racing`: a save written
   * before this slice has no `time` field at all and must keep loading, so
   * `resolveTimeState` (`src/utils/timeState.ts`) reads a missing, malformed or
   * negative field as `total: 0` — i.e. Day 1, at dawn.  Nothing migrates it and
   * nothing writes it yet (T0 ships no call sites); the advance helpers return a
   * NEW profile and leave persisting it to a later slice.
   */
  time?: { total: number };
  /**
   * P2 — TRIUMPHS (the fame honours the player buys; the player-facing name is
   * never "Laurel", which belongs to the palma).  Optional on purpose, exactly like
   * `chariot` and `racing`: a save written before this slice has no `laurels` field
   * at all and must keep loading, so `resolveLaurels` (`src/utils/laurels.ts`) reads
   * a missing, partial or malformed field as "owns nothing" rather than repairing
   * it.  Written ONLY by a successful `purchaseLaurel()` — never by
   * `createNewProfile()` and never by a migration.  `titles` holds the owned title
   * ids and stays owned permanently; the title the player is DISPLAYED with is the
   * shipped `title` string above, which a title purchase also sets.
   */
  laurels?: { titles?: string[]; statue?: boolean };
  /**
   * S6 — the counted Bazaar consumables, keyed by consumable id
   * (`data/consumables.ts`). Optional on purpose, exactly like `chariot` and
   * `racing`: a save written before this slice has no `consumables` field at all
   * and must keep loading, so `resolveConsumables` (`utils/consumables.ts`) reads a
   * missing, null or malformed field as `{}` — owning none — rather than repairing
   * the save. Written ONLY by a successful `purchaseConsumable()` and a
   * `consumeItem()` use, never by `createNewProfile()` and never by a migration.
   * These are NOT gear: nothing here is a `WeaponItem` / `ArmorItem` and nothing
   * here ever enters `inventory`.
   */
  consumables?: Record<string, number>;
  /**
   * S7 — TAVERN RUMOURS: the ids of the opponents the player has bought the
   * Golden Palm Tavern's rumour on (`utils/intel.ts`).  INFORMATION ONLY — intel
   * never changes a stat, a formula or a reward, and no file in the combat path
   * reads this field.  Optional on purpose, exactly like `chariot` and `racing`: a
   * save written before this slice has no `intel` field at all and must keep
   * loading, so `resolveIntel` reads a missing, null or malformed field as "no
   * rumour bought" rather than repairing the save.  Written ONLY by a successful
   * `purchaseIntel()` — never by `createNewProfile()` and never by a migration.
   */
  intel?: string[];
  /**
   * P4 — STABLE PROGRESSION: the horse team's bought quality grade (0–3) and
   * conditioning level (0–5), read by `utils/stableProgression.ts`.  Optional on
   * purpose, exactly like `chariot` and `racing`: a save written before this
   * slice has no `stable` field at all and must keep loading, so
   * `resolveStableState` reads a missing, partial or malformed field as
   * "Plow Team, conditioning 0" rather than repairing the save.  Written ONLY by
   * a successful `purchaseStableQuality()` / `purchaseStableConditioning()` —
   * never by `createNewProfile()` and never by a migration.  No team size is
   * stored here: conditioning's price reads the horse count from
   * `resolveRacingState()` every time.
   *
   * DATA ONLY for now: the pace/stamina each grade and level is DECLARED to
   * change is inert data that nothing reads as a live stat until racing Stage 3.
   */
  stable?: { quality?: number; conditioning?: number };
  /**
   * P5 — the ludus's three buildings, each level 0–2, read by
   * `utils/facilityProgression.ts`.  Optional on purpose, exactly like `stable`:
   * a save written before this slice has no `facilities` field at all and must
   * keep loading, so `resolveFacilities` reads a missing, partial or malformed
   * field as "nothing built" rather than repairing the save.  Written ONLY by a
   * successful `purchaseFacility()` — never by `createNewProfile()`.
   */
  facilities?: { stable?: number; yard?: number; workshop?: number };
  /**
   * CH-1 — the gladiator's class.  Optional on purpose, exactly like `chariot`
   * and `racing`: a save written before the class exists has no `armatura` field
   * at all and must keep loading, so `resolveArmatura` (`utils/traitModifiers.ts`)
   * reads it as Murmillo rather than repairing the save.  Written ONLY by a later
   * successful class choice — never by `createNewProfile()` and never by a
   * migration.
   */
  armatura?: ArmaturaId;
  /**
   * CH-1 — the earned palmae.  Optional on purpose, exactly like `armatura`: a
   * save written before palmae exist has no `palmae` field at all and must keep
   * loading, so `resolvePalmae` (`utils/traitModifiers.ts`) reads it as "none
   * earned, none worn" rather than repairing the save.  Written ONLY by a later
   * successful earn/equip action — never by `createNewProfile()` and never by a
   * migration.
   */
  palmae?: PalmaeState;
  /**
   * C-8.70C — GRUDGES: one record per regular opponent the player has beaten,
   * keyed by the BASE roster id, holding the dominant class of the bout they won
   * and the grudge's own state. Optional on purpose, exactly like `chariot` and
   * `racing`: a save written before this slice has no `grudges` field at all and
   * must keep loading, so `resolveGrudges` (`utils/grudgeBouts.ts`) reads a
   * missing, partial or malformed field as "no grudges" rather than repairing it.
   * Written ONLY at the existing duel-result moments — never by
   * `createNewProfile()`, never by a migration, and never on display or selection.
   */
  grudges?: GrudgeState;
  /**
   * K1 — the keepers the player has actually met, by keeper id
   * (`data/keepers.ts`).  Optional on purpose, exactly like `chariot`, `racing`
   * and `intel`: a save written before this slice has no field at all and must
   * keep loading, so `resolveSeenKeepers` reads a missing, null or malformed
   * field as "met nobody" rather than repairing the save.  Written ONLY when a
   * storefront's keeper is opened for the first time — never by
   * `createNewProfile()`, never by a migration, and never on a repeat visit.
   */
  seenKeepers?: string[];
  /**
   * PITCH A1 — FORTUNA'S OMEN: the word taken at her shrine before a bout, and
   * the bout it is kept for. Optional and LAZY, exactly like `chariot` and
   * `racing`: a save written before this slice has no field at all and must keep
   * loading, so `resolveOmen` (`utils/omens.ts`) reads a missing, null or
   * malformed field as "no omen" rather than repairing it. Written ONLY by the
   * shrine's offering and cleared by the duel result that consumes it — never by
   * `createNewProfile()` and never by a migration.
   *
   * `expiresAtBout` is the bout index the omen waits for: total bouts
   * (`fightsWon + fightsLost`) + 1 at the moment of offering, i.e. the next duel.
   */
  omen?: OmenState;
  /**
   * PITCH A1 — the once-ever "self-reliant" trickle: has this gladiator ever
   * declined Fortuna's omen? Absent/false means the +5 fame is still owed to
   * him. Written ONLY by the first decline (`declineOmen`) — never by
   * `createNewProfile()` and never by a migration.
   */
  omenTrickleClaimed?: boolean;
  /**
   * PITCH A9 (STORY-4a) — the rivals this gladiator has SPARED, by base roster
   * id, in the exact shape the pitch gives the field:
   * `{ [rivalId: string]: true }`.  A rival who is absent was never offered
   * mercy, or was FINISHED (Finish writes no flag — the rival is gone).
   *
   * Optional and LAZY, exactly like `chariot` and `racing`: a save written
   * before this slice has no field at all and must keep loading, so
   * `resolveSpared` (`utils/mercyBouts.ts`) reads a missing, null or malformed
   * field as "spared nobody" rather than repairing it.  Written ONLY by the
   * result surface's Spare answer — never by `createNewProfile()`, never by a
   * migration, and never by Finish.
   */
  spared?: { [rivalId: string]: true };
  /**
   * PITCH A4 — CORPUS ET ORIGO: the three creation choices that made this
   * gladiator who he is before he ever reached the sand — his Build, his Origo
   * (birth province, its favoured god and its one small passive) and his Vitium
   * (the flaw that bought him two more creation points).  Declared here, between
   * `spared` and `ludi`, so `records` stays the LAST optional member (§J).
   *
   * Optional and LAZY, exactly like `chariot` and `racing`: a save written before
   * this slice has no `identity` at all and must keep loading, so
   * `resolveCorpusIdentity` (`utils/originPassive.ts`) reads a missing, partial or
   * malformed field as "nothing recorded" — no build delta, no Origo passive,
   * pool 10 — rather than repairing or backfilling it.  Written ONLY at creation
   * (`buildCreatedProfile`, and only when the choices are passed) — never by
   * `createNewProfile()`, never by a migration, and immutable afterwards (a
   * Vitium is permanent; there is no respec system).
   */
  identity?: CorpusEtOrigoIdentity;
  /**
   * A8 — TRIUMPHS: the record of what the gladiator has EARNED by doing, as
   * distinct from the fame honours he BUYS (`laurels` above).  `earnedTriumphs`
   * and `viewedTriumphs` hold catalogue ids from `utils/triumphs.ts`; `peakGold`
   * is the high-water mark of `gold`, so a Coin deed ("a purse of 1,000") is
   * never lost by spending afterwards.
   *
   * Optional and LAZY, exactly like `chariot` and `racing`: a save written
   * before this slice has no field at all and must keep loading, so
   * `resolveRecords` (`utils/triumphs.ts`) reads a missing, null or malformed
   * field as "nothing earned, nothing read, no purse recorded" rather than
   * repairing it.  Written ONLY at a duel result (`applyTriumphAwards`) and by
   * the two records writes that ride the same save path (the peak-gold updater
   * and the Library's one view mark) — never by `createNewProfile()` and never
   * by a migration.
   */
  ludi?: LudiProgress;
  records?: {
    earnedTriumphs?: string[];
    viewedTriumphs?: string[];
    peakGold?: number;
    /**
     * A5 — THE CODEX's one lazy field (A5 — Director ruling R6).  The
     * `HUB_LOCATIONS` ids this gladiator has walked into, in first-visit order,
     * written by `withCodexLocation` (`utils/codex.ts`) when an existing hub
     * interaction fires for the first time.  It lives INSIDE `records` — the one
     * home for records-state — so the profile keeps its 22 optional top-level
     * fields and `records` stays last (§J).
     */
    codexLocations?: string[];
    /**
     * STORY-5a — LAUDES: the SHARED honour counter (Story-design §5's Laudes),
     * nested INSIDE `records` so the profile keeps its 22 optional top-level
     * fields and `records` stays last (§J).
     *
     * Written ONLY by `withLaudes` and read ONLY by `resolveLaudes`
     * (`utils/diceTrail.ts`), which are identity-stable for a non-positive amount.
     * LUDI PHASE A MUST REUSE THOSE TWO — its daily Laurels are this same number,
     * and a second counter would be a second truth. STORY-5a is its first
     * writer (the Quiet Dice chain's 5 Laudes).
     */
    laudes?: number;
  };
}
