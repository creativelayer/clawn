"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import {
  FarcasterUser,
  getWalletAddress,
  getClawnBalance,
  formatClawn,
  signIn as fcSignIn,
} from "@/lib/farcaster";

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

export function FarcasterProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [isInFrame, setIsInFrame] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [clawnBalance, setClawnBalance] = useState<bigint>(0n);
  const readyCalled = useRef(false);

  // Call ready() IMMEDIATELY on mount - this is critical!
  useEffect(() => {
    if (readyCalled.current) return;
    readyCalled.current = true;

    async function init() {
      try {
        // Dynamic import the SDK
        const { sdk } = await import("@farcaster/miniapp-sdk");
        
        // Call ready FIRST - before anything else
        console.log("[Farcaster] Calling sdk.actions.ready()");
        await sdk.actions.ready();
        console.log("[Farcaster] Ready called successfully");

        // Now get context
        const context = await sdk.context;
        console.log("[Farcaster] Context:", context);

        if (context?.user) {
          setUser({
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
            pfpUrl: context.user.pfpUrl,
          });
        }
        
        setIsInFrame(true);

        // Get wallet address
        try {
          const provider = await sdk.wallet.getEthereumProvider();
          if (provider) {
            const accounts = await provider.request({ method: "eth_accounts" });
            const addr = accounts?.[0] || null;
            setWalletAddress(addr);

            if (addr) {
              const bal = await getClawnBalance(addr);
              setClawnBalance(bal);
            }
          }
        } catch (walletErr) {
          console.warn("[Farcaster] Wallet access failed:", walletErr);
        }
      } catch (e) {
        console.warn("[Farcaster] SDK init failed (not in frame?):", e);
        setIsInFrame(false);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  const signIn = useCallback(async () => {
    const result = await fcSignIn();
    if (result) {
      setUser({
        fid: result.fid,
        username: result.username,
      });

      // Refresh wallet info after sign in
      const addr = await getWalletAddress();
      setWalletAddress(addr);
      if (addr) {
        const bal = await getClawnBalance(addr);
        setClawnBalance(bal);
      }
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (walletAddress) {
      const bal = await getClawnBalance(walletAddress);
      setClawnBalance(bal);
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
