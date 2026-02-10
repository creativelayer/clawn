import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// GET /api/roasts/check?roundId=xxx&fid=xxx
// Check if a user can submit to a round (hasn't already submitted)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId");
    const fid = searchParams.get("fid");

    if (!roundId || !fid) {
      return NextResponse.json(
        { error: "Missing roundId or fid" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Check if user already submitted to this round
    const { data: existing } = await supabase
      .from("roasts")
      .select("id")
      .eq("round_id", roundId)
      .eq("fid", parseInt(fid))
      .single();

    if (existing) {
      return NextResponse.json({
        eligible: false,
        reason: "You already submitted a roast to this round!",
      });
    }

    // Check round is active
    const { data: round } = await supabase
      .from("rounds")
      .select("status")
      .eq("id", roundId)
      .single();

    if (!round) {
      return NextResponse.json({
        eligible: false,
        reason: "Round not found",
      });
    }

    if (round.status !== "active") {
      return NextResponse.json({
        eligible: false,
        reason: "This round is no longer accepting entries",
      });
    }

    return NextResponse.json({ eligible: true });
  } catch (e) {
    console.error("Error checking eligibility:", e);
    return NextResponse.json(
      { error: "Failed to check eligibility" },
      { status: 500 }
    );
  }
}
