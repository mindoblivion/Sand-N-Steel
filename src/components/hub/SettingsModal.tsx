import React from 'react';
import { Settings, Shield, Volume2, VolumeX, Swords, RotateCcw, Sparkles, Check, Move } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLeftyMode: boolean;
  onToggleLeftyMode: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onResetGame?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isLeftyMode,
  onToggleLeftyMode,
  isMuted,
  onToggleMute,
  onResetGame,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl animate-fadeIn text-amber-100 relative overflow-hidden">
        {/* TOP ACCENT LINE */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-600"></div>

        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-300">
              <Settings className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h3 className="font-serif font-black text-xl text-amber-200 uppercase tracking-wider">
                Game Settings
              </h3>
              <p className="text-[11px] text-amber-400/80 font-mono">
                Preferences &amp; Combat Configuration
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-amber-200 flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* SETTINGS OPTIONS */}
        <div className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* LEFTY MODE (HANDEDNESS) OPTION */}
          <div className="bg-neutral-950/90 border-2 border-amber-600/50 rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Swords className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-serif font-black text-sm sm:text-base text-amber-100 flex items-center gap-2">
                    <span>Lefty Mode</span>
                    {isLeftyMode && (
                      <span className="text-[9px] bg-amber-500 text-neutral-950 px-2 py-0.5 rounded-full font-sans font-bold uppercase">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400 font-sans mt-0.5">
                    {isLeftyMode
                      ? 'Left-Handed Stance: Weapon in Left Hand • Shield in Right'
                      : 'Right-Handed Stance (Default): Weapon in Right Hand • Shield in Left'}
                  </div>
                </div>
              </div>

              {/* SWITCHABLE TOGGLE BUTTON */}
              <button
                onClick={() => {
                  sounds.playClick();
                  onToggleLeftyMode();
                }}
                className={`relative w-16 h-9 rounded-full p-1 transition-colors duration-300 cursor-pointer shrink-0 border ${
                  isLeftyMode
                    ? 'bg-amber-500 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                    : 'bg-neutral-800 border-neutral-700'
                }`}
                title="Toggle Lefty Mode Stance"
              >
                <div
                  className={`w-7 h-7 rounded-full bg-neutral-950 border border-amber-300 flex items-center justify-center font-serif font-bold text-[10px] text-amber-300 transition-transform duration-300 shadow-md ${
                    isLeftyMode ? 'translate-x-7 bg-neutral-950 text-amber-200' : 'translate-x-0 text-neutral-400'
                  }`}
                >
                  {isLeftyMode ? 'L' : 'R'}
                </div>
              </button>
            </div>

            <div className="bg-neutral-900/80 rounded-xl p-2.5 border border-neutral-800 text-[11px] text-amber-300/80 font-serif leading-relaxed">
              💡 <strong className="text-amber-200">Tip:</strong> In Lefty Mode, gladiators hold their primary blade or weapon with their left hand, and raise the shield with their right hand.
            </div>
          </div>

          {/* AUDIO MUTE TOGGLE */}
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-2xl p-4 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-neutral-800 text-amber-400 border border-neutral-700">
                {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-amber-400" />}
              </div>
              <div>
                <div className="font-serif font-bold text-sm text-amber-100">
                  Game Audio &amp; Sound FX
                </div>
                <div className="text-[11px] text-neutral-400 font-sans">
                  {isMuted ? 'Muted' : 'Enabled (Swords, Strikes, Crowd Hype & Ambient)'}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                onToggleMute();
              }}
              className={`px-4 py-2 rounded-xl font-serif text-xs font-bold uppercase tracking-wider cursor-pointer transition-all ${
                isMuted
                  ? 'bg-red-950/80 border border-red-500/50 text-red-300'
                  : 'bg-amber-500/20 border border-amber-500/50 text-amber-200 hover:bg-amber-500/30'
              }`}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>

          {/* CONTROLS & JOYSTICK INFO */}
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-2xl p-4 flex flex-col gap-2 shadow-lg">
            <div className="flex items-center gap-2 font-serif font-bold text-sm text-amber-300">
              <Move className="w-4 h-4 text-amber-400" />
              <span>Touch &amp; Movement Calibration</span>
            </div>
            <div className="text-[11px] text-neutral-300 font-sans leading-relaxed space-y-1">
              <p>• <strong className="text-amber-200">Mobile Joystick:</strong> Standardized left/right &amp; forward/back response (Inversion corrected).</p>
              <p>• <strong className="text-amber-200">Gladiator Pace:</strong> Grounded, controlled stride with smooth camera yaw damping.</p>
              <p>• <strong className="text-amber-200">PC Controls:</strong> WASD / Arrow Keys to move, E or Space to Interact / Primary Action, Tactical Action Panel in Arena Combat.</p>
            </div>
          </div>

          {/* RESET / NEW GAME BUTTON (IF AVAILABLE) */}
          {onResetGame && (
            <div className="bg-red-950/30 border border-red-900/50 rounded-2xl p-4 flex justify-between items-center mt-2">
              <div>
                <div className="font-serif font-bold text-xs text-red-300">
                  Reset Saved Game Data
                </div>
                <div className="text-[10px] text-neutral-400 font-sans">
                  Clear profile &amp; start a new legend from scratch.
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to reset your saved gladiator? This cannot be undone.')) {
                    onResetGame();
                    onClose();
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-red-900/80 hover:bg-red-800 border border-red-500/60 text-red-100 font-serif text-xs font-bold uppercase cursor-pointer"
              >
                Reset Data
              </button>
            </div>
          )}
        </div>

        {/* FOOTER BUTTON */}
        <div className="mt-6 pt-4 border-t border-neutral-800 flex justify-end">
          <button
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs uppercase tracking-wider shadow-xl cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4 text-neutral-950" />
            <span>Apply &amp; Return</span>
          </button>
        </div>
      </div>
    </div>
  );
};
