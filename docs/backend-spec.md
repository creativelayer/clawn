# 🤡 Clown Roast Battle — Backend Architecture

> Farcaster mini app where players pay $CLAWN to enter roast rounds, AI judges the roasts, and winners take the prize pool.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 20+ | Already in ecosystem, TS support |
| Framework | Hono | Lightweight, edge-ready, fast |
| ORM | Drizzle | Type-safe, thin, good PostgreSQL support |
| Database | PostgreSQL 15 (Neon free tier) | Serverless Postgres, generous free tier |
| Cache | Upstash Redis (free tier) | Leaderboard caching, rate limiting |
| Hosting | Railway / Render free tier | Or Cloudflare Workers if going edge |
| Chain | viem + Base RPC (Alchemy free) | $CLAWN is on Base |
| AI | Claude API (Anthropic) | Judging engine |
| Cron | Built-in (node-cron) or Railway cron | Round scheduling |

**Estimated MVP cost: $0/mo** (all free tiers)

---

## 1. Database Schema (PostgreSQL)

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-----------------------------------------------------------
-- CLOWN TITLES (seed data)
-----------------------------------------------------------
CREATE TABLE clown_titles (
  id            SERIAL PRIMARY KEY,
  min_wins      INT NOT NULL UNIQUE,
  title         TEXT NOT NULL
);

INSERT INTO clown_titles (min_wins, title) VALUES
  (0,   'Circus Reject'),
  (1,   'Novice Honker'),
  (3,   'Balloon Twister'),
  (5,   'Pie Face Apprentice'),
  (10,  'Seltzer Sniper'),
  (20,  'Ring Leader'),
  (35,  'Big Top Bully'),
  (50,  'Supreme Honker'),
  (75,  'Pie Face Champion'),
  (100, 'Legendary Clown Lord');

-----------------------------------------------------------
-- USERS
-----------------------------------------------------------
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  fid             BIGINT NOT NULL UNIQUE,          -- Farcaster FID
  wallet_address  TEXT NOT NULL,                    -- Checksum address on Base
  display_name    TEXT,
  pfp_url         TEXT,
  total_wins      INT NOT NULL DEFAULT 0,
  total_earned    NUMERIC(28,18) NOT NULL DEFAULT 0, -- $CLAWN (18 decimals)
  rounds_entered  INT NOT NULL DEFAULT 0,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_fid ON users(fid);
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_wins ON users(total_wins DESC);

-----------------------------------------------------------
-- STREAKS
-----------------------------------------------------------
CREATE TABLE streaks (
  user_id         INT PRIMARY KEY REFERENCES users(id),
  current_streak  INT NOT NULL DEFAULT 0,
  best_streak     INT NOT NULL DEFAULT 0,
  last_round_id   INT,                             -- FK added after rounds table
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-----------------------------------------------------------
-- ROUNDS
-----------------------------------------------------------
CREATE TYPE round_state AS ENUM ('open', 'judging', 'complete', 'cancelled');

CREATE TABLE rounds (
  id              SERIAL PRIMARY KEY,
  prompt          TEXT NOT NULL,                    -- The fortune/roast prompt
  state           round_state NOT NULL DEFAULT 'open',
  entry_fee       NUMERIC(28,18) NOT NULL,         -- $CLAWN amount
  prize_pool      NUMERIC(28,18) NOT NULL DEFAULT 0,
  entry_count     INT NOT NULL DEFAULT 0,
  min_entries     INT NOT NULL DEFAULT 2,          -- Min to run judging
  max_entries     INT NOT NULL DEFAULT 50,         -- Cap per round
  start_time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time        TIMESTAMPTZ NOT NULL,            -- When submissions close
  judging_time    TIMESTAMPTZ,                     -- When judging started
  results_time    TIMESTAMPTZ,                     -- When results posted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rounds_state ON rounds(state);
CREATE INDEX idx_rounds_end ON rounds(end_time);

ALTER TABLE streaks ADD CONSTRAINT fk_streaks_round
  FOREIGN KEY (last_round_id) REFERENCES rounds(id);

-----------------------------------------------------------
-- ENTRIES
-----------------------------------------------------------
CREATE TABLE entries (
  id              SERIAL PRIMARY KEY,
  round_id        INT NOT NULL REFERENCES rounds(id),
  user_id         INT NOT NULL REFERENCES users(id),
  roast_text      TEXT NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Scores (filled after judging)
  score_humor     NUMERIC(5,2),    -- 0-100
  score_creativity NUMERIC(5,2),
  score_relevance NUMERIC(5,2),
  score_savagery  NUMERIC(5,2),
  total_score     NUMERIC(5,2),    -- Weighted composite
  rank            INT,
  prize_amount    NUMERIC(28,18) DEFAULT 0,
  prize_tx_hash   TEXT,            -- Prize distribution tx
  entry_tx_hash   TEXT NOT NULL,   -- Payment tx that confirmed entry
  ai_feedback     TEXT,            -- One-liner feedback from judge
  UNIQUE(round_id, user_id)       -- One entry per user per round
);

CREATE INDEX idx_entries_round ON entries(round_id);
CREATE INDEX idx_entries_user ON entries(user_id);
CREATE INDEX idx_entries_score ON entries(round_id, total_score DESC);

-----------------------------------------------------------
-- TRANSACTIONS
-----------------------------------------------------------
CREATE TYPE tx_type AS ENUM ('entry', 'prize', 'burn', 'treasury');
CREATE TYPE tx_status AS ENUM ('pending', 'confirmed', 'failed');

CREATE TABLE transactions (
  id              SERIAL PRIMARY KEY,
  type            tx_type NOT NULL,
  user_id         INT REFERENCES users(id),
  round_id        INT REFERENCES rounds(id),
  amount          NUMERIC(28,18) NOT NULL,
  token           TEXT NOT NULL DEFAULT '0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1',
  tx_hash         TEXT NOT NULL UNIQUE,
  from_address    TEXT NOT NULL,
  to_address      TEXT NOT NULL,
  status          tx_status NOT NULL DEFAULT 'pending',
  block_number    BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);

CREATE INDEX idx_tx_hash ON transactions(tx_hash);
CREATE INDEX idx_tx_user ON transactions(user_id);
CREATE INDEX idx_tx_round ON transactions(round_id);
CREATE INDEX idx_tx_status ON transactions(status) WHERE status = 'pending';
```

---

## 2. API Endpoints

Base URL: `https://api.clownroast.lol/v1`

### Rounds

```
GET  /rounds/current
```
Returns the active round (state = 'open') with time remaining and entry count.

```json
{
  "id": 42,
  "prompt": "Roast someone who still uses Internet Explorer in 2026",
  "state": "open",
  "entry_fee": "1000000000000000000000",
  "prize_pool": "15000000000000000000000",
  "entry_count": 15,
  "max_entries": 50,
  "start_time": "2026-02-03T00:00:00Z",
  "end_time": "2026-02-03T01:00:00Z",
  "time_remaining_seconds": 1842
}
```

```
GET  /rounds/:id
```
Round details + all entries (scores visible only if state = 'complete').

```
GET  /rounds/:id/results
```
Final results with rankings, scores, prize amounts.

```
POST /rounds/:id/enter
```
Submit a roast. Requires Farcaster auth (signed message).

**Request:**
```json
{
  "roast_text": "Your code is so bad, even ChatGPT refuses to debug it.",
  "tx_hash": "0xabc123...",
  "fid": 12345,
  "signature": "0x..."
}
```

**Flow:**
1. Verify Farcaster signature (FID owns this request)
2. Verify tx_hash is a valid $CLAWN transfer to prize pool contract for correct amount
3. Wait for tx confirmation (or accept if already confirmed)
4. Create entry record
5. Update round prize_pool and entry_count

**Response:** `201 Created` with entry ID, or `402` if payment not found/confirmed.

### Leaderboard

```
GET /leaderboard?period=all&limit=50&offset=0
```
Periods: `all`, `weekly`, `monthly`

```json
{
  "players": [
    {
      "rank": 1,
      "fid": 12345,
      "display_name": "roastmaster.eth",
      "pfp_url": "...",
      "total_wins": 23,
      "total_earned": "50000000000000000000000",
      "current_streak": 5,
      "title": "Supreme Honker"
    }
  ],
  "total": 312
}
```

### Users

```
GET /users/:fid
```
Profile + recent round history (last 10).

```
GET /users/:fid/stats
```
Detailed stats: wins, streaks, earnings, best scores, favorite prompts.

### Admin (API key auth)

```
POST /rounds/create        — Create a new round with prompt
POST /rounds/:id/judge     — Trigger AI judging
POST /rounds/:id/distribute — Trigger prize distribution
POST /rounds/:id/cancel    — Cancel round, refund entries
```

### Auth

Farcaster mini apps use **Sign In With Farcaster (SIWF)**. The app sends a signed message from the user's FID. Backend verifies via `@farcaster/hub-nodejs`.

```typescript
// Middleware: verify Farcaster auth
async function verifyFarcasterAuth(c: Context, next: Next) {
  const { fid, signature, message } = c.req.header();
  const isValid = await verifySignature({ fid, signature, message });
  if (!isValid) return c.json({ error: 'Invalid signature' }, 401);
  c.set('fid', Number(fid));
  await next();
}
```

---

## 3. Backend Services

### 3.1 Round Manager

Runs on a cron schedule. Creates rounds, manages state transitions.

```typescript
// Cron: every hour (or configurable)
async function roundManagerTick() {
  // 1. Close expired open rounds
  const expired = await db.query(`
    UPDATE rounds SET state = 'judging', judging_time = NOW()
    WHERE state = 'open' AND end_time <= NOW()
    RETURNING id, entry_count, min_entries
  `);

  for (const round of expired.rows) {
    if (round.entry_count < round.min_entries) {
      // Cancel and refund
      await cancelRound(round.id);
    } else {
      // Queue judging
      await judgeQueue.add({ roundId: round.id });
    }
  }

  // 2. Create next round if none is open
  const openRound = await db.query(
    `SELECT id FROM rounds WHERE state = 'open' LIMIT 1`
  );
  if (openRound.rowCount === 0) {
    await createNewRound();
  }
}

async function createNewRound() {
  const prompt = await generatePrompt(); // AI-generated or from curated list
  await db.query(`
    INSERT INTO rounds (prompt, entry_fee, end_time)
    VALUES ($1, $2, NOW() + INTERVAL '1 hour')
  `, [prompt, '1000000000000000000000']); // 1000 $CLAWN
}
```

### 3.2 Chain Watcher

Monitors $CLAWN ERC20 Transfer events to the prize pool address.

```typescript
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const CLAWN = '0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1';
const PRIZE_POOL = '0x...'; // Prize pool contract or multisig

const client = createPublicClient({ chain: base, transport: http() });

// Watch for Transfer events to prize pool
client.watchContractEvent({
  address: CLAWN,
  abi: parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']),
  eventName: 'Transfer',
  args: { to: PRIZE_POOL },
  onLogs: async (logs) => {
    for (const log of logs) {
      await processTransfer({
        from: log.args.from,
        to: log.args.to,
        amount: log.args.value,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      });
    }
  },
});

// Also: verify tx_hash submitted by users (backup confirmation)
async function verifyEntryPayment(txHash: string, expectedAmount: bigint): Promise<boolean> {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') return false;

  const transferLog = receipt.logs.find(l =>
    l.address.toLowerCase() === CLAWN.toLowerCase()
  );
  // Decode and verify amount, recipient
  return true;
}
```

### 3.3 AI Judge

See Section 5 for full details. Core flow:

```typescript
async function judgeRound(roundId: number) {
  const round = await getRound(roundId);
  const entries = await getEntries(roundId);

  // Shuffle entries to prevent position bias
  const shuffled = shuffle(entries);

  // Score each entry independently (no comparison bias)
  const scores = await Promise.all(
    shuffled.map(entry => scoreEntry(round.prompt, entry.roast_text))
  );

  // Apply scores, compute ranks
  const ranked = applyScoresAndRank(entries, scores);

  // Update DB
  for (const entry of ranked) {
    await db.query(`
      UPDATE entries
      SET score_humor = $1, score_creativity = $2, score_relevance = $3,
          score_savagery = $4, total_score = $5, rank = $6, ai_feedback = $7
      WHERE id = $8
    `, [entry.humor, entry.creativity, entry.relevance, entry.savagery,
        entry.total, entry.rank, entry.feedback, entry.id]);
  }

  // Determine prizes
  await calculatePrizes(roundId, ranked);

  // Mark complete
  await db.query(`
    UPDATE rounds SET state = 'complete', results_time = NOW()
    WHERE id = $1
  `, [roundId]);
}
```

### 3.4 Prize Distributor

Prize split (configurable):
- 🥇 1st place: 50% of pool
- 🥈 2nd place: 25% of pool
- 🥉 3rd place: 10% of pool
- 🔥 Burn: 10% (sent to dead address)
- 🏦 Treasury: 5% (operational costs)

```typescript
async function distributePrizes(roundId: number) {
  const round = await getRound(roundId);
  const winners = await db.query(`
    SELECT e.*, u.wallet_address FROM entries e
    JOIN users u ON e.user_id = u.id
    WHERE e.round_id = $1 AND e.rank <= 3
    ORDER BY e.rank
  `, [roundId]);

  const pool = BigInt(round.prize_pool);
  const splits = [
    { rank: 1, pct: 50n },
    { rank: 2, pct: 25n },
    { rank: 3, pct: 10n },
  ];

  // Use agent wallet (Privy) to call prize pool contract
  for (const winner of winners.rows) {
    const split = splits.find(s => s.rank === winner.rank);
    const amount = (pool * split.pct) / 100n;

    const txHash = await sendPrize(winner.wallet_address, amount);

    await db.query(`
      UPDATE entries SET prize_amount = $1, prize_tx_hash = $2
      WHERE id = $3
    `, [amount.toString(), txHash, winner.id]);

    // Update user stats
    if (winner.rank === 1) {
      await db.query(`
        UPDATE users SET total_wins = total_wins + 1,
          total_earned = total_earned + $1, updated_at = NOW()
        WHERE id = $2
      `, [amount.toString(), winner.user_id]);
    }
  }

  // Burn 10%
  const burnAmount = (pool * 10n) / 100n;
  await sendBurn(burnAmount);

  // Treasury 5%
  const treasuryAmount = (pool * 5n) / 100n;
  await sendTreasury(treasuryAmount);
}
```

### 3.5 Notification Service

Uses Farcaster direct casts or frame notifications.

```typescript
async function notifyWinners(roundId: number) {
  const winners = await getWinners(roundId);
  for (const w of winners) {
    await sendFarcasterNotification(w.fid, {
      title: `🤡 You placed #${w.rank}!`,
      body: `You won ${formatClawn(w.prize_amount)} $CLAWN in Round #${roundId}!`,
      url: `https://clownroast.lol/rounds/${roundId}`,
    });
  }
}

// Notify all participants when results are in
async function notifyRoundComplete(roundId: number) {
  const participants = await getParticipants(roundId);
  for (const p of participants) {
    await sendFarcasterNotification(p.fid, {
      title: '🎪 Round results are in!',
      body: `You ranked #${p.rank} in Round #${roundId}. Check your scores!`,
      url: `https://clownroast.lol/rounds/${roundId}`,
    });
  }
}
```

---

## 4. Project Structure

```
clown-roast-battle/
├── src/
│   ├── index.ts              # Hono app entry
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema
│   │   ├── migrate.ts        # Migration runner
│   │   └── queries.ts        # Reusable query functions
│   ├── routes/
│   │   ├── rounds.ts         # Round endpoints
│   │   ├── users.ts          # User endpoints
│   │   ├── leaderboard.ts    # Leaderboard endpoint
│   │   └── admin.ts          # Admin endpoints
│   ├── services/
│   │   ├── round-manager.ts  # Round lifecycle
│   │   ├── chain-watcher.ts  # On-chain monitoring
│   │   ├── ai-judge.ts       # LLM scoring
│   │   ├── prize-dist.ts     # Prize distribution
│   │   └── notifications.ts  # Farcaster notifications
│   ├── auth/
│   │   └── farcaster.ts      # SIWF verification
│   └── lib/
│       ├── wallet.ts         # Privy agent wallet
│       └── config.ts         # Env/config
├── drizzle/                   # Migration files
├── package.json
├── tsconfig.json
└── .env
```

---

## 5. AI Judging Details

### Scoring Rubric

| Category | Weight | What It Measures |
|----------|--------|-----------------|
| Humor | 40% | Is it genuinely funny? Timing, punchline, wit |
| Creativity | 30% | Original angle, unexpected takes, wordplay |
| Relevance | 20% | Does it actually address the prompt? |
| Savagery | 10% | How hard does it hit? Boldness factor |

**Total score** = `(humor × 0.4) + (creativity × 0.3) + (relevance × 0.2) + (savagery × 0.1)`

Each category scored 0–100.

### Judging Prompt

```typescript
const JUDGE_SYSTEM_PROMPT = `You are the AI Judge for Clown Roast Battle, a comedy roast competition.

You score roasts on a 0-100 scale across four categories. Be fair, consistent, and brutally honest.

SCORING GUIDE:
- 0-20: Terrible. Not funny, lazy, or off-topic.
- 21-40: Below average. Predictable, weak delivery.
- 41-60: Decent. Got a chuckle but nothing special.
- 61-80: Good. Genuinely funny, clever angle.
- 81-100: Outstanding. Laugh-out-loud, brilliant, memorable.

RULES:
- Score ONLY the roast text. Ignore usernames or metadata.
- Each roast is independent. Do not compare to others.
- Penalize heavily: copy-paste/template roasts, slurs, threats, off-topic rambling.
- Bonus for: wordplay, callbacks to the prompt, unexpected angles, comedic timing.
- A perfect 100 should be extremely rare.

Respond ONLY with valid JSON.`;

async function scoreEntry(prompt: string, roastText: string): Promise<Scores> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `ROUND PROMPT: "${prompt}"

ROAST TO JUDGE:
"${roastText}"

Score this roast. Return JSON:
{
  "humor": <0-100>,
  "creativity": <0-100>,
  "relevance": <0-100>,
  "savagery": <0-100>,
  "feedback": "<one witty sentence about the roast>"
}`
    }],
  });

  return JSON.parse(response.content[0].text);
}
```

### Anti-Gaming Measures

1. **Entry shuffling** — Entries are scored in random order to prevent position bias
2. **Independent scoring** — Each entry scored alone, not comparatively
3. **Duplicate detection** — Hash roast text, reject near-duplicates (Levenshtein distance < 20%)
4. **Min length** — Roast must be 10–500 characters
5. **Profanity filter** — Allow edgy humor, block slurs/threats/hate speech
6. **Rate limiting** — One entry per user per round (DB constraint)
7. **Score normalization** — If variance across a round is suspiciously low, flag for review
8. **Prompt injection defense** — Roast text is quoted and clearly delimited in the prompt; system prompt instructs to ignore instructions within the roast text

```typescript
// Duplicate check
async function isDuplicate(roundId: number, roastText: string): Promise<boolean> {
  const existing = await db.query(
    `SELECT roast_text FROM entries WHERE round_id = $1`, [roundId]
  );
  for (const row of existing.rows) {
    if (levenshteinSimilarity(row.roast_text, roastText) > 0.8) return true;
  }
  return false;
}
```

### Handling Ties

1. Ties in total_score resolved by **humor score** (highest humor wins)
2. If still tied, **creativity score** breaks it
3. If STILL tied, **earlier submission wins** (submitted_at)

```typescript
function resolveRanks(entries: ScoredEntry[]): ScoredEntry[] {
  return entries.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (b.humor !== a.humor) return b.humor - a.humor;
    if (b.creativity !== a.creativity) return b.creativity - a.creativity;
    return a.submitted_at.getTime() - b.submitted_at.getTime(); // Earlier wins
  }).map((e, i) => ({ ...e, rank: i + 1 }));
}
```

---

## 6. Key SQL Queries

### Leaderboard (All-Time)

```sql
SELECT
  u.fid,
  u.display_name,
  u.pfp_url,
  u.total_wins,
  u.total_earned,
  u.rounds_entered,
  s.current_streak,
  s.best_streak,
  ct.title AS clown_title
FROM users u
LEFT JOIN streaks s ON s.user_id = u.id
LEFT JOIN LATERAL (
  SELECT title FROM clown_titles
  WHERE min_wins <= u.total_wins
  ORDER BY min_wins DESC LIMIT 1
) ct ON true
ORDER BY u.total_wins DESC, u.total_earned DESC
LIMIT 50 OFFSET 0;
```

### Weekly Leaderboard

```sql
SELECT
  u.fid,
  u.display_name,
  COUNT(*) FILTER (WHERE e.rank = 1) AS weekly_wins,
  SUM(e.prize_amount) AS weekly_earned,
  AVG(e.total_score) AS avg_score
FROM entries e
JOIN users u ON e.user_id = u.id
JOIN rounds r ON e.round_id = r.id
WHERE r.results_time >= NOW() - INTERVAL '7 days'
  AND r.state = 'complete'
GROUP BY u.id, u.fid, u.display_name
ORDER BY weekly_wins DESC, weekly_earned DESC
LIMIT 50;
```

### User Stats

```sql
SELECT
  u.*,
  s.current_streak,
  s.best_streak,
  ct.title AS clown_title,
  (SELECT COUNT(*) FROM entries e
   JOIN rounds r ON e.round_id = r.id
   WHERE e.user_id = u.id AND r.state = 'complete') AS rounds_completed,
  (SELECT AVG(e.total_score) FROM entries e
   JOIN rounds r ON e.round_id = r.id
   WHERE e.user_id = u.id AND r.state = 'complete') AS avg_score,
  (SELECT MAX(e.total_score) FROM entries e
   WHERE e.user_id = u.id) AS best_score
FROM users u
LEFT JOIN streaks s ON s.user_id = u.id
LEFT JOIN LATERAL (
  SELECT title FROM clown_titles
  WHERE min_wins <= u.total_wins
  ORDER BY min_wins DESC LIMIT 1
) ct ON true
WHERE u.fid = $1;
```

### User Round History

```sql
SELECT
  r.id AS round_id,
  r.prompt,
  r.state,
  r.results_time,
  e.roast_text,
  e.total_score,
  e.rank,
  e.prize_amount,
  e.ai_feedback,
  (SELECT COUNT(*) FROM entries WHERE round_id = r.id) AS total_entries
FROM entries e
JOIN rounds r ON e.round_id = r.id
WHERE e.user_id = (SELECT id FROM users WHERE fid = $1)
ORDER BY r.start_time DESC
LIMIT 20 OFFSET $2;
```

### Streak Update (after round completes)

```sql
-- For each participant in a completed round:
WITH round_result AS (
  SELECT user_id, rank FROM entries WHERE round_id = $1
)
UPDATE streaks s SET
  current_streak = CASE
    WHEN rr.rank = 1 THEN s.current_streak + 1
    ELSE 0
  END,
  best_streak = GREATEST(s.best_streak, CASE
    WHEN rr.rank = 1 THEN s.current_streak + 1
    ELSE s.best_streak
  END),
  last_round_id = $1,
  updated_at = NOW()
FROM round_result rr
WHERE s.user_id = rr.user_id;
```

### Active Round with Entry Count

```sql
SELECT
  r.*,
  EXTRACT(EPOCH FROM (r.end_time - NOW()))::int AS time_remaining_seconds,
  COALESCE(json_agg(
    json_build_object(
      'fid', u.fid,
      'display_name', u.display_name,
      'pfp_url', u.pfp_url,
      'submitted_at', e.submitted_at
    ) ORDER BY e.submitted_at
  ) FILTER (WHERE e.id IS NOT NULL), '[]') AS participants
FROM rounds r
LEFT JOIN entries e ON e.round_id = r.id
LEFT JOIN users u ON e.user_id = u.id
WHERE r.state = 'open'
GROUP BY r.id
ORDER BY r.start_time DESC
LIMIT 1;
```

---

## 7. Environment Variables

```env
DATABASE_URL=postgresql://...@...neon.tech/clownroast
REDIS_URL=redis://...@...upstash.io:6379
ANTHROPIC_API_KEY=sk-ant-...
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...
CLAWN_TOKEN=0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1
PRIZE_POOL_ADDRESS=0x...
TREASURY_ADDRESS=0x...
BURN_ADDRESS=0x000000000000000000000000000000000000dEaD
PRIVY_APP_ID=cml5l4y91011cju0breo5jagb
PRIVY_APP_SECRET=...
ADMIN_API_KEY=...
FARCASTER_HUB_URL=https://hub.farcaster.xyz
```

---

## 8. State Machine: Round Lifecycle

```
  ┌──────────┐   end_time reached    ┌──────────┐
  │   OPEN   │ ───────────────────▶  │ JUDGING  │
  └──────────┘                       └──────────┘
       │                                  │
       │ < min_entries                    │ AI scores complete
       ▼                                  ▼
  ┌───────────┐                     ┌───────────┐
  │ CANCELLED │                     │ COMPLETE  │
  │ (refunds) │                     │ (prizes)  │
  └───────────┘                     └───────────┘
```

Transitions are **idempotent** — calling `judge` on an already-judged round is a no-op.

---

## 9. Rate Limits & Security

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /rounds/:id/enter | 1 per round per user | Round duration |
| GET /rounds/* | 60 req | 1 min |
| GET /leaderboard | 30 req | 1 min |
| GET /users/* | 30 req | 1 min |
| Admin endpoints | 10 req | 1 min |

Use Upstash Redis for sliding window rate limiting.

**Additional security:**
- All admin endpoints require `X-Admin-Key` header
- All user-facing POST endpoints require Farcaster signature
- Input sanitization on roast text (strip HTML, limit length)
- CORS restricted to `https://clownroast.lol` and Warpcast origins
