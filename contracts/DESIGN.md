# ClownPrizePool Contract Design

## The Challenge

Farcaster's `sendToken` just sends ERC20 to an address — it can't call contract functions or pass data. So users can't directly deposit to a contract with round metadata.

## Solution: Hybrid Model

```
┌─────────────┐    sendToken     ┌─────────────┐
│   User      │ ───────────────► │  Collector  │  (EOA - your wallet)
│ (Farcaster) │    50K CLAWN     │   Wallet    │
└─────────────┘                  └──────┬──────┘
                                        │ 
                                        │ fundRound(roundId, amount)
                                        ▼
                                 ┌─────────────┐
                                 │  PrizePool  │  (Upgradeable Contract)
                                 │  Contract   │
                                 └──────┬──────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              ▼                         ▼                         ▼
       ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
       │   Winners   │          │  Treasury   │          │    Burn     │
       │    (70%)    │          │   (15%)     │          │   (10%)     │
       └─────────────┘          └─────────────┘          └─────────────┘
                                        │
                                        ▼
                                 ┌─────────────┐
                                 │ Streak Pool │
                                 │    (5%)     │
                                 └─────────────┘
```

## Flow

1. **User pays entry fee** → Farcaster `sendToken` sends 50K CLAWN to Collector Wallet
2. **Backend records entry** → Database tracks roundId, fid, txHash
3. **Round ends** → Backend calls `fundRound(roundId, totalCollected)` to move funds to contract
4. **AI judges** → Backend gets scores
5. **Distribute** → Backend calls `distribute(roundId, winners[], amounts[])` 
6. **Contract splits**:
   - 70% to winners (specified in amounts[])
   - 15% to treasury address
   - 10% burned (sent to 0xdead)
   - 5% to streak pool address

## The 30% Extraction

| Destination | % | How | When |
|-------------|---|-----|------|
| Treasury | 15% | Auto-sent to `treasury` address on distribute() | Every round |
| Burn | 10% | Auto-sent to 0x...dEaD on distribute() | Every round |
| Streak Pool | 5% | Auto-sent to `streakPool` address on distribute() | Every round |

Treasury and streak pool can be the same address initially (your wallet), then split later.

## Contract Functions

```solidity
// Fund a round (called after collecting entry fees off-chain)
function fundRound(bytes32 roundId, uint256 amount) onlyOwner

// Distribute prizes + handle 30% split
function distribute(bytes32 roundId, address[] winners, uint256[] amounts) onlyOwner

// Emergency refund if round cancelled
function refundRound(bytes32 roundId, address[] participants, uint256[] amounts) onlyOwner

// Update treasury/streak addresses
function setTreasury(address) onlyOwner
function setStreakPool(address) onlyOwner

// Rescue stuck tokens (safety valve)
function rescue(address token, uint256 amount) onlyOwner

// Upgrade (UUPS pattern)
function upgradeTo(address newImplementation) onlyOwner
```

## Why UUPS Upgradeable?

- Can fix bugs without migrating funds
- Cheaper than transparent proxy (no admin slot reads)
- Upgrade logic lives in implementation, not proxy
- Can eventually renounce upgrade capability if desired

## Security Considerations

1. **Owner = your Privy wallet** — all admin functions require owner
2. **Can't over-distribute** — contract checks amounts ≤ funded pool
3. **Transparent** — all distributions emit events, verifiable on-chain
4. **Emergency refund** — if something goes wrong, can return funds
5. **Rescue function** — if random tokens sent, can recover them

## Tradeoffs

| Aspect | Status | Note |
|--------|--------|------|
| Trustlessness | Partial | Users must trust collector wallet initially |
| Transparency | Full | All distributions on-chain |
| Upgradeability | Yes | Can fix bugs, but also a trust point |
| Gas costs | Low | Only owner pays gas for distributions |

## Future Improvements

1. **Direct deposits** — Add ERC20 permit support so users can deposit directly
2. **Timelock** — Add delay on upgrades for transparency
3. **Multisig owner** — Transfer ownership to a Safe
4. **Freeze upgrades** — Renounce upgrade capability once stable
