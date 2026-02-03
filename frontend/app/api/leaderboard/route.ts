import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServerClient();

    // Use the leaderboard view we created
    const { data, error } = await supabase
      .from("leaderboard")
      .select("*")
      .limit(50);

    if (error) {
      console.error("Error fetching leaderboard:", error);
      return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
    }

    // Format response
    const formatted = data.map((entry: any) => ({
      fid: entry.fid,
      name: entry.display_name || entry.username || `fid:${entry.fid}`,
      pfp: entry.pfp_url || "",
      wins: entry.total_wins,
      totalEarnings: entry.total_earnings,
      title: entry.title,
    }));

    return NextResponse.json(formatted);
  } catch (e) {
    console.error("Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
