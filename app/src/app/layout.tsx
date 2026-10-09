import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rentra — Rent more. Leave your ID at home.", template: "%s | Rentra" },
  description:
    "Rent everyday essentials without handing over your ID. Deposits held in escrow, clear rental terms, and a reputation that travels with you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
