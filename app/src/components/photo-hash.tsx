"use client";

import { useId, useRef, useState } from "react";
import { keccak256 } from "viem";
import type { Hex } from "viem";

export function PhotoHash({
  label,
  onHash,
}: {
  label: string;
  onHash: (hash: Hex, fileName: string) => void;
}) {
  const id = useId();
  const selection = useRef(0);
  const [fileName, setFileName] = useState("");
  const [hash, setHash] = useState<Hex | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    const current = ++selection.current;
    setError("");
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const next = keccak256(bytes);
      if (current !== selection.current) return;
      setFileName(file.name);
      setHash(next);
      onHash(next, file.name);
    } catch {
      if (current === selection.current)
        setError("We couldn’t read this photo. Please choose it again.");
    } finally {
      if (current === selection.current) setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void onFile(event.target.files?.[0])}
        aria-describedby={`${id}-help`}
      />
      <div aria-live="polite">
        {busy && <p className="small muted">Creating the photo fingerprint…</p>}
        {hash && (
          <p className="hash" style={{ marginTop: 12 }}>
            {fileName}: {hash}
          </p>
        )}
        {error && (
          <p className="notice warn" role="alert">
            {error}
          </p>
        )}
      </div>
      <p id={`${id}-help`} className="field-help">
        Your photo stays on this device. Only its digital fingerprint is recorded. Keep the original
        file: a fingerprint doesn’t prove the photo is authentic or unedited.
      </p>
    </div>
  );
}
