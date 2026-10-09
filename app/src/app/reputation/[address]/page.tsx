"use client";

import { useParams } from "next/navigation";
import { ReputationView } from "@/components/reputation-view";

export default function ReputationAddressPage() {
  const params = useParams<{ address: string }>();
  return <ReputationView initial={params.address} />;
}
