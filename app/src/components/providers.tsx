"use client";

import { useEffect, useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { Header } from "@/components/header";
import { chain, privyAppId, rpcUrl } from "@/lib/contracts";

const queryClient = new QueryClient();

export const wagmiConfig = createConfig({
  chains: [chain],
  transports: {
    [chain.id]: http(rpcUrl),
  },
});

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
        <WagmiProvider config={wagmiConfig}>
          <div className="app">
            <Header />
            <main>{children}</main>
            <footer className="footer">
              Deposit dikunci kontrak, bukan dititip ke salah satu pihak. Hash foto hanya
              membuktikan berkas itu sudah ada pada saat serah terima — hash tidak membuktikan
              foto itu asli atau tidak diedit. Di mode demo, 1 hari sewa berjalan dalam 2 menit.
            </footer>
          </div>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
