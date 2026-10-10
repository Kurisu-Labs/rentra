"use client";

import { useEffect, useState } from "react";
import { claimSecondsRemaining, formatCountdown } from "@/lib/claim-window";

export function Countdown({ expires }: { expires: bigint }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = claimSecondsRemaining(expires, now);
  if (left <= 0) return <span>Rental period ended</span>;
  return <span>{formatCountdown(left)}</span>;
}
