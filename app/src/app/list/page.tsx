"use client";

import { useState } from "react";
import { encodeFunctionData } from "viem";
import { useRentraTx } from "@/components/use-tx";
import { addresses, configured, rentalItemAbi } from "@/lib/contracts";
import { rpToWei } from "@/lib/format";

export default function ListPage() {
  const tx = useRentraTx();
  const [name, setName] = useState("Kamera mirrorless");
  const [value, setValue] = useState("3000000");
  const [rate, setRate] = useState("150000");
  const [late, setLate] = useState("10000");
  const [grace, setGrace] = useState("24");

  async function submit() {
    if (!addresses.item) return;
    const data = encodeFunctionData({
      abi: rentalItemAbi,
      functionName: "listItem",
      args: [name, rpToWei(value), rpToWei(rate), rpToWei(late), Number(grace || "0")],
    });
    await tx.send(addresses.item, data);
  }

  return (
    <article className="card form">
      <h1>Daftarkan barang</h1>
      <p className="muted">
        Nilai barang menjadi deposit dasar bagi penyewa baru. Tarif dibulatkan ke atas per hari.
      </p>
      {!configured && (
        <div className="notice warn">Hubungkan alamat kontrak dulu. Formulir ini belum bisa mengirim.</div>
      )}
      <label>Nama atau tautan foto</label>
      <input value={name} onChange={(event) => setName(event.target.value)} />
      <label>Nilai barang (Rp)</label>
      <input inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} />
      <label>Tarif per hari (Rp)</label>
      <input inputMode="numeric" value={rate} onChange={(event) => setRate(event.target.value)} />
      <label>Denda per jam (Rp)</label>
      <input inputMode="numeric" value={late} onChange={(event) => setLate(event.target.value)} />
      <label>Masa tenggang (jam)</label>
      <input inputMode="numeric" value={grace} onChange={(event) => setGrace(event.target.value)} />
      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" disabled={!configured || tx.pending || !name} onClick={() => void submit()}>
          {tx.pending ? "Mendaftarkan…" : "Daftarkan"}
        </button>
      </div>
      {tx.hash && <p className="hash">Tercatat {tx.hash}</p>}
      {tx.error && <p className="notice warn">{tx.error}</p>}
    </article>
  );
}
