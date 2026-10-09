# Rentra

**Sewa apa saja, tanpa titip KTP.**

Rentra is an ETHJakarta 2026 hackathon project (RWA track). It is a peer-to-peer rental escrow: an onchain deposit replaces leaving your KTP (Indonesian ID card) as collateral. The renter locks rent plus deposit in a contract. A portable, non-transferable reputation score lowers that deposit. Neither party can pull the funds except through the public rules.

Full product notes, in Indonesian, are in [docs/PLAN.md](docs/PLAN.md).

## Why this is onchain

- The deposit sits in the contract, not in the owner's account and not on a platform the operator can freeze.
- Late fees, default after the grace period, and damage-claim settlement execute from those rules.
- ERC-4907 gives the renter a usage right that expires by itself (`userOf` returns zero after `userExpires`).
- Reputation belongs to the renter's account and can be read by any rental using this contract, without sharing a national ID number.
- Handover and return record a keccak256 photo hash plus both parties' EIP-712 signatures. The hash proves the file existed at that moment. It does not prove the photo is authentic or unedited.

## Architecture

```
app/          Next.js (App Router) + Privy + wagmi/viem, Ethereum Sepolia
contracts/    Foundry + OpenZeppelin
  MockIDR         ERC-20 test rupiah (18 decimals, 1e18 = Rp1) with ERC-2612 permit and a faucet
  RentalItem      ERC-721 "bukti sewa" + ERC-4907 user right. Only the escrow may call setUser
  RentalEscrow    Book, handover, return, late fee, default, bonded damage claim
  Reputation      Non-transferable score. Lowers the deposit. No transfer function
```

Chain: Ethereum Sepolia (chain id 11155111). There is no admin function that can withdraw user funds.

### Deposit and reputation

`listItem` does not take a separate deposit. The base deposit is the item's declared value. `quoteDeposit` then applies `depositFactorBps`:

| History | Deposit factor |
|---|---|
| New account | 100% |
| Each successful rental from a new owner, value ≥ Rp500.000 | −10 percentage points |
| Floor | 30% (seven qualifying owners) |
| Five qualifying owners | 50% (the demo script) |
| Any default | Locked at 100% permanently |

The discount only covers value up to the highest amount that account has successfully rented. A cheap rental cannot unlock a full discount on an expensive item. Rentals under Rp500.000 are recorded but do not reduce the factor. Late returns do not earn a discount. Repeating the same owner does not earn another step.

### Rental flow

1. Owner lists an item (value, daily rate, hourly late fee, grace period).
2. Renter `book`s a window. Rent (rounded up to whole days) and the quoted deposit are pulled with `transferFrom`, or in one transaction via `bookWithPermit`.
3. In person, the owner photographs the item. The renter signs `Handover(rentalId, photoHash, timestamp, nonce)`. The owner submits `handover`, which calls `setUser(tokenId, renter, expires)`.
4. On return, the owner signs `Return(...)` and the renter submits `confirmReturn`. Rent plus any late fee goes to the owner immediately. The remaining deposit is held for 24 hours.
5. If the owner will not sign, the renter can `confirmReturn` with an empty signature. The claim window still opens.
6. Late fee is the hourly rate times hours late, rounded up, capped at the deposit.
7. If the item is not returned, the owner calls `claimDefault` after `end + grace`. Rent, deposit, and any guarantee move to the owner and the renter is marked defaulted.
8. Damage claims use a 10% bond. The renter accepts or counters. Silence settles for the party who did respond. `escalate` marks the claim disputed; with no juror pool, `finalizeClaim` applies the same timeout.

Cancelling is only allowed before handover, and it refunds the renter in full. A no-show who never received the item is a cancel, not a default.

### Demo clock

Deploy turns demo mode on. Time is scaled from each rental's booking timestamp by `DEMO_SCALE = 720`: one logical day passes in two real minutes. ERC-4907 `userExpires` is stored in real unix time, so `userOf` and a countdown both track the scaled deadline. `setDemoMode` is the only admin switch, and it cannot move funds.

## What is implemented

- The four contracts above, with Foundry tests for the happy path, cancel, permit booking, late fee (including the cap), default, permanent reputation damage, bonded claim accept / counter / timeout / bond slash, signature replay and expiry, the value cap, and demo-mode scaling.
- `script/Deploy.s.sol` for Ethereum Sepolia. `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` come from the environment. The script writes `contracts/deployments/sepolia.json` and prints the addresses. Nothing secret is committed.
- Next.js pages: catalog, item detail and booking (permit + book), list an item, my rentals (countdown from `userExpires`, default and finalize), handover QR, return (including unilateral return and the damage-claim forms), and a public reputation page.
- Privy email/Google login with an embedded wallet and wagmi/viem on Ethereum Sepolia. Gas sponsorship is off unless `NEXT_PUBLIC_PRIVY_SPONSOR_GAS=true`, so transactions use the wallet's own Sepolia ETH.
- Photo hashing in the browser (`keccak256`). The file stays on the device.
- GitHub Actions: `forge build`, `forge test`, and `npm run build`.

## What is stubbed or left out

- The app reads `NEXT_PUBLIC_*_ADDRESS` first and falls back to `app/src/deployments/sepolia.json`. Those addresses are filled in below.
- No IPFS upload. Only the hash is stored onchain.
- The handover screen shows a QR and accepts a pasted payload. It does not open the camera to scan.
- `GuarantorVault` and `JurorPool` (Pyth Entropy) are not built. The `guarantee` field stays zero. `escalate` only starts the timeout path.
- No Pyth USD/IDR feed and no smart-lock simulation.
- The app is a working foundation, not the final Bahasa Indonesia polish pass from the plan (loading states are light, and there is no demo video or slide deck).

## Run and test

```bash
# contracts
cd contracts
forge build
forge test

# app (placeholder env is enough to build)
cd app
cp .env.example .env.local
npm install
npm run dev
```

`npm run build` succeeds with the 25-character placeholder `NEXT_PUBLIC_PRIVY_APP_ID=clplaceholderprivyappid01` (Privy rejects any other length). Login itself needs a real Privy app id. Contract addresses come from the committed Sepolia JSON unless the `NEXT_PUBLIC_*_ADDRESS` variables override them.

## Deploy to Ethereum Sepolia

Chain id `11155111`. The script does not broadcast unless you pass `--broadcast`. It keeps demo mode on and does not pre-list items.

```bash
cd contracts
cp .env.example .env
# set DEPLOYER_PRIVATE_KEY, and SEPOLIA_RPC_URL if you are not using the public endpoint

forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --slow -g 800
```

Since Sepolia's Glamsterdam upgrade (Oct 6, 2026), forge underestimates contract-creation gas. `--slow -g 800` is required. `foundry.toml` maps the `sepolia` endpoint to `SEPOLIA_RPC_URL`. The script also reads `DEPLOYER_PRIVATE_KEY` and refuses any chain other than 11155111. It deploys `MockIDR`, `RentalItem`, `Reputation`, and `RentalEscrow` with demo mode on, wires `setEscrow`, prints the addresses, and writes:

- `contracts/deployments/sepolia.json`
- `app/src/deployments/sepolia.json`

Do not commit an RPC URL that contains an API key. Add `--verify` only after `ETHERSCAN_API_KEY` is set in the environment.

## Deployed on Ethereum Sepolia

Deployer: [0xe14a16eA71Da4f8FA1CDc2e3cA7A4F8A1eFcfCcf](https://sepolia.etherscan.io/address/0xe14a16eA71Da4f8FA1CDc2e3cA7A4F8A1eFcfCcf). Demo mode is on. The same addresses are in `contracts/deployments/sepolia.json` and `app/src/deployments/sepolia.json`.

| Contract | Address |
|---|---|
| MockIDR | [0x3740Bf82073E6889298631E8B4dC72b5358b6a39](https://sepolia.etherscan.io/address/0x3740Bf82073E6889298631E8B4dC72b5358b6a39) |
| RentalItem | [0x229918cCE2f140d40EE4A4187b62A5F4bc5Dd67c](https://sepolia.etherscan.io/address/0x229918cCE2f140d40EE4A4187b62A5F4bc5Dd67c) |
| Reputation | [0x0f437Eb9B6fb557bb8cEB0287b901a566d3Bd8a7](https://sepolia.etherscan.io/address/0x0f437Eb9B6fb557bb8cEB0287b901a566d3Bd8a7) |
| RentalEscrow | [0x888d7200C2fC016a8Adde7328092B40BB14C5cab](https://sepolia.etherscan.io/address/0x888d7200C2fC016a8Adde7328092B40BB14C5cab) |

Since Sepolia's Glamsterdam upgrade (Oct 6, 2026), forge underestimates contract-creation gas. Deploy with:

```bash
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --slow -g 800
```

## Vercel

| Setting | Value |
|---|---|
| Root Directory | `app` |
| Framework Preset | Next.js |
| Node.js Version | 22 |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `.next` (leave the default) |

Environment variables. Address values override the committed JSON. Leave sponsorship unset or `false` so users pay gas with their own Sepolia ETH.

```
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_PRIVY_SPONSOR_GAS=false
NEXT_PUBLIC_MOCK_IDR_ADDRESS=
NEXT_PUBLIC_RENTAL_ITEM_ADDRESS=
NEXT_PUBLIC_REPUTATION_ADDRESS=
NEXT_PUBLIC_RENTAL_ESCROW_ADDRESS=
```

In the Privy dashboard, allow email and Google and create an embedded wallet on login. Turn on gas sponsorship for Ethereum Sepolia only if you also set `NEXT_PUBLIC_PRIVY_SPONSOR_GAS=true`.

## Deviations from the plan

The plan's function list is marked "ringkas" (a sketch). A few signatures grew a parameter the sketch left implicit:

- `handover` and `confirmReturn` need the `uint64 timestamp` that is inside the EIP-712 struct, so the explicit form is `(rentalId, photoHash, timestamp, signature)`. The 3-argument form from the plan still exists: the `bytes` argument is `abi.encode(uint64 timestamp, bytes signature)`. An empty return signature is the unilateral return from the risk section.
- `Reputation.record(renter, outcome, valueIDR)` is unchanged. The escrow calls `record(renter, outcome, valueIDR, owner)` so the "different owners" rule can be enforced.
- `bookWithPermit` wraps ERC-2612 so approve and book are one transaction. `book` still pulls via allowance.
- `finalizeClaim` also releases a clean return after 24 hours with no damage claim (`Returned → Settled`).

Parameters that the plan left as "contoh" are constants: Rp500.000 minimum countable value, 10% off per new owner, 30% floor, 10% claim bond, 24 hour claim and response windows, demo scale 720.
