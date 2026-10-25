/** Small, non-sensitive per-chat scroll coordinates in temporary session storage. */
export function scrollStorageKey(chatId: string): string {
  return "headroom:handover:scroll:" + chatId;
}

/** Reject corrupt or absurdly large values returned by browser storage. */
export function validScrollY(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10_000_000
  );
}

/** Ignore a synthetic scroll-to-top caused by a collapsed document. */
export function shouldRecordScroll(
  previous: number | undefined,
  current: number,
  availableMax: number,
): boolean {
  if (!validScrollY(current)) return false;
  if (
    previous !== undefined &&
    previous > 120 &&
    availableMax + 10 < previous &&
    current + 10 < previous
  )
    return false;
  return true;
}