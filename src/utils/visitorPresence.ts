/**
 * Living City L17 — scheduled visitors as physical city residents.
 *
 * This module joins the existing main-branch clock/schedule to fixed, audited
 * street stalls. It does not add a clock, save field, collider, hub or fast-travel
 * destination. Interaction loses to a building whenever the building is nearer.
 */
import type { FighterState, PlayerProfile } from '../types/game';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { resolveVisitorSchedule } from './visitorSchedule';
import type { Visitor } from '../data/visitors';
import type { InteractiveLocation } from './cityCollisions';

export interface VisitorStall {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

export const VISITOR_STALLS: Readonly<Record<string, VisitorStall>> = Object.freeze({
  numidian_bladesmith: Object.freeze({ x: -6, z: 18, facing: Math.PI / 2 }),
  campanian_armorer: Object.freeze({ x: 12.5, z: -6.5, facing: -Math.PI / 3 }),
  emesan_weapon_trader: Object.freeze({ x: 6.5, z: -3.5, facing: -Math.PI / 4 }),
});

export const VISITOR_INTERACTION_RADIUS = 2.5;

/** Low-cost visual distinction for the three scheduled traders; no extra meshes. */
export const VISITOR_LIVERIES: Readonly<Record<string, { tunic: string; crest: string }>> = Object.freeze({
  numidian_bladesmith: Object.freeze({ tunic: '#2b3a67', crest: '#d4a017' }),
  campanian_armorer: Object.freeze({ tunic: '#713b32', crest: '#c9a66b' }),
  emesan_weapon_trader: Object.freeze({ tunic: '#31534f', crest: '#c78b3b' }),
});

const DEFAULT_VISITOR_LIVERY = Object.freeze({ tunic: '#2b3a67', crest: '#d4a017' });

export interface VisitorPresence {
  readonly visitor: Visitor;
  readonly offerItemId: string | null;
  readonly offerPartId: string | null;
  readonly stall: VisitorStall;
}

function validStall(
  stalls: Readonly<Record<string, VisitorStall>>,
  id: string,
): VisitorStall | null {
  const stall = stalls[id];
  if (!stall || typeof stall !== 'object') return null;
  return Number.isFinite(stall.x) && Number.isFinite(stall.z) &&
    Number.isFinite(stall.facing) ? stall : null;
}

/** Current arrivals only; completed visitors are already removed by the schedule. */
export function resolveVisitorPresence(
  profile?: Pick<PlayerProfile, 'time' | 'records'> | null,
  stalls: Readonly<Record<string, VisitorStall>> = VISITOR_STALLS,
): VisitorPresence[] {
  const result: VisitorPresence[] = [];
  for (const arrival of resolveVisitorSchedule(profile).arrivals) {
    const stall = validStall(stalls, arrival.visitor.id);
    if (stall) result.push({
      visitor: arrival.visitor,
      offerItemId: arrival.offerItemId,
      offerPartId: arrival.offerPartId,
      stall,
    });
  }
  return result;
}

export interface VisitorTarget {
  readonly presence: VisitorPresence;
  readonly distance: number;
}

export function resolveVisitorTarget(
  pos: readonly [number, number, number],
  presence: readonly VisitorPresence[],
  competingHub?: Pick<InteractiveLocation, 'position'> | null,
): VisitorTarget | null {
  if (!pos.every(Number.isFinite)) return null;
  let nearest: VisitorTarget | null = null;
  for (const entry of presence) {
    const distance = Math.hypot(pos[0] - entry.stall.x, pos[2] - entry.stall.z);
    if (!Number.isFinite(distance) || distance > VISITOR_INTERACTION_RADIUS) continue;
    if (!nearest || distance < nearest.distance) nearest = { presence: entry, distance };
  }
  if (!nearest) return null;
  if (competingHub) {
    const hubDistance = Math.hypot(
      pos[0] - competingHub.position[0],
      pos[2] - competingHub.position[2],
    );
    // Building retains exact ties and every case where it is closer.
    if (!Number.isFinite(hubDistance) || nearest.distance >= hubDistance - 1e-9) return null;
  }
  return nearest;
}

export function visitorPrompt(target: VisitorTarget): string {
  return `Speak with ${target.presence.visitor.name}`;
}

/** Reuse the city's existing GladiatorMesh and default character model pipeline. */
export function createVisitorFighter(entry: VisitorPresence): FighterState {
  const livery = VISITOR_LIVERIES[entry.visitor.id] ?? DEFAULT_VISITOR_LIVERY;
  return {
    id: `visitor:${entry.visitor.id}`,
    name: entry.visitor.name,
    title: entry.visitor.title,
    isPlayer: false,
    position: [entry.stall.x, 0, entry.stall.z],
    rotationY: entry.stall.facing,
    health: 1,
    stamina: 1,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: true,
    hitFlashTimer: 0,
    stats: {
      strength: 1, agility: 1, staminaMax: 1, staminaRegen: 0,
      defense: 0, healthMax: 1,
    },
    loadout: { weapon: DEFAULT_PLAYER_WEAPON },
    comboCount: 0,
    skinColor: '#d2b48c',
    hairColor: '#4b3621',
    tunicColor: livery.tunic,
    crestColor: livery.crest,
    characterModel: 'roman_warrior',
  };
}
