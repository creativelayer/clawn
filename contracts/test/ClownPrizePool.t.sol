// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ClownPrizePool.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MockCLAWN is ERC20 {
    constructor() ERC20("Clawn Token", "CLAWN") {
        _mint(msg.sender, 100_000_000_000 * 1e18);
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
    address public user3 = makeAddr("user3");
    
    uint256 public constant ENTRY_FEE = 50_000 * 1e18; // 50K CLAWN
    
    event RoundCreated(bytes32 indexed roundId, uint256 entryFee);
    event RoundEntered(bytes32 indexed roundId, bytes32 indexed entryId, address indexed user, uint256 amount);
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
    
    function setUp() public {
        clawn = new MockCLAWN();
        implementation = new ClownPrizePool();
        
        bytes memory initData = abi.encodeCall(
            ClownPrizePool.initialize,
            (address(clawn), treasury, streakPool)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        pool = ClownPrizePool(address(proxy));
        
        // Give users some CLAWN
        clawn.transfer(user1, 1_000_000 * 1e18);
        clawn.transfer(user2, 1_000_000 * 1e18);
        clawn.transfer(user3, 1_000_000 * 1e18);
    }
    
    // ============ Initialization ============
    
    function test_Initialize() public {
        assertEq(address(pool.clawnToken()), address(clawn));
        assertEq(pool.treasury(), treasury);
        assertEq(pool.streakPool(), streakPool);
        assertEq(pool.owner(), owner);
        assertEq(pool.version(), "2.1.0");
    }
    
    function test_CannotInitializeTwice() public {
        vm.expectRevert();
        pool.initialize(address(clawn), treasury, streakPool);
    }
    
    // ============ Round Creation ============
    
    function test_CreateRound() public {
        bytes32 roundId = keccak256("round1");
        
        vm.expectEmit(true, false, false, true);
        emit RoundCreated(roundId, ENTRY_FEE);
        
        pool.createRound(roundId, ENTRY_FEE);
        
        (uint256 entryFee, uint256 funded,,, bool isComplete) = pool.getRound(roundId);
        assertEq(entryFee, ENTRY_FEE);
        assertEq(funded, 0);
        assertFalse(isComplete);
    }
    
    function test_CannotCreateRoundTwice() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundAlreadyExists.selector, roundId));
        pool.createRound(roundId, ENTRY_FEE);
    }
    
    function test_CannotCreateRoundWithZeroFee() public {
        bytes32 roundId = keccak256("round1");
        
        vm.expectRevert(ClownPrizePool.ZeroEntryFee.selector);
        pool.createRound(roundId, 0);
    }
    
    function test_OnlyOwnerCanCreateRound() public {
        vm.prank(user1);
        vm.expectRevert();
        pool.createRound(keccak256("round1"), ENTRY_FEE);
    }
    
    // ============ User Entry ============
    
    function test_EnterRound() public {
        bytes32 roundId = keccak256("round1");
        bytes32 entryId = keccak256("entry1");
        
        pool.createRound(roundId, ENTRY_FEE);
        
        // User approves and enters
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        
        vm.expectEmit(true, true, true, true);
        emit RoundEntered(roundId, entryId, user1, ENTRY_FEE);
        
        pool.enterRound(roundId, entryId);
        vm.stopPrank();
        
        // Verify state
        (, uint256 funded,,,) = pool.getRound(roundId);
        assertEq(funded, ENTRY_FEE);
        assertEq(pool.totalAllocated(), ENTRY_FEE);
        assertEq(clawn.balanceOf(address(pool)), ENTRY_FEE);
    }
    
    function test_MultipleUsersEnter() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        // User 1 enters
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        // User 2 enters
        vm.startPrank(user2);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry2"));
        vm.stopPrank();
        
        // User 3 enters
        vm.startPrank(user3);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry3"));
        vm.stopPrank();
        
        (, uint256 funded,,,) = pool.getRound(roundId);
        assertEq(funded, 3 * ENTRY_FEE);
        assertEq(pool.totalAllocated(), 3 * ENTRY_FEE);
    }
    
    function test_CannotEnterNonexistentRound() public {
        bytes32 roundId = keccak256("nonexistent");
        
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundNotFound.selector, roundId));
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
    }
    
    function test_CannotEnterCompletedRound() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        // User enters
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        // Owner distributes (closes round)
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = (ENTRY_FEE * 7000) / 10000;
        pool.distribute(roundId, winners, amounts);
        
        // User 2 tries to enter closed round
        vm.startPrank(user2);
        clawn.approve(address(pool), ENTRY_FEE);
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundAlreadyComplete.selector, roundId));
        pool.enterRound(roundId, keccak256("entry2"));
        vm.stopPrank();
    }
    
    function test_CannotEnterWithoutApproval() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        vm.prank(user1);
        vm.expectRevert(); // ERC20: insufficient allowance
        pool.enterRound(roundId, keccak256("entry1"));
    }
    
    // ============ Distribution ============
    
    function test_DistributeSingleWinner() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        // 10 users enter
        for (uint256 i = 0; i < 10; i++) {
            address user = makeAddr(string(abi.encodePacked("user", i)));
            clawn.transfer(user, ENTRY_FEE);
            vm.startPrank(user);
            clawn.approve(address(pool), ENTRY_FEE);
            pool.enterRound(roundId, bytes32(i));
            vm.stopPrank();
        }
        
        uint256 totalPool = 10 * ENTRY_FEE;
        uint256 maxPrizes = (totalPool * 7000) / 10000;
        uint256 treasuryAmt = (totalPool * 1500) / 10000;
        uint256 burnAmt = (totalPool * 1000) / 10000;
        uint256 streakAmt = totalPool - maxPrizes - treasuryAmt - burnAmt;
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = maxPrizes;
        
        pool.distribute(roundId, winners, amounts);
        
        assertEq(clawn.balanceOf(winner1), maxPrizes);
        assertEq(clawn.balanceOf(treasury), treasuryAmt);
        assertEq(clawn.balanceOf(pool.BURN_ADDRESS()), burnAmt);
        assertEq(clawn.balanceOf(streakPool), streakAmt);
        
        (,, uint256 distributed,, bool isComplete) = pool.getRound(roundId);
        assertEq(distributed, maxPrizes);
        assertTrue(isComplete);
        assertEq(pool.totalAllocated(), 0);
    }
    
    function test_DistributeThreeWinners() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        // 3 users enter
        address[] memory users = new address[](3);
        users[0] = user1;
        users[1] = user2;
        users[2] = user3;
        
        for (uint256 i = 0; i < 3; i++) {
            vm.startPrank(users[i]);
            clawn.approve(address(pool), ENTRY_FEE);
            pool.enterRound(roundId, bytes32(i));
            vm.stopPrank();
        }
        
        uint256 totalPool = 3 * ENTRY_FEE;
        uint256 maxPrizes = (totalPool * 7000) / 10000;
        
        uint256 prize1 = (maxPrizes * 60) / 100;
        uint256 prize2 = (maxPrizes * 25) / 100;
        uint256 prize3 = maxPrizes - prize1 - prize2;
        
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
    
    function test_CannotDistributeMoreThanPool() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        uint256 maxPrizes = (ENTRY_FEE * 7000) / 10000;
        
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = maxPrizes + 1;
        
        vm.expectRevert(
            abi.encodeWithSelector(ClownPrizePool.ExceedsPrizePool.selector, maxPrizes + 1, maxPrizes)
        );
        pool.distribute(roundId, winners, amounts);
    }
    
    function test_CannotDistributeUnfundedRound() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        // No one entered
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ENTRY_FEE;
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundNotFunded.selector, roundId));
        pool.distribute(roundId, winners, amounts);
    }
    
    function test_CannotDistributeNonexistentRound() public {
        bytes32 roundId = keccak256("nonexistent");
        
        address[] memory winners = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundNotFound.selector, roundId));
        pool.distribute(roundId, winners, amounts);
    }
    
    function test_CannotDistributePartiallyRefundedRound() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        // Two users enter
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        vm.startPrank(user2);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry2"));
        vm.stopPrank();
        
        // Partial refund (only user1)
        address[] memory participants = new address[](1);
        participants[0] = user1;
        uint256[] memory refundAmounts = new uint256[](1);
        refundAmounts[0] = ENTRY_FEE;
        pool.refundRound(roundId, participants, refundAmounts);
        
        // Try to distribute - should fail
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory prizeAmounts = new uint256[](1);
        prizeAmounts[0] = (ENTRY_FEE * 7000) / 10000; // 70% of remaining
        
        vm.expectRevert(abi.encodeWithSelector(ClownPrizePool.RoundPartiallyRefunded.selector, roundId));
        pool.distribute(roundId, winners, prizeAmounts);
    }
    
    // ============ Refunds ============
    
    function test_RefundRound() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        // Two users enter
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        vm.startPrank(user2);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry2"));
        vm.stopPrank();
        
        uint256 user1Before = clawn.balanceOf(user1);
        uint256 user2Before = clawn.balanceOf(user2);
        
        // Refund both
        address[] memory participants = new address[](2);
        participants[0] = user1;
        participants[1] = user2;
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ENTRY_FEE;
        amounts[1] = ENTRY_FEE;
        
        pool.refundRound(roundId, participants, amounts);
        
        assertEq(clawn.balanceOf(user1), user1Before + ENTRY_FEE);
        assertEq(clawn.balanceOf(user2), user2Before + ENTRY_FEE);
        
        (,,, uint256 refunded, bool isComplete) = pool.getRound(roundId);
        assertEq(refunded, 2 * ENTRY_FEE);
        assertTrue(isComplete);
        assertEq(pool.totalAllocated(), 0);
    }
    
    function test_CloseRefundedRoundEmitsEvent() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        // User enters
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        // Partial refund (only half)
        address[] memory participants = new address[](1);
        participants[0] = user1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ENTRY_FEE / 2;
        pool.refundRound(roundId, participants, amounts);
        
        // Close the round - should emit event with unrefunded amount
        vm.expectEmit(true, false, false, true);
        emit RoundClosed(roundId, ENTRY_FEE / 2);
        
        pool.closeRefundedRound(roundId);
    }
    
    function test_CannotRefundMoreThanFunded() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        address[] memory participants = new address[](1);
        participants[0] = user1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ENTRY_FEE + 1;
        
        vm.expectRevert(
            abi.encodeWithSelector(
                ClownPrizePool.RefundExceedsFunded.selector,
                roundId,
                ENTRY_FEE + 1,
                ENTRY_FEE
            )
        );
        pool.refundRound(roundId, participants, amounts);
    }
    
    // ============ Rescue ============
    
    function test_RescueUnallocatedClawn() public {
        // Send tokens directly (not via entry)
        clawn.transfer(address(pool), 1000 * 1e18);
        
        uint256 ownerBefore = clawn.balanceOf(owner);
        pool.rescue(address(clawn), 1000 * 1e18);
        
        assertEq(clawn.balanceOf(owner), ownerBefore + 1000 * 1e18);
    }
    
    function test_CannotRescueAllocatedClawn() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        vm.expectRevert(
            abi.encodeWithSelector(
                ClownPrizePool.InsufficientUnallocatedBalance.selector,
                ENTRY_FEE,
                0
            )
        );
        pool.rescue(address(clawn), ENTRY_FEE);
    }
    
    // ============ View Functions ============
    
    function test_CalculateSplits() public {
        bytes32 roundId = keccak256("round1");
        uint256 entryFee = 10_000 * 1e18;
        pool.createRound(roundId, entryFee);
        
        // 10 entries = 100K total
        for (uint256 i = 0; i < 10; i++) {
            address user = makeAddr(string(abi.encodePacked("u", i)));
            clawn.transfer(user, entryFee);
            vm.startPrank(user);
            clawn.approve(address(pool), entryFee);
            pool.enterRound(roundId, bytes32(i));
            vm.stopPrank();
        }
        
        (uint256 maxPrizes, uint256 treasuryAmt, uint256 burnAmt, uint256 streakAmt) = 
            pool.calculateSplits(roundId);
        
        assertEq(maxPrizes, 70_000 * 1e18);
        assertEq(treasuryAmt, 15_000 * 1e18);
        assertEq(burnAmt, 10_000 * 1e18);
        assertEq(streakAmt, 5_000 * 1e18);
        assertEq(maxPrizes + treasuryAmt + burnAmt + streakAmt, 100_000 * 1e18);
    }
    
    function test_GetStats() public {
        bytes32 roundId = keccak256("round1");
        pool.createRound(roundId, ENTRY_FEE);
        
        vm.startPrank(user1);
        clawn.approve(address(pool), ENTRY_FEE);
        pool.enterRound(roundId, keccak256("entry1"));
        vm.stopPrank();
        
        (,,, uint256 allocated, uint256 balance) = pool.getStats();
        assertEq(allocated, ENTRY_FEE);
        assertEq(balance, ENTRY_FEE);
        
        // Distribute
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = (ENTRY_FEE * 7000) / 10000;
        pool.distribute(roundId, winners, amounts);
        
        (uint256 burned, uint256 toTreasury, uint256 toStreak, uint256 allocatedAfter,) = pool.getStats();
        assertEq(burned, (ENTRY_FEE * 1000) / 10000);
        assertEq(toTreasury, (ENTRY_FEE * 1500) / 10000);
        assertGt(toStreak, 0);
        assertEq(allocatedAfter, 0);
    }
    
    // ============ Upgrade ============
    
    function test_Upgrade() public {
        ClownPrizePool newImpl = new ClownPrizePool();
        pool.upgradeToAndCall(address(newImpl), "");
        
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
    
    function testFuzz_EnterAndDistribute(uint256 numEntries, uint256 entryFee) public {
        numEntries = bound(numEntries, 1, 50);
        entryFee = bound(entryFee, 1e18, 1e24);
        
        bytes32 roundId = keccak256(abi.encodePacked(numEntries, entryFee));
        pool.createRound(roundId, entryFee);
        
        // Create entries
        for (uint256 i = 0; i < numEntries; i++) {
            address user = makeAddr(string(abi.encodePacked("fuzzUser", i)));
            clawn.mint(user, entryFee);
            vm.startPrank(user);
            clawn.approve(address(pool), entryFee);
            pool.enterRound(roundId, bytes32(i));
            vm.stopPrank();
        }
        
        uint256 totalPool = numEntries * entryFee;
        (, uint256 funded,,,) = pool.getRound(roundId);
        assertEq(funded, totalPool);
        
        // Distribute
        uint256 maxPrizes = (totalPool * 7000) / 10000;
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = maxPrizes;
        
        pool.distribute(roundId, winners, amounts);
        
        assertEq(clawn.balanceOf(winner1), maxPrizes);
        assertEq(pool.totalAllocated(), 0);
    }
}
