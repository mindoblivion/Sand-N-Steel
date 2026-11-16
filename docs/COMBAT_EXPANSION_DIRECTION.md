# Combat Expansion Direction — Owner Approved

**Decision date:** 2026-11-16  
**Planning base:** `release/colosseum-60d` at `55e36fb603ce7be46d420b6cf23d4308926944d7`  
**Status:** Approved direction; implementation must proceed in small, independently tested slices.

This document records the owner's approval to expand Sand & Steel's combat using selected ideas observed in *Chained Beasts*. It authorizes original implementations of the mechanics described below. It does not authorize copying proprietary source code, art, animations, models, audio, names, or other protected assets.

## Product identity to preserve

Sand & Steel remains a single-player, third-person gladiator career built around deliberate weapon combat. Preserve:

- weapon reach, spacing, attack timing, stamina and recovery;
- readable enemy tells and opponent-specific behavior;
- guard, dodge, weapon/class identity and existing boss signatures;
- visible physical consequences instead of conventional floating health bars;
- Android-first performance and the existing React Three Fiber / Three.js stack.

Do not replace the combat loop with uncontrolled physics chaos, add multiplayer as part of this work, or introduce a second combat/progression framework.

## Approved feature direction

### 1. Physical combat interactions — first implementation priority

Extend the existing duel resolver with grounded, readable physical interactions:

- pushback and stagger from appropriately weighted attacks;
- knockdown and recovery states with clear vulnerability windows;
- trips or sweeps as weapon/class-appropriate actions;
- grapples/throws only after the basic displacement and knockdown rules are stable;
- executions against eligible downed opponents, with a readable commitment window and interruption risk.

These must be deterministic and testable as pure combat rules wherever possible. The 3D scene should present resolved outcomes; it must not become the authority for hit detection or save state. Avoid introducing a general-purpose physics engine.

### 2. Environmental combat — build on the existing hazard foundation

The current duel already renders braziers, spiked barriers and pit grates, and its power-attack resolver can apply a hazard effect when the defender is already near a hazard. This is a narrow existing interaction, not yet a general push/throw/prop system.

Extend it only after physical displacement exists:

- pushing or throwing a fighter into an existing hazard;
- a small, curated set of movable/throwable arena objects;
- breakable props only where the visual and collision representations can remain synchronized;
- clear warning/readability before a hazard can cause major damage.

Keep object counts, collision checks and effects bounded for mobile devices. No uncontrolled rigid-body simulation.

### 3. Body damage and dismemberment — approved replacement for the deferred plan

Replace the prior deferred “large-scale dismemberment/body-simulation” direction with a focused, gameplay-readable limb damage system:

- anatomical hit locations and limb-specific damage states;
- visible wounds and damage progression during a bout;
- severed limbs visibly detach when the authored damage/weapon conditions are met;
- detached parts may become short-lived improvised weapons where this is technically safe and readable;
- loss or damage to a limb changes relevant combat capabilities (for example, shield/weapon use, movement or stamina), rather than being cosmetic only.

The existing `injuryAppearance.ts` and `GladiatorMesh` damage patches are a presentation foundation only: they currently derive bruise/swelling overlays from overall health and the existing injury slot. They do not implement anatomical hit zones, severing, detachable meshes or limb-specific combat consequences.

Do not build a full soft-body or skeletal-destruction simulator. Use explicit limb state and asset-supported detachable visual pieces. Audit the shipped character GLBs and skeleton/bone naming before selecting supported limbs. Missing or inconsistent bones must fail safely without breaking a fighter mesh.

Player career persistence needs a separate save-compatibility design inside this feature: do not silently add permanent limb-loss fields to old saves or make irreversible player-state changes before the recovery/rehabilitation rules and acceptance tests are explicit. Opponent limb damage can begin as duel-local state.

### 4. Boss encounters — extend existing signature mechanics

Do not rebuild boss phases. The four ladder bosses already have two-phase behavior at the 50% health line, with signature mechanics such as chained telegraphed heavies, weapon switching, counter windows and rage.

Add selected boss-only encounter mechanics over time:

- attacks that alter or activate arena hazards;
- phase transitions that change positioning and safe zones, not merely damage numbers;
- attacks with arena-wide or directional tells and a clear escape/counter response;
- adaptive responses to repeated player patterns, bounded and legible;
- boss attacks that can create danger for nearby opponents or hazards where the encounter design supports it.

Boss-only mechanics must remain fenced from ordinary opponents and be covered by negative tests proving standard opponents cannot trigger them.

### 5. Active crowd participation

Extend the current crowd hype/embolden/turning system rather than replacing it:

- at authored moments, spectators can throw a limited set of safe arena objects into the fighting space;
- objects may create a temporary opportunity or hazard for either fighter;
- crowd reactions should reflect dramatic events (knockdowns, reversals, disarms, executions, boss phase changes and spectacular hazard use);
- object throws must be telegraphed, rate-limited and deterministic under tests; they must not randomly decide a fight without a readable counterplay window.

Crowd hype remains the existing source of crowd favour and opponent emboldening. Do not add a parallel crowd meter.

### 6. Training and build progression — integrate, do not duplicate

**Decision:** include a modest build-specialization layer, but do not add Chained Beasts-style random overtraining injuries in the first pass.

The current game already has stat training, scheduled drills, intensive training, physical-development history, recovery, equipment and persistent injuries. Build on those systems:

- let existing training choices support a small number of meaningful combat specializations/passives;
- specialize toward mobility, endurance, shield technique, heavy impact or weapon mastery;
- make each choice carry a clear opportunity cost, using existing training/equipment/progression structures;
- keep weight trade-offs and Strength-based weapon eligibility intact.

Do not add a second XP currency, a parallel skill tree, or random injury rolls on top of the current deterministic injury/recovery model. Revisit optional high-risk training only after the existing training/recovery loop has been audited and balanced.

## Implementation order

1. **Source/asset audit and pure rules:** map the duel resolver, action types, animation states, hit locations, supported skeletons, save shape and current hazard hooks. Write deterministic tests before scene wiring.
2. **Physical interaction vertical slice:** implement push/stagger and knockdown/recovery first. Add trip/throw/execution only as the shared state model proves stable.
3. **Hazard integration:** connect resolved displacement to existing arena hazards, then add one movable object archetype as a controlled experiment.
4. **Crowd objects and reactions:** introduce a single low-frequency crowd throw event with explicit telegraph/counterplay, then expand variety only after device performance review.
5. **Limb damage/dismemberment:** add anatomical hit state and one supported severable limb at a time; validate every supported model and graceful fallback.
6. **Boss encounter extensions:** use the existing phase/signature framework for one boss prototype before generalizing.
7. **Training specialization:** add the smallest passive choice set to the current training model after combat effects and balance are measurable.

These are dependency stages, not a promise to ship every feature in one change. Keep each implementation PR narrow, draft until CI and source review pass, and do not merge automatically.

## Technical and release constraints

- Preserve existing save compatibility; optional new fields must have safe defaults and round-trip tests.
- Keep pure combat calculations independent of React and Three.js.
- No hidden random damage, instant unavoidable crowd hits, or untelegraphed boss attacks.
- Avoid new large textures, complex shaders, extra always-on lights or high-count physics objects.
- Test normal fighters against boss-only mechanics, and test legacy saves without any new fields.
- CI is not visual or device acceptance. Record model/animation limitations and require Samsung S24 visual/gameplay review before treating new 3D effects as verified.
- APK signing and device installation remain paused until a worthwhile device-testing build is explicitly resumed.

## Existing implementation facts from the planning baseline

- `src/utils/injuryAppearance.ts` derives bruising/swelling from overall health and the current player injury; it is not anatomical damage.
- `src/components/3d/GladiatorMesh.tsx` already inspects a small set of named rig bones for physique scaling and attaches body-damage patches; model compatibility must be verified before severing.
- `src/utils/arenaHazards.ts` defines brazier, spiked-barrier and pit-trap effects. `DuelScene.tsx` currently checks the defender's proximity to a hazard during a power attack; this does not yet implement general physical displacement or throwable objects.
- `src/data/bossPhases.ts` already provides two phases for the four ladder bosses. Phase additions should extend this data-driven boundary.
- `src/utils/crowdDynamics.ts` already owns hype decay, emboldening, crowd turning, rewards and the Aurelius rage feed.
- `src/utils/physicalDevelopment.ts` and `src/utils/intensiveTraining.ts` already track training sessions and stat gains; this is the intended base for specializations.

