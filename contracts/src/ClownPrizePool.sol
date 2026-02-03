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
 * @dev UUPS upgradeable pattern for future improvements
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
    
    /// @notice Burn address for deflationary mechanics
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    /// @notice Distribution percentages in basis points (100 = 1%)
    uint256 public constant PRIZE_BPS = 7000;     // 70%
    uint256 public constant TREASURY_BPS = 1500;  // 15%
    uint256 public constant BURN_BPS = 1000;      // 10%
    uint256 public constant STREAK_BPS = 500;     // 5%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============ State Variables ============
    
    /// @notice The CLAWN token contract
    IERC20 public clawnToken;
    
    /// @notice Treasury address receives 15% of entry fees
    address public treasury;
    
    /// @notice Streak pool address receives 5% of entry fees
    address public streakPool;
    
    /// @notice Round data
    struct Round {
        uint256 funded;        // Total CLAWN funded for this round
        uint256 distributed;   // Total CLAWN distributed to winners
        bool isComplete;       // Whether distribution is complete
    }
    
    /// @notice Mapping of roundId => Round data
    mapping(bytes32 => Round) public rounds;
    
    /// @notice Total burned across all rounds
    uint256 public totalBurned;
    
    /// @notice Total sent to treasury across all rounds
    uint256 public totalToTreasury;
    
    /// @notice Total sent to streak pool across all rounds
    uint256 public totalToStreakPool;

    // ============ Events ============
    
    event RoundFunded(bytes32 indexed roundId, uint256 amount);
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
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event StreakPoolUpdated(address indexed oldPool, address indexed newPool);
    event TokensRescued(address indexed token, uint256 amount);

    // ============ Errors ============
    
    error ZeroAddress();
    error RoundAlreadyComplete(bytes32 roundId);
    error RoundNotFunded(bytes32 roundId);
    error ArrayLengthMismatch();
    error ExceedsPrizePool(uint256 requested, uint256 available);
    error NoFundsToRefund(bytes32 roundId);

    // ============ Initializer ============
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the contract
     * @param _clawnToken Address of the CLAWN token
     * @param _treasury Address to receive treasury fees
     * @param _streakPool Address to receive streak pool fees
     */
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

    // ============ Owner Functions ============
    
    /**
     * @notice Fund a round with collected entry fees
     * @dev Call this after collecting fees off-chain, before distribution
     * @param roundId Unique identifier for the round
     * @param amount Total CLAWN collected for this round
     */
    function fundRound(bytes32 roundId, uint256 amount) external onlyOwner {
        if (rounds[roundId].isComplete) revert RoundAlreadyComplete(roundId);
        
        // Transfer tokens from owner to contract
        clawnToken.safeTransferFrom(msg.sender, address(this), amount);
        
        rounds[roundId].funded += amount;
        
        emit RoundFunded(roundId, amount);
    }
    
    /**
     * @notice Distribute prizes and handle fee splits
     * @dev Distributes 70% to winners, 15% treasury, 10% burn, 5% streak
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
        if (rounds[roundId].isComplete) revert RoundAlreadyComplete(roundId);
        
        Round storage round = rounds[roundId];
        if (round.funded == 0) revert RoundNotFunded(roundId);
        
        // Calculate splits based on total funded
        uint256 totalFunded = round.funded;
        uint256 maxPrizes = (totalFunded * PRIZE_BPS) / BPS_DENOMINATOR;
        uint256 treasuryAmount = (totalFunded * TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 burnAmount = (totalFunded * BURN_BPS) / BPS_DENOMINATOR;
        uint256 streakAmount = totalFunded - maxPrizes - treasuryAmount - burnAmount;
        
        // Verify prize amounts don't exceed pool
        uint256 totalPrizes;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalPrizes += amounts[i];
        }
        if (totalPrizes > maxPrizes) {
            revert ExceedsPrizePool(totalPrizes, maxPrizes);
        }
        
        // Mark as complete before transfers (CEI pattern)
        round.isComplete = true;
        round.distributed = totalPrizes;
        
        // Update totals
        totalBurned += burnAmount;
        totalToTreasury += treasuryAmount;
        totalToStreakPool += streakAmount;
        
        // Transfer prizes to winners
        for (uint256 i = 0; i < winners.length; i++) {
            if (amounts[i] > 0 && winners[i] != address(0)) {
                clawnToken.safeTransfer(winners[i], amounts[i]);
            }
        }
        
        // Transfer burn
        clawnToken.safeTransfer(BURN_ADDRESS, burnAmount);
        
        // Transfer treasury
        clawnToken.safeTransfer(treasury, treasuryAmount);
        
        // Transfer streak pool
        clawnToken.safeTransfer(streakPool, streakAmount);
        
        // If prizes < maxPrizes, leftover stays in contract (can be rescued)
        
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
     * @dev Use when round has 0-1 entries and needs cancellation
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
        if (rounds[roundId].isComplete) revert RoundAlreadyComplete(roundId);
        if (rounds[roundId].funded == 0) revert NoFundsToRefund(roundId);
        
        Round storage round = rounds[roundId];
        round.isComplete = true;
        
        uint256 totalRefunded;
        for (uint256 i = 0; i < participants.length; i++) {
            if (amounts[i] > 0 && participants[i] != address(0)) {
                clawnToken.safeTransfer(participants[i], amounts[i]);
                totalRefunded += amounts[i];
            }
        }
        
        emit RoundRefunded(roundId, totalRefunded);
    }
    
    /**
     * @notice Update treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }
    
    /**
     * @notice Update streak pool address
     * @param _streakPool New streak pool address
     */
    function setStreakPool(address _streakPool) external onlyOwner {
        if (_streakPool == address(0)) revert ZeroAddress();
        emit StreakPoolUpdated(streakPool, _streakPool);
        streakPool = _streakPool;
    }
    
    /**
     * @notice Rescue tokens accidentally sent to contract
     * @dev Safety valve for stuck tokens
     * @param token Token address to rescue
     * @param amount Amount to rescue
     */
    function rescue(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
        emit TokensRescued(token, amount);
    }

    // ============ View Functions ============
    
    /**
     * @notice Get round information
     * @param roundId Round to query
     * @return funded Total funded
     * @return distributed Total distributed to winners
     * @return isComplete Whether round is complete
     */
    function getRound(bytes32 roundId) external view returns (
        uint256 funded,
        uint256 distributed,
        bool isComplete
    ) {
        Round storage round = rounds[roundId];
        return (round.funded, round.distributed, round.isComplete);
    }
    
    /**
     * @notice Calculate distribution amounts for a funded round
     * @param roundId Round to calculate for
     * @return maxPrizes Maximum prize pool (70%)
     * @return treasuryAmount Treasury share (15%)
     * @return burnAmount Burn amount (10%)
     * @return streakAmount Streak pool share (5%)
     */
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
    
    /**
     * @notice Get contract statistics
     * @return _totalBurned Total CLAWN burned
     * @return _totalToTreasury Total sent to treasury
     * @return _totalToStreakPool Total sent to streak pool
     * @return balance Current CLAWN balance
     */
    function getStats() external view returns (
        uint256 _totalBurned,
        uint256 _totalToTreasury,
        uint256 _totalToStreakPool,
        uint256 balance
    ) {
        return (
            totalBurned,
            totalToTreasury,
            totalToStreakPool,
            clawnToken.balanceOf(address(this))
        );
    }

    // ============ Upgrade Authorization ============
    
    /**
     * @dev Required by UUPS pattern
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    /**
     * @notice Get implementation version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
