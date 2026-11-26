// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  DUEL_CAMERA_MAX_DISTANCE,
  DUEL_CAMERA_MIN_DISTANCE,
  DUEL_PINCH_DEAD_ZONE_PX,
  createPinchZoomTracker,
  pinchDistance,
  resolvePinchZoom,
} from './duelPinchZoom';

describe('duel pinch zoom', () => {
  test('the clamp is the shipped camera range', () => {
    expect(DUEL_CAMERA_MIN_DISTANCE).toBe(3.5);
    expect(DUEL_CAMERA_MAX_DISTANCE).toBe(16);
  });

  test('fingers apart moves the camera in, fingers together moves it out', () => {
    // Anchor spread 100 px at distance 8.5 (cinematic): doubling the spread
    // halves the distance, halving the spread doubles it.
    expect(resolvePinchZoom(100, 200, 8.5)).toBeCloseTo(4.25);
    expect(resolvePinchZoom(100, 50, 8.5)).toBeCloseTo(16);
    expect(resolvePinchZoom(100, 150, 8.5)).toBeCloseTo(8.5 * (100 / 150));
  });

  test('a pinch past either end lands on the end, not past it', () => {
    // Spread up 10x from the anchor: the ratio alone would ask for 0.85.
    expect(resolvePinchZoom(100, 1000, 8.5)).toBe(DUEL_CAMERA_MIN_DISTANCE);
    // Spread down 10x: the ratio alone would ask for 85.
    expect(resolvePinchZoom(100, 10, 8.5)).toBe(DUEL_CAMERA_MAX_DISTANCE);
    // A pinch that starts at an end stays at that end.
    expect(resolvePinchZoom(100, 200, DUEL_CAMERA_MIN_DISTANCE)).toBe(DUEL_CAMERA_MIN_DISTANCE);
    expect(resolvePinchZoom(100, 50, DUEL_CAMERA_MAX_DISTANCE)).toBe(DUEL_CAMERA_MAX_DISTANCE);
  });

  test('a sub-threshold spread change moves nothing', () => {
    expect(DUEL_PINCH_DEAD_ZONE_PX).toBe(8);
    // 7 px either way is jitter, not a pinch: the anchor distance comes back.
    expect(resolvePinchZoom(100, 107, 8.5)).toBe(8.5);
    expect(resolvePinchZoom(100, 93, 8.5)).toBe(8.5);
    // 8 px is a pinch: the distance moves.
    expect(resolvePinchZoom(100, 108, 8.5)).toBeLessThan(8.5);
    expect(resolvePinchZoom(100, 92, 8.5)).toBeGreaterThan(8.5);
  });

  test('a degenerate anchor never divides by zero', () => {
    expect(resolvePinchZoom(0, 100, 8.5)).toBe(8.5);
    expect(resolvePinchZoom(-5, 100, 8.5)).toBe(8.5);
    expect(resolvePinchZoom(100, 0, 8.5)).toBe(8.5);
  });

  test('pinchDistance is the Euclidean spread', () => {
    expect(pinchDistance(0, 0, 3, 4)).toBe(5);
    expect(pinchDistance(10, 10, 10, 10)).toBe(0);
  });

  test('the tracker anchors on the second finger and never jumps', () => {
    const tracker = createPinchZoomTracker();
    // First finger down: no gesture, no zoom.
    tracker.pointerDown(1, 100, 100, 8.5);
    expect(tracker.pointerMove(1, 110, 100)).toBeNull();
    expect(tracker.pointerMove(1, 100, 100)).toBeNull();
    // Second finger down at 100 px spread: the anchor is 8.5 at 100 px, so a
    // move that keeps the spread returns the anchor exactly — no jump.
    tracker.pointerDown(2, 200, 100, 8.5);
    expect(tracker.pointerMove(2, 200, 100)).toBe(8.5);
    expect(tracker.pointerMove(1, 100, 100)).toBe(8.5);
    // Spread doubled: the distance halves.
    expect(tracker.pointerMove(2, 300, 100)).toBeCloseTo(4.25);
    // Spread back to the anchor: the distance is back at the anchor.
    expect(tracker.pointerMove(2, 200, 100)).toBe(8.5);
  });

  test('a single-pointer drag produces no zoom delta at all', () => {
    const tracker = createPinchZoomTracker();
    tracker.pointerDown(1, 100, 100, 8.5);
    expect(tracker.pointerMove(1, 200, 100)).toBeNull();
    expect(tracker.pointerMove(1, 300, 150)).toBeNull();
    // An untracked pointer moves nothing either.
    expect(tracker.pointerMove(99, 300, 150)).toBeNull();
  });

  test('lifting a finger ends the gesture; the next pinch re-anchors', () => {
    const tracker = createPinchZoomTracker();
    tracker.pointerDown(1, 100, 100, 8.5);
    tracker.pointerDown(2, 200, 100, 8.5);
    expect(tracker.pointerMove(2, 300, 100)).toBeCloseTo(4.25);
    tracker.pointerUp(2);
    // One pointer left: no zoom, however far it moves — but the move still
    // updates where that pointer is, so bring it back before re-anchoring.
    expect(tracker.pointerMove(1, 400, 100)).toBeNull();
    expect(tracker.pointerMove(1, 100, 100)).toBeNull();
    // A new second finger re-anchors at the LIVE distance (6.0 now, not 8.5),
    // so the new gesture starts where the camera is, not where it was. The
    // anchor spread is 400 px (fingers at 100 and 500); widening it to 500
    // moves the distance to 6.0 * 400 / 500 = 4.8.
    tracker.pointerDown(3, 500, 100, 6.0);
    expect(tracker.pointerMove(3, 500, 100)).toBe(6.0);
    expect(tracker.pointerMove(3, 600, 100)).toBeCloseTo(4.8);
  });

  test('cancel releases the gesture outright', () => {
    const tracker = createPinchZoomTracker();
    tracker.pointerDown(1, 100, 100, 8.5);
    tracker.pointerDown(2, 200, 100, 8.5);
    expect(tracker.pointerMove(2, 300, 100)).toBeCloseTo(4.25);
    tracker.cancel();
    expect(tracker.pointerMove(1, 400, 100)).toBeNull();
    expect(tracker.pointerMove(2, 400, 100)).toBeNull();
    // After a cancel the next gesture anchors fresh.
    tracker.pointerDown(1, 100, 100, 11.0);
    tracker.pointerDown(2, 200, 100, 11.0);
    expect(tracker.pointerMove(2, 200, 100)).toBe(11.0);
  });

  test('a third finger is ignored, not a second gesture', () => {
    const tracker = createPinchZoomTracker();
    tracker.pointerDown(1, 100, 100, 8.5);
    tracker.pointerDown(2, 200, 100, 8.5);
    tracker.pointerDown(3, 500, 500, 8.5);
    // The gesture is still the first two fingers: moving the third does nothing.
    expect(tracker.pointerMove(3, 600, 500)).toBeNull();
    expect(tracker.pointerMove(2, 300, 100)).toBeCloseTo(4.25);
  });
});
