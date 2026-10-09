"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { encodeFunctionData } from "viem";
import { useRentraTx } from "@/components/use-tx";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { Icon } from "@/components/icon";
import { addresses, configured, rentalItemAbi } from "@/lib/contracts";
import { rpToWei } from "@/lib/format";

export default function ListPage() {
  const tx = useRentraTx();
  const { isConnected } = useAccount();
  const [name, setName] = useState("");
  const [value, setValue] = useState("3000000");
  const [rate, setRate] = useState("150000");
  const [late, setLate] = useState("10000");
  const [grace, setGrace] = useState("24");

  async function submit() {
    if (!configured || !isConnected || !addresses.item || !name.trim()) return;
    const data = encodeFunctionData({
      abi: rentalItemAbi,
      functionName: "listItem",
      args: [name.trim(), rpToWei(value), rpToWei(rate), rpToWei(late), Number(grace)],
    });
    await tx.send(addresses.item, data);
  }

  return (
    <div>
      <div className="page-heading">
        <span className="eyebrow">A little less idle. A little more useful.</span>
        <h1>Give your gear a next chapter.</h1>
        <p>List an item, set fair terms, and let someone else put it to good use.</p>
      </div>
      <div className="split">
        <form
          className="card form"
          onSubmit={(event) => {
            event.preventDefault();
            void tx.run(submit);
          }}
        >
          <h2>The essentials</h2>
          {!configured && (
            <p className="notice">
              You can explore this form, but publishing isn’t available in this preview.
            </p>
          )}
          <label htmlFor="item-name">Item name</label>
          <input
            id="item-name"
            required
            maxLength={200}
            placeholder="e.g. Mirrorless camera with kit lens"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label htmlFor="item-value">Item value (Rp)</label>
          <input
            id="item-value"
            type="number"
            min="1"
            step="1"
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby="value-help"
          />
          <span id="value-help" className="field-help">
            Set the item’s fair replacement value. This is the base deposit for a new renter.
          </span>
          <div className="field-grid">
            <div>
              <label htmlFor="daily-rate">Daily rental price (Rp)</label>
              <input
                id="daily-rate"
                type="number"
                min="1"
                step="1"
                required
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="late-fee">Late fee per hour (Rp)</label>
              <input
                id="late-fee"
                type="number"
                min="0"
                step="1"
                required
                value={late}
                onChange={(event) => setLate(event.target.value)}
              />
            </div>
          </div>
          <span className="field-help">
            Rental time rounds up to full days. Late fees round up to full hours and are capped at
            the deposit.
          </span>
          <label htmlFor="grace-period">Grace period (hours)</label>
          <input
            id="grace-period"
            type="number"
            min="0"
            max="4294967295"
            step="1"
            required
            value={grace}
            onChange={(event) => setGrace(event.target.value)}
            aria-describedby="grace-help"
          />
          <span id="grace-help" className="field-help">
            After the rental ends plus this period, you can claim the deposit if the item has not
            been returned. Late fees still apply during this time.
          </span>
          <div className="row">
            {isConnected ? (
              <button type="submit" disabled={!configured || tx.pending || !name.trim()}>
                {tx.pending ? "Publishing your item…" : "Publish listing"}
                <Icon name="arrow" size={16} />
              </button>
            ) : (
              <WalletConnectButton label="Connect MetaMask to publish" />
            )}
          </div>
          <TransactionFeedback {...tx} />
        </form>
        <aside className="card">
          <Icon name="shield" size={28} />
          <h2 style={{ marginTop: 16 }}>Clear terms from the start.</h2>
          <p>
            The renter sees your price, item value, and late fees before booking. Their reputation
            may reduce the deposit.
          </p>
          <p>
            At pickup and return, record the item’s condition together. Funds are released according
            to the rental and claim rules.
          </p>
          <p className="notice">
            This is a testnet app. Prices are shown in rupiah, and payments use test mIDR with no
            real monetary value.
          </p>
        </aside>
      </div>
    </div>
  );
}
