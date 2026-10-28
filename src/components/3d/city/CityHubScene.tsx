import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sparkles as DreiSparkles, Sky, Environment, Lightformer, useGLTF } from '@react-three/drei';
import { PlayerProfile, OpponentConfig, FighterState } from '../../../types/game';
import { IshtarGatehouse } from './IshtarGatehouse';
import { ProcessionAvenue } from './ProcessionAvenue';
import { CityStreets } from './CityStreets';
import { SmithingForge } from './SmithingForge';
import { TrainingYard } from './TrainingYard';
import { CityTavern } from './CityTavern';
import { GeneralStore } from './GeneralStore';
import { CaravanseraiInn } from './CaravanseraiInn';
import { GrandColosseum } from './GrandColosseum';
import { ChampionBannerPole } from './ChampionBannerPole';
import { resolveBanner } from '../../../utils/heraldry';
import { resolveDoorDuelTarget } from '../../../utils/tierAdvancement';
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
import { CityAtmosphere } from './CityAtmosphere';
// Day/Night T3 — the ONE emissive driver the city's fixtures register with, the two
// dressing meshes that had no mesh to ride, and the HUD's phase medallion.
import { CityNightDressing } from './CityNightDressing';
import { applyCityFixtureGlow } from '../../../utils/cityFixtureGlow';
import { applyCityFixtureLightGlow } from '../../../utils/cityFixtureLight';
import { PhaseMedallion } from '../../ui/PhaseMedallion';
import { resolveTimeState } from '../../../utils/timeState';
import { getPhaseLight } from '../../../utils/atmosphere';
import { SceneBrightness } from '../SceneBrightness';
import { GladiatorMesh } from '../GladiatorMesh';
import { AMBIENT_CHARACTERS } from '../../../data/ambientCharacters';
import { CORE_3D_ASSETS } from '../../../utils/preloadAssets';
import { Banner, SteamParticles, ForgeSmoke, SandDrift } from './EnvironmentalMotion';
import { CLOSE_BUTTON_CLASS } from '../../ui/controlStyles';
// SF-1 — the city's picture budget: the tier table and the adaptive engine that
// steps inside a tier's DPR band, plus the one settings reader the drifting dust
// obeys (the preset itself arrives through `useSettings`).
import { CITY_TIERS, POST_TRANSITION_MS, useAdaptiveDpr } from '../../../hooks/useAdaptiveDpr';
import { getEffectiveAtmosphereMotion } from '../../../services/settings';
import type { QualityPreset } from '../../../services/settings';
import { useSettings } from '../../../hooks/useSettings';
// Phase C-8.70B — the East Circus District's read-only pre-race entry panel.
import { PreRacePanel } from '../../hub/PreRacePanel';
// S5 — the two cures: the Medical House's price and the inn's rest are the injury
// module's own numbers, and this screen writes no save (App owns the transaction).
import {
  REST_PRICE,
  getTreatmentEligibility,
  injuryBannerLine,
  resolveActiveInjury,
  treatmentPrice,
  type TreatmentService,
} from '../../../utils/injury';

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
import { applyDeadZone } from '../../../utils/joystickDeadZone';
import { resolveCityLightProfile, type CityLightProfile } from '../../../utils/cityLightProfile';
import type { HeraldAim } from '../../../utils/cityHerald';
import { DEFAULT_PLAYER_WEAPON } from '../../../data/itemsDB';
import type { StorefrontId } from '../../../data/shops';
import { calculateTotalStats } from '../../../services/storage';
// A8 — the Library building's own prompt carries a ✦ while earned deeds are unread.
import { hasUnviewedTriumphs } from '../../../utils/triumphs';
import { sounds } from '../../../audio/soundEffects';
import { getConsumableCount, ownedConsumables } from '../../../utils/consumables';
// S7 — the tavern's rumour list and its one price.  Information only: nothing
// in the combat path reads this module.
import {
  getIntelPurchaseEligibility,
  intelTargets,
  INTEL_PRICE,
} from '../../../utils/intel';
// PITCH A1 — Fortuna's shrine: the omen's price, its lazy read, and the copy the
// panel prints.  The transactions live in `App`; this screen only reports the
// player's choice and writes no save.
import {
  OMEN_PRICE,
  omenDeclineResultLine,
  omenLine,
  omenOfferResultLine,
  resolveOmen,
} from '../../../utils/omens';
import type { OmenDeclineOutcome, OmenOfferOutcome } from '../../../utils/omens';
// K2 — the three service counters' keepers (the Medical House's Medica, the inn's
// host, the Golden Palm's keeper), the plate that heads them, and the one line
// each is saying.  Display and a first-visit record only: no price, no effect and
// no purchase rule is read here.
import { getKeeperForBuilding, nightClerkLine, resolveSeenKeepers, selectRepeatLine } from '../../../data/keepers';
// K4 — the treatment counters' STATE lines (a live injury, or its absence at the Inn).
import { keeperStateLineFor } from '../../../utils/keeperStateLines';
import type { Keeper } from '../../../data/keepers';
import { KeeperPlate } from '../../hub/KeeperPlate';
// STORY-4b — the Bounty Hall's board panel. It owns the ladder's reading, the
// printed rules and the keeper's plate; this scene only raises it and hands the
// chosen row to `onEnterDuel`, exactly as the treatment/shrine panels work.
import { BountyBoardPanel } from '../../hub/BountyBoardPanel';
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
  FlaskConical,
  MapPin,
  ChevronRight,
  Menu,
  Sparkles as SparklesIcon,
  Cloud,
  Zap,
  Settings,
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
  /**
   * S5 — the two cures. `App` owns the transaction and the save write; this screen
   * only reports which service the player chose. Each answers whether the gold
   * actually changed hands, so a refusal leaves the panel open on its own reason.
   */
  onTreatInjury: () => boolean;
  onRestAtInn: () => boolean;
  /**
   * S6 — one-tap use of an owned consumable from the treatment panel. `App` owns
   * the transaction and the save write; the answer says whether it applied.
   */
  onUseConsumable?: (itemId: string) => boolean;
  /**
   * S7 — one tavern rumour, at the tavern's own price. `App` owns the transaction
   * and the save write; the answer says whether the gold changed hands, so a
   * refusal leaves the panel open on its own reason. INTEL IS INFORMATION ONLY.
   */
  onBuyIntel: (opponentId: string) => boolean;
  /**
   * PITCH A1 — the Shrine of Fortuna's offering and its decline.  `App` owns both
   * transactions and the save write; an offering that cannot be paid for returns a
   * refusal (no omen, no write), and a decline that pays nothing returns the
   * reason, so the panel never invents a result.
   */
  onOfferOmen: () => OmenOfferOutcome | null;
  onDeclineOmen: () => OmenDeclineOutcome | null;
  /**
   * K2 — a service counter's keeper was met for the first time.  `App` owns the
   * one `seenKeepers` write (`handleRecordKeeperVisit`), exactly as it does for a
   * storefront's plate; this screen only reports the visit.
   */
  onRecordKeeperVisit?: (keeperId: string) => void;
}

/**
 * S5 — the two places that sell a cure, and the copy each one speaks.  `notice` is
 * the flavour line the hub has always printed for the place when the player is not
 * hurt (unchanged, so a healthy visit reads exactly as it did); `service` is the one
 * line the panel adds above its price and its single button.
 */
const TREATMENT_SITES: Record<
  TreatmentService,
  { title: string; notice: string; service: string; action: string }
> = {
  medical_house: {
    title: 'Arena Medical House',
    notice:
      "Arena Medical House: Bandages, ceramic vessels, and surgical tools are prepared for the arena's wounded.",
    service: 'The medicus cleans, stitches and binds the wound — and takes it off you entirely.',
    action: 'Treat Wound',
  },
  caravanserai: {
    title: 'Caravanserai Inn',
    notice: 'Caravanserai Inn: Rest & Quarters. Nothing to trade here yet.',
    service:
      'A night under the arches, broth and a clean bed: the city wakes at its next dawn, and two fights come off any wound.',
    action: 'Rest a Night',
  },
};

/**
 * K2 — the `HUB_LOCATIONS` building each treatment panel belongs to, so the panel
 * can ask the keeper registry who stands there.  The Medical House's service name
 * and its building id differ; the inn's are the same word.
 */
const TREATMENT_BUILDING: Record<TreatmentService, string> = {
  medical_house: 'arena_medical_house',
  caravanserai: 'caravanserai',
};

export const CityHubScene: React.FC<CityHubSceneProps> = ({
  playerProfile,
  onOpenTab,
  onEnterDuel,
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
  onTreatInjury,
  onRestAtInn,
  onUseConsumable,
  onBuyIntel,
  onRecordKeeperVisit,
  onOfferOmen,
  onDeclineOmen,
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
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');
  const [stableNotice, setStableNotice] = useState<string | null>(null);
  // Phase C-8.70B — the East Circus District's race entry panel.  Local view
  // state only: opening it and leaving it change no game data.
  const [showRaceEntry, setShowRaceEntry] = useState(false);
  // S5 — which treatment panel is up (null = none).  Local view state only: the
  // transaction and its save belong to `App`.
  const [treatmentPanel, setTreatmentPanel] = useState<TreatmentService | null>(null);
  // S7 — the Golden Palm Tavern's rumour panel.  Local view state only: the
  // purchase and its save belong to `App`.
  const [intelPanel, setIntelPanel] = useState(false);
  // PITCH A1 — the Shrine of Fortuna's omen panel, and the one line announcing
  // what the last offering or decline did.  Local view state only: both
  // transactions and their save belong to `App`.
  const [shrinePanel, setShrinePanel] = useState(false);
  // STORY-4b — the Bounty Hall's board. Local view state only: the bout entry is
  // `onEnterDuel` and every write is `App`'s.
  const [bountyPanel, setBountyPanel] = useState(false);
  const [omenResult, setOmenResult] = useState<string | null>(null);
  /**
   * K2 — the greeting of the counter that is open, decided ONCE when it opens,
   * from the profile the visit started with.  The first-visit save lands a frame
   * later and this scene re-renders on the new profile, so reading it live would
   * swap the greeting for the repeat line under the player's eyes — `ShopTab`
   * freezes its own reading the same way.
   */
  const keeperGreetingRef = useRef<{ keeperId: string; seen: boolean } | null>(null);

  /**
   * K4 — the STATE line of the counter that is open, frozen at the same moment as
   * the greeting above: buying the cure mid-panel clears the wound, and a live
   * reading would swap the plate's line under the player's eyes.
   */
  const keeperStateLineRef = useRef<string>('');

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
   * Day/Night T2 — the city is drawn under the CLOCK's phase, read from the save the
   * player is holding (`resolveTimeState(profile).phase`). The row is one of the seven in
   * `utils/atmosphere.ts`'s `PHASE_LIGHT`, applied by one `createAtmosphereRig` call from
   * `CityAtmosphere`.
   *
   * The light is applied at ENTRY and at a SEAM, never per frame: `playerProfile` changes
   * only when App saves an advance (a duel result, a training session, a night's rest),
   * and `CityAtmosphere` crossfades from the previous row when that happens. A1's Lighting
   * setting is still inert — the toggle is retired in favour of the cycle — so this scene
   * reads no `cityLighting` at all.
   *
   * While the oath owns the screen the UNTOUCHED `cityLightProfile` rig draws its dawn
   * instead, exactly as A1 shipped it.
   */
  const cityPhase = resolveTimeState(playerProfile).phase;
  const cityPhaseLight = getPhaseLight(cityPhase);
  const isOathRig = lightProfile === 'oathDawn';

  /**
   * Day/Night T3 — ONE emissive driver for the city's lamps, braziers and lanterns.
   *
   * The row's own `lampGlow` (0 at midday = unlit, 1.0 at night = streets lamplit) is
   * written into every fixture material registered with `utils/cityFixtureGlow.ts`. It
   * runs in a LAYOUT effect — children register theirs before this one — so the first
   * painted frame is already at the right hour, and it re-runs only when the hour
   * changes: nothing here touches a frame. No mesh, no light and no draw call is added.
   *
   * Day/Night T3-F — the city's eleven WARM POINT LIGHTS read the SAME row in the same
   * single write, through the companion registry in `utils/cityFixtureLight.ts` (`authored
   * × fixtureScale`, so a brazier's light and its coals dim together and every warm light
   * is dark at midday). Still one write per phase change, no light added or removed, and
   * the forge's fire and the store's cyan lamp are deliberately not registered.
   */
  useLayoutEffect(() => {
    applyCityFixtureGlow(cityPhaseLight.lampGlow);
    applyCityFixtureLightGlow(cityPhaseLight.lampGlow);
  }, [cityPhaseLight.lampGlow]);

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

  /**
   * K2 — freeze the greeting of the counter the player is opening: who keeps it,
   * and whether this gladiator had already met them at the moment of opening.
   */
  const primeKeeperGreeting = useCallback(
    (buildingId: string) => {
      const keeper = getKeeperForBuilding(buildingId);
      keeperGreetingRef.current = keeper
        ? { keeperId: keeper.id, seen: resolveSeenKeepers(playerProfile).includes(keeper.id) }
        : null;
      // K4 — the state line freezes with the greeting (STATE > NIGHT > own).
      keeperStateLineRef.current = keeper ? keeperStateLineFor(keeper, playerProfile) : '';
    },
    [playerProfile]
  );

  // Handle interaction with nearby landmark
  const handleInteract = useCallback(() => {
    if (!nearbyLoc) return;
    sounds.playClick();
    if (nearbyLoc.id === 'east_circus_arena') {
      // Phase C-8.70B — the district's race entry opens the pre-race panel
      // rather than a hub tab.  Read-only: the panel takes the profile and
      // returns control to the city unchanged.
      setShowRaceEntry(true);
    } else if (nearbyLoc.id === 'bounty_hall') {
      // STORY-4b — the hall's door opens the Bounty BOARD rather than routing to
      // the tournament tab (its old flavour-only `tabKey`). K3-BOARDS — Scribonia
      // keeps this counter, so her greeting freezes here, exactly as the tavern's
      // and the shrine's do; the panel records the visit through the same relay.
      primeKeeperGreeting('bounty_hall');
      setBountyPanel(true);
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
      if (target) onEnterDuel(target.opponent);
      else onOpenTab('tournament');
    } else if (nearbyLoc.id === 'tavern') {
      // S7 — the tavern sells information: the panel lists every tournament
      // opponent the player has not yet bought a rumour on.  K2 — the keeper's
      // plate heads it, so the greeting is frozen as the panel opens.
      primeKeeperGreeting('tavern');
      setIntelPanel(true);
    } else if (nearbyLoc.id === 'shrine_temple') {
      // PITCH A1 — Fortuna's shrine is the pre-fight ritual stop: its panel offers
      // her word for 25 gold, or the player declines.  The result line starts
      // empty; every offering or decline sets it from the transaction's answer.
      // K3-SHRINE — Postumia keeps the shrine's counter, so her greeting freezes
      // here, exactly as the tavern's and the two treatment counters' do.
      primeKeeperGreeting('shrine_temple');
      setOmenResult(null);
      setShrinePanel(true);
    } else if (nearbyLoc.tabKey) {
      onOpenTab(nearbyLoc.tabKey, nearbyLoc.subTab, nearbyLoc.shopId);
    } else {
      // Elegant immersive fallback notification for locations with no immediate tab key
      // (STORY-2: the Doctore House now carries `tabKey: 'training'`, so it opens
      // the ludus rather than falling through to a notice.)
      if (nearbyLoc.id === 'gladiator_barracks') {
        setStableNotice(
          "Gladiator Barracks: Recruits rest here between training sessions, keeping their equipment prepared for the arena."
        );
      } else if (nearbyLoc.id === 'veteran_gladiator_hall') {
        setStableNotice(
          "Veteran Gladiator Hall: Old trophies and worn shields line the walls, honoring fighters who survived the arena."
        );
      } else if (nearbyLoc.id === 'arena_medical_house' || nearbyLoc.id === 'caravanserai') {
        // S5 — the two treatment sites.  A live injury opens the panel (a service
        // with a price and one button); a healthy visit keeps the flavour notice the
        // hub has always printed, with no buttons at all.
        const service: TreatmentService =
          nearbyLoc.id === 'arena_medical_house' ? 'medical_house' : 'caravanserai';
        // Day/Night T2 — the Inn's night is offered to EVERY visitor (a night's sleep is
        // not a cure, so no wound is required); the Medical House still needs a live one.
        if (service === 'caravanserai' || resolveActiveInjury(playerProfile.injury)) {
          // K2 — same for the two treatment counters: the keeper who sells the
          // cure is on the panel, so the greeting freezes here.  A healthy visit
          // falls through to the notice above and opens no counter at all.
          primeKeeperGreeting(TREATMENT_BUILDING[service]);
          setTreatmentPanel(service);
        } else {
          setStableNotice(TREATMENT_SITES[service].notice);
        }
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
    playerProfile.currentTier,
    playerProfile.defeatedOpponentIds,
    playerProfile.injury,
    onOpenTab,
    primeKeeperGreeting,
  ]);

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

  // 2-in-1 Dual Action: Interact if near a landmark, Attack if not!
  const handlePrimaryAction = useCallback(() => {
    // A presented panel is up: E/Space and the action button are its own.
    if (treatmentPanel || intelPanel || shrinePanel || bountyPanel) return;
    if (nearbyLoc) {
      handleInteract();
    } else {
      handleAttack();
    }
  }, [nearbyLoc, handleInteract, handleAttack, treatmentPanel, intelPanel, shrinePanel, bountyPanel]);

  /**
   * S5 — one visit.  The transaction and its save write live in `App`; this screen
   * only reports the choice, and a refusal (no gold) leaves the panel up on its own
   * reason.  The panel then re-renders from the profile `App` handed back.
   */
  const handleTreatment = useCallback(
    (service: TreatmentService) => {
      sounds.playClick();
      const applied = service === 'medical_house' ? onTreatInjury() : onRestAtInn();
      if (applied) setStableNotice(null);
    },
    [onRestAtInn, onTreatInjury]
  );

  /**
   * S7 — one rumour.  The transaction and the save write live in `App`; a refusal
   * (the purse cannot cover it, or the opponent is already known) leaves the panel
   * up, and the list re-renders from the profile `App` handed back.
   */
  const handleBuyIntel = useCallback(
    (opponentId: string) => {
      sounds.playClick();
      onBuyIntel(opponentId);
    },
    [onBuyIntel]
  );

  /**
   * PITCH A1 — one offering of 25 gold, and one decline.  `App` owns both
   * transactions and the save write; the panel re-renders from the profile it
   * hands back, so a paid offering shows the live omen and a refusal shows the
   * panel's own short-purse line (the button is disabled at that point too).
   */
  const handleOfferOmen = useCallback(() => {
    sounds.playClick();
    const outcome = onOfferOmen();
    if (!outcome) return;
    setOmenResult(outcome.ok ? omenOfferResultLine(outcome.omen) : null);
  }, [onOfferOmen]);

  const handleDeclineOmen = useCallback(() => {
    sounds.playClick();
    const outcome = onDeclineOmen();
    if (!outcome) return;
    setOmenResult(omenDeclineResultLine(outcome));
  }, [onDeclineOmen]);

  /** S6 — one consumable from the satchel; the panel re-renders from the profile. */
  const handleUseConsumable = useCallback(
    (itemId: string) => {
      sounds.playClick();
      onUseConsumable?.(itemId);
    },
    [onUseConsumable]
  );

  // Cross-platform PC Keyboard input listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A presented scene owns the screen: no movement key and no action key is read
      // while it does, so the beat cannot be walked out of.
      if (inputLockedRef.current) return;
      const code = e.code;
      const key = e.key.toLowerCase();

      // S5 / S7 — a presented panel owns the screen: Esc closes it, and no other
      // key (no movement, no interaction) is read while it is up.
      if (treatmentPanel) {
        if (code === 'Escape' || key === 'escape') setTreatmentPanel(null);
        return;
      }
      if (intelPanel) {
        if (code === 'Escape' || key === 'escape') setIntelPanel(false);
        return;
      }
      if (shrinePanel) {
        if (code === 'Escape' || key === 'escape') setShrinePanel(false);
        return;
      }
      if (bountyPanel) {
        if (code === 'Escape' || key === 'escape') setBountyPanel(false);
        return;
      }

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
  }, [handlePrimaryAction, treatmentPanel, intelPanel, shrinePanel, bountyPanel]);

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

        // Normalize direction (Left is negative x, Right is positive x), then read it
        // through the joystick's radial dead zone: a resting thumb's small offset is no
        // input, and anything past the dead zone is rescaled so there is no jump at the
        // boundary (see utils/joystickDeadZone.ts for the constant to tune).
        const vec = applyDeadZone(dx / maxDist, dy / maxDist);
        touchVectorRef.current = { x: vec.x, z: vec.z };
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

      // Check proximity to landmarks (only update state when changed)
      const found = getNearbyHubLocation(playerPosRef.current);
      const foundId = found ? found.id : null;
      if (foundId !== lastNearbyIdRef.current) {
        lastNearbyIdRef.current = foundId;
        setNearbyLoc(found);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

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
   * A8 — Director ruling R7: the Records & Lore Library's prompt wears a ✦ while
   * the record holds a deed the player has not read.  Read-only here; the view's
   * own opening is what marks them read (one save, once).
   */
  const unreadDeeds = useMemo(() => hasUnviewedTriumphs(playerProfile), [playerProfile]);

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

  /**
   * S5 — the treatment panel's own reading of the profile: which place is open, the
   * wound it would treat and whether the purse covers it.  All derived, so `App`'s
   * write is the only thing that ever changes them.
   */
  const treatmentSite = treatmentPanel ? TREATMENT_SITES[treatmentPanel] : null;
  const treatmentInjury = resolveActiveInjury(playerProfile.injury);
  /**
   * T2 — the INN's night is gated by the purse alone (S5's own 25g), because a night's
   * sleep is not a cure and is offered to a whole gladiator too. The Medical House keeps
   * S5's eligibility, which needs a live wound. The label names the dawn it sleeps to —
   * and from Prima Luce itself it sleeps to TOMORROW's dawn, a full cycle, which is the
   * price the label states.
   */
  const restToTomorrow = cityPhase === 'dawn';
  const treatmentEligibility = treatmentPanel
    ? treatmentPanel === 'caravanserai'
      ? playerProfile.gold >= REST_PRICE
        ? { ok: true as const, price: REST_PRICE }
        : { ok: false as const, reason: 'insufficient-gold' as const }
      : getTreatmentEligibility(playerProfile, treatmentPanel)
    : null;
  /**
   * S6 — what the panel can offer from the player's own satchel. Empty when the
   * panel is closed, when there is no live wound, or when nothing is carried, so a
   * use button never appears without something to use it on.
   */
  const treatmentConsumables =
    treatmentPanel && treatmentInjury ? ownedConsumables(playerProfile) : [];
  /**
   * S7 — what the tavern can still sell: every tournament opponent the player has
   * not bought a rumour on. Empty when the panel is closed, so the surface adds
   * nothing to any other interaction.
   */
  const tavernTargets = intelPanel ? intelTargets(playerProfile) : [];
  const tavernPurseShort = intelPanel && playerProfile.gold < INTEL_PRICE;
  /**
   * K2 — the two service counters' keepers, resolved from the registry: the
   * Medical House's Medica (or the inn's host) and the Golden Palm's keeper.
   * `undefined` while the panel is shut, so a closed counter shows no plate and
   * records nothing.
   */
  const treatmentKeeper = treatmentPanel
    ? getKeeperForBuilding(TREATMENT_BUILDING[treatmentPanel])
    : undefined;
  const intelKeeper = intelPanel ? getKeeperForBuilding('tavern') : undefined;
  /**
   * K3-SHRINE — the priestess who keeps Fortuna's counter, resolved from the same
   * registry. `undefined` while the panel is shut, so a closed shrine shows no
   * plate and records nothing.
   */
  const shrineKeeper = shrinePanel ? getKeeperForBuilding('shrine_temple') : undefined;

  /**
   * PITCH A1 — Fortuna's word, read the way every other lazy profile field is.
   * `null` means no omen is live (absent or malformed reads as none), and the
   * purse check mirrors the transaction's own refusal so the button and the
   * refusal line agree.
   */
  const liveOmen = resolveOmen(playerProfile);
  const omenPurseShort = playerProfile.gold < OMEN_PRICE;

  /**
   * K2 — the one line the plate is saying, by the same rules `ShopTab` uses: the
   * greeting on a first visit, `selectRepeatLine` at visit two on every later one,
   * and the night clerk's line after dark only when the keeper has one (these
   * three have none, so their own line shows at every hour).
   */
  const keeperLineFor = (keeper: Keeper): string => {
    const frozen = keeperGreetingRef.current;
    const seen =
      frozen?.keeperId === keeper.id
        ? frozen.seen
        : resolveSeenKeepers(playerProfile).includes(keeper.id);
    const own = seen ? selectRepeatLine(keeper, 2) : keeper.firstVisitLine;
    /**
     * K4 — STATE > NIGHT > own: the state line frozen when this counter opened is
     * the most specific thing the plate can say, so it wins after dark as well.
     */
    const stateLine =
      frozen?.keeperId === keeper.id
        ? keeperStateLineRef.current
        : keeperStateLineFor(keeper, playerProfile);
    if (stateLine) return stateLine;
    return cityPhase === 'night' ? nightClerkLine(keeper) || own : own;
  };

  /**
   * K2 — a counter that actually opened records its keeper through `App`'s one
   * write path, at most once per visit.  The id is `undefined` while every panel
   * is shut, so a panel that never opened records nothing; `App`'s
   * `handleRecordKeeperVisit` returns the SAME profile for an id already saved, so
   * a re-render or a second open cannot write the save twice.
   */
  // K3-SHRINE — the shrine's counter joins the SAME single record path, so
  // Postumia's first visit is written by `App.handleRecordKeeperVisit` and by
  // nothing else; there is still exactly one `onRecordKeeperVisit` call site.
  const openCounterKeeperId = (treatmentKeeper ?? intelKeeper ?? shrineKeeper)?.id;
  useEffect(() => {
    if (!openCounterKeeperId) return;
    const frozen = keeperGreetingRef.current;
    if (frozen?.keeperId === openCounterKeeperId && frozen.seen) return;
    onRecordKeeperVisit?.(openCounterKeeperId);
  }, [openCounterKeeperId]);

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

            {/* DAY/NIGHT T1 — the city's own sky, key light and haze, one row per phase.
                One `createAtmosphereRig` call (see `utils/atmosphere.ts` /
                `CityAtmosphere`) builds the gradient dome (with its star term and the
                key light's disc — the moon at night), sets the row's fog, adds the single
                shadow-casting key light and the hemisphere bounce, and writes ACES at the
                row's exposure. The block below is the oath beat's own rig, unchanged:
                the oath still paints `cityLightProfile`'s dawn values. */}
            {isOathRig ? (
              <>
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

              </>
            ) : (
              <CityAtmosphere phase={cityPhase} />
            )}

            {/* Phase 2B — Scene-level PBR environment for metallic/physical material reflections.
                The visible sky is a mesh, not an environment map; without this, materials with
                metalness > 0 (darkIron, agedBronze, goldAccent) render flat black with no specular.
                Procedural Lightformers are rendered ONCE into a 256px cubemap, PMREM-processed,
                and assigned to scene.environment. environmentIntensity=0.35 keeps reflections
                subtle so warm Roman material colors remain readable. No external HDR files.
                Atmosphere A1 keeps this rig for BOTH profiles: the gradient dome replaced the
                SKY, not the reflections, so no material's specular response changed. */}
            <Environment
              resolution={256}
              frames={1}
              environmentIntensity={isOathRig ? lights.environmentIntensity : cityPhaseLight.envIntensity}
            >
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
              {/* Day/Night T3 — the fortress watch-fire (night) and the shrine's smoke
                  (dawn on Dies Fortunae). Both are conditionally mounted, so at every
                  other hour the city draws exactly the meshes it always did. */}
              <CityNightDressing phase={cityPhase} profile={playerProfile} />
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
        {/* Day/Night T3 — the phase medallion: the sun-arc, seven notches, and the disc
            at the clock's hour, in the phase's own class colour. Display only. */}
        <PhaseMedallion phase={cityPhase} />
        <div className="flex items-center gap-2 bg-neutral-950/85 border border-amber-600/50 p-2 sm:p-3 rounded-2xl backdrop-blur-md shadow-2xl">
          <button
            onClick={() => setShowNavDrawer(!showNavDrawer)}
            aria-label="City Map & Fast Travel"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer active:scale-95 transition-all"
            title="City Map & Fast Travel"
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
            className="min-h-[48px] min-w-[48px] px-2.5 rounded-2xl bg-neutral-950/85 border border-cyan-500/50 text-cyan-300 hover:text-cyan-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all flex items-center justify-center gap-1.5 font-serif font-bold text-xs uppercase tracking-wider"
            title="Google Drive Cloud Saves"
          >
            <Cloud className="w-4 h-4" />
            <span>Drive</span>
          </button>

          <button
            onClick={onToggleMute}
            className="min-h-[48px] min-w-[48px] px-2.5 rounded-2xl bg-neutral-950/85 border border-amber-600/50 text-amber-300 hover:text-amber-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all flex items-center justify-center gap-1.5 font-serif font-bold text-xs uppercase tracking-wider"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button
            onClick={onReturnToMainMenu}
            className="min-h-[48px] px-3 py-2 rounded-2xl bg-neutral-900/90 border border-neutral-700 hover:border-amber-500/60 text-neutral-300 hover:text-amber-200 text-xs font-serif font-bold backdrop-blur-md cursor-pointer active:scale-95 transition-all shadow-xl"
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
            {/* UI-1 (B-15) — the stick's own caption, styled like the hub's micro-labels,
                so the control is never an unlabelled shape under a thumb. */}
            <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-amber-300/80">
              Move
            </span>
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
                nearbyLoc
                  ? 'bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 border-yellow-300 text-neutral-950 shadow-[0_0_25px_rgba(245,158,11,0.8)] animate-pulse'
                  : 'bg-gradient-to-br from-red-600 via-rose-700 to-red-900 border-red-300 text-white shadow-[0_0_20px_rgba(225,29,72,0.6)]'
              }`}
              title={nearbyLoc ? `Interact with ${nearbyLoc.name} [E / Space]` : 'Attack with Weapon [Space / E]'}
            >
              {nearbyLoc ? (
                <>
                  <SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8 fill-neutral-950 text-neutral-950" />
                  <span className="text-[9px] sm:text-xs font-serif font-black uppercase tracking-wider mt-0.5">
                    {nearbyLoc.id === 'records_house' && unreadDeeds ? '✦ ' : ''}ENTER [E]
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

      {/* PROXIMITY INTERACTION BANNER (CENTER DESKTOP POPUP) */}
      {nearbyLoc && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-bounce hidden sm:block">
          <button
            onClick={handleInteract}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.7)] border-2 border-amber-200 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <SparklesIcon className="w-4 h-4 fill-neutral-950 text-neutral-950" />
            <span>
              {nearbyLoc.id === 'records_house' && unreadDeeds ? '✦ ' : ''}
              {nearbyLoc.actionPrompt} [E / Space]
            </span>
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
              aria-label="Dismiss announcement"
              className={CLOSE_BUTTON_CLASS}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* S5 — THE TREATMENT PANEL: the Medical House's cure and the inn's rest.  The
          same surface as the notice above, but its one button is the player's way to
          spend the gold; the transaction itself lives in `App`, so this screen writes
          no save.  A refusal keeps the panel up and states its own reason. */}
      {treatmentPanel && treatmentSite && (
        <div
          data-treatment-panel={treatmentPanel}
          className="absolute top-36 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-sm sm:max-w-md w-[90%] bg-neutral-950/95 border-2 border-amber-500/80 p-4 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-fadeIn"
        >
          {/* K2 — the Medica (or the inn's host) heads the counter.  A header only:
              the plate adds no control, so the panel's one button is unchanged. */}
          {treatmentKeeper && (
            <div className="mb-3">
              <KeeperPlate keeper={treatmentKeeper} line={keeperLineFor(treatmentKeeper)} />
            </div>
          )}
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-400" />
                <span>{treatmentSite.title}</span>
              </h4>
              <p className="text-[11px] sm:text-xs text-neutral-300 font-sans leading-relaxed">
                {treatmentSite.service}
              </p>
              <p
                data-injury={treatmentInjury ? treatmentInjury.fightsRemaining : 'none'}
                className="mt-2 text-[11px] sm:text-xs font-mono text-amber-300"
              >
                {treatmentInjury ? injuryBannerLine(treatmentInjury) : 'The wound is closed.'}
              </p>
            </div>
            <button
              onClick={() => setTreatmentPanel(null)}
              aria-label="Close treatment panel"
              className={CLOSE_BUTTON_CLASS}
            >
              ✕
            </button>
          </div>

          {(treatmentInjury || treatmentPanel === 'caravanserai') && (
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleTreatment(treatmentPanel)}
                disabled={!treatmentEligibility?.ok}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg border-2 border-amber-200 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Coins className="w-4 h-4" />
                <span>
                  {treatmentPanel === 'caravanserai'
                    ? `${restToTomorrow ? "Rest until tomorrow's dawn" : 'Rest until dawn'} — ${REST_PRICE}g`
                    : `${treatmentSite.action} — ${treatmentPrice(treatmentPanel)}g`}
                </span>
              </button>
              {treatmentEligibility && !treatmentEligibility.ok && (
                <p
                  data-treatment-refusal={treatmentEligibility.reason}
                  className="text-[10px] sm:text-[11px] font-mono text-red-300"
                >
                  Not enough gold. You carry {playerProfile.gold}g.
                </p>
              )}

              {/* S6 — the satchel's own remedies, offered on the same surface as the
                  services above: one tap spends one item and the wound changes. */}
              {treatmentConsumables.length > 0 && (
                <div className="flex flex-col gap-2 pt-2 border-t border-amber-800/40">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">
                    From your satchel
                  </span>
                  {treatmentConsumables.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-use-consumable={item.id}
                      onClick={() => handleUseConsumable(item.id)}
                      className="w-full min-h-[42px] rounded-xl bg-neutral-900 hover:bg-neutral-800 text-amber-100 font-serif font-bold text-[11px] sm:text-xs uppercase tracking-wider border border-amber-600/70 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                    >
                      <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        Use {item.name} ({getConsumableCount(playerProfile, item.id)})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* S7 — THE TAVERN RUMOUR PANEL: the Golden Palm sells information.  The same
          surface as the notice and the treatment panel, and its copy says plainly
          that a rumour changes nothing a fight computes.  The transaction lives in
          `App`, so this screen writes no save. */}
      {intelPanel && (
        <div
          data-intel-panel
          className="absolute top-36 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-sm sm:max-w-md w-[90%] bg-neutral-950/95 border-2 border-amber-500/80 p-4 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-fadeIn"
        >
          {/* K2 — the keeper of the Palm heads her rumour counter.  A header only:
              no control is added, so the purchase list below it is unchanged. */}
          {intelKeeper && (
            <div className="mb-3">
              <KeeperPlate keeper={intelKeeper} line={keeperLineFor(intelKeeper)} />
            </div>
          )}
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Beer className="w-4 h-4 text-amber-400" />
                <span>The Golden Palm Tavern</span>
              </h4>
              <p className="text-[11px] sm:text-xs text-neutral-300 font-sans leading-relaxed">
                A coin buys a word. The keeper knows the names on the sand — how they fight,
                what they carry, and what they do when it turns against them.
              </p>
              <p className="mt-2 text-[10px] sm:text-[11px] font-mono text-amber-300/90">
                Information only — a rumour changes no stat, no formula and no reward.
              </p>
            </div>
            <button
              onClick={() => setIntelPanel(false)}
              aria-label="Close tavern panel"
              className={CLOSE_BUTTON_CLASS}
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-1">
            {tavernTargets.length === 0 ? (
              <p className="text-[11px] sm:text-xs font-mono text-neutral-400">
                You have bought every rumour the tavern keeps.
              </p>
            ) : (
              tavernTargets.map((opponent) => {
                const eligibility = getIntelPurchaseEligibility(playerProfile, opponent.id);
                return (
                  <button
                    key={opponent.id}
                    type="button"
                    data-buy-intel={opponent.id}
                    onClick={() => handleBuyIntel(opponent.id)}
                    disabled={!eligibility.ok}
                    className="w-full min-h-[48px] rounded-xl bg-neutral-900 hover:bg-neutral-800 text-amber-100 font-serif font-bold text-[11px] sm:text-xs uppercase tracking-wider border border-amber-600/70 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center gap-2">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {opponent.name} — {opponent.isBoss ? 'Boss' : `Tier ${opponent.tier}`}
                      </span>
                    </span>
                    <span className="font-mono text-amber-300">{INTEL_PRICE}g</span>
                  </button>
                );
              })
            )}
            {tavernPurseShort && tavernTargets.length > 0 && (
              <p
                data-intel-refusal="insufficient-gold"
                className="text-[10px] sm:text-[11px] font-mono text-red-300"
              >
                Not enough gold. You carry {playerProfile.gold}g.
              </p>
            )}
          </div>
        </div>
      )}

      {/* STORY-4b — THE BOUNTY BOARD: the hall's own panel, raised by the door.
          Scribonia's plate heads it, the five postings and the Deserter's entry are
          listed with their prices and their printed twists, and nothing here writes:
          the bout is handed to `onEnterDuel` and the clear lands in App's write. */}
      {bountyPanel && (
        <BountyBoardPanel
          profile={playerProfile}
          night={cityPhase === 'night'}
          onEnterBout={(opponent) => {
            sounds.playClick();
            onEnterDuel(opponent);
          }}
          onRecordKeeperVisit={onRecordKeeperVisit}
          onClose={() => setBountyPanel(false)}
        />
      )}

      {/* PITCH A1 — THE SHRINE OF FORTUNA: the pre-fight ritual stop.  It shows
          the omen already resting on the gladiator (kind or ill, and which bout it
          waits for), offers her word for 25 gold, and offers the decline.  Both
          transactions and their save live in `App`, so this screen writes nothing;
          a purse under the price disables the offering and says so. */}
      {shrinePanel && (
        <div
          data-shrine-panel
          className="absolute top-36 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-sm sm:max-w-md w-[90%] bg-neutral-950/95 border-2 border-amber-500/80 p-4 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-fadeIn"
        >
          {/* K3-SHRINE — Postumia heads her own counter. A header only: no control
              is added, so the offering and the decline below it are exactly the
              ones A1 shipped, at the same price. */}
          {shrineKeeper && (
            <div className="mb-3">
              <KeeperPlate keeper={shrineKeeper} line={keeperLineFor(shrineKeeper)} />
            </div>
          )}
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-400" />
                <span>Shrine of Fortuna</span>
              </h4>
              <p className="text-[11px] sm:text-xs text-neutral-300 font-sans leading-relaxed">
                Fortuna gives what she gives. A small offering of {OMEN_PRICE} gold buys her word on
                your next bout — kind or ill — or you decline and trust your own arm.
              </p>
              <p
                data-shrine-omen={liveOmen ? liveOmen.kind : 'none'}
                className="mt-2 text-[11px] sm:text-xs font-mono text-amber-300 leading-relaxed"
              >
                {liveOmen ? omenLine(liveOmen) : 'No omen rests on you.'}
              </p>
              {omenResult && (
                <p
                  data-omen-result
                  className="mt-2 text-[11px] sm:text-xs font-sans text-amber-200/90 leading-relaxed"
                >
                  {omenResult}
                </p>
              )}
            </div>
            <button
              onClick={() => setShrinePanel(false)}
              aria-label="Close shrine panel"
              className={CLOSE_BUTTON_CLASS}
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              data-offer-omen
              onClick={handleOfferOmen}
              disabled={omenPurseShort}
              className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg border-2 border-amber-200 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Coins className="w-4 h-4" />
              <span>Offer {OMEN_PRICE}g for an omen</span>
            </button>
            {omenPurseShort && (
              <p
                data-omen-refusal="insufficient-gold"
                className="text-[10px] sm:text-[11px] font-mono text-red-300"
              >
                Not enough gold. You carry {playerProfile.gold}g.
              </p>
            )}
            <button
              type="button"
              data-decline-omen
              onClick={handleDeclineOmen}
              className="w-full min-h-[48px] rounded-xl bg-neutral-900 hover:bg-neutral-800 text-amber-100 font-serif font-bold text-[11px] sm:text-xs uppercase tracking-wider border border-amber-600/70 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              <SparklesIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>Decline — trust your own arm</span>
            </button>
          </div>
        </div>
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
                className="flex-1 min-w-[54px] min-h-[48px] py-1.5 sm:py-2 px-1 rounded-xl hover:bg-amber-500/20 text-neutral-300 hover:text-amber-200 flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition-all active:scale-95 cursor-pointer"
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
                <span>City Map &amp; Fast Travel</span>
              </h3>
              <button
                onClick={() => setShowNavDrawer(false)}
                aria-label="Close city map"
                className={CLOSE_BUTTON_CLASS}
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
