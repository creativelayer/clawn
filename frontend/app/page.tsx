import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import RoundCard from "@/components/RoundCard";
import BuyClawnButton from "@/components/BuyClawnButton";
import UserStatus from "@/components/UserStatus";

// Force dynamic rendering (no static generation)
export const dynamic = "force-dynamic";

async function getActiveRound() {
  try {
    const supabase = createServerClient();
    
    // Get active round
    const { data: round, error } = await supabase
      .from("rounds")
      .select("*")
      .eq("status", "active")
      .order("ends_at", { ascending: true })
      .limit(1)
      .single();

    if (error || !round) return null;

    // Get entry count separately
    const { count: entryCount } = await supabase
      .from("roasts")
      .select("*", { count: "exact", head: true })
      .eq("round_id", round.id);

    return {
      id: round.id,
      theme: round.theme,
      startsAt: round.starts_at,
      endsAt: round.ends_at,
      prizePool: round.prize_pool,
      status: round.status,
      entryCount: entryCount || 0,
    };
  } catch (e) {
    console.error("Failed to fetch active round:", e);
    return null;
  }
}

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

      {round ? (
        <>
          <RoundCard round={round} />
          <Link href="/submit" className="btn-primary block text-center text-lg">
            🎤 Enter the Ring — 50K $CLAWN
          </Link>
        </>
      ) : (
        <div className="card text-center py-8">
          <span className="text-4xl">🎪</span>
          <p className="text-white/50 mt-2">No active round right now</p>
          <p className="text-xs text-white/30 mt-1">Check back soon!</p>
        </div>
      )}

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
