import React, { useEffect, useRef, useState } from 'react';
import { PlayerProfile, OpponentConfig, WeaponItem, ArmorItem, ChariotTeamSize, ArmaturaId, BoutMode } from '../../types/game';
import { TournamentTab } from './TournamentTab';
import { TrainingTab } from './TrainingTab';
import { ShopTab } from './ShopTab';
import { GearView, GearTab } from './GearTab';
import { StatsTab } from './StatsTab';
import { LibraryTab, type LibraryPageId } from './LibraryTab';
import { BannerRow } from './BannerRow';
import type { StorefrontId } from '../../data/shops';
import type { ConsumableItem } from '../../data/consumables';
import type { LaurelResult } from '../../utils/laurels';
import { PreFightModal } from './PreFightModal';
import { FacilitiesPanel } from './FacilitiesPanel';
import type { FacilityId } from '../../utils/facilityProgression';
import { DOCTORE_TEST_OPPONENT } from '../../data/opponents';
import {
  NOVICE_BOUT_BRIEFING,
  isDoctoreTestOpponent,
  isNoviceBoutDue,
  isNoviceBoutOpponent,
  type DoctoreTestRestriction,
} from '../../utils/storyBeats';
import { HelpModal } from './HelpModal';
import { CoachCard } from '../ui/CoachCard';
import { HUB_FIRST_OPEN_CARD_ID, getCoachCard, hasSeenCard } from '../../utils/coachMarks';
import { Swords, Dumbbell, ShoppingCart, Layers, BarChart2, BookOpen, Compass, Volume2, VolumeX, HelpCircle, RotateCcw, Cloud, Settings } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { resolveDisplayClock } from '../../utils/dayRollover';
// PITCH A1 — the omen line the pre-fight card prints, read lazily from the save.
import { resolveOmen } from '../../utils/omens';
// STORY-3 — Chapter 2's Beat 3: Postumia's briefing on the tournament final, and
// the herald's circus pointer while the chapter's District race gate is unmet.
import { FORTUNA_SHRINE_BRIEFING, isFortunaBriefingDue } from '../../utils/storyChapterTwo';

interface GladiatorSchoolHubProps {
  playerProfile: PlayerProfile;
  activeTab: 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library';
  onTabChange: (tab: 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library') => void;
  onEnterCity3D: () => void;
  /** C-8.70C — carries the bout mode chosen on the pre-fight card (Sand if omitted). */
  onSelectOpponent: (opp: OpponentConfig, mode?: BoutMode) => void;
  onTrainStat: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
  onBuyItem: (item: WeaponItem | ArmorItem) => void;
  /** S6 — a Bazaar consumable bought on the shop screen; `App` writes the save. */
  onBuyConsumable?: (item: ConsumableItem) => void;
  /** S6 — one-tap use of an owned consumable from the stats tab. */
  onUseConsumable?: (itemId: string) => boolean;
  /** C-2 — the Armory sells a spare for its sellPrice plus any temper refund. */
  onSellItem?: (item: WeaponItem | ArmorItem) => void;
  onEquipWeapon: (wpn: WeaponItem) => void;
  onEquipArmor: (armor: ArmorItem) => void;
  /** Armory subview (Phase C-8.66B); 'chariot' is what the Imperial Stable opens. */
  gearView?: GearView;
  /**
   * Phase SHOP-2 — the shop tab's storefront: the one the city building the
   * player walked into sells, or `'market'` (the default) for the whole
   * catalogue the hub's own Bazaar & Forge tab has always shown.
   */
  shopId?: StorefrontId;
  /** K1 — the storefront keeper's first visit; `App` writes it, this screen only relays. */
  onRecordKeeperVisit?: (keeperId: string) => void;
  onGearViewChange?: (view: GearView) => void;
  onBuyChariotPart?: (partId: string) => void;
  onEquipChariotPart?: (partId: string) => void;
  /** Phase C-8.67C — the racing team progression shown inside the same subview. */
  onBuyRacingConfig?: (horses: ChariotTeamSize) => void;
  onSelectRacingConfig?: (horses: ChariotTeamSize) => void;
  onAllocateStatPoint: (stat: 'strength' | 'agility' | 'stamina' | 'defense') => void;
  /** CH-2 — the stats tab's one-time legacy re-pledge; `App` writes the class. */
  onRepledgeArmatura?: (armatura: ArmaturaId) => void;
  onOpenDriveSync: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onResetGame: () => void;
  onOpenSettings?: () => void;
  /** CL-2 — the one seen-write: App records a card the moment this screen shows it. */
  onMarkCardSeen?: (id: string) => void;
  /** RG-3 — opens the Device Choosing panel from the banner row. */
  onOpenDeviceChoice?: () => void;
  /**
   * STORY-3 — the herald's circus pointer, already resolved by `App` from the
   * campaign's own state: shown when the Colosseum tab opens while Chapter 2 is
   * open and its race gate is unmet, and `null` otherwise.
   */
  heraldCircusCry?: string | null;
  /** STORY-3 — hands that cry to `App`, which owns the herald's toast. */
  onHeraldCry?: (cry: string) => void;
  /**
   * STORY-2 — the Doctore House's duel entry. `App` receives the restriction the
   * player chose together with the opponent, so the result write can judge the
   * win against the rule that was actually set.
   */
  onEnterDoctoreTest?: (restriction: DoctoreTestRestriction, mode?: BoutMode) => void;
  /** P2 — a Triumph bought from the Library's Triumphs page; `App` writes it. */
  onPurchaseTriumph?: (laurelId: string) => LaurelResult;
  /** P6 — the temper row on an Armory card; `App` runs `purchaseTemper` and writes. */
  onTemperItem?: (itemId: string) => void;
  /** P6 — the Stable panel's two ladders; `App` runs the P4 helpers and writes. */
  onBuyStableQuality?: (grade: number) => void;
  onBuyStableConditioning?: (level: number) => void;
  /** P6 — the Facilities panel; `App` runs `purchaseFacility` and writes. */
  onBuyFacility?: (id: FacilityId) => void;
  /** A8 — the character sheet's second door onto the Library's Triumphs page. */
  onViewTriumphs?: () => void;
  /** A8 — put an owned title on the record; `App` writes it through the save path. */
  onSelectTitle?: (titleId: string) => void;
  /**
   * STORY-5b — a Legend Bout (the staged row dressed in its era kit). `App` marks
   * it as an exhibition, so the duel result path is fenced for it (R4).
   */
  onEnterLegendBout?: (opp: OpponentConfig) => void;
  /** STORY-5b — the Librarian chain's step 1: the Codex page was opened. */
  onViewCodex?: () => void;
  /** CH-5 — the Palmae panel's two taps; `App` runs the validated transaction. */
  onEquipPalma?: (palmaId: string) => void;
  onUnequipPalma?: (palmaId: string) => void;
  /** CH-5 — the Doctore's sold palms; `App` runs `purchaseDoctorePalma`. */
  onBuyPalma?: (palmaId: string) => void;
}

export const GladiatorSchoolHub: React.FC<GladiatorSchoolHubProps> = ({
  playerProfile,
  activeTab,
  onTabChange,
  onEnterCity3D,
  onSelectOpponent,
  onTrainStat,
  onBuyItem,
  onBuyConsumable,
  onUseConsumable,
  onSellItem,
  onEquipWeapon,
  onEquipArmor,
  gearView = 'armory',
  shopId = 'market',
  onRecordKeeperVisit,
  onGearViewChange,
  onBuyChariotPart,
  onEquipChariotPart,
  onBuyRacingConfig,
  onSelectRacingConfig,
  onAllocateStatPoint,
  onRepledgeArmatura,
  onOpenDriveSync,
  onToggleMute,
  isMuted,
  onResetGame,
  onOpenSettings,
  onMarkCardSeen,
  onOpenDeviceChoice,
  heraldCircusCry = null,
  onHeraldCry,
  onEnterDoctoreTest,
  onPurchaseTriumph,
  onTemperItem,
  onBuyStableQuality,
  onBuyStableConditioning,
  onBuyFacility,
  onEquipPalma,
  onUnequipPalma,
  onBuyPalma,
  onViewTriumphs,
  onSelectTitle,
  onEnterLegendBout,
  onViewCodex,
}) => {
  const [selectedOpponent, setSelectedOpponent] = useState<OpponentConfig | null>(null);
  /**
   * STORY-2 — the rule the player chose for the Doctore's Test, held only for the
   * length of the pre-fight card: the entry card sets it, the card prints it, the
   * confirm hands it to `App`, and a retreat clears it. Nothing is saved here.
   */
  const [testRestriction, setTestRestriction] = useState<DoctoreTestRestriction | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  /**
   * A8 — which page the Records & Lore rack is showing.  It is held HERE because
   * the character sheet's "View Triumphs" button opens the same rack on a
   * different page: one surface, two doors, and no second Triumphs screen.
   */
  const [libraryPage, setLibraryPage] = useState<LibraryPageId>('road');

  /** A8 — the sheet's door: open the Library on its Triumphs page. */
  const openTriumphs = () => {
    setLibraryPage('triumphs');
    onTabChange('library');
  };

  /**
   * STORY-3 — the herald's circus pointer (Director ruling 3). It is raised when
   * the Colosseum tab opens, and only then. `HeraldToast` clears it on its own
   * dismiss or timer, and a LATER open raises it again for as long as the
   * cross-gate condition holds ("keeps mentioning"). The callback is held in a
   * ref so an ordinary re-render of the hub can never re-raise the same cry.
   */
  const raiseHeraldCry = useRef(onHeraldCry);
  raiseHeraldCry.current = onHeraldCry;
  useEffect(() => {
    if (activeTab !== 'tournament') return;
    if (!heraldCircusCry) return;
    raiseHeraldCry.current?.(heraldCircusCry);
  }, [activeTab, heraldCircusCry]);

  /**
   * CL-2 — the first-open coach card, decided once from the profile the hub was
   * opened with: a profile that has already been shown HUB-1 gets no card and no
   * mark, a first-time profile gets both.  `showFirstOpenCard` is local view state,
   * so the card stays up until it is dismissed even though the seen-write lands the
   * moment it is displayed; `helpMarked` is the one-off mark on the Help control,
   * cleared when the card is dismissed or when Help is opened.
   */
  const firstOpenCardPending = !hasSeenCard(playerProfile, HUB_FIRST_OPEN_CARD_ID);
  const [showFirstOpenCard, setShowFirstOpenCard] = useState(firstOpenCardPending);
  const [helpMarked, setHelpMarked] = useState(firstOpenCardPending);
  const firstOpenCard = getCoachCard(HUB_FIRST_OPEN_CARD_ID);

  // CL-2 — marked seen ON DISPLAY, once: it runs on the mount that showed the card,
  // and `markSeen` is a no-op for a card the profile already carries, so a repeated
  // call can never rewrite the save.
  useEffect(() => {
    if (!firstOpenCardPending) return;
    onMarkCardSeen?.(HUB_FIRST_OPEN_CARD_ID);
  }, []);

  return (
    <div className="relative w-full h-full min-h-screen bg-neutral-950 text-amber-100 flex flex-col select-none overflow-y-auto">
      {/* TOP HEADER BAR */}
      <header className="w-full bg-neutral-900/90 border-b border-amber-600/50 p-3 sm:p-4 backdrop-blur-md sticky top-0 z-30 flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-yellow-600 border border-amber-300 flex items-center justify-center shadow-md">
            <Swords className="w-5 h-5 text-neutral-950" />
          </div>
          <div>
            <h1 className="font-serif font-black text-sm sm:text-base text-amber-100 uppercase tracking-wider">
              {playerProfile.name}
            </h1>
            <div className="text-[10px] text-amber-400 font-mono">
              LVL {playerProfile.level} • {playerProfile.gold} Gold • {playerProfile.fame} Fame
            </div>
          </div>
        </div>

        {/* 3D CITY BUTTON & UTILITIES */}
        <div className="flex flex-wrap justify-end items-center gap-2">
          <button
            onClick={onEnterCity3D}
            className="min-h-[48px] px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-serif font-bold text-xs uppercase tracking-wider shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Compass className="w-4 h-4" />
            <span>3D Metropolis</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="min-h-[48px] px-3 rounded-xl bg-neutral-800 border border-amber-500/40 text-amber-300 hover:text-amber-100 cursor-pointer flex items-center gap-2 font-serif font-bold text-xs uppercase tracking-wider"
              title="Game Settings"
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
          )}

          <button
            onClick={onOpenDriveSync}
            className="min-h-[48px] min-w-[48px] px-2.5 rounded-xl bg-neutral-800 hover:bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:text-cyan-100 cursor-pointer flex items-center justify-center gap-1.5 font-serif font-bold text-xs uppercase tracking-wider"
            title="Google Drive Cloud Saves"
          >
            <Cloud className="w-4 h-4" />
            <span>Drive</span>
          </button>

          {/* CL-2 — the Help control carries a one-off mark on a first hub open; the
              mark clears the moment Help is opened (or the card is dismissed). */}
          <button
            onClick={() => {
              setShowHelp(true);
              setHelpMarked(false);
            }}
            data-help-marked={helpMarked ? '1' : '0'}
            title="Combat & Controls Help"
            className={`relative min-h-[48px] min-w-[48px] px-2.5 rounded-xl bg-neutral-800 border text-neutral-300 hover:text-amber-200 cursor-pointer flex items-center justify-center gap-1.5 font-serif font-bold text-xs uppercase tracking-wider ${
              helpMarked ? 'border-amber-400 text-amber-200 ring-2 ring-amber-400/60' : 'border-neutral-700'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Help</span>
            {helpMarked && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 shadow" />
            )}
          </button>

          <button
            onClick={onToggleMute}
            className="min-h-[48px] min-w-[48px] px-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-amber-200 cursor-pointer flex items-center justify-center gap-1.5 font-serif font-bold text-xs uppercase tracking-wider"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
        </div>
      </header>

      {/* RG-3 — THE LUDUS BANNER ROW: the gladiator's own banner once a device is sworn. */}
      <BannerRow playerProfile={playerProfile} onChooseDevice={onOpenDeviceChoice} />

      {/* NAVIGATION TABS */}
      <nav className="w-full bg-neutral-900/50 border-b border-neutral-800 px-4 py-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        {[
          { key: 'tournament', label: 'Colosseum', icon: Swords },
          { key: 'training', label: 'Training Yard', icon: Dumbbell },
          { key: 'shop', label: 'Bazaar & Forge', icon: ShoppingCart },
          { key: 'gear', label: 'Armory', icon: Layers },
          { key: 'stats', label: 'Gladiator Stats', icon: BarChart2 },
          { key: 'library', label: 'Records & Lore', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                sounds.playClick();
                // A8 — the rack's own tab opens it on page one; only the character
                // sheet's door asks for the Triumphs page.
                if (tab.key === 'library') setLibraryPage('road');
                onTabChange(tab.key as 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | 'library');
              }}
              className={`min-h-[48px] py-2 px-3 sm:px-4 rounded-xl font-serif font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-amber-500/20 border border-amber-400 text-amber-200 shadow-md'
                  : 'bg-neutral-900/80 border border-neutral-800 text-neutral-400 hover:text-amber-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* MAIN TAB CONTENT */}
      <main className="flex-1 p-4 sm:p-8">
        {/* P6 — the ludus's three buildings, above every tab: their levels gate
            tempering, the stable's ladders and the forge's stock. */}
        <FacilitiesPanel profile={playerProfile} onBuyFacility={onBuyFacility} />
        {activeTab === 'tournament' && (
          <TournamentTab
            profile={playerProfile}
            onSelectOpponent={(opp) => setSelectedOpponent(opp)}
            /* STORY-5b — a legend bout is entered directly: it is an exhibition of an
               existing row, not a ladder card, and its omen/mercy/ladder bookkeeping
               is fenced in `App`. */
            onEnterLegendBout={onEnterLegendBout}
          />
        )}
        {activeTab === 'training' && (
          <TrainingTab
            profile={playerProfile}
            onTrainStat={onTrainStat}
            onBuyPalma={onBuyPalma}
            onSelectDoctoreTest={(restriction) => {
              setTestRestriction(restriction);
              setSelectedOpponent(DOCTORE_TEST_OPPONENT);
            }}
          />
        )}
        {activeTab === 'shop' && (
          <ShopTab
            profile={playerProfile}
            onBuyItem={onBuyItem}
            onBuyConsumable={onBuyConsumable}
            shopId={shopId}
            onRecordKeeperVisit={onRecordKeeperVisit}
          />
        )}
        {activeTab === 'gear' && (
          <GearTab
            profile={playerProfile}
            onEquipWeapon={onEquipWeapon}
            onEquipArmor={onEquipArmor}
            onSellItem={onSellItem}
            gearView={gearView}
            onGearViewChange={onGearViewChange}
            onBuyChariotPart={onBuyChariotPart}
            onEquipChariotPart={onEquipChariotPart}
            onBuyRacingConfig={onBuyRacingConfig}
            onSelectRacingConfig={onSelectRacingConfig}
            onTemperItem={onTemperItem}
            onBuyStableQuality={onBuyStableQuality}
            onBuyStableConditioning={onBuyStableConditioning}
          />
        )}
        {activeTab === 'stats' && (
          <StatsTab
            profile={playerProfile}
            onAllocatePoint={onAllocateStatPoint}
            onUseConsumable={onUseConsumable}
            onRepledgeArmatura={onRepledgeArmatura}
            onEquipPalma={onEquipPalma}
            onUnequipPalma={onUnequipPalma}
            onOpenTriumphs={onViewTriumphs ? openTriumphs : undefined}
          />
        )}
        {activeTab === 'library' && (
          <LibraryTab
            profile={playerProfile}
            onPurchaseTriumph={onPurchaseTriumph}
            page={libraryPage}
            onPageChange={setLibraryPage}
            onViewTriumphs={onViewTriumphs}
            onSelectTitle={onSelectTitle}
            onViewCodex={onViewCodex}
          />
        )}
      </main>

      {/* PRE-FIGHT MODAL */}
      {selectedOpponent && (
        <PreFightModal
          opponent={selectedOpponent}
          /* Day/Night T3 — the hour the card is opened in, for its phase line. */
          phase={resolveDisplayClock(playerProfile).phase}
          /* STORY-2 — the novice bout's framing, fresh profiles only.
             STORY-3 — BEAT 3 rides the same surface: Postumia's briefing on the
             chapter's tournament final, until the omen is taken or declined. */
          narration={
            isNoviceBoutOpponent(selectedOpponent) && isNoviceBoutDue(playerProfile)
              ? NOVICE_BOUT_BRIEFING
              : isFortunaBriefingDue(playerProfile, selectedOpponent)
                ? FORTUNA_SHRINE_BRIEFING
                : undefined
          }
          /* STORY-2 — the Test prints the rule the player chose (and its reason). */
          restriction={isDoctoreTestOpponent(selectedOpponent) ? testRestriction : null}
          /* PITCH A1 — Fortuna's word on this bout, if one waits on it. */
          omen={resolveOmen(playerProfile)}
          onConfirm={(mode) => {
            const opp = selectedOpponent;
            const restriction = isDoctoreTestOpponent(opp) ? testRestriction : null;
            setSelectedOpponent(null);
            setTestRestriction(null);
            if (restriction && onEnterDoctoreTest) onEnterDoctoreTest(restriction, mode);
            else onSelectOpponent(opp, mode);
          }}
          onCancel={() => {
            setSelectedOpponent(null);
            setTestRestriction(null);
          }}
        />
      )}

      {/* HELP MODAL */}
      {showHelp && (
        <HelpModal
          onClose={() => {
            setShowHelp(false);
            setHelpMarked(false);
          }}
        />
      )}

      {/* CL-2 — the first-open coach card.  Non-modal: the camp underneath stays usable. */}
      {showFirstOpenCard && firstOpenCard && (
        <CoachCard
          id={HUB_FIRST_OPEN_CARD_ID}
          card={firstOpenCard}
          placement="bottom"
          onDismiss={() => {
            setShowFirstOpenCard(false);
            setHelpMarked(false);
          }}
        />
      )}
    </div>
  );
};
