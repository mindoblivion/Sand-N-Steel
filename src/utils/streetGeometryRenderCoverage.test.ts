/** Regression coverage that every shared city street footprint reaches a renderer. */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const cityStreets = readFileSync(
  new URL('../components/3d/city/CityStreets.tsx', import.meta.url),
  'utf8',
);
const processionAvenue = readFileSync(
  new URL('../components/3d/city/ProcessionAvenue.tsx', import.meta.url),
  'utf8',
);

const CITY_STREETS_GEOMETRY = [
  'VIA_MERCATORIA_PATH',
  'VIA_DECUMANUS_WEST',
  'VIA_DECUMANUS_EAST',
  'VIA_DECUMANUS_EAST_EXTENSION',
  'VIA_MERCATORIA_CONNECTOR',
  'CARAVAN_BYPASS',
  'VIA_TABERNARIA',
  'VIA_TABERNARIA_EAST',
  'TAVERN_TO_FORUM_PATH',
  'FORUM_TO_BATHHOUSE_PATH',
  'FORUM_TO_BOUNTY_HALL_PATH',
  'FORUM_TO_SHRINE_PATH',
  'COURTYARD_TO_BARRACKS_PATH',
  'COURTYARD_TO_VETERAN_HALL_PATH',
  'COURTYARD_TO_MEDICAL_HOUSE_PATH',
  'VIA_SOCIALIS',
  'VIA_SCHOLARIS_MAIN',
  'VIA_SCHOLARIS_ACADEMY_APPROACH',
  'VIA_SCHOLARIS_LIBRARY_APPROACH',
  'VIA_SCHOLARIS_DOCTORE_APPROACH',
  'NORTHWEST_TEMPLE_APPROACH',
  'SOUTHEAST_CRAFTING_APPROACH',
  'SOUTHWEST_GUILD_APPROACH',
] as const;

const PROCESSION_AVENUE_GEOMETRY = [
  'VIA_TRIUMPHALIS_BED',
  'VIA_TRIUMPHALIS_WEST',
  'VIA_TRIUMPHALIS_EAST',
  'VIA_TRIUMPHALIS_RUNNER',
] as const;

describe('shared street geometry renderer coverage', () => {
  test('every CityStreets footprint is imported and consumed by CityStreets', () => {
    for (const name of CITY_STREETS_GEOMETRY) {
      expect(cityStreets, `${name} should be imported and used by CityStreets`)
        .toContain(`${name}.`);
    }
  });

  test('every Via Triumphalis footprint is imported and consumed by ProcessionAvenue', () => {
    for (const name of PROCESSION_AVENUE_GEOMETRY) {
      expect(processionAvenue, `${name} should be imported and used by ProcessionAvenue`)
        .toContain(`${name}.`);
    }
  });
});
