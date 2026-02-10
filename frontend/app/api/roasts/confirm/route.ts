import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/roasts/confirm
// Confirm a pending roast with tx hash after payment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roastId, txHash, fid } = body;

    if (!roastId || !txHash || !fid) {
      return NextResponse.json(
        { error: "Missing required fields: roastId, txHash, fid" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get the pending roast
    const { data: roast, error: roastError } = await supabase
      .from("roasts")
      .select("id, round_id, fid, text, tx_hash")
      .eq("id", roastId)
      .single();

    if (roastError || !roast) {
      return NextResponse.json({ error: "Roast not found" }, { status: 404 });
    }

    // Verify ownership
    if (roast.fid !== fid) {
      return NextResponse.json({ error: "Not your roast" }, { status: 403 });
    }

    // Check if already confirmed
    if (roast.tx_hash) {
      return NextResponse.json({
        id: roast.id,
        alreadyConfirmed: true,
        message: "Roast already confirmed",
      });
    }

    // Update with tx hash (confirms the entry)
    const { error: updateError } = await supabase
      .from("roasts")
      .update({ tx_hash: txHash })
      .eq("id", roastId);

    if (updateError) {
      console.error("Error confirming roast:", updateError);
      return NextResponse.json({ error: "Failed to confirm roast" }, { status: 500 });
    }

    // Update prize pool (70% of entry fee goes to winners)
    const PRIZE_POOL_SHARE = 35000; // 70% of 50,000
    await supabase.rpc("increment_prize_pool", { 
      round_id: roast.round_id, 
      amount: PRIZE_POOL_SHARE 
    });

    // Trigger AI judging
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
          .eq("id", roast.round_id)
          .single();

        const theme = roundData?.theme || "general roasting";

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `You are the Clown Roast Battle judge. Score this roast 0-100.

THEME: ${theme}
ROAST: "${roast.text}"

Score across: Humor (40%), Creativity (30%), Relevance (20%), Savagery (10%).

Return ONLY this JSON, nothing else:
{"score": <0-100>, "feedback": "<witty one-liner reaction>"}`
          }],
        });

        const responseText = response.content
          .filter((b) => b.type === "text")
          .map((b) => "text" in b ? b.text : "")
          .join("");

        const parsed = JSON.parse(responseText);
        aiScore = parsed.score;
        aiFeedback = parsed.feedback;

        // Update roast with scores
        await supabase
          .from("roasts")
          .update({ ai_score: aiScore, ai_feedback: aiFeedback })
          .eq("id", roastId);
      }
    } catch (judgeError) {
      console.error("AI judging failed (non-fatal):", judgeError);
    }

    return NextResponse.json({
      id: roast.id,
      confirmed: true,
      txHash,
      aiScore,
      aiFeedback,
    });
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
