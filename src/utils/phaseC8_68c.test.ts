/**
 * Phase C-8.68C — the disposable horse ↔ chariot fit prototype.
 *
 * This suite covers the prototype's own numbers and its dev-only isolation.  It
 * does NOT restate the C-8.67D formation plan (that suite owns it) and it does not
 * assert anything about appearance: successful asset loading is not visual
 * acceptance, and the prototype exists precisely because that judgement is not
 * automatable here.
 *
 *   1. §A  the asset — byte-identical, the audited rig and clips, and the
 *          proportions re-derived from its own buffer rather than restated;
 *          including the measurement that makes the clips non-gaits.
 *   2. §B  the orientation conversion (horse +X → chariot −Z) and the placement
 *          arithmetic it feeds.
 *   3. §C  the C-8.68B scale hypothesis: where the withers lands, where the
 *          hooves stand, and every C-8.67D rule applied to the MEASURED horse.
 *   4. §D  the controls — what the same readout says at scales the hypothesis is
 *          not, so the checks are shown to be sensitive rather than constant.
 *   5. §E  the reference guides, whose whole job is to make scale legible.
 *   6. §F  scope: the module is numbers-only, the harness is dev-only, and no
 *          formation constant moved.
 *
 * The suite reads the shipped sources as text and parses the GLB with
 * `@gltf-transform/core` (the library the repo's other asset suites use).  It
 * never writes a file, never touches storage, never reads the player's save and
 * never mutates an asset.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

import {
  CHARIOT_FORWARD_AXIS,
  CHARIOT_GROUND_Y,
  CHARIOT_POLE_HALF_WIDTH,
  CHARIOT_POLE_TIP_Z,
  CHARIOT_TYRE_BOTTOM_Y,
  CHARIOT_WHEEL_HUB_X,
  CHARIOT_WHEEL_HUB_Y,
  CHARIOT_WHEEL_LEADING_Z,
  CHARIOT_WHEEL_RIM_INNER_X,
  CHARIOT_WIDEST_X,
  CHARIOT_YOKE_LINE_Z,
  CHARIOT_YOKE_UNDERSIDE_Y,
  HORSE_ENVELOPE,
  HORSE_REAR_CLEARANCE,
  HORSE_STATION_Z,
  INNER_LANE_X,
  LANE_PITCH,
  getTeamClearanceReport,
  getTeamWidth,
} from './chariotTeamFormation';

import {
  BESIDE_STAGING_X,
  BESIDE_STAGING_Z,
  CHARIOT_FORWARD,
  HORSE_FIT_ASSET_BYTES,
  HORSE_FIT_ASSET_SHA256,
  HORSE_FIT_ASSET_URL,
  HORSE_FIT_MEASURED,
  HORSE_FIT_ROTATION_Y,
  HORSE_FIT_SCALE,
  HORSE_FIT_SCALE_MAX,
  HORSE_FIT_SCALE_MIN,
  HORSE_FIT_SCALE_PRESETS,
  HORSE_NOSE_AHEAD_OF_WITHERS,
  HORSE_RUMP_BEHIND_WITHERS,
  HORSE_TAIL_TIP_BEHIND_WITHERS,
  POLE_BASE_Y,
  POLE_BASE_Z,
  WHEEL_RADIUS,
  clampFitScale,
  getChariotGuideSegments,
  getGuideCircles,
  getHorseFitPlacement,
  getHorseFitReadout,
  getHorseGuideSegments,
} from './horseFitPrototype';

// ── sources and the asset ──────────────────────────────────────────────────

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const repo = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const code = (rel: string) => readFileSync(here(rel), 'utf8');

// The path is DERIVED from the module's own URL constant rather than restated, so this
// suite never becomes a second place that names a horse asset — C-8.67D §G sweeps `src/`
// for exactly that, and its allowance for this phase is the prototype's own files.
const HORSE_GLB = repo(`public${HORSE_FIT_ASSET_URL}`);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Doc = any;

let cached: Promise<Doc> | null = null;
const horseDoc = (): Promise<Doc> =>
  (cached ??= io.readBinary(new Uint8Array(readFileSync(HORSE_GLB))));

const LEG_JOINT = /shoulder|forearm|fcannon|fpastern|fhoof|thigh|gaskin|hcannon|hpastern|hhoof/;

/** Per-mesh accessor bounds, triangle count and skin flag for the horse. */
async function horseMeshes() {
  const doc = await horseDoc();
  const rows: Array<{
    node: string;
    mesh: string;
    verts: number;
    tris: number;
    skinned: boolean;
    min: number[];
    max: number[];
  }> = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let verts = 0;
    let tris = 0;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const arr = pos.getArray();
      const stride = pos.getElementSize();
      for (let i = 0; i < pos.getCount(); i++) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], arr[i * stride + k]);
          max[k] = Math.max(max[k], arr[i * stride + k]);
        }
      }
      verts += pos.getCount();
      tris += (prim.getIndices()?.getCount() ?? 0) / 3;
    }
    rows.push({
      node: node.getName(),
      mesh: mesh.getName(),
      verts,
      tris,
      skinned: !!node.getSkin(),
      min,
      max,
    });
  }
  return rows;
}

const round = (v: number, dp: number) => Number(v.toFixed(dp));

// ── §A — the asset ─────────────────────────────────────────────────────────

describe('C-8.68C §A — the asset: byte-identical, and its proportions re-derived', () => {
  test('the file is byte-for-byte the one C-8.68A audited, and was not modified', () => {
    const bytes = readFileSync(HORSE_GLB);
    expect(bytes.byteLength).toBe(HORSE_FIT_ASSET_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(HORSE_FIT_ASSET_SHA256);
    // The module states the same two facts it is pinned to.
    expect(HORSE_FIT_ASSET_BYTES).toBe(15_248_136);
    expect(HORSE_FIT_ASSET_URL).toBe('/_workspace_dist_horse_weak.glb');
    // …and it is the untacked candidate C-8.68B recommended.
    expect(HORSE_FIT_ASSET_URL).toContain('weak');
  });

  test('the audited rig, the three clips and the three materials are still there', async () => {
    const root = (await horseDoc()).getRoot();
    const skins = root.listSkins();
    expect(skins.length).toBe(1);
    expect(skins[0].listJoints().length).toBe(HORSE_FIT_MEASURED.joints);
    expect(skins[0].listJoints().length).toBe(31);
    const animations = root.listAnimations();
    expect(animations.map((a: Doc) => a.getName()).sort()).toEqual(['Gallop', 'Idle', 'Walk']);
    // The audited durations, to 1e-4 (the clip grid: 0.7083 / 4.0417 / 1.0417 s).
    const expected: Record<string, number> = { Gallop: 0.7083, Idle: 4.0417, Walk: 1.0417 };
    for (const animation of animations) {
      let last = 0;
      for (const channel of animation.listChannels()) {
        const times = channel.getSampler().getInput().getArray();
        last = Math.max(last, times[times.length - 1]);
      }
      expect(round(last, 4)).toBe(expected[animation.getName()]);
    }
    expect(root.listMaterials().map((m: Doc) => m.getName()).sort()).toEqual([
      'Coat_weak',
      'Eye_weak',
      'Hair_weak',
    ]);
  });

  test('every mesh node is untransformed, so accessor bounds ARE the rendered bounds', async () => {
    // This is why §A can read the buffers directly instead of composing a node chain:
    // the seven mesh-carrying nodes carry identity transforms and no children.
    const doc = await horseDoc();
    const meshNodes = doc.getRoot().listNodes().filter((n: Doc) => n.getMesh());
    expect(meshNodes.length).toBe(7);
    for (const node of meshNodes) {
      const [x, y, z, w] = node.getRotation();
      expect(Math.abs(x) + Math.abs(y) + Math.abs(z)).toBeLessThan(1e-7);
      expect(node.getTranslation()).toEqual([0, 0, 0]);
      expect(node.getScale()).toEqual([1, 1, 1]);
      expect(node.listChildren().length).toBe(0);
      expect(w).toBe(1);
    }
  });

  test('the measured proportions are re-derived from the buffer, not restated', async () => {
    const rows = await horseMeshes();
    const coat = rows.find((r) => r.mesh === 'Horse_weak')!;
    const mane = rows.find((r) => r.mesh === 'Mane')!;
    const tail = rows.find((r) => r.mesh === 'Tail')!;
    const feathers = rows.find((r) => r.mesh === 'Feathers')!;
    const barrelHalf = Math.max(-coat.min[2], coat.max[2]);
    const maneHalf = Math.max(-mane.min[2], mane.max[2]);

    // Hoof plane, nose, rump, ear tip and the two widest half-widths — the C-8.68A
    // figures, each re-measured here rather than copied.
    expect(Math.abs(coat.min[1])).toBeLessThan(1e-5);
    expect(round(coat.max[0], 4)).toBe(HORSE_FIT_MEASURED.noseX);
    expect(round(coat.min[0], 4)).toBe(HORSE_FIT_MEASURED.rumpX);
    expect(round(coat.max[1], 4)).toBe(HORSE_FIT_MEASURED.earTipY);
    // Compared at the precision the module's constants are written to (5 dp): at 4 dp a
    // value that sits exactly on a rounding boundary (0.34965) would round away from the
    // measurement it came from, which is a test artefact rather than a disagreement.
    expect(round(barrelHalf, 5)).toBe(HORSE_FIT_MEASURED.barrelHalfWidth);
    expect(round(maneHalf, 5)).toBe(HORSE_FIT_MEASURED.maneHalfWidth);
    // The mane is the widest part of the animal, over the withers where the yoke sits.
    expect(maneHalf).toBeGreaterThan(barrelHalf);
    // The tail tip is the rearmost point, and the tail is the only geometry below the
    // hoof plane — Feathers (the fetlock feathering) sits above it.
    expect(round(tail.min[0], 4)).toBe(HORSE_FIT_MEASURED.tailTipX);
    expect(round(tail.min[0], 4)).toBe(round(coat.min[0], 4) - 0.1996);
    expect(tail.min[1]).toBeLessThan(0);
    expect(feathers.min[1]).toBeGreaterThanOrEqual(0);
    // Every mesh the harness draws is skinned — it really carries a skeleton.
    expect(rows.every((r) => r.skinned)).toBe(true);
    expect(rows.map((r) => r.mesh).sort()).toEqual([
      'Eye_L',
      'Eye_R',
      'Feathers',
      'Forelock',
      'Horse_weak',
      'Mane',
      'Tail',
    ]);
  });

  test('the withers are re-measured over the audited x-window, at the audited height', async () => {
    const doc = await horseDoc();
    const coatMesh = doc.getRoot().listMeshes().find((m: Doc) => m.getName() === 'Horse_weak');
    const pos = coatMesh.listPrimitives()[0].getAttribute('POSITION');
    const arr = pos.getArray();
    const stride = pos.getElementSize();
    let withers = { y: -Infinity, x: 0 };
    let croup = -Infinity;
    for (let i = 0; i < pos.getCount(); i++) {
      const x = arr[i * stride];
      const y = arr[i * stride + 1];
      if (x >= 0.15 && x <= 0.45 && y > withers.y) withers = { y, x };
      if (x >= -0.8 && x <= -0.5) croup = Math.max(croup, y);
    }
    expect(round(withers.y, 4)).toBe(HORSE_FIT_MEASURED.withersY);
    expect(withers.y).toBe(1.6907036304473877);
    expect(round(withers.x, 5)).toBe(round(HORSE_FIT_MEASURED.withersX, 5));
    expect(withers.x).toBe(0.4259848892688751);
    expect(round(croup, 4)).toBe(HORSE_FIT_MEASURED.croupY);
    // …and the three withers-relative lengths the placement is built from.
    expect(round(HORSE_NOSE_AHEAD_OF_WITHERS, 5)).toBe(round(1.9946 - withers.x, 5));
    expect(round(HORSE_RUMP_BEHIND_WITHERS, 5)).toBe(round(withers.x + 1.0443, 5));
    expect(round(HORSE_TAIL_TIP_BEHIND_WITHERS, 5)).toBe(round(withers.x + 1.2439, 5));
  });

  test('the shipped clips still do not animate the legs — measured, not asserted', async () => {
    const root = (await horseDoc()).getRoot();
    /** The largest rotation any leg joint moves through, in degrees. */
    const legSpan = (animation: Doc) => {
      let worst = 0;
      for (const channel of animation.listChannels()) {
        const node = channel.getTargetNode();
        if (channel.getTargetPath() !== 'rotation' || !node || !LEG_JOINT.test(node.getName())) {
          continue;
        }
        const out = channel.getSampler().getOutput().getArray();
        const [qx, qy, qz, qw] = [out[0], out[1], out[2], out[3]];
        for (let i = 0; i < out.length; i += 4) {
          const dot = Math.abs(out[i] * qx + out[i + 1] * qy + out[i + 2] * qz + out[i + 3] * qw);
          worst = Math.max(worst, (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI);
        }
      }
      return worst;
    };
    const byName = new Map(root.listAnimations().map((a: Doc) => [a.getName(), a]));
    // The two clips that LOOK like gaits move no leg joint at all.
    expect(legSpan(byName.get('Walk'))).toBeLessThan(0.5);
    expect(legSpan(byName.get('Gallop'))).toBeLessThan(0.5);
    // `Idle` is the only clip that touches the legs, and only just — so the readout is
    // shown to be sensitive to the thing it measures rather than blind to all motion.
    expect(legSpan(byName.get('Idle'))).toBeGreaterThan(1);
    expect(legSpan(byName.get('Idle'))).toBeLessThan(5);
  });
});

// ── §B — orientation and placement ─────────────────────────────────────────

describe('C-8.68C §B — the orientation conversion and the placement it feeds', () => {
  /** Ry(θ) applied to a vector, the way three.js composes it. */
  const yaw = (angle: number, v: [number, number, number]): [number, number, number] => [
    v[0] * Math.cos(angle) + v[2] * Math.sin(angle),
    v[1],
    -v[0] * Math.sin(angle) + v[2] * Math.cos(angle),
  ];

  test('+90° about Y maps the horse’s forward (+X) onto the chariot’s forward (−Z)', () => {
    expect(HORSE_FIT_MEASURED.forwardAxis).toBe('+X');
    expect(CHARIOT_FORWARD_AXIS).toBe('-Z');
    expect(CHARIOT_FORWARD).toBe('-Z');
    expect(HORSE_FIT_ROTATION_Y).toBe(Math.PI / 2);
    const forward = yaw(HORSE_FIT_ROTATION_Y, [1, 0, 0]).map((v) => round(v, 12));
    expect(forward).toEqual([0, 0, -1]);
    // The mirror image of the error: −90° would face the horse +Z, up the pole.
    expect(round(yaw(-HORSE_FIT_ROTATION_Y, [1, 0, 0])[2], 12)).toBe(1);
    // Up stays up, and the horse's lateral axis becomes the world's X.
    expect(yaw(HORSE_FIT_ROTATION_Y, [0, 1, 0])).toEqual([0, 1, 0]);
    expect(round(yaw(HORSE_FIT_ROTATION_Y, [0, 0, 1])[0], 12)).toBe(1);
  });

  test('the nose really is at +X in the buffer, so the yaw points it forward', async () => {
    const rows = await horseMeshes();
    const coat = rows.find((r) => r.mesh === 'Horse_weak')!;
    const tail = rows.find((r) => r.mesh === 'Tail')!;
    expect(coat.max[0]).toBeGreaterThan(0);
    expect(tail.max[0]).toBeLessThan(0);
    const readout = getHorseFitReadout(HORSE_FIT_SCALE);
    // After the yaw the head is at NEGATIVE Z — ahead of the yoke line, as a draught
    // horse's should be — and the tail behind it.
    expect(readout.noseZ).toBeLessThan(HORSE_STATION_Z);
    expect(readout.tailTipZ).toBeGreaterThan(HORSE_STATION_Z);
    // The head reaches past the draught pole's own tip: a real measured fact of this
    // arrangement, not a defect — the pole ends behind the horses' heads.
    expect(readout.noseZ).toBeLessThan(CHARIOT_POLE_TIP_Z);
    // Both the rump and the tail tip stay FORWARD of the plan's rear limit (−0.785),
    // which is to say more negative in Z — the direction the wheel rule requires.
    expect(readout.rumpZ).toBeLessThan(HORSE_ENVELOPE.maxRearZ);
    expect(readout.tailTipZ).toBeLessThan(HORSE_ENVELOPE.maxRearZ);
  });

  test('the anchor (the ground point under the withers) lands ON the station line', () => {
    const placement = getHorseFitPlacement(HORSE_FIT_SCALE);
    // The lane's centre line, the yoke line, and the chariot's own ground plane.
    expect(placement.withers[0]).toBe(INNER_LANE_X);
    expect(placement.withers[2]).toBe(HORSE_STATION_Z);
    expect(placement.position[1]).toBe(CHARIOT_GROUND_Y);
    // The group origin is exactly one yawed withers-offset behind the anchor.
    expect(placement.position[2]).toBeCloseTo(
      HORSE_STATION_Z + HORSE_FIT_MEASURED.withersX * HORSE_FIT_SCALE,
      12
    );
    expect(placement.rotationY).toBe(HORSE_FIT_ROTATION_Y);
    expect(placement.scale).toBe(HORSE_FIT_SCALE);
    // A left-hand lane mirrors in X only; the station and the ground do not move.
    const left = getHorseFitPlacement(HORSE_FIT_SCALE, -INNER_LANE_X);
    expect(left.position[0]).toBe(-placement.position[0]);
    expect(left.position[1]).toBe(placement.position[1]);
    expect(left.position[2]).toBe(placement.position[2]);
  });
});

// ── §C — the scale hypothesis ──────────────────────────────────────────────

describe('C-8.68C §C — the C-8.68B scale, applied to the measured animal', () => {
  const readout = getHorseFitReadout(HORSE_FIT_SCALE);

  test('the scale is the yoke underside over the measured withers height', () => {
    expect(HORSE_FIT_SCALE).toBeCloseTo(CHARIOT_YOKE_UNDERSIDE_Y / 1.6907, 12);
    expect(round(HORSE_FIT_SCALE, 4)).toBe(0.553);
    expect(HORSE_FIT_SCALE).toBeGreaterThan(HORSE_FIT_SCALE_MIN);
    expect(HORSE_FIT_SCALE).toBeLessThan(HORSE_FIT_SCALE_MAX);
    expect(HORSE_FIT_SCALE_PRESETS[0].scale).toBe(HORSE_FIT_SCALE);
  });

  test('the withers land exactly on the yoke bar’s underside', () => {
    expect(readout.withersY).toBeCloseTo(CHARIOT_YOKE_UNDERSIDE_Y, 12);
    expect(Math.abs(readout.yokeSeat)).toBeLessThan(1e-12);
    // Which is the point of the scale: the bar rests on the withers, not above them.
    expect(readout.rules.find((r) => r.id === 'yoke-seat')!.ok).toBe(true);
  });

  test('the hooves stand on the chariot’s ground plane, and the mane fits the envelope', () => {
    expect(CHARIOT_GROUND_Y - CHARIOT_TYRE_BOTTOM_Y).toBeGreaterThan(0);
    expect(round(WHEEL_RADIUS, 3)).toBe(0.685);
    expect(readout.maneHalfWidth).toBeLessThan(HORSE_ENVELOPE.barrelHalfWidth);
    expect(readout.maneHalfWidth).toBeGreaterThan(readout.barrelHalfWidth);
    expect(round(readout.maneHalfWidth, 4)).toBe(0.2491);
    expect(round(readout.barrelHalfWidth, 4)).toBe(0.1934);
  });

  test('every C-8.67D rule passes at this scale, with the measured numbers', () => {
    expect(readout.ok).toBe(true);
    expect(readout.rules.map((r) => r.id)).toEqual([
      'yoke-seat',
      'pole',
      'adjacent-lanes-manes',
      'wheel-z-leading-edge',
      'ground',
    ]);
    expect(round(readout.poleClearance, 4)).toBe(0.2576);
    expect(round(readout.laneAirBarrels, 4)).toBe(0.3333);
    expect(round(readout.laneAirManes, 4)).toBe(0.2217);
    expect(round(readout.rearClearance, 4)).toBe(0.4115);
    expect(round(readout.rumpZ, 4)).toBe(-1.2069);
    expect(round(readout.tailTipZ, 4)).toBe(-1.0965);
    // The plan's own report agrees: the envelope-sized Biga passes too, so the two
    // statements are consistent rather than different measurements.
    const plan = getTeamClearanceReport(2);
    expect(plan.ok).toBe(true);
    expect(plan.clearances.every((c) => c.ok)).toBe(true);
  });

  test('the wheel-Z rule is load-bearing here, not decorative', () => {
    // An inner lane's barrel genuinely reaches inside the wheel disc's own X band…
    expect(readout.wheelBandOverlap).toBe(true);
    expect(INNER_LANE_X + readout.barrelHalfWidth).toBeGreaterThan(CHARIOT_WHEEL_RIM_INNER_X);
    // …which is exactly why the rearmost point has to stay forward of the wheel.
    expect(readout.rearClearance).toBeGreaterThanOrEqual(HORSE_REAR_CLEARANCE);
    expect(HORSE_REAR_CLEARANCE).toBe(0.1);
    expect(CHARIOT_WHEEL_LEADING_Z).toBe(-0.685);
  });

  test('the measured Biga is narrower than the plan’s envelope and than the chariot', () => {
    expect(round(readout.teamWidth, 4)).toBe(1.3867);
    expect(readout.planTeamWidth).toBe(getTeamWidth(2));
    expect(round(readout.planTeamWidth, 4)).toBe(1.5);
    expect(readout.teamWidth).toBeLessThan(readout.planTeamWidth);
    expect(readout.planTeamWidth).toBeLessThan(2 * CHARIOT_WIDEST_X);
    expect(2 * CHARIOT_WIDEST_X).toBeCloseTo(1.536, 12);
  });

  test('the pony read is recorded as a number, not as a claim', () => {
    // The cost C-8.68B attached to Alternative A: the horse stands shorter than the
    // chariot's own wheels.  This suite pins the measurement; whether it is acceptable
    // is a device judgement, and that judgement is NOT made here.
    expect(round(readout.earTipY, 4)).toBe(1.2414);
    const wheelTop = CHARIOT_WHEEL_HUB_Y + WHEEL_RADIUS;
    expect(round(wheelTop, 4)).toBe(1.335);
    expect(readout.earTipY).toBeLessThan(wheelTop);
    expect(round(wheelTop - readout.earTipY, 4)).toBe(0.0936);
  });
});

// ── §D — controls ──────────────────────────────────────────────────────────

describe('C-8.68C §D — the readout is sensitive to the scale it is given', () => {
  test('an unscaled horse fails exactly the rules C-8.68B predicted', () => {
    const unscaled = getHorseFitReadout(1);
    expect(unscaled.ok).toBe(false);
    expect(unscaled.rules.filter((r) => !r.ok).map((r) => r.id)).toEqual([
      'yoke-seat',
      'adjacent-lanes-manes',
      'wheel-z-leading-edge',
    ]);
    expect(round(unscaled.yokeSeat, 4)).toBe(0.7557);
    expect(round(unscaled.rearClearance, 4)).toBe(-0.3349);
    // The manes interpenetrate — the measured −0.181 of the C-8.68B report.
    expect(round(unscaled.laneAirManes, 4)).toBe(-0.181);
    // …while the pole rule still passes, by 0.00135.  Reported, not rounded away.
    expect(round(unscaled.poleClearance, 5)).toBe(0.10135);
  });

  test('at the C-8.68B split (0.80) the tail is exactly on the wheel’s leading edge', () => {
    const split = getHorseFitReadout(0.8);
    expect(split.ok).toBe(false);
    expect(round(split.rearClearance, 4)).toBe(-0.0009);
    expect(Math.abs(split.rearClearance)).toBeLessThan(2e-3);
    expect(round(split.yokeSeat, 4)).toBe(0.4176);
  });

  test('the presets span the hypothesis and both alternatives, and only A passes', () => {
    expect(HORSE_FIT_SCALE_PRESETS.map((p) => p.id)).toEqual(['A', 'C', 'B']);
    expect(HORSE_FIT_SCALE_PRESETS.map((p) => round(p.scale, 4))).toEqual([0.553, 0.8, 1]);
    expect(getHorseFitReadout(HORSE_FIT_SCALE_PRESETS[0].scale).ok).toBe(true);
    expect(getHorseFitReadout(HORSE_FIT_SCALE_PRESETS[1].scale).ok).toBe(false);
    expect(getHorseFitReadout(HORSE_FIT_SCALE_PRESETS[2].scale).ok).toBe(false);
  });

  test('the diagnostic scale is clamped, and a non-finite value falls back', () => {
    expect(clampFitScale(0)).toBe(HORSE_FIT_SCALE_MIN);
    expect(clampFitScale(-5)).toBe(HORSE_FIT_SCALE_MIN);
    expect(clampFitScale(9)).toBe(HORSE_FIT_SCALE_MAX);
    expect(clampFitScale(Number.NaN)).toBe(HORSE_FIT_SCALE);
    expect(clampFitScale(Number.POSITIVE_INFINITY)).toBe(HORSE_FIT_SCALE);
    // The clamp is applied by the readout and the placement alike.
    expect(getHorseFitReadout(9).scale).toBe(HORSE_FIT_SCALE_MAX);
    expect(getHorseFitPlacement(-1).scale).toBe(HORSE_FIT_SCALE_MIN);
  });

  test('the diagnostic staging lane is outside every formation lane', () => {
    expect(round(BESIDE_STAGING_X, 4)).toBe(1.748);
    expect(BESIDE_STAGING_X).toBeGreaterThan(CHARIOT_WIDEST_X);
    expect(BESIDE_STAGING_X).toBeGreaterThan(INNER_LANE_X + LANE_PITCH);
    // It is behind the chariot's own rear-most point, so the two silhouettes do not
    // hide one another in the fixed side view.
    expect(BESIDE_STAGING_Z).toBeGreaterThan(0.685);
  });
});

// ── §E — the guides ────────────────────────────────────────────────────────

describe('C-8.68C §E — the reference guides', () => {
  const chariotGuides = getChariotGuideSegments();
  const circles = getGuideCircles();

  test('wheel radius, yoke height, draught pole and ground plane all have a guide', () => {
    const ids = chariotGuides.map((g) => g.id);
    expect(ids).toContain('wheel-leading-edge');
    expect(ids).toContain('yoke-underside');
    expect(ids).toContain('yoke-top');
    expect(ids).toContain('draught-pole');
    expect(ids).toContain('ground-plane-x');
    expect(ids).toContain('ground-plane-z');
    expect(circles.map((c) => c.id)).toEqual(['wheel-radius-left', 'wheel-radius-right']);
    // Ids are unique across the whole guide set, so the legend cannot lie.
    expect(new Set(ids).size).toBe(ids.length);
    for (const guide of [...chariotGuides, ...getHorseGuideSegments(HORSE_FIT_SCALE)]) {
      expect([...guide.from, ...guide.to].every((v) => Number.isFinite(v))).toBe(true);
    }
  });

  test('the wheel circles are the chariot’s own wheels, not a nominal radius', () => {
    expect(round(WHEEL_RADIUS, 3)).toBe(0.685);
    expect(WHEEL_RADIUS).toBe(CHARIOT_WHEEL_HUB_Y - CHARIOT_TYRE_BOTTOM_Y);
    for (const circle of circles) {
      expect(circle.radius).toBe(WHEEL_RADIUS);
      expect(Math.abs(circle.centre[0])).toBe(CHARIOT_WHEEL_HUB_X);
      expect(circle.centre[1]).toBe(CHARIOT_WHEEL_HUB_Y);
      expect(circle.centre[2]).toBe(0);
      expect(circle.plane).toBe('yz');
    }
    // The circle's top IS the model's tallest point, and its bottom the tyres' low point.
    expect(round(CHARIOT_WHEEL_HUB_Y + WHEEL_RADIUS, 3)).toBe(1.335);
    expect(round(CHARIOT_WHEEL_HUB_Y - WHEEL_RADIUS, 4)).toBe(CHARIOT_TYRE_BOTTOM_Y);
  });

  test('the pole guide follows the measured pole', () => {
    const pole = chariotGuides.find((g) => g.id === 'draught-pole')!;
    expect(pole.from).toEqual([0, POLE_BASE_Y, POLE_BASE_Z]);
    expect(round(pole.from[1], 3)).toBe(0.671);
    expect(pole.to[2]).toBe(CHARIOT_POLE_TIP_Z);
    // Its tip sits 0.094 above the yoke's underside — the measured pole geometry,
    // kept inside the formation module's own constants.
    expect(round(pole.to[1], 3)).toBe(1.029);
    expect(round(pole.to[1] - CHARIOT_YOKE_UNDERSIDE_Y, 3)).toBe(0.094);
    // …and the pole's own half-width and tip are the module's, not restated here.
    expect(round(CHARIOT_POLE_HALF_WIDTH, 3)).toBe(0.049);
    expect(round(CHARIOT_POLE_TIP_Z, 3)).toBe(-2.107);
  });

  test('the withers guide and the yoke guide coincide at A — and only at A', () => {
    const yoke = chariotGuides.find((g) => g.id === 'yoke-underside')!;
    const withersAtA = getHorseGuideSegments(HORSE_FIT_SCALE)[0];
    expect(withersAtA.id).toBe('horse-withers-plane');
    expect(withersAtA.from[1]).toBeCloseTo(yoke.from[1], 12);
    expect(yoke.from[1]).toBe(CHARIOT_YOKE_UNDERSIDE_Y);
    expect(yoke.from[2]).toBe(CHARIOT_YOKE_LINE_Z);
    // At any other scale they differ by exactly the yoke seat — this is the
    // coincidence the prototype exists to show, and it is the scale's doing.
    const withersAtOne = getHorseGuideSegments(1)[0];
    expect(round(withersAtOne.from[1] - yoke.from[1], 4)).toBe(0.7557);
    expect(round(withersAtOne.from[1] - yoke.from[1], 6)).toBe(
      round(getHorseFitReadout(1).yokeSeat, 6)
    );
  });

  test('the horse guides mark the station, the withers and the rearmost point', () => {
    const guides = getHorseGuideSegments(HORSE_FIT_SCALE);
    expect(guides.map((g) => g.id)).toEqual([
      'horse-withers-plane',
      'horse-withers-post',
      'horse-rear-plane',
    ]);
    const [plane, post, rear] = guides;
    const readout = getHorseFitReadout(HORSE_FIT_SCALE);
    // The plane runs from the tail tip forward to the nose, at the withers' height.
    expect(plane.from[2]).toBe(readout.tailTipZ);
    expect(plane.to[2]).toBe(readout.noseZ);
    expect(plane.from[0]).toBe(INNER_LANE_X);
    // The post is the withers' own height above the ground plane.
    expect(post.from[1]).toBe(CHARIOT_GROUND_Y);
    expect(post.to[1]).toBeCloseTo(readout.withersY, 12);
    // The rear plane is the rearmost point the wheel rule measures from.
    expect(rear.from[2]).toBe(readout.tailTipZ);
    expect(rear.to[0] - rear.from[0]).toBeCloseTo(2 * readout.barrelHalfWidth, 12);
  });

  test('the guides are LINES, and nothing in the prototype implies a harness', () => {
    // The phase's rule: temporary markers must be unmistakably diagnostic.  The module
    // therefore carries no fitting, no strap and no claim of readiness — only colour-coded
    // line/circle geometry, drawn over the model.
    const moduleText = code('./horseFitPrototype.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const forbidden of ['hame', 'girth', 'traceStaple', 'yokePad', 'raceReady', 'harnessMesh']) {
      expect(moduleText).not.toContain(forbidden);
    }
    for (const guide of [...getChariotGuideSegments(), ...getHorseGuideSegments(HORSE_FIT_SCALE)]) {
      expect(guide).not.toHaveProperty('mesh');
      expect(guide.colour).toMatch(/^#[0-9a-f]{6}$/i);
      expect(guide.from.length).toBe(3);
      expect(guide.to.length).toBe(3);
    }
    // Distinct guide colours, so the legend is unambiguous on screen.
    expect(new Set(getChariotGuideSegments().map((g) => g.colour)).size).toBeGreaterThanOrEqual(4);
  });
});

// ── §F — scope and dev-only isolation ──────────────────────────────────────

describe('C-8.68C §F — scope: numbers only, dev only, nothing moved', () => {
  const MODULE = code('./horseFitPrototype.ts');
  const MODULE_CODE = MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const HARNESS = code('../components/dev/HorseChariotFitPrototype.tsx');

  test('the prototype module is numbers only and imports the plan and nothing else', () => {
    const imports = MODULE.match(/from '[^']+'/g)?.sort();
    expect(imports).toEqual(["from './chariotTeamFormation'"]);
    const codeOnly = MODULE_CODE.replace(/^\s*import[\s\S]*?from '[^']+';\s*$/gm, '');
    for (const forbidden of [
      '@react-three',
      'react',
      'three',
      'localStorage',
      'sessionStorage',
      'saveProfile',
      'PROFILE_STORAGE_KEY',
      'chariotParts',
      'chariotGeometry',
      'racingProgression',
      'useGLTF',
      'useFrame',
      'fetch(',
      'XMLHttpRequest',
      '<mesh',
      'shader',
      'Material',
      'Geometry',
    ]) {
      expect(codeOnly).not.toContain(forbidden);
    }
  });

  test('the harness is DEV-gated, dynamically imported, and cannot reach a real save', () => {
    expect(HARNESS).toContain('import.meta.env.DEV');
    for (const forbidden of [
      'saveProfile',
      'loadSavedProfile',
      'PROFILE_STORAGE_KEY',
      'localStorage',
      'sessionStorage',
    ]) {
      expect(HARNESS).not.toContain(forbidden);
    }
    // It only ever reads the assets through drei's cache — no writer, no fetch of its own.
    expect(HARNESS).toContain('useGLTF(HORSE_FIT_ASSET_URL)');
    expect(HARNESS).toContain('useGLTF(CHARIOT_MODEL_URL)');
  });

  test('main.tsx mounts it only behind its own exact token, as the last branch before the app', () => {
    const main = code('../main.tsx');
    expect(main).toContain("get('devHarness') === 'horsefit'");
    expect(main).toContain("readDevHarnessFlag() === 'horsefit'");
    expect(main).toContain("import('./components/dev/HorseChariotFitPrototype')");
    expect(main.split("import('./components/dev/HorseChariotFitPrototype')").length).toBe(2);
    expect(/^import\s[^\n]*components\/dev/m.test(main)).toBe(false);
    const fitIf = main.indexOf('} else if (useHorseFitHarness) {');
    const appElse = main.indexOf('} else {');
    expect(fitIf).toBeGreaterThan(-1);
    expect(appElse).toBeGreaterThan(fitIf);
    expect(main.slice(appElse)).toContain('<App />');
    // The other three gates survive — this is an addition, not a replacement.
    for (const token of ['character', 'chariot', 'racing']) {
      expect(main).toContain(`get('devHarness') === '${token}'`);
    }
  });

  test('no shipping screen, scene or service names the prototype', () => {
    const production = [
      '../App.tsx',
      '../components/3d/city/CityHubScene.tsx',
      '../components/hub/GearTab.tsx',
      '../components/duel/DuelScene.tsx',
      '../utils/preloadAssets.ts',
      '../utils/cityCollisions.ts',
      '../utils/collisionShapes.ts',
    ];
    for (const file of production) {
      const text = code(file);
      expect(text).not.toContain('HorseChariotFitPrototype');
      expect(text).not.toContain('horseFitPrototype');
      expect(text).not.toContain('HORSE_FIT_ASSET_URL');
    }
    // The asset is not preloaded: it is not in the core registry, so its 15.2 MB never
    // joins a startup payload, and nothing horse-shaped is named there at all.
    expect(code('../utils/preloadAssets.ts')).not.toContain('horse');
  });

  test('the prototype has not consumed or altered a single formation constant', () => {
    // Every one of these belongs to C-8.67D and is used here, not redefined.
    expect(INNER_LANE_X).toBe(0.5);
    expect(HORSE_STATION_Z).toBe(-2.02);
    expect(CHARIOT_YOKE_LINE_Z).toBe(-2.02);
    expect(LANE_PITCH).toBe(0.72);
    expect(CHARIOT_YOKE_UNDERSIDE_Y).toBe(0.935);
    expect(HORSE_ENVELOPE.maxRearZ).toBeCloseTo(-0.785, 12);
    expect(HORSE_ENVELOPE.barrelHalfWidth).toBe(0.25);
    expect(HORSE_REAR_CLEARANCE).toBe(0.1);
    expect(CHARIOT_WHEEL_RIM_INNER_X).toBe(0.665);
    expect(CHARIOT_WIDEST_X).toBe(0.768);
    expect(CHARIOT_GROUND_Y).toBe(0);
    expect(CHARIOT_TYRE_BOTTOM_Y).toBe(-0.035);
    // The module adds no lane of its own to the plan: its two staging numbers live
    // outside every lane the plan defines.
    expect(BESIDE_STAGING_X).toBe(CHARIOT_WIDEST_X + 0.98);
    const planLanes = [INNER_LANE_X, INNER_LANE_X + LANE_PITCH];
    expect(planLanes).not.toContain(BESIDE_STAGING_X);
  });

  test('the phase added no model file and no new asset to public/', () => {
    expect(readdirSync(repo('public/models')).sort()).toEqual([
      'amazonian.glb',
      'arena_roman.glb',
      'dimachaerus.glb',
      'minotaur.glb',
      'netfighter.glb',
      'weapons',
    ]);
    // `public/` gained nothing: the three horse uploads are the only horse files, and
    // they are the ones C-8.68A pinned (the byte-for-byte check lives in §A).
    const names: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else names.push(full.replace(repo(''), ''));
      }
    };
    walk(repo('public'));
    const horseFiles = names.filter((f) => /horse/i.test(f)).sort();
    expect(horseFiles.length).toBe(3);
    expect(horseFiles.every((f) => f.includes('_workspace_dist_'))).toBe(true);
  });
});
