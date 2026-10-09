"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ payload }: { payload: string }) {
  const [src, setSrc] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setFailed(false);
    void QRCode.toDataURL(payload, { margin: 1, width: 280 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (failed)
    return (
      <p className="small muted">
        The QR code is unavailable. Copy the exchange data below instead.
      </p>
    );
  if (!src) return <p className="small muted">Preparing exchange code…</p>;
  return <img className="qr" alt="Rental exchange code" src={src} />;
}
