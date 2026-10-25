import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';
const REPO = '/app/';
const CORRECTION = 1.632;
function loadGLB(path: string, base = '/models/'): Promise<any> {
  const buffer = readFileSync(path);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab as ArrayBuffer, base, res, rej));
}
console.warn = () => {};
const g = await loadGLB(`${REPO}public/models/arena_roman.glb`);
const gladius = await loadGLB(`${REPO}public/models/weapons/gladius.glb`, '/models/weapons/');

function buildBody(correction: number, opts: any = {}) {
  const { z = 0, rotY = 0, clip = 'Fighting_Idle', t = 0.4 } = opts;
  const scene = SkeletonUtils.clone(g.scene);
  const root = new THREE.Group();
  root.position.set(0, 0, z); root.rotation.y = rotY; root.scale.setScalar(correction);
  root.add(scene);
  const mixer = new THREE.AnimationMixer(root);
  const found = THREE.AnimationClip.findByName(g.animations, clip)!;
  mixer.clipAction(found).play(); mixer.setTime(t);
  root.updateMatrixWorld(true);
  return { root, scene, mixer, clip: found };
}
function posedFlat(scene: THREE.Object3D) {
  const out: number[] = []; const v = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => { if (!o.isSkinnedMesh) return; o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); o.localToWorld(v); out.push(v.x, v.y, v.z); } });
  return out;
}
const CELL = 0.06, OFF = 4096;
class Grid {
  map = new Map<number, number[]>(); flat: number[];
  constructor(flat: number[]) { this.flat = flat;
    for (let i = 0; i < flat.length; i += 3) { const k = this.key(flat[i],flat[i+1],flat[i+2]); let b=this.map.get(k); if(!b)this.map.set(k,b=[]); b.push(i); } }
  key(x:number,y:number,z:number){return ((Math.floor(x/CELL)+OFF)*8192+(Math.floor(y/CELL)+OFF))*8192+(Math.floor(z/CELL)+OFF);}
  nearest(x:number,y:number,z:number,cap:number){ let best=cap*cap,bi=-1;
    const bx=Math.floor(x/CELL),by=Math.floor(y/CELL),bz=Math.floor(z/CELL),rings=Math.ceil(cap/CELL)+1;
    for(let r=0;r<=rings;r++){ if(best<=(r-1)*CELL*(r-1)*CELL)break;
      for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)for(let dz=-r;dz<=r;dz++){
        if(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))!==r)continue;
        const b=this.map.get(((bx+dx+OFF)*8192+(by+dy+OFF))*8192+(bz+dz+OFF)); if(!b)continue;
        for(const i of b){const d=(this.flat[i]-x)**2+(this.flat[i+1]-y)**2+(this.flat[i+2]-z)**2; if(d<best){best=d;bi=i;}}}}
    return {d2:best,index:bi}; }
}
function dedupe(flat:number[],q:number){const seen=new Set<string>();const out:number[]=[];
  for(let i=0;i<flat.length;i+=3){const k=`${Math.round(flat[i]/q)},${Math.round(flat[i+1]/q)},${Math.round(flat[i+2]/q)}`; if(seen.has(k))continue; seen.add(k); out.push(flat[i],flat[i+1],flat[i+2]);} return out;}
function attachGladius(body:any){
  let hand:THREE.Object3D|null=null; body.scene.traverse((o:any)=>{if(o.type==='Bone'&&/^hand_r$/i.test(o.name))hand=o;});
  const a=new THREE.Group(); a.scale.setScalar(1/CORRECTION);
  const orient=new THREE.Group(); orient.rotation.set(Math.PI/2,0,0);
  orient.add(SkeletonUtils.clone(gladius.scene)); a.add(orient);
  hand!.add(a); body.root.updateMatrixWorld(true);
  // locate tip vertex in this clone
  let mesh:any=null, idx=-1, maxY=-Infinity;
  a.traverse((m:any)=>{ if(!m.isMesh) return; const p=m.geometry.attributes.position; const v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i); if(v.y>maxY){maxY=v.y;idx=i;}} if(maxY>-Infinity) mesh=m; });
  return { attachment: a, mesh, idx };
}
function bladeWorld(attachment:THREE.Object3D){ const out:number[]=[]; const v=new THREE.Vector3();
  attachment.traverse((m:any)=>{ if(!m.isMesh)return; const p=m.geometry.attributes.position;
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i); m.localToWorld(v); out.push(v.x,v.y,v.z);} }); return out; }

function scan(clip:string, sep:number, from:number, to:number, step:number){
  const defender = buildBody(CORRECTION,{z:-sep/2});
  const dPts = posedFlat(defender.scene); const grid = new Grid(dPts);
  let dFront=-Infinity, dFrontY=0, dFrontX=0, halfW=[];
  for(let i=0;i<dPts.length;i+=3){ if(dPts[i+2]>dFront){dFront=dPts[i+2];dFrontY=dPts[i+1];dFrontX=dPts[i];} }
  const attacker = buildBody(CORRECTION,{z:sep/2,rotY:Math.PI,clip,t:0});
  const {attachment,mesh,idx} = attachGladius(attacker);
  const rows:any[]=[];
  for(let ms=from; ms<=to; ms+=step){
    attacker.mixer.setTime(ms/1000); attacker.root.updateMatrixWorld(true);
    const blade = dedupe(bladeWorld(attachment),0.003);
    let nearest=99, nearIdx=-1;
    // visit the blade points nearest the defender first so the cap shrinks at once
    const order:number[]=[];
    for(let i=0;i<blade.length;i+=3) order.push(i);
    order.sort((a,b)=>blade[a+2]-blade[b+2]);
    for(const i of order){ const cap=Math.min(0.45, Math.max(0.06, nearest));
      const r=grid.nearest(blade[i],blade[i+1],blade[i+2],cap); const d=Math.sqrt(r.d2); if(d<nearest){nearest=d;nearIdx=i;} }
    let dIdx=-1; if(nearIdx>=0){ const r=grid.nearest(blade[nearIdx],blade[nearIdx+1],blade[nearIdx+2],0.6); dIdx=r.index; }
    let minZ=Infinity,fwd:any=[0,0,0];
    for(let i=0;i<blade.length;i+=3) if(blade[i+2]<minZ){minZ=blade[i+2];fwd=[blade[i],blade[i+1],blade[i+2]];}
    const tip=new THREE.Vector3(); tip.fromBufferAttribute(mesh.geometry.attributes.position, idx); mesh.localToWorld(tip);
    const tipR = grid.nearest(tip.x,tip.y,tip.z,Math.min(1.2, Math.max(0.06, nearest + 0.3)));
    // blade axis: hand -> tip
    const handPos = new THREE.Vector3(); mesh.getWorldPosition(handPos);
    rows.push({
      ms:+ms.toFixed(1), nearest:+nearest.toFixed(3),
      nb: nearIdx>=0? blade.slice(nearIdx,nearIdx+3).map((n:number)=>+n.toFixed(3)):null,
      db: dIdx>=0? [dPts[dIdx],dPts[dIdx+1],dPts[dIdx+2]].map((n:number)=>+n.toFixed(3)):null,
      reach:+(sep/2-minZ).toFixed(3),
      fwd: fwd.map((n:number)=>+n.toFixed(3)),
      tip: tip.toArray().map((n:number)=>+n.toFixed(3)),
      tipDist: +Math.sqrt(tipR.d2).toFixed(3),
    });
  }
  return { sep, defenderFront:+(dFront+sep/2).toFixed(4), defenderFrontPt:[+dFrontX.toFixed(3),+dFrontY.toFixed(3),+dFront.toFixed(3)], rows };
}
const clip = process.argv[2] || 'Sword_Attack';
const FROM = Number(process.argv[3] || 470);
const TO = Number(process.argv[4] || 620);
const out:any = { clip };
for (const sep of [1.8, 1.2, 2.1]) {
  const s = scan(clip, sep, FROM, TO, 4);
  let best = s.rows.reduce((a:any,b:any)=> b.nearest<a.nearest?b:a);
  let bestTip = s.rows.reduce((a:any,b:any)=> b.tipDist<a.tipDist?b:a);
  out[`sep${sep}`] = { defenderFront: s.defenderFront, frontPt: s.defenderFrontPt, best, bestTip,
    rows: s.rows.map((r:any)=>[r.ms, r.nearest, r.reach, r.tip[1], r.fwd[1], r.tipDist]) };
  console.log(`sep ${sep} done`);
}
console.log(JSON.stringify(out,null,0));
