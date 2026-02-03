# 🤡 Clown Roast Battle — Product Spec

**Version:** 1.0  
**Date:** 2026-02-02  
**Status:** Draft  

---

## 1. Overview

### Elevator Pitch

Clown Roast Battle is a Farcaster mini app where a deranged AI fortune teller serves up absurd clown-themed prompts, and players compete to write the funniest roast or comeback. An AI judge scores entries, winners take home $CLAWN prizes, and the best roasts get shared as viral Farcaster casts. Think Cards Against Humanity meets comedy open mic, powered by crypto degeneracy.

### Target Audience

- **Primary:** Farcaster power users who enjoy shitposting, memes, and social token games
- **Secondary:** $CLAWN holders looking for utility and entertainment
- **Tertiary:** Crypto-curious comedy fans discovering Farcaster through shared roasts

### Key Metrics

| Metric | Target (Month 1) | Target (Month 3) |
|--------|------------------|------------------|
| DAU | 200 | 1,000 |
| Rounds played/day | 10 | 50 |
| Avg entries/round | 8 | 15 |
| $CLAWN tx volume/week | 50M | 500M |
| Viral casts shared/day | 50 | 500 |

---

## 2. Core Loop

### Round Lifecycle

```
┌─────────────┐
│  PROMPT      │  Fortune teller generates absurd prompt
│  (0:00)      │  Round opens, timer starts
└──────┬───────┘
       ▼
┌─────────────┐
│  SUBMIT      │  Players write roasts (3-5 min window)
│  (0:00-5:00) │  Entry fee collected on submit
└──────┬───────┘
       ▼
┌─────────────┐
│  JUDGING     │  AI scores all entries (30s)
│  (5:00-5:30) │  Optional: audience vote boost
└──────┬───────┘
       ▼
┌─────────────┐
│  RESULTS     │  Winner announced, prizes distributed
│  (5:30+)     │  Share prompt appears
└──────┴───────┘
```

### Step-by-Step User Flow

1. **User opens mini app** → Home screen shows active round or countdown to next
2. **Prompt appears:** *"The fortune teller peers into the crystal ball and sees... a clown who quit their day job to become a crypto influencer. Roast them."*
3. **User taps "Enter the Ring" →** If first time, SDK `signin` triggers Farcaster auth
4. **Entry fee deducted** → 10,000 $CLAWN via SDK `sendToken` to prize pool address
5. **User writes roast** → 280-char limit, text input, submit button
6. **Timer expires** → Submissions close, "Judging" animation plays
7. **AI Judge evaluates** → Scores on humor (40%), creativity (30%), relevance (20%), savagery (10%)
8. **Results screen** → Top 3 shown with scores, winner highlighted
9. **Winner receives prize** → Auto-distributed from prize pool
10. **Share prompt** → Pre-composed cast with roast text, prompt, and mini app link

### Round Types

| Type | Frequency | Duration | Entry Fee | Prize Pool |
|------|-----------|----------|-----------|------------|
| **Quick Draw** | Every 30 min | 3 min submit | 10,000 CLAWN | Entry pool |
| **Daily Showdown** | 1/day (20:00 UTC) | 5 min submit | 50,000 CLAWN | Entry pool + 5M treasury bonus |
| **Weekly Championship** | Sundays 20:00 UTC | 10 min submit | 100,000 CLAWN | Entry pool + 20M treasury bonus |

### Edge Cases

- **0 entries:** Round cancelled, no fees collected (fees refunded if pre-collected)
- **1 entry:** Player wins by default, receives 50% of their fee back (rest to treasury)
- **Tie scores:** Prize split equally among tied players
- **Offensive content:** AI pre-screens submissions; flagged entries rejected with fee refunded
- **Network failure during submit:** Client retries 3x, shows error with "try next round" if failed
- **User submits then closes app:** Submission persists server-side, results viewable on return

---

## 3. Token Economics

### Token Details

- **Token:** $CLAWN
- **Address:** `0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1`
- **Chain:** Base (8453)
- **Total Supply:** 100,000,000,000 (100B)
- **CAIP-19:** `eip155:8453/erc20:0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1`
- **Treasury Wallet:** `0x79Bed28E6d195375C19e84350608eA3c4811D4B9` (~107M CLAWN at launch)

### Fee Distribution (per round)

Every entry fee is split as follows:

```
Entry Fee (100%)
├── 70%  → Prize Pool (distributed to winners)
├── 15%  → Treasury (funds future rounds, development)
├── 10%  → Burn (deflationary pressure)
└──  5%  → Streak Bonus Pool (rewards consecutive players)
```

### Prize Distribution (from the 70% prize pool)

| Place | Share of Prize Pool |
|-------|-------------------|
| 1st | 60% |
| 2nd | 25% |
| 3rd | 15% |

### Worked Example: Quick Draw Round with 10 Players

- Entry fee: 10,000 CLAWN × 10 players = **100,000 CLAWN collected**
- Prize pool: 70,000 CLAWN → 1st: 42,000 / 2nd: 17,500 / 3rd: 10,500
- Treasury: 15,000 CLAWN
- Burned: 10,000 CLAWN
- Streak pool: 5,000 CLAWN

### Treasury Sustainability

The treasury starts with ~107M CLAWN. Daily treasury bonus spend:

- Quick Draw rounds: 0 bonus (self-funded by entries)
- Daily Showdown: 5M CLAWN/day
- Weekly Championship: 20M CLAWN/week (~2.86M/day)

**Worst case burn rate:** ~7.86M CLAWN/day → treasury lasts ~13.6 days at zero revenue.

**With revenue:** Treasury receives 15% of all entry fees. Break-even requires:
- ~52.4M CLAWN in daily entry fees (15% × 52.4M ≈ 7.86M)
- At 10K fee per Quick Draw entry: ~5,240 entries/day across all Quick Draw rounds
- This is achievable at scale (48 rounds/day × ~110 entries/round)

**Safety valve:** If treasury drops below 20M CLAWN:
1. Reduce Daily Showdown bonus to 2M
2. Reduce Weekly Championship bonus to 10M
3. If below 5M: pause bonuses, rounds are entry-funded only

### Burn Mechanics

- 10% of every entry fee is sent to `0x000...dead` (standard burn)
- Estimated daily burn at target scale: ~1M+ CLAWN
- Over time creates meaningful deflation against 100B supply

---

## 4. User Roles

### Players

- Authenticated via Farcaster (`signin`)
- Can enter rounds, submit roasts, view history
- Must hold $CLAWN to participate (entry fee)
- Earn titles and climb leaderboard

### Spectators

- Can view active rounds, past results, leaderboard
- No Farcaster auth required for viewing
- See "Join the circus" CTA to become a player
- Can vote on roasts in audience-vote rounds (Phase 2)

### Token Holders (non-players)

- Can view the app for entertainment
- SDK `viewToken` and `swapToken` accessible from Buy screen
- Benefit from burn mechanics increasing scarcity

---

## 5. Screens / Views

### 5.1 Home Screen

```
┌────────────────────────────┐
│  🤡 CLOWN ROAST BATTLE     │
│                            │
│  [Active Round Card]       │
│  "Roast: A clown who..."  │
│  ⏱ 2:34 remaining         │
│  👥 7 entries so far       │
│  [ENTER THE RING]          │
│                            │
│  ── Recent Winners ──      │
│  🥇 @degen420 — 42K CLAWN │
│  🥈 @based.eth — 17K      │
│                            │
│  [🏆 Leaderboard] [👤 Profile] │
│  [💰 Buy $CLAWN]           │
└────────────────────────────┘
```

**Elements:**
- Current/next round card with countdown timer
- Entry count (social proof)
- Recent winners ticker
- Navigation to Leaderboard, Profile, Buy
- "Add to Farcaster" button if not installed (`addMiniApp`)

### 5.2 Active Round Screen

```
┌────────────────────────────┐
│  🔮 THE FORTUNE TELLER SAYS│
│                            │
│  "I see a clown who became │
│  a VC partner and only     │
│  invests in circus-themed  │
│  DAOs. Roast them."        │
│                            │
│  ⏱ 3:12 remaining          │
│  👥 12 entries              │
│  💰 Prize: 84,000 CLAWN    │
│                            │
│  [WRITE YOUR ROAST]        │
│                            │
│  ── Live Feed ──           │
│  "Someone just entered..."  │
│  (no content shown yet)    │
└────────────────────────────┘
```

**Elements:**
- Fortune teller prompt with themed styling
- Live countdown, entry count, current prize pool
- CTA to submit
- Live feed showing entry events (not content, to prevent copying)

### 5.3 Submit Roast Screen

```
┌────────────────────────────┐
│  YOUR ROAST                │
│  ┌──────────────────────┐  │
│  │ Type your roast...   │  │
│  │                      │  │
│  │              178/280 │  │
│  └──────────────────────┘  │
│                            │
│  Entry fee: 10,000 CLAWN   │
│  Balance: 1,250,000 CLAWN  │
│                            │
│  [🔥 SUBMIT ROAST]         │
│                            │
│  By submitting you agree   │
│  to the rules. No refunds. │
└────────────────────────────┘
```

**Elements:**
- Text area with character counter (280 max)
- Entry fee display + user's CLAWN balance
- Submit button (triggers `sendToken` then saves entry)
- Insufficient balance → "Buy $CLAWN" link

**Flow on submit:**
1. Validate text (non-empty, ≤280 chars, passes content filter)
2. Trigger `sendToken` for entry fee → prize pool address
3. On tx confirmation, save entry to backend
4. Show "Submitted! 🎪" confirmation, return to Active Round screen
5. If `sendToken` fails or user rejects → entry not saved, show error

### 5.4 Judging Screen

```
┌────────────────────────────┐
│  🎭 THE JUDGE DELIBERATES  │
│                            │
│  [Animated clown judge     │
│   reading through entries] │
│                            │
│  Scoring 15 roasts...      │
│  ████████░░ 80%            │
│                            │
│  Categories:               │
│  😂 Humor      (40%)      │
│  🎨 Creativity (30%)      │
│  🎯 Relevance  (20%)      │
│  🔥 Savagery   (10%)      │
└────────────────────────────┘
```

**Elements:**
- Fun judging animation (15-30 seconds)
- Progress indicator
- Scoring criteria reminder
- Auto-transitions to Results when done

### 5.5 Results Screen

```
┌────────────────────────────┐
│  🏆 ROUND RESULTS          │
│                            │
│  🥇 @degen420              │
│  "That VC clown's portfolio│
│  is just red noses all the │
│  way down" — Score: 92     │
│  Won: 42,000 CLAWN         │
│                            │
│  🥈 @based.eth — Score: 87 │
│  🥉 @farcasterOG — Score: 81│
│                            │
│  Your entry: #7 / 15       │
│  Score: 64                 │
│                            │
│  [📢 SHARE YOUR ROAST]     │
│  [🔥 NEXT ROUND IN 24:30]  │
│  🔥 Burned: 10,000 CLAWN   │
└────────────────────────────┘
```

**Elements:**
- Top 3 with roast text, scores, and prizes
- User's own placement and score
- Share button (triggers `composeCast`)
- Next round countdown
- Burn amount shown (transparency)

### 5.6 Leaderboard Screen

```
┌────────────────────────────┐
│  🏆 LEADERBOARD            │
│  [All Time] [Weekly] [Daily]│
│                            │
│  1. 👑 @degen420           │
│     "Grand Clown" — 340pts │
│     🔥 12-day streak       │
│                            │
│  2. 💎 @based.eth          │
│     "Court Jester" — 285pts│
│                            │
│  3. 🎪 @farcasterOG        │
│     "Circus Act" — 240pts  │
│  ...                       │
│  47. 🤡 You — 28pts        │
│                            │
│  [Jump to my rank]         │
└────────────────────────────┘
```

**Elements:**
- Tab filters: All Time, Weekly, Daily
- Rank, username, title, points, streak indicator
- User's own rank highlighted / jump-to button
- Points = sum of round scores across all entries

### 5.7 Buy $CLAWN Screen

```
┌────────────────────────────┐
│  💰 GET $CLAWN              │
│                            │
│  Balance: 1,250,000 CLAWN  │
│                            │
│  [🔄 Swap for $CLAWN]      │
│  [📊 View on DEX]          │
│                            │
│  Token: 0x6B08...cf5BE1    │
│  Chain: Base               │
│  Supply: 100B              │
│  Burned: 2.4M 🔥           │
└────────────────────────────┘
```

**Elements:**
- Current balance (read via `wallet` EIP-1193 provider)
- Swap button → `swapToken` with CAIP-19 asset ID
- View button → `viewToken` for chart/info
- Token stats including cumulative burn

### 5.8 Profile Screen

```
┌────────────────────────────┐
│  👤 @username               │
│  🏅 "Court Jester"         │
│  🔥 5-day streak            │
│                            │
│  Stats:                    │
│  Rounds: 34 | Wins: 6     │
│  Best Score: 95            │
│  CLAWN Won: 380,000        │
│  CLAWN Spent: 340,000      │
│                            │
│  Recent Roasts:            │
│  • "That VC clown..." (92) │
│  • "Even Bozo..." (78)     │
│                            │
│  [🔔 Notifications: ON]    │
│  [📤 Share Profile]        │
└────────────────────────────┘
```

**Elements:**
- Title, streak, stats
- Roast history with scores
- Notification toggle
- Share profile button

---

## 6. Farcaster Integration

### SDK Actions by Screen

| SDK Action | Where Used | Purpose |
|-----------|------------|---------|
| `signin` | First interaction / Enter the Ring | Authenticate Farcaster identity |
| `addMiniApp` | Home (if not installed) | Prompt user to add app |
| `sendToken` | Submit Roast | Pay entry fee |
| `swapToken` | Buy $CLAWN screen | Purchase CLAWN on DEX |
| `viewToken` | Buy $CLAWN screen | View token chart/info |
| `composeCast` | Results screen, Profile | Share roasts virally |
| `wallet` | Buy screen, balance checks | Read CLAWN balance via EIP-1193 |
| `notifications` | Profile, onboarding | Enable push notifications |

### Cast Sharing Format

When a user taps "Share Your Roast," trigger `composeCast` with:

```
🤡 Clown Roast Battle

🔮 "A clown who became a VC partner and only invests in circus-themed DAOs"

🔥 My roast: "That VC clown's portfolio is just red noses all the way down"

Score: 92/100 | Rank: #1 🏆

Think you're funnier? 👇
```

**Embed:** Mini app URL with round ID as parameter so viewers land on that round's results.

**Winner variant** includes: `I won 42,000 $CLAWN! 🎪`

### Notifications Strategy

| Notification | Trigger | Priority |
|-------------|---------|----------|
| Round starting | 1 min before Daily/Weekly rounds | High |
| Results ready | User's round finishes judging | High |
| You won! | User placed top 3 | High |
| Streak at risk | 22:00 UTC if no entry today | Medium |
| Weekly recap | Monday 10:00 UTC | Low |

**Rate limit:** Max 3 notifications/day to avoid fatigue.

---

## 7. Smart Contract Needs

### On-Chain (Required)

| Component | Reason |
|-----------|--------|
| Entry fee transfers | `sendToken` handles this via standard ERC-20 transfer |
| Prize distribution | Trustless payout from prize pool to winners |
| Burn execution | Send to dead address, verifiable on-chain |
| Treasury top-ups | Transparent bonus funding |

### Prize Pool Contract

A lightweight contract that:
1. Receives entry fees for a round (identified by `roundId`)
2. Allows the operator (backend) to call `distribute(roundId, winner1, winner2, winner3, amounts[])` after judging
3. Includes a `refund(roundId)` function for cancelled rounds (0-1 entries)
4. Burns the burn portion on distribution
5. Sends treasury portion to treasury wallet
6. Has a timelock: if `distribute` isn't called within 1 hour of round end, any participant can call `emergencyRefund(roundId)`

**Why a contract?** Users need assurance entry fees become prizes. Without it, the app holds funds in a wallet — rug risk perception kills adoption.

### Off-Chain

| Component | Reason |
|-----------|--------|
| Prompt generation | AI-generated, no consensus needed |
| Roast submission storage | Speed, no gas cost |
| AI judging & scoring | Needs LLM, not feasible on-chain |
| Leaderboard & stats | Read-heavy, updated frequently |
| Content moderation | Real-time filtering |
| Round scheduling | Centralized timer, simple |

### Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Farcaster    │────▶│  Backend API │────▶│  Base Chain   │
│  Mini App     │◀────│  (Node.js)   │◀────│  Prize Pool   │
│  (React)      │     │              │     │  Contract     │
└──────────────┘     │  - Rounds DB  │     └──────────────┘
                     │  - AI Judge   │
                     │  - Prompts    │
                     │  - Leaderboard│
                     └──────────────┘
```

---

## 8. MVP Scope

### Phase 1 — MVP (Weeks 1-3)

**Ship:**
- Home screen with active round
- Quick Draw rounds only (every 30 min)
- Submit roast flow with `sendToken` entry fee
- AI judging (GPT-4 or Claude via API)
- Results screen with top 3
- `composeCast` sharing
- Basic leaderboard (all-time)
- `signin`, `swapToken`, `viewToken` integration
- Prize pool contract on Base
- Content moderation filter

**Skip for now:**
- Daily/Weekly special rounds
- Streak mechanics
- Titles and ranks
- Notifications
- Audience voting
- Profile screen (beyond basic)
- `addMiniApp` prompt

### Phase 2 — Retention (Weeks 4-6)

- Daily Showdown and Weekly Championship rounds
- Streak tracking and streak bonus pool
- Titles and rank system
- Full profile screen with history
- Push notifications via SDK
- `addMiniApp` onboarding prompt
- Leaderboard tabs (daily/weekly/all-time)

### Phase 3 — Virality (Weeks 7-10)

- Audience voting (spectators vote, weighted by CLAWN holdings)
- Head-to-head challenge mode (challenge a specific user)
- "Roast of the Day" featured cast (auto-posted from best scoring roast)
- Seasonal themes (holiday prompts, collab events)
- API for third-party integrations

### Phase 4 — Sustainability (Weeks 11+)

- Governance: CLAWN holders vote on prompt categories
- Sponsored rounds (projects pay CLAWN to be roasted — promotional)
- NFT trophies for championship winners
- Cross-promotion with other Farcaster mini apps

---

## 9. Retention Mechanics

### Streaks

- **Definition:** Enter at least 1 round per calendar day (UTC)
- **Streak bonus:** From the 5% streak pool accumulated that day, distributed proportionally to all players with active streaks, weighted by streak length
- **Streak multiplier on leaderboard points:** Day 1-2: 1x, Day 3-6: 1.2x, Day 7-13: 1.5x, Day 14-29: 1.8x, Day 30+: 2x
- **Streak freeze:** Costs 50,000 CLAWN, preserves streak for 1 missed day (max 1 freeze per streak)
- **Streak display:** Fire emoji with day count on leaderboard and profile

### Titles (by cumulative leaderboard points)

| Points | Title |
|--------|-------|
| 0-99 | 🤡 Clown Trainee |
| 100-499 | 🎪 Circus Act |
| 500-1,499 | 🃏 Court Jester |
| 1,500-4,999 | 🎭 Roast Master |
| 5,000-14,999 | 👑 Grand Clown |
| 15,000+ | 💀 Legendary Fool |

### Leaderboard Points

- Points per round = AI score (0-100) × streak multiplier
- Only scored if user entered that round
- Weekly leaderboard resets Mondays; daily resets at 00:00 UTC
- All-time never resets

### Seasonal Events

- Monthly "Roast Royale" tournament (bracket elimination, higher stakes)
- Themed weeks (e.g., "Crypto Roast Week" — all prompts about crypto culture)
- Collaboration rounds with other token communities

---

## 10. Risks & Mitigations

### Toxicity / Harmful Content

- **Risk:** Users submit genuinely harmful, racist, or threatening roasts
- **Mitigation:** AI content filter on submission (reject + refund). Post-judging human review queue for flagged content. Report button on results. Repeat offenders banned (Farcaster FID blocklist).

### AI Judge Gaming

- **Risk:** Users figure out patterns that score high and submit formulaic entries
- **Mitigation:** Rotate judging model/prompt regularly. Add "originality" penalty for similar entries from same user. Periodically audit scores. Phase 2: audience votes as tiebreaker.

### Low Participation

- **Risk:** Rounds with 0-2 entries waste treasury bonuses
- **Mitigation:** Minimum 3 entries to run a round (else cancel + refund). Reduce Quick Draw frequency if avg entries < 3. Treasury bonus only on rounds that execute.

### Treasury Depletion

- **Risk:** Bonuses drain treasury before app reaches sustainability
- **Mitigation:** Safety valve thresholds (see §3). Start conservatively — Quick Draw only in MVP (no treasury bonus). Monitor daily and adjust.

### Smart Contract Bugs

- **Risk:** Prize pool contract has vulnerability, funds drained
- **Mitigation:** Keep contract minimal (< 200 lines). Audit before mainnet. Start with small amounts. Emergency pause function with multisig.

### Farcaster SDK Changes

- **Risk:** SDK actions change or deprecate
- **Mitigation:** Abstract SDK calls behind an interface layer. Pin SDK version. Monitor Farcaster changelog.

### Bot/Sybil Attacks

- **Risk:** Bots enter rounds en masse to farm prizes or grief
- **Mitigation:** Farcaster FID required (costs to create). Rate limit: max 3 entries per FID per hour. AI judge naturally penalizes low-effort entries. Phase 2: require minimum account age.

### Regulatory Risk

- **Risk:** Entry fee + prize structure resembles gambling
- **Mitigation:** Frame as "skill-based competition" (it is — better roasts win). No randomness in outcomes. Entry fee is for the game, not a wager. Consult legal before launch. Geo-restrict if needed.

---

## Appendix A: Technical Stack (Recommended)

| Layer | Technology |
|-------|-----------|
| Frontend | React + Farcaster Mini App SDK |
| Backend | Node.js + Express/Hono |
| Database | PostgreSQL (rounds, entries, users, scores) |
| AI Judge | Claude API or GPT-4 API |
| Smart Contract | Solidity, deployed on Base |
| Hosting | Vercel (frontend) + Railway/Fly (backend) |
| Monitoring | Sentry + custom dashboard |

## Appendix B: Database Schema (Core Tables)

```sql
users (
  id, farcaster_fid, username, title, streak_days, 
  streak_last_active, total_points, created_at
)

rounds (
  id, type, prompt_text, status [open|judging|complete|cancelled],
  started_at, submit_deadline, entry_count, 
  prize_pool_amount, tx_hash_distribute
)

entries (
  id, round_id, user_id, roast_text, 
  score_humor, score_creativity, score_relevance, score_savagery,
  score_total, rank, prize_amount,
  tx_hash_entry_fee, submitted_at
)

leaderboard_snapshots (
  id, user_id, period [daily|weekly|alltime], 
  points, rank, snapshot_date
)
```

## Appendix C: AI Judge Prompt (Draft)

```
You are the Clown Roast Battle judge — a jaded comedy veteran who's seen it all.

PROMPT: {prompt_text}

ENTRIES:
{numbered_entries}

Score each entry 0-100 across four categories:
- Humor (40%): Is it actually funny? Would a room laugh?
- Creativity (30%): Is it original? Surprising twist?
- Relevance (20%): Does it address the prompt directly?
- Savagery (10%): How hard does it hit?

Return JSON:
[
  {"entry": 1, "humor": 85, "creativity": 70, "relevance": 90, "savagery": 80, "total": 81, "one_line_feedback": "..."},
  ...
]

Rules:
- Be harsh but fair. A score of 50 is average, 80+ is genuinely good.
- Penalize entries that are generic or could apply to any prompt.
- Do NOT score entries that contain hate speech, slurs, or threats — return score 0 with feedback "disqualified".
- Break ties by favoring creativity.
```

---

*End of spec. Let's build a circus.* 🎪
