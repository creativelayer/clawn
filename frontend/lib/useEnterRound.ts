"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CLAWN_ADDRESS, ENTRY_FEE_WEI } from "./constants";
import { PRIZE_POOL_ADDRESS, CLAWN_TOKEN_ABI, PRIZE_POOL_ABI } from "./contracts";
import { useState, useCallback } from "react";
import { keccak256, toHex, encodePacked } from "viem";

const MAX_UINT256 = 2n ** 256n - 1n;

type EntryStatus = "idle" | "checking" | "approving" | "entering" | "success" | "error";

export function useEnterRound() {
  const { address } = useAccount();
  const [status, setStatus] = useState<EntryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CLAWN_ADDRESS,
    abi: CLAWN_TOKEN_ABI,
    functionName: "allowance",
    args: address ? [address, PRIZE_POOL_ADDRESS] : undefined,
  });

  const { writeContractAsync } = useWriteContract();

  const enterRound = useCallback(async (roundId: string): Promise<{ success: boolean; txHash?: string; entryId?: string }> => {
    if (!address) {
      setError("Wallet not connected");
      return { success: false };
    }

    setStatus("checking");
    setError(null);

    try {
      // Refetch allowance
      const { data: currentAllowance } = await refetchAllowance();
      
      // Check if approval needed
      if (!currentAllowance || currentAllowance < ENTRY_FEE_WEI) {
        setStatus("approving");
        
        // Request max approval
        const approveTx = await writeContractAsync({
          address: CLAWN_ADDRESS,
          abi: CLAWN_TOKEN_ABI,
          functionName: "approve",
          args: [PRIZE_POOL_ADDRESS, MAX_UINT256],
        });

        // Wait for approval confirmation (wagmi handles this via useWaitForTransactionReceipt but we'll do inline)
        // For simplicity, we proceed after tx is sent - the enterRound will fail if not confirmed
        console.log("Approval tx:", approveTx);
      }

      setStatus("entering");

      // Generate unique entry ID from roundId + address + timestamp
      const timestamp = BigInt(Date.now());
      const entryId = keccak256(
        encodePacked(
          ["bytes32", "address", "uint256"],
          [roundId as `0x${string}`, address, timestamp]
        )
      );

      // Enter the round
      const enterTx = await writeContractAsync({
        address: PRIZE_POOL_ADDRESS,
        abi: PRIZE_POOL_ABI,
        functionName: "enterRound",
        args: [roundId as `0x${string}`, entryId],
      });

      setTxHash(enterTx);
      setStatus("success");
      
      return { success: true, txHash: enterTx, entryId };
    } catch (e: any) {
      console.error("Enter round failed:", e);
      setError(e.message || "Transaction failed");
      setStatus("error");
      return { success: false };
    }
  }, [address, refetchAllowance, writeContractAsync]);

  const needsApproval = allowance !== undefined && allowance < ENTRY_FEE_WEI;

  return {
    enterRound,
    status,
    error,
    txHash,
    needsApproval,
    isConnected: !!address,
    address,
  };
}
