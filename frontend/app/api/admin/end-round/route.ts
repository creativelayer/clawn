import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// Simple API key auth
function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) return false;
  return authHeader === `Bearer ${apiKey}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { roundId } = body;

    const supabase = createServerClient();

    if (roundId) {
      // End specific round
      const { data, error } = await supabase
        .from("rounds")
        .update({ status: "ended" })
        .eq("id", roundId)
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, ended: data });
    } else {
      // End ALL active rounds
      const { data, error } = await supabase
        .from("rounds")
        .update({ status: "ended" })
        .eq("status", "active")
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, ended: data });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
