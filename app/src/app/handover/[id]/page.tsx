"use client";

import { useParams } from "next/navigation";
import { Exchange } from "@/components/exchange";

export default function HandoverPage() {
  const params = useParams<{ id: string }>();
  if (!/^\d+$/.test(params.id)) return <p className="notice warn">Nomor sewa tidak valid.</p>;
  return <Exchange mode="handover" rentalId={BigInt(params.id)} />;
}
