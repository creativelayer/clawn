import { getLeaderboard } from "@/lib/api";
import LeaderboardRow from "@/components/LeaderboardRow";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  return (
    <div className="space-y-4 pt-4">
      <h1 className="text-2xl font-bold text-center glow-yellow text-clown-yellow">🏆 Hall of Clowns</h1>
      <p className="text-center text-sm text-white/50">All-time roast champions</p>
      <div>
        {entries.map((entry, i) => (
          <LeaderboardRow key={entry.fid} entry={entry} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}
