"use client";

import { useParams } from "next/navigation";
import { Exchange } from "@/components/exchange";

export default function ReturnPage() {
  const params = useParams<{ id: string }>();
  if (!/^\d+$/.test(params.id)) return <p className="notice warn">Nomor sewa tidak valid.</p>;
  return <Exchange mode="return" rentalId={BigInt(params.id)} />;
}
