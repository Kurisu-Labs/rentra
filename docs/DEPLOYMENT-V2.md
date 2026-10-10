# Rentra v2 — Ethereum Sepolia deployment

Deployed on 10 October 2026. This is a new protocol v2 instance on chain **11155111**, with **real-time mode** and no migration of v1 funds or history.

Deployer/admin: [`0xadf00a2476c77163B607af6E55A6a90185ae33f6`](https://sepolia.etherscan.io/address/0xadf00a2476c77163B607af6E55A6a90185ae33f6). Source commit: `941ae8e4f9a80271589fa7cb49794ff9c03ae427`.

| Contract | Address | Sourcify source verification |
| --- | --- | --- |
| MockIDR | [`0x5f1540ad73433d80e510efa8dac04d2acbfa8f24`](https://sepolia.etherscan.io/address/0x5f1540ad73433d80e510efa8dac04d2acbfa8f24) | [Exact match](https://repo.sourcify.dev/11155111/0x5f1540aD73433d80e510eFA8DAC04d2acbfA8f24) |
| RentalItem | [`0x29a2ded83f440fc1d16d0f1617e8c2fb7d2c8525`](https://sepolia.etherscan.io/address/0x29a2ded83f440fc1d16d0f1617e8c2fb7d2c8525) | [Exact match](https://repo.sourcify.dev/11155111/0x29A2Ded83F440fC1d16d0f1617E8c2FB7D2C8525) |
| Reputation | [`0x6356f9b9e5dd5a13e2b1fdd2680f19d5ef5f1c1a`](https://sepolia.etherscan.io/address/0x6356f9b9e5dd5a13e2b1fdd2680f19d5ef5f1c1a) | [Exact match](https://repo.sourcify.dev/11155111/0x6356F9B9e5dD5A13E2b1fDd2680f19d5ef5f1c1a) |
| RentalEscrow | [`0x9be48b39d3fa6cbf929141a247d9302495d17a73`](https://sepolia.etherscan.io/address/0x9be48b39d3fa6cbf929141a247d9302495d17a73) | [Exact match](https://repo.sourcify.dev/11155111/0x9BE48B39d3fa6cbF929141A247d9302495D17A73) |

## Confirmed transactions

| Step | Transaction | Block |
| --- | --- | --- |
| MockIDR | [Receipt](https://sepolia.etherscan.io/tx/0xf7953c08a03631887fa6f9239208cde622c875fd99999a2f09b8432a26d59e8d) | 11882459 |
| RentalItem | [Receipt](https://sepolia.etherscan.io/tx/0xda0eb17fafee1abe5c350dc6e4e29e29976921c89bd3f215a510d6f4fd421e4b) | 11882460 |
| Reputation | [Receipt](https://sepolia.etherscan.io/tx/0x8fb7d79d94109a50ebbba570f7536c82281357d074a59ef5574c820f19d3902a) | 11882461 |
| RentalEscrow | [Receipt](https://sepolia.etherscan.io/tx/0x0110f18c5045f9a5b0b5f31ca95bba96dda6b8b38ca11634427ac99eed35a04c) | 11882462 |
| RentalItem.setEscrow | [Receipt](https://sepolia.etherscan.io/tx/0x8c0e8d2b9533fb16115567a6a68ed84a157ededdc0d08043bc2e61949fe753f8) | 11882464 |
| Reputation.setEscrow | [Receipt](https://sepolia.etherscan.io/tx/0x33dac203e273a629d4cf92e3b7169bc16625eeceac5eab57c554fe543b490be7) | 11882465 |

Actual gas cost across the six successful transactions: **0.000055900770380195 Sepolia ETH**.

## Verification scope

- All four source sets obtained Sourcify **exact matches for creation and runtime bytecode**. Etherscan verification for the complete set is not claimed.
- Runtime bytes match the compiled artifacts after masking declared constructor-immutable ranges; the deployment receipts bind the expected creation addresses and signed nonces.
- Chain, protocol version, administrator addresses, both escrow references, mIDR metadata, real-time mode, escrow EIP-712 domain, and permit domain passed live read checks.
- Both committed deployment manifests were promoted only after live verification.
- Node 22 production build and seven Node checks passed after address promotion. The rebuilt localhost app passed its v2 guard through the public RPC, loaded the expected empty catalog, and showed no browser console errors. This was a read-only UI check, not a rental transaction test.
- No listings, approval credits, or rental test transactions were seeded by this deployment. The catalog starts empty.

[Machine-readable evidence](evidence/deployment-v2/verification.json) contains public addresses, receipt hashes, bytecode hashes, source verification results, and verification block. It contains no signer key or credential-bearing RPC endpoint.

## Still pending

A funded multi-wallet Sepolia rental acceptance test has **not** been performed. The earlier Anvil browser/signing tests remain local evidence. Owner admission, an available mutually accepted mediator, hosted photo storage, notifications, insurance, and a funded guarantor have not been provisioned. Disputed funds can remain locked without agreement or a responsive mediator.

Frontend defaults now target this v2 instance. Existing hosted builds require a rebuild/redeploy, and any stale address overrides must be removed or updated as a consistent set. No production frontend publication or PR merge is implied by the contract deployment.

A separate [public v2 frontend preview](https://rentra-e6d65lrk4-rakhargos-projects.vercel.app) has since been built and checked against this instance. See [PREVIEW-V2.md](PREVIEW-V2.md) for the exact source commit, target, browser evidence, and remaining acceptance work.
