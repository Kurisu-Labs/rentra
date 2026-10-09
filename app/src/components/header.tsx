"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { privyConfigured } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";
import { LOCAL_ACCOUNT_STORAGE_KEY, LOCAL_ACCOUNTS, setActiveAccount } from "@/lib/local-wallet";

export function Header() {
  const { ready, authenticated, login, logout, email, address, local } = useSession();
  const who = email || shortAddr(address);

  return (
    <>
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
        {local ? (
          <LocalAccountSelect />
        ) : ready && authenticated ? (
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
    {local && (
      <div className="local-banner">
        Mode lokal di Anvil. Akun Pemilik sudah mendaftarkan barang. Ganti ke Penyewa untuk memesan,
        lalu kembali ke Pemilik untuk serah terima.
      </div>
    )}
    </>
  );
}

function LocalAccountSelect() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(LOCAL_ACCOUNT_STORAGE_KEY) || "0");
    if (!Number.isInteger(saved) || saved < 0 || saved >= LOCAL_ACCOUNTS.length) return;
    setIndex(saved);
    setActiveAccount(saved);
  }, []);

  return (
    <label className="account-label">
      Akun lokal
      <select
        className="account-select"
        value={index}
        onChange={(event) => {
          const next = Number(event.target.value);
          setIndex(next);
          window.localStorage.setItem(LOCAL_ACCOUNT_STORAGE_KEY, String(next));
          setActiveAccount(next);
        }}
      >
        {LOCAL_ACCOUNTS.map((account, accountIndex) => (
          <option key={account.address} value={accountIndex}>
            {account.label} {shortAddr(account.address)}
          </option>
        ))}
      </select>
    </label>
  );
}
