"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { isAddress } from "viem";
import type { Address } from "viem";
import { addresses, configured, reputationAbi } from "@/lib/contracts";
import { formatIDR, shortAddr, tupleAt } from "@/lib/format";

export function ReputationView({ initial }: { initial?: string }) {
  const { address: connected } = useAccount();
  const router = useRouter();
  const [lookup, setLookup] = useState(initial ?? "");
  const target = (initial && isAddress(initial) ? initial : connected) as Address | undefined;

  const score = useReadContract({
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "scoreOf",
    args: [target as Address],
    query: { enabled: configured && Boolean(target) },
  });
  const factor = useReadContract({
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "depositFactorBps",
    args: [target as Address],
    query: { enabled: configured && Boolean(target) },
  });
  const maxValue = useReadContract({
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "maxSuccessfulValue",
    args: [target as Address],
    query: { enabled: configured && Boolean(target) },
  });
  const defaulted = useReadContract({
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "hasDefaulted",
    args: [target as Address],
    query: { enabled: configured && Boolean(target) },
  });

  const factorBps = typeof factor.data === "bigint" ? Number(factor.data) : 10000;
  const ok = tupleAt(score.data, 1);
  const late = tupleAt(score.data, 2);
  const defaults = tupleAt(score.data, 3);
  const points = tupleAt(score.data, 0);

  return (
    <article className="card">
      <h1>Reputasi</h1>
      <p className="muted">
        Rekam jejak ini menempel di akun, tidak bisa dipindahkan, dan tidak menyimpan NIK. Lima sewa
        sukses dari pemilik berbeda menurunkan deposit menjadi 50%. Satu kali tidak kembali mengunci
        deposit penuh untuk seterusnya.
      </p>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          if (isAddress(lookup)) router.push(`/reputation/${lookup}`);
        }}
      >
        <input
          placeholder="Alamat akun"
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          style={{ maxWidth: 420 }}
        />
        <button type="submit">Lihat</button>
      </form>
      {!configured && <p className="notice warn">Kontrak reputasi belum terhubung.</p>}
      {configured && !target && <p className="notice">Masuk, atau tempel alamat akun.</p>}
      {target && (
        <>
          <h2>{shortAddr(target)}</h2>
          <div className="meta">
            <span className={`pill ${defaulted.data ? "bad" : "ok"}`}>
              {defaulted.data ? "Pernah tidak kembali" : "Tidak ada catatan gagal permanen"}
            </span>
            <span className="pill">Deposit berikutnya {factorBps / 100}%</span>
            <span className="pill">Skor {points?.toString() ?? "0"}</span>
          </div>
          <p>
            Sukses {ok?.toString() ?? "0"} · terlambat {late?.toString() ?? "0"} · tidak kembali{" "}
            {defaults?.toString() ?? "0"}
          </p>
          <p className="small muted">
            Diskon hanya berlaku sampai nilai tertinggi yang pernah selesai dengan baik:{" "}
            {formatIDR(typeof maxValue.data === "bigint" ? maxValue.data : 0n)}. Sewa di bawah Rp500.000
            tercatat, tetapi tidak mengurangi deposit.
          </p>
        </>
      )}
    </article>
  );
}
