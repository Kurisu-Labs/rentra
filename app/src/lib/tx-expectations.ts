import type { ChainProbe, ContractRead } from "./chain-probe";
import { statusIs } from "./rental-state";

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
