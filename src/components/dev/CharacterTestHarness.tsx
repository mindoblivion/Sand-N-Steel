import React, { useState, useEffect, Suspense } from 'react';
import { PlayerProfile, DuelStatistics } from '../../types/game';
import { CharacterCreation } from '../hub/CharacterCreation';
import { AssetLoadingOverlay } from '../ui/AssetLoadingOverlay';
import { ALL_OPPONENTS } from '../../data/opponents';
import { sounds } from '../../audio/soundEffects';
import { music } from '../../audio/musicEngine';
import { preloadCoreGameAssets } from '../../utils/preloadAssets';

// DuelScene is a heavy 3D scene — load it on demand, mirroring App.tsx's React.lazy.
const DuelScene = React.lazy(() =>
  import('../duel/DuelScene').then((m) => ({ default: m.DuelScene })),
);

/**
 * CharacterTestHarness — DEVELOPMENT-ONLY test screen (Phase 4).
 *
 * Reachable ONLY when `src/main.tsx` detects the exact `?devHarness=character`
 * query parameter in a Vite dev build (`import.meta.env.DEV`). In that mode main
 * mounts this component INSTEAD OF `<App />`, so the title screen, the save
 * loader, the city hub and every normal navigation/persistence path never run.
 *
 * Purpose: exercise the real `CharacterCreation` preview and a live `DuelScene`
 * with an in-memory profile (e.g. Dimachaerus) without passing through the
 * GPU-heavy 3D city hub and without touching the player's real save.
 *
 * Persistence isolation:
 *   - This module imports NO function that writes to localStorage, sessionStorage,
 *     IndexedDB, or Google Drive. It imports only: CharacterCreation (pure
 *     callbacks), DuelScene (pure callbacks + the read-only `calculateTotalStats`
 *     it imports itself), ALL_OPPONENTS (data), sounds/music (audio), and the
 *     preload helper (Drei cache).
 *   - The profile built by CharacterCreation is held in component state only.
 *   - `onComplete` from CharacterCreation is wired to this harness's state setter,
 *     NOT to App's `handleCharacterCreated` (which calls `saveProfile`).
 *   - DuelScene callbacks are local; none reach App's save/transition handlers.
 *
 * Removal: delete this file and revert the `?devHarness=character` branch in
 * `src/main.tsx` (the import + the conditional). No other file references it.
 */
type HarnessStage = 'create' | 'ready' | 'duel' | 'result';

export const CharacterTestHarness: React.FC = () => {
  // Self-guard: belt-and-suspenders so a stale import can never render in prod.
  if (!import.meta.env.DEV) return null;

  const [stage, setStage] = useState<HarnessStage>('create');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [duelResult, setDuelResult] = useState<{ didWin: boolean; stats: DuelStatistics } | null>(null);
  const [isMuted, setIsMuted] = useState(sounds.isMuted);
  const [isLeftyMode, setIsLeftyMode] = useState(false);

  // Match App's boot side-effects for audio/asset parity (no save load here).
  useEffect(() => {
    try { music.init(sounds.getAudioContext()); } catch (e) { /* ignore */ }
    preloadCoreGameAssets();
  }, []);

  // Keep music in sync with the current stage, like App's music router (no storage).
  useEffect(() => {
    if (stage === 'duel') music.play(ALL_OPPONENTS[0].isBoss ? 'boss_final' : 'arena_combat');
    else music.stop();
  }, [stage]);

  const handleToggleMute = () => {
    const muted = sounds.toggleMute();
    music.setMuted(muted);
    setIsMuted(muted);
  };

  const handleCharacterCreated = (newProfile: PlayerProfile) => {
    sounds.playClick();
    setProfile(newProfile);
    setIsLeftyMode(Boolean(newProfile.isLeftyMode));
    setStage('ready');
  };

  const handleMatchComplete = (stats: DuelStatistics, didWin: boolean) => {
    setDuelResult({ didWin, stats });
    setStage('result');
  };

  const Banner = () => (
    <div
      data-testid="harness-banner"
      className="fixed top-0 inset-x-0 z-[100] bg-fuchsia-900/95 border-b border-fuchsia-400/60 text-fuchsia-100 text-center text-[11px] sm:text-xs font-mono py-1.5 px-2 tracking-wider select-none pointer-events-none"
    >
      DEVELOPMENT TEST HARNESS — NOTHING IS SAVED
    </div>
  );

  return (
    <div className="w-full h-full min-h-screen bg-neutral-950 text-amber-100 overflow-hidden select-none">
      <Banner />
      <AssetLoadingOverlay />

      <input data-testid="harness-stage" type="hidden" value={stage} readOnly />

      {stage === 'create' && (
        <div className="pt-7 h-full">
          <CharacterCreation
            onComplete={handleCharacterCreated}
            onCancel={() => { /* Exit the dev harness by loading the normal app without the query param. */ window.location.href = '/'; }}
          />
        </div>
      )}

      {stage === 'ready' && profile && (
        <div className="pt-7 h-full flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-900/80 border border-fuchsia-500/50 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <h2 className="font-serif font-black text-lg text-fuchsia-300 uppercase tracking-wider text-center">
              Test Profile Ready
            </h2>
            <div className="font-mono text-xs text-amber-100 flex flex-col gap-1.5">
              <Row label="Name" value={profile.name} />
              <Row label="Model" value={profile.appearance.characterModel ?? '—'} testId="harness-profile-model" />
              <Row label="Strength" value={String(profile.baseStats.strength)} />
              <Row label="Agility" value={String(profile.baseStats.agility)} />
              <Row label="Stamina" value={String(profile.baseStats.stamina)} />
              <Row label="Defense" value={String(profile.baseStats.defense)} />
              <Row label="Unspent Pts" value={String(profile.unspentStatPoints)} />
              <Row label="Weapon" value={profile.equipped.weapon?.name ?? '—'} />
            </div>
            <div className="flex flex-col gap-2">
              <button
                data-testid="harness-start-duel"
                onClick={() => { sounds.playClick(); setDuelResult(null); setStage('duel'); }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-serif font-black text-sm uppercase tracking-wider border border-fuchsia-300/50 cursor-pointer transition-all active:scale-95"
              >
                ⚔️ Start Test Duel (opponent: {ALL_OPPONENTS[0].name})
              </button>
              <button
                data-testid="harness-back-to-select"
                onClick={() => { sounds.playClick(); setProfile(null); setStage('create'); }}
                className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-200 font-serif font-bold text-sm cursor-pointer transition-all"
              >
                ← Back to Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'duel' && profile && (
        <div className="pt-7 h-full">
          <Suspense fallback={<div className="w-full h-screen flex items-center justify-center bg-neutral-950 text-fuchsia-400 font-serif text-xl animate-pulse">Loading Arena…</div>}>
            <DuelScene
              playerProfile={profile}
              opponent={ALL_OPPONENTS[0]}
              onMatchComplete={handleMatchComplete}
              onOpenArmory={() => setStage('ready')}
              onOpenHelp={() => {}}
              onToggleMute={handleToggleMute}
              isMuted={isMuted}
              isLeftyMode={isLeftyMode}
              onOpenSettings={() => {}}
            />
          </Suspense>
        </div>
      )}

      {stage === 'result' && duelResult && (
        <div className="pt-7 h-full flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-900/80 border border-fuchsia-500/50 rounded-2xl p-6 shadow-xl flex flex-col gap-4 text-center">
            <h2 className={`font-serif font-black text-2xl uppercase tracking-wider ${duelResult.didWin ? 'text-amber-300' : 'text-red-400'}`}>
              {duelResult.didWin ? 'Victory' : 'Defeat'}
            </h2>
            <div className="font-mono text-xs text-amber-100 flex flex-col gap-1.5">
              <Row label="Gold Earned" value={String(duelResult.stats.goldEarned)} />
              <Row label="Fame Earned" value={String(duelResult.stats.fameEarned)} />
              <Row label="XP Earned" value={String(duelResult.stats.xpEarned)} />
            </div>
            <div className="flex flex-col gap-2">
              <button
                data-testid="harness-rematch"
                onClick={() => { sounds.playClick(); setDuelResult(null); setStage('duel'); }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-serif font-black text-sm uppercase tracking-wider border border-fuchsia-300/50 cursor-pointer transition-all active:scale-95"
              >
                ⚔️ Rematch
              </button>
              <button
                data-testid="harness-back-to-select"
                onClick={() => { sounds.playClick(); setProfile(null); setDuelResult(null); setStage('create'); }}
                className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-200 font-serif font-bold text-sm cursor-pointer transition-all"
              >
                ← Back to Selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; testId?: string }> = ({ label, value, testId }) => (
  <div className="flex justify-between items-center gap-4">
    <span className="text-neutral-400">{label}</span>
    <span data-testid={testId} className="text-amber-200 font-bold">{value}</span>
  </div>
);

export default CharacterTestHarness;
