// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { hasGlbMagic, responseHasGlbMagic } from './glbHeader';

describe('GLB header validation', () => {
  test('recognizes the little-endian glTF binary magic', () => {
    expect(hasGlbMagic(new Uint8Array([0x67, 0x6c, 0x54, 0x46]))).toBe(true);
    expect(hasGlbMagic(new Uint8Array([0x3c, 0x68, 0x74, 0x6d]))).toBe(false);
    expect(hasGlbMagic(new Uint8Array([0x67, 0x6c, 0x54]))).toBe(false);
  });

  test('reads only the first four bytes and cancels the remaining response', async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    }));

    expect(await responseHasGlbMagic(response)).toBe(true);
    expect(cancelled).toBe(true);
  });

  test('rejects truncated response streams', async () => {
    const response = new Response(new Uint8Array([0x67, 0x6c, 0x54]));
    expect(await responseHasGlbMagic(response)).toBe(false);
  });
});
