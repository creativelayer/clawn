import { getRoundResults } from "@/lib/api";
import PrizePool from "@/components/PrizePool";
import ShareButton from "@/components/ShareButton";

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { round, roasts } = await getRoundResults(id);

  // Find current user's roast (TODO: match by FID from context)
  const userRoast = roasts[2]; // Placeholder - would be matched by user FID

  return (
    <div className="space-y-6 pt-4">
      <h1 className="text-2xl font-bold text-center glow-pink text-clown-pink">🏆 Round Results</h1>
      <p className="text-center text-white/50 text-sm">{round.theme}</p>
      <PrizePool amount={round.prizePool} />

      {/* Top 3 Winners */}
      <div className="space-y-3">
        {roasts.slice(0, 3).map((roast, i) => (
          <div 
            key={roast.id} 
            className={`card ${i === 0 ? "border-clown-yellow border-2 glow-yellow" : ""}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">
                {i === 0 ? "👑" : i === 1 ? "🥈" : "🥉"}
              </span>
              <span className="font-bold text-sm">{roast.authorName}</span>
              <span className="ml-auto text-xs text-clown-yellow font-bold">{roast.votes} votes</span>
            </div>
            <p className="text-white/90 text-sm leading-relaxed">&ldquo;{roast.text}&rdquo;</p>
          </div>
        ))}
      </div>

      {/* Other entries */}
      {roasts.length > 3 && (
        <details className="card">
          <summary className="cursor-pointer text-sm text-white/50 hover:text-white/70">
            View all {roasts.length} entries
          </summary>
          <div className="mt-3 space-y-2">
            {roasts.slice(3).map((roast, i) => (
              <div key={roast.id} className="border-t border-white/10 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">#{i + 4}</span>
                  <span className="text-sm font-medium">{roast.authorName}</span>
                  <span className="ml-auto text-xs text-white/40">{roast.votes} votes</span>
                </div>
                <p className="text-white/60 text-xs mt-1">&ldquo;{roast.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Share button */}
      {userRoast && (
        <ShareButton
          roastText={userRoast.text}
          theme={round.theme}
          rank={userRoast.rank}
          prizeAmount={userRoast.rank && userRoast.rank <= 3 ? 500000 : undefined}
          roundId={id}
        />
      )}

      {/* Next round CTA */}
      <div className="text-center">
        <a href="/" className="text-clown-pink text-sm hover:underline">
          ← Back to current round
        </a>
      </div>
    </div>
  );
}
