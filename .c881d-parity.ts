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
// posed triangles + distance grid + ray (x,z column) grid
const CELL = 0.1, OFF = 2048;
class Solid {
  tris: THREE.Triangle[] = [];
  dist = new Map<number, number[]>();
  col = new Map<number, number[]>();
  k3(ix: number, iy: number, iz: number) { return ((ix + OFF) * 4096 + (iy + OFF)) * 4096 + (iz + OFF); }
  k2(ix: number, iz: number) { return (ix + OFF) * 4096 + (iz + OFF); }
  add(t: THREE.Triangle) {
    const i = this.tris.length; this.tris.push(t);
    const xs = [t.a.x, t.b.x, t.c.x], ys = [t.a.y, t.b.y, t.c.y], zs = [t.a.z, t.b.z, t.c.z];
    for (let ix = Math.floor(Math.min(...xs)/CELL); ix <= Math.floor(Math.max(...xs)/CELL); ix++)
      for (let iy = Math.floor(Math.min(...ys)/CELL); iy <= Math.floor(Math.max(...ys)/CELL); iy++)
        for (let iz = Math.floor(Math.min(...zs)/CELL); iz <= Math.floor(Math.max(...zs)/CELL); iz++) {
          const k = this.k3(ix, iy, iz); let b = this.dist.get(k); if (!b) this.dist.set(k, b = []); b.push(i); }
    for (let ix = Math.floor(Math.min(...xs)/CELL); ix <= Math.floor(Math.max(...xs)/CELL); ix++)
      for (let iz = Math.floor(Math.min(...zs)/CELL); iz <= Math.floor(Math.max(...zs)/CELL); iz++) {
        const k = this.k2(ix, iz); let b = this.col.get(k); if (!b) this.col.set(k, b = []); b.push(i); }
  }
  nearest(p: THREE.Vector3, maxR = 0.6) {
    const bx = Math.floor(p.x/CELL), by = Math.floor(p.y/CELL), bz = Math.floor(p.z/CELL);
    let best = maxR*maxR, bi = -1; const cp = new THREE.Vector3();
    for (let r = 0; r <= Math.ceil(maxR/CELL); r++) {
      if (best <= (r-1)*CELL*(r-1)*CELL) break;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const b = this.dist.get(this.k3(bx+dx, by+dy, bz+dz)); if (!b) continue;
        for (const i of b) { const d2 = this.tris[i].closestPointToPoint(p, cp).distanceToSquared(p); if (d2 < best) { best = d2; bi = i; } } } }
    return Math.sqrt(best);
  }
  inside(p: THREE.Vector3) { // parity along +Z over posed triangles
    let hits = 0; const ray = new THREE.Ray(p.clone(), new THREE.Vector3(0, 0, 1)); const hit = new THREE.Vector3();
    const ix = Math.floor(p.x/CELL), iz = Math.floor(p.z/CELL);
    for (const i of this.col.get(this.k2(ix, iz)) ?? []) {
      const t = this.tris[i];
      if (ray.intersectTriangle(t.a, t.b, t.c, false, hit)) hits++;
    }
    return hits % 2 === 1;
  }
}
function solid(sep: number) {
  const b = body({ z: -sep/2 }); let sm: any = null;
  b.scene.traverse((o: any) => { if (o.isSkinnedMesh) sm = o; });
  sm.skeleton.update(); b.scene.updateMatrixWorld(true);
  const pos = sm.geometry.attributes.position, n = pos.count, v = new THREE.Vector3();
  const w: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) { sm.getVertexPosition(i, v); sm.localToWorld(v); w.push(v.clone()); }
  const idx = sm.geometry.index; const S = new Solid();
  const count = idx ? idx.count : n;
  for (let i = 0; i < count; i += 3) {
    const a = w[idx ? idx.getX(i) : i], bb = w[idx ? idx.getX(i+1) : i+1], c = w[idx ? idx.getX(i+2) : i+2];
    if (a && bb && c) S.add(new THREE.Triangle(a.clone(), bb.clone(), c.clone()));
  }
  return S;
}
function blade(sep: number, clip: string, ms: number) {
  const att = body({ z: sep/2, rotY: Math.PI, clip, t: 0 });
  let hand: any = null; att.scene.traverse((o: any) => { if (o.type === 'Bone' && /^hand_r$/i.test(o.name)) hand = o; });
  const a = new THREE.Group(); a.scale.setScalar(1 / C);
  const orient = new THREE.Group(); orient.rotation.set(Math.PI/2, 0, 0);
  const clone = SkeletonUtils.clone(gl.scene); orient.add(clone); a.add(orient); hand!.add(a);
  att.mixer.setTime(ms/1000); att.root.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = []; const seen = new Set<string>(); const v = new THREE.Vector3();
  clone.traverse((m: any) => { if (!m.isMesh) return; const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.localToWorld(v);
      const k = `${Math.round(v.x*200)},${Math.round(v.y*200)},${Math.round(v.z*200)}`; if (seen.has(k)) continue; seen.add(k);
      pts.push(v.clone()); } });
  return pts;
}
const cache: Record<number, Solid> = {};
for (const [clip, frames] of [['Sword_Attack', [540, 542, 544, 546, 548]], ['Sword_Regular_C', [688, 690, 692, 694, 696]]] as const) {
  for (const sep of [1.2, 1.8]) {
    cache[sep] ??= solid(sep);
    for (const ms of frames) {
      const pts = blade(sep, clip, ms);
      let minD = Infinity, insideN = 0, maxDepth = 0;
      for (const p of pts) { const d = cache[sep].nearest(p); if (d < minD) minD = d;
        if (d < 0.12 && cache[sep].inside(p)) { insideN++; if (d > maxDepth) maxDepth = d; } }
      console.log(JSON.stringify({ clip, ms, sep, surfaceDist: +minD.toFixed(4), insidePoints: insideN, maxPenetration: +maxDepth.toFixed(4) }));
    }
  }
}
