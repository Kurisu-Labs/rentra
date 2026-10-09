"use client";

import { createContext, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { errText } from "@/lib/format";

export type TxSender = (to: Address, data: Hex) => Promise<Hex>;

const TxSenderContext = createContext<TxSender | null>(null);

export function TxSenderProvider({ send, children }: { send: TxSender; children: React.ReactNode }) {
  return <TxSenderContext.Provider value={send}>{children}</TxSenderContext.Provider>;
}

export function useRentraTx() {
  const sendTx = useContext(TxSenderContext);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  async function send(to: Address, data: Hex) {
    if (!sendTx) throw new Error("Pengirim transaksi belum siap");
    setPending(true);
    setError(null);
    try {
      const txHash = await sendTx(to, data);
      setHash(txHash);
      await queryClient.invalidateQueries();
      return txHash;
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
