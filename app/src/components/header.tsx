"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { privyConfigured } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";

export function Header() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();
  const email = user?.email?.address || user?.google?.email;
  const who = email || shortAddr(address);

  return (
    <header className="header">
      <Link href="/" className="brand">
        <strong>Rentra</strong>
        <span>Sewa apa saja, tanpa titip KTP.</span>
      </Link>
      <nav className="nav">
        <Link href="/">Katalog</Link>
        <Link href="/list">Daftarkan barang</Link>
        <Link href="/my">Sewa saya</Link>
        <Link href={address ? `/reputation/${address}` : "/reputation"}>Reputasi</Link>
        {ready && authenticated ? (
          <>
            <span className="small muted">{who}</span>
            <button className="secondary" type="button" onClick={() => logout()}>
              Keluar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => login()}
              disabled={!ready || !privyConfigured}
              title={
                privyConfigured
                  ? undefined
                  : "Isi NEXT_PUBLIC_PRIVY_APP_ID (25 karakter) dari dashboard Privy"
              }
            >
              Masuk
            </button>
            {!privyConfigured && <span className="small muted">App id Privy belum diisi</span>}
          </>
        )}
      </nav>
    </header>
  );
}
