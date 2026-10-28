import React, { useState, useEffect, useRef } from 'react';
import { PlayerProfile, OpponentConfig, DuelStatistics, WeaponItem, ArmorItem, ChariotTeamSize, ArmaturaId, BoutMode } from './types/game';
import { loadSavedProfile, saveProfile, clearSavedProfile, createNewProfile, calculateTotalStats, readStoredProfileSummary, wasStoredSaveQuarantined } from './services/storage';
import type { StoredProfileSummary } from './services/storage';
import { TitleScreen } from './components/hub/TitleScreen';
import { CharacterCreation } from './components/hub/CharacterCreation';
import { NewCharacterOverwriteModal } from './components/hub/NewCharacterOverwriteModal';
const CityHubScene = React.lazy(() => import('./components/3d/city/CityHubScene').then((m) => ({ default: m.CityHubScene })));
import { GladiatorSchoolHub } from './components/hub/GladiatorSchoolHub';
import type { GearView } from './components/hub/GearTab';
import type { StorefrontId } from './data/shops';
import { purchaseChariotPart, equipChariotPart } from './utils/chariotLoadout';
import { purchaseRacingConfig, selectRacingConfig } from './utils/racingProgression';
import { purchaseLaurel, selectDisplayedTitle, type LaurelResult } from './utils/laurels';
// A8 — TRIUMPHS: the retained deeds. The evaluator is pure and the ONE shipped
// call site is the duel result below (A8 — Director ruling R5); `withPeakGold` is
// the single records updater this file's save path uses wherever gold rises.
import {
  applyTriumphAwards,
  markTriumphsViewed,
  withPeakGold,
  type DuelTriumphStats,
} from './utils/triumphs';
// A5 — THE CODEX: the one new record is a hub location's FIRST visit, written
// inside `records.codexLocations` and only when the id is not already there.
import { withCodexLocation } from './utils/codex';
import { consumeItem, purchaseConsumable } from './utils/consumables';
import { purchaseIntel } from './utils/intel';
import type { ConsumableItem } from './data/consumables';
import { sellItem } from './utils/selling';
import { nextBossKills } from './utils/bossKills';
import { purchaseFacility, trainingCost, type FacilityId } from './utils/facilityProgression';
import { purchaseTemper } from './utils/tempering';
import { purchaseStableConditioning, purchaseStableQuality } from './utils/stableProgression';
import { purchaseItem } from './utils/itemPurchase';
import { withArmaturaPledge } from './utils/armaturaPledge';
import { applyPalmaEarns, equipPalma, purchaseDoctorePalma, unequipPalma } from './utils/palmaeState';
import { evaluateBeats, markSeen, resolveSeenState } from './utils/coachMarks';
import { recordKeeperVisit } from './data/keepers';
const DuelScene = React.lazy(() => import('./components/duel/DuelScene').then((m) => ({ default: m.DuelScene })));
// Phase C-8.70B Stage 1, Slice 1 — the race scene, reached exactly the way the
// city hub and the duel arena are: one more screen value, one more lazy import
// and one more conditional render. No router and no second scene manager.
const RaceScene = React.lazy(() => import('./components/3d/RaceScene').then((m) => ({ default: m.RaceScene })));
import { DuelResultModal } from './components/hub/DuelResultModal';
import { HeraldToast } from './components/hub/HeraldToast';
// STORY-3 — the herald's circus pointer while Chapter 2's race gate is unmet.
import { circusPointerCry } from './utils/storyChapterTwo';
import { DeviceChoosingPanel } from './components/hub/DeviceChoosingPanel';
import { evaluateRoadMilestones, chooseBannerDevice } from './utils/roadMilestones';
// STORY-4a — MERCY OR GLORY (Pitch A9, duel form only).  The offer is decided at
// the duel's own write; the answer writes exactly once, through this file's normal
// save path.  Nothing in the module touches storage.
import {
  finishRival,
  isFirstMercyOfKind,
  mercyHeraldCries,
  spareRival,
  type MercyChoice,
} from './utils/mercyBouts';
// STORY-5a — THE LOADED DICE + the QUIET DICE chain.  The module owns every
// rule; this file owns the writes, exactly as it does for S7's intel.  It also
// carries the STORY-4a fence: `mercyOfferForDuel` is the ONLY way this file asks
// for an offer, so a trail bout can never raise Spare/Finish.
import {
  applyDiceChoice,
  isRumourServiceClosed,
  mercyOfferForDuel,
  withDiceChainClosed,
  withDiceTrailVictory,
  type DiceChoice,
} from './utils/diceTrail';
import type { BannerDevice } from './utils/heraldry';
import { GoogleDriveSyncModal } from './components/hub/GoogleDriveSyncModal';
import { SettingsModal } from './components/hub/SettingsModal';
import type { SettingsCategory, SettingsContext } from './components/hub/SettingsModal';
import { useSettings } from './hooks/useSettings';
import { resolveMotionAttribute, updateSettings } from './services/settings';
import { AssetLoadingOverlay } from './components/ui/AssetLoadingOverlay';
import { WaitSurface } from './components/ui/WaitSurface';
import { LazySceneBoundary } from './components/ui/LazySceneBoundary';
import { OfflineNotice } from './components/ui/GameFailureSurface';
import { PostOathNudge, usePostOathNudge } from './components/hub/PostOathNudge';
import { OathBeat } from './components/hub/OathBeat';
import {
  OATH_YARD_SPAWN,
  oathWriteOnCompletion,
  resolveOathBeatMode,
  shouldPlayOathBeat,
  withOathSworn,
  type OathBeatMode,
  type OathBeatState,
} from './utils/gladiatorOath';
import {
  HERALD_COLOSSEUM,
  aimHerald,
  heraldPointerVisible,
  readHeraldState,
  releaseHeraldForEntry,
  suppressHeraldForEntry,
  type HeraldState,
} from './utils/cityHerald';
import { googleSignIn, subscribeAuthUser } from './services/googleAuth';
import type { User } from 'firebase/auth';
import { DeleteAccountModal } from './components/hub/DeleteAccountModal';
import { facebookSignIn } from './services/facebookAuth';
import { appleSignIn } from './services/appleAuth';
import { microsoftSignIn } from './services/microsoftAuth';
import { listDriveSaves, loadProfileFromDrive } from './services/googleDrive';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from './data/opponents';
// C-8.70C — the bout mode is chosen on the pre-fight card and held for the
// length of the bout only: it is never written to the profile.
import { DEFAULT_BOUT_MODE } from './data/boutModes';
import {
  doctoreAttemptLine,
  doctoreTestResultLine,
  isDoctoreTestOpponent,
  isNoviceBoutDue,
  isNoviceBoutOpponent,
  meetsDoctoreRestriction,
  type DoctoreTestRestriction,
} from './utils/storyBeats';
import { resolveVictoryTier } from './utils/tierAdvancement';
// STORY-4b — THE DESERTER'S PRICE. One pure module owns the ladder's rules; this
// file is where its two writes land, inside the duel-result write every bout
// already uses (a rung clear rides the victory write; the Deserter's answer is its
// own exactly-once write, the same shape STORY-4a's mercy answer takes).
import {
  applyDeserterChoice,
  BOUNTY_FINAL,
  resolveBountyVictory,
  withRungCleared,
  type BountyVictory,
  type DeserterChoice,
} from './utils/bountyLadder';
// C-8.70C — the grudge record's writes. A grudge's own result is recorded here in
// the SAME result write every duel uses; nothing on the grudge surfaces writes.
import {
  closeGrudge,
  isGrudgeBout,
  recordStandardVictory,
  settleGrudge,
} from './utils/grudgeBouts';
import { REST_PRICE, resolveInjuryAfterDuel, restAtInn, treatInjury, type DuelInjuryEvent } from './utils/injury';
// PITCH A1 — Fortuna's Omen.  The shrine's two words, the decline's once-ever
// trickle, and the duel result that consumes them: the settlement is applied
// inside `handleMatchComplete`'s existing write, and the offering/decline writes
// travel the same save-on-change path every other hub transaction uses.
import {
  clearOmen,
  declineOmen,
  offerOmen,
  resolveOmen,
  settleOmenRewards,
  type OmenDeclineOutcome,
  type OmenOfferOutcome,
} from './utils/omens';
// DAY/NIGHT T2 — the clock's reads at the seams, and the day-boundary seam's own module.
// Only the seam files in this slice may touch these (see the re-scoped T0 guard in
// `utils/timeState.test.ts`): the duel result, the training session, the night at the inn,
// and the scene phase reads.
import {
  PHASES_PER_DAY,
  advanceTimeBy,
  advanceToNextDawn,
  resolveTimeState,
} from './utils/timeState';
import {
  applyDayRollover,
  dayBannerText,
  dayRolledTo,
  settleDuelClock,
} from './utils/dayRollover';
// STORY-5b — THE ERASED CHAMPION: the Librarian chain's three read-triggered
// writes, the fragment read, the echo's once-ever line, and the exhibition fence
// (Director ruling R4) that this file's duel result honours.
import {
  ECHO_FIRST_VICTORY_LINE,
  echoRevealOwed,
  withCodexRead,
  withEchoWon,
  withFragmentFound,
  withLibrarianChainClosed,
} from './utils/librarianChain';
import { DayBanner } from './components/ui/DayBanner';
import { sounds } from './audio/soundEffects';
import { music } from './audio/musicEngine';
import { preloadTitleStage } from './utils/preloadAssets';

type GameScreen = 'title' | 'create_character' | 'city_3d' | 'hub_2d' | 'duel' | 'race';

/**
 * Phase C-8.70B Stage 1, Slice 1 — the city pose a race has to return the player
 * to: the position and facing the city held at the moment the race was entered.
 * It is captured there, held here for the length of the race and never written
 * anywhere (no save, no storage).
 */
interface CityExitPose {
  position: [number, number, number];
  rotationY: number;
}

export function App() {
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('title');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  /**
   * DAY/NIGHT T2 — the duel result's ONE time settlement is transaction-scoped: this flag
   * is armed when a bout is entered and consumed by the resolution write, so a second call
   * into the same resolution (a re-fired `onMatchComplete`, a stale control) cannot walk the
   * clock twice. Session only — never saved, and never a profile field.
   */
  const duelTimeSteppedRef = useRef(false);
  /**
   * STORY-4a — the mercy answer's ONCE guard for the current result.  It is the
   * rival id the answer has already been written for, so a double tap (or a stale
   * control) cannot write a second time; it is cleared when a new result is set.
   * Session only — never saved.
   */
  const mercyWrittenRef = useRef<string | null>(null);
  /**
   * STORY-4b — the Deserter answer's ONCE guard, session only: a double tap (or a
   * stale control) cannot pay the bounty twice. `story.deserterChoice` is the real
   * record and the module refuses a second answer on its own; this ref keeps the
   * tap itself from reaching a second `saveProfile`.
   */
  const deserterWrittenRef = useRef(false);
  /**
   * STORY-5a — is the bout on screen a DICE TRAIL bout?  Session only (it is a
   * fact about the entrance, not about the save): set when the tavern hands a
   * staged row up, read once in the victory write to record the card won, and
   * read by the mercy fence so Spare/Finish is never offered on one.  Consumed
   * and cleared at the result, so a later ordinary duel is unaffected.
   */
  const diceTrailBoutRef = useRef(false);
  /**
   * STORY-5b — is the bout on screen a LEGEND BOUT (an exhibition or the echo)?
   * Session only, exactly like `diceTrailBoutRef`: set at the Legend Bouts entry,
   * consumed and cleared at the result. Director ruling R4 reads it to fence the
   * ladder-identity bookkeeping (no felled id, no grudge, no mercy, no triumph
   * evaluation, no fight counters, no omen consumption) while keeping the purse,
   * the duel's one time advance and the injury on a loss.
   */
  const exhibitionBoutRef = useRef(false);
  /** DAY/NIGHT T2 — the day-boundary beat the city plays (sleep veil + the new day's name). */
  const [dayBanner, setDayBanner] = useState<{ day: number; text: string } | null>(null);
  const [activeOpponent, setActiveOpponent] = useState<OpponentConfig>(ALL_OPPONENTS[0]);
  /** C-8.70C — session-only: set by the pre-fight card, read by the duel, never saved. */
  const [boutMode, setBoutMode] = useState<BoutMode>(DEFAULT_BOUT_MODE);
  const [activeHubTab, setActiveHubTab] = useState<'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library'>('tournament');
  // Phase C-8.66B: the Armory's own subview. The Imperial Stable's city
  // interaction opens the gear tab with this set to 'chariot'; the tab's own
  // switch flips it back to the gear list.
  const [gearView, setGearView] = useState<GearView>('armory');
  // Phase SHOP-2: the shop tab's own storefront. A city building's interaction
  // opens the shop tab with the building's id; the tab's own switch returns to
  // the open market.
  const [shopId, setShopId] = useState<StorefrontId>('market');
  // Phase C-8.70B Stage 1, Slice 1 — where the city must put the player back
  // after a race. Set when the race is entered, read when the city remounts,
  // in memory only.
  const [cityReturnPose, setCityReturnPose] = useState<CityExitPose | null>(null);
  const [duelResult, setDuelResult] = useState<{
    didWin: boolean;
    stats: DuelStatistics;
    /**
     * STORY-2 — the beat's own lines for this result, decided at the write (the
     * novice bout's reading, and the Doctore's Test verdict) so the screen and
     * the save cannot disagree about what happened.
     */
    storyLines: string[];
    /**
     * S4 — what this duel did to the injury, decided at the same write, so the
     * result screen cannot disagree with the save: a fresh wound on a loss, or the
     * wound this duel closed. A duel that only advances a live injury's clock has
     * nothing new to say and carries `null`.
     */
    injuryEvent: DuelInjuryEvent | null;
    /**
     * CH-5 — the palma ids this victory NEWLY unlocked (empty on a defeat), so the
     * result screen announces exactly what the save already carries.
     */
    palmaEarned?: string[];
    /**
     * PITCH A1 — what Fortuna's omen did in this bout (paid, expired unpaid), or
     * `null`/absent when no omen was live. Decided at the same write, so the
     * result screen cannot disagree with the save.
     */
    omenLine?: string | null;
    /**
     * STORY-4a — the mercy offer riding this result (Pitch A9), decided at the
     * same write, plus the answer once it is taken.  Absent on every ineligible
     * victory and every defeat.
     */
    mercy?: {
      rivalId: string;
      rivalName: string;
      teaching: boolean;
      /** The duel's FINAL fame (after mode, crowd and omen multipliers). */
      finalFame: number;
      chosen?: MercyChoice;
      extraFame?: number;
    } | null;
    /**
     * STORY-4b — what this bout did for the Bounty Hall's board, decided at the same
     * write: a rung's clear (and the bounty it paid), or the Deserter's final, whose
     * answer is taken here and paid when it lands. Absent on every non-bounty bout.
     */
    bounty?: {
      kind: 'rung' | 'final';
      line: string;
      gold: number;
      fame: number;
      chosen?: DeserterChoice;
      /** The final's two postings, so the modal prints the numbers it will pay. */
      capturedGold: number;
      capturedFame: number;
      takenGold: number;
      takenFame: number;
    } | null;
  } | null>(null);
  /**
   * STORY-2 — the rule chosen for the Doctore's Test. Held for the length of the
   * duel only (set on entry, cleared when the result is dismissed), in memory.
   */
  const [doctoreRestriction, setDoctoreRestriction] = useState<DoctoreTestRestriction | null>(null);
  /**
   * RG-3 — the herald's cries and the one-time Device Choosing panel. Both are view
   * state only: the road's own writes go through `profile.road`, saved the normal way.
   */
  const [heraldCries, setHeraldCries] = useState<string[]>([]);
  const [deviceChoiceOpen, setDeviceChoiceOpen] = useState(false);
  const [showDriveSync, setShowDriveSync] = useState(false);
  /**
   * C-8.70B §SET-1 — one settings panel, opened from every screen.  `category` is
   * the section it should open on (the duel's Help button asks for Controls) and
   * `context` is where it was opened from, which is what hides the save row in a
   * fight.  Neither is game state: they are view state for the panel.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory | undefined>(undefined);
  const [settingsContext, setSettingsContext] = useState<SettingsContext>('menu');
  /**
   * The one settings record.  Lefty and mute used to be App state — session-only in
   * the mute's case, and written into the profile in lefty's — and both now come
   * from here, so they survive a reload without the save being touched.
   */
  const settings = useSettings();
  const isMuted = settings.muted;
  const isLeftyMode = settings.lefty;
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);

  /**
   * Play asks every app that creates accounts for an in-app deletion path, so the
   * settings panel's Game section opens this flow — and it is view state only: the
   * deletion itself is `services/accountDeletion.ts`, driven by the dialog.
   */
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  /**
   * Save-safety — the New Character overwrite confirmation.  Set when the New
   * Character flow begins while a gladiator is already stored on this device: the
   * player sees what would be lost and has to arm the erase (two taps) before
   * creation starts.  `null` means nothing is pending.  View state only — no save is
   * touched by showing, arming or cancelling this dialog.
   */
  const [overwriteConfirm, setOverwriteConfirm] = useState<StoredProfileSummary | null>(null);

  /**
   * Save-safety — the stored save could not be read this boot and its original bytes
   * were quarantined rather than dropped.  The title screen says so in plain
   * language; nothing is repaired, rewritten or deleted, and the game starts on the
   * same path it takes with no save at all.
   */
  const [saveQuarantineNotice, setSaveQuarantineNotice] = useState(false);

  /**
   * Who is signed in.  The panel needs one thing from auth: whether there IS an
   * account, because a signed-in player deletes an account and a guest erases the
   * device's data instead.  Nothing here is saved; it follows Firebase's own session.
   */
  const [authUser, setAuthUser] = useState<User | null>(null);

  // START-1 — the post-Oath nudge: offered once, session-flagged, dismissible.
  const postOathNudge = usePostOathNudge();

  /**
   * THE GLADIATOR'S OATH — `null` is free roam; a mode means the Doctore's presented
   * scene owns the screen (see `utils/gladiatorOath`). It is VIEW state: the beat's own
   * write is the profile's `road.oathSworn`, and that leaves through the usual save pair
   * below, never from the beat itself.
   */
  const [oathBeatMode, setOathBeatMode] = useState<OathBeatMode | null>(null);

  /**
   * The herald's pointer, read once from the session's own scratch record and aimed
   * again on each arrival (see `utils/cityHerald`). Session-scoped by construction: it
   * names a landmark the city already has and reaches no save.
   */
  const [herald, setHerald] = useState<HeraldState>(() => readHeraldState());

  // Follow the Firebase session — the account rows' own source of truth.  It writes
  // nothing and reads no save, and it re-subscribes never (the unsubscribe is the
  // effect's cleanup).
  useEffect(() => subscribeAuthUser(setAuthUser), []);

  // Load saved profile on boot
  useEffect(() => {
    try { music.init(sounds.getAudioContext()); } catch (e) {}

    const saved = loadSavedProfile();
    if (saved) setProfile(saved);
    // Save-safety — an unreadable stored save was kept verbatim under the quarantine
    // key instead of being lost; the title states it once.
    if (wasStoredSaveQuarantined()) setSaveQuarantineNotice(true);
    // START-1 — preload stage 1. This effect runs at title mount, which is the beat
    // the startup sequence warms the first tier on; stage 2 fires on the tap.
    preloadTitleStage();
  }, []);

  // C-8.70B §SET-1 — the sound settings, applied to the engines on boot and on
  // every change: "All sound" reaches the effect engine AND the music, and the
  // music slider reaches the music engine's own gain.  Nothing here is stored
  // twice — the settings record is the only place the choice lives.
  useEffect(() => {
    sounds.setMuted(settings.muted);
    music.setMuted(settings.muted);
    music.setVolume(settings.musicVolume);
  }, [settings.muted, settings.musicVolume]);

  /**
   * MO-1 — the screen-motion root: two attributes on the document root, written
   * from here so no component has to render them.
   *
   * `data-motion` mirrors the player's own screen-motion choice, and
   * `index.css`'s `[data-motion="reduced"]` block is what gives that value its
   * meaning. When the record is silent (`resolveMotionAttribute` answers null) the
   * attribute is removed rather than defaulted, so the OS's `prefers-reduced-motion`
   * query governs — absence is the whole reason `screenMotion` is optional.
   *
   * `motion-paused` is the pause-on-hidden scaffolding: while the document is
   * hidden the root carries it and every motion utility freezes, the title screen's
   * own `visibilitychange` precedent taken app-wide.
   */
  useEffect(() => {
    const root = document.documentElement;
    const motion = resolveMotionAttribute(settings);
    if (motion) root.setAttribute('data-motion', motion);
    else root.removeAttribute('data-motion');
  }, [settings.screenMotion]);

  useEffect(() => {
    const root = document.documentElement;
    const syncHiddenState = () => root.classList.toggle('motion-paused', document.hidden);
    syncHiddenState();
    document.addEventListener('visibilitychange', syncHiddenState);
    return () => document.removeEventListener('visibilitychange', syncHiddenState);
  }, []);

  // Music Routing
  useEffect(() => {
    if (duelResult) {
      music.play(duelResult.didWin ? 'victory_cue' : 'defeat_cue');
    } else if (currentScreen === 'duel') {
      music.play(activeOpponent.isBoss ? 'boss_final' : 'arena_combat');
    } else if (currentScreen === 'city_3d') {
      music.play('city_explore');
    } else if (currentScreen === 'hub_2d' && activeHubTab === 'training') {
      music.play('ludus_train');
    } else if (currentScreen === 'title') {
      music.play('title_main');
    } else {
      music.stop();
    }
  }, [currentScreen, duelResult, activeOpponent, activeHubTab]);

  /**
   * C-8.70B §SET-1 — Lefty Mode is a preference now, so the toggle routes through
   * the settings module and **writes no save**: the profile the player earned is
   * never rewritten by a settings change.
   */
  const handleToggleLeftyMode = () => {
    sounds.playClick();
    updateSettings({ lefty: !settings.lefty });
  };

  /** "All sound", persisted: the effect engine and the music follow the record. */
  const handleToggleMute = () => {
    updateSettings({ muted: !settings.muted });
  };

  /** Open the settings panel: on a section, from a screen. */
  const handleOpenSettings = (category?: SettingsCategory, context: SettingsContext = 'menu') => {
    sounds.playClick();
    setSettingsCategory(category);
    setSettingsContext(context);
    setSettingsOpen(true);
  };

  /**
   * THE CITY ARRIVAL — the one way into `city_3d`, and the whole of the oath's trigger.
   * A gladiator whose road state resolves UNSWORN arrives at the Ludus Martial Yard with
   * the Doctore's oath as his first beat instead of free roam, and the herald holds its
   * pointer down for that arrival only. Everything else — every later arrival, and every
   * gladiator the save itself shows to have played before this slice — hands the pointer
   * back and walks in freely. The question is asked once, here, and every entry point
   * into the city comes through this one function.
   */
  /**
   * RG-3 — THE ROAD'S RITUALS, at the two call sites only: the duel result and city
   * entry. `evaluateRoadMilestones` compares the road before and after the event and
   * hands back the profile to save — it is the only writer of `road.milestonesSeen` —
   * together with the cries the herald should raise and whether the device panel is owed.
   */
  /**
   * STORY-3 — the herald's circus pointer, raised by the hub when the Colosseum
   * tab opens. Text only: it appends one cry to the toast's own list (and never
   * the same one twice in a row), and writes nothing to a profile.
   */
  const handleHeraldCry = (cry: string) => {
    setHeraldCries((previous) => (previous.includes(cry) ? previous : [...previous, cry]));
  };

  const evaluateRituals = (
    before: PlayerProfile,
    after: PlayerProfile,
    justFought?: OpponentConfig | null
  ): PlayerProfile => {
    const evaluation = evaluateRoadMilestones(before, after, justFought);
    if (evaluation.cries.length > 0) {
      setHeraldCries((previous) => [...previous, ...evaluation.cries]);
    }
    if (evaluation.offerDeviceChoice) setDeviceChoiceOpen(true);
    return evaluation.profile;
  };

  const enterCity = (forProfile: PlayerProfile) => {
    // City entry is the second milestone call site. Nothing new has happened here, so
    // this records at most a stage the save already earned — never a watcher's guess.
    const arrivalProfile = evaluateRituals(forProfile, forProfile);
    if (arrivalProfile !== forProfile) {
      setProfile(arrivalProfile);
      saveProfile(arrivalProfile);
    }

    if (shouldPlayOathBeat(arrivalProfile)) {
      setHerald(suppressHeraldForEntry());
      setOathBeatMode(resolveOathBeatMode(arrivalProfile));
    } else {
      setHerald(releaseHeraldForEntry());
      setOathBeatMode(null);
    }
    setCurrentScreen('city_3d');
  };

  const handleContinueAdventure = () => {
    if (!profile) return;
    sounds.playClick();
    enterCity(profile);
  };

  /**
   * Save-safety — enter the New Character flow.
   *
   * A new gladiator REPLACES the one stored on this device when creation completes
   * (the write happens on completion, exactly as it always has), so when a save is
   * stored the player first confirms it: `NewCharacterOverwriteModal` names what
   * would be lost and requires a deliberate two-step arm.  With NO save stored this
   * is byte-for-byte the old behaviour — straight into creation, no added friction.
   * Every route into creation (the title's tap, and after signing in) comes through
   * here.
   */
  const beginCharacterCreation = () => {
    const stored = readStoredProfileSummary();
    if (stored) {
      setOverwriteConfirm(stored);
      return;
    }
    setCurrentScreen('create_character');
  };

  const handleNewCharacter = () => {
    sounds.playClick();
    beginCharacterCreation();
  };

  // "Continue with Google" — sign in, then restore a cloud save if one exists.
  // Used on both the title (sign-in) and character-creation (register) screens.
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const res = await googleSignIn();
      if (!res) return;

      const saves = await listDriveSaves();
      if (saves.length > 0) {
        if (profile) {
          // A local save already exists — don't silently overwrite it.
          // Open the sync modal so the player explicitly chooses whether
          // to load the cloud save or keep their local progress.
          setShowDriveSync(true);
        } else {
          // No local save — safe to load the cloud save directly.
          const cloudProfile = await loadProfileFromDrive(saves[0].id);
          setProfile(cloudProfile);
          saveProfile(cloudProfile);
          enterCity(cloudProfile);
        }
      } else {
        // No cloud save yet. If a local profile already exists, continue
        // that gladiator — don't send a returning player to character creation.
        if (profile) {
          enterCity(profile);
        } else {
          beginCharacterCreation();
        }
      }
    } catch (e) {
      console.error('[GoogleSignIn] failed:', e);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // "Continue with Facebook" — sign in via Firebase Facebook auth.
  // Facebook doesn't provide Google Drive access, so after sign-in we proceed
  // like the normal tap-to-start: continue a local save or start a new gladiator.
  const handleFacebookSignIn = async () => {
    setIsFacebookLoading(true);
    try {
      await facebookSignIn();
      if (profile) {
        enterCity(profile);
      } else {
        beginCharacterCreation();
      }
    } catch (e) {
      console.error('[FacebookSignIn] failed:', e);
    } finally {
      setIsFacebookLoading(false);
    }
  };

  // "Continue with Apple" — sign in via Firebase Sign in with Apple.
  // Like Facebook, no Google Drive access; proceed with local save or new gladiator.
  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      await appleSignIn();
      if (profile) {
        enterCity(profile);
      } else {
        beginCharacterCreation();
      }
    } catch (e) {
      console.error('[AppleSignIn] failed:', e);
    } finally {
      setIsAppleLoading(false);
    }
  };

  // "Continue with Microsoft" — sign in via Firebase Microsoft auth.
  // Like Apple/Facebook, no Google Drive access; proceed with local save or new gladiator.
  const handleMicrosoftSignIn = async () => {
    setIsMicrosoftLoading(true);
    try {
      await microsoftSignIn();
      if (profile) {
        enterCity(profile);
      } else {
        beginCharacterCreation();
      }
    } catch (e) {
      console.error('[MicrosoftSignIn] failed:', e);
    } finally {
      setIsMicrosoftLoading(false);
    }
  };

  // "Sign In with Email" — called after inline email/password auth succeeds on the title screen.
  const handleEmailSignIn = () => {
    if (profile) {
      enterCity(profile);
    } else {
      beginCharacterCreation();
    }
  };

  const handleCharacterCreated = (newProfile: PlayerProfile) => {
    sounds.playClick();
    setProfile(newProfile);
    saveProfile(newProfile);
    // A new gladiator is unsworn, so this arrival is the oath's: the city puts him in
    // the Ludus Martial Yard and the Doctore is waiting there. Free roam begins when the
    // words are sworn, and the post-Oath nudge is offered then, not here.
    enterCity(newProfile);
  };

  /**
   * The oath is over. A completed FULL oath is the beat's ONE write, and it leaves
   * through the same `setProfile` + `saveProfile` pair every other profile change uses
   * — `withOathSworn` refuses a profile that already resolves sworn, so `road.oathSworn`
   * is set exactly once, and a beat abandoned mid-line writes nothing at all. The words
   * are sworn, so the herald turns to the sand.
   */
  const handleOathComplete = (finalState: OathBeatState) => {
    setOathBeatMode(null);
    if (!oathWriteOnCompletion(finalState)) return;
    const sworn = withOathSworn(profile);
    if (sworn) {
      setProfile(sworn);
      saveProfile(sworn);
    }
    setHerald(aimHerald(HERALD_COLOSSEUM));
    // The Oath has just been sworn: offer the once-a-session save-progress nudge.
    postOathNudge.offer();
  };

  const handleEnterDuel = (opp: OpponentConfig, mode: BoutMode = DEFAULT_BOUT_MODE) => {
    setActiveOpponent(opp);
    // C-8.70C — the mode the card was committed on, for this bout only.
    setBoutMode(mode);
    // A ladder bout carries no restriction: the Test's rule is set by its own
    // entry, and a stale one must never judge a different fight.
    setDoctoreRestriction(null);
    // DAY/NIGHT T2 — arm this bout's ONE clock settlement. It advances nothing by itself;
    // the resolution write below consumes it.
    duelTimeSteppedRef.current = false;
    sounds.playClick();
    setCurrentScreen('duel');
  };

  /**
   * STORY-5a — enter a DICE TRAIL bout.  It is an ordinary ladder row and an
   * ordinary duel (no boss mechanics, no special mode): the only difference is
   * the session flag, which the victory write reads to record the card won and
   * the mercy fence reads to withhold STORY-4a's offer.
   */
  const handleEnterDiceTrailBout = (opponent: OpponentConfig) => {
    diceTrailBoutRef.current = true;
    handleEnterDuel(opponent);
  };

  /**
   * STORY-5b — enter a LEGEND BOUT.  The row handed up is already the staged
   * roster row dressed in its era kit; the only addition is the session flag,
   * which the result write reads to fence the ladder's bookkeeping (R4).
   */
  const handleEnterLegendBout = (opponent: OpponentConfig) => {
    exhibitionBoutRef.current = true;
    handleEnterDuel(opponent);
  };

  /**
   * STORY-5b — the Librarian chain's three triggers, each ONE identity-stable
   * write through the same `setProfile` + `saveProfile` pair every profile change
   * uses. A repeat read, a second visit or a click while nothing applies returns
   * the caller's own profile, so nothing is saved twice.
   */
  const handleViewCodex = () => {
    if (!profile) return;
    const read = withCodexRead(profile);
    if (read === profile) return;
    setProfile(read);
    saveProfile(read);
  };

  const handleReturnToLibrarian = () => {
    if (!profile) return;
    const closed = withLibrarianChainClosed(profile);
    if (closed === profile) return;
    setProfile(closed);
    saveProfile(closed);
  };

  const handleReadLegendFragment = (fragmentId: string) => {
    if (!profile) return;
    const read = withFragmentFound(profile, fragmentId);
    if (read === profile) return;
    setProfile(read);
    saveProfile(read);
  };

  /**
   * STORY-2 — enter the Doctore's Test with the rule the player chose. The rule
   * rides beside the opponent (it is not a save field); the result write reads it
   * to judge the win, and the result screen clears it.
   */
  const handleEnterDoctoreTest = (
    restriction: DoctoreTestRestriction,
    mode: BoutMode = DEFAULT_BOUT_MODE,
  ) => {
    handleEnterDuel(DOCTORE_TEST_OPPONENT, mode);
    setDoctoreRestriction(restriction);
  };

  /**
   * Phase C-8.70B Stage 1, Slice 1 — enter the race from the East Circus
   * District's pre-race panel.  `pose` is the city position and facing the
   * player has to be returned to when the race is over; it is held in memory for
   * the length of the race and nothing here reads or writes a save.
   */
  const handleStartRace = (pose: CityExitPose) => {
    setCityReturnPose(pose);
    setCurrentScreen('race');
  };

  /**
   * Leave the race — aborting, or (in a later slice) crossing the finish line.
   * The city remounts and puts the player back at the pose captured on entry.
   */
  const handleExitRace = () => {
    if (profile) enterCity(profile);
    else setCurrentScreen('city_3d');
  };

  const handleOpenHubTab = (
    tab: 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library',
    gearSubview?: GearView,
    shopStorefront?: StorefrontId
  ) => {
    setActiveHubTab(tab);
    if (tab === 'gear') setGearView(gearSubview ?? 'armory');
    if (tab === 'shop') setShopId(shopStorefront ?? 'market');
    setCurrentScreen('hub_2d');
  };

  /**
   * CL-2 — the one place the coach-mark `seen` field is written.  `markSeen` is pure
   * and returns the SAME profile when the card is already recorded, so a repeated or
   * stale call neither re-renders nor reaches `saveProfile`.
   */
  const handleMarkCardSeen = (id: string) => {
    const marked = markSeen(profile, id);
    if (!marked || marked === profile) return;
    setProfile(marked);
    saveProfile(marked);
  };

  /**
   * K1 — the one place `seenKeepers` is written.  `recordKeeperVisit` is pure and
   * returns the SAME profile for a keeper already met (and for an id the registry
   * does not know), so a repeat visit or a stale call neither re-renders nor
   * reaches `saveProfile`: only a real first visit is persisted, and only this
   * field changes.
   */
  const handleRecordKeeperVisit = (keeperId: string) => {
    const visited = recordKeeperVisit(profile, keeperId);
    if (!visited || visited === profile) return;
    setProfile(visited);
    saveProfile(visited);
  };

  /**
   * A5 — the CODEX's City page: a hub location's FIRST interaction records its id
   * in `records.codexLocations`.  `withCodexLocation` is identity-stable for an
   * unknown id, a malformed save or an already-recorded visit, so a repeat visit
   * (or a stale click) never reaches `saveProfile` — no save spam, pinned by suite.
   */
  const handleVisitLocation = (locationId: string) => {
    if (!profile) return;
    const visited = withCodexLocation(profile, locationId);
    if (visited === profile) return;
    setProfile(visited);
    saveProfile(visited);
  };

  /**
   * Phase SHOP-2 — the hub's own navigation row.  Choosing the Bazaar & Forge
   * tab from the hub always means the open market; a city building's own
   * storefront only ever arrives through `handleOpenHubTab`.
   */
  const handleHubTabChange = (
    tab: 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library'
  ) => {
    setActiveHubTab(tab);
    if (tab === 'shop') setShopId('market');
  };

  /**
   * Phase C-8.66B — buy a chariot part, in the currency its catalogue row
   * declares (gold for every shipped part; fame for the P-BANNER Triumph banner
   * set).  `purchaseChariotPart` is pure and re-checks every rule (ownership,
   * price, currency balance, unknown id), so a rejected buy leaves the profile —
   * both balances included — exactly as it was and never reaches `saveProfile`.
   */
  const handleBuyChariotPart = (partId: string) => {
    const result = purchaseChariotPart(profile, partId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /** Equip an owned chariot part — never deducts gold. */
  const handleEquipChariotPart = (partId: string) => {
    const result = equipChariotPart(profile, partId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /**
   * DAY/NIGHT T2 — THE DAY-BOUNDARY SEAM, and the one place a rollover is detected.
   *
   * Every advance in this file hands its composed profile through here before it is saved.
   * When the step crossed a boundary (night → dawn, so the resolved `day` changed) the
   * rollover fires ONCE with the new day and applies this slice's effects: the sleep veil +
   * day banner in the city, and the training-session refresh (Dies Quietus granting the
   * rotation's extra session). Nothing expires, nothing is owed, and no injury is touched —
   * injuries count down in fights only.
   *
   * The Acta / deed systems are NOT built in this slice: they hang off this seam when they
   * arrive, through `dayRolledTo` and the day it answers.
   */
  const onDayRollover = (before: PlayerProfile, advanced: PlayerProfile): PlayerProfile => {
    const rolledTo = dayRolledTo(before, advanced);
    if (rolledTo === null) return advanced;
    setDayBanner({ day: rolledTo, text: dayBannerText(rolledTo) });
    return applyDayRollover(advanced, rolledTo);
  };

  const handleMatchComplete = (stats: DuelStatistics, didWin: boolean) => {
    if (!profile) return;

    /**
     * STORY-2 — the chapter-one beats read the duel ONCE, here, before the write:
     * a fresh profile's FIRST attempt at the novice bout gets the Doctore's
     * reading of it (win or lose — a loss costs nothing and ends nothing), and a
     * Test bout that was won is judged against the rule the player chose. The
     * pass itself is written below, in the same update that records the duel.
     */
    const storyLines: string[] = [];
    if (isNoviceBoutOpponent(activeOpponent) && isNoviceBoutDue(profile)) {
      storyLines.push(doctoreAttemptLine(didWin));
    }
    const testWon =
      didWin &&
      isDoctoreTestOpponent(activeOpponent) &&
      doctoreRestriction !== null &&
      meetsDoctoreRestriction(doctoreRestriction, stats);
    if (isDoctoreTestOpponent(activeOpponent) && didWin && doctoreRestriction) {
      storyLines.push(doctoreTestResultLine(doctoreRestriction, stats));
    }

    /**
     * S4 — INJURIES: one rule, resolved ONCE in this transaction, for a win and a
     * loss alike.  The helper returns the profile this write is composed from plus
     * what the result screen should say.  Nothing else in the game inflicts,
     * decrements or clears an injury — duels are the only thing that touches it,
     * and a race never does.
     */
    /**
     * STORY-5b — Director ruling R4: is this bout an EXHIBITION (or the echo)?
     * The flag is set at the Legend Bouts entrance and consumed at the end of this
     * result, so it can never leak onto a later bout. Read once, here, because
     * every fenced branch below consults the same decision.
     */
    const exhibition = exhibitionBoutRef.current;

    const { profile: afterInjury, event: injuryEvent } = resolveInjuryAfterDuel(profile, didWin);

    /**
     * PITCH A1 — Director rulings 3, 4 and 6: the omen is CONSUMED by this duel
     * result, inside this same write.  Its multipliers are applied LAST — to the
     * fame and gold C-C's composition order already produced (mode → crowd peak →
     * crowd turning) — and the field is cleared whether it paid or expired unpaid.
     * The result screen is handed the settled numbers, so it and the save agree.
     *
     * STORY-5b — Director ruling R4: an EXHIBITION consumes no omen at all. It
     * neither pays it nor expires it, and the field is left exactly as it stands,
     * so a staged bout can never eat the omen the player bought for a real one.
     */
    const omenBefore = resolveOmen(profile);
    const omenSettled = exhibition
      ? null
      : settleOmenRewards(omenBefore, didWin, {
          fame: stats.fameEarned,
          gold: stats.goldEarned,
        });
    const afterOmen = exhibition ? afterInjury : clearOmen(afterInjury);
    const resultStats: DuelStatistics =
      omenSettled && omenSettled.paid
        ? { ...stats, fameEarned: omenSettled.fame, goldEarned: omenSettled.gold }
        : stats;

    /**
     * STORY-4b — the bounty board's answer to this bout, decided ONCE here from the
     * record the bout was fought with: a rung's clear (paid in the same victory
     * write below), a rung's miss (the standard purse only — R4), or the Deserter's
     * final (paid at the capture-or-kill answer, so nothing is paid here).
     */
    // STORY-5b — R4: an exhibition is not a posting, so no bounty is read for it.
    const bounty: BountyVictory = exhibition
      ? { kind: 'none', clearedRungId: null, gold: 0, fame: 0, line: '' }
      : resolveBountyVictory(profile, activeOpponent, stats, didWin);

    /** CH-5 — what this victory unlocked, decided at the write and told to the result. */
    let palmaEarned: string[] | undefined;

    let settledProfile: PlayerProfile;

    if (didWin) {
      // STORY-4b — a CLEARED posting pays its full bounty in this same write; a
      // victory that missed the printed rule adds nothing (the duel's own purse
      // above is already the standard one).
      const nextGold = profile.gold + resultStats.goldEarned + bounty.gold;
      const nextFame = profile.fame + resultStats.fameEarned + bounty.fame;
      const nextXp = profile.xp + stats.xpEarned;

      let nextLevel = profile.level;
      let nextXpToNext = profile.xpToNextLevel;
      let nextUnspentPoints = profile.unspentStatPoints;

      if (nextXp >= nextXpToNext) {
        nextLevel += 1;
        nextXpToNext = Math.round(nextXpToNext * 1.5);
        nextUnspentPoints += 2;
      }

      // C-8.70C — a GRUDGE BOUT is a GENERATED rematch row, not a roster id: its
      // victory settles the grudge and records no new felled id. A standard
      // victory keeps the shipped rule exactly.
      const isGrudge = isGrudgeBout(activeOpponent);
      /**
       * STORY-5b — R4: an exhibition win records NO felled id. The staged row is an
       * ordinary ladder row, so appending it would corrupt first-defeat semantics
       * (the Librarian chain's step 2 and STORY-4a's mercy both read that record)
       * and the Codex's faced-states. The purse and the time advance are kept.
       */
      const defeated = exhibition
        ? profile.defeatedOpponentIds
        : isGrudge
        ? profile.defeatedOpponentIds
        : profile.defeatedOpponentIds.includes(activeOpponent.id)
        ? profile.defeatedOpponentIds
        : [...profile.defeatedOpponentIds, activeOpponent.id];

      // C-8.70C — the grudge record rides this same write: the FIRST victory over
      // a regular opponent records the mix's dominant class, any standard victory
      // at a grudge's tier re-opens that tier's closed grudges, and a grudge
      // victory settles it. All three helpers are pure and return the profile
      // unchanged when nothing applies.
      // STORY-5b — R4: an exhibition generates no grudge and records no studied
      // mix, so the row is left unrecorded in the grudge ledger.
      const grudgeProfile = exhibition
        ? afterOmen
        : isGrudge
        ? settleGrudge(afterOmen, activeOpponent)
        : recordStandardVictory(
            afterOmen,
            activeOpponent,
            stats.dominantOffensiveClass ?? 'even'
          );

      // The tier moves only on a boss's FIRST defeat — the boss's id newly entering
      // `defeatedOpponentIds` in this write. A rematch pays its rewards exactly as it
      // always did, but it proves nothing new, so it never opens the next tier (see
      // `utils/tierAdvancement.ts`: one boss could otherwise carry a gladiator through
      // tiers whose champions were never faced).
      // STORY-5b — R4: an exhibition opens no tier (and no boss id entered the
      // record to open one anyway).
      const tierAfterVictory = exhibition
        ? { currentTier: profile.currentTier, firstDefeat: false, advanced: false }
        : resolveVictoryTier({
            currentTier: profile.currentTier,
            opponent: activeOpponent,
            defeatedOpponentIds: profile.defeatedOpponentIds,
          });

      const updatedProfile: PlayerProfile = {
        ...grudgeProfile,
        gold: nextGold,
        fame: nextFame,
        xp: nextXp,
        level: nextLevel,
        xpToNextLevel: nextXpToNext,
        unspentStatPoints: nextUnspentPoints,
        currentTier: tierAfterVictory.currentTier,
        defeatedOpponentIds: defeated,
        // FIX-A — the kill count rides this same write: `nextBossKills` reads the record
        // being saved, so it can only rise for a boss whose id is newly entering it.
        bossKills: nextBossKills(profile, { defeatedOpponentIds: defeated }, activeOpponent),
        // STORY-2 — the Doctore's Test's pass rides THIS write: the id enters
        // `defeatedOpponentIds` through the ordinary victory above and the flag
        // records that the win met the chosen restriction. Both pieces of the
        // campaign gate's evidence therefore land together or not at all, and the
        // flag lives inside the existing lazy `story` object (no new top-level
        // field).
        ...(testWon
          ? { story: { ...(profile.story ?? {}), doctoreTestPassed: true } }
          : {}),
        fightsWon: profile.fightsWon + 1,
        peakCrowdHypeOverall: Math.max(profile.peakCrowdHypeOverall, stats.crowdHypePeak),
      };

      /**
       * CH-5 — THE EARN CHECKS, inside the victory write.  They read the profile
       * this same write is about to save (gold, fame, xp, the tier, the felled
       * ids, `fightsWon` and the hype peak are all already on it), and the helper
       * appends only ids the save does not already carry — so re-winning a fight
       * can never duplicate an unlock.  Unlocking is never equipping.
       */
      const earned = applyPalmaEarns(updatedProfile);
      palmaEarned = earned.earned.map((palma) => palma.id);

      // The just-fought opponent is what names the boss cry — first defeat or rematch.
      settledProfile = evaluateRituals(profile, earned.profile, activeOpponent);
      // STORY-4b — the rung's CLEAR rides the same write, inside the existing
      // `story` object (no new top-level field; §J stays at twenty-one).
      if (bounty.clearedRungId) {
        settledProfile = withRungCleared(settledProfile, bounty.clearedRungId);
      }
    } else {
      // C-8.70C — a lost GRUDGE closes: it stays shut until the player wins any
      // standard bout at that grudge's own tier (the anti-farm rule). Nothing
      // else about a defeat changes.
      const grudgeProfile = isGrudgeBout(activeOpponent)
        ? closeGrudge(afterOmen, activeOpponent)
        : afterOmen;
      const updatedProfile: PlayerProfile = {
        ...grudgeProfile,
        fightsLost: profile.fightsLost + 1,
        peakCrowdHypeOverall: Math.max(profile.peakCrowdHypeOverall, stats.crowdHypePeak),
      };
      settledProfile = evaluateRituals(profile, updatedProfile);
    }

    /**
     * DAY/NIGHT T2 — THE DUEL'S ONE ADVANCE. A duel that reached a result advances the
     * clock one phase, win or lose, and it does so HERE, inside the single resolution
     * transaction, so no render, no panel and no entry path can advance anything. The
     * bout's session flag is consumed by `settleDuelClock`, which is what makes a second
     * call into this path unable to walk the clock twice; the rollover seam then fires at
     * most once. This is still the ONE write of the result: one `saveProfile`.
     */
    const clock = settleDuelClock(settledProfile, duelTimeSteppedRef.current);
    duelTimeSteppedRef.current = clock.stepped;
    const timedProfile = onDayRollover(profile, clock.profile);

    /**
     * A8 — THE ONE SHIPPED TRIUMPH CALL SITE (A8 — Director ruling R5/R6).
     *
     * Evaluation happens at a RESULT SCREEN and nowhere else: never on Library
     * open, never from a watcher. The race result's site is DEFERRED (R6 — no
     * profile-writing race seam exists, and every Circus triumph is dormant).
     *
     * The transient reading is this duel's own, unchanged from `DuelStatistics`:
     * `lowestHealthFraction` (STORY-4b) and the crowd's peak hype. `won` rides
     * with them because "Missio Denied" is a VICTORY at 10% health or less — a
     * defeat also ends at 0% and must not earn it.
     *
     * The awards — the peak-gold record, the earned ids, the one-time fame grants
     * and the earned titles — are composed into the SAME profile, so this stays
     * the duel's one `saveProfile`. Counter-based triumphs therefore catch up HERE
     * (the counters persist); transient moments earned before this slice are not
     * retro-credited, which is the design's rule, not a bug.
     */
    const duelTriumphStats: DuelTriumphStats = {
      won: didWin,
      lowestHealthFraction: resultStats.lowestHealthFraction,
      crowdHypePeak: resultStats.crowdHypePeak,
    };
    /**
     * STORY-5a — the trail's own record, in the SAME save as the victory: a card's
     * bout being WON is what unlocks the next card, and the ordinary victory write
     * cannot know the bout was the trail's (the row is an ordinary ladder row).
     * The helper is identity-stable, so the chain's bout, a re-fight and a win on
     * a row the board has moved past all write nothing.
     */
    const trailProfile =
      diceTrailBoutRef.current && didWin
        ? withDiceTrailVictory(timedProfile, activeOpponent.id)
        : timedProfile;
    const awards = applyTriumphAwards(trailProfile, duelTriumphStats);
    setProfile(awards.profile);
    saveProfile(awards.profile);

    // The herald reads what the scribes just recorded, in the city after the
    // result — the same toast STORY-4a's lines and STORY-3's pointer use.
    if (awards.earned.length > 0) {
      const lines = awards.earned.map(
        (triumph) => `The scribes record a new triumph: ${triumph.name}`
      );
      setHeraldCries((previous) => [...previous, ...lines]);
    }

    /**
     * STORY-4a — MERCY OR GLORY (Pitch A9, duel form only).  The offer is asked
     * ONCE, here, from the record the bout was FOUGHT with: the rival fence, the
     * first-defeat rule, the spared map and Chapter 3 (R4-R7 in `mercyBouts.ts`).
     * R6's stated consequence — Chapter 3 is unreachable until Stage 2 lands its
     * race-results write, so this is DORMANT and tested, not broken.
     */
    /**
     * STORY-5a — the fence: a trail bout is fought at Aelia's asking, not in the
     * arena's book, so STORY-4a's Spare/Finish is never offered on one (four of
     * the five staged rows ARE mercy-eligible regulars when fought normally, so
     * this is load-bearing, not decoration).
     */
    const mercy = mercyOfferForDuel(profile, activeOpponent, didWin, diceTrailBoutRef.current);
    mercyWrittenRef.current = null;
    deserterWrittenRef.current = false;
    // The entrance flag is consumed by this result: it can never leak onto a
    // later bout entered from the tournament, the board or a door.
    diceTrailBoutRef.current = false;

    setDuelResult({
      didWin,
      // PITCH A1 — the settled numbers (omen multiplier included when it paid), so
      // the result screen and the save cannot disagree.
      stats: resultStats,
      storyLines,
      injuryEvent,
      ...(palmaEarned && palmaEarned.length > 0 ? { palmaEarned } : {}),
      ...(omenSettled.line ? { omenLine: omenSettled.line } : {}),
      // STORY-4a — the offer carries the duel's FINAL fame (post mode / crowd /
      // omen, in C-C's order), which is the basis Finish's R1 rule reads.
      ...(mercy ? { mercy: { ...mercy, finalFame: resultStats.fameEarned } } : {}),
      // STORY-4b — the board's own line for this bout (the clear, the miss, or the
      // final's question), so the result screen and the save cannot disagree.
      ...(bounty.kind !== 'none'
        ? {
            bounty: {
              kind: bounty.kind,
              line: bounty.line,
              gold: bounty.gold,
              fame: bounty.fame,
              capturedGold: BOUNTY_FINAL.capturedGold,
              capturedFame: BOUNTY_FINAL.capturedFame,
              takenGold: BOUNTY_FINAL.takenGold,
              takenFame: BOUNTY_FINAL.takenFame,
            },
          }
        : {}),
    });
  };

  const handleDuelResultDismiss = () => {
    setDuelResult(null);
    // The Test's rule judged one duel; it does not outlive it.
    setDoctoreRestriction(null);
    if (profile) enterCity(profile);
    else setCurrentScreen('city_3d');
  };

  /**
   * STORY-4a — THE MERCY ANSWER, written exactly once.
   *
   * SPARE writes `spared[rivalId] = true` and touches nothing else: the rival
   * KEEPS his C-A grudge, because the grudge bout is the return path (R2).
   * FINISH pays the duel's final fame x 1.25, rounded, once (R1 — Director
   * ruling) and REMOVES that defeat's grudge (R2 — Director ruling), so the rival
   * never comes back; it writes no flag.  Gold is untouched by either answer.
   */
  const handleMercyChoice = (choice: MercyChoice) => {
    if (!profile || !duelResult?.mercy || duelResult.mercy.chosen) return;
    const offer = duelResult.mercy;
    if (mercyWrittenRef.current === offer.rivalId) return;
    mercyWrittenRef.current = offer.rivalId;

    // The herald's one-line cry is for the FIRST of each answer, read from the
    // record before this answer's own write.
    const first = isFirstMercyOfKind(profile, choice);

    let next = profile;
    let extraFame = 0;
    if (choice === 'spare') {
      next = spareRival(profile, offer.rivalId);
    } else {
      const outcome = finishRival(profile, offer.rivalId, offer.finalFame);
      next = outcome.profile;
      extraFame = outcome.extraFame;
    }
    if (next !== profile) {
      setProfile(next);
      saveProfile(next);
    }

    const cries = mercyHeraldCries(choice, first);
    if (cries.length > 0) {
      setHeraldCries((previous) => [...previous, ...cries]);
    }

    // The result surface is told what the save now carries, so the two cannot
    // disagree: Finish's fame figure becomes the boosted total it paid.
    setDuelResult((previous) =>
      previous && previous.mercy
        ? {
            ...previous,
            stats:
              choice === 'finish' && extraFame > 0
                ? { ...previous.stats, fameEarned: previous.stats.fameEarned + extraFame }
                : previous.stats,
            mercy: { ...previous.mercy, chosen: choice, extraFame },
          }
        : previous
    );
  };


  /**
   * STORY-4b — THE DESERTER'S ANSWER, written exactly once.
   *
   * STORY-4b — Director ruling R7: the choice lives in `story.deserterChoice` and
   * nowhere else (he is a bounty row, not a mercy-eligible ladder regular). The
   * bounty is paid HERE, not at the victory write, because the two answers pay
   * different purses (R1): captured 550 g / 90 f, killed 350 g / 180 f. The module
   * refuses a second answer on its own, and the ref keeps a double tap from even
   * reaching a second save.
   */
  const handleDeserterChoice = (choice: DeserterChoice) => {
    if (!profile || !duelResult?.bounty || duelResult.bounty.kind !== 'final') return;
    if (duelResult.bounty.chosen || deserterWrittenRef.current) return;
    deserterWrittenRef.current = true;

    // A8 — the bounty pays gold, so the peak-gold updater rides this write.
    const outcome = applyDeserterChoice(profile, choice);
    const settled = withPeakGold(outcome.profile);
    if (settled !== profile) {
      setProfile(settled);
      saveProfile(settled);
    }
    if (outcome.alreadyAnswered) return;

    setDuelResult((previous) =>
      previous && previous.bounty
        ? {
            ...previous,
            bounty: {
              ...previous.bounty,
              chosen: choice,
              gold: outcome.gold,
              fame: outcome.fame,
              line: outcome.line,
            },
          }
        : previous
    );
  };

  /**
   * RG-3 — the Device Choosing panel's one write. `chooseBannerDevice` refuses a second
   * choice outright, so this can only ever set `road.bannerDevice` once.
   */
  const handleChooseBannerDevice = (device: BannerDevice) => {
    if (!profile) return;
    const chosen = chooseBannerDevice(profile, device);
    setDeviceChoiceOpen(false);
    if (!chosen) return;
    setProfile(chosen);
    saveProfile(chosen);
  };

  /**
   * S5 — the Arena Medical House's cure (75 gold) and the Caravanserai Inn's rest
   * (25 gold).  Both helpers are pure and re-check every rule against the profile
   * they are handed — a live injury, and a purse that covers the price — so a
   * refusal returns the caller's own profile and never reaches `saveProfile`.  The
   * answer says whether the gold changed hands, which is what closes the city panel.
   */
  const handleTreatInjury = (): boolean => {
    if (!profile) return false;
    const treated = treatInjury(profile);
    if (treated === profile) return false;
    setProfile(treated);
    saveProfile(treated);
    return true;
  };

  /**
   * T2 — a night's board for a gladiator with NO wound: S5's own 25g, and nothing else.
   * A wounded player's price and injury effect belong to `restAtInn` itself.
   */
  const payForNight = (subject: PlayerProfile): PlayerProfile | null =>
    subject.gold >= REST_PRICE ? { ...subject, gold: subject.gold - REST_PRICE } : null;

  const handleRestAtInn = (): boolean => {
    if (!profile) return false;
    // S5 treats the wound; T2 owns the night. ONE transaction, ONE saveProfile: the injury
    // clock moves only inside `restAtInn`, and the dawn jump rides the same write.
    const treated = restAtInn(profile);
    const night = treated !== profile ? treated : payForNight(profile);
    if (!night) return false;
    // From Prima Luce the night sleeps a FULL cycle: `advanceToNextDawn` keeps a dawn where
    // it stands (T0's pinned rule), so this seam steps a whole day instead — tomorrow's
    // dawn, which is exactly the price the panel's label states.
    const atDawn = resolveTimeState(night).phaseIndex === 0;
    const toDawn = atDawn ? advanceTimeBy(night, PHASES_PER_DAY) : advanceToNextDawn(night);
    const settled = onDayRollover(profile, toDawn);
    setProfile(settled);
    saveProfile(settled);
    return true;
  };

  /**
   * Phase C-8.67C — buy a racing team (Triga 750, Quadra 1,500) with the
   * player's existing purse.  `purchaseRacingConfig` is pure and re-checks every
   * rule against the profile it is handed — prerequisite, ownership, price — so a
   * rejected buy leaves the profile, its balance included, exactly as it was and
   * never reaches `saveProfile`.  An already-unlocked team is refused too, so a
   * repeated or stale click cannot be charged twice.
   */
  const handleBuyRacingConfig = (horses: ChariotTeamSize) => {
    const result = purchaseRacingConfig(profile, horses);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /**
   * P2 — buy a Triumph (a title, or the ludus statue) with fame.  `purchaseLaurel`
   * is pure and re-checks every rule against the profile it is handed — price,
   * ownership, and that fame is the only currency — so a refusal returns no profile,
   * leaves the caller's own object untouched and never reaches `saveProfile`.  The
   * refusal is handed back to the Library's Triumphs page so it can print the reason.
   */
  /**
   * A8 — Director ruling R7: opening the Triumphs page marks every earned deed as
   * read, in ONE save. `markTriumphsViewed` is identity-stable once nothing is
   * unread, so the Library's effect cannot write twice.
   */
  const handleViewTriumphs = () => {
    if (!profile) return;
    const viewed = markTriumphsViewed(profile);
    if (viewed === profile) return;
    setProfile(viewed);
    saveProfile(viewed);
  };

  /**
   * A8 — one tap on an OWNED title (bought via P2 or earned via A8) puts it on the
   * record. `selectDisplayedTitle` refuses a title the profile does not own and is
   * identity-stable for the one already shown, so a repeat tap never saves.
   */
  const handleSelectTitle = (titleId: string) => {
    if (!profile) return;
    const titled = selectDisplayedTitle(profile, titleId);
    if (titled === profile) return;
    setProfile(titled);
    saveProfile(titled);
  };

  const handlePurchaseTriumph = (laurelId: string): LaurelResult => {
    const result = purchaseLaurel(profile, laurelId);
    if (!result.ok) return result;
    setProfile(result.profile);
    saveProfile(result.profile);
    return result;
  };

  /** Select an unlocked team: free, and it only records the player's preference. */
  const handleSelectRacingConfig = (horses: ChariotTeamSize) => {
    const result = selectRacingConfig(profile, horses);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  // Profile mutations
  const handleTrainStat = (stat: 'strength' | 'agility' | 'stamina' | 'defense') => {
    if (!profile) return;
    // P5 — the Ludus Training Yard sets stat training's price, and nothing else.
    const cost = trainingCost(profile);
    if (profile.gold < cost) return;

    const trained: PlayerProfile = {
      ...profile,
      gold: profile.gold - cost,
      baseStats: {
        ...profile.baseStats,
        [stat]: profile.baseStats[stat] + 1,
      },
    };
    // DAY/NIGHT T2 — a training session CONSUMED advances the clock one phase, in this
    // session's own transaction. The refusal above returns before this line, so a session
    // that could not be paid for advances nothing. One save.
    const timed = onDayRollover(profile, advanceTimeBy(trained, 1));
    setProfile(timed);
    saveProfile(timed);
  };

  /**
   * P5 — `purchaseItem` re-checks the item's gate and the purse, so a Master
   * Forge piece bought below workshop L2 is refused here even if a stock list
   * were bypassed.  A refusal returns no profile and never reaches `saveProfile`.
   */
  const handleBuyItem = (item: WeaponItem | ArmorItem) => {
    if (!profile) return;
    const result = purchaseItem(profile, item);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /**
   * S6 — buy a Bazaar consumable. `purchaseConsumable` is pure and re-checks the
   * price against the purse, so a refused buy leaves gold, counts and the GEAR
   * inventory exactly as they were and never reaches `saveProfile`. A consumable is
   * counted in `profile.consumables`; it is never pushed into `profile.inventory`.
   */
  const handleBuyConsumable = (item: ConsumableItem) => {
    if (!profile) return;
    const result = purchaseConsumable(profile, item.id);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /**
   * S6 — one-tap use on the live injury, from the treatment surfaces or the stats
   * tab. Same contract as the two cures above: a refusal (no wound, none owned)
   * returns no profile and never saves; the answer closes the city panel.
   */
  const handleUseConsumable = (itemId: string): boolean => {
    if (!profile) return false;
    const result = consumeItem(profile, itemId);
    if (!result.ok) return false;
    setProfile(result.profile);
    saveProfile(result.profile);
    return true;
  };

  /**
   * S7 — buy one tavern rumour (15 gold). `purchaseIntel` is pure and re-checks
   * every rule against the profile it is handed — a real opponent, not already
   * owned, a purse that covers the price — so a refusal returns no profile and
   * never reaches `saveProfile`. INTEL IS INFORMATION ONLY: the write touches
   * `gold` and `intel`, and no stat, formula or reward.
   */
  const handleBuyIntel = (opponentId: string): boolean => {
    if (!profile) return false;
    /**
     * STORY-5a — a 'cut' answer closes her rumour service PERMANENTLY: the panel
     * replaces its list with the closure, and this is the choke point that makes
     * it true — no gold moves and no intel is written (the refusal is pure, so
     * nothing reaches `saveProfile`).  S7's own flow is otherwise untouched.
     */
    if (isRumourServiceClosed(profile)) return false;
    const result = purchaseIntel(profile, opponentId);
    if (!result.ok) return false;
    setProfile(result.profile);
    saveProfile(result.profile);
    return true;
  };

  /**
   * STORY-5a — STEP 3 of the Quiet Dice chain: the player has come back to her
   * counter after his champion fell, so her closing line is spoken, the rumor
   * board opens and the chain PAYS (backstory + 5 Laudes + the house cup).  One
   * write, `App`'s as always; `withDiceChainClosed` is identity-stable for every
   * other open of the panel, so a repeat visit writes nothing and cannot pay
   * twice.
   */
  const handleOpenDiceBoard = () => {
    if (!profile) return;
    const opened = withDiceChainClosed(profile);
    if (opened === profile) return;
    setProfile(opened);
    saveProfile(opened);
  };

  /**
   * STORY-5a — Piso's offer, answered.  ONE binary flag (`story.diceEnding`),
   * both answers reachable and mutually exclusive: the module refuses a second
   * answer off the field itself, so the offer cannot be taken twice and 'cut'
   * can never be followed by 'refused'.  'cut' pays 300 g in the same write (a
   * raise, so the peak-gold records updater rides it); 'refused' pays nothing
   * here — his champion is a standard duel and its own row's purse is the honest
   * purse, paid by that duel's victory write.
   */
  const handleChooseDiceEnding = (choice: DiceChoice) => {
    if (!profile) return;
    const outcome = applyDiceChoice(profile, choice);
    if (!outcome.ok) return;
    const settled = withPeakGold(outcome.profile);
    if (settled === profile) return;
    setProfile(settled);
    saveProfile(settled);
  };

  /**
   * PITCH A1 — the Shrine of Fortuna's two words.  Both transactions are pure and
   * re-check their own rules (`offerOmen` refuses a purse under 25 gold before any
   * arithmetic; `declineOmen` writes only the first-ever decline), so a refusal
   * returns no profile and never reaches `saveProfile`.  The city screen only
   * reports the choice; this is the one place either write happens.
   */
  const handleOfferOmen = (): OmenOfferOutcome | null => {
    if (!profile) return null;
    const result = offerOmen(profile);
    if (!result.ok) return result;
    setProfile(result.profile);
    saveProfile(result.profile);
    return result;
  };

  const handleDeclineOmen = (): OmenDeclineOutcome | null => {
    if (!profile) return null;
    const result = declineOmen(profile);
    if (!result.wrote) return result;
    setProfile(result.profile);
    saveProfile(result.profile);
    return result;
  };

  // P1 sell — the market buys a carried, unequipped item back for its
  // `sellPrice` plus 25 % of any temper gold spent on it.  The transaction is
  // pure: a refusal hands back the same profile object, so nothing is saved.
  const handleSellItem = (item: WeaponItem | ArmorItem) => {
    if (!profile) return;
    // A8 — selling RAISES gold, so the peak-gold records updater rides this save
    // too. It is identity-stable when nothing moved, so a refused sale still
    // returns before any write.
    const updated = withPeakGold(sellItem(profile, item.id));
    if (updated === profile) return;
    setProfile(updated);
    saveProfile(updated);
  };

  /**
   * P6 — temper an owned item.  `purchaseTemper` is pure and re-checks every
   * rule (ownership, the level cap, the Smithing Workshop's gate, the purse), so
   * a refusal hands back the caller's own profile object and never reaches
   * `saveProfile`.
   */
  const handleTemperItem = (itemId: string) => {
    if (!profile) return;
    const updated = purchaseTemper(profile, itemId);
    if (updated === profile) return;
    setProfile(updated);
    saveProfile(updated);
  };

  /** P6 — the Imperial Stable's quality ladder, through the P4 transaction. */
  const handleBuyStableQuality = (grade: number) => {
    if (!profile) return;
    const result = purchaseStableQuality(profile, grade);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /** P6 — the Imperial Stable's conditioning ladder, through the P4 transaction. */
  const handleBuyStableConditioning = (level: number) => {
    if (!profile) return;
    const result = purchaseStableConditioning(profile, level);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /**
   * P6 — build the next level of a ludus facility.  `purchaseFacility` is pure
   * and re-checks the order and the purse, and a refusal carries no profile at
   * all, so nothing is charged and nothing is saved.
   */
  const handleBuyFacility = (id: FacilityId) => {
    if (!profile) return;
    const result = purchaseFacility(profile, id);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  const handleEquipWeapon = (wpn: WeaponItem) => {
    if (!profile) return;
    const updated: PlayerProfile = {
      ...profile,
      equipped: {
        ...profile.equipped,
        weapon: wpn,
      },
    };
    setProfile(updated);
    saveProfile(updated);
  };

  const handleEquipArmor = (armor: ArmorItem) => {
    if (!profile) return;
    const updated: PlayerProfile = {
      ...profile,
      equipped: {
        ...profile.equipped,
        [armor.slot]: armor,
      },
    };
    setProfile(updated);
    saveProfile(updated);
  };

  const handleAllocateStatPoint = (stat: 'strength' | 'agility' | 'stamina' | 'defense') => {
    if (!profile || profile.unspentStatPoints <= 0) return;
    sounds.playClick();
    const updated: PlayerProfile = {
      ...profile,
      unspentStatPoints: profile.unspentStatPoints - 1,
      baseStats: {
        ...profile.baseStats,
        [stat]: profile.baseStats[stat] + 1,
      },
    };
    setProfile(updated);
    saveProfile(updated);
  };

  /**
   * CH-2 — the legacy re-pledge.  A save written before the classes existed has no
   * `armatura` field, so its class is only inferred; this writes the chosen id and
   * NOTHING else (no stat, item, gold or palma), through the same
   * `setProfile` + `saveProfile` pair every other profile change uses.  The helper
   * refuses an already-pledged profile, so the tap can only ever happen once.
   */
  const handleRepledgeArmatura = (armatura: ArmaturaId) => {
    if (!profile) return;
    const result = withArmaturaPledge(profile, armatura);
    if (!result.ok) return;
    sounds.playClick();
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /**
   * CH-5 — the palmae's three writes, and the only ones besides the victory
   * write's earn checks.  Each runs the pure transaction in `utils/palmaeState.ts`,
   * which re-checks every rule against the profile it is handed — unlocked, not
   * boss-only, the tier's slot ladder, the purse — and hands back NO profile on a
   * refusal, so a stale tap can neither charge twice nor wear an unearned palm.
   */
  const handleEquipPalma = (palmaId: string) => {
    if (!profile) return;
    const result = equipPalma(profile, palmaId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  const handleUnequipPalma = (palmaId: string) => {
    if (!profile) return;
    const result = unequipPalma(profile, palmaId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /** A purchase UNLOCKS the palm; it is worn later, in the Gladiator Stats panel. */
  const handleBuyPalma = (palmaId: string) => {
    if (!profile) return;
    const result = purchaseDoctorePalma(profile, palmaId);
    if (!result.ok) return;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  const handleResetGame = () => {
    clearSavedProfile();
    setProfile(null);
    setCurrentScreen('title');
  };

  return (
    <div className="w-full h-full min-h-[100dvh] bg-neutral-950 text-amber-100 overflow-hidden select-none">
        {/* 3D ASSET LOADING OVERLAY WITH DUAL GOLD SPINNER & PERCENTAGE */}
        <AssetLoadingOverlay />

        {/* START-1 — the offline surface. Non-blocking on purpose: the service-worker
            shell may still hold a playable game, so this informs and offers a Retry
            without taking the game away. */}
        <OfflineNotice />

        {/* START-1 — the post-Oath save-progress nudge: once per session, dismissible,
            and pointer-transparent everywhere but its own card. */}
        {postOathNudge.visible && (
          <PostOathNudge
            onSaveProgress={() => {
              postOathNudge.dismiss();
              setShowDriveSync(true);
            }}
            onDismiss={postOathNudge.dismiss}
          />
        )}

        {/* GAME SCREENS */}
        {currentScreen === 'title' && (
            <TitleScreen
                savedProfile={profile}
                saveQuarantineNotice={saveQuarantineNotice}
                onContinueAdventure={handleContinueAdventure}
                onNewCharacter={handleNewCharacter}
                onOpenDriveSync={() => setShowDriveSync(true)}
                onToggleMute={handleToggleMute}
                isMuted={isMuted}
                onOpenSettings={() => handleOpenSettings()}
                onGoogleSignIn={handleGoogleSignIn}
                isGoogleLoading={isGoogleLoading}
                onFacebookSignIn={handleFacebookSignIn}
                isFacebookLoading={isFacebookLoading}
                onAppleSignIn={handleAppleSignIn}
                isAppleLoading={isAppleLoading}
                onMicrosoftSignIn={handleMicrosoftSignIn}
                isMicrosoftLoading={isMicrosoftLoading}
                onEmailSignIn={handleEmailSignIn}
            />
        )}

        {currentScreen === 'create_character' && (
            <CharacterCreation
            onComplete={handleCharacterCreated}
            onCancel={() => setCurrentScreen('title')}
            onGoogleSignIn={handleGoogleSignIn}
            isGoogleLoading={isGoogleLoading}
            onOpenSettings={() => handleOpenSettings()}
            />
        )}

        {currentScreen === 'city_3d' && profile && (
          <>
          <LazySceneBoundary tier="city">
          <React.Suspense fallback={<WaitSurface destination="city_hub" />}>
            <CityHubScene
            playerProfile={profile}
            onOpenTab={handleOpenHubTab}
            onEnterDuel={handleEnterDuel}
            onOpenDriveSync={() => setShowDriveSync(true)}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            onReturnToMainMenu={() => setCurrentScreen('title')}
            isLeftyMode={isLeftyMode}
            onOpenSettings={() => handleOpenSettings()}
            initialPosition={oathBeatMode ? OATH_YARD_SPAWN.position : cityReturnPose?.position}
            initialRotationY={oathBeatMode ? OATH_YARD_SPAWN.rotationY : cityReturnPose?.rotationY}
            onStartRace={handleStartRace}
            onTreatInjury={handleTreatInjury}
            onRestAtInn={handleRestAtInn}
            onUseConsumable={handleUseConsumable}
            onBuyIntel={handleBuyIntel}
            onRecordKeeperVisit={handleRecordKeeperVisit}
            onVisitLocation={handleVisitLocation}
            onOpenDiceBoard={handleOpenDiceBoard}
            onEnterDiceTrailBout={handleEnterDiceTrailBout}
            onChooseDiceEnding={handleChooseDiceEnding}
            onOfferOmen={handleOfferOmen}
            onDeclineOmen={handleDeclineOmen}
            lightProfile={oathBeatMode ? 'oathDawn' : undefined}
            movementLocked={!!oathBeatMode}
            heraldAim={heraldPointerVisible(herald) ? herald.aim : null}
            />
          </React.Suspense>
          </LazySceneBoundary>

          {/* THE GLADIATOR'S OATH — the presented scene the yard is mounted for: the
              Doctore's framing line, the four lines each in Latin with its gloss, and the
              closing vow. It owns the screen while it is up (the city reads no controls),
              so a new gladiator's arrival is the beat and never free roam. */}
          {oathBeatMode && <OathBeat mode={oathBeatMode} onComplete={handleOathComplete} />}

          {/* DAY/NIGHT T2 — the day-boundary beat: a 600 ms sleep veil and the new day's
              name. It is only ever drawn over the city, so a rollover earned in the arena
              plays when the player walks back in. */}
          {dayBanner && (
            <DayBanner
              key={dayBanner.day}
              day={dayBanner.day}
              text={dayBanner.text}
              onDone={() => setDayBanner(null)}
            />
          )}
          </>
        )}

        {currentScreen === 'hub_2d' && profile && (
            <GladiatorSchoolHub
            playerProfile={profile}
            onOpenDeviceChoice={() => setDeviceChoiceOpen(true)}
            heraldCircusCry={circusPointerCry(profile)}
            onHeraldCry={handleHeraldCry}
            activeTab={activeHubTab}
            onTabChange={handleHubTabChange}
            onEnterCity3D={() => { if (profile) enterCity(profile); }}
            onSelectOpponent={handleEnterDuel}
            onTrainStat={handleTrainStat}
            onBuyItem={handleBuyItem}
            onBuyConsumable={handleBuyConsumable}
            onUseConsumable={handleUseConsumable}
            onSellItem={handleSellItem}
            onEquipWeapon={handleEquipWeapon}
            onEquipArmor={handleEquipArmor}
            gearView={gearView}
            onGearViewChange={setGearView}
            shopId={shopId}
            onRecordKeeperVisit={handleRecordKeeperVisit}
            onBuyChariotPart={handleBuyChariotPart}
            onEquipChariotPart={handleEquipChariotPart}
            onBuyRacingConfig={handleBuyRacingConfig}
            onSelectRacingConfig={handleSelectRacingConfig}
            onAllocateStatPoint={handleAllocateStatPoint}
            onRepledgeArmatura={handleRepledgeArmatura}
            onOpenDriveSync={() => setShowDriveSync(true)}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            onResetGame={handleResetGame}
            onOpenSettings={() => handleOpenSettings()}
            onMarkCardSeen={handleMarkCardSeen}
            onEnterDoctoreTest={handleEnterDoctoreTest}
            onPurchaseTriumph={handlePurchaseTriumph}
            onTemperItem={handleTemperItem}
            onBuyStableQuality={handleBuyStableQuality}
            onBuyStableConditioning={handleBuyStableConditioning}
            onBuyFacility={handleBuyFacility}
            onEquipPalma={handleEquipPalma}
            onUnequipPalma={handleUnequipPalma}
            onBuyPalma={handleBuyPalma}
            onViewTriumphs={handleViewTriumphs}
            onSelectTitle={handleSelectTitle}
            />
        )}

        {currentScreen === 'duel' && profile && (
          <LazySceneBoundary tier="arena">
          <React.Suspense fallback={<WaitSurface destination="arena" />}>
            <DuelScene
            playerProfile={profile}
            opponent={activeOpponent}
            boutMode={boutMode}
            onMatchComplete={handleMatchComplete}
            onOpenArmory={() => handleOpenHubTab('tournament')}
            onOpenHelp={() => handleOpenSettings('controls', 'duel')}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            isLeftyMode={isLeftyMode}
            onOpenSettings={() => handleOpenSettings(undefined, 'duel')}
            onMarkCardSeen={handleMarkCardSeen}
            />
          </React.Suspense>
          </LazySceneBoundary>
        )}

        {currentScreen === 'race' && (
          <LazySceneBoundary tier="circus">
          <React.Suspense fallback={<WaitSurface destination="circus" />}>
            <RaceScene
              onAbort={handleExitRace}
              isLeftyMode={isLeftyMode}
              chaseDistancePreset={settings.raceCamDistance}
              onOpenSettings={() => handleOpenSettings(undefined, 'race')}
              frozen={settingsOpen}
              phase={resolveTimeState(profile).phase}
            />
          </React.Suspense>
          </LazySceneBoundary>
        )}

        {/* DUEL RESULT MODAL */}
        {duelResult && (
            <DuelResultModal
            didWin={duelResult.didWin}
            opponent={activeOpponent}
            stats={duelResult.stats}
            storyLines={duelResult.storyLines}
            injuryEvent={duelResult.injuryEvent}
            palmaEarned={duelResult.palmaEarned}
            omenLine={duelResult.omenLine}
            mercy={duelResult.mercy ?? null}
            onMercyChoice={handleMercyChoice}
            bounty={duelResult.bounty ?? null}
            onDeserterChoice={handleDeserterChoice}
            goldTotal={profile?.gold}
            coachCardId={
              profile
                ? evaluateBeats(
                    {
                      phase: 'result',
                      result: duelResult.didWin ? 'win' : 'loss',
                      losses: profile.fightsLost,
                    },
                    resolveSeenState(profile)
                  )
                : null
            }
            onCoachCardDismiss={handleMarkCardSeen}
            onContinue={handleDuelResultDismiss}
            />
        )}

        {/* SAVE-SAFETY — the New Character overwrite confirmation.  It sits above every
            screen and holds the flow until the player decides; nothing is erased, and
            the stored profile is only replaced when a new creation completes. */}
        {overwriteConfirm && (
            <NewCharacterOverwriteModal
            existing={overwriteConfirm}
            onCancel={() => setOverwriteConfirm(null)}
            onConfirm={() => {
              setOverwriteConfirm(null);
              setCurrentScreen('create_character');
            }}
            />
        )}

        {/* RG-3 — THE HERALD, and the one-time device choice. Both sit above every screen:
            a duel ends into the city, so a cry raised by the result has to outlive it. */}
        <HeraldToast cries={heraldCries} onDismiss={() => setHeraldCries([])} />
        {deviceChoiceOpen && profile && (
            <DeviceChoosingPanel
            onChoose={handleChooseBannerDevice}
            onDismiss={() => setDeviceChoiceOpen(false)}
            />
        )}

        {/* GAME SETTINGS MODAL — one panel, five sections, every wired row live */}
        <SettingsModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            initialCategory={settingsCategory}
            context={settingsContext}
            phase={resolveTimeState(profile).phase}
            onOpenCloudSave={() => {
              setSettingsOpen(false);
              setShowDriveSync(true);
            }}
            onResetSave={handleResetGame}
            onDeleteAccount={authUser ? () => setDeleteAccountOpen(true) : undefined}
            onEraseDeviceData={authUser ? undefined : handleResetGame}
        />

        {/* ACCOUNT DELETION — the confirmation flow the settings panel opens.  It sits
            above the panel, so cancelling returns to Settings. */}
        {deleteAccountOpen && authUser && (
            <DeleteAccountModal
            isOpen={deleteAccountOpen}
            user={{
              email: authUser.email,
              providerIds: authUser.providerData.map((provider) => provider.providerId),
            }}
            onClose={() => setDeleteAccountOpen(false)}
            onDeleted={() => {
              setDeleteAccountOpen(false);
              setSettingsOpen(false);
              // The account and this device's save are already gone by now; App only
              // has to drop its own copy of the profile and return to the title.
              handleResetGame();
            }}
            />
        )}

        {/* GOOGLE DRIVE CLOUD SYNC MODAL */}
        {showDriveSync && (
            <GoogleDriveSyncModal
            currentProfile={profile}
            onProfileLoaded={(loadedProfile) => {
                setProfile(loadedProfile);
                saveProfile(loadedProfile);
                setShowDriveSync(false);
                enterCity(loadedProfile);
            }}
            onClose={() => setShowDriveSync(false)}
            />
        )}
    </div>
  );
}

export default App;
