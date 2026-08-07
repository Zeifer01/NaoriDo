"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { Printer } from "lucide-react";
import { BarcodeSvg } from "@/components/barcode-svg";
import { useCurrencyStore } from "@/stores/currency-store";
import { CURRENCIES, type CurrencyCode } from "@restai/config";

function formatMoney(cents: number, currency: CurrencyCode) {
  const meta = CURRENCIES[currency] ?? CURRENCIES.BRL;
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function PrintLabelDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: { name: string; price: number; barcode: string | null } | null;
}) {
  const currency = useCurrencyStore((s) => s.currency) as CurrencyCode;
  const [weightG, setWeightG] = useState("500");

  if (!item?.barcode) return null;

  const weightLabel = `${weightG.trim() || "500"} g`;
  const priceLabel = formatMoney(item.price, currency);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md print:max-w-none print:border-0 print:shadow-none print:p-0">
        <DialogHeader className="print:hidden">
          <DialogTitle>Imprimir etiqueta</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 print:space-y-0">
          <div className="space-y-2 print:hidden">
            <Label htmlFor="label-weight">Peso (gramas)</Label>
            <Input
              id="label-weight"
              type="number"
              min="1"
              step="1"
              value={weightG}
              onChange={(e) => setWeightG(e.target.value)}
              placeholder="500"
            />
            <p className="text-xs text-muted-foreground">
              Digite o peso e imprima. A pistola Átomo lê o código do produto no Caixa;
              use a impressora GS-MTP265 no diálogo de impressão do Windows.
            </p>
          </div>

          <div
            id="barcode-label-print"
            className="rounded-md border bg-white p-4 text-center text-black print:border-0 print:rounded-none print:p-1"
          >
            <p className="text-sm font-semibold leading-tight">{item.name}</p>
            <p className="mt-1 text-xs">
              {weightLabel} · {priceLabel}
            </p>
            <div className="mt-2 flex justify-center">
              <BarcodeSvg value={item.barcode} height={56} />
            </div>
          </div>
        </div>

        <DialogFooter className="print:hidden">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>

      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #barcode-label-print,
          #barcode-label-print * {
            visibility: visible !important;
          }
          #barcode-label-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 50mm !important;
            padding: 2mm !important;
          }
          @page {
            size: 50mm 30mm;
            margin: 0;
          }
        }
      `}</style>
      </Dialog>
  );
}
