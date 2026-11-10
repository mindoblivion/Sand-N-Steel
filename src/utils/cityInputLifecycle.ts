/** Reset transient city movement controls across WebView lifecycle changes. */
type MutableRef<T> = { current: T };

export function resetCityInputState(
  keysPressed: MutableRef<Record<string, boolean>>,
  touchVectorRef: MutableRef<{ x: number; z: number }>,
  touchIdRef: MutableRef<number | null>,
  lastTimeRef: MutableRef<number>,
  now: number
): void {
  keysPressed.current = {};
  touchVectorRef.current = { x: 0, z: 0 };
  touchIdRef.current = null;
  lastTimeRef.current = now;
}
