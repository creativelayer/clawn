import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServerClient();

    // Get active round with entry count
    const { data: round, error } = await supabase
      .from("rounds")
      .select("*, roasts(count)")
      .eq("status", "active")
      .order("ends_at", { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Error fetching active round:", error);
      return NextResponse.json({ error: "Failed to fetch round" }, { status: 500 });
    }

    if (!round) {
      return NextResponse.json({ error: "No active round" }, { status: 404 });
    }

    // Format response
    const response = {
      id: round.id,
      theme: round.theme,
      startsAt: round.starts_at,
      endsAt: round.ends_at,
      prizePool: round.prize_pool,
      status: round.status,
      entryCount: round.roasts?.[0]?.count || 0,
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
