"use client";

import { useParams } from "next/navigation";
import { Exchange } from "@/components/exchange";

export default function HandoverPage() {
  const params = useParams<{ id: string }>();
  if (!/^\d+$/.test(params.id))
    return (
      <p className="notice warn">
        Invalid rental number. Return to My rentals and choose a rental.
      </p>
    );
  return <Exchange mode="handover" rentalId={BigInt(params.id)} />;
}
