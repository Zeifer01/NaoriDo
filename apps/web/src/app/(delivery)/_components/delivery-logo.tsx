"use client";

import { Leaf } from "lucide-react";
import { resolveUploadUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function DeliveryLogo({
  logoUrl,
  alt,
  size = "md",
  className,
}: {
  logoUrl?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const resolved = resolveUploadUrl(logoUrl);
  const sizeClass =
    size === "sm" ? "h-9 w-9 rounded-lg" : size === "lg" ? "h-16 w-16 rounded-2xl" : "h-11 w-11 rounded-xl";

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={alt}
        className={cn(
          "object-cover border border-[var(--d-border-soft)] bg-[var(--d-card)]",
          sizeClass,
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-[var(--d-bg-soft)] text-[var(--d-accent)]",
        sizeClass,
        className,
      )}
    >
      <Leaf className={size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5"} strokeWidth={1.5} />
    </div>
  );
}
