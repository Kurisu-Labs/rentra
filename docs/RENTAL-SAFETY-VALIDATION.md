# Rental safety v2 — local validation

Validated locally on 10 October 2026 on branch `feature/rental-safety-v2`, based on `498755a`. Delivery is split into focused Git commits; remote CI evidence is reported on the pull request separately. No Sepolia broadcast or migration was performed.

## Results

| Check | Result |
| --- | --- |
| Owned Solidity files, `forge fmt --check` | Passed |
| `forge build --sizes` | Passed; RentalEscrow runtime 20,765 bytes, below 24,576-byte limit |
| `forge test` | 44 passed, 0 failed; includes 256 fuzz runs for cross-rental fund isolation |
| `forge coverage --ir-minimum --report summary` | 44 passed; escrow line coverage 98.84%, statement coverage 91.16%, branch coverage 59.60%, function coverage 100% |
| `node ../app/scripts/sync-abis.mjs --check` | All four frontend ABIs match compiled artifacts |
| Node 22 `npm test` | 7 protocol and candidate-validation tests passed |
| Node 22 `npm run build` | Production compilation, TypeScript, and page generation passed |
| Anvil integration smoke | Frontend EIP-712 digest matched Solidity; return/dispute/settlement, balance isolation, valid deployment verification, missing code rejection, and mismatched-link rejection passed |
| Deployment dry run | Original manifest overwrite reproduced in `/tmp`; fixed sender-only dry run writes only a candidate and preserves both historical manifests, including with an empty legacy key |
| Candidate promotion guards | Unbroadcast addresses rejected before writes; fully verified Anvil candidate also rejected for Sepolia promotion, tested in an isolated copy |
| Browser, committed legacy configuration | Read-only notice on catalog-related and rental routes; pickup disabled; no page exceptions |
| Browser, isolated local v2 fixtures | Injected Anvil wallet, owner acknowledgement transaction, real claim deadline, receipt download action, listing risk consent, deposit floor disclosure, and rental lookup passed |
| Responsive checks | No listing/return horizontal overflow at 375, 768, and 1440 pixels |
| Independent review | One stale-counter defect found, reproduced, and fixed; reviewer reran that regression and the zero-late-fee regression and reported no outstanding confirmed P1/P2 defects |
| `git diff --check` | Passed |

Local tools: Foundry **1.5.1**, Solidity **0.8.28**, Node.js **22.23.3**. CI remains pinned to Foundry **v1.8.5**; these results describe local verification, with remote results tracked on the pull request. No new package dependencies or lockfile changes were needed. Vendored Solidity dependencies and both historical deployment JSON files remain unchanged.

## Regression evidence

- The initial 22-test baseline passed.
- Two added tests failed against v1 behavior: unsigned return paid rent, and reputation was already granted during the claim window. Both passed after the state-machine changes.
- Unapproved-owner and default-full-collateral tests failed before adding approval-gated discounts and immutable listing floors, then passed.
- Independent review identified a live legacy counter after a replacement settlement offer. The regression failed before clearing `hasCounter/counterAmount`, then passed.
- A zero-priced late fee incorrectly made a late return count as on-time. The regression failed with a 90% factor instead of 100%; settlement now uses the actual return deadline comparison.
- The original deploy script replaced both deployment manifests during simulation. An isolated reproduction showed both files changing without broadcast. The corrected script emits only a candidate; RPC verification and an explicit promotion are required to publish addresses.
- Default unoptimized coverage hit Solidity's stack-depth limit. `--ir-minimum` succeeded after replacing test-side `block.timestamp` reads with `vm.getBlockTimestamp()` to prevent optimizer caching across `vm.warp`.

## Browser evidence

Screenshots show **local test accounts and local Anvil state**, not a Sepolia deployment. The wallet provider was a browser-test adapter forwarding requests only to localhost; this is not a MetaMask extension compatibility certification. There was no visual baseline, full axe audit, screen-reader evaluation, or field Core Web Vitals measurement.

- [Return controls, desktop](evidence/safety-v2/return-desktop.png)
- [Return controls, mobile](evidence/safety-v2/return-mobile.png)
- [Deposit risk consent, mobile](evidence/safety-v2/list-mobile.png)

## Remaining rollout and trust requirements

The committed addresses still identify v1. The v2 app intentionally disables transactions/signatures until all four new contracts are connected consistently. Existing rental funds and history remain on their original contracts; no automatic migration exists.

Before live use, deploy a new instance, verify source and integration references, review owner approvals, arrange an actually available mutually accepted mediator, and run a funded multi-wallet Sepolia acceptance test. No real funds, insurance, guarantor capital, external evidence storage, notification delivery, keeper, or arbitration service was provisioned.

The user selected self-operated deployment. [DEPLOY-V2.md](DEPLOY-V2.md) contains the encrypted-keystore, simulation, broadcast, verification, manifest-promotion, and acceptance-test steps. The agent did not use a real deployer signer or broadcast to Sepolia.

Physical exchange and photo authenticity remain offchain facts. Approval does not prove unique people. Contested funds can remain locked indefinitely without agreement or a responsive mediator. These are explicit product limitations, not resolved by the passing tests or this code review.
