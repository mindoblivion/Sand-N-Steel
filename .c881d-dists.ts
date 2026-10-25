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
const dFlat = (() => { const d = body({ z: 0 }); const out: number[] = []; const v = new THREE.Vector3();
  d.scene.traverse((o: any) => { if (!o.isSkinnedMesh) return; o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); o.localToWorld(v); out.push(v.x, v.y, v.z); } }); return out; })();
const order = Array.from({ length: dFlat.length / 3 }, (_, i) => i).sort((a, b) => dFlat[a*3+2] - dFlat[b*3+2]);
const zs = new Float64Array(order.length); order.forEach((i, k) => zs[k] = dFlat[i*3+2]);
function nearest(x: number, y: number, z: number) {
  let lo = 0, hi = zs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (zs[m] < z - 0.8) lo = m + 1; else hi = m; }
  let best = Infinity, by = -1;
  for (let k = lo; k < zs.length && zs[k] <= z + 0.8; k++) { const i = order[k]*3;
    const d = (dFlat[i]-x)**2 + (dFlat[i+1]-y)**2 + (dFlat[i+2]-z)**2; if (d < best) { best = d; by = dFlat[i+1]; } }
  return { d: Math.sqrt(best), y: by };
}
const res: any = {};
for (const [clip, ms] of [['Sword_Attack', 548], ['Sword_Regular_C', 694]] as const) {
  for (const sep of [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1]) {
    const att = body({ z: sep/2, rotY: Math.PI, clip, t: 0 });
    let hand: any = null; att.scene.traverse((o: any) => { if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o; });
    const a = new THREE.Group(); a.scale.setScalar(1 / C);
    const orient = new THREE.Group(); orient.rotation.set(Math.PI/2, 0, 0);
    const clone = SkeletonUtils.clone(gl.scene); orient.add(clone); a.add(orient); hand.add(a);
    // move the whole defender set by -sep/2 in z by simple offset
    const dz = sep/2;
    att.mixer.setTime(ms/1000); att.root.updateMatrixWorld(true);
    const v = new THREE.Vector3(); const seen = new Set<string>(); let best = { d: Infinity, y: -1 };
    clone.traverse((m: any) => { if (!m.isMesh) return; const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.localToWorld(v);
        const k = `${Math.round(v.x*100)},${Math.round(v.y*100)},${Math.round(v.z*100)}`; if (seen.has(k)) continue; seen.add(k);
        const r = nearest(v.x, v.y, v.z + dz); if (r.d < best.d) best = r; } });
    res[`${clip}@${sep}`] = { nearest: +best.d.toFixed(3), y: +best.y.toFixed(2) };
  }
}
console.log(JSON.stringify(res, null, 1));
