"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { Banknote, CreditCard, Smartphone } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

function getMethodTotal(summary: any, method: string): number {
  if (!summary?.byMethod) return 0;
  const found = summary.byMethod.find((m: any) => m.method === method);
  return found?.total || 0;
}

interface PaymentSummaryProps {
  summary: any;
}

export function PaymentSummary({ summary }: PaymentSummaryProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Recebido</p>
          <p className="text-xl font-bold">{formatCurrency(summary?.grandTotal || 0)}</p>
          <p className="text-xs text-muted-foreground">{summary?.totalCount || 0} pagamentos hoje</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Banknote className="h-3 w-3" /> Dinheiro
          </div>
          <p className="text-lg font-bold">{formatCurrency(getMethodTotal(summary, "cash"))}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CreditCard className="h-3 w-3" /> Cartão
          </div>
          <p className="text-lg font-bold">{formatCurrency(getMethodTotal(summary, "card"))}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Smartphone className="h-3 w-3" /> PIX
          </div>
          <p className="text-lg font-bold">
            {formatCurrency(getMethodTotal(summary, "pix"))}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Gorjetas</p>
          <p className="text-lg font-bold">{formatCurrency(summary?.tipTotal || 0)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
