-- Clown Roast Battle Schema
-- Run this on Supabase to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rounds: Daily/weekly competition rounds
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  theme TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  prize_pool BIGINT NOT NULL DEFAULT 0, -- in CLAWN (no decimals, whole tokens)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'judging', 'ended')),
  winner_fid INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users: Cached Farcaster profiles + stats
CREATE TABLE IF NOT EXISTS users (
  fid INTEGER PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  pfp_url TEXT,
  wallet_address TEXT,
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_earnings BIGINT NOT NULL DEFAULT 0, -- in CLAWN
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roasts: Submitted entries
CREATE TABLE IF NOT EXISTS roasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  fid INTEGER NOT NULL,
  text TEXT NOT NULL,
  tx_hash TEXT, -- Entry fee transaction hash
  ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
  ai_feedback TEXT, -- Claude's roast of the roast
  votes INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Votes: User votes on roasts (one vote per user per roast)
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roast_id UUID NOT NULL REFERENCES roasts(id) ON DELETE CASCADE,
  voter_fid INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(roast_id, voter_fid)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roasts_round_id ON roasts(round_id);
CREATE INDEX IF NOT EXISTS idx_roasts_fid ON roasts(fid);
CREATE INDEX IF NOT EXISTS idx_roasts_created_at ON roasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
CREATE INDEX IF NOT EXISTS idx_rounds_ends_at ON rounds(ends_at);
CREATE INDEX IF NOT EXISTS idx_votes_roast_id ON votes(roast_id);

-- View: Leaderboard
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
  u.fid,
  u.username,
  u.display_name,
  u.pfp_url,
  u.total_wins,
  u.total_earnings,
  CASE 
    WHEN u.total_wins >= 10 THEN 'Roast Master'
    WHEN u.total_wins >= 5 THEN 'Harlequin'
    WHEN u.total_wins >= 3 THEN 'Trickster'
    WHEN u.total_wins >= 1 THEN 'Jester'
    ELSE 'Clown'
  END as title
FROM users u
WHERE u.total_wins > 0
ORDER BY u.total_wins DESC, u.total_earnings DESC
LIMIT 100;

-- View: Active round with entry count
CREATE OR REPLACE VIEW active_round AS
SELECT 
  r.*,
  COUNT(ro.id) as entry_count
FROM rounds r
LEFT JOIN roasts ro ON ro.round_id = r.id
WHERE r.status = 'active'
GROUP BY r.id
ORDER BY r.ends_at ASC
LIMIT 1;

-- Function to update user stats after a round ends
CREATE OR REPLACE FUNCTION update_winner_stats(winner_fid_param INTEGER, prize_amount BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO users (fid, total_wins, total_earnings)
  VALUES (winner_fid_param, 1, prize_amount)
  ON CONFLICT (fid) DO UPDATE SET
    total_wins = users.total_wins + 1,
    total_earnings = users.total_earnings + prize_amount,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Insert a sample round for testing
INSERT INTO rounds (theme, ends_at, prize_pool, status)
VALUES ('Roast your own portfolio 🤡', NOW() + INTERVAL '24 hours', 50000, 'active')
ON CONFLICT DO NOTHING;
