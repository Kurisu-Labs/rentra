// Local Anvil only. Uses its unlocked accounts; no private keys or remote RPC configuration.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, hashTypedData, http, keccak256, toHex } from "viem";
import { sepolia } from "viem/chains";
import { multicall3Bytecode } from "../node_modules/viem/_esm/constants/contracts.js";
import { handoverTypes } from "../src/lib/signing-types.ts";

const transport = http("http://127.0.0.1:8545");
const client = createPublicClient({ chain: sepolia, transport });
assert.match(await client.request({ method: "web3_clientVersion" }), /anvil/i, "This script is restricted to local Anvil");
assert.equal(await client.getChainId(), 11155111, "Start Anvil with --chain-id 11155111");
const actors = await client.request({ method: "eth_accounts" });
assert.ok(actors.length >= 4, "Anvil must expose unlocked local test accounts");
const [admin, owner, renter, mediator] = actors;
const wallets = Object.fromEntries(actors.slice(0, 4).map((account) => [account, createWalletClient({ account, chain: sepolia, transport })]));
const artifacts = {};
const contracts = {};
for (const name of ["MockIDR", "RentalItem", "Reputation", "RentalEscrow"]) {
  artifacts[name] = JSON.parse(await readFile(new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8"));
  const args = name === "RentalEscrow" ? [contracts.MockIDR, contracts.RentalItem, contracts.Reputation, false] : [];
  const hash = await wallets[admin].deployContract({ abi: artifacts[name].abi, bytecode: artifacts[name].bytecode.object, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  contracts[name] = receipt.contractAddress;
}
// Mirror Sepolia's canonical multicall address so wagmi browser reads work on Anvil.
const multicallHash = await wallets[admin].sendTransaction({ data: multicall3Bytecode });
const multicallReceipt = await client.waitForTransactionReceipt({ hash: multicallHash });
const multicallCode = await client.getCode({ address: multicallReceipt.contractAddress });
await client.request({ method: "anvil_setCode", params: [sepolia.contracts.multicall3.address, multicallCode] });
async function read(name, functionName, args = []) {
  return client.readContract({ address: contracts[name], abi: artifacts[name].abi, functionName, args });
}
async function send(actor, name, functionName, args = []) {
  const hash = await wallets[actor].writeContract({ address: contracts[name], abi: artifacts[name].abi, functionName, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", functionName);
}
await send(admin, "RentalItem", "setEscrow", [contracts.RentalEscrow]);
await send(admin, "Reputation", "setEscrow", [contracts.RentalEscrow]);
await send(admin, "Reputation", "setOwnerApproval", [owner, true]);
for (const actor of [owner, renter]) {
  await send(actor, "MockIDR", "faucet");
  await send(actor, "MockIDR", "approve", [contracts.RentalEscrow, 2n ** 256n - 1n]);
}
const unit = 10n ** 18n;
const photo = keccak256(toHex("local evidence fixture, not a real photo"));
async function requestRental() {
  const tokenId = await read("RentalItem", "nextId");
  await send(owner, "RentalItem", "listItem", ["Camera with kit lens — used, includes battery", 3_000_000n * unit, 150_000n * unit, 10_000n * unit, 24, 5000]);
  const rentalId = await read("RentalEscrow", "nextRentalId");
  const ts = (await client.getBlock()).timestamp;
  await send(renter, "RentalEscrow", "book", [tokenId, ts, ts + 86400n]);
  await send(owner, "RentalEscrow", "proposeMediator", [rentalId, mediator]);
  await send(renter, "RentalEscrow", "acceptMediator", [rentalId, mediator]);
  const timestamp = (await client.getBlock()).timestamp;
  const typedData = {
    domain: { name: "Rentra", version: "2", chainId: 11155111, verifyingContract: contracts.RentalEscrow },
    types: handoverTypes, primaryType: "Handover",
    message: { rentalId, photoHash: photo, timestamp, mediator, nonce: await read("RentalEscrow", "nonces", [renter]) },
  };
  assert.equal(hashTypedData(typedData), await read("RentalEscrow", "handoverDigest", [rentalId, photo, timestamp]), "frontend and Solidity EIP-712 digests must match");
  const signature = await wallets[renter].signTypedData(typedData);
  await send(owner, "RentalEscrow", "handover", [rentalId, photo, timestamp, signature]);
  const ownerBefore = await read("MockIDR", "balanceOf", [owner]);
  await send(renter, "RentalEscrow", "confirmReturn", [rentalId, photo, timestamp, "0x"]);
  assert.equal(await read("MockIDR", "balanceOf", [owner]), ownerBefore);
  assert.equal((await read("RentalEscrow", "rentals", [rentalId]))[10], 9);
  assert.equal((await read("Reputation", "scoreOf", [renter]))[1], 0);
  return rentalId;
}
const completed = await requestRental();
await send(owner, "RentalEscrow", "disputeReturn", [completed, photo]);
await send(owner, "RentalEscrow", "proposeSettlement", [completed, 100_000n * unit]);
await send(renter, "RentalEscrow", "acceptSettlement", [completed, owner, 100_000n * unit]);
assert.equal(await read("MockIDR", "balanceOf", [contracts.RentalEscrow]), 0n);
assert.equal(await read("Reputation", "damagesOf", [renter]), 1);
assert.equal(await read("Reputation", "depositFactorBps", [renter]), 10000);
const pendingRentalId = await requestRental();
await writeFile("/tmp/rentra-local-deployment.json", JSON.stringify({ chainId: 11155111, contracts, actors: { admin, owner, renter, mediator }, pendingRentalId: String(pendingRentalId) }, null, 2));
console.log("Local smoke passed: v2 frontend signature digest, handover, pending return, dispute, bilateral settlement, isolated balances, damage history. Pending browser fixture saved to /tmp/rentra-local-deployment.json.");
