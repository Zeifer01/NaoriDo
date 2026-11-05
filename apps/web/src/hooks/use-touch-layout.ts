"use client";

import { useEffect, useState } from "react";

export type PosLayoutMode = "sidebar" | "panel" | "sheet";

/** Touch devices (any size) and narrow windows: tablets and phones. */
const TOUCH_OR_NARROW = "(pointer: coarse), (max-width: 1023px)";
/** Wide touch screens (tablet held sideways): room for products + a fixed panel. */
const WIDE_TOUCH = "(pointer: coarse) and (min-width: 1024px)";

/**
 * Which PDV layout to use when the `pos_quick_checkout` flag is on:
 * - "panel": tablet held sideways → products on the left, fixed Cliente/Pedido panel on the right.
 * - "sheet": tablet upright or phone → bottom bar + "Finalizar pedido" screen.
 * - "sidebar": desktop/mouse (and every org without the flag) → the classic side column.
 * Starts as "sidebar" (matches the server render), then follows the media queries.
 */
export function useTouchLayout(enabled: boolean): PosLayoutMode {
  const [mode, setMode] = useState<PosLayoutMode>("sidebar");

  useEffect(() => {
    if (!enabled) {
      setMode("sidebar");
      return;
    }
    const wide = window.matchMedia(WIDE_TOUCH);
    const touchOrNarrow = window.matchMedia(TOUCH_OR_NARROW);
    const update = () =>
      setMode(wide.matches ? "panel" : touchOrNarrow.matches ? "sheet" : "sidebar");
    update();
    wide.addEventListener("change", update);
    touchOrNarrow.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      touchOrNarrow.removeEventListener("change", update);
    };
  }, [enabled]);

  return enabled ? mode : "sidebar";
}
