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
        <main className="boot">Loading Rentra…</main>
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
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <Header />
            <main id="main-content">{children}</main>
            <footer className="footer">
              <div className="footer-inner">
                <div>
                  <strong>rentra.</strong>
                  <p>Less paperwork. More possibilities.</p>
                </div>
                <p>
                  Built for everyday rentals. Deposits follow the contract’s rules, including late
                  fees and damage claims.
                </p>
                <span className="network-label">
                  <span className="status-dot" /> Ethereum Sepolia · Testnet
                </span>
              </div>
            </footer>
          </div>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
