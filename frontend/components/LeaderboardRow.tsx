import type { LeaderboardEntry } from "@/lib/api";

const RANK_EMOJI = ["👑", "🥈", "🥉"];

export default function LeaderboardRow({
  entry,
  rank,
}: {
  entry: LeaderboardEntry;
  rank: number;
}) {
  const emoji = RANK_EMOJI[rank - 1] || `#${rank}`;
  const earnings = new Intl.NumberFormat().format(entry.totalEarnings);

  return (
    <div className="flex items-center gap-3 py-3 px-4 card mb-2">
      <span className="text-xl w-8 text-center">{emoji}</span>
      <div className="w-9 h-9 rounded-full bg-clown-purple/30 flex items-center justify-center text-lg">
        🤡
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold truncate">{entry.name}</p>
        <p className="text-xs text-clown-purple">{entry.title} · {entry.wins} wins</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-clown-yellow">{earnings}</p>
        <p className="text-[10px] text-white/40">$CLAWN</p>
      </div>
    </div>
  );
}
