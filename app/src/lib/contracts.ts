import type { Abi, Address } from "viem";
import { baseSepolia } from "viem/chains";
import mockIdrJson from "@/abi/MockIDR.json";
import rentalItemJson from "@/abi/RentalItem.json";
import reputationJson from "@/abi/Reputation.json";
import rentalEscrowJson from "@/abi/RentalEscrow.json";

export const chain = baseSepolia;
export const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org";
export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "placeholder-privy-app-id";

export const mockIdrAbi = mockIdrJson as Abi;
export const rentalItemAbi = rentalItemJson as Abi;
export const reputationAbi = reputationJson as Abi;
export const rentalEscrowAbi = rentalEscrowJson as Abi;

function parseAddr(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return undefined;
  if (value.toLowerCase() === "0x0000000000000000000000000000000000000000") return undefined;
  return value as Address;
}

export const addresses = {
  idr: parseAddr(process.env.NEXT_PUBLIC_MOCK_IDR_ADDRESS),
  item: parseAddr(process.env.NEXT_PUBLIC_RENTAL_ITEM_ADDRESS),
  reputation: parseAddr(process.env.NEXT_PUBLIC_REPUTATION_ADDRESS),
  escrow: parseAddr(process.env.NEXT_PUBLIC_RENTAL_ESCROW_ADDRESS),
};

export const configured = Boolean(
  addresses.idr && addresses.item && addresses.reputation && addresses.escrow,
);

export const STATUS_LABEL = [
  "Menunggu serah terima",
  "Sedang disewa",
  "Dikembalikan",
  "Terlambat",
  "Klaim kerusakan",
  "Sengketa",
  "Selesai",
  "Tidak kembali",
  "Dibatalkan",
] as const;

export function statusLabel(status: number): string {
  return STATUS_LABEL[status] ?? "Tidak diketahui";
}
