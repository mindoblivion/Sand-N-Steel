/**
 * FIRST SIXTY SECONDS — §5 (retention build-order step 4: CORE ONLY) regression suite.
 *
 * Run with: `bun test src/utils/firstSixtySeconds.test.tsx`
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A  the greeting's content: the shipped day's own name and that day's Ludi
 *       character line, one line, with no invented "Dies";
 *   §B  once per session: a second city entry in the same session greets nothing, and a
 *       new session (the module reset) greets again;
 *   §C  the greeting's DayBanner pattern: non-modal, pointer-transparent, an opacity fade
 *       that ends in `onDone`, and nothing else choreographed;
 *   §D  the pointer's priority: a triumph one step away beats the ladder champion, the
 *       champion beats the Codex gap, a defeated champion is skipped and a Feature Bout is
 *       never pointed at;
 *   §E  the 1-step definition (R-STEP): integer counters only, peaks never;
 *   §F  the Codex gap arithmetic: 24 − faced;
 *   §G  the marker: its target id IS the pointer's target, on a real hub location, and it
 *       is drawn only while the pointer is live;
 *   §H  session silence: the walk-off trigger, one dismissal, no re-show this session, and
 *       a greeting again next session;
 *   §I  the Acta card's ONE unfinished-business line: grudge → unviewed triumph → none,
 *       with nothing invented;
 *   §J  Ludi Phase A untouched: the card's show rule and its dismissal, and the pointer's
 *       own source reading nothing of the deed draw;
 *   §K  the save corpus: §J is still 23 optional fields and there is no new top-level one;
 *   §L  the clock ban: neither new module reads a wall clock or a store.
 *
 * `.tsx`, not `.ts`: it renders the Acta card and the greeting to static markup.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { PHASES_PER_DAY } from './timeState';
import { LUDI_DAY_CHARACTER, resolveLudiState } from './ludiCalendar';
import { LUDI_ROTATION, ludiDayName, ludiIndexForDay } from './dayRollover';
import { CODEX_GLADIATOR_ROWS } from './codex';
import { HUB_LOCATIONS } from './cityCollisions';
import { ALL_OPPONENTS, isLadderBoss } from '../data/opponents';
import {
  LADDER_BOSS_ORDER,
  ONE_STEP_TRIUMPHS,
  nextUndefeatedLadderBoss,
  oneStepTriumphs,
  resolveHeraldPointer,
  unfacedGladiatorCount,
} from './heraldPointer';
import {
  CITY_WALK_OFF_SCREENS,
  firstSixtySilencedThisSession,
  greetingFor,
  greetingShownThisSession,
  markGreetingShown,
  resetFirstSixtySession,
  silenceFirstSixtyForSession,
  unfinishedBusinessLine,
  walkedOffCity,
} from './firstSixtySeconds';
import { ActaCard, actaDismissedThisSession, dismissActaThisSession, resetActaSession } from '../components/hub/ActaCard';
import { SessionGreetingBanner } from '../components/ui/SessionGreetingBanner';

// ── Sources ────────────────────────────────────────────────────────────────
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const code = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const APP = code('App.tsx');
const SCENE = code('components/3d/city/CityHubScene.tsx');
const CARD = code('components/hub/ActaCard.tsx');
const TOAST = code('components/hub/HeraldToast.tsx');

/** One function body out of `App`, sliced the way this repo's App-level suites do it. */
const appBody = (start: string, end: string): string => {
  const from = APP.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = APP.indexOf(end, from);
  return to > -1 ? APP.slice(from, to) : APP.slice(from);
};

// ── Profiles ───────────────────────────────────────────────────────────────

/** A profile woken on the given exertion day (midday), with any override applied. */
const onDay = (day: number, patch: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('First Sixty'),
  time: { total: (day - 1) * PHASES_PER_DAY + 2 },
  ...patch,
});

const BOSS_IDS = ALL_OPPONENTS.filter((opponent) => isLadderBoss(opponent)).map(
  (opponent) => opponent.id,
);

/**
 * A profile with NO count triumph one step from done: Legend (so no rank row is a step
 * away), tier 4, five victories, no Laudes/Favour and no filled chariot slots. Only the
 * boss and Codex sources can answer for it.
 */
const noOneStep = (patch: Partial<PlayerProfile> = {}): PlayerProfile =>
  onDay(4, {
    fame: 1600,
    currentTier: 4,
    fightsWon: 5,
    bossKills: 1,
    defeatedOpponentIds: ['opp_goliath_boss'],
    ...patch,
  });

// ── §A the greeting's content (R-GREET) ───────────────────────────────────
describe('FSS A §A — the greeting prints the day\'s own name and its own character line', () => {
  test('day 1 is Dies Mercatus, with that day\'s shipped line, as ONE line', () => {
    const greeting = greetingFor(onDay(1));
    expect(greeting).not.toBeNull();
    expect(greeting!.day).toBe(1);
    expect(greeting!.text).toBe(`Dies Mercatus — ${LUDI_DAY_CHARACTER[ludiIndexForDay(1)]}`);
    expect(greeting!.text.startsWith('Dies Mercatus — The stalls are loud')).toBe(true);
    expect(greeting!.text.split('\n')).toHaveLength(1);
  });

  test('every rotation day: the name and the line come from the shipped arrays, paired', () => {
    for (let day = 1; day <= LUDI_ROTATION.length * 2; day += 1) {
      const greeting = greetingFor(onDay(day))!;
      const index = ludiIndexForDay(day);
      expect(greeting.day).toBe(day);
      expect(greeting.text).toBe(`${ludiDayName(day)} — ${LUDI_DAY_CHARACTER[index]}`);
      // The name is printed VERBATIM: no second "Dies" is invented, and Ludi Magni
      // keeps the name the rotation gives it.
      expect(greeting.text).not.toContain('Dies Dies');
      if (index === 5) expect(greeting.text.startsWith('Ludi Magni — ')).toBe(true);
    }
  });

  test('it reads the LIVED day (the clock\'s day), never a fixed one', () => {
    expect(greetingFor(onDay(7))!.text.startsWith('Dies Quietus — ')).toBe(true);
    expect(greetingFor(onDay(7))!.day).toBe(7);
    // A missing profile has nothing to say.
    expect(greetingFor(null)).toBeNull();
  });

  test('the banner prints exactly the line it is handed — it authors no copy', () => {
    const html = renderToStaticMarkup(
      <SessionGreetingBanner day={3} text="Dies Fortunae — the smoke is in the street" onDone={() => {}} />,
    );
    expect(html).toContain('data-first-sixty-greeting="3"');
    expect(html).toContain('Dies Fortunae — the smoke is in the street');
    const banner = code('components/ui/SessionGreetingBanner.tsx');
    for (const forbidden of ['Dies ', 'Fortuna', 'The stalls', 'arena']) {
      expect(banner).not.toContain(forbidden);
    }
  });
});

// ── §B once per session ────────────────────────────────────────────────────
describe('FSS B §B — the greeting is once per session', () => {
  beforeEach(() => resetFirstSixtySession());

  test('the session fact flips once and stays flipped until a new session', () => {
    expect(greetingShownThisSession()).toBe(false);
    markGreetingShown();
    expect(greetingShownThisSession()).toBe(true);
    // "A second city entry" is simply another arrival: nothing resets the fact.
    markGreetingShown();
    expect(greetingShownThisSession()).toBe(true);
    // A new session — a reload, i.e. this module running afresh — greets again.
    resetFirstSixtySession();
    expect(greetingShownThisSession()).toBe(false);
  });

  test('App greets only through the session gate, and only once', () => {
    const body = appBody('const openFirstSixty =', 'const enterCity =');
    // The greeting is behind the session check, and the check is read BEFORE the mark
    // and before the greeting is set — so a second arrival cannot raise it again.
    const check = body.indexOf('greetingShownThisSession()');
    const mark = body.indexOf('markGreetingShown()');
    const set = body.indexOf('setFirstSixtyGreeting(greetingFor(');
    expect(check).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(check);
    expect(set).toBeGreaterThan(mark);
    // A silenced session greets nothing at all.
    expect(body.indexOf('firstSixtySilencedThisSession()')).toBeLessThan(mark);
  });

  test('the banner is the only thing that mounts the greeting, and it un-mounts on done', () => {
    expect(APP).toContain('{firstSixtyGreeting && (');
    expect(APP).toContain('<SessionGreetingBanner');
    expect(APP).toContain('onDone={() => {\n                setFirstSixtyGreeting(null);');
    // It is drawn over the city only, beside the day banner — never over a duel.
    const city = APP.slice(APP.indexOf("currentScreen === 'city_3d'"));
    expect(city.indexOf('<SessionGreetingBanner')).toBeGreaterThan(-1);
    expect(city.indexOf('<SessionGreetingBanner')).toBeLessThan(city.indexOf('{currentScreen === \'hub_2d\''));
  });
});

// ── §C the DayBanner pattern ───────────────────────────────────────────────
describe('FSS C §C — non-modal, pointer-transparent, fades and hands over', () => {
  test('it is non-modal: nothing is locked, blocked or gated', () => {
    const banner = code('components/ui/SessionGreetingBanner.tsx');
    expect(banner).toContain('pointer-events-none');
    expect(banner).toContain('aria-live="polite"');
    for (const forbidden of ['movementLocked', 'document.body', 'addEventListener', 'zIndex']) {
      expect(banner).not.toContain(forbidden);
    }
    // No input is taken: there is no button and no handler on the veil.
    expect(banner).not.toContain('<button');
    expect(banner).not.toContain('onClick');
  });

  test('it fades on the shipped day-banner rhythm and calls onDone once', () => {
    const banner = code('components/ui/SessionGreetingBanner.tsx');
    expect(banner).toContain("import { DAY_BANNER_HOLD_MS, DAY_FADE_MS } from './DayBanner'");
    expect(banner).toContain('opacity: veiled ? 1 : 0');
    expect(banner).toContain('transition: `opacity ${DAY_FADE_MS}ms ease-in-out`');
    expect(banner).toContain('requestAnimationFrame(() => setVeiled(true))');
    expect(banner).toContain('DAY_FADE_MS + DAY_BANNER_HOLD_MS');
    expect(banner).toContain('DAY_FADE_MS * 2 + DAY_BANNER_HOLD_MS');
    expect(banner.match(/onDoneRef\.current\(\)/g)?.length).toBe(1);
    // Three timers, all cleared: the fade, the lift and the hand-over. Nothing else.
    expect(banner.match(/setTimeout\(/g)?.length).toBe(2);
    expect(banner.match(/clearTimeout\(/g)?.length).toBe(2);
    expect(banner).toContain('cancelAnimationFrame(raf)');
    // The shipped day banner itself is untouched.
    expect(code('components/ui/DayBanner.tsx')).toContain('DAY_FADE_MS = 600');
  });
});

// ── §D the pointer's priority ──────────────────────────────────────────────
describe('FSS D §D — one pointer, in the design\'s order', () => {
  test('a triumph one step away beats the ladder champion', () => {
    // A fresh gladiator: First Blood is one victory away, Goliath still stands.
    const pointer = resolveHeraldPointer(onDay(1))!;
    expect(pointer.kind).toBe('triumph');
    expect(pointer.line).toBe('One step from a triumph: First Blood of the Sands.');
    expect(pointer.targetLocationId).toBe('colosseum');
    expect(nextUndefeatedLadderBoss(onDay(1))!.id).toBe('opp_goliath_boss');
  });

  test('with no count row one step away, the next champion answers', () => {
    const pointer = resolveHeraldPointer(noOneStep())!;
    expect(pointer.kind).toBe('boss');
    expect(pointer.line).toBe("The ladder's next champion: Ignis the Pyre Champion.");
    expect(pointer.targetLocationId).toBe('colosseum');
  });

  test('a defeated champion is skipped, in tier order', () => {
    expect(LADDER_BOSS_ORDER).toEqual([
      'opp_goliath_boss',
      'opp_ignis_boss',
      'opp_valeria_boss',
      'opp_aurelius_boss',
    ]);
    expect(nextUndefeatedLadderBoss(noOneStep({ defeatedOpponentIds: [...BOSS_IDS.slice(0, 2)] }))!.id)
      .toBe('opp_valeria_boss');
    expect(nextUndefeatedLadderBoss(noOneStep({ defeatedOpponentIds: [...BOSS_IDS] }))).toBeNull();
  });

  test('a Feature Bout is never pointed at — it is not the campaign path', () => {
    const feature = ALL_OPPONENTS.filter((opponent) => opponent.featureBout === true);
    expect(feature.length).toBeGreaterThan(0);
    for (const row of feature) expect(LADDER_BOSS_ORDER).not.toContain(row.id);
    // …and the ladder is exactly the four rungs, not the whole boss roster.
    expect(LADDER_BOSS_ORDER).toHaveLength(4);
  });

  test('with every champion down, the Codex gap answers', () => {
    const pointer = resolveHeraldPointer(
      noOneStep({ defeatedOpponentIds: [...BOSS_IDS], records: { codexLocations: [] } }),
    )!;
    expect(pointer.kind).toBe('codex');
    expect(pointer.line).toBe('20 gladiators in the Codex remain unfaced.');
    expect(pointer.targetLocationId).toBe('records_house');
  });

  test('nothing live answers null — no line is ever invented', () => {
    expect(resolveHeraldPointer(null)).toBeNull();
    const complete = noOneStep({
      defeatedOpponentIds: CODEX_GLADIATOR_ROWS.map((row) => row.id),
    });
    expect(unfacedGladiatorCount(complete)).toBe(0);
    expect(resolveHeraldPointer(complete)).toBeNull();
  });

  test('every pointer a profile can answer names a REAL hub location', () => {
    const ids = new Set(HUB_LOCATIONS.map((location) => location.id));
    const profiles = [
      onDay(1),
      onDay(2, { fightsWon: 9 }),
      noOneStep(),
      noOneStep({ defeatedOpponentIds: [...BOSS_IDS] }),
      noOneStep({ records: { laudes: 6 } }),
      noOneStep({ ludi: { day: 4, deedsDone: [], favour: 6, lastAlmsDay: 0, fameBaseline: 0, visitsToday: [] } }),
    ];
    for (const profile of profiles) {
      const pointer = resolveHeraldPointer(profile);
      if (!pointer) continue;
      expect(ids.has(pointer.targetLocationId)).toBe(true);
      expect(pointer.line.length).toBeGreaterThan(0);
      expect(pointer.line.split('\n')).toHaveLength(1);
    }
  });
});

// ── §E the 1-step definition (R-STEP) ──────────────────────────────────────
describe('FSS E §E — "1 step from done" is integer counters only', () => {
  test('the enumeration is exactly the catalogue\'s count rows, in catalogue order', () => {
    expect(ONE_STEP_TRIUMPHS.map((row) => row.id)).toEqual([
      'sand_first_blood',
      'sand_ten_victories',
      'sand_fifty_victories',
      'sand_hundred_victories',
      'sand_every_boss',
      'coin_full_chariot',
      'saga_tier_one',
      'saga_tier_two',
      'saga_tier_three',
      'saga_veteran',
      'saga_champion',
      'saga_legend',
      'saga_laurel_7',
      'saga_laurel_30',
      'saga_laurel_100',
      'saga_favour_7',
      'saga_favour_30',
      'saga_favour_100',
    ]);
  });

  test('a peak is never 1 step away, at any reading', () => {
    for (const peak of [0, 999, 1000, 4999, 5000, 24999, 25000, 999999]) {
      const steps = oneStepTriumphs(onDay(2, { gold: peak, records: { peakGold: peak } }));
      for (const id of ['coin_1000_gold', 'coin_5000_gold', 'coin_25000_gold']) {
        expect(steps.map((step) => step.row.id)).not.toContain(id);
      }
    }
  });

  test('the exact threshold − 1 is required, on both sides of it', () => {
    const ten = (fightsWon: number) =>
      oneStepTriumphs(onDay(2, { fightsWon })).map((step) => step.row.id);
    expect(ten(8)).not.toContain('sand_ten_victories');
    expect(ten(9)).toContain('sand_ten_victories');
    expect(ten(10)).not.toContain('sand_ten_victories');
    // Below the threshold but not adjacent is not a step.
    expect(ten(4)).not.toContain('sand_ten_victories');
  });

  test('a transient triumph has no reading, so it is never a step', () => {
    const steps = oneStepTriumphs(onDay(2, { fightsWon: 1 }));
    for (const id of ['sand_missio_denied', 'sand_crowd_chants']) {
      expect(steps.map((step) => step.row.id)).not.toContain(id);
    }
  });

  test('an already-earned triumph is not a step away from anything', () => {
    expect(oneStepTriumphs(onDay(2, { fightsWon: 0 })).map((step) => step.row.id)).toContain(
      'sand_first_blood',
    );
    const earned = oneStepTriumphs(
      onDay(2, { fightsWon: 0, records: { earnedTriumphs: ['sand_first_blood'] } }),
    );
    expect(earned.map((step) => step.row.id)).not.toContain('sand_first_blood');
  });

  test('the rank rows step by rank, not by a peak', () => {
    const ranked = (patch: Partial<PlayerProfile>) =>
      oneStepTriumphs(onDay(2, { fightsWon: 5, currentTier: 4, ...patch })).map((step) => step.row.id);
    // Rookie is one rank below Veteran.
    expect(ranked({})).toContain('saga_veteran');
    expect(ranked({ fame: 200, currentTier: 2 })).not.toContain('saga_veteran');
    expect(ranked({ fame: 200, currentTier: 2 })).toContain('saga_champion');
    expect(ranked({ fame: 700, currentTier: 3 })).toContain('saga_legend');
    // Legend: the tier-4 final boss is the last rank's own condition, so with fame and a
    // boss felled the rank rows are behind the player and none of them is a step away.
    expect(ranked({ fame: 1600, bossKills: 1 })).not.toContain('saga_legend');
  });

  test('the pointer READS the state — it never evaluates or awards', () => {
    const pointerModule = code('utils/heraldPointer.ts');
    for (const forbidden of ['applyTriumphAwards', 'evaluateTriumphs', 'saveProfile', 'holds(']) {
      expect(pointerModule).not.toContain(forbidden);
    }
    const before = onDay(1);
    const snapshot = JSON.stringify(before);
    resolveHeraldPointer(before);
    oneStepTriumphs(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

// ── §F the Codex gap maths ─────────────────────────────────────────────────
describe('FSS F §F — the Codex gap is 24 − faced', () => {
  test('the denominator is the shipped Gladiators page: 24 rows', () => {
    expect(CODEX_GLADIATOR_ROWS).toHaveLength(24);
    expect(unfacedGladiatorCount(onDay(1))).toBe(24);
  });

  test('it counts down with each faced row, and stops at zero', () => {
    const withFaced = (count: number) =>
      unfacedGladiatorCount(
        onDay(1, { defeatedOpponentIds: CODEX_GLADIATOR_ROWS.slice(0, count).map((row) => row.id) }),
      );
    expect(withFaced(1)).toBe(23);
    expect(withFaced(17)).toBe(7);
    expect(withFaced(24)).toBe(0);
    // Unknown ids are not "faced" rows.
    expect(unfacedGladiatorCount(onDay(1, { defeatedOpponentIds: ['not-a-row'] }))).toBe(24);
  });

  test('the line carries the number the Codex itself would count', () => {
    const profile = onDay(1, {
      defeatedOpponentIds: CODEX_GLADIATOR_ROWS.slice(0, 9).map((row) => row.id),
    });
    expect(unfacedGladiatorCount(profile)).toBe(15);
    expect(resolveHeraldPointer(profile)!.kind).toBe('triumph');
    const gapOnly = resolveHeraldPointer(
      noOneStep({ defeatedOpponentIds: BOSS_IDS }),
    )!;
    expect(gapOnly.line).toBe('20 gladiators in the Codex remain unfaced.');
  });
});

// ── §G the marker ──────────────────────────────────────────────────────────
describe('FSS G §G — the marker is the pointer\'s target, and only while it is live', () => {
  test('App hands the scene the POINTER\'S OWN target id', () => {
    expect(APP).toContain('firstSixtyPointerTarget={firstSixtyPointer?.targetLocationId ?? null}');
    expect(APP).toContain('firstSixtySilenced={firstSixtySilenced}');
  });

  test('the scene resolves that id in the city registry and draws one ring on its disc', () => {
    expect(SCENE).toContain(
      'HUB_LOCATIONS.find((location) => location.id === firstSixtyPointerTarget) ?? null',
    );
    // The marker mounts on the resolved location only, and reads the disc's OWN
    // position, radius and colour — no literal coordinate, no new asset, no light.
    expect(SCENE).toContain('{firstSixtyMarker && (');
    expect(SCENE).toContain('firstSixtyMarker.position[0], 0.02, firstSixtyMarker.position[2]');
    expect(SCENE).toContain('Math.max(0.6, firstSixtyMarker.radius - 0.35)');
    expect(SCENE).toContain('firstSixtyMarker.radius,');
    expect(SCENE).toContain('color={firstSixtyMarker.color}');
    const marker = SCENE.slice(SCENE.indexOf('{firstSixtyMarker && ('), SCENE.indexOf('{/* 3D Player Gladiator Model'));
    expect(marker).toContain('<ringGeometry');
    expect(marker).toContain('meshBasicMaterial');
    expect(marker).not.toContain('<pointLight');
    expect(marker).not.toContain('useFrame');
    expect(marker).not.toContain('.glb');
    // Exactly one marker and one ring: the city is not given a second wayfinding layer.
    expect(SCENE.match(/\{firstSixtyMarker && \(/g)?.length).toBe(1);
    expect(SCENE.match(/firstSixtyMarker \?/g)).toBeNull();
  });

  test('silencing the session removes the pointer, so the marker goes with it', () => {
    const silence = appBody('const silenceFirstSixty =', 'const noticeCityFlowExit');
    expect(silence).toContain('firstSixtyPointerRef.current = null');
    expect(silence).toContain('setFirstSixtyPointer(null)');
    expect(silence).toContain('setFirstSixtySilenced(true)');
    expect(silence).toContain('silenceFirstSixtyForSession()');
  });

  test('the id the App holds is a real hub location for every pointer it can build', () => {
    const ids = new Set(HUB_LOCATIONS.map((location) => location.id));
    for (const profile of [onDay(1), noOneStep(), noOneStep({ defeatedOpponentIds: [...BOSS_IDS] })]) {
      const pointer = resolveHeraldPointer(profile)!;
      expect(ids.has(pointer.targetLocationId)).toBe(true);
    }
    // The two documented mappings that are not the arena.
    expect(resolveHeraldPointer(noOneStep({ records: { laudes: 6 } }))!.targetLocationId).toBe(
      'bounty_hall',
    );
    expect(
      resolveHeraldPointer(
        noOneStep({
          ludi: { day: 4, deedsDone: [], favour: 6, lastAlmsDay: 0, fameBaseline: 0, visitsToday: [] },
        }),
      )!.targetLocationId,
    ).toBe('shrine_temple');
  });
});

// ── §H session silence ─────────────────────────────────────────────────────
describe('FSS H §H — one answer silences §5 for the session', () => {
  beforeEach(() => {
    resetFirstSixtySession();
    resetActaSession();
  });

  test('the walk-off trigger is defined in code and pinned here', () => {
    expect(CITY_WALK_OFF_SCREENS).toEqual(['duel', 'hub_2d', 'race']);
    for (const screen of CITY_WALK_OFF_SCREENS) expect(walkedOffCity(screen)).toBe(true);
    for (const screen of ['city_3d', 'title', 'create_character', '', 'DUEL']) {
      expect(walkedOffCity(screen)).toBe(false);
    }
  });

  test('App routes all three exits through the one trigger', () => {
    expect(APP).toContain("if (walkedOffCity(next)) silenceFirstSixty();");
    expect(APP).toContain("noticeCityFlowExit('duel');");
    expect(APP).toContain("noticeCityFlowExit('hub_2d');");
    expect(APP).toContain("noticeCityFlowExit('race');");
    // …and nowhere else: three call sites, one per screen — the definition is not one.
    expect(APP.match(/noticeCityFlowExit\('/g)?.length).toBe(3);
  });

  test('the session fact survives re-entry and only a new session clears it', () => {
    expect(firstSixtySilencedThisSession()).toBe(false);
    silenceFirstSixtyForSession();
    expect(firstSixtySilencedThisSession()).toBe(true);
    resetFirstSixtySession();
    expect(firstSixtySilencedThisSession()).toBe(false);
    expect(greetingShownThisSession()).toBe(false);
    // The next session greets again.
    expect(greetingFor(onDay(1))!.text.startsWith('Dies Mercatus — ')).toBe(true);
  });

  test('the Acta card shuts up with the rest, on top of its own untouched rule', () => {
    expect(SCENE).toContain(
      'const showActa = actaDay !== cityDay && !actaDismissedThisSession(cityDay) && !movementLocked;',
    );
    expect(SCENE).toContain('const showActaThisSession = showActa && !firstSixtySilenced;');
    expect(SCENE).toContain('{showActaThisSession && (');
    expect(SCENE).not.toContain('{showActa && (');
  });

  test('the card\'s own ✕ is a dismissal that silences the session', () => {
    const dismiss = SCENE.slice(SCENE.indexOf('onDismiss={() => {'));
    expect(dismiss.slice(0, 200)).toContain('dismissActaThisSession(cityDay);');
    expect(dismiss.slice(0, 200)).toContain('onFirstSixtySilence?.();');
  });

  test('the herald\'s ✕ silences the session; its own TIMER never does', () => {
    expect(TOAST).toContain('onExplicitDismiss?: () => void;');
    expect(TOAST).toContain('onExplicitDismiss?.();');
    // The timeout still calls only `onDismiss`.
    expect(TOAST).toContain('window.setTimeout(onDismiss, durationMs)');
    expect(TOAST).not.toContain('window.setTimeout(onExplicitDismiss');
    // App silences only when the §5 line is the one on the stack.
    const handler = appBody('onExplicitDismiss={() => {', '/>');
    expect(handler).toContain('heraldCries.includes(pointer.line)');
    expect(handler).toContain('silenceFirstSixty()');
  });

  test('no §5 surface is saved, so a new session greets again', () => {
    for (const rel of ['utils/firstSixtySeconds.ts', 'utils/heraldPointer.ts']) {
      const source = code(rel);
      expect(source).not.toContain('localStorage');
      expect(source).not.toContain('sessionStorage');
      expect(source).not.toContain('saveProfile');
      expect(source).not.toContain('PROFILE_STORAGE_KEY');
    }
    // The session facts are module memory, exactly like the Acta's own dismissal.
    expect(code('utils/firstSixtySeconds.ts')).toContain('let silenced = false;');
    expect(code('utils/firstSixtySeconds.ts')).toContain('let greetingShown = false;');
  });
});

// ── §I the Acta card's unfinished-business line ────────────────────────────
describe('FSS I §I — one line, from live state: grudge → unviewed triumph → none', () => {
  test('a live grudge wins, and is named from the roster', () => {
    const profile = onDay(2, {
      grudges: { opp_marcus: { dominant: 'quick' } },
      records: { earnedTriumphs: ['sand_first_blood'] },
    });
    expect(unfinishedBusinessLine(profile)).toBe('A grudge waits: Marcus the Rookie');
  });

  test('a settled grudge is not an open loop; a closed one still waits', () => {
    expect(
      unfinishedBusinessLine(
        onDay(2, { grudges: { opp_marcus: { dominant: 'quick', settled: true } } }),
      ),
    ).toBeNull();
    expect(
      unfinishedBusinessLine(
        onDay(2, { grudges: { opp_marcus: { dominant: 'quick', closed: true } } }),
      ),
    ).toBe('A grudge waits: Marcus the Rookie');
  });

  test('an unviewed triumph answers when no grudge does', () => {
    expect(
      unfinishedBusinessLine(onDay(2, { records: { earnedTriumphs: ['sand_first_blood'] } })),
    ).toBe('A triumph waits unviewed');
    // Viewed: no line.
    expect(
      unfinishedBusinessLine(
        onDay(2, {
          records: { earnedTriumphs: ['sand_first_blood'], viewedTriumphs: ['sand_first_blood'] },
        }),
      ),
    ).toBeNull();
  });

  test('with nothing open there is NO line — deeds are not a debt', () => {
    const deedsOnly = onDay(2, {
      ludi: {
        day: 2,
        deedsDone: ['win_duel'],
        favour: 3,
        lastAlmsDay: 0,
        fameBaseline: 0,
        visitsToday: ['tavern'],
      },
    });
    expect(unfinishedBusinessLine(deedsOnly)).toBeNull();
    expect(unfinishedBusinessLine(null)).toBeNull();
    // An id the roster does not know prints nothing of that rival.
    expect(unfinishedBusinessLine(onDay(2, { grudges: { ghost: { dominant: 'even' } } }))).toBeNull();
  });

  test('the card prints it exactly once, and prints nothing when it is empty', () => {
    const withLine = renderToStaticMarkup(
      <ActaCard profile={onDay(2)} unfinished="A grudge waits: Marcus the Rookie" onDismiss={() => {}} />,
    );
    expect(withLine.match(/data-acta-unfinished/g)?.length).toBe(1);
    expect(withLine).toContain('A grudge waits: Marcus the Rookie');
    for (const unfinished of [null, undefined]) {
      const bare = renderToStaticMarkup(
        <ActaCard profile={onDay(2)} unfinished={unfinished} onDismiss={() => {}} />,
      );
      expect(bare).not.toContain('data-acta-unfinished');
    }
    // The city card feeds it the LIVE reading, never a constant.
    expect(SCENE).toContain('unfinished={unfinishedBusinessLine(playerProfile)}');
  });
});

// ── §J Ludi Phase A untouched ──────────────────────────────────────────────
describe('FSS J §J — the morning Acta is reused, never redesigned', () => {
  test('its show rule, its draw and its dismissal are Phase A\'s own', () => {
    expect(SCENE).toContain('const showActa = actaDay !== cityDay && !actaDismissedThisSession(cityDay) && !movementLocked;');
    expect(SCENE).toContain('dismissActaThisSession(cityDay);');
    expect(SCENE).toContain('setActaDay(cityDay);');
    expect(CARD).toContain('resolveLudiState(profile)');
    expect(CARD).toContain('export function actaDismissedThisSession');
    // The card's own three-deed list is still the shared component, unchanged.
    expect(CARD).toContain('<ActaDeeds state={state} className="mt-2" />');
  });

  test('the pointer and the greeting read no deed draw and no deed state', () => {
    for (const rel of ['utils/heraldPointer.ts']) {
      const source = code(rel);
      for (const forbidden of ['ludiDeedsForDay', 'settleLudiDeeds', 'applyLudiRollover', 'withLudiAlms']) {
        expect(source).not.toContain(forbidden);
      }
    }
    // The greeting reads the day's NAME and LINE only — never the deeds.
    const greeting = code('utils/firstSixtySeconds.ts').slice(
      code('utils/firstSixtySeconds.ts').indexOf('export function greetingFor'),
      code('utils/firstSixtySeconds.ts').indexOf('export function unfinishedBusinessLine'),
    );
    expect(greeting).toContain('state.dayName');
    expect(greeting).toContain('state.characterLine');
    expect(greeting).not.toContain('deeds');
  });

  test('no reward, price, formula or combat file is touched by this slice', () => {
    for (const rel of ['utils/combatCalculations.ts', 'utils/ludiCalendar.ts', 'utils/triumphs.ts', 'utils/codex.ts']) {
      const source = code(rel);
      expect(source).not.toContain('firstSixty');
      expect(source).not.toContain('heraldPointer');
    }
  });
});

// ── §K the save corpus ────────────────────────────────────────────────────
describe('FSS K §K — no new top-level profile field', () => {
  const scanOptional = (source: string): string[] => {
    const start = source.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = source.indexOf('{', start); i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    return [...source.slice(start, end).matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map(
      (match) => match[1],
    );
  };

  test('§J stays at 23 optional fields, `records` last', () => {
    const optional = scanOptional(read('types/game.ts'));
    expect(optional.length).toBe(23);
    expect(optional.slice(-2)).toEqual(['ludi', 'records']);
  });

  test('every §5 flag is session scratch, never a field', () => {
    const optional = scanOptional(read('types/game.ts'));
    for (const name of ['greeting', 'pointer', 'firstSixty', 'firstSixtySeconds', 'greeted', 'silenced']) {
      expect(optional).not.toContain(name);
    }
    const types = read('types/game.ts');
    expect(types).not.toContain('firstSixty');
    expect(types).not.toContain('heraldPointer');
  });
});

// ── §L the clock ban ──────────────────────────────────────────────────────
describe('FSS L §L — no wall clock, no store, no randomness', () => {
  test('neither new module reads a clock', () => {
    for (const rel of ['utils/firstSixtySeconds.ts', 'utils/heraldPointer.ts']) {
      const source = code(rel);
      for (const forbidden of ['new Date', 'Date.now', 'performance.now', 'Math.random', 'setTimeout']) {
        expect(source).not.toContain(forbidden);
      }
      // …and neither reaches the clock module at all.
      expect(source).not.toContain('timeState');
    }
  });

  test('the greeting banner is the only timer, and it is the shipped fade', () => {
    // The session module holds no timer; the banner owns the one DayBanner-style fade.
    expect(code('utils/firstSixtySeconds.ts')).not.toContain('setTimeout');
    expect(code('components/ui/SessionGreetingBanner.tsx')).toContain('setTimeout');
    expect(APP).not.toContain('setTimeout(() => setFirstSixtyGreeting');
  });

  test('the slice imports no combat formula and no storage service', () => {
    for (const rel of ['utils/firstSixtySeconds.ts', 'utils/heraldPointer.ts']) {
      const source = code(rel);
      expect(source).not.toContain('combatCalculations');
      expect(source).not.toContain('services/storage');
      expect(source).not.toContain('localStorage');
    }
  });
});
