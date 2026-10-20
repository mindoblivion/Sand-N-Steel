# Golden save corpus — fixture manifest (GC20)

The frozen profile shapes this game has shipped. One file per shape, each a
**complete** profile exactly as the save key holds it
(`sand_and_steel_gladiator_save_v2`, whole-profile JSON — see
`src/services/storage.ts`). Provenance is repeated here in full; the one-line
form lives beside each fixture in `index.ts`.

Everything here is **synthetic**: fixtures are constructed in this repository, or
reconstructed from this repository's own git history. No real player's save was
ever read, copied or trimmed to produce them.

## Corpus rule

**A slice that adds a field to the save adds a fixture for the shape it writes, in
the same PR that adds the field.** The save has no version number and no
migration, so the only thing keeping today's save loadable is that every past
shape still resolves; a new field is therefore incomplete until its shape is in
this corpus. `saveCorpus.test.ts` fails when a `.json` file in this directory is
not registered in `index.ts`, and when a registered fixture's file is missing.

Frozen files are never edited to track production — a changed production shape
gets a **new** fixture (and, if the old shape is still shipped, the old one stays).

## The fixtures

| id | file | what it is | how it was obtained |
|---|---|---|---|
| `minimal-legacy` | `minimalLegacyProfile.json` | The smallest historical shape: the shipped character-creation profile as this repository first imported it — no `chariot`, no `racing`. | Reconstructed from git history (`76984d6`, `CharacterCreation.handleFinish`). It is the factory's field set **plus `isLeftyMode`**, which `createNewProfile()` does not write. |
| `current-fresh` | `currentFreshProfile.json` | A brand-new gladiator, exactly as the factory writes one today. | Generated with `createNewProfile('Tester')` at `HEAD` and frozen, untouched. |
| `mid-career` | `midCareerProfile.json` | A played profile: level 7, tier 3 reached, five opponents defeated, a 2-loss record, 1,240 gold / 315 fame, a full armory loadout owned and equipped. | Hand-aged from a fresh save through the fields the shipped handlers actually advance (`handleMatchComplete`, `handleEquipWeapon`, `handleEquipArmor`, `handleTrainStat`). |
| `racing-era` | `racingEraProfile.json` | The same played profile after the chariot workshop and the racing stables: reinforced wheels and a charred finish owned **and** equipped, Triga and Quadra unlocked, Quadra selected. | The mid-career fixture driven through the shipped pure transactions — `purchaseChariotPart` ×2, `equipChariotPart` ×2, `purchaseRacingConfig` ×2, `selectRacingConfig` ×1 — and frozen. |
| `malformed-null-objects` | `nullObjectsProfile.json` | A null where an object is expected: `"chariot": null`, `"racing": null`. | Hand-aged from the fresh shape. |
| `malformed-partial-racing` | `partialRacingProfile.json` | A partial `racing` record: `unlocked: [4]` (Quadra with no Triga) and `selected: 3` (a configuration that is not unlocked). | Hand-aged from the fresh shape. |
| `malformed-partial-chariot` | `partialChariotProfile.json` | A partial `chariot` record: `owned` present with a id no longer in the catalogue, `equipped` absent entirely. | Hand-aged from the fresh shape. |
| `malformed-unknown-fields` | `unknownFieldsProfile.json` | Forward compatibility: a fresh save plus `saveSchemaVersion` (number), `futureSeason` (nested object) and `_legacyNote` (string) — fields no build in this tree writes. | Hand-aged from the fresh shape. |

### Shapes each fixture covers

| id | covers |
|---|---|
| `minimal-legacy` | creation shape as first shipped · no `chariot` · no `racing` |
| `current-fresh` | the factory shape today · the shape every dev harness builds on |
| `mid-career` | a played profile · gear owned and equipped · several tiers unlocked |
| `racing-era` | chariot loadout owned and equipped · racing unlocked and selected · both later-added optional objects |
| `malformed-null-objects` | null in an optional object field · both lazy resolvers |
| `malformed-partial-racing` | partial racing record · orphan Quadra dropped · a selection that is not unlocked |
| `malformed-partial-chariot` | partial chariot record · unknown id dropped · equipped falls back to the stock parts |
| `malformed-unknown-fields` | forward compatibility · unknown fields ignored by every resolver · unknown fields survive a load and save round trip |

## What the corpus proves

For every fixture, `src/utils/saveCorpus.test.ts` runs:

1. **the game's own load path** — the fixture's bytes are written to the real save
   key in an in-memory store and read back through `loadSavedProfile()`, exactly as
   `App` calls it at boot and as the cloud-save path calls `saveProfile()`;
2. **every lazy profile resolver in the tree** — `resolveRacingState` /
   `resolveChariotLoadout` and every pure reader built on them
   (`getSelectedRacingConfig`, `isRacingConfigUnlocked`,
   `getRacingPurchaseEligibility`, `getRacingSelectionEligibility`,
   `ownsChariotPart`, `isChariotPartEquipped`, `equippedChariotPartId`,
   `getChariotPurchaseEligibility`, `getChariotEquipEligibility`) plus the boot-path
   stats reader `calculateTotalStats`;
3. **purity** — the fixture's serialized bytes are compared before and after the
   resolvers run, and the stored bytes are re-read: resolving a save never rewrites
   it;
4. **sane defaults for every absent field** — an absent `racing` resolves to Biga
   selected with Triga and Quadra locked, an absent `chariot` to the stock loadout,
   and an absent `injury` to no penalty.

The other resolvers in the tree are not profile-shaped and are out of scope here:
`resolveSettings` (the separate settings record, `sand_and_steel_settings_v1`, with
its own shape and its own suite), `resolveTitlePhaseBackdrop`, `resolvePublicPage`,
`resolveChaseDistancePreset`, `resolveCityMovement`, `resolveTurnEndDefensive` and
`resolveActionClip`.

## Findings recorded by this slice (production untouched)

These are diagnostics, not repairs. Every one of them is asserted in the suite so
it cannot drift silently.

1. **`bossKills`, `tierProgress`, `newGamePlus` and `trainingSessionsLeft` are
   written once at creation and never advanced by any code path.** `grep` over
   `src/` finds the creation sites (`services/storage.ts`, `CharacterCreation.tsx`)
   and no writer or reader anywhere else: tier advancement is `currentTier += 1` on
   a boss kill (`App.handleMatchComplete`), and `bossKills` is never incremented.
   A real played save therefore always carries `bossKills: 0` and the all-zero
   `tierProgress` object. The `mid-career` fixture keeps those creation values for
   that reason — a populated `bossKills` is not a shape the game can produce today,
   so inventing one here would have made the corpus lie about the save.
2. **The shipped creation and the factory write different shapes.**
   `CharacterCreation.handleFinish` (the path a real player's save comes from)
   writes `isLeftyMode`; `createNewProfile()` does not. `minimal-legacy` is the
   creation shape, `current-fresh` the factory shape, and the suite pins the
   difference — a fixture built from the factory alone does not represent a real
   save.
3. **`profile.isLeftyMode` is no longer read by production.** `App` reads
   `settings.lefty` from the settings record; the only reader of the profile field
   left is the dev character harness. The field is still written at creation, so it
   stays in the corpus as a shape to keep loadable.
4. **No `road`, `story`, `seen`, `temper` or `stable` state exists in this tree** —
   the phase brief lists them among fields a save might have gained, but the only
   save fields added since import are `chariot` (C-8.66B) and `racing` (C-8.67B).
   The corpus covers both.

## Findings that would fail the corpus

None. Every fixture loads through the game's own path and resolves through every
resolver without throwing, does not mutate its stored bytes, and yields the
documented defaults — so this slice reports no failing fixture.

## Open risks (not covered by this corpus)

- **A null in a field no resolver guards is not covered and would not resolve.**
  `chariot: null` and `racing: null` are safe because their resolvers return a
  default for an absent field; `equipped: null`, `appearance: null` or
  `baseStats: null` are read directly by `calculateTotalStats` and by the hub
  screens, and no test here exercises them. The corpus's null coverage is
  deliberately limited to the optional object fields the load path resolves, which
  is what this slice's brief specifies.
- **The Google Drive cloud-save path stores the same whole-profile JSON** and is
  therefore covered by the same load path, but the Drive client itself is not
  exercised here (it needs an account and a network).
- **Fixtures pin item snapshots as stored.** A fixture's weapon/armour entries are
  the objects a save holds, not lookups into `ITEMS_DB`, so the corpus keeps
  working when the catalogue changes — and does not assert that a fixture's item
  stats equal today's catalogue values.
