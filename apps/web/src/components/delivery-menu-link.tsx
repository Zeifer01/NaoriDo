"use client";

import { Button, buttonVariants } from "@restai/ui/components/button";
import { cn } from "@restai/ui";
import { Input } from "@restai/ui/components/input";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export function getDeliveryMenuUrl(branchSlug: string): string {
  return `${APP_URL.replace(/\/$/, "")}/delivery/${branchSlug}/menu`;
}

export function DeliveryMenuLink({
  branchSlug,
  className,
}: {
  branchSlug?: string | null;
  className?: string;
}) {
  if (!branchSlug) return null;

  const url = getDeliveryMenuUrl(branchSlug);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  return (
    <div className={className}>
      <p className="text-sm font-medium mb-1">Cardápio online (delivery)</p>
      <p className="text-xs text-muted-foreground mb-3">
        Compartilhe este link para clientes fazerem pedidos de entrega.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
        <div className="flex gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4 mr-1" />
            Copiar
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Abrir
          </a>
        </div>
      </div>
    </div>
  );
}
