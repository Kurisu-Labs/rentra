import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { DeploymentValidationError, formatSepoliaRpcLog, resolveSepoliaRpcUrl, verifyCandidate } from "./deployment-validation.mjs";

let promotionStarted = false;
try {
  let candidatePath = new URL("../../contracts/deployments/sepolia.candidate.json", import.meta.url);
  let promote = false;
  for (let index = 2; index < process.argv.length; index += 1) {
    const flag = process.argv[index];
    if (flag === "--promote") promote = true;
    else if (flag === "--candidate" && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) candidatePath = resolve(process.argv[++index]);
    else throw new DeploymentValidationError("Usage: verify-deployment.mjs [--candidate PATH] [--promote]");
  }
  const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
  const rpc = resolveSepoliaRpcUrl();
  console.log(formatSepoliaRpcLog(rpc));
  const client = createPublicClient({ chain: sepolia, transport: http(rpc.url) });
  const verified = await verifyCandidate(client, candidate);
  if (promote) {
    const clientVersion = await client.request({ method: "web3_clientVersion" });
    if (/anvil|hardhat|ganache/i.test(clientVersion)) throw new DeploymentValidationError("Local test chains cannot promote Sepolia deployment manifests.");
    const json = `${JSON.stringify(verified, null, 2)}\n`;
    const destinations = [new URL("../../contracts/deployments/sepolia.json", import.meta.url), new URL("../src/deployments/sepolia.json", import.meta.url)];
    const temporary = destinations.map((url) => new URL(`${url.href}.tmp`));
    await Promise.all(temporary.map((url) => writeFile(url, json)));
    promotionStarted = true;
    for (let index = 0; index < destinations.length; index += 1) await rename(temporary[index], destinations[index]);
    console.log(`Verified protocol v2 at block ${verified.verifiedAtBlock}; both deployment manifests were promoted. Review and commit their diff before publishing the app.`);
  } else {
    console.log(`Verified protocol v2 at block ${verified.verifiedAtBlock}; manifests remain unchanged. Use --promote only after checking source verification and deployment receipts.`);
  }
} catch (error) {
  console.error(error instanceof DeploymentValidationError ? error.message : "Deployment verification could not complete. Check the candidate file and RPC connection; RPC credentials are not printed.");
  console.error(promotionStarted ? "Promotion was interrupted; inspect and reconcile both deployment manifests before retrying." : "No deployment manifests were promoted.");
  process.exitCode = 1;
}
