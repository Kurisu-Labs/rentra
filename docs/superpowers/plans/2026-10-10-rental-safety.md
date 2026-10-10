# Rental Safety Implementation Plan

> Execute natively in this session using superpowers:executing-plans and test-driven-development. The user explicitly authorized implementation; continue through validation without additional design approval prompts.

**Goal:** Prevent unsigned-return cash-out and premature reputation, provide consent-based dispute resolution, and disclose deposit exposure.

**Architecture:** Preserve existing rental tuple positions and append pending-return statuses. Add per-rental mediation/settlement storage and immutable per-listing deposit floors. Gate frontend actions against protocol v2 and matching integration addresses.

**Tech Stack:** Solidity 0.8.28, Foundry v1.8.5-compatible, Next.js 15, React, wagmi/viem, Node.js 22.

**Spec:** `docs/RENTAL-SAFETY.md`

## Global Constraints

- English application copy, rupiah prices, Ethereum Sepolia 11155111.
- Do not modify vendored dependencies or committed deployment addresses.
- No secrets, broadcasts, external messages, paid services, or fabricated evidence.
- Keep unresolved mediation and physical-world verification limitations visible.

## Review Focus

- Cross-rental accounting: settlement cannot spend another renter's deposit.
- Offer replacement: stale acceptance cannot accept a different amount or proposer.
- Expired/defaulted rentals: return requests must not revive terminal states.
- Clock boundaries: exact claim close time must not allow both payout and a new claim.
- Legacy deployment: updated labels and signatures must not imply v2 behavior on v1.

### Task 1: Escrow regression and resolution

Files: `contracts/test/Rentra.t.sol`, `contracts/src/RentalEscrow.sol`.

- [x] Add failing assertions that an unsigned return leaves rent and deposit locked and gives no reputation, and that signed return gives no credit before finalization. Run `forge test --match-test 'test_unsignedReturn|test_reputationWaits'`; expect assertion failures on v1.
- [x] Implement appended ReturnRequested/ReturnDisputed statuses, owner acknowledgement/dispute, per-rental mediator proposal/acceptance, bounded rulings, exact bilateral offers, no silence payouts, real claim windows, and clock freeze.
- [x] Add authorization, boundaries, repeat-settlement and accounting regressions, adapt old tests to intentionally changed rules, and run `forge test` to green.

### Task 2: Deposit and reputation policy

Files: `contracts/src/RentalItem.sol`, `contracts/src/Reputation.sol`, contract tests.

- [x] Test that unapproved owners cannot grant a discount and default listings retain full collateral. Run targeted tests and observe failure before implementation.
- [x] Add immutable listing floor overload and owner approval gate; damage settlements record no successful discount credit. Preserve the eligible-value cap.
- [x] Verify floor validation, unique-owner behavior, and full suite.

### Task 3: Integration and user flows

Files: frontend ABIs, contract/config/sign helpers, shared transaction hook, exchange/claim/mediation components, listing/booking/rentals/reputation pages.

- [x] Regenerate ABIs from successful `forge build` artifacts.
- [x] Add v2/integration write gate, version 2 EIP-712 domain, accurate listing floor and exposure consent, return/mediation/settlement controls, real deadline displays, and evidence receipt download.
- [x] Build with Node 22; inspect affected read-only browser screens. No new frontend testing framework is required.

### Task 4: Delivery and deployment guidance

Files: README, safety spec, deployment script, this plan.

- [x] Make the deployment script emit protocol version and default to real-time clock; allow explicit demo mode without accelerating evidence windows.
- [x] Document local-v2 versus deployed-v1 status, trust/lock risks, approval setup, and validation evidence.
- [x] Run formatting, build, tests, coverage, frontend build, ABI comparison, and review the final diff. Leave changes reviewable on `feature/rental-safety-v2`.

## Execution ledger

- Pre-flight: Tasks 1/2 feed the generated ABI in Task 3; tuple indices are preserved. Task 4 must describe v2 while retaining historical deployment data.
- Ruling: user explicitly requested implementation of whatever is feasible; execute directly in the clean workspace on a new branch, with no additional approval gate or external deployment.
- Baseline: initial sandbox test run could not download solc due restricted DNS; retry authorized compiler setup with network access.

- Task 1: complete — 44 contract tests including return, mediator, stale-counter, zero-fee lateness, boundary, and accounting regressions pass.
- Task 2: complete — owner approval and listing-floor policies pass; new accounts and unapproved owners retain full collateral.
- Task 3: complete — generated ABIs match; Node 22 production build and three protocol tests pass; local v2 browser controls and legacy read-only behavior checked.
- Task 4: complete — deployment guidance, validation report, screenshots, and safety limitations documented. No broadcast or migration.
- Ruling: default coverage exceeds stack depth; use --ir-minimum and test-side vm.getBlockTimestamp() so vm.warp remains visible under IR optimization.
- Final review: independent reviewer approved after stale-counter and zero-late-fee fixes; author reran the full suite.
- Evidence: docs/RENTAL-SAFETY-VALIDATION.md. Remote CI and funded Sepolia acceptance remain outside local validation.

## Git delivery preference

The user requested descriptive branch categories: `feature/`, `fix/`, `design/`, `docs/`, or `chore/` according to the work. This branch is `feature/rental-safety-v2`. The user subsequently authorized focused commits, a branch push, and CI verification; they selected self-operated Sepolia deployment using the runbook. Split delivery by coherent subtasks, with relevant tests alongside each behavior change; keep dependent changes together rather than making broken intermediate commits. Suggested groups are deposit policy, reputation policy, escrow resolution, wallet compatibility safeguards, resolution/evidence UI, integration/CI tooling, and rollout documentation. Use Conventional Commit types that describe the actual change.

## Authorized rollout follow-up

- Seven candidate/protocol Node tests and 44 contract tests pass locally.
- Deployment tooling now supports a CLI keystore sender and writes only an ignored candidate, even on dry runs. Verification checks one onchain snapshot before explicit promotion; local-chain promotion is refused.
- The old dry-run overwrite and the new rejection/preservation behavior were exercised in isolated copies. Historical manifests remain unchanged.
- Deployment verifier and runbook received an independent read-only review with no confirmed P1/P2 findings.
- User will execute docs/DEPLOY-V2.md locally. No real deployer signer or public broadcast is part of this delivery.
