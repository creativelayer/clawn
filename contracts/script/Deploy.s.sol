// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ClownPrizePool.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployClownPrizePool is Script {
    // Base mainnet addresses
    address constant CLAWN_TOKEN = 0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1;
    
    // Treasury and streak pool - using deployer wallet for now
    // Can be updated via setTreasury() and setStreakPool() later
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying ClownPrizePool...");
        console.log("Deployer:", deployer);
        console.log("CLAWN Token:", CLAWN_TOKEN);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy implementation
        ClownPrizePool implementation = new ClownPrizePool();
        console.log("Implementation deployed:", address(implementation));
        
        // Deploy proxy
        bytes memory initData = abi.encodeCall(
            ClownPrizePool.initialize,
            (CLAWN_TOKEN, deployer, deployer) // Treasury and streak pool = deployer for now
        );
        
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("Proxy deployed:", address(proxy));
        
        // Verify initialization
        ClownPrizePool pool = ClownPrizePool(address(proxy));
        require(pool.owner() == deployer, "Owner not set");
        require(address(pool.clawnToken()) == CLAWN_TOKEN, "Token not set");
        
        console.log("Deployment complete!");
        console.log("PrizePool address:", address(proxy));
        
        vm.stopBroadcast();
    }
}
