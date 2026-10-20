import React, { useState, useEffect } from 'react';
import { PlayerProfile, OpponentConfig, DuelStatistics, WeaponItem, ArmorItem, ChariotTeamSize } from './types/game';
import { loadSavedProfile, saveProfile, clearSavedProfile, createNewProfile, calculateTotalStats } from './services/storage';
import { TitleScreen } from './components/hub/TitleScreen';
import { CharacterCreation } from './components/hub/CharacterCreation';
const CityHubScene = React.lazy(() => import('./components/3d/city/CityHubScene').then((m) => ({ default: m.CityHubScene })));
import { GladiatorSchoolHub } from './components/hub/GladiatorSchoolHub';
import type { GearView } from './components/hub/GearTab';
import { purchaseChariotPart, equipChariotPart } from './utils/chariotLoadout';
import { purchaseRacingConfig, selectRacingConfig } from './utils/racingProgression';
const DuelScene = React.lazy(() => import('./components/duel/DuelScene').then((m) => ({ default: m.DuelScene })));
// Phase C-8.70B Stage 1, Slice 1 — the race scene, reached exactly the way the
// city hub and the duel arena are: one more screen value, one more lazy import
// and one more conditional render. No router and no second scene manager.
const RaceScene = React.lazy(() => import('./components/3d/RaceScene').then((m) => ({ default: m.RaceScene })));
import { DuelResultModal } from './components/hub/DuelResultModal';
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
import { googleSignIn, subscribeAuthUser } from './services/googleAuth';
import type { User } from 'firebase/auth';
import { DeleteAccountModal } from './components/hub/DeleteAccountModal';
import { facebookSignIn } from './services/facebookAuth';
import { appleSignIn } from './services/appleAuth';
import { microsoftSignIn } from './services/microsoftAuth';
import { listDriveSaves, loadProfileFromDrive } from './services/googleDrive';
import { ALL_OPPONENTS } from './data/opponents';
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
  const [activeHubTab, setActiveHubTab] = useState<'tournament' | 'training' | 'shop' | 'gear' | 'stats'>('tournament');
  // Phase C-8.66B: the Armory's own subview. The Imperial Stable's city
  // interaction opens the gear tab with this set to 'chariot'; the tab's own
  // switch flips it back to the gear list.
  const [gearView, setGearView] = useState<GearView>('armory');
  // Phase C-8.70B Stage 1, Slice 1 — where the city must put the player back
  // after a race. Set when the race is entered, read when the city remounts,
  // in memory only.
  const [cityReturnPose, setCityReturnPose] = useState<CityExitPose | null>(null);
  const [duelResult, setDuelResult] = useState<{ didWin: boolean; stats: DuelStatistics } | null>(null);
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

  const handleContinueAdventure = () => {
    if (!profile) return;
    sounds.playClick();
    setCurrentScreen('city_3d');
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
          setCurrentScreen('city_3d');
        }
      } else {
        // No cloud save yet. If a local profile already exists, continue
        // that gladiator — don't send a returning player to character creation.
        if (profile) {
          setCurrentScreen('city_3d');
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
        setCurrentScreen('city_3d');
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
        setCurrentScreen('city_3d');
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
        setCurrentScreen('city_3d');
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
      setCurrentScreen('city_3d');
    } else {
      setCurrentScreen('create_character');
    }
  };

  const handleCharacterCreated = (newProfile: PlayerProfile) => {
    sounds.playClick();
    setProfile(newProfile);
    saveProfile(newProfile);
    // Spawns directly at the 3D Monumental Town Gate!
    setCurrentScreen('city_3d');
    // The Oath has just been sworn: offer the once-a-session save-progress nudge.
    postOathNudge.offer();
  };

  const handleEnterDuel = (opp: OpponentConfig) => {
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
    setCurrentScreen('city_3d');
  };

  const handleOpenHubTab = (
    tab: 'tournament' | 'training' | 'shop' | 'gear' | 'stats',
    gearSubview?: GearView
  ) => {
    setActiveHubTab(tab);
    if (tab === 'gear') setGearView(gearSubview ?? 'armory');
    setCurrentScreen('hub_2d');
  };

  /**
   * Phase C-8.66B — buy a chariot part with the player's existing gold.
   * `purchaseChariotPart` is pure and re-checks every rule (ownership, price,
   * unknown id), so a rejected buy leaves gold, ownership and the equipped
   * choice exactly as they were and never reaches `saveProfile`.
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

      const defeated = profile.defeatedOpponentIds.includes(activeOpponent.id)
        ? profile.defeatedOpponentIds
        : [...profile.defeatedOpponentIds, activeOpponent.id];

      // Advance tier if boss is defeated
      let nextTier = profile.currentTier;
      if (activeOpponent.isBoss && nextTier < 4) {
        nextTier += 1;
      }

      const updatedProfile: PlayerProfile = {
        ...profile,
        gold: nextGold,
        fame: nextFame,
        xp: nextXp,
        level: nextLevel,
        xpToNextLevel: nextXpToNext,
        unspentStatPoints: nextUnspentPoints,
        currentTier: nextTier,
        defeatedOpponentIds: defeated,
        fightsWon: profile.fightsWon + 1,
        peakCrowdHypeOverall: Math.max(profile.peakCrowdHypeOverall, stats.crowdHypePeak),
      };

      setProfile(updatedProfile);
      saveProfile(updatedProfile);
    } else {
      const updatedProfile: PlayerProfile = {
        ...profile,
        fightsLost: profile.fightsLost + 1,
        peakCrowdHypeOverall: Math.max(profile.peakCrowdHypeOverall, stats.crowdHypePeak),
      };
      setProfile(updatedProfile);
      saveProfile(updatedProfile);
    }

    setDuelResult({ didWin, stats });
  };

  const handleDuelResultDismiss = () => {
    setDuelResult(null);
    setCurrentScreen('city_3d');
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
    const cost = 25 * profile.level;
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

  const handleBuyItem = (item: WeaponItem | ArmorItem) => {
    if (!profile || profile.gold < item.price) return;

    const updated: PlayerProfile = {
      ...profile,
      gold: profile.gold - item.price,
      inventory: [...profile.inventory, item],
    };
    setProfile(updated);
    saveProfile(updated);
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
          <LazySceneBoundary tier="city">
          <React.Suspense fallback={<WaitSurface destination="city_hub" />}>
            <CityHubScene
            playerProfile={profile}
            activeOpponent={activeOpponent}
            onOpenTab={handleOpenHubTab}
            onEnterDuel={handleEnterDuel}
            onOpenDriveSync={() => setShowDriveSync(true)}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            onReturnToMainMenu={() => setCurrentScreen('title')}
            isLeftyMode={isLeftyMode}
            onOpenSettings={() => handleOpenSettings()}
            initialPosition={cityReturnPose?.position}
            initialRotationY={cityReturnPose?.rotationY}
            onStartRace={handleStartRace}
            />
          </React.Suspense>
          </LazySceneBoundary>
        )}

        {currentScreen === 'hub_2d' && profile && (
            <GladiatorSchoolHub
            playerProfile={profile}
            activeTab={activeHubTab}
            onTabChange={setActiveHubTab}
            onEnterCity3D={() => setCurrentScreen('city_3d')}
            onSelectOpponent={handleEnterDuel}
            onTrainStat={handleTrainStat}
            onBuyItem={handleBuyItem}
            onEquipWeapon={handleEquipWeapon}
            onEquipArmor={handleEquipArmor}
            gearView={gearView}
            onGearViewChange={setGearView}
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
            onMatchComplete={handleMatchComplete}
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
            onContinue={handleDuelResultDismiss}
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
                setCurrentScreen('city_3d');
            }}
            onClose={() => setShowDriveSync(false)}
            />
        )}
    </div>
  );
}

export default App;
