import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local", override: false });

import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const FIFO_EPSILON = 1e-9;
const DEFAULT_INITIAL_CASH = 1_000_000;
const MODEL_PATH = resolve(process.cwd(), "ml-models", "mean_reversion_model.json");

const parseThreshold = (value: string | undefined, fallback: number): number => {
  const parsed = value !== undefined ? Number(value) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const BUY_THRESHOLD = parseThreshold(process.env.BOT_MLMEAN_BUY_THRESHOLD, 0.58);
const SELL_THRESHOLD = parseThreshold(process.env.BOT_MLMEAN_SELL_THRESHOLD, 0.42);

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

const sanitizeNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value;
};

type SpotSide = "buy" | "sell";

type SpotOrderParams = {
  uid: string;
  symbol: string;
  side: SpotSide;
  qty: number;
  fillPrice: number;
  type?: string;
  lotTimestamp?: number;
  extra?: Record<string, unknown>;
};

type FifoLotDoc = {
  qty: number;
  price: number;
  ts: number;
};

type MeanReversionModel = {
  feature_names: string[];
  scaler_mean: number[];
  scaler_scale: number[];
  coefficients: number[][];
  intercept: number[];
  best_ticker?: string;
};

type FeatureComputationResult = {
  vector: number[];
  details: Record<string, number>;
};

type AppSupabaseClient = SupabaseClient<any, "public", "public", any, any>;

let cachedModel: MeanReversionModel | null = null;

async function loadMeanModel(): Promise<MeanReversionModel> {
  if (cachedModel) return cachedModel;
  try {
    const raw = await readFile(MODEL_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.feature_names) || !Array.isArray(parsed?.coefficients)) {
      throw new Error("Model JSON is missing feature metadata.");
    }
    cachedModel = parsed as MeanReversionModel;
    return cachedModel;
  } catch (err) {
    throw new Error(`Failed to load mean reversion model at ${MODEL_PATH}: ${err}`);
  }
}

const normalizeFifoLots = (raw: unknown): FifoLotDoc[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return undefined;
      const qty = sanitizeNumber((entry as any).qty);
      const price = sanitizeNumber((entry as any).price);
      const tsCandidate = (entry as any).ts;
      const ts = typeof tsCandidate === "number" && Number.isFinite(tsCandidate) ? tsCandidate : 0;
      if (typeof qty !== "number" || typeof price !== "number") return undefined;
      if (qty <= FIFO_EPSILON) return undefined;
      return { qty, price, ts };
    })
    .filter((lot): lot is FifoLotDoc => Boolean(lot))
    .sort((a, b) => a.ts - b.ts);
};

const computeCashAfterDelta = (
  snapshot: DocumentSnapshot | null,
  delta: number,
  fallbackInitial = DEFAULT_INITIAL_CASH,
): number => {
  const data = snapshot?.exists() ? (snapshot.data() as Record<string, unknown>) : {};
  const base = sanitizeNumber(data?.cash) ?? sanitizeNumber(data?.initialCredits) ?? fallbackInitial;
  return round6(base + delta);
};

const computeFifoPositionPayload = (
  snapshot: DocumentSnapshot | null,
  symbol: string,
  side: SpotSide,
  qty: number,
  price: number,
  ts: number,
) => {
  const data = snapshot?.exists() ? (snapshot.data() as Record<string, unknown>) : {};
  const currentLots = normalizeFifoLots((data as any).lots);
  let nextLots: FifoLotDoc[];

  if (side === "buy") {
    nextLots = [...currentLots, { qty: round6(qty), price, ts }];
  } else {
    let remaining = qty;
    const updated: FifoLotDoc[] = [];
    for (const lot of currentLots) {
      if (remaining <= FIFO_EPSILON) {
        updated.push(lot);
        continue;
      }
      const consume = Math.min(lot.qty, remaining);
      const leftover = lot.qty - consume;
      remaining -= consume;
      if (leftover > FIFO_EPSILON) {
        updated.push({ ...lot, qty: round6(leftover) });
      }
    }
    if (remaining > FIFO_EPSILON) {
      throw new Error("Insufficient FIFO lots to settle sell order.");
    }
    nextLots = updated;
  }

  nextLots = nextLots
    .filter((lot) => lot.qty > FIFO_EPSILON)
    .map((lot) => ({ ...lot, qty: round6(lot.qty), price: round6(lot.price) }))
    .sort((a, b) => a.ts - b.ts);

  const totalQty = nextLots.reduce((acc, lot) => acc + lot.qty, 0);
  const totalCost = nextLots.reduce((acc, lot) => acc + lot.qty * lot.price, 0);
  const avgPrice = totalQty > FIFO_EPSILON ? round6(totalCost / totalQty) : 0;

  return {
    symbol,
    qty: round6(totalQty),
    avgPrice,
    lots: nextLots,
    updatedAt: ts,
  };
};

async function submitSpotOrder(db: ReturnType<typeof getFirestore>, params: SpotOrderParams): Promise<void> {
  const { uid, symbol, side, qty, fillPrice, type = "MARKET", lotTimestamp = Date.now(), extra } = params;

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity must be positive.");
  }
  if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
    throw new Error("Price must be positive.");
  }

  const ordRef = doc(collection(db, "users", uid, "orders"));
  const userRef: DocumentReference = doc(db, "users", uid);
  const positionRef: DocumentReference = doc(db, "users", uid, "positions", symbol);
  const cashDelta = (side === "buy" ? -1 : 1) * qty * fillPrice;

  await runTransaction(db, async (tx) => {
    const [userSnap, positionSnap] = await Promise.all([tx.get(userRef), tx.get(positionRef)]);

    const nextCash = computeCashAfterDelta(userSnap, cashDelta);
    const positionPayload = computeFifoPositionPayload(positionSnap, symbol, side, qty, fillPrice, lotTimestamp);

    tx.set(userRef, { cash: nextCash }, { merge: true });
    tx.set(positionRef, positionPayload, { merge: true });
    tx.set(ordRef, {
      symbol,
      side,
      qty,
      type,
      status: "filled",
      fillPrice,
      ts: serverTimestamp(),
      ...(extra ?? {}),
    });
  });
}

function rollingMean(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

function rollingStd(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mean = rollingMean(values, period);
  if (mean === null) return null;
  const variance = slice.reduce((acc, value) => acc + (value - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

function computeRsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  const alpha = 1 / period;
  let rollUp = 0;
  let rollDown = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (i === 1) {
      rollUp = gain;
      rollDown = loss;
    } else {
      rollUp = alpha * gain + (1 - alpha) * rollUp;
      rollDown = alpha * loss + (1 - alpha) * rollDown;
    }
  }
  if (rollDown === 0) return 100;
  const rs = rollUp / rollDown;
  return 100 - 100 / (1 + rs);
}

const featureComputers: Record<string, (closes: number[]) => number | null> = {
  zscore: (closes) => {
    const ma20 = rollingMean(closes, 20);
    const std20 = rollingStd(closes, 20);
    if (ma20 === null || std20 === null || std20 === 0) return null;
    const latest = closes.at(-1)!;
    return (latest - ma20) / std20;
  },
  pct_change: (closes) => {
    if (closes.length < 2) return null;
    const latest = closes.at(-1)!;
    const prev = closes.at(-2)!;
    if (prev === 0) return null;
    return latest / prev - 1;
  },
  roc5: (closes) => {
    if (closes.length < 6) return null;
    const latest = closes.at(-1)!;
    const past = closes.at(-6)!;
    if (past === 0) return null;
    return latest / past - 1;
  },
  rsi14: (closes) => computeRsi(closes, 14),
};

function computeFeatureVector(names: string[], closes: number[]): FeatureComputationResult {
  const vector: number[] = [];
  const details: Record<string, number> = {};
  for (const name of names) {
    const computer = featureComputers[name];
    if (!computer) {
      throw new Error(`Unsupported feature "${name}" in model.`);
    }
    const value = computer(closes);
    if (value === null || Number.isNaN(value)) {
      throw new Error(`Unable to compute feature ${name}; not enough data.`);
    }
    vector.push(value);
    details[name] = value;
  }
  return { vector, details };
}

function evaluateModel(model: MeanReversionModel, vector: number[]): { probability: number; linear: number } {
  const coeffRow = model.coefficients[0];
  const intercept = model.intercept[0] ?? 0;
  const scaled = vector.map((value, idx) => {
    const mean = model.scaler_mean[idx] ?? 0;
    const scale = model.scaler_scale[idx] ?? 1;
    return (value - mean) / (scale === 0 ? 1 : scale);
  });
  const linear = scaled.reduce((acc, value, idx) => acc + value * (coeffRow[idx] ?? 0), intercept);
  const probability = 1 / (1 + Math.exp(-linear));
  return { probability, linear };
}

async function fetchLatestCloses(
  supabase: AppSupabaseClient,
  symbol: string,
  limitRows = 120,
): Promise<number[]> {
  const { data, error } = await supabase
    .from("stock_market_history")
    .select("record_date, close_value")
    .eq("symbol", symbol)
    .order("record_date", { ascending: false })
    .limit(limitRows);

  if (error) throw error;
  if (!data?.length) return [];
  return data
    .map((row) => Number(row.close_value ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reverse();
}

async function recordWealthSnapshot(
  uid: string,
  db: ReturnType<typeof getFirestore>,
  supabase: AppSupabaseClient,
  source = "ml-mean-bot",
) {
  try {
    const [userSnap, positionsSnap] = await Promise.all([
      getDoc(doc(db, "users", uid)),
      getDocs(collection(db, "users", uid, "positions")),
    ]);

    const userData = userSnap.data() ?? {};
    const baseCash =
      sanitizeNumber(userData?.cash) ??
      sanitizeNumber(userData?.initialCredits) ??
      DEFAULT_INITIAL_CASH;
    const cash = round6(baseCash);

    const positionValues = await Promise.all(
      positionsSnap.docs.map(async (docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const qty = sanitizeNumber(data?.qty);
        if (typeof qty !== "number" || Math.abs(qty) <= FIFO_EPSILON) return 0;
        const symbol = typeof data?.symbol === "string" && data.symbol.trim() ? data.symbol : docSnap.id;
        if (!symbol) return 0;
        const closes = await fetchLatestCloses(supabase, symbol, 2);
        const latest = closes.at(-1);
        if (!latest) return 0;
        return round6(qty * latest);
      }),
    );

    const stocks = round6(positionValues.reduce((acc, value) => acc + value, 0));
    const total = round6(cash + stocks);

    const snapshotRef = doc(collection(db, "users", uid, "wealthHistory"));
    await setDoc(snapshotRef, {
      cash,
      stocks,
      total,
      source,
      snapshotType: "order",
      ts: serverTimestamp(),
    });
    console.debug("[ML Mean Bot] Recorded wealth snapshot", { cash, stocks, total });
  } catch (err) {
    console.error("[ML Mean Bot] Failed to record wealth snapshot", err);
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}

async function main() {
  const model = await loadMeanModel();

  const firebaseConfig = {
    apiKey: requiredEnv("VITE_FIREBASE_API_KEY"),
    authDomain: requiredEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: requiredEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: requiredEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requiredEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requiredEnv("VITE_FIREBASE_APP_ID"),
  };

  const supabaseUrl = requiredEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("VITE_SUPABASE_ANON_KEY");

  const botEmail = requiredEnv("BOT_MLMEAN_EMAIL");
  const botPassword = requiredEnv("BOT_MLMEAN_PASSWORD");

  const symbol = (process.env.BOT_MLMEAN_SYMBOL ?? model.best_ticker ?? "NVDA").toUpperCase();
  const lotSizeRaw = Number(process.env.BOT_MLMEAN_QTY ?? "10");
  const lotSize = Number.isFinite(lotSizeRaw) && lotSizeRaw > 0 ? lotSizeRaw : 10;

  console.log(`[ML Mean Bot] Target symbol: ${symbol}, Lot size: ${lotSize}`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const cred = await signInWithEmailAndPassword(auth, botEmail, botPassword);
  const uid = cred.user.uid;
  console.log(`[ML Mean Bot] Authenticated as UID ${uid}`);

  const db = getFirestore(app);
  const supabase: AppSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  const closes = await fetchLatestCloses(supabase, symbol, 160);
  if (closes.length < 40) {
    console.warn("[ML Mean Bot] Not enough history to compute features.");
    return;
  }

  const positionRef = doc(db, "users", uid, "positions", symbol);
  const [userSnap, positionSnap] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDoc(positionRef),
  ]);
  const cash = sanitizeNumber(userSnap.exists() ? (userSnap.data() as any).cash : undefined) ?? DEFAULT_INITIAL_CASH;
  const qtyHeld = sanitizeNumber(positionSnap.exists() ? (positionSnap.data() as any).qty : undefined) ?? 0;

  const latestPrice = closes.at(-1)!;
  console.log(
    `[ML Mean Bot] Latest=${latestPrice.toFixed(2)}, Cash=${cash.toFixed(2)}, Qty=${qtyHeld}`,
  );

  const { vector, details } = computeFeatureVector(model.feature_names, closes);
  const { probability } = evaluateModel(model, vector);
  console.log("[ML Mean Bot] Features", details);
  console.log(`[ML Mean Bot] Probability of positive move: ${(probability * 100).toFixed(2)}%`);

  let action: SpotSide | "hold" = "hold";
  if (probability >= BUY_THRESHOLD + 1e-6) {
    action = "buy";
  } else if (probability <= SELL_THRESHOLD - 1e-6) {
    action = "sell";
  }

  const zscoreStr =
    details.zscore !== undefined && Number.isFinite(details.zscore)
      ? details.zscore.toFixed(2)
      : "n/a";
  const reason =
    action === "hold"
      ? `Confidence ${(probability * 100).toFixed(1)}% within thresholds; holding.`
      : `Confidence ${(probability * 100).toFixed(1)}% triggered ${action}. zscore=${zscoreStr}`;
  console.log(`[ML Mean Bot] Decision: ${action} (${reason})`);

  if (action === "buy" && cash >= latestPrice * lotSize) {
    await submitSpotOrder(db, { uid, symbol, side: "buy", qty: lotSize, fillPrice: latestPrice });
  } else if (action === "sell" && qtyHeld >= lotSize) {
    await submitSpotOrder(db, { uid, symbol, side: "sell", qty: lotSize, fillPrice: latestPrice });
  } else {
    console.log("[ML Mean Bot] No order submitted.");
  }

  await recordWealthSnapshot(uid, db, supabase);
}

main()
  .then(() => {
    console.log("[ML Mean Bot] Run completed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
