"use client";

import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { encodeFunctionData, isAddress, zeroAddress } from "viem";
import type { Hex } from "viem";
import { addresses, chain, rentalEscrowAbi } from "@/lib/contracts";
import { formatIDR, formatWhen, rpToWei, tupleAt } from "@/lib/format";
import { useRentraTx } from "@/components/use-tx";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { PhotoHash } from "@/components/photo-hash";

export function RentalResolution({ rentalId, owner, renter, status }: {
  rentalId: bigint; owner: string; renter: string; status: number;
}) {
  const { address } = useAccount();
  const tx = useRentraTx();
  const [mediatorInput, setMediatorInput] = useState("");
  const [amount, setAmount] = useState("0");
  const [returned, setReturned] = useState(true);
  const [returnBond, setReturnBond] = useState(true);
  const [evidence, setEvidence] = useState<Hex | "">("");
  const reads = useReadContracts({
    contracts: ["mediations", "returnRequests", "settlementOffers", "claimDeadline", "responseDeadline", "meta", "rentals", "claims"].map((functionName) => ({
      chainId: chain.id, address: addresses.escrow, abi: rentalEscrowAbi, functionName, args: [rentalId],
    })),
    query: { enabled: tx.writable, refetchInterval: 10_000 },
  });
  const rows = reads.data?.map((row) => row.result) ?? [];
  const proposed = String(tupleAt(rows[0], 0) ?? zeroAddress);
  const mediator = String(tupleAt(rows[0], 1) ?? zeroAddress);
  const proposer = String(tupleAt(rows[2], 0) ?? zeroAddress);
  const offerAmount = tupleAt(rows[2], 1);
  const isOwner = address?.toLowerCase() === owner.toLowerCase();
  const isRenter = address?.toLowerCase() === renter.toLowerCase();
  const isMediator = mediator !== zeroAddress && address?.toLowerCase() === mediator.toLowerCase();
  const pendingReturn = status === 9 || status === 10;
  const disputed = status === 4 || status === 5;
  const negotiable = pendingReturn || disputed;
  const amountValid = /^\d+$/.test(amount);
  const readFailed = reads.isError || reads.data?.some((row) => row.status === "failure");
  const disabled = tx.pending || !tx.writable || reads.isLoading || readFailed;
  const claimEnd = typeof rows[3] === "bigint" ? rows[3] : undefined;
  const responseEnd = typeof rows[4] === "bigint" ? rows[4] : undefined;

  async function send(functionName: string, args: readonly unknown[]) {
    if (!addresses.escrow) return;
    await tx.send(addresses.escrow, encodeFunctionData({ abi: rentalEscrowAbi, functionName, args }));
  }

  function downloadReceipt() {
    const receipt = {
      exportedAt: new Date().toISOString(), chainId: chain.id, escrow: addresses.escrow,
      rentalId, rental: rows[6], mediation: rows[0], returnRequest: rows[1],
      offer: rows[2], claimDeadline: claimEnd, responseDeadline: responseEnd, meta: rows[5], claim: rows[7],
      note: "Local export of contract reads, not a signed attestation. Keep original photos separately; hashes do not verify authenticity.",
    };
    const blob = new Blob([JSON.stringify(receipt, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rentra-rental-${rentalId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2>Return protection & settlement</h2>
      <p className="small muted">
        A return request keeps rent and deposit locked until acknowledged or resolved. A disputed
        claim needs mutual agreement or your agreed mediator. Silence does not award funds.
        Without agreement or a responsive mediator, disputed funds can stay locked indefinitely.
      </p>
      {readFailed && <p className="notice warn" role="alert">Resolution details could not be loaded. Please retry.</p>}
      <p>Mediator: {mediator === zeroAddress ? "None agreed — bilateral settlement only" : mediator}</p>
      {status === 0 && mediator === zeroAddress && (
        <>
          <p className="field-help">Agree on a trusted, available mediator before pickup. They can allocate this rental’s funds and rule non-return after the grace period. No mediation service is provided by Rentra. Cancel before pickup if you cannot agree.</p>
          {proposed !== zeroAddress && <p>Proposed mediator: {proposed}</p>}
          {isOwner && <>
            <label htmlFor="mediator-address">Mediator wallet address (zero address withdraws a pending proposal)</label>
            <input id="mediator-address" value={mediatorInput} onChange={(event) => setMediatorInput(event.target.value)} placeholder="0x…" />
            <button type="button" disabled={disabled || !isAddress(mediatorInput)} onClick={() => void tx.run(() => send("proposeMediator", [rentalId, mediatorInput]))}>Propose mediator</button>
          </>}
          {isRenter && proposed !== zeroAddress && <button type="button" disabled={disabled} onClick={() => void tx.run(() => send("acceptMediator", [rentalId, proposed]))}>Accept this mediator</button>}
        </>
      )}
      {status === 2 && claimEnd !== undefined && <p>Claim window closes: <strong>{formatWhen(claimEnd)}</strong> (real time). After this deadline, an uncontested deposit can be released by a transaction.</p>}
      {disputed && responseEnd !== undefined && <p>Initial response deadline: <strong>{formatWhen(responseEnd)}</strong> (real time). Missing this deadline does not settle the claim. Mutual settlement and mediator resolution remain available.</p>}
      {pendingReturn && isOwner && <>
        <button type="button" disabled={disabled} onClick={() => void tx.run(() => send("acknowledgeReturn", [rentalId]))}>Acknowledge physical return</button>
        {status === 9 && <>
          <PhotoHash label="Evidence that the return is disputed" onHash={setEvidence} />
          <button type="button" className="secondary" disabled={disabled || !evidence} onClick={() => void tx.run(() => send("disputeReturn", [rentalId, evidence]))}>Dispute this return</button>
        </>}
      </>}
      {negotiable && (isOwner || isRenter || isMediator) && <>
        <label htmlFor="settlement-amount">Compensation to owner from remaining deposit (Rp)</label>
        <input id="settlement-amount" type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <p className="field-help">Rent and late fees are separate. An agreed settlement returns the claim bond to the owner. Compensation cannot exceed the remaining deposit; mediator damage rulings also cannot exceed the claim amount.</p>
        {(isOwner || isRenter) && <button type="button" disabled={disabled || !amountValid} onClick={() => void tx.run(() => send("proposeSettlement", [rentalId, rpToWei(amount)]))}>Propose settlement</button>}
        {(isOwner || isRenter) && proposer !== zeroAddress && <div className="notice">
          <p>{proposer} proposes {formatIDR(typeof offerAmount === "bigint" ? offerAmount : undefined)} compensation to the owner. Acceptance settles the rental and releases the remaining deposit.</p>
          {address?.toLowerCase() !== proposer.toLowerCase() && <button type="button" disabled={disabled || typeof offerAmount !== "bigint"} onClick={() => void tx.run(() => send("acceptSettlement", [rentalId, proposer, offerAmount]))}>Accept this exact settlement</button>}
        </div>}
        {isMediator && <>
          {pendingReturn
            ? <label><input type="checkbox" checked={returned} onChange={(event) => setReturned(event.target.checked)} /> Item was returned. Uncheck only to rule non-return after grace; this permanently records default.</label>
            : <label><input type="checkbox" checked={returnBond} onChange={(event) => setReturnBond(event.target.checked)} /> Return claim bond to owner (uncheck to award it to renter)</label>}
          <button type="button" disabled={disabled || !amountValid || (pendingReturn && !returned && amount !== "0")} onClick={() => void tx.run(() => pendingReturn
            ? send("resolveReturn", [rentalId, returned, rpToWei(amount)])
            : send("resolveClaim", [rentalId, rpToWei(amount), returnBond]))}>Submit mediator decision</button>
        </>}
      </>}
      <button type="button" className="secondary" style={{ marginTop: 16 }} disabled={disabled} onClick={downloadReceipt}>Download rental evidence receipt</button>
      <TransactionFeedback {...tx} />
    </section>
  );
}
