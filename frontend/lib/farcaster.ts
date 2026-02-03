"use client";

import { CLAWN_CAIP19 } from "./constants";

let sdkInstance: any = null;

export async function getSDK() {
  if (typeof window === "undefined") return null;
  if (sdkInstance) return sdkInstance;

  try {
    const mod = await import("@farcaster/miniapp-sdk");
    sdkInstance = mod.sdk;
    return sdkInstance;
  } catch {
    console.warn("Farcaster SDK not available (running outside frame?)");
    return null;
  }
}

export async function initSDK() {
  const sdk = await getSDK();
  if (!sdk) return null;

  try {
    await sdk.actions.ready();
    return sdk;
  } catch (e) {
    console.warn("SDK ready failed:", e);
    return null;
  }
}

export async function signIn() {
  const sdk = await getSDK();
  if (!sdk) return null;

  try {
    const result = await sdk.actions.signIn({
      nonce: crypto.randomUUID(),
    });
    return result;
  } catch (e) {
    console.error("Sign in failed:", e);
    return null;
  }
}

export async function swapToken() {
  const sdk = await getSDK();
  if (!sdk) return;

  try {
    await sdk.actions.swapToken({
      token: CLAWN_CAIP19,
    });
  } catch (e) {
    console.error("Swap failed:", e);
  }
}

export async function composeCast(text: string) {
  const sdk = await getSDK();
  if (!sdk) return;

  try {
    await sdk.actions.composeCast({
      text,
    });
  } catch (e) {
    console.error("Compose cast failed:", e);
  }
}
