/** Tavern east entrance: safe, prop-clear connector from Via Socialis. */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, PLAYER_RADIUS, collidesWith, collidesRect, collidesCircle, type RectCollider, type CircleCollider } from './collisionShapes';
import { HUB_LOCATIONS, getNearbyHubLocation } from './cityCollisions';
import { VIA_SOCIALIS, TAVERN_EAST_ENTRANCE_APPROACH } from './streetGeometry';

const route = [{x:-11,z:17.5},{x:-11,z:14}] as const;
const nearbyProps: Array<RectCollider | CircleCollider> = [
  // C-8.21 cypress planter, well south of the east-side doorway corridor.
  {type:'circle',id:'tavern-east-cypress',cx:-11.5,cz:8.55,r:0.8925},
  // C-8.22 street bench and barrels; conservative circular envelopes.
  {type:'circle',id:'tavern-south-bench',cx:-13.8,cz:8.4,r:1.1},
  {type:'circle',id:'tavern-south-barrel-a',cx:-15.5,cz:9.1,r:0.4},
  {type:'circle',id:'tavern-south-barrel-b',cx:-16.9,cz:9.1,r:0.5},
  // C-8.24 built-in patio table/barrel group.
  {type:'rect',id:'tavern-patio-table',cx:-19.27,cz:9.35,hw:0.7,hd:0.6},
  {type:'rect',id:'tavern-patio-barrel-stack',cx:-19.17,cz:8.15,hw:0.83,hd:0.38},
];

function sample(a:{x:number;z:number},b:{x:number;z:number},visit:(x:number,z:number)=>void) {
  const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/0.05);
  for(let i=0;i<=n;i++){const t=i/n;visit(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);}
}

describe('Tavern east entrance paving',()=>{
  test('connector overlaps Via Socialis and remains clear of the Tavern foundation',()=>{
    expect(TAVERN_EAST_ENTRANCE_APPROACH.cz-TAVERN_EAST_ENTRANCE_APPROACH.d/2)
      .toBeLessThan(VIA_SOCIALIS.cz+VIA_SOCIALIS.d/2);
    expect(TAVERN_EAST_ENTRANCE_APPROACH.cz+TAVERN_EAST_ENTRANCE_APPROACH.d/2)
      .toBeGreaterThan(VIA_SOCIALIS.cz-VIA_SOCIALIS.d/2);
    // The west edge leaves 0.05 m to the Tavern collider's east face.
    expect(TAVERN_EAST_ENTRANCE_APPROACH.cx-TAVERN_EAST_ENTRANCE_APPROACH.w/2)
      .toBeGreaterThan(-11.55);
  });

  test('the full player-radius route clears every registered city collider',()=>{
    sample(route[0],route[1],(x,z)=>{
      expect(collidesWith(x,z,PLAYER_RADIUS,CITY_COLLIDERS),`route point (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
    });
  });

  test('the full route clears the surveyed Tavern patio and south forecourt props',()=>{
    sample(route[0],route[1],(x,z)=>{
      for(const prop of nearbyProps){
        const hit=prop.type==='rect'
          ? collidesRect(x,z,PLAYER_RADIUS,prop)
          : collidesCircle(x,z,PLAYER_RADIUS,prop);
        expect(hit,`${prop.id} at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
      }
    });
  });

  test('the door-side endpoint raises the Tavern prompt, not a neighbouring hub',()=>{
    const tavern=HUB_LOCATIONS.find(x=>x.id==='tavern');
    expect(tavern?.radius).toBe(5.75);
    expect(getNearbyHubLocation([-11,0,14])?.id).toBe('tavern');
    expect(Math.hypot(-11-tavern!.position[0],14-tavern!.position[2])).toBeLessThan(tavern!.radius);
  });
});
