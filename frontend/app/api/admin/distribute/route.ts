import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, keccak256, toHex } from "viem";
import { base } from "viem/chains";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import { PRIZE_POOL_ADDRESS } from "@/lib/contracts";

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
    const { roundId, winners, amounts } = body;

    if (!roundId || !winners || !amounts) {
      return NextResponse.json({ error: "Missing roundId, winners, or amounts" }, { status: 400 });
    }

    if (winners.length !== amounts.length) {
      return NextResponse.json({ error: "winners and amounts must have same length" }, { status: 400 });
    }

    // Convert UUID to bytes32
    const roundIdBytes32 = keccak256(toHex(roundId));
    
    // Convert amounts to wei
    const amountsWei = amounts.map((a: number) => BigInt(a) * 10n ** 18n);

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

    // Call distribute on the contract
    const txHash = await walletClient.writeContract({
      address: PRIZE_POOL_ADDRESS,
      abi: [
        {
          type: "function",
          name: "distribute",
          inputs: [
            { name: "roundId", type: "bytes32" },
            { name: "winners", type: "address[]" },
            { name: "amounts", type: "uint256[]" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "distribute",
      args: [roundIdBytes32, winners, amountsWei],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json({
      success: true,
      txHash,
      roundIdBytes32,
      winners,
      amountsWei: amountsWei.map((a: bigint) => a.toString()),
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (e: any) {
    console.error("Distribute failed:", e);
    return NextResponse.json({ error: e.message || "Transaction failed" }, { status: 500 });
  }
}
