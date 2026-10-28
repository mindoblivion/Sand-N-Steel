/**
 * CH-2 — the class surfaces, server-rendered.
 *
 * The helpers are pinned by `characterCreation.test.ts` and
 * `armaturaPledge.test.ts`; this suite renders the real `StatsTab` so the screen's
 * own rule is proved on markup: the gladiator's Armatura and Doctrina are shown
 * (read through the one resolver), the re-pledge action is offered ONLY while the
 * class was never explicitly set, and it is gone the moment it is.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it (the trap
 * `consumablesSurface.test.tsx` records).
 *
 * Run with: `bun test src/utils/armaturaSurface.test.tsx`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { ArmaturaId, PlayerProfile } from '../types/game';
import { StatsTab } from '../components/hub/StatsTab';
import { createNewProfile } from '../services/storage';
import { ARMATURAE, getArmatura } from '../data/armaturae';

function profile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createNewProfile('Surface Tester'), ...over };
}

const stats = (p: PlayerProfile, onRepledgeArmatura?: (id: ArmaturaId) => void) =>
  renderToStaticMarkup(
    <StatsTab
      profile={p}
      onAllocatePoint={() => {}}
      onUseConsumable={() => {}}
      onRepledgeArmatura={onRepledgeArmatura}
    />,
  );

describe('CH-2 §A — the Armatura and Doctrina panel', () => {
  test('a legacy save shows the class its look infers, with its doctrina', () => {
    const legacy = profile({
      appearance: { ...createNewProfile('x').appearance, characterModel: 'dimachaerus' },
    });
    const html = stats(legacy, () => {});

    expect(html).toContain('data-armatura="dimachaerus"');
    expect(html).toContain('Dimachaerus');
    expect(html).toContain('data-doctrina="twin_fangs"');
    expect(html).toContain('Twin Fangs');
    expect(html).toContain('Your quick attacks strike twice.');
    expect(html).toContain('STR 10 · AGI 13 · STA 10 · DEF 2');
  });

  test('an explicitly set class is the one shown, over what the look would imply', () => {
    const pledged = profile({
      appearance: { ...createNewProfile('x').appearance, characterModel: 'dimachaerus' },
      armatura: 'thraex',
    });
    const html = stats(pledged, () => {});
    expect(html).toContain('data-armatura="thraex"');
    expect(html).toContain('data-doctrina="hook_the_rim"');
    expect(html).not.toContain('data-armatura="dimachaerus"');
  });

  test('every class would render its own panel — the panel reads the data', () => {
    for (const row of ARMATURAE) {
      const html = stats(profile({ armatura: row.id }), () => {});
      expect(html, row.id).toContain(`data-armatura="${row.id}"`);
      expect(html, row.id).toContain(`data-doctrina="${row.doctrina.id}"`);
      // The name may be HTML-escaped (an apostrophe), so the TEXT is the stable read.
      expect(html, row.id).toContain(row.doctrina.text);
    }
    expect(getArmatura('murmillo')?.name).toBe('Murmillo');
  });
});

describe('CH-2 §B — the re-pledge action is offered only while the class is inferred', () => {
  test('a legacy save is offered the action', () => {
    const legacy = profile({
      appearance: { ...createNewProfile('x').appearance, characterModel: 'roman_warrior' },
    });
    const html = stats(legacy, () => {});
    expect(html).toContain('data-repledge-armatura');
    expect(html).toContain('Re-pledge your Armatura');
    expect(html).toContain('Choose it once, free');
  });

  test('the action is HIDDEN once armatura is explicitly set', () => {
    const pledged = profile({ armatura: 'secutor' });
    const html = stats(pledged, () => {});
    expect(html).toContain('data-armatura="secutor"');
    expect(html).not.toContain('data-repledge-armatura');
    expect(html).not.toContain('Re-pledge your Armatura');
  });

  test('with no handler wired, nothing is offered (the write has one owner)', () => {
    const legacy = profile({
      appearance: { ...createNewProfile('x').appearance, characterModel: 'roman_warrior' },
    });
    const html = stats(legacy);
    expect(html).not.toContain('data-repledge-armatura');
  });

  test('every class is reachable from the revealed choice list, each a 48px target', () => {
    // The list is rendered only when the toggle is opened, so the options are read
    // from the source — the panel's own data source is asserted above.
    const source = readFileSync('src/components/hub/StatsTab.tsx', 'utf8');
    expect(source).toContain('{ARMATURAE.map((option) => (');
    expect(source).toContain('data-repledge-choice={option.id}');
    expect(source).toContain('onClick={() => onRepledgeArmatura(option.id)}');
    expect(source).toContain('min-h-[48px]');
    expect(source).toContain('{canRepledge && onRepledgeArmatura && (');
  });
});

describe('CH-2 §C — the handler is App\'s single save writer', () => {
  test('App is the only caller of the pledge, and it saves exactly once', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain("import { withArmaturaPledge } from './utils/armaturaPledge';");
    expect((app.match(/withArmaturaPledge\(/g) ?? []).length).toBe(1);
    expect(app).toContain('const handleRepledgeArmatura = (armatura: ArmaturaId) => {');
    expect(app).toContain('onRepledgeArmatura={handleRepledgeArmatura}');
    // The handler writes through the one save pair, and only on a success.
    // CH-5 later inserted the three palma writers (equip / unequip / buy) BELOW this
    // handler, between it and `handleResetGame`.  So the slice now ends at the NEXT
    // handler after it: the measurement reads this pledge handler only, keeping the
    // one-save count honest as further handlers are added below, instead of counting
    // them.  Every assertion in this test is otherwise unchanged.
    const handler = app.slice(
      app.indexOf('const handleRepledgeArmatura'),
      app.indexOf('const handleEquipPalma'),
    );
    expect((handler.match(/saveProfile\(/g) ?? []).length).toBe(1);
    expect(handler).toContain('if (!result.ok) return;');
    // The pledge helper itself never names storage.  Read comment-stripped: its own
    // docstring explains which writer it hands the profile to, and prose is not code.
    const helper = readFileSync('src/utils/armaturaPledge.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(helper).not.toContain('saveProfile');
    expect(helper).not.toContain('localStorage');
  });
});
