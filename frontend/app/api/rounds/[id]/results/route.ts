import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // Get round
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("*")
      .eq("id", id)
      .single();

    if (roundError || !round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    // Get roasts
    const { data: roasts, error: roastsError } = await supabase
      .from("roasts")
      .select("*")
      .eq("round_id", id)
      .order("rank", { ascending: true, nullsFirst: false })
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("votes", { ascending: false });

    if (roastsError) {
      console.error("Error fetching roasts:", roastsError);
      return NextResponse.json({ error: "Failed to fetch results" }, { status: 500 });
    }

    // Get user info
    const fids = [...new Set(roasts.map((r: any) => r.fid))];
    const { data: users } = fids.length > 0
      ? await supabase.from("users").select("*").in("fid", fids)
      : { data: [] };
    
    const userMap = new Map((users || []).map((u: any) => [u.fid, u]));

    // Format response
    const response = {
      round: {
        id: round.id,
        theme: round.theme,
        startsAt: round.starts_at,
        endsAt: round.ends_at,
        prizePool: round.prize_pool,
        status: round.status,
        winnerFid: round.winner_fid,
      },
      roasts: roasts.map((r: any, idx: number) => {
        const user = userMap.get(r.fid);
        return {
          id: r.id,
          fid: r.fid,
          text: r.text,
          aiScore: r.ai_score,
          aiFeedback: r.ai_feedback,
          votes: r.votes,
          rank: r.rank || idx + 1,
          createdAt: r.created_at,
          authorName: user?.display_name || user?.username || `fid:${r.fid}`,
          authorPfp: user?.pfp_url || "",
        };
      }),
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
