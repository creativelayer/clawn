"use client";

import { CLAWN_ADDRESS, CLAWN_CAIP19, ENTRY_FEE_WEI } from "./constants";

// SDK instance singleton
let sdkInstance: any = null;
let sdkReady = false;

export interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  custody?: string;
}

export interface FarcasterContext {
  user: FarcasterUser | null;
  isInFrame: boolean;
}

/**
 * Get the Farcaster SDK instance (lazy load)
 */
export async function getSDK() {
  if (typeof window === "undefined") return null;
  if (sdkInstance) return sdkInstance;

  try {
    const mod = await import("@farcaster/miniapp-sdk");
    sdkInstance = mod.sdk;
    return sdkInstance;
  } catch {
    console.warn("Farcaster SDK not available");
    return null;
  }
}

/**
 * Initialize SDK and signal ready state
 * MUST be called or app shows infinite loading in Warpcast
 */
export async function initSDK(): Promise<FarcasterContext | null> {
  const sdk = await getSDK();
  if (!sdk) return null;

  try {
    // Signal ready to the client
    if (!sdkReady) {
      await sdk.actions.ready();
      sdkReady = true;
    }

    // Get context (user info, client info)
    const context = await sdk.context;
    
    const user: FarcasterUser | null = context?.user ? {
      fid: context.user.fid,
      username: context.user.username,
      displayName: context.user.displayName,
      pfpUrl: context.user.pfpUrl,
    } : null;

    return {
      user,
      isInFrame: true,
    };
  } catch (e) {
    console.warn("SDK init failed:", e);
    return null;
  }
}

/**
 * Sign In With Farcaster
 * Returns auth credential or null if cancelled/failed
 */
export async function signIn(): Promise<{
  fid: number;
  username?: string;
  message: string;
  signature: string;
} | null> {
  const sdk = await getSDK();
  if (!sdk) return null;

  try {
    const nonce = crypto.randomUUID();
    const result = await sdk.actions.signIn({ nonce });
    return result;
  } catch (e) {
    console.error("Sign in failed:", e);
    return null;
  }
}

/**
 * Open swap UI to buy $CLAWN
 */
export async function swapToken(): Promise<boolean> {
  const sdk = await getSDK();
  if (!sdk) {
    // Fallback: open DEX in new tab
    window.open(`https://app.uniswap.org/swap?chain=base&outputCurrency=${CLAWN_ADDRESS}`, "_blank");
    return false;
  }

  try {
    await sdk.actions.swapToken({
      token: CLAWN_CAIP19,
    });
    return true;
  } catch (e) {
    console.error("Swap failed:", e);
    return false;
  }
}

/**
 * View $CLAWN token info
 */
export async function viewToken(): Promise<boolean> {
  const sdk = await getSDK();
  if (!sdk) {
    window.open(`https://dexscreener.com/base/${CLAWN_ADDRESS}`, "_blank");
    return false;
  }

  try {
    await sdk.actions.viewToken({
      token: CLAWN_CAIP19,
    });
    return true;
  } catch (e) {
    console.error("View token failed:", e);
    return false;
  }
}

/**
 * Send $CLAWN (for entry fees)
 * Returns tx hash or null if cancelled/failed
 */
export async function sendEntryFee(toAddress: string): Promise<string | null> {
  const sdk = await getSDK();
  if (!sdk) {
    console.error("SDK not available for sendToken");
    return null;
  }

  try {
    const result = await sdk.actions.sendToken({
      token: CLAWN_CAIP19,
      amount: ENTRY_FEE_WEI.toString(),
      recipientAddress: toAddress,
    });
    return result?.transactionHash || null;
  } catch (e) {
    console.error("Send token failed:", e);
    return null;
  }
}

/**
 * Compose a cast (share roast)
 */
export async function composeCast(text: string, embedUrl?: string): Promise<boolean> {
  const sdk = await getSDK();
  if (!sdk) {
    // Fallback: open Warpcast compose
    const encoded = encodeURIComponent(text);
    window.open(`https://warpcast.com/~/compose?text=${encoded}`, "_blank");
    return false;
  }

  try {
    await sdk.actions.composeCast({
      text,
      embeds: embedUrl ? [{ url: embedUrl }] : undefined,
    });
    return true;
  } catch (e) {
    console.error("Compose cast failed:", e);
    return false;
  }
}

/**
 * Prompt user to add mini app to their favorites
 */
export async function addMiniApp(): Promise<boolean> {
  const sdk = await getSDK();
  if (!sdk) return false;

  try {
    await sdk.actions.addMiniApp();
    return true;
  } catch (e) {
    console.error("Add mini app failed:", e);
    return false;
  }
}

/**
 * Get the EIP-1193 wallet provider for on-chain reads
 */
export async function getWalletProvider(): Promise<any | null> {
  const sdk = await getSDK();
  if (!sdk) return null;

  try {
    return await sdk.wallet.getEthereumProvider();
  } catch (e) {
    console.error("Get wallet provider failed:", e);
    return null;
  }
}

/**
 * Get connected wallet address
 */
export async function getWalletAddress(): Promise<string | null> {
  const provider = await getWalletProvider();
  if (!provider) return null;

  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    return accounts?.[0] || null;
  } catch (e) {
    console.error("Get wallet address failed:", e);
    return null;
  }
}

/**
 * Get $CLAWN balance for an address
 */
export async function getClawnBalance(address: string): Promise<bigint> {
  const provider = await getWalletProvider();
  if (!provider) return 0n;

  try {
    // ERC20 balanceOf call
    const data = `0x70a08231000000000000000000000000${address.slice(2).toLowerCase()}`;
    const result = await provider.request({
      method: "eth_call",
      params: [{ to: CLAWN_ADDRESS, data }, "latest"],
    });
    return BigInt(result || "0");
  } catch (e) {
    console.error("Get balance failed:", e);
    return 0n;
  }
}

/**
 * Format $CLAWN amount for display (18 decimals)
 */
export function formatClawn(amount: bigint): string {
  const whole = amount / 10n ** 18n;
  if (whole >= 1_000_000n) {
    return `${(Number(whole) / 1_000_000).toFixed(1)}M`;
  }
  if (whole >= 1_000n) {
    return `${(Number(whole) / 1_000).toFixed(1)}K`;
  }
  return whole.toString();
}
