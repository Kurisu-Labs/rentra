"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Icon } from "@/components/icon";

export function WalletConnectButton({
  label = "Connect MetaMask",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal }) => {
        if (!mounted)
          return (
            <button type="button" className={className} disabled>
              {label}
            </button>
          );
        if (!account || !chain)
          return (
            <button type="button" className={className} onClick={openConnectModal}>
              {label}
              <Icon name="arrow" size={16} />
            </button>
          );
        if (chain.unsupported)
          return (
            <button type="button" className={className} onClick={openChainModal}>
              Switch to Sepolia
            </button>
          );
        return (
          <button
            type="button"
            className={`secondary ${className}`}
            onClick={openAccountModal}
            aria-label={`Manage wallet ${account.displayName}`}
          >
            <span className="status-dot" />
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
