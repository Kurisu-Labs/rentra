type Integration = { idr?: string; item?: string; reputation?: string; escrow?: string };

export function isSafeProtocol(version: unknown, references: unknown[], expected: Integration): boolean {
  if (version !== 2n) return false;
  const wanted = [expected.idr, expected.item, expected.reputation, expected.escrow, expected.escrow];
  return wanted.every((address, index) =>
    typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address) &&
    address.toLowerCase() !== "0x0000000000000000000000000000000000000000" &&
    typeof references[index] === "string" && references[index].toLowerCase() === address.toLowerCase(),
  );
}
