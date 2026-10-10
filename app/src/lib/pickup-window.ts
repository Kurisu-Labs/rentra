/** Pickup stays closed until the rental's on-chain start time. */
export function isPickupOpen(start: bigint | undefined, nowSeconds: number): boolean {
  if (start === undefined || start <= 0n || start > BigInt(Number.MAX_SAFE_INTEGER)) return true;
  const now = Math.floor(nowSeconds);
  if (!Number.isFinite(now)) return true;
  return now >= Number(start);
}

export function pickupSecondsRemaining(start: bigint | undefined, nowSeconds: number): number {
  if (isPickupOpen(start, nowSeconds) || start === undefined || start > BigInt(Number.MAX_SAFE_INTEGER)) {
    return 0;
  }
  return Math.max(0, Number(start) - Math.floor(nowSeconds));
}

/** Local clock time, HH:MM. */
export function formatPickupClock(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
