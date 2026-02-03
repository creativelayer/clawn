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

    // Get roasts with user info
    const { data: roasts, error: roastsError } = await supabase
      .from("roasts")
      .select(`
        id,
        fid,
        text,
        ai_score,
        ai_feedback,
        votes,
        rank,
        created_at,
        users (
          username,
          display_name,
          pfp_url
        )
      `)
      .eq("round_id", id)
      .order("rank", { ascending: true, nullsFirst: false })
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("votes", { ascending: false });

    if (roastsError) {
      console.error("Error fetching roasts:", roastsError);
      return NextResponse.json({ error: "Failed to fetch results" }, { status: 500 });
    }

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
      roasts: roasts.map((r: any, idx: number) => ({
        id: r.id,
        fid: r.fid,
        text: r.text,
        aiScore: r.ai_score,
        aiFeedback: r.ai_feedback,
        votes: r.votes,
        rank: r.rank || idx + 1,
        createdAt: r.created_at,
        authorName: r.users?.display_name || r.users?.username || `fid:${r.fid}`,
        authorPfp: r.users?.pfp_url || "",
      })),
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
