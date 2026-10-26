import React, { useState, useEffect } from 'react';
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
import { purchaseLaurel, type LaurelResult } from './utils/laurels';
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
const DuelScene = React.lazy(() => import('./components/duel/DuelScene').then((m) => ({ default: m.DuelScene })));
// Phase C-8.70B Stage 1, Slice 1 — the race scene, reached exactly the way the
// city hub and the duel arena are: one more screen value, one more lazy import
// and one more conditional render. No router and no second scene manager.
const RaceScene = React.lazy(() => import('./components/3d/RaceScene').then((m) => ({ default: m.RaceScene })));
import { DuelResultModal } from './components/hub/DuelResultModal';
import { HeraldToast } from './components/hub/HeraldToast';
import { DeviceChoosingPanel } from './components/hub/DeviceChoosingPanel';
import { evaluateRoadMilestones, chooseBannerDevice } from './utils/roadMilestones';
import type { BannerDevice } from './utils/heraldry';
import { GoogleDriveSyncModal } from './components/hub/GoogleDriveSyncModal';
import { SettingsModal } from './components/hub/SettingsModal';
import type { SettingsCategory, SettingsContext } from './components/hub/SettingsModal';
import { useSettings } from './hooks/useSettings';
import { resolveMotionAttribute, updateSettings } from './services/settings';
import { AssetLoadingOverlay } from './components/ui/AssetLoadingOverlay';
import { WaitSurface } from './components/ui/WaitSurface';
import { LazySceneBoundary } from './components/ui/LazySceneBoundary';
import { NoWebGLScreen, OfflineNotice } from './components/ui/GameFailureSurface';
import { checkWebGLAvailability } from './components/ui/WebGLErrorBoundary';
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
// C-8.70C — the grudge record's writes. A grudge's own result is recorded here in
// the SAME result write every duel uses; nothing on the grudge surfaces writes.
import {
  closeGrudge,
  isGrudgeBout,
  recordStandardVictory,
  settleGrudge,
} from './utils/grudgeBouts';
import { resolveInjuryAfterDuel, restAtInn, treatInjury, type DuelInjuryEvent } from './utils/injury';
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

  // START-1 — the device can run the game at all. Resolved once, at boot, so a device
  // without 3D is told so in plain language instead of reaching a scene that cannot draw.
  const [webglAvailable] = useState(() => checkWebGLAvailability().supported);

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
    sounds.playClick();
    setCurrentScreen('duel');
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
    const { profile: afterInjury, event: injuryEvent } = resolveInjuryAfterDuel(profile, didWin);

    /** CH-5 — what this victory unlocked, decided at the write and told to the result. */
    let palmaEarned: string[] | undefined;

    if (didWin) {
      const nextGold = profile.gold + stats.goldEarned;
      const nextFame = profile.fame + stats.fameEarned;
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
      const defeated = isGrudge
        ? profile.defeatedOpponentIds
        : profile.defeatedOpponentIds.includes(activeOpponent.id)
        ? profile.defeatedOpponentIds
        : [...profile.defeatedOpponentIds, activeOpponent.id];

      // C-8.70C — the grudge record rides this same write: the FIRST victory over
      // a regular opponent records the mix's dominant class, any standard victory
      // at a grudge's tier re-opens that tier's closed grudges, and a grudge
      // victory settles it. All three helpers are pure and return the profile
      // unchanged when nothing applies.
      const grudgeProfile = isGrudge
        ? settleGrudge(afterInjury, activeOpponent)
        : recordStandardVictory(
            afterInjury,
            activeOpponent,
            stats.dominantOffensiveClass ?? 'even'
          );

      // The tier moves only on a boss's FIRST defeat — the boss's id newly entering
      // `defeatedOpponentIds` in this write. A rematch pays its rewards exactly as it
      // always did, but it proves nothing new, so it never opens the next tier (see
      // `utils/tierAdvancement.ts`: one boss could otherwise carry a gladiator through
      // tiers whose champions were never faced).
      const tierAfterVictory = resolveVictoryTier({
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
      const settledProfile = evaluateRituals(profile, earned.profile, activeOpponent);
      setProfile(settledProfile);
      saveProfile(settledProfile);
    } else {
      // C-8.70C — a lost GRUDGE closes: it stays shut until the player wins any
      // standard bout at that grudge's own tier (the anti-farm rule). Nothing
      // else about a defeat changes.
      const grudgeProfile = isGrudgeBout(activeOpponent)
        ? closeGrudge(afterInjury, activeOpponent)
        : afterInjury;
      const updatedProfile: PlayerProfile = {
        ...grudgeProfile,
        fightsLost: profile.fightsLost + 1,
        peakCrowdHypeOverall: Math.max(profile.peakCrowdHypeOverall, stats.crowdHypePeak),
      };
      const settledProfile = evaluateRituals(profile, updatedProfile);
      setProfile(settledProfile);
      saveProfile(settledProfile);
    }

    setDuelResult({
      didWin,
      stats,
      storyLines,
      injuryEvent,
      ...(palmaEarned && palmaEarned.length > 0 ? { palmaEarned } : {}),
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

  const handleRestAtInn = (): boolean => {
    if (!profile) return false;
    const rested = restAtInn(profile);
    if (rested === profile) return false;
    setProfile(rested);
    saveProfile(rested);
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

    const updated: PlayerProfile = {
      ...profile,
      gold: profile.gold - cost,
      baseStats: {
        ...profile.baseStats,
        [stat]: profile.baseStats[stat] + 1,
      },
    };
    setProfile(updated);
    saveProfile(updated);
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
    const result = purchaseIntel(profile, opponentId);
    if (!result.ok) return false;
    setProfile(result.profile);
    saveProfile(result.profile);
    return true;
  };

  // P1 sell — the market buys a carried, unequipped item back for its
  // `sellPrice` plus 25 % of any temper gold spent on it.  The transaction is
  // pure: a refusal hands back the same profile object, so nothing is saved.
  const handleSellItem = (item: WeaponItem | ArmorItem) => {
    if (!profile) return;
    const updated = sellItem(profile, item.id);
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

  // A device that cannot draw the 3D world gets one plain-language surface and a retry,
  // never a scene that fails to render.
  if (!webglAvailable) {
    return <NoWebGLScreen />;
  }

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
          </>
        )}

        {currentScreen === 'hub_2d' && profile && (
            <GladiatorSchoolHub
            playerProfile={profile}
            onOpenDeviceChoice={() => setDeviceChoiceOpen(true)}
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
