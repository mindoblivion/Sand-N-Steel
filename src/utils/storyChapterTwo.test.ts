/**
 * STORY-3 — CHAPTER TWO, "Fortuna's Coin, the Second Sand".
 *
 * The slice is Beat 3's staging, the cross-gate pointer and the chapter's own
 * state, and this suite pins exactly those:
 *   §A  the derivation — Chapter 2 opens by STORY-2's rule, and neither a chapter
 *       nor a beat is ever stored;
 *   §B  BEAT 3 (Director ruling 1) — complete on STATE: a live omen, OR the
 *       once-ever decline marker, including a shrine visit made BEFORE the
 *       chapter opened, and incomplete on neither;
 *   §C  the DUEL gate — Tier 1's boss, read from the shipped roster;
 *   §D  the RACE gate (Director ruling 4) — still "not yet", with no race results
 *       write, no free-drive result and no other race evidence invented, and it
 *       is the one gate that holds its chapter open;
 *   §E  the CROSS-GATE pointer (Director ruling 3) — due exactly while Chapter 2
 *       is open and its race gate is unmet, and never otherwise;
 *   §F  the deferred character's name appears in NO non-test source but the K1
 *       registry data it already lives in;
 *   §G  no new profile field: `PlayerProfile`'s optional list is unchanged;
 *   §H  Postumia's briefing on the pre-fight card, rendered through STORY-2's
 *       existing narration block.
 *
 * Run with: bun test src/utils/storyChapterTwo.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { createNewProfile } from '../services/storage';
import { DOCTORE_TEST_OPPONENT_ID } from './storyBeats';
import {
  PENDING_GATE_LINES,
  STORY_CHAPTER_FORTUNA,
  STORY_CHAPTERS,
  circusPointerDue,
  isFortunaOmenTaken,
  resolveChapterGates,
  resolveStoryState,
  storyGateLine,
  type StoryGate,
  type StoryState,
} from './storyState';
import {
  CIRCUS_POINTER_CRY,
  FORTUNA_SHRINE_BRIEFING,
  circusPointerCry,
  isFortunaBriefingDue,
  isTournamentFinalBout,
} from './storyChapterTwo';
import { PreFightModal } from '../components/hub/PreFightModal';

// ── Sources the pins read ─────────────────────────────────────────────────
const moduleSource = readFileSync(new URL('./storyState.ts', import.meta.url), 'utf8');
const chapterTwoSource = readFileSync(new URL('./storyChapterTwo.ts', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../types/game.ts', import.meta.url), 'utf8');
const hubSource = readFileSync(
  new URL('../components/hub/GladiatorSchoolHub.tsx', import.meta.url),
  'utf8'
);
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const SRC_DIR = new URL('../', import.meta.url).pathname;
/** Comments stripped, so no assertion here can be satisfied by prose. */
const codeOf = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

// ── Fixtures ──────────────────────────────────────────────────────────────
const bossOf = (tier: number) => {
  const boss = ALL_OPPONENTS.find((opponent) => opponent.tier === tier && opponent.isBoss === true);
  if (!boss) throw new Error(`no boss in tier ${tier}`);
  return boss;
};
const bossId = (tier: number): string => bossOf(tier).id;
const bossShortName = (tier: number): string => bossOf(tier).name.split(' the ')[0].trim();

const fresh = (): PlayerProfile => createNewProfile('Tester');

/** STORY-2's Chapter-1 evidence, written the way the victory write writes it. */
const withDoctoreTest = (profile: PlayerProfile): PlayerProfile => ({
  ...profile,
  defeatedOpponentIds: profile.defeatedOpponentIds.includes(DOCTORE_TEST_OPPONENT_ID)
    ? profile.defeatedOpponentIds
    : [...profile.defeatedOpponentIds, DOCTORE_TEST_OPPONENT_ID],
  story: { ...(profile.story ?? {}), doctoreTestPassed: true },
});

/** A profile standing in Chapter 2: Chapter 1 closed, nothing of Chapter 2 met. */
const inChapterTwo = (): PlayerProfile => withDoctoreTest({ ...fresh(), fightsWon: 2 });

/** The same profile with Goliath down. */
const withGoliathDown = (): PlayerProfile => {
  const base = inChapterTwo();
  return { ...base, defeatedOpponentIds: [...base.defeatedOpponentIds, bossId(1)] };
};

/** A live omen, the shape Pitch A1 writes (`fightsWon + fightsLost + 1`). */
const withOmen = (profile: PlayerProfile): PlayerProfile => ({
  ...profile,
  omen: { kind: 'kind', expiresAtBout: 4 },
});

/** A decline: the marker, and NO omen field at all — exactly what A1 leaves. */
const withDecline = (profile: PlayerProfile): PlayerProfile => ({
  ...profile,
  omenTrickleClaimed: true,
});

const gateOfChapter = (profile: PlayerProfile, chapter: number, id: string): StoryGate => {
  const gate = resolveChapterGates(profile, chapter).find((entry) => entry.id === id);
  if (!gate) throw new Error(`no gate ${id} on chapter ${chapter}`);
  return gate;
};

// ── §A the chapter's derivation ───────────────────────────────────────────
describe('§A Chapter 2 is derived, never stored', () => {
  test('A1 — Chapter 2 opens by STORY-2\'s rule: Chapter 1 complete', () => {
    // The chapter rule is untouched: a fresh profile is 0, a legacy win is 1, and
    // the Test's evidence is what puts the player in front of Chapter 2.
    expect(resolveStoryState(fresh()).chapter).toBe(0);
    expect(resolveStoryState({ ...fresh(), fightsWon: 1 }).chapter).toBe(1);
    const state = resolveStoryState(inChapterTwo());
    expect(state.chapter).toBe(STORY_CHAPTER_FORTUNA);
    expect(state.chapter).toBe(2);
    expect(state.title).toBe("Fortuna's Coin, the Second Sand");
    expect(state.beat).toBe(STORY_CHAPTERS[STORY_CHAPTER_FORTUNA].beat);
    // Its gates, in table order, and nothing else.
    expect(state.gates.map((gate) => gate.id)).toEqual([
      'tier-1-boss',
      'district-race',
      'omen',
    ]);
  });

  test('A2 — no stored chapter field, and no stored beat flag', () => {
    // `storyState.ts` never writes: the resolved chapter is a return value.
    const code = codeOf(moduleSource);
    expect(code).not.toMatch(/story\s*\.\s*chapter\s*=/);
    expect(code).not.toMatch(/beat\s*:\s*true/);
    // `StoryProgress` carries no chapter and no beat-completion field.
    const start = typesSource.indexOf('export interface StoryProgress {');
    expect(start).toBeGreaterThan(-1);
    const body = typesSource.slice(start, typesSource.indexOf('\n}', start));
    expect(body).not.toMatch(/^\s*chapter\??:/m);
    expect(body).not.toMatch(/fortuna|omenTaken|beatComplete/i);
  });

  test('A3 — a legacy profile gains no chapter and no beat evidence by being resolved', () => {
    const legacy: PlayerProfile = { ...fresh(), fightsWon: 3 };
    const before = JSON.stringify(legacy);
    const state = resolveStoryState(legacy);
    expect(state.chapter).toBe(1);
    expect(JSON.stringify(legacy)).toBe(before);
    expect('story' in legacy).toBe(false);
  });
});

// ── §B BEAT 3 — Fortuna's Coin, on state ──────────────────────────────────
describe('§B Beat 3 completes on state, never on a stored flag', () => {
  test('B1 — a live omen completes the beat and the gate says so', () => {
    const profile = withOmen(inChapterTwo());
    expect(isFortunaOmenTaken(profile)).toBe(true);
    const gate = gateOfChapter(profile, 2, 'omen');
    expect(gate.state).toBe('met');
    expect(gate.pendingKind).toBeUndefined();
    expect(storyGateLine(gate)).toBe('The omen has been read.');
  });

  test('B2 — the trickle marker ALONE completes it: a decline leaves no omen field', () => {
    const profile = withDecline(inChapterTwo());
    // The decline is the marker and nothing else — the ruling's shape, asserted:
    // a refused omen leaves NO omen field behind, so the marker is all there is.
    expect('omen' in profile).toBe(false);
    expect(profile.omen).toBeUndefined();
    expect(profile.omenTrickleClaimed).toBe(true);
    expect(isFortunaOmenTaken(profile)).toBe(true);
    expect(gateOfChapter(profile, 2, 'omen').state).toBe('met');
  });

  test('B3 — neither piece of state: the beat is incomplete', () => {
    const profile = withGoliathDown();
    expect(isFortunaOmenTaken(profile)).toBe(false);
    const gate = gateOfChapter(profile, 2, 'omen');
    expect(gate.state).toBe('unmet');
    expect(storyGateLine(gate)).toBe('Face the reading of the omen');
    // …and a malformed field of either kind is not evidence.
    for (const broken of [
      { omen: { kind: 'weird', expiresAtBout: 4 } },
      { omen: { kind: 'kind', expiresAtBout: 0 } },
      { omen: 'kind' },
      { omenTrickleClaimed: 'yes' },
      { omenTrickleClaimed: 1 },
    ]) {
      const shaped = { ...profile, ...broken } as unknown as PlayerProfile;
      expect(isFortunaOmenTaken(shaped)).toBe(false);
      expect(gateOfChapter(shaped, 2, 'omen').state).toBe('unmet');
    }
  });

  test('B4 — a shrine visit made BEFORE Chapter 2 opened counts identically', () => {
    // The shrine panel has no chapter gate, so this gladiator took the omen while
    // still in Chapter 1.  The moment Chapter 2 opens, Beat 3 is already complete.
    const early = withOmen({ ...fresh(), fightsWon: 1 });
    expect(resolveStoryState(early).chapter).toBe(1);
    expect(isFortunaOmenTaken(early)).toBe(true);
    const opened = withDoctoreTest(early);
    expect(resolveStoryState(opened).chapter).toBe(2);
    expect(gateOfChapter(opened, 2, 'omen').state).toBe('met');
  });

  test('B5 — the beat is state, not sequence: the omen may come before or after the duel', () => {
    const before = withOmen(inChapterTwo());
    const after = withOmen(withGoliathDown());
    expect(gateOfChapter(before, 2, 'omen').state).toBe('met');
    expect(gateOfChapter(after, 2, 'omen').state).toBe('met');
    // Both profiles are still held at Chapter 2 by the race gate, duel or no duel.
    expect(resolveStoryState(before).chapter).toBe(2);
    expect(resolveStoryState(after).chapter).toBe(2);
  });
});

// ── §C the duel gate ──────────────────────────────────────────────────────
describe('§C the duel gate is Tier 1\'s boss', () => {
  test('C1 — Goliath\'s defeat meets it, and it is the roster\'s own id', () => {
    expect(gateOfChapter(inChapterTwo(), 2, 'tier-1-boss').state).toBe('unmet');
    expect(storyGateLine(gateOfChapter(inChapterTwo(), 2, 'tier-1-boss'))).toBe(
      `Defeat ${bossShortName(1)}`
    );
    const down = withGoliathDown();
    expect(gateOfChapter(down, 2, 'tier-1-boss').state).toBe('met');
    expect(storyGateLine(gateOfChapter(down, 2, 'tier-1-boss'))).toBe(
      `${bossShortName(1)} has fallen in the sand.`
    );
  });

  test('C2 — another tier\'s boss is not this gate\'s evidence', () => {
    const base = inChapterTwo();
    const otherBoss: PlayerProfile = {
      ...base,
      defeatedOpponentIds: [...base.defeatedOpponentIds, bossId(2)],
    };
    expect(gateOfChapter(otherBoss, 2, 'tier-1-boss').state).toBe('unmet');
    // A non-boss opponent's id is not either.
    const plainWin: PlayerProfile = {
      ...base,
      defeatedOpponentIds: [...base.defeatedOpponentIds, 'opp_flaccus'],
    };
    expect(gateOfChapter(plainWin, 2, 'tier-1-boss').state).toBe('unmet');
  });
});

// ── §D the race gate: "not yet", and no evidence invented ─────────────────
describe('§D the race gate resolves "not yet" and holds the chapter open', () => {
  test('D1 — pending, kind race, and it is the gate that declares the hold', () => {
    const gate = gateOfChapter(inChapterTwo(), 2, 'district-race');
    expect(gate.state).toBe('pending');
    expect(gate.pendingKind).toBe('race');
    expect(gate.holdsChapterOpen).toBe(true);
    expect(storyGateLine(gate)).toBe(PENDING_GATE_LINES.race);
    // No other gate on the chapter declares it, and the requirement is never
    // printed while the system is unlanded.
    expect(gateOfChapter(inChapterTwo(), 2, 'tier-1-boss').holdsChapterOpen).toBeUndefined();
    expect(gateOfChapter(inChapterTwo(), 2, 'omen').holdsChapterOpen).toBeUndefined();
    expect(storyGateLine(gate)).not.toContain('Finish your first District race');
  });

  test('D2 — the chapter refuses to close on duels alone', () => {
    // Duel met, beat met, race unlanded: the chapter is still open and current.
    const everythingElse = withOmen(withGoliathDown());
    const state = resolveStoryState(everythingElse);
    expect(state.gates.map((gate) => gate.state)).toEqual(['met', 'pending', 'met']);
    expect(state.chapter).toBe(2);
    expect(state.complete).toBe(false);
    // …and it stays there however far the arena record runs.
    const far: PlayerProfile = {
      ...everythingElse,
      fame: 2000,
      currentTier: 4,
      defeatedOpponentIds: [
        ...everythingElse.defeatedOpponentIds,
        bossId(2),
        bossId(3),
        bossId(4),
      ],
      story: {
        ...(everythingElse.story ?? {}),
        librarySeen: true,
        trialDone: true,
        summitSeen: true,
        diceEnding: 'cut',
      },
    };
    expect(resolveStoryState(far).chapter).toBe(2);
  });

  test('D3 — no race-results write, no free-drive result, no other race evidence is read', () => {
    const code = codeOf(moduleSource);
    // The resolver reads no racing state of any kind: the gate has no evidence
    // predicate at all, so it cannot be satisfied by anything on the record.
    expect(code).not.toMatch(/racing|raceResults|racesFinished|finishRace|placements/);
    expect(code).not.toMatch(/from '\.\/racingProgression'/);
    // A profile with the racing catalogue fully bought and selected is still not
    // a finished race: buying a team is not running one.
    const racer = {
      ...inChapterTwo(),
      racing: { unlocked: [3, 4], selected: 4 },
    } as unknown as PlayerProfile;
    expect(gateOfChapter(racer, 2, 'district-race').state).toBe('pending');
    // The race scene's finish-line API is still uncalled by any production source.
    const finishCallers = readdirSync(SRC_DIR, { recursive: true })
      .map(String)
      .filter((entry) => /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry))
      .filter((entry) => {
        const text = readFileSync(join(SRC_DIR, entry), 'utf8');
        return /finishRace\s*\(/.test(text) && !/export function finishRace/.test(text);
      });
    expect(finishCallers).toEqual([]);
  });
});

// ── §E the cross-gate pointer ─────────────────────────────────────────────
describe('§E the herald\'s circus pointer shows exactly while Chapter 2 waits on the race', () => {
  /** A Chapter 2 whose race gate has been met — the state Stage 2 will produce. */
  const closedChapterTwo = (): StoryState => {
    const state = resolveStoryState(inChapterTwo());
    return {
      ...state,
      gates: state.gates.map((gate) =>
        gate.id === 'district-race' ? { ...gate, state: 'met' as const } : gate
      ),
    };
  };

  test('E1 — due while Chapter 2 is open and the race gate is unmet', () => {
    const state = resolveStoryState(withOmen(withGoliathDown()));
    expect(state.chapter).toBe(2);
    expect(circusPointerDue(state)).toBe(true);
    expect(circusPointerCry(withOmen(withGoliathDown()))).toBe(CIRCUS_POINTER_CRY);
  });

  test('E2 — not before Chapter 2 opens', () => {
    for (const early of [fresh(), { ...fresh(), fightsWon: 1 }, withOmen({ ...fresh(), fightsWon: 1 })]) {
      const state = resolveStoryState(early);
      expect(state.chapter).toBeLessThan(2);
      expect(circusPointerDue(state)).toBe(false);
      expect(circusPointerCry(early)).toBeNull();
    }
  });

  test('E3 — not once the chapter\'s race gate is met', () => {
    // A resolved STATE, not a fabricated record: this is what the resolver will
    // hand back when Stage 2's race write lands, and the pointer must go quiet.
    const closed = closedChapterTwo();
    expect(circusPointerDue(closed)).toBe(false);
    // The later chapters are never due either, whatever their own gates say.
    const later: StoryState = {
      ...resolveStoryState(inChapterTwo()),
      chapter: 3,
    };
    expect(circusPointerDue(later)).toBe(false);
  });

  test('E4 — a missing profile says nothing, and the cry is text only', () => {
    expect(circusPointerCry(null)).toBeNull();
    expect(circusPointerCry(undefined)).toBeNull();
    expect(CIRCUS_POINTER_CRY).toContain('District race');
    // No figure, no price and no reward: a pointer, not an offer.
    expect(CIRCUS_POINTER_CRY).not.toMatch(/\d/);
    expect(CIRCUS_POINTER_CRY.toLowerCase()).not.toContain('gold');
  });

  test('E5 — the hub raises it on the tournament tab, and `App` owns the toast', () => {
    const hub = codeOf(hubSource);
    // The cry is raised when the Colosseum tab opens, from the resolved prop.
    expect(hub).toContain("if (activeTab !== 'tournament') return;");
    expect(hub).toContain('if (!heraldCircusCry) return;');
    expect(hub).toContain('raiseHeraldCry.current?.(heraldCircusCry);');
    // `App` resolves it from the campaign state and passes the toast's setter in.
    const app = codeOf(appSource);
    expect(app).toContain('circusPointerCry(profile)');
    expect(app).toContain('onHeraldCry={handleHeraldCry}');
    expect(app).toContain('setHeraldCries((previous)');
    // Nothing in the pointer path writes a profile.
    expect(codeOf(chapterTwoSource)).not.toMatch(/saveProfile|PROFILE_STORAGE_KEY/);
  });
});

// ── §F the deferred character's name ─────────────────────────────────────
describe('§F the deferred District introduction is not built here', () => {
  test('F1 — the name appears in no non-test source but the K1 registry data', () => {
    const offending: string[] = [];
    for (const entry of readdirSync(SRC_DIR, { recursive: true }).map(String)) {
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue;
      // K1's keeper registry is DATA, and that entry predates this slice.
      if (entry === 'data/keepers.ts') continue;
      const text = readFileSync(join(SRC_DIR, entry), 'utf8');
      if (/Hanno/.test(text)) offending.push(entry);
    }
    expect(offending).toEqual([]);
    // The registry itself still holds the keeper as data, untouched by this slice.
    const keepers = readFileSync(join(SRC_DIR, 'data/keepers.ts'), 'utf8');
    expect(keepers).toContain("id: 'hanno_of_carthage'");
    expect(keepers).toContain('horses judge you before I do');
  });

  test('F2 — the two deferrals are recorded on the chapter resolver', () => {
    // Recorded DESCRIPTIVELY, without the name, which is the ruling's condition.
    expect(moduleSource).toContain('charioteer the chapter opens on');
    expect(moduleSource).toContain("Stage 2's 2A data build");
    expect(moduleSource).toContain('no pre-race card change');
    expect(moduleSource).toContain('"Answer the Rein" steps 1 and 2 are NOT built here');
    expect(moduleSource).toContain('they ride the racing');
    // …and the comment never names the character it is deferring.
    expect(/Hanno/.test(moduleSource)).toBe(false);
  });
});

// ── §G no new profile field ──────────────────────────────────────────────
describe('§G no new profile field', () => {
  const optionalProfileFields = (): string[] => {
    const start = typesSource.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = typesSource.indexOf('{', start); i < typesSource.length; i += 1) {
      if (typesSource[i] === '{') depth += 1;
      if (typesSource[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = typesSource.slice(start, end);
    return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map((match) => match[1]);
  };

  test('G1 — the field list is unchanged at twenty, ending with the omen pair', () => {
    const fields = optionalProfileFields();
    expect(fields.length).toBe(20);
    expect(fields.slice(-2)).toEqual(['omen', 'omenTrickleClaimed']);
    // Nothing race-, beat- or chapter-shaped was added by this slice.
    for (const forbidden of ['chapter', 'beat', 'beatThree', 'raceResults', 'omenTaken']) {
      expect(fields).not.toContain(forbidden);
    }
  });

  test('G2 — the chapter-two module declares no profile shape and writes nothing', () => {
    const code = codeOf(chapterTwoSource);
    expect(code).not.toMatch(/interface\s+PlayerProfile/);
    expect(code).not.toMatch(/saveProfile|loadSavedProfile|localStorage|sessionStorage/);
    expect(code).not.toMatch(/profile\s*\.\s*[A-Za-z_]+\s*=[^=]/);
  });
});

// ── §H Postumia's briefing, on STORY-2's surface ─────────────────────────
describe("§H Postumia's briefing rides the pre-fight narration block", () => {
  const finalBout = bossOf(1);

  test('H1 — one priestess, one line, and no figure on it', () => {
    expect(FORTUNA_SHRINE_BRIEFING.length).toBe(1);
    expect(FORTUNA_SHRINE_BRIEFING[0].speaker).toBe('Postumia');
    for (const entry of FORTUNA_SHRINE_BRIEFING) {
      // Narration, not intel: no digit anywhere in the line.
      expect(entry.line).not.toMatch(/\d/);
      expect(entry.line).toContain('shrine');
    }
  });

  test("H2 — due only on the chapter's final, while Chapter 2 is open and the beat is unsettled", () => {
    const due = inChapterTwo();
    expect(isTournamentFinalBout(finalBout)).toBe(true);
    expect(isFortunaBriefingDue(due, finalBout)).toBe(true);
    // Settled — a live omen or the decline — and the card stops pointing there.
    expect(isFortunaBriefingDue(withOmen(due), finalBout)).toBe(false);
    expect(isFortunaBriefingDue(withDecline(due), finalBout)).toBe(false);
    // Not Chapter 2 yet.
    expect(isFortunaBriefingDue({ ...fresh(), fightsWon: 1 }, finalBout)).toBe(false);
    // Not the chapter's final.
    const regular = ALL_OPPONENTS.find(
      (opponent) => opponent.tier === 1 && opponent.isBoss !== true
    );
    expect(regular).toBeDefined();
    expect(isTournamentFinalBout(regular)).toBe(false);
    expect(isFortunaBriefingDue(due, regular)).toBe(false);
    expect(isFortunaBriefingDue(due, null)).toBe(false);
    expect(isFortunaBriefingDue(null, finalBout)).toBe(false);
  });

  test("H3 — the card renders it through STORY-2's own narration block", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PreFightModal, {
        opponent: finalBout,
        narration: FORTUNA_SHRINE_BRIEFING,
        onConfirm: () => {},
        onCancel: () => {},
      })
    );
    expect(markup).toContain('data-prefight-narration');
    expect(markup).toContain('Postumia');
    expect(markup).toContain('let Fortuna read the bout');
    // A card without a briefing draws no narration block at all.
    const plain = renderToStaticMarkup(
      React.createElement(PreFightModal, {
        opponent: finalBout,
        onConfirm: () => {},
        onCancel: () => {},
      })
    );
    expect(plain).not.toContain('data-prefight-narration');
    expect(plain).not.toContain('Postumia');
  });

  test('H4 — the hub wires the briefing to that card and nothing else', () => {
    const hub = codeOf(hubSource);
    expect(hub).toContain('isFortunaBriefingDue(playerProfile, selectedOpponent)');
    expect(hub).toContain('FORTUNA_SHRINE_BRIEFING');
    // …and the shrine plate this slice must NOT build is nowhere in it.
    expect(hub).not.toMatch(/KeeperPlate|ShrinePlate/);
  });
});
