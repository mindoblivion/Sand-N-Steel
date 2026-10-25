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
const CELL = 0.1, OFF = 2048;
class TriGrid {
  map = new Map<number, number[]>(); tris: THREE.Triangle[] = []; normals: THREE.Vector3[] = [];
  key(ix: number, iy: number, iz: number) { return ((ix + OFF) * 4096 + (iy + OFF)) * 4096 + (iz + OFF); }
  add(t: THREE.Triangle) {
    const idx = this.tris.length; this.tris.push(t);
    const n = new THREE.Vector3(); t.getNormal(n); this.normals.push(n);
    const min = new THREE.Vector3(Math.min(t.a.x,t.b.x,t.c.x), Math.min(t.a.y,t.b.y,t.c.y), Math.min(t.a.z,t.b.z,t.c.z));
    const max = new THREE.Vector3(Math.max(t.a.x,t.b.x,t.c.x), Math.max(t.a.y,t.b.y,t.c.y), Math.max(t.a.z,t.b.z,t.c.z));
    for (let ix = Math.floor(min.x/CELL); ix <= Math.floor(max.x/CELL); ix++)
      for (let iy = Math.floor(min.y/CELL); iy <= Math.floor(max.y/CELL); iy++)
        for (let iz = Math.floor(min.z/CELL); iz <= Math.floor(max.z/CELL); iz++) {
          const k = this.key(ix, iy, iz); let b = this.map.get(k); if (!b) this.map.set(k, b = []); b.push(idx);
        }
  }
  nearest(p: THREE.Vector3, maxR: number) {
    const bx = Math.floor(p.x/CELL), by = Math.floor(p.y/CELL), bz = Math.floor(p.z/CELL);
    let best = maxR * maxR, bi = -1; const cp = new THREE.Vector3();
    const rings = Math.ceil(maxR / CELL);
    for (let r = 0; r <= rings; r++) {
      if (best <= (r - 1) * CELL * (r - 1) * CELL) break;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const b = this.map.get(this.key(bx+dx, by+dy, bz+dz)); if (!b) continue;
        for (const i of b) {
          const d2 = this.tris[i].closestPointToPoint(p, cp).distanceToSquared(p);
          if (d2 < best) { best = d2; bi = i; }
        }
      }
    }
    if (bi < 0) return { d: maxR, inside: false, cp: null as any };
    this.tris[bi].closestPointToPoint(p, cp);
    const n = this.normals[bi];
    const inside = (p.x - cp.x) * n.x + (p.y - cp.y) * n.y + (p.z - cp.z) * n.z < 0;
    return { d: Math.sqrt(best), inside, cp: cp.clone() };
  }
}
function buildGrid(sep: number) {
  const b = body({ z: -sep/2 }); let sm: any = null;
  b.scene.traverse((o: any) => { if (o.isSkinnedMesh) sm = o; });
  sm.skeleton.update(); b.scene.updateMatrixWorld(true);
  const pos = sm.geometry.attributes.position; const n = pos.count;
  const world: THREE.Vector3[] = []; const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { sm.getVertexPosition(i, v); sm.localToWorld(v); world.push(v.clone()); }
  const index = sm.geometry.index; const grid = new TriGrid(); const count = index ? index.count : n;
  for (let i = 0; i < count; i += 3) {
    const a = world[index ? index.getX(i) : i], bb = world[index ? index.getX(i+1) : i+1], c = world[index ? index.getX(i+2) : i+2];
    if (!a || !bb || !c) continue;
    grid.add(new THREE.Triangle(a.clone(), bb.clone(), c.clone()));
  }
  return grid;
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
const grids: Record<string, TriGrid> = { '1.2': buildGrid(1.2), '1.4': buildGrid(1.4), '1.8': buildGrid(1.8) };
const rows: any[] = [];
for (const clip of ['Sword_Attack', 'Sword_Regular_C']) {
  const times = clip === 'Sword_Attack' ? [519, 536, 540, 544, 546, 548, 550, 554, 560] : [659, 680, 684, 688, 690, 692, 694, 696, 700, 704];
  for (const ms of times) for (const sep of ['1.2', '1.4', '1.8']) {
    const pts = blade(Number(sep), clip, ms);
    let best = { d: Infinity, inside: false, pt: null as any };
    for (const p of pts) { const r = grids[sep].nearest(p, 0.6); if (r.d < best.d) best = { d: r.d, inside: r.inside, pt: p }; }
    rows.push({ clip, ms, sep: Number(sep), surfaceDist: +best.d.toFixed(4), inside: best.inside, pt: best.pt?.toArray().map((x:number)=>+x.toFixed(3)) });
  }
}
for (const r of rows) console.log(JSON.stringify(r));
