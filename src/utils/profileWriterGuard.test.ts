/**
 * L13A — a mutation-boundary guard over App's profile writers.
 *
 * ── WHAT THIS GUARD IS ────────────────────────────────────────────────────
 * App holds the game's saved profile in two places: React state (`profile`) and the
 * newest-committed ref (`profileRef`). A handler that commits state and disk without
 * writing the ref first leaves the ref stale, and every transaction that reads the
 * ref (sales, purchases, training, the duel settlement) then rebuilds from an older
 * snapshot — the defect class L12C and L13A hardened by hand.
 *
 * So this suite inventories App's own profile writers straight out of `src/App.tsx`
 * and requires each one to write `profileRef.current` BEFORE its `setProfile` and
 * `saveProfile` calls.
 *
 * ── HOW IT FAILS LOUDLY, AND WHAT IT CANNOT SEE ───────────────────────────
 * Any handler whose body calls `saveProfile(` and is neither conforming nor on the
 * documented allowlist below FAILS the suite by name. That is the guard's purpose:
 * a newly added mutation handler must be reviewed (and, normally, given the commit
 * triad) before it can ship.
 *
 * It is a GUARD, not a proof. It scans **top-level `const <name> = …` declarations**
 * only; JSX inline callbacks (e.g. the Drive modal's `onProfileLoaded`), callbacks
 * passed as props and code that writes the save through another module are outside
 * its reach. It also cannot judge whether a handler's arithmetic is right — only
 * that it commits through the ref in the expected order.
 *
 * Run with: `bun test src/utils/profileWriterGuard.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const APP_SRC = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * The reviewed exceptions, each with the reason the ref needs no write of its own.
 * Deleting a handler without deleting its entry here fails §C, so the list cannot rot.
 */
const ALLOWED_WRITERS: Record<string, string> = {
  handleCharacterCreated:
    'A brand-new gladiator is not derived from any prior base, and the handler calls ' +
    '`enterCity(newProfile)` in the same synchronous tick, which writes `profileRef.current`.',
  handleGoogleSignIn:
    'A cloud profile is loaded whole and then handed to `enterCity(cloudProfile)` in the same ' +
    'tick, which writes `profileRef.current`; the other branches only call `enterCity(profile)`.',
};

type Writer = { name: string; body: string };

/** Every top-level `const <name> = …` declaration in the App component. */
function appWriters(source: string): Writer[] {
  const writers: Writer[] = [];
  const declaration = /\n {2}const (\w+) = /g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source)) !== null) {
    const start = match.index + 1;
    const arrow = source.indexOf('=>', start);
    if (arrow < 0) continue;
    const bodyStart = source.indexOf('{', arrow);
    if (bodyStart < 0) continue;
    let depth = 0;
    for (let i = bodyStart; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          writers.push({ name: match[1], body: source.slice(start, i + 1) });
          break;
        }
      }
    }
  }
  return writers;
}

/** The writers that persist a profile, and whether each commits through the ref first. */
function auditWriters(source: string): Array<{ name: string; ok: boolean }> {
  return appWriters(source)
    .filter((writer) => writer.body.includes('saveProfile('))
    .map((writer) => {
      const refWrite = writer.body.indexOf('profileRef.current =');
      const setState = writer.body.indexOf('setProfile(');
      const save = writer.body.indexOf('saveProfile(');
      return {
        name: writer.name,
        ok: refWrite >= 0 && refWrite < setState && refWrite < save,
      };
    });
}

/** The names the guard would reject — the allowlist is applied by the caller. */
function unreviewedWriters(source: string): string[] {
  return auditWriters(source)
    .filter((writer) => !writer.ok)
    .map((writer) => writer.name);
}

// ══════════════════════════════════════════════════════════════════════════
describe('§A the inventory is real', () => {
  test('App declares many profile writers and the scan finds them', () => {
    const writers = auditWriters(APP_SRC);
    expect(writers.length).toBeGreaterThanOrEqual(15);
    // The hardened handlers this phase touched are all present.
    for (const name of [
      'handleMatchComplete',
      'handleBuyChariotPart',
      'handleEquipChariotPart',
      'handleChooseBannerDevice',
      'handleBuyRacingConfig',
      'handleSelectRacingConfig',
      'handleOathComplete',
      'enterCity',
    ]) {
      expect(writers.map((writer) => writer.name)).toContain(name);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§B every writer commits through the ref before it persists', () => {
  test('no unreviewed writer remains after the allowlist', () => {
    const unreviewed = unreviewedWriters(APP_SRC).filter(
      (name) => !Object.prototype.hasOwnProperty.call(ALLOWED_WRITERS, name)
    );
    // A failure here names the handler that needs review.
    expect(unreviewed).toEqual([]);
  });

  test('each allowlisted writer is still an exception (and still exists)', () => {
    const unreviewed = unreviewedWriters(APP_SRC);
    for (const name of Object.keys(ALLOWED_WRITERS)) {
      expect(unreviewed).toContain(name);
      expect(APP_SRC).toContain(`const ${name} = `);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('§C the guard fails loudly on a new, unreviewed writer', () => {
  test('a handler that saves without writing the ref is reported by name', () => {
    const injected = APP_SRC.replace(
      '  const handleSellItem = ',
      `  const handleMysteryMutation = (gold: number) => {
    setProfile({ ...profile, gold });
    saveProfile({ ...profile, gold });
  };

  const handleSellItem = `
    );
    expect(injected).not.toBe(APP_SRC);
    expect(unreviewedWriters(injected)).toContain('handleMysteryMutation');
    // …and the shipped source does not contain it.
    expect(unreviewedWriters(APP_SRC)).not.toContain('handleMysteryMutation');
  });

  test('a handler that writes the ref too late is also reported', () => {
    const injected = APP_SRC.replace(
      '  const handleBuyItem = ',
      `  const handleLateRefWrite = (gold: number) => {
    setProfile({ ...profile, gold });
    saveProfile({ ...profile, gold });
    profileRef.current = { ...profile, gold };
  };

  const handleBuyItem = `
    );
    expect(injected).not.toBe(APP_SRC);
    expect(unreviewedWriters(injected)).toContain('handleLateRefWrite');
  });

  test('a conforming new writer is accepted, so the guard is not simply "reject new"', () => {
    const injected = APP_SRC.replace(
      '  const handleBuyItem = ',
      `  const handleReviewedMutation = (gold: number) => {
    const base = profileRef.current;
    if (!base) return;
    const updated = { ...base, gold };
    profileRef.current = updated;
    setProfile(updated);
    saveProfile(updated);
  };

  const handleBuyItem = `
    );
    expect(unreviewedWriters(injected)).not.toContain('handleReviewedMutation');
  });
});
