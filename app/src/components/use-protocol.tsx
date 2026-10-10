"use client";

import { useReadContracts } from "wagmi";
import { addresses, chain, configured, rentalEscrowAbi, rentalItemAbi, reputationAbi } from "@/lib/contracts";
import { isSafeProtocol } from "@/lib/protocol";

export const protocolReads = [
  { address: addresses.escrow, abi: rentalEscrowAbi, functionName: "PROTOCOL_VERSION", chainId: chain.id },
  { address: addresses.escrow, abi: rentalEscrowAbi, functionName: "idr", chainId: chain.id },
  { address: addresses.escrow, abi: rentalEscrowAbi, functionName: "item", chainId: chain.id },
  { address: addresses.escrow, abi: rentalEscrowAbi, functionName: "reputation", chainId: chain.id },
  { address: addresses.item, abi: rentalItemAbi, functionName: "escrow", chainId: chain.id },
  { address: addresses.reputation, abi: reputationAbi, functionName: "escrow", chainId: chain.id },
];

export function useProtocol() {
  const read = useReadContracts({
    contracts: protocolReads,
    query: { enabled: configured, retry: false, refetchInterval: 30_000 },
  });
  const values = read.data?.map((entry) => entry.result) ?? [];
  return { ready: configured && isSafeProtocol(values[0], values.slice(1), addresses), loading: read.isLoading };
}

export function ProtocolNotice() {
  const protocol = useProtocol();
  if (protocol.ready) return null;
  return (
    <p className="notice warn" role="status">
      {protocol.loading
        ? "Checking the rental contracts before enabling transactions…"
        : "Read-only mode: this deployment could not be verified with the updated rental rules. Transactions and signatures are disabled until a compatible deployment is connected. Earlier deployments do not have the safeguards described here."}
    </p>
  );
}
