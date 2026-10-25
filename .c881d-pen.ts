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
const dPts: number[] = (() => { const d = body({}); const out: number[] = []; const v = new THREE.Vector3();
  d.scene.traverse((o: any) => { if (!o.isSkinnedMesh) return; o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); o.localToWorld(v); out.push(v.x, v.y, v.z); } }); return out; })();
const rc = new THREE.Raycaster();
function probe(clip: string, ms: number, sep: number) {
  const def = body({ z: -sep/2 }); let ds: any = null;
  def.scene.traverse((o: any) => { if (o.isSkinnedMesh) ds = o; });
  ds.skeleton.update(); def.scene.updateMatrixWorld(true);
  const mats = Array.isArray(ds.material) ? ds.material : [ds.material];
  for (const mm of mats) mm.side = THREE.DoubleSide;
  const att = body({ z: sep/2, rotY: Math.PI, clip, t: 0 });
  let hand: any = null; att.scene.traverse((o: any) => { if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o; });
  const a = new THREE.Group(); a.scale.setScalar(1 / C);
  const orient = new THREE.Group(); orient.rotation.set(Math.PI/2, 0, 0);
  const clone = SkeletonUtils.clone(gl.scene); orient.add(clone); a.add(orient); hand!.add(a);
  att.mixer.setTime(ms/1000); att.root.updateMatrixWorld(true);
  const v = new THREE.Vector3(); const pts: THREE.Vector3[] = []; const seen = new Set<string>();
  let minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  clone.traverse((m: any) => { if (!m.isMesh) return; const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.localToWorld(v);
      const k = `${Math.round(v.x*200)},${Math.round(v.y*200)},${Math.round(v.z*200)}`; if (seen.has(k)) continue; seen.add(k);
      pts.push(v.clone());
      minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); } });
  // nearest distance (full body vertices)
  let best = { d: Infinity, p: null as THREE.Vector3 | null, b: null as number[] | null };
  for (const p of pts) for (let j = 0; j < dPts.length; j += 3) {
    const dx = dPts[j] - p.x, dy = dPts[j+1] - p.y, dz = dPts[j+2] - (p.z + sep); // body at -sep/2 vs blade in +sep/2 world
    const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (d < best.d) best = { d, p: p.clone(), b: [dPts[j], dPts[j+1], dPts[j+2] - sep] };
  }
  // parity test on the small candidate set (within 4 cm of the body)
  const cands = pts.filter((p) => Math.hypot(p.x, p.y - 1.0, p.z + sep) < 1.0 && best.d < 0.06
    ? true : false);
  let inside = 0, tested = 0;
  for (const p of pts) {
    // cheap: only test points near the body silhouette bbox
    const dz = p.z + sep; // body-frame z
    if (dz < -0.45 || dz > 0.45 || p.y < 0 || p.y > 1.85 || Math.abs(p.x) > 0.55) continue;
    if (!(cands.length >= 0)) continue;
    tested++;
    if (tested > 60) break;
    rc.set(p.clone(), new THREE.Vector3(0, 0, 1)); rc.far = 5;
    const hits = rc.intersectObject(ds, false);
    if (hits.length % 2 === 1) inside++;
  }
  return { sep, ms, nearest: +best.d.toFixed(4), nearestBlade: best.p?.toArray().map(n=>+n.toFixed(3)),
    nearestBody: best.b?.map(n=>+n.toFixed(3)),
    bladeBox: { x: [+minX.toFixed(3), +maxX.toFixed(3)], y: [+minY.toFixed(3), +maxY.toFixed(3)], z: [+minZ.toFixed(3), +maxZ.toFixed(3)] },
    insideTested: tested, inside };
}
for (const [clip, ms] of [['Sword_Attack', 519], ['Sword_Attack', 548], ['Sword_Regular_C', 659], ['Sword_Regular_C', 694]] as const)
  for (const sep of [1.2, 1.4, 1.8])
    console.log(clip, ms, JSON.stringify(probe(clip, ms, sep)));
