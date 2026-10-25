import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';

const REPO = '/app/';
const CORRECTION = 1.632;
const CLIPS: Record<string, number> = { Sword_Attack: 519, Sword_Regular_C: 659 };

function loadGLB(path: string, base = '/models/'): Promise<any> {
  const buffer = readFileSync(path);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab as ArrayBuffer, base, res, rej));
}
console.warn = () => {};
const g = await loadGLB(`${REPO}public/models/arena_roman.glb`);
const gladius = await loadGLB(`${REPO}public/models/weapons/gladius.glb`, '/models/weapons/');

function buildBody(gltf: any, correction: number, opts: any = {}) {
  const { z = 0, rotY = 0, clip = 'Fighting_Idle', t = 0.4 } = opts;
  const scene = SkeletonUtils.clone(gltf.scene);
  const root = new THREE.Group();
  root.position.set(0, 0, z); root.rotation.y = rotY; root.scale.setScalar(correction);
  root.add(scene);
  const mixer = new THREE.AnimationMixer(root);
  const found = THREE.AnimationClip.findByName(gltf.animations, clip)!;
  mixer.clipAction(found).play(); mixer.setTime(t);
  root.updateMatrixWorld(true);
  return { root, scene, mixer, clip: found };
}
function posedFlat(scene: THREE.Object3D) {
  const out: number[] = []; const v = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); o.localToWorld(v); out.push(v.x, v.y, v.z); }
  });
  return out;
}
const CELL = 0.06, OFF = 4096;
class Grid {
  map = new Map<number, number[]>(); flat: number[];
  constructor(flat: number[]) { this.flat = flat;
    for (let i = 0; i < flat.length; i += 3) { const k = this.key(flat[i], flat[i+1], flat[i+2]); let b = this.map.get(k); if (!b) this.map.set(k, b = []); b.push(i); } }
  key(x: number, y: number, z: number) { return ((Math.floor(x/CELL)+OFF)*8192 + (Math.floor(y/CELL)+OFF))*8192 + (Math.floor(z/CELL)+OFF); }
  nearest(x: number, y: number, z: number, cap: number) {
    let best = cap*cap, bi = -1;
    const bx = Math.floor(x/CELL), by = Math.floor(y/CELL), bz = Math.floor(z/CELL);
    const rings = Math.ceil(cap/CELL)+1;
    for (let r = 0; r <= rings; r++) {
      if (best <= (r-1)*CELL*(r-1)*CELL) break;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const b = this.map.get(((bx+dx+OFF)*8192+(by+dy+OFF))*8192+(bz+dz+OFF));
        if (!b) continue;
        for (const i of b) {
          const d = (this.flat[i]-x)**2 + (this.flat[i+1]-y)**2 + (this.flat[i+2]-z)**2;
          if (d < best) { best = d; bi = i; }
        }
      }
    }
    return { d2: best, index: bi };
  }
}
function dedupe(flat: number[], q: number) {
  const seen = new Set<string>(); const out: number[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    const k = `${Math.round(flat[i]/q)},${Math.round(flat[i+1]/q)},${Math.round(flat[i+2]/q)}`;
    if (seen.has(k)) continue; seen.add(k); out.push(flat[i], flat[i+1], flat[i+2]);
  }
  return out;
}
function bladeWorld(attachment: THREE.Object3D) {
  const out: number[] = []; const v = new THREE.Vector3();
  attachment.traverse((m: any) => { if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.localToWorld(v); out.push(v.x, v.y, v.z); } });
  return out;
}
function attachGladius(body: any) {
  let hand: THREE.Object3D | null = null;
  body.scene.traverse((o: any) => { if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o; });
  const a = new THREE.Group(); a.scale.setScalar(1/CORRECTION);
  const orient = new THREE.Group(); orient.rotation.set(Math.PI/2, 0, 0);
  orient.add(SkeletonUtils.clone(gladius.scene)); a.add(orient);
  hand!.add(a); body.root.updateMatrixWorld(true);
  return a;
}
const tipLocal = (() => {
  let best: THREE.Vector3 | null = null;
  gladius.scene.traverse((m: any) => { if (!m.isMesh) return; const p = m.geometry.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (!best || v.y > best.y) best = v.clone(); } });
  return best!;
})();
const handLocal = new THREE.Vector3();

function sweep(clip: string, sep: number, stepMs: number, lo = 0, hi = Infinity, q = 0.006) {
  const defender = buildBody(g, CORRECTION, { z: -sep/2 });
  const dPts = posedFlat(defender.scene);
  const grid = new Grid(dPts);
  let dFront = -Infinity, frontY = 0;
  let dMinX = Infinity, dMaxX = -Infinity;
  for (let i = 0; i < dPts.length; i += 3) { if (dPts[i+2] > dFront) { dFront = dPts[i+2]; frontY = dPts[i+1]; } }
  const attacker = buildBody(g, CORRECTION, { z: sep/2, rotY: Math.PI, clip, t: 0 });
  const attachment = attachGladius(attacker);
  const dur = attacker.clip.duration * 1000;
  const rows: any[] = [];
  for (let ms = Math.max(0, lo); ms <= Math.min(dur, hi); ms += stepMs) {
    attacker.mixer.setTime(ms/1000);
    attacker.root.updateMatrixWorld(true);
    let blade = bladeWorld(attachment);
    blade = dedupe(blade, q);
    let nearest = 99, nearIdx = -1;
    for (let i = 0; i < blade.length; i += 3) {
      const r = grid.nearest(blade[i], blade[i+1], blade[i+2], Math.min(0.45, Math.max(0.05, nearest)));
      if (r.d2 < nearest*nearest) { nearest = Math.min(nearest, Math.sqrt(r.d2)); nearIdx = i; }
    }
    let minZ = Infinity, fwd = [0,0,0];
    for (let i = 0; i < blade.length; i += 3) if (blade[i+2] < minZ) { minZ = blade[i+2]; fwd = [blade[i], blade[i+1], blade[i+2]]; }
    const tip = tipLocal.clone(); attachment.localToWorld(tip);
    let nearDef: any = null;
    if (nearIdx >= 0) {
      const r2 = grid.nearest(blade[nearIdx], blade[nearIdx+1], blade[nearIdx+2], 0.5);
      if (r2.index >= 0) nearDef = [dPts[r2.index], dPts[r2.index+1], dPts[r2.index+2]];
    }
    rows.push({ clipMs: +ms.toFixed(1), nearest: +nearest.toFixed(4),
      nearPt: nearIdx >= 0 ? blade.slice(nearIdx, nearIdx+3).map((n:number)=>+n.toFixed(3)) : null,
      nearDefY: nearDef ? +nearDef[1].toFixed(3) : null,
      nearDefDepth: nearDef ? +(nearDef[2] + sep/2).toFixed(3) : null,
      reach: +(sep/2 - minZ).toFixed(4), fwd: fwd.map((n:number)=>+n.toFixed(3)),
      tip: tip.toArray().map((n:number)=>+n.toFixed(3)) });
  }
  return { rows, dur, dFront: dFront + sep/2, dFrontY: frontY };
}

const clip = process.argv[2] || 'Sword_Attack';
const sep = Number(process.argv[3] || 1.8);
const t0 = Date.now();
const coarse = sweep(clip, sep, 1000/60);
let best = coarse.rows.reduce((a, b) => b.nearest < a.nearest ? b : a);
const refine = sweep(clip, sep, 1000/480, best.clipMs - 40, best.clipMs + 40, 0.003);
let rbest = refine.rows.reduce((a, b) => b.nearest < a.nearest ? b : a);
const impact = coarse.rows.reduce((a, b) => Math.abs(b.clipMs - CLIPS[clip]) < Math.abs(a.clipMs - CLIPS[clip]) ? b : a);
const maxReach = coarse.rows.reduce((a, b) => b.reach > a.reach ? b : a);
console.log(JSON.stringify({
  clip, sep, ms: Date.now()-t0, durationMs: +coarse.dur.toFixed(0),
  defenderFront: +coarse.dFront.toFixed(4), defenderFrontY: +coarse.dFrontY.toFixed(3),
  coarseMin: best, refinedMin: rbest, atImpact: impact, maxReach,
  axisGapAtImpact: +(sep - (impact.reach + coarse.dFront)).toFixed(4),
  axisGapAtMin: +(sep - (rbest.reach + coarse.dFront)).toFixed(4),
  reachSweep: coarse.rows.filter((r:any)=> r.clipMs % 100 === 0 || true).map((r:any)=>[r.clipMs, r.nearest, r.reach]),
}, null, 1));
