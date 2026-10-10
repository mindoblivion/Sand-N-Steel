import React, { useRef, useState } from 'react';
import { Swords, Shield, Zap, Wind } from 'lucide-react';

interface TouchControlsProps {
  onMove: (dx: number, dz: number) => void;
  onLightAttack: () => void;
  onHeavyAttack: () => void;
  onStartBlock: () => void;
  onEndBlock: () => void;
  onDodge: () => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onMove,
  onLightAttack,
  onHeavyAttack,
  onStartBlock,
  onEndBlock,
  onDodge,
}) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const touchIdRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    setIsDragging(true);
    handleTouchMove(e);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!joystickRef.current || touchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        const rect = joystickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;

        const maxDist = rect.width * 0.42;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }

        setKnobPos({ x: dx, y: dy });

        const normX = dx / maxDist;
        const normZ = dy / maxDist;
        onMove(normX, normZ);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setIsDragging(false);
        setKnobPos({ x: 0, y: 0 });
        onMove(0, 0);
        break;
      }
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex justify-between items-end p-2.5 sm:p-6 md:p-8 select-none pb-[max(0.75rem,env(safe-area-inset-bottom))] px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
      {/* VIRTUAL JOYSTICK (BOTTOM-LEFT) */}
      <div className="pointer-events-auto touch-none flex flex-col items-center shrink-0">
        <div
          ref={joystickRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="w-[min(7.5rem,28vw)] h-[min(7.5rem,28vw)] sm:w-36 sm:h-36 rounded-full bg-neutral-950/60 border-2 border-amber-600/40 relative flex items-center justify-center backdrop-blur-md shadow-2xl active:border-amber-400"
        >
          <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-amber-500/40"></div>
          <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-amber-500/40"></div>
          <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-amber-500/40"></div>
          <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-amber-500/40"></div>

          <div
            className={`w-[min(3.2rem,12vw)] h-[min(3.2rem,12vw)] sm:w-16 sm:h-16 rounded-full bg-gradient-to-b from-amber-500 to-amber-700 border-2 border-amber-300 shadow-lg flex items-center justify-center transition-transform ${
              isDragging ? 'scale-105 shadow-amber-500/40' : ''
            }`}
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          >
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-200/80"></div>
          </div>
        </div>
        <span className="text-[9px] sm:text-[10px] font-mono text-amber-400/60 mt-0.5 sm:mt-1 uppercase tracking-wider">Move</span>
      </div>

      {/* COMBAT ACTION BUTTONS (BOTTOM-RIGHT FLEXIBLE WRAPPER) */}
      <div className="pointer-events-auto touch-none flex flex-col items-end gap-2 sm:gap-2.5 shrink-0 max-w-[55vw]">
        {/* TOP ROW: DODGE & HEAVY ATTACK */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button
            onTouchStart={(e) => { e.preventDefault(); onDodge(); }}
            onClick={onDodge}
            className="w-[min(3.4rem,13vw)] h-[min(3.4rem,13vw)] sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-purple-800 to-indigo-900 border-2 border-purple-400 text-purple-100 flex flex-col items-center justify-center shadow-xl active:scale-90 transition-transform cursor-pointer shrink-0"
            title="Dodge (Space)"
          >
            <Wind className="w-4 h-4 sm:w-6 sm:h-6" />
            <span className="text-[8px] sm:text-[9px] font-mono font-bold tracking-tight">DODGE</span>
          </button>

          <button
            onTouchStart={(e) => { e.preventDefault(); onHeavyAttack(); }}
            onClick={onHeavyAttack}
            className="w-[min(3.6rem,14vw)] h-[min(3.6rem,14vw)] sm:w-18 sm:h-18 rounded-full bg-gradient-to-br from-red-600 to-rose-900 border-2 border-rose-300 text-white flex flex-col items-center justify-center shadow-xl active:scale-90 transition-transform cursor-pointer shrink-0"
            title="Heavy Attack (K)"
          >
            <Zap className="w-5 h-5 sm:w-7 sm:h-7 text-yellow-300" />
            <span className="text-[8px] sm:text-[9px] font-mono font-bold tracking-tight">HEAVY</span>
          </button>
        </div>

        {/* BOTTOM ROW: BLOCK & LIGHT ATTACK */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button
            onTouchStart={(e) => { e.preventDefault(); onStartBlock(); }}
            onTouchEnd={(e) => { e.preventDefault(); onEndBlock(); }}
            onMouseDown={onStartBlock}
            onMouseUp={onEndBlock}
            onMouseLeave={onEndBlock}
            className="w-[min(3.4rem,13vw)] h-[min(3.4rem,13vw)] sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-blue-700 to-slate-900 border-2 border-blue-400 text-blue-100 flex flex-col items-center justify-center shadow-xl active:scale-90 transition-transform cursor-pointer shrink-0"
            title="Block (Shift)"
          >
            <Shield className="w-4 h-4 sm:w-6 sm:h-6 text-cyan-300" />
            <span className="text-[8px] sm:text-[9px] font-mono font-bold tracking-tight">BLOCK</span>
          </button>

          <button
            onTouchStart={(e) => { e.preventDefault(); onLightAttack(); }}
            onClick={onLightAttack}
            className="w-[min(4.0rem,15vw)] h-[min(4.0rem,15vw)] sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-500 to-orange-700 border-2 border-yellow-300 text-neutral-950 flex flex-col items-center justify-center shadow-2xl active:scale-90 transition-transform cursor-pointer shrink-0"
            title="Light Attack (J / Left Click)"
          >
            <Swords className="w-5 h-5 sm:w-8 sm:h-8 text-neutral-950" />
            <span className="text-[9px] sm:text-[10px] font-serif font-black tracking-wider">ATTACK</span>
          </button>
        </div>
      </div>
    </div>
  );
};
