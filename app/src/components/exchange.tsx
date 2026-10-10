"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { useAccount, useReadContract, useReadContracts, useSignTypedData } from "wagmi";
import { encodeFunctionData, isAddress, isHex, zeroAddress } from "viem";
import type { Hex } from "viem";
import { PhotoHash } from "@/components/photo-hash";
import { QrCode } from "@/components/qr-code";
import { ClaimRelease } from "@/components/claim-release";
import { RentalResolution } from "@/components/rental-resolution";
import { useRentraTx } from "@/components/use-tx";
import { addresses, chain, configured, mockIdrAbi, rentalEscrowAbi, statusLabel } from "@/lib/contracts";
import { errText, asBigint, formatIDR, formatWhen, rpToWei, shortAddr, tupleAt } from "@/lib/format";
import { formatCountdown } from "@/lib/claim-window";
import { formatPickupClock, isPickupOpen, pickupSecondsRemaining } from "@/lib/pickup-window";
import { expectRentalStatus } from "@/lib/tx-expectations";
import { MEDIATOR_BEFORE_HANDOVER } from "@/lib/mediator-copy";
import { escrowDomain, handoverTypes, returnTypes } from "@/lib/sign";

type Payload = {
  kind: "handover" | "return";
  rentalId: string;
  photoHash: Hex;
  timestamp: string;
  nonce: string;
  mediator: string;
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
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (mode !== "handover") return;
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  const rental = useReadContract({
    chainId: chain.id,
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "rentals",
    args: [rentalId],
    query: { enabled: configured, refetchInterval: 15_000 },
  });
  const owner = String(tupleAt(rental.data, 1) ?? "");
  const renter = String(tupleAt(rental.data, 2) ?? "");
  const status = Number(tupleAt(rental.data, 10) ?? 0);
  const start = asBigint(tupleAt(rental.data, 3));
  const waitingForPickup = mode === "handover" && status === 0 && !isPickupOpen(start, now);
  const mediation = useReadContract({
    chainId: chain.id, address: addresses.escrow, abi: rentalEscrowAbi,
    functionName: "mediations", args: [rentalId], query: { enabled: tx.writable },
  });
  const mediator = String(tupleAt(mediation.data, 1) ?? zeroAddress) as `0x${string}`;
  const mediatorPending = String(tupleAt(mediation.data, 0) ?? zeroAddress) !== zeroAddress && mediator === zeroAddress;
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

  function captureHash(hash: Hex | "") {
    setSignature("");
    setLocalError(null);
    setPhotoHash(hash);
    setTimestamp(hash ? String(Math.floor(Date.now() / 1000)) : "");
  }

  const payload: Payload | null =
    photoHash && timestamp
      ? {
          kind: mode,
          rentalId: rentalId.toString(),
          photoHash,
          timestamp,
          nonce: nonce.toString(),
          mediator,
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
            message: { ...message, mediator: raw.mediator as `0x${string}` },
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
        !isAddress(parsed.mediator) ||
        parsed.mediator.toLowerCase() !== mediator.toLowerCase() ||
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
    await tx.send(addresses.escrow, data, (probe) =>
      expectRentalStatus(probe, rentalId, mode === "handover" ? 1 : unilateral ? 9 : 2),
    );
  }

  const title = mode === "handover" ? "Ready for the handover?" : "Wrap up your rental.";
  const canSign =
    tx.writable && !rental.isError && !rental.isLoading && !waitingForPickup &&
    (mode === "handover" ? isRenter && status === 0 && !mediatorPending && !mediation.isLoading && !mediation.isError : isOwner && [1, 3, 9, 10].includes(status));
  const canSubmit =
    tx.writable && !rental.isError && !rental.isLoading && !waitingForPickup &&
    (mode === "handover" ? isOwner && status === 0 && !mediatorPending : isRenter && [1, 3, 9, 10].includes(status));

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
            : "Record the item’s condition. The 24-hour real-time claim window starts after an acknowledged return. An unsigned request needs acknowledgement or resolution."}
        </p>
      </div>
      {mode === "handover" && Boolean(rental.data) && status === 0 && (
        <p className="notice">{MEDIATOR_BEFORE_HANDOVER}</p>
      )}
      {waitingForPickup && start !== undefined && (
        <p className="notice" role="status">
          Pickup dibuka pukul {formatPickupClock(Number(start))} · {formatCountdown(pickupSecondsRemaining(start, now))}
        </p>
      )}
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
          {payload && !waitingForPickup && (
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
                disabled={!canSubmit || tx.pending || !photoHash || ![1, 3].includes(status)}
                onClick={() => void tx.run(() => submit(true))}
              >
                Request return acknowledgement
              </button>
            </div>
          )}
          <p className="field-help">
            {mode === "handover"
              ? "The renter signs; the owner submits. The rental becomes active once this transaction is confirmed."
              : "If the owner won’t sign, submit a return request. Funds stay locked and reputation is unchanged until the return is acknowledged or resolved. Keep the original photo and share it with the other party or mediator."}
          </p>
          <TransactionFeedback {...tx} />
          {mode === "return" && (
            <ClaimBox rentalId={rentalId} isOwner={isOwner} isRenter={isRenter} status={status} />
          )}
        </aside>
      </div>
      {mode === "return" && status === 2 && <ClaimRelease rentalId={rentalId} />}
      {tx.writable && <RentalResolution rentalId={rentalId} owner={owner} renter={renter} status={status} />}
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
  const { address } = useAccount();
  const [amount, setAmount] = useState("100000");
  const [evidence, setEvidence] = useState<Hex | "">("");
  const [counter, setCounter] = useState("0");
  const reads = useReadContracts({
    contracts: ["claims", "rentals", "meta", "responseDeadline", "claimDeadline"].map((functionName) => ({
      chainId: chain.id, address: addresses.escrow, abi: rentalEscrowAbi, functionName, args: [rentalId],
    })),
    query: { enabled: tx.writable, refetchInterval: 10_000 },
  });
  const rows = reads.data?.map((row) => row.result) ?? [];
  const claimAmount = tupleAt(rows[1], 11);
  const remaining = tupleAt(rows[2], 2);
  const hasCounter = tupleAt(rows[0], 5) === true;
  const disabled = tx.pending || !tx.writable || reads.isLoading || reads.isError || reads.data?.some((row) => row.status === "failure");
  const responseOpen = typeof rows[3] === "bigint" && rows[3] > BigInt(Math.floor(Date.now() / 1000));
  const claimOpen = typeof rows[4] === "bigint" && rows[4] > BigInt(Math.floor(Date.now() / 1000));

  async function fileClaim() {
    if (!addresses.escrow || !addresses.idr || !evidence) return;
    const wei = rpToWei(amount);
    if (typeof remaining !== "bigint" || wei > remaining) throw new Error("The claim exceeds the remaining deposit.");
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
    await tx.send(addresses.idr, approve, async (probe) => {
      if (!address || !addresses.escrow) return false;
      const allowance = await probe.read({
        address: addresses.idr,
        abi: mockIdrAbi,
        functionName: "allowance",
        args: [address, addresses.escrow],
      });
      return typeof allowance === "bigint" && allowance >= bond;
    });
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "fileDamageClaim",
      args: [rentalId, wei, evidence],
    });
    await tx.send(addresses.escrow, data, (probe) => expectRentalStatus(probe, rentalId, 4));
  }

  async function respond(accept: boolean) {
    if (!addresses.escrow) return;
    const counterWei = rpToWei(counter);
    if (!accept && (typeof claimAmount !== "bigint" || counterWei >= claimAmount)) throw new Error("The counteroffer must be lower than the claim.");
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "respondClaim",
      args: [rentalId, accept, accept ? 0n : counterWei],
    });
    await tx.send(addresses.escrow, data, async (probe) => {
      if (accept) return expectRentalStatus(probe, rentalId, 6);
      const claim = await probe.read({ functionName: "claims", args: [rentalId] });
      return tupleAt(claim, 4) === true;
    });
  }

  async function acceptCounter() {
    if (!addresses.escrow) return;
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "acceptCounter",
      args: [rentalId],
    });
    await tx.send(addresses.escrow, data, (probe) => expectRentalStatus(probe, rentalId, 6));
  }

  async function escalate() {
    if (!addresses.escrow) return;
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "escalate",
      args: [rentalId],
    });
    await tx.send(addresses.escrow, data, (probe) => expectRentalStatus(probe, rentalId, 5));
  }

  return (
    <div className="claim-box">
      <h3>Damage claims</h3>
      <p className="small muted">
        Owners lock a bond worth 10% of the claim. Renters can accept or counter. If a response is
        missing, funds remain locked until mutual agreement or an agreed mediator’s decision.
        No community jury or automatic evidence verification is available.
      </p>
      {typeof claimAmount === "bigint" && claimAmount > 0n && <p>Owner’s claim: <strong>{formatIDR(claimAmount)}</strong>. Bond: {formatIDR(typeof tupleAt(rows[0], 0) === "bigint" ? tupleAt(rows[0], 0) as bigint : undefined)}.</p>}
      {typeof remaining === "bigint" && <p>Remaining deposit: {formatIDR(remaining)}</p>}
      {status === 4 && typeof rows[3] === "bigint" && <p className="field-help">Initial response deadline: {formatWhen(rows[3])}. After it closes, use mutual settlement or the mediator controls below.</p>}
      {isOwner && status === 2 && claimOpen && (
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
              disabled || !evidence || !/^\d+$/.test(amount) || BigInt(amount || "0") <= 0n
            }
            onClick={() => void tx.run(fileClaim)}
          >
            Submit damage claim
          </button>
        </>
      )}
      {isRenter && status === 4 && responseOpen && (
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
              disabled={disabled || typeof claimAmount !== "bigint"}
              onClick={() => void tx.run(() => respond(true))}
            >
              Accept claim
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || !/^\d+$/.test(counter)}
              onClick={() => void tx.run(() => respond(false))}
            >
              Send counteroffer
            </button>
          </div>
        </>
      )}
      {isOwner && (status === 4 || status === 5) && hasCounter && (
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => void tx.run(acceptCounter)}
        >
          Accept counteroffer
        </button>
      )}
      {(isOwner || isRenter) && status === 4 && (
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => void tx.run(escalate)}
        >
          Mark claim disputed
        </button>
      )}
      <TransactionFeedback {...tx} />
    </div>
  );
}
