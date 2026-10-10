"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { addresses, chain, configured, rentalItemAbi } from "@/lib/contracts";
import { formatIDR, shortAddr, tupleAt } from "@/lib/format";
import { samples } from "@/lib/samples";
import { Icon } from "@/components/icon";

export default function CatalogPage() {
  const nextId = useReadContract({
    chainId: chain.id,
    address: addresses.item,
    abi: rentalItemAbi,
    functionName: "nextId",
    query: { enabled: configured },
  });

  const ids = useMemo(() => {
    const next = typeof nextId.data === "bigint" ? Number(nextId.data) : 1;
    const list: number[] = [];
    for (let id = 1; id < next && list.length < 24; id += 1) list.push(id);
    return list;
  }, [nextId.data]);

  const reads = useReadContracts({
    contracts: ids.flatMap((id) => [
      { chainId: chain.id, address: addresses.item, abi: rentalItemAbi, functionName: "tokenURI", args: [BigInt(id)] },
      { chainId: chain.id, address: addresses.item, abi: rentalItemAbi, functionName: "terms", args: [BigInt(id)] },
      { chainId: chain.id, address: addresses.item, abi: rentalItemAbi, functionName: "ownerOf", args: [BigInt(id)] },
    ]),
    query: { enabled: configured && ids.length > 0 },
  });

  return (
    <div>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="status-dot" /> Everyday things. A better way to rent.
          </span>
          <h1>
            Borrow the moment.
            <br />
            <em>Keep your identity.</em>
          </h1>
          <p className="lede">
            The camera for a weekend. The tent for a getaway. Rent what you need with a deposit held
            in escrow, without handing over your ID.
          </p>
          <div className="row hero-actions">
            <a className="button" href="#catalog">
              Find your next rental <Icon name="arrow" size={18} />
            </a>
            <a className="text-link" href="#how-it-works">
              How it works <span aria-hidden="true">↘</span>
            </a>
          </div>
          <p className="hero-note">
            <Icon name="shield" size={16} /> Clear terms. Your own rental reputation.
          </p>
        </div>
        <aside className="reputation-preview" aria-label="How reputation reduces your deposit">
          <div className="row panel-top">
            <span className="eyebrow">Good returns go further</span>
            <Icon name="shield" size={24} />
          </div>
          <p className="preview-heading">
            Build trust.
            <br />
            Leave a smaller deposit.
          </p>
          <div className="deposit-comparison">
            <div>
              <span className="small muted">New renter</span>
              <strong>
                100<span>%</span>
              </strong>
              <span className="small muted">of item value</span>
            </div>
            <span className="comparison-arrow" aria-hidden="true">
              →
            </span>
            <div>
              <span className="small muted">5 qualifying owners</span>
              <strong className="accent">
                50<span>%</span>
              </strong>
              <span className="small muted">on eligible value</span>
            </div>
          </div>
          <p className="small muted">
            Settled on-time rentals from different approved owners can earn a lower deposit, subject
            to each owner’s minimum. Discounts apply up to your highest qualifying rented value.
          </p>
          <Link className="text-link" href="/reputation">
            Get to know your reputation <Icon name="arrow" size={16} />
          </Link>
        </aside>
      </section>

      <section className="steps" id="how-it-works" aria-label="How renting works">
        {[
          ["01", "Find your thing", "Choose an item and review the rental terms."],
          ["02", "Book with confidence", "Rental payment and deposit are held in escrow."],
          [
            "03",
            "Return. Build trust.",
            "Confirm the return. Settle any fees or claims, then release the remaining deposit.",
          ],
        ].map(([step, title, text]) => (
          <div className="step" key={step}>
            <span className="step-number">{step}</span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </section>

      <section id="catalog" className="catalog-section" aria-labelledby="catalog-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Own less. Do more.</span>
            <h2 id="catalog-heading">What’s your next plan?</h2>
          </div>
          <span className="pill">{configured ? "Sepolia rentals" : "Sample collection"}</span>
        </div>
        {!configured && (
          <p className="notice">
            You’re exploring a preview. These sample items show how Rentra works; bookings aren’t
            available here yet.
          </p>
        )}
        {configured && (nextId.isLoading || reads.isLoading) && (
          <p className="notice" role="status">
            Finding items for your next adventure…
          </p>
        )}
        {configured && (nextId.isError || reads.isError) && (
          <div className="notice warn" role="alert">
            We couldn’t load the collection.{" "}
            <button
              className="text-link"
              onClick={() => {
                void nextId.refetch();
                void reads.refetch();
              }}
            >
              Try again
            </button>
          </div>
        )}
        {configured && !nextId.isLoading && !nextId.isError && ids.length === 0 && (
          <div className="empty-state">
            <Icon name="box" size={36} />
            <h3>Make room for the first rental.</h3>
            <p>Have something useful sitting idle? Give it a new adventure.</p>
            <Link className="button" href="/list">
              List an item <Icon name="arrow" size={16} />
            </Link>
          </div>
        )}
        <div className="grid">
          {configured
            ? ids.map((id, index) => {
                const base = index * 3;
                const uri = reads.data?.[base]?.result;
                const terms = reads.data?.[base + 1]?.result;
                const owner = reads.data?.[base + 2]?.result;
                const name = typeof uri === "string" && uri.length > 0 ? uri : `Item #${id}`;
                const value = tupleAt(terms, 0);
                const rate = tupleAt(terms, 1);
                return (
                  <article className="card item-card" key={id}>
                    <Link className="block" href={`/items/${id}`}>
                      <div className="item-art live">
                        <Icon name="box" size={70} />
                        <span className="art-label">Item #{id}</span>
                      </div>
                      <div className="item-body">
                        <span className="eyebrow">Community rental</span>
                        <h3>{name}</h3>
                        <p>Listed by {typeof owner === "string" ? shortAddr(owner) : "—"}</p>
                        <div className="item-price">
                          <span>
                            <strong>
                              {formatIDR(typeof rate === "bigint" ? rate : undefined)}
                            </strong>{" "}
                            / day
                          </span>
                          <Icon name="arrow" />
                        </div>
                        <p className="small muted">
                          Item value {formatIDR(typeof value === "bigint" ? value : undefined)}
                        </p>
                      </div>
                    </Link>
                  </article>
                );
              })
            : samples.map((item) => (
                <article className="card item-card" key={item.id}>
                  <Link className="block" href={`/items/${item.id}`}>
                    <div className={`item-art ${item.icon}`}>
                      <Icon name={item.icon} size={82} />
                      <span className="art-label">Preview item</span>
                    </div>
                    <div className="item-body">
                      <span className="eyebrow">{item.category}</span>
                      <h3>{item.name}</h3>
                      <p>{item.blurb}</p>
                      <div className="item-price">
                        <span>
                          <strong>{item.rate}</strong> / day
                        </span>
                        <Icon name="arrow" />
                      </div>
                      <p className="small muted">Item value {item.value}</p>
                    </div>
                  </Link>
                </article>
              ))}
        </div>
      </section>
      <section className="owner-banner">
        <div>
          <span className="eyebrow">For the things you already own</span>
          <h2>Let someone else make a memory.</h2>
          <p>Set your price and rental terms. Put your idle gear to work.</p>
        </div>
        <Link className="button secondary" href="/list">
          List your first item <Icon name="arrow" size={18} />
        </Link>
      </section>
    </div>
  );
}
