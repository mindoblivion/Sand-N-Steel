/**
 * Phase C-8.77F — the `arena_roman.glb` hand geometry repair, pinned.
 *
 * Run with: `bun test src/utils/phaseC8_77f.test.ts`
 *
 * ── THE DEFECT (measured in C-8.77E) ──────────────────────────────────────
 *   `arena_roman.glb` — the body behind **both** the Roman Warrior and the
 *   Centurion buttons — carried hands that were short and thin against every
 *   sibling: hand length **0.1315 / 0.1388** and thickness **0.0472 / 0.0503**
 *   at a 2.0-unit stature, against 0.17–0.22 length on the other four models.
 *   The palm was nearly square (width/length **1.81**), the metacarpal was
 *   0.0652, and the hand was **6.58 %H** long where an adult is ~10.8 %H.
 *
 * ── THE REPAIR ───────────────────────────────────────────────────────────
 *   An anisotropic, wrist-anchored map over the hand region only: length and
 *   thickness ×1.51, width ×1.04, blended out across the wrist ring, with the
 *   five finger chains' rest origins moved one matching metacarpal further out
 *   (node-space `middle_01_*` local y **0.0656 → 0.099050**). Measured after:
 *   length **0.1986 / 0.2088**, thickness **0.0713 / 0.0742**, width
 *   **0.1320 / 0.1328**, palm W/L **1.25**, metacarpal **0.0983** — the hand is
 *   now **9.93 %H** long, in band with the siblings.
 *
 *   What the repair provably did NOT touch: 31,292 vertices, 51,726 triangles,
 *   66 joints, 178 clips and their names, the skeleton's names and order, the
 *   materials and all three textures, and the weights of every vertex (3,215
 *   `head`-dominant and 443 / 409 rigid-to-hand vertices before and after).
 *   Exactly **40 nodes** moved — the 5 × 4 bones of both finger chains, nothing
 *   else; the wrist, forearm and shoulder origins are their old selves.
 *
 * ── WHY IT IS ANIMATION-SAFE ─────────────────────────────────────────────
 *   All 178 clips are **rotation-only** on the arm and the fingers: of 12,008
 *   channels, **zero** animate a finger joint's translation. Finger rest length
 *   is therefore authored purely by the node transforms this phase moved, and
 *   no clip can overwrite or fight it.
 *
 * ── WHAT THIS SUITE PINS ─────────────────────────────────────────────────
 *   §A  the repaired asset byte-for-byte, its vertex/triangle/joint/clip counts,
 *       its joint-name signature and the inverse-bind block — a re-export must
 *       re-run the audit rather than silently undo it;
 *   §B  the repair's scope: the five finger chains sit one new metacarpal out
 *       from each hand, and the hand / forearm / upper-arm origins are unchanged;
 *   §C  the proportions themselves, bilaterally, plus the palm box and forearm;
 *   §D  mesh integrity: no collapsed or non-finite hand triangle after the
 *       stretch, and a hand-area total inside the expected band;
 *   §E  skinning untouched: normalised weight sums, in-range joint indices, and
 *       the `head`-dominant and rigid-hand signatures of C-8.77C;
 *   §F  scope: the four other gladiator assets are byte-identical;
 *   §G  a control — the same proportion guard re-run against the recorded
 *       pre-repair numbers has to fail, so it is shown sensitive to the defect.
 *
 * The suite never writes a file. Numeric validation only: the rendered look
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

const ARENA = repo('public/models/arena_roman.glb');
const UNTOUCHED: Record<string, string> = {
  'amazonian.glb': '49e5830b2c90d4a770cabd14d1bee6084c501d53015739d8fb496fdddc5c7016',
  'dimachaerus.glb': '62627ab5ade9c2b44222d05e35ddad927b759e08f159c4af352c3dddf7d2a26b',
  'minotaur.glb': '46dafe41a24a123ed20af74ee70bfe11450e53940bff38f10047e51b8afb0cf6',
  'netfighter.glb': 'a0e0d4dcdf59cf2eda84a06ace43883b2297522a0e4f620514b5bdc3ec2d7e2d',
};

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const isFinger = (n: string) => FINGERS.some((f) => n.startsWith(f + '_'));
const sha256 = (buf: Uint8Array) => createHash('sha256').update(buf).digest('hex');

interface Model {
  bytes: number;
  sha: string;
  vertexCount: number;
  triangleCount: number;
  jointNames: string[];
  clipNames: string[];
  ibmSha: string;
  /** Bind-pose positions in authored mesh space (quantised int16 / 32767). */
  pos: Float64Array;
  indices: ArrayLike<number>;
  weights: Uint8Array;
  joints: Uint8Array;
  /** Rest joint positions, recovered by inverting each inverse bind matrix. */
  rest: Float64Array;
  /** Authored local translations, by node name. */
  nodeTranslation: Record<string, number[]>;
  /** Animated channel paths per node name. */
  channelPaths: Record<string, Set<string>>;
  fingerTranslationChannels: number;
  channelCount: number;
}

async function measure(path: string): Promise<Model> {
  const raw = new Uint8Array(readFileSync(path));
  const doc = await io.readBinary(raw);
  const root = doc.getRoot();
  const prim = root.listMeshes()[0].listPrimitives()[0];
  const skin = root.listSkins()[0];
  const jointNames = skin.listJoints().map((j) => j.getName()!);

  const posAttr = prim.getAttribute('POSITION')!;
  const posRaw = posAttr.getArray()! as Int16Array;
  const posDiv = posAttr.getNormalized() ? 32767 : 1;
  const pos = new Float64Array(posRaw.length);
  for (let i = 0; i < posRaw.length; i++) pos[i] = posRaw[i] / posDiv;

  const ibm = skin.getInverseBindMatrices()!;
  const ibmArr = ibm.getArray()! as Float32Array;
  const rest = new Float64Array(jointNames.length * 3);
  for (let j = 0; j < jointNames.length; j++) {
    const o = j * 16;
    const a = [ibmArr[o], ibmArr[o + 1], ibmArr[o + 2]];
    const b = [ibmArr[o + 4], ibmArr[o + 5], ibmArr[o + 6]];
    const c = [ibmArr[o + 8], ibmArr[o + 9], ibmArr[o + 10]];
    const t = [ibmArr[o + 12], ibmArr[o + 13], ibmArr[o + 14]];
    const det =
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    const i0 = [(b[1] * c[2] - b[2] * c[1]) / det, (a[2] * c[1] - a[1] * c[2]) / det, (a[1] * b[2] - a[2] * b[1]) / det];
    const i1 = [(b[2] * c[0] - b[0] * c[2]) / det, (a[0] * c[2] - a[2] * c[0]) / det, (a[2] * b[0] - a[0] * b[2]) / det];
    const i2 = [(b[0] * c[1] - b[1] * c[0]) / det, (a[1] * c[0] - a[0] * c[1]) / det, (a[0] * b[1] - a[1] * b[0]) / det];
    rest[j * 3] = -(i0[0] * t[0] + i1[0] * t[1] + i2[0] * t[2]);
    rest[j * 3 + 1] = -(i0[1] * t[0] + i1[1] * t[1] + i2[1] * t[2]);
    rest[j * 3 + 2] = -(i0[2] * t[0] + i1[2] * t[1] + i2[2] * t[2]);
  }

  const nodeTranslation: Record<string, number[]> = {};
  for (const n of root.listNodes()) nodeTranslation[n.getName()!] = n.getTranslation();

  const channelPaths: Record<string, Set<string>> = {};
  let fingerTranslationChannels = 0;
  let channelCount = 0;
  const clipNames: string[] = [];
  for (const anim of root.listAnimations()) {
    clipNames.push(anim.getName() ?? '');
    for (const ch of anim.listChannels()) {
      channelCount++;
      const name = ch.getTargetNode()?.getName() ?? '';
      const path = ch.getTargetPath() ?? '';
      (channelPaths[name] = channelPaths[name] ?? new Set()).add(path);
      if (isFinger(name) && path === 'translation') fingerTranslationChannels++;
    }
  }

  return {
    bytes: raw.length,
    sha: sha256(raw),
    vertexCount: posAttr.getCount(),
    triangleCount: prim.getIndices()!.getCount() / 3,
    jointNames,
    clipNames,
    ibmSha: sha256(new Uint8Array(ibmArr.buffer, ibmArr.byteOffset, ibmArr.byteLength)),
    pos,
    indices: prim.getIndices()!.getArray()!,
    weights: prim.getAttribute('WEIGHTS_0')!.getArray()! as Uint8Array,
    joints: prim.getAttribute('JOINTS_0')!.getArray()! as Uint8Array,
    rest,
    nodeTranslation,
    channelPaths,
    fingerTranslationChannels,
    channelCount,
  };
}

/** The dominant joint of a vertex, and its (normalised) weight. */
function dominant(m: Model, v: number): { name: string; weight: number } {
  let slot = 0;
  let best = -1;
  for (let c = 0; c < 4; c++) {
    const w = m.weights[v * 4 + c];
    if (w > best) {
      best = w;
      slot = c;
    }
  }
  return { name: m.jointNames[m.joints[v * 4 + slot]], weight: best / 255 };
}

const isHandJoint = (n: string) => n === 'hand_l' || n === 'hand_r' || isFinger(n);

interface Box {
  len: number;
  wid: number;
  thk: number;
}

const boxOf = (m: Model, verts: number[]): Box => {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) {
    for (let a = 0; a < 3; a++) {
      const t = m.pos[v * 3 + a];
      if (t < mn[a]) mn[a] = t;
      if (t > mx[a]) mx[a] = t;
    }
  }
  return { len: mx[0] - mn[0], wid: mx[1] - mn[1], thk: mx[2] - mn[2] };
};

interface Side {
  hand: Box;
  palm: Box;
  wristToKnuckle: number;
  handVerts: number;
  palmVerts: number;
  fingerVerts: number;
  forearm: Box;
}

/** The hand region of one side, measured the way C-8.77E measured it. */
function sideOf(m: Model, s: 'l' | 'r'): Side {
  const handName = `hand_${s}`;
  const hand: number[] = [];
  const palm: number[] = [];
  const finger: number[] = [];
  const forearm: number[] = [];
  for (let v = 0; v < m.vertexCount; v++) {
    const name = dominant(m, v).name;
    if (name === handName) {
      hand.push(v);
      palm.push(v);
    } else if (isFinger(name) && name.endsWith(`_${s}`)) {
      hand.push(v);
      finger.push(v);
    } else if (name === `lowerarm_${s}`) {
      forearm.push(v);
    }
  }
  const wristX = m.rest[m.jointNames.indexOf(handName) * 3];
  const knuckleX = m.rest[m.jointNames.indexOf(`middle_01_${s}`) * 3];
  const dir = s === 'l' ? 1 : -1;
  const span = Math.abs(knuckleX - wristX);
  const palmInSpan = palm.filter((v) => {
    const d = (m.pos[v * 3] - wristX) * dir;
    return d >= -1e-6 && d <= span + 1e-9;
  });
  return {
    hand: boxOf(m, hand),
    palm: boxOf(m, palmInSpan),
    wristToKnuckle: span,
    handVerts: hand.length,
    palmVerts: palm.length,
    fingerVerts: finger.length,
    forearm: boxOf(m, forearm),
  };
}

/**
 * The proportion guard the control re-runs: given a hand's length, thickness
 * and palm width/length on a 2.0-unit body, does it read as a human hand?
 * The bands sit between the recorded defect and the repaired asset, so they
 * catch a regression without pinning the repair's exact millimetres.
 */
function handReadsAsHand(h: { length: number; thickness: number; palmWL: number }) {
  return h.length >= 0.17 && h.thickness >= 0.06 && h.palmWL <= 1.35;
}

// ── The repaired asset, loaded once ────────────────────────────────────────
const arena = await measure(ARENA);
const left = sideOf(arena, 'l');
const right = sideOf(arena, 'r');

describe('C-8.77F §A — the repaired asset, pinned', () => {
  test('arena_roman.glb is the repaired file, byte-for-byte', () => {
    expect(arena.sha).toBe('f405de59d6e34e2d51baaf29de12faebfa94c463b1b129a0227e6e72648eeee5');
    expect(arena.bytes).toBe(7053980);
  });

  test('vertex, triangle and joint counts are the audited ones', () => {
    expect(arena.vertexCount).toBe(31292);
    expect(arena.triangleCount).toBe(51726);
    expect(arena.jointNames.length).toBe(66);
  });

  test('the skeleton keeps its names and order', () => {
    expect(arena.jointNames.slice(0, 7)).toEqual([
      'root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
    ]);
    expect(arena.jointNames[11]).toBe('hand_l');
    expect(arena.jointNames.filter(isFinger).length).toBe(40);
  });

  test('the bind pose is the repaired one (inverse-bind block pinned)', () => {
    expect(arena.ibmSha).toBe('1ff0d0ef373b31d1f20aae6454368c1055d64c9445e07e36c59a45ab37e2000b');
  });
});

describe('C-8.77F §B — the repair moved the fingers and nothing else', () => {
  test('every finger chain sits one new metacarpal out from its hand', () => {
    // Node-space metacarpal: 0.0656 before the repair, one ×1.51 map after.
    const expected: Record<string, number> = {
      thumb: 0.018079,
      index: 0.094766,
      middle: 0.09905,
      ring: 0.09688,
      pinky: 0.092618,
    };
    for (const s of ['l', 'r']) {
      for (const f of FINGERS) {
        expect(arena.nodeTranslation[`${f}_01_${s}`][1]).toBeCloseTo(expected[f], 4);
      }
    }
  });

  test('the wrist, elbow and shoulder origins are untouched', () => {
    for (const s of ['l', 'r']) {
      const dir = s === 'l' ? 1 : -1;
      const hand = arena.nodeTranslation[`hand_${s}`];
      // The arm chain runs along local +Y; the hand sits 0.1418 below the elbow.
      expect(hand[1]).toBeCloseTo(0.1418, 4);
      expect(hand[0]).toBeCloseTo(0.010241 * dir, 5);
      expect(hand[2]).toBeCloseTo(0.028277, 5);
      expect(arena.nodeTranslation[`lowerarm_${s}`][1]).toBeCloseTo(0.172025, 5);
      expect(arena.nodeTranslation[`upperarm_${s}`][1]).toBeCloseTo(0.117209, 5);
    }
  });

  test('no clip animates a finger translation, so none can fight the new length', () => {
    expect(arena.fingerTranslationChannels).toBe(0);
    expect(arena.channelCount).toBe(12008);
    for (const joint of ['upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r']) {
      expect([...(arena.channelPaths[joint] ?? [])]).toEqual(['rotation']);
    }
  });

  test('the 178 clips keep their names', () => {
    expect(arena.clipNames.length).toBe(178);
    expect(arena.clipNames.slice(0, 4)).toEqual(['Angry', 'Attack_Ground_Pound', 'Backflip', 'Bow']);
    expect(createHash('sha256').update(arena.clipNames.join('|')).digest('hex')).toBe(
      '35de4c939ebae36864611c89fb2a88d0f1f0351d8b9eaf8d3e9f88435f051c4d',
    );
  });
});

describe('C-8.77F §C — the hand now reads at sibling proportions', () => {
  test('left hand length, thickness and width are the repaired values', () => {
    expect(left.hand.len).toBeCloseTo(0.1986, 3);
    expect(left.hand.thk).toBeCloseTo(0.0713, 3);
    expect(left.hand.wid).toBeCloseTo(0.132, 3);
  });

  test('right hand length, thickness and width are the repaired values', () => {
    expect(right.hand.len).toBeCloseTo(0.2088, 3);
    expect(right.hand.thk).toBeCloseTo(0.0742, 3);
    expect(right.hand.wid).toBeCloseTo(0.1328, 3);
  });

  test('both hands pass the proportion guard (they did not before)', () => {
    for (const side of [left, right]) {
      expect(
        handReadsAsHand({
          length: side.hand.len,
          thickness: side.hand.thk,
          palmWL: side.palm.wid / side.palm.len,
        }),
      ).toBe(true);
    }
  });

  test('the palm is no longer square and the metacarpal is the new one', () => {
    expect(left.palm.wid / left.palm.len).toBeCloseTo(1.247, 2);
    expect(right.palm.wid / right.palm.len).toBeCloseTo(1.242, 2);
    expect(left.wristToKnuckle).toBeCloseTo(0.0983, 3);
    expect(right.wristToKnuckle).toBeCloseTo(0.0983, 3);
  });

  test('the forearm was left alone', () => {
    expect(left.forearm.len).toBeCloseTo(0.1907, 3);
    expect(right.forearm.len).toBeCloseTo(0.1721, 3);
  });

  test('the hand is still the same surface — no vertex was added or dropped', () => {
    expect(left.handVerts).toBe(939);
    expect(left.palmVerts).toBe(443);
    expect(left.fingerVerts).toBe(496);
    expect(right.handVerts).toBe(966);
    expect(right.palmVerts).toBe(409);
  });
});

describe('C-8.77F §D — the stretched mesh is still sound', () => {
  const hand = (() => {
    const inHand = new Set<number>();
    for (let v = 0; v < arena.vertexCount; v++) {
      if (isHandJoint(dominant(arena, v).name)) inHand.add(v);
    }
    const p = (v: number): number[] => [arena.pos[v * 3], arena.pos[v * 3 + 1], arena.pos[v * 3 + 2]];
    let triangles = 0;
    let degenerate = 0;
    let nonFinite = 0;
    let area = 0;
    for (let v = 0; v < arena.vertexCount; v++) {
      if (!Number.isFinite(arena.pos[v * 3]) || !Number.isFinite(arena.pos[v * 3 + 1]) || !Number.isFinite(arena.pos[v * 3 + 2])) {
        nonFinite++;
      }
    }
    for (let t = 0; t < arena.indices.length; t += 3) {
      const i0 = arena.indices[t];
      const i1 = arena.indices[t + 1];
      const i2 = arena.indices[t + 2];
      if (!inHand.has(i0) && !inHand.has(i1) && !inHand.has(i2)) continue;
      triangles++;
      const a = p(i0);
      const u = [p(i1)[0] - a[0], p(i1)[1] - a[1], p(i1)[2] - a[2]];
      const w = [p(i2)[0] - a[0], p(i2)[1] - a[1], p(i2)[2] - a[2]];
      const cx = u[1] * w[2] - u[2] * w[1];
      const cy = u[2] * w[0] - u[0] * w[2];
      const cz = u[0] * w[1] - u[1] * w[0];
      const tri = 0.5 * Math.hypot(cx, cy, cz);
      if (!Number.isFinite(tri)) nonFinite++;
      if (tri < 1e-10) degenerate++;
      area += tri;
    }
    return { triangles, degenerate, nonFinite, area };
  })();

  test('every hand vertex and triangle is finite', () => {
    expect(hand.nonFinite).toBe(0);
  });

  test('no hand triangle collapsed under the stretch', () => {
    expect(hand.triangles).toBe(3044);
    expect(hand.degenerate).toBe(0);
  });

  test('the hand keeps its surface area, scaled for the anisotropic map', () => {
    // 0.0425 before the repair; length ×1.51 and thickness ×1.51 with width
    // nearly unchanged predicts ~0.079, and the mesh measures 0.0787.
    expect(hand.area).toBeCloseTo(0.0787, 3);
    expect(hand.area).toBeGreaterThan(0.0425 * 1.5);
  });
});

describe('C-8.77F §E — skinning was not re-bound', () => {
  test('weight sums stay normalised and joint indices stay in range', () => {
    let badSum = 0;
    let badIndex = 0;
    for (let v = 0; v < arena.vertexCount; v++) {
      let sum = 0;
      for (let c = 0; c < 4; c++) {
        sum += arena.weights[v * 4 + c] / 255;
        if (arena.joints[v * 4 + c] >= arena.jointNames.length) badIndex++;
      }
      if (Math.abs(sum - 1) > 2 / 255) badSum++;
    }
    expect(badSum).toBe(0);
    expect(badIndex).toBe(0);
  });

  test('the head-dominant and rigid-hand signatures of C-8.77C are unchanged', () => {
    let headDominant = 0;
    let rigidL = 0;
    let rigidR = 0;
    for (let v = 0; v < arena.vertexCount; v++) {
      const d = dominant(arena, v);
      if (d.name === 'head' && d.weight > 0.99) headDominant++;
      if (d.name === 'hand_l' && d.weight >= 0.999) rigidL++;
      if (d.name === 'hand_r' && d.weight >= 0.999) rigidR++;
    }
    expect(headDominant).toBe(3215);
    expect(rigidL).toBe(443);
    expect(rigidR).toBe(409);
  });
});

describe('C-8.77F §F — scope: no other gladiator asset moved', () => {
  for (const [file, sha] of Object.entries(UNTOUCHED)) {
    test(`${file} is byte-identical`, () => {
      expect(sha256(new Uint8Array(readFileSync(repo(`public/models/${file}`))))).toBe(sha);
    });
  }
});

describe('C-8.77F §G — control: the guard is sensitive to the defect', () => {
  test('the recorded pre-repair numbers fail it', () => {
    expect(handReadsAsHand({ length: 0.1315, thickness: 0.0472, palmWL: 0.115 / 0.0636 })).toBe(false);
    expect(handReadsAsHand({ length: 0.1388, thickness: 0.0503, palmWL: 0.1129 / 0.0623 })).toBe(false);
  });

  test('a long-but-flat hand still fails on thickness alone', () => {
    expect(handReadsAsHand({ length: 0.2, thickness: 0.045, palmWL: 1.2 })).toBe(false);
  });
});
