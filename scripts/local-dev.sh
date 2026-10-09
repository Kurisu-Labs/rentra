#!/usr/bin/env bash
# Deploy Rentra to a local Anvil (chain id 84532) and write app/.env.local.
# Anvil's default keys are public development keys. Do not use them on a real network.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="${PATH}:/home/ubuntu/.foundry/bin:${HOME}/.foundry/bin"

RPC="http://127.0.0.1:8545"
# Anvil account #0 (owner / deployer) and #1 (renter).
OWNER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RENTER_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
CHAIN_ID_HEX="0x14a34"

if ! curl -sf -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "$RPC" | grep -qi "$CHAIN_ID_HEX"; then
  echo "Anvil is not answering on ${RPC} with chain id 84532." >&2
  echo "Start it with: anvil --host 127.0.0.1 --port 8545 --chain-id 84532" >&2
  exit 1
fi

cd "$ROOT/contracts"
export PRIVATE_KEY="$OWNER_KEY"
export BASE_SEPOLIA_RPC_URL="$RPC"

echo "Deploying contracts..."
LOG="$(forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key "$PRIVATE_KEY" -vv)"
echo "$LOG"

grab() {
  echo "$LOG" | grep -oE "$1 0x[0-9a-fA-F]{40}" | awk '{print $2}' | tail -n 1
}

IDR="$(grab MockIDR)"
ITEM="$(grab RentalItem)"
REPUTATION="$(grab Reputation)"
ESCROW="$(grab RentalEscrow)"

if [[ -z "$IDR" || -z "$ITEM" || -z "$REPUTATION" || -z "$ESCROW" ]]; then
  echo "Could not parse deployed addresses." >&2
  exit 1
fi

echo "Seeding listings and faucet drips..."
cast send "$ITEM" "listItem(string,uint256,uint256,uint256,uint32)" \
  "Kamera mirrorless" 3000000ether 150000ether 10000ether 24 \
  --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
cast send "$ITEM" "listItem(string,uint256,uint256,uint256,uint32)" \
  "Drone lipat" 5000000ether 250000ether 20000ether 12 \
  --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
cast send "$IDR" "faucet()" --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
cast send "$IDR" "faucet()" --private-key "$RENTER_KEY" --rpc-url "$RPC" >/dev/null

cat > "$ROOT/app/.env.local" <<EOF
NEXT_PUBLIC_LOCAL_WALLET=1
NEXT_PUBLIC_PRIVY_APP_ID=clplaceholderprivyappid01
NEXT_PUBLIC_BASE_SEPOLIA_RPC=${RPC}
NEXT_PUBLIC_MOCK_IDR_ADDRESS=${IDR}
NEXT_PUBLIC_RENTAL_ITEM_ADDRESS=${ITEM}
NEXT_PUBLIC_REPUTATION_ADDRESS=${REPUTATION}
NEXT_PUBLIC_RENTAL_ESCROW_ADDRESS=${ESCROW}
EOF

echo
echo "Wrote app/.env.local"
echo "  MockIDR       ${IDR}"
echo "  RentalItem    ${ITEM}"
echo "  Reputation    ${REPUTATION}"
echo "  RentalEscrow  ${ESCROW}"
echo
echo "Start the app: cd app && npm run dev"
echo "Pemilik  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "Penyewa  0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
