"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { Icon } from "@/components/icon";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { encodeFunctionData } from "viem";
import { useRentraTx } from "@/components/use-tx";
import {
  addresses,
  chain,
  configured,
  rentalEscrowAbi,
  rentalItemAbi,
  statusLabel,
} from "@/lib/contracts";
import { formatIDR, formatWhen, shortAddr, tupleAt } from "@/lib/format";
import { expectRentalStatus } from "@/lib/tx-expectations";
import { MEDIATOR_BEFORE_HANDOVER } from "@/lib/mediator-copy";
import { Countdown } from "@/components/countdown";
import { ClaimRelease } from "@/components/claim-release";

export default function MyRentalsPage() {
  const router = useRouter();
  const [lookupId, setLookupId] = useState("");
  const { address } = useAccount();
  const tx = useRentraTx();
  const next = useReadContract({
    chainId: chain.id,
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "nextRentalId",
    query: { enabled: configured, refetchInterval: 15_000 },
  });
  const demo = useReadContract({
    chainId: chain.id,
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
      chainId: chain.id,
      address: addresses.escrow,
      abi: rentalEscrowAbi,
      functionName: "rentals",
      args: [id],
    })),
    query: { enabled: configured && ids.length > 0, refetchInterval: 15_000 },
  });

  const mine = ids.flatMap((id, index) => {
    const row = reads.data?.[index]?.result;
    if (!row || !address) return [];
    const owner = String(tupleAt(row, 1) ?? "");
    const renter = String(tupleAt(row, 2) ?? "");
    if (
      owner.toLowerCase() !== address.toLowerCase() &&
      renter.toLowerCase() !== address.toLowerCase()
    ) {
      return [];
    }
    return [{ id, row, owner, renter }];
  });

  async function claimDefault(id: bigint) {
    if (!addresses.escrow) return;
    const data = encodeFunctionData({
      abi: rentalEscrowAbi,
      functionName: "claimDefault",
      args: [id],
    });
    await tx.send(addresses.escrow, data, (probe) => expectRentalStatus(probe, id, 7));
  }

  async function cancel(id: bigint) {
    if (!addresses.escrow) return;
    await tx.send(
      addresses.escrow,
      encodeFunctionData({ abi: rentalEscrowAbi, functionName: "cancel", args: [id] }),
      (probe) => expectRentalStatus(probe, id, 8),
    );
  }

  return (
    <div>
      <div className="page-heading">
        <span className="eyebrow">From pickup to the next adventure</span>
        <h1>Your rentals, all in one place.</h1>
        <p>Keep track of what you’re borrowing and lending, with the next step always in reach.</p>
      </div>
      <form className="card" onSubmit={(event) => { event.preventDefault(); if (/^[1-9]\d*$/.test(lookupId)) router.push(`/return/${lookupId}`); }}>
        <label htmlFor="rental-lookup">Open a rental by number (including as mediator)</label>
        <div className="row"><input id="rental-lookup" type="number" min="1" step="1" value={lookupId} onChange={(event) => setLookupId(event.target.value)} /><button type="submit" disabled={!/^[1-9]\d*$/.test(lookupId)}>Open rental</button></div>
      </form>
      {!address && (
        <div className="empty-state">
          <Icon name="box" size={36} />
          <h2>Your next adventure belongs here.</h2>
          <p>Connect MetaMask to see the items you’re renting or lending.</p>
          <WalletConnectButton />
        </div>
      )}
      {demo.data === true && (
        <p className="notice">
          Demo clock is on: one rental day passes in two real minutes. In the updated contracts,
          claim and response windows still use 24 real hours. Check the deployment notice above.
        </p>
      )}
      {!configured && (
        <p className="notice warn">
          You’re in preview mode. Your rentals will appear here when live bookings are available.
        </p>
      )}
      {configured && address && (next.isLoading || reads.isLoading) && (
        <p className="notice" role="status">
          Loading your rentals…
        </p>
      )}
      {configured && address && (next.isError || reads.isError) && (
        <p className="notice warn" role="alert">
          We couldn’t load your rentals. Please try again later.
        </p>
      )}
      {configured &&
        address &&
        !next.isLoading &&
        !reads.isLoading &&
        !next.isError &&
        !reads.isError &&
        mine.length === 0 && (
          <div className="empty-state">
            <Icon name="box" size={36} />
            <h2>A fresh start.</h2>
            <p>No rentals yet. Find something for your next plan or list an item of your own.</p>
            <Link className="button" href="/#catalog">
              Explore the collection <Icon name="arrow" size={16} />
            </Link>
          </div>
        )}
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
              pending={tx.pending || !tx.writable}
              onDefault={() => void tx.run(() => claimDefault(id))}
              onCancel={() => void tx.run(() => cancel(id))}
            />
          );
        })}
      </div>
      <TransactionFeedback {...tx} />
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
  onCancel,
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
  onCancel: () => void;
}) {
  const expires = useReadContract({
    chainId: chain.id,
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "userExpires",
    args: [tokenId],
    query: { enabled: configured },
  });

  return (
    <article className="card">
      <h3>Rental #{id.toString()}</h3>
      <p>
        {isOwner ? "You’re lending" : "You’re renting"} · With {shortAddr(counterparty)}
      </p>
      <div className="meta">
        <span className={`pill ${status === 1 ? "ok" : status === 7 ? "bad" : "warn"}`}>
          {statusLabel(status)}
        </span>
        <span className="pill">Rent {formatIDR(rent)}</span>
        <span className="pill">Deposit {formatIDR(deposit)}</span>
      </div>
      <p className="small">
        Scheduled return: {formatWhen(end)}
        {(status === 1 || status === 3) &&
          typeof expires.data === "bigint" &&
          expires.data > 0n && (
            <>
              {" "}
              · Time remaining: <Countdown expires={expires.data} />
            </>
          )}
      </p>
      {status === 0 && <p className="notice">{MEDIATOR_BEFORE_HANDOVER}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        {status === 0 && (
          <Link className="button" href={`/handover/${id}`}>
            {isOwner ? "Start handover" : "Review handover"}
          </Link>
        )}
        {(status === 1 || status === 3) && (
          <Link className="button" href={`/return/${id}`}>
            {isOwner ? "Review return" : "Return item"}
          </Link>
        )}
        {[2, 4, 5, 9, 10].includes(status) && (
          <Link className="button secondary" href={`/return/${id}`}>
            Manage return & claims
          </Link>
        )}
        {isOwner && (status === 1 || status === 3) && (
          <button type="button" className="secondary" disabled={pending} onClick={onDefault}>
            Claim non-return
          </button>
        )}
        {status === 0 && <button type="button" className="secondary" disabled={pending} onClick={onCancel}>Cancel booking & refund</button>}
      </div>
      {status === 2 && <ClaimRelease rentalId={id} />}
    </article>
  );
}
