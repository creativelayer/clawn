# 🤡 Clown Roast Battle — Smart Contract Architecture

## Why a Contract, Not Just a Wallet?

Sending entry fees directly to the Clawn treasury wallet is simpler, but it's a trust-me-bro model. A dedicated prize pool contract is better because:

1. **Trustlessness** — Players can verify on-chain that the pot exists, burns happen, and distributions match. No "did they actually burn it?" questions.
2. **Transparency** — Every entry, every payout, every burn is an on-chain event. Anyone can audit.
3. **Verifiability** — Fee splits are encoded in the contract. Players read the code and know exactly where their tokens go.
4. **Composability** — Future features (streak pools, tournament brackets, governance) can integrate with the contract.
5. **Credibility** — "Verified contract on BaseScan" hits different than "trust our wallet."
6. **Immutable rules** — The burn percentage can't be silently changed mid-round. Fee splits are transparent.

The overhead is minimal — one contract deployment, slightly more gas per entry (~50K extra gas vs a raw transfer). Worth it.

---

## Contract Design

### Overview

Single contract: `ClawnRoastBattle.sol`

- Owner: Clawn treasury wallet (`0x79Bed28E6d195375C19e84350608eA3c4811D4B9`)
- Token: $CLAWN (`0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1`)
- Chain: Base (8453)

### Round Lifecycle

```
OPEN → JUDGING → COMPLETE
```

1. **OPEN** — Players can enter by depositing $CLAWN
2. **JUDGING** — Entries closed, AI is judging roasts (off-chain)
3. **COMPLETE** — Winners paid out, round finalized

---

## Solidity Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ClawnRoastBattle is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────────
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ── State ──────────────────────────────────────────────────
    IERC20 public immutable clawnToken;

    enum RoundState { Open, Judging, Complete }

    struct FeeSplit {
        uint256 prizeBps;      // % to winner(s)
        uint256 treasuryBps;   // % to treasury
        uint256 burnBps;       // % burned
        uint256 streakPoolBps; // % to streak pool
    }

    struct Round {
        uint256 entryFee;
        RoundState state;
        uint256 totalPot;
        uint256 entryCount;
        FeeSplit feeSplit;
        bool exists;
    }

    FeeSplit public defaultFeeSplit;
    address public treasury;
    uint256 public streakPoolBalance;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bool)) public hasEntered;
    mapping(uint256 => address[]) internal _roundPlayers;

    // ── Events ─────────────────────────────────────────────────
    event RoundCreated(uint256 indexed roundId, uint256 entryFee);
    event PlayerEntered(uint256 indexed roundId, address indexed player, uint256 fee);
    event RoundStateChanged(uint256 indexed roundId, RoundState newState);
    event PrizeDistributed(uint256 indexed roundId, address indexed winner, uint256 amount);
    event TokensBurned(uint256 indexed roundId, uint256 amount);
    event TreasuryCut(uint256 indexed roundId, uint256 amount);
    event StreakPoolFunded(uint256 indexed roundId, uint256 amount);
    event StreakPoolPaid(address indexed winner, uint256 amount);
    event FeeSplitUpdated(uint256 prizeBps, uint256 treasuryBps, uint256 burnBps, uint256 streakPoolBps);
    event EmergencyWithdraw(address indexed token, uint256 amount);

    // ── Constructor ────────────────────────────────────────────
    constructor(
        address _clawnToken,
        address _treasury
    ) Ownable(msg.sender) {
        clawnToken = IERC20(_clawnToken);
        treasury = _treasury;

        // Default split: 60% prizes, 20% treasury, 10% burn, 10% streak pool
        defaultFeeSplit = FeeSplit({
            prizeBps: 6000,
            treasuryBps: 2000,
            burnBps: 1000,
            streakPoolBps: 1000
        });
    }

    // ── Round Management (Owner Only) ──────────────────────────

    function createRound(uint256 roundId, uint256 entryFee) external onlyOwner {
        require(!rounds[roundId].exists, "Round exists");
        require(entryFee > 0, "Fee must be > 0");

        rounds[roundId] = Round({
            entryFee: entryFee,
            state: RoundState.Open,
            totalPot: 0,
            entryCount: 0,
            feeSplit: defaultFeeSplit,
            exists: true
        });

        emit RoundCreated(roundId, entryFee);
    }

    function closeEntries(uint256 roundId) external onlyOwner {
        Round storage r = rounds[roundId];
        require(r.exists, "Round not found");
        require(r.state == RoundState.Open, "Not open");
        r.state = RoundState.Judging;
        emit RoundStateChanged(roundId, RoundState.Judging);
    }

    // ── Player Entry ───────────────────────────────────────────

    /// @notice Player enters a round. Must have approved this contract for entryFee first.
    function enter(uint256 roundId) external whenNotPaused nonReentrant {
        Round storage r = rounds[roundId];
        require(r.exists, "Round not found");
        require(r.state == RoundState.Open, "Not open");
        require(!hasEntered[roundId][msg.sender], "Already entered");

        hasEntered[roundId][msg.sender] = true;
        _roundPlayers[roundId].push(msg.sender);
        r.entryCount++;
        r.totalPot += r.entryFee;

        clawnToken.safeTransferFrom(msg.sender, address(this), r.entryFee);

        emit PlayerEntered(roundId, msg.sender, r.entryFee);
    }

    // ── Prize Distribution (Owner Only) ────────────────────────

    /// @notice Distribute prizes for a completed round.
    /// @param winners Array of winner addresses
    /// @param amounts Array of prize amounts (must sum to prizeBps portion of pot)
    function distribute(
        uint256 roundId,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        Round storage r = rounds[roundId];
        require(r.exists, "Round not found");
        require(r.state == RoundState.Judging, "Not in judging");
        require(winners.length == amounts.length, "Length mismatch");
        require(r.totalPot > 0, "Empty pot");

        r.state = RoundState.Complete;

        uint256 pot = r.totalPot;
        FeeSplit memory fs = r.feeSplit;

        // Calculate splits
        uint256 burnAmount = (pot * fs.burnBps) / BPS_DENOMINATOR;
        uint256 treasuryAmount = (pot * fs.treasuryBps) / BPS_DENOMINATOR;
        uint256 streakAmount = (pot * fs.streakPoolBps) / BPS_DENOMINATOR;
        uint256 prizePool = pot - burnAmount - treasuryAmount - streakAmount;

        // Verify winner amounts don't exceed prize pool
        uint256 totalPrizes;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalPrizes += amounts[i];
        }
        require(totalPrizes <= prizePool, "Prizes exceed pool");

        // Execute burn
        if (burnAmount > 0) {
            clawnToken.safeTransfer(BURN_ADDRESS, burnAmount);
            emit TokensBurned(roundId, burnAmount);
        }

        // Execute treasury cut
        if (treasuryAmount > 0) {
            clawnToken.safeTransfer(treasury, treasuryAmount);
            emit TreasuryCut(roundId, treasuryAmount);
        }

        // Accumulate streak pool
        if (streakAmount > 0) {
            streakPoolBalance += streakAmount;
            emit StreakPoolFunded(roundId, streakAmount);
        }

        // Pay winners
        for (uint256 i = 0; i < winners.length; i++) {
            if (amounts[i] > 0) {
                clawnToken.safeTransfer(winners[i], amounts[i]);
                emit PrizeDistributed(roundId, winners[i], amounts[i]);
            }
        }

        // Any dust from rounding goes to treasury
        uint256 dust = prizePool - totalPrizes;
        if (dust > 0) {
            clawnToken.safeTransfer(treasury, dust);
        }

        emit RoundStateChanged(roundId, RoundState.Complete);
    }

    // ── Streak Pool (Owner Only) ───────────────────────────────

    function payStreakBonus(address winner, uint256 amount) external onlyOwner nonReentrant {
        require(amount <= streakPoolBalance, "Insufficient streak pool");
        streakPoolBalance -= amount;
        clawnToken.safeTransfer(winner, amount);
        emit StreakPoolPaid(winner, amount);
    }

    // ── Admin ──────────────────────────────────────────────────

    function setDefaultFeeSplit(
        uint256 prizeBps,
        uint256 treasuryBps,
        uint256 burnBps,
        uint256 streakPoolBps
    ) external onlyOwner {
        require(prizeBps + treasuryBps + burnBps + streakPoolBps == BPS_DENOMINATOR, "Must sum to 10000");
        defaultFeeSplit = FeeSplit(prizeBps, treasuryBps, burnBps, streakPoolBps);
        emit FeeSplitUpdated(prizeBps, treasuryBps, burnBps, streakPoolBps);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Emergency: withdraw any ERC20 stuck in the contract
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(treasury, amount);
        emit EmergencyWithdraw(token, amount);
    }

    // ── Views ──────────────────────────────────────────────────

    function getRoundPlayers(uint256 roundId) external view returns (address[] memory) {
        return _roundPlayers[roundId];
    }

    function getRound(uint256 roundId) external view returns (
        uint256 entryFee,
        RoundState state,
        uint256 totalPot,
        uint256 entryCount
    ) {
        Round storage r = rounds[roundId];
        return (r.entryFee, r.state, r.totalPot, r.entryCount);
    }
}
```

---

## Deployment

### Chain
**Base Mainnet** (Chain ID: 8453)

### Constructor Arguments
| Param | Value |
|-------|-------|
| `_clawnToken` | `0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1` |
| `_treasury` | `0x79Bed28E6d195375C19e84350608eA3c4811D4B9` |

### Steps

```bash
# Using Foundry
forge create src/ClawnRoastBattle.sol:ClawnRoastBattle \
  --rpc-url https://mainnet.base.org \
  --constructor-args \
    0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1 \
    0x79Bed28E6d195375C19e84350608eA3c4811D4B9 \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY
```

After deployment, transfer ownership to the Clawn treasury wallet if deployed from a different address.

---

## Off-Chain Backend Integration

The backend (Node.js server running the Farcaster mini app) interacts with the contract via **viem** or **ethers.js**.

### Flow

```
1. Backend calls createRound(roundId, 50000e18) → opens a Daily Showdown
2. Frontend shows "Enter Round" button
3. Player approves $CLAWN spend → calls enter(roundId) from their wallet
4. Backend monitors PlayerEntered events to track participants
5. When round timer expires → backend calls closeEntries(roundId)
6. AI judges roasts off-chain
7. Backend calls distribute(roundId, [winners], [amounts])
```

### Round ID Convention
Use Unix timestamp of round start: e.g., `1738540800` for a round starting 2025-02-03 00:00 UTC. Simple, unique, sortable.

### Entry Fee
**Daily Showdown: 50,000 CLAWN** (= `50000 * 10^18` in wei)

### Example Backend Code (viem)

```typescript
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const BATTLE_ADDRESS = '0x...'; // deployed contract
const ENTRY_FEE = 50_000n * 10n ** 18n; // 50K CLAWN

const abi = parseAbi([
  'function createRound(uint256 roundId, uint256 entryFee) external',
  'function closeEntries(uint256 roundId) external',
  'function distribute(uint256 roundId, address[] winners, uint256[] amounts) external',
  'event PlayerEntered(uint256 indexed roundId, address indexed player, uint256 fee)',
]);

// Create daily round
async function createDailyRound(walletClient, roundId: bigint) {
  return walletClient.writeContract({
    address: BATTLE_ADDRESS,
    abi,
    functionName: 'createRound',
    args: [roundId, ENTRY_FEE],
  });
}

// Distribute prizes after judging
async function distributeRound(walletClient, roundId: bigint, winners: string[], amounts: bigint[]) {
  return walletClient.writeContract({
    address: BATTLE_ADDRESS,
    abi,
    functionName: 'distribute',
    args: [roundId, winners, amounts],
  });
}
```

---

## Fee Split — Default Configuration

| Destination | BPS | % | On 50K CLAWN entry | On 10-player round (500K pot) |
|-------------|------|-----|---------------------|-------------------------------|
| Prize Pool | 6000 | 60% | 30,000 CLAWN | 300,000 CLAWN |
| Treasury | 2000 | 20% | 10,000 CLAWN | 100,000 CLAWN |
| Burn | 1000 | 10% | 5,000 CLAWN | 50,000 CLAWN |
| Streak Pool | 1000 | 10% | 5,000 CLAWN | 50,000 CLAWN |

The burn is deflationary pressure. The streak pool rewards consecutive winners. Both are good tokenomics narratives.

---

## Gas Cost Estimates (Base L2)

| Operation | Estimated Gas | Cost @ 0.01 gwei L2 fee |
|-----------|--------------|--------------------------|
| `createRound` | ~80,000 | ~$0.001 |
| `enter` | ~95,000 | ~$0.001 |
| `closeEntries` | ~35,000 | ~$0.0005 |
| `distribute` (3 winners) | ~150,000 | ~$0.002 |

Base L2 gas is effectively free. The main cost is the L1 data posting, which adds ~$0.01-0.05 per tx depending on L1 congestion. Total per-round operational cost: **< $0.10**.

---

## Security Considerations

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Owner key compromise | Use multisig (Safe) for owner. Can upgrade later. |
| Reentrancy | `ReentrancyGuard` on all state-changing external functions |
| Token drain | `emergencyWithdraw` sends to treasury only, not arbitrary address |
| Overpayment in distribute | `require(totalPrizes <= prizePool)` check |
| Stuck funds | Emergency withdraw covers any ERC20 |
| Pausing | Owner can pause entries during incidents |
| Fee split manipulation | Split is frozen per-round at creation time (snapshot of `defaultFeeSplit`) |

### Not in MVP (Future Considerations)
- **Timelock** on fee split changes — add if community demands it
- **Multisig owner** — highly recommended before mainnet launch
- **Upgrade proxy** — intentionally omitted for simplicity. Deploy new contract + migrate if needed.
- **Max players per round** — add if gas becomes an issue with large `distribute` calls
- **Player refunds** — if a round is cancelled before judging, need a `cancelRound` + refund mechanism (add in v2)

### Audit Checklist (Pre-Deploy)
- [ ] Run Slither static analysis
- [ ] Run Foundry fuzz tests on distribute edge cases
- [ ] Verify OZ imports are latest stable (v5.x)
- [ ] Test on Base Sepolia first
- [ ] Verify contract on BaseScan immediately after deploy

---

## Summary

One contract. ~150 lines of Solidity. Handles entries, burns, splits, and payouts. The backend creates rounds and distributes prizes — the contract enforces the rules. Players can verify everything on-chain.

Ship it. 🤡🔥
