import { defineChain } from "viem";

export const celoMainnet = defineChain({
  id: 42_220,
  name: "Celo",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo.org"] },
  },
  blockExplorers: {
    default: { name: "Celoscan", url: "https://celoscan.io" },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

// Celo Sepolia (chain id 11142220) is not yet shipped in viem at the version
// pinned in this workspace, so define it locally. Mirrors the canonical RPC
// + Blockscout/Celoscan explorer pairing.
export const celoSepolia = defineChain({
  id: 11_142_220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org/"] },
  },
  blockExplorers: {
    default: { name: "Celoscan", url: "https://sepolia.celoscan.io" },
    blockscout: { name: "Blockscout", url: "https://celo-sepolia.blockscout.com" },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
  testnet: true,
});

export const supportedChains = [celoSepolia, celoMainnet] as const;

export type SupportedChainId = (typeof supportedChains)[number]["id"];

export const DEFAULT_CHAIN_ID: SupportedChainId =
  process.env.NEXT_PUBLIC_DEFAULT_CHAIN === "celo-sepolia" ? celoSepolia.id : celoMainnet.id;

export function chainById(id: number) {
  return supportedChains.find((c) => c.id === id);
}
