/**
 * STORY-5b — THE ERASED CHAMPION (Story §3C) and "THE NAME IN THE STONE"
 *             (keeper-lives §2.2).
 *
 * Run with: `bun test src/utils/librarianChain.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the chain IN ORDER — step 1 the Codex read records the boundary, step 2
 *       is the first defeat AFTER that boundary, step 3 the Veteran return pays
 *       5 Laudes once and opens the sequence; every writer identity-stable;
 *   §B  the fragment order, with the BATHHOUSE THIRD, and the sequence enforced
 *       in one place (out of order, repeat and unknown ids all refuse);
 *   §C  the exhibition unlocks — one per fragment, each a staged EXISTING
 *       roster row dressed in an era kit, the card hidden until the chain opens;
 *   §D  the echo bout gated by 3/3 fragments and by NOTHING else, and its first
 *       victory spoken ONCE;
 *   §E  the exhibition FENCE in App's result path, win and loss, item by item —
 *       every skipped thing and every kept thing, read out of the shipped source;
 *   §F  the Codex's Fragments page: absent before the chain, SEALED (and empty of
 *       text) once the sequence opens, and the vellum IFF the chain is complete;
 *   §G  FELIX is a COGNOMEN and only ever that — no fuller name is invented;
 *   §H  the save: §J still 22 optional top-level fields, `records` still last, and
 *       no new top-level field anywhere.
 *
 * The components are rendered with `react-dom/server` (`createElement`, so this
 * stays a `.ts` file); the pure rules come from `utils/librarianChain.ts`, and
 * nothing here writes storage or reads a clock.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { ALL_OPPONENTS } from '../data/opponents';
import { getKeeper } from '../data/keepers';
import { getItemById, isWeapon, ITEMS_DB } from '../data/itemsDB';
import { resolveLaudes } from './diceTrail';
import { buildCodex } from './codex';
import { CodexPage } from '../components/hub/CodexPage';
import { LegendBoutsSection } from '../components/hub/LegendBoutsSection';
import { LegendStopPanel } from '../components/hub/LegendStopPanel';
import {
  ECHO_FIRST_VICTORY_LINE,
  FELIX,
  FELIX_STYLE,
  LEGEND_BOUTS,
  LEGEND_ECHO_BOUT,
  LEGEND_EXHIBITIONS,
  LEGEND_FRAGMENTS,
  LEGEND_FRAGMENT_IDS,
  LEGEND_STAGED_IDS,
  LEGEND_STOPS,
  LIBRARIAN_CHAIN_LAUDES,
  LIBRARIAN_REQUIRED_RANK,
  allFragmentsFound,
  echoRevealOwed,
  exhibitionForFragment,
  fragmentAvailable,
  fragmentForStop,
  fragmentFound,
  hasVellum,
  isLegendBoutStaged,
  legendBoutBaseRow,
  legendBoutLoadout,
  legendBoutOpponent,
  legendBoutsView,
  legendFragmentsOpen,
  legendStopConversation,
  legendStopKeeper,
  librarianChainAwaitingClose,
  librarianChainSteps,
  nextFragment,
  resolveEchoWon,
  resolveFragmentsFound,
  resolveLibrarianChain,
  withCodexRead,
  withEchoWon,
  withFragmentFound,
  withLibrarianChainClosed,
} from './librarianChain';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const repoPath = (relative: string) => join(HERE, '..', relative);
const code = (relative: string) => readFileSync(repoPath(relative), 'utf8');

/** A starter save, with whatever this section needs layered on top. */
const profileWith = (patch: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Codex Tester'),
  ...patch,
});

/** Veteran: fame >= 150 AND the tier-2 circuit — the chain's own stated floor. */
const veteranPatch = (patch: Partial<PlayerProfile> = {}): PlayerProfile =>
  profileWith({ fame: 200, currentTier: 2, ...patch });

/** Step 1 done: the Codex page of the Library rack was opened at this record. */
const afterCodexRead = (profile: PlayerProfile = veteranPatch()): PlayerProfile =>
  withCodexRead(profile);

/** Step 1 + step 2: one name felled that the lists did not hold at the read. */
const afterFirstDefeat = (): PlayerProfile => {
  const read = afterCodexRead();
  return { ...read, defeatedOpponentIds: [...read.defeatedOpponentIds, 'opp_marcus'] };
};

/** The chain closed: the return to Dionysios at Veteran. */
const closedChain = (): PlayerProfile => withLibrarianChainClosed(afterFirstDefeat());

/** A closed chain with the first `count` fragments found, in order. */
const withFragments = (count: number): PlayerProfile => {
  let profile = closedChain();
  for (const fragment of LEGEND_FRAGMENTS.slice(0, count)) {
    profile = withFragmentFound(profile, fragment.id);
  }
  return profile;
};

// ════════════════════════════════════════════════════════════════════════════
// §A — the chain, in order
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-5b §A — the Librarian chain, in the order the player walks it', () => {
  test('step 1 is the Codex page of the Library rack, and it records the boundary', () => {
    const fresh = veteranPatch();
    expect(librarianChainSteps(fresh).step1Done).toBe(false);

    // Two names already in the book when the page is opened: the boundary is the
    // COUNT, which is what makes step 2 derivable without per-bout tracking.
    const felled = { ...fresh, defeatedOpponentIds: ['opp_a', 'opp_b'] };
    const read = withCodexRead(felled);
    expect(read).not.toBe(felled);
    expect(resolveLibrarianChain(read)).toEqual({ codexRead: true, felledAtRead: 2, closed: false });
    expect(librarianChainSteps(read).step1Done).toBe(true);

    // A repeated open is identity-stable: nothing is saved twice.
    expect(withCodexRead(read)).toBe(read);
  });

  test('step 2 is a FIRST defeat after the read, never one it already held', () => {
    const read = afterCodexRead();
    expect(librarianChainSteps(read).step2Done).toBe(false);

    // A name already in the record at the read does NOT complete step 2.
    const held = { ...read, defeatedOpponentIds: read.defeatedOpponentIds };
    expect(librarianChainSteps(held).step2Done).toBe(false);

    // A first defeat AFTER the boundary does.
    const felled = afterFirstDefeat();
    expect(felled.defeatedOpponentIds.length).toBe(read.defeatedOpponentIds.length + 1);
    expect(librarianChainSteps(felled).step2Done).toBe(true);

    // Step 2 without step 1 is not a thing: no boundary, no first defeat after it.
    const unread = { ...veteranPatch(), defeatedOpponentIds: ['opp_a', 'opp_b', 'opp_c'] };
    expect(librarianChainSteps(unread).step1Done).toBe(false);
    expect(librarianChainSteps(unread).step2Done).toBe(false);
  });

  test('step 3 asks for Veteran and pays 5 Laudes, once, into the SHARED counter', () => {
    const felled = afterFirstDefeat();
    expect(LIBRARIAN_REQUIRED_RANK).toBe('Veteran');
    expect(librarianChainSteps(felled).veteran).toBe(true);
    expect(librarianChainAwaitingClose(felled)).toBe(true);

    const closed = withLibrarianChainClosed(felled);
    expect(closed).not.toBe(felled);
    expect(resolveLibrarianChain(closed).closed).toBe(true);
    expect(resolveLaudes(closed)).toBe(LIBRARIAN_CHAIN_LAUDES);
    expect(LIBRARIAN_CHAIN_LAUDES).toBe(5);
    expect(legendFragmentsOpen(closed)).toBe(true);

    // Exactly once: a second return writes nothing and pays nothing.
    expect(withLibrarianChainClosed(closed)).toBe(closed);
    expect(resolveLaudes(withLibrarianChainClosed(closed))).toBe(5);
  });

  test('the return is never offered before its steps, nor below Veteran', () => {
    // Steps 1+2 done but the city still calls him a Rookie: not owed yet.
    const rookie = profileWith({
      fame: 100,
      currentTier: 1,
      defeatedOpponentIds: ['opp_marcus'],
    });
    const read = withCodexRead({ ...rookie, defeatedOpponentIds: [] });
    const felled = { ...read, defeatedOpponentIds: ['opp_marcus'] };
    expect(librarianChainSteps(felled).step2Done).toBe(true);
    expect(librarianChainSteps(felled).veteran).toBe(false);
    expect(librarianChainAwaitingClose(felled)).toBe(false);
    expect(withLibrarianChainClosed(felled)).toBe(felled);
    expect(legendFragmentsOpen(felled)).toBe(false);

    // Step 1 alone is never owed either, at any rank.
    expect(librarianChainAwaitingClose(afterCodexRead())).toBe(false);
  });

  test('the chain writes NOTHING at the top level of the save', () => {
    const fresh = veteranPatch();
    const closed = closedChain();
    // `story` and `records` are declared fields created lazily by these writers
    // (§H pins the 22-field list); the chain adds no OTHER top-level key at all.
    const added = Object.keys(closed).filter((key) => !(key in fresh));
    expect(added.sort()).toEqual(['records', 'story']);
    expect(closed.story?.librarianChain?.closed).toBe(true);
    expect((closed as unknown as Record<string, unknown>).librarianChain).toBeUndefined();
    expect((closed as unknown as Record<string, unknown>).echoWon).toBeUndefined();
    expect((closed as unknown as Record<string, unknown>).fragmentsFound).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — the three stops and the fragment order (the bathhouse is THIRD)
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-5b §B — three stops, three fragments, the bathhouse third', () => {
  test('the stops are the Library, the Barracks and the Bathhouse, in that order', () => {
    expect(LEGEND_STOPS.map((stop) => stop.id)).toEqual(['library', 'barracks', 'bathhouse']);
    expect(LEGEND_STOPS.map((stop) => stop.buildingId)).toEqual([
      'records_house',
      'gladiator_barracks',
      'bathhouse',
    ]);
    expect(LEGEND_STOPS.map((stop) => stop.keeperId)).toEqual([
      'dionysios_of_athens',
      'titus_aufidius',
      'straton_of_corinth',
    ]);
  });

  test('each stop’s keeper is the shipped keeper of THAT building', () => {
    for (const stop of LEGEND_STOPS) {
      const keeper = legendStopKeeper(stop);
      expect(keeper).toBeDefined();
      expect(keeper?.id).toBe(stop.keeperId);
      expect(keeper?.buildingId).toBe(stop.buildingId);
      expect(getKeeper(stop.keeperId)?.name).toBe(keeper?.name);
    }
    expect(legendStopKeeper(LEGEND_STOPS[2])?.name).toBe('Straton of Corinth');
  });

  test('the fragments are numbered 1-2-3 with the BATHHOUSE at three', () => {
    expect(LEGEND_FRAGMENTS.map((fragment) => fragment.order)).toEqual([1, 2, 3]);
    expect(LEGEND_FRAGMENTS.map((fragment) => fragment.stop)).toEqual([
      'library',
      'barracks',
      'bathhouse',
    ]);
    expect(LEGEND_FRAGMENT_IDS).toEqual(['felix_f1', 'felix_f2', 'felix_f3']);
    expect(LEGEND_FRAGMENTS[2].stop).toBe('bathhouse');
    expect(fragmentForStop('bathhouse')?.order).toBe(3);
    expect(fragmentForStop('barracks')?.order).toBe(2);
    expect(fragmentForStop('library')?.order).toBe(1);
    // The reveal is F3's, and F3 is the bathhouse's — the design's order.
    expect(LEGEND_FRAGMENTS[2].text).toContain(FELIX_STYLE);
  });

  test('the sequence is closed before the chain, and one-at-a-time after it', () => {
    const fresh = veteranPatch();
    for (const fragment of LEGEND_FRAGMENTS) {
      expect(fragmentAvailable(fresh, fragment)).toBe(false);
      expect(withFragmentFound(fresh, fragment.id)).toBe(fresh);
    }
    expect(legendFragmentsOpen(fresh)).toBe(false);
    expect(nextFragment(fresh)).toBeUndefined();

    // Open: only the first is available, and only it.
    let profile = closedChain();
    expect(legendFragmentsOpen(profile)).toBe(true);
    expect(nextFragment(profile)?.id).toBe('felix_f1');
    expect(fragmentAvailable(profile, LEGEND_FRAGMENTS[1])).toBe(false);
    expect(fragmentAvailable(profile, LEGEND_FRAGMENTS[2])).toBe(false);

    // Out of order and unknown ids both refuse, identity-stable.
    expect(withFragmentFound(profile, 'felix_f2')).toBe(profile);
    expect(withFragmentFound(profile, 'felix_f3')).toBe(profile);
    expect(withFragmentFound(profile, 'not_a_fragment')).toBe(profile);
    expect(withFragmentFound(profile, undefined)).toBe(profile);

    // In order, one at a time.
    profile = withFragmentFound(profile, 'felix_f1');
    expect(resolveFragmentsFound(profile)).toEqual(['felix_f1']);
    expect(fragmentFound(profile, 'felix_f1')).toBe(true);
    expect(fragmentAvailable(profile, LEGEND_FRAGMENTS[1])).toBe(true);
    expect(fragmentAvailable(profile, LEGEND_FRAGMENTS[2])).toBe(false);
    // A repeat read writes nothing.
    expect(withFragmentFound(profile, 'felix_f1')).toBe(profile);

    profile = withFragmentFound(profile, 'felix_f2');
    expect(resolveFragmentsFound(profile)).toEqual(['felix_f1', 'felix_f2']);
    expect(nextFragment(profile)?.id).toBe('felix_f3');

    profile = withFragmentFound(profile, 'felix_f3');
    expect(resolveFragmentsFound(profile)).toEqual(['felix_f1', 'felix_f2', 'felix_f3']);
    expect(nextFragment(profile)).toBeUndefined();
    expect(allFragmentsFound(profile)).toBe(true);
  });

  test('each stop speaks its own conversation, and nothing before the chain', () => {
    for (const stop of LEGEND_STOPS) {
      expect(legendStopConversation(veteranPatch(), stop.buildingId)).toBeNull();
    }
    // With the whole sequence found, every stop speaks its own fragment.
    for (const stop of LEGEND_STOPS) {
      const talk = legendStopConversation(withFragments(3), stop.buildingId);
      expect(talk?.kind).toBe('fragment');
      expect(talk?.fragment?.stop).toBe(stop.id);
    }
    // The return is the Library's, while it is owed.
    const owed = legendStopConversation(afterFirstDefeat(), 'records_house');
    expect(owed?.kind).toBe('return');
    expect(owed?.keeper.id).toBe('dionysios_of_athens');

    // Then the fragments, at their own counters, in sequence.
    let profile = closedChain();
    const first = legendStopConversation(profile, 'records_house');
    expect(first?.kind).toBe('fragment');
    expect(first?.fragment?.id).toBe('felix_f1');
    // F2's counter stays silent until F1 is found.
    expect(legendStopConversation(profile, 'gladiator_barracks')).toBeNull();
    profile = withFragmentFound(profile, 'felix_f1');
    expect(legendStopConversation(profile, 'gladiator_barracks')?.fragment?.id).toBe('felix_f2');
    expect(legendStopConversation(profile, 'bathhouse')).toBeNull();
    profile = withFragmentFound(profile, 'felix_f2');
    expect(legendStopConversation(profile, 'bathhouse')?.fragment?.id).toBe('felix_f3');
    // A found fragment stays readable — lore panels are re-readable.
    expect(legendStopConversation(profile, 'records_house')?.fragment?.id).toBe('felix_f1');
    // A building that is not a stop is never spoken to by this slice.
    expect(legendStopConversation(closedChain(), 'tavern')).toBeNull();
  });

  test('the stop panel renders the keeper, the head line and the lines', () => {
    const conversation = legendStopConversation(closedChain(), 'records_house');
    expect(conversation).not.toBeNull();
    if (!conversation) return;
    const markup = renderToStaticMarkup(
      React.createElement(LegendStopPanel, { conversation, onClose: () => {} })
    );
    expect(markup).toContain('data-legend-stop="library"');
    expect(markup).toContain('data-legend-stop-kind="fragment"');
    expect(markup).toContain('data-legend-fragment="felix_f1"');
    expect(markup).toContain('Dionysios of Athens');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — the exhibitions: staged EXISTING rows, one per fragment
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-5b §C — the exhibitions', () => {
  test('four staged bouts, and every one of them is an EXISTING non-boss row', () => {
    expect(LEGEND_BOUTS.length).toBe(4);
    expect(LEGEND_EXHIBITIONS.length).toBe(3);
    expect(LEGEND_ECHO_BOUT.key).toBe('echo');
    // No opponent row was added for this slice: the roster is what it was.
    expect(ALL_OPPONENTS.length).toBe(23);

    for (const bout of LEGEND_BOUTS) {
      const row = legendBoutBaseRow(bout);
      expect(row).toBeDefined();
      expect(row?.id).toBe(bout.opponentId);
      expect(row?.isBoss).toBeUndefined();
      expect(row?.bossMechanic).toBeUndefined();
      expect(typeof row?.rewardGold).toBe('number');
      expect(isLegendBoutStaged(row)).toBe(true);
    }
    expect([...LEGEND_STAGED_IDS].sort()).toEqual([
      'opp_brutus_anvil',
      'opp_centurion_drusus',
      'opp_hoplite',
      'opp_marcus',
    ]);
    // An ordinary ladder row is never mistaken for a staged one.
    expect(isLegendBoutStaged(ALL_OPPONENTS.find((row) => row.id === 'opp_naija_fisher'))).toBe(false);
    expect(isLegendBoutStaged(null)).toBe(false);
    expect(isLegendBoutStaged(undefined)).toBe(false);
  });

  test('each row is dressed in an era kit that RESOLVES from itemsDB', () => {
    for (const bout of LEGEND_BOUTS) {
      for (const id of [bout.kit.weaponId, bout.kit.helmId, bout.kit.chestId, bout.kit.armsId, bout.kit.legsId]) {
        if (id === undefined) continue;
        expect(getItemById(id)).toBeDefined();
        expect(ITEMS_DB.some((item) => item.id === id)).toBe(true);
      }
      const loadout = legendBoutLoadout(bout);
      expect(loadout).toBeDefined();
      if (!loadout) continue;
      expect(isWeapon(loadout.weapon)).toBe(true);
      expect(loadout.weapon.type).toBe(legendBoutBaseRow(bout)?.weaponType);
      expect(loadout.helm).toBe(getItemById(bout.kit.helmId) as never);
      expect(loadout.arms?.slot).toBe('arms');
      expect(loadout.legs?.slot).toBe('legs');
      if (bout.kit.chestId) expect(loadout.chest?.slot).toBe('chest');

      // The dressed row keeps its own id, name, stats and PURSE — the kit is the
      // only difference, and the row's weapon class is already the kit's.
      const dressed = legendBoutOpponent(bout);
      const base = legendBoutBaseRow(bout);
      expect(dressed?.id).toBe(base?.id);
      expect(dressed?.name).toBe(base?.name);
      expect(dressed?.stats).toEqual(base?.stats);
      expect(dressed?.rewardGold).toBe(base?.rewardGold);
      expect(dressed?.loadout).toEqual(loadout);
    }
  });

  test('fragment N unlocks exhibition N, and the section is hidden before the chain', () => {
    const hidden = legendBoutsView(veteranPatch());
    expect(hidden.visible).toBe(false);
    expect(hidden.exhibitions.every((entry) => entry.unlocked === false)).toBe(true);
    expect(hidden.echo?.unlocked).toBe(false);

    for (let index = 0; index < LEGEND_FRAGMENTS.length; index += 1) {
      const fragment = LEGEND_FRAGMENTS[index];
      expect(exhibitionForFragment(fragment)).toBe(LEGEND_EXHIBITIONS[index]);
      expect(LEGEND_EXHIBITIONS[index].key).toBe(fragment.exhibitionKey);

      const view = legendBoutsView(withFragments(index + 1));
      expect(view.visible).toBe(true);
      expect(view.exhibitions.length).toBe(3);
      view.exhibitions.forEach((entry, position) => {
        expect(entry.unlocked).toBe(position <= index);
        // The gate sentence names the fragment still to be found.
        if (position > index) expect(entry.gateText).toContain('Sealed');
      });
    }

    // Nothing is unlocked by the chain alone.
    const opened = legendBoutsView(closedChain());
    expect(opened.visible).toBe(true);
    expect(opened.exhibitions.every((entry) => entry.unlocked === false)).toBe(true);
  });

  test('the tournament slot draws the sealed cards and the open one', () => {
    const hidden = renderToStaticMarkup(
      React.createElement(LegendBoutsSection, {
        profile: veteranPatch(),
        onEnterBout: () => {},
      })
    );
    expect(hidden).not.toContain('data-legend-bouts');

    const opened = renderToStaticMarkup(
      React.createElement(LegendBoutsSection, {
        profile: withFragments(1),
        onEnterBout: () => {},
      })
    );
    expect(opened).toContain('data-legend-bouts');
    for (const bout of LEGEND_BOUTS) {
      expect(opened).toContain(`data-legend-bout="${bout.key}"`);
    }
    expect(opened).toContain('data-legend-bout="exhibition1" data-legend-bout-open="true"');
    expect(opened).toContain('data-legend-bout="exhibition2" data-legend-bout-open="false"');
    expect(opened).toContain('data-legend-bout="exhibition3" data-legend-bout-open="false"');
    expect(opened).toContain('data-legend-bout="echo" data-legend-bout-open="false"');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — the echo bout
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-5b §D — the echo bout, gated by three fragments and nothing else', () => {
  test('the echo is sealed until all three fragments are found', () => {
    for (let found = 0; found < 3; found += 1) {
      const view = legendBoutsView(withFragments(found));
      expect(view.echo?.unlocked).toBe(false);
      expect(allFragmentsFound(withFragments(found))).toBe(false);
    }
    const all = legendBoutsView(withFragments(3));
    expect(all.echo?.unlocked).toBe(true);
    expect(allFragmentsFound(withFragments(3))).toBe(true);
    expect(all.echo?.bout).toBe(LEGEND_ECHO_BOUT);
  });

  test('it is gated by the FRAGMENTS alone — not rank, fame, tier or chapter', () => {
    // A Rookie at fame 0 whose three fragments are found still gets the echo: the
    // gate reads `allFragmentsFound` and nothing else.
    const rookie = profileWith({
      fame: 0,
      currentTier: 1,
      story: {
        librarianChain: { codexRead: true, felledAtRead: 0, closed: true },
        fragmentsFound: ['felix_f1', 'felix_f2', 'felix_f3'],
      },
    });
    expect(legendBoutsView(rookie).echo?.unlocked).toBe(true);
    // And the module's own unlock expression names that one condition.
    const module = code('utils/librarianChain.ts');
    expect(module).toContain('unlocked: open && allFragmentsFound(profile),');
    // The view resolves no rank, no chapter and no Vexus state.
    const view = module.slice(module.indexOf('export function legendBoutsView('));
    expect(view.slice(0, 1600)).not.toContain('deriveRank');
    expect(view.slice(0, 1600)).not.toContain('chapter');
  });

  test('the first victory is spoken ONCE and written in the same save', () => {
    const earned = withFragments(3);
    expect(resolveEchoWon(earned)).toBe(false);
    expect(echoRevealOwed(earned)).toBe(true);

    const won = withEchoWon(earned);
    expect(won).not.toBe(earned);
    expect(resolveEchoWon(won)).toBe(true);
    expect(echoRevealOwed(won)).toBe(false);
    // Repeatable bout, once-ever line: a second victory writes nothing.
    expect(withEchoWon(won)).toBe(won);

    // It can never be spoken early.
    const early = withFragments(2);
    expect(echoRevealOwed(early)).toBe(false);
    expect(withEchoWon(early)).toBe(early);
    const unread = veteranPatch();
    expect(withEchoWon(unread)).toBe(unread);

    // The card records that it was spoken and never repeats the line itself.
    const markup = renderToStaticMarkup(
      React.createElement(LegendBoutsSection, { profile: won, onEnterBout: () => {} })
    );
    expect(markup).toContain('data-legend-echo-spoken');
    expect(markup).not.toContain(ECHO_FIRST_VICTORY_LINE);
    expect(ECHO_FIRST_VICTORY_LINE).toContain(FELIX_STYLE);

    // App writes it on the echo bout's FIRST WON result only, in the save it
    // already composes, and tells the result screen the one line.
    const app = code('App.tsx');
    expect(app).toContain('const echoBout = activeOpponent.id === LEGEND_ECHO_BOUT.opponentId;');
    expect(app).toContain('const echoOwed = didWin && echoBout && echoRevealOwed(profile);');
    // The win is composed onto the profile this transaction already writes, so the
    // echo's flag and the victory land in ONE save.
    expect(app).toContain('settledProfile = withEchoWon(settledProfile);');
    expect(app).toContain(
      'const clock = settleDuelClock(settledProfile, duelTimeSteppedRef.current);'
    );
    // One WRITE and one spoken line in the whole file (the import is not a call).
    expect((app.match(/= withEchoWon\(/g) ?? []).length).toBe(1);
    expect((app.match(/storyLines\.push\(ECHO_FIRST_VICTORY_LINE\)/g) ?? []).length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — the exhibition fence in App's result path
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-5b §E — the exhibition fence, item by item, win and loss', () => {
  const app = code('App.tsx');
  /** The result transaction only: from the exhibition decision to the result modal. */
  const result = app.slice(
    app.indexOf('const exhibition = exhibitionBoutRef.current;'),
    app.indexOf('setDuelResult({')
  );
  /** The LOSS branch, in isolation. */
  const lossBranch = result.slice(
    result.indexOf('a lost GRUDGE closes'),
    result.indexOf('settledProfile = evaluateRituals(profile, updatedProfile);')
  );

  test('the flag is set at the Legend Bouts entrance and consumed by the result', () => {
    expect(app).toContain('exhibitionBoutRef.current = true;');
    expect(app).toContain('exhibitionBoutRef.current = false;');
    expect(app).toContain('onEnterLegendBout={handleEnterLegendBout}');
    expect(app).toContain('const exhibition = exhibitionBoutRef.current;');
    // The WebGL fallback is the one exit from a duel with no result: the flag
    // cannot outlive the bout and fence the NEXT duel.
    expect(app).toContain('exhibitionBoutRef.current = false;\n    setActiveHubTab(tab);');
  });

  test('SKIPPED on a win: the felled id, the grudge ledger, the tier', () => {
    expect(result).toContain('const defeated = exhibition');
    expect(result).toContain('const grudgeProfile = exhibition');
    expect(result).toContain("? { currentTier: profile.currentTier, firstDefeat: false, advanced: false }");
    // The felled id is the record it already carried — never the staged row: the
    // exhibition arm is the ternary's FIRST arm and it appends nothing.
    expect(result).toContain(
      'const defeated = exhibition\n        ? profile.defeatedOpponentIds'
    );
    // The grudge ledger is the Omen-composed profile, untouched by a grudge write.
    const exhibitionGrudge = result.slice(
      result.indexOf('const grudgeProfile = exhibition'),
      result.indexOf('// The tier moves only on a boss')
    );
    expect(exhibitionGrudge).toContain('? afterOmen');
    expect(exhibitionGrudge).toContain('recordStandardVictory(');
  });

  test('SKIPPED on a win: the triumph evaluation, the omen and the bounty', () => {
    expect(result).toContain('const awards: TriumphAwardOutcome = exhibition');
    // LUDI PHASE A REBASE, not a weakening: the Acta's settlement composes its profile
    // before the evaluation, so both the fence and the one evaluation read `ludi.profile`.
    expect(result).toContain(': applyTriumphAwards(ludi.profile, duelTriumphStats);');
    expect(result).toContain("{ profile: ludi.profile, earned: [], titles: [] }");
    expect(result).toContain('if (awards.earned.length > 0) {');
    expect((app.match(/applyTriumphAwards\(/g) ?? []).length).toBe(1);
    // A no-op settlement: the omen neither pays nor expires on an exhibition.
    expect(result).toContain('const omenSettled: OmenSettlement = exhibition');
    expect(result).toContain('{ fame: 0, gold: 0, fameBonus: 0, goldBonus: 0, paid: false, line: null }');
    expect(result).toContain('const afterOmen = exhibition ? afterInjury : clearOmen(afterInjury);');
    expect(result).toContain('const bounty: BountyVictory = exhibition');
    expect(result).toContain("{ kind: 'none', clearedRungId: null, gold: 0, fame: 0, line: '' }");
  });

  test('SKIPPED on both sides: the fight counters and the mercy offer', () => {
    expect(result).toContain('fightsWon: exhibition ? profile.fightsWon : profile.fightsWon + 1,');
    expect(result).toContain('fightsLost: exhibition ? profile.fightsLost : profile.fightsLost + 1,');
    // One write of each counter in the whole file, and both are the fenced arm.
    expect((app.match(/profile\.fightsWon \+ 1/g) ?? []).length).toBe(1);
    expect((app.match(/profile\.fightsLost \+ 1/g) ?? []).length).toBe(1);
    // The loss branch writes no felled id and opens no grudge of its own.
    expect(lossBranch).not.toContain('defeatedOpponentIds');
    // STORY-4a's offer is fenced exactly as STORY-5a's trail bouts are.
    expect(result).toContain('diceTrailBoutRef.current || exhibition');
    expect((app.match(/mercyOfferForDuel\(/g) ?? []).length).toBe(1);
  });

  test('KEPT on a win: the purse, the level, the peak and the one write', () => {
    expect(result).toContain('const nextGold = profile.gold + resultStats.goldEarned + bounty.gold;');
    expect(result).toContain('const nextFame = profile.fame + resultStats.fameEarned + bounty.fame;');
    expect(result).toContain('const nextXp = profile.xp + stats.xpEarned;');
    expect(result).toContain('peakCrowdHypeOverall: Math.max(profile.peakCrowdHypeOverall, stats.crowdHypePeak),');
    // One result, one save: the awards' profile IS the transaction's profile.
    expect(result).toContain('setProfile(awards.profile);');
    expect(result).toContain('saveProfile(awards.profile);');
    expect((result.match(/saveProfile\(/g) ?? []).length).toBe(1);
  });

  test('KEPT on a loss: the injury and the duel’s one time advance', () => {
    // The injury is resolved before the fence and is never gated by it.
    expect(result).toContain(
      'const { profile: afterInjury, event: injuryEvent } = resolveInjuryAfterDuel(profile, didWin);'
    );
    expect(result).toContain('const clock = settleDuelClock(settledProfile, duelTimeSteppedRef.current);');
    expect(result).not.toContain('settleDuelClock(exhibition');
    expect(result).not.toContain('resolveInjuryAfterDuel(exhibition');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — the Codex's Fragments page and the vellum
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-5b §F — the Fragments page is hidden before the chain and sealed after it', () => {
  test('no page at all before the chain — A5’s "no empty shell", kept', () => {
    const fresh = buildCodex(veteranPatch());
    expect(fresh.fragments).toBeUndefined();
    expect(fresh.pages.map((page) => page.id)).toEqual([
      'gladiators',
      'bosses',
      'horses',
      'arms',
      'city',
    ]);

    const markup = renderToStaticMarkup(
      React.createElement(CodexPage, { profile: veteranPatch() })
    );
    expect(markup).not.toContain('data-codex-page="fragments"');
    expect(markup).not.toContain('data-codex-fragments-found');
    expect(markup).not.toContain('Fragment 1');
  });

  test('after the chain: three rows, SEALED and carrying no text', () => {
    const codex = buildCodex(closedChain());
    expect(codex.fragments).toBeDefined();
    const page = codex.fragments;
    if (!page) return;
    expect(page.id).toBe('fragments');
    expect(page.entries.map((entry) => entry.order)).toEqual([1, 2, 3]);
    expect(page.entries.map((entry) => entry.title)).toEqual([
      'Fragment 1',
      'Fragment 2',
      'Fragment 3',
    ]);
    expect(page.entries.every((entry) => entry.found === false)).toBe(true);
    expect(page.entries.every((entry) => entry.text === undefined)).toBe(true);
    expect(page.found).toBe(0);
    expect(page.total).toBe(3);

    // The payload itself cannot spoil the reveal: none of the authored text is in
    // the snapshot before the fragment is found.
    const serialised = JSON.stringify(codex);
    for (const fragment of LEGEND_FRAGMENTS) {
      expect(serialised).not.toContain(fragment.text.slice(0, 40));
    }

    // A lore page, never one of the counted pages nor a completeness denominator.
    expect(codex.pages.some((counted) => (counted.id as string) === 'fragments')).toBe(false);
    expect(codex.total).toBe(
      codex.pages.reduce((sum, countedPage) => sum + countedPage.total, 0)
    );
    expect(codex.complete).toBe(false);
  });

  test('a found fragment reads its authored text; the others stay sealed', () => {
    const page = buildCodex(withFragments(1)).fragments;
    expect(page).toBeDefined();
    if (!page) return;
    expect(page.found).toBe(1);
    expect(page.entries[0].found).toBe(true);
    expect(page.entries[0].title).toBe(LEGEND_FRAGMENTS[0].title);
    expect(page.entries[0].text).toBe(LEGEND_FRAGMENTS[0].text);
    expect(page.entries[1].text).toBeUndefined();
    expect(page.entries[2].text).toBeUndefined();
  });

  test('the rendered page shows the sealed rows and then the read one', () => {
    const sealed = renderToStaticMarkup(
      React.createElement(CodexPage, { profile: closedChain() })
    );
    expect(sealed).toContain('data-codex-page="fragments"');
    expect(sealed).toContain('data-codex-fragments-found="0"');
    for (const fragment of LEGEND_FRAGMENTS) {
      expect(sealed).toContain(`data-codex-fragment="${fragment.id}"`);
      expect(sealed).toContain(`data-codex-fragment="${fragment.id}" data-codex-fragment-found="false"`);
      expect(sealed).not.toContain(fragment.text);
    }
    expect((sealed.match(/data-codex-fragment-sealed/g) ?? []).length).toBe(3);
    expect(sealed).toContain('Sealed — not yet found.');

    const read = renderToStaticMarkup(
      React.createElement(CodexPage, { profile: withFragments(1) })
    );
    expect(read).toContain('data-codex-fragments-found="1"');
    expect(read).toContain('data-codex-fragment="felix_f1" data-codex-fragment-found="true"');
    expect(read).toContain('data-codex-fragment-text');
    expect(read).toContain('1 of 3 recovered');
  });

  test('the vellum is worn IFF the chain is complete — shipped, not deferred', () => {
    expect(hasVellum(veteranPatch())).toBe(false);
    expect(hasVellum(afterFirstDefeat())).toBe(false);
    expect(hasVellum(closedChain())).toBe(true);
    // The fragments do not wear it (and do not take it away).
    expect(hasVellum(withFragments(0))).toBe(true);
    expect(hasVellum(withFragments(3))).toBe(true);

    const plain = renderToStaticMarkup(
      React.createElement(CodexPage, { profile: veteranPatch() })
    );
    expect(plain).toContain('data-codex-vellum="false"');
    const vellum = renderToStaticMarkup(
      React.createElement(CodexPage, { profile: closedChain() })
    );
    expect(vellum).toContain('data-codex-vellum="true"');
    // It is a style variant on the page and NOTHING else: no count, no unlock.
    const plainCodex = buildCodex(afterFirstDefeat());
    const vellumCodex = buildCodex(closedChain());
    expect(vellumCodex.percent).toBe(plainCodex.percent);
    expect(vellumCodex.total).toBe(plainCodex.total);
    expect(vellumCodex.laurelCount).toBe(plainCodex.laurelCount);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — FELIX is a cognomen, and only ever that
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-5b §G — the erased champion is FELIX and nothing more', () => {
  test('the published name is the cognomen alone', () => {
    expect(FELIX).toBe('FELIX');
    expect(FELIX_STYLE).toBe('FELIX, the Lucky');
  });

  test('no fragment names him more fully, in the module or on the surfaces', () => {
    for (const path of [
      'utils/librarianChain.ts',
      'components/hub/FragmentsPage.tsx',
      'components/hub/LegendBoutsSection.tsx',
      'components/hub/LegendStopPanel.tsx',
      'components/hub/CodexPage.tsx',
    ]) {
      const source = code(path);
      for (const match of source.matchAll(/FELIX/g)) {
        const tail = source.slice(match.index ?? 0, (match.index ?? 0) + 40);
        // Every continuation is the bare cognomen or the epithet, comma-separated.
        expect(tail).not.toMatch(/^FELIX\s+[A-Z][A-Za-z]/);
        expect(tail).not.toMatch(/^FELIX\s+[A-Z]+\b(?!,)/);
      }
      // And no authored string invents a nomen in Title case either.
      expect(source).not.toMatch(/\bFelix\s+[A-Z][a-z]{2,}/);
    }
  });

  test('the reveal says what survives, and what the erasure was for', () => {
    const reveal = LEGEND_FRAGMENTS[2];
    expect(reveal.stop).toBe('bathhouse');
    expect(reveal.text).toContain(FELIX_STYLE);
    expect(reveal.text).toContain('cognomen');
    expect(reveal.text).toContain('Erased by decree');
    // F1 and F2 never spell the name at all: the sequence is the reveal.
    for (const fragment of LEGEND_FRAGMENTS.slice(0, 2)) {
      expect(fragment.text).not.toContain(FELIX);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — the save: §J still 22, and no new top-level field
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-5b §H — the save carries no new top-level field', () => {
  /** The optional top-level members of `PlayerProfile`, exactly as §J scans them. */
  const optionalFields = (): string[] => {
    const types = code('types/game.ts');
    const start = types.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = types.indexOf('{', start); i < types.length; i += 1) {
      if (types[i] === '{') depth += 1;
      if (types[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = types.slice(start, end);
    return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map((match) => match[1]);
  };

  test('§J is still 22 optional fields, with `records` last', () => {
    const fields = optionalFields();
    // LUDI PHASE A REBASE: the calendar's `ludi` joined the set; `records` still closes it.
    // PITCH A4 REBASE: `identity` joined it before `ludi`, so the set is 24.
    expect(fields.length).toBe(24);
    expect(fields[fields.length - 1]).toBe('records');
    for (const name of ['librarianChain', 'echoWon', 'fragmentsFound', 'laudes']) {
      expect(fields).not.toContain(name);
    }
  });

  test('a new profile writes none of the chain’s fields', () => {
    const fresh = createNewProfile('Codex Tester');
    expect(fresh.story).toBeUndefined();
    expect(fresh.records).toBeUndefined();
    expect(JSON.stringify(fresh)).not.toContain('librarianChain');
    expect(JSON.stringify(fresh)).not.toContain('echoWon');
    expect(JSON.stringify(fresh)).not.toContain('fragmentsFound');
  });

  test('everything the chain writes lives inside `story`, plus the shared Laudes', () => {
    const closed = closedChain();
    expect(closed.story?.librarianChain?.closed).toBe(true);
    expect(closed.story?.fragmentsFound ?? []).toEqual([]);
    expect(closed.records?.laudes).toBe(5);
    const echo = withEchoWon(withFragments(3));
    expect(echo.story?.echoWon).toBe(true);
    expect(resolveFragmentsFound(echo)).toEqual(['felix_f1', 'felix_f2', 'felix_f3']);
    // Laudes are STORY-5a's counter, reused — never a second one.
    const module = code('utils/librarianChain.ts');
    expect(module).toContain("import { withLaudes } from './diceTrail';");
    expect(module).not.toContain('localStorage');
    expect(module).not.toContain('Date');
    expect(module).not.toContain('Math.random');
    expect(module).not.toContain('combatCalculations');
  });
});
