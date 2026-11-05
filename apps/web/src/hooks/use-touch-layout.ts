"use client";

import { useEffect, useState } from "react";

/** Touch devices (any size) and narrow windows: tablets and phones. */
const TOUCH_OR_NARROW = "(pointer: coarse), (max-width: 1023px)";

/**
 * True on tablets/phones when `enabled`. Starts false (matches the server render),
 * then follows the media query, so desktop/mouse users never see the touch layout.
 */
export function useTouchLayout(enabled: boolean): boolean {
  const [match, setMatch] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setMatch(false);
      return;
    }
    const mql = window.matchMedia(TOUCH_OR_NARROW);
    const update = () => setMatch(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [enabled]);

  return enabled && match;
}
