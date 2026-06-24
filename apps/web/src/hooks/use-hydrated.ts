"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` only after the component has mounted on the client.
 *
 * Use this to gate the render of values that come from client-only state
 * (e.g. zustand stores initialized from `sessionStorage`/`localStorage`),
 * avoiding hydration mismatches between the SSR HTML and the first client render.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
