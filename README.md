# Rentra

**Sewa apa saja, tanpa titip KTP.**

Rentra is an ETHJakarta 2026 hackathon project (RWA track). It is a peer-to-peer rental escrow: an onchain deposit replaces leaving your KTP (Indonesian ID card) as collateral. The renter locks rent plus deposit in a contract. A portable, non-transferable reputation score lowers that deposit. Neither party can pull the funds except through the public rules.

Full product notes, in Indonesian, are in [docs/PLAN.md](docs/PLAN.md).

## Safety v2: live Sepolia instance

Protocol **v2 is deployed on Ethereum Sepolia** and is the default in both committed deployment manifests. All four contracts have exact creation/runtime source matches on Sourcify, and admin, cross-contract, bytecode, and signing-domain checks passed. See [docs/DEPLOYMENT-V2.md](docs/DEPLOYMENT-V2.md) for receipts and scope. A funded multi-wallet rental acceptance test remains pending. The [public frontend preview](https://rentra-e6d65lrk4-rakhargos-projects.vercel.app) now uses this deployment; see [preview checks and limitations](docs/PREVIEW-V2.md).

The app blocks signatures and transactions against unrecognized versions or mismatched contract references. Existing v1 rentals, funds, and reputation remain on their original contracts; no migration is implemented. [docs/RENTAL-SAFETY.md](docs/RENTAL-SAFETY.md) describes the v2 rules and limitations.

## Why this is onchain

- The deposit sits in the contract, not in the owner's account and not on a platform the operator can freeze.
- Late fees, default after the grace period, and damage-claim settlement execute from those rules.
- ERC-4907 gives the renter a usage right that expires by itself (`userOf` returns zero after `userExpires`).
- Reputation belongs to the renter's account and can be read by any rental using this contract, without sharing a national ID number.
- Acknowledged handover and return record a keccak256 photo hash and wallet authorization. A hash commits to bytes; it does not prove that a photo is authentic, that a physical exchange happened, or that the original file remains available. Unsigned returns are pending requests.

## Architecture

```
app/          Next.js (App Router) + RainbowKit + MetaMask + wagmi/viem, Ethereum Sepolia
contracts/    Foundry + OpenZeppelin
  MockIDR         ERC-20 test rupiah (18 decimals, 1e18 = Rp1) with ERC-2612 permit and a faucet
  RentalItem      ERC-721 "bukti sewa" + ERC-4907 user right. Only the escrow may call setUser
  RentalEscrow    Book, handover, return, late fee, default, bonded damage claim
  Reputation      Non-transferable score. Lowers the deposit. No transfer function
```

Chain: Ethereum Sepolia (chain id 11155111). There is no admin function that can withdraw user funds.

### Deposit and reputation

The base deposit is the owner's declared replacement value, without independent appraisal. The six-argument `listItem` adds an immutable minimum deposit factor (30–100%); the five-argument form defaults to **100%**. Owners explicitly accept uncovered exposure when allowing a lower floor. `quoteDeposit` applies the greater of the renter factor and the listing floor to eligible value:

| History | Deposit factor |
|---|---|
| New account | 100% |
| Each settled, clean, on-time rental from a new manually approved owner, value ≥ Rp500.000 | −10 percentage points |
| Floor | 30% (seven qualifying owners) |
| Five qualifying owners | 50% (the demo script) |
| Any default | Locked at 100% permanently |

The discount only covers value up to the highest qualifying successfully rented amount. Unapproved owners cannot grant a discount or raise this cap. Rentals under Rp500.000, late returns, and settlements with damage compensation do not earn discounts. Repeating an owner does not earn another step. Reputation is recorded once at final settlement, not when a return is requested or acknowledged. Manual approval is a pilot trust decision, not proof of unique identity; approved owners can still collude. No insurance or funded guarantor covers a discounted deposit's shortfall.

### Rental flow

1. Owner lists an item (value, daily rate, hourly late fee, grace period).
2. Renter `book`s a window. Rent (rounded up to whole days) and the quoted deposit are pulled with `transferFrom`, or in one transaction via `bookWithPermit`.
3. Before pickup, the owner may `proposeMediator`; the renter must explicitly `acceptMediator`. Both may cancel and obtain a full refund before handover. A pending proposal blocks handover; an accepted mediator is immutable. In person, the renter signs `Handover(rentalId, photoHash, timestamp, mediator, nonce)` using EIP-712 domain version `2`. The owner submits `handover`, activating the usage right. The signature binds the agreed mediator.
4. On return, the owner signs `Return(...)` and the renter submits `confirmReturn`. Rent plus late fees goes to the owner. The deposit remains held for a **24-hour real-time** claim window, including in demo mode.
5. An empty signature creates `ReturnRequested`, paying nothing and earning no reputation. The owner can `acknowledgeReturn` or `disputeReturn` with an evidence hash. Acknowledgement uses the request's onchain time for late fees and starts the claim window at acknowledgement. An agreed mediator may resolve the request, or both parties may accept an exact settlement offer. A disputed non-return ruling must wait until end plus grace.
6. Late fee is the hourly rate times hours late, rounded up, capped at the deposit.
7. If the item is not returned, the owner calls `claimDefault` after `end + grace`. Rent, deposit, and any guarantee move to the owner and the renter is marked defaulted.
8. Damage claims use a 10% bond. The renter can accept or counter within 24 real hours. The owner can accept the counter. Either party may propose a compensation amount and the other must explicitly accept that exact offer. `escalate` only marks the dispute. The agreed mediator can split this rental's remaining deposit and bond between its two parties; damage compensation cannot exceed the claim. Silence **never** awards funds. Uncontested acknowledged returns can be finalized after the window; disputed funds may remain locked indefinitely without agreement or a responsive mediator.

Cancelling is only allowed before handover, and it refunds the renter in full. A no-show who never received the item is a cancel, not a default.

### Demo clock

Deploy defaults to real time. Set `RENTRA_DEMO_MODE=true` explicitly to accelerate rental deadlines by `DEMO_SCALE = 720`: one logical day passes in two real minutes. ERC-4907 expiry uses real unix time. Claim/response windows always take **24 real hours**, so a complete fast settlement demo should use local Anvil time travel. `setDemoMode` cannot change the clock while any rentals are open and cannot move funds. Reputation's separate admin can approve owners for future discount credit but cannot withdraw escrow funds.

## What is implemented

- The four contracts above, with Foundry regressions for return requests, mutual settlement, mediator consent and bounded rulings, deposit floors, approval-gated reputation, claim bonds, exact deadline boundaries, signature replay/expiry, and demo clocks. A fuzz test checks that settling one rental cannot spend another rental's funds.
- `script/Deploy.s.sol` for Ethereum Sepolia, with an encrypted CLI keystore or optional legacy environment signer. It writes only an ignored, unverified candidate. The RPC verifier checks the live instance before an explicit promotion updates either deployment manifest. Follow [docs/DEPLOY-V2.md](docs/DEPLOY-V2.md).
- English Next.js interface with responsive layouts, active navigation, accessible forms, and transaction confirmation feedback. Pages: catalog, item detail and booking (permit + book), list an item, my rentals (countdown from `userExpires`, default and finalize), handover QR, return (including unilateral return and the damage-claim forms), and a public reputation page.
- RainbowKit connects directly to MetaMask through its browser extension or in-app mobile browser. There is no account login or embedded wallet. Transactions and EIP-712 signatures use wagmi/viem on Ethereum Sepolia; wallets pay network fees with Sepolia ETH.
- Photo hashing in the browser (`keccak256`), original photo download, and JSON export of rental/evidence records. Files stay on the device; exports are not signed attestations.
- GitHub Actions: `forge build`, `forge test`, generated ABI consistency, frontend protocol-gate tests, and `npm run build`.

## What is stubbed or left out

- No gas sponsorship or WalletConnect QR pairing. Use the MetaMask extension or open Rentra in the MetaMask mobile browser.
- No IPFS upload. Only the hash is stored onchain.
- The handover screen shows a QR and accepts a pasted payload. It does not open the camera to scan.
- `GuarantorVault` and `JurorPool` (Pyth Entropy) are not built. The `guarantee` field stays zero. The v2 mediator is a wallet chosen by the parties, not a staffed service or decentralized jury. `escalate` does not resolve anything automatically.
- No price appraisal, proof of unique humans, hosted evidence store, email/push reminders, or keeper. Users must retain originals, monitor deadlines, and submit finalization transactions.
- No Pyth USD/IDR feed and no smart-lock simulation.
- The app follows the rental and reputation flow from the plan, with English copy. Camera QR scanning, a demo video, and a slide deck are not included.

## Run and test

```bash
# contracts
cd contracts
forge build
forge test
node ../app/scripts/sync-abis.mjs --check

# app (RPC and contract defaults are included)
cd app
cp .env.example .env.local
npm install
npm run dev
```

With Node 22, run `npm test` and `npm run build` from `app/`. After Solidity changes, run `forge build` then `npm run sync:abi`. For pilot discount credit, the Reputation admin must review an owner offchain and call `setOwnerApproval(owner, true)`; all owners start unapproved. Do not approve arbitrary wallets just to populate the demo score.

For a credential-free local integration test, start `anvil --chain-id 11155111` in one terminal, then run `npm run test:local` from `app/` after `forge build`. The script uses only Anvil's unlocked accounts at `127.0.0.1:8545`, installs a local Multicall3 fixture, verifies the frontend signing types against Solidity, exercises a return dispute and settlement, and saves public browser fixture addresses to `/tmp/rentra-local-deployment.json`. It never reads a private key or accepts a remote RPC override. Coverage requires `forge coverage --ir-minimum --report summary` because the default unoptimized coverage build reaches Solidity's stack-depth limit.

`npm run build` requires no authentication credentials or WalletConnect project ID. Empty address overrides use the committed Ethereum Sepolia deployment. The catalog reads live listings and shows an empty state until owners list items.

### Connect MetaMask

1. Install the MetaMask browser extension, or open Rentra in the MetaMask mobile browser.
2. Click **Connect MetaMask** and approve the wallet connection.
3. Select **Ethereum Sepolia** (chain ID `11155111`); RainbowKit offers a network switch when needed.
4. Fund the wallet with Sepolia ETH for network fees. **Add test funds** on an item page requests test mIDR from the faucet.
5. Click the connected wallet address to open RainbowKit’s account modal and disconnect.

Connecting a wallet does not request a login signature. Booking and handover/return request the signatures required by the rental contracts. The MetaMask icon is distributed with its RainbowKit MIT license in `app/public/licenses/rainbowkit.txt`.

## Current v2 Ethereum Sepolia Deployment

Chain ID: `11155111`. Mode: real time. No listings or owner approvals are pre-seeded.

| Contract | Address | Sourcify source verification |
| --- | --- | --- |
| MockIDR | [`0x5f1540ad73433d80e510efa8dac04d2acbfa8f24`](https://sepolia.etherscan.io/address/0x5f1540ad73433d80e510efa8dac04d2acbfa8f24) | [Exact match](https://repo.sourcify.dev/11155111/0x5f1540aD73433d80e510eFA8DAC04d2acbfA8f24) |
| RentalItem | [`0x29a2ded83f440fc1d16d0f1617e8c2fb7d2c8525`](https://sepolia.etherscan.io/address/0x29a2ded83f440fc1d16d0f1617e8c2fb7d2c8525) | [Exact match](https://repo.sourcify.dev/11155111/0x29A2Ded83F440fC1d16d0f1617E8c2FB7D2C8525) |
| Reputation | [`0x6356f9b9e5dd5a13e2b1fdd2680f19d5ef5f1c1a`](https://sepolia.etherscan.io/address/0x6356f9b9e5dd5a13e2b1fdd2680f19d5ef5f1c1a) | [Exact match](https://repo.sourcify.dev/11155111/0x6356F9B9e5dD5A13E2b1fDd2680f19d5ef5f1c1a) |
| RentalEscrow | [`0x9be48b39d3fa6cbf929141a247d9302495d17a73`](https://sepolia.etherscan.io/address/0x9be48b39d3fa6cbf929141a247d9302495d17a73) | [Exact match](https://repo.sourcify.dev/11155111/0x9BE48B39d3fa6cbF929141A247d9302495D17A73) |

Both `contracts/deployments/sepolia.json` and `app/src/deployments/sepolia.json` use this verified instance. The private deployment signer and credential-bearing RPC are not part of the frontend configuration. [Deployment evidence](docs/DEPLOYMENT-V2.md) includes all six receipts.

## Historical v1 Ethereum Sepolia Deployment

Chain ID: `11155111`. Deployer: [`0xe14a16eA71Da4f8FA1CDc2e3cA7A4F8A1eFcfCcf`](https://sepolia.etherscan.io/address/0xe14a16eA71Da4f8FA1CDc2e3cA7A4F8A1eFcfCcf).

| Contract | Address |
|---|---|
| MockIDR | [`0x3740Bf82073E6889298631E8B4dC72b5358b6a39`](https://sepolia.etherscan.io/address/0x3740Bf82073E6889298631E8B4dC72b5358b6a39) |
| RentalItem | [`0x229918cCE2f140d40EE4A4187b62A5F4bc5Dd67c`](https://sepolia.etherscan.io/address/0x229918cCE2f140d40EE4A4187b62A5F4bc5Dd67c) |
| Reputation | [`0x0f437Eb9B6fb557bb8cEB0287b901a566d3Bd8a7`](https://sepolia.etherscan.io/address/0x0f437Eb9B6fb557bb8cEB0287b901a566d3Bd8a7) |
| RentalEscrow | [`0x888d7200C2fC016a8Adde7328092B40BB14C5cab`](https://sepolia.etherscan.io/address/0x888d7200C2fC016a8Adde7328092B40BB14C5cab) |

These are historical v1 addresses, retained here for reference. They remain unchanged onchain. The committed manifests now point to the separate v2 instance above; no v1 funds or reputation were moved.

Do not override the v2 app with these v1 addresses. `NEXT_PUBLIC_*_ADDRESS` overrides must identify one consistent v2 deployment, including both contracts' escrow references.

## Deploy a New Instance to Ethereum Sepolia

Chain id `11155111`. The script does not broadcast unless you pass `--broadcast`. It defaults to real-time mode, leaves owners unapproved for discount credit, and does not pre-list items.

Follow the copy-paste commands in [docs/DEPLOY-V2.md](docs/DEPLOY-V2.md): configure a local encrypted keystore, simulate with the public sender address, broadcast with `--account` and `--sender`, and complete source verification. `foundry.toml` uses the Etherscan V2 Sepolia endpoint. Never put a private key in a CLI argument or commit an API-key-bearing RPC URL.

Both dry runs and broadcasts write only `contracts/deployments/sepolia.candidate.json`. From `app/`, `npm run verify:deployment` checks live bytecode, chain, protocol version, admins, contract links, clock mode, and token metadata at one block. It leaves the manifests unchanged. After inspecting receipts and source verification, `npm run verify:deployment -- --promote` updates both manifests with the same verified snapshot. Simulated/mismatched candidates and local Anvil promotion are rejected. The current files contain the successfully promoted v2 instance; dry runs for any future instance cannot replace them.

## Vercel

| Setting | Value |
|---|---|
| Root Directory | `app` |
| Framework Preset | Next.js |
| Node.js Version | 22 |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `.next` (leave the default) |

Environment variables. Address values override the committed JSON. Wallets pay gas with their own Sepolia ETH; no authentication provider credentials are needed.

```
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_MOCK_IDR_ADDRESS=
NEXT_PUBLIC_RENTAL_ITEM_ADDRESS=
NEXT_PUBLIC_REPUTATION_ADDRESS=
NEXT_PUBLIC_RENTAL_ESCROW_ADDRESS=
```

Wallet configuration is in `app/src/lib/wallet.ts`. The injected MetaMask connector does not use WalletConnect, so no project ID is required. Connect a new consistent v2 deployment before publishing this frontend as a transactional app; otherwise it remains read-only.

## Deviations from the plan

The plan's function list is marked "ringkas" (a sketch). A few signatures grew a parameter the sketch left implicit:

- `handover` and `confirmReturn` keep explicit and packed timestamp forms. In v2, an empty return signature starts a request, not an acknowledged return. Handover typed data also binds the accepted mediator, and the escrow domain version is `2`.
- `Reputation.record(renter, outcome, valueIDR)` is unchanged. The escrow calls `record(renter, outcome, valueIDR, owner)` so the "different owners" rule can be enforced.
- `bookWithPermit` wraps ERC-2612 so approve and book are one transaction. `book` still pulls via allowance.
- `finalizeClaim` also releases a clean return after 24 hours with no damage claim (`Returned → Settled`).

Parameters include Rp500.000 minimum countable value, 10 percentage points off per new approved owner, a 30% reputation floor (subject to the listing floor), 10% claim bond, 24 real-hour claim/response windows, and demo rental scale 720.

## Contributing

See [AGENTS.md](AGENTS.md) for repository guidelines. Use English for application copy and Conventional Commits with a scope, such as `feat(ui): improve rental booking experience` or `fix(contracts): validate rental terms`.
