"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { ScanBarcode } from "lucide-react";
import { apiFetch } from "@/lib/fetcher";
import { toast } from "sonner";
import { normalizeBarcodeInput } from "@/lib/barcode";

/**
 * Keyboard-wedge barcode scanner (Atom USB HID).
 * The gun types the code + Enter into this focused field.
 */
export function PosBarcodeScanInput({
  onItemFound,
  disabled,
}: {
  onItemFound: (item: any) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (disabled) return;
    const maybeFocus = () => {
      const active = document.activeElement as HTMLElement | null;
      if (
        !active ||
        active === document.body ||
        active.getAttribute("data-barcode-scan") === "true"
      ) {
        inputRef.current?.focus();
      }
    };
    maybeFocus();
    const id = window.setInterval(maybeFocus, 2500);
    return () => window.clearInterval(id);
  }, [disabled]);

  const lookup = async (raw: string) => {
    const code = normalizeBarcodeInput(raw);
    if (!code || busy) return;
    setBusy(true);
    try {
      const item = await apiFetch(
        `/api/menu/items/by-barcode?code=${encodeURIComponent(code)}`,
      );
      onItemFound(item);
      toast.success(item.name || "Item adicionado");
    } catch (err: any) {
      toast.error(err?.message || "Código não encontrado");
    } finally {
      setValue("");
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="relative">
      <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        data-barcode-scan="true"
        value={value}
        disabled={disabled || busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void lookup(value);
          }
        }}
        placeholder="Bipe o código de barras…"
        className="pl-9 font-mono"
        autoComplete="off"
        inputMode="none"
      />
    </div>
  );
}
