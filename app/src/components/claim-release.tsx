"use client";

import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { encodeFunctionData } from "viem";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { useRentraTx } from "@/components/use-tx";
import { addresses, chain, configured, rentalEscrowAbi } from "@/lib/contracts";
import { canFinalizeClaim, claimSecondsRemaining, formatCountdown, isClaimWindowOpen } from "@/lib/claim-window";
import { formatIDR, formatWhen, tupleAt } from "@/lib/format";
import { expectRentalStatus } from "@/lib/tx-expectations";

function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function ClaimRelease({ rentalId }: { rentalId: bigint }) {
  const tx = useRentraTx();
  const now = useNow();
  const reads = useReadContracts({
    contracts: [
      {
        chainId: chain.id,
        address: addresses.escrow,
        abi: rentalEscrowAbi,
        functionName: "claimDeadline",
        args: [rentalId],
      },
      {
        chainId: chain.id,
        address: addresses.escrow,
        abi: rentalEscrowAbi,
        functionName: "meta",
        args: [rentalId],
      },
    ],
    query: { enabled: configured, refetchInterval: 15_000 },
  });
  const deadlineResult = reads.data?.[0];
  const metaResult = reads.data?.[1];
  const deadline = typeof deadlineResult?.result === "bigint" ? deadlineResult.result : undefined;
  const depositRemaining = tupleAt(metaResult?.result, 2);
  const deposit = typeof depositRemaining === "bigint" ? depositRemaining : undefined;
  const open = deadline !== undefined && isClaimWindowOpen(deadline, now);
  const ready = canFinalizeClaim(deadline, now);
  const failed = reads.isError || deadlineResult?.status === "failure";
  const waiting = !reads.isLoading && !failed && (deadline === undefined || deadline <= 0n);

  async function finalize() {
    if (!addresses.escrow || !canFinalizeClaim(deadline, Math.floor(Date.now() / 1000))) return;
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "finalizeClaim",
      args: [rentalId],
    });
    await tx.send(addresses.escrow, data, (probe) => expectRentalStatus(probe, rentalId, 6));
  }

  return (
    <div className={`notice claim-window${ready ? " ready" : ""}`}>
      {reads.isLoading && (
        <p role="status">Loading the claim window…</p>
      )}
      {failed && (
        <p className="warn-inline" role="alert">
          We couldn’t load the claim deadline. Try again before finalizing the deposit.
        </p>
      )}
      {!reads.isLoading && !failed && (
        <>
          <p>
            <strong>Claim window.</strong>{" "}
            {open &&
              "This return is recorded, but the item and remaining deposit stay locked so the owner can still file a damage claim. Rent and any late fee are already paid to the owner."}
            {ready &&
              "The claim window has ended. Finalize to unlock the item and release the remaining deposit to the renter."}
            {waiting &&
              "Waiting for the claim deadline to confirm onchain. The item and remaining deposit stay locked until that deadline is visible."}
          </p>
          {deposit !== undefined && (
            <p>
              Remaining deposit held: <strong>{formatIDR(deposit)}</strong>
            </p>
          )}
          {deadline !== undefined && deadline > 0n && (
            <p>
              {open ? (
                <>
                  Deposit can be finalized in{" "}
                  <strong className="countdown">{formatCountdown(claimSecondsRemaining(deadline, now))}</strong>
                  <span className="small"> · real time, until {formatWhen(deadline)}</span>
                </>
              ) : (
                <>Claim deadline was {formatWhen(deadline)} (real time). The window is closed.</>
              )}
            </p>
          )}
          {ready && (
            <p className="sr-only" role="status">
              The claim window has ended. Finalize and release deposit is available.
            </p>
          )}
        </>
      )}
      <button
        type="button"
        className={ready ? "ready" : "secondary"}
        disabled={!ready || tx.pending || !tx.writable || failed}
        onClick={() => void tx.run(finalize)}
      >
        {tx.pending
          ? "Finalizing release…"
          : ready
            ? "Finalize and release deposit"
            : "Finalize after the claim window"}
      </button>
      <TransactionFeedback {...tx} />
    </div>
  );
}
