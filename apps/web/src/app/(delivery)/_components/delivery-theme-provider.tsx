"use client";

import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  deliveryThemeVars,
  parseDeliveryThemeId,
  type DeliveryThemeId,
} from "./delivery-theme";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type DeliveryThemeContextValue = {
  themeId: DeliveryThemeId;
  setThemeId: (id: DeliveryThemeId) => void;
};

const DeliveryThemeContext = createContext<DeliveryThemeContextValue | null>(
  null,
);

export function useDeliveryTheme() {
  const ctx = use(DeliveryThemeContext);
  return ctx ?? { themeId: "organic" as DeliveryThemeId, setThemeId: () => {} };
}

export function DeliveryThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  /** Optional theme from a child page (e.g. menu payload). */
  initialTheme?: DeliveryThemeId | string | null;
}) {
  const [themeId, setThemeId] = useState<DeliveryThemeId>(() =>
    parseDeliveryThemeId(initialTheme),
  );

  useEffect(() => {
    if (initialTheme) setThemeId(parseDeliveryThemeId(initialTheme));
  }, [initialTheme]);

  // Resolve theme from host when no page-level theme yet (cart, pedido, etc.).
  useEffect(() => {
    if (initialTheme) return;
    const host = window.location.host;
    if (!host) return;
    let cancelled = false;
    void fetch(
      `${API_URL.replace(/\/$/, "")}/api/public/resolve-host?host=${encodeURIComponent(host)}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success) return;
        setThemeId(parseDeliveryThemeId(json.data?.menuTheme));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialTheme]);

  const style = useMemo(
    () => deliveryThemeVars[themeId] as CSSProperties,
    [themeId],
  );

  const value = useMemo(
    () => ({ themeId, setThemeId }),
    [themeId],
  );

  return (
    <DeliveryThemeContext value={value}>
      <div
        data-delivery-theme={themeId}
        className="min-h-[100dvh] bg-[var(--d-bg)] text-[var(--d-text)]"
        style={style}
      >
        {children}
      </div>
    </DeliveryThemeContext>
  );
}
