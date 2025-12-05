import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, Timestamp, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { supabaseClient } from "@/lib/supabaseClient";
import type { Bot, Trade } from "@/types/bot";

interface LiveMetrics {
  cash: number;
  initialCredits: number;
  marketValue: number;
  lastTradeAt?: string;
}

const DEFAULT_INITIAL_CREDITS = 1_000_000;
const STATS_EPSILON = 1e-6;

const sanitizeNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value;
};
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

async function fetchLatestPrice(symbol: string): Promise<number | null> {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("stock_market_history")
    .select("close_value")
    .eq("symbol", symbol)
    .order("record_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Supabase price error", error);
    return null;
  }
  const raw = data?.close_value;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function formatDate(value?: Timestamp | { toDate?: () => Date } | number): string | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return undefined;
}

export interface LiveBotStatsOptions {
  botId: string;
  firestoreUid?: string;
}

/**
 * Subscribes to Firestore collections that contain live bot activity.
 * Returns an override payload that mirrors the `Bot` shape so mock data can
 * be updated in place with real balances, orders, and trade history.
 */
export function useLiveBotStats({ botId, firestoreUid }: LiveBotStatsOptions) {
  const [override, setOverride] = useState<Partial<Bot> & { liveMetrics?: LiveMetrics } | null>(null);
  const [loading, setLoading] = useState(Boolean(firestoreUid));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firestoreUid) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const userRef = doc(db, "users", firestoreUid);
        const ordersRef = collection(db, "users", firestoreUid, "orders");
        const positionsRef = collection(db, "users", firestoreUid, "positions");
        const [userSnap, ordersSnap, positionsSnap] = await Promise.all([
          getDoc(userRef),
          getDocs(ordersRef),
          getDocs(positionsRef),
        ]);

        const userData = userSnap.data() ?? {};
        const initialCredits =
          typeof userData.initialCredits === "number" && Number.isFinite(userData.initialCredits)
            ? userData.initialCredits
            : DEFAULT_INITIAL_CREDITS;
        const cash =
          typeof userData.cash === "number" && Number.isFinite(userData.cash)
            ? userData.cash
            : initialCredits;

          const normalizedOrders = normalizeOrders(ordersSnap.docs);
          const firstTradeAt =
            normalizedOrders.length > 0
              ? new Date(Math.min(...normalizedOrders.map((order) => order.ts))).toISOString()
              : undefined;
          const closedTrades = mapClosedTradeEntries(buildClosedTradeEntries(normalizedOrders));
          const lastTradeAt =
            normalizedOrders.length > 0
              ? new Date(Math.max(...normalizedOrders.map((order) => order.ts))).toISOString()
              : undefined;

        const aggregatedPositions = aggregateOpenPositions(normalizedOrders);
        const openTrades: Trade[] = [];
        let marketValue = 0;
        for (const position of positionsSnap.docs) {
          const data = position.data() as any;
          const symbol = typeof data?.symbol === "string" && data.symbol.trim() ? data.symbol : position.id;
          if (!symbol) continue;
          const aggregated = aggregatedPositions.find((entry) => entry.symbol === symbol);
          const qty = aggregated?.totalQty ?? sanitizeNumber(data?.qty) ?? 0;
          if (!Number.isFinite(qty) || Math.abs(qty) <= STATS_EPSILON) continue;
          const avgPrice = aggregated?.avgPrice ?? (Number(data?.avgPrice ?? data?.price ?? 0) || 0);
          const currentPrice = await fetchLatestPrice(symbol);
          const currentValue = currentPrice ? currentPrice * qty : 0;
          marketValue += currentValue;
          const pnl = currentPrice ? (currentPrice - avgPrice) * qty : 0;
          const purchaseDate = formatDate(data?.updatedAt) ?? new Date().toISOString();
          openTrades.push({
            id: `${symbol}-open`,
            company: symbol,
            logo: `https://logo.clearbit.com/${symbol.toLowerCase()}.com`,
            quantity: qty,
            purchasePrice: avgPrice,
            purchaseValue: avgPrice * qty,
            currentPrice: currentPrice ?? undefined,
            currentValue: currentPrice ? currentValue : undefined,
            pnl,
            purchaseDate,
            lots: aggregated?.lots?.map((lot, index) => ({
              qty: lot.qty,
              price: lot.price,
              purchaseDate: new Date(lot.ts).toISOString(),
              id: `${symbol}-lot-${lot.ts}-${index}`,
            })),
          });
        }

        const totalValue = cash + marketValue;
        const stats = computeBotStats(initialCredits, totalValue, normalizedOrders);
        const totalPnL = stats.pnl;
        const roi = stats.roi * 100;
        const trades = stats.tradesCount;
        const winRate = stats.winRate * 100;
        const status: Bot["status"] =
          lastTradeAt && Date.now() - new Date(lastTradeAt).getTime() < 1000 * 60 * 60 * 24 * 3
            ? "active"
            : trades > 0
            ? "paused"
            : "stopped";

        const startDateOverride = firstTradeAt ? { startDate: firstTradeAt } : {};
        const overrides: Partial<Bot> & { liveMetrics: LiveMetrics } = {
          id: botId,
          roi,
          totalPnL,
          trades,
          winRate,
          status,
          openTrades,
          closedTrades,
          liveMetrics: { cash, initialCredits, marketValue, lastTradeAt },
          ...startDateOverride,
        };

        if (!cancelled) {
          setOverride(overrides);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Failed to fetch bot stats", err);
        if (!cancelled) {
          setError(err?.message ?? "Unknown error");
          setLoading(false);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [botId, firestoreUid]);

  return { data: override, loading, error };
}

type NormalizedOrder = {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  fillPrice: number;
  ts: number;
};
type AggregatedPosition = {
  symbol: string;
  lots: Array<{ qty: number; price: number; ts: number }>;
  totalQty: number;
  avgPrice: number;
};

export function normalizeOrders(docs: QueryDocumentSnapshot[]): NormalizedOrder[] {
  return docs
    .map((order) => {
      const data = order.data() as Record<string, unknown>;
      const symbolRaw = typeof data?.symbol === "string" ? data.symbol : order.id;
      const sideRaw = typeof data?.side === "string" ? data.side.toLowerCase() : "";
      const qty = sanitizeNumber(data?.qty);
      const fillPrice = sanitizeNumber((data as any)?.fillPrice);
      const tsValue = data?.ts;
      let ts = Date.now();
      if (typeof tsValue === "number" && Number.isFinite(tsValue)) {
        ts = tsValue;
      } else if (tsValue instanceof Timestamp) {
        ts = tsValue.toMillis();
      } else if (tsValue instanceof Date) {
        ts = tsValue.getTime();
      }
      if (!symbolRaw || (sideRaw !== "buy" && sideRaw !== "sell")) return null;
      if (typeof qty !== "number" || typeof fillPrice !== "number") return null;
      if (qty <= STATS_EPSILON || fillPrice <= STATS_EPSILON) return null;
      return { symbol: symbolRaw, side: sideRaw as "buy" | "sell", qty, fillPrice, ts };
    })
    .filter((entry): entry is NormalizedOrder => Boolean(entry))
    .sort((a, b) => a.ts - b.ts);
}

function computeBotStats(
  initialCredits: number,
  totalValue: number,
  orders: NormalizedOrder[],
) {
  const tradesCount = orders.length;
  const pnl = round6(totalValue - initialCredits);
  const roi = initialCredits > STATS_EPSILON ? (totalValue - initialCredits) / initialCredits : 0;

  const fifoBooks = new Map<string, Array<{ qty: number; price: number }>>();
  let realizedPnl = 0;
  let wins = 0;
  let losses = 0;
  let closedTrades = 0;

  for (const order of orders) {
    if (!fifoBooks.has(order.symbol)) {
      fifoBooks.set(order.symbol, []);
    }
    const book = fifoBooks.get(order.symbol)!;
    if (order.side === "buy") {
      book.push({ qty: order.qty, price: order.fillPrice });
      continue;
    }
    let remaining = order.qty;
    let orderPnl = 0;
    while (remaining > STATS_EPSILON && book.length) {
      const lot = book[0];
      const consume = Math.min(lot.qty, remaining);
      orderPnl += (order.fillPrice - lot.price) * consume;
      lot.qty -= consume;
      remaining -= consume;
      if (lot.qty <= STATS_EPSILON) {
        book.shift();
      }
    }
    if (remaining <= STATS_EPSILON) {
      realizedPnl += orderPnl;
      closedTrades += 1;
      if (orderPnl > STATS_EPSILON) {
        wins += 1;
      } else if (orderPnl < -STATS_EPSILON) {
        losses += 1;
      }
    }
  }

  const winRate = closedTrades > 0 ? wins / closedTrades : 0;

  return {
    tradesCount,
    pnl,
    roi,
    realizedPnl: round6(realizedPnl),
    wins,
    losses,
    winRate,
    closedTrades,
  };
}

type ClosedTradeEntry = {
  symbol: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  buyTs: number;
  sellTs: number;
  pnl: number;
};

export function buildClosedTradeEntries(orders: NormalizedOrder[]): ClosedTradeEntry[] {
  const perSymbol = new Map<string, Array<{ qty: number; price: number; ts: number }>>();
  const entries: ClosedTradeEntry[] = [];

  for (const order of orders) {
    if (!perSymbol.has(order.symbol)) {
      perSymbol.set(order.symbol, []);
    }
    const lots = perSymbol.get(order.symbol)!;

    if (order.side === "buy") {
      lots.push({ qty: order.qty, price: order.fillPrice, ts: order.ts });
      continue;
    }

    let remaining = order.qty;
    while (remaining > STATS_EPSILON && lots.length) {
      const lot = lots[0];
      const consume = Math.min(lot.qty, remaining);
      entries.push({
        symbol: order.symbol,
        qty: round6(consume),
        buyPrice: lot.price,
        sellPrice: order.fillPrice,
        buyTs: lot.ts,
        sellTs: order.ts,
        pnl: round6((order.fillPrice - lot.price) * consume),
      });
      lot.qty = round6(lot.qty - consume);
      remaining = round6(remaining - consume);
      if (lot.qty <= STATS_EPSILON) {
        lots.shift();
      }
    }
  }

  return entries;
}

function logoUrlForSymbol(symbol: string): string {
  return `https://logo.clearbit.com/${symbol.toLowerCase()}.com`;
}

/**
 * Normalizes the raw closed-trade docs into the UI-friendly shape while
 * preserving sell chronology (newest first).
 */
function mapClosedTradeEntries(entries: ClosedTradeEntry[]): Trade[] {
  return [...entries]
    .sort((a, b) => b.sellTs - a.sellTs)
    .map((entry, index) => ({
      id: `${entry.symbol}-${entry.sellTs}-${index}`,
      company: entry.symbol,
      logo: logoUrlForSymbol(entry.symbol),
      quantity: round6(entry.qty),
      purchasePrice: entry.buyPrice,
      purchaseValue: round6(entry.buyPrice * entry.qty),
      sellPrice: entry.sellPrice,
      sellValue: round6(entry.sellPrice * entry.qty),
      pnl: round6(entry.pnl),
      purchaseDate: new Date(entry.buyTs).toISOString(),
      sellDate: new Date(entry.sellTs).toISOString(),
    }));
}
/**
 * Aggregates every buy/sell order per symbol so the UI can display live lots.
 * Implements FIFO consumption so partial sells reduce the oldest open lots.
 */
function aggregateOpenPositions(orders: NormalizedOrder[]): AggregatedPosition[] {
  const perSymbol = new Map<string, AggregatedPosition>();
  for (const order of orders) {
    if (!perSymbol.has(order.symbol)) {
      perSymbol.set(order.symbol, { symbol: order.symbol, lots: [], totalQty: 0, avgPrice: 0 });
    }
    const agg = perSymbol.get(order.symbol)!;
    if (order.side === "buy") {
      agg.lots.push({ qty: order.qty, price: order.fillPrice, ts: order.ts });
      agg.totalQty += order.qty;
    } else {
      // Consume oldest lots for sells
      let remaining = order.qty;
      agg.lots = agg.lots
        .map((lot) => {
          if (remaining <= STATS_EPSILON) return lot;
          const consume = Math.min(lot.qty, remaining);
          remaining -= consume;
          return { ...lot, qty: lot.qty - consume };
        })
        .filter((lot) => lot.qty > STATS_EPSILON);
      agg.totalQty = Math.max(0, agg.totalQty - order.qty);
    }
  }

  return Array.from(perSymbol.values())
    .map((agg) => {
      const totalCost = agg.lots.reduce((acc, lot) => acc + lot.qty * lot.price, 0);
      const totalQty = agg.lots.reduce((acc, lot) => acc + lot.qty, 0);
      const avgPrice = totalQty > STATS_EPSILON ? totalCost / totalQty : 0;
      return {
        symbol: agg.symbol,
        lots: agg.lots
          .filter((lot) => lot.qty > STATS_EPSILON)
          .map((lot) => ({
            qty: round6(lot.qty),
            price: round6(lot.price),
            ts: lot.ts,
          })),
        totalQty: round6(totalQty),
        avgPrice: round6(avgPrice),
      };
    })
    .filter((agg) => agg.totalQty > STATS_EPSILON);
}
