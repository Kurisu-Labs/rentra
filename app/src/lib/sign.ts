import type { Address, Hex } from "viem";
import { chain, addresses } from "@/lib/contracts";

export const handoverTypes = {
  Handover: [
    { name: "rentalId", type: "uint256" },
    { name: "photoHash", type: "bytes32" },
    { name: "timestamp", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const returnTypes = {
  Return: [
    { name: "rentalId", type: "uint256" },
    { name: "photoHash", type: "bytes32" },
    { name: "timestamp", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function escrowDomain() {
  if (!addresses.escrow) throw new Error("Alamat escrow belum diisi");
  return {
    name: "Rentra",
    version: "1",
    chainId: chain.id,
    verifyingContract: addresses.escrow,
  } as const;
}

export function idrDomain() {
  if (!addresses.idr) throw new Error("Alamat mIDR belum diisi");
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
