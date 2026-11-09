export type DuelResultTimer = ReturnType<typeof setTimeout>;

export const scheduleDuelResult = (
  callback: () => void,
  delayMs: number,
  schedule: typeof setTimeout = setTimeout,
): DuelResultTimer => schedule(callback, delayMs);

export const cancelDuelResult = (
  timer: DuelResultTimer | null,
  cancel: typeof clearTimeout = clearTimeout,
): null => {
  if (timer !== null) cancel(timer);
  return null;
};
