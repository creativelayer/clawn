"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import RoastInput from "@/components/RoastInput";
import BuyClawnButton from "@/components/BuyClawnButton";
import { useFarcaster } from "@/components/FarcasterProvider";
import { useEnterRound } from "@/lib/useEnterRound";
import { submitRoast, getActiveRound, Round } from "@/lib/api";
import { ENTRY_FEE, ENTRY_FEE_WEI } from "@/lib/constants";
import { keccak256, toHex } from "viem";

export default function SubmitPage() {
  const router = useRouter();
  const { user, clawnBalance, clawnBalanceFormatted, signIn, isLoading, refreshBalance } = useFarcaster();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { enterRound, status: entryStatus, error: entryError, needsApproval } = useEnterRound();
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [round, setRound] = useState<Round | null>(null);

  const hasEnoughBalance = clawnBalance >= ENTRY_FEE_WEI;

  // Fetch active round
  useEffect(() => {
    getActiveRound().then(setRound);
  }, []);

  // Connect wallet if not connected
  useEffect(() => {
    if (user && !isConnected) {
      connect({ connector: injected() });
    }
  }, [user, isConnected, connect]);

  async function handleSubmit(text: string) {
    setError(null);

    // Check auth
    if (!user) {
      setError("Please sign in with Farcaster first");
      return;
    }

    // Check wallet
    if (!isConnected || !address) {
      setError("Wallet not connected. Please try again.");
      connect({ connector: injected() });
      return;
    }

    // Check round
    if (!round) {
      setError("No active round. Try again later!");
      return;
    }

    // Check balance
    if (!hasEnoughBalance) {
      setError("Not enough $CLAWN. Buy some first!");
      return;
    }

    setSubmitting(true);
    try {
      // Convert UUID to bytes32 for contract
      const roundIdBytes32 = keccak256(toHex(round.id));
      
      // 1. Enter round on-chain (handles approval + entry)
      const result = await enterRound(roundIdBytes32);
      
      if (!result.success) {
        setError(entryError || "Transaction failed or cancelled");
        setSubmitting(false);
        return;
      }

      // 2. Submit roast to backend with tx hash
      const apiResult = await submitRoast(round.id, text, user.fid, result.txHash || "on-chain", {
        username: user.username,
        displayName: user.displayName,
        pfpUrl: user.pfpUrl,
        walletAddress: address,
        entryId: result.entryId,
      });

      // Check for API error
      if ("error" in apiResult) {
        setError(apiResult.error);
        setSubmitting(false);
        return;
      }

      // 3. Refresh balance
      await refreshBalance();

      // 4. Show success
      setSuccess(true);
      setTimeout(() => router.push("/"), 2000);
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Try again?");
    } finally {
      setSubmitting(false);
    }
  }

  // Get button text based on state
  function getButtonText(): string {
    if (submitting) {
      if (entryStatus === "approving") return "Approving $CLAWN...";
      if (entryStatus === "entering") return "Entering round...";
      return "Processing...";
    }
    if (needsApproval) return `Approve & Submit (${ENTRY_FEE.toLocaleString()} CLAWN)`;
    return `Submit Roast (${ENTRY_FEE.toLocaleString()} CLAWN)`;
  }

  // Success state
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <span className="text-6xl">🎪</span>
        <h2 className="text-2xl font-bold glow-yellow text-clown-yellow">Roast Submitted!</h2>
        <p className="text-white/50 text-sm">May the funniest clown win...</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <span className="text-4xl animate-bounce">🤡</span>
        <p className="text-white/50 text-sm mt-4">Loading...</p>
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <span className="text-6xl">🎭</span>
        <h2 className="text-xl font-bold text-center">Sign in to enter the ring</h2>
        <p className="text-white/50 text-sm text-center">
          You need a Farcaster account to submit roasts
        </p>
        <button
          onClick={signIn}
          className="btn-primary text-lg"
        >
          🔐 Sign In with Farcaster
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      <h1 className="text-2xl font-bold text-center glow-pink text-clown-pink">🎤 Drop Your Roast</h1>
      
      <p className="text-center text-sm text-white/50">
        Today&apos;s theme: <span className="text-clown-yellow">{round?.theme || "Roast your own portfolio 🤡"}</span>
      </p>

      {/* Balance display */}
      <div className="card text-center py-3">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Your Balance</p>
        <p className={`text-lg font-bold ${hasEnoughBalance ? "text-clown-yellow" : "text-red-400"}`}>
          {clawnBalanceFormatted} $CLAWN
        </p>
        {!hasEnoughBalance && (
          <div className="mt-3">
            <BuyClawnButton variant="secondary" />
          </div>
        )}
      </div>

      {/* Approval notice */}
      {needsApproval && hasEnoughBalance && (
        <div className="bg-clown-purple/20 border border-clown-purple/50 rounded-lg p-3 text-center">
          <p className="text-clown-purple text-sm">
            ℹ️ First time? You&apos;ll need to approve $CLAWN spending.
          </p>
        </div>
      )}

      {/* Roast input */}
      <RoastInput 
        onSubmit={handleSubmit} 
        disabled={submitting || !hasEnoughBalance}
        buttonText={getButtonText()}
      />

      {/* Error message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Fee info */}
      <p className="text-center text-xs text-white/30">
        Entry fee: {ENTRY_FEE.toLocaleString()} $CLAWN · Paid directly to prize pool contract
      </p>

      {/* Signed in as */}
      <p className="text-center text-xs text-white/30">
        Signed in as <span className="text-clown-pink">@{user.username || `fid:${user.fid}`}</span>
        {address && <span className="text-white/20"> · {address.slice(0, 6)}...{address.slice(-4)}</span>}
      </p>
    </div>
  );
}
