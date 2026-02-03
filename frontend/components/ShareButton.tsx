"use client";

import { composeCast } from "@/lib/farcaster";

interface Props {
  roastText: string;
  theme: string;
  rank?: number;
  prizeAmount?: number;
  roundId: string;
}

export default function ShareButton({ roastText, theme, rank, prizeAmount, roundId }: Props) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clawn-o0h432d9h-creative-layer-projects-b7b6b5f9.vercel.app";

  function handleShare() {
    let text = `🤡 Clown Roast Battle\n\n🔮 "${theme}"\n\n🔥 My roast: "${roastText}"`;

    if (rank && rank <= 3) {
      text += `\n\n🏆 Rank: #${rank}`;
      if (prizeAmount) {
        const formatted = prizeAmount >= 1_000_000 
          ? `${(prizeAmount / 1_000_000).toFixed(1)}M`
          : prizeAmount >= 1_000
          ? `${(prizeAmount / 1_000).toFixed(0)}K`
          : prizeAmount.toLocaleString();
        text += ` — Won ${formatted} $CLAWN! 🎪`;
      }
    }

    text += `\n\nThink you're funnier? 👇`;

    const embedUrl = `${APP_URL}/results/${roundId}`;
    composeCast(text, embedUrl);
  }

  return (
    <button
      onClick={handleShare}
      className="btn-secondary w-full"
    >
      📢 Share Your Roast
    </button>
  );
}
