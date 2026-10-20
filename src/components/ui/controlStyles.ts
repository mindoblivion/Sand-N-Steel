/**
 * UI-1 — the shared control classes.
 *
 * `CLOSE_BUTTON_CLASS` is SettingsModal's header ✕ (the C-8.70B §SET-1 pattern) lifted
 * out of that panel, so every close control in the game is the same round 48×48 target:
 * `w-12 h-12` for the shape, `min-h-[48px]`/`min-w-[48px]` for the touch floor whatever
 * glyph sits inside it. Each site keeps its own `aria-label` — the label is the control's
 * meaning, and it is never optional.
 *
 * Presentation only: nothing here touches a handler, a route or the save.
 */
export const CLOSE_BUTTON_CLASS =
  'shrink-0 w-12 h-12 min-h-[48px] min-w-[48px] rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-amber-200 flex items-center justify-center font-bold text-base cursor-pointer transition-colors';
