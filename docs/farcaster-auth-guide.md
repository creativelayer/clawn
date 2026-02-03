# Farcaster Mini App Authentication Guide

> For the $CLAWN game: authenticate users via Farcaster, handle $CLAWN payments on Base, distribute prizes.

---

## Table of Contents

1. [How Auth Works in Mini Apps](#1-how-auth-works-in-mini-apps)
2. [User Data Available from Context](#2-user-data-available-from-context)
3. [Server-Side Verification](#3-server-side-verification)
4. [Session Management](#4-session-management)
5. [Neynar Integration](#5-neynar-integration)
6. [Wallet Linking & $CLAWN Payments](#6-wallet-linking--clawn-payments)
7. [Code Examples](#7-code-examples)
8. [Edge Cases](#8-edge-cases)

---

## 1. How Auth Works in Mini Apps

There are **two approaches** to authentication:

### Option A: Quick Auth (Recommended)

Quick Auth is a lightweight service built on top of Sign In with Farcaster (SIWF). It handles nonce generation, SIWF message verification, and returns a **signed JWT** that can be used as a session token.

**Flow:**
1. Client calls `sdk.quickAuth.fetch()` or `sdk.quickAuth.getToken()`
2. SDK automatically obtains a JWT from `https://auth.farcaster.xyz` (edge-deployed)
3. JWT is sent as `Authorization: Bearer <token>` to your backend
4. Backend verifies JWT using `@farcaster/quick-auth` library
5. JWT `sub` claim = the user's FID

**Why Quick Auth:**
- No nonce management needed
- Edge-deployed = low latency globally
- Asymmetrically signed JWTs = local verification on your server (no network call to verify)
- Handles auth address support automatically

### Option B: Manual Sign In with Farcaster (SIWF)

Lower-level approach using `sdk.actions.signIn()`.

**Flow:**
1. Your server generates a random nonce (≥8 alphanumeric chars)
2. Client calls `sdk.actions.signIn({ nonce, acceptAuthAddress: true })`
3. Farcaster client prompts user to sign
4. Returns `{ signature: string, message: string }`
5. Your server verifies using `@farcaster/auth-client` `verifySignInMessage()`
6. You issue your own session token (JWT, cookie, etc.)

**Return value of `signIn()`:**
```typescript
type SignInResult = {
  signature: string;  // The SIWF signature
  message: string;    // The signed SIWF message (contains FID, nonce, domain, etc.)
}
```

**When to use manual SIWF:** Only if you need custom session logic beyond what Quick Auth provides, or if you're integrating with an existing auth system (Privy, Dynamic, etc.).

---

## 2. User Data Available from Context

When your Mini App opens, `sdk.context` is **immediately available** (no sign-in needed):

```typescript
sdk.context.user = {
  fid: number;           // Farcaster ID
  username?: string;     // e.g. "alice"
  displayName?: string;  // e.g. "Alice"
  pfpUrl?: string;       // Profile picture URL
  bio?: string;          // User bio
  location?: {
    placeId: string;
    description: string; // e.g. "Austin, TX, USA"
  };
}

sdk.context.client = {
  platformType?: 'web' | 'mobile';
  clientFid: number;     // e.g. 9152 for Warpcast
  added: boolean;        // Has user added this mini app?
  safeAreaInsets?: { top, bottom, left, right };
  notificationDetails?: { url, token };
}

sdk.context.location = {
  type: 'cast_embed' | 'cast_share' | 'notification' | 'launcher' | 'channel' | 'open_miniapp';
  // ... type-specific fields
}
```

> ⚠️ **IMPORTANT:** Context data should be considered **untrusted** — it's passed by the client app with no server-side guarantee. Use it for UI personalization only. For secure identity, always authenticate via Quick Auth or SIWF.

---

## 3. Server-Side Verification

### With Quick Auth (Recommended)

```bash
npm install @farcaster/quick-auth
```

```typescript
import { createClient, Errors } from '@farcaster/quick-auth';

const client = createClient();

async function verifyToken(authHeader: string, domain: string) {
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const payload = await client.verifyJwt({ token, domain });
    // payload.sub = FID (number)
    return { fid: payload.sub };
  } catch (e) {
    if (e instanceof Errors.InvalidTokenError) {
      throw new Error('Invalid or expired token');
    }
    throw e;
  }
}
```

The `domain` parameter must match your app's domain (the one in your manifest).

### With Manual SIWF

```bash
npm install @farcaster/auth-client
```

```typescript
import { verifySignInMessage } from '@farcaster/auth-client';

// After receiving { message, signature } from the client
const result = await verifySignInMessage({
  message,
  signature,
  domain: 'yourdomain.com',
  nonce: expectedNonce, // The nonce you generated
});

if (result.isOk()) {
  const { fid } = result.value;
  // Issue session token
}
```

Use `@farcaster/auth-client` v0.7.0+ for auth address support.

---

## 4. Session Management

### With Quick Auth

Quick Auth **is** your session management. The SDK automatically:
- Caches tokens in memory
- Returns cached token if not expired
- Refreshes automatically when needed

On each API call, use `sdk.quickAuth.fetch()` which attaches the Bearer token. Your server just verifies the JWT on each request. **No cookies, no server-side sessions needed.**

```typescript
// Client - every API call is authenticated
const res = await sdk.quickAuth.fetch(`${API_URL}/game/enter`);
```

### With Manual SIWF

Issue your own JWT after verifying the SIWF credential:

```typescript
import jwt from 'jsonwebtoken';

// After successful SIWF verification
const sessionToken = jwt.sign(
  { fid: verifiedFid },
  process.env.JWT_SECRET!,
  { expiresIn: '24h' }
);
```

Store in memory on the client. Mini Apps don't persist across sessions anyway (they reload each time), so localStorage isn't critical.

---

## 5. Neynar Integration

[Neynar](https://docs.neynar.com) provides indexed Farcaster data via API. Useful for:

### User Profile Lookup

After getting a FID from auth, fetch full profile data:

```typescript
// GET https://api.neynar.com/v2/farcaster/user/bulk?fids=<fid>
const res = await fetch(
  `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
  { headers: { 'x-api-key': NEYNAR_API_KEY } }
);
const { users } = await res.json();
// users[0].verified_addresses.eth_addresses — linked wallets!
```

### Webhook Verification

Neynar provides `verifyAppKeyWithNeynar` for verifying Mini App webhook events:

```typescript
import { parseWebhookEvent, verifyAppKeyWithNeynar } from '@farcaster/miniapp-node';

const data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
```

### Managed Notifications

Neynar can manage notification tokens and sending on your behalf — useful if you don't want to build webhook infrastructure.

### Key Neynar Endpoints for $CLAWN Game

- **User lookup:** `GET /v2/farcaster/user/bulk?fids=` — get username, pfp, verified addresses
- **Verified addresses:** The `verified_addresses.eth_addresses` field gives you wallets the user has verified on Farcaster — useful for cross-referencing $CLAWN holdings

---

## 6. Wallet Linking & $CLAWN Payments

### The Key Question: What is `getEthereumProvider()`?

`sdk.wallet.getEthereumProvider()` returns an **EIP-1193 provider** connected to the **user's Farcaster wallet** (e.g., the Warpcast wallet). This is:

- ✅ **On Base** — The Wagmi connector example explicitly configures `base` chain
- ✅ **Can hold ERC-20 tokens** — It's a standard Ethereum wallet
- ✅ **Can send ERC-20 tokens** — Via standard `transfer()` calls or approve/transferFrom
- ✅ **Supports batch transactions** — EIP-5792 `wallet_sendCalls` for approve + transfer in one step
- ❌ **Not necessarily the user's "main" wallet** — Users may hold $CLAWN in a different wallet

### Wagmi Setup for $CLAWN on Base

```typescript
import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [farcasterMiniApp()],
});
```

### Reading $CLAWN Balance

```typescript
import { useReadContract, useAccount } from 'wagmi';
import { erc20Abi } from 'viem';

const CLAWN_TOKEN = '0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1';

function useClawnBalance() {
  const { address } = useAccount();
  
  return useReadContract({
    address: CLAWN_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    chainId: 8453, // Base
  });
}
```

### Sending $CLAWN (Entry Fee)

```typescript
import { useWriteContract } from 'wagmi';
import { erc20Abi, parseUnits } from 'viem';

function PayEntryFee({ amount }: { amount: bigint }) {
  const { writeContract } = useWriteContract();
  
  const payFee = () => {
    writeContract({
      address: CLAWN_TOKEN,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [GAME_TREASURY_ADDRESS, amount],
      chainId: 8453,
    });
  };
  
  return <button onClick={payFee}>Pay {amount} $CLAWN</button>;
}
```

### Batch: Approve + Pay in One Step

```typescript
import { useSendCalls } from 'wagmi';
import { encodeFunctionData, parseUnits } from 'viem';

function ApproveAndPay({ amount }: { amount: bigint }) {
  const { sendCalls } = useSendCalls();
  
  return (
    <button onClick={() => sendCalls({
      calls: [
        {
          to: CLAWN_TOKEN,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [GAME_CONTRACT, amount],
          }),
        },
        {
          to: GAME_CONTRACT,
          data: encodeFunctionData({
            abi: gameAbi,
            functionName: 'enterGame',
            args: [gameId],
          }),
        },
      ],
    })}>
      Enter Game
    </button>
  );
}
```

### Multiple Wallets Strategy

Users may have $CLAWN in a wallet other than their Farcaster wallet. Options:

1. **Primary approach:** Use the Farcaster wallet via `getEthereumProvider()`. It's frictionless.
2. **Check balance first:** If the Farcaster wallet has insufficient $CLAWN, show a message: "You need X $CLAWN. Send $CLAWN to your Farcaster wallet: `{address}`"
3. **Use `sdk.actions.sendToken()`:** Prompt users to send $CLAWN to the game treasury directly via the native Farcaster send UI
4. **Neynar verified addresses:** Look up `verified_addresses.eth_addresses` to show the user which wallets they've linked, and their $CLAWN balances across all of them

> **Recommendation for $CLAWN game:** Use the Farcaster wallet for everything. It's the simplest UX. Users who hold $CLAWN elsewhere can transfer to their Farcaster wallet address.

---

## 7. Code Examples

### Complete Auth Flow (Quick Auth)

**Client (React):**

```typescript
import React, { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { WagmiProvider } from 'wagmi';
import { config } from './wagmi-config';

const API_URL = 'https://api.yourgame.com';

function App() {
  const [user, setUser] = useState<{ fid: number; username: string } | null>(null);

  useEffect(() => {
    async function init() {
      // Quick Auth handles everything — get authenticated user
      const res = await sdk.quickAuth.fetch(`${API_URL}/me`);
      if (res.ok) {
        setUser(await res.json());
      }
      // Show the app
      await sdk.actions.ready();
    }
    init();
  }, []);

  if (!user) return null; // Splash screen still showing

  return (
    <WagmiProvider config={config}>
      <GameScreen user={user} />
    </WagmiProvider>
  );
}
```

**Server (Hono/Cloudflare Worker):**

```typescript
import { createClient, Errors } from '@farcaster/quick-auth';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const quickAuth = createClient();
const app = new Hono();

app.use(cors());

// Auth middleware
async function authMiddleware(c, next) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await quickAuth.verifyJwt({
      token: auth.split(' ')[1],
      domain: 'yourgame.com',
    });

    // payload.sub = FID
    c.set('fid', payload.sub);
  } catch (e) {
    if (e instanceof Errors.InvalidTokenError) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    throw e;
  }

  await next();
}

// Get current user
app.get('/me', authMiddleware, async (c) => {
  const fid = c.get('fid');
  
  // Look up user in your DB or via Neynar
  const user = await db.users.findOrCreate(fid);
  return c.json(user);
});

// Enter a game (requires $CLAWN payment verification)
app.post('/game/:id/enter', authMiddleware, async (c) => {
  const fid = c.get('fid');
  const gameId = c.req.param('id');
  const { txHash } = await c.req.json();
  
  // Verify the $CLAWN transfer tx on Base
  const verified = await verifyClawnPayment(txHash, fid, gameId);
  if (!verified) {
    return c.json({ error: 'Payment not verified' }, 400);
  }
  
  // Add player to game
  await db.games.addPlayer(gameId, fid);
  return c.json({ success: true });
});

export default app;
```

### Performance Optimization

Add to your HTML `<head>`:

```html
<link rel="preconnect" href="https://auth.farcaster.xyz" />
```

---

## 8. Edge Cases

### User Not Logged In / No Farcaster Account
Mini Apps only run inside Farcaster clients, so users always have a Farcaster account. `sdk.context.user.fid` is always present.

### Quick Auth Token Expiry
`sdk.quickAuth.getToken()` automatically refreshes expired tokens. If using `sdk.quickAuth.fetch()`, this is handled transparently. No manual refresh logic needed.

### Manual SIWF: RejectedByUser
```typescript
try {
  const result = await sdk.actions.signIn({ nonce, acceptAuthAddress: true });
} catch (error) {
  if (error.name === 'RejectedByUser') {
    // User declined sign-in. Show explanation and retry button.
  }
}
```

### User Has No Wallet Connected
The Wagmi connector may report `isConnected: false`. Always check and prompt:
```typescript
const { isConnected } = useAccount();
if (!isConnected) {
  // Show "Connect Wallet" button
}
```

### Insufficient $CLAWN Balance
Check balance before showing the "Enter Game" button. If insufficient, show the user their Farcaster wallet address and suggest transferring $CLAWN there.

### Multiple Farcaster Clients
A user might use your app from Warpcast on mobile and web. Quick Auth tokens are per-session and stateless — this works fine. Notification tokens are per-client, so store them per `(fid, clientFid)`.

### User Changes FID (Recovery)
FID is permanent. Users can change custody addresses but FID stays the same. Your DB should key on FID.

### Network Issues (Wrong Chain)
The Wagmi config specifies `base` only. If the wallet is on a different chain, Wagmi will prompt chain switching automatically. Always specify `chainId: 8453` in contract calls.

### Transaction Scanning False Positives
New contracts may trigger Blockaid warnings. Register at [Blockaid Verified Projects](https://report.blockaid.io/verifiedProject) to whitelist your game contract.

---

## Summary: Recommended Architecture for $CLAWN Game

```
┌─────────────────────────────────────────────┐
│  Farcaster Client (Warpcast)                │
│  ┌───────────────────────────────────────┐  │
│  │  Mini App (React)                     │  │
│  │                                       │  │
│  │  1. sdk.quickAuth.fetch('/me')        │  │
│  │     → Authenticated API calls         │  │
│  │                                       │  │
│  │  2. Wagmi + farcasterMiniApp connector│  │
│  │     → Read $CLAWN balance             │  │
│  │     → Send $CLAWN entry fee           │  │
│  │     → Receive $CLAWN prizes           │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  Backend API                                │
│                                             │
│  • @farcaster/quick-auth → verify JWT       │
│  • Neynar API → user profiles, addresses    │
│  • Viem → verify $CLAWN txs on Base         │
│  • Prize distribution → server wallet sends │
│    $CLAWN to winner's Farcaster address     │
└─────────────────────────────────────────────┘
```

**Key decisions:**
- **Auth:** Quick Auth (zero-config, edge-deployed, JWT-based)
- **Wallet:** Farcaster wallet via `getEthereumProvider()` on Base
- **Payments:** Standard ERC-20 `transfer()` for $CLAWN
- **Prizes:** Server-side wallet (Privy agent wallet) sends $CLAWN to winner's connected address
- **User ID:** FID (permanent, unique)
