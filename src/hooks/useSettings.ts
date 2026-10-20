/**
 * useSettings.ts — the settings, as React state.
 *
 * The module (`services/settings.ts`) is the store: one resolved record, one set
 * of change listeners.  React surfaces (the settings modal, the scenes that pass
 * a preference down as a prop) subscribe through this hook, so a change made in
 * the modal re-renders exactly the components that render the value — and the
 * frame loops, which read `getSettings()` directly, never re-render at all.
 *
 * `useSyncExternalStore` is the platform's own answer here: the module's cached
 * record is the external store, its snapshot is stable between writes, and the
 * subscription is the module's listener list.
 */

import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings } from '../services/settings';
import type { Settings } from '../services/settings';

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}
