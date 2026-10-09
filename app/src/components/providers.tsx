"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrivyProvider, usePrivy, useSendTransaction as usePrivySendTransaction } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider, createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import {
  WagmiProvider,
  createConfig,
  useAccount,
  useConnect,
  usePublicClient,
  useSendTransaction,
} from "wagmi";
import { Header } from "@/components/header";
import { SessionProvider, type Session } from "@/components/session";
import { TxSenderProvider, type TxSender } from "@/components/use-tx";
import { chain, localWallet, privyAppId, rpcUrl } from "@/lib/contracts";
import { localAnvilConnector } from "@/lib/local-wallet";

const queryClient = new QueryClient();

export const wagmiConfig = createPrivyConfig({
  chains: [chain],
  transports: {
    [chain.id]: http(rpcUrl),
  },
});

const localConfig = localWallet
  ? createConfig({
      chains: [chain],
      connectors: [localAnvilConnector()],
      transports: {
        [chain.id]: http(rpcUrl),
      },
      batch: { multicall: false },
    })
  : null;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Header />
      <main>{children}</main>
      <footer className="footer">
        Deposit dikunci kontrak, bukan dititip ke salah satu pihak. Hash foto hanya membuktikan
        berkas itu sudah ada pada saat serah terima — hash tidak membuktikan foto itu asli atau
        tidak diedit. Di mode demo, 1 hari sewa berjalan dalam 2 menit.
      </footer>
    </div>
  );
}

function PrivyTxBridge({ children }: { children: React.ReactNode }) {
  const { sendTransaction } = usePrivySendTransaction();
  const send = useCallback<TxSender>(
    async (to, data) => {
      const result = await sendTransaction({ to, data, chainId: chain.id }, { sponsor: true });
      return result.hash;
    },
    [sendTransaction],
  );
  return <TxSenderProvider send={send}>{children}</TxSenderProvider>;
}

function PrivySessionBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();
  const value = useMemo<Session>(
    () => ({
      ready,
      authenticated,
      address,
      email: user?.email?.address || user?.google?.email,
      local: false,
      login,
      logout,
    }),
    [address, authenticated, login, logout, ready, user],
  );
  return <SessionProvider value={value}>{children}</SessionProvider>;
}

function LocalTxBridge({ children }: { children: React.ReactNode }) {
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();
  const send = useCallback<TxSender>(
    async (to, data) => {
      const hash = await sendTransactionAsync({ to, data });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [publicClient, sendTransactionAsync],
  );
  return <TxSenderProvider send={send}>{children}</TxSenderProvider>;
}

function LocalSessionBridge({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const started = useRef(false);

  useEffect(() => {
    if (isConnected || started.current) return;
    const connector = connectors[0];
    if (!connector) return;
    started.current = true;
    connect({ connector });
  }, [connect, connectors, isConnected]);

  const value = useMemo<Session>(
    () => ({
      ready: true,
      authenticated: Boolean(address),
      address,
      local: true,
      login: () => {
        const connector = connectors[0];
        if (connector) connect({ connector });
      },
      logout: () => {},
    }),
    [address, connect, connectors],
  );

  return <SessionProvider value={value}>{children}</SessionProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready) {
    return (
      <div className="app">
        <main className="boot">Memuat Rentra…</main>
      </div>
    );
  }

  if (localWallet && localConfig) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={localConfig}>
          <LocalTxBridge>
            <LocalSessionBridge>
              <Shell>{children}</Shell>
            </LocalSessionBridge>
          </LocalTxBridge>
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email", "google"],
        appearance: {
          theme: "light",
          accentColor: "#0e6b66",
          logo: undefined,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={wagmiConfig}>
          <PrivyTxBridge>
            <PrivySessionBridge>
              <Shell>{children}</Shell>
            </PrivySessionBridge>
          </PrivyTxBridge>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
