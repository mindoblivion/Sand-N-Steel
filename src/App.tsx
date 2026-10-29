import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PlayerProfile, OpponentConfig, DuelStatistics, WeaponItem, ArmorItem, ChariotTeamSize, PlayerInjury } from './types/game';
import { loadSavedProfile, saveProfile, clearSavedProfile, createNewProfile, calculateTotalStats } from './services/storage';
import { normalizeGold } from './utils/currency';
import { TitleScreen } from './components/hub/TitleScreen';
import { CharacterCreation } from './components/hub/CharacterCreation';
const CityHubScene = React.lazy(() => import('./components/3d/city/CityHubScene').then((m) => ({ default: m.CityHubScene })));
import { GladiatorSchoolHub } from './components/hub/GladiatorSchoolHub';
import type { GearView } from './components/hub/GearTab';
import type { StorefrontId } from './data/shops';
import { purchaseChariotPart, equipChariotPart } from './utils/chariotLoadout';
import { purchaseRacingConfig, selectRacingConfig } from './utils/racingProgression';
import { sellItem } from './utils/selling';
const DuelScene = React.lazy(() => import('./components/duel/DuelScene').then((m) => ({ default: m.DuelScene })));
// Phase C-8.70B Stage 1, Slice 1 — the race scene, reached exactly the way the
// city hub and the duel arena are: one more screen value, one more lazy import
// and one more conditional render. No router and no second scene manager.
const RaceScene = React.lazy(() => import('./components/3d/RaceScene').then((m) => ({ default: m.RaceScene })));
import { DuelResultModal } from './components/hub/DuelResultModal';
import { HeraldToast } from './components/hub/HeraldToast';
import { DeviceChoosingPanel } from './components/hub/DeviceChoosingPanel';
import {
  evaluateRoadMilestones,
  chooseBannerDevice,
  type RoadEvaluationOptions,
} from './utils/roadMilestones';
import { advanceCityDay } from './utils/cityClock';
import { settleInjury } from './utils/injurySettlement';
import { purchaseStorefrontItem } from './utils/storefrontPurchase';
import { trainStat } from './utils/trainingSession';
import { restAtMedicalHouse, type RestResult } from './utils/restRecovery';
// L14 — the ONE night's lodging transaction: a room spends a day, never heals.
import { lodgeAtCaravanserai, type LodgingResult } from './utils/lodging';
// L11 — the ONE visitor encounter transaction: meeting a visitor writes `seenVisitors`.
import { recordVisitorEncounter } from './utils/visitorEncounter';
// L12 — the ONE visitor purchase transaction: buying the day's offer completes the visitor.
import { purchaseVisitorOffer, type VisitorPurchaseResult } from './utils/visitorPurchase';
// L21B — the herald's call for the day's visitors: one in-memory ledger, no save.
import { createVisitorHeraldLedger } from './utils/visitorHerald';
// L21D — a dismissal removes the cries the toast showed, never the whole queue.
import { removeDisplayedCries } from './utils/heraldQueue';
import type { TrainingStat } from './data/training';
import { createDuelSettlementLatch } from './utils/duelSettlement';
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
import { ALL_OPPONENTS } from './data/opponents';
import { resolveVictoryTier } from './utils/tierAdvancement';
import { sounds } from './audio/soundEffects';
import { music } from './audio/musicEngine';
import { preloadTitleStage } from './utils/preloadAssets';

// PLAY-1 — the screen ids and what the browser/Android BACK button does with each of
// them live in ONE contract module (`utils/screenHistory`), so the history guard and the
// screen tree can never disagree about where back goes.
import type { GameScreen } from './utils/screenHistory';
import { useBackNavigation } from './hooks/useBackNavigation';

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
  /**
   * L21I — the save is read in the state INITIALIZER, so hydration is part of the
   * first render rather than a passive effect that lands a frame later.
   *
   * `TitleScreen` chooses Play vs Continue from this prop and the primary action reads
   * the value its render captured, after awaiting fullscreen. While this was
   * `useState(null)` + a mount effect, the first paint carried `null`: a tap in that
   * window (and every tap whose handler had already been created from that paint) took
   * the character-creation branch and dumped a returning player into a new gladiator.
   *
   * `loadSavedProfile()` is a pure read with its own try/catch — it answers `null` for
   * "no save" and for "unreadable save", and it removes nothing — so React's StrictMode
   * double-invoking the initializer in development is harmless (it is read twice, never
   * written). `null` now means only "there is no save"; it never means "not loaded yet".
   */
  const [profile, setProfile] = useState<PlayerProfile | null>(() => loadSavedProfile());
  /**
   * L4 — the newest committed profile, which is the ONE base a purchase reads.
   * React state only changes on the next render, so two purchase callbacks in the
   * same tick (a double click, a duplicated handler) would otherwise both spend
   * the same purse and both take the merchant's single daily allowance. A commit
   * writes this ref immediately, so the second call sees the first one's result.
   */
  const profileRef = useRef<PlayerProfile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const [activeOpponent, setActiveOpponent] = useState<OpponentConfig>(ALL_OPPONENTS[0]);
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
  const [duelResult, setDuelResult] = useState<{ didWin: boolean; stats: DuelStatistics; injury: PlayerInjury | null } | null>(null);
  /**
   * L1 (Living City) — the duel settlement's exactly-once latch, PER BOUT.
   * `DuelScene` already refuses a second outcome (`isMatchOver`), but App must
   * not depend on another component for the one thing it cannot repeat: crediting
   * a fight and turning the city's clock.
   *
   * `DuelScene` reports a result 1400 ms after the deciding blow, and that call
   * deliberately outlives the scene (an Armory exit must not drop an earned
   * purse), so App can receive it after another bout has already begun. A boolean
   * latch cannot tell those apart: such a callback would consume the NEW bout's
   * latch and the new bout would never settle. `duelSettlementRef` therefore
   * claims a per-bout id (`utils/duelSettlement.ts`), and `duelId` is the id of
   * the bout in progress — the token the callback handed to the scene carries —
   * so a replay, a stale callback or an out-of-order arrival can only ever settle
   * its own bout, once. Nothing here is saved: view-lifetime bookkeeping.
   */
  const duelSettlementRef = useRef(createDuelSettlementLatch());
  const [duelId, setDuelId] = useState(0);
  /**
   * RG-3 — the herald's cries and the one-time Device Choosing panel. Both are view
   * state only: the road's own writes go through `profile.road`, saved the normal way.
   */
  const [heraldCries, setHeraldCries] = useState<string[]>([]);
  /**
   * L21B — what the herald has already called, keyed `(city day, visitor id)`. In
   * memory only, for the life of the session: nothing here reaches a save, and a
   * reload announces the day's arrivals once more.
   */
  const visitorHeraldRef = useRef(createVisitorHeraldLedger());
  /**
   * L21D — A DISMISSAL REMOVES ONLY WHAT THE TOAST SHOWED. `HeraldToast` hands back
   * the cries it rendered, and the queue is append-only, so those cries are its
   * prefix: removing exactly that prefix leaves anything raised since it was drawn
   * queued and visible. The visitor ledger spends its `(day, visitorId)` key BEFORE
   * the cry is returned, so a whole-queue clear here could destroy a call the player
   * would never hear again in this session. Stable identity, because it is the
   * toast's timer dependency: the seven seconds run from the last cry, not from the
   * last App render.
   */
  const handleHeraldDismiss = useCallback((displayed: readonly string[]) => {
    setHeraldCries((previous) => removeDisplayedCries(previous, displayed));
  }, []);
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

  // Title-mount boot: the audio engine and the stage-1 preload. The saved profile is
  // NOT loaded here — L21I reads it in the state initializer above, so the first paint
  // already carries it (see that comment).
  useEffect(() => {
    try { music.init(sounds.getAudioContext()); } catch (e) {}

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
   * L21B — THE HERALD CALLS THE ARRIVALS. One effect and one in-memory ledger: while
   * the city is on screen and the oath beat is not holding it, ask the ONE visitor
   * schedule who is in town on the profile's current city day and append the cries it
   * has not raised yet through the same `heraldCries` channel the road milestones use.
   *
   * The effect runs on a profile update as well as on a screen change, which is what
   * lets a day turned by a night's lodging (or by a settled duel) be announced while
   * the city stays mounted; the ledger is what keeps a re-render, StrictMode's double
   * invocation and a second visit on the same day silent. A later day is a new key, so
   * it speaks again. Nothing here writes a profile, advances the clock or touches an
   * encounter — the schedule is read, never changed.
   */
  useEffect(() => {
    if (currentScreen !== 'city_3d' || !profile || oathBeatMode) return;
    const cries = visitorHeraldRef.current.announce(profile);
    if (cries.length > 0) setHeraldCries((previous) => [...previous, ...cries]);
  }, [currentScreen, profile, oathBeatMode]);

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
    before: PlayerProfile | null,
    after: PlayerProfile,
    options?: RoadEvaluationOptions
  ): PlayerProfile => {
    const evaluation = evaluateRoadMilestones(before, after, options);
    if (evaluation.cries.length > 0) {
      setHeraldCries((previous) => [...previous, ...evaluation.cries]);
    }
    if (evaluation.offerDeviceChoice) setDeviceChoiceOpen(true);
    return evaluation.profile;
  };

  const enterCity = (forProfile: PlayerProfile) => {
    // City entry is the second milestone call site, and the grandfathering one: a null
    // baseline makes every stage the save has already earned but never been shown "fresh",
    // so a legacy, imported or cloud-loaded gladiator finally records its own road. It is
    // recorded `silent` — a cry belongs to the event that won the stage (the duel
    // settlement), never to an arrival, which must not read old history back as news. The
    // device-panel offer is derived from the arrival alone, so it is unaffected.
    const arrivalProfile = evaluateRituals(null, forProfile, { silent: true });
    // L13A — city entry is handed the profile the caller means the city to open with,
    // and that argument is authoritative: a freshly created gladiator or a cloud save
    // is NEWER than the ref, while a caller passing the render's own snapshot always
    // matches it on a committed render (the duel dismissal, the race exit and the
    // hub's way back in). The ref is therefore synced to the arrival in the same
    // synchronous call — before the one write below — so no later transaction (the
    // duel settlement reads it as its base) can build on a profile the save no longer
    // holds. This line itself writes nothing to disk.
    profileRef.current = arrivalProfile;
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

  const handleNewCharacter = () => {
    sounds.playClick();
    setCurrentScreen('create_character');
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
          setCurrentScreen('create_character');
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
        setCurrentScreen('create_character');
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
        setCurrentScreen('create_character');
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
        setCurrentScreen('create_character');
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
      setCurrentScreen('create_character');
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
    const base = profileRef.current ?? profile;
    const sworn = withOathSworn(base);
    if (sworn) {
      profileRef.current = sworn;
      setProfile(sworn);
      saveProfile(sworn);
    }
    setHerald(aimHerald(HERALD_COLOSSEUM));
    // The Oath has just been sworn: offer the once-a-session save-progress nudge.
    postOathNudge.offer();
  };

  const handleEnterDuel = (opp: OpponentConfig) => {
    // A fresh bout ARMS the settlement latch with a new id: its own settlement
    // must carry that id to be paid. Merely opening a duel never advances the
    // day: only a completed settlement does (see handleMatchComplete).
    setDuelId(duelSettlementRef.current.arm());
    setActiveOpponent(opp);
    sounds.playClick();
    setCurrentScreen('duel');
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
   * Phase C-8.66B — buy a chariot part with the player's existing gold.
   * `purchaseChariotPart` is pure and re-checks every rule (ownership, price,
   * unknown id), so a rejected buy leaves gold, ownership and the equipped
   * choice exactly as they were and never reaches `saveProfile`.
   */
  const handleBuyChariotPart = (partId: string) => {
    const base = profileRef.current;
    if (!base) return;
    const result = purchaseChariotPart(base, partId);
    if (!result.ok) return;
    profileRef.current = result.profile;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /** Equip an owned chariot part — never deducts gold. */
  const handleEquipChariotPart = (partId: string) => {
    const base = profileRef.current;
    if (!base) return;
    const result = equipChariotPart(base, partId);
    if (!result.ok) return;
    profileRef.current = result.profile;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  const handleMatchComplete = (
    stats: DuelStatistics,
    didWin: boolean,
    settledDuelId: number
  ) => {
    // L13A — THE SETTLEMENT'S BASE IS THE NEWEST COMMITTED PROFILE, never the render's
    // snapshot. `DuelScene` reports a result 1400 ms after the deciding blow and that
    // call deliberately outlives the scene, so this closure can hold a `profile` that
    // has since been superseded — another bout settling, a sale, a purchase, a rest.
    // Every figure below (the clock, the injury, the purse, fame, xp, progression and
    // the defeated list) is read from this one base, so a settlement can only ADD to
    // what the save already holds. The render's `profile` is only the first-render fallback.
    const base = profileRef.current ?? profile;
    if (!base) return;

    // Exactly one settlement per COMPLETED bout, named by the id the scene's own
    // callback carries. A callback that fires twice for the same bout (a repeated
    // effect, a StrictMode remount, a stale timer), one that names a bout that
    // never existed, and one whose bout has already settled are all refused here
    // — so neither the purse nor the clock below is reached twice.
    if (!duelSettlementRef.current.claim(settledDuelId)) return;

    // L1 — THE LIVING CITY'S CLOCK. One COMPLETED duel turns the day, and it turns
    // in the SAME profile update this settlement already writes: the advanced clock
    // is computed once, here, and carried into whichever branch settles this fight.
    // A duel that is opened and then abandoned or cancelled never reaches this
    // handler, so it never advances the day.
    const city = advanceCityDay(base).city;

    // L7 — THE INJURY SETTLEMENT. One slot, decided from the pre-fight profile and
    // carried into whichever branch settles this fight, exactly like the clock above:
    // the duels that follow an injury spend it (win or lose), and a defeat inflicts or
    // refreshes it at its fixed duration and penalties. A bout that is abandoned never
    // reaches this handler, so it neither inflicts nor spends an injury.
    const injury = settleInjury(base, didWin).injury ?? null;

    if (didWin) {
      // Gold/NaN — BOTH sides are normalized. A save whose `gold` is missing or
      // corrupt used to make this sum `NaN`, which was then written into the profile and
      // persisted, so every gold readout (the hub header, the shop, the result screen's
      // "Purse Now") printed NaN from then on. `normalizeGold` is the one reader of a
      // purse (utils/currency.ts): an unusable stored value reads as 0, so a victory pays
      // its own purse instead of poisoning the save.
      const nextGold = normalizeGold(base.gold) + normalizeGold(stats.goldEarned);
      const nextFame = base.fame + stats.fameEarned;
      const nextXp = base.xp + stats.xpEarned;

      let nextLevel = base.level;
      let nextXpToNext = base.xpToNextLevel;
      let nextUnspentPoints = base.unspentStatPoints;

      if (nextXp >= nextXpToNext) {
        nextLevel += 1;
        nextXpToNext = Math.round(nextXpToNext * 1.5);
        nextUnspentPoints += 2;
      }

      const defeated = base.defeatedOpponentIds.includes(activeOpponent.id)
        ? base.defeatedOpponentIds
        : [...base.defeatedOpponentIds, activeOpponent.id];

      // The tier moves only on a boss's FIRST defeat — the boss's id newly entering
      // `defeatedOpponentIds` in this write. A rematch pays its rewards exactly as it
      // always did, but it proves nothing new, so it never opens the next tier (see
      // `utils/tierAdvancement.ts`: one boss could otherwise carry a gladiator through
      // tiers whose champions were never faced).
      const tierAfterVictory = resolveVictoryTier({
        currentTier: base.currentTier,
        opponent: activeOpponent,
        defeatedOpponentIds: base.defeatedOpponentIds,
      });

      const updatedProfile: PlayerProfile = {
        ...base,
        gold: nextGold,
        fame: nextFame,
        xp: nextXp,
        level: nextLevel,
        xpToNextLevel: nextXpToNext,
        unspentStatPoints: nextUnspentPoints,
        currentTier: tierAfterVictory.currentTier,
        defeatedOpponentIds: defeated,
        fightsWon: base.fightsWon + 1,
        peakCrowdHypeOverall: Math.max(base.peakCrowdHypeOverall, stats.crowdHypePeak),
        city,
        injury,
      };

      // L13A — the ref is written FIRST, so a second settlement arriving in the same
      // tick reads this one's result; ref, state and disk then receive the identical
      // object. A refused claim above returns before any of them is touched.
      const settledProfile = evaluateRituals(base, updatedProfile);
      profileRef.current = settledProfile;
      setProfile(settledProfile);
      saveProfile(settledProfile);
    } else {
      const updatedProfile: PlayerProfile = {
        ...base,
        fightsLost: base.fightsLost + 1,
        peakCrowdHypeOverall: Math.max(base.peakCrowdHypeOverall, stats.crowdHypePeak),
        city,
        injury,
      };
      const settledProfile = evaluateRituals(base, updatedProfile);
      profileRef.current = settledProfile;
      setProfile(settledProfile);
      saveProfile(settledProfile);
    }

    // L8 — the settled injury rides to the result screen with the outcome, so the
    // screen shows what the save now holds instead of inferring it from `didWin`.
    setDuelResult({ didWin, stats, injury });
  };

  const handleDuelResultDismiss = () => {
    setDuelResult(null);
    if (profile) enterCity(profile);
    else setCurrentScreen('city_3d');
  };

  /**
   * RG-3 — the Device Choosing panel's one write. `chooseBannerDevice` refuses a second
   * choice outright, so this can only ever set `road.bannerDevice` once.
   */
  const handleChooseBannerDevice = (device: BannerDevice) => {
    const base = profileRef.current ?? profile;
    if (!base) return;
    const chosen = chooseBannerDevice(base, device);
    setDeviceChoiceOpen(false);
    if (!chosen) return;
    profileRef.current = chosen;
    setProfile(chosen);
    saveProfile(chosen);
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
    const base = profileRef.current;
    if (!base) return;
    const result = purchaseRacingConfig(base, horses);
    if (!result.ok) return;
    profileRef.current = result.profile;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /** Select an unlocked team: free, and it only records the player's preference. */
  const handleSelectRacingConfig = (horses: ChariotTeamSize) => {
    const base = profileRef.current;
    if (!base) return;
    const result = selectRacingConfig(base, horses);
    if (!result.ok) return;
    profileRef.current = result.profile;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  // Profile mutations
  /**
   * Living City L5 — the ONE training transaction (`utils/trainingSession`)
   * decides the purse and the stat. It re-checks the day's schedule
   * (`utils/trainingSchedule`) and the cost against the profile it is handed, so
   * a drill that is resting today cannot be executed by calling this handler
   * directly, and a refusal leaves the profile untouched. Training never
   * advances the city day: only a settled duel, a rest at the medicus or a
   * night's lodging at the Caravanserai turns the clock.
   */
  const handleTrainStat = (stat: TrainingStat) => {
    const result = trainStat(profileRef.current, stat);
    if (!result.ok) return;
    const updated = result.profile;
    profileRef.current = updated;
    setProfile(updated);
    saveProfile(updated);
  };

  /**
   * Living City L9 — the ONE rest-and-recovery transaction (`utils/restRecovery`)
   * decides the purse, the wound and the day. It reads the newest committed
   * profile and re-checks every rule against it, so a refusal — already rested
   * today, nothing to treat, or a purse that cannot cover `25 × level` — leaves
   * the ref, React state and the saved profile exactly as they were and never
   * reaches `saveProfile`. On success the transaction has already turned the city
   * clock by exactly one day inside the same profile literal it returns, so this
   * handler saves that one profile and advances nothing itself.
   *
   * The result goes back to the city scene, which is what turns it into the
   * medicus's notice (the day it consumed and the gold it cost are in it).
   */
  const handleRest = (): RestResult => {
    const rest = restAtMedicalHouse(profileRef.current);
    if (!rest.ok) return rest;
    const rested = rest.profile;
    profileRef.current = rested;
    setProfile(rested);
    saveProfile(rested);
    return rest;
  };

  const handleBuyItem = (item: WeaponItem | ArmorItem) => {
    // Living City L4 — the ONE purchase transaction (`utils/storefrontPurchase`)
    // decides the purse, the day's offer (L3) and the Elite Merchant House's
    // single daily purchase, and returns a NEW profile or a refusal reason
    // without mutating anything. A refusal — insufficient gold, an item the day
    // does not list, or a merchant already used today — leaves the profile, its
    // gold and its purchase record exactly as they were. Buying never advances
    // the city day: only a settled duel, a rest at the medicus or a night's
    // lodging at the Caravanserai turns the clock.
    const base = profileRef.current;
    if (!base) return;
    const result = purchaseStorefrontItem(base, shopId, item.id);
    if (!result.ok) return;
    profileRef.current = result.profile;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  // P1 sell — the market buys a carried, unequipped item back for its
  // `sellPrice` plus 25 % of any temper gold spent on it.  The transaction is
  // pure: a refusal hands back the same profile object, so nothing is saved.
  const handleSellItem = (item: WeaponItem | ArmorItem) => {
    const base = profileRef.current;
    if (!base) return;
    const updated = sellItem(base, item.id);
    if (updated === base) return;
    profileRef.current = updated;
    setProfile(updated);
    saveProfile(updated);
  };

  const handleEquipWeapon = (wpn: WeaponItem) => {
    const base = profileRef.current;
    if (!base) return;
    const updated: PlayerProfile = {
      ...base,
      equipped: {
        ...base.equipped,
        weapon: wpn,
      },
    };
    profileRef.current = updated;
    setProfile(updated);
    saveProfile(updated);
  };

  const handleEquipArmor = (armor: ArmorItem) => {
    const base = profileRef.current;
    if (!base) return;
    const updated: PlayerProfile = {
      ...base,
      equipped: {
        ...base.equipped,
        [armor.slot]: armor,
      },
    };
    profileRef.current = updated;
    setProfile(updated);
    saveProfile(updated);
  };

  const handleAllocateStatPoint = (stat: 'strength' | 'agility' | 'stamina' | 'defense') => {
    const base = profileRef.current;
    if (!base || base.unspentStatPoints <= 0) return;
    sounds.playClick();
    const updated: PlayerProfile = {
      ...base,
      unspentStatPoints: base.unspentStatPoints - 1,
      baseStats: {
        ...base.baseStats,
        [stat]: base.baseStats[stat] + 1,
      },
    };
    profileRef.current = updated;
    setProfile(updated);
    saveProfile(updated);
  };

  const handleResetGame = () => {
    clearSavedProfile();
    // L13A — the newest-committed ref is cleared in the SAME tick as the save, so a
    // settlement callback that fires after a reset can never rebuild a deleted profile
    // from it (`handleMatchComplete` reads `profileRef.current ?? profile`).
    profileRef.current = null;
    setProfile(null);
    setCurrentScreen('title');
  };

  /**
   * Living City L11 — the ONE visitor encounter (`utils/visitorEncounter`).
   * Selecting a visitor is a meeting, and that is the only thing this records: it
   * writes `city.seenVisitors` — deduplicated, with every other profile and city
   * field carried across — and never `completedVisitors`, because the roadmap has
   * not defined what completes a visit. The transaction reads the newest committed
   * profile (`profileRef`), so a stale panel callback cannot overwrite newer state,
   * answers `recorded: false` for a visitor already met (no second save), and never
   * advances the city day or touches gold, inventory or progression.
   */
  const handleVisitorEncounter = (visitorId: string) => {
    const result = recordVisitorEncounter(profileRef.current, visitorId);
    if (!result.ok || !result.recorded) return;
    profileRef.current = result.profile;
    setProfile(result.profile);
    saveProfile(result.profile);
  };

  /**
   * Living City L12 — the ONE visitor purchase (`utils/visitorPurchase`).
   * The transaction re-resolves today's offer from the L10 schedule against the
   * newest committed profile (`profileRef`), so a stale panel selection cannot buy
   * something the visitor is not offering. On success gold, the granted item and
   * `completedVisitors` arrive in ONE profile, which is saved exactly once; the
   * completion entry makes a replayed callback (`already-completed`) refuse before
   * it can charge again. The result goes back to the panel, which uses it to tell
   * the player what happened; a refusal changes nothing.
   */
  const handleVisitorPurchase = (visitorId: string): VisitorPurchaseResult => {
    const result = purchaseVisitorOffer(profileRef.current, visitorId);
    if (!result.ok) return result;
    profileRef.current = result.profile;
    setProfile(result.profile);
    saveProfile(result.profile);
    return result;
  };

  /**
   * Living City L14 — the ONE night's lodging at the Caravanserai
   * (`utils/lodging`). It reads the newest committed profile and re-checks every
   * rule against it, so a refusal — a room already taken today, or a purse that
   * cannot cover `25 × level` — leaves the ref, React state and the saved profile
   * exactly as they were and never reaches `saveProfile`. On success the
   * transaction has already turned the city clock by exactly one day inside the
   * same profile literal it returns (and recorded `city.lodgingDay` beside it),
   * so this handler saves that one profile once and advances nothing itself. The
   * result goes back to the city scene, which turns it into the innkeeper's
   * notice; the injury slot is carried across untouched — lodging is not healing.
   */
  const handleLodging = (): LodgingResult => {
    const lodging = lodgeAtCaravanserai(profileRef.current);
    if (!lodging.ok) return lodging;
    const lodged = lodging.profile;
    profileRef.current = lodged;
    setProfile(lodged);
    saveProfile(lodged);
    return lodging;
  };

  /**
   * PLAY-1 — THE BACK BUTTON IS APP NAVIGATION, and this is the whole of its wiring.
   *
   * `overlayOpen` / `closeTopOverlay` are the topmost-first overlay chain: a back press
   * closes what is actually on top (the duel result card, then account deletion, then
   * settings, then the cloud-save panel, then the one-time banner choice) before it
   * touches the screen underneath. Each entry is the same state setter the overlay's
   * own close control calls, so back and the visible X can never disagree.
   *
   * `handleHistoryBack` is the screen step. The Ludus re-enters the city through the
   * city's own entry path and a finished race leaves through the race's own exit, so a
   * back press restores exactly what the screen's own button restores; everything else
   * is the plain screen change. `duelResult` is cleared on the way out so a dismissed
   * bout's card cannot reappear over the city.
   */
  const overlayOpen = duelResult !== null || deleteAccountOpen || settingsOpen || showDriveSync || deviceChoiceOpen;
  const closeTopOverlay = (): boolean => {
    if (duelResult) { handleDuelResultDismiss(); return true; }
    if (deleteAccountOpen) { setDeleteAccountOpen(false); return true; }
    if (settingsOpen) { setSettingsOpen(false); return true; }
    if (showDriveSync) { setShowDriveSync(false); return true; }
    if (deviceChoiceOpen) { setDeviceChoiceOpen(false); return true; }
    return false;
  };
  const handleHistoryBack = (target: GameScreen) => {
    if (target === 'city_3d') {
      if (currentScreen === 'race') { handleExitRace(); return; }
      if (currentScreen === 'hub_2d' && profile) { setDuelResult(null); enterCity(profile); return; }
    }
    setDuelResult(null);
    setCurrentScreen(target);
  };
  useBackNavigation({ screen: currentScreen, goTo: handleHistoryBack, overlayOpen, closeTopOverlay });

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
            onRest={handleRest}
            onLodging={handleLodging}
            onEncounterVisitor={handleVisitorEncounter}
            onPurchaseVisitor={handleVisitorPurchase}
            onOpenDriveSync={() => setShowDriveSync(true)}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            onReturnToMainMenu={() => setCurrentScreen('title')}
            isLeftyMode={isLeftyMode}
            onOpenSettings={() => handleOpenSettings()}
            initialPosition={oathBeatMode ? OATH_YARD_SPAWN.position : cityReturnPose?.position}
            initialRotationY={oathBeatMode ? OATH_YARD_SPAWN.rotationY : cityReturnPose?.rotationY}
            onStartRace={handleStartRace}
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
            onOpenDriveSync={() => setShowDriveSync(true)}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            onResetGame={handleResetGame}
            onOpenSettings={() => handleOpenSettings()}
            />
        )}

        {currentScreen === 'duel' && profile && (
          <LazySceneBoundary tier="arena">
          <React.Suspense fallback={<WaitSurface destination="arena" />}>
            <DuelScene
            playerProfile={profile}
            opponent={activeOpponent}
            onMatchComplete={(stats, didWin) => handleMatchComplete(stats, didWin, duelId)}
            onOpenArmory={() => handleOpenHubTab('tournament')}
            onOpenHelp={() => handleOpenSettings('controls', 'duel')}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            isLeftyMode={isLeftyMode}
            onOpenSettings={() => handleOpenSettings(undefined, 'duel')}
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
            injury={duelResult.injury}
            goldTotal={profile?.gold}
            onContinue={handleDuelResultDismiss}
            />
        )}

        {/* RG-3 — THE HERALD, and the one-time device choice. Both sit above every screen:
            a duel ends into the city, so a cry raised by the result has to outlive it. */}
        <HeraldToast cries={heraldCries} onDismiss={handleHeraldDismiss} />
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
