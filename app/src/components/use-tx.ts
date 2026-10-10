"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import type { Address, Hex, PublicClient } from "viem";
import { addresses, chain, rentalEscrowAbi } from "@/lib/contracts";
import type { ChainProbe, ContractRead } from "@/lib/chain-probe";
import { isSafeProtocol } from "@/lib/protocol";
import {
  READ_REFRESH_ATTEMPTS,
  READ_REFRESH_INTERVAL_MS,
  isRefreshCurrent,
  shouldStopRefresh,
  startRefreshGeneration,
} from "@/lib/refresh-reads";
import { protocolReads, useProtocol } from "@/components/use-protocol";
import { errText } from "@/lib/format";

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeProbe(publicClient: PublicClient): ChainProbe {
  return {
    async read(request: ContractRead) {
      const address = request.address ?? addresses.escrow;
      const abi = request.abi ?? rentalEscrowAbi;
      if (!address) throw new Error("Rental contracts are not configured.");
      return publicClient.readContract({
        address,
        abi,
        functionName: request.functionName,
        args: request.args,
      } as Parameters<PublicClient["readContract"]>[0]);
    },
  };
}

async function refreshUntilSettled(options: {
  refreshId: number;
  publicClient: PublicClient;
  queryClient: ReturnType<typeof useQueryClient>;
  receiptBlock: bigint;
  until?: (probe: ChainProbe) => Promise<boolean>;
}) {
  const probe = makeProbe(options.publicClient);
  let matchedSince: number | undefined;
  for (let attempt = 0; attempt < READ_REFRESH_ATTEMPTS; attempt += 1) {
    if (!isRefreshCurrent(options.refreshId)) return;
    let latestBlock: bigint | undefined;
    let expectedMatched: boolean | undefined;
    try {
      latestBlock = await options.publicClient.getBlockNumber({ cacheTime: 0 });
    } catch {
      latestBlock = undefined;
    }
    if (options.until) {
      try {
        expectedMatched = await options.until(probe);
      } catch {
        expectedMatched = false;
      }
    }
    if (expectedMatched === true && matchedSince === undefined) matchedSince = attempt;
    try {
      await options.queryClient.refetchQueries({ type: "active" });
    } catch {
      // A rate-limited read should not hide the confirmed transaction.
    }
    if (
      shouldStopRefresh({
        attempt,
        maxAttempts: READ_REFRESH_ATTEMPTS,
        latestBlock,
        receiptBlock: options.receiptBlock,
        expectedMatched,
        matchedSince,
      })
    ) {
      return;
    }
    await delay(READ_REFRESH_INTERVAL_MS);
  }
}

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
  const protocol = useProtocol();

  async function checkProtocol() {
    if (!publicClient) throw new Error("Unable to connect. Please refresh and try again.");
    const [actualChain, ...values] = await Promise.all([
      publicClient.getChainId(),
      ...protocolReads.map((contract) => {
        if (!contract.address) throw new Error("Rental contracts are not configured.");
        return publicClient.readContract({ ...contract, address: contract.address });
      }),
    ]);
    if (actualChain !== chain.id || !isSafeProtocol(values[0], values.slice(1), addresses)) {
      throw new Error("Transactions are disabled: the connected rental contracts do not match the updated rules.");
    }
  }

  async function read(request: ContractRead) {
    if (!publicClient) throw new Error("Unable to connect. Please refresh and try again.");
    return makeProbe(publicClient).read(request);
  }

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    setHash(null);
    setConfirmed(false);
    try {
      if (!isConnected || !address) throw new Error("Connect MetaMask to continue.");
      await checkProtocol();
      if (chainId !== chain.id) await switchChainAsync({ chainId: chain.id });
      await action();
    } catch (caught) {
      setError(errText(caught));
    } finally {
      setPending(false);
    }
  }

  async function send(to: Address, data: Hex, until?: (probe: ChainProbe) => Promise<boolean>) {
    if (!publicClient) throw new Error("Unable to connect. Please refresh and try again.");
    await checkProtocol();
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
    try {
      await queryClient.invalidateQueries();
    } catch {
      // Confirmation still stands; the follow-up poll retries the reads.
    }
    const refreshId = startRefreshGeneration();
    void refreshUntilSettled({
      refreshId,
      publicClient,
      queryClient,
      receiptBlock: receipt.blockNumber,
      until,
    });
    return transactionHash;
  }

  return { run, send, read, pending, error, hash, confirmed, writable: protocol.ready };
}
