import { describe, it, expect } from "vitest";
import {
  CLAWN_ADDRESS,
  CLAWN_CAIP19,
  CHAIN_ID,
  ENTRY_FEE,
  ENTRY_FEE_WEI,
  CLOWN_TITLES,
  getTitleForWins,
} from "../lib/constants";

describe("constants", () => {
  it("CLAWN_ADDRESS is valid checksummed address", () => {
    expect(CLAWN_ADDRESS).toBe("0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1");
    expect(CLAWN_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("CLAWN_CAIP19 follows eip155:<chainId>/erc20:<address> format", () => {
    expect(CLAWN_CAIP19).toBe(
      "eip155:8453/erc20:0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1"
    );
    expect(CLAWN_CAIP19).toMatch(/^eip155:\d+\/erc20:0x[0-9a-fA-F]{40}$/);
  });

  it("CHAIN_ID is Base mainnet (8453)", () => {
    expect(CHAIN_ID).toBe(8453);
  });

  it("ENTRY_FEE is 50,000 CLAWN", () => {
    expect(ENTRY_FEE).toBe(50_000n);
  });

  it("ENTRY_FEE_WEI accounts for 18 decimals", () => {
    expect(ENTRY_FEE_WEI).toBe(50_000n * 10n ** 18n);
  });

  it("has 10 clown titles", () => {
    expect(CLOWN_TITLES).toHaveLength(10);
  });

  it("getTitleForWins returns correct titles", () => {
    expect(getTitleForWins(0)).toBe("Jester");
    expect(getTitleForWins(7)).toBe("Roast Master");
    expect(getTitleForWins(9)).toBe("Clown Royale");
  });

  it("getTitleForWins clamps to max index", () => {
    expect(getTitleForWins(100)).toBe("Clown Royale");
  });
});
