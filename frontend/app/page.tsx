import Link from "next/link";
import { getActiveRound } from "@/lib/api";
import RoundCard from "@/components/RoundCard";
import BuyClawnButton from "@/components/BuyClawnButton";
import UserStatus from "@/components/UserStatus";

export default async function Home() {
  const round = await getActiveRound();

  return (
    <div className="space-y-6">
      <header className="text-center pt-4">
        <h1 className="text-3xl font-black glow-pink text-clown-pink">🤡 CLOWN ROAST BATTLE</h1>
        <p className="text-sm text-white/50 mt-1">Funniest clown wins the pool</p>
      </header>

      {/* User status (client component) */}
      <UserStatus />

      <RoundCard round={round} />

      <Link href="/submit" className="btn-primary block text-center text-lg">
        🎤 Enter the Ring — 50K $CLAWN
      </Link>

      <div className="flex justify-center">
        <BuyClawnButton showBalance />
      </div>

      <div className="card text-center space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-widest">How it works</p>
        <ol className="text-sm text-white/70 space-y-1 text-left list-decimal list-inside">
          <li>Pay 50,000 $CLAWN to submit a roast</li>
          <li>AI judges score on humor, creativity & savagery</li>
          <li>Top 3 win the prize pool 🏆</li>
        </ol>
      </div>
    </div>
  );
}
