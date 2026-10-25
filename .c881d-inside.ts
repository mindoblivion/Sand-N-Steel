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
// sanity: is a point at the torso centre reported as inside by +Z ray parity?
const d = body({ z: 0 });
let sm: any = null; d.scene.traverse((o: any) => { if (o.isSkinnedMesh) sm = o; });
sm.skeleton.update();
const rc = new THREE.Raycaster();
function insideCount(x: number, y: number, z: number) {
  rc.set(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, 1));
  rc.firstHitOnly = false;
  const hits = rc.intersectObject(sm, false);
  return hits.length;
}
function penetration(clip: string, ms: number, sep: number) {
  const att = body({ z: sep/2, rotY: Math.PI, clip, t: 0 });
  let hand: any = null; att.scene.traverse((o: any) => { if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o; });
  const a = new THREE.Group(); a.scale.setScalar(1 / C);
  const orient = new THREE.Group(); orient.rotation.set(Math.PI/2, 0, 0);
  const clone = SkeletonUtils.clone(gl.scene); orient.add(clone); a.add(orient); hand.add(a);
  att.mixer.setTime(ms/1000); att.root.updateMatrixWorld(true);
  const def = body({ z: -sep/2 }); let ds: any = null; def.scene.traverse((o: any) => { if (o.isSkinnedMesh) ds = o; });
  ds.skeleton.update(); def.scene.updateMatrixWorld(true);
  const mats = Array.isArray(ds.material) ? ds.material : [ds.material];
  for (const mm of mats) mm.side = THREE.DoubleSide; // measurement only (parity needs both faces)
  const centrePts: number[] = []; { const vv = new THREE.Vector3();
    def.scene.traverse((o: any) => { if (!o.isSkinnedMesh) return; o.skeleton.update();
      const n = o.geometry.attributes.position.count;
      for (let i = 0; i < n; i += 7) { o.getVertexPosition(i, vv); o.localToWorld(vv); centrePts.push(vv.x, vv.y, vv.z); } }); }
  const dPts = centrePts;
  const defCentre = new THREE.Vector3(0, 1.0, -sep/2);
  const v = new THREE.Vector3(); let inside = 0, total = 0; const seen = new Set<string>();
  clone.traverse((m: any) => { if (!m.isMesh) return; const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); m.localToWorld(v);
      const k = `${Math.round(v.x*200)},${Math.round(v.y*200)},${Math.round(v.z*200)}`; if (seen.has(k)) continue; seen.add(k);
      total++;
      if (v.distanceToSquared(defCentre) < 1.2 * 1.2) {
        let close = false;
        for (let j = 0; j < dPts.length; j += 3) {
          if ((dPts[j]-v.x)**2 + (dPts[j+1]-v.y)**2 + (dPts[j+2]-v.z)**2 < 0.06*0.06) { close = true; break; }
        }
        if (close) {
          rc.set(v.clone(), new THREE.Vector3(0, 0, 1)); rc.far = 5;
          const hits = rc.intersectObject(ds, false);
          if (hits.length % 2 === 1) inside++;
        }
      }
    } });
  return { total, inside };
}
for (const [clip, frames] of [['Sword_Attack', [519, 548]], ['Sword_Regular_C', [659, 694]]] as const)
  for (const ms of frames)
    for (const sep of [1.2, 1.3, 1.4, 1.6, 1.8, 2.1])
      console.log(clip, 'ms', ms, 'sep', sep, JSON.stringify(penetration(clip, ms, sep)));
