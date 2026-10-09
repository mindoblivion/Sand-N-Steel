import React, { useState, useEffect } from 'react';
import { PlayerProfile, OpponentConfig, DuelStatistics, WeaponItem, ArmorItem } from './types/game';
import { loadSavedProfile, saveProfile, clearSavedProfile, createNewProfile, calculateTotalStats } from './services/storage';
import { TitleScreen } from './components/hub/TitleScreen';
import { CharacterCreation } from './components/hub/CharacterCreation';
const CityHubScene = React.lazy(() => import('./components/3d/city/CityHubScene').then((m) => ({ default: m.CityHubScene })));
import { GladiatorSchoolHub } from './components/hub/GladiatorSchoolHub';
const DuelScene = React.lazy(() => import('./components/duel/DuelScene').then((m) => ({ default: m.DuelScene })));
import { DuelResultModal } from './components/hub/DuelResultModal';
import { GoogleDriveSyncModal } from './components/hub/GoogleDriveSyncModal';
import { SettingsModal } from './components/hub/SettingsModal';
import { AssetLoadingOverlay } from './components/ui/AssetLoadingOverlay';
import { ALL_OPPONENTS } from './data/opponents';
import { sounds } from './audio/soundEffects';
import { music } from './audio/musicEngine';
import { preloadCoreGameAssets } from './utils/preloadAssets';

type GameScreen = 'title' | 'create_character' | 'city_3d' | 'hub_2d' | 'duel';

export function App() {
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('title');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [activeOpponent, setActiveOpponent] = useState<OpponentConfig>(ALL_OPPONENTS[0]);
  const [activeHubTab, setActiveHubTab] = useState<'tournament' | 'training' | 'shop' | 'gear' | 'stats'>('tournament');
  const [duelResult, setDuelResult] = useState<{ didWin: boolean; stats: DuelStatistics } | null>(null);
  const [showDriveSync, setShowDriveSync] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.isMuted);
  const [isLeftyMode, setIsLeftyMode] = useState(false);

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

  const handleOpenHubTab = (tab: 'tournament' | 'training' | 'shop' | 'gear' | 'stats') => {
    setActiveHubTab(tab);
    setCurrentScreen('hub_2d');
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
      };

      setProfile(updatedProfile);
      saveProfile(updatedProfile);
    } else {
      const updatedProfile: PlayerProfile = {
        ...profile,
        fightsLost: profile.fightsLost + 1,
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
    <div className="w-full h-full min-h-screen bg-neutral-950 text-amber-100 overflow-hidden select-none">
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
            />
        )}

        {currentScreen === 'create_character' && (
            <CharacterCreation
            onComplete={handleCharacterCreated}
            onCancel={() => setCurrentScreen('title')}
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
            onToggleLeftyMode={handleToggleLeftyMode}
            onOpenSettings={() => setShowSettingsModal(true)}
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
            onToggleLeftyMode={handleToggleLeftyMode}
            onOpenSettings={() => setShowSettingsModal(true)}
            />
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
