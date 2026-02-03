import { getRoundResults } from "@/lib/api";
import PrizePool from "@/components/PrizePool";

export default async function ResultsPage({ params }: { params: { id: string } }) {
  const { round, roasts } = await getRoundResults(params.id);

  return (
    <div className="space-y-6 pt-4">
      <h1 className="text-2xl font-bold text-center glow-pink text-clown-pink">🏆 Round Results</h1>
      <p className="text-center text-white/50 text-sm">{round.theme}</p>
      <PrizePool amount={round.prizePool} />

      <div className="space-y-3">
        {roasts.map((roast, i) => (
          <div key={roast.id} className="card">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">
                {i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </span>
              <span className="font-bold text-sm">{roast.authorName}</span>
              <span className="ml-auto text-xs text-clown-yellow">{roast.votes} votes</span>
            </div>
            <p className="text-white/80 text-sm">{roast.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
