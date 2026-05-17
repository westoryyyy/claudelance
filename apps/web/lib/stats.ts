import { createPublicClient, http, type Address } from "viem";

import { CLAUDELANCE_CORE_ABI } from "@yeheskieltame/claudelance-types";

import { celoSepolia, celoMainnet, DEFAULT_CHAIN_ID, chainById } from "./chain";
import { getDeployment } from "./contracts";
import { tokenToUsdAsync, tokenToUsd, type SupportedToken } from "./usd-conversion";

/**
 * Per-token stats returned by the v2 `getStats(token)` view function.
 */
type PerTokenStats = {
  volume: bigint;
  revenue: bigint;
  resolved: bigint;
  posters: bigint;
  workers: bigint;
};

/**
 * Aggregated live statistics across all three whitelisted tokens.
 */
export type LiveStats = {
  bountyCount: bigint;
  totalVolumeUsd: number;
  totalRevenueUsd: number;
  totalResolved: bigint;
  uniquePosters: bigint;
  uniqueWorkers: bigint;
  feeBps: bigint;
  perToken: Record<SupportedToken, PerTokenStats>;
};

const rpcOverrides: Partial<Record<number, string>> = {
  [celoSepolia.id]: process.env.NEXT_PUBLIC_CELO_SEPOLIA_RPC,
  [celoMainnet.id]: process.env.NEXT_PUBLIC_CELO_MAINNET_RPC,
};

/**
 * Server-side multicall that reads `bountyCount`, `PROTOCOL_FEE_BPS`, and
 * `getStats(token)` for each of the three whitelisted tokens from the live v2
 * ClaudelanceCore contract. One RPC round-trip, 5 results.
 *
 * Each token stat read uses `allowFailure: true` so a single token RPC failure
 * does not crash the entire stats panel — it simply shows zero for that token.
 */
export async function fetchLiveStats(chainId: number = DEFAULT_CHAIN_ID): Promise<LiveStats> {
  const chain = chainById(chainId);
  if (!chain) throw new Error(`Unsupported chain id ${chainId}`);
  const rpc = rpcOverrides[chainId] ?? chain.rpcUrls.default.http[0];
  const client = createPublicClient({ chain, transport: http(rpc) });
  const deploy = getDeployment(chainId);

  const tokens = deploy.tokens;

  const reads = await client.multicall({
    contracts: [
      { address: deploy.core, abi: CLAUDELANCE_CORE_ABI, functionName: "bountyCount" },
      { address: deploy.core, abi: CLAUDELANCE_CORE_ABI, functionName: "PROTOCOL_FEE_BPS" },
      makeStatsRead(deploy.core, tokens.cUSD),
      makeStatsRead(deploy.core, tokens.CELO),
      makeStatsRead(deploy.core, tokens.USDC),
    ],
    // Allow individual failures — a token RPC issue won't crash the whole panel.
    allowFailure: true,
  });

  const bountyCount = reads[0].status === "success" ? (reads[0].result as bigint) : 0n;
  const feeBps = reads[1].status === "success" ? (reads[1].result as bigint) : 200n;

  const cusdStats = reads[2].status === "success"
    ? parseStats(reads[2].result as readonly [bigint, bigint, bigint, bigint, bigint])
    : emptyStats();

  const celoStats = reads[3].status === "success"
    ? parseStats(reads[3].result as readonly [bigint, bigint, bigint, bigint, bigint])
    : emptyStats();

  const usdcStats = reads[4].status === "success"
    ? parseStats(reads[4].result as readonly [bigint, bigint, bigint, bigint, bigint])
    : emptyStats();

  // Use async oracle for CELO, sync stablecoin conversions for cUSD/USDC.
  const [cusdVolumeUsd, celoVolumeUsd, usdcVolumeUsd] = await Promise.all([
    tokenToUsdAsync("cUSD", cusdStats.volume),
    tokenToUsdAsync("CELO", celoStats.volume),
    tokenToUsdAsync("USDC", usdcStats.volume),
  ]);

  const [cusdRevenueUsd, celoRevenueUsd, usdcRevenueUsd] = await Promise.all([
    tokenToUsdAsync("cUSD", cusdStats.revenue),
    tokenToUsdAsync("CELO", celoStats.revenue),
    tokenToUsdAsync("USDC", usdcStats.revenue),
  ]);

  const totalVolumeUsd = cusdVolumeUsd + celoVolumeUsd + usdcVolumeUsd;
  const totalRevenueUsd = cusdRevenueUsd + celoRevenueUsd + usdcRevenueUsd;

  // These counters are global (not per-token) — the contract stores them globally
  // but getStats returns them per-token call; values are the same regardless of token.
  const totalResolved = maxBigInt(cusdStats.resolved, celoStats.resolved, usdcStats.resolved);
  const uniquePosters = maxBigInt(cusdStats.posters, celoStats.posters, usdcStats.posters);
  const uniqueWorkers = maxBigInt(cusdStats.workers, celoStats.workers, usdcStats.workers);

  return {
    bountyCount,
    totalVolumeUsd,
    totalRevenueUsd,
    totalResolved,
    uniquePosters,
    uniqueWorkers,
    feeBps,
    perToken: {
      cUSD: cusdStats,
      CELO: celoStats,
      USDC: usdcStats,
    },
  };
}

function makeStatsRead(core: Address, token: Address) {
  return {
    address: core,
    abi: CLAUDELANCE_CORE_ABI,
    functionName: "getStats" as const,
    args: [token] as const,
  };
}

function parseStats(result: readonly [bigint, bigint, bigint, bigint, bigint]): PerTokenStats {
  return {
    volume: result[0],
    revenue: result[1],
    resolved: result[2],
    posters: result[3],
    workers: result[4],
  };
}

function emptyStats(): PerTokenStats {
  return { volume: 0n, revenue: 0n, resolved: 0n, posters: 0n, workers: 0n };
}

function maxBigInt(...values: bigint[]): bigint {
  return values.reduce((a, b) => (a > b ? a : b), 0n);
}

// Re-export sync tokenToUsd for callers that need it.
export { tokenToUsd };
