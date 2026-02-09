import { CLAWN_ADDRESS } from "./constants";

// ClownPrizePool contract on Base
export const PRIZE_POOL_ADDRESS = "0x5e2351eddd564b9c8410594b14caa76b6cc431f2" as const;

export const CLAWN_TOKEN_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const PRIZE_POOL_ABI = [
  {
    type: "function",
    name: "enterRound",
    inputs: [
      { name: "roundId", type: "bytes32" },
      { name: "entryId", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rounds",
    inputs: [{ name: "roundId", type: "bytes32" }],
    outputs: [
      { name: "entryFee", type: "uint256" },
      { name: "funded", type: "uint256" },
      { name: "distributed", type: "uint256" },
      { name: "refunded", type: "uint256" },
      { name: "isComplete", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRound",
    inputs: [{ name: "roundId", type: "bytes32" }],
    outputs: [
      { name: "entryFee", type: "uint256" },
      { name: "funded", type: "uint256" },
      { name: "distributed", type: "uint256" },
      { name: "refunded", type: "uint256" },
      { name: "isComplete", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "RoundEntered",
    inputs: [
      { name: "roundId", type: "bytes32", indexed: true },
      { name: "entryId", type: "bytes32", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
