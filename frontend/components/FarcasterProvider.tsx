"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { CLAWN_ADDRESS, CHAIN_ID } from "@/lib/constants";

// Public RPC for reading chain data (Farcaster provider doesn't support eth_call)
const BASE_RPC = "https://base-mainnet.g.alchemy.com/v2/UIq6IAtiFSotBU8rupy2z";

async function fetchClawnBalance(address: string): Promise<bigint> {
  try {
    const data = `0x70a08231000000000000000000000000${address.slice(2).toLowerCase()}`;
    const response = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: CLAWN_ADDRESS, data }, "latest"],
      }),
    });
    const result = await response.json();
    return BigInt(result.result || "0");
  } catch (e) {
    console.error("Failed to fetch CLAWN balance:", e);
    return 0n;
  }
}

export interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

interface FarcasterState {
  user: FarcasterUser | null;
  isInFrame: boolean;
  isLoading: boolean;
  walletAddress: string | null;
  clawnBalance: bigint;
  clawnBalanceFormatted: string;
  signIn: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const FarcasterContext = createContext<FarcasterState>({
  user: null,
  isInFrame: false,
  isLoading: true,
  walletAddress: null,
  clawnBalance: 0n,
  clawnBalanceFormatted: "0",
  signIn: async () => {},
  refreshBalance: async () => {},
});

export function useFarcaster() {
  return useContext(FarcasterContext);
}

function formatClawn(amount: bigint): string {
  const whole = amount / 10n ** 18n;
  if (whole >= 1_000_000n) return `${(Number(whole) / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000n) return `${(Number(whole) / 1_000).toFixed(1)}K`;
  return whole.toString();
}

export function FarcasterProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [isInFrame, setIsInFrame] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [clawnBalance, setClawnBalance] = useState<bigint>(0n);

  // Call ready() immediately on mount - matching official Farcaster template pattern
  useEffect(() => {
    // Call ready first - this is critical!
    sdk.actions.ready();
    
    // Then load context
    async function loadContext() {
      try {
        const context = await sdk.context;
        if (context?.user) {
          setUser({
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
            pfpUrl: context.user.pfpUrl,
          });
          setIsInFrame(true);
        }

        // Try to get wallet address
        try {
          const provider = await sdk.wallet.getEthereumProvider();
          if (provider) {
            // First try eth_accounts, if empty try eth_requestAccounts
            let accounts = await provider.request({ method: "eth_accounts" }) as string[];
            if (!accounts || accounts.length === 0) {
              accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
            }
            const addr = accounts?.[0] || null;
            console.log("[Farcaster] Wallet address:", addr);
            setWalletAddress(addr);
            
            // Fetch CLAWN balance via public RPC (Farcaster provider doesn't support eth_call)
            if (addr) {
              const balance = await fetchClawnBalance(addr);
              console.log("[Farcaster] CLAWN balance:", balance.toString());
              setClawnBalance(balance);
            }
          }
        } catch (e) {
          console.log("Wallet not available:", e);
        }
      } catch (e) {
        console.log("Not in Farcaster frame:", e);
      } finally {
        setIsLoading(false);
      }
    }

    loadContext();
  }, []);

  const signIn = useCallback(async () => {
    try {
      const nonce = crypto.randomUUID();
      await sdk.actions.signIn({ nonce });
      // After sign in, refresh context to get user info
      const context = await sdk.context;
      if (context?.user) {
        setUser({
          fid: context.user.fid,
          username: context.user.username,
          displayName: context.user.displayName,
          pfpUrl: context.user.pfpUrl,
        });
        setIsInFrame(true);
      }
    } catch (e) {
      console.error("Sign in failed:", e);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const balance = await fetchClawnBalance(walletAddress);
      console.log("[Farcaster] Balance refreshed:", balance.toString());
      setClawnBalance(balance);
    } catch (e) {
      console.error("Balance refresh failed:", e);
    }
  }, [walletAddress]);

  return (
    <FarcasterContext.Provider
      value={{
        user,
        isInFrame,
        isLoading,
        walletAddress,
        clawnBalance,
        clawnBalanceFormatted: formatClawn(clawnBalance),
        signIn,
        refreshBalance,
      }}
    >
      {children}
    </FarcasterContext.Provider>
  );
}
