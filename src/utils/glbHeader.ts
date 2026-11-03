/**
 * Validate the four-byte GLB magic without buffering the full model.
 *
 * A server may ignore the Range request and return a multi-megabyte GLB. Read
 * only enough of the response stream to identify its header, then cancel the
 * remainder so availability checks do not download the model a second time.
 */
export async function responseHasGlbMagic(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return hasGlbMagic(bytes);
  }

  const header = new Uint8Array(4);
  let offset = 0;
  try {
    while (offset < header.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const count = Math.min(value.length, header.length - offset);
      header.set(value.subarray(0, count), offset);
      offset += count;
    }
    if (offset < header.length) return false;
    return hasGlbMagic(header);
  } finally {
    if (offset >= header.length) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function hasGlbMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4 &&
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46;
}
