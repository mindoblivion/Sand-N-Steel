import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';

const REPO = '/app/';
const CORRECTION = 1.632;            // roman_warrior, shipped C-8.81C
const CLIPS: Record<string, number> = { Sword_Attack: 519, Sword_Regular_C: 659 }; // C-8.80G contact frames

function loadGLB(path: string, base = '/models/'): Promise<any> {
  const buffer = readFileSync(path);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab as ArrayBuffer, base, res, rej));
}

const g = await loadGLB(`${REPO}public/models/arena_roman.glb`);
const gladius = await loadGLB(`${REPO}public/models/weapons/gladius.glb`, '/models/weapons/');

function buildBody(gltf: any, correction: number, opts: { z?: number; rotY?: number; clip?: string; t?: number } = {}) {
  const { z = 0, rotY = 0, clip = 'Fighting_Idle', t = 0.4 } = opts;
  const scene = SkeletonUtils.clone(gltf.scene);
  const root = new THREE.Group();
  root.position.set(0, 0, z);
  root.rotation.y = rotY;
  root.scale.setScalar(correction);
  root.add(scene);
  const mixer = new THREE.AnimationMixer(root);
  const found = THREE.AnimationClip.findByName(gltf.animations, clip);
  if (!found) throw new Error('clip missing ' + clip);
  mixer.clipAction(found).play();
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  return { root, scene, mixer, clip: found };
}

function posedVertices(scene: THREE.Object3D) {
  const out: number[] = []; // xyz triples
  const v = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) {
      o.getVertexPosition(i, v);
      o.localToWorld(v);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

// ── uniform grid over the defender's posed vertices ────────────────────────
const CELL = 0.05;
const OFF = 4096;
class Grid {
  map = new Map<number, number[]>();
  keys: number[] = [];
  constructor(flat: number[]) {
    for (let i = 0; i < flat.length; i += 3) {
      const k = this.key(flat[i], flat[i + 1], flat[i + 2]);
      let b = this.map.get(k);
      if (!b) { b = []; this.map.set(k, b); }
      b.push(i);
    }
    this.flat = flat;
  }
  flat: number[];
  key(x: number, y: number, z: number) {
    return ((Math.floor(x / CELL) + OFF) * 8192 + (Math.floor(y / CELL) + OFF)) * 8192 + (Math.floor(z / CELL) + OFF);
  }
  nearest(x: number, y: number, z: number, cap: number) {
    let best = cap * cap;
    let bi = -1;
    const bx = Math.floor(x / CELL), by = Math.floor(y / CELL), bz = Math.floor(z / CELL);
    const rings = Math.ceil(cap / CELL) + 1;
    for (let r = 0; r <= rings; r++) {
      if (best <= (r - 1) * CELL * (r - 1) * CELL) break;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const k = ((bx + dx + OFF) * 8192 + (by + dy + OFF)) * 8192 + (bz + dz + OFF);
        const b = this.map.get(k);
        if (!b) continue;
        for (const i of b) {
          const px = this.flat[i], py = this.flat[i + 1], pz = this.flat[i + 2];
          const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
          if (d < best) { best = d; bi = i; }
        }
      }
    }
    return { d2: best, index: bi, cap };
  }
}

function dedupe(flat: number[], q = 0.003) {
  const seen = new Set<string>();
  const out: number[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    const k = `${Math.round(flat[i] / q)},${Math.round(flat[i + 1] / q)},${Math.round(flat[i + 2] / q)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(flat[i], flat[i + 1], flat[i + 2]);
  }
  return out;
}

function bladeWorld(attachment: THREE.Object3D) {
  const out: number[] = [];
  const v = new THREE.Vector3();
  attachment.updateMatrixWorld(true);
  attachment.traverse((m: any) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.localToWorld(v); out.push(v.x, v.y, v.z); }
  });
  return out;
}

function attachGladius(body: any) {
  let hand: THREE.Object3D | null = null;
  body.scene.traverse((o: any) => { if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o; });
  if (!hand) throw new Error('hand_r missing');
  const attachment = new THREE.Group();
  attachment.scale.setScalar(1 / CORRECTION);
  const orient = new THREE.Group();
  orient.rotation.set(Math.PI / 2, 0, 0);
  orient.add(SkeletonUtils.clone(gladius.scene));
  attachment.add(orient);
  hand.add(attachment);
  body.root.updateMatrixWorld(true);
  return attachment;
}

// tip = the gladius vertex with the greatest local +Y (blade axis), tracked by world position
const tipLocal = (() => {
  let best: THREE.Vector3 | null = null;
  gladius.scene.traverse((m: any) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (!best || v.y > best.y) best = v.clone(); }
  });
  return best!;
})();

function defendDefender(sep: number) {
  const d = buildBody(g, CORRECTION, { z: -sep / 2 });
  const pts = posedVertices(d.scene);
  const grid = new Grid(pts);
  let front = -Infinity, frontY = 0, frontX = 0;
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] > front) { front = pts[i + 2]; frontY = pts[i + 1]; frontX = pts[i]; }
  return { body: d, pts, grid, front: front + sep / 2, frontY, frontX };
}

interface Sample { clipMs: number; wallMs: number; nearest: number; nearPt: [number,number,number]|null; nearBodyY: number|null; nearBodyZ: number|null; reach: number; tip: [number,number,number]; fwdPt: [number,number,number]; }

function sweep(clip: string, sep: number, stepMs: number) {
  const defender = defendDefender(sep);
  const attacker = buildBody(g, CORRECTION, { z: sep / 2, rotY: Math.PI, clip, t: 0 });
  const attachment = attachGladius(attacker);
  const duration = attacker.clip.duration * 1000;
  const samples: Sample[] = [];
  for (let ms = 0; ms <= duration; ms += stepMs) {
    attacker.mixer.setTime(ms / 1000);
    attacker.root.updateMatrixWorld(true);
    const bladeRaw = bladeWorld(attachment);
    const blade = dedupe(bladeRaw, 0.003);
    let nearest = Infinity, nearIdx = -1;
    for (let i = 0; i < blade.length; i += 3) {
      const q = defender.grid.nearest(blade[i], blade[i + 1], blade[i + 2], 1.2);
      if (q.d2 < nearest) { nearest = q.d2; nearIdx = i; }
    }
    let minZ = Infinity, fwd: [number,number,number] = [0,0,0];
    for (let i = 0; i < blade.length; i += 3) if (blade[i + 2] < minZ) { minZ = blade[i + 2]; fwd = [blade[i], blade[i + 1], blade[i + 2]]; }
    const tip = tipLocal.clone(); attachment.localToWorld(tip);
    const nd = nearest < 1.2 * 1.2 && nearIdx >= 0 ? defender.grid.nearest(blade[nearIdx], blade[nearIdx + 1], blade[nearIdx + 2], 1.2) : null;
    const nearDef = nearIdx >= 0 && nd && nd.index >= 0 ? [defender.pts[nd.index], defender.pts[nd.index + 1], defender.pts[nd.index + 2]] : null;
    samples.push({
      clipMs: ms,
      wallMs: ms,
      nearest: nearest < 1.2 * 1.2 ? Math.sqrt(nearest) : 99,
      nearPt: nearIdx >= 0 ? [blade[nearIdx], blade[nearIdx + 1], blade[nearIdx + 2]] : null,
      nearBodyY: nearDef ? nearDef[1] : null,
      nearBodyZ: nearDef ? nearDef[2] + sep / 2 : null,
      reach: sep / 2 - minZ,
      tip: [tip.x, tip.y, tip.z],
      fwdPt: fwd,
    });
  }
  return { defender, samples, duration };
}

const out: any = { tipLocal: tipLocal.toArray(), runs: {} };
for (const [clip, contactMs] of Object.entries(CLIPS)) {
  for (const sep of [1.2, 1.8]) {
    const t0 = Date.now();
    const { defender, samples, duration } = sweep(clip, sep, 1000 / 60);
    let best = samples[0];
    for (const s of samples) if (s.nearest < best.nearest) best = s;
    // refine around the coarse minimum at 1/480 s
    const refined = sweep(clip, sep, 1000 / 480);
    let rbest = refined.samples[0];
    for (const s of refined.samples) if (s.nearest < rbest.nearest) rbest = s;
    const atImpact = samples.reduce((a, b) => Math.abs(b.clipMs - contactMs) < Math.abs(a.clipMs - contactMs) ? b : a);
    const maxReach = samples.reduce((a, b) => (b.reach > a.reach ? b : a));
    out.runs[`${clip}@${sep}`] = {
      durationMs: duration,
      defenderFront: defender.front,
      defenderFrontPoint: [defender.frontX, defender.frontY, defender.front - sep / 2],
      coarseMin: { clipMs: best.clipMs, nearest: best.nearest, reach: best.reach, fwd: best.fwdPt, nearBodyY: best.nearBodyY, nearBodyZ: best.nearBodyZ },
      refinedMin: { clipMs: rbest.clipMs, nearest: rbest.nearest, reach: rbest.reach, fwd: rbest.fwdPt, nearBodyY: rbest.nearBodyY, nearBodyZ: rbest.nearBodyZ, nearPt: rbest.nearPt },
      atImpact: { clipMs: atImpact.clipMs, nearest: atImpact.nearest, reach: atImpact.reach, fwd: atImpact.fwdPt, nearBodyY: atImpact.nearBodyY },
      maxReach: { clipMs: maxReach.clipMs, reach: maxReach.reach, fwd: maxReach.fwdPt },
      axisGapAtImpact: sep - (atImpact.reach + defender.front),
      axisGapAtMin: sep - (best.reach + defender.front),
      tipAtImpact: atImpact.tip,
      msTaken: Date.now() - t0,
    };
    console.log(`${clip} @${sep}m done in ${Date.now() - t0} ms`);
  }
}
console.log(JSON.stringify(out, null, 1));
