"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { cn } from "@/lib/utils";

const API_KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || "";

type Suggestion = {
  formatted: string;
};

type AutocompleteResult = {
  formatted?: string;
};

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  id,
  disabled,
  country,
  biasLat,
  biasLng,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected?: (formattedAddress: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  /** ISO country code(s) for filter, e.g. "us" */
  country?: string | string[];
  /** Prefer results near this point (store location) */
  biasLat?: number;
  biasLng?: number;
  className?: string;
  inputClassName?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(!API_KEY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!API_KEY) {
      setUnavailable(true);
      setSuggestions([]);
      return;
    }
    setUnavailable(false);

    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
      url.searchParams.set("text", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "6");
      url.searchParams.set("apiKey", API_KEY);

      if (country) {
        const codes = Array.isArray(country) ? country.join(",") : country;
        url.searchParams.set("filter", `countrycode:${codes.toLowerCase()}`);
      }

      if (
        typeof biasLat === "number" &&
        typeof biasLng === "number" &&
        Number.isFinite(biasLat) &&
        Number.isFinite(biasLng)
      ) {
        url.searchParams.set("bias", `proximity:${biasLng},${biasLat}`);
      }

      void fetch(url.toString(), { signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{ results?: AutocompleteResult[] }>;
        })
        .then((data) => {
          const next = (data.results || [])
            .map((r) => r.formatted?.trim())
            .filter((s): s is string => Boolean(s))
            .slice(0, 5)
            .map((formatted) => ({ formatted }));
          setSuggestions(next);
          setOpen(next.length > 0);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSuggestions([]);
          setOpen(false);
        });
    }, 280);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      abortRef.current?.abort();
    };
  }, [value, country, biasLat, biasLng]);

  const pick = (formatted: string) => {
    onChange(formatted);
    onPlaceSelected?.(formatted);
    setSuggestions([]);
    setOpen(false);
  };

  const shared = {
    id,
    value,
    disabled,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    onFocus: () => {
      if (suggestions.length > 0) setOpen(true);
    },
    autoComplete: "street-address" as const,
  };

  return (
    <div ref={wrapRef} className={cn("relative space-y-1", className)}>
      {inputClassName ? (
        <input {...shared} className={inputClassName} />
      ) : (
        <Input {...shared} />
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-background shadow-md">
          {suggestions.map((s) => (
            <li key={s.formatted}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.formatted)}
              >
                {s.formatted}
              </button>
            </li>
          ))}
        </ul>
      )}
      {unavailable ? (
        <p className="text-[11px] text-muted-foreground">
          Autocomplete indisponível — digite o endereço completo.
        </p>
      ) : null}
    </div>
  );
}
