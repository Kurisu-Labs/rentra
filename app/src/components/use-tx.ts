"use client";

import { useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { chain } from "@/lib/contracts";
import { errText } from "@/lib/format";

export function useRentraTx() {
  const { sendTransaction } = useSendTransaction();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  async function send(to: Address, data: Hex) {
    setPending(true);
    setError(null);
    try {
      const result = await sendTransaction({ to, data, chainId: chain.id }, { sponsor: true });
      setHash(result.hash);
      await queryClient.invalidateQueries();
      return result.hash;
    } catch (caught) {
      const message = errText(caught);
      setError(message);
      throw caught;
    } finally {
      setPending(false);
    }
  }

  return { send, pending, error, hash, setError };
}
