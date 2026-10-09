"use client";

import Link from "next/link";
import { useState } from "react";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { useAccount, useReadContract, useSignTypedData } from "wagmi";
import { encodeFunctionData, isHex } from "viem";
import type { Hex } from "viem";
import { PhotoHash } from "@/components/photo-hash";
import { QrCode } from "@/components/qr-code";
import { useRentraTx } from "@/components/use-tx";
import { addresses, chain, configured, rentalEscrowAbi, statusLabel } from "@/lib/contracts";
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
    chainId: chain.id,
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
    chainId: chain.id,
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
    setSignature("");
    setLocalError(null);
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
      if (
        !parsed ||
        !isHex(parsed.photoHash) ||
        parsed.photoHash.length !== 66 ||
        parsed.kind !== mode ||
        parsed.rentalId !== rentalId.toString() ||
        !/^\d+$/.test(parsed.timestamp) ||
        !/^\d+$/.test(parsed.nonce) ||
        parsed.nonce !== nonce.toString()
      )
        throw new Error(
          "This code doesn’t match this rental or has expired. Ask for a new exchange code.",
        );
      setSignature("");
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

  const title = mode === "handover" ? "Ready for the handover?" : "Wrap up your rental.";
  const canSign =
    configured &&
    (mode === "handover" ? isRenter && status === 0 : isOwner && (status === 1 || status === 3));
  const canSubmit =
    configured &&
    (mode === "handover" ? isOwner && status === 0 : isRenter && (status === 1 || status === 3));

  return (
    <div>
      <Link href="/my" className="text-link back-link">
        ← Back to My rentals
      </Link>
      <div className="page-heading">
        <span className="eyebrow">
          Rental #{rentalId.toString()} · {mode === "handover" ? "Pickup" : "Return"}
        </span>
        <h1>{title}</h1>
        <p>
          {mode === "handover"
            ? "Check the item together, record its condition, and confirm the pickup."
            : "Record the item’s condition and confirm the return. The claim window starts once the return is recorded."}
        </p>
      </div>
      <div className="split">
        <section className="card">
          <h2>1. Record the condition</h2>
          {!configured && <p className="notice">This exchange is unavailable in preview mode.</p>}
          {configured && rental.isLoading && (
            <p className="notice" role="status">
              Loading rental details…
            </p>
          )}
          {configured && rental.isError && (
            <p className="notice warn" role="alert">
              We couldn’t load this rental. Check the rental number and try again.
            </p>
          )}
          {configured && Boolean(rental.data) && (
            <p>
              <span className="pill">{statusLabel(status)}</span> · Owner {shortAddr(owner) || "—"}{" "}
              · Renter {shortAddr(renter) || "—"}
            </p>
          )}
          <PhotoHash
            label={mode === "handover" ? "Photo at pickup" : "Photo at return"}
            onHash={captureHash}
          />
          {payload && (
            <>
              <p className="small muted" style={{ marginTop: 16 }}>
                Share this code with the other person. They can copy and paste the exchange data
                below on their device.
              </p>
              <QrCode payload={JSON.stringify(payload)} />
              <details>
                <summary>Exchange data to share</summary>
                <textarea
                  aria-label="Exchange data to share"
                  readOnly
                  value={JSON.stringify(payload)}
                />
              </details>
            </>
          )}
          <h2 className="exchange-step">2. Review and sign</h2>
          <p className="small muted">
            {mode === "handover"
              ? "Renter: paste the owner’s exchange data, review it, then sign to confirm receipt."
              : "Owner: paste the renter’s exchange data, review it, then sign to confirm the return."}
          </p>
          <label htmlFor="exchange-data">Exchange data from the other person</label>
          <textarea
            id="exchange-data"
            placeholder="Paste exchange data here…"
            value={pasted}
            onChange={(event) => {
              setPasted(event.target.value);
              setSignature("");
            }}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="secondary"
              disabled={!pasted.trim() || tx.pending}
              onClick={loadPasted}
            >
              Review code
            </button>
            <button
              type="button"
              disabled={
                (!photoHash && !pasted.trim()) ||
                !canSign ||
                tx.pending ||
                nonceRead.isLoading ||
                nonceRead.isError
              }
              onClick={() => {
                const parsed = pasted.trim() ? loadPasted() : payload;
                if (parsed) void tx.run(() => signPayload(parsed));
              }}
            >
              {tx.pending ? "Confirming…" : "Sign confirmation"}
            </button>
          </div>
          {signature && canSign && (
            <>
              <label htmlFor="signature-to-share">Your signature to share back</label>
              <textarea id="signature-to-share" readOnly value={signature} />
            </>
          )}
          {localError && (
            <p className="notice warn" role="alert">
              {localError}
            </p>
          )}
        </section>
        <aside className="card">
          <h2>3. Confirm {mode === "handover" ? "pickup" : "return"}</h2>
          <p>
            {mode === "handover"
              ? "Owner: paste the renter’s signature to activate the rental."
              : "Renter: paste the owner’s signature to record the return."}
          </p>
          <label htmlFor="exchange-signature">Signature from the other person</label>
          <textarea
            id="exchange-signature"
            placeholder="0x…"
            value={signature}
            onChange={(event) => setSignature(event.target.value)}
          />
          {mode === "handover" && (
            <button
              className="full-width"
              style={{ marginTop: 12 }}
              type="button"
              disabled={!canSubmit || tx.pending || !photoHash || !signature}
              onClick={() => void tx.run(() => submit(false))}
            >
              {tx.pending ? "Confirming pickup…" : "Confirm pickup"}
            </button>
          )}
          {mode === "return" && (
            <div className="row" style={{ marginTop: 12 }}>
              <button
                type="button"
                disabled={!canSubmit || tx.pending || !photoHash || !signature}
                onClick={() => void tx.run(() => submit(false))}
              >
                {tx.pending ? "Confirming return…" : "Confirm return"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!canSubmit || tx.pending || !photoHash}
                onClick={() => void tx.run(() => submit(true))}
              >
                Return without owner’s signature
              </button>
            </div>
          )}
          <p className="field-help">
            {mode === "handover"
              ? "The renter signs; the owner submits. The rental becomes active once this transaction is confirmed."
              : "If the owner won’t sign, you can still record the return. The same claim window applies, and the owner can submit a damage claim."}
          </p>
          <TransactionFeedback {...tx} />
          {mode === "return" && (
            <ClaimBox rentalId={rentalId} isOwner={isOwner} isRenter={isRenter} status={status} />
          )}
        </aside>
      </div>
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
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "acceptCounter",
      args: [rentalId],
    });
    await tx.send(addresses.escrow, data);
  }

  async function escalate() {
    if (!addresses.escrow) return;
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "escalate",
      args: [rentalId],
    });
    await tx.send(addresses.escrow, data);
  }

  return (
    <div className="claim-box">
      <h3>Damage claims</h3>
      <p className="small muted">
        Owners lock a bond worth 10% of the claim. Renters can accept or counter. If a response is
        missing, the contract applies its timeout rules. Escalation uses those same rules; no
        community jury is available.
      </p>
      {isOwner && status === 2 && (
        <>
          <PhotoHash label="Photo of the damage" onHash={(hash) => setEvidence(hash)} />
          <label htmlFor="claim-amount">Claim amount (Rp)</label>
          <input
            id="claim-amount"
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <button
            type="button"
            disabled={
              tx.pending || !evidence || !/^\d+$/.test(amount) || BigInt(amount || "0") <= 0n
            }
            onClick={() => void tx.run(fileClaim)}
          >
            Submit damage claim
          </button>
        </>
      )}
      {isRenter && status === 4 && (
        <>
          <label htmlFor="counter-amount">Counteroffer (Rp; enter 0 to reject)</label>
          <input
            id="counter-amount"
            type="number"
            min="0"
            step="1"
            value={counter}
            onChange={(event) => setCounter(event.target.value)}
          />
          <div className="row">
            <button
              type="button"
              disabled={tx.pending}
              onClick={() => void tx.run(() => respond(true))}
            >
              Accept claim
            </button>
            <button
              type="button"
              className="secondary"
              disabled={tx.pending || !/^\d+$/.test(counter)}
              onClick={() => void tx.run(() => respond(false))}
            >
              Send counteroffer
            </button>
          </div>
        </>
      )}
      {isOwner && (status === 4 || status === 5) && (
        <button
          type="button"
          className="secondary"
          disabled={tx.pending}
          onClick={() => void tx.run(acceptCounter)}
        >
          Accept counteroffer
        </button>
      )}
      {(isOwner || isRenter) && status === 4 && (
        <button
          type="button"
          className="secondary"
          disabled={tx.pending}
          onClick={() => void tx.run(escalate)}
        >
          Escalate to timeout settlement
        </button>
      )}
      <TransactionFeedback {...tx} />
    </div>
  );
}
