import type { Abi, Address } from "viem";
import { sepolia } from "viem/chains";
import mockIdrJson from "@/abi/MockIDR.json";
import rentalItemJson from "@/abi/RentalItem.json";
import reputationJson from "@/abi/Reputation.json";
import rentalEscrowJson from "@/abi/RentalEscrow.json";
import sepoliaDeployment from "@/deployments/sepolia.json";

export const chain = sepolia;
export const SEPOLIA_CHAIN_ID = 11155111;

// Public endpoint, no API key. Override with NEXT_PUBLIC_SEPOLIA_RPC_URL.
const PUBLIC_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || PUBLIC_SEPOLIA_RPC;

// Privy rejects any app id whose length is not exactly 25. A real id comes from the
// Privy dashboard; this placeholder only lets the UI mount for local builds.
const PRIVY_PLACEHOLDER_APP_ID = "clplaceholderprivyappid01";

function privyId(value: string | undefined): string {
  if (value && value.length === 25) return value;
  return PRIVY_PLACEHOLDER_APP_ID;
}

export const privyAppId = privyId(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
export const privyConfigured = privyAppId !== PRIVY_PLACEHOLDER_APP_ID;

// Gas sponsorship is off unless NEXT_PUBLIC_PRIVY_SPONSOR_GAS is true.
// Off means the embedded wallet pays with its own Sepolia ETH.
function envFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export const sponsorGas = envFlag(process.env.NEXT_PUBLIC_PRIVY_SPONSOR_GAS);

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

type DeploymentFile = {
  chainId: number;
  contracts: {
    MockIDR: string;
    RentalItem: string;
    Reputation: string;
    RentalEscrow: string;
  };
};

const deployment = sepoliaDeployment as DeploymentFile;
const fileAddresses =
  deployment.chainId === SEPOLIA_CHAIN_ID ? deployment.contracts : undefined;

function addr(envValue: string | undefined, fileValue: string | undefined): Address | undefined {
  return parseAddr(envValue) ?? parseAddr(fileValue);
}

export const addresses = {
  idr: addr(process.env.NEXT_PUBLIC_MOCK_IDR_ADDRESS, fileAddresses?.MockIDR),
  item: addr(process.env.NEXT_PUBLIC_RENTAL_ITEM_ADDRESS, fileAddresses?.RentalItem),
  reputation: addr(process.env.NEXT_PUBLIC_REPUTATION_ADDRESS, fileAddresses?.Reputation),
  escrow: addr(process.env.NEXT_PUBLIC_RENTAL_ESCROW_ADDRESS, fileAddresses?.RentalEscrow),
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
