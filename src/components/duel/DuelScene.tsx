import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles, useGLTF, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PlayerProfile, OpponentConfig, FighterState, DuelStatistics, DamageNumber } from '../../types/game';
import { DuelArena } from '../3d/DuelArena';
import { GladiatorMesh } from '../3d/GladiatorMesh';
import { CombatHUD } from '../ui/CombatHUD';
import { CombatActionType, CombatLogEntry } from '../ui/TurnActionPanel';
import { CanvasLoadingFallback } from '../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../ui/CanvasWebGLMonitor';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../utils/webglContext';
import { calculateTotalStats } from '../../services/storage';
import { getWeaponByType } from '../../data/itemsDB';
import { sounds } from '../../audio/soundEffects';
import { CORE_3D_ASSETS } from '../../utils/preloadAssets';
import { useCameraDrag } from '../../hooks/useCameraDrag';

// Preload 3D assets for instant duel startup
try {
  CORE_3D_ASSETS.forEach((asset) => useGLTF.preload(asset));
} catch (e) {
  // Silent fallback
}

interface DuelSceneProps {
  playerProfile: PlayerProfile;
  opponent: OpponentConfig;
  onMatchComplete: (stats: DuelStatistics, didWin: boolean) => void;
  onOpenArmory: () => void;
  onOpenHelp: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  isLeftyMode?: boolean;
  onOpenSettings?: () => void;
}

// Camera controller inside Canvas with hold-and-drag orbit support
const DuelCameraRig: React.FC<{
  playerPos: [number, number, number];
  opponentPos: [number, number, number];
  cameraMode: string;
}> = ({ playerPos, opponentPos, cameraMode }) => {
  const { camera } = useThree();
  const { yawOffsetRef, pitchOffsetRef } = useCameraDrag(false);

  useFrame((_, delta) => {
    const midX = (playerPos[0] + opponentPos[0]) / 2;
    const midZ = (playerPos[2] + opponentPos[2]) / 2;

    const dragYaw = yawOffsetRef.current;
    const dragPitch = pitchOffsetRef.current;

    let baseDist = 8.5;
    let baseHeight = 5.2;

    if (cameraMode === 'over_shoulder') {
      baseDist = 4.2;
      baseHeight = 2.8;
    } else if (cameraMode === 'isometric') {
      baseDist = 11.0;
      baseHeight = 9.0;
    }

    const currentHeight = Math.max(1.5, Math.min(14, baseHeight + dragPitch));
    const currentDist = Math.max(3.5, Math.min(16, baseDist + dragPitch * 0.4));

    const camX = midX + Math.sin(dragYaw) * currentDist;
    const camZ = midZ + Math.cos(dragYaw) * currentDist;

    const targetCamPos = new THREE.Vector3(camX, currentHeight, camZ);

    camera.position.lerp(targetCamPos, Math.min(1, delta * 6));
    camera.lookAt(midX, 1.2, midZ);
  });

  return null;
};

// 3D Floating Combat Damage & Status Overlay
const FloatingDamage3D: React.FC<{ damages: DamageNumber[] }> = ({ damages }) => {
  return (
    <>
      {damages.map((dmg) => (
        <Html key={dmg.id} position={dmg.position} center className="pointer-events-none select-none">
          <div
            className={`font-serif font-black text-sm sm:text-xl animate-bounce drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] whitespace-nowrap ${
              dmg.type === 'crit'
                ? 'text-yellow-300 text-lg sm:text-2xl scale-125 font-mono'
                : dmg.type === 'blocked'
                ? 'text-cyan-300 text-xs sm:text-sm'
                : dmg.type === 'dodge'
                ? 'text-purple-300 text-xs sm:text-sm'
                : dmg.type === 'hype'
                ? 'text-orange-400 text-xs sm:text-sm'
                : 'text-red-500'
            }`}
          >
            {dmg.text}
          </div>
        </Html>
      ))}
    </>
  );
};

export const DuelScene: React.FC<DuelSceneProps> = ({
  playerProfile,
  opponent,
  onMatchComplete,
  onOpenArmory,
  onOpenHelp,
  onToggleMute,
  isMuted,
  isLeftyMode = false,
  onOpenSettings,
}) => {
  const pStats = calculateTotalStats(playerProfile);

  // D1 fix: the opponent fights with ITS OWN configured weapon, never the
  // player's equipped gear. An explicit per-opponent loadout (if one is ever
  // supplied) wins; otherwise the configured `weaponType` is resolved through
  // the canonical weapon registry in data/itemsDB.ts. Either way the result is
  // independent of `playerProfile.equipped`.
  const opponentWeapon = opponent.loadout?.weapon ?? getWeaponByType(opponent.weaponType);

  const [player, setPlayer] = useState<FighterState>({
    id: 'player',
    name: playerProfile.name,
    title: playerProfile.title,
    isPlayer: true,
    position: [0, 0, 3.5],
    rotationY: Math.PI,
    health: pStats.healthMax,
    stamina: pStats.staminaMax,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: pStats,
    loadout: { weapon: playerProfile.equipped.weapon },
    comboCount: 0,
    skinColor: playerProfile.appearance.skinColor,
    hairColor: playerProfile.appearance.hairColor,
    tunicColor: playerProfile.appearance.tunicColor,
    crestColor: playerProfile.appearance.crestColor,
    clothingStyle: playerProfile.appearance.clothingStyle,
    characterModel: playerProfile.appearance.characterModel || 'roman_warrior',
    isLeftyMode: isLeftyMode,
  });

  // Keep player handedness in sync if changed dynamically
  useEffect(() => {
    setPlayer((prev) => ({ ...prev, isLeftyMode }));
  }, [isLeftyMode]);

  const [opp, setOpp] = useState<FighterState>({
    id: opponent.id,
    name: opponent.name,
    title: opponent.title,
    isPlayer: false,
    position: [0, 0, -3.5],
    rotationY: 0,
    health: opponent.stats.healthMax,
    stamina: opponent.stats.staminaMax,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: opponent.stats,
    loadout: { ...opponent.loadout, weapon: opponentWeapon },
    comboCount: 0,
    skinColor: opponent.skinColor,
    hairColor: opponent.hairColor,
    tunicColor: opponent.tunicColor,
    meshScale: opponent.meshScale,
    characterModel: opponent.characterModel || 'roman_warrior',
  });

  // Swords & Sandals Turn-Based State Machine
  const [isPlayerTurn, setIsPlayerTurn] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([]);
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);

  const [crowdHype, setCrowdHype] = useState(25);
  const [matchTimer, setMatchTimer] = useState(0);
  const [cameraMode, setCameraMode] = useState<'cinematic' | 'over_shoulder' | 'isometric'>('cinematic');
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');

  useEffect(() => {
    const timer = setTimeout(() => {
      setFrameloopMode('always');
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const statsRef = useRef<DuelStatistics>({
    damageDealt: 0,
    damageTaken: 0,
    hitsLanded: 0,
    perfectBlocks: 0,
    dodgesPerformed: 0,
    maxCombo: 0,
    crowdHypePeak: 25,
    durationSeconds: 0,
    goldEarned: opponent.rewardGold,
    fameEarned: opponent.rewardFame,
    xpEarned: opponent.rewardXp,
  });

  const isMatchOver = useRef(false);
  const phaseSwitchedRef = useRef(false);
  const pendingHeavyAttackRef = useRef(false);
  const pendingCounterRef = useRef(false);

  // Match timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isMatchOver.current) {
        setMatchTimer((prev) => prev + 1);
        statsRef.current.durationSeconds += 1;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Distance in 3D arena
  const currentDistance = Math.abs(player.position[2] - opp.position[2]);

  // Helper: Append log
  const addLog = useCallback((text: string, type: 'player' | 'opponent' | 'system' | 'crit' = 'system') => {
    const entry: CombatLogEntry = {
      id: Math.random().toString(),
      text,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
    };
    setCombatLog((prev) => [...prev.slice(-12), entry]);
  }, []);

  // Helper: Spawn 3D floating damage text
  const spawnDamageText = useCallback((text: string, type: DamageNumber['type'], pos: [number, number, number]) => {
    const dmgItem: DamageNumber = {
      id: Math.random().toString(),
      text,
      type,
      position: [pos[0], pos[1] + 1.8, pos[2]],
      createdAt: Date.now(),
    };
    setDamageNumbers((prev) => [...prev, dmgItem]);
    setTimeout(() => {
      setDamageNumbers((prev) => prev.filter((d) => d.id !== dmgItem.id));
    }, 1400);
  }, []);

  // Core Turn Execution Function
  const executeCombatTurn = useCallback(
    (actor: 'player' | 'opponent', actionType: CombatActionType) => {
      if (isExecuting || isMatchOver.current) return;

      setIsExecuting(true);
      const isActorPlayer = actor === 'player';
      const attacker = isActorPlayer ? player : opp;
      const defender = isActorPlayer ? opp : player;

      // Taking a new action ends any lingering dodge invulnerability from a
      // previous turn. The dodge stance persists across the turn boundary
      // (see the reset below) so the opposing attack can interact with it;
      // it is consumed here when the fighter acts again. Returning the same
      // reference when nothing changes lets React bail out of a re-render.
      if (isActorPlayer) {
        setPlayer((prev) => (prev.isInvulnerable ? { ...prev, isInvulnerable: false } : prev));
      } else {
        setOpp((prev) => (prev.isInvulnerable ? { ...prev, isInvulnerable: false } : prev));
      }

      const dist = Math.abs(player.position[2] - opp.position[2]);
      const weaponType = attacker.loadout.weapon.type || 'sword_shield';
      const effectiveRange = weaponType === 'spear' ? 3.8 : 2.5;

      // 1. MOVEMENT ACTIONS
      if (actionType === 'advance') {
        sounds.playDodge();
        if (isActorPlayer) {
          const targetZ = Math.max(opp.position[2] + 1.2, player.position[2] - 1.8);
          setPlayer((prev) => ({
            ...prev,
            position: [0, 0, targetZ],
            action: 'walk',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 10),
          }));
        } else {
          const targetZ = Math.min(player.position[2] - 1.2, opp.position[2] + 1.8);
          setOpp((prev) => ({
            ...prev,
            position: [0, 0, targetZ],
            action: 'walk',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 10),
          }));
        }
        addLog(`${attacker.name} advances 1.8m toward their opponent.`, isActorPlayer ? 'player' : 'opponent');
      } else if (actionType === 'retreat') {
        sounds.playDodge();
        if (isActorPlayer) {
          const targetZ = Math.min(7.5, player.position[2] + 1.8);
          setPlayer((prev) => ({
            ...prev,
            position: [0, 0, targetZ],
            action: 'walk',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 10),
          }));
        } else {
          const targetZ = Math.max(-7.5, opp.position[2] - 1.8);
          setOpp((prev) => ({
            ...prev,
            position: [0, 0, targetZ],
            action: 'walk',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 10),
          }));
        }
        addLog(`${attacker.name} retreats back 1.8m.`, isActorPlayer ? 'player' : 'opponent');
      }

      // 2. DEFENSIVE / UTILITY ACTIONS
      else if (actionType === 'shield_block') {
        sounds.playBlock();
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'block',
            isBlocking: true,
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 12),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'block',
            isBlocking: true,
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 12),
          }));
        }
        addLog(`${attacker.name} braces behind their shield (+75% Def).`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText('BRACED!', 'blocked', attacker.position);
      } else if (actionType === 'dodge') {
        sounds.playDodge();
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'dodge',
            isInvulnerable: true,
            stamina: Math.max(0, prev.stamina - 12),
          }));
          statsRef.current.dodgesPerformed += 1;
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'dodge',
            isInvulnerable: true,
            stamina: Math.max(0, prev.stamina - 12),
          }));
        }
        addLog(`${attacker.name} enters an evasion stance!`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText('DODGE STANCE', 'dodge', attacker.position);
      } else if (actionType === 'taunt') {
        sounds.playVictory();
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 25),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 25),
          }));
        }
        setCrowdHype((prev) => Math.min(100, prev + 20));
        addLog(`${attacker.name} flexes & taunts! The arena roars (+20% Hype)!`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText('TAUNT! +20% HYPE', 'hype', attacker.position);
      } else if (actionType === 'rest') {
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 40),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 40),
          }));
        }
        addLog(`${attacker.name} catches breath (+40 Stamina).`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText('+40 SP', 'hype', attacker.position);
      }

      // 2b. BOSS TELEGRAPH ACTION (Goliath heavy_telegraph)
      // The boss spends this turn announcing a devastating overhead
      // smash. The player gets a full turn to respond (dodge, block,
      // or reposition) before the attack resolves on the boss's next
      // turn via the AI effect reading pendingHeavyAttackRef.
      else if (actionType === 'telegraph') {
        sounds.playHeavyImpact();
        pendingHeavyAttackRef.current = true;
        setOpp((prev) => ({ ...prev, telegraphText: 'HEAVY ATTACK INCOMING' }));
        addLog(`${attacker.name} winds up a devastating overhead smash!`, 'opponent');
        spawnDamageText('\u26A0 HEAVY!', 'crit', attacker.position);
      }

      // 3. OFFENSIVE ATTACK ACTIONS
      else if (actionType === 'quick_attack' || actionType === 'power_attack') {
        const isQuick = actionType === 'quick_attack';
        const staminaCost = isQuick ? 10 : 22;

        // Deduct stamina & set attack animation
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: isQuick ? 'attack_light' : 'attack_heavy',
            stamina: Math.max(0, prev.stamina - staminaCost),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: isQuick ? 'attack_light' : 'attack_heavy',
            stamina: Math.max(0, prev.stamina - staminaCost),
          }));
        }

        // Check weapon range
        if (dist > effectiveRange) {
          sounds.playSlash();
          addLog(`${attacker.name} strikes with ${isQuick ? 'Quick Slash' : 'Power Slash'}, but is OUT OF RANGE!`, 'system');
          spawnDamageText('OUT OF RANGE!', 'blocked', defender.position);
        } else {
          // Check Evasion / Hit Probability
          const hitPct = isQuick
            ? Math.max(50, Math.min(95, Math.round(80 + attacker.stats.agility * 1.5 - defender.stats.agility * 1.2)))
            : Math.max(35, Math.min(80, Math.round(60 + attacker.stats.agility * 1.2 - defender.stats.agility * 1.2)));

          const roll = Math.random() * 100;
          // A dodge sets isInvulnerable; the stance persists across the turn
          // boundary (it is NOT cleared in the end-of-turn reset) so the
          // attacker's strike can be evaded. Reading action === 'dodge' here
          // would always be false — the dodger's action is reset to 'idle'
          // before the opposing turn begins.
          const isEvaded = defender.isInvulnerable && Math.random() < 0.75;

          // Passive evasion (Valéria counter_dodge): when the player
          // attacks a counter_dodge boss who is NOT in an active
          // dodge stance, roll against the boss's configured
          // dodgeChance for a passive evade. Does not stack with
          // the active-dodge evasion above.
          const isPassiveEvaded =
            !isEvaded &&
            isActorPlayer &&
            opponent.bossMechanic === 'counter_dodge' &&
            !defender.isInvulnerable &&
            Math.random() < opponent.dodgeChance;

          if (isEvaded || isPassiveEvaded) {
            sounds.playDodge();
            addLog(`${defender.name} swiftly EVADED ${attacker.name}'s strike!`, 'system');
            spawnDamageText('EVADED!', 'dodge', defender.position);
            // Queue a counterattack for Valéria's next AI turn.
            // Only when the player is the attacker against a
            // counter_dodge boss — a player evading Valéria's own
            // counter must NOT chain into another counter.
            if (isActorPlayer && opponent.bossMechanic === 'counter_dodge') {
              pendingCounterRef.current = true;
            }
          } else if (roll <= hitPct) {
            // HIT LANDED! Calculate damage & crits
            const baseDmg = isQuick
              ? attacker.loadout.weapon.damageLight
              : attacker.loadout.weapon.damageHeavy;
            const strBonus = 1 + attacker.stats.strength * 0.05;
            const isCrit = !isQuick && Math.random() < 0.25;
            let rawDamage = Math.round(baseDmg * strBonus * (isCrit ? 1.5 : 1.0));

            // Check defender block status
            const isBlocked = defender.isBlocking;
            if (isBlocked) {
              rawDamage = Math.max(1, Math.round(rawDamage * 0.25));
              sounds.playBlock();
              if (!isActorPlayer) statsRef.current.perfectBlocks += 1;
              addLog(
                `${attacker.name}'s strike was BLOCKED by ${defender.name}'s shield (-${rawDamage} HP)!`,
                isBlocked ? 'system' : isActorPlayer ? 'player' : 'opponent'
              );
              spawnDamageText(`BLOCKED -${rawDamage}`, 'blocked', defender.position);
            } else {
              if (isCrit) {
                sounds.playHeavyImpact();
                addLog(`CRITICAL BLOW! ${attacker.name} struck ${defender.name} for ${rawDamage} DAMAGE!`, 'crit');
                spawnDamageText(`-${rawDamage} CRIT!`, 'crit', defender.position);
              } else {
                sounds.playSlash();
                addLog(`${attacker.name} struck ${defender.name} for ${rawDamage} damage.`, isActorPlayer ? 'player' : 'opponent');
                spawnDamageText(`-${rawDamage}`, 'damage', defender.position);
              }
            }

            // Track stats
            if (isActorPlayer) {
              statsRef.current.hitsLanded += 1;
              statsRef.current.damageDealt += rawDamage;
              setCrowdHype((prev) => Math.min(100, prev + (isCrit ? 18 : 8)));
            } else {
              statsRef.current.damageTaken += rawDamage;
            }

            // Apply HP damage to defender
            if (isActorPlayer) {
              setOpp((prev) => {
                const nextHp = Math.max(0, prev.health - rawDamage);
                return {
                  ...prev,
                  health: nextHp,
                  action: nextHp <= 0 ? 'death' : 'hit',
                  hitFlashTimer: 0.3,
                };
              });
            } else {
              setPlayer((prev) => {
                const nextHp = Math.max(0, prev.health - rawDamage);
                return {
                  ...prev,
                  health: nextHp,
                  action: nextHp <= 0 ? 'death' : 'hit',
                  hitFlashTimer: 0.3,
                };
              });
            }
          } else {
            // MISSED
            sounds.playSlash();
            addLog(`${attacker.name}'s attack MISSED!`, 'system');
            spawnDamageText('MISSED!', 'dodge', defender.position);
          }
        }
      }

      // 4. ANIMATION RESOLUTION & TURN TRANSITION (1100ms)
      setTimeout(() => {
        // Reset action animations back to idle
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'idle',
            // Preserve the player's block when a telegraphed heavy attack
            // is pending so the block can absorb the announced strike on
            // the boss's next turn. Without this, isBlocking is cleared at
            // turn end and the telegraph response is dodge-only.
            isBlocking: pendingHeavyAttackRef.current ? prev.isBlocking : false,
            // isInvulnerable is intentionally NOT cleared here: a dodge stance
            // must survive into the opponent's turn so the incoming strike can
            // be evaded. It is consumed when the fighter next acts (pre-clear
            // at the top of executeCombatTurn). isBlocking is unchanged.
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'idle',
            isBlocking: false,
          }));
        }

        setIsExecuting(false);

        // Check match end
        if (opp.health <= 0 || player.health <= 0) {
          return;
        }

        // Toggle turn
        setIsPlayerTurn(!isActorPlayer);
      }, 1100);
    },
    [isExecuting, player, opp, addLog, spawnDamageText]
  );

  // OPPONENT AI TURN STRATEGY ENGINE
  useEffect(() => {
    if (isPlayerTurn || isExecuting || isMatchOver.current || opp.health <= 0) return;

    const aiTimer = setTimeout(() => {
      const dist = Math.abs(player.position[2] - opp.position[2]);
      const oppWeaponType = opp.loadout.weapon.type || 'sword_shield';
      const effectiveRange = oppWeaponType === 'spear' ? 3.8 : 2.5;

      // Resolve pending heavy-attack telegraph (Goliath). The attack
      // was announced on the previous AI turn; the player has since
      // taken their turn. Clear the telegraph warning and resolve
      // through the standard power_attack pipeline so damage, dodge,
      // and block all use existing code paths.
      //
      // The player's block (if they chose shield_block as their
      // response) is intentionally left in place: executeCombatTurn
      // reads fighter state from its render closure, so the preserved
      // isBlocking flag is active during the power_attack and applies
      // the existing 75% damage reduction. The block is then cleared
      // by the 1100ms turn-end cleanup, which evaluates
      // pendingHeavyAttackRef.current (now false) and sets
      // isBlocking to false. No explicit pre-clear is needed here.
      if (opponent.bossMechanic === 'heavy_telegraph' && pendingHeavyAttackRef.current) {
        pendingHeavyAttackRef.current = false;
        setOpp((prev) => ({ ...prev, telegraphText: undefined }));
        executeCombatTurn('opponent', 'power_attack');
        return;
      }

      // Resolve pending counterattack (Valéria counter_dodge). The
      // counter was queued when Valéria evaded a player attack on the
      // previous turn. Clear the ref before resolving so it cannot fire
      // twice, then resolve through the standard quick_attack pipeline
      // — reusing all existing range, stamina, block, invulnerability,
      // and damage logic.
      if (opponent.bossMechanic === 'counter_dodge' && pendingCounterRef.current) {
        pendingCounterRef.current = false;
        executeCombatTurn('opponent', 'quick_attack');
        return;
      }

      let chosenAction: CombatActionType = 'quick_attack';

      if (dist > effectiveRange) {
        // Distance is large: Advance or Taunt
        if (oppWeaponType === 'spear' && dist <= 3.8) {
          chosenAction = 'quick_attack';
        } else {
          chosenAction = Math.random() < 0.82 ? 'advance' : 'taunt';
        }
      } else {
        // Inside strike range: Evaluate tactical options
        if (player.isBlocking) {
          // Player is guarding: AI uses Power Attack or Taunt
          const r = Math.random();
          chosenAction = r < 0.45 ? 'power_attack' : r < 0.75 ? 'taunt' : 'shield_block';
        } else if (opp.stamina < 15) {
          // Low AI stamina: Rest or Shield Block
          chosenAction = Math.random() < 0.6 ? 'shield_block' : 'rest';
        } else if (player.health < 25) {
          // Player low HP: Finish with Quick Attack
          chosenAction = Math.random() < 0.7 ? 'quick_attack' : 'power_attack';
        } else {
          // Standard combat balance. A small chance to take a preventive
          // evasion stance against the player's likely next strike — only in
          // strike range, with stamina to spare, and never against a blocking
          // player (no incoming attack to evade). The alternating turn model
          // means the AI cannot react to a specific player attack (the
          // player's action is already reset to idle by the time the AI
          // chooses), so this is a low-probability preventive dodge, not a
          // reaction. 10% keeps it from becoming a repetitive loop.
          const r = Math.random();
          if (r < 0.10) chosenAction = 'dodge';
          else if (r < 0.56) chosenAction = 'quick_attack';
          else if (r < 0.82) chosenAction = 'power_attack';
          else chosenAction = 'shield_block';
        }
      }

      // Goliath heavy-attack telegraph: occasionally announce a heavy
      // attack instead of the chosen action. Only when in strike range,
      // with enough stamina for the follow-up power attack (22 SP), and
      // no pending telegraph already queued. ~30% rate keeps the boss
      // threatening without making every turn a telegraph.
      if (
        opponent.bossMechanic === 'heavy_telegraph' &&
        !pendingHeavyAttackRef.current &&
        dist <= effectiveRange &&
        opp.stamina >= 22 &&
        Math.random() < 0.30
      ) {
        chosenAction = 'telegraph';
      }

      executeCombatTurn('opponent', chosenAction);
    }, 750);

    return () => clearTimeout(aiTimer);
  }, [isPlayerTurn, isExecuting, player, opp, executeCombatTurn]);

  // Check victory / defeat conditions
  useEffect(() => {
    if (isMatchOver.current) return;

    if (opp.health <= 0) {
      isMatchOver.current = true;
      pendingHeavyAttackRef.current = false;
      pendingCounterRef.current = false;
      setOpp((prev) => ({ ...prev, telegraphText: undefined }));
      sounds.playVictory();
      addLog(`VICTORY! ${player.name} has vanquished ${opp.name}!`, 'crit');
      setTimeout(() => {
        onMatchComplete(statsRef.current, true);
      }, 1400);
    } else if (player.health <= 0) {
      isMatchOver.current = true;
      pendingHeavyAttackRef.current = false;
      pendingCounterRef.current = false;
      setOpp((prev) => ({ ...prev, telegraphText: undefined }));
      addLog(`DEFEAT! ${player.name} has fallen in the sand.`, 'opponent');
      setTimeout(() => {
        onMatchComplete(statsRef.current, false);
      }, 1400);
    }
  }, [opp.health, player.health, player.name, opp.name, addLog, onMatchComplete]);

  // Boss phase-2 weapon switch (Ignis: dual_blades → mace at 50% health).
  // One-time: guarded by phaseSwitchedRef so the effect cannot re-trigger
  // even if React re-renders before the state update settles. Also guarded
  // against post-match and zero-health states so a killing blow that crosses
  // the threshold does not switch weapons. The guard resets naturally on a
  // fresh DuelScene mount (new ref instance). No phase state is persisted.
  useEffect(() => {
    if (phaseSwitchedRef.current || isMatchOver.current) return;
    if (opponent.bossMechanic !== 'phase_weapon_switch' || !opponent.phase2WeaponType) return;
    const threshold = opp.stats.healthMax * 0.5;
    if (opp.health > 0 && opp.health <= threshold) {
      phaseSwitchedRef.current = true;
      setOpp((prev) => ({
        ...prev,
        isPhase2: true,
        loadout: { ...prev.loadout, weapon: getWeaponByType(opponent.phase2WeaponType!) },
      }));
      addLog(`${opp.name} discards their blades and draws a heavy war mace!`, 'system');
    }
  }, [opp.health, opp.stats.healthMax, opponent.bossMechanic, opponent.phase2WeaponType, opp.name, addLog]);

  return (
    <div className="relative w-full h-full min-h-[100dvh] bg-neutral-950 overflow-hidden select-none">
      {/* 3D WEBGL DUEL CANVAS WRAPPED IN ERROR BOUNDARY & READY GUARD */}
      <WebGLReadyGuard
        sceneName="DuelArena"
        fallbackTitle="Arena Duel WebGL Error"
        onFallbackTo2D={onOpenArmory}
      >
        <WebGLContextErrorBoundary
          fallbackTitle="Arena Duel WebGL Error"
          sceneName="DuelArena"
          onFallbackTo2D={onOpenArmory}
        >
          <Canvas
            shadows
            frameloop={frameloopMode}
            camera={{ position: [0, 6, 12], fov: 45, near: 0.1, far: 80 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            onCreated={(state) => {
              logCanvasWebGLCreated(state.gl, 'DuelArena');
              setupCanvasContextRestoration(state.gl);
            }}
          >
            {/* Active GPU Health & Context Monitor */}
            <CanvasWebGLMonitor sceneName="DuelArena" />

            <Sky sunPosition={[40, 25, 20]} turbidity={7} rayleigh={1.8} mieCoefficient={0.005} />
            <fog attach="fog" args={['#d4a373', 25, 65]} />
            <ambientLight intensity={0.65} color="#fef3c7" />
            <directionalLight
              position={[15, 25, 15]}
              intensity={1.9}
              color="#fffbeb"
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight position={[-15, 10, -15]} intensity={0.5} color="#38bdf8" />
            <Sparkles count={50} scale={[20, 10, 20]} size={2} color="#fef08a" opacity={0.5} />

            <ThreeComponentErrorBoundary componentName="DuelArenaArchitecture">
              <DuelArena />
            </ThreeComponentErrorBoundary>

            <ThreeComponentErrorBoundary componentName="DuelFightersGladiatorMeshes">
              <Suspense fallback={<CanvasLoadingFallback />}>
                <GladiatorMesh fighter={player} isLeftyMode={isLeftyMode} />
                <GladiatorMesh fighter={opp} />
                <FloatingDamage3D damages={damageNumbers} />
              </Suspense>
            </ThreeComponentErrorBoundary>

            <DuelCameraRig
              playerPos={player.position}
              opponentPos={opp.position}
              cameraMode={cameraMode}
            />
          </Canvas>
        </WebGLContextErrorBoundary>
      </WebGLReadyGuard>

      {/* SWORDS & SANDALS COMBAT HUD & TACTICAL DASHBOARD */}
      <CombatHUD
        player={player}
        opponent={opp}
        crowdHype={crowdHype}
        comboCount={0}
        matchTimer={matchTimer}
        isMuted={isMuted}
        onToggleMute={onToggleMute}
        onOpenArmory={onOpenArmory}
        onOpenHelp={onOpenHelp}
        cameraMode={cameraMode}
        onCycleCameraMode={() =>
          setCameraMode((prev) =>
            prev === 'cinematic' ? 'over_shoulder' : prev === 'over_shoulder' ? 'isometric' : 'cinematic'
          )
        }
        onOpenSettings={onOpenSettings}
        distance={currentDistance}
        isPlayerTurn={isPlayerTurn}
        isExecuting={isExecuting}
        combatLog={combatLog}
        onExecuteAction={(action) => executeCombatTurn('player', action)}
      />
    </div>
  );
};
