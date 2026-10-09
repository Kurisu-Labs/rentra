"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import type { Address, Hex } from "viem";
import { chain } from "@/lib/contracts";
import { errText } from "@/lib/format";

export function useRentraTx() {
  const { address, chainId, isConnected } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
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
      if (!isConnected || !address) throw new Error("Connect MetaMask to continue.");
      if (chainId !== chain.id) await switchChainAsync({ chainId: chain.id });
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
    const transactionHash = await sendTransactionAsync({
      to,
      data,
      chainId: chain.id,
      account: address,
    });
    setHash(transactionHash);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });
    if (receipt.status !== "success")
      throw new Error("The transaction failed. Your request was not completed.");
    setConfirmed(true);
    await queryClient.invalidateQueries();
    return transactionHash;
  }

  return { run, send, pending, error, hash, confirmed };
}
