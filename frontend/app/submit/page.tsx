"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import RoastInput from "@/components/RoastInput";
import BuyClawnButton from "@/components/BuyClawnButton";
import { useFarcaster } from "@/components/FarcasterProvider";
import { useEnterRound } from "@/lib/useEnterRound";
import { reserveRoast, confirmRoast, getActiveRound, Round } from "@/lib/api";
import { ENTRY_FEE, ENTRY_FEE_WEI } from "@/lib/constants";
import { keccak256, toHex } from "viem";

export default function SubmitPage() {
  const router = useRouter();
  const { user, clawnBalance, clawnBalanceFormatted, signIn, isLoading, refreshBalance } = useFarcaster();
  const { enterRound, status: entryStatus, error: entryError, address } = useEnterRound();
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const hasEnoughBalance = clawnBalance >= ENTRY_FEE_WEI;

  // Fetch active round
  useEffect(() => {
    getActiveRound().then(setRound);
  }, []);

  async function handleSubmit(text: string) {
    setError(null);

    // Check auth
    if (!user) {
      setError("Please sign in with Farcaster first");
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
      // 1. Reserve roast slot BEFORE payment (atomic duplicate check)
      const reservation = await reserveRoast(round.id, text, user.fid, {
        username: user.username,
        displayName: user.displayName,
        pfpUrl: user.pfpUrl,
        walletAddress: address || undefined,
      });

      if ("error" in reservation) {
        setError(reservation.error);
        setSubmitting(false);
        return;
      }

      // Convert UUID to bytes32 for contract
      const roundIdBytes32 = keccak256(toHex(round.id));
      
      // 2. Enter round on-chain (handles approval + entry)
      const result = await enterRound(roundIdBytes32);
      
      if (!result.success) {
        // Payment failed - pending roast remains, user can retry
        setError("Transaction failed or was cancelled. Your roast is saved - try payment again.");
        setSubmitting(false);
        return;
      }

      // 3. Confirm roast with tx hash
      const confirmation = await confirmRoast(reservation.id, result.txHash || "on-chain", user.fid);

      if ("error" in confirmation) {
        // Rare: payment succeeded but confirmation failed
        // The roast is still pending, can be confirmed via webhook later
        setError("Payment confirmed but submission failed. Contact support with tx: " + result.txHash);
        setSubmitting(false);
        return;
      }

      // 4. Capture AI feedback if available
      if ("aiScore" in confirmation && "aiFeedback" in confirmation) {
        setAiScore(confirmation.aiScore as number);
        setAiFeedback(confirmation.aiFeedback as string);
      }

      // 4. Refresh balance
      await refreshBalance();

      // 5. Show success (longer delay to read feedback)
      setSuccess(true);
      setTimeout(() => router.push("/"), 5000);
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
      if (entryStatus === "connecting") return "Connecting wallet...";
      if (entryStatus === "checking") return "Checking approval...";
      if (entryStatus === "approving") return "Approving $CLAWN...";
      if (entryStatus === "entering") return "Entering round...";
      return "Processing...";
    }
    return `🎪 Submit Roast (${ENTRY_FEE.toLocaleString()} CLAWN)`;
  }

  // Success state
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 px-4">
        <span className="text-6xl">🎪</span>
        <h2 className="text-2xl font-bold glow-yellow text-clown-yellow">Roast Submitted!</h2>
        
        {aiScore !== null && (
          <div className="card w-full max-w-sm text-center space-y-3 py-4">
            <p className="text-xs text-white/40 uppercase tracking-widest">Judge&apos;s Score</p>
            <p className={`text-5xl font-bold ${
              aiScore >= 70 ? "text-clown-yellow glow-yellow" : 
              aiScore >= 50 ? "text-white" : "text-red-400"
            }`}>
              {aiScore}
            </p>
            {aiFeedback && (
              <p className="text-clown-pink italic text-sm">&ldquo;{aiFeedback}&rdquo;</p>
            )}
          </div>
        )}
        
        <p className="text-white/50 text-sm">Redirecting to home...</p>
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
        Today&apos;s theme: <span className="text-clown-yellow">{round?.theme || "Loading..."}</span>
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

      {/* Roast input */}
      <RoastInput 
        onSubmit={handleSubmit} 
        disabled={submitting || !hasEnoughBalance}
        buttonText={getButtonText()}
      />

      {/* Error message */}
      {(error || entryError) && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-center">
          <p className="text-red-400 text-sm">{error || entryError}</p>
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
