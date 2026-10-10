"use client";

import { useEffect, useState } from "react";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { ProtocolNotice } from "@/components/use-protocol";
import { chain } from "@/lib/contracts";
import { wagmiConfig } from "@/lib/wallet";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
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
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={chain}
          locale="en-US"
          modalSize="compact"
          theme={lightTheme({
            accentColor: "#245c48",
            accentColorForeground: "#ffffff",
            borderRadius: "medium",
            fontStack: "system",
          })}
        >
          <div className="app">
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <Header />
            <main id="main-content"><ProtocolNotice />{children}</main>
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
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
