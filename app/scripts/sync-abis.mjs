import { readFile, writeFile } from "node:fs/promises";

for (const name of ["MockIDR", "RentalItem", "Reputation", "RentalEscrow"]) {
  const artifact = new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  const destination = new URL(`../src/abi/${name}.json`, import.meta.url);
  const { abi } = JSON.parse(await readFile(artifact, "utf8"));
  if (process.argv.includes("--check")) {
    const committed = JSON.parse(await readFile(destination, "utf8"));
    if (JSON.stringify(committed) !== JSON.stringify(abi)) throw new Error(`${name} ABI is out of sync`);
  } else {
    await writeFile(destination, `${JSON.stringify(abi, null, 2)}\n`);
  }
}
