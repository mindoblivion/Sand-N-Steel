import { FATE_CARDS, getFateCard, type FateCard, type FateCardCategory } from '../data/fateCards';

/** A saved, deterministic three-card offer created by crossing one XP threshold. */
export interface FateDraft {
  level: number;
  cardIds: [string, string, string];
}

/** Stored lazily under PlayerProfile.records.fate; absent on pre-Fate saves. */
export interface FateProgressionState {
  ownedCardIds: string[];
  pendingDrafts: FateDraft[];
  /** Highest level whose reward draft has already been created. */
  lastDraftedLevel: number;
}

export interface FateCardChoice {
  state: FateProgressionState;
  card: FateCard;
  immediateGold: number;
}

export const EMPTY_FATE_STATE: FateProgressionState = {
  ownedCardIds: [],
  pendingDrafts: [],
  lastDraftedLevel: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cardCount(ids: string[], cardId: string): number {
  return ids.filter((id) => id === cardId).length;
}

/** Missing or malformed data resolves lazily; reading never repairs a save. */
export function resolveFateState(value: unknown): FateProgressionState {
  if (!isRecord(value)) return { ...EMPTY_FATE_STATE };
  const ownedCardIds = Array.isArray(value.ownedCardIds)
    ? value.ownedCardIds.filter((id): id is string => typeof id === 'string' && Boolean(getFateCard(id)))
    : [];
  const pendingDrafts: FateDraft[] = Array.isArray(value.pendingDrafts)
    ? value.pendingDrafts.flatMap((draft): FateDraft[] => {
        if (!isRecord(draft) || !Number.isInteger(draft.level) || (draft.level as number) < 2) return [];
        if (!Array.isArray(draft.cardIds) || draft.cardIds.length !== 3) return [];
        const ids = draft.cardIds;
        if (!ids.every((id) => typeof id === 'string' && Boolean(getFateCard(id)))) return [];
        if (new Set(ids).size !== 3) return [];
        return [{ level: draft.level as number, cardIds: [ids[0] as string, ids[1] as string, ids[2] as string] }];
      })
    : [];
  const lastDraftedLevel =
    typeof value.lastDraftedLevel === 'number' &&
    Number.isInteger(value.lastDraftedLevel) &&
    value.lastDraftedLevel >= 1
      ? value.lastDraftedLevel
      : 0;
  return { ownedCardIds, pendingDrafts, lastDraftedLevel };
}

function eligibleCards(level: number, ownedCardIds: string[]): FateCard[] {
  return FATE_CARDS.filter(
    (card) => card.unlockLevel <= level && cardCount(ownedCardIds, card.id) < card.maxStacks,
  );
}

/**
 * Builds three offers deterministically from the character name, level and
 * current collection. This avoids rerolls on reload and makes offers reproducible.
 * It is a free earned reward, never a paid random draw.
 */
export function createFateDraft(
  level: number,
  characterSeed: string,
  ownedCardIds: string[] = [],
): FateDraft | null {
  if (!Number.isInteger(level) || level < 2) return null;
  const eligible = eligibleCards(level, ownedCardIds);
  if (eligible.length < 3) return null;
  const ranked = eligible
    .map((card) => ({
      card,
      score: stableHash(`${characterSeed}|${level}|${card.id}|${ownedCardIds.join(',')}`),
    }))
    .sort((a, b) => a.score - b.score);
  const chosen: FateCard[] = [];
  const categories = new Set<FateCardCategory>();
  for (const item of ranked) {
    if (chosen.length === 3) break;
    if (!categories.has(item.card.category)) {
      chosen.push(item.card);
      categories.add(item.card.category);
    }
  }
  for (const item of ranked) {
    if (chosen.length === 3) break;
    if (!chosen.some((card) => card.id === item.card.id)) chosen.push(item.card);
  }
  if (chosen.length !== 3) return null;
  return { level, cardIds: chosen.map((card) => card.id) as [string, string, string] };
}

/**
 * Queues exactly one persisted draft for each newly crossed level. The previous
 * level is the floor on first read, so an old save never receives retroactive
 * rewards for levels it earned before Fate existed.
 */
export function queueFateLevelUps(
  stateInput: unknown,
  levelBefore: number,
  levelAfter: number,
  characterSeed: string,
): FateProgressionState {
  const state = resolveFateState(stateInput);
  const fromLevel = Math.max(
    Number.isInteger(levelBefore) && levelBefore > 0 ? levelBefore : 1,
    state.lastDraftedLevel || 1,
  );
  if (!Number.isInteger(levelAfter) || levelAfter <= fromLevel) return state;
  const pendingDrafts = [...state.pendingDrafts];
  let lastDraftedLevel = fromLevel;
  for (let level = fromLevel + 1; level <= levelAfter; level += 1) {
    const draft = createFateDraft(level, characterSeed, state.ownedCardIds);
    if (draft) pendingDrafts.push(draft);
    lastDraftedLevel = level;
  }
  return { ...state, pendingDrafts, lastDraftedLevel };
}

/** Accepts only a card in the first pending offer; invalid/replayed taps are inert. */
export function chooseFateCard(
  stateInput: unknown,
  cardId: string,
): FateCardChoice | null {
  const state = resolveFateState(stateInput);
  const draft = state.pendingDrafts[0];
  if (!draft || !draft.cardIds.includes(cardId)) return null;
  const card = getFateCard(cardId);
  if (!card || cardCount(state.ownedCardIds, cardId) >= card.maxStacks) return null;
  const immediateGold = card.effect.kind === 'gold_flat' ? card.effect.value : 0;
  return {
    state: {
      ...state,
      ownedCardIds: [...state.ownedCardIds, cardId],
      pendingDrafts: state.pendingDrafts.slice(1),
    },
    card,
    immediateGold,
  };
}
