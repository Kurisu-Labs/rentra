"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { isAddress } from "viem";
import type { Address } from "viem";
import { addresses, chain, configured, reputationAbi } from "@/lib/contracts";
import { formatIDR, shortAddr, tupleAt } from "@/lib/format";
import { Icon } from "@/components/icon";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useProtocol } from "@/components/use-protocol";

export function ReputationView({ initial }: { initial?: string }) {
  const { address: connected } = useAccount();
  const protocol = useProtocol();
  const router = useRouter();
  const [lookup, setLookup] = useState(initial ?? "");
  const [lookupError, setLookupError] = useState("");
  const target = (initial ? (isAddress(initial) ? initial : undefined) : connected) as
    Address | undefined;

  const score = useReadContract({
    chainId: chain.id,
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "scoreOf",
    args: [target as Address],
    query: { enabled: configured && Boolean(target) },
  });
  const factor = useReadContract({
    chainId: chain.id,
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "depositFactorBps",
    args: [target as Address],
    query: { enabled: configured && Boolean(target) },
  });
  const maxValue = useReadContract({
    chainId: chain.id,
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "maxSuccessfulValue",
    args: [target as Address],
    query: { enabled: configured && Boolean(target) },
  });
  const defaulted = useReadContract({
    chainId: chain.id,
    address: addresses.reputation,
    abi: reputationAbi,
    functionName: "hasDefaulted",
    args: [target as Address],
    query: { enabled: configured && Boolean(target) },
  });

  const damages = useReadContract({
    chainId: chain.id, address: addresses.reputation, abi: reputationAbi,
    functionName: "damagesOf", args: [target as Address], query: { enabled: protocol.ready && Boolean(target) },
  });
  const factorBps = typeof factor.data === "bigint" || typeof factor.data === "number" ? Number(factor.data) : 10000;
  const ok = tupleAt(score.data, 1);
  const late = tupleAt(score.data, 2);
  const defaults = tupleAt(score.data, 3);
  const points = tupleAt(score.data, 0);
  const loading = score.isLoading || factor.isLoading || maxValue.isLoading || defaulted.isLoading;
  const failed = score.isError || factor.isError || maxValue.isError || defaulted.isError;

  return (
    <div>
      <div className="page-heading">
        <span className="eyebrow">Trust you take with you</span>
        <h1>Good returns. Better beginnings.</h1>
        <p>
          Your rental history stays with your account. Build a record of on-time returns and put
          down less on your next eligible rental.
        </p>
      </div>
      <div className="split">
        <section className="card">
          <h2>Your rental reputation</h2>
          <p>View your account or look up someone else’s public rental history.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = lookup.trim();
              if (!isAddress(value)) {
                setLookupError("Enter a valid Ethereum account address, starting with 0x.");
                return;
              }
              setLookupError("");
              router.push(`/reputation/${value}`);
            }}
          >
            <label htmlFor="reputation-address">Account address</label>
            <div className="row" style={{ alignItems: "stretch", flexWrap: "nowrap" }}>
              <input
                id="reputation-address"
                placeholder="0x…"
                value={lookup}
                onChange={(event) => {
                  setLookup(event.target.value);
                  setLookupError("");
                }}
                aria-invalid={Boolean(lookupError)}
                aria-describedby={lookupError ? "lookup-error" : undefined}
              />
              <button type="submit">
                Look up <Icon name="arrow" size={16} />
              </button>
            </div>
            {lookupError && (
              <p id="lookup-error" className="notice warn" role="alert">
                {lookupError}
              </p>
            )}
          </form>
          {initial && !isAddress(initial) && (
            <p className="notice warn">
              This account address is invalid. Enter a valid address above.
            </p>
          )}
          {!configured && (
            <p className="notice">
              Reputation records aren’t available in this preview. Once connected, this page shows
              recorded rental history.
            </p>
          )}
          {configured && !target && !initial && (
            <div className="empty-state">
              <Icon name="shield" size={32} />
              <h3>Your reputation starts with you.</h3>
              <p>Connect MetaMask or enter a wallet address to view its rental record.</p>
              <WalletConnectButton />
            </div>
          )}
          {configured && target && loading && (
            <p className="notice" role="status">
              Loading rental history…
            </p>
          )}
          {configured && target && failed && (
            <p className="notice warn" role="alert">
              We couldn’t load this rental history. Please try again later.
            </p>
          )}
          {configured && target && !loading && !failed && (
            <>
              <h3 style={{ marginTop: 28 }}>{shortAddr(target)}</h3>
              <div className="meta">
                <span className={`pill ${defaulted.data ? "bad" : "ok"}`}>
                  {defaulted.data ? "Permanent non-return record" : "No non-return records"}
                </span>
                <span className="pill">Score {points?.toString() ?? "0"}</span>
              </div>
              {protocol.ready && <p>Settlements with damage compensation: {damages.data?.toString() ?? "—"}</p>}
              <div className="stats">
                <div className="stat">
                  <strong>{ok?.toString() ?? "0"}</strong>
                  <span>On-time returns</span>
                </div>
                <div className="stat">
                  <strong>{late?.toString() ?? "0"}</strong>
                  <span>Late returns</span>
                </div>
                <div className="stat">
                  <strong>{defaults?.toString() ?? "0"}</strong>
                  <span>Not returned</span>
                </div>
              </div>
              <dl className="summary">
                <div>
                  <dt>Deposit factor on eligible value</dt>
                  <dd>{factorBps / 100}%</dd>
                </div>
                <div>
                  <dt>Highest successfully rented value</dt>
                  <dd>{formatIDR(typeof maxValue.data === "bigint" ? maxValue.data : 0n)}</dd>
                </div>
              </dl>
              {defaulted.data === true && (
                <p className="notice warn">
                  A non-return record permanently sets the deposit factor to 100%.
                </p>
              )}
            </>
          )}
        </section>
        <aside className="card">
          <Icon name="shield" size={28} />
          <h2 style={{ marginTop: 16 }}>Earn trust, one return at a time.</h2>
          <p>
            Each settled, qualifying on-time rental from a new manually approved owner lowers your
            deposit factor by 10 percentage points, down to 30%. Owners can require a higher minimum.
          </p>
          <p>
            Five qualifying owners bring the factor to 50%. Rentals must be worth at least Rp500,000
            to count toward the discount.
          </p>
          <p>
            The discount applies up to your highest qualifying successfully rented value. Amounts
            above that still require a full deposit. Approval is a pilot trust decision, not proof
            that each wallet belongs to a different person.
          </p>
          <p className="small muted">
            Your record can’t be transferred and contains no national ID number. Late returns don’t
            earn a discount. Damage compensation does not earn successful-rental credit; a
            non-return permanently restores the full deposit. Return requests do not earn credit.
          </p>
        </aside>
      </div>
    </div>
  );
}
