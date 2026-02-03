export const CLAWN_ADDRESS = "0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1" as const;
export const CLAWN_CAIP19 = "eip155:8453/erc20:0x6B08F0255f0236e13e17dDD953CFd73Befcf5BE1";
export const CHAIN_ID = 8453;
export const ENTRY_FEE = 50_000n;
export const ENTRY_FEE_WEI = 50_000n * 10n ** 18n;

export const CLOWN_TITLES = [
  "Jester",
  "Fool",
  "Trickster",
  "Court Jester",
  "Harlequin",
  "Bouffon",
  "Grand Clown",
  "Roast Master",
  "Supreme Honker",
  "Clown Royale",
] as const;

export function getTitleForWins(wins: number): string {
  const idx = Math.min(wins, CLOWN_TITLES.length - 1);
  return CLOWN_TITLES[idx];
}
