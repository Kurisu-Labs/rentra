import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeErrorResult } from "viem";
import { contractErrorText } from "../src/lib/contract-errors.ts";

const escrowAbi = JSON.parse(
  readFileSync(new URL("../src/abi/RentalEscrow.json", import.meta.url), "utf8"),
);
const tokenAbi = JSON.parse(readFileSync(new URL("../src/abi/MockIDR.json", import.meta.url), "utf8"));

test("decodes TooEarly (0x085de625) into a readable message without raw hex", () => {
  const data = encodeErrorResult({ abi: escrowAbi, errorName: "TooEarly" });
  assert.equal(data, "0x085de625");
  const message = contractErrorText(
    {
      shortMessage: `Execution reverted with reason: custom error ${data}.`,
      cause: { data },
    },
    [escrowAbi, tokenAbi],
  );
  assert.equal(message, "Pengambilan belum dibuka. Tunggu sampai waktu mulai sewa.");
  assert.doesNotMatch(message, /0x/i);
});

test("decodes custom errors nested on the cause and errors that carry arguments", () => {
  const tooLate = encodeErrorResult({ abi: escrowAbi, errorName: "TooLate" });
  assert.equal(
    contractErrorText({ cause: { message: `reverted ${tooLate}` } }, escrowAbi),
    "Waktu pengambilan sudah lewat.",
  );
  const balance = encodeErrorResult({
    abi: tokenAbi,
    errorName: "ERC20InsufficientBalance",
    args: ["0x1111111111111111111111111111111111111111", 0n, 1n],
  });
  const message = contractErrorText({ data: balance }, [escrowAbi, tokenAbi]);
  assert.equal(message, "Saldo token tidak cukup.");
  assert.doesNotMatch(message, /0x/i);
});

test("hides an unknown selector and leaves ordinary wallet errors unchanged", () => {
  assert.equal(
    contractErrorText({ shortMessage: "custom error 0xdeadbeef" }, escrowAbi),
    "Transaksi ditolak oleh kontrak. Periksa status sewa, lalu coba lagi.",
  );
  assert.equal(contractErrorText({ shortMessage: "User rejected the request." }, escrowAbi), null);
  assert.equal(
    contractErrorText(
      { message: "Paid to 0x1111111111111111111111111111111111111111" },
      escrowAbi,
    ),
    null,
  );
});
