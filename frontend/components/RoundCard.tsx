import type { Round } from "@/lib/api";
import Timer from "./Timer";
import PrizePool from "./PrizePool";

export default function RoundCard({ round }: { round: Round }) {
  return (
    <div className="card space-y-4">
      <div className="text-center">
        <span className="inline-block bg-clown-pink/20 text-clown-pink text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
          {round.status === "active" ? "🔴 Live Round" : round.status}
        </span>
      </div>
      <h2 className="text-xl font-bold text-center">{round.theme}</h2>
      <Timer endsAt={round.endsAt} />
      <PrizePool amount={round.prizePool} />
      <p className="text-center text-sm text-white/50">
        {round.entryCount} roasts submitted
      </p>
    </div>
  );
}
