import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "clplaceholderprivyappid01",
    NEXT_PUBLIC_SEPOLIA_RPC_URL:
      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    NEXT_PUBLIC_PRIVY_SPONSOR_GAS: process.env.NEXT_PUBLIC_PRIVY_SPONSOR_GAS || "false",
  },
};

export default nextConfig;
