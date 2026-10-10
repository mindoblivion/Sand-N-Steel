import React from 'react';
import {
  HelpCircle,
  Swords,
  Shield,
  Zap,
  Flame,
  Footprints,
  BatteryCharging,
  Compass,
} from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl animate-fadeIn text-amber-100 flex flex-col max-h-[85vh]">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h3 className="font-serif font-black text-xl text-amber-200 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-amber-400" />
            <span>Tactical Combat Manual</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-amber-200 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* SCROLLABLE MANUAL BODY */}
        <div className="flex flex-col gap-3.5 text-xs font-serif text-neutral-300 overflow-y-auto pr-1 mb-5">
          {/* COMBAT FLOW & WEAPON RANGE OVERVIEW */}
          <div className="bg-neutral-950/90 p-3.5 rounded-2xl border border-amber-800/60 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold font-serif text-xs">
              <Compass className="w-4 h-4 text-amber-400" />
              <span>Turn Structure &amp; Weapon Reach</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-300">
              Combat proceeds in alternating tactical turns. Choose your command, watch the strike resolve, and prepare for the opponent&apos;s response.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono mt-1 pt-2 border-t border-amber-950">
              <div className="bg-neutral-900/80 p-2 rounded-xl border border-amber-900/40">
                <strong className="text-amber-200 block mb-0.5">Standard Blades:</strong>
                <span className="text-neutral-400">2.5m effective reach</span>
              </div>
              <div className="bg-neutral-900/80 p-2 rounded-xl border border-amber-900/40">
                <strong className="text-amber-200 block mb-0.5">Hoplite Spears:</strong>
                <span className="text-cyan-300">3.8m extended reach</span>
              </div>
            </div>
            <p className="text-[10px] text-amber-400/90 font-mono">
              💡 If outside weapon reach, use Advance (+1.8m) to close distance before striking.
            </p>
          </div>

          {/* TACTICAL ACTIONS LIST */}
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/90 font-bold px-1">
            Tactical Commands
          </div>

          {/* 1. Quick Strike */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-700/50 text-amber-400 shrink-0">
              <Swords className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <strong className="text-amber-200 text-xs">Quick Strike</strong>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/60">
                  Cost: 10 SP
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Fast, reliable light attack with high hit probability. Requires target to be in weapon range.
              </p>
            </div>
          </div>

          {/* 2. Power Slash */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-red-950/60 border border-red-700/50 text-rose-400 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <strong className="text-rose-200 text-xs">Power Slash</strong>
                <span className="text-[10px] font-mono text-rose-300 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-800/60">
                  Cost: 22 SP
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Heavy, punishing attack with 25% critical-hit chance. Requires target to be in weapon range.
              </p>
            </div>
          </div>

          {/* 3. Shield Guard */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-700/50 text-cyan-400 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <strong className="text-cyan-200 text-xs">Shield Guard</strong>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/60">
                  Restores: 12 SP
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Raise your scutum to reduce incoming damage by 75% on the opponent&apos;s next strike while recovering stamina.
              </p>
            </div>
          </div>

          {/* 4. Arena Taunt */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-700/50 text-purple-400 shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <strong className="text-purple-200 text-xs">Arena Taunt</strong>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-800/60">
                  Restores: 25 SP
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Rally the colosseum spectators! Restores 25 SP and increases crowd hype favor by +20.
              </p>
            </div>
          </div>

          {/* 5. Advance */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-700/50 text-amber-300 shrink-0">
              <Footprints className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <strong className="text-amber-200 text-xs">Advance (+1.8m)</strong>
                <span className="text-[10px] font-mono text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/60">
                  Restores: 10 SP
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Close in 1.8m toward your opponent to enter weapon strike range while recovering 10 SP.
              </p>
            </div>
          </div>

          {/* 6. Retreat */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-400 shrink-0">
              <Footprints className="w-4 h-4 rotate-180" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <strong className="text-neutral-200 text-xs">Retreat (-1.8m)</strong>
                <span className="text-[10px] font-mono text-neutral-300 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-700">
                  Restores: 10 SP
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Backstep 1.8m away from enemy reach to create breathing room while recovering 10 SP.
              </p>
            </div>
          </div>

          {/* 7. Catch Breath */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-700/50 text-emerald-400 shrink-0">
              <BatteryCharging className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <strong className="text-emerald-200 text-xs">Catch Breath</strong>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/60">
                  Restores: 40 SP
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Take a deep breath and regain composure to restore +40 Stamina.
              </p>
            </div>
          </div>
        </div>

        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-all shadow-xl shrink-0"
        >
          Understood, Return to Arena
        </button>
      </div>
    </div>
  );
};

