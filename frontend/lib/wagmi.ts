import { createConfig, http, createConnector } from "wagmi";
import { base } from "wagmi/chains";

// Custom connector for Farcaster's embedded wallet
function farcasterConnector() {
  let provider: any = null;
  let account: `0x${string}` | null = null;

  return createConnector((config) => ({
    id: "farcaster",
    name: "Farcaster Wallet",
    type: "farcaster" as const,

    async connect({ chainId } = {}) {
      const sdk = await getFarcasterSDK();
      if (!sdk) throw new Error("Farcaster SDK not available");
      
      provider = await sdk.wallet.getEthereumProvider();
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      account = accounts[0] as `0x${string}`;
      
      return {
        accounts: [account] as readonly `0x${string}`[],
        chainId: base.id,
      };
    },

    async disconnect() {
      account = null;
      provider = null;
    },

    async getAccounts() {
      if (!account) return [];
      return [account] as readonly `0x${string}`[];
    },

    async getChainId() {
      return base.id;
    },

    async getProvider() {
      if (!provider) {
        const sdk = await getFarcasterSDK();
        if (sdk) {
          provider = await sdk.wallet.getEthereumProvider();
        }
      }
      return provider;
    },

    async isAuthorized() {
      try {
        const accounts = await this.getAccounts();
        return accounts.length > 0;
      } catch {
        return false;
      }
    },

    onAccountsChanged(accounts: string[]) {
      account = (accounts[0] as `0x${string}`) || null;
    },

    onChainChanged() {},
    onDisconnect() {
      account = null;
    },
  }));
}

// Get Farcaster SDK instance
async function getFarcasterSDK() {
  if (typeof window === "undefined") return null;
  try {
    const mod = await import("@farcaster/miniapp-sdk");
    return mod.sdk;
  } catch {
    return null;
  }
}

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [farcasterConnector()],
  transports: {
    [base.id]: http("https://mainnet.base.org"),
  },
  ssr: true,
});
