// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ClownPrizePool
 * @notice Manages prize pools for Clown Roast Battle rounds
 * @dev UUPS upgradeable. Users enter directly via enterRound().
 * 
 * Flow:
 * 1. Owner creates round with createRound(roundId, entryFee)
 * 2. Users approve CLAWN, then call enterRound(roundId, entryId)
 * 3. Owner distributes prizes with distribute(roundId, winners, amounts)
 * 
 * Fee distribution:
 * - 70% to winners (prizes)
 * - 15% to treasury
 * - 10% burned
 * - 5% to streak pool
 */
contract ClownPrizePool is 
    OwnableUpgradeable, 
    UUPSUpgradeable, 
    ReentrancyGuardUpgradeable 
{
    using SafeERC20 for IERC20;

    // ============ Constants ============
    
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    uint256 public constant PRIZE_BPS = 7000;     // 70%
    uint256 public constant TREASURY_BPS = 1500;  // 15%
    uint256 public constant BURN_BPS = 1000;      // 10%
    uint256 public constant STREAK_BPS = 500;     // 5%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============ State Variables ============
    
    IERC20 public clawnToken;
    address public treasury;
    address public streakPool;
    
    struct Round {
        uint256 entryFee;      // Cost to enter this round
        uint256 funded;        // Total CLAWN collected from entries
        uint256 distributed;   // Total CLAWN distributed to winners
        uint256 refunded;      // Total CLAWN refunded
        bool isComplete;       // No more entries, distribution/refund done
    }
    
    mapping(bytes32 => Round) public rounds;
    
    /// @notice Total CLAWN allocated to active rounds
    uint256 public totalAllocated;
    
    uint256 public totalBurned;
    uint256 public totalToTreasury;
    uint256 public totalToStreakPool;

    // ============ Events ============
    
    event RoundCreated(bytes32 indexed roundId, uint256 entryFee);
    event RoundEntered(
        bytes32 indexed roundId, 
        bytes32 indexed entryId, 
        address indexed user, 
        uint256 amount
    );
    event PrizesDistributed(
        bytes32 indexed roundId, 
        address[] winners, 
        uint256[] amounts,
        uint256 totalPrizes,
        uint256 burned,
        uint256 toTreasury,
        uint256 toStreakPool
    );
    event RoundRefunded(bytes32 indexed roundId, uint256 totalRefunded);
    event RoundClosed(bytes32 indexed roundId, uint256 unrefundedAmount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event StreakPoolUpdated(address indexed oldPool, address indexed newPool);
    event TokensRescued(address indexed token, uint256 amount);

    // ============ Errors ============
    
    error ZeroAddress();
    error RoundAlreadyExists(bytes32 roundId);
    error RoundNotFound(bytes32 roundId);
    error RoundAlreadyComplete(bytes32 roundId);
    error RoundNotFunded(bytes32 roundId);
    error ArrayLengthMismatch();
    error ExceedsPrizePool(uint256 requested, uint256 available);
    error NoFundsToRefund(bytes32 roundId);
    error RefundExceedsFunded(bytes32 roundId, uint256 totalRefunded, uint256 funded);
    error InsufficientUnallocatedBalance(uint256 requested, uint256 available);
    error ZeroEntryFee();
    error RoundPartiallyRefunded(bytes32 roundId);

    // ============ Initializer ============
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(
        address _clawnToken,
        address _treasury,
        address _streakPool
    ) public initializer {
        if (_clawnToken == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_streakPool == address(0)) revert ZeroAddress();
        
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        clawnToken = IERC20(_clawnToken);
        treasury = _treasury;
        streakPool = _streakPool;
    }

    // ============ Round Management ============
    
    /**
     * @notice Create a new round
     * @param roundId Unique identifier for the round
     * @param entryFee Cost in CLAWN to enter this round
     */
    function createRound(bytes32 roundId, uint256 entryFee) external onlyOwner {
        if (rounds[roundId].entryFee != 0) revert RoundAlreadyExists(roundId);
        if (entryFee == 0) revert ZeroEntryFee();
        
        rounds[roundId].entryFee = entryFee;
        
        emit RoundCreated(roundId, entryFee);
    }
    
    /**
     * @notice Enter a round by paying the entry fee
     * @dev User must approve CLAWN transfer first
     * @param roundId Round to enter
     * @param entryId Unique entry ID from backend (for event tracking)
     */
    function enterRound(bytes32 roundId, bytes32 entryId) external nonReentrant {
        Round storage round = rounds[roundId];
        
        if (round.entryFee == 0) revert RoundNotFound(roundId);
        if (round.isComplete) revert RoundAlreadyComplete(roundId);
        
        uint256 fee = round.entryFee;
        
        // Transfer entry fee from user to contract
        clawnToken.safeTransferFrom(msg.sender, address(this), fee);
        
        round.funded += fee;
        totalAllocated += fee;
        
        emit RoundEntered(roundId, entryId, msg.sender, fee);
    }

    // ============ Distribution ============
    
    /**
     * @notice Distribute prizes and handle fee splits
     * @dev Closes the round. Distributes 70% to winners, 15% treasury, 10% burn, 5% streak
     * @param roundId Round to distribute
     * @param winners Array of winner addresses
     * @param amounts Array of prize amounts (must sum to ≤ 70% of funded)
     */
    function distribute(
        bytes32 roundId,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        if (winners.length != amounts.length) revert ArrayLengthMismatch();
        
        Round storage round = rounds[roundId];
        
        if (round.entryFee == 0) revert RoundNotFound(roundId);
        if (round.isComplete) revert RoundAlreadyComplete(roundId);
        if (round.funded == 0) revert RoundNotFunded(roundId);
        if (round.refunded > 0) revert RoundPartiallyRefunded(roundId);
        
        uint256 totalFunded = round.funded;
        uint256 maxPrizes = (totalFunded * PRIZE_BPS) / BPS_DENOMINATOR;
        uint256 treasuryAmount = (totalFunded * TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 burnAmount = (totalFunded * BURN_BPS) / BPS_DENOMINATOR;
        uint256 streakAmount = totalFunded - maxPrizes - treasuryAmount - burnAmount;
        
        uint256 totalPrizes;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalPrizes += amounts[i];
        }
        if (totalPrizes > maxPrizes) {
            revert ExceedsPrizePool(totalPrizes, maxPrizes);
        }
        
        // Mark complete and release allocation (CEI pattern)
        round.isComplete = true;
        round.distributed = totalPrizes;
        totalAllocated -= totalFunded;
        
        // Update totals
        totalBurned += burnAmount;
        totalToTreasury += treasuryAmount;
        totalToStreakPool += streakAmount;
        
        // Transfer prizes
        for (uint256 i = 0; i < winners.length; i++) {
            if (amounts[i] > 0 && winners[i] != address(0)) {
                clawnToken.safeTransfer(winners[i], amounts[i]);
            }
        }
        
        // Transfer burn, treasury, streak
        clawnToken.safeTransfer(BURN_ADDRESS, burnAmount);
        clawnToken.safeTransfer(treasury, treasuryAmount);
        clawnToken.safeTransfer(streakPool, streakAmount);
        
        emit PrizesDistributed(
            roundId, 
            winners, 
            amounts, 
            totalPrizes,
            burnAmount,
            treasuryAmount,
            streakAmount
        );
    }
    
    /**
     * @notice Refund a cancelled round
     * @param roundId Round to refund
     * @param participants Array of participant addresses
     * @param amounts Array of refund amounts
     */
    function refundRound(
        bytes32 roundId,
        address[] calldata participants,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        if (participants.length != amounts.length) revert ArrayLengthMismatch();
        
        Round storage round = rounds[roundId];
        
        if (round.entryFee == 0) revert RoundNotFound(roundId);
        if (round.isComplete) revert RoundAlreadyComplete(roundId);
        if (round.funded == 0) revert NoFundsToRefund(roundId);
        
        uint256 refundingNow;
        for (uint256 i = 0; i < amounts.length; i++) {
            refundingNow += amounts[i];
        }
        
        uint256 newTotalRefunded = round.refunded + refundingNow;
        if (newTotalRefunded > round.funded) {
            revert RefundExceedsFunded(roundId, newTotalRefunded, round.funded);
        }
        
        round.refunded = newTotalRefunded;
        
        // If fully refunded, mark complete
        if (newTotalRefunded == round.funded) {
            round.isComplete = true;
            totalAllocated -= round.funded;
        }
        
        // Transfer refunds
        for (uint256 i = 0; i < participants.length; i++) {
            if (amounts[i] > 0 && participants[i] != address(0)) {
                clawnToken.safeTransfer(participants[i], amounts[i]);
            }
        }
        
        emit RoundRefunded(roundId, refundingNow);
    }
    
    /**
     * @notice Close a partially refunded round
     * @param roundId Round to close
     */
    function closeRefundedRound(bytes32 roundId) external onlyOwner {
        Round storage round = rounds[roundId];
        
        if (round.entryFee == 0) revert RoundNotFound(roundId);
        if (round.isComplete) revert RoundAlreadyComplete(roundId);
        if (round.funded == 0) revert RoundNotFunded(roundId);
        if (round.refunded == 0) revert NoFundsToRefund(roundId);
        
        uint256 unrefunded = round.funded - round.refunded;
        
        round.isComplete = true;
        totalAllocated -= round.funded;
        
        emit RoundClosed(roundId, unrefunded);
    }

    // ============ Admin Functions ============
    
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }
    
    function setStreakPool(address _streakPool) external onlyOwner {
        if (_streakPool == address(0)) revert ZeroAddress();
        emit StreakPoolUpdated(streakPool, _streakPool);
        streakPool = _streakPool;
    }
    
    /**
     * @notice Rescue tokens (only unallocated CLAWN, any amount of other tokens)
     */
    function rescue(address token, uint256 amount) external onlyOwner {
        if (token == address(clawnToken)) {
            uint256 balance = clawnToken.balanceOf(address(this));
            uint256 available = balance > totalAllocated ? balance - totalAllocated : 0;
            if (amount > available) {
                revert InsufficientUnallocatedBalance(amount, available);
            }
        }
        IERC20(token).safeTransfer(owner(), amount);
        emit TokensRescued(token, amount);
    }

    // ============ View Functions ============
    
    function getRound(bytes32 roundId) external view returns (
        uint256 entryFee,
        uint256 funded,
        uint256 distributed,
        uint256 refunded,
        bool isComplete
    ) {
        Round storage round = rounds[roundId];
        return (round.entryFee, round.funded, round.distributed, round.refunded, round.isComplete);
    }
    
    function calculateSplits(bytes32 roundId) external view returns (
        uint256 maxPrizes,
        uint256 treasuryAmount,
        uint256 burnAmount,
        uint256 streakAmount
    ) {
        uint256 totalFunded = rounds[roundId].funded;
        maxPrizes = (totalFunded * PRIZE_BPS) / BPS_DENOMINATOR;
        treasuryAmount = (totalFunded * TREASURY_BPS) / BPS_DENOMINATOR;
        burnAmount = (totalFunded * BURN_BPS) / BPS_DENOMINATOR;
        streakAmount = totalFunded - maxPrizes - treasuryAmount - burnAmount;
    }
    
    function getUnallocatedBalance() external view returns (uint256) {
        uint256 balance = clawnToken.balanceOf(address(this));
        return balance > totalAllocated ? balance - totalAllocated : 0;
    }
    
    function getStats() external view returns (
        uint256 _totalBurned,
        uint256 _totalToTreasury,
        uint256 _totalToStreakPool,
        uint256 _totalAllocated,
        uint256 balance
    ) {
        return (
            totalBurned,
            totalToTreasury,
            totalToStreakPool,
            totalAllocated,
            clawnToken.balanceOf(address(this))
        );
    }

    // ============ Upgrade ============
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    function version() external pure returns (string memory) {
        return "2.1.0";
    }
    
    // ============ Storage Gap ============
    
    /// @dev Reserved storage slots for future upgrades
    uint256[50] private __gap;
}
