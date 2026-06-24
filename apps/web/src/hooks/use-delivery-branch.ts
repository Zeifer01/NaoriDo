"use client";

import { useEffect } from "react";
import { useDeliveryStore } from "@/stores/delivery-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Carrega dados da filial (incl. logo) e sincroniza com o store. */
export function useDeliveryBranch(branchSlug: string | undefined) {
  const branchName = useDeliveryStore((s) => s.branchName);
  const orgName = useDeliveryStore((s) => s.orgName);
  const logoUrl = useDeliveryStore((s) => s.logoUrl);
  const currency = useDeliveryStore((s) => s.currency);
  const taxRate = useDeliveryStore((s) => s.taxRate);
  const deliveryFee = useDeliveryStore((s) => s.deliveryFee);
  const setBranch = useDeliveryStore((s) => s.setBranch);
  const storedSlug = useDeliveryStore((s) => s.branchSlug);

  useEffect(() => {
    if (!branchSlug) return;

    void fetch(`${API_URL}/api/delivery/${branchSlug}/menu`)
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) return;
        const b = result.data.branch;
        setBranch({
          branchSlug,
          branchName: b.name,
          orgName: b.org_name ?? b.name,
          logoUrl: b.logo_url ?? null,
          taxRate: b.tax_rate || 0,
          currency: b.currency || "BRL",
          deliveryFee: b.delivery_fee || 1200,
        });
      })
      .catch(() => {});
  }, [branchSlug, setBranch]);

  const displayName = orgName || branchName || "Cardápio";

  return {
    branchSlug: branchSlug || storedSlug,
    branchName,
    orgName,
    logoUrl,
    displayName,
    currency,
    taxRate,
    deliveryFee,
  };
}
