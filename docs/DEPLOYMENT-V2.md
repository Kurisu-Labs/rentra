# Rentra v2 — Ethereum Sepolia deployment

## Current instance

Redeployed on 10 October 2026 from the same v2 source as `main` (the contract tree is unchanged since `941ae8e4f9a80271589fa7cb49794ff9c03ae427`). This is a new protocol v2 instance on chain **11155111**, with **real-time mode** (`demoMode` false). It replaces the earlier v2 instance because that instance's admin key was unavailable. No v1 funds, v1 history, or superseded-instance listings and rentals were migrated.

Deployer/admin (Reputation, RentalItem, and RentalEscrow): [`0xe14a16eA71Da4f8FA1CDc2e3cA7A4F8A1eFcfCcf`](https://sepolia.etherscan.io/address/0xe14a16eA71Da4f8FA1CDc2e3cA7A4F8A1eFcfCcf).

| Contract | Address | Sourcify source verification |
| --- | --- | --- |
| MockIDR | [`0x1935B583074E1e53284114334753067Fc732ebB6`](https://sepolia.etherscan.io/address/0x1935B583074E1e53284114334753067Fc732ebB6) | [Exact match](https://repo.sourcify.dev/11155111/0x1935B583074E1e53284114334753067Fc732ebB6) |
| RentalItem | [`0x5493216BedfE2FCBd2ec21f2702B7a6d3145Fc25`](https://sepolia.etherscan.io/address/0x5493216BedfE2FCBd2ec21f2702B7a6d3145Fc25) | [Exact match](https://repo.sourcify.dev/11155111/0x5493216BedfE2FCBd2ec21f2702B7a6d3145Fc25) |
| Reputation | [`0x109982a2808784eB554F507172057AB0BbBCb737`](https://sepolia.etherscan.io/address/0x109982a2808784eB554F507172057AB0BbBCb737) | [Exact match](https://repo.sourcify.dev/11155111/0x109982a2808784eB554F507172057AB0BbBCb737) |
| RentalEscrow | [`0x09869C49eA9cC3477b14d9CEcc212Df43D0949f2`](https://sepolia.etherscan.io/address/0x09869C49eA9cC3477b14d9CEcc212Df43D0949f2) | [Exact match](https://repo.sourcify.dev/11155111/0x09869C49eA9cC3477b14d9CEcc212Df43D0949f2) |

### Confirmed transactions

| Step | Transaction | Block |
| --- | --- | --- |
| MockIDR | [Receipt](https://sepolia.etherscan.io/tx/0xb542fc6965bc450f164aab35035b6bf8070247418922c9140f6339b134178f6d) | 11884111 |
| RentalItem | [Receipt](https://sepolia.etherscan.io/tx/0xf937506c5ae33a54daf95f6750035fa2a2641d4a087398d195d20c34182e538a) | 11884115 |
| Reputation | [Receipt](https://sepolia.etherscan.io/tx/0x2f844b9f351378fd8869e838d684ef5255aabe51436c5c7c98590c386b80f598) | 11884116 |
| RentalEscrow | [Receipt](https://sepolia.etherscan.io/tx/0xe3722450dfa0fe29c22910e34ff88bf8c1ec46aff79b74e25dc3306ee47d608a) | 11884118 |
| RentalItem.setEscrow | [Receipt](https://sepolia.etherscan.io/tx/0x8d0b506182f67dbf2f620fc93803407a84359e0f28ff36fa1a8246b276a0a520) | 11884122 |
| Reputation.setEscrow | [Receipt](https://sepolia.etherscan.io/tx/0x2be741da3104588aabf0b7c19cdae0088aec34eeb20848217763560d0cff2a4f) | 11884123 |
| Reputation.setOwnerApproval | [Receipt](https://sepolia.etherscan.io/tx/0x1ca1ef5c2181efbee599e248ce44f2a8baf219f60cb85ce1af6844d98d82eb3d) | 11884130 |

`setOwnerApproval` set test owner [`0xc7d19399C184ee28D425ce3cf8B1D92DACFCd4AE`](https://sepolia.etherscan.io/address/0xc7d19399C184ee28D425ce3cf8B1D92DACFCd4AE) to approved. A subsequent `approvedOwner` read returned true. Deployment did not seed listings or rentals.

Broadcast used `forge script` with `--slow -g 800`. Total cost was about **0.000076 Sepolia ETH** (deployer balance 1.007534541 → 1.007458550).

### Verification scope

- All four contracts obtained Sourcify **exact matches**. Etherscan verification for the complete set is not claimed.
- `npm run verify:deployment` against the public RPC reported `Verified protocol v2 at block 11884127`. Both committed manifests were promoted at block `11884128`.
- Chain, protocol version, administrator address, both escrow references, mIDR metadata, and real-time mode were part of that live check. `demoMode` is false.
- No listings or rental test transactions were seeded on this instance. The catalog starts empty. The only recorded post-deploy admin action is the test-owner approval above.
- QA acceptance results in [SEPOLIA-ACCEPTANCE.md](SEPOLIA-ACCEPTANCE.md) were recorded on the superseded instance below. They used identical bytecode and source. Listings and rentals there are not visible in the app.

Frontend defaults now target this instance. Existing hosted builds still embed the superseded addresses until they are rebuilt, and any stale address overrides must be removed or updated as a consistent set.

## Superseded v2 instance

Historical protocol v2 deployment from 10 October 2026, kept for reference. It was replaced because admin [`0xadf00a2476c77163B607af6E55A6a90185ae33f6`](https://sepolia.etherscan.io/address/0xadf00a2476c77163B607af6E55A6a90185ae33f6) was not controllable. Source commit: `941ae8e4f9a80271589fa7cb49794ff9c03ae427`. Real-time mode, chain **11155111**, and no migration of v1 funds or history. The contracts remain onchain. The app does not read them, so listings and rentals created there are not visible.

| Contract | Address | Sourcify source verification |
| --- | --- | --- |
| MockIDR | [`0x5f1540ad73433d80e510efa8dac04d2acbfa8f24`](https://sepolia.etherscan.io/address/0x5f1540ad73433d80e510efa8dac04d2acbfa8f24) | [Exact match](https://repo.sourcify.dev/11155111/0x5f1540aD73433d80e510eFA8DAC04d2acbfA8f24) |
| RentalItem | [`0x29a2ded83f440fc1d16d0f1617e8c2fb7d2c8525`](https://sepolia.etherscan.io/address/0x29a2ded83f440fc1d16d0f1617e8c2fb7d2c8525) | [Exact match](https://repo.sourcify.dev/11155111/0x29A2Ded83F440fC1d16d0f1617E8c2FB7D2C8525) |
| Reputation | [`0x6356f9b9e5dd5a13e2b1fdd2680f19d5ef5f1c1a`](https://sepolia.etherscan.io/address/0x6356f9b9e5dd5a13e2b1fdd2680f19d5ef5f1c1a) | [Exact match](https://repo.sourcify.dev/11155111/0x6356F9B9e5dD5A13E2b1fDd2680f19d5ef5f1c1a) |
| RentalEscrow | [`0x9be48b39d3fa6cbf929141a247d9302495d17a73`](https://sepolia.etherscan.io/address/0x9be48b39d3fa6cbf929141a247d9302495d17a73) | [Exact match](https://repo.sourcify.dev/11155111/0x9BE48B39d3fa6cbF929141A247d9302495D17A73) |

### Confirmed transactions

| Step | Transaction | Block |
| --- | --- | --- |
| MockIDR | [Receipt](https://sepolia.etherscan.io/tx/0xf7953c08a03631887fa6f9239208cde622c875fd99999a2f09b8432a26d59e8d) | 11882459 |
| RentalItem | [Receipt](https://sepolia.etherscan.io/tx/0xda0eb17fafee1abe5c350dc6e4e29e29976921c89bd3f215a510d6f4fd421e4b) | 11882460 |
| Reputation | [Receipt](https://sepolia.etherscan.io/tx/0x8fb7d79d94109a50ebbba570f7536c82281357d074a59ef5574c820f19d3902a) | 11882461 |
| RentalEscrow | [Receipt](https://sepolia.etherscan.io/tx/0x0110f18c5045f9a5b0b5f31ca95bba96dda6b8b38ca11634427ac99eed35a04c) | 11882462 |
| RentalItem.setEscrow | [Receipt](https://sepolia.etherscan.io/tx/0x8c0e8d2b9533fb16115567a6a68ed84a157ededdc0d08043bc2e61949fe753f8) | 11882464 |
| Reputation.setEscrow | [Receipt](https://sepolia.etherscan.io/tx/0x33dac203e273a629d4cf92e3b7169bc16625eeceac5eab57c554fe543b490be7) | 11882465 |

Actual gas cost across the six successful transactions: **0.000055900770380195 Sepolia ETH**.

### Verification scope

- All four source sets obtained Sourcify **exact matches for creation and runtime bytecode**. Etherscan verification for the complete set is not claimed.
- Runtime bytes match the compiled artifacts after masking declared constructor-immutable ranges; the deployment receipts bind the expected creation addresses and signed nonces.
- Chain, protocol version, administrator addresses, both escrow references, mIDR metadata, real-time mode, escrow EIP-712 domain, and permit domain passed live read checks.
- Both committed deployment manifests were promoted only after live verification. Those manifests have since been replaced by the current instance above.
- Node 22 production build and seven Node checks passed after that earlier address promotion. The rebuilt localhost app passed its v2 guard through the public RPC, loaded the expected empty catalog, and showed no browser console errors. This was a read-only UI check, not a rental transaction test.
- No listings, approval credits, or rental test transactions were seeded by this deployment. The catalog started empty. Later QA listings and rentals exist only on this instance.

[Machine-readable evidence](evidence/deployment-v2/verification.json) contains public addresses, receipt hashes, bytecode hashes, source verification results, and verification block for this superseded instance. It contains no signer key or credential-bearing RPC endpoint.

### Acceptance recorded here

Funded multi-wallet Sepolia contract integration completed 31 transactions and 33 immediate checks against this instance; see [SEPOLIA-ACCEPTANCE.md](SEPOLIA-ACCEPTANCE.md). Those checks used identical bytecode and source to the current instance. The listings and rentals are not visible in the app. The clean-return finalization remains pending until 11 October 2026 at 13:33:48 WIB, and an actual MetaMask extension transaction journey is untested. The earlier Anvil evidence remains local. Operational owner admission, an independent mediation service, hosted photo storage, notifications, insurance, and a funded guarantor remain unprovisioned. Disputed funds can remain locked without agreement or a responsive mediator.

A separate [public v2 frontend preview](https://rentra-ke155ds3k-rakhargos-projects.vercel.app) was built and checked against this superseded instance. See [PREVIEW-V2.md](PREVIEW-V2.md) for the exact source commit, target, browser evidence, and remaining acceptance work.
