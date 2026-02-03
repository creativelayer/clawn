import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy-initialized clients to avoid build-time errors
let _supabase: SupabaseClient | null = null;
let _serverClient: SupabaseClient | null = null;

// Client-side Supabase client (uses anon key, respects RLS)
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

// For backwards compatibility
export const supabase = typeof window !== "undefined" ? getSupabase() : null;

// Server-side Supabase client (uses service role, bypasses RLS)
export function createServerClient(): SupabaseClient {
  if (!_serverClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      throw new Error("Missing Supabase environment variables");
    }
    
    _serverClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _serverClient;
}

// Types
export interface Round {
  id: string;
  theme: string;
  starts_at: string;
  ends_at: string;
  prize_pool: number;
  status: "upcoming" | "active" | "judging" | "ended";
  winner_fid: number | null;
  created_at: string;
  entry_count?: number;
}

export interface Roast {
  id: string;
  round_id: string;
  fid: number;
  text: string;
  tx_hash: string | null;
  ai_score: number | null;
  ai_feedback: string | null;
  votes: number;
  rank: number | null;
  created_at: string;
  // Joined user data
  username?: string;
  display_name?: string;
  pfp_url?: string;
}

export interface User {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  wallet_address: string | null;
  total_wins: number;
  total_earnings: number;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardEntry {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  total_wins: number;
  total_earnings: number;
  title: string;
}
