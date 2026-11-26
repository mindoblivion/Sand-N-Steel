// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { FATE_CARDS, getFateCard } from '../data/fateCards';
import {
  chooseFateCard,
  createFateDraft,
  queueFateLevelUps,
  resolveFateState,
} from './gladiatorFate';

describe("The Gladiator's Fate — card catalogue", () => {
  test('catalogue ids are unique and every card has a valid level, stack cap and effect', () => {
    const ids = FATE_CARDS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of FATE_CARDS) {
      expect(card.name.length).toBeGreaterThan(2);
      expect(card.unlockLevel).toBeGreaterThanOrEqual(2);
      expect(card.maxStacks).toBeGreaterThanOrEqual(1);
      expect(card.description.length).toBeGreaterThan(12);
    }
  });

  test('includes all six intended build paths and a legendary milestone card', () => {
    expect(new Set(FATE_CARDS.map((card) => card.category))).toEqual(
      new Set(['combat', 'mobility', 'survival', 'wealth', 'fame', 'mastery']),
    );
    expect(getFateCard('death_defier')?.rarity).toBe('legendary');
    expect(getFateCard('fortunes_favour')?.effect).toEqual({ kind: 'gold_flat', value: 50 });
  });
});

describe("The Gladiator's Fate — deterministic level-up drafts", () => {
  test('the same character, level and collection always produce the same three offers', () => {
    const first = createFateDraft(4, 'Cassian');
    const second = createFateDraft(4, 'Cassian');
    expect(first).toEqual(second);
    expect(first?.cardIds).toHaveLength(3);
    expect(new Set(first?.cardIds).size).toBe(3);
  });

  test('an offer prefers three different card families', () => {
    const draft = createFateDraft(6, 'Aurelia');
    const categories = draft?.cardIds.map((id) => getFateCard(id)?.category);
    expect(new Set(categories).size).toBe(3);
  });

  test('a newly crossed multi-level award queues one draft per level', () => {
    const queued = queueFateLevelUps(undefined, 1, 4, 'Cassian');
    expect(queued.pendingDrafts.map((draft) => draft.level)).toEqual([2, 3, 4]);
    expect(queued.lastDraftedLevel).toBe(4);
  });

  test('replaying an already processed level-up cannot duplicate draft offers', () => {
    const first = queueFateLevelUps(undefined, 1, 3, 'Cassian');
    const second = queueFateLevelUps(first, 3, 3, 'Cassian');
    expect(second.pendingDrafts).toEqual(first.pendingDrafts);
    expect(second.lastDraftedLevel).toBe(3);
  });

  test('a legacy save begins at its current level and receives no retroactive drafts', () => {
    const queued = queueFateLevelUps(undefined, 12, 13, 'Veteran');
    expect(queued.pendingDrafts.map((draft) => draft.level)).toEqual([13]);
  });

  test('malformed or absent saved data resolves to an empty, safe collection', () => {
    for (const malformed of [undefined, null, 7, [], { ownedCardIds: [7, 'not-a-card'], pendingDrafts: [{ level: 1, cardIds: ['x'] }] }]) {
      const state = resolveFateState(malformed);
      expect(state.ownedCardIds).toEqual([]);
      expect(state.pendingDrafts).toEqual([]);
    }
  });

  test('only a card in the first offer can be selected', () => {
    const state = queueFateLevelUps(undefined, 1, 2, 'Cassian');
    const first = state.pendingDrafts[0];
    const invalid = chooseFateCard(state, 'not-offered');
    expect(invalid).toBeNull();
    const accepted = chooseFateCard(state, first.cardIds[0]);
    expect(accepted?.state.ownedCardIds).toEqual([first.cardIds[0]]);
    expect(accepted?.state.pendingDrafts).toHaveLength(0);
  });

  test('a card choice removes only the first draft and leaves later level-ups queued', () => {
    const state = queueFateLevelUps(undefined, 1, 4, 'Cassian');
    const remaining = chooseFateCard(state, state.pendingDrafts[0].cardIds[0]);
    expect(remaining?.state.pendingDrafts.map((draft) => draft.level)).toEqual([3, 4]);
  });

  test('Fortune\'s Favour grants its authored 50 gold exactly once', () => {
    let offer = null as ReturnType<typeof createFateDraft>;
    for (let i = 0; i < 500 && (!offer || !offer.cardIds.includes('fortunes_favour')); i += 1) {
      offer = createFateDraft(2, `Fortune-seed-${i}`);
    }
    expect(offer?.cardIds).toContain('fortunes_favour');
    const choice = chooseFateCard({ pendingDrafts: [offer], ownedCardIds: [] }, 'fortunes_favour');
    expect(choice?.immediateGold).toBe(50);
    expect(chooseFateCard(choice?.state, 'fortunes_favour')).toBeNull();
  });
});

describe("PHASE2-FATE — the victory write's queue contract", () => {
  test('a level whose draft cannot form is skipped and its floor still advances', () => {
    // Level 2 unlocks five cards; owning three of them at their stack cap
    // leaves two eligible, so no draft can form — and the level is still
    // consumed, never re-offered on the next level-up.
    const owned = [
      ...Array<string>(3).fill('fleet_footed'),
      ...Array<string>(4).fill('brutal_force'),
      ...Array<string>(3).fill('iron_lungs'),
    ];
    expect(createFateDraft(2, 'Cassian', owned)).toBeNull();
    const queued = queueFateLevelUps(
      { ownedCardIds: owned, pendingDrafts: [], lastDraftedLevel: 0 },
      1,
      2,
      'Cassian',
    );
    expect(queued.pendingDrafts).toEqual([]);
    expect(queued.lastDraftedLevel).toBe(2);
    // The consumed level is gone for good: a later queue never looks back.
    const later = queueFateLevelUps(queued, 2, 3, 'Cassian');
    expect(later.pendingDrafts.map((draft) => draft.level)).toEqual([3]);
  });

  test('the saved floor wins over a stale level-before', () => {
    const state = { ownedCardIds: [], pendingDrafts: [], lastDraftedLevel: 5 };
    const queued = queueFateLevelUps(state, 3, 7, 'Cassian');
    expect(queued.pendingDrafts.map((draft) => draft.level)).toEqual([6, 7]);
    expect(queued.lastDraftedLevel).toBe(7);
  });

  test('choosing a card with no immediate reward pays nothing but records ownership', () => {
    const state = {
      ownedCardIds: [],
      pendingDrafts: [
        {
          level: 2,
          cardIds: ['brutal_force', 'fleet_footed', 'iron_lungs'] as [string, string, string],
        },
      ],
      lastDraftedLevel: 2,
    };
    const choice = chooseFateCard(state, 'brutal_force');
    expect(choice?.immediateGold).toBe(0);
    expect(choice?.state.ownedCardIds).toEqual(['brutal_force']);
    expect(choice?.state.pendingDrafts).toEqual([]);
  });
});
