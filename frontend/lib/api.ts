// Backend API client with mock data fallbacks

export interface Round {
  id: string;
  theme: string;
  endsAt: string;
  prizePool: number;
  entryCount: number;
  status: "active" | "voting" | "ended";
}

export interface Roast {
  id: string;
  roundId: string;
  authorFid: number;
  authorName: string;
  authorPfp: string;
  text: string;
  votes: number;
  rank?: number;
}

export interface LeaderboardEntry {
  fid: number;
  name: string;
  pfp: string;
  wins: number;
  totalEarnings: number;
  title: string;
}

// --- Mock data ---

const MOCK_ROUND: Round = {
  id: "round-1",
  theme: "Roast your own portfolio 🤡",
  endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  prizePool: 2_500_000,
  entryCount: 47,
  status: "active",
};

const MOCK_ROASTS: Roast[] = [
  {
    id: "r1",
    roundId: "round-1",
    authorFid: 1234,
    authorName: "honkmaster.eth",
    authorPfp: "",
    text: "My portfolio is so red, even Pennywise wouldn't touch it. At least clowns get paid per gig — I'm doing this for free. 🤡",
    votes: 142,
    rank: 1,
  },
  {
    id: "r2",
    roundId: "round-1",
    authorFid: 5678,
    authorName: "degenella",
    authorPfp: "",
    text: "I bought the top so many times they named a circus tent after me.",
    votes: 98,
    rank: 2,
  },
  {
    id: "r3",
    roundId: "round-1",
    authorFid: 9012,
    authorName: "bozo.base",
    authorPfp: "",
    text: "My trading strategy? Buy high, sell low, blame the devs. Rinse and repeat like a clown car that keeps crashing.",
    votes: 76,
    rank: 3,
  },
];

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { fid: 1234, name: "honkmaster.eth", pfp: "", wins: 8, totalEarnings: 12_500_000, title: "Roast Master" },
  { fid: 5678, name: "degenella", pfp: "", wins: 5, totalEarnings: 7_200_000, title: "Harlequin" },
  { fid: 9012, name: "bozo.base", pfp: "", wins: 3, totalEarnings: 4_100_000, title: "Trickster" },
  { fid: 3456, name: "jesterjesus", pfp: "", wins: 2, totalEarnings: 2_800_000, title: "Fool" },
  { fid: 7890, name: "clownpilled", pfp: "", wins: 1, totalEarnings: 1_500_000, title: "Jester" },
];

// --- API functions ---

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchOrMock<T>(path: string, mock: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch {
    return mock;
  }
}

export async function getActiveRound(): Promise<Round> {
  return fetchOrMock("/api/rounds/active", MOCK_ROUND);
}

export async function getRoundResults(id: string): Promise<{ round: Round; roasts: Roast[] }> {
  return fetchOrMock(`/api/rounds/${id}/results`, {
    round: { ...MOCK_ROUND, id, status: "ended" },
    roasts: MOCK_ROASTS,
  });
}

export async function submitRoast(roundId: string, text: string, fid: number): Promise<{ id: string }> {
  try {
    const res = await fetch(`${API_URL}/api/roasts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId, text, fid }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch {
    return { id: `mock-${Date.now()}` };
  }
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return fetchOrMock("/api/leaderboard", MOCK_LEADERBOARD);
}
