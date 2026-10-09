"use client";

import { useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, Hex } from "viem";
import { chain, sponsorGas } from "@/lib/contracts";
import { errText } from "@/lib/format";

export function useRentraTx() {
  const { sendTransaction } = useSendTransaction();
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId: chain.id });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    setHash(null);
    setConfirmed(false);
    try {
      await action();
    } catch (caught) {
      setError(errText(caught));
    } finally {
      setPending(false);
    }
  }

  async function send(to: Address, data: Hex) {
    if (!publicClient) throw new Error("Unable to connect. Please refresh and try again.");
    setHash(null);
    setConfirmed(false);
    const result = await sendTransaction(
      { to, data, chainId: chain.id },
      sponsorGas ? { sponsor: true } : undefined,
    );
    setHash(result.hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: result.hash });
    if (receipt.status !== "success")
      throw new Error("The transaction failed. Your request was not completed.");
    setConfirmed(true);
    await queryClient.invalidateQueries();
    return result.hash;
  }

  return { run, send, pending, error, hash, confirmed };
}
