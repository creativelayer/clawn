import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, keccak256, toHex } from "viem";
import { base } from "viem/chains";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import { PRIZE_POOL_ABI, PRIZE_POOL_ADDRESS } from "@/lib/contracts";

const WALLET_ID = "ia5n10ug5xeyy2fxbareo1ar";
const WALLET_ADDRESS = "0x79Bed28E6d195375C19e84350608eA3c4811D4B9";

// Simple API key auth
function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) return false;
  return authHeader === `Bearer ${apiKey}`;
}

export async function POST(req: NextRequest) {
  // Check auth
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check required env vars
  const { PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTH_KEY } = process.env;
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET || !PRIVY_AUTH_KEY) {
    return NextResponse.json({ error: "Missing Privy config" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { roundId, entryFee } = body;

    if (!roundId || !entryFee) {
      return NextResponse.json({ error: "Missing roundId or entryFee" }, { status: 400 });
    }

    // Convert UUID to bytes32
    const roundIdBytes32 = keccak256(toHex(roundId));
    
    // Entry fee in wei (assuming input is in tokens, multiply by 10^18)
    const entryFeeWei = BigInt(entryFee) * 10n ** 18n;

    // Set up Privy client
    const privy = new PrivyClient({
      appId: PRIVY_APP_ID,
      appSecret: PRIVY_APP_SECRET,
    });

    const account = createViemAccount(privy, {
      walletId: WALLET_ID,
      address: WALLET_ADDRESS,
      authorizationContext: { authorization_private_keys: [PRIVY_AUTH_KEY] },
    });

    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    // Call createRound on the contract
    const txHash = await walletClient.writeContract({
      address: PRIZE_POOL_ADDRESS,
      abi: [
        {
          type: "function",
          name: "createRound",
          inputs: [
            { name: "roundId", type: "bytes32" },
            { name: "entryFee", type: "uint256" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "createRound",
      args: [roundIdBytes32, entryFeeWei],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json({
      success: true,
      txHash,
      roundIdBytes32,
      entryFeeWei: entryFeeWei.toString(),
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (e: any) {
    console.error("Create round failed:", e);
    return NextResponse.json({ error: e.message || "Transaction failed" }, { status: 500 });
  }
}
