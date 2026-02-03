import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roundId, text, fid, txHash, username, displayName, pfpUrl, walletAddress } = body;

    // Validate required fields
    if (!roundId || !text || !fid) {
      return NextResponse.json(
        { error: "Missing required fields: roundId, text, fid" },
        { status: 400 }
      );
    }

    // Validate text length
    if (text.length < 10) {
      return NextResponse.json(
        { error: "Roast too short! Give us at least 10 characters." },
        { status: 400 }
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: "Roast too long! Keep it under 500 characters." },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Check round exists and is active
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("id, status")
      .eq("id", roundId)
      .single();

    if (roundError || !round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    if (round.status !== "active") {
      return NextResponse.json(
        { error: "This round is no longer accepting entries" },
        { status: 400 }
      );
    }

    // Check if user already submitted to this round
    const { data: existing } = await supabase
      .from("roasts")
      .select("id")
      .eq("round_id", roundId)
      .eq("fid", fid)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "You already submitted a roast to this round!" },
        { status: 400 }
      );
    }

    // Upsert user profile
    if (username || displayName || pfpUrl || walletAddress) {
      await supabase.from("users").upsert(
        {
          fid,
          username: username || null,
          display_name: displayName || null,
          pfp_url: pfpUrl || null,
          wallet_address: walletAddress || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fid" }
      );
    }

    // Insert roast
    const { data: roast, error: insertError } = await supabase
      .from("roasts")
      .insert({
        round_id: roundId,
        fid,
        text,
        tx_hash: txHash || null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting roast:", insertError);
      return NextResponse.json({ error: "Failed to submit roast" }, { status: 500 });
    }

    // Update prize pool (entry fee = 50,000 CLAWN)
    await supabase.rpc("increment_prize_pool", { round_id: roundId, amount: 50000 });

    return NextResponse.json({ id: roast.id, success: true });
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET roasts for a round
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId");

    if (!roundId) {
      return NextResponse.json({ error: "roundId required" }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: roasts, error } = await supabase
      .from("roasts")
      .select(`
        id,
        round_id,
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
      .eq("round_id", roundId)
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("votes", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching roasts:", error);
      return NextResponse.json({ error: "Failed to fetch roasts" }, { status: 500 });
    }

    // Flatten user data
    const formatted = roasts.map((r: any) => ({
      id: r.id,
      roundId: r.round_id,
      fid: r.fid,
      text: r.text,
      aiScore: r.ai_score,
      aiFeedback: r.ai_feedback,
      votes: r.votes,
      rank: r.rank,
      createdAt: r.created_at,
      authorName: r.users?.display_name || r.users?.username || `fid:${r.fid}`,
      authorPfp: r.users?.pfp_url || "",
    }));

    return NextResponse.json(formatted);
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
