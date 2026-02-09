// Backend API client - calls our Next.js API routes

export interface Round {
  id: string;
  theme: string;
  startsAt: string;
  endsAt: string;
  prizePool: number;
  entryCount: number;
  status: "upcoming" | "active" | "judging" | "ended";
  winnerFid?: number;
}

export interface Roast {
  id: string;
  roundId: string;
  fid: number;
  authorName: string;
  authorPfp: string;
  text: string;
  aiScore: number | null;
  aiFeedback: string | null;
  votes: number;
  rank: number | null;
  createdAt: string;
}

export interface LeaderboardEntry {
  fid: number;
  name: string;
  pfp: string;
  wins: number;
  totalEarnings: number;
  title: string;
}

// Get API base URL - needs absolute URL for server-side rendering
function getApiBase(): string {
  // Client-side: use relative URLs
  if (typeof window !== "undefined") {
    return "";
  }
  // Server-side: use VERCEL_URL (auto-set by Vercel) or configured URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  return "http://localhost:3000";
}

export async function getActiveRound(): Promise<Round | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/rounds/active`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`${res.status}`);
    }
    return res.json();
  } catch (e) {
    console.error("Failed to fetch active round:", e);
    return null;
  }
}

export async function getRoundResults(
  id: string
): Promise<{ round: Round; roasts: Roast[] } | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/rounds/${id}/results`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch (e) {
    console.error("Failed to fetch round results:", e);
    return null;
  }
}

export async function submitRoast(
  roundId: string,
  text: string,
  fid: number,
  txHash?: string,
  userInfo?: {
    username?: string;
    displayName?: string;
    pfpUrl?: string;
    walletAddress?: string;
    entryId?: string;
  }
): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch(`${getApiBase()}/api/roasts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roundId,
        text,
        fid,
        txHash,
        ...userInfo,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { error: data.error || "Failed to submit roast" };
    }

    return data;
  } catch (e) {
    console.error("Failed to submit roast:", e);
    return { error: "Network error. Please try again." };
  }
}

export async function getRoasts(roundId: string): Promise<Roast[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/roasts?roundId=${roundId}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch (e) {
    console.error("Failed to fetch roasts:", e);
    return [];
  }
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/leaderboard`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch (e) {
    console.error("Failed to fetch leaderboard:", e);
    return [];
  }
}
