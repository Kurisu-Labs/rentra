"use client";

import { useParams } from "next/navigation";
import { Exchange } from "@/components/exchange";

export default function ReturnPage() {
  const params = useParams<{ id: string }>();
  if (!/^\d+$/.test(params.id))
    return (
      <p className="notice warn">
        Invalid rental number. Return to My rentals and choose a rental.
      </p>
    );
  return <Exchange mode="return" rentalId={BigInt(params.id)} />;
}
