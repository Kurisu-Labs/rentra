# Rentra contracts

Foundry project for MockIDR, RentalItem (ERC-721 + ERC-4907), Reputation, and RentalEscrow.

```bash
forge build
forge test
```

Deploy to Ethereum Sepolia (chain id 11155111) from the repository root instructions in `../README.md`. The script is `script/Deploy.s.sol`. It reads `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` from the environment (see `.env.example`) and writes `deployments/sepolia.json`. Do not commit a real key or an RPC URL that contains an API key.
