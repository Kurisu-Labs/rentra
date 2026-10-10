# Frontend dependency security patch

The initial preview build reported two high-severity vulnerable transitive packages: PostCSS 8.4.31 and a nested ws 8.18.0. Targeted npm overrides now pin **PostCSS 8.5.29** and **ws 8.22.0**, while retaining Next.js 15 and wagmi 2. The ws override is scoped to viem and its isows peer integration. WalletConnect’s legacy ws 7.5.13 remains in its own subtree, while the vulnerable shared ws 8.18.0 copy is removed.

The final lockfile upgrades PostCSS and hoists the patched ws 8 copy for the viem/isows integration, with ws 7 retained under its legacy consumer. No application source, ABI, contract, or deployment address changed. The previously confirmed Sepolia transactions remain valid evidence for the unchanged protocol and signing definitions.

## Validation

A clean `npm ci`, all seven Node tests, and `npm run build` passed on Node 22.23.3 with npm 10.9.9, matching CI. npm 11.6.2 also passed lockfile validation, and `npm ls ws --all` reported a valid dependency tree. User/global npm configuration was excluded from the final validation. The installed audit moved from **2 high / 24 moderate** to **0 critical / 0 high / 22 moderate**. `npm audit --audit-level=high` passed and is now part of the app CI job, so a future high/critical advisory fails that job.

[Current machine-readable validation](evidence/dependency-v2/validation-npm10.json) binds the final result to package/lockfile SHA-256 hashes and records the dependency relocations. The [earlier npm 11-only snapshot](evidence/dependency-v2/validation.json) is historical; its broader override did not install consistently with npm 10 and is superseded by the scoped resolution. The audit is a timestamped registry result; 22 moderate findings remain for a separate reachability and compatibility review before production acceptance.

The hosted preview is rebuilt from the patched app before being identified as the current preview in [PREVIEW-V2.md](PREVIEW-V2.md). This report's initial checks are local; the hosted report records the exact deployed commit and subsequent browser results.

## References

- [PostCSS 8.5.29 release](https://github.com/postcss/postcss/releases/tag/8.5.29)
- [ws releases](https://github.com/websockets/ws/releases)
- [PostCSS source-map disclosure advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)
- [ws memory exhaustion advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)

These package advisories explain the dependency update. No claim of a reachable Rentra exploit is made from the audit alone. The optional wallet SDK build warnings remain separate from this patch.

The patched hosted Preview is READY from commit `de8e4915ba8dfee8d2209c48f6d5920f05c2b3a4`. [CI run 38033035515](https://github.com/Kurisu-Labs/rentra/actions/runs/38033035515) passed contracts, app, and the high/critical audit gate. The [current preview report](PREVIEW-V2.md) records its public HTTP and browser checks.
