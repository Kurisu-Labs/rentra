import { tupleAt } from "./format";

export function rentalStatus(row: unknown): number | undefined {
  const status = tupleAt(row, 10);
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
