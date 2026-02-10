"use client";

import { useState, useCallback } from "react";
import { createPublicClient, createWalletClient, custom, http, keccak256, encodePacked } from "viem";
import { base } from "viem/chains";
import { CLAWN_ADDRESS, ENTRY_FEE_WEI } from "./constants";
import { PRIZE_POOL_ADDRESS, CLAWN_TOKEN_ABI, PRIZE_POOL_ABI } from "./contracts";

const MAX_UINT256 = 2n ** 256n - 1n;

type EntryStatus = "idle" | "connecting" | "checking" | "approving" | "entering" | "success" | "error";

// Get Farcaster SDK
async function getFarcasterSDK() {
  if (typeof window === "undefined") return null;
  try {
    const mod = await import("@farcaster/miniapp-sdk");
    return mod.sdk;
  } catch {
    return null;
  }
}

export function useEnterRound() {
  const [status, setStatus] = useState<EntryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);

  const enterRound = useCallback(async (roundId: string): Promise<{ success: boolean; txHash?: string; entryId?: string }> => {
    setStatus("connecting");
    setError(null);

    try {
      // Get Farcaster SDK and wallet provider
      const sdk = await getFarcasterSDK();
      if (!sdk) {
        setError("Farcaster SDK not available");
        setStatus("error");
        return { success: false };
      }

      const provider = await sdk.wallet.getEthereumProvider();
      if (!provider) {
        setError("Wallet provider not available");
        setStatus("error");
        return { success: false };
      }
      
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      
      if (!accounts || accounts.length === 0) {
        setError("No wallet connected");
        setStatus("error");
        return { success: false };
      }

      const userAddress = accounts[0] as `0x${string}`;
      setAddress(userAddress);

      // Create viem clients
      const publicClient = createPublicClient({
        chain: base,
        transport: http("https://mainnet.base.org"),
      });

      const walletClient = createWalletClient({
        account: userAddress,
        chain: base,
        transport: custom(provider),
      });

      setStatus("checking");

      // Check allowance
      const allowance = await publicClient.readContract({
        address: CLAWN_ADDRESS,
        abi: CLAWN_TOKEN_ABI,
        functionName: "allowance",
        args: [userAddress, PRIZE_POOL_ADDRESS],
      });

      // Approve if needed
      if (allowance < ENTRY_FEE_WEI) {
        setStatus("approving");
        
        const approveTx = await walletClient.writeContract({
          address: CLAWN_ADDRESS,
          abi: CLAWN_TOKEN_ABI,
          functionName: "approve",
          args: [PRIZE_POOL_ADDRESS, MAX_UINT256],
        });

        // Wait for approval
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }

      setStatus("entering");

      // Generate entry ID
      const timestamp = BigInt(Date.now());
      const entryId = keccak256(
        encodePacked(
          ["bytes32", "address", "uint256"],
          [roundId as `0x${string}`, userAddress, timestamp]
        )
      );

      // Enter round
      const enterTx = await walletClient.writeContract({
        address: PRIZE_POOL_ADDRESS,
        abi: PRIZE_POOL_ABI,
        functionName: "enterRound",
        args: [roundId as `0x${string}`, entryId],
      });

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: enterTx });

      setTxHash(enterTx);
      setStatus("success");
      
      return { success: true, txHash: enterTx, entryId };
    } catch (e: any) {
      console.error("Enter round failed:", e);
      setError(e.shortMessage || e.message || "Transaction failed");
      setStatus("error");
      return { success: false };
    }
  }, []);

  return {
    enterRound,
    status,
    error,
    txHash,
    address,
  };
}
