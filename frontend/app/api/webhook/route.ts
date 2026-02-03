import { NextRequest, NextResponse } from "next/server";

/**
 * Farcaster notification webhook endpoint.
 * Receives events when users add/remove the mini app.
 * TODO: Verify webhook signature with FARCASTER_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, fid, notificationDetails } = body;

    console.log(`[webhook] event=${event} fid=${fid}`);

    switch (event) {
      case "frame_added":
        // User added the mini app — store notificationDetails for push
        if (notificationDetails) {
          console.log(`[webhook] User ${fid} enabled notifications`, notificationDetails);
          // TODO: store notificationDetails.url and notificationDetails.token
        }
        break;

      case "frame_removed":
        // User removed the mini app
        console.log(`[webhook] User ${fid} removed the app`);
        // TODO: remove stored notification details
        break;

      case "notifications_enabled":
        if (notificationDetails) {
          console.log(`[webhook] User ${fid} re-enabled notifications`);
          // TODO: update stored notification details
        }
        break;

      case "notifications_disabled":
        console.log(`[webhook] User ${fid} disabled notifications`);
        // TODO: remove stored notification details
        break;
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[webhook] Error:", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
