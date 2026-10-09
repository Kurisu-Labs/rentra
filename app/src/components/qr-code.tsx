"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ payload }: { payload: string }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(payload, { margin: 1, width: 280 }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (!src) return <p className="small muted">Menyiapkan kode…</p>;
  return <img className="qr" alt="Kode serah terima" src={src} />;
}
