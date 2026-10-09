"use client";

import { connectorsForWallets, type Wallet } from "@rainbow-me/rainbowkit";
import { createConfig, createConnector, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain, rpcUrl } from "@/lib/contracts";

type InjectedProvider = {
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
};

// Injected MetaMask only: the extension or MetaMask's in-app browser provides the wallet.
const metaMaskInjectedWallet = (): Wallet => {
  const ethereum =
    typeof window === "undefined"
      ? undefined
      : (window as unknown as { ethereum?: InjectedProvider }).ethereum;

  return {
    id: "metaMask",
    name: "MetaMask",
    rdns: "io.metamask",
    iconUrl: "/metamask.svg",
    iconBackground: "#ffffff",
    installed: Boolean(
      ethereum?.isMetaMask || ethereum?.providers?.some((provider) => provider.isMetaMask),
    ),
    downloadUrls: {
      browserExtension: "https://metamask.io/download/",
      mobile: "https://metamask.io/download/",
    },
    extension: {
      instructions: {
        learnMoreUrl: "https://metamask.io/download/",
        steps: [
          {
            step: "install",
            title: "Install MetaMask",
            description:
              "Add the MetaMask extension or open Rentra in the MetaMask mobile browser.",
          },
          {
            step: "create",
            title: "Set up your wallet",
            description: "Create a wallet or use your existing MetaMask wallet.",
          },
          {
            step: "refresh",
            title: "Return to Rentra",
            description: "Refresh this page, then connect MetaMask and select Ethereum Sepolia.",
          },
        ],
      },
    },
    createConnector: (walletDetails) =>
      createConnector((config) => ({
        ...injected({ target: "metaMask", shimDisconnect: true })(config),
        ...walletDetails,
      })),
  };
};

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: connectorsForWallets(
    [{ groupName: "Connect your wallet", wallets: [metaMaskInjectedWallet] }],
    // RainbowKit requires this option in its API; the injected connector does not use it.
    { appName: "Rentra", projectId: "" },
  ),
  multiInjectedProviderDiscovery: false,
  transports: { [chain.id]: http(rpcUrl) },
  ssr: true,
});
