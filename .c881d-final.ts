import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';
const C = 1.632;
function loadGLB(path: string, base = '/models/'): Promise<any> {
  const b = readFileSync(path); const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab as ArrayBuffer, base, res, rej));
}
console.warn = () => {};
const g = await loadGLB('/app/public/models/arena_roman.glb');
const gl = await loadGLB('/app/public/models/weapons/gladius.glb', '/models/weapons/');
function body(o: any = {}) {
  const { z = 0, rotY = 0, clip = 'Fighting_Idle', t = 0.4 } = o;
  const scene = SkeletonUtils.clone(g.scene); const root = new THREE.Group();
  root.position.set(0, 0, z); root.rotation.y = rotY; root.scale.setScalar(C); root.add(scene);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(THREE.AnimationClip.findByName(g.animations, clip)!).play(); mixer.setTime(t);
  root.updateMatrixWorld(true); return { root, scene, mixer };
}
function worldBody(o: any) {
  const b = body(o); const out: number[] = []; const v = new THREE.Vector3(); let sm: any = null;
  b.scene.traverse((m: any) => { if (!m.isSkinnedMesh) return; sm = m; m.skeleton.update();
    const n = m.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) { m.getVertexPosition(i, v); m.localToWorld(v); out.push(v.x, v.y, v.z); } });
  return { points: out, mesh: sm };
}
const rc = new THREE.Raycaster();
function strike(clip: string, ms: number, sep: number) {
  const def = worldBody({ z: -sep/2 });
  const mats = Array.isArray(def.mesh.material) ? def.mesh.material : [def.mesh.material];
  for (const m of mats) m.side = THREE.DoubleSide;   // measurement only: parity needs both faces
  const att = body({ z: sep/2, rotY: Math.PI, clip, t: 0 });
  let hand: any = null; att.scene.traverse((o: any) => { if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o; });
  const a = new THREE.Group(); a.scale.setScalar(1 / C);
  const orient = new THREE.Group(); orient.rotation.set(Math.PI/2, 0, 0);
  const clone = SkeletonUtils.clone(gl.scene); orient.add(clone); a.add(orient); hand!.add(a);
  att.mixer.setTime(ms/1000); att.root.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = []; const seen = new Set<string>(); const v = new THREE.Vector3();
  clone.traverse((m: any) => { if (!m.isMesh) return; const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.localToWorld(v);
      const k = `${Math.round(v.x*200)},${Math.round(v.y*200)},${Math.round(v.z*200)}`;
      if (seen.has(k)) continue; seen.add(k); pts.push(v.clone()); } });
  // exact nearest (defender points are the real, correctly placed ones)
  const S = def.points;
  const order = Array.from({ length: S.length/3 }, (_, i) => i).sort((a, b) => S[a*3+2] - S[b*3+2]);
  const zs = new Float64Array(order.length); order.forEach((i, k) => zs[k] = S[i*3+2]);
  let lo0 = 0, hi0 = zs.length;
  const lb = (z: number) => { let lo = 0, hi = zs.length; while (lo < hi) { const m2 = (lo+hi)>>1; if (zs[m2] < z) lo = m2+1; else hi = m2; } return lo; };
  let best = { d: Infinity, p: null as THREE.Vector3|null, b: null as number[]|null };
  const near: {p: THREE.Vector3, d: number}[] = [];
  for (const p of pts) {
    let bd = Infinity, bi = -1;
    for (let k = lb(p.z - 0.9); k < zs.length && zs[k] <= p.z + 0.9; k++) {
      const i = order[k]*3; const d = (S[i]-p.x)**2 + (S[i+1]-p.y)**2 + (S[i+2]-p.z)**2;
      if (d < bd) { bd = d; bi = i; }
    }
    const d = Math.sqrt(bd);
    if (d < best.d) best = { d, p: p.clone(), b: [S[bi], S[bi+1], S[bi+2]] };
    if (d < 0.08) near.push({ p, d });
  }
  near.sort((a, b) => a.d - b.d);
  let inside = 0, tested = 0;
  for (const q of near.slice(0, 40)) {
    tested++;
    rc.set(q.p.clone(), new THREE.Vector3(0, 0, 1)); rc.far = 6;
    const hits = rc.intersectObject(def.mesh, false);
    if (hits.length % 2 === 1) inside++;
  }
  return { clip, ms, sep, nearest: +best.d.toFixed(4), bladePt: best.p?.toArray().map((n:number)=>+n.toFixed(3)),
    bodyPt: best.b?.map((n:number)=>+n.toFixed(3)), candidatesUnder8cm: near.length, tested, inside };
}
for (const [clip, ms] of [['Sword_Attack', 548], ['Sword_Regular_C', 694]] as const)
  for (const sep of [1.2, 1.5, 1.8])
    console.log(JSON.stringify(strike(clip, ms, sep)));
