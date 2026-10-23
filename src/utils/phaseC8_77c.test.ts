/**
 * Phase C-8.77C — repair of the misassigned gladiator hand weights.
 *
 * Run with: `bun test src/utils/phaseC8_77c.test.ts`
 *
 * ── THE DEFECT (re-measured from the shipping files this phase) ───────────
 *   `public/models/netfighter.glb` carried **207** vertices (109 on the left
 *   hand, 98 on the right) and `public/models/minotaur.glb` carried **478**
 *   (240 / 238) whose skin weights were `[1, 0, 0, 0]` bound to joint 6
 *   (`head`) while the geometry itself sits on the back of the hand, welded to
 *   surface that is 100% `hand_l` / `hand_r`.  Because the binding was rigid to
 *   the head, every head rotation dragged those patches off the hands: the
 *   measured worst edge gap at a welded seam was **0.66–0.77** world units on
 *   netfighter and **0.81–1.01** on minotaur (Fighting_Idle / Defend /
 *   Sword_Attack / Hit_Chest), on models only 2.0 / 1.9 units tall.
 *
 *   The patches are four discrete islands per model (netfighter 97/53/45/12,
 *   minotaur 142/130/108/98), 86 / 126 of their edges on an open boundary, and
 *   every edge that leaves an island lands on a `hand_l`/`hand_r` vertex.  The
 *   nearest bone *segment* is `hand_l`/`hand_r` for all 207 netfighter
 *   vertices; on minotaur it is the pinky chain for 449 of 478, but no island
 *   touches a pinky-weighted vertex at all — that chain's own geometry lives
 *   outboard of the patch — so binding to a finger would have torn the 52
 *   welds to the palm instead of closing them.
 *
 * ── THE REPAIR ────────────────────────────────────────────────────────────
 *   Each island takes its destination from its own welded seam (the dominant
 *   bone of its non-suspect neighbours, unanimous `hand_l`/`hand_r`), and the
 *   one free-floating netfighter island (12 vertices, no welded edge) takes the
 *   dominant bone of the nearest correctly weighted hand surface — also
 *   `hand_l`.  Only the skinning of those vertices was rewritten, in place.
 *   Measured with `cmp -l`, the whole-file difference is exactly ONE BYTE PER
 *   REPAIRED VERTEX — 207 bytes in netfighter.glb, 478 in minotaur.glb — because
 *   the weights were already `255,0,0,0` and only the joint index moved.  File
 *   size, vertex and triangle data, materials, textures, skeleton, inverse bind
 *   matrices and all 178 clips are byte-identical.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the two repaired assets, byte-for-byte, plus their structure (vertices,
 *       joints, clips) — a re-export must re-run the audit rather than silently
 *       reintroduce the defect;
 *   §B  the repaired regions themselves: no `head`-dominant vertex survives
 *       inside either hand patch, each patch still holds exactly the vertices it
 *       held, and every one of them is rigid to the correct hand;
 *   §C  weight hygiene over every vertex of both models (normalised sums, valid
 *       joint indices, finite values) and the rest of the model left alone
 *       (head-dominant and rigid-hand totals);
 *   §D  scope: the three models this phase did not touch are byte-identical;
 *   §E  a control — the same scan re-run against the original head binding has
 *       to fail, so the guard is shown to be sensitive to the defect.
 *
 * The suite never writes a file.  Numeric validation only: the rendered look
 * still needs a device pass.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const repo = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const NETFIGHTER = repo('public/models/netfighter.glb');
const MINOTAUR = repo('public/models/minotaur.glb');
const UNTOUCHED = [
  repo('public/models/arena_roman.glb'),
  repo('public/models/amazonian.glb'),
  repo('public/models/dimachaerus.glb'),
];

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

/**
 * A model, measured from its own buffers.  `weights` and `joints` are the raw
 * component arrays (u8 each) so a control can substitute a mutated copy without
 * touching the file.
 */
interface Measured {
  name: string;
  bytes: number;
  sha: string;
  vertexCount: number;
  jointCount: number;
  clipCount: number;
  jointNames: string[];
  pos: Float64Array; // quantised int16 positions, /32767 — the authored bind-pose space
  weights: Uint8Array; // 0..255, normalised (÷255)
  joints: Uint8Array;
}

async function measure(path: string): Promise<Measured> {
  const raw = readFileSync(path);
  const doc = await io.readBinary(new Uint8Array(raw));
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const skin = doc.getRoot().listSkins()[0];
  const jointNames = skin.listJoints().map((j) => j.getName());

  const posAttr = prim.getAttribute('POSITION')!;
  const wAttr = prim.getAttribute('WEIGHTS_0')!;
  const jAttr = prim.getAttribute('JOINTS_0')!;
  const posRaw = posAttr.getArray()! as Int16Array;
  const pos = new Float64Array(posRaw.length);
  const posDiv = posAttr.getNormalized() ? 32767 : 1;
  for (let i = 0; i < posRaw.length; i++) pos[i] = posRaw[i] / posDiv;

  return {
    name: path.split('/').pop()!,
    bytes: raw.length,
    sha: sha256(path),
    vertexCount: posAttr.getCount(),
    jointCount: jointNames.length,
    clipCount: doc.getRoot().listAnimations().length,
    jointNames,
    pos,
    weights: wAttr.getArray()! as Uint8Array,
    joints: jAttr.getArray()! as Uint8Array,
  };
}

type Box = [number, number, number, number, number, number];
interface PatchSpec {
  model: Measured;
  /** Measured bounds of the affected vertices, per side, in bind-pose space. */
  boxL: Box;
  boxR: Box;
  patchL: number;
  patchR: number;
}

const PAD = 1e-4;
const inBox = (m: Measured, v: number, b: Box): boolean => {
  const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2];
  return x >= b[0] - PAD && x <= b[1] + PAD
    && y >= b[2] - PAD && y <= b[3] + PAD
    && z >= b[4] - PAD && z <= b[5] + PAD;
};

const dominant = (m: Measured, v: number): { name: string; weight: number } => {
  let slot = 0, best = -1;
  for (let c = 0; c < 4; c++) {
    const w = m.weights[v * 4 + c] / 255;
    if (w > best) { best = w; slot = c; }
  }
  return { name: m.jointNames[m.joints[v * 4 + slot]], weight: best };
};

/** Everything §B and §C assert, over one model, from (optionally overridden) buffers. */
function scan(spec: PatchSpec, weights = spec.model.weights, joints = spec.model.joints) {
  const m: Measured = { ...spec.model, weights, joints };
  const box = (b: Box, hand: string) => {
    let count = 0, headDominant = 0, notRigidToHand = 0;
    for (let v = 0; v < m.vertexCount; v++) {
      if (!inBox(m, v, b)) continue;
      count++;
      const d = dominant(m, v);
      if (d.name === 'head' && d.weight > 0.99) headDominant++;
      if (!(d.name === hand && d.weight >= 0.999)) notRigidToHand++;
    }
    return { count, headDominant, notRigidToHand };
  };

  let headDominantTotal = 0;
  const rigidHand: Record<string, number> = { hand_l: 0, hand_r: 0 };
  for (let v = 0; v < m.vertexCount; v++) {
    const d = dominant(m, v);
    if (d.name === 'head' && d.weight > 0.99) headDominantTotal++;
    if ((d.name === 'hand_l' || d.name === 'hand_r') && d.weight >= 0.999) rigidHand[d.name]++;
  }

  return {
    left: box(spec.boxL, 'hand_l'),
    right: box(spec.boxR, 'hand_r'),
    headDominantTotal,
    rigidHand,
  };
}

// ── The two repaired models, loaded once ───────────────────────────────────
const netfighter = await measure(NETFIGHTER);
const minotaur = await measure(MINOTAUR);

const NETFIGHTER_SPEC: PatchSpec = {
  model: netfighter,
  // Back of the left / right hand: above the palm's own top edge (y 0.4977) and
  // inboard of the knuckle line (x 0.709).
  boxL: [0.6612, 0.6934, 0.4976, 0.5271, -0.0419, -0.0164],
  boxR: [-0.6939, -0.6616, 0.4977, 0.5269, -0.0424, -0.0165],
  patchL: 109,
  patchR: 98,
};

const MINOTAUR_SPEC: PatchSpec = {
  model: minotaur,
  // The same dorsal region on the minotaur's own, larger hands: at the +X end of
  // the hand (x 0.7709–0.8242 against hand bounds 0.689–0.823) and above it.
  boxL: [0.7709, 0.8242, 0.5224, 0.5838, -0.1215, -0.0762],
  boxR: [-0.8243, -0.7673, 0.5231, 0.5836, -0.1217, -0.0763],
  patchL: 240,
  patchR: 238,
};

describe('C-8.77C §A — the repaired assets, pinned', () => {
  test('netfighter.glb is the repaired file, byte-for-byte', () => {
    expect(netfighter.sha).toBe('a0e0d4dcdf59cf2eda84a06ace43883b2297522a0e4f620514b5bdc3ec2d7e2d');
    expect(netfighter.bytes).toBe(10670992);
  });

  test('minotaur.glb is the repaired file, byte-for-byte', () => {
    expect(minotaur.sha).toBe('46dafe41a24a123ed20af74ee70bfe11450e53940bff38f10047e51b8afb0cf6');
    expect(minotaur.bytes).toBe(9759552);
  });

  test('the repair changed no vertex, joint or clip count (sizes are the audited ones)', () => {
    expect(netfighter.vertexCount).toBe(106139);
    expect(netfighter.jointCount).toBe(56);
    expect(netfighter.clipCount).toBe(178);
    expect(minotaur.vertexCount).toBe(88510);
    expect(minotaur.jointCount).toBe(56);
    expect(minotaur.clipCount).toBe(178);
  });

  test('the skeleton keeps its names, so no bone was renamed or reordered', () => {
    for (const m of [netfighter, minotaur]) {
      expect(m.jointNames.slice(0, 7)).toEqual([
        'root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
      ]);
      expect(m.jointNames[11]).toBe('hand_l');
      expect(m.jointNames[30]).toBe('hand_r');
    }
  });
});

describe('C-8.77C §B — the hand patches are bound to the hand', () => {
  test('netfighter: no head-dominant vertex survives in either patch', () => {
    const s = scan(NETFIGHTER_SPEC);
    expect(s.left.headDominant).toBe(0);
    expect(s.right.headDominant).toBe(0);
  });

  test('netfighter: the patches still hold exactly their 109 / 98 vertices, all rigid to their hand', () => {
    const s = scan(NETFIGHTER_SPEC);
    expect(s.left.count).toBe(NETFIGHTER_SPEC.patchL);
    expect(s.right.count).toBe(NETFIGHTER_SPEC.patchR);
    expect(s.left.notRigidToHand).toBe(0);
    expect(s.right.notRigidToHand).toBe(0);
  });

  test('minotaur: no head-dominant vertex survives in either patch', () => {
    const s = scan(MINOTAUR_SPEC);
    expect(s.left.headDominant).toBe(0);
    expect(s.right.headDominant).toBe(0);
  });

  test('minotaur: the patches still hold exactly their 240 / 238 vertices, all rigid to their hand', () => {
    const s = scan(MINOTAUR_SPEC);
    expect(s.left.count).toBe(MINOTAUR_SPEC.patchL);
    expect(s.right.count).toBe(MINOTAUR_SPEC.patchR);
    expect(s.left.notRigidToHand).toBe(0);
    expect(s.right.notRigidToHand).toBe(0);
  });

  test('each patch sits on its own side of the mid-plane', () => {
    expect(NETFIGHTER_SPEC.boxL[0]).toBeGreaterThan(0);
    expect(NETFIGHTER_SPEC.boxR[1]).toBeLessThan(0);
    expect(MINOTAUR_SPEC.boxL[0]).toBeGreaterThan(0);
    expect(MINOTAUR_SPEC.boxR[1]).toBeLessThan(0);
  });
});

describe('C-8.77C §C — weight hygiene, and the rest of the model untouched', () => {
  test('every weight sums to 1 within the u8 quantisation and every joint index is valid', () => {
    for (const m of [netfighter, minotaur]) {
      // Aggregated rather than asserted per slot: the same guarantee, without
      // 4.6 million individual expect() calls in the suite.
      let worstSum = 0;
      let badSlots = 0;
      let badJoints = 0;
      for (let v = 0; v < m.vertexCount; v++) {
        let sum = 0;
        for (let c = 0; c < 4; c++) {
          const raw = m.weights[v * 4 + c];
          if (!Number.isFinite(raw) || raw < 0 || raw > 255) badSlots++;
          sum += raw / 255;
          const ji = m.joints[v * 4 + c];
          if (!Number.isInteger(ji) || ji < 0 || ji >= m.jointCount) badJoints++;
        }
        worstSum = Math.max(worstSum, Math.abs(sum - 1));
      }
      expect(badSlots).toBe(0);
      expect(badJoints).toBe(0);
      // u8 weights: the largest representable per-slot error is 1/255, and these
      // files quantise exactly (a rigid vertex is 255/255 = 1).
      expect(worstSum).toBeLessThanOrEqual(1 / 255 + 1e-12);
    }
  });

  test('the head keeps only the geometry it should drive (207 / 478 fewer dominant vertices)', () => {
    expect(scan(NETFIGHTER_SPEC).headDominantTotal).toBe(16799); // was 17006
    expect(scan(MINOTAUR_SPEC).headDominantTotal).toBe(11197); // was 11675
  });

  test('the rigid hand surfaces grew by exactly the repaired vertices', () => {
    const nf = scan(NETFIGHTER_SPEC).rigidHand;
    expect(nf.hand_l).toBe(948); // was 839, + 109
    expect(nf.hand_r).toBe(1265); // was 1167, + 98
    const mn = scan(MINOTAUR_SPEC).rigidHand;
    expect(mn.hand_l).toBe(793); // was 553, + 240
    expect(mn.hand_r).toBe(799); // was 561, + 238
  });
});

describe('C-8.77C §D — the other three models are untouched', () => {
  test('arena_roman, amazonian and dimachaerus keep their audited hashes', () => {
    // Rebased by C-8.77F, which repaired arena_roman.glb's hand geometry
    // (anisotropic, wrist-anchored; see phaseC8_77f.test.ts). The C-8.77C value
    // was a93ee702…; that phase did not touch amazonian or dimachaerus.
    expect(sha256(UNTOUCHED[0])).toBe('f405de59d6e34e2d51baaf29de12faebfa94c463b1b129a0227e6e72648eeee5');
    expect(sha256(UNTOUCHED[1])).toBe('49e5830b2c90d4a770cabd14d1bee6084c501d53015739d8fb496fdddc5c7016');
    expect(sha256(UNTOUCHED[2])).toBe('62627ab5ade9c2b44222d05e35ddad927b759e08f159c4af352c3dddf7d2a26b');
  });
});

describe('C-8.77C §E — control: the guard fails on the original head binding', () => {
  test('re-binding a netfighter patch to head is caught on both counts', () => {
    const spec = NETFIGHTER_SPEC;
    const weights = Uint8Array.from(spec.model.weights);
    const joints = Uint8Array.from(spec.model.joints);
    const headSlot = spec.model.jointNames.indexOf('head');
    let touched = 0;
    for (let v = 0; v < spec.model.vertexCount; v++) {
      if (!inBox(spec.model, v, spec.boxL)) continue;
      joints[v * 4] = headSlot;
      weights[v * 4] = 255;
      for (let c = 1; c < 4; c++) weights[v * 4 + c] = 0;
      touched++;
    }
    expect(touched).toBe(spec.patchL);

    const s = scan(spec, weights, joints);
    expect(s.left.headDominant).toBe(spec.patchL); // the defect is back
    expect(s.left.notRigidToHand).toBe(spec.patchL);
    expect(scan(spec).left.headDominant).toBe(0); // and the shipped file is clean
  });

  test('re-binding a minotaur patch to head is caught too', () => {
    const spec = MINOTAUR_SPEC;
    const weights = Uint8Array.from(spec.model.weights);
    const joints = Uint8Array.from(spec.model.joints);
    const headSlot = spec.model.jointNames.indexOf('head');
    for (let v = 0; v < spec.model.vertexCount; v++) {
      if (!inBox(spec.model, v, spec.boxR)) continue;
      joints[v * 4] = headSlot;
      weights[v * 4] = 255;
      for (let c = 1; c < 4; c++) weights[v * 4 + c] = 0;
    }
    const s = scan(spec, weights, joints);
    expect(s.right.headDominant).toBe(spec.patchR);
    expect(scan(spec).right.headDominant).toBe(0);
  });
});
