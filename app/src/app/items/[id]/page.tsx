"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, useSignTypedData } from "wagmi";
import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import { PhotoHash } from "@/components/photo-hash";
import { useRentraTx } from "@/components/use-tx";
import {
  addresses,
  configured,
  mockIdrAbi,
  rentalEscrowAbi,
  rentalItemAbi,
  reputationAbi,
} from "@/lib/contracts";
import { formatIDR, formatWhen, localInputToUnix, rpToWei, shortAddr, tupleAt, unixToLocalInput } from "@/lib/format";
import { findSample } from "@/lib/samples";
import { idrDomain, permitTypes, splitSignature } from "@/lib/sign";

export default function ItemPage() {
  const params = useParams<{ id: string }>();
  const idParam = params.id;
  const sample = findSample(idParam);
  const tokenId = /^\d+$/.test(idParam) ? BigInt(idParam) : undefined;

  if (!configured || tokenId === undefined) {
    return (
      <article className="card">
        <h1>{sample?.name ?? "Barang"}</h1>
        <p>{sample?.blurb ?? "Barang ini hanya contoh sampai kontrak terhubung."}</p>
        <div className="meta">
          <span className="pill">Nilai {sample?.value ?? "—"}</span>
          <span className="pill">{sample?.rate ?? "—"}</span>
          <span className="pill">Denda {sample?.late ?? "—"}</span>
          <span className="pill">Tenggang {sample?.grace ?? "—"}</span>
        </div>
        <div className="notice">
          Deposit untuk penyewa baru mengikuti nilai barang. Skor reputasi menurunkan deposit, paling
          rendah 30%, dan hanya untuk nilai yang pernah berhasil disewa.
        </div>
        <button type="button" disabled>
          Kunci deposit
        </button>
      </article>
    );
  }

  return <OnchainItem tokenId={tokenId} />;
}

function OnchainItem({ tokenId }: { tokenId: bigint }) {
  const { address } = useAccount();
  const { login, authenticated } = usePrivy();
  const { signTypedDataAsync } = useSignTypedData();
  const tx = useRentraTx();
  const now = Math.floor(Date.now() / 1000);
  const [start, setStart] = useState(unixToLocalInput(now + 60));
  const [end, setEnd] = useState(unixToLocalInput(now + 2 * 86400));

  const terms = useReadContract({
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "terms",
    args: [tokenId],
  });
  const uri = useReadContract({
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "tokenURI",
    args: [tokenId],
  });
  const owner = useReadContract({
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  const user = useReadContract({
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "userOf",
    args: [tokenId],
  });
  const expires = useReadContract({
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "userExpires",
    args: [tokenId],
  });

  const startUnix = useMemo(() => {
    try {
      return localInputToUnix(start);
    } catch {
      return undefined;
    }
  }, [start]);
  const endUnix = useMemo(() => {
    try {
      return localInputToUnix(end);
    } catch {
      return undefined;
    }
  }, [end]);

  const quoteDeposit = useReadContract({
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "quoteDeposit",
    args: [tokenId, (address ?? "0x0000000000000000000000000000000000000000") as Address],
    query: { enabled: Boolean(address) },
  });
  const quoteRent = useReadContract({
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "quoteRent",
    args: [tokenId, startUnix ?? 0n, endUnix ?? 0n],
    query: { enabled: Boolean(startUnix && endUnix && endUnix > startUnix) },
  });
  const factor = useReadContract({
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "depositFactorBps",
    args: [address as Address],
    query: { enabled: Boolean(address) },
  });
  const balance = useReadContract({
    address: addresses.idr,
    abi: mockIdrAbi,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: Boolean(address) },
  });
  const nonce = useReadContract({
    address: addresses.idr,
    abi: mockIdrAbi,
    functionName: "nonces",
    args: [address as Address],
    query: { enabled: Boolean(address) },
  });

  const name = typeof uri.data === "string" && uri.data ? uri.data : `Barang #${tokenId}`;
  const value = tupleAt(terms.data, 0);
  const rate = tupleAt(terms.data, 1);
  const late = tupleAt(terms.data, 2);
  const grace = tupleAt(terms.data, 3);
  const deposit = typeof quoteDeposit.data === "bigint" ? quoteDeposit.data : typeof value === "bigint" ? value : undefined;
  const rent = typeof quoteRent.data === "bigint" ? quoteRent.data : undefined;
  const factorBps = typeof factor.data === "bigint" ? Number(factor.data) : 10000;

  async function faucet() {
    if (!addresses.idr) return;
    const data = encodeFunctionData({ abi: mockIdrAbi, functionName: "faucet" });
    await tx.send(addresses.idr, data);
  }

  async function book() {
    if (!addresses.escrow || !addresses.idr || !address || !startUnix || !endUnix || rent === undefined || deposit === undefined) {
      return;
    }
    const total = rent + deposit;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const signature = await signTypedDataAsync({
      domain: idrDomain(),
      types: permitTypes,
      primaryType: "Permit",
      message: {
        owner: address,
        spender: addresses.escrow,
        value: total,
        nonce: typeof nonce.data === "bigint" ? nonce.data : 0n,
        deadline,
      },
    });
    const { v, r, s } = splitSignature(signature);
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "bookWithPermit",
      args: [tokenId, startUnix, endUnix, total, deadline, v, r, s],
    });
    await tx.send(addresses.escrow, data);
  }

  return (
    <div className="split">
      <article className="card">
        <h1>{name}</h1>
        <p className="muted">Pemilik {typeof owner.data === "string" ? shortAddr(owner.data) : "—"}</p>
        <div className="meta">
          <span className="pill">Nilai {formatIDR(typeof value === "bigint" ? value : undefined)}</span>
          <span className="pill">{formatIDR(typeof rate === "bigint" ? rate : undefined)} / hari</span>
          <span className="pill">Denda {formatIDR(typeof late === "bigint" ? late : undefined)} / jam</span>
          <span className="pill">Tenggang {grace?.toString() ?? "—"} jam</span>
        </div>
        {typeof user.data === "string" && user.data !== "0x0000000000000000000000000000000000000000" && (
          <p>
            Sedang dipakai {shortAddr(user.data)} sampai {formatWhen(typeof expires.data === "bigint" ? expires.data : undefined)}
          </p>
        )}
        <div className="notice">
          Deposit terkunci mengikuti reputasi ({(factorBps / 100).toFixed(0)}% dari porsi yang
          sudah terbukti). KTP tidak diperlukan.
        </div>
      </article>
      <aside className="card">
        <h2>Pesan</h2>
        <label>Mulai</label>
        <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
        <label>Selesai</label>
        <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
        <p>Sewa {formatIDR(rent)}</p>
        <p>
          <strong>Deposit terkunci {formatIDR(deposit)}</strong>
        </p>
        <p className="small muted">Saldo percobaan {formatIDR(typeof balance.data === "bigint" ? balance.data : undefined)}</p>
        {!authenticated ? (
          <button type="button" onClick={() => login()}>
            Masuk untuk memesan
          </button>
        ) : (
          <div className="row">
            <button type="button" className="secondary" disabled={tx.pending} onClick={() => void faucet()}>
              Isi saldo percobaan
            </button>
            <button type="button" disabled={tx.pending || !rent || !deposit} onClick={() => void book()}>
              {tx.pending ? "Memproses…" : "Kunci deposit"}
            </button>
          </div>
        )}
        {tx.hash && <p className="hash">Tercatat {tx.hash}</p>}
        {tx.error && <p className="notice warn">{tx.error}</p>}
        <PhotoNote />
      </aside>
    </div>
  );
}

function PhotoNote() {
  const [, setHash] = useState<Hex | "">("");
  return (
    <div style={{ marginTop: 16 }}>
      <PhotoHash label="Contoh hitung hash foto (tidak dikirim saat pesan)" onHash={(hash) => setHash(hash)} />
    </div>
  );
}
