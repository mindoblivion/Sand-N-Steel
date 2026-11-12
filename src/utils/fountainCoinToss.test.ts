/**
 * ===========================================================================
 * FOUNTAIN COIN TOSS — the scene pins
 * ===========================================================================
 * The wiring pins for the slice, one section per claim:
 *
 *   §A the MOUNT — the forum fountain is mounted in the live city (it was
 *      never mounted on main), exactly once, with the coin-arc key threaded
 *      through, and the arc component exists in SouthernDistrict;
 *   §B the HUB — the forum hub opens the fountain panel instead of the
 *      flavour notice, and the panel joins every lock list the shrine panel
 *      is on;
 *   §C the PANEL — the panel's controls and data attributes, the purse check
 *      and the live-boost line, read from the real scene source;
 *   §D the COLLIDER — the basin's rect is the one the C-8.47 approach table
 *      already expects (`forum`), the registry is 143, and the forum hub stays
 *      reachable with its fast-travel arrival clear;
 *   §E the WRITE SITE — the only save write is `App`'s `handleTossCoin`, and a
 *      refusal never reaches `saveProfile`;
 *   §F the CORPUS — the luck-era fixture carries the field, the older shapes
 *      omit it, and creation writes none of it.
 *
 * Run with: `bun test src/utils/fountainCoinToss.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNewProfile } from '../services/storage';
import { resolveLuckBoost } from './fountainLuck';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
} from './collisionShapes';
import { HUB_LOCATIONS, FAST_TRAVEL_ARRIVALS } from './cityCollisions';
import { getSaveFixture } from './saveFixtures';

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** A source file, comment-stripped, so prose can neither satisfy nor defeat a pin. */
const code = (relPath: string): string =>
  readFileSync(join(SRC_ROOT, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const SCENE_SOURCE = code('components/3d/city/CityHubScene.tsx');
const SOUTHERN_SOURCE = code('components/3d/city/SouthernDistrict.tsx');
const APP_SOURCE = code('App.tsx');

describe('§A — the fountain is mounted in the live city', () => {
  test('ForumFountain mounts exactly once, with the coin-arc key', () => {
    expect(SCENE_SOURCE).toContain('<ForumFountain coinTossKey={coinTossKey} />');
    expect(SCENE_SOURCE.match(/<ForumFountain/g)?.length).toBe(1);
    expect(SCENE_SOURCE).toContain("import { ForumFountain } from './SouthernDistrict';");
  });

  test('the arc exists in SouthernDistrict and rides the key', () => {
    expect(SOUTHERN_SOURCE).toContain('const CoinArc');
    expect(SOUTHERN_SOURCE).toContain('export const ForumFountain: React.FC<{ coinTossKey?: number }>');
    expect(SOUTHERN_SOURCE).toContain('<CoinArc tossKey={coinTossKey} />');
  });

  test('the other four southern pieces stay unmounted', () => {
    for (const piece of ['MacellumMarket', 'BibliothecaLibrary', 'PistrinumBakery', 'TriumphalArch']) {
      expect(SCENE_SOURCE).not.toContain(`<${piece}`);
    }
  });
});

describe('§B — the forum hub opens the panel', () => {
  test('the hub branch sets the fountain panel', () => {
    expect(SCENE_SOURCE).toContain("nearbyLoc.id === 'forum'");
    expect(SCENE_SOURCE).toContain('setFountainPanel(true)');
  });

  test('the panel joins every lock list the shrine panel is on', () => {
    expect(SCENE_SOURCE).toContain('shrinePanel || bountyPanel || fountainPanel');
    expect(SCENE_SOURCE).toContain('shrinePanel || bountyPanel || fountainPanel || legendPanel');
    expect(SCENE_SOURCE).toContain("if (fountainPanel) {");
    expect(SCENE_SOURCE).toContain('setFountainPanel(false)');
  });
});

describe('§C — the panel', () => {
  test('the panel, its button and its data attributes exist', () => {
    expect(SCENE_SOURCE).toContain('data-fountain-panel');
    expect(SCENE_SOURCE).toContain('data-toss-coin');
    expect(SCENE_SOURCE).toContain('Toss a coin (1g)');
    expect(SCENE_SOURCE).toContain('data-luck-boost');
    expect(SCENE_SOURCE).toContain('data-coin-result');
    expect(SCENE_SOURCE).toContain('data-coin-refusal="insufficient-gold"');
    expect(SCENE_SOURCE).toContain('data-coin-refusal="already-blessed"');
  });

  test('the button is disabled on a short purse and on a live boost', () => {
    expect(SCENE_SOURCE).toContain('disabled={coinPurseShort || !!liveLuck}');
    expect(SCENE_SOURCE).toContain('playerProfile.gold < COIN_TOSS_PRICE');
    expect(SCENE_SOURCE).toContain('The Forum Fountain');
    expect(SCENE_SOURCE).toContain('A coin for Fortuna. One gold buys her favour');
  });

  test('the toss callback plays the coin only on success and fires the arc', () => {
    expect(SCENE_SOURCE).toContain('sounds.playCoin()');
    expect(SCENE_SOURCE).toContain('setCoinTossKey((k) => k + 1)');
    expect(SCENE_SOURCE).toContain('coinTossResultLine(outcome.luck)');
  });
});

describe('§D — the basin collider', () => {
  test('the registry holds the rect the approach table expects', () => {
    const forum = CITY_COLLIDERS.find((c) => c.id === 'forum');
    expect(forum).toBeDefined();
    expect(forum?.type).toBe('rect');
    if (forum?.type !== 'rect') throw new Error('expected a rect collider');
    expect([forum.cx, forum.cz]).toEqual([10, 30]);
    expect([forum.hw, forum.hd]).toEqual([2.5, 2.5]);
    expect(CITY_COLLIDERS.length).toBe(143);
    expect(new Set(CITY_COLLIDERS.map((c) => c.id)).size).toBe(143);
  });

  test('the forum hub stays reachable: centre blocked, the ring clear', () => {
    const forum = HUB_LOCATIONS.find((loc) => loc.id === 'forum');
    expect(forum).toBeDefined();
    // The basin now blocks the centre itself — the player tosses from the ring.
    expect(collidesWith(10, 30, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    const ringClear = Array.from({ length: 16 }, (_, a) => {
      const ang = (a / 16) * Math.PI * 2;
      return !collidesWith(
        10 + Math.cos(ang) * forum!.radius,
        30 + Math.sin(ang) * forum!.radius,
        PLAYER_RADIUS,
        CITY_COLLIDERS,
      );
    }).some(Boolean);
    expect(ringClear).toBe(true);
  });

  test('the forum fast-travel arrival is still collision-free', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.forum;
    expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });
});

describe('§E — the write site', () => {
  test('App owns the one toss write, and a refusal never saves', () => {
    expect(APP_SOURCE).toContain('const handleTossCoin');
    expect(APP_SOURCE).toContain('const result = tossCoin(profile);');
    expect(APP_SOURCE).toContain('if (!result.ok) return result;');
    const start = APP_SOURCE.indexOf('const handleTossCoin');
    const body = APP_SOURCE.slice(start, APP_SOURCE.indexOf('\n  };', start));
    expect(body).toContain('saveProfile(result.profile)');
    expect(body).toContain('setProfile(result.profile)');
    expect(APP_SOURCE).toContain('onTossCoin={handleTossCoin}');
  });
});

describe('§F — the corpus', () => {
  test('the luck-era fixture carries a live boost from the shipped transaction', () => {
    const fixture = getSaveFixture('luck-era');
    expect(fixture).toBeDefined();
    expect(fixture!.profile.luck).toEqual({ boostUntil: 84 });
    expect(fixture!.profile.gold).toBe(629);
    expect(resolveLuckBoost(fixture!.profile)).toEqual({ boostUntil: 84 });
  });

  test('the older shapes omit the field, and creation writes none of it', () => {
    const legacy = getSaveFixture('minimal-legacy');
    expect(legacy).toBeDefined();
    expect('luck' in legacy!.profile).toBe(false);
    expect(resolveLuckBoost(legacy!.profile)).toBeNull();
    expect(Object.keys(createNewProfile('Corpus Fresh'))).not.toContain('luck');
  });
});
