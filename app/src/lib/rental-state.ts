import type { ChainProbe, ContractRead } from "./chain-probe";

function at(value: unknown, index: number): unknown {
  return Array.isArray(value) ? value[index] : undefined;
}

export function rentalStatus(row: unknown): number | undefined {
  const status = at(row, 10);
  if (typeof status === "bigint" || typeof status === "number") {
    const value = Number(status);
    return Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}

export function statusIs(row: unknown, expected: number | readonly number[]): boolean {
  const status = rentalStatus(row);
  if (status === undefined) return false;
  return typeof expected === "number" ? status === expected : expected.includes(status);
}

export async function expectRentalStatus(
  probe: ChainProbe,
  rentalId: bigint,
  expected: number | readonly number[],
): Promise<boolean> {
  return statusIs(await probe.read({ functionName: "rentals", args: [rentalId] }), expected);
}

export async function expectIncreased(
  probe: ChainProbe,
  request: ContractRead,
  before: unknown,
): Promise<boolean> {
  const next = await probe.read(request);
  return typeof next === "bigint" && typeof before === "bigint" && next > before;
}
