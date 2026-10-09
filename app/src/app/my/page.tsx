"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { encodeFunctionData } from "viem";
import { useRentraTx } from "@/components/use-tx";
import { addresses, configured, rentalEscrowAbi, rentalItemAbi, statusLabel } from "@/lib/contracts";
import { formatIDR, formatWhen, shortAddr, tupleAt } from "@/lib/format";
import { Countdown } from "@/components/countdown";

export default function MyRentalsPage() {
  const { address } = useAccount();
  const tx = useRentraTx();
  const next = useReadContract({
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "nextRentalId",
    query: { enabled: configured },
  });
  const demo = useReadContract({
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "demoMode",
    query: { enabled: configured },
  });

  const ids = useMemo(() => {
    const n = typeof next.data === "bigint" ? Number(next.data) : 1;
    const list: bigint[] = [];
    for (let id = 1; id < n && list.length < 30; id += 1) list.push(BigInt(id));
    return list;
  }, [next.data]);

  const reads = useReadContracts({
    contracts: ids.map((id) => ({
      address: addresses.escrow,
      abi: rentalEscrowAbi,
      functionName: "rentals",
      args: [id],
    })),
    query: { enabled: configured && ids.length > 0 },
  });

  const mine = ids.flatMap((id, index) => {
    const row = reads.data?.[index]?.result;
    if (!row || !address) return [];
    const owner = String(tupleAt(row, 1) ?? "");
    const renter = String(tupleAt(row, 2) ?? "");
    if (owner.toLowerCase() !== address.toLowerCase() && renter.toLowerCase() !== address.toLowerCase()) {
      return [];
    }
    return [{ id, row, owner, renter }];
  });

  async function claimDefault(id: bigint) {
    if (!addresses.escrow) return;
    const data = encodeFunctionData({ abi: rentalEscrowAbi, functionName: "claimDefault", args: [id] });
    await tx.send(addresses.escrow, data);
  }

  async function finalize(id: bigint) {
    if (!addresses.escrow) return;
    const data = encodeFunctionData({ abi: rentalEscrowAbi, functionName: "finalizeClaim", args: [id] });
    await tx.send(addresses.escrow, data);
  }

  return (
    <div>
      <h1>Sewa saya</h1>
      {!address && <p className="notice">Masuk untuk melihat sewa yang terkait dengan akun ini.</p>}
      {demo.data === true && (
        <p className="notice">Mode demo aktif: 1 hari pada kontrak sama dengan 2 menit di dunia nyata.</p>
      )}
      {!configured && <p className="notice warn">Kontrak belum terhubung. Daftar sewa muncul setelah deploy.</p>}
      {configured && address && mine.length === 0 && <p className="muted">Belum ada sewa.</p>}
      <div className="grid">
        {mine.map(({ id, row, owner, renter }) => {
          const tokenId = tupleAt(row, 0);
          const end = tupleAt(row, 4);
          const rent = tupleAt(row, 5);
          const deposit = tupleAt(row, 6);
          const status = Number(tupleAt(row, 10));
          const isOwner = owner.toLowerCase() === address?.toLowerCase();
          return (
            <RentalCard
              key={String(id)}
              id={id}
              tokenId={typeof tokenId === "bigint" ? tokenId : 0n}
              end={typeof end === "bigint" ? end : 0n}
              rent={typeof rent === "bigint" ? rent : 0n}
              deposit={typeof deposit === "bigint" ? deposit : 0n}
              status={status}
              isOwner={isOwner}
              counterparty={isOwner ? renter : owner}
              pending={tx.pending}
              onDefault={() => void claimDefault(id)}
              onFinalize={() => void finalize(id)}
            />
          );
        })}
      </div>
      {tx.error && <p className="notice warn">{tx.error}</p>}
      {tx.hash && <p className="hash">Tercatat {tx.hash}</p>}
    </div>
  );
}

function RentalCard({
  id,
  tokenId,
  end,
  rent,
  deposit,
  status,
  isOwner,
  counterparty,
  pending,
  onDefault,
  onFinalize,
}: {
  id: bigint;
  tokenId: bigint;
  end: bigint;
  rent: bigint;
  deposit: bigint;
  status: number;
  isOwner: boolean;
  counterparty: string;
  pending: boolean;
  onDefault: () => void;
  onFinalize: () => void;
}) {
  const expires = useReadContract({
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "userExpires",
    args: [tokenId],
    query: { enabled: configured },
  });

  return (
    <article className="card">
      <h3>Sewa #{id.toString()}</h3>
      <p>{isOwner ? "Kamu pemilik" : "Kamu penyewa"} · lawan {shortAddr(counterparty)}</p>
      <div className="meta">
        <span className={`pill ${status === 1 ? "ok" : status === 7 ? "bad" : "warn"}`}>{statusLabel(status)}</span>
        <span className="pill">Sewa {formatIDR(rent)}</span>
        <span className="pill">Deposit {formatIDR(deposit)}</span>
      </div>
      <p className="small">
        Selesai jadwal {formatWhen(end)}
        {typeof expires.data === "bigint" && expires.data > 0n && (
          <>
            {" "}
            · sisa pakai <Countdown expires={expires.data} />
          </>
        )}
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        {isOwner && status === 0 && (
          <Link className="button" href={`/handover/${id}`}>
            Serah terima
          </Link>
        )}
        {!isOwner && (status === 1 || status === 3) && (
          <Link className="button" href={`/return/${id}`}>
            Kembalikan
          </Link>
        )}
        {(status === 2 || status === 4 || status === 5) && (
          <Link className="button secondary" href={`/return/${id}`}>
            Klaim / selesaikan
          </Link>
        )}
        {isOwner && (status === 1 || status === 3) && (
          <button type="button" className="secondary" disabled={pending} onClick={onDefault}>
            Klaim tidak kembali
          </button>
        )}
        {(status === 2 || status === 4 || status === 5) && (
          <button type="button" className="secondary" disabled={pending} onClick={onFinalize}>
            Selesaikan
          </button>
        )}
      </div>
    </article>
  );
}
