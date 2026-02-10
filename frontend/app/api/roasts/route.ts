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

    // Update prize pool (70% of entry fee goes to winners)
    // 50,000 CLAWN entry → 35,000 to pool, 15,000 treasury/burn/streak
    const PRIZE_POOL_SHARE = 35000; // 70% of 50,000
    await supabase.rpc("increment_prize_pool", { round_id: roundId, amount: PRIZE_POOL_SHARE });

    // Trigger immediate AI judging for this roast
    let aiScore: number | null = null;
    let aiFeedback: string | null = null;
    
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({ apiKey });
        
        // Get round theme
        const { data: roundData } = await supabase
          .from("rounds")
          .select("theme")
          .eq("id", roundId)
          .single();
        
        const theme = roundData?.theme || "general roasting";
        
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `You are the Clown Roast Battle judge. Score this roast 0-100.

THEME: ${theme}
ROAST: "${text}"

Score across: Humor (40%), Creativity (30%), Relevance (20%), Savagery (10%).

Return ONLY this JSON, nothing else:
{"score": <0-100>, "feedback": "<witty one-liner reaction>"}`
          }],
        });
        
        const responseText = response.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("");
        
        const parsed = JSON.parse(responseText);
        aiScore = parsed.score;
        aiFeedback = parsed.feedback;
        
        // Update roast with scores
        await supabase
          .from("roasts")
          .update({ ai_score: aiScore, ai_feedback: aiFeedback })
          .eq("id", roast.id);
      }
    } catch (judgeError) {
      console.error("AI judging failed (non-fatal):", judgeError);
      // Continue without AI score - not a fatal error
    }

    return NextResponse.json({ 
      id: roast.id, 
      success: true,
      aiScore,
      aiFeedback,
    });
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

    // Get roasts
    const { data: roasts, error } = await supabase
      .from("roasts")
      .select("*")
      .eq("round_id", roundId)
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("votes", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching roasts:", error);
      return NextResponse.json({ error: "Failed to fetch roasts" }, { status: 500 });
    }

    // Get user info for all fids
    const fids = [...new Set(roasts.map((r: any) => r.fid))];
    const { data: users } = fids.length > 0 
      ? await supabase.from("users").select("*").in("fid", fids)
      : { data: [] };
    
    const userMap = new Map((users || []).map((u: any) => [u.fid, u]));

    // Format response
    const formatted = roasts.map((r: any) => {
      const user = userMap.get(r.fid);
      return {
        id: r.id,
        roundId: r.round_id,
        fid: r.fid,
        text: r.text,
        aiScore: r.ai_score,
        aiFeedback: r.ai_feedback,
        votes: r.votes,
        rank: r.rank,
        createdAt: r.created_at,
        authorName: user?.display_name || user?.username || `fid:${r.fid}`,
        authorPfp: user?.pfp_url || "",
      };
    });

    return NextResponse.json(formatted);
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
