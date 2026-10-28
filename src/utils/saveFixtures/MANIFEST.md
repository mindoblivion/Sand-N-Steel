# Golden save corpus — fixture manifest (GC20)

The frozen profile shapes this game has shipped. One file per shape, each a
**complete** profile exactly as the save key holds it
(`sand_and_steel_gladiator_save_v2`, whole-profile JSON — see
`src/services/storage.ts`). Provenance is repeated here in full; the one-line
form lives beside each fixture in `index.ts`.

Everything here is **synthetic**: fixtures are constructed in this repository, or
reconstructed from this repository's own git history. No real player's save was
ever read, copied or trimmed to produce them.

**Extended by GC20-X.** The corpus began with the eight shapes the game had shipped
through GC20 (`chariot`, `racing`). It now also covers every optional profile field
added since: `story`, `temper`, `road`, `seen` and `time` — three new fixtures, and
the suite's corpus rule (§J) reads the full optional set straight out of
`src/types/game.ts`, so a field that appears without a fixture still fails the run.

**Extended by P2 (Triumphs).** `PlayerProfile.laurels` — the fame honours the player
buys — is the newest optional field, so it gets both halves of the rule in the same
slice: `triumphs-era`, produced by driving the **shipped** `purchaseLaurel`
transaction four times (three titles plus the statue), and `malformed-empty-fields`,
which gained `"laurels": {}` so its "every post-GC20 optional field, present and
empty-shaped" claim stays true. Every other fixture predates the field and keeps
omitting it, which is the legacy shape a load must survive.

**Extended by S6 (Bazaar consumables).** `PlayerProfile.consumables` — the counted
Bazaar potions — is the newest optional field, and this slice adds the field, so it
gets the fixture half of the rule too: `consumables-era`, the Triumphs-era save with
its satchel stocked (two Field Poultices at 20 g, one Medicus Salve at 90 g — the
C4c price, not the superseded 45 g). Every older fixture keeps **omitting** the
field, which is the legacy shape a load must survive, and `saveCorpus.test.ts` §J's
expected optional set now ends with `consumables` in `src/types/game.ts` declaration
order.

**Extended by S7 (Tavern rumours).** `PlayerProfile.intel` — the opponents the player
has bought the Golden Palm Tavern's rumour on (15 gold each, information only) — is
the newest optional field, so it gets the fixture half of the rule too: `intel-era`,
the S6 consumables-era save with two rumours bought (the tier-2 boss and a tier-3
opponent, the shape a successful `purchaseIntel` writes). Every older fixture keeps
**omitting** the field, which is the legacy shape a load must survive, and
`saveCorpus.test.ts` §J's expected optional set now ends with `intel` in
`src/types/game.ts` declaration order.

**Extended by P4 (Stable progression).** `PlayerProfile.stable` — the horse team's
bought quality grade (0–3) and conditioning level (0–5) — is the newest optional
field, so it gets both halves of the rule in the same slice: `stable-era`, the
`intel-era` save with its purse hand-aged to 7,000 gold and then driven through the
**shipped** P4 transactions (three `purchaseStableQuality` buys — Trained Team 400,
Racing Bred 900, Champion Bloodline 1,600 — and five `purchaseStableConditioning`
levels at the selected Quadra's four-horse rate, 240 + 480 + 720 + 960 + 1,200),
leaving 500 gold, `stable: { "quality": 3, "conditioning": 5 }` and no stored team
size. Every older fixture keeps **omitting** the field, which is the legacy shape a
load must survive, and `saveCorpus.test.ts` §J's expected optional set now ends with
`stable` in `src/types/game.ts` declaration order.

**Extended by P5 (Facility progression).** `PlayerProfile.facilities` — the built
level (0–2) of the Imperial Stable, the Ludus Training Yard and the Smithing
Workshop — is the newest optional field, so it gets both halves of the rule in the
same slice: `facilities-era`, the `stable-era` save with its purse hand-aged to
6,000 gold and then driven through the **shipped** `purchaseFacility` transaction
six times (both levels of all three buildings: 500 + 1,200 for the stable and the yard,
600 + 1,400 for the workshop, 5,400 total), leaving 600 gold and `facilities: { "stable": 2, "yard": 2, "workshop": 2 }`.
Every older fixture keeps **omitting** the field, which is the legacy shape a load
must survive — three buildings at level 0, un-repaired — and `saveCorpus.test.ts`
§J's expected optional set now ends with `facilities` in `src/types/game.ts`
declaration order.

**Extended by CH-1 (armatura & palmae).** `PlayerProfile.armatura` and
`PlayerProfile.palmae` — the gladiator's class and the palmae worn — are the two
newest optional fields, so they get both halves of the rule in the same slice:
`armatura-palmae`, the `facilities-era` save hand-aged with class `retiarius`,
two palmae unlocked (`iron_lungs`, `second_wind`) and one worn (`iron_lungs`), the
shape a later class choice and palma earn/equip write. Every older fixture keeps
**omitting** both fields, which is the legacy shape a load must survive — a
Murmillo with no palmae — and `saveCorpus.test.ts` §J's expected optional set now
ends with `armatura`, `palmae` in `src/types/game.ts` declaration order.

**Extended by C-8.70C (Grudge Bouts).** `PlayerProfile.grudges` — the record of
each beaten regular rival, its studied dominant class and the grudge's own state —
is the newest optional field, so it gets the fixture half of the rule in the same
slice: `grudge-era`, the `armatura-palmae` save hand-aged with two beaten T1
rivals — `opp_marcus` studied `power` with its grudge open, `opp_flaccus` studied
`quick` with its grudge closed by a loss — i.e. the exact shape the duel-result
write persists through `recordStandardVictory` / `closeGrudge`. Every older
fixture keeps **omitting** the field, which is the legacy shape a load must
survive (a gladiator with no grudges), and `saveCorpus.test.ts` §J's expected
optional set now ends with `grudges` in `src/types/game.ts` declaration order.

**Extended by K1 (city keepers).** `PlayerProfile.seenKeepers` — the keeper ids
(`src/data/keepers.ts`) a gladiator has actually met at a storefront counter — is
the newest optional field, so it gets both halves of the rule in the same slice:
`keepers-era`, the `grudge-era` save hand-aged with two keepers met (the forge's
`sextus_ferratus`, then the armorer's `salvia_coriaria`), which is the exact shape
a first storefront open persists through `recordKeeperVisit`. Every older fixture
keeps **omitting** the field, which is the legacy shape a load must survive (a
gladiator who has met nobody), and `saveCorpus.test.ts` §J's expected optional set
now ends with `seenKeepers` in `src/types/game.ts` declaration order.

**Extended by Pitch A1 (Fortuna's Omen).** `PlayerProfile.omen` — the word taken
at Fortuna's shrine before a bout (`{ kind: 'kind' | 'ill', expiresAtBout }`) —
and `PlayerProfile.omenTrickleClaimed` — the once-ever "self-reliant" decline
marker — are the two newest optional fields, so they get both halves of the rule
in the same slice: `omen-era`, the `keepers-era` save carrying a live kind omen
waiting on the next bout (index 9 = its 8 fought bouts + 1) with the decline
trickle already claimed, which is the exact shape the shrine's offering and first
decline persist. Every older fixture keeps **omitting** both fields, which is the
legacy shape a load must survive (no omen, trickle still owed), and
`saveCorpus.test.ts` §J's expected optional set now ends with `omen`,
`omenTrickleClaimed` in `src/types/game.ts` declaration order.

**Extended by STORY-4a (Mercy or Glory — Pitch A9).** `PlayerProfile.spared` — the
rivals the player has spared, keyed by base roster id in the pitch's exact shape
`{ [rivalId: string]: true }` — is the newest optional field, so it gets both halves
of the rule in the same slice: `mercy-era`, the `omen-era` save carrying a SPARED
Tier-2 regular (Cassius the Phalanx beaten, his C-8.70C grudge kept exactly as the
duel-result write records it, and `spared["opp_hoplite"] = true`) and a FINISHED one
(Brutus "The Anvil" beaten with no grudge record left and no flag — Finish writes no
flag; a finished rival is derived from the absence of his grudge). Every older
fixture keeps **omitting** the field, which is the legacy shape a load must survive
(nobody spared), and `saveCorpus.test.ts` §J's expected optional set now ends with
`spared` in `src/types/game.ts` declaration order — twenty-one fields.

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
| `minimal-legacy` | `minimalLegacyProfile.json` | The smallest historical shape: the shipped character-creation profile as this repository first imported it — no `chariot`, no `racing`. | Reconstructed from git history (`76984d6`, `CharacterCreation.handleFinish`). It is the factory's field set **plus `isLeftyMode`**, which `createNewProfile()` did not write until CORR-BATCH-2 aligned the two factories. |
| `current-fresh` | `currentFreshProfile.json` | A brand-new gladiator, exactly as the factory writes one today. | Generated with `createNewProfile('Tester')` at `HEAD` and frozen; regenerated by CORR-BATCH-2 when the factory gained `isLeftyMode`, so it still mirrors the live factory. |
| `mid-career` | `midCareerProfile.json` | A played profile: level 7, tier 3 reached, five opponents defeated, a 2-loss record, 1,240 gold / 315 fame, a full armory loadout owned and equipped. | Hand-aged from a fresh save through the fields the shipped handlers actually advance (`handleMatchComplete`, `handleEquipWeapon`, `handleEquipArmor`, `handleTrainStat`). |
| `racing-era` | `racingEraProfile.json` | The same played profile after the chariot workshop and the racing stables: reinforced wheels and a charred finish owned **and** equipped, Triga and Quadra unlocked, Quadra selected. | The mid-career fixture driven through the shipped pure transactions — `purchaseChariotPart` ×2, `equipChariotPart` ×2, `purchaseRacingConfig` ×2, `selectRacingConfig` ×1 — and frozen. |
| `malformed-null-objects` | `nullObjectsProfile.json` | A null where an object is expected: `"chariot": null`, `"racing": null`. | Hand-aged from the fresh shape. |
| `malformed-partial-racing` | `partialRacingProfile.json` | A partial `racing` record: `unlocked: [4]` (Quadra with no Triga) and `selected: 3` (a configuration that is not unlocked). | Hand-aged from the fresh shape. |
| `malformed-partial-chariot` | `partialChariotProfile.json` | A partial `chariot` record: `owned` present with a id no longer in the catalogue, `equipped` absent entirely. | Hand-aged from the fresh shape. |
| `malformed-unknown-fields` | `unknownFieldsProfile.json` | Forward compatibility: a fresh save plus `saveSchemaVersion` (number), `futureSeason` (nested object) and `_legacyNote` (string) — fields no build in this tree writes. | Hand-aged from the fresh shape. |
| `story-road-era` | `storyRoadEraProfile.json` | The fully-populated shape: the racing-era save plus all five fields added after GC20 — `temper` on three owned items (levels 2 / 1 / 3), `story` with the library read and three fragments, `road` sworn under the laurel with three milestones seen, `seen` with five coach-mark ids, and `time` at a mid-cycle 26 (day 4, dusk). | The racing-era fixture hand-aged field by field; nothing was produced by a transaction that does not exist. |
| `partial-story-fields` | `partialStoryProfile.json` | A partial new-fields shape: a played second-level save with `story: { librarySeen: true }`, a single temper entry (`gladius_standard: 1`) and `time: { total: 9 }`; `road` and `seen` absent entirely. | Hand-aged from the fresh shape through two wins and one upgrade. |
| `malformed-empty-fields` | `emptyFieldsProfile.json` | The empty-shaped new fields: `story`, `temper`, `road`, `seen` and `laurels` present as `{}`, `time` present as `{ total: 0 }` — what a writer that created a field before filling it leaves. | Hand-aged from the fresh shape. |
| `triumphs-era` | `triumphsEraProfile.json` | The fully-populated shape with the Triumph record filled: all three titles owned (`Crowd Favourite`, `Champion of the Sands`, `Living Legend`), the ludus statue raised, `title` set to the newest title bought and 700 fame left of 5,000. | The `story-road-era` save with its fame hand-aged to 5,000 and then driven through the real `purchaseLaurel` transaction four times (4,300 fame spent) and frozen. |
| `consumables-era` | `consumablesEraProfile.json` | The fully-populated shape with the counted satchel filled: two Field Poultices and one Medicus Salve, keyed by consumable id and carrying no gear at all. | The `triumphs-era` save hand-aged with the record a successful `purchaseConsumable` writes; frozen, and never written by `createNewProfile`. |
| `intel-era` | `intelEraProfile.json` | The fully-populated shape with the tavern's rumour record filled: two opponents bought at 15 gold each (`opp_ignis_boss`, `opp_centurion_drusus`), plus every earlier optional field. | The `consumables-era` save with the `intel` list a successful `purchaseIntel` writes (S7); frozen, and never written by `createNewProfile`. |
| `stable-era` | `stableEraProfile.json` | The fully-populated shape with the stable's two ladders topped out: quality 3 (Champion Bloodline) and conditioning 5, bought for the Quadra team the save races, with 500 gold left of 7,000. No team size is stored — the horse count stays the racing record's fact. | The `intel-era` save with its purse hand-aged to 7,000 and then driven through the real P4 transactions — `purchaseStableQuality` ×3 (400 + 900 + 1,600) and `purchaseStableConditioning` ×5 (240 + 480 + 720 + 960 + 1,200 at the Quadra's four-horse rate) — and frozen; never written by `createNewProfile`. |
| `armatura-palmae` | `armaturaPalmaeProfile.json` | The fully-populated shape with the CH-1 class and palmae filled: `armatura: "retiarius"`, `palmae` with two unlocked (`iron_lungs`, `second_wind`) and one equipped (`iron_lungs`), plus every earlier optional field. | The `facilities-era` save hand-aged with the two field shapes a later class choice and palma earn/equip write; frozen, and never written by `createNewProfile`. |
| `keepers-era` | `keepersEraProfile.json` | The fully-populated shape with the K1 keeper record filled: `seenKeepers` naming the two keepers met, in the order the counters were opened (`sextus_ferratus`, `salvia_coriaria`), plus every earlier optional field. | The `grudge-era` save hand-aged with the record a first storefront visit persists through `recordKeeperVisit`; frozen, and never written by `createNewProfile`. |
| `omen-era` | `omenEraProfile.json` | The fully-populated shape with Fortuna's omen live and the decline trickle claimed: `omen: { "kind": "kind", "expiresAtBout": 9 }` (the record's 8 fought bouts + 1) and `omenTrickleClaimed: true`, plus every earlier optional field. | The `keepers-era` save hand-aged with the two field shapes the shrine's offering and its first decline persist (Pitch A1); frozen, and never written by `createNewProfile`. |
| `mercy-era` | `mercyEraProfile.json` | The fully-populated shape with STORY-4a's two mercy shapes: `spared: { "opp_hoplite": true }` on a beaten Tier-2 regular whose grudge is kept, and a second beaten Tier-2 regular (`opp_brutus_anvil`) with no grudge record left — the two shapes `spareRival` / `finishRival` persist. | The `omen-era` save hand-aged with the shapes the result surface's Spare and Finish answers write (STORY-4a, Pitch A9); frozen, and never written by `createNewProfile`. |

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
| `story-road-era` | all five post-GC20 optional fields populated · temper levels on owned items (1 to 3) · road milestones and a chosen banner device · a mid-cycle clock (day 4, dusk) |
| `partial-story-fields` | sparse story record · a single temper entry · road and seen absent |
| `malformed-empty-fields` | empty-shaped optional records · an empty `laurels` record (owns no Triumph) · a zero clock (day 1, dawn) · nothing seen, no milestones |
| `triumphs-era` | `laurels` populated — three titles owned and the statue raised · a title purchase setting the displayed `title` · every post-GC20 optional field populated |
| `consumables-era` | `consumables` populated — the counted satchel (2 × Field Poultice, 1 × Medicus Salve) · every post-GC20 optional field populated · every earlier fixture omits the field |
| `intel-era` | `intel` populated — two rumours bought, information only · every post-GC20 optional field populated · every earlier fixture omits the field |
| `stable-era` | `stable` populated — quality 3 and conditioning 5, no team size stored · every post-GC20 optional field populated · every earlier fixture omits the field |
| `keepers-era` | `seenKeepers` populated — two keepers met, in the order their counters were opened · every post-GC20 optional field populated · every earlier fixture omits the field |
| `omen-era` | `omen` populated — a live kind omen waiting on the record's next bout · `omenTrickleClaimed` populated — the once-ever decline trickle already paid · every post-GC20 optional field populated · every earlier fixture omits both fields |
| `mercy-era` | `spared` populated — one spared rival, keyed by base roster id · a spared rival keeps his grudge (the return path) · a finished rival: beaten, grudge removed, no flag · every post-GC20 optional field populated · every earlier fixture omits `spared` |

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
   `getChariotPurchaseEligibility`, `getChariotEquipEligibility`), the campaign's
   `resolveStoryState`, the road's `resolveRoadProgress` / `resolveRoadState`, the
   coach marks' `resolveSeenState`, the triumphs' `resolveLaurels`, the Bazaar
   satchel's `resolveConsumables`, the tavern's `resolveIntel`, the clock's
   `resolveTimeState` and temper's
   `resolveTemperLevel` read through the effective-stats helpers
   (`getEffectiveWeaponStats` / `getEffectiveArmorStats`) the boot-path stats reader
   `calculateTotalStats` itself uses;
3. **purity** — the fixture's serialized bytes are compared before and after the
   resolvers run, and the stored bytes are re-read: resolving a save never rewrites
   it;
4. **sane defaults for every absent field** — an absent `racing` resolves to Biga
   selected with Triga and Quadra locked, an absent `chariot` to the stock loadout,
   an absent `injury` to no penalty, an absent `story` to no campaign flags, an
   absent `temper` to level 0 on every owned item, an absent `road` to unsworn with
   no device and no milestones, an absent `seen` to nothing seen, an absent `time`
   to Day 1 at dawn, an absent `laurels` to owning no titles and no statue, an
   absent `consumables` to an empty satchel, an absent `intel` to no rumour
   bought, an absent `omen` to no omen and an absent `omenTrickleClaimed` to a
   trickle still owed.

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
2. **The shipped creation and the factory write the same shape — since CORR-BATCH-2.**
   `CharacterCreation.handleFinish` (the path a real player's save comes from)
   wrote `isLeftyMode` while `createNewProfile()` did not; the factory now writes it
   too, so `current-fresh` was regenerated and the suite pins the two key sets as
   **equal** instead of pinning a difference. Before that alignment a fixture built
   from the factory alone did not represent a real save.
3. **`profile.isLeftyMode` is no longer read by production.** `App` reads
   `settings.lefty` from the settings record; the only reader of the profile field
   left is the dev character harness. The field is still written at creation, so it
   stays in the corpus as a shape to keep loadable.
4. **CORRECTED (GC20-X) — the tree does now carry `story`, `temper`, `road`, `seen`
   and `time`.** GC20 recorded that none of `road`, `story`, `seen` or `temper`
   existed; that was true when it was written. Since then `story` landed with
   STORY-1, `temper` with P1, `road` with RG-1/RG-3, `seen` with CL-1 and `time`
   with T0 — every one an optional, lazily-resolved field exactly like `chariot`
   and `racing`. The corpus is therefore **extended**, not merely annotated:
   `story-road-era` carries all five populated, `partial-story-fields` carries three
   of them sparsely, and `malformed-empty-fields` carries all five empty-shaped, so
   each new field has a fixture with it and a fixture without it (the rule §J of
   the suite enforces). `stable` is still not a save field — it is a building
   (`stable` in `HUB_LOCATIONS`), and its state is the `chariot` loadout this corpus
   already covers — so it is the one name from the original brief with nothing of
   its own to cover.

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

**Extended by A8 (Triumphs evaluator).** `PlayerProfile.records` — the retained
deeds: the earned triumph ids, the ones the player has read, and the highest purse
ever held — is the newest optional field, so it gets both halves of the rule in the
same slice: `records-era`, the STORY-4a mercy-era save driven **once** through the
shipped `applyTriumphAwards` transaction with no duel reading (so no transient
deed), which is byte-for-byte what that write persists. It carries seven earned
deeds and none read yet, `peakGold: 600`, the three earned titles appended beside
the four bought ones (Saga's stays capstone-gated, so it is correctly absent), and
`fame` 700 → 785 — six standard grants at 10 plus the Quadra capstone at 25, all in
that one write. Every older fixture keeps **omitting** the field, which is the
legacy shape a load must survive: `resolveRecords` reads it as nothing earned,
nothing read, no purse recorded, and gains no field by being read.
`saveCorpus.test.ts` §J's expected optional set now ends with `records` in
`src/types/game.ts` declaration order — **21 → 22, one field, appended last** — and
§J's control still proves the rule fails on a field nobody accounted for.
**A5** extends this same fixture's `records` object with `codexLocations` (three
hubs walked: `records_house`, `colosseum`, `training_yard`) — the Codex's one lazy
field lives INSIDE `records` (A5 — Director ruling R6), so §J stays at 22 optional
top-level fields with `records` last, and no new fixture is needed for it.
