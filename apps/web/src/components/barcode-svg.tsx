"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function BarcodeSvg({
  value,
  height = 48,
  displayValue = true,
  className,
}: {
  value: string;
  height?: number;
  displayValue?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        width: 1.6,
        height,
        displayValue,
        fontSize: 12,
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // Invalid value for Code128 — leave SVG empty
    }
  }, [value, height, displayValue]);

  if (!value) return null;
  return <svg ref={ref} className={className} />;
}
