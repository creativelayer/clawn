"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Calls sdk.actions.ready() using useLayoutEffect which fires
 * synchronously after DOM mutations but before browser paint.
 * This is earlier than useEffect.
 */
export function FarcasterInit() {
  const called = useRef(false);

  // useLayoutEffect fires synchronously after DOM mutation
  useLayoutEffect(() => {
    if (called.current) return;
    called.current = true;

    // Import and call ready immediately
    import("@farcaster/miniapp-sdk").then(({ sdk }) => {
      sdk.actions.ready().then(() => {
        console.log("[FarcasterInit] ✅ ready() success");
      }).catch((e: unknown) => {
        console.log("[FarcasterInit] ready() error:", e);
      });
    }).catch((e: unknown) => {
      console.log("[FarcasterInit] SDK import failed (not in frame?):", e);
    });
  }, []);

  return null;
}
