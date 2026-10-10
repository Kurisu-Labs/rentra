export function nodeRequirementMessage(version = process.version) {
  const major = Number.parseInt(String(version).replace(/^v/, ""), 10);
  if (Number.isFinite(major) && major >= 22) return "";
  return [
    `Rentra frontend tests require Node.js 22 or newer (current: ${version}).`,
    `Node.js 20 rejects --experimental-strip-types with "bad option".`,
    "Install Node.js 22 (see .nvmrc) and run npm test again.",
  ].join("\n");
}

if (process.argv[1]?.endsWith("require-node.mjs")) {
  const message = nodeRequirementMessage();
  if (message) {
    console.error(message);
    process.exit(1);
  }
}
