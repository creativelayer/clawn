"use client";

import { useEffect, useRef } from "react";

/**
 * This component MUST be rendered early in the tree.
 * It calls sdk.actions.ready() which tells Farcaster to hide the splash screen.
 * Without this, the app will show an infinite loading state.
 */
export function FarcasterReady() {
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        await sdk.actions.ready();
        console.log("[FarcasterReady] ✅ ready() called");
      } catch (e) {
        // Not in a Farcaster frame - that's okay
        console.log("[FarcasterReady] Not in frame:", e);
      }
    })();
  }, []);

  return null;
}
