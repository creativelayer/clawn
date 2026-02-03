# Farcaster Mini App Research - 2026-02-02

## What They Are
- Web apps (HTML/CSS/JS) that run inside Farcaster clients (Warpcast etc)
- SDK: `@farcaster/miniapp-sdk`
- Scaffold: `npm create @farcaster/mini-app`
- Size: 424x695px on desktop, full screen on mobile
- Discovery: social feeds, app stores, notifications

## Key SDK Actions
- `sdk.actions.ready()` — MUST call or infinite loading screen
- `sdk.actions.swapToken({ buyToken, sellToken, sellAmount })` — opens swap UI!
- `sdk.actions.viewToken({ token })` — displays token info
- `sdk.actions.sendToken({})` — send tokens
- `sdk.actions.composeCast({})` — prompt user to cast
- `sdk.actions.signin()` — Sign In with Farcaster
- `sdk.actions.addMiniApp()` — prompt user to favorite app
- Wallet: `sdk.wallet.getEthereumProvider()` — EIP-1193 provider

## CAIP-19 Format for $CLAWN
`eip155:8453/erc20:0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1`

## Requirements
- Domain with `/.well-known/farcaster.json` manifest
- `accountAssociation` signed by Farcaster account custody address
- `fc:miniapp` meta tag on pages for feed embeds
- `webhookUrl` for notifications

## Hosting Needs
- Need a domain (could use Vercel/Netlify free tier)
- Paul needs a Farcaster account to sign the manifest

## Mini App Ideas for $CLAWN

### 🎰 Clown Fortune Teller
- User opens app, gets a random "clown fortune" 
- Fortunes are funny/absurd predictions
- "Share your fortune" button composes a cast
- Token-gated: hold $CLAWN for premium fortunes
- One-click buy $CLAWN via swapToken SDK action
- Daily fortune → notifications to re-engage

### 🎪 Circus Wheel (Spin to Win)
- Spin a wheel, win $CLAWN prizes from a pool
- Small entry fee in $CLAWN (burned or added to pool)
- Social: share your wins, leaderboard
- Uses wallet provider for on-chain interaction

### 🤡 Clown Name Generator
- Generate absurd clown names/personas
- Mint as on-chain identity (cheap NFT?)
- Share via composeCast
- Simple, viral, low friction

### 💰 $CLAWN Buy Button
- Simplest possible: just a nice landing page about $CLAWN
- One-tap buy via swapToken action
- Shows price, holders, your balance
- This alone has value as a distribution tool in casts
