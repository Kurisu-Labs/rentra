# Frontend dependency security patch

The initial preview build reported two high-severity vulnerable transitive packages: PostCSS 8.4.31 and a nested ws 8.18.0. Targeted npm overrides now pin **PostCSS 8.5.29** and **ws 8.22.0**, while retaining Next.js 15 and wagmi 2. Overrides apply only to package major version 8, preserving other major versions if they appear in the dependency tree.

The lockfile changed four entries: one PostCSS package and three ws copies. No application source, ABI, contract, or deployment address changed. The previously confirmed Sepolia transactions remain valid evidence for the unchanged protocol and signing definitions.

## Validation

A clean `npm ci`, all seven Node tests, and `npm run build` passed on Node 22.23.3. The installed audit moved from **2 high / 24 moderate** to **0 critical / 0 high / 22 moderate**. `npm audit --audit-level=high` passed and is now part of the app CI job, so a future high/critical advisory fails that job.

[Machine-readable validation](evidence/dependency-v2/validation.json) binds the result to package/lockfile SHA-256 hashes and records all four changed package versions. The audit is a timestamped registry result; 22 moderate findings remain for a separate reachability and compatibility review before production acceptance.

The hosted preview is rebuilt from the patched app before being identified as the current preview in [PREVIEW-V2.md](PREVIEW-V2.md). This report's initial checks are local; the hosted report records the exact deployed commit and subsequent browser results.

## References

- [PostCSS 8.5.29 release](https://github.com/postcss/postcss/releases/tag/8.5.29)
- [ws releases](https://github.com/websockets/ws/releases)
- [PostCSS source-map disclosure advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)
- [ws memory exhaustion advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)

These package advisories explain the dependency update. No claim of a reachable Rentra exploit is made from the audit alone. The optional wallet SDK build warnings remain separate from this patch.
