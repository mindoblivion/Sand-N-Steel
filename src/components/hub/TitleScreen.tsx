import React, { useState, useEffect } from 'react';
import { PlayerProfile } from '../../types/game';
import { sounds } from '../../audio/soundEffects';
import { preloadCoreGameAssets } from '../../utils/preloadAssets';

interface TitleScreenProps {
  savedProfile: PlayerProfile | null;
  onContinueAdventure: () => void;
  onNewCharacter: () => void;
  onOpenDriveSync: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onOpenSettings?: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  savedProfile,
  onContinueAdventure,
  onNewCharacter,
  onOpenDriveSync,
  onToggleMute,
  isMuted,
  onOpenSettings,
}) => {
  const [hasStarted, setHasStarted] = useState(false);

  const handleStart = async () => {
    if (hasStarted) return;
    
    // Attempt fullscreen. Orientation is left to the device's own controls.
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      // Graceful fail
    }

    sounds.playClick();
    preloadCoreGameAssets();
    setHasStarted(true);
    
    // Proceed into game
    if (savedProfile) onContinueAdventure();
    else onNewCharacter();
  };

  useEffect(() => {
    const handleInput = (e: KeyboardEvent | MouseEvent | TouchEvent) => {
        if (!hasStarted && (e.type === 'click' || e.type === 'touchstart' || (e instanceof KeyboardEvent && (e.key === 'Enter' || e.key === ' ')))) {
            handleStart();
        }
    };
    window.addEventListener('click', handleInput);
    window.addEventListener('keydown', handleInput);
    window.addEventListener('touchstart', handleInput);
    return () => {
        window.removeEventListener('click', handleInput);
        window.removeEventListener('keydown', handleInput);
        window.removeEventListener('touchstart', handleInput);
    };
  }, [hasStarted]);

  return (
    <div
      onClick={handleStart}
      className="relative w-full h-full min-h-screen flex flex-col items-center justify-center overflow-hidden cursor-pointer"
      style={{
        backgroundImage: 'url(/title_screen.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
        {/* The artwork contains "SAND & STEEL" and "PRESS TO START" */}
        <div className="absolute inset-0 bg-black/20 hover:bg-black/10 transition-colors duration-500"></div>
    </div>
  );
};
