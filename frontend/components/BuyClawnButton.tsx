"use client";

import { useFarcaster } from "./FarcasterProvider";
import { swapToken, viewToken } from "@/lib/farcaster";

interface Props {
  showBalance?: boolean;
  variant?: "primary" | "secondary";
}

export default function BuyClawnButton({ showBalance = false, variant = "primary" }: Props) {
  const { clawnBalanceFormatted, isInFrame } = useFarcaster();

  const isPrimary = variant === "primary";

  return (
    <div className="flex flex-col items-center gap-2">
      {showBalance && (
        <p className="text-xs text-white/50">
          Balance: <span className="text-clown-yellow font-bold">{clawnBalanceFormatted} $CLAWN</span>
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => swapToken()}
          className={`font-bold py-2 px-5 rounded-xl text-sm transition-all hover:scale-105 ${
            isPrimary
              ? "bg-clown-yellow text-clown-bg"
              : "bg-white/10 text-white border border-white/20"
          }`}
          style={isPrimary ? { boxShadow: "0 0 16px rgba(255,225,86,0.3)" } : {}}
        >
          💰 Buy $CLAWN
        </button>
        {isInFrame && (
          <button
            onClick={() => viewToken()}
            className="bg-white/10 text-white/70 font-medium py-2 px-4 rounded-xl text-sm transition-all hover:bg-white/20"
          >
            📊
          </button>
        )}
      </div>
    </div>
  );
}
