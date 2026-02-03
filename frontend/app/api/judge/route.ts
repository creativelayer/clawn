import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const JUDGE_PROMPT = `You are the Clown Roast Battle judge — a jaded comedy veteran who's seen it all.

THEME: {theme}

ROASTS TO JUDGE:
{entries}

Score each roast 0-100 across four categories:
- Humor (40%): Is it actually funny? Would a room laugh?
- Creativity (30%): Is it original? Surprising twist?
- Relevance (20%): Does it address the theme directly?
- Savagery (10%): How hard does it hit?

Return ONLY valid JSON array, no other text:
[
  {"id": "entry_id_here", "humor": 85, "creativity": 70, "relevance": 90, "savagery": 80, "total": 81, "feedback": "Brief witty one-liner about this roast"},
  ...
]

Rules:
- Be harsh but fair. 50 is average, 70+ is good, 85+ is exceptional.
- Penalize generic entries that could apply to any theme.
- Do NOT score entries with hate speech/slurs/threats — give score 0 with feedback "disqualified".
- Total = (humor * 0.4) + (creativity * 0.3) + (relevance * 0.2) + (savagery * 0.1), rounded.`;

interface JudgeResult {
  id: string;
  humor: number;
  creativity: number;
  relevance: number;
  savagery: number;
  total: number;
  feedback: string;
}

export async function POST(request: NextRequest) {
  try {
    // Verify API key exists
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI judging not configured (missing ANTHROPIC_API_KEY)" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { roundId, adminKey } = body;

    // Basic admin protection (optional, for manual triggers)
    const expectedKey = process.env.ADMIN_KEY;
    if (expectedKey && adminKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!roundId) {
      return NextResponse.json({ error: "roundId required" }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get the round
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("*")
      .eq("id", roundId)
      .single();

    if (roundError || !round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    // Get all roasts for this round that haven't been judged
    const { data: roasts, error: roastsError } = await supabase
      .from("roasts")
      .select("id, text, fid")
      .eq("round_id", roundId)
      .is("ai_score", null);

    if (roastsError) {
      console.error("Error fetching roasts:", roastsError);
      return NextResponse.json({ error: "Failed to fetch roasts" }, { status: 500 });
    }

    if (!roasts || roasts.length === 0) {
      return NextResponse.json({ 
        message: "No unjudged roasts found",
        judged: 0 
      });
    }

    // Format entries for the prompt
    const entries = roasts
      .map((r, i) => `[${r.id}] Entry ${i + 1}: "${r.text}"`)
      .join("\n\n");

    const prompt = JUDGE_PROMPT
      .replace("{theme}", round.theme)
      .replace("{entries}", entries);

    // Call Claude
    const anthropic = new Anthropic({ apiKey });
    
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse JSON from response
    let results: JudgeResult[];
    try {
      // Find JSON array in response (in case there's extra text)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }
      results = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText);
      return NextResponse.json(
        { error: "Failed to parse AI judge response", raw: responseText },
        { status: 500 }
      );
    }

    // Update each roast with scores
    let updated = 0;
    for (const result of results) {
      const { error: updateError } = await supabase
        .from("roasts")
        .update({
          ai_score: result.total,
          ai_feedback: result.feedback,
        })
        .eq("id", result.id);

      if (updateError) {
        console.error(`Failed to update roast ${result.id}:`, updateError);
      } else {
        updated++;
      }
    }

    // Assign ranks based on scores
    const { data: allRoasts } = await supabase
      .from("roasts")
      .select("id, ai_score")
      .eq("round_id", roundId)
      .order("ai_score", { ascending: false });

    if (allRoasts) {
      for (let i = 0; i < allRoasts.length; i++) {
        await supabase
          .from("roasts")
          .update({ rank: i + 1 })
          .eq("id", allRoasts[i].id);
      }
    }

    return NextResponse.json({
      success: true,
      judged: updated,
      results: results.map((r) => ({
        id: r.id,
        score: r.total,
        feedback: r.feedback,
      })),
    });
  } catch (e) {
    console.error("Judge error:", e);
    return NextResponse.json(
      { error: "Internal server error", details: String(e) },
      { status: 500 }
    );
  }
}

// GET to check if a round has been judged
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId");

    if (!roundId) {
      return NextResponse.json({ error: "roundId required" }, { status: 400 });
    }

    const supabase = createServerClient();

    // Count judged vs total
    const { count: total } = await supabase
      .from("roasts")
      .select("*", { count: "exact", head: true })
      .eq("round_id", roundId);

    const { count: judged } = await supabase
      .from("roasts")
      .select("*", { count: "exact", head: true })
      .eq("round_id", roundId)
      .not("ai_score", "is", null);

    return NextResponse.json({
      roundId,
      total: total || 0,
      judged: judged || 0,
      complete: total !== null && judged !== null && total > 0 && judged === total,
    });
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
