import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "clplaceholderprivyappid01",
    NEXT_PUBLIC_BASE_SEPOLIA_RPC: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  },
};

export default nextConfig;
