"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RoastInput from "@/components/RoastInput";
import { submitRoast } from "@/lib/api";

export default function SubmitPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(text: string) {
    setSubmitting(true);
    try {
      // TODO: check CLAWN balance & approval, then submit on-chain
      await submitRoast("round-1", text, 0);
      setSuccess(true);
      setTimeout(() => router.push("/"), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <span className="text-6xl">🎪</span>
        <h2 className="text-2xl font-bold glow-yellow text-clown-yellow">Roast Submitted!</h2>
        <p className="text-white/50 text-sm">May the funniest clown win...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      <h1 className="text-2xl font-bold text-center glow-pink text-clown-pink">🎤 Drop Your Roast</h1>
      <p className="text-center text-sm text-white/50">
        Today&apos;s theme: <span className="text-clown-yellow">Roast your own portfolio 🤡</span>
      </p>
      <RoastInput onSubmit={handleSubmit} disabled={submitting} />
      <p className="text-center text-xs text-white/30">
        Entry fee: 50,000 $CLAWN · Deducted on submit
      </p>
    </div>
  );
}
