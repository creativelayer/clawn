// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ClownPrizePool.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev Mock CLAWN token for testing
contract MockCLAWN is ERC20 {
    constructor() ERC20("Clawn Token", "CLAWN") {
        _mint(msg.sender, 100_000_000_000 * 1e18); // 100B supply
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ClownPrizePoolTest is Test {
    ClownPrizePool public implementation;
    ClownPrizePool public pool;
    MockCLAWN public clawn;
    
    address public owner = address(this);
    address public treasury = makeAddr("treasury");
    address public streakPool = makeAddr("streakPool");
    address public winner1 = makeAddr("winner1");
    address public winner2 = makeAddr("winner2");
    address public winner3 = makeAddr("winner3");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    
    uint256 public constant ENTRY_FEE = 50_000 * 1e18; // 50K CLAWN
    
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
    
    function setUp() public {
        // Deploy mock token
        clawn = new MockCLAWN();
        
        // Deploy implementation
        implementation = new ClownPrizePool();
        
        // Deploy proxy
        bytes memory initData = abi.encodeCall(
            ClownPrizePool.initialize,
            (address(clawn), treasury, streakPool)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        pool = ClownPrizePool(address(proxy));
    }
    
    // ============ Initialization Tests ============
    
    function test_Initialize() public {
        assertEq(address(pool.clawnToken()), address(clawn));
        assertEq(pool.treasury(), treasury);
        assertEq(pool.streakPool(), streakPool);
        assertEq(pool.owner(), owner);
        assertEq(pool.version(), "1.1.0");
    }
    
    function test_CannotInitializeTwice() public {
        vm.expectRevert();
        pool.initialize(address(clawn), treasury, streakPool);
    }
    
    function test_CannotInitializeWithZeroAddress() public {
        ClownPrizePool newImpl = new ClownPrizePool();
        
        // Zero clawn token
        vm.expectRevert(ClownPrizePool.ZeroAddress.selector);
        new ERC1967Proxy(
            address(newImpl), 
            abi.encodeCall(ClownPrizePool.initialize, (address(0), treasury, streakPool))
        );
        
        // Zero treasury
        vm.expectRevert(ClownPrizePool.ZeroAddress.selector);
        new ERC1967Proxy(
            address(newImpl), 
            abi.encodeCall(ClownPrizePool.initialize, (address(clawn), address(0), streakPool))
        );
        
        // Zero streak pool
        vm.expectRevert(ClownPrizePool.ZeroAddress.selector);
        new ERC1967Proxy(
            address(newImpl), 
            abi.encodeCall(ClownPrizePool.initialize, (address(clawn), treasury, address(0)))
        );
    }
    
    // ============ Fund Round Tests ============
    
    function test_FundRound() public {
        bytes32 roundId = keccak256("round1");
        uint256 amount = 10 * ENTRY_FEE; // 10 entries
        
        // Approve and fund
        clawn.approve(address(pool), amount);
        
        vm.expectEmit(true, false, false, true);
        emit RoundFunded(roundId, amount);
        
        pool.fundRound(roundId, amount);
        
        (uint256 funded, uint256 distributed, uint256 refunded, bool isComplete) = pool.getRound(roundId);
        assertEq(funded, amount);
        assertEq(distributed, 0);
        assertEq(refunded, 0);
        assertFalse(isComplete);
        assertEq(clawn.balanceOf(address(pool)), amount);
        assertEq(pool.totalAllocated(), amount);
    }
    
    function test_FundRoundMultipleTimes() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), 2 * ENTRY_FEE);
        
        pool.fundRound(roundId, ENTRY_FEE);
        pool.fundRound(roundId, ENTRY_FEE);
        
        (uint256 funded,,,) = pool.getRound(roundId);
        assertEq(funded, 2 * ENTRY_FEE);
        assertEq(pool.totalAllocated(), 2 * ENTRY_FEE);
    }
    
    function test_CannotFundCompletedRound() public {
        bytes32 roundId = keccak256("round1");
        
        // Fund and distribute
        clawn.approve(address(pool), ENTRY_FEE);
        pool.fundRound(roundId, ENTRY_FEE);
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = (ENTRY_FEE * 7000) / 10000; // 70%
        
        pool.distribute(roundId, winners, amounts);
        
        // Try to fund again
        clawn.approve(address(pool), ENTRY_FEE);
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundAlreadyComplete.selector, roundId));
        pool.fundRound(roundId, ENTRY_FEE);
    }
    
    function test_OnlyOwnerCanFund() public {
        bytes32 roundId = keccak256("round1");
        
        vm.prank(user1);
        vm.expectRevert();
        pool.fundRound(roundId, ENTRY_FEE);
    }
    
    // ============ Distribution Tests ============
    
    function test_DistributeSingleWinner() public {
        bytes32 roundId = keccak256("round1");
        uint256 totalPool = 10 * ENTRY_FEE; // 500K CLAWN
        
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        // Calculate expected splits
        uint256 maxPrizes = (totalPool * 7000) / 10000;  // 350K
        uint256 treasuryAmt = (totalPool * 1500) / 10000; // 75K
        uint256 burnAmt = (totalPool * 1000) / 10000;     // 50K
        uint256 streakAmt = totalPool - maxPrizes - treasuryAmt - burnAmt; // 25K
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = maxPrizes;
        
        pool.distribute(roundId, winners, amounts);
        
        // Verify balances
        assertEq(clawn.balanceOf(winner1), maxPrizes);
        assertEq(clawn.balanceOf(treasury), treasuryAmt);
        assertEq(clawn.balanceOf(pool.BURN_ADDRESS()), burnAmt);
        assertEq(clawn.balanceOf(streakPool), streakAmt);
        
        // Verify round state
        (uint256 funded, uint256 distributed,, bool isComplete) = pool.getRound(roundId);
        assertEq(funded, totalPool);
        assertEq(distributed, maxPrizes);
        assertTrue(isComplete);
        
        // Verify allocation released
        assertEq(pool.totalAllocated(), 0);
        
        // Verify stats
        (uint256 totalBurned, uint256 totalToTreasury, uint256 totalToStreakPool,,) = pool.getStats();
        assertEq(totalBurned, burnAmt);
        assertEq(totalToTreasury, treasuryAmt);
        assertEq(totalToStreakPool, streakAmt);
    }
    
    function test_DistributeThreeWinners() public {
        bytes32 roundId = keccak256("round1");
        uint256 totalPool = 10 * ENTRY_FEE;
        
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        uint256 maxPrizes = (totalPool * 7000) / 10000;
        
        // 60/25/15 split among winners
        uint256 prize1 = (maxPrizes * 60) / 100;
        uint256 prize2 = (maxPrizes * 25) / 100;
        uint256 prize3 = maxPrizes - prize1 - prize2; // Remainder to avoid rounding issues
        
        address[] memory winners = new address[](3);
        winners[0] = winner1;
        winners[1] = winner2;
        winners[2] = winner3;
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = prize1;
        amounts[1] = prize2;
        amounts[2] = prize3;
        
        pool.distribute(roundId, winners, amounts);
        
        assertEq(clawn.balanceOf(winner1), prize1);
        assertEq(clawn.balanceOf(winner2), prize2);
        assertEq(clawn.balanceOf(winner3), prize3);
    }
    
    function test_DistributePartialPrizes() public {
        bytes32 roundId = keccak256("round1");
        uint256 totalPool = 10 * ENTRY_FEE;
        
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        uint256 maxPrizes = (totalPool * 7000) / 10000;
        uint256 partialPrize = maxPrizes / 2; // Only distribute half
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = partialPrize;
        
        pool.distribute(roundId, winners, amounts);
        
        // Winner gets partial, leftover stays in contract
        assertEq(clawn.balanceOf(winner1), partialPrize);
        
        // Leftover can be rescued (now unallocated)
        uint256 leftover = maxPrizes - partialPrize;
        assertEq(clawn.balanceOf(address(pool)), leftover);
        assertEq(pool.getUnallocatedBalance(), leftover);
    }
    
    function test_CannotDistributeMoreThanPool() public {
        bytes32 roundId = keccak256("round1");
        uint256 totalPool = 10 * ENTRY_FEE;
        
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        uint256 maxPrizes = (totalPool * 7000) / 10000;
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = maxPrizes + 1; // Too much
        
        vm.expectRevert(
            abi.encodeWithSelector(ClownPrizePool.ExceedsPrizePool.selector, maxPrizes + 1, maxPrizes)
        );
        pool.distribute(roundId, winners, amounts);
    }
    
    function test_CannotDistributeUnfundedRound() public {
        bytes32 roundId = keccak256("unfunded");
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ENTRY_FEE;
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundNotFunded.selector, roundId));
        pool.distribute(roundId, winners, amounts);
    }
    
    function test_CannotDistributeTwice() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), ENTRY_FEE);
        pool.fundRound(roundId, ENTRY_FEE);
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = (ENTRY_FEE * 7000) / 10000;
        
        pool.distribute(roundId, winners, amounts);
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundAlreadyComplete.selector, roundId));
        pool.distribute(roundId, winners, amounts);
    }
    
    function test_DistributeArrayLengthMismatch() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), ENTRY_FEE);
        pool.fundRound(roundId, ENTRY_FEE);
        
        address[] memory winners = new address[](2);
        uint256[] memory amounts = new uint256[](1);
        
        vm.expectRevert(ClownPrizePool.ArrayLengthMismatch.selector);
        pool.distribute(roundId, winners, amounts);
    }
    
    function test_OnlyOwnerCanDistribute() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), ENTRY_FEE);
        pool.fundRound(roundId, ENTRY_FEE);
        
        address[] memory winners = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        
        vm.prank(user1);
        vm.expectRevert();
        pool.distribute(roundId, winners, amounts);
    }
    
    // ============ Refund Tests ============
    
    function test_RefundRound() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), 2 * ENTRY_FEE);
        pool.fundRound(roundId, 2 * ENTRY_FEE);
        
        address[] memory participants = new address[](2);
        participants[0] = user1;
        participants[1] = user2;
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ENTRY_FEE;
        amounts[1] = ENTRY_FEE;
        
        vm.expectEmit(true, false, false, true);
        emit RoundRefunded(roundId, 2 * ENTRY_FEE);
        
        pool.refundRound(roundId, participants, amounts);
        
        assertEq(clawn.balanceOf(user1), ENTRY_FEE);
        assertEq(clawn.balanceOf(user2), ENTRY_FEE);
        
        (,, uint256 refunded, bool isComplete) = pool.getRound(roundId);
        assertEq(refunded, 2 * ENTRY_FEE);
        assertTrue(isComplete);
        assertEq(pool.totalAllocated(), 0);
    }
    
    function test_RefundRoundPartial() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), 3 * ENTRY_FEE);
        pool.fundRound(roundId, 3 * ENTRY_FEE);
        
        // First refund batch
        address[] memory participants1 = new address[](1);
        participants1[0] = user1;
        uint256[] memory amounts1 = new uint256[](1);
        amounts1[0] = ENTRY_FEE;
        
        pool.refundRound(roundId, participants1, amounts1);
        
        // Round not complete yet (partial refund)
        (,, uint256 refunded, bool isComplete) = pool.getRound(roundId);
        assertEq(refunded, ENTRY_FEE);
        assertFalse(isComplete);
        assertEq(pool.totalAllocated(), 3 * ENTRY_FEE); // Still allocated
        
        // Second refund batch
        address[] memory participants2 = new address[](1);
        participants2[0] = user2;
        uint256[] memory amounts2 = new uint256[](1);
        amounts2[0] = 2 * ENTRY_FEE;
        
        pool.refundRound(roundId, participants2, amounts2);
        
        // Now complete
        (,, refunded, isComplete) = pool.getRound(roundId);
        assertEq(refunded, 3 * ENTRY_FEE);
        assertTrue(isComplete);
        assertEq(pool.totalAllocated(), 0);
    }
    
    function test_CannotRefundMoreThanFunded() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), 2 * ENTRY_FEE);
        pool.fundRound(roundId, 2 * ENTRY_FEE);
        
        address[] memory participants = new address[](1);
        participants[0] = user1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 3 * ENTRY_FEE; // More than funded
        
        vm.expectRevert(
            abi.encodeWithSelector(
                ClownPrizePool.RefundExceedsFunded.selector, 
                roundId, 
                3 * ENTRY_FEE, 
                2 * ENTRY_FEE
            )
        );
        pool.refundRound(roundId, participants, amounts);
    }
    
    function test_CannotRefundMoreThanFundedCumulative() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), 2 * ENTRY_FEE);
        pool.fundRound(roundId, 2 * ENTRY_FEE);
        
        // First refund
        address[] memory participants1 = new address[](1);
        participants1[0] = user1;
        uint256[] memory amounts1 = new uint256[](1);
        amounts1[0] = ENTRY_FEE;
        pool.refundRound(roundId, participants1, amounts1);
        
        // Second refund exceeds remaining
        address[] memory participants2 = new address[](1);
        participants2[0] = user2;
        uint256[] memory amounts2 = new uint256[](1);
        amounts2[0] = ENTRY_FEE + 1; // 1 too much
        
        vm.expectRevert(
            abi.encodeWithSelector(
                ClownPrizePool.RefundExceedsFunded.selector, 
                roundId, 
                2 * ENTRY_FEE + 1, 
                2 * ENTRY_FEE
            )
        );
        pool.refundRound(roundId, participants2, amounts2);
    }
    
    function test_CloseRefundedRound() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), 3 * ENTRY_FEE);
        pool.fundRound(roundId, 3 * ENTRY_FEE);
        
        // Partial refund
        address[] memory participants = new address[](1);
        participants[0] = user1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 2 * ENTRY_FEE;
        pool.refundRound(roundId, participants, amounts);
        
        // Close the round with remaining funds unrefunded
        pool.closeRefundedRound(roundId);
        
        (uint256 funded,, uint256 refunded, bool isComplete) = pool.getRound(roundId);
        assertTrue(isComplete);
        assertEq(funded, 3 * ENTRY_FEE);
        assertEq(refunded, 2 * ENTRY_FEE);
        
        // Remaining 1 ENTRY_FEE is now unallocated
        assertEq(pool.totalAllocated(), 0);
        assertEq(pool.getUnallocatedBalance(), ENTRY_FEE);
    }
    
    function test_CannotRefundCompletedRound() public {
        bytes32 roundId = keccak256("round1");
        
        clawn.approve(address(pool), ENTRY_FEE);
        pool.fundRound(roundId, ENTRY_FEE);
        
        // Distribute first
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = (ENTRY_FEE * 7000) / 10000;
        pool.distribute(roundId, winners, amounts);
        
        // Try to refund
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundAlreadyComplete.selector, roundId));
        pool.refundRound(roundId, winners, amounts);
    }
    
    function test_CannotRefundUnfundedRound() public {
        bytes32 roundId = keccak256("unfunded");
        
        address[] memory participants = new address[](1);
        participants[0] = user1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ENTRY_FEE;
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.NoFundsToRefund.selector, roundId));
        pool.refundRound(roundId, participants, amounts);
    }
    
    // ============ Rescue Tests ============
    
    function test_RescueUnallocatedClawn() public {
        // Send some tokens directly to contract (not via fundRound)
        clawn.transfer(address(pool), 1000 * 1e18);
        
        uint256 ownerBefore = clawn.balanceOf(owner);
        
        vm.expectEmit(true, false, false, true);
        emit TokensRescued(address(clawn), 1000 * 1e18);
        
        pool.rescue(address(clawn), 1000 * 1e18);
        
        assertEq(clawn.balanceOf(owner), ownerBefore + 1000 * 1e18);
    }
    
    function test_CannotRescueAllocatedClawn() public {
        bytes32 roundId = keccak256("round1");
        uint256 amount = 10 * ENTRY_FEE;
        
        // Fund a round
        clawn.approve(address(pool), amount);
        pool.fundRound(roundId, amount);
        
        // Try to rescue allocated funds
        vm.expectRevert(
            abi.encodeWithSelector(
                ClownPrizePool.InsufficientUnallocatedBalance.selector,
                amount,
                0
            )
        );
        pool.rescue(address(clawn), amount);
    }
    
    function test_RescuePartialUnallocated() public {
        bytes32 roundId = keccak256("round1");
        uint256 allocated = 10 * ENTRY_FEE;
        uint256 extra = 1000 * 1e18;
        
        // Fund a round
        clawn.approve(address(pool), allocated);
        pool.fundRound(roundId, allocated);
        
        // Send extra tokens directly
        clawn.transfer(address(pool), extra);
        
        // Can rescue the extra
        pool.rescue(address(clawn), extra);
        
        // Cannot rescue allocated
        vm.expectRevert();
        pool.rescue(address(clawn), 1);
    }
    
    function test_RescueAfterDistribute() public {
        bytes32 roundId = keccak256("round1");
        uint256 totalPool = 100_000 * 1e18;
        
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        // Distribute with partial prizes
        uint256 maxPrizes = (totalPool * 7000) / 10000;
        uint256 partialPrize = maxPrizes / 2;
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = partialPrize;
        
        pool.distribute(roundId, winners, amounts);
        
        // Leftover prizes are now unallocated
        uint256 leftover = maxPrizes - partialPrize;
        assertEq(pool.getUnallocatedBalance(), leftover);
        
        // Can rescue leftover
        pool.rescue(address(clawn), leftover);
    }
    
    function test_RescueOtherToken() public {
        // Create and send another token
        MockCLAWN otherToken = new MockCLAWN();
        otherToken.transfer(address(pool), 1000 * 1e18);
        
        // Fund a round with CLAWN
        clawn.approve(address(pool), ENTRY_FEE);
        pool.fundRound(keccak256("round1"), ENTRY_FEE);
        
        // Can rescue other token regardless of CLAWN allocation
        pool.rescue(address(otherToken), 1000 * 1e18);
        assertEq(otherToken.balanceOf(owner), otherToken.totalSupply());
    }
    
    // ============ Admin Tests ============
    
    function test_SetTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        
        vm.expectEmit(true, true, false, false);
        emit TreasuryUpdated(treasury, newTreasury);
        
        pool.setTreasury(newTreasury);
        assertEq(pool.treasury(), newTreasury);
    }
    
    function test_CannotSetZeroTreasury() public {
        vm.expectRevert(ClownPrizePool.ZeroAddress.selector);
        pool.setTreasury(address(0));
    }
    
    function test_SetStreakPool() public {
        address newPool = makeAddr("newStreakPool");
        
        vm.expectEmit(true, true, false, false);
        emit StreakPoolUpdated(streakPool, newPool);
        
        pool.setStreakPool(newPool);
        assertEq(pool.streakPool(), newPool);
    }
    
    // ============ View Function Tests ============
    
    function test_CalculateSplits() public {
        bytes32 roundId = keccak256("round1");
        uint256 totalPool = 100_000 * 1e18; // 100K for easy math
        
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        (uint256 maxPrizes, uint256 treasuryAmt, uint256 burnAmt, uint256 streakAmt) = 
            pool.calculateSplits(roundId);
        
        assertEq(maxPrizes, 70_000 * 1e18);   // 70%
        assertEq(treasuryAmt, 15_000 * 1e18); // 15%
        assertEq(burnAmt, 10_000 * 1e18);     // 10%
        assertEq(streakAmt, 5_000 * 1e18);    // 5%
        
        // Verify they sum to total
        assertEq(maxPrizes + treasuryAmt + burnAmt + streakAmt, totalPool);
    }
    
    function test_GetStats() public {
        bytes32 roundId = keccak256("round1");
        uint256 totalPool = 100_000 * 1e18;
        
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        // Before distribution
        (uint256 burned, uint256 toTreasury, uint256 toStreak, uint256 allocated, uint256 balance) = pool.getStats();
        assertEq(burned, 0);
        assertEq(toTreasury, 0);
        assertEq(toStreak, 0);
        assertEq(allocated, totalPool);
        assertEq(balance, totalPool);
        
        // Distribute
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 70_000 * 1e18;
        
        pool.distribute(roundId, winners, amounts);
        
        // After distribution
        (burned, toTreasury, toStreak, allocated, balance) = pool.getStats();
        assertEq(burned, 10_000 * 1e18);
        assertEq(toTreasury, 15_000 * 1e18);
        assertEq(toStreak, 5_000 * 1e18);
        assertEq(allocated, 0);
        assertEq(balance, 0);
    }
    
    function test_GetUnallocatedBalance() public {
        // No funds
        assertEq(pool.getUnallocatedBalance(), 0);
        
        // Send extra tokens
        clawn.transfer(address(pool), 1000 * 1e18);
        assertEq(pool.getUnallocatedBalance(), 1000 * 1e18);
        
        // Fund a round
        clawn.approve(address(pool), ENTRY_FEE);
        pool.fundRound(keccak256("round1"), ENTRY_FEE);
        
        // Unallocated is still just the extra
        assertEq(pool.getUnallocatedBalance(), 1000 * 1e18);
    }
    
    // ============ Upgrade Tests ============
    
    function test_Upgrade() public {
        // Deploy new implementation
        ClownPrizePool newImpl = new ClownPrizePool();
        
        // Upgrade
        pool.upgradeToAndCall(address(newImpl), "");
        
        // Verify state preserved
        assertEq(address(pool.clawnToken()), address(clawn));
        assertEq(pool.treasury(), treasury);
    }
    
    function test_OnlyOwnerCanUpgrade() public {
        ClownPrizePool newImpl = new ClownPrizePool();
        
        vm.prank(user1);
        vm.expectRevert();
        pool.upgradeToAndCall(address(newImpl), "");
    }
    
    // ============ Fuzz Tests ============
    
    function testFuzz_DistributionSplits(uint256 totalPool) public {
        // Bound to reasonable amounts
        totalPool = bound(totalPool, 1e18, 1e30);
        
        bytes32 roundId = keccak256(abi.encodePacked(totalPool));
        
        clawn.mint(owner, totalPool);
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        (uint256 maxPrizes, uint256 treasuryAmt, uint256 burnAmt, uint256 streakAmt) = 
            pool.calculateSplits(roundId);
        
        // Splits should sum to total
        assertEq(maxPrizes + treasuryAmt + burnAmt + streakAmt, totalPool);
        
        // Percentages should be correct (with small rounding tolerance)
        assertApproxEqRel(maxPrizes, (totalPool * 7000) / 10000, 1e15);
        assertApproxEqRel(treasuryAmt, (totalPool * 1500) / 10000, 1e15);
        assertApproxEqRel(burnAmt, (totalPool * 1000) / 10000, 1e15);
    }
    
    function testFuzz_DistributeMultipleWinners(
        uint256 totalPool,
        uint256 prize1Pct,
        uint256 prize2Pct
    ) public {
        totalPool = bound(totalPool, 1e18, 1e30);
        prize1Pct = bound(prize1Pct, 1, 69);
        prize2Pct = bound(prize2Pct, 1, 70 - prize1Pct);
        // Skip if percentages don't work out
        vm.assume(prize1Pct + prize2Pct <= 70);
        
        bytes32 roundId = keccak256(abi.encodePacked(totalPool, prize1Pct, prize2Pct));
        
        clawn.mint(owner, totalPool);
        clawn.approve(address(pool), totalPool);
        pool.fundRound(roundId, totalPool);
        
        uint256 maxPrizes = (totalPool * 7000) / 10000;
        uint256 prize1 = (maxPrizes * prize1Pct) / 100;
        uint256 prize2 = (maxPrizes * prize2Pct) / 100;
        
        address[] memory winners = new address[](2);
        winners[0] = winner1;
        winners[1] = winner2;
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = prize1;
        amounts[1] = prize2;
        
        pool.distribute(roundId, winners, amounts);
        
        assertEq(clawn.balanceOf(winner1), prize1);
        assertEq(clawn.balanceOf(winner2), prize2);
    }
    
    function testFuzz_RefundCannotExceedFunded(uint256 funded, uint256 refund1, uint256 refund2) public {
        funded = bound(funded, 1e18, 1e30);
        refund1 = bound(refund1, 0, funded);
        refund2 = bound(refund2, 0, funded);
        
        bytes32 roundId = keccak256(abi.encodePacked(funded, refund1, refund2));
        
        clawn.mint(owner, funded);
        clawn.approve(address(pool), funded);
        pool.fundRound(roundId, funded);
        
        address[] memory p = new address[](1);
        p[0] = user1;
        uint256[] memory a = new uint256[](1);
        
        // First refund
        a[0] = refund1;
        pool.refundRound(roundId, p, a);
        
        // Second refund
        a[0] = refund2;
        if (refund1 + refund2 > funded) {
            vm.expectRevert();
        }
        pool.refundRound(roundId, p, a);
    }
}
