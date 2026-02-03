"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RoastInput from "@/components/RoastInput";
import BuyClawnButton from "@/components/BuyClawnButton";
import { useFarcaster } from "@/components/FarcasterProvider";
import { sendEntryFee } from "@/lib/farcaster";
import { submitRoast } from "@/lib/api";
import { ENTRY_FEE, ENTRY_FEE_WEI } from "@/lib/constants";

// Prize pool address (TODO: move to env/constants when contract deployed)
const PRIZE_POOL_ADDRESS = "0x79Bed28E6d195375C19e84350608eA3c4811D4B9";

export default function SubmitPage() {
  const router = useRouter();
  const { user, clawnBalance, clawnBalanceFormatted, signIn, isLoading, refreshBalance } = useFarcaster();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasEnoughBalance = clawnBalance >= ENTRY_FEE_WEI;

  async function handleSubmit(text: string) {
    setError(null);

    // Check auth
    if (!user) {
      setError("Please sign in with Farcaster first");
      return;
    }

    // Check balance
    if (!hasEnoughBalance) {
      setError("Not enough $CLAWN. Buy some first!");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Send entry fee via SDK
      const txHash = await sendEntryFee(PRIZE_POOL_ADDRESS);
      if (!txHash) {
        setError("Payment cancelled or failed");
        setSubmitting(false);
        return;
      }

      // 2. Submit roast to backend
      await submitRoast("round-1", text, user.fid);

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
        Today&apos;s theme: <span className="text-clown-yellow">Roast your own portfolio 🤡</span>
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
      <RoastInput onSubmit={handleSubmit} disabled={submitting || !hasEnoughBalance} />

      {/* Error message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Fee info */}
      <p className="text-center text-xs text-white/30">
        Entry fee: {ENTRY_FEE.toLocaleString()} $CLAWN · Deducted on submit
      </p>

      {/* Signed in as */}
      <p className="text-center text-xs text-white/30">
        Signed in as <span className="text-clown-pink">@{user.username || `fid:${user.fid}`}</span>
      </p>
    </div>
  );
}
