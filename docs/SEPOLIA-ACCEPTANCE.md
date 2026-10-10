# Rentra v2 funded Sepolia acceptance

These results were recorded on the **superseded v2 instance** (escrow [`0x9be48b39d3fa6cbf929141a247d9302495d17a73`](https://sepolia.etherscan.io/address/0x9be48b39d3fa6cbf929141a247d9302495d17a73), admin [`0xadf00a2476c77163B607af6E55A6a90185ae33f6`](https://sepolia.etherscan.io/address/0xadf00a2476c77163B607af6E55A6a90185ae33f6)). That instance was replaced because its admin key was unavailable. The checks used the same bytecode and source as the current team-admin instance in [DEPLOYMENT-V2.md](DEPLOYMENT-V2.md). Listings and rentals on this superseded instance are not visible in the app, which reads the current manifests.

On 10 October 2026, **31 transactions were confirmed and 33 immediate checks passed** against that superseded deployment. Public RPC reads independently checked the final state at block `11882766`. One clean return remains in its required 24-hour real-time claim window; full acceptance is still pending.

This was funded contract integration using three distinct test addresses controlled by one operator. Handover, return, and permit signatures used the frontend's typed-data definitions and were signed locally. The hosted browser was checked separately without a wallet extension. This is not a completed MetaMask extension transaction journey, proof of three independent people, or a physical rental. Evidence hashes commit to a synthetic test string, not genuine photos.

## Actors and fixture

| Role | Address |
| --- | --- |
| Owner | `0xA7Dae44237A3afF3E9C3dB0DE73B2e9446c56e32` |
| Renter | `0x6b1E840ECB4A27eE98375e0520B047cC14B16D2A` |
| Mediator | `0x2412Eef68EA4Ed7912337ACF31492E0396640F02` |

Item #1 is named **E2E TEST FIXTURE — synthetic camera; not available for real rental**. Its declared value is Rp500,000, daily rent Rp10,000, late fee Rp1,000/hour, minimum deposit 100%, and grace period 24 hours. No owner approval or artificial reputation credit was granted.

## Confirmed scenarios

| Rental | Flow | Outcome | Final transaction |
| --- | --- | --- | --- |
| #1 | Permit + booking, then owner cancellation | Cancelled; rent and deposit refunded in full | [Receipt](https://sepolia.etherscan.io/tx/0x0b0b57eb8a0abf55064da51a8efab672fa5806d283e7bd21cb83a7841270d291) |
| #2 | Mediator proposed and accepted before handover; unsigned return; owner dispute; mediator resolution | Settled with Rp20,000 compensation. Unsigned return paid nothing; owner could not rule as mediator | [Receipt](https://sepolia.etherscan.io/tx/0xe53e71253d73296025a35993125d6fca3be9cf4a5d2be63be8036e2fee561950) |
| #3 | Signed handover/return; Rp20,000 damage claim with Rp2,000 bond; renter counter Rp10,000; owner acceptance | Settled at Rp10,000 compensation; bond returned | [Receipt](https://sepolia.etherscan.io/tx/0x842df267c5b218362c02fad2dfc583a4f3de89f52f8140950d0faf63c8273824) |
| #4 | Unsigned return; exact bilateral offer and acceptance | Settled at Rp20,000 compensation. Acceptance of a different amount was rejected | [Receipt](https://sepolia.etherscan.io/tx/0x94d60f70a617413c316ad767c30b52987e0ab59a43497d84a5df7001a56e1866) |
| #5 | Signed handover and clean signed return | Returned; Rp500,000 deposit remains held. Early finalization was rejected | [Receipt](https://sepolia.etherscan.io/tx/0x6643e642886bf9130a8c6e5ae08bb035f7564194221f8b7107b8ff3a05fa18dc) |

Negative authorization/status/amount cases used read-only transaction simulation. For each closed scenario, owner and renter balances matched the expected rent/compensation and the escrow returned to its pre-booking balance. These scenarios were serial; concurrent cross-rental isolation remains covered by the existing Foundry fuzz test.

## Independently checked final state

| Account | Test mIDR balance |
| --- | ---: |
| Owner | 10,090,000 |
| Renter | 9,410,000 |
| Escrow | 500,000 |

The only deposit retained by these tests belongs to rental #5. Its ERC-4907 usage right is cleared, while the item stays locked until settlement. Three settlements with compensation are recorded; the renter's deposit factor remains 100% and the owner remains unapproved. Contract mode remains real time.

Each test wallet received 0.0001 Sepolia ETH, for **0.0003 Sepolia ETH** total funding. Actual gas across the 31 successful transactions was **0.000015705037088389 Sepolia ETH**, below the 0.0005 Sepolia ETH hard budget. Funding and gas are separate amounts; unused test ETH remains in the controlled test addresses. No real IDR was used.

## Remaining clean-return check

Rental #5 can be finalized after **11 October 2026, 13:33:48 WIB** (`2026-10-11T06:33:48Z`), provided it is still an uncontested Returned rental. The onchain deadline is exactly 86,400 seconds after the confirmed return block timestamp. An ordinary transaction is required; there is no automatic keeper.

Before sending, re-read the rental status and claim deadline. Any account may call `finalizeClaim(5)` after the window; the refund is fixed to the recorded renter. For an operator with an existing encrypted Foundry keystore:

```sh
RPC=https://ethereum-sepolia-rpc.publicnode.com
# Superseded v2 escrow. Rental #5 exists only on this instance, not on the current app manifests.
ESCROW=0x9be48b39d3fa6cbf929141a247d9302495d17a73
cast chain-id --rpc-url "$RPC"
# Expected chain ID: 11155111.
cast call "$ESCROW" 'claimDeadline(uint256)(uint64)' 5 --rpc-url "$RPC"
# Only after the deadline, and after confirming the rental remains uncontested:
cast send "$ESCROW" 'finalizeClaim(uint256)' 5 --rpc-url "$RPC" --account YOUR_LOCAL_KEYSTORE
```

After finalization, verify status Settled, zero remaining deposit, item unlocked, and the renter's refund. Check reputation recording occurs once and that this unapproved owner has not granted a discount. Preserve the new receipt as a separate follow-up; do not rewrite this pre-finalization snapshot as though it already passed.

## Hosted browser evidence

The [initial public preview](https://rentra-e6d65lrk4-rakhargos-projects.vercel.app) displayed the fixture's live prices and the renter's live reputation. Opening rental #5 through My rentals loaded the Returned status, Rp500,000 remaining deposit, and the matching real-time deadline. Downloading its evidence receipt succeeded; chain ID, escrow, rental ID, and deadline matched the independently checked state.

- [Public transaction/check evidence](evidence/sepolia-v2/acceptance.json)
- [Downloaded browser receipt](evidence/sepolia-v2/rental-5-browser-receipt.json)
- [Returned rental screenshot](evidence/sepolia-v2/clean-return-desktop.jpg)
- [Hosted build and responsive checks](PREVIEW-V2.md)

PR #5 remains draft. Complete the real claim-window finalization, an actual MetaMask connection/sign/send journey, and the dependency advisory follow-up documented in the preview report before production acceptance.

The current [patched frontend preview](https://rentra-ke155ds3k-rakhargos-projects.vercel.app) has since repeated the v2 guard, responsive/catalog, wallet-modal, and rental #5 reads against this superseded instance. Its contract addresses and signing source are unchanged from that build. The committed manifests have since moved to the team-admin instance, so this preview's listings and rental #5 are not visible in an app built from those manifests. High/critical dependency findings are resolved; 22 moderate findings remain documented in [DEPENDENCY-VALIDATION.md](DEPENDENCY-VALIDATION.md).
