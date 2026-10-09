"use client";

import { useEffect, useState } from "react";

export function Countdown({ expires }: { expires: bigint }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Number(expires) - now;
  if (left <= 0) return <span>Rental period ended</span>;
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  return (
    <span>
      {hours}h {minutes}m {seconds}s
    </span>
  );
}
