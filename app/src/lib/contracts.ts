import type { Abi, Address } from "viem";
import { baseSepolia, type Chain } from "viem/chains";
import mockIdrJson from "@/abi/MockIDR.json";
import rentalItemJson from "@/abi/RentalItem.json";
import reputationJson from "@/abi/Reputation.json";
import rentalEscrowJson from "@/abi/RentalEscrow.json";

export const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org";

function isLoopbackRpc(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/// Local Anvil mode. Refuses to turn on unless the RPC is loopback, so the unlocked
/// dev accounts cannot be pointed at a public chain.
export const localWallet =
  process.env.NEXT_PUBLIC_LOCAL_WALLET === "1" && isLoopbackRpc(rpcUrl);

export const chain: Chain = localWallet
  ? {
      ...baseSepolia,
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    }
  : baseSepolia;

// Privy rejects any app id whose length is not exactly 25. A real id comes from the
// Privy dashboard; this placeholder only lets the UI mount for local builds.
const PRIVY_PLACEHOLDER_APP_ID = "clplaceholderprivyappid01";

function privyId(value: string | undefined): string {
  if (value && value.length === 25) return value;
  return PRIVY_PLACEHOLDER_APP_ID;
}

export const privyAppId = privyId(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
export const privyConfigured = privyAppId !== PRIVY_PLACEHOLDER_APP_ID;

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
