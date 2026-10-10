/** Seconds until an onchain claim deadline. A missing or zero deadline is not open. */
export function claimSecondsRemaining(deadline: bigint, nowSeconds: number): number {
  if (deadline <= 0n || deadline > BigInt(Number.MAX_SAFE_INTEGER)) return 0;
  const now = Math.floor(nowSeconds);
  if (!Number.isFinite(now)) return 0;
  return Math.max(0, Number(deadline) - now);
}

export function isClaimWindowOpen(deadline: bigint, nowSeconds: number): boolean {
  return claimSecondsRemaining(deadline, nowSeconds) > 0;
}

/** Finalize only after a recorded deadline has passed in real time. */
export function canFinalizeClaim(deadline: bigint | undefined, nowSeconds: number): boolean {
  if (deadline === undefined || deadline <= 0n) return false;
  return !isClaimWindowOpen(deadline, nowSeconds);
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}
