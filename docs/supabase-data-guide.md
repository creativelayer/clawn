# Clown Roast Battle — Supabase Data Layer Guide

> Last updated: 2026-02-03

---

## 1. Why Supabase Fits

| Need | Supabase Feature |
|------|-----------------|
| Structured game data (users, rounds, entries) | Full Postgres database with 500 MB free |
| Live round updates (open → judging → complete) | Realtime Postgres Changes + Broadcast |
| Secure API without custom backend | Auto-generated REST API + Row Level Security |
| Serverless logic (judging, prize distribution) | Edge Functions (Deno) or Vercel API routes |
| Auth integration | Custom JWT / third-party auth (Farcaster SIWF) |
| Leaderboards & analytics | Postgres views, indexes, window functions |

**Key advantage:** Supabase gives us a production Postgres + Realtime + Auth + API layer with zero backend code. The auto-generated REST API means our Next.js app talks directly to the database (gated by RLS), while Edge Functions handle privileged operations like judging and prize distribution.

---

## 2. Full SQL Schema

### 2.1 Enums

```sql
-- Round lifecycle states
CREATE TYPE round_state AS ENUM ('open', 'closed', 'judging', 'complete', 'cancelled');

-- Transaction types
CREATE TYPE tx_type AS ENUM ('entry_fee', 'prize_payout', 'refund');

-- Transaction status
CREATE TYPE tx_status AS ENUM ('pending', 'confirmed', 'failed');
```

### 2.2 Users

```sql
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid        BIGINT UNIQUE NOT NULL,              -- Farcaster ID (primary identifier)
  wallet_address TEXT NOT NULL,                     -- Base wallet for $CLAWN
  display_name   TEXT,
  pfp_url        TEXT,
  total_wins     INT DEFAULT 0,
  total_earned   NUMERIC(20,6) DEFAULT 0,          -- lifetime $CLAWN earned
  current_streak INT DEFAULT 0,
  best_streak    INT DEFAULT 0,
  clown_title    TEXT DEFAULT 'Newbie Clown',       -- dynamic rank title
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_fid ON users (fid);
CREATE INDEX idx_users_total_wins ON users (total_wins DESC);
CREATE INDEX idx_users_total_earned ON users (total_earned DESC);
```

### 2.3 Rounds

```sql
CREATE TABLE rounds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fortune_text        TEXT NOT NULL,                -- the fortune/prompt for the round
  state               round_state DEFAULT 'open',
  entry_fee           NUMERIC(20,6) NOT NULL,       -- $CLAWN cost to enter
  prize_pool_amount   NUMERIC(20,6) DEFAULT 0,      -- accumulates as entries come in
  max_entries         INT DEFAULT 50,
  start_time          TIMESTAMPTZ DEFAULT now(),
  end_time            TIMESTAMPTZ,                   -- when submissions close
  judging_completed_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rounds_state ON rounds (state);
CREATE INDEX idx_rounds_start_time ON rounds (start_time DESC);
```

### 2.4 Entries

```sql
CREATE TABLE entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id       UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roast_text     TEXT NOT NULL,
  scores         JSONB,                            -- { "humor": 8, "creativity": 7, "savagery": 9, "relevance": 6 }
  total_score    NUMERIC(5,2),
  rank           INT,
  prize_amount   NUMERIC(20,6) DEFAULT 0,
  entry_tx_hash  TEXT,                              -- on-chain entry payment tx
  prize_tx_hash  TEXT,                              -- on-chain prize payout tx
  created_at     TIMESTAMPTZ DEFAULT now(),

  UNIQUE(round_id, user_id)                        -- one entry per user per round
);

CREATE INDEX idx_entries_round_id ON entries (round_id);
CREATE INDEX idx_entries_user_id ON entries (user_id);
CREATE INDEX idx_entries_total_score ON entries (total_score DESC NULLS LAST);
CREATE INDEX idx_entries_round_rank ON entries (round_id, rank) WHERE rank IS NOT NULL;
```

### 2.5 Transactions

```sql
CREATE TABLE transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       tx_type NOT NULL,
  user_fid   BIGINT NOT NULL,
  round_id   UUID REFERENCES rounds(id),
  amount     NUMERIC(20,6) NOT NULL,
  token      TEXT DEFAULT 'CLAWN',
  tx_hash    TEXT UNIQUE,
  chain_id   INT DEFAULT 8453,                     -- Base mainnet
  status     tx_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_user_fid ON transactions (user_fid);
CREATE INDEX idx_transactions_tx_hash ON transactions (tx_hash);
CREATE INDEX idx_transactions_round_id ON transactions (round_id);
CREATE INDEX idx_transactions_status ON transactions (status) WHERE status = 'pending';
```

### 2.6 Triggers

```sql
-- Auto-update updated_at on users
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-increment prize pool when entry confirmed
CREATE OR REPLACE FUNCTION increment_prize_pool()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE rounds
  SET prize_pool_amount = prize_pool_amount + (
    SELECT entry_fee FROM rounds WHERE id = NEW.round_id
  )
  WHERE id = NEW.round_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entry_added_to_pool
  AFTER INSERT ON entries
  FOR EACH ROW EXECUTE FUNCTION increment_prize_pool();
```

---

## 3. Row Level Security (RLS)

Enable RLS on all tables:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
```

### Policies

```sql
-- USERS: anyone can read profiles, users update only their own
CREATE POLICY "Public read users"  ON users FOR SELECT USING (true);
CREATE POLICY "Users update own"   ON users FOR UPDATE USING (auth.uid() = id);

-- ROUNDS: anyone can read
CREATE POLICY "Public read rounds" ON rounds FOR SELECT USING (true);
-- Only service_role (admin/Edge Functions) can insert/update rounds
-- No user-level INSERT/UPDATE policy needed — handled via service_role key

-- ENTRIES: anyone can read (leaderboard), users insert only their own
CREATE POLICY "Public read entries" ON entries FOR SELECT USING (true);
CREATE POLICY "Users insert own entry" ON entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Only service_role can UPDATE entries (scores, rank, prize)

-- TRANSACTIONS: users read only their own
CREATE POLICY "Users read own txns" ON transactions FOR SELECT
  USING (user_fid = (SELECT fid FROM users WHERE id = auth.uid()));
-- Only service_role can INSERT/UPDATE transactions
```

**Key principle:** The client (anon key) can read public data and insert entries. All privileged operations (scoring, prize distribution, round management) use the `service_role` key from Edge Functions or Vercel API routes — never exposed to the client.

---

## 4. Realtime Subscriptions

Enable Realtime on tables via Supabase Dashboard → Database → Replication, or:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE entries;
```

### Client-side subscriptions

```typescript
// Subscribe to current round state changes
const roundChannel = supabase
  .channel('round-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'rounds',
      filter: `id=eq.${roundId}`,
    },
    (payload) => {
      // payload.new.state → 'open' | 'closed' | 'judging' | 'complete'
      setRound(payload.new)
    }
  )
  .subscribe()

// Subscribe to new entries (live entry count)
const entriesChannel = supabase
  .channel('entry-feed')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'entries',
      filter: `round_id=eq.${roundId}`,
    },
    (payload) => {
      setEntryCount((c) => c + 1)
    }
  )
  .subscribe()
```

### Broadcast for ephemeral events

Use Broadcast for events that don't need persistence (e.g., "someone is typing a roast"):

```typescript
const channel = supabase.channel('round:live')
channel.send({
  type: 'broadcast',
  event: 'typing',
  payload: { userId, displayName },
})
```

---

## 5. Edge Functions vs Vercel API Routes

| Concern | Supabase Edge Functions | Vercel API Routes |
|---------|------------------------|-------------------|
| Runtime | Deno (TypeScript) | Node.js (TypeScript) |
| Cold start | ~50-200ms | ~200-500ms (serverless) |
| Proximity to DB | Same infrastructure | External connection |
| Deployment | `supabase functions deploy` | `git push` (with app) |
| Secrets | `supabase secrets set` | Vercel env vars |
| Long-running | No (max ~150s) | No (max 60s on free) |
| DB access | Direct via service_role | Via Supabase client |

### Recommendation: **Use Vercel API Routes**

Since we're already on Next.js/Vercel, keep all server logic in one place:

- **Round lifecycle** → Vercel cron job (`vercel.json` cron) or API route triggered by client
- **Chain watcher** → Vercel API route polled by cron, or webhook from Alchemy/QuickNode
- **AI judge** → Vercel API route (calls OpenAI/Claude, updates DB via service_role)
- **Prize distribution** → Vercel API route (signs tx with Privy wallet, updates DB)

Use Supabase Edge Functions only if you need database webhooks (trigger function on INSERT).

### Example: Vercel API route for judging

```typescript
// app/api/judge/route.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // privileged!
)

export async function POST(req: Request) {
  const { roundId } = await req.json()
  // Verify round is in 'closed' state
  // Fetch all entries
  // Call AI to score each roast
  // Update entries with scores + rank
  // Update round state to 'complete'
  // Trigger prize distribution
}
```

---

## 6. Supabase Client Setup for Next.js

Install:
```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 6.1 Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # server-only, never expose
```

### 6.2 Client-side (browser)

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### 6.3 Server-side (Server Components, Route Handlers)

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

### 6.4 Admin client (service_role)

```typescript
// lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

### 6.5 Auth with Farcaster

Since Supabase doesn't natively support Farcaster SIWF, use a custom JWT approach:

1. User signs in with Farcaster (SIWF) on the client
2. Send the signed message to a Vercel API route
3. Verify the Farcaster signature server-side
4. Upsert the user in our `users` table
5. Issue a Supabase custom JWT using `jsonwebtoken` + your project's JWT secret
6. Client uses this JWT with `supabase.auth.setSession()`

```typescript
// app/api/auth/farcaster/route.ts
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const { fid, walletAddress, displayName, pfpUrl, signature } = await req.json()

  // TODO: verify Farcaster SIWF signature

  // Upsert user
  const { data: user } = await supabaseAdmin
    .from('users')
    .upsert({ fid, wallet_address: walletAddress, display_name: displayName, pfp_url: pfpUrl }, { onConflict: 'fid' })
    .select('id')
    .single()

  // Issue Supabase-compatible JWT
  const token = jwt.sign(
    {
      sub: user!.id,                          // maps to auth.uid() in RLS
      role: 'authenticated',
      aud: 'authenticated',
      fid,
    },
    process.env.SUPABASE_JWT_SECRET!,
    { expiresIn: '7d' }
  )

  return Response.json({ access_token: token })
}
```

---

## 7. Migration Strategy

Use Supabase CLI for migrations:

```bash
# Init (once)
supabase init

# Create a migration
supabase migration new create_initial_schema

# Edit: supabase/migrations/20260203_create_initial_schema.sql
# (paste schema SQL from section 2)

# Apply locally
supabase db reset

# Push to remote
supabase db push

# Diff remote vs local
supabase db diff
```

Store migrations in `supabase/migrations/` in the git repo. Each schema change gets a new timestamped migration file.

---

## 8. Example Queries

### Get current round with entry count

```typescript
const { data: round } = await supabase
  .from('rounds')
  .select('*, entries(count)')
  .eq('state', 'open')
  .order('start_time', { ascending: false })
  .limit(1)
  .single()

// round.entries[0].count → number of entries
```

### Submit entry

```typescript
const { error } = await supabase
  .from('entries')
  .insert({
    round_id: roundId,
    user_id: userId,        // must match auth.uid() per RLS
    roast_text: roastText,
    entry_tx_hash: txHash,
  })
```

### Leaderboard — All-time top clowns

```typescript
const { data } = await supabase
  .from('users')
  .select('fid, display_name, pfp_url, total_wins, total_earned, clown_title, best_streak')
  .order('total_wins', { ascending: false })
  .limit(50)
```

### Leaderboard — Weekly (wins this week)

```typescript
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

const { data } = await supabase
  .from('entries')
  .select('user_id, users(display_name, pfp_url, fid)')
  .eq('rank', 1)
  .gte('created_at', weekAgo)
  // Then aggregate client-side or use an RPC/view:

// Better: create a Postgres function
// CREATE FUNCTION weekly_leaderboard() ...
```

### Get user profile with stats

```typescript
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('fid', targetFid)
  .single()

// Recent entries
const { data: recentEntries } = await supabase
  .from('entries')
  .select('*, rounds(fortune_text, state)')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(10)
```

### Subscribe to round updates in realtime

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`round:${roundId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'rounds',
      filter: `id=eq.${roundId}`,
    }, (payload) => {
      setRound(payload.new as Round)
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'entries',
      filter: `round_id=eq.${roundId}`,
    }, () => {
      setEntryCount(c => c + 1)
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [roundId])
```

---

## 9. Cost Estimation — Free Tier Viability

### Supabase Free Tier limits

| Resource | Free Limit | Our MVP Usage (est.) |
|----------|-----------|---------------------|
| Database size | 500 MB | < 50 MB (text-heavy, small) |
| Auth MAUs | 50,000 | < 500 |
| Realtime connections | 200 concurrent | < 50 |
| Edge Function invocations | 500K/month | ~5K (if used) |
| Bandwidth | 5 GB | < 2 GB |
| API requests | Unlimited | ✅ |
| Pausing | After 1 week inactivity | ⚠️ Need periodic ping |

### Verdict: **Yes, free tier is fine for MVP**

The only risk is auto-pausing after 7 days of inactivity. Set up a simple cron ping (Vercel cron or GitHub Actions) to keep it alive.

When scaling beyond MVP (~1K+ DAU), upgrade to Pro ($25/mo) for:
- No pausing
- 8 GB database
- 250 GB bandwidth
- 100K auth MAUs

---

## 10. Architecture Summary

```
┌─────────────────┐     ┌──────────────────────┐
│  Next.js App     │────▶│  Supabase (Postgres)  │
│  (Vercel)        │     │  + Realtime            │
│                  │     │  + RLS                 │
│  - Client pages  │     └──────────────────────┘
│  - API routes:   │              ▲
│    /api/judge    │              │ service_role
│    /api/prize    │──────────────┘
│    /api/auth     │
│    /api/cron     │──────▶ Base chain (verify $CLAWN txs)
└─────────────────┘
```

**Data flow:**
1. User authenticates via Farcaster SIWF → custom JWT issued
2. User pays $CLAWN on Base → tx hash submitted with entry
3. Vercel cron/webhook verifies tx on-chain → confirms entry
4. Round closes → Vercel API route triggers AI judge
5. AI scores entries → ranks updated → prizes distributed on-chain
6. All state changes propagate via Supabase Realtime to connected clients
