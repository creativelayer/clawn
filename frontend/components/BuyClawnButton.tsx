"use client";

import { swapToken } from "@/lib/farcaster";

export default function BuyClawnButton() {
  return (
    <button
      onClick={() => swapToken()}
      className="bg-clown-yellow text-clown-bg font-bold py-2 px-5 rounded-xl text-sm transition-all hover:scale-105"
      style={{ boxShadow: "0 0 16px rgba(255,225,86,0.3)" }}
    >
      💰 Buy $CLAWN
    </button>
  );
}
