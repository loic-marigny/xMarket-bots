import type { Bot, BotActivationEvent } from "@/types/bot";

import momentumCode from "@/bots/momentum/bot.py?raw";
import momentumStrategy from "@/bots/momentum/strategy.md?raw";
import momentumHistory from "@/bots/momentum/history.json";

import meanReversionCode from "@/bots/mean-reversion/bot.py?raw";
import meanReversionStrategy from "@/bots/mean-reversion/strategy.md?raw";
import meanReversionHistory from "@/bots/mean-reversion/history.json";

import trendFollowerCode from "@/bots/trend-follower/bot.py?raw";
import trendFollowerStrategy from "@/bots/trend-follower/strategy.md?raw";
import trendFollowerHistory from "@/bots/trend-follower/history.json";

import mlMeanCode from "@/bots/ml-mean/bot.py?raw";
import mlMeanStrategy from "@/bots/ml-mean/strategy.md?raw";
import mlMeanHistory from "@/bots/ml-mean/history.json";

import mlTrendCode from "@/bots/ml-trend/bot.py?raw";
import mlTrendStrategy from "@/bots/ml-trend/strategy.md?raw";
import mlTrendHistory from "@/bots/ml-trend/history.json";

const BOT_UIDS: Record<string, string | undefined> = {
  "1": import.meta.env.VITE_BOT_MOMENTUM_UID,
  "2": import.meta.env.VITE_BOT_MEAN_UID,
  "3": import.meta.env.VITE_BOT_TREND_UID,
  "5": import.meta.env.VITE_BOT_MLMEAN_UID,
  "6": import.meta.env.VITE_BOT_MLTREND_UID,
};

const momentumActivationHistory = momentumHistory as BotActivationEvent[];
const meanReversionActivationHistory = meanReversionHistory as BotActivationEvent[];
const trendFollowerActivationHistory = trendFollowerHistory as BotActivationEvent[];
const mlMeanActivationHistory = mlMeanHistory as BotActivationEvent[];
const mlTrendActivationHistory = mlTrendHistory as BotActivationEvent[];

export const mockBots: Bot[] = [
  {
    id: "1",
    name: "Momentum Scalper",
    description: "Bot de scalping rapide basé sur le momentum et les indicateurs de volume",
    startDate: "2026-07-01",
    code: momentumCode,
    strategy: momentumStrategy,
    activationHistory: momentumActivationHistory,
    roi: 0,
    totalPnL: 0,
    winRate: 0,
    trades: 0,
    status: "active",
    firestoreUid: BOT_UIDS["1"],
    performanceData: [
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
    ],
    openTrades: [],
    closedTrades: [],
  },
  {
    id: "2",
    name: "Mean Reversion Pro",
    description: "Exploite les retours à la moyenne sur les paires majeures",
    startDate: "2026-07-01",
    code: meanReversionCode,
    strategy: meanReversionStrategy,
    activationHistory: meanReversionActivationHistory,
    roi: 0,
    totalPnL: 0,
    winRate: 0,
    trades: 0,
    status: "active",
    firestoreUid: BOT_UIDS["2"],
    performanceData: [
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
    ],
    openTrades: [],
    closedTrades: [],
  },
  {
    id: "3",
    name: "Trend Follower Elite",
    description: "Suit les tendances de long terme avec confirmation multi-timeframe",
    startDate: "2026-07-01",
    code: trendFollowerCode,
    strategy: trendFollowerStrategy,
    activationHistory: trendFollowerActivationHistory,
    roi: 0,
    totalPnL: 0,
    winRate: 0,
    trades: 0,
    status: "active",
    firestoreUid: BOT_UIDS["3"],
    performanceData: [
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
    ],
    openTrades: [],
    closedTrades: [],
  },
  {
    id: "5",
    name: "ML Mean Logistic",
    description: "Logistic regression targeting mega-cap tech mean reversion",
    startDate: "2026-07-01",
    code: mlMeanCode,
    strategy: mlMeanStrategy,
    activationHistory: mlMeanActivationHistory,
    roi: 0,
    totalPnL: 0,
    winRate: 0,
    trades: 0,
    status: "active",
    firestoreUid: BOT_UIDS["5"],
    performanceData: [
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
    ],
    openTrades: [],
    closedTrades: [],
  },
  {
    id: "6",
    name: "ML Trend Booster",
    description: "Gradient boosting signals on 5-day stock trends",
    startDate: "2026-07-01",
    code: mlTrendCode,
    strategy: mlTrendStrategy,
    activationHistory: mlTrendActivationHistory,
    roi: 0,
    totalPnL: 0,
    winRate: 0,
    trades: 0,
    status: "active",
    firestoreUid: BOT_UIDS["6"],
    performanceData: [
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
      { date: "2026-07-01", liquidity: 100000, positionValue: 0 },
    ],
    openTrades: [],
    closedTrades: [],
  }
];
