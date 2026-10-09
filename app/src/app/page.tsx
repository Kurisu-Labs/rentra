"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { addresses, configured, rentalItemAbi } from "@/lib/contracts";
import { formatIDR, shortAddr, tupleAt } from "@/lib/format";
import { samples } from "@/lib/samples";

export default function CatalogPage() {
  const nextId = useReadContract({
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "nextId",
    query: { enabled: configured },
  });

  const ids = useMemo(() => {
    const next = typeof nextId.data === "bigint" ? Number(nextId.data) : 1;
    const list: number[] = [];
    for (let id = 1; id < next && list.length < 24; id += 1) list.push(id);
    return list;
  }, [nextId.data]);

  const reads = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: addresses.item, abi: rentalItemAbi, functionName: "tokenURI", args: [BigInt(id)] },
      { address: addresses.item, abi: rentalItemAbi, functionName: "terms", args: [BigInt(id)] },
      { address: addresses.item, abi: rentalItemAbi, functionName: "ownerOf", args: [BigInt(id)] },
    ]),
    query: { enabled: configured && ids.length > 0 },
  });

  return (
    <div>
      <section className="hero">
        <h1>Sewa apa saja, tanpa titip KTP.</h1>
        <p className="lede">
          Deposit dikunci di kontrak sampai barang kembali. Rekam jejak yang baik membuat deposit
          berikutnya lebih kecil. Tidak ada data pribadi yang ditahan.
        </p>
      </section>

      {!configured && (
        <div className="notice warn">
          Alamat kontrak belum diisi. Katalog di bawah adalah contoh untuk tata letak. Setelah
          deploy Base Sepolia, isi <span className="hash">NEXT_PUBLIC_*_ADDRESS</span> di environment
          aplikasi.
        </div>
      )}

      {configured && (
        <>
          <h2>Barang onchain</h2>
          {ids.length === 0 && <p className="muted">Belum ada barang terdaftar.</p>}
          <div className="grid">
            {ids.map((id, index) => {
              const base = index * 3;
              const uri = reads.data?.[base]?.result;
              const terms = reads.data?.[base + 1]?.result;
              const owner = reads.data?.[base + 2]?.result;
              const name = typeof uri === "string" && uri.length > 0 ? uri : `Barang #${id}`;
              const value = tupleAt(terms, 0);
              const rate = tupleAt(terms, 1);
              return (
                <article className="card" key={id}>
                  <Link className="block" href={`/items/${id}`}>
                    <h3>{name}</h3>
                    <p>Pemilik {typeof owner === "string" ? shortAddr(owner) : "—"}</p>
                    <div className="meta">
                      <span className="pill">Nilai {formatIDR(typeof value === "bigint" ? value : undefined)}</span>
                      <span className="pill">
                        {formatIDR(typeof rate === "bigint" ? rate : undefined)} / hari
                      </span>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        </>
      )}

      {!configured && (
        <div className="grid">
          {samples.map((item) => (
            <article className="card" key={item.id}>
              <Link className="block" href={`/items/${item.id}`}>
                <h3>{item.name}</h3>
                <p>{item.blurb}</p>
                <div className="meta">
                  <span className="pill">{item.value}</span>
                  <span className="pill">{item.rate}</span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
