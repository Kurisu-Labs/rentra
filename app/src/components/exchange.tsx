"use client";

import { useState } from "react";
import { useAccount, useReadContract, useSignTypedData } from "wagmi";
import { encodeFunctionData, isHex } from "viem";
import type { Hex } from "viem";
import { PhotoHash } from "@/components/photo-hash";
import { QrCode } from "@/components/qr-code";
import { useRentraTx } from "@/components/use-tx";
import { addresses, configured, rentalEscrowAbi, statusLabel } from "@/lib/contracts";
import { errText, shortAddr, tupleAt } from "@/lib/format";
import { escrowDomain, handoverTypes, returnTypes } from "@/lib/sign";

type Payload = {
  kind: "handover" | "return";
  rentalId: string;
  photoHash: Hex;
  timestamp: string;
  nonce: string;
};

export function Exchange({ mode, rentalId }: { mode: "handover" | "return"; rentalId: bigint }) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const tx = useRentraTx();
  const [photoHash, setPhotoHash] = useState<Hex | "">("");
  const [timestamp, setTimestamp] = useState("");
  const [signature, setSignature] = useState("");
  const [pasted, setPasted] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const rental = useReadContract({
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "rentals",
    args: [rentalId],
    query: { enabled: configured },
  });
  const owner = String(tupleAt(rental.data, 1) ?? "");
  const renter = String(tupleAt(rental.data, 2) ?? "");
  const status = Number(tupleAt(rental.data, 10) ?? 0);
  const signer = mode === "handover" ? renter : owner;
  const nonceRead = useReadContract({
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "nonces",
    args: [signer as `0x${string}`],
    query: { enabled: configured && signer.startsWith("0x") },
  });

  const isOwner = address?.toLowerCase() === owner.toLowerCase();
  const isRenter = address?.toLowerCase() === renter.toLowerCase();
  const nonce = typeof nonceRead.data === "bigint" ? nonceRead.data : 0n;

  function captureHash(hash: Hex) {
    setPhotoHash(hash);
    setTimestamp(String(Math.floor(Date.now() / 1000)));
  }

  const payload: Payload | null =
    photoHash && timestamp
      ? {
          kind: mode,
          rentalId: rentalId.toString(),
          photoHash,
          timestamp,
          nonce: nonce.toString(),
        }
      : null;

  async function signPayload(raw: Payload) {
    setLocalError(null);
    const message = {
      rentalId: BigInt(raw.rentalId),
      photoHash: raw.photoHash,
      timestamp: BigInt(raw.timestamp),
      nonce: BigInt(raw.nonce),
    };
    const signatureValue =
      raw.kind === "handover"
        ? await signTypedDataAsync({
            domain: escrowDomain(),
            types: handoverTypes,
            primaryType: "Handover",
            message,
          })
        : await signTypedDataAsync({
            domain: escrowDomain(),
            types: returnTypes,
            primaryType: "Return",
            message,
          });
    setSignature(signatureValue);
  }

  function loadPasted() {
    try {
      const parsed = JSON.parse(pasted) as Payload;
      if (!isHex(parsed.photoHash) || parsed.kind !== mode) throw new Error("Format kode tidak dikenali");
      setPhotoHash(parsed.photoHash);
      setTimestamp(parsed.timestamp);
      setLocalError(null);
      return parsed;
    } catch (caught) {
      setLocalError(errText(caught));
      return null;
    }
  }

  async function submit(unilateral = false) {
    if (!addresses.escrow || !photoHash || !timestamp) return;
    const sig = unilateral ? "0x" : (signature as Hex);
    const args = [rentalId, photoHash, BigInt(timestamp), sig] as const;
    const data =
      mode === "handover"
        ? encodeFunctionData({ abi: rentalEscrowAbi, functionName: "handover", args })
        : encodeFunctionData({ abi: rentalEscrowAbi, functionName: "confirmReturn", args });
    await tx.send(addresses.escrow, data);
  }

  const title = mode === "handover" ? "Serah terima" : "Pengembalian";

  return (
    <div className="split">
      <section className="card">
        <h1>
          {title} #{rentalId.toString()}
        </h1>
        {!configured && <p className="notice warn">Kontrak belum terhubung.</p>}
        <p>
          Status {statusLabel(status)}. Pemilik {shortAddr(owner) || "—"}, penyewa {shortAddr(renter) || "—"}.
        </p>
        <PhotoHash
          label={mode === "handover" ? "Foto kondisi awal" : "Foto kondisi akhir"}
          onHash={captureHash}
        />
        {payload && (
          <>
            <p className="small muted">Tunjukkan kode ini ke pihak lain, atau tempel JSON-nya.</p>
            <QrCode payload={JSON.stringify(payload)} />
            <textarea readOnly value={JSON.stringify(payload)} />
          </>
        )}
        <label>Tempel kode dari pihak lain</label>
        <textarea value={pasted} onChange={(event) => setPasted(event.target.value)} />
        <div className="row">
          <button type="button" className="secondary" onClick={loadPasted}>
            Pakai kode
          </button>
          <button
            type="button"
            disabled={!photoHash || (mode === "handover" ? !isRenter : !isOwner)}
            onClick={() => {
              const parsed = pasted.trim() ? loadPasted() : payload;
              if (parsed) void signPayload(parsed);
            }}
          >
            Tanda tangani
          </button>
        </div>
        {signature && (
          <>
            <label>Tanda tangan untuk diberikan kembali</label>
            <textarea readOnly value={signature} />
          </>
        )}
      </section>
      <aside className="card">
        <h2>Catat di kontrak</h2>
        <label>Tanda tangan pihak lain</label>
        <textarea value={signature} onChange={(event) => setSignature(event.target.value)} />
        {mode === "handover" && (
          <button type="button" disabled={!isOwner || tx.pending || !photoHash || !signature} onClick={() => void submit(false)}>
            Barang sudah diterima
          </button>
        )}
        {mode === "return" && (
          <div className="row">
            <button type="button" disabled={!isRenter || tx.pending || !photoHash || !signature} onClick={() => void submit(false)}>
              Catat pengembalian
            </button>
            <button type="button" className="secondary" disabled={!isRenter || tx.pending || !photoHash} onClick={() => void submit(true)}>
              Kembalikan tanpa tanda tangan pemilik
            </button>
          </div>
        )}
        <p className="small muted">
          {mode === "handover"
            ? "Penyewa menandatangani, pemilik yang mengirim catatan."
            : "Pemilik menandatangani, penyewa yang mengirim. Kalau pemilik menolak, pengembalian sepihak tetap membuka jendela klaim."}
        </p>
        {tx.hash && <p className="hash">Tercatat {tx.hash}</p>}
        {(tx.error || localError) && <p className="notice warn">{tx.error || localError}</p>}
        {mode === "return" && <ClaimBox rentalId={rentalId} isOwner={isOwner} isRenter={isRenter} status={status} />}
      </aside>
    </div>
  );
}

function ClaimBox({
  rentalId,
  isOwner,
  isRenter,
  status,
}: {
  rentalId: bigint;
  isOwner: boolean;
  isRenter: boolean;
  status: number;
}) {
  const tx = useRentraTx();
  const [amount, setAmount] = useState("100000");
  const [evidence, setEvidence] = useState<Hex | "">("");
  const [counter, setCounter] = useState("0");

  async function fileClaim() {
    if (!addresses.escrow || !addresses.idr || !evidence) return;
    const wei = BigInt(amount.replace(/[^\d]/g, "") || "0") * 10n ** 18n;
    const bond = wei / 10n;
    const approve = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ],
      functionName: "approve",
      args: [addresses.escrow, bond],
    });
    await tx.send(addresses.idr, approve);
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "fileDamageClaim",
      args: [rentalId, wei, evidence],
    });
    await tx.send(addresses.escrow, data);
  }

  async function respond(accept: boolean) {
    if (!addresses.escrow) return;
    const counterWei = BigInt(counter.replace(/[^\d]/g, "") || "0") * 10n ** 18n;
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "respondClaim",
      args: [rentalId, accept, accept ? 0n : counterWei],
    });
    await tx.send(addresses.escrow, data);
  }

  async function acceptCounter() {
    if (!addresses.escrow) return;
    const data = encodeFunctionData({ abi: rentalEscrowAbi, functionName: "acceptCounter", args: [rentalId] });
    await tx.send(addresses.escrow, data);
  }

  async function escalate() {
    if (!addresses.escrow) return;
    const data = encodeFunctionData({ abi: rentalEscrowAbi, functionName: "escalate", args: [rentalId] });
    await tx.send(addresses.escrow, data);
  }

  return (
    <div style={{ marginTop: 18 }}>
      <h3>Klaim kerusakan</h3>
      <p className="small muted">Bond 10% dari nilai klaim. Kalau tidak ada jawaban, pihak yang merespons menang.</p>
      {isOwner && status === 2 && (
        <>
          <PhotoHash label="Bukti kerusakan" onHash={(hash) => setEvidence(hash)} />
          <label>Nilai klaim (Rp)</label>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} />
          <button type="button" disabled={tx.pending || !evidence} onClick={() => void fileClaim()}>
            Ajukan klaim
          </button>
        </>
      )}
      {isRenter && status === 4 && (
        <>
          <label>Tawaran balik (Rp), 0 kalau menolak</label>
          <input value={counter} onChange={(event) => setCounter(event.target.value)} />
          <div className="row">
            <button type="button" disabled={tx.pending} onClick={() => void respond(true)}>
              Terima klaim
            </button>
            <button type="button" className="secondary" disabled={tx.pending} onClick={() => void respond(false)}>
              Tawar balik
            </button>
          </div>
        </>
      )}
      {isOwner && (status === 4 || status === 5) && (
        <button type="button" className="secondary" disabled={tx.pending} onClick={() => void acceptCounter()}>
          Terima tawaran balik
        </button>
      )}
      {(isOwner || isRenter) && status === 4 && (
        <button type="button" className="secondary" disabled={tx.pending} onClick={() => void escalate()}>
          Eskalasi (timeout)
        </button>
      )}
      {tx.error && <p className="notice warn">{tx.error}</p>}
    </div>
  );
}
