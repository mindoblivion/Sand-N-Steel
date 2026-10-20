/**
 * CL-1 — the game's glossary, as data.  No UI yet.
 *
 * The appendix's tables are kept as tables: every entry carries the section it
 * was written under ("Fighting & the school", "Gear words", "The city, the week,
 * the record", "The Circus"), so a future Codex shelf can group them exactly as
 * the arena explains them, and every term and gloss is verbatim.
 *
 * Read-only data plus two lookups — nothing here reads storage, a save or a
 * setting, and nothing renders.
 */

export interface GlossaryEntry {
  /** The term, exactly as written — plural forms stay in the term (`Palma (pl. Palmae)`). */
  term: string;
  /** The gloss, exactly as written. */
  gloss: string;
  /** The table this row belongs to. */
  section: string;
}

/** The glossary's table headings, in the appendix's order. */
export const GLOSSARY_SECTIONS = [
  'Fighting & the school',
  'Gear words',
  'The city, the week, the record',
  'The Circus',
] as const;

const FIGHTING = GLOSSARY_SECTIONS[0];
const GEAR = GLOSSARY_SECTIONS[1];
const CITY = GLOSSARY_SECTIONS[2];
const CIRCUS = GLOSSARY_SECTIONS[3];

export const GLOSSARY: GlossaryEntry[] = [
  // ── Fighting & the school ────────────────────────────────────────────────
  { term: 'Armatura', gloss: 'Your fighting class — it sets your stats, your gear, and how you fight.', section: FIGHTING },
  { term: 'Doctrina', gloss: "Your class's signature technique. Always on, no cost.", section: FIGHTING },
  { term: 'Palma (pl. Palmae)', gloss: 'A victory palm — a trait you earn and equip; carry up to 3.', section: FIGHTING },
  { term: 'Ludus', gloss: 'A gladiator school — your home camp and training ground.', section: FIGHTING },
  { term: 'Doctore', gloss: "The school's trainer. He teaches every fighter here, including you.", section: FIGHTING },
  { term: 'Primus Palus', gloss: "The champions' ladder — named rivals, each with a known style, rung by rung.", section: FIGHTING },
  { term: 'Missio', gloss: "The crowd's mercy for a beaten fighter — to lose and live.", section: FIGHTING },
  { term: 'Rudis', gloss: 'The wooden sword of freedom, granted to a Legend who retires.', section: FIGHTING },
  { term: 'Telegraph', gloss: 'A boss winding up a huge attack. The wind-up is your warning — dodge it.', section: FIGHTING },
  { term: 'Crowd Hype', gloss: 'How loud the crowd is for the fight. Bold fighting raises it; your best is remembered.', section: FIGHTING },
  { term: 'SP', gloss: 'Stamina points — every action spends them; guarding and taunting win them back.', section: FIGHTING },

  // ── Gear words ───────────────────────────────────────────────────────────
  { term: 'Gladius', gloss: 'The standard short sword.', section: GEAR },
  { term: 'Spatha', gloss: 'A longer sword, slower to tire of reach.', section: GEAR },
  { term: 'Pugio', gloss: 'A dagger — a last word at close quarters.', section: GEAR },
  { term: 'Sica', gloss: "A curved blade that hooks around a shield's edge.", section: GEAR },
  { term: 'Fuscina', gloss: "The net-fighter's trident.", section: GEAR },
  { term: 'Rete', gloss: "The net — thrown once, it tangles a fighter's next moves.", section: GEAR },
  { term: 'Hasta', gloss: 'A long thrusting spear that owns its distance.', section: GEAR },
  { term: 'Galea', gloss: "A gladiator's helmet.", section: GEAR },
  { term: 'Manica', gloss: 'An arm guard, cloth and iron over sword-arm or shield-arm.', section: GEAR },
  { term: 'Galerus', gloss: 'The tall shoulder guard of the net-fighter.', section: GEAR },
  { term: 'Ocrea (pl. Ocreae)', gloss: 'A greave — armour for the shin.', section: GEAR },
  { term: 'Scutum', gloss: 'The great curved body shield.', section: GEAR },
  { term: 'Parma', gloss: 'A small shield — light, quick, and little cover.', section: GEAR },
  { term: 'Cardiophylax', gloss: 'A breastplate worn over the heart.', section: GEAR },
  { term: 'Lorica Segmentata', gloss: 'Banded plate armour of iron hoops.', section: GEAR },
  { term: 'Lorica Hamata', gloss: 'Mail armour — a shirt of rings.', section: GEAR },
  { term: 'Tempering', gloss: 'Re-forging a piece at the forge to strengthen it: +1, +2, +3.', section: GEAR },

  // ── The city, the week, the record ───────────────────────────────────────
  { term: 'Factio (pl. Factiones)', gloss: 'A racing faction — a stable with colours, fans, and grudges.', section: CITY },
  { term: 'Russata', gloss: 'The Reds, a racing faction.', section: CITY },
  { term: 'Albata', gloss: 'The Whites, a racing faction.', section: CITY },
  { term: 'Veneta', gloss: 'The Blues, a racing faction.', section: CITY },
  { term: 'Prasina', gloss: 'The Greens, a racing faction.', section: CITY },
  { term: 'Fame', gloss: 'Your renown. Winning earns it; your rank is read from it.', section: CITY },
  { term: 'Triumph', gloss: 'A recorded feat of your career — the Library keeps them all.', section: CITY },
  { term: 'Codex', gloss: 'Your career record: rivals beaten, gear owned, streets walked, systems learned.', section: CITY },
  { term: 'Acta', gloss: "The morning notice: today's day-name and its three deeds.", section: CITY },
  { term: 'Deed', gloss: "One of the day's three small jobs. Finish all three for the day's Laurel.", section: CITY },
  { term: 'Laurel (of the day)', gloss: 'The honour for completing all three deeds in a day.', section: CITY },
  { term: 'Ludi', gloss: "The public games — the festival days the city's week turns on.", section: CITY },
  { term: 'Dies Mercatus', gloss: 'Market Day (Monday) — the Bazaar dresses its best.', section: CITY },
  { term: 'Dies Ferratus', gloss: "Iron Day (Tuesday) — the Forge's day.", section: CITY },
  { term: 'Dies Fortunae', gloss: "Fortuna's Day (Wednesday) — the Shrine accepts alms and gives Omens.", section: CITY },
  { term: 'Dies Equorum', gloss: 'Day of Horses (Thursday) — the Circus’s day.', section: CITY },
  { term: 'Dies Sanguinis', gloss: "Day of Blood (Friday) — the Colosseum's hard day.", section: CITY },
  { term: 'Ludi Magni', gloss: "The Great Games (Saturday) — the week's biggest card.", section: CITY },
  { term: 'Dies Quietus', gloss: 'Quiet Day (Sunday) — the city breathes; no games.', section: CITY },
  { term: 'Omen', gloss: "A one-fight blessing from Fortuna's Shrine. You always see what it does first.", section: CITY },
  { term: 'Favour (of Fortuna)', gloss: "The Shrine's tally of your devotion. It only ever grows.", section: CITY },

  // ── The Circus ───────────────────────────────────────────────────────────
  { term: 'Biga', gloss: "A two-horse chariot team — every driver's start.", section: CIRCUS },
  { term: 'Triga', gloss: 'A three-horse team — a yoked pair plus a trace horse.', section: CIRCUS },
  { term: 'Quadra', gloss: 'A four-horse team — the full thunder.', section: CIRCUS },
  { term: 'Auriga', gloss: 'A chariot driver — a racer.', section: CIRCUS },
  { term: 'Carceres', gloss: 'The starting gates of the Circus.', section: CIRCUS },
  { term: 'Spina', gloss: 'The long central wall the chariots race around.', section: CIRCUS },
  { term: 'Meta (pl. Metae)', gloss: 'The turning posts at each end of the spina. Hug them to gain ground.', section: CIRCUS },
  { term: 'Euripus', gloss: 'The water channel that runs along the spina.', section: CIRCUS },
];

const BY_TERM: ReadonlyMap<string, GlossaryEntry> = new Map(
  GLOSSARY.map((entry) => [entry.term.toLowerCase(), entry])
);

/**
 * Look a term up by name, case- and whitespace-insensitively, so "armatura",
 * " Armatura " and "Armatura" all answer the same row.  An unknown term resolves
 * to `undefined` rather than a guess.
 */
export function getGlossaryEntry(term: unknown): GlossaryEntry | undefined {
  if (typeof term !== 'string') return undefined;
  return BY_TERM.get(term.trim().toLowerCase());
}

/** The gloss for a term, or `undefined` when the glossary does not carry it. */
export function getGlossaryGloss(term: unknown): string | undefined {
  return getGlossaryEntry(term)?.gloss;
}
