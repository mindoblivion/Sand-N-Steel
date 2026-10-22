import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sparkles as DreiSparkles, Sky, Environment, Lightformer, useGLTF } from '@react-three/drei';
import { PlayerProfile, OpponentConfig, FighterState } from '../../../types/game';
import { IshtarGatehouse } from './IshtarGatehouse';
import { ProcessionAvenue } from './ProcessionAvenue';
import { CityStreets } from './CityStreets';
import { TimberCrate } from './CivicFurnishingProps';
import { SmithingForge } from './SmithingForge';
import { TrainingYard } from './TrainingYard';
import { CityTavern } from './CityTavern';
import { GeneralStore } from './GeneralStore';
import { CaravanseraiInn } from './CaravanseraiInn';
import { GrandColosseum } from './GrandColosseum';
import { ChampionBannerPole } from './ChampionBannerPole';
import { resolveBanner } from '../../../utils/heraldry';
import { resolveDoorDuelTarget, resolveBoutLevelGate } from '../../../utils/tierAdvancement';
import { PreFightModal } from '../../hub/PreFightModal';
// L11 — the visitor panel and the ONE schedule it lists (who is in town today).
import { VisitorPanel } from '../../hub/VisitorPanel';
import { resolveVisitorSchedule } from '../../../utils/visitorSchedule';
// L17 — where the scheduled visitors stand, and the ONE rule that decides whether a
// visitor or a hub owns the interaction. Pure data + pure resolvers; no state.
import {
  resolveVisitorPresence,
  resolveVisitorTarget,
  visitorPrompt,
  VISITOR_CREST_COLOR,
  VISITOR_TUNIC_COLOR,
  type VisitorPresence,
  type VisitorTarget,
} from '../../../utils/visitorPresence';
import type { VisitorPurchaseResult } from '../../../utils/visitorPurchase';
import { MerchantHouse } from './MerchantHouse';
import { ArmorLeatherWorkshop } from './ArmorLeatherWorkshop';
import { Stable } from './Stable';
import { PublicBathhouse } from './PublicBathhouse';
import { RomanShrine } from './RomanShrine';
import { BountyHall } from './BountyHall';
import { GladiatorAcademy } from './GladiatorAcademy';
import { DoctoreHouse } from './DoctoreHouse';
import { RecordsLibrary } from './RecordsLibrary';
import { GladiatorBarracks } from './GladiatorBarracks';
import { VeteranGladiatorHall } from './VeteranGladiatorHall';
import { ArenaMedicalHouse } from './ArenaMedicalHouse';
import { NorthernFortress } from './NorthernFortress';
import { NorthernMotte } from './NorthernMotte';
import { Drawbridge } from './Drawbridge';
import { EastCircusArena } from './EastCircusArena';
import { EastCircusDistrict } from './EastCircusDistrict';
import { CityCamera } from './CityCamera';
import { SceneBrightness } from '../SceneBrightness';
import { GladiatorMesh } from '../GladiatorMesh';
import { AMBIENT_CHARACTERS, createAmbientFighter } from '../../../data/ambientCharacters';
import { CORE_3D_ASSETS } from '../../../utils/preloadAssets';
import { Banner, SteamParticles, ForgeSmoke, SandDrift } from './EnvironmentalMotion';
// SF-1 — the city's picture budget: the tier table and the adaptive engine that
// steps inside a tier's DPR band, plus the one settings reader the drifting dust
// obeys (the preset itself arrives through `useSettings`).
import { CITY_TIERS, POST_TRANSITION_MS, useAdaptiveDpr } from '../../../hooks/useAdaptiveDpr';
import { getEffectiveAtmosphereMotion } from '../../../services/settings';
import type { QualityPreset } from '../../../services/settings';
import { useSettings } from '../../../hooks/useSettings';
// Phase C-8.70B — the East Circus District's read-only pre-race entry panel.
import { PreRacePanel } from '../../hub/PreRacePanel';

// Preload 3D models for instant, seamless city rendering
try {
  CORE_3D_ASSETS.forEach((asset) => useGLTF.preload(asset));
} catch (e) {
  // Silent fallback
}
import {
  resolveCityMovement,
  clearRecoveryHistory,
  getNearbyHubLocation,
  HUB_LOCATIONS,
  FAST_TRAVEL_ARRIVALS,
  InteractiveLocation,
} from '../../../utils/cityCollisions';
import { getTerrainY } from '../../../utils/terrainHeight';
// L9 — the rest-and-recovery transaction's result type and its cost reader: the
// Medical House shows what the ONE transaction decided, and reads the day it
// consumed from the profile it returned (never advancing anything itself).
import { resolveCityDay } from '../../../utils/cityClock';
import { restCost, type RestResult } from '../../../utils/restRecovery';
// L14 — lodging: the ONE inn transaction, and the fee its notice quotes.
import { lodgingCost, type LodgingResult } from '../../../utils/lodging';
import { resolveCityLightProfile, type CityLightProfile } from '../../../utils/cityLightProfile';
import type { HeraldAim } from '../../../utils/cityHerald';
import { DEFAULT_PLAYER_WEAPON } from '../../../data/itemsDB';
import type { StorefrontId } from '../../../data/shops';
import { calculateTotalStats } from '../../../services/storage';
import { sounds } from '../../../audio/soundEffects';
import { CanvasLoadingFallback } from '../../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../../ui/CanvasWebGLMonitor';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../../utils/webglContext';
import {
  Swords,
  Dumbbell,
  ShoppingCart,
  Layers,
  BarChart2,
  Beer,
  BookOpen,
  Home,
  Coins,
  Trophy,
  Volume2,
  VolumeX,
  Compass,
  MapPin,
  ChevronRight,
  Menu,
  Sparkles as SparklesIcon,
  Cloud,
  Zap,
  Settings,
  Users,
} from 'lucide-react';

/**
 * Phase C-8.70B Stage 1, Slice 1 — the city pose handed back to the race.
 * Captured here from the movement refs at the moment the player starts a race,
 * held by `App` for the length of the race, and handed back as this scene's
 * `initialPosition` / `initialRotationY` when it remounts. In memory only.
 */
export interface CityExitPose {
  position: [number, number, number];
  rotationY: number;
}

/**
 * SF-1 — the adaptive DPR engine's mount point.
 *
 * It has to sit INSIDE `<Canvas>` (a frame's duration only exists there) and it
 * renders nothing: a step is published into the scene's own state, which the
 * Canvas's `dpr` prop follows, so there is exactly one holder of the value.
 */
const CityAdaptiveDpr: React.FC<{
  tier: QualityPreset;
  suspendedRef: { readonly current: boolean };
  onDprChange: (dpr: number) => void;
}> = ({ tier, suspendedRef, onDprChange }) => {
  useAdaptiveDpr({ tier, suspendedRef, onDprChange });
  return null;
};

/**
 * L9 — the medicus's notice, built from the ONE transaction's own result.
 *
 * Rendering the result rather than the request is what keeps the feedback honest:
 * a refusal says why and shows nothing about a treatment that never happened, and
 * a success names the day the player wakes on (read from the profile the
 * transaction committed, so this scene never computes a day itself) and the gold
 * the treatment actually charged. Pure and local: no clock, no storage, no state.
 */
function restNotice(result: RestResult, level: number): string {
  if (result.ok) {
    return `The medicus cleans and binds your wound, and you sleep until dawn. Day ${resolveCityDay(result.profile)} — the treatment cost ${result.cost} gold.`;
  }
  switch (result.reason) {
    case 'no-injury':
      return 'The medicus finds nothing to treat.';
    case 'already-rested':
      return 'The medicus has already treated you today. He will see you again on the morrow.';
    case 'insufficient-gold':
      return `The medicus names his fee: ${restCost({ level })} gold, and your purse is short. Come back when the arena has paid.`;
    default:
      // `no-profile` — unreachable in the city (the screen only mounts with a
      // profile), kept so the switch is total: the house's own description.
      return "Arena Medical House: Bandages, ceramic vessels, and surgical tools are prepared for the arena's wounded.";
  }
}

/**
 * L14 — the innkeeper's notice, built from the ONE lodging result.
 *
 * Same discipline as `restNotice`: it renders the result rather than the
 * request, so a refusal says why and claims no night, and a success names the
 * day the player wakes on (read from the profile the transaction committed, so
 * this scene never computes a day itself) and the fee actually charged. It also
 * says plainly that a room is not a treatment — lodging spends the day and
 * leaves the wound exactly as it was.
 */
function lodgingNotice(result: LodgingResult, level: number): string {
  if (result.ok) {
    return `The innkeeper takes ${result.cost} gold and shows you to a room. You sleep until dawn and wake on day ${resolveCityDay(result.profile)} — no wound is tended here, only a night's rest.`;
  }
  switch (result.reason) {
    case 'already-lodged':
      return 'You have already paid for a room today. The innkeeper will take your coin again on the morrow.';
    case 'insufficient-gold':
      return `The innkeeper names his price: ${lodgingCost({ level })} gold for a bed, and your purse is short.`;
    default:
      // `no-profile` — unreachable in the city (the screen only mounts with a
      // profile), kept so the switch is total: the inn's own description.
      return "Caravanserai Inn: Rest & Quarters. The keeper has no room to spare for you tonight.";
  }
}

interface CityHubSceneProps {
  playerProfile: PlayerProfile;
  /**
   * Phase C-8.66B: `subTab` carries the one hub that opens a subview of its tab
   * (the Imperial Stable → the Armory's Chariot Workshop). Every other hub
   * passes nothing and lands on the tab's own default view.
   */
  /**
   * Phase SHOP-2: `shopId` carries the storefront of the `shop` tab, for the
   * four city buildings that each sell their own stock.  Every other hub passes
   * nothing and lands on the open market.
   */
  onOpenTab: (
    tabKey: 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library',
    subTab?: 'chariot',
    shopId?: StorefrontId
  ) => void;
  onEnterDuel: (opponent: OpponentConfig) => void;
  /**
   * L9 — rest at the Arena Medical House. The transaction itself lives in `App`
   * (`utils/restRecovery`); this scene only decides WHEN the medicus is asked and
   * shows the result, so there is one rest path and no clock work here.
   */
  onRest: () => RestResult;
  /**
   * L14 — a night at the Caravanserai. The transaction itself lives in `App`
   * (`utils/lodging`); this scene only decides WHEN the innkeeper is asked and
   * shows the result, so there is one lodging path and no clock work here.
   */
  onLodging: () => LodgingResult;
  /**
   * L11 — the ONE visitor encounter. The transaction lives in `App`
   * (`utils/visitorEncounter`); this scene only decides WHEN a visitor is met (an
   * explicit selection in the panel) and never writes history itself.
   */
  onEncounterVisitor: (visitorId: string) => void;
  /**
   * L12 — the ONE visitor purchase. The transaction lives in `App`
   * (`utils/visitorPurchase`); this scene only hands the panel's request through,
   * and the panel renders the result it returns.
   */
  onPurchaseVisitor: (visitorId: string) => VisitorPurchaseResult;
  onOpenDriveSync: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onReturnToMainMenu: () => void;
  isLeftyMode: boolean;
  onOpenSettings?: () => void;
  /**
   * Phase C-8.70B Stage 1, Slice 1 — leave the city for the race scene.  The
   * pose the player must come back to is captured in this scene and passed here,
   * because the city unmounts with the race; nothing is written to a save.
   */
  onStartRace: (pose: CityExitPose) => void;
  /**
   * Phase C-8.70B Stage 1, Slice 1 — the pose to spawn at when the city comes
   * back from a race.  Absent (the normal case) means the usual town-gate spawn.
   */
  initialPosition?: [number, number, number];
  initialRotationY?: number;
  /**
   * Which light rig the city is drawn under. Absent (the normal case) is the midday
   * the city has always had; `oathDawn` is the low sun the oath is sworn in.
   */
  lightProfile?: CityLightProfile;
  /**
   * While a presented scene owns the screen — the oath beat — the city stops reading
   * its own controls, so the beat cannot be walked out of and the player's position is
   * exactly where it was when the scene released him.
   */
  movementLocked?: boolean;
  /** The herald's pointer, when the herald is pointing somewhere (see `utils/cityHerald`). */
  heraldAim?: HeraldAim | null;
}

export const CityHubScene: React.FC<CityHubSceneProps> = ({
  playerProfile,
  onOpenTab,
  onEnterDuel,
  onRest,
  onLodging,
  onEncounterVisitor,
  onPurchaseVisitor,
  onOpenDriveSync,
  onToggleMute,
  isMuted,
  onReturnToMainMenu,
  isLeftyMode,
  onOpenSettings,
  onStartRace,
  initialPosition,
  initialRotationY,
  lightProfile,
  movementLocked,
  heraldAim,
}) => {
  // The rig this screen is drawn under. `resolveCityLightProfile` answers module
  // constants, so `lights` keeps its reference across re-renders and the Environment
  // cubemap below is not re-captured on every player-movement render.
  const lights = resolveCityLightProfile(lightProfile);
  // Stabilize the Environment cubemap's Lightformer children across player-movement re-renders.
  // Without this, each setPlayerPos / setPlayerRotY / setIsMoving call creates a new children
  // reference, which can re-trigger drei's Environment layout effect and recapture the cubemap.
  const environmentLightformers = useMemo(
    () => (
      <>
        {/* Warm Mediterranean sun — aligned with the key light's own direction, which is
            why it reads the rig rather than a literal: at dawn it follows the sun down. */}
        <Lightformer
          form="rect"
          intensity={2.0}
          color="#fffbeb"
          position={lights.sunPosition}
          scale={[30, 30, 1]}
          target={[0, 0, 0]}
        />
        {/* Warm sky dome — ambient sky reflections for upward-facing surfaces */}
        <Lightformer
          form="rect"
          intensity={0.35}
          color="#fef3c7"
          position={[0, 60, 0]}
          scale={[100, 100, 1]}
          target={[0, 0, 0]}
        />
        {/* Warm earth ground bounce — ground reflections for downward-facing surfaces */}
        <Lightformer
          form="rect"
          intensity={0.25}
          color="#8a7a5f"
          position={[0, -30, 0]}
          scale={[100, 100, 1]}
          target={[0, 0, 0]}
        />
        {/* Subtle cool fill — matches secondary directional light direction */}
        <Lightformer
          form="rect"
          intensity={0.2}
          color="#7dd3fc"
          position={[-25, 20, -25]}
          scale={[20, 20, 1]}
          target={[0, 0, 0]}
        />
      </>
    ),
    [lights]
  );

  // Spawn gracefully in front of the Monumental Town Gate on the open avenue —
  // or, when the player has just come back from a race, at the exact position
  // and facing they entered it from (Phase C-8.70B Stage 1, Slice 1; these are
  // initial values, so a later prop change cannot move a player mid-walk).
  const [playerPos, setPlayerPos] = useState<[number, number, number]>(initialPosition ?? [0, 0, 16]);
  const [playerRotY, setPlayerRotY] = useState(initialRotationY ?? Math.PI);
  const [isMoving, setIsMoving] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [nearbyLoc, setNearbyLoc] = useState<InteractiveLocation | null>(null);
  const [showNavDrawer, setShowNavDrawer] = useState(false);
  // L11 — the visitor panel. Nothing is resolved per frame: the schedule is derived
  // from the profile (and therefore from the saved day) only when that profile changes.
  const [showVisitors, setShowVisitors] = useState(false);
  const visitorArrivals = useMemo(
    () => resolveVisitorSchedule(playerProfile).arrivals,
    [playerProfile]
  );
  /**
   * L17 — who is STANDING in the city, derived from the same schedule the chip
   * reads (so a body and a row can never disagree). Derived from the profile, so
   * it is recomputed when — and only when — the profile (and therefore the saved
   * day or the completion history) changes: a purchase, a night's lodging, a rest
   * and a settled duel all remove a departed visitor here, with no per-frame work.
   */
  const visitorPresence = useMemo(
    () => resolveVisitorPresence(playerProfile),
    [playerProfile]
  );
  // The selected visitor — non-null ONLY when the visitor wins the interaction
  // (see `resolveVisitorTarget`), so it is the single owner of the VISIT prompt.
  const [nearbyVisitor, setNearbyVisitor] = useState<VisitorTarget | null>(null);
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');
  const [stableNotice, setStableNotice] = useState<string | null>(null);
  // Combat responsiveness §R3B — the fighter a Colosseum door has resolved and
  // is offering through the SAME pre-fight briefing the tournament tab uses. The
  // duel only starts when that briefing is confirmed.
  const [pendingDuel, setPendingDuel] = useState<OpponentConfig | null>(null);
  // Phase C-8.70B — the East Circus District's race entry panel.  Local view
  // state only: opening it and leaving it change no game data.
  const [showRaceEntry, setShowRaceEntry] = useState(false);

  /**
   * SF-1 — the quality preset arrives as a setting, not as a prop: the panel writes
   * the one settings record and this scene subscribes to it, exactly as it does for
   * brightness.  A preset change re-applies the whole tier.
   */
  const settings = useSettings();
  const qualityPreset = settings.qualityPreset;
  const cityTier = CITY_TIERS[qualityPreset];

  /**
   * SF-1 — the drift the city's dust obeys: the tier's particle budget, and nothing
   * at all while the player's atmosphere motion is off.  Swift forces that motion
   * off (`getEffectiveAtmosphereMotion`), which is why Swift's row draws no dust.
   */
  const atmosphericMotion = getEffectiveAtmosphereMotion(settings);
  const sparklesCount = atmosphericMotion ? cityTier.sparkles : 0;

  /**
   * SF-1 — the Canvas's DPR is STATE now, not a constant: the tier sets its starting
   * value and the adaptive engine steps it inside the tier's band.  A step is rare
   * (never twice inside 3 s) and is the only thing about the picture budget that
   * re-renders this scene — the per-frame EMA lives in the engine's own ref.
   */
  const [cityDpr, setCityDpr] = useState<number>(() => CITY_TIERS[qualityPreset].dpr.start);

  /**
   * SF-1 — adaptation is suspended while the scene is a TRANSITION: the mounting
   * warm-up, a fast travel, and one transition-length after arrival.  A ref, because
   * the engine reads it every frame and the scene only ever writes it; the resume
   * delay is the engine's own `POST_TRANSITION_MS`, so the two cannot drift apart.
   */
  const adaptationSuspendedRef = useRef(true);
  const adaptationResumeRef = useRef<number | null>(null);
  const suspendAdaptation = useCallback(() => {
    adaptationSuspendedRef.current = true;
    if (adaptationResumeRef.current !== null) window.clearTimeout(adaptationResumeRef.current);
    adaptationResumeRef.current = window.setTimeout(() => {
      adaptationSuspendedRef.current = false;
      adaptationResumeRef.current = null;
    }, POST_TRANSITION_MS);
  }, []);

  // SF-1 — the tier, applied at mount and on a preset change (never mid-frame and
  // never by the engine): the band's starting DPR.  The engine keeps a tier's DPR
  // inside its band from there on.
  useEffect(() => {
    setCityDpr(CITY_TIERS[qualityPreset].dpr.start);
  }, [qualityPreset]);

  useEffect(() => {
    // Start with frameloop="demand" initially, switching to "always" after core 3D assets & context are warm
    const timer = setTimeout(() => {
      setFrameloopMode('always');
    }, 250);
    // SF-1 — mounting IS a transition: the first compiles and the demand→always
    // switch are not a slow device, so the engine starts suspended and is released
    // one transition-length after mount.
    suspendAdaptation();
    return () => {
      clearTimeout(timer);
      if (adaptationResumeRef.current !== null) window.clearTimeout(adaptationResumeRef.current);
    };
  }, [suspendAdaptation]);

  // Mutable refs for silky smooth 60fps movement without React re-render cancellation
  const playerPosRef = useRef<[number, number, number]>(initialPosition ?? [0, 0, 16]);
  const playerRotYRef = useRef<number>(initialRotationY ?? Math.PI);
  const cameraYawRef = useRef<number>(initialRotationY ?? Math.PI);
  const lastNearbyIdRef = useRef<string | null>(null);
  // L17 — the mount-once loop reads the presence list through this ref, exactly as
  // it reads the player's own position: it must never close over an arrival list
  // from its first render.
  const visitorPresenceRef = useRef<VisitorPresence[]>(visitorPresence);
  const lastVisitorIdRef = useRef<string | null>(null);

  // Mobile Virtual Joystick State
  const joystickRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);
  const touchVectorRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });

  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const lastTimeRef = useRef<number>(performance.now());
  const isMovingRef = useRef<boolean>(false);

  /**
   * A presented scene owns the screen (the oath beat), so the city's own inputs are
   * inert for as long as it does.  A ref, because the movement loop is mounted once
   * and reads refs only — a lock that arrived as React state would need the loop to
   * re-subscribe and would re-render the whole screen to boot.
   */
  const inputLockedRef = useRef<boolean>(!!movementLocked);

  useEffect(() => {
    inputLockedRef.current = !!movementLocked;
  }, [movementLocked]);

  // Interact with nearby landmark or update ambient audio
  useEffect(() => {
    if (nearbyLoc) {
      sounds.playAmbientLoop(nearbyLoc.district.toLowerCase() as any);
    } else {
      sounds.stopAmbient();
    }
    return () => sounds.stopAmbient(); // Cleanup on unmount
  }, [nearbyLoc]);

  // Handle interaction with nearby landmark
  const handleInteract = useCallback(() => {
    if (!nearbyLoc) return;
    sounds.playClick();
    if (nearbyLoc.id === 'east_circus_arena') {
      // Phase C-8.70B — the district's race entry opens the pre-race panel
      // rather than a hub tab.  Read-only: the panel takes the profile and
      // returns control to the city unchanged.
      setShowRaceEntry(true);
    } else if (nearbyLoc.tabKey === 'tournament') {
      // The door resolves its own ticket HERE, when the player interacts: the
      // current tier's first UNDEFEATED boss, which is the same boss the tournament
      // tab presents as the next one to beat. A stored `activeOpponent` is never
      // used — it can carry a fighter from a tier the player has already left. Once
      // every boss of the tier is down the door offers that tier's boss rematch,
      // which pays its rewards but cannot move the tier.
      const target = resolveDoorDuelTarget(
        playerProfile.currentTier,
        playerProfile.defeatedOpponentIds
      );
      if (!target) {
        onOpenTab('tournament');
        return;
      }
      // §R3B — the door reads the tab's own level gate, so it can never open a
      // fight the Colosseum tab would lock, and it opens the SAME pre-fight
      // briefing rather than dropping the player straight into the sand.
      const gate = resolveBoutLevelGate(
        playerProfile.level,
        target.opponent,
        playerProfile.defeatedOpponentIds
      );
      if (gate.locked) {
        // L19 — the old copy ("Train, and return") named no way to earn the levels,
        // which is exactly the dead end the tournament list now closes: the earlier
        // divisions' beaten fighters are offered there as rematches. The gate
        // itself is unchanged; only the guidance is accurate.
        setStableNotice(
          `The gatekeeper bars the way: ${target.opponent.name} requires LVL ${gate.requiredLevel}, and you are LVL ${playerProfile.level}. Earn the experience in the Colosseum's tournament list — rematches, earlier divisions included, stay open.`
        );
        setTimeout(() => {
          setStableNotice(null);
        }, 4000);
        return;
      }
      setPendingDuel(target.opponent);
    } else if (nearbyLoc.tabKey) {
      onOpenTab(nearbyLoc.tabKey, nearbyLoc.subTab, nearbyLoc.shopId);
    } else {
      // Elegant immersive fallback notification for locations with no immediate tab key
      if (nearbyLoc.id === 'doctore_house') {
        setStableNotice(
          "Doctore Tactical House: Chief Doctore is currently supervising advanced conditioning. Train hard, fight well, and Rome will learn your name."
        );
      } else if (nearbyLoc.id === 'shrine_temple') {
        setStableNotice(
          "Shrine of Fortuna: You offer a quiet prayer at the ancient shrine. The sacred precinct remains still and watchful."
        );
      } else if (nearbyLoc.id === 'gladiator_barracks') {
        setStableNotice(
          "Gladiator Barracks: Recruits rest here between training sessions, keeping their equipment prepared for the arena."
        );
      } else if (nearbyLoc.id === 'veteran_gladiator_hall') {
        setStableNotice(
          "Veteran Gladiator Hall: Old trophies and worn shields line the walls, honoring fighters who survived the arena."
        );
      } else if (nearbyLoc.id === 'caravanserai') {
        // L14 — the Caravanserai LODGES. The transaction decides everything
        // (`App.handleLodging` → `utils/lodging`): tonight's allowance, the
        // `25 × level` fee, and the one-day advance. This branch only asks and
        // reports, so it can neither lodge twice nor turn the clock itself — and
        // it never touches the injury, because a room is not the medicus.
        setStableNotice(lodgingNotice(onLodging(), playerProfile.level));
      } else if (nearbyLoc.id === 'arena_medical_house') {
        // L9 — the Medical House TREATS. The transaction decides everything
        // (`App.handleRest` → `utils/restRecovery`): eligibility, the `25 × level`
        // fee, clearing the wound and spending one city day. This branch only asks
        // and reports, so it can neither treat twice nor advance the clock itself
        // — a refusal leaves the profile untouched and says why instead.
        setStableNotice(restNotice(onRest(), playerProfile.level));
      } else {
        // Phase C-8.66B: the stable no longer falls through to this branch — its
        // interaction opens the Chariot Workshop through the gear tab's own
        // subview (see HUB_LOCATIONS). This is the neutral notice for any hub
        // left without a tab, e.g. the Northern Roman Fortress.
        setStableNotice(`${nearbyLoc.name}: ${nearbyLoc.subtitle}. Nothing to trade here yet.`);
      }
      // Auto dismiss after 4 seconds
      setTimeout(() => {
        setStableNotice(null);
      }, 4000);
    }
  }, [
    nearbyLoc,
    onEnterDuel,
    onRest,
    onLodging,
    playerProfile.currentTier,
    playerProfile.level,
    playerProfile.defeatedOpponentIds,
    onOpenTab,
  ]);

  /**
   * L17 — SPEAK WITH A VISITOR. This opens the existing Visitors panel and nothing
   * else: no second panel, no second purchase path, and no encounter is recorded
   * here — the panel's explicit selection is still the only thing that calls
   * `onEncounterVisitor`, so walking past a visitor changes no history at all.
   */
  const handleVisit = useCallback(() => {
    if (!nearbyVisitor) return;
    sounds.playClick();
    setShowVisitors(true);
  }, [nearbyVisitor]);

  /**
   * Phase C-8.70B Stage 1, Slice 1 — "Start Race" leaves the city for the race
   * scene.  The pose the player has to be returned to is captured HERE, from the
   * refs the movement loop writes (so it is the live position, not a lagging
   * render), and handed up to `App`: this scene is about to unmount, so this is
   * the only moment the pose exists.  Nothing is written to a save.
   */
  const handleStartRace = useCallback(() => {
    const pose: CityExitPose = {
      position: [...playerPosRef.current] as [number, number, number],
      rotationY: playerRotYRef.current,
    };
    setShowRaceEntry(false);
    onStartRace(pose);
  }, [onStartRace]);

  // Attack weapon strike
  const handleAttack = useCallback(() => {
    if (isAttacking) return;
    sounds.playSlash();
    setIsAttacking(true);
    setTimeout(() => {
      setIsAttacking(false);
    }, 420);
  }, [isAttacking]);

  // 2-in-1 Dual Action: Speak (visitor) → Interact (hub) → Attack if neither. A
  // valid visitor target therefore never triggers an attack, and a hub target is
  // only ever answered when no visitor won the interaction.
  const handlePrimaryAction = useCallback(() => {
    if (nearbyVisitor) {
      handleVisit();
    } else if (nearbyLoc) {
      handleInteract();
    } else {
      handleAttack();
    }
  }, [nearbyVisitor, nearbyLoc, handleVisit, handleInteract, handleAttack]);

  // Cross-platform PC Keyboard input listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A presented scene owns the screen: no movement key and no action key is read
      // while it does, so the beat cannot be walked out of.
      if (inputLockedRef.current) return;
      const code = e.code;
      const key = e.key.toLowerCase();

      if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') keysPressed.current['w'] = true;
      if (code === 'KeyS' || key === 's' || code === 'ArrowDown') keysPressed.current['s'] = true;
      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') keysPressed.current['a'] = true;
      if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') keysPressed.current['d'] = true;

      if (code === 'KeyE' || key === 'e' || code === 'Space') {
        e.preventDefault();
        handlePrimaryAction();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();

      if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') keysPressed.current['w'] = false;
      if (code === 'KeyS' || key === 's' || code === 'ArrowDown') keysPressed.current['s'] = false;
      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') keysPressed.current['a'] = false;
      if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') keysPressed.current['d'] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handlePrimaryAction]);

  // Mobile Virtual Joystick Touch Handlers
  const handleJoystickTouchStart = (e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    handleJoystickTouchMove(e);
  };

  const handleJoystickTouchMove = (e: React.TouchEvent) => {
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

        // Normalize direction (Left is negative x, Right is positive x)
        touchVectorRef.current = {
          x: dx / maxDist,
          z: dy / maxDist,
        };
        break;
      }
    }
  };

  const handleJoystickTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        touchVectorRef.current = { x: 0, z: 0 };
        break;
      }
    }
  };

  /**
   * L17 — the ONE interaction selection, run from the movement loop (and again
   * whenever the profile changes, so a visitor who leaves town cannot keep a
   * prompt). The hub scan is untouched — `getNearbyHubLocation` answers exactly
   * what it always did, and `nearbyLoc` keeps every established behaviour (its
   * branches, its fast-travel entries, the ambient district) — while
   * `resolveVisitorTarget` decides whether a visitor owns the prompt instead: only
   * when the player is inside the visitor's own disc AND strictly nearer than the
   * hub he is also standing in. A tie or a nearer hub leaves the hub in charge.
   * State is only written when the selected id changes, so a frame that changes
   * nothing costs two comparisons.
   */
  const syncNearbyTargets = useCallback(() => {
    const hub = getNearbyHubLocation(playerPosRef.current);
    const visitor = resolveVisitorTarget(playerPosRef.current, visitorPresenceRef.current, hub);
    const hubId = hub ? hub.id : null;
    if (hubId !== lastNearbyIdRef.current) {
      lastNearbyIdRef.current = hubId;
      setNearbyLoc(hub);
    }
    const visitorId = visitor ? visitor.presence.visitor.id : null;
    if (visitorId !== lastVisitorIdRef.current) {
      lastVisitorIdRef.current = visitorId;
      setNearbyVisitor(visitor);
    }
  }, []);

  // L17 — mirror the presence list into the loop's ref, then re-resolve the target
  // NOW: a trade completes a visitor and a day advance removes them, so a body can
  // disappear while the player is standing in its disc.
  useEffect(() => {
    visitorPresenceRef.current = visitorPresence;
    syncNearbyTargets();
  }, [visitorPresence, syncNearbyTargets]);

  // Continuous, non-stuttering 60fps Movement Loop
  useEffect(() => {
    let animId: number;

    const loop = () => {
      const now = performance.now();
      const delta = Math.min(0.08, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      let inputX = 0;
      let inputZ = 0;

      // A presented scene owns the screen: while it does, no input is read at all, so
      // the player stands exactly where the scene found him.
      if (!inputLockedRef.current) {
        // Keyboard input
        if (keysPressed.current['w']) inputZ -= 1;
        if (keysPressed.current['s']) inputZ += 1;
        if (keysPressed.current['a']) inputX -= 1;
        if (keysPressed.current['d']) inputX += 1;

        // Mobile joystick input
        if (touchVectorRef.current.x !== 0 || touchVectorRef.current.z !== 0) {
          inputX += touchVectorRef.current.x;
          inputZ += touchVectorRef.current.z;
        }
      }

      if (inputX !== 0 || inputZ !== 0) {
        const rawLen = Math.sqrt(inputX * inputX + inputZ * inputZ);
        const normX = inputX / rawLen;
        const normZ = inputZ / rawLen;
        const mag = Math.min(1, rawLen);

        // Compute camera-relative forward and right vectors based on active camera yaw
        const camYaw = cameraYawRef.current;
        const forwardX = Math.sin(camYaw);
        const forwardZ = Math.cos(camYaw);
        const rightX = -Math.cos(camYaw);
        const rightZ = Math.sin(camYaw);

        // Transform screen/joystick direction into 3D world space
        // normZ < 0 is joystick UP (Forward into screen), normX > 0 is joystick RIGHT
        const worldDx = normX * rightX - normZ * forwardX;
        const worldDz = normX * rightZ - normZ * forwardZ;

        // Grounded, controlled gladiator stride speed with analog control
        const speed = 3.8 * mag;
        const nextPos = resolveCityMovement(playerPosRef.current, worldDx, worldDz, speed, delta);
        // Phase 34G: Apply terrain height from the motte ramp/summit.
        // getTerrainY returns 0 on flat city ground, so existing
        // movement is unaffected outside the motte area.
        nextPos[1] = getTerrainY(nextPos[0], nextPos[2]);
        playerPosRef.current = nextPos;

        // Smooth angle rotation towards target movement direction
        const targetAngle = Math.atan2(worldDx, worldDz);
        let angleDiff = targetAngle - playerRotYRef.current;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        playerRotYRef.current += angleDiff * Math.min(1, delta * 11.0);

        // Phase 26.1: Position/rotation are applied via refs in useFrame
        // (GladiatorMesh, CityCamera), NOT through React state. This eliminates
        // the per-frame re-render of the entire component tree that caused
        // character vibration on mobile. setIsMoving is only called when the
        // value actually changes (React skips if same).
        if (!isMovingRef.current) {
          isMovingRef.current = true;
          setIsMoving(true);
        }
      } else {
        if (isMovingRef.current) {
          isMovingRef.current = false;
          setIsMoving(false);
        }
      }

      // Check proximity to landmarks AND visitors (only updates state on a change).
      syncNearbyTargets();

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [syncNearbyTargets]);

  // Fast Travel teleport — Phase 31D: uses verified exterior arrival points
  const handleFastTravel = (loc: InteractiveLocation) => {
    sounds.playClick();
    const arrival = FAST_TRAVEL_ARRIVALS[loc.id];
    const ax = arrival ? arrival[0] : loc.position[0];
    const az = arrival ? arrival[1] : loc.position[2] + 2;
    // Phase 34G: Calculate Y from terrain height instead of hardcoding 0.
    // Most arrival points are on flat ground (Y=0), but the northern_fortress
    // arrival is on the motte summit (Y≈4.72).
    const newPos: [number, number, number] = [ax, getTerrainY(ax, az), az];
    playerPosRef.current = newPos;
    setPlayerPos(newPos);
    // SF-1 — a fast travel is a scene transition: the engine stops reading frames
    // for it and for the second after arrival, so the teleport's own hitches cannot
    // be mistaken for a device that cannot hold the tier's DPR.
    suspendAdaptation();
    // Phase 31J: clear stale recovery history so oscillation-prevention
    // entries from the previous location don't block escape at the new one.
    clearRecoveryHistory();
    setShowNavDrawer(false);
  };

  const calculatedStats = useMemo(() => calculateTotalStats(playerProfile), [playerProfile]);
  // RG-3 — the gladiator's banner, derived: no device means no banner, and the champion
  // stage is what raises it at the gate. Nothing here writes the save.
  const championBanner = useMemo(() => resolveBanner(playerProfile), [playerProfile]);

  /**
   * The herald's destination, resolved against the city's own registry: the pointer
   * carries a `HUB_LOCATIONS` id and this screen turns that id into the name, the
   * district and the subtitle the card shows — so the pointer can never name a place
   * the city does not have, and an id that is not in the table renders no pointer at
   * all rather than a broken one.
   */
  const heraldTarget = useMemo(
    () => (heraldAim ? HUB_LOCATIONS.find((location) => location.id === heraldAim.id) ?? null : null),
    [heraldAim]
  );

  // Phase 26.1: Memoized so it doesn't change reference on unrelated
  // re-renders (e.g. setKnobPos). Position/rotation are overridden by
  // useFrame via refs, so their stale values here are harmless.
  const cityPlayerFighter = useMemo<FighterState>(() => ({
    id: 'city_player',
    name: playerProfile.name,
    title: playerProfile.title,
    isPlayer: true,
    position: playerPos,
    rotationY: playerRotY,
    health: calculatedStats.healthMax,
    stamina: calculatedStats.staminaMax,
    action: isAttacking ? 'attack_light' : isMoving ? 'walk' : 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: calculatedStats,
    loadout: { weapon: playerProfile.equipped.weapon || DEFAULT_PLAYER_WEAPON },
    comboCount: 0,
    skinColor: playerProfile.appearance.skinColor,
    hairColor: playerProfile.appearance.hairColor,
    tunicColor: playerProfile.appearance.tunicColor,
    crestColor: playerProfile.appearance.crestColor,
    clothingStyle: playerProfile.appearance.clothingStyle,
    characterModel: playerProfile.appearance.characterModel || 'roman_warrior',
    isLeftyMode: isLeftyMode,
  }), [playerProfile, playerPos, playerRotY, isMoving, isAttacking, isLeftyMode, calculatedStats]);

  /**
   * L17 — the visitors' bodies and their pitch. Same factory (`createAmbientFighter`)
   * and same `GladiatorMesh` as the ambient extras, so a visitor is one more idle
   * gladiator rather than a second character system; the only differences are the
   * `VISITOR_*` dyes and the frozen yaw from the stall table. Each is marked by ONE
   * existing `TimberCrate` set down at their right hand — the stall cue — which is
   * three meshes rather than a `MerchantCart`'s twenty (see the L17 record). Both
   * lists come straight from the presence resolver, so a departed visitor's body
   * and crate disappear together.
   */
  const visitorStalls = useMemo(
    () =>
      visitorPresence.map((presence) => {
        const { x, z, facing } = presence.stall;
        const y = getTerrainY(x, z);
        // The crate stands at the visitor's right hand, half a stride out.
        const crateX = x + Math.cos(facing) * 0.95;
        const crateZ = z - Math.sin(facing) * 0.95;
        return {
          fighter: {
            ...createAmbientFighter(
              `visitor_${presence.visitor.id}`,
              presence.visitor.name,
              'roman_warrior',
              [x, y, z],
              facing
            ),
            tunicColor: VISITOR_TUNIC_COLOR,
            crestColor: VISITOR_CREST_COLOR,
          },
          crate: [crateX, getTerrainY(crateX, crateZ), crateZ] as [number, number, number],
        };
      }),
    [visitorPresence]
  );

  return (
    <div className="relative w-full h-full min-h-[100dvh] bg-neutral-950 overflow-hidden select-none">
      {/* 3D WEBGL 3RD-PERSON CITY CANVAS WITH EXPANDED FOV */}
      <WebGLReadyGuard
        sceneName="CityHubMetropolis"
        fallbackTitle="3D Metropolis WebGL Error"
        onFallbackTo2D={() => onOpenTab('tournament')}
      >
        <WebGLContextErrorBoundary
          fallbackTitle="3D Metropolis WebGL Error"
          sceneName="CityHubMetropolis"
          onFallbackTo2D={() => onOpenTab('tournament')}
        >
          <Canvas
            shadows
            frameloop={frameloopMode}
            /* SF-1 — the tier's band replaces the old [1, 2]: Balanced, the default,
               now tops out at the studio budget's 1.5 instead of asking for 2. */
            dpr={cityDpr}
            camera={{ position: [0, 5, 24], fov: 58, near: 0.1, far: 180 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            onCreated={(state) => {
              logCanvasWebGLCreated(state.gl, 'CityHubMetropolis');
              setupCanvasContextRestoration(state.gl);
            }}
          >
            {/* Active GPU Health & Context Monitor */}
            <CanvasWebGLMonitor sceneName="CityHubMetropolis" />
            {/* SF-1 — the city's pixel governor, inside the Canvas because only here
                does a frame's own duration exist. */}
            <CityAdaptiveDpr
              tier={qualityPreset}
              suspendedRef={adaptationSuspendedRef}
              onDprChange={setCityDpr}
            />
            {/* C-8.70B §SET-1 — the brightness row, applied on creation and live. */}
            <SceneBrightness />

            {/* Atmospheric Mediterranean Horizon Fog — and, at dawn, the oath's own
                shorter band.  Both come from the named light profile. */}
            <fog attach="fog" args={[lights.fogColor, lights.fogNear, lights.fogFar]} />

            <Sky
              sunPosition={lights.sunPosition}
              turbidity={lights.skyTurbidity}
              rayleigh={lights.skyRayleigh}
              mieCoefficient={lights.skyMieCoefficient}
            />
            {/* Phase 24 — Calibrated Mediterranean Sunlight & Contrast.
                Phase 2A: hemisphere replaces flat ambient; shadow camera bounds
                expanded from default ±5 to cover full city; bias added; Sky aligned. */}
            <hemisphereLight
              color={lights.ambientSky}
              groundColor={lights.ambientGround}
              intensity={lights.ambientIntensity}
            />
            <directionalLight
              position={lights.sunPosition}
              intensity={lights.keyIntensity}
              color={lights.keyColor}
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-70}
              shadow-camera-right={50}
              shadow-camera-top={50}
              shadow-camera-bottom={-50}
              shadow-camera-near={1}
              shadow-camera-far={140}
              shadow-bias={-0.0004}
              shadow-normalBias={0.02}
            />
            <directionalLight
              position={[-25, 20, -25]}
              intensity={lights.fillIntensity}
              color={lights.fillColor}
            />

            {/* Phase 2B — Scene-level PBR environment for metallic/physical material reflections.
                The visible <Sky> is a mesh, not an environment map; without this, materials with
                metalness > 0 (darkIron, agedBronze, goldAccent) render flat black with no specular.
                Procedural Lightformers are rendered ONCE into a 256px cubemap, PMREM-processed,
                and assigned to scene.environment. environmentIntensity=0.35 keeps reflections
                subtle so warm Roman material colors remain readable. No external HDR files. */}
            <Environment resolution={256} frames={1} environmentIntensity={lights.environmentIntensity}>
              {environmentLightformers}
            </Environment>

            {/* Distant Roman Hills & Aqueduct Backdrop */}
            <ThreeComponentErrorBoundary componentName="CityBackdrop">
              {/* Phase 34G: Moved north from Z=-98 to Z=-115 to avoid
                  intersection with the motte (moat ring north at Z=-90).
                  Phase 34I: Inner hills (X=±15) moved further north to
                  local Z=-7 (world Z=-122) to clear the motte mesh's
                  visible outer boundary (northmost at Z≈-93.16).  Outer
                  hills (X=±45) and aqueduct (local Z=12, world Z=-103)
                  remain at their original positions — only the inner
                  hills' spheres (radius 26) intersected the motte at
                  Y=0.  Clearance at Z=-122: ~6 units (inner hills).
                  Phase 35F.5: Moved north from Z=-115 to Z=-119 to
                  preserve visual spacing behind the shifted motte. */}
              <group position={[0, 0, -119]}>
                {/* Distant Rolling Tuscan Hills */}
                {[-45, -15, 15, 45].map((hx, hi) => (
                  <mesh key={`hill-${hi}`} position={[hx, 8 + (hi % 2) * 4, hi === 1 || hi === 2 ? -7 : 0]}>
                    <sphereGeometry args={[26, 16, 12]} />
                    <meshStandardMaterial color="#8a8b7a" roughness={0.9} />
                  </mesh>
                ))}
                {/* Distant Roman Aqueduct Arches on Horizon */}
                {Array.from({ length: 12 }).map((_, ai) => (
                  <group key={`aq-${ai}`} position={[-50 + ai * 9, 7, 12]}>
                    <mesh position={[0, 3, 0]}>
                      <boxGeometry args={[1.4, 7.5, 1.4]} />
                      <meshStandardMaterial color="#d6c4aa" roughness={0.8} />
                    </mesh>
                    <mesh position={[4.5, 7.2, 0]}>
                      <boxGeometry args={[9.5, 1.4, 1.6]} />
                      <meshStandardMaterial color="#c4a878" roughness={0.8} />
                    </mesh>
                  </group>
                ))}
              </group>
            </ThreeComponentErrorBoundary>

            {/* Floating Atmospheric Desert Dust Particles.
                SF-1 — the count is the tier's (Swift 0 / Balanced 60 / Cinematic 90,
                the last being the pre-slice count), and the drifting atmosphere obeys
                the motion switch, which Swift forces off.  `count` is the component's
                own visibility path and `visible` is three's, so neither adds a code
                path: Swift draws no dust at all. */}
            <DreiSparkles count={sparklesCount} scale={[80, 20, 80]} size={2.8} speed={0.35} color="#fef08a" opacity={0.65} />
            <group visible={atmosphericMotion}>
              <SandDrift />
            </group>

            {/* 3D Architectural City Components Wrapped in Error Boundary */}
            <ThreeComponentErrorBoundary componentName="CityArchitecturalDistricts">
              <IshtarGatehouse />
              <ProcessionAvenue />
              <CityStreets />
              <SmithingForge />
              <TrainingYard />
              <CityTavern />
              <GeneralStore />
              <CaravanseraiInn />
              <GrandColosseum />
              {/* RG-3 — the champion's banner, raised at the gate once the Colossus falls. */}
              {championBanner?.atGate && (
                <ChampionBannerPole
                  device={championBanner.device}
                  stripes={championBanner.stripes}
                />
              )}
              <MerchantHouse />
              <ArmorLeatherWorkshop />
              <Stable />
              <GladiatorAcademy />
              <DoctoreHouse />
              <RecordsLibrary />
              <PublicBathhouse />
              <RomanShrine />
              <BountyHall />
              <GladiatorBarracks />
              <VeteranGladiatorHall />
              <ArenaMedicalHouse />
              <NorthernMotte />
              <Drawbridge />
              <NorthernFortress />
              {/* Phase C-8.64A — East Circus District: the chariot arena's
                  placement prototype, east of the city (X 37.6 … 66.3).  Its own
                  Suspense (the Colosseum sign's pattern) keeps the GLB's first
                  parse from suspending the rest of the city. */}
              <Suspense fallback={null}>
                <EastCircusArena />
              </Suspense>
              {/* Phase C-8.64B — East Circus District: the paved approach
                  roads, the carceres forecourt and its parapet.  Mounted once,
                  immediately after the arena it serves.  No asset of its own,
                  so it needs no Suspense; every footprint comes from
                  utils/circusDistrictGeometry.ts. */}
              <EastCircusDistrict />
            </ThreeComponentErrorBoundary>

            {/* 3D Player Gladiator Model Wrapped in Error Boundary */}
            <ThreeComponentErrorBoundary componentName="CityPlayerGladiator">
              <Suspense fallback={<CanvasLoadingFallback />}>
                <GladiatorMesh fighter={cityPlayerFighter} isLeftyMode={isLeftyMode} positionRef={playerPosRef} rotationRef={playerRotYRef} />
                {/* Ambient Characters */}
                {AMBIENT_CHARACTERS.map(fighter => (
                    <GladiatorMesh key={fighter.id} fighter={fighter} />
                ))}
                {/* L17 — the visitors in town today, at their own stalls. The list
                    IS the visibility gate (it is derived from the saved day and the
                    completion history), so there is no per-frame work and no second
                    condition; they carry no collider, so the walk-through behaviour
                    of every character in the city is unchanged. */}
                {visitorStalls.map((stall) => (
                  <GladiatorMesh key={stall.fighter.id} fighter={stall.fighter} />
                ))}
                {visitorStalls.map((stall) => (
                  <TimberCrate
                    key={`stall-crate-${stall.fighter.id}`}
                    position={stall.crate}
                    rotationY={stall.fighter.rotationY}
                  />
                ))}
              </Suspense>
            </ThreeComponentErrorBoundary>

          {/* ELEVATED 3RD-PERSON CHASE CAMERA WITH HOLD-AND-DRAG ORBIT & PITCH */}
          <CityCamera targetPosition={playerPos} targetPositionRef={playerPosRef} targetRotationY={playerRotY} isMoving={isMoving} cameraYawRef={cameraYawRef} />
        </Canvas>
      </WebGLContextErrorBoundary>
    </WebGLReadyGuard>

      {/* TOP STATUS HEADER BAR */}
      <header className="absolute top-0 left-0 right-0 p-3 sm:p-5 pointer-events-none flex justify-between items-start z-10">
        <div className="pointer-events-auto flex flex-col items-start gap-2">
        <div className="flex items-center gap-2 bg-neutral-950/85 border border-amber-600/50 p-2 sm:p-3 rounded-2xl backdrop-blur-md shadow-2xl">
          <button
            onClick={() => setShowNavDrawer(!showNavDrawer)}
            className="p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer active:scale-95 transition-all"
            title="City Map & Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <div className="font-serif font-black text-xs sm:text-sm text-amber-100 flex items-center gap-1.5">
              <span>{playerProfile.name}</span>
              <span className="text-[10px] text-amber-400 font-mono bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/50">
                LVL {playerProfile.level}
              </span>
            </div>
            <div className="text-[10px] text-neutral-400 font-serif truncate max-w-[130px] sm:max-w-[200px]">
              {playerProfile.title}
            </div>
          </div>
        </div>

          {/* THE HERALD — the city's one pointer at the next beat. Session-scoped and
              read-only: it names a landmark the city already has and opens the existing
              city map, so it never moves the player and never touches the save. Held down
              for the arrival the oath is telling (see `App`'s city entry). */}
          {heraldTarget && heraldAim && (
            <div
              data-herald-aim={heraldTarget.id}
              className="w-[min(72vw,15rem)] rounded-2xl border border-amber-500/50 bg-neutral-950/85 p-2 sm:p-3 backdrop-blur-md shadow-2xl"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">
                The herald points
              </div>
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setShowNavDrawer(true);
                }}
                className="mt-1 flex w-full min-h-[48px] items-center gap-2 rounded-xl border border-amber-600/40 bg-amber-500/10 px-2 text-left cursor-pointer active:scale-[0.98] transition-all hover:bg-amber-500/20"
                title={`${heraldTarget.actionPrompt} — open the city map`}
              >
                <MapPin className="w-4 h-4 shrink-0 text-amber-400" />
                <span className="min-w-0">
                  <span className="block font-serif font-bold text-[11px] leading-tight text-amber-100 truncate">
                    {heraldTarget.name}
                  </span>
                  <span className="block text-[10px] leading-tight text-neutral-400 truncate">
                    {heraldTarget.district} · {heraldTarget.subtitle}
                  </span>
                </span>
              </button>
              <p className="mt-1.5 font-serif text-[10px] leading-snug text-neutral-300">
                {heraldAim.note}
              </p>
            </div>
          )}
        </div>

        {/* GOLD, FAME, GOOGLE DRIVE & AUDIO */}
        <div className="flex flex-wrap justify-end items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-3 bg-neutral-950/85 border border-amber-600/50 px-3 py-1.5 rounded-2xl backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-1 text-xs font-bold text-amber-300">
              <Coins className="w-4 h-4 text-yellow-400" />
              <span>{playerProfile.gold}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-purple-300">
              <Trophy className="w-4 h-4 text-purple-400" />
              <span>{playerProfile.fame}</span>
            </div>
          </div>

          {visitorArrivals.length > 0 && (
            <button
              onClick={() => {
                sounds.playClick();
                setShowVisitors(true);
              }}
              className="min-h-[48px] px-3 rounded-2xl bg-neutral-950/85 border border-amber-500/60 text-amber-200 hover:text-amber-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all flex items-center gap-2 font-serif font-bold text-xs uppercase tracking-wider"
              title={`Visitors in the city today: ${visitorArrivals.map((a) => a.visitor.name).join(', ')}`}
              data-testid="city-visitors-button"
            >
              <Users className="w-5 h-5 text-amber-300" />
              <span className="hidden sm:inline">Visitors</span>
              <span className="text-[10px] font-mono bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/50">
                {visitorArrivals.length}
              </span>
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="min-h-[48px] px-3 rounded-2xl bg-neutral-950/85 border border-amber-500/50 text-amber-300 hover:text-amber-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all flex items-center gap-2 font-serif font-bold text-xs uppercase tracking-wider"
              title="Game Settings (Touch, Sound, Picture)"
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
          )}

          <button
            onClick={onOpenDriveSync}
            className="p-2.5 rounded-2xl bg-neutral-950/85 border border-cyan-500/50 text-cyan-300 hover:text-cyan-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all"
            title="Google Drive Cloud Saves"
          >
            <Cloud className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleMute}
            className="p-2.5 rounded-2xl bg-neutral-950/85 border border-amber-600/50 text-amber-300 hover:text-amber-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            onClick={onReturnToMainMenu}
            className="px-3 py-2 rounded-2xl bg-neutral-900/90 border border-neutral-700 hover:border-amber-500/60 text-neutral-300 hover:text-amber-200 text-xs font-serif font-bold backdrop-blur-md cursor-pointer active:scale-95 transition-all shadow-xl"
          >
            Main Menu
          </button>
        </div>
      </header>

        {/* MOBILE & PC TOUCH CONTROLS OVERLAY */}
        <div className="absolute inset-0 pointer-events-none z-20 flex justify-between items-end p-4 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+var(--hub-footer-h)+1rem)] sm:pb-[calc(env(safe-area-inset-bottom)+var(--hub-footer-h)+1.5rem)] flex-row">
          {/* MOBILE VIRTUAL JOYSTICK */}
          <div className="pointer-events-auto touch-none flex flex-col items-center ml-[env(safe-area-inset-left)] mr-[env(safe-area-inset-right)]">
            <div
              ref={joystickRef}
              onTouchStart={handleJoystickTouchStart}
              onTouchMove={handleJoystickTouchMove}
              onTouchEnd={handleJoystickTouchEnd}
              onTouchCancel={handleJoystickTouchEnd}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-950/60 border-2 border-amber-600/50 relative flex items-center justify-center backdrop-blur-md shadow-2xl active:border-amber-400 select-none"
            >
              {/* Direction markers */}
              <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>
              <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>
              <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>
              <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>

              {/* Inner draggable knob */}
              <div
                className="w-10 h-10 rounded-full bg-gradient-to-b from-amber-500 to-amber-700 border-2 border-amber-300 shadow-lg flex items-center justify-center transition-transform"
                style={{
                  transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
                }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-amber-200/90"></div>
              </div>
            </div>
          </div>

          {/* 2-IN-1 ATTACK / INTERACT ACTION BUTTON */}
          <div className="pointer-events-auto flex flex-col items-end gap-1.5 mr-[env(safe-area-inset-right)] ml-[env(safe-area-inset-left)]">
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                handlePrimaryAction();
              }}
              onClick={handlePrimaryAction}
              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 flex flex-col items-center justify-center shadow-2xl active:scale-90 transition-all cursor-pointer ${
                nearbyVisitor || nearbyLoc
                  ? 'bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 border-yellow-300 text-neutral-950 shadow-[0_0_25px_rgba(245,158,11,0.8)] animate-pulse'
                  : 'bg-gradient-to-br from-red-600 via-rose-700 to-red-900 border-red-300 text-white shadow-[0_0_20px_rgba(225,29,72,0.6)]'
              }`}
              title={
                nearbyVisitor
                  ? `${visitorPrompt(nearbyVisitor)} [E / Space]`
                  : nearbyLoc
                  ? `Interact with ${nearbyLoc.name} [E / Space]`
                  : 'Attack with Weapon [Space / E]'
              }
            >
              {/* L17 — the same control, relabelled for whoever owns the action:
                  VISIT while a visitor is the selected target, ENTER [E] at a hub,
                  ATTACK when there is nothing to speak to or enter. */}
              {nearbyVisitor ? (
                <>
                  <Users className="w-6 h-6 sm:w-8 sm:h-8" />
                  <span className="text-[9px] sm:text-xs font-serif font-black uppercase tracking-wider mt-0.5">
                    VISIT
                  </span>
                </>
              ) : nearbyLoc ? (
                <>
                  <SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8 fill-neutral-950 text-neutral-950" />
                  <span className="text-[9px] sm:text-xs font-serif font-black uppercase tracking-wider mt-0.5">
                    ENTER [E]
                  </span>
                </>
              ) : (
                <>
                  <Swords className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  <span className="text-[9px] sm:text-xs font-serif font-black uppercase tracking-wider mt-0.5">
                    ATTACK
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

      {/* L17 — THE VISITOR PROMPT. Only the selected target speaks: a visitor
          raises this banner, and the hub banner below stands down while it is up. */}
      {nearbyVisitor && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-bounce hidden sm:block">
          <button
            onClick={handleVisit}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.7)] border-2 border-amber-200 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <Users className="w-4 h-4 text-neutral-950" />
            <span>{visitorPrompt(nearbyVisitor)} [E / Space]</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PROXIMITY INTERACTION BANNER (CENTER DESKTOP POPUP) */}
      {nearbyLoc && !nearbyVisitor && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-bounce hidden sm:block">
          <button
            onClick={handleInteract}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.7)] border-2 border-amber-200 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <SparklesIcon className="w-4 h-4 fill-neutral-950 text-neutral-950" />
            <span>{nearbyLoc.actionPrompt} [E / Space]</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* IMMERSIVE LANDMARK / STABLE NOTICE BANNER */}
      {stableNotice && (
        <div className="absolute top-36 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-sm sm:max-w-md w-[90%] bg-neutral-950/95 border-2 border-amber-500/80 p-4 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-fadeIn">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-400" />
                <span>Imperial Announcement</span>
              </h4>
              <p className="text-[11px] sm:text-xs text-neutral-300 font-sans leading-relaxed">
                {stableNotice}
              </p>
            </div>
            <button
              onClick={() => setStableNotice(null)}
              className="text-neutral-400 hover:text-amber-200 font-bold text-sm cursor-pointer select-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* PRE-FIGHT BRIEFING — the same modal the tournament tab uses, so the
          Colosseum door confirms the bout before the sand (§R3B). */}
      {pendingDuel && (
        <PreFightModal
          opponent={pendingDuel}
          injury={playerProfile.injury}
          onConfirm={() => {
            const opp = pendingDuel;
            setPendingDuel(null);
            onEnterDuel(opp);
          }}
          onCancel={() => setPendingDuel(null)}
        />
      )}

      {/* L11 — THE VISITOR PANEL. Opens from the header's visitor chip, which only
          appears on a day the schedule has someone in the city; selecting a visitor
          there is the encounter that records `seenVisitors`. */}
      {showVisitors && (
        <VisitorPanel
          profile={playerProfile}
          onEncounter={onEncounterVisitor}
          onPurchase={onPurchaseVisitor}
          onClose={() => setShowVisitors(false)}
        />
      )}

      {/* DESKTOP CONTROLS HELPER BAR */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 -translate-x-1/2 pointer-events-none hidden md:flex items-center gap-3 text-[11px] font-mono text-amber-200/85 bg-neutral-950/80 py-1.5 px-4 rounded-xl border border-amber-800/60 backdrop-blur-sm z-10 shadow-lg">
        <span><kbd className="bg-neutral-800 text-amber-300 px-1 py-0.5 rounded border border-neutral-700">W A S D / Arrows</kbd> Move</span>
        <span><kbd className="bg-neutral-800 text-amber-300 px-1 py-0.5 rounded border border-neutral-700">Space / E</kbd> 2-in-1 Attack &amp; Interact</span>
      </div>

      {/* BOTTOM DISTRICT FAST-TRAVEL & TAB SHORTCUT BAR */}
      <footer className="absolute bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] left-2 right-2 sm:bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:left-6 sm:right-6 pointer-events-auto z-10">
        <div className="max-w-3xl mx-auto bg-neutral-950/90 border border-amber-600/50 rounded-2xl p-1.5 sm:p-2 backdrop-blur-md shadow-2xl flex flex-nowrap items-center justify-between gap-1 overflow-hidden">
          {[
            { id: 'tournament', label: 'Colosseum', icon: Swords, color: 'text-red-400' },
            { id: 'training', label: 'Training Yard', icon: Dumbbell, color: 'text-orange-400' },
            { id: 'shop', label: 'Smith & Bazaar', icon: ShoppingCart, color: 'text-yellow-400' },
            { id: 'gear', label: 'Armory', icon: Layers, color: 'text-cyan-400' },
            { id: 'stats', label: 'Gladiator Stats', icon: BarChart2, color: 'text-purple-400' },
            { id: 'library', label: 'Records & Lore', icon: BookOpen, color: 'text-amber-300' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sounds.playClick();
                  onOpenTab(item.id as 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library');
                }}
                className="flex-1 min-w-[54px] py-1.5 sm:py-2 px-1 rounded-xl hover:bg-amber-500/20 text-neutral-300 hover:text-amber-200 flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${item.color}`} />
                <span className="text-[10px] sm:text-[11px] font-serif font-bold tracking-tight truncate">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </footer>

      {/* QUICK TRAVEL DRAWER */}
      {showNavDrawer && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-serif font-black text-amber-200 text-lg flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-400" />
                <span>City Map &amp; Settings</span>
              </h3>
              <button
                onClick={() => setShowNavDrawer(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-amber-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 mb-2">
              Districts &amp; Fast Travel
            </div>

            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {HUB_LOCATIONS.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => handleFastTravel(loc)}
                  className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/80 hover:bg-amber-950/60 border border-neutral-800 hover:border-amber-500/60 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-serif font-bold text-xs sm:text-sm text-amber-100 group-hover:text-amber-300">
                        {loc.name}
                      </div>
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] font-mono font-bold text-amber-400/90 bg-amber-950/80 px-1.5 rounded border border-amber-800/60 uppercase">
                          {loc.district}
                        </span>
                        <span className="truncate">{loc.subtitle}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-amber-300 transition-transform group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PHASE C-8.70B — EAST CIRCUS DISTRICT PRE-RACE ENTRY PANEL.
          Opened by the district's own hub trigger; read-only (see PreRacePanel).
          "Start Race" closes it and hands the race scene the pose to come back
          to (Stage 1, Slice 1). */}
      {showRaceEntry && (
        <PreRacePanel
          profile={playerProfile}
          onLeave={() => setShowRaceEntry(false)}
          onStartRace={handleStartRace}
        />
      )}
    </div>
  );
};
