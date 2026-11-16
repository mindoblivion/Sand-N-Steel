# S8 — Spiked & Bladed wheels: the measured fit pass (report only, nothing admitted)

## Preflight

Branch `spiked-bladed-wheels` (from `colosseum-exterior-architecture`), HEAD `2e7dd67af9`.
`git status --short` clean at the start of the pass. Read before writing:
`src/utils/chariotGeometry.ts`, `src/data/chariotParts.ts`, `src/utils/chariotTeamFormation.ts`,
`src/utils/chariotMovement.ts`, `src/components/3d/ChariotPreview.tsx`,
`src/components/3d/RaceScene.tsx`, `src/components/dev/HorseChariotFitPrototype.tsx`, and the S8
section of `shops-and-completion.md` (§3) as quoted in the slice brief.

**Design rule of this slice: measurement-gated.** The catalogue may change only if the numbers pass.
They did not, so `src/data/chariotParts.ts` is byte-identical to its shipped state, the wheels slot
still sells exactly `wheels_standard` (0) and `wheels_reinforced` (450), and
`ChariotWheelVariantKey` still admits only `'standard' | 'reinforced'`.

## Method

Every number below is re-derived from the shipping asset
`public/_workspace_chariot_model_RomanChariot_WheelKit.glb`, not copied from a note:

1. the kit's four variant nodes are read vertex-by-vertex through their own node matrices (a small
   glTF reader in the suite, `src/utils/phaseS8WheelFit.test.ts` §A);
2. each variant is put through the **shipping** mount — `getChariotWheelPlacement`'s transform,
   generalised by exactly one bit, the per-side mirror;
3. three gates are read as numbers: tyre-to-ground penetration at ride height, hub/axle alignment
   against the shipping variants' own standard, and the `chariotTeamFormation` clearances re-run at
   each variant's own radius.

`src/utils/chariotWheelFit.ts` is the measuring module (dev-only: imported by
`components/dev/HorseChariotFitPrototype.tsx` and the suite alone). The **control** that the reader
and the arithmetic are right: the two shipping variants reproduce `getChariotWheelPlacement` to 12
decimal places, and the standard wheel reproduces the model's own authored −0.035 sink exactly.

## Measured numbers

| variant    | radius  | kit bottom | mounted tyre bottom | deeper than stock | tyre-to-ground | wheel-Z clearance (rule 0.100) | hub on axle |
|------------|---------|------------|---------------------|-------------------|----------------|--------------------------------|-------------|
| standard   | 0.6850  | +0.0650    | −0.0350             | 0.0000            | **−0.0350**    | 0.1000                         | exact       |
| reinforced | 0.7025  | +0.0475    | −0.0525             | −0.0175           | **−0.0525**    | 0.0825                         | exact       |
| spiked     | 0.7940  | −0.0440    | **−0.1440**         | **−0.1090**       | **−0.1440**    | **−0.0090**                    | exact       |
| bladed     | 1.0947  | −0.1429    | **−0.2429**         | **−0.2079**       | **−0.2429**    | **−0.3097**                    | exact       |

The withheld notes in `chariotGeometry.ts` carried `0.8025` / `0.8429` in parentheses as unmeasured
guesses. The asset says **0.7940 / 1.0947** — the spiked guess was close, the bladed one understated
the wheel by 0.25. The bladed wheel is 2.19 across: **60 % larger than the stock 1.37**, and it
reaches its tyre's lowest point 0.24 below the chariot's authored ground plane.

## Verdict — both variants fail, and the failure is geometric, not arithmetic

- **Tyre-to-ground (the brief's literal "≤ 0 = no penetration"): FAIL both.** Spiked buries 0.144,
  bladed 0.243. Neither is a rounding artefact: both are exactly the radius they add over the stock
  wheel, because nothing in the ship path derives ride height from a wheel (see below).
- **Against the standard set's own authored sink: FAIL both** (−0.109 / −0.208 deeper).
- **Hub/axle alignment: PASS both, exactly** (±0.70, 0.65, 0) — so the stop is not the mount, and the
  per-side mirror does not move a hub.
- **Team formation (`wheel-z-leading-edge`, limit 0.100): FAIL both, at every team size 2/3/4** —
  spiked −0.0090, bladed −0.3097. The row is not the wheel's clearance to the chassis; it is the
  *inner horse's* rearmost point against the wheel disc's leading edge, so a larger rim moves that
  edge forward into the horse. Every radius-independent row (pole, adjacent lanes, chariot body,
  wheel band) stays green.
- **The ground row** (`formation-ground`) passes for both, because it measures clearance to the
  chariot's own ground plane rather than penetration of it — read it with `tyre-ground`, never
  instead of it.

### The one nuance that matters for the decision

The **reinforced set that already ships** also sits red on the recomputed gate: 0.0825 against the
0.100 rule, 0.0175 deeper than standard. That is the fit discrepancy earlier phases recorded, not a
new defect — the formation rule is written against the *stock* wheel's leading edge, so any larger
rim consumes margin by construction. Spiked consumes **6×** the margin reinforced does, bladed
**12×**, and both additionally penetrate ground the reinforced set does not approach. So the gate is
diagnostic rather than binary: admitting either variant is a design decision about ride lift, hub
offset and the horse's rear envelope — three things this slice was not authorised to change.

## Why a data-only admission would not have changed the ride (traced, for the next slice)

Exactly two consumers of a wheel's radius exist, and neither is variant-aware: `ChariotPreview`
mounts a kit wheel hub-centred with no lift, and `chariotMovement.ts` owns **one** radius,
`CHARIOT_WHEEL_RADIUS = 0.685` (the stock wheel), which `advanceWheelRoll` divides distance by.
`RaceScene` mounts the stock `CHARIOT_MODEL_URL` and spins its own `Wheel_L`/`Wheel_R` nodes; it
never mounts the kit. An admission therefore would not have changed the preview's ride beyond the
sink measured above, but it would have under-rolled visibly the day the race learns to mount a kit —
the larger rim turning at r/0.685 of its true roll. The trace is pinned in suite §C.

## The bladed set's mirroring seam (built, measured, not admitted)

The bladed wheel's raked steel blades are **chirally asymmetric** — 2302 of its 2486 vertices have no
mirror twin about the wheel's mid-plane — so a pair mounted unmirrored reads as two left-hand wheels.
The mount therefore carries one bit: the right-hand wrapper gets `scale: [1, 1, −1]`.

It is the **Z** component, not X: three composes `T · R · S`, so a wrapper scale acts in the *child's*
(kit) frame before the yaw, and the kit wheel's disc lies in its own XY plane — its Z **is** the disc
normal, i.e. the axle direction after the yaw. A `scale.x = −1` mirror instead reflects across a
vertical diameter: still chiral, but it would leave the pair's blades in the *same* rake. Measured on
the real vertices: the mirrored side is the left side reflected through the chariot's centre plane
(every vertex has a left mate at (−x, y, z)), the blades' rake sign reverses while its magnitude is
preserved to 1e-6, and the same mount *without* the mirror keeps the left-hand rake. Nothing else
moves — same hub, same radius, same tyre bottom, same offset.

## What this slice changed

Dev-only, and nothing on a ship path:

| file | change |
|---|---|
| `src/utils/chariotWheelFit.ts` | new — the measuring module: variant specs, the mirrored mount, the gates, the report |
| `src/components/dev/HorseChariotFitPrototype.tsx` | wheel-set selector (`stock` / `standard` / `reinforced` / `spiked` / `bladed`) and the fit readout |
| `src/utils/phaseS8WheelFit.test.ts` | new — 21 tests pinning §A the fit, §B the mirror, §C the radius trace, §D report-only |

Untouched: `data/chariotParts.ts`, `chariotGeometry.ts`, `chariotMovement.ts`,
`chariotTeamFormation.ts`, `ChariotPreview.tsx`, `RaceScene.tsx`, `collisionShapes.ts`, the two
chariot GLBs, every save path.

## How to reproduce

```
bun test src/utils/phaseS8WheelFit.test.ts     # 21 pass, 217 expect()
```

The measuring surface: `?devHarness=horsefit` in a dev build (mounts *instead of* the game, reads and
writes no save), then choose a wheel set in the panel; the panel prints the same numbers as the table
above.

## Removal

Delete `src/utils/chariotWheelFit.ts`, `src/utils/phaseS8WheelFit.test.ts`, this file, and the S8
parts of `HorseChariotFitPrototype.tsx` (the `FitWheel` type, `WHEEL_OPTIONS`, the kit wheel mount
and the readout panel). Nothing else references them.

## Still open

- **The rendered look / Android acceptance is PENDING**, as for every chariot phase: the sandbox has
  no GPU (the city hub runs at ~2 fps through SwiftShader), so a spiked/bladed pair — and in
  particular whether the mirrored blades read correctly side by side — has not been seen rendered.
- No admission design was attempted. Making either variant shippable would need, at minimum, a ride
  lift or hub drop of exactly the measured penetration (0.1090 / 0.2079 relative to the standard set),
  a decision on the horse's rear envelope for the wheel-Z row, and a variant-aware roll radius before
  the race mounts a kit.
