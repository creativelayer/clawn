"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import {
  FarcasterUser,
  initSDK,
  signIn as fcSignIn,
  getWalletAddress,
  getClawnBalance,
  formatClawn,
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

  // Initialize SDK on mount
  useEffect(() => {
    async function init() {
      try {
        const context = await initSDK();
        if (context) {
          setUser(context.user);
          setIsInFrame(context.isInFrame);

          // Get wallet address
          const addr = await getWalletAddress();
          setWalletAddress(addr);

          // Get balance if we have an address
          if (addr) {
            const bal = await getClawnBalance(addr);
            setClawnBalance(bal);
          }
        }
      } catch (e) {
        console.error("Farcaster init error:", e);
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
