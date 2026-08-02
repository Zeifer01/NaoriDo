"use client";

import { Button, buttonVariants } from "@restai/ui/components/button";
import { cn } from "@restai/ui";
import { Input } from "@restai/ui/components/input";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useBranches, useOrgDomains } from "@/hooks/use-settings";

function buildMenuUrl(
  storefrontOrigin: string,
  branchSlug: string,
  multiBranch: boolean,
): string {
  const origin = storefrontOrigin.replace(/\/$/, "");
  if (multiBranch) return `${origin}/${branchSlug}/pedir`;
  return `${origin}/pedir`;
}

export function getDeliveryMenuUrl(branchSlug: string, storefrontOrigin?: string | null): string {
  const fallback =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  const origin = (storefrontOrigin || fallback).replace(/\/$/, "");
  return `${origin}/pedir`;
}

export function DeliveryMenuLink({
  branchSlug,
  className,
}: {
  branchSlug?: string | null;
  className?: string;
}) {
  const { data: domains } = useOrgDomains();
  const { data: branches } = useBranches();
  if (!branchSlug) return null;

  const multiBranch = (branches?.length ?? 0) > 1;
  const menuOrigin = domains?.storefrontOrigin || domains?.primaryOrigin;
  const url = menuOrigin
    ? buildMenuUrl(menuOrigin, branchSlug, multiBranch)
    : getDeliveryMenuUrl(branchSlug, menuOrigin);

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
