import { readFile } from "node:fs/promises";
import { isAddress, zeroAddress } from "viem";

// Same public endpoint as the NEXT_PUBLIC_SEPOLIA_RPC_URL default.
export const PUBLIC_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const names = ["MockIDR", "RentalItem", "Reputation", "RentalEscrow"];

export function resolveSepoliaRpcUrl(env = process.env) {
  const configured = typeof env.SEPOLIA_RPC_URL === "string" ? env.SEPOLIA_RPC_URL.trim() : "";
  if (configured) return { url: configured, source: "SEPOLIA_RPC_URL" };
  return { url: PUBLIC_SEPOLIA_RPC, source: "public default" };
}

export function formatSepoliaRpcLog(resolved) {
  let label = "an unreadable RPC URL";
  let omittedCredentials = false;
  try {
    const parsed = new URL(resolved.url);
    omittedCredentials = Boolean(parsed.username || parsed.password || parsed.search || (parsed.pathname && parsed.pathname !== "/"));
    label = omittedCredentials ? parsed.origin : resolved.url;
  } catch {
    // Keep the generic label so a malformed override cannot print a secret.
  }
  const source = resolved.source === "public default" ? "public default" : "SEPOLIA_RPC_URL";
  const credentialNote = omittedCredentials ? "; credentials omitted" : "";
  return `Using Sepolia RPC ${label} (${source}${credentialNote}).`;
}

export class DeploymentValidationError extends Error {}
function requireCheck(condition, message) {
  if (!condition) throw new DeploymentValidationError(message);
}
function validAddress(value) {
  return typeof value === "string" && isAddress(value) && value.toLowerCase() !== zeroAddress;
}
function sameAddress(left, right) {
  return typeof left === "string" && left.toLowerCase() === right.toLowerCase();
}

export function validateCandidate(candidate) {
  requireCheck(candidate?.chainId === 11155111, "Candidate chain must be Ethereum Sepolia (11155111).");
  requireCheck(candidate.protocolVersion === 2, "Candidate protocol version must be 2.");
  requireCheck(typeof candidate.demoMode === "boolean", "Candidate demo mode must be a boolean.");
  requireCheck(validAddress(candidate.deployer), "Candidate deployer must be a nonzero Ethereum address.");
  for (const name of names) {
    requireCheck(validAddress(candidate.contracts?.[name]), `Candidate ${name} address is missing or invalid.`);
  }
  requireCheck(new Set(names.map((name) => candidate.contracts[name].toLowerCase())).size === 4, "Contract addresses must be distinct.");
}

export async function verifyCandidate(client, candidate) {
  validateCandidate(candidate);
  requireCheck(await client.getChainId() === candidate.chainId, "RPC chain does not match the candidate.");
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const abis = Object.fromEntries(await Promise.all(names.map(async (name) => [name,
    JSON.parse(await readFile(new URL(`../src/abi/${name}.json`, import.meta.url), "utf8")),
  ])));
  const code = await Promise.all(names.map((name) => client.getCode({ address: candidate.contracts[name], blockNumber })));
  names.forEach((name, index) => requireCheck(typeof code[index] === "string" && code[index] !== "0x", `No deployed bytecode for ${name}. Do not promote simulated addresses.`));
  const checks = [
    ["RentalEscrow", "PROTOCOL_VERSION", 2n],
    ["RentalEscrow", "idr", candidate.contracts.MockIDR],
    ["RentalEscrow", "item", candidate.contracts.RentalItem],
    ["RentalEscrow", "reputation", candidate.contracts.Reputation],
    ["RentalEscrow", "admin", candidate.deployer],
    ["RentalEscrow", "demoMode", candidate.demoMode],
    ["RentalItem", "escrow", candidate.contracts.RentalEscrow],
    ["Reputation", "escrow", candidate.contracts.RentalEscrow],
    ["RentalItem", "admin", candidate.deployer],
    ["Reputation", "admin", candidate.deployer],
    ["MockIDR", "decimals", 18],
    ["MockIDR", "name", "Mock Indonesian Rupiah"],
    ["MockIDR", "symbol", "mIDR"],
  ];
  const results = await Promise.all(checks.map(([name, functionName]) => client.readContract({
    address: candidate.contracts[name], abi: abis[name], functionName, blockNumber,
  })));
  checks.forEach(([name, functionName, expected], index) => {
    const addressExpected = typeof expected === "string" && expected.startsWith("0x");
    requireCheck(addressExpected ? sameAddress(results[index], expected) : results[index] === expected,
      `Onchain ${name}.${functionName} does not match the candidate.`);
  });
  return { ...candidate, verifiedAtBlock: String(blockNumber) };
}
