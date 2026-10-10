# Rental safety v2

This is the implementation scope authorized on 10 October 2026. A new v2 Sepolia instance has since been deployed; see [DEPLOYMENT-V2.md](DEPLOYMENT-V2.md). Existing v1 contracts and funds are not upgraded or migrated.

## Rules

- An unsigned return is a request. Funds, item locks, and reputation remain unchanged until the owner acknowledges it, the parties agree a settlement, or their agreed mediator rules.
- A mediator is proposed by the owner and explicitly accepted by the renter while Booked. Neither rental party may mediate. Acceptance is final and handover freezes the choice. A pending proposal must be accepted or the booking cancelled before handover.
- An acknowledged return pays rent and late fees, then starts a 24-hour **real-time** claim window. Late fees use the onchain return request time when the owner acknowledges a request. A signed direct return uses submission time, as in v1.
- Silence never settles a contested claim. Either party may propose a compensation amount; only the other party can accept the exact offer. The mediator may split only this rental's remaining deposit and claim bond between its owner and renter. A disputed non-return ruling is possible only after end plus grace.
- Without a responsive mediator or mutual agreement, contested funds can remain locked indefinitely. No admin withdrawal, automatic evidence verification, arbitration service, or notification delivery is implied.
- Reputation is recorded once at final settlement. Monetary damage compensation does not count as a successful rental. Only manually approved owners can earn discount credit or raise its value cap; historical outcome counts still include other owners. Approval is an operator trust decision, not proof of unique identity.
- Each listing has an immutable deposit floor (30–100%). The legacy listing function defaults to 100%; the UI requires explicit owner choice. Existing value-cap and permanent-default rules remain.
- Clock mode cannot change while rentals are open. Demo rental deadlines can accelerate; claim and response windows always use real time.
- The v2 app fails closed for writes and signatures against unrecognized/legacy escrow versions or mismatched contract references. The deploy script writes an unverified candidate; only explicit promotion after RPC verification can update the historical manifests. Local test-chain promotion is rejected.

## Scope and limits

The app exposes return requests, owner acknowledgement/dispute, mediator agreement/rulings, bilateral settlements, actual claim deadlines, compensation exposure, and local evidence receipt download. Photo originals stay on the user's device; no storage provider is configured. No real funds, insurance, guarantor capital, price appraisal, verified business onboarding, email/push service, or keeper is created.

## Validation

Foundry regression tests must cover funds conservation, request/acknowledgement/dispute, unauthorized calls, mediator consent/freeze, offer replacement, claim caps and bonds, no reputation before settlement, approval-gated discounts, deposit floors, real deadlines in demo mode, and clock changes with open rentals. Run `forge fmt --check`, `forge build`, `forge test`, coverage, and the Node 22 app production build. Regenerate all frontend ABIs from compiler artifacts. Browser checks should cover read-only legacy deployment warnings and transaction-disabled states; funded multi-wallet Sepolia testing requires a new deployment and is separate from local checks.
