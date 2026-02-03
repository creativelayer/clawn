# Clown Roast Battle — Frontend Architecture & User Flows

> Farcaster Mini App · 424×695px · Dark purple/neon theme · Base chain

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **Next.js 14 (App Router)** | SSR for OG frames, API routes for backend, Vercel-native |
| UI | **React 18 + Tailwind CSS** | Rapid iteration, small bundle, theme tokens |
| Wallet | `sdk.wallet.getEthereumProvider()` → **viem** | Lightweight, type-safe, no wagmi overhead needed |
| State | **Zustand** (client) + **SWR** (server) | Minimal boilerplate, stale-while-revalidate polling |
| Chain | **Base (8453)** | $CLAWN lives here |
| Deploy | **Vercel** | Edge functions, preview deploys, instant rollback |
| Contract interaction | **viem** `getContract` + typed ABIs | Direct EIP-1193 provider from SDK |

### Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout, theme, fonts
│   ├── page.tsx            # Main mini app entry
│   └── api/
│       ├── round/route.ts  # Current round state
│       ├── entry/route.ts  # Submit roast (after on-chain confirm)
│       ├── results/route.ts
│       └── webhook/notify/route.ts  # Farcaster notification webhook
├── components/
│   ├── Splash.tsx
│   ├── RoundCard.tsx
│   ├── EntryForm.tsx
│   ├── PaymentFlow.tsx
│   ├── Results.tsx
│   ├── Countdown.tsx
│   ├── JudgingAnimation.tsx
│   └── ui/                 # Button, Modal, Toast, etc.
├── lib/
│   ├── farcaster.ts        # SDK wrapper
│   ├── contracts.ts        # ABI + addresses
│   ├── wallet.ts           # Provider helpers
│   └── api.ts              # SWR fetchers
├── stores/
│   └── app.ts              # Zustand store
└── constants.ts
```

---

## Constants

```ts
// constants.ts
export const CLAWN_TOKEN = "0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1";
export const CLAWN_CAIP = "eip155:8453/erc20:0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1";
export const PRIZE_POOL_CONTRACT = "0x..."; // TBD
export const BASE_CHAIN_ID = 8453;
export const DAILY_ENTRY_FEE = 50_000n * 10n ** 18n; // 50K CLAWN (18 decimals)
export const MINI_APP_URL = "https://roast.clawn.fun";
```

---

## 1. First-Time User Flow

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   Splash     │───▶│  Round View   │───▶│  Sign In     │───▶│  Balance     │
│  (1.5s max)  │    │ "Enter Ring"  │    │  (FID auth)  │    │   Check      │
└─────────────┘    └──────────────┘    └─────────────┘    └──────┬───────┘
                                                                  │
                                                    ┌─────────────┴──────────────┐
                                                    ▼                            ▼
                                            ┌──────────────┐          ┌──────────────────┐
                                            │  Has $CLAWN   │          │  No $CLAWN        │
                                            │  Approve+Pay  │          │  "Buy $CLAWN"     │
                                            └──────┬───────┘          │  → swapToken()    │
                                                   │                  └────────┬─────────┘
                                                   │                           │
                                                   ▼                           ▼
                                            ┌──────────────┐          ┌──────────────────┐
                                            │ Roast Form    │◀─────────│  Re-check balance │
                                            │ (submit text) │          └──────────────────┘
                                            └──────┬───────┘
                                                   ▼
                                            ┌──────────────┐
                                            │ Confirmation  │
                                            │ "You're In!"  │
                                            └──────────────┘
```

### Splash → Ready

```tsx
// components/Splash.tsx
import sdk from "@farcaster/miniapp-sdk";
import { useEffect, useState } from "react";

export function Splash({ onReady }: { onReady: (ctx: any) => void }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const init = async () => {
      const context = await sdk.actions.ready();
      // Small delay so splash is visible
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => onReady(context), 300);
      }, 800);
    };
    init();
  }, []);

  return (
    <div className={`flex items-center justify-center h-full bg-purple-950 transition-opacity duration-300 ${fadeOut ? "opacity-0" : "opacity-100"}`}>
      <img src="/clown-logo.png" alt="Clown Roast Battle" className="w-48 animate-bounce" />
    </div>
  );
}
```

### Sign In

```tsx
// lib/farcaster.ts
import sdk from "@farcaster/miniapp-sdk";

export async function signIn() {
  const nonce = await fetch("/api/auth/nonce").then(r => r.text());
  const result = await sdk.actions.signin({ nonce });

  // result contains: { fid, signature, message, custody }
  // Send to backend to verify and create session
  const session = await fetch("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify(result),
  }).then(r => r.json());

  return session; // { fid, username, pfp, token }
}
```

### Round View → "Enter the Ring"

```tsx
// components/RoundCard.tsx
export function RoundCard({ round, onEnter }: Props) {
  return (
    <div className="bg-purple-900/60 border border-purple-500/30 rounded-2xl p-5 mx-4">
      <div className="text-xs text-purple-300 uppercase tracking-wider">Daily Showdown</div>
      <h2 className="text-2xl font-bold text-white mt-1">{round.theme}</h2>

      <div className="flex justify-between mt-4 text-sm text-purple-200">
        <span>🎪 {round.entrants} entered</span>
        <span>🏆 {formatClawn(round.prizePool)} $CLAWN</span>
      </div>

      <Countdown endsAt={round.endsAt} className="mt-3" />

      <button
        onClick={onEnter}
        className="w-full mt-4 py-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-xl text-white font-bold text-lg shadow-lg shadow-purple-500/25 active:scale-95 transition"
      >
        🤡 Enter the Ring — 50K $CLAWN
      </button>
    </div>
  );
}
```

---

## 2. Returning User Flow

```
App Opens → sdk.actions.ready()
    │
    ├─ context.user.fid exists → auto-authenticate with backend
    │
    ▼
┌─────────────────────────────────────┐
│  Check: user already in this round? │
├──────────────┬──────────────────────┘
│              │
▼              ▼
Active Round   Already Entered
(show entry)   (show "Waiting for results" + countdown)
               OR
               No Active Round → show countdown to next + past results
```

```tsx
// app/page.tsx — Main app logic
export default function App() {
  const [ctx, setCtx] = useState(null);
  const [ready, setReady] = useState(false);
  const store = useAppStore();

  if (!ready) return <Splash onReady={(c) => { setCtx(c); setReady(true); }} />;

  // Auto-auth returning users
  useEffect(() => {
    if (ctx?.user?.fid) {
      store.autoAuth(ctx.user.fid);
    }
  }, [ctx]);

  const { round, userEntry } = useSWR("/api/round/current", fetcher);

  if (!round) return <CountdownToNext />;
  if (userEntry) return <WaitingForResults round={round} entry={userEntry} />;
  return <RoundCard round={round} onEnter={() => store.startEntryFlow()} />;
}
```

---

## 3. Entry Payment Flow (Detailed)

This is the most critical flow. Every step must handle failure gracefully.

```
┌─────────────────────┐
│ 1. Get Provider      │  sdk.wallet.getEthereumProvider()
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 2. Check Chain       │  wallet_switchEthereumChain → 8453
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 3. Check Balance     │  eth_call → balanceOf(user)
└─────────┬───────────┘
          │
    ┌─────┴──────┐
    ▼            ▼
 ≥ 50K       < 50K
    │            │
    │     ┌──────┴──────────┐
    │     │ 3a. swapToken() │  Opens Warpcast swap UI
    │     └──────┬──────────┘
    │            │ (user returns)
    │     ┌──────┴──────────┐
    │     │ 3b. Re-check    │  Poll balance for ~30s
    │     └──────┬──────────┘
    │            │
    ◀────────────┘
    ▼
┌─────────────────────┐
│ 4. Check Allowance   │  eth_call → allowance(user, prizePool)
└─────────┬───────────┘
          │
    ┌─────┴──────┐
    ▼            ▼
 ≥ 50K       < 50K
    │            │
    │     ┌──────┴──────────┐
    │     │ 4a. approve()   │  ERC20 approve tx
    │     └──────┬──────────┘
    │            │
    ◀────────────┘
    ▼
┌─────────────────────┐
│ 5. enterRound()      │  Contract call, transfers CLAWN
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 6. Wait for confirm  │  Poll tx receipt
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 7. Backend confirms  │  Chain watcher indexes event
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 8. Unlock roast form │  User can now write their roast
└─────────────────────┘
```

### Full Implementation

```tsx
// lib/wallet.ts
import sdk from "@farcaster/miniapp-sdk";
import { createPublicClient, createWalletClient, custom, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { CLAWN_TOKEN, PRIZE_POOL_CONTRACT, DAILY_ENTRY_FEE, BASE_CHAIN_ID } from "../constants";

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const PRIZE_POOL_ABI = parseAbi([
  "function enterRound(uint256 roundId) external",
  "event RoundEntered(uint256 indexed roundId, address indexed player)",
]);

export type PaymentStep =
  | "idle"
  | "connecting"
  | "checking-balance"
  | "insufficient-balance"  // show swap prompt
  | "swapping"              // user in swap UI
  | "approving"             // approve tx pending
  | "entering"              // enterRound tx pending
  | "confirming"            // waiting for backend
  | "done"
  | "error";

export async function executePaymentFlow(
  roundId: bigint,
  onStep: (step: PaymentStep, detail?: string) => void
): Promise<{ txHash: string }> {
  // 1. Get provider
  onStep("connecting");
  const ethProvider = await sdk.wallet.getEthereumProvider();

  const walletClient = createWalletClient({
    chain: base,
    transport: custom(ethProvider),
  });
  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  // Ensure correct chain
  try {
    await ethProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
    });
  } catch {
    // Chain switch failed or already on Base — continue
  }

  const [address] = await walletClient.getAddresses();

  // 2. Check balance
  onStep("checking-balance");
  let balance = await publicClient.readContract({
    address: CLAWN_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  // 3. If insufficient, prompt swap
  if (balance < DAILY_ENTRY_FEE) {
    onStep("insufficient-balance");
    // Caller shows "Buy $CLAWN" button which calls promptSwap()
    throw { code: "INSUFFICIENT_BALANCE", balance };
  }

  // 4. Check allowance & approve
  const allowance = await publicClient.readContract({
    address: CLAWN_TOKEN,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address, PRIZE_POOL_CONTRACT],
  });

  if (allowance < DAILY_ENTRY_FEE) {
    onStep("approving");
    const approveTx = await walletClient.writeContract({
      address: CLAWN_TOKEN,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [PRIZE_POOL_CONTRACT, DAILY_ENTRY_FEE],
      chain: base,
      account: address,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  // 5. Enter round
  onStep("entering");
  const enterTx = await walletClient.writeContract({
    address: PRIZE_POOL_CONTRACT,
    abi: PRIZE_POOL_ABI,
    functionName: "enterRound",
    args: [roundId],
    chain: base,
    account: address,
  });

  // 6. Wait for confirmation
  onStep("confirming");
  await publicClient.waitForTransactionReceipt({ hash: enterTx });

  // 7. Poll backend until chain watcher indexes the event
  await pollBackendForEntry(roundId.toString(), address);

  onStep("done");
  return { txHash: enterTx };
}

export async function promptSwap() {
  await sdk.actions.swapToken({
    buyToken: "eip155:8453/erc20:0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1",
  });
  // User returns to mini app after swap — re-check balance
}

async function pollBackendForEntry(roundId: string, address: string, maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await fetch(`/api/round/${roundId}/entry?address=${address}`);
    if (res.ok) return;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("Entry confirmation timeout — check back soon");
}
```

### Payment Flow UI Component

```tsx
// components/PaymentFlow.tsx
import { useState } from "react";
import { executePaymentFlow, promptSwap, type PaymentStep } from "../lib/wallet";

const STEP_MESSAGES: Record<PaymentStep, string> = {
  idle: "",
  connecting: "Connecting wallet...",
  "checking-balance": "Checking $CLAWN balance...",
  "insufficient-balance": "You need 50K $CLAWN to enter",
  swapping: "Complete the swap in Warpcast...",
  approving: "Approve $CLAWN spending...",
  entering: "Entering the round...",
  confirming: "Confirming on Base...",
  done: "You're in! 🤡🔥",
  error: "Something went wrong",
};

export function PaymentFlow({ roundId, onComplete }: Props) {
  const [step, setStep] = useState<PaymentStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleEnter = async () => {
    try {
      setError(null);
      await executePaymentFlow(BigInt(roundId), setStep);
      onComplete();
    } catch (err: any) {
      if (err.code === "INSUFFICIENT_BALANCE") {
        setStep("insufficient-balance");
      } else {
        setStep("error");
        setError(err.message || "Transaction failed");
      }
    }
  };

  const handleSwap = async () => {
    setStep("swapping");
    await promptSwap();
    // When user returns, retry the flow
    handleEnter();
  };

  return (
    <div className="p-5 text-center">
      {step === "idle" && (
        <button onClick={handleEnter} className="btn-primary w-full">
          🤡 Pay 50K $CLAWN & Enter
        </button>
      )}

      {step === "insufficient-balance" && (
        <div>
          <p className="text-purple-200 mb-3">You need $CLAWN to enter the ring!</p>
          <button onClick={handleSwap} className="btn-primary w-full">
            Buy $CLAWN →
          </button>
        </div>
      )}

      {!["idle", "insufficient-balance", "done", "error"].includes(step) && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-purple-200">{STEP_MESSAGES[step]}</p>
        </div>
      )}

      {step === "error" && (
        <div>
          <p className="text-red-400 mb-3">{error}</p>
          <button onClick={handleEnter} className="btn-secondary w-full">Retry</button>
        </div>
      )}
    </div>
  );
}
```

---

## 4. Results & Sharing Flow

```
Round Timer Hits Zero
        │
        ▼
┌──────────────────┐
│ Judging Animation │  3-5 seconds, clown jury deliberating
│ (Lottie/CSS)      │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Results Board     │  Ranked list with scores
│ Your rank + score │  Highlight user's position
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
Share Roast  Share Results
```

### Compose Cast Integration

```tsx
// lib/farcaster.ts
import sdk from "@farcaster/miniapp-sdk";
import { MINI_APP_URL } from "../constants";

export async function shareRoast(roast: string, score: number, roundId: string) {
  const text = [
    `🤡🔥 My roast scored ${score}/100 in Clown Roast Battle!`,
    "",
    `"${roast.length > 200 ? roast.slice(0, 197) + "..." : roast}"`,
    "",
    `Think you can do better? 👇`,
  ].join("\n");

  await sdk.actions.composeCast({
    text,
    embeds: [`${MINI_APP_URL}?round=${roundId}`],
  });
}

export async function shareResults(roundId: string, winner: string, topScore: number) {
  const text = [
    `🏆 Clown Roast Battle — Daily Showdown Results!`,
    "",
    `Winner: @${winner} with a ${topScore}/100 roast 🔥`,
    "",
    `Next round starts soon. Enter the ring:`,
  ].join("\n");

  await sdk.actions.composeCast({
    text,
    embeds: [`${MINI_APP_URL}?round=${roundId}`],
  });
}
```

### Results Component

```tsx
// components/Results.tsx
export function Results({ round, userEntry }: Props) {
  const [showJudging, setShowJudging] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowJudging(false), 4000);
    return () => clearTimeout(t);
  }, []);

  if (showJudging) return <JudgingAnimation />;

  const userRank = round.results.findIndex(r => r.fid === userEntry?.fid) + 1;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold text-center text-white mb-4">🏆 Results</h2>

      {/* Top 3 podium */}
      <div className="flex justify-center gap-2 mb-6">
        {round.results.slice(0, 3).map((r, i) => (
          <div key={r.fid} className={`text-center ${i === 0 ? "order-2 scale-110" : i === 1 ? "order-1" : "order-3"}`}>
            <img src={r.pfp} className="w-12 h-12 rounded-full mx-auto" />
            <div className="text-lg font-bold text-white">{r.score}</div>
            <div className="text-xs text-purple-300">@{r.username}</div>
          </div>
        ))}
      </div>

      {/* User's result */}
      {userEntry && (
        <div className="bg-purple-800/50 rounded-xl p-4 mb-4 border border-pink-500/30">
          <div className="text-sm text-purple-300">Your Rank: #{userRank}</div>
          <div className="text-2xl font-bold text-white">{userEntry.score}/100</div>
          <p className="text-purple-200 text-sm mt-2 italic">"{userEntry.roast}"</p>
        </div>
      )}

      {/* Share buttons */}
      <div className="flex gap-3">
        <button onClick={() => shareRoast(userEntry.roast, userEntry.score, round.id)} className="btn-primary flex-1">
          Share Roast
        </button>
        <button onClick={() => shareResults(round.id, round.results[0].username, round.results[0].score)} className="btn-secondary flex-1">
          Share Results
        </button>
      </div>
    </div>
  );
}
```

---

## 5. Notifications Strategy

### Prompt Timing

Prompt `addMiniApp()` **after** the user's first successful entry — when they're engaged, not before.

```tsx
// After successful entry confirmation
async function promptNotifications() {
  try {
    const result = await sdk.actions.addMiniApp();
    // result includes notification token if user accepted
    if (result.token) {
      await fetch("/api/notifications/register", {
        method: "POST",
        body: JSON.stringify({ token: result.token }),
      });
    }
  } catch {
    // User declined — don't pester again this session
  }
}
```

### Webhook Receiver

```ts
// app/api/webhook/notify/route.ts
export async function POST(req: Request) {
  const { event, tokens } = await req.json();
  // Store/update notification tokens in DB
  // event: "notifications_enabled" | "notifications_disabled"
  await db.notificationTokens.upsert(tokens);
  return Response.json({ ok: true });
}
```

### Notification Events

| Event | Timing | Message |
|-------|--------|---------|
| `round_started` | When new Daily Showdown opens | "🤡 New roast battle is LIVE! Enter the ring" |
| `results_ready` | When judging completes | "🏆 Results are in! See how you ranked" |
| `you_won` | Winner announcement | "👑 YOU WON the Clown Roast Battle! Claim your prize" |
| `streak_warning` | 2h before round closes if user has active streak | "🔥 Your 5-day streak is at risk! Enter today's battle" |

### Sending Notifications

```ts
// lib/notifications.ts
async function sendNotification(fid: number, title: string, body: string, targetUrl: string) {
  const tokens = await db.notificationTokens.getByFid(fid);

  for (const { token, url } of tokens) {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId: crypto.randomUUID(),
        title,
        body,
        targetUrl,
        tokens: [token],
      }),
    });
  }
}
```

---

## 6. State Management

### Zustand Store

```ts
// stores/app.ts
import { create } from "zustand";

interface AppState {
  // Auth
  fid: number | null;
  username: string | null;
  pfp: string | null;
  authToken: string | null;

  // Round
  currentRound: Round | null;
  userEntry: Entry | null;

  // Payment
  paymentStep: PaymentStep;

  // Actions
  autoAuth: (fid: number) => Promise<void>;
  startEntryFlow: () => void;
  submitRoast: (text: string) => Promise<void>;
  reset: () => void;
}
```

### Client-Side vs Server

| Data | Source | Strategy |
|------|--------|----------|
| Auth state (fid, token) | SDK context + backend | Zustand, persisted in sessionStorage |
| Current round | API | SWR, poll every 15s during active round |
| User entry status | API | SWR, poll every 5s during payment confirmation |
| Round results | API | SWR, fetch once when round ends |
| $CLAWN balance | On-chain | Fetched on-demand before payment |
| Leaderboard | API | SWR, poll every 60s |
| Past rounds | API | SWR with long cache (5min) |

### Polling Strategy

```tsx
// SWR config for round state
const { data: round } = useSWR("/api/round/current", fetcher, {
  refreshInterval: (data) => {
    if (!data) return 30_000;              // No round: check every 30s
    if (data.status === "active") return 15_000;  // Active: 15s
    if (data.status === "judging") return 5_000;  // Judging: 5s (results incoming)
    return 60_000;                         // Completed: slow
  },
});
```

> **Why polling over WebSockets:** Mini apps have constrained runtime. Polling with SWR is simpler, more reliable, and works through Warpcast's webview. WebSocket connections may not survive app backgrounding. If real-time becomes critical (Lightning Rounds), add SSE as an upgrade path.

### Error Handling

```tsx
// components/ErrorBoundary.tsx
// Wrap the app in a boundary that shows a retry screen

// Transaction errors → show specific message + retry button
// Network errors → show "Check your connection" + auto-retry in 5s
// SDK errors → show "Please update Warpcast" if version mismatch
// Round closed → show countdown to next round
```

Key error states:
- **Wallet rejected**: "Transaction cancelled. Tap to try again."
- **Insufficient gas**: "You need a small amount of ETH on Base for gas."
- **Round full/closed**: "This round is closed. Next one starts in {countdown}."
- **Backend down**: "We're having trouble. Your entry is safe on-chain — we'll catch up."

---

## 7. Screen Map (424×695px)

All screens fit within the Warpcast mini app viewport.

```
[S1] Splash          → Logo + loading animation (1.5s)
[S2] Round Active    → Theme, entrant count, prize pool, countdown, "Enter" CTA
[S3] Sign In         → SDK signin modal (native Warpcast UI)
[S4] Payment         → Step indicator, spinner, approve/enter prompts
[S5] Buy CLAWN       → "You need $CLAWN" + "Buy $CLAWN" button → swapToken
[S6] Roast Form      → Text input (280 char max), "Submit" button
[S7] Confirmation    → "You're in! 🤡" + entry # + share prompt
[S8] Waiting         → Countdown + "Judging starts at..." + past entries scroll
[S9] Judging         → Animation (clown jury, 4s)
[S10] Results        → Podium, your rank, share buttons
[S11] Countdown      → No active round, next round timer, past results preview
[S12] Profile/Stats  → Win count, streak, total CLAWN won (future)
```

---

## Build & Deploy

```json
// package.json (key deps)
{
  "dependencies": {
    "@farcaster/miniapp-sdk": "^0.1.0",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "viem": "^2.20.0",
    "zustand": "^4.5.0",
    "swr": "^2.2.0",
    "tailwindcss": "^3.4.0"
  }
}
```

### Vercel Config

```json
// vercel.json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "ALLOW-FROM https://warpcast.com" }
      ]
    }
  ]
}
```

### Farcaster Mini App Manifest

```json
// public/.well-known/farcaster.json
{
  "accountAssociation": { "...": "signed by custody address" },
  "frame": {
    "version": "next",
    "name": "Clown Roast Battle",
    "iconUrl": "https://roast.clawn.fun/icon.png",
    "homeUrl": "https://roast.clawn.fun",
    "splashImageUrl": "https://roast.clawn.fun/splash.png",
    "splashBackgroundColor": "#1a0533",
    "webhookUrl": "https://roast.clawn.fun/api/webhook/notify"
  }
}
```

---

## Summary

The frontend is a single Next.js app deployed to Vercel, using the Farcaster Mini App SDK for auth, payments, sharing, and notifications. All on-chain interactions go through viem with the EIP-1193 provider from the SDK. State is managed with Zustand (local) and SWR (server), with polling tuned to round status. The critical path — payment flow — has explicit step tracking with error recovery at every stage.
