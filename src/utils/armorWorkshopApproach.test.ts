// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, collidesWith, PLAYER_RADIUS, type RectCollider } from './collisionShapes';
import { FAST_TRAVEL_ARRIVALS, HUB_LOCATIONS } from './cityCollisions';

describe('armor workshop city approach', () => {
  test('the workshop is spaced clear of the General Store foundation', () => {
    const byId = new Map(CITY_COLLIDERS.filter((c): c is RectCollider => c.type === 'rect').map((c) => [c.id, c]));
    const shop = byId.get('general-store');
    const workshop = byId.get('armor-workshop');
    expect(shop).toBeDefined();
    expect(workshop).toBeDefined();
    if (!shop || !workshop) return;

    const zGap = Math.abs(shop.cz - workshop.cz) - shop.hd - workshop.hd;
    expect(zGap).toBeGreaterThanOrEqual(2);
  });

  test('fast travel arrives outside all colliders on the workshop arch side', () => {
    const arrival = FAST_TRAVEL_ARRIVALS.armor_workshop;
    const workshop = HUB_LOCATIONS.find((location) => location.id === 'armor_workshop');
    expect(workshop).toBeDefined();
    expect(arrival[1]).toBeLessThan(workshop!.position[2]);
    expect(collidesWith(arrival[0], arrival[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(Math.hypot(arrival[0] - workshop!.position[0], arrival[1] - workshop!.position[2])).toBeLessThan(workshop!.radius);
  });
});
