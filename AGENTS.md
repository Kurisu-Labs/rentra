# Repository Guidelines

## Project Structure & Module Organization

Rentra is a peer-to-peer rental escrow on Ethereum Sepolia (chain ID `11155111`).

- `app/src/app/`: Next.js App Router pages and global CSS; `icon.png` is the app icon.
- `app/src/components/`: shared React components and transaction hooks.
- `app/src/lib/`: contract configuration, formatting, sample data, and signing helpers. `app/src/abi/` and `app/src/deployments/` hold contract integration data.
- `contracts/src/`: Solidity escrow, rental NFT, reputation, and mock rupiah contracts; interfaces live in `interfaces/`.
- `contracts/test/`: Foundry tests. `contracts/script/`: deployment scripts. `contracts/lib/`: vendored dependencies; avoid incidental edits.
- `docs/PLAN.md`: product notes in Indonesian. `.github/workflows/ci.yml`: CI checks.

## Build, Test, and Development Commands

Use Node.js 22 and Foundry; CI pins Foundry to `v1.8.5` and Solidity to `0.8.28`.

From `app/`:

- `cp .env.example .env.local`: initialize local configuration.
- `npm ci`: install dependencies from the lockfile.
- `npm run dev`: start the development server.
- `npm run build`: create the production build and check TypeScript.
- `npm start`: serve the production build.

From `contracts/`:

- `forge build`: compile contracts.
- `forge test`: run contract tests; add `-vvv` for failure traces.
- `forge coverage`: inspect contract coverage.

## Coding Style & Naming Conventions

Match existing code: TypeScript uses two-space indentation, double quotes, semicolons, and strict typing. Prefer `@/` imports for `app/src/`. Use kebab-case component filenames, PascalCase React exports, and camelCase functions. Solidity uses four-space indentation and PascalCase contract filenames. No application ESLint or Prettier configuration exists; use `forge fmt` for Solidity formatting.

## Testing Guidelines

Use `forge-std/Test.sol`, `*.t.sol` files, and descriptive `test_...` functions. Cover escrow transitions, balances, authorization failures, signature replay, reputation, and demo-clock boundaries when changing related behavior. No coverage threshold or frontend test runner is configured. Run the contract checks and app build before submitting; manually verify affected wallet and rental flows.

## Commit & Pull Request Guidelines

Use Conventional Commits: `type(scope): imperative summary`, for example `feat(ui): refresh rental catalog`, `fix(escrow): validate return signatures`, or `docs(contributing): clarify setup`. Use `feat`, `fix`, `refactor`, `docs`, `test`, or `chore` with a relevant scope. Keep commits focused. PRs should explain behavior changes, link relevant issues, list validation commands, and include screenshots for UI changes. Pass both CI jobs.

## Security & Configuration

Use the supplied environment examples. Never commit private keys, API-key-bearing RPC URLs, or secrets in `NEXT_PUBLIC_*` variables. Keep frontend ABIs and deployment JSON synchronized with contract changes. Placeholder Privy configuration supports builds; login requires a real app ID.

## Product & Copy

Use English for application copy, including validation, loading states, and metadata. Keep prices in Indonesian rupiah. Follow the rental, reputation, and photo-evidence principles in `docs/PLAN.md`, while treating implemented Ethereum Sepolia contracts as the source of truth. Explain deposit claim windows and test funds accurately; avoid promising unimplemented features.
