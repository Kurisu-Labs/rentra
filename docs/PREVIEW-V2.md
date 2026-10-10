# Rentra v2 frontend preview

Public preview: [Open Rentra](https://rentra-e6d65lrk4-rakhargos-projects.vercel.app).

This deployment was built from `6e92f7ceaa0c2f53f6c5c5f4922a3854ad358cc4` with Node.js 22, `npm ci`, and `npm run build`. Vercel reports deployment `dpl_AchuXJG4t9ZeGCZeYokztVQwj6qr` as **READY**, with the Preview target (`target: null` in its API). It uses the four committed v2 contract addresses and the public Sepolia RPC. No project environment variables are configured.

The owner explicitly authorized public access for the newly created Vercel project `rentra`. Anyone with a deployment URL can open this testnet frontend without a Vercel login. MetaMask still controls wallet connection, signatures, and transactions.

Vercel classified the new project's initial bootstrap deployment as Production despite the explicit preview request. A second, separate Preview deployment was created, and the bootstrap's automatically generated alias `rentra-khaki.vercel.app` was removed. The preview above is the reviewed URL. This does not constitute production acceptance or a Git merge.

## Checks performed on the hosted preview

- `/`, `/my`, `/list`, and `/reputation` returned HTTP 200 without authentication. All 18 referenced JavaScript assets checked returned HTTP 200. The downloaded bundles contained the four expected v2 addresses and the public RPC hostname.
- The browser completed the protocol guard using the public RPC. The initial catalog correctly showed no listings; subsequent E2E fixtures are explicitly synthetic test listings.
- Main navigation, the wallet connection dialog, and MetaMask installation guidance worked. The testing browser has no MetaMask extension, so an actual extension connection/sign/send flow is not claimed.
- A malformed reputation address produced the English validation message. Looking up the public renter test address loaded its live record and full deposit factor.
- A 50% listing floor displayed the uncovered-value acknowledgement. Changing the floor cleared that acknowledgement. A 29% floor failed the browser's minimum-value validation.
- Catalog, rentals, listing, and reputation pages were checked at measured CSS widths of 375, 768, and 1440 pixels. No horizontal overflow was measured. Each page had one main landmark and one H1; visible inputs had labels. The skip link navigated to the main-content anchor.
- No application console errors were observed. A previous Vercel login page's Google identity warning/error was excluded by its origin and timestamp.

[HTTP and bundle evidence](evidence/preview-v2/http-verification.json) and [layout measurements](evidence/preview-v2/layout-checks.json) record the measured results. Screenshots: [desktop catalog](evidence/preview-v2/catalog-1440.jpg), [tablet catalog](evidence/preview-v2/catalog-768.jpg), [mobile catalog](evidence/preview-v2/catalog-375.jpg), [mobile deposit disclosure](evidence/preview-v2/list-mobile.jpg), [address validation](evidence/preview-v2/reputation-validation-mobile.jpg).

The initial catalog screenshots were captured before the onchain E2E listing was created. These are current-run visual evidence, not a comparison against a matching historical baseline. Visual regression remains **INCONCLUSIVE**. No complete axe audit, screen-reader test, Core Web Vitals measurement, or wallet-extension transaction test is claimed.

## Build and dependency follow-up

The hosted Node 22 build passed. It emitted optional MetaMask/WalletConnect dependency warnings (`@react-native-async-storage/async-storage`, `pino-pretty`) and an existing CSS compatibility warning. The installed dependency audit reported two high-severity transitive packages, `postcss` and `ws`; the suggested automatic fixes involve major Next.js/wagmi upgrades. No automatic major dependency upgrade was applied as part of publishing the preview.

Review and resolve the applicable dependency advisories before production acceptance. Audit output is a dependency finding, not proof that an attacker can reach the advisory's trigger through Rentra. A full accessibility review, an actual MetaMask wallet journey, and completion of the real 24-hour claim window remain separate acceptance checks.

## Validation commands

```sh
cd contracts
forge test
cd ../app
npm test
npm run verify:deployment -- --candidate src/deployments/sepolia.json
```

The current run passed 44 contract tests (including 256 fuzz cases), seven Node checks, and live deployment verification at block `11882665`. The hosted Vercel build uses Node 22. No contract changes or manifest promotion were needed for the preview.
