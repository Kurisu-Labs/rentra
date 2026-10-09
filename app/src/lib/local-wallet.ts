"use client";

import { createConnector, type CreateConnectorFn } from "wagmi";
import { getAddress, numberToHex, type Address } from "viem";

/// Anvil's default unlocked accounts (chain id 84532 in scripts/local-dev.sh).
/// The browser never sees their keys. Transactions are eth_sendTransaction to loopback RPC.
export const LOCAL_ACCOUNTS = [
  { label: "Pemilik", address: getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266") },
  { label: "Penyewa", address: getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8") },
  { label: "Akun ketiga", address: getAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC") },
] as const;

export const LOCAL_ACCOUNT_STORAGE_KEY = "rentra-local-account";

let activeIndex = 0;
const listeners = new Set<(address: Address) => void>();

export function activeLocalIndex(): number {
  return activeIndex;
}

export function setActiveAccount(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= LOCAL_ACCOUNTS.length) return;
  activeIndex = index;
  const address = LOCAL_ACCOUNTS[index].address;
  for (const listener of listeners) listener(address);
}

export function localAnvilConnector(): CreateConnectorFn {
  return createConnector((config) => {
    let connected = false;

    return {
      id: "localAnvil",
      name: "Anvil lokal",
      type: "localAnvil",
      async setup() {
        listeners.add((address) => {
          if (!connected) return;
          config.emitter.emit("change", { accounts: [address] });
        });
      },
      async connect({ withCapabilities }: { withCapabilities?: boolean } = {}) {
        connected = true;
        const address = LOCAL_ACCOUNTS[activeIndex].address;
        return {
          accounts: (withCapabilities ? [{ address, capabilities: {} }] : [address]) as never,
          chainId: config.chains[0].id,
        };
      },
      async disconnect() {
        connected = false;
      },
      async getAccounts() {
        if (!connected) return [];
        return [LOCAL_ACCOUNTS[activeIndex].address];
      },
      async getChainId() {
        return config.chains[0].id;
      },
      async isAuthorized() {
        return connected;
      },
      async switchChain({ chainId }) {
        const next = config.chains.find((item) => item.id === chainId);
        if (!next) throw new Error("Chain tidak dikenali");
        return next;
      },
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {
        connected = false;
      },
      async getProvider() {
        const url = config.chains[0].rpcUrls.default.http[0];
        return {
          async request({ method, params }: { method: string; params?: unknown }) {
            if (method === "eth_chainId") return numberToHex(config.chains[0].id);
            if (method === "eth_accounts" || method === "eth_requestAccounts") {
              return [LOCAL_ACCOUNTS[activeIndex].address];
            }
            const response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method,
                params: params ?? [],
              }),
            });
            const json = (await response.json()) as {
              result?: unknown;
              error?: { message?: string };
            };
            if (!response.ok || json.error) {
              throw new Error(json.error?.message || `RPC ${method} gagal`);
            }
            return json.result;
          },
        };
      },
    };
  });
}
