import type { Address, Hex } from "viem";
import { chain, addresses } from "@/lib/contracts";

export { handoverTypes, returnTypes, permitTypes } from "@/lib/signing-types";

export function escrowDomain() {
  if (!addresses.escrow)
    throw new Error("Rental bookings are unavailable. Please try again later.");
  return {
    name: "Rentra",
    version: "2",
    chainId: chain.id,
    verifyingContract: addresses.escrow,
  } as const;
}

export function idrDomain() {
  if (!addresses.idr) throw new Error("Test payments are unavailable. Please try again later.");
  return {
    name: "Mock Indonesian Rupiah",
    version: "1",
    chainId: chain.id,
    verifyingContract: addresses.idr as Address,
  } as const;
}

export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  let v = Number.parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}
