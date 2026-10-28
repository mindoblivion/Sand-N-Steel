/**
 * Day/Night T3 — night dressing, the fixture driver, the medallion and the card copy.
 *
 * Run with: bun test src/utils/dayNightT3.test.ts
 *
 * §A the shared emissive driver · §B the dressing predicates · §C the duel's night
 * fixture states and the boss fence · §D the medallion · §E the card copy · §F the inn's
 * rest label (VERIFIED, not duplicated) · §G the night clerk · §H the save fence and the
 * draw-call budget.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  CITY_FIXTURE_CLASSES,
  applyCityFixtureGlow,
  fixtureIntensity,
  fixtureScale,
  getCityFixtureGlow,
  phaseFixtureGlow,
  registerCityFixture,
  registeredFixtureCount,
} from './cityFixtureGlow';
import { PHASE_LIGHT } from './atmosphere';
import { TIME_PHASES, TIME_PHASE_NAMES } from './timeState';
import {
  SHRINE_SMOKE_POSITION,
  WATCH_FIRE_POSITION,
  braziersLit,
  shrineSmokeActive,
  tavernFullDress,
  watchFireLit,
} from './nightDressing';
import { LUDI_FORTUNAE_INDEX, LUDI_ROTATION, ludiIndexForDay } from './dayRollover';
import {
  DUEL_TORCH_OFFER,
  MEDALLION_TINTS,
  PHASE_MEDALLION_CLASS,
  duelPhaseLine,
  racePhaseLine,
} from './phaseFlavor';
import {
  DUEL_BRAZIER_LIGHT,
  DUEL_CROWD_DRESS_EMISSIVE,
  DUEL_BOWL_EMISSIVE,
  duelBrazierScale,
  resolveDuelPhaseLight,
} from './duelPhaseLight';
import { MEDALLION_NOTCHES, medallionNotch } from '../components/ui/PhaseMedallion';
import { KEEPERS, getKeeper, nightClerkLine } from '../data/keepers';

const load = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

// ── §A the shared emissive driver ──────────────────────────────────────────
describe('A. ONE emissive driver for the city fixtures', () => {
  test('the ramp is 0 at midday and 1 at night, for every class', () => {
    for (const fixture of CITY_FIXTURE_CLASSES) {
      expect(fixtureScale(fixture, 0)).toBe(0);
      expect(fixtureScale(fixture, 1)).toBe(1);
      expect(fixtureScale(fixture, 0.5)).toBeCloseTo(0.5, 12);
    }
    expect(phaseFixtureGlow('midday')).toBe(PHASE_LIGHT.midday.lampGlow);
    expect(phaseFixtureGlow('midday')).toBe(0);
    expect(phaseFixtureGlow('night')).toBe(1);
  });

  test('a clamped, total reading: junk input never over-brightens or throws', () => {
    expect(fixtureScale('brazier', Number.NaN)).toBe(0);
    expect(fixtureScale('brazier', -5)).toBe(0);
    expect(fixtureScale('brazier', 9)).toBe(1);
    expect(fixtureIntensity('brazier', Number.NaN, 1)).toBe(0);
    expect(phaseFixtureGlow('not-a-phase')).toBe(PHASE_LIGHT.golden.lampGlow);
  });

  test('registration drives the material at once, and applying the row drives it again', () => {
    const material = new THREE.MeshStandardMaterial({ emissiveIntensity: 3 });
    applyCityFixtureGlow(0);
    const before = registeredFixtureCount('brazier');
    const release = registerCityFixture('brazier', material, 3);
    // Registered AT the current hour — no first-frame flash.
    expect(material.emissiveIntensity).toBe(0);
    expect(registeredFixtureCount('brazier')).toBe(before + 1);

    applyCityFixtureGlow(1);
    expect(material.emissiveIntensity).toBe(3);
    applyCityFixtureGlow(0.5);
    expect(material.emissiveIntensity).toBeCloseTo(1.5, 12);

    release();
    applyCityFixtureGlow(1);
    expect(registeredFixtureCount('brazier')).toBe(before);
    // An unregistered material is left exactly where it was.
    expect(material.emissiveIntensity).toBeCloseTo(1.5, 12);
  });

  test('the driver starts at full dress, so a scene that never applies a row is unchanged', () => {
    expect(getCityFixtureGlow()).toBe(1);
  });

  test('it writes ONE property: no colour, no geometry, no light, no clone', () => {
    const source = code('./cityFixtureGlow.ts');
    expect(source).not.toContain('PointLight');
    expect(source).not.toContain('castShadow');
    expect(source).not.toContain('.clone()');
    expect(source).not.toContain('new THREE.Mesh');
    expect(source).toContain('emissiveIntensity');
    // The fixture component draws the SAME single material — not a copy.
    const component = code('../components/3d/city/CityFixtureMaterial.tsx');
    expect(component).toContain('<meshStandardMaterial');
    expect(component).not.toContain('.clone()');
    expect(component).toContain('useLayoutEffect');
    expect(component).not.toContain('useFrame');
  });

  test('every emissive fixture in the city tree registers, bar the forge (reported)', () => {
    const files = [
      'CityStreets',
      'ProcessionAvenue',
      'GrandColosseum',
      'IshtarGatehouse',
      'TrainingYard',
      'CaravanseraiInn',
      'MerchantHouse',
      'PublicBathhouse',
      'GeneralStore',
      'CityTavern',
    ];
    for (const file of files) {
      expect(code(`../components/3d/city/${file}.tsx`)).toContain('<CityFixtureMaterial');
    }
    // The forge's working fire is deliberately NOT driven: it must burn at every hour.
    const forge = code('../components/3d/city/SmithingForge.tsx');
    expect(forge).not.toContain('CityFixtureMaterial');
    expect(forge).toContain('emissiveIntensity={3.5}');
  });
});

// ── §B the dressing predicates ─────────────────────────────────────────────
describe('B. Night dressing: which dressing is up', () => {
  test('braziers and the tavern answer dusk and night, and only those', () => {
    for (const phase of TIME_PHASES) {
      const evening = phase === 'dusk' || phase === 'night';
      expect(braziersLit(phase)).toBe(evening);
      expect(tavernFullDress(phase)).toBe(evening);
    }
    expect(braziersLit('golden')).toBe(false);
    expect(braziersLit('midday')).toBe(false);
  });

  test('the watch-fire burns only in the dark phase', () => {
    for (const phase of TIME_PHASES) expect(watchFireLit(phase)).toBe(phase === 'night');
  });

  test('shrine smoke is dawn on Dies Fortunae only — day identity (day - 1) mod 7 === 2', () => {
    expect(LUDI_FORTUNAE_INDEX).toBe(2);
    expect(LUDI_ROTATION[LUDI_FORTUNAE_INDEX]).toBe('Dies Fortunae');
    // Day 3 is the first Dies Fortunae, then every seven days.
    for (const day of [3, 10, 17, 24]) {
      expect(ludiIndexForDay(day)).toBe(LUDI_FORTUNAE_INDEX);
      expect(shrineSmokeActive('dawn', day)).toBe(true);
      for (const phase of TIME_PHASES) {
        if (phase !== 'dawn') expect(shrineSmokeActive(phase, day)).toBe(false);
      }
    }
    for (const day of [1, 2, 4, 5, 6, 7, 8, 9]) {
      expect(ludiIndexForDay(day)).not.toBe(LUDI_FORTUNAE_INDEX);
      expect(shrineSmokeActive('dawn', day)).toBe(false);
    }
  });

  test('the two added meshes live on ground the city already has', () => {
    // The watch-fire stands on the motte by the fortress's south gate; the smoke above
    // the shrine's altar. Both are finite and neither is inside another building.
    expect(WATCH_FIRE_POSITION.every((v) => Number.isFinite(v))).toBe(true);
    expect(SHRINE_SMOKE_POSITION[0]).toBe(-27);
    expect(SHRINE_SMOKE_POSITION[2]).toBeCloseTo(10.2, 6);
    const component = code('../components/3d/city/CityNightDressing.tsx');
    expect(component).not.toContain('pointLight');
    expect(component).not.toContain('castShadow');
    expect(component).toContain('resolveDisplayClock(profile)');
  });
});

// ── §C the duel's night fixture states and the boss fence ──────────────────
describe('C. Duel night states — the spectacle is boss-gated', () => {
  test('a REGULAR bout can never reach the spectacle, at any phase', () => {
    for (const phase of TIME_PHASES) {
      const duel = resolveDuelPhaseLight(phase, false);
      expect(duel.nightState).not.toBe('spectacle');
      expect(duel.crowdDress).toBe(0);
      if (phase === 'night') expect(duel.nightState).toBe('torchlit');
      else expect(duel.nightState).toBeNull();
    }
  });

  test('only a boss bout dresses the ring, and at any phase', () => {
    for (const phase of TIME_PHASES) {
      const boss = resolveDuelPhaseLight(phase, true);
      expect(boss.nightState).toBe('spectacle');
      expect(boss.crowdDress).toBeGreaterThan(0);
      expect(boss.crowdDress).toBeCloseTo(DUEL_CROWD_DRESS_EMISSIVE * duelBrazierScale(1, 'spectacle'), 10);
    }
  });

  test('the bowls glow at night only, hotter for the spectacle', () => {
    expect(resolveDuelPhaseLight('midday', false).bowlEmissive).toBe(0);
    const torchlit = resolveDuelPhaseLight('night', false);
    const spectacle = resolveDuelPhaseLight('night', true);
    expect(torchlit.bowlEmissive).toBeCloseTo(DUEL_BOWL_EMISSIVE * (0.55 + 0.95), 10);
    expect(spectacle.bowlEmissive).toBeGreaterThan(torchlit.bowlEmissive);
  });

  test('no light was added: the duel rig is still 1 + 2 + 8', () => {
    const duel = code('../components/duel/DuelScene.tsx');
    const arena = code('../components/3d/DuelArena.tsx');
    expect(duel.match(/<ambientLight/g) ?? []).toHaveLength(1);
    expect(duel.match(/<directionalLight/g) ?? []).toHaveLength(2);
    expect(duel.match(/<pointLight/g) ?? []).toHaveLength(0);
    expect(arena.match(/<pointLight/g) ?? []).toHaveLength(1);
    expect(DUEL_BRAZIER_LIGHT).toBe(3.5);
    // The scene hands the arena the phase's two fixture states.
    expect(duel).toContain('bowlEmissive={duelLight.bowlEmissive}');
    expect(duel).toContain('crowdDress={duelLight.crowdDress}');
    // …and the gate is the opponent's own isBoss, resolved once at entry.
    expect(duel).toContain('resolveDuelPhaseLight(entryPhase, opponent.isBoss === true)');
  });

  test('the joint fence is stated in the module that owns the dressing', () => {
    const source = load('./duelPhaseLight.ts');
    expect(source).toContain('Challenge owns boss mechanics');
    expect(source).toContain('CF-6 owns boss');
    expect(source).toContain('this slice owns the boss BASE LIGHT STATE');
  });
});

// ── §D the phase medallion ────────────────────────────────────────────────
describe('D. The phase medallion', () => {
  test('seven notches, and dawn sits at the left end of the arc', () => {
    expect(MEDALLION_NOTCHES).toBe(7);
    const first = medallionNotch(0);
    const last = medallionNotch(MEDALLION_NOTCHES - 1);
    expect(first.x).toBeLessThan(last.x);
    expect(first.y).toBeCloseTo(last.y, 10);
    // Monotone left-to-right, and the clamped ends.
    expect(medallionNotch(-3)).toEqual(first);
    expect(medallionNotch(99)).toEqual(last);
    expect(medallionNotch(Number.NaN)).toEqual(first);
    for (let i = 1; i < MEDALLION_NOTCHES; i += 1) {
      expect(medallionNotch(i).x).toBeGreaterThan(medallionNotch(i - 1).x);
    }
  });

  test('the class table: five gold, dusk ember, night silver', () => {
    expect(PHASE_MEDALLION_CLASS).toEqual({
      dawn: 'gold',
      morning: 'gold',
      midday: 'gold',
      afternoon: 'gold',
      golden: 'gold',
      dusk: 'ember',
      night: 'silver',
    });
    for (const tint of Object.values(MEDALLION_TINTS)) {
      expect(tint.disc).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tint.ring).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('it is display only: English label, no tap, no per-frame work', () => {
    const source = code('../components/ui/PhaseMedallion.tsx');
    expect(source).toContain('TIME_PHASE_NAMES[current]');
    expect(source).not.toContain('onClick');
    expect(source).not.toContain('onPointer');
    expect(source).not.toContain('useFrame');
    expect(source).not.toContain('useState');
    expect(source).not.toContain('useEffect');
    expect(source).not.toContain('setInterval');
    expect(source).toContain('pointer-events-none');
    // The Latin names stay in the three places the design puts them.
    expect(source).not.toContain('Hora Aurea');
    expect(source).not.toContain('Prima Luce');
    expect(source).not.toContain('Nox');
  });

  test('the city HUD mounts it, from the clock it already reads', () => {
    const city = code('../components/3d/city/CityHubScene.tsx');
    expect(city).toContain('<PhaseMedallion phase={cityPhase} />');
    // T2's one-read rule still holds: no second resolveTimeState in this scene.
    expect(city.match(/resolveTimeState\(/g) ?? []).toHaveLength(1);
    expect(TIME_PHASE_NAMES.golden).toBe('Golden Hour');
  });
});

// ── §E the card copy ──────────────────────────────────────────────────────
describe('E. The duel card and the race card', () => {
  test('the design’s own duel lines, verbatim', () => {
    expect(duelPhaseLine('golden', false).headline).toBe('Hora Aurea — the light is kind');
    expect(duelPhaseLine('night', false).headline).toBe('Nox — torchlit');
    expect(duelPhaseLine('night', false).offer).toBe(DUEL_TORCH_OFFER);
    expect(DUEL_TORCH_OFFER).toBe('The arena keeps torches for those who insist');
    // The torches are offered in words at Nox only; availability is never in question.
    for (const phase of TIME_PHASES) {
      if (phase === 'night') continue;
      expect(duelPhaseLine(phase, false).offer).toBeUndefined();
    }
    // A boss card always reads as an evening spectacle, at any hour.
    for (const phase of TIME_PHASES) {
      expect(duelPhaseLine(phase, true).headline).toBe('Nox — the evening spectacle');
    }
  });

  test('the race card: last light at dusk, first light at night, else the light’s name', () => {
    expect(racePhaseLine('dusk')).toBe('Last light — the final race of the day');
    expect(racePhaseLine('night')).toBe('First light — the dawn race');
    expect(racePhaseLine('dawn')).toBe('First Light');
    expect(racePhaseLine('morning')).toBe('Mane');
    expect(racePhaseLine('midday')).toBe('Meridies');
    expect(racePhaseLine('afternoon')).toBe('Postmeridies');
    expect(racePhaseLine('golden')).toBe('Hora Aurea');
  });

  test('both surfaces render the line and change nothing else', () => {
    const modal = code('../components/hub/PreFightModal.tsx');
    expect(modal).toContain('duelPhaseLine(phase, opponent.isBoss === true)');
    expect(modal).toContain('data-prefight-phase={phase}');
    const race = code('../components/hub/PreRacePanel.tsx');
    expect(race).toContain('racePhaseLine(racePhase)');
    // No stock, price or availability is touched by the copy.
    expect(modal).not.toContain('rewardGold -');
    expect(modal).not.toContain('disabled={true}');
    expect(race).not.toContain('saveProfile');
  });
});

// ── §F the inn's rest label — verified, not duplicated ─────────────────────
describe('F. The rest button already names its dawn (T2) — nothing added', () => {
  test('both T2 labels are present, and there is exactly one rest label', () => {
    const city = load('../components/3d/city/CityHubScene.tsx');
    expect(city).toContain('Rest until dawn');
    expect(city).toContain("Rest until tomorrow's dawn");
    expect(city.match(/Rest until /g) ?? []).toHaveLength(2);
    // The button keeps T2's single price source.
    expect(city).toContain('REST_PRICE');
  });
});

// ── §G the night clerk ────────────────────────────────────────────────────
describe('G. The shop greeting at night', () => {
  test('the four storefront keepers have a night line, in the keeper’s own register', () => {
    for (const id of [
      'sextus_ferratus',
      'salvia_coriaria',
      'pasion_of_alexandria',
      'gaius_norbanus_sura',
    ]) {
      const keeper = getKeeper(id);
      expect(keeper).toBeDefined();
      const line = nightClerkLine(keeper!);
      expect(line.length).toBeGreaterThan(0);
      // It says who is behind the counter after dark.
      expect(line.toLowerCase()).toContain('night clerk');
      // Flavour only: no digits, so no price, stock or availability is asserted.
      expect(line).not.toMatch(/[0-9]/);
    }
    expect(nightClerkLine(KEEPERS[0])).toBe(KEEPERS[0].nightLine ?? nightClerkLine(KEEPERS[0]));
  });

  test('ShopTab swaps the line at night and keeps everything else', () => {
    const shop = code('../components/hub/ShopTab.tsx');
    expect(shop).toContain('nightClerkLine(keeper)');
    expect(shop).toContain("resolveDisplayClock(profile).phase === 'night'");
    expect(shop).toContain('line={displayedKeeperLine}');
    // T2/K1's own line is still the day's, and the visit is still recorded.
    expect(shop).toContain('keeper.firstVisitLine');
    expect(shop).toContain('onRecordKeeperVisit');
  });
});

// ── §H the save fence and the draw-call budget ────────────────────────────
describe('H. No save, and the city’s draw-call budget', () => {
  test('nothing in this slice reads or writes a player save', () => {
    for (const rel of [
      './cityFixtureGlow.ts',
      './nightDressing.ts',
      './phaseFlavor.ts',
      '../components/3d/city/CityFixtureMaterial.tsx',
      '../components/3d/city/CityNightDressing.tsx',
      '../components/ui/PhaseMedallion.tsx',
    ]) {
      const source = code(rel);
      expect(source).not.toContain('saveProfile');
      expect(source).not.toContain('localStorage');
      expect(source).not.toContain('PROFILE_STORAGE_KEY');
      expect(source).not.toContain('loadSavedProfile');
    }
  });

  test('the only added city meshes are the watch-fire and the smoke', () => {
    const dressing = code('../components/3d/city/CityNightDressing.tsx');
    expect(dressing.match(/<mesh\b/g) ?? []).toHaveLength(2);
    expect(dressing).not.toContain('castShadow');
    expect(dressing).not.toContain('Geometry args={[1');
    // And they are conditional: at every other hour nothing is mounted.
    expect(dressing).toContain('watchFireLit(phase) &&');
    expect(dressing).toContain('shrineSmokeActive(phase, day) &&');
  });

  test('no new profile field and no new dynamic light anywhere in the city', () => {
    const city = code('../components/3d/city/CityHubScene.tsx');
    expect(city).toContain('applyCityFixtureGlow(cityPhaseLight.lampGlow)');
    expect(city).not.toContain('<pointLight');
    expect(city).not.toContain('<spotLight');
    const types = code('../types/game.ts');
    expect(types).not.toContain('phaseDressing');
  });
});
