"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, useSignTypedData } from "wagmi";
import { encodeFunctionData } from "viem";
import type { Address } from "viem";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { Icon } from "@/components/icon";
import { useRentraTx } from "@/components/use-tx";
import {
  addresses,
  chain,
  configured,
  mockIdrAbi,
  rentalEscrowAbi,
  rentalItemAbi,
  reputationAbi,
} from "@/lib/contracts";
import {
  formatIDR,
  formatWhen,
  localInputToUnix,
  shortAddr,
  tupleAt,
  unixToLocalInput,
} from "@/lib/format";
import { findSample } from "@/lib/samples";
import { idrDomain, permitTypes, splitSignature } from "@/lib/sign";

export default function ItemPage() {
  const params = useParams<{ id: string }>();
  const idParam = params.id;
  const sample = findSample(idParam);
  const tokenId = /^\d+$/.test(idParam) ? BigInt(idParam) : undefined;

  if (!configured || tokenId === undefined) {
    return (
      <div>
        <Link href="/#catalog" className="text-link back-link">
          ← Back to the collection
        </Link>
        <div className="split">
          <article className="card">
            <span className="eyebrow">{sample?.category ?? "Sample item"} · Preview</span>
            <h1 style={{ marginTop: 16 }}>{sample?.name ?? "Item unavailable"}</h1>
            {sample && (
              <div
                className={`item-art ${sample.icon}`}
                style={{ borderRadius: 12, marginBottom: 24 }}
              >
                <Icon name={sample.icon} size={90} />
              </div>
            )}
            <p>
              {sample?.blurb ??
                "This item is not available. Explore the collection to find a rental."}
            </p>
            <dl className="summary">
              <div>
                <dt>Item value</dt>
                <dd>{sample?.value ?? "—"}</dd>
              </div>
              <div>
                <dt>Daily rental price</dt>
                <dd>{sample?.rate ?? "—"}</dd>
              </div>
              <div>
                <dt>Late fee</dt>
                <dd>{sample?.late ?? "—"}</dd>
              </div>
              <div>
                <dt>Grace period</dt>
                <dd>{sample?.grace ?? "—"}</dd>
              </div>
            </dl>
          </article>
          <aside className="card">
            <h2>Your next rental starts here.</h2>
            <p>
              A new renter’s deposit starts at the item’s value. Qualifying on-time rentals can
              lower it to 30% on eligible value.
            </p>
            <p className="notice">
              This is a sample listing. Booking isn’t available in this preview.
            </p>
            <button className="full-width" type="button" disabled>
              Booking unavailable
            </button>
            <p className="small muted" style={{ marginTop: 16 }}>
              After return, the remaining deposit is released after the claim window, subject to any
              fees or damage claims.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return <OnchainItem tokenId={tokenId} />;
}

function OnchainItem({ tokenId }: { tokenId: bigint }) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const tx = useRentraTx();
  const now = Math.floor(Date.now() / 1000);
  const [start, setStart] = useState(unixToLocalInput(now + 60));
  const [end, setEnd] = useState(unixToLocalInput(now + 2 * 86400));

  const terms = useReadContract({
    chainId: chain.id,
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "terms",
    args: [tokenId],
  });
  const uri = useReadContract({
    chainId: chain.id,
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "tokenURI",
    args: [tokenId],
  });
  const owner = useReadContract({
    chainId: chain.id,
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  const user = useReadContract({
    chainId: chain.id,
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "userOf",
    args: [tokenId],
  });
  const expires = useReadContract({
    chainId: chain.id,
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
    chainId: chain.id,
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "quoteDeposit",
    args: [tokenId, (address ?? "0x0000000000000000000000000000000000000000") as Address],
    query: { enabled: Boolean(address) },
  });
  const quoteRent = useReadContract({
    chainId: chain.id,
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "quoteRent",
    args: [tokenId, startUnix ?? 0n, endUnix ?? 0n],
    query: { enabled: Boolean(startUnix && endUnix && endUnix > startUnix) },
  });
  const factor = useReadContract({
    chainId: chain.id,
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "depositFactorBps",
    args: [address as Address],
    query: { enabled: Boolean(address) },
  });
  const balance = useReadContract({
    chainId: chain.id,
    address: addresses.idr,
    abi: mockIdrAbi,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: Boolean(address) },
  });
  const nonce = useReadContract({
    chainId: chain.id,
    address: addresses.idr,
    abi: mockIdrAbi,
    functionName: "nonces",
    args: [address as Address],
    query: { enabled: Boolean(address) },
  });

  const name = typeof uri.data === "string" && uri.data ? uri.data : `Item #${tokenId}`;
  const value = tupleAt(terms.data, 0);
  const rate = tupleAt(terms.data, 1);
  const late = tupleAt(terms.data, 2);
  const grace = tupleAt(terms.data, 3);
  const deposit =
    typeof quoteDeposit.data === "bigint"
      ? quoteDeposit.data
      : typeof value === "bigint"
        ? value
        : undefined;
  const rent = typeof quoteRent.data === "bigint" ? quoteRent.data : undefined;
  const factorBps = typeof factor.data === "bigint" ? Number(factor.data) : 10000;

  async function faucet() {
    if (!addresses.idr) return;
    const data = encodeFunctionData({ abi: mockIdrAbi, functionName: "faucet" });
    await tx.send(addresses.idr, data);
  }

  async function book() {
    if (
      !addresses.escrow ||
      !addresses.idr ||
      !address ||
      !startUnix ||
      !endUnix ||
      rent === undefined ||
      deposit === undefined
    ) {
      return;
    }
    if (endUnix <= startUnix) throw new Error("Choose a return time after pickup.");
    if (startUnix + 300n < BigInt(Math.floor(Date.now() / 1000))) {
      throw new Error("Your pickup time has passed. Choose a new pickup time.");
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

  const total = rent !== undefined && deposit !== undefined ? rent + deposit : undefined;
  const validDates = Boolean(startUnix && endUnix && endUnix > startUnix);
  const isOwner = address?.toLowerCase() === String(owner.data ?? "").toLowerCase();
  const balanceValue = typeof balance.data === "bigint" ? balance.data : undefined;
  const insufficientBalance =
    total !== undefined && balanceValue !== undefined && balanceValue < total;
  const locked = useReadContract({
    chainId: chain.id,
    address: addresses.escrow,
    abi: rentalEscrowAbi,
    functionName: "isLocked",
    args: [tokenId],
  });

  return (
    <div>
      <Link href="/#catalog" className="text-link back-link">
        ← Back to the collection
      </Link>
      <div className="split">
        <article className="card">
          <span className="eyebrow">Community rental · Item #{tokenId.toString()}</span>
          <h1 style={{ marginTop: 16 }}>{name}</h1>
          <p>Listed by {typeof owner.data === "string" ? shortAddr(owner.data) : "—"}</p>
          {terms.isLoading && (
            <p className="notice" role="status">
              Loading rental terms…
            </p>
          )}
          {(terms.isError || owner.isError) && (
            <p className="notice warn" role="alert">
              We couldn’t load this item. Check the item number or try again later.
            </p>
          )}
          <dl className="summary">
            <div>
              <dt>Item value</dt>
              <dd>{formatIDR(typeof value === "bigint" ? value : undefined)}</dd>
            </div>
            <div>
              <dt>Daily rental price</dt>
              <dd>{formatIDR(typeof rate === "bigint" ? rate : undefined)}</dd>
            </div>
            <div>
              <dt>Late fee per hour</dt>
              <dd>{formatIDR(typeof late === "bigint" ? late : undefined)}</dd>
            </div>
            <div>
              <dt>Grace period</dt>
              <dd>{grace?.toString() ?? "—"} hours</dd>
            </div>
          </dl>
          {typeof user.data === "string" &&
            user.data !== "0x0000000000000000000000000000000000000000" && (
              <p className="notice">
                Currently rented by {shortAddr(user.data)} until{" "}
                {formatWhen(typeof expires.data === "bigint" ? expires.data : undefined)}.
              </p>
            )}
          <h2>A deposit that reflects your reputation.</h2>
          <p>
            Your current factor is {(factorBps / 100).toFixed(0)}% on eligible value. The full value
            applies above your highest successfully rented amount. No ID document is required.
          </p>
          <Link className="text-link" href="/reputation">
            Understand your reputation <Icon name="arrow" size={16} />
          </Link>
        </article>
        <aside className="card">
          <h2>Make it yours for a while.</h2>
          <label htmlFor="rental-start">Pickup date and time</label>
          <input
            id="rental-start"
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <label htmlFor="rental-end">Return date and time</label>
          <input
            id="rental-end"
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
          {!validDates && (
            <p className="notice warn" role="alert">
              Choose a return time after pickup.
            </p>
          )}
          <dl className="summary">
            <div>
              <dt>Rental payment</dt>
              <dd>{formatIDR(rent)}</dd>
            </div>
            <div>
              <dt>Deposit held in escrow</dt>
              <dd>{formatIDR(deposit)}</dd>
            </div>
            <div className="total">
              <dt>Total to book</dt>
              <dd>{formatIDR(total)}</dd>
            </div>
          </dl>
          <p className="small muted">
            Rental time rounds up to full days. The remaining deposit is released after the 24-hour
            claim window, subject to fees or claims. Demo mode speeds up this window.
          </p>
          {!isConnected ? (
            <WalletConnectButton label="Connect MetaMask to book" className="full-width" />
          ) : (
            <>
              <p className="small muted">
                Test balance: {formatIDR(balanceValue)}. Test mIDR has no real monetary value. A
                small amount of Sepolia ETH in MetaMask is needed for network fees.
              </p>
              <button
                type="button"
                className="secondary full-width"
                disabled={tx.pending}
                onClick={() => void tx.run(faucet)}
              >
                Add test funds
              </button>
              {insufficientBalance && (
                <p className="notice warn">
                  Add test funds to cover the rental payment and deposit.
                </p>
              )}
              {isOwner && (
                <p className="notice">
                  You own this item. Renters can book it from their accounts.
                </p>
              )}
              {locked.data === true && (
                <p className="notice">
                  This item already has an open rental. Check back once it’s settled.
                </p>
              )}
              <button
                className="full-width"
                style={{ marginTop: 12 }}
                type="button"
                disabled={
                  tx.pending ||
                  !validDates ||
                  rent === undefined ||
                  deposit === undefined ||
                  insufficientBalance ||
                  isOwner ||
                  locked.data !== false ||
                  !address ||
                  quoteDeposit.isLoading ||
                  quoteDeposit.isError ||
                  balance.isLoading ||
                  balance.isError ||
                  nonce.isLoading ||
                  nonce.isError
                }
                onClick={() => void tx.run(book)}
              >
                {tx.pending ? "Confirming your request…" : "Confirm booking"}
              </button>
            </>
          )}
          <TransactionFeedback {...tx} />
          {tx.confirmed && (
            <Link className="text-link" href="/my">
              Go to My rentals <Icon name="arrow" size={16} />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
