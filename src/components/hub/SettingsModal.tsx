import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings,
  Image as ImageIcon,
  Gamepad2,
  Volume2,
  VolumeX,
  Accessibility,
  Sun,
  Camera,
  Move,
  Music,
  Smartphone,
  Swords,
  Sliders,
  Cloud,
  Trash2,
  Check,
} from 'lucide-react';
import { sounds } from '../../audio/soundEffects';
import { VOLUME_MAX, VOLUME_MIN, updateSettings } from '../../services/settings';
import type { Brightness, CameraDistance, Settings as SettingsRecord } from '../../services/settings';
import { useSettings } from '../../hooks/useSettings';

/** The five sections of §1.3, in the design's order. */
export type SettingsCategory = 'picture' | 'controls' | 'sound' | 'game' | 'accessibility';

/** Where the panel was opened from.  The duel and the race hide the save row. */
export type SettingsContext = 'menu' | 'duel' | 'race';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The section to open on; defaults to the last one this session. */
  initialCategory?: SettingsCategory;
  context?: SettingsContext;
  /** Row 16 — the existing Drive sync modal, opened by `App`. */
  onOpenCloudSave?: () => void;
  /** Row 18 — `App`'s existing reset, reached only through the armed two-step tap. */
  onResetSave?: () => void;
}

/**
 * The section the player last looked at, remembered for the session only.
 * Opening Settings again lands where they left off; a reload starts at Picture &
 * Camera.  Module memory, never storage.
 */
let lastCategoryThisSession: SettingsCategory | null = null;

/** How long the reset row stays armed. */
const RESET_ARM_MS = 3000;

const CATEGORIES: ReadonlyArray<{ id: SettingsCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'picture', label: 'Picture & Camera', icon: ImageIcon },
  { id: 'controls', label: 'Controls', icon: Gamepad2 },
  { id: 'sound', label: 'Sound', icon: Volume2 },
  { id: 'game', label: 'Game', icon: Cloud },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
];

/** One full-row card.  Every row is at least 56dp tall, whatever it holds. */
const RowCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`min-h-[56px] rounded-2xl bg-neutral-950/90 border border-amber-600/40 px-4 py-3 shadow-lg ${className}`}>
    {children}
  </div>
);

/** The label pair every row shares: a ≥14px name and a ≥12px description. */
const RowLabel: React.FC<{ label: string; description?: string; icon?: React.ReactNode }> = ({
  label,
  description,
  icon,
}) => (
  <div className="flex items-start gap-3 min-w-0">
    {icon && (
      <span className="shrink-0 mt-0.5 p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300">
        {icon}
      </span>
    )}
    <span className="min-w-0">
      <span className="block font-serif font-bold text-sm sm:text-base text-amber-100">{label}</span>
      {description && <span className="block text-xs text-neutral-400 mt-0.5">{description}</span>}
    </span>
  </div>
);

/** A toggle drawn as the whole row: tap anywhere, no separate switch to hunt for. */
const ToggleRow: React.FC<{
  label: string;
  description?: string;
  icon?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  onLabel?: string;
  offLabel?: string;
}> = ({ label, description, icon, checked, onChange, onLabel = 'On', offLabel = 'Off' }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`w-full min-h-[56px] text-left rounded-2xl border px-4 py-3 shadow-lg cursor-pointer transition-colors flex items-center justify-between gap-3 ${
      checked ? 'bg-amber-500/15 border-amber-400/70' : 'bg-neutral-950/90 border-neutral-700 hover:border-amber-600/50'
    }`}
  >
    <RowLabel label={label} description={description} icon={icon} />
    <span
      className={`shrink-0 min-w-[64px] min-h-[40px] flex items-center justify-center rounded-xl border font-serif font-bold text-sm uppercase tracking-wider ${
        checked ? 'bg-amber-500 text-neutral-950 border-amber-300' : 'bg-neutral-800 text-neutral-300 border-neutral-600'
      }`}
    >
      {checked ? onLabel : offLabel}
    </span>
  </button>
);

/** A three-way choice: each chip is a full-height target inside one row card. */
function ChoiceRow<T extends string>({
  label,
  description,
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <RowCard>
      <RowLabel label={label} description={description} icon={icon} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`min-h-[48px] rounded-xl border font-serif font-bold text-xs sm:text-sm uppercase tracking-wider cursor-pointer transition-colors ${
                active
                  ? 'bg-amber-500 text-neutral-950 border-amber-300'
                  : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:border-amber-600/60'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </RowCard>
  );
}

/** A slider with its value written out beside the label. */
const SliderRow: React.FC<{
  label: string;
  description?: string;
  icon?: React.ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (next: number) => void;
}> = ({ label, description, icon, min, max, step, value, display, onChange }) => (
  <RowCard>
    <div className="flex items-start justify-between gap-3">
      <RowLabel label={label} description={description} icon={icon} />
      <span className="shrink-0 font-mono font-bold text-sm text-amber-200 bg-amber-950/70 border border-amber-700/60 rounded-lg px-2.5 py-1">
        {display}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-3 w-full h-12 accent-amber-400 cursor-pointer"
    />
  </RowCard>
);

/**
 * The settings panel — one menu, every wired row live.
 *
 * §1.3's layout: a category rail beside a scrolling panel, and the same rail as a
 * chip row above the panel under 640px.  Every control is at least 48dp, every
 * toggle and chip row at least 56dp, and there is deliberately **no Apply** — each
 * change is written to the settings record the moment it is made, so the panel
 * only ever shows what is already stored.
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialCategory,
  context = 'menu',
  onOpenCloudSave,
  onResetSave,
}) => {
  const settings: SettingsRecord = useSettings();
  const [category, setCategory] = useState<SettingsCategory>(
    () => initialCategory ?? lastCategoryThisSession ?? 'picture',
  );
  const [resetArmed, setResetArmed] = useState(false);

  const handleDone = useCallback(() => {
    sounds.playClick();
    onClose();
  }, [onClose]);

  // Opening the panel lands on the category asked for, or where the session left
  // off, and always with the reset row disarmed.
  useEffect(() => {
    if (!isOpen) return;
    setCategory(initialCategory ?? lastCategoryThisSession ?? 'picture');
    setResetArmed(false);
  }, [isOpen, initialCategory]);

  useEffect(() => {
    if (isOpen) lastCategoryThisSession = category;
  }, [isOpen, category]);

  // Esc is Done, exactly like the footer button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleDone();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleDone]);

  // The armed reset falls back after three seconds, whether or not it is used.
  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), RESET_ARM_MS);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  if (!isOpen) return null;

  const set = (patch: Partial<SettingsRecord>) => updateSettings(patch);

  const brightnessOptions: ReadonlyArray<{ value: Brightness; label: string }> = [
    { value: 'dim', label: 'Dim' },
    { value: 'standard', label: 'Standard' },
    { value: 'bright', label: 'Bright' },
  ];

  const distanceOptions: ReadonlyArray<{ value: CameraDistance; label: string }> = [
    { value: 'near', label: 'Near' },
    { value: 'standard', label: 'Standard' },
    { value: 'far', label: 'Far' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none"
      data-settings-context={context}
    >
      <div
        className="w-full bg-neutral-900 border-2 border-amber-500/80 rounded-3xl shadow-2xl text-amber-100 flex flex-col max-h-[94dvh]"
        style={{ width: 'min(940px, 94vw)' }}
        role="dialog"
        aria-label="Settings"
      >
        <div className="h-1.5 shrink-0 rounded-t-3xl bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-600" />

        {/* HEADER — the gear is a static mark. */}
        <div className="shrink-0 flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-neutral-800">
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-300">
              <Settings className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif font-black text-lg sm:text-xl text-amber-200 uppercase tracking-wider">
                Settings
              </h2>
              <p className="text-xs text-amber-400/80 font-mono">
                Everything here saves as you change it
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDone}
            aria-label="Done"
            className="shrink-0 w-12 h-12 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-amber-200 flex items-center justify-center font-bold text-base cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* BODY — the rail, then the panel that scrolls. */}
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row gap-3 p-3 sm:p-5">
          <nav
            aria-label="Settings sections"
            className="shrink-0 flex sm:flex-col gap-2 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0"
          >
            {CATEGORIES.map(({ id, label, icon: Icon }) => {
              const active = id === category;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  aria-pressed={active}
                  className={`shrink-0 min-h-[48px] sm:w-[168px] flex items-center gap-2 px-3 rounded-xl border font-serif font-bold text-xs sm:text-sm uppercase tracking-wider cursor-pointer transition-colors ${
                    active
                      ? 'bg-amber-500/25 border-amber-400 text-amber-100'
                      : 'bg-neutral-950/80 border-neutral-800 text-neutral-400 hover:text-amber-200 hover:border-amber-700/60'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto flex flex-col gap-3 pr-1">
            {category === 'picture' && (
              <>
                <ChoiceRow
                  label="Brightness"
                  description="How bright the world is drawn."
                  icon={<Sun className="w-5 h-5" />}
                  options={brightnessOptions}
                  value={settings.brightness}
                  onChange={(brightness) => set({ brightness })}
                />
                <ChoiceRow
                  label="City Camera Distance"
                  description="How far the camera sits behind your gladiator in the city."
                  icon={<Camera className="w-5 h-5" />}
                  options={distanceOptions}
                  value={settings.cityCamDistance}
                  onChange={(cityCamDistance) => set({ cityCamDistance })}
                />
              </>
            )}

            {category === 'controls' && (
              <>
                <ToggleRow
                  label="Lefty Mode"
                  description={
                    settings.lefty
                      ? 'Weapon in the left hand, shield in the right.'
                      : 'Weapon in the right hand, shield in the left.'
                  }
                  icon={<Swords className="w-5 h-5" />}
                  checked={settings.lefty}
                  onChange={(lefty) => set({ lefty })}
                  onLabel="Lefty"
                  offLabel="Righty"
                />
                <SliderRow
                  label="Camera Sensitivity"
                  description="How far the view turns for the same drag."
                  icon={<Sliders className="w-5 h-5" />}
                  min={1}
                  max={10}
                  step={1}
                  value={settings.cameraSensitivity}
                  display={String(settings.cameraSensitivity)}
                  onChange={(cameraSensitivity) => set({ cameraSensitivity })}
                />
                <ToggleRow
                  label="Vibration"
                  description="A short buzz when your blade lands."
                  icon={<Smartphone className="w-5 h-5" />}
                  checked={settings.vibration}
                  onChange={(vibration) => set({ vibration })}
                />
                <RowCard>
                  <RowLabel
                    label="Touch & Movement"
                    description="How the controls are laid out on this device."
                    icon={<Move className="w-5 h-5" />}
                  />
                  <div className="mt-3 flex flex-col gap-1.5 text-xs text-neutral-300 leading-relaxed">
                    <p>• Mobile joystick: standard left/right and forward/back response.</p>
                    <p>• Gladiator pace: a grounded stride with smooth camera yaw damping.</p>
                    <p>• Desktop: WASD or arrow keys to move, E or Space to act, and the tactic panel in the arena.</p>
                    <p>• Circus racing: steering under one thumb, throttle and brake under the other.</p>
                    <p>• Circus racing keys: W or ↑ gallop, S or ↓ brake, A/D or ←/→ steer.</p>
                  </div>
                </RowCard>
              </>
            )}

            {category === 'sound' && (
              <>
                <ToggleRow
                  label="All sound"
                  description="Silences music, the crowd and every effect."
                  icon={settings.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  checked={!settings.muted}
                  onChange={(on) => set({ muted: !on })}
                  onLabel="On"
                  offLabel="Muted"
                />
                <SliderRow
                  label="Music"
                  description="The level of the music behind everything else."
                  icon={<Music className="w-5 h-5" />}
                  min={VOLUME_MIN}
                  max={VOLUME_MAX}
                  step={0.05}
                  value={settings.musicVolume}
                  display={`${Math.round(settings.musicVolume * 100)}%`}
                  onChange={(musicVolume) => set({ musicVolume })}
                />
              </>
            )}

            {category === 'game' && (
              <>
                {onOpenCloudSave && (
                  <button
                    type="button"
                    onClick={onOpenCloudSave}
                    className="w-full min-h-[56px] text-left rounded-2xl bg-neutral-950/90 border border-cyan-600/50 hover:border-cyan-400 px-4 py-3 shadow-lg cursor-pointer transition-colors flex items-center justify-between gap-3"
                  >
                    <RowLabel
                      label="Cloud save"
                      description="Back this gladiator up to Google Drive, or bring one back."
                      icon={<Cloud className="w-5 h-5 text-cyan-300" />}
                    />
                    <span className="shrink-0 font-serif font-bold text-xs uppercase tracking-wider text-cyan-300">
                      Open
                    </span>
                  </button>
                )}

                {/* Menu only: the duel and the race do not offer to erase a save. */}
                {context === 'menu' && onResetSave && (
                  <RowCard className="border-red-800/60 bg-red-950/30">
                    <div className="flex items-center justify-between gap-3">
                      <RowLabel
                        label="Reset save"
                        description="Erase this gladiator and begin a new legend."
                        icon={<Trash2 className="w-5 h-5 text-red-300" />}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!resetArmed) {
                            setResetArmed(true);
                            return;
                          }
                          sounds.playClick();
                          onResetSave();
                          onClose();
                        }}
                        className={`shrink-0 min-h-[48px] px-3 rounded-xl border font-serif font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors ${
                          resetArmed
                            ? 'bg-red-600 text-neutral-950 border-red-300'
                            : 'bg-red-900/70 text-red-100 border-red-500/60 hover:bg-red-800'
                        }`}
                      >
                        {resetArmed ? 'Tap again to erase everything' : 'Reset save'}
                      </button>
                    </div>
                  </RowCard>
                )}
              </>
            )}

            {category === 'accessibility' && (
              <RowCard>
                <RowLabel
                  label="Nothing to set here yet"
                  description="Screen-motion and camera-shake controls arrive with the accessibility pass."
                  icon={<Accessibility className="w-5 h-5" />}
                />
              </RowCard>
            )}
          </div>
        </div>

        {/* FOOTER — one Done, full width. */}
        <div className="shrink-0 p-3 sm:p-5 border-t border-neutral-800">
          <button
            type="button"
            onClick={handleDone}
            className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-sm uppercase tracking-wider shadow-xl cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
};
