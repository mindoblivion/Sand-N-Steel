import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';
const CORRECTION = 1.632, SEP = 1.8;
function loadGLB(path: string, base = '/models/'): Promise<any> {
  const b = readFileSync(path);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab as ArrayBuffer, base, res, rej));
}
console.warn = () => {};
const g = await loadGLB('/app/public/models/arena_roman.glb');
const gladius = await loadGLB('/app/public/models/weapons/gladius.glb', '/models/weapons/');
function body(opts: any = {}) {
  const { z = 0, rotY = 0, clip = 'Fighting_Idle', t = 0.4 } = opts;
  const scene = SkeletonUtils.clone(g.scene);
  const root = new THREE.Group();
  root.position.set(0, 0, z); root.rotation.y = rotY; root.scale.setScalar(CORRECTION); root.add(scene);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(THREE.AnimationClip.findByName(g.animations, clip)!).play(); mixer.setTime(t);
  root.updateMatrixWorld(true);
  return { root, scene, mixer };
}
const defender = body({ z: -SEP / 2 });
const dp: number[] = []; { const v = new THREE.Vector3();
  defender.scene.traverse((o: any) => { if (!o.isSkinnedMesh) return; o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); o.localToWorld(v); dp.push(v.x, v.y, v.z); } }); }
// 1-D slab index on z (independent of the earlier 3-D grid)
const idx = Array.from({ length: dp.length / 3 }, (_, i) => i).sort((a, b) => dp[a * 3 + 2] - dp[b * 3 + 2]);
const zs = new Float64Array(idx.length);
idx.forEach((i, k) => (zs[k] = dp[i * 3 + 2]));
function loBound(z: number) { let lo = 0, hi = zs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (zs[m] < z) lo = m + 1; else hi = m; } return lo; }
function nearestSlab(x: number, y: number, z: number, slab: number) {
  let best = Infinity, bi = -1;
  for (let k = loBound(z - slab); k < zs.length && zs[k] <= z + slab; k++) {
    const i = idx[k] * 3;
    const d = (dp[i] - x) ** 2 + (dp[i + 1] - y) ** 2 + (dp[i + 2] - z) ** 2;
    if (d < best) { best = d; bi = idx[k]; }
  }
  return { d: Math.sqrt(best), bi };
}
for (const [clip, from, to] of [['Sword_Attack', 500, 575], ['Sword_Regular_C', 630, 730]] as const) {
  const attacker = body({ z: SEP / 2, rotY: Math.PI, clip, t: 0 });
  let hand: any = null; attacker.scene.traverse((o: any) => { if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o; });
  const a = new THREE.Group(); a.scale.setScalar(1 / CORRECTION);
  const orient = new THREE.Group(); orient.rotation.set(Math.PI / 2, 0, 0);
  const w = SkeletonUtils.clone(gladius.scene); orient.add(w); a.add(orient); hand.add(a);
  attacker.root.updateMatrixWorld(true);
  let mesh: any = null, tipIdx = -1, maxY = -Infinity;
  w.traverse((m: any) => { if (!m.isMesh) return; const p = m.geometry.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.y > maxY) { maxY = v.y; tipIdx = i; } } mesh = m; });
  const out: any[] = [];
  for (let ms = from; ms <= to; ms += 1) {
    attacker.mixer.setTime(ms / 1000); attacker.root.updateMatrixWorld(true);
    // dense blade sampling (1 cm dedupe through a Set of quantised coords), brute force against the slab index
    const v = new THREE.Vector3(); const seen = new Set<string>(); let best = { d: Infinity, bi: -1 };
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); mesh.localToWorld(v);
      const k = `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;
      if (seen.has(k)) continue; seen.add(k);
      const r = nearestSlab(v.x, v.y, v.z, 0.7);
      if (r.d < best.d) best = r;
    }
    const tip = new THREE.Vector3(); tip.fromBufferAttribute(p, tipIdx); mesh.localToWorld(tip);
    const tipHit = nearestSlab(tip.x, tip.y, tip.z, 0.7);
    out.push([ms, +best.d.toFixed(4), +(best.bi >= 0 ? dp[best.bi * 3 + 1] : -1).toFixed(2), +tip.y.toFixed(3), +tipHit.d.toFixed(4)]);
  }
  const min = out.reduce((a, b) => (b[1] < a[1] ? b : a));
  console.log(clip, 'independent min', JSON.stringify(min));
  console.log('  ms  minDist  defY  tipY  tipDist');
  for (const r of out) if (r[0] % 4 === 0) console.log(' ', r.join('  '));
}
