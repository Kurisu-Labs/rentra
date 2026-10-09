"use client";

import { useState } from "react";
import { keccak256 } from "viem";
import type { Hex } from "viem";

export function PhotoHash({
  label,
  onHash,
}: {
  label: string;
  onHash: (hash: Hex, fileName: string) => void;
}) {
  const [fileName, setFileName] = useState<string>("");
  const [hash, setHash] = useState<Hex | "">("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const next = keccak256(bytes);
    setFileName(file.name);
    setHash(next);
    onHash(next, file.name);
    setBusy(false);
  }

  return (
    <div>
      <label>{label}</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {busy && <p className="small muted">Menghitung hash…</p>}
      {hash && (
        <p className="hash">
          {fileName}: {hash}
        </p>
      )}
      <p className="small muted">
        Yang dicatat onchain hanya hash keccak256. Berkas foto tetap di perangkat ini.
      </p>
    </div>
  );
}
