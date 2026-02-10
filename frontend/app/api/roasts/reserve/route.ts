import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/roasts/reserve
// Reserve a roast slot (pending) before payment
// This is the atomic lock that prevents duplicates
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roundId, text, fid, username, displayName, pfpUrl, walletAddress } = body;

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

    // Check if user already has an entry (pending or confirmed)
    const { data: existing } = await supabase
      .from("roasts")
      .select("id, tx_hash")
      .eq("round_id", roundId)
      .eq("fid", fid)
      .single();

    if (existing) {
      if (existing.tx_hash) {
        return NextResponse.json(
          { error: "You already submitted a roast to this round!" },
          { status: 400 }
        );
      } else {
        // Has pending entry - return it so they can retry payment
        return NextResponse.json({
          id: existing.id,
          pending: true,
          message: "You have a pending entry. Complete payment to confirm.",
        });
      }
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

    // Create pending roast (tx_hash = null means pending)
    const { data: roast, error: insertError } = await supabase
      .from("roasts")
      .insert({
        round_id: roundId,
        fid,
        text,
        tx_hash: null, // Pending - no payment yet
      })
      .select("id")
      .single();

    if (insertError) {
      // Could be a race condition - check if it's a duplicate
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "You already submitted a roast to this round!" },
          { status: 400 }
        );
      }
      console.error("Error inserting roast:", insertError);
      return NextResponse.json({ error: "Failed to reserve roast slot" }, { status: 500 });
    }

    return NextResponse.json({
      id: roast.id,
      pending: true,
      message: "Roast reserved! Complete payment to confirm.",
    });
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
