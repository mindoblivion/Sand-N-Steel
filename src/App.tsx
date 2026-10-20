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
import { AssetLoadingOverlay } from './components/ui/AssetLoadingOverlay';
import { googleSignIn } from './services/googleAuth';
import { facebookSignIn } from './services/facebookAuth';
import { appleSignIn } from './services/appleAuth';
import { microsoftSignIn } from './services/microsoftAuth';
import { listDriveSaves, loadProfileFromDrive } from './services/googleDrive';
import { ALL_OPPONENTS } from './data/opponents';
import { sounds } from './audio/soundEffects';
import { music } from './audio/musicEngine';
import { preloadCoreGameAssets } from './utils/preloadAssets';

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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.isMuted);
  const [isLeftyMode, setIsLeftyMode] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);

  // Load saved profile on boot
  useEffect(() => {
    try { music.init(sounds.getAudioContext()); } catch (e) {}

    const saved = loadSavedProfile();
    if (saved) {
      setProfile(saved);
      setIsLeftyMode(saved.isLeftyMode === true);
    } else {
      setIsLeftyMode(false);
    }
    preloadCoreGameAssets();
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

  const handleToggleLeftyMode = () => {
    sounds.playClick();
    const nextLefty = !isLeftyMode;
    setIsLeftyMode(nextLefty);
    if (profile) {
      const updated = { ...profile, isLeftyMode: nextLefty };
      setProfile(updated);
      saveProfile(updated);
    }
  };

  const handleToggleMute = () => {
    const muted = sounds.toggleMute();
    music.setMuted(muted);
    setIsMuted(muted);
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
          setIsLeftyMode(Boolean(cloudProfile.isLeftyMode));
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
    setIsLeftyMode(Boolean(newProfile.isLeftyMode));
    saveProfile(newProfile);
    // Spawns directly at the 3D Monumental Town Gate!
    setCurrentScreen('city_3d');
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

  return (
    <div className="w-full h-full min-h-[100dvh] bg-neutral-950 text-amber-100 overflow-hidden select-none">
        {/* 3D ASSET LOADING OVERLAY WITH DUAL GOLD SPINNER & PERCENTAGE */}
        <AssetLoadingOverlay />

        {/* GAME SCREENS */}
        {currentScreen === 'title' && (
            <TitleScreen
                savedProfile={profile}
                onContinueAdventure={handleContinueAdventure}
                onNewCharacter={handleNewCharacter}
                onOpenDriveSync={() => setShowDriveSync(true)}
                onToggleMute={handleToggleMute}
                isMuted={isMuted}
                onOpenSettings={() => setShowSettingsModal(true)}
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
            />
        )}

        {currentScreen === 'city_3d' && profile && (
          <React.Suspense fallback={<div className="w-full h-screen flex items-center justify-center bg-neutral-950 text-amber-500 font-serif text-xl animate-pulse">Loading City Hub...</div>}>
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
            onOpenSettings={() => setShowSettingsModal(true)}
            initialPosition={cityReturnPose?.position}
            initialRotationY={cityReturnPose?.rotationY}
            onStartRace={handleStartRace}
            />
          </React.Suspense>
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
            onOpenSettings={() => setShowSettingsModal(true)}
            />
        )}

        {currentScreen === 'duel' && profile && (
          <React.Suspense fallback={<div className="w-full h-screen flex items-center justify-center bg-neutral-950 text-amber-500 font-serif text-xl animate-pulse">Entering Arena...</div>}>
            <DuelScene
            playerProfile={profile}
            opponent={activeOpponent}
            onMatchComplete={handleMatchComplete}
            onOpenArmory={() => handleOpenHubTab('tournament')}
            onOpenHelp={() => setShowSettingsModal(true)}
            onToggleMute={handleToggleMute}
            isMuted={isMuted}
            isLeftyMode={isLeftyMode}
            onOpenSettings={() => setShowSettingsModal(true)}
            />
          </React.Suspense>
        )}

        {currentScreen === 'race' && (
          <React.Suspense fallback={<div className="w-full h-screen flex items-center justify-center bg-neutral-950 text-amber-500 font-serif text-xl animate-pulse">Entering the Circus...</div>}>
            <RaceScene onAbort={handleExitRace} isLeftyMode={isLeftyMode} />
          </React.Suspense>
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

        {/* GAME SETTINGS MODAL */}
        <SettingsModal
            isOpen={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            isLeftyMode={isLeftyMode}
            onToggleLeftyMode={handleToggleLeftyMode}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onResetGame={handleResetGame}
        />

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
