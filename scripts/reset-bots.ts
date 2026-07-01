import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BOT_HISTORY_DIR = resolve("src", "bots");
const MOCK_BOTS_FILE = resolve("src", "data", "mockBots.ts");
const BOT_SLUGS = ["momentum", "mean-reversion", "trend-follower", "ml-mean", "ml-trend"];

const launchDate = new Date().toISOString().slice(0, 10);
const launchTimestamp = new Date().toISOString();

interface BotResetConfig {
  name: string;
  startDate: string;
  roi: number;
  totalPnL: number;
  winRate: number;
  trades: number;
}

const BOT_RESET_CONFIGS: BotResetConfig[] = [
  { name: "Momentum Scalper", startDate: launchDate, roi: 0, totalPnL: 0, winRate: 0, trades: 0 },
  { name: "Mean Reversion Pro", startDate: launchDate, roi: 0, totalPnL: 0, winRate: 0, trades: 0 },
  { name: "Trend Follower Elite", startDate: launchDate, roi: 0, totalPnL: 0, winRate: 0, trades: 0 },
  { name: "ML Mean Logistic", startDate: launchDate, roi: 0, totalPnL: 0, winRate: 0, trades: 0 },
  { name: "ML Trend Booster", startDate: launchDate, roi: 0, totalPnL: 0, winRate: 0, trades: 0 },
];

async function resetHistory() {
  const entry = {
    timestamp: launchTimestamp,
    action: "activated" as const,
    reason: "Manual reset",
    actor: "local-user",
    source: "manual-reset",
  };

  for (const slug of BOT_SLUGS) {
    const historyPath = resolve(BOT_HISTORY_DIR, slug, "history.json");
    await writeFile(historyPath, `${JSON.stringify([entry], null, 2)}\n`, "utf-8");
  }
}

async function resetMockBots() {
  let content = await readFile(MOCK_BOTS_FILE, "utf-8");

  const botEntries = BOT_RESET_CONFIGS.map((config, index) => {
    const botId = String(index + 1);
    const codeImport = [
      'momentumCode',
      'meanReversionCode',
      'trendFollowerCode',
      'mlMeanCode',
      'mlTrendCode',
    ][index];
    const strategyImport = [
      'momentumStrategy',
      'meanReversionStrategy',
      'trendFollowerStrategy',
      'mlMeanStrategy',
      'mlTrendStrategy',
    ][index];
    const historyImport = [
      'momentumActivationHistory',
      'meanReversionActivationHistory',
      'trendFollowerActivationHistory',
      'mlMeanActivationHistory',
      'mlTrendActivationHistory',
    ][index];

    const id = ["1", "2", "3", "5", "6"][index];
    const firestoreUidKey = ["1", "2", "3", "5", "6"][index];

    return `  {
    id: "${id}",
    name: "${config.name}",
    description: ${config.name === "Momentum Scalper" ? '"Bot de scalping rapide basé sur le momentum et les indicateurs de volume"' : config.name === "Mean Reversion Pro" ? '"Exploite les retours à la moyenne sur les paires majeures"' : config.name === "Trend Follower Elite" ? '"Suit les tendances de long terme avec confirmation multi-timeframe"' : config.name === "ML Mean Logistic" ? '"Logistic regression targeting mega-cap tech mean reversion"' : '"Gradient boosting signals on 5-day stock trends"'},
    startDate: "${config.startDate}",
    code: ${codeImport},
    strategy: ${strategyImport},
    activationHistory: ${historyImport},
    roi: ${config.roi},
    totalPnL: ${config.totalPnL},
    winRate: ${config.winRate},
    trades: ${config.trades},
    status: "active",
    firestoreUid: BOT_UIDS["${firestoreUidKey}"],
    performanceData: [
      { date: "${config.startDate}", liquidity: 100000, positionValue: 0 },
      { date: "${config.startDate}", liquidity: 100000, positionValue: 0 },
    ],
    openTrades: [],
    closedTrades: [],
  }`;
  }).join(",\n");

  content = content.replace(
    /export const mockBots: Bot\[\] = \[[\s\S]*?\n\];/,
    `export const mockBots: Bot[] = [\n${botEntries}\n];`,
  );

  await writeFile(MOCK_BOTS_FILE, content, "utf-8");
}

(async () => {
  await resetHistory();
  await resetMockBots();
  console.log(`[reset-bots] Reset complete for ${BOT_SLUGS.length} bots at ${launchTimestamp}`);
})().catch((error) => {
  console.error("[reset-bots] Failed to reset bots", error);
  process.exit(1);
});
