/**
 * L2 recovery port — deterministic daily storefront stock.
 *
 * The main branch's seven-phase clock is authoritative. A day is resolved
 * exclusively through resolveTimeState(profile). Rotation is a pure projection
 * of that day and the existing storefront catalogue; it persists no extra state.
 *
 * Only the travelling merchant rotates. The forge, armorer and market retain
 * their complete progression-filtered catalogue, and the Bazaar remains empty.
 */

import type { PlayerProfile } from '../types/game';
import { getStorefrontStock, getVisibleStorefrontStock, type StorefrontId } from '../data/shops';
import { resolveTimeState } from './timeState';

export const MERCHANT_ROTATION_SLOTS = 4;

const ROTATION_SLOTS: Record<StorefrontId, number | null> = {
  forge: null,
  armorer: null,
  bazaar: null,
  merchant: MERCHANT_ROTATION_SLOTS,
  market: null,
};

export const ROTATING_STOREFRONTS: readonly StorefrontId[] = (
  Object.keys(ROTATION_SLOTS) as StorefrontId[]
).filter((id) => ROTATION_SLOTS[id] !== null);

export interface StorefrontRotation {
  storefront: StorefrontId;
  rotates: boolean;
  slots: number;
  itemIds: string[];
}

export interface DailyStorefrontRotation {
  day: number;
  storefronts: Record<StorefrontId, StorefrontRotation>;
}

function normalizeDay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER));
}

function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function rotationStart(day: number, id: string, size: number): number {
  return hash32(`sand-and-steel:city-rotation:${id}:${day}`) % size;
}

/** Select a stable, contiguous daily window, returned in catalogue order. */
export function selectDailyWindow(
  eligible: readonly string[],
  slots: number | null,
  id: string,
  day: number
): string[] {
  if (slots === null || slots >= eligible.length || eligible.length === 0) {
    return [...eligible];
  }

  const start = rotationStart(normalizeDay(day), id, eligible.length);
  const picked: number[] = [];
  for (let i = 0; i < slots; i += 1) picked.push((start + i) % eligible.length);
  picked.sort((a, b) => a - b);
  return picked.map((index) => eligible[index]);
}

/** Resolve a storefront's catalogue stock for an explicit in-game day. */
export function rotateStorefrontStock(id: StorefrontId, day: number): string[] {
  return selectDailyWindow(getStorefrontStock(id), ROTATION_SLOTS[id], id, day);
}

/**
 * The shop screen's single offer resolver. It preserves main's facility unlock
 * filter before applying rotation, so locked Master Forge gear stays locked.
 */
export function resolveStorefrontOffer(
  profile: PlayerProfile | null | undefined,
  id: StorefrontId
): string[] {
  const day = resolveTimeState(profile).day;
  return selectDailyWindow(getVisibleStorefrontStock(id, profile), ROTATION_SLOTS[id], id, day);
}

export function isStorefrontItemOnOffer(
  profile: PlayerProfile | null | undefined,
  id: StorefrontId,
  itemId: string
): boolean {
  return resolveStorefrontOffer(profile, id).includes(itemId);
}

export function resolveDailyStorefrontRotation(
  profile?: PlayerProfile | null
): DailyStorefrontRotation {
  const day = resolveTimeState(profile).day;
  const storefronts = {} as Record<StorefrontId, StorefrontRotation>;

  for (const id of Object.keys(ROTATION_SLOTS) as StorefrontId[]) {
    const rotates = ROTATION_SLOTS[id] !== null;
    const itemIds = resolveStorefrontOffer(profile, id);
    storefronts[id] = { storefront: id, rotates, slots: itemIds.length, itemIds };
  }

  return { day, storefronts };
}
