import { create } from "zustand";

export type Fulfillment = "delivery" | "pickup";

interface DeliveryState {
  branchSlug: string | null;
  branchName: string | null;
  orgName: string | null;
  logoUrl: string | null;
  currency: string;
  taxRate: number;
  deliveryFee: number;
  customerPhone: string | null;
  lastOrderId: string | null;
  fulfillment: Fulfillment;
  setBranch: (data: {
    branchSlug: string;
    branchName: string;
    orgName?: string | null;
    logoUrl?: string | null;
    taxRate: number;
    currency?: string;
    deliveryFee?: number;
  }) => void;
  setFulfillment: (fulfillment: Fulfillment) => void;
  setCheckout: (phone: string, orderId: string) => void;
  clear: () => void;
}

const isBrowser = typeof window !== "undefined";

function getItem(key: string): string | null {
  return isBrowser ? sessionStorage.getItem(key) : null;
}

function readFulfillment(): Fulfillment {
  const v = getItem("delivery_fulfillment");
  return v === "pickup" ? "pickup" : "delivery";
}

export const useDeliveryStore = create<DeliveryState>((set) => ({
  branchSlug: getItem("delivery_branch_slug"),
  branchName: getItem("delivery_branch_name"),
  orgName: getItem("delivery_org_name"),
  logoUrl: getItem("delivery_logo_url"),
  currency: getItem("delivery_currency") || "BRL",
  taxRate: Number(getItem("delivery_tax_rate") || "1800"),
  deliveryFee: Number(getItem("delivery_fee") || "1200"),
  customerPhone: getItem("delivery_customer_phone"),
  lastOrderId: getItem("delivery_last_order_id"),
  fulfillment: readFulfillment(),
  setBranch: ({
    branchSlug,
    branchName,
    orgName,
    logoUrl,
    taxRate,
    currency = "BRL",
    deliveryFee = 1200,
  }) => {
    set({
      branchSlug,
      branchName,
      orgName: orgName ?? branchName,
      logoUrl: logoUrl ?? null,
      taxRate,
      currency,
      deliveryFee,
    });
    if (isBrowser) {
      sessionStorage.setItem("delivery_branch_slug", branchSlug);
      sessionStorage.setItem("delivery_branch_name", branchName);
      sessionStorage.setItem("delivery_org_name", orgName ?? branchName);
      if (logoUrl) sessionStorage.setItem("delivery_logo_url", logoUrl);
      else sessionStorage.removeItem("delivery_logo_url");
      sessionStorage.setItem("delivery_tax_rate", String(taxRate));
      sessionStorage.setItem("delivery_currency", currency);
      sessionStorage.setItem("delivery_fee", String(deliveryFee));
    }
  },
  setFulfillment: (fulfillment) => {
    set({ fulfillment });
    if (isBrowser) {
      sessionStorage.setItem("delivery_fulfillment", fulfillment);
    }
  },
  setCheckout: (phone, orderId) => {
    set({ customerPhone: phone, lastOrderId: orderId });
    if (isBrowser) {
      sessionStorage.setItem("delivery_customer_phone", phone);
      sessionStorage.setItem("delivery_last_order_id", orderId);
    }
  },
  clear: () => {
    set({
      branchSlug: null,
      branchName: null,
      orgName: null,
      logoUrl: null,
      currency: "BRL",
      taxRate: 1800,
      deliveryFee: 1200,
      customerPhone: null,
      lastOrderId: null,
      fulfillment: "delivery",
    });
    if (isBrowser) {
      sessionStorage.removeItem("delivery_branch_slug");
      sessionStorage.removeItem("delivery_branch_name");
      sessionStorage.removeItem("delivery_org_name");
      sessionStorage.removeItem("delivery_logo_url");
      sessionStorage.removeItem("delivery_tax_rate");
      sessionStorage.removeItem("delivery_currency");
      sessionStorage.removeItem("delivery_fee");
      sessionStorage.removeItem("delivery_customer_phone");
      sessionStorage.removeItem("delivery_last_order_id");
      sessionStorage.removeItem("delivery_fulfillment");
    }
  },
}));
