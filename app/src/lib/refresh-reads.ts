/** Brief follow-up reads after a receipt, long enough for a lagging public RPC to catch up. */
export const READ_REFRESH_ATTEMPTS = 8;
export const READ_REFRESH_INTERVAL_MS = 1_500;

export function shouldStopRefresh(input: {
  attempt: number;
  maxAttempts: number;
  latestBlock?: bigint;
  receiptBlock: bigint;
  expectedMatched?: boolean;
  matchedSince?: number;
}): boolean {
  if (input.attempt >= input.maxAttempts - 1) return true;
  if (input.expectedMatched !== true) return false;
  if (input.matchedSince === undefined || input.attempt <= input.matchedSince) return false;
  if (input.latestBlock === undefined || input.latestBlock < input.receiptBlock) return false;
  return true;
}

let refreshGeneration = 0;

export function startRefreshGeneration(): number {
  refreshGeneration += 1;
  return refreshGeneration;
}

export function isRefreshCurrent(id: number): boolean {
  return id === refreshGeneration;
}
