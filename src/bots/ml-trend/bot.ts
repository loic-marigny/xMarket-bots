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
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const FIFO_EPSILON = 1e-9;
const DEFAULT_INITIAL_CASH = 1_000_000;
const METADATA_PATH = resolve(process.cwd(), "ml-models", "trend_model.json");
const PYTHON_BIN = process.env.BOT_LOGIC_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const PREDICTOR_SCRIPT = fileURLToPath(new URL("./trend_predictor.py", import.meta.url));

const parseThreshold = (value: string | undefined, fallback: number): number => {
  const parsed = value !== undefined ? Number(value) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const BUY_RETURN_THRESHOLD = parseThreshold(process.env.BOT_MLTREND_BUY_THRESHOLD, 0.0025);
const SELL_RETURN_THRESHOLD = parseThreshold(process.env.BOT_MLTREND_SELL_THRESHOLD, -0.001);

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

type TrendModelMeta = {
  feature_names: string[];
  model_artifact: string;
  best_ticker?: string;
};

type AppSupabaseClient = SupabaseClient<any, "public", "public", any, any>;

let cachedMeta: TrendModelMeta | null = null;

async function loadTrendMetadata(): Promise<TrendModelMeta> {
  if (cachedMeta) return cachedMeta;
  try {
    const raw = await readFile(METADATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.feature_names) || typeof parsed?.model_artifact !== "string") {
      throw new Error("Trend model metadata missing required fields.");
    }
    cachedMeta = parsed as TrendModelMeta;
    return cachedMeta;
  } catch (err) {
    throw new Error(`Failed to read trend model metadata at ${METADATA_PATH}: ${err}`);
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

function ema(values: number[], span: number): number | null {
  if (values.length < span) return null;
  const alpha = 2 / (span + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}

function computeMomentum(values: number[], period = 5): number | null {
  if (values.length <= period) return null;
  const latest = values.at(-1)!;
  const ref = values.at(-(period + 1))!;
  if (ref === 0) return null;
  return latest / ref - 1;
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

function computeAtr(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) {
    diffs.push(Math.abs(values[i] - values[i - 1]));
  }
  if (diffs.length < period) return null;
  const slice = diffs.slice(-period);
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

function computeTrendFeatures(names: string[], closes: number[]): { vector: number[]; details: Record<string, number> } {
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema100 = ema(closes, 100);
  if (ema20 === null || ema50 === null || ema100 === null) {
    throw new Error("Not enough candles to compute EMAs.");
  }
  const momentum5 = computeMomentum(closes, 5);
  const rsi14 = computeRsi(closes, 14);
  const atrValue = computeAtr(closes, 14);
  if (momentum5 === null || rsi14 === null || atrValue === null) {
    throw new Error("Not enough candles to compute momentum/RSI/ATR.");
  }
  const derived: Record<string, number> = {
    ema_diff_short: ema20 - ema50,
    ema_diff_long: ema50 - ema100,
    momentum5,
    rsi14,
    atr: atrValue,
  };
  for (const [key, value] of Object.entries(derived)) {
    if (!Number.isFinite(value)) {
      throw new Error(`Feature ${key} is invalid.`);
    }
  }
  const vector = names.map((name) => {
    if (!(name in derived)) {
      throw new Error(`Unsupported feature "${name}" in model.`);
    }
    return derived[name];
  });
  return { vector, details: derived };
}

async function runTrendPrediction(modelPath: string, features: number[]): Promise<number> {
  const absPath = resolve(process.cwd(), modelPath);
  return await new Promise((resolvePrediction, reject) => {
    const child = spawn(PYTHON_BIN, [PREDICTOR_SCRIPT]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`[trend predictor] exited with code ${code}: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const prediction = Number(parsed?.prediction);
        if (!Number.isFinite(prediction)) {
          throw new Error("Prediction payload missing value.");
        }
        resolvePrediction(prediction);
      } catch (err) {
        reject(new Error(`Failed to parse predictor output: ${stdout}\n${err}`));
      }
    });
    if (!child.stdin) {
      reject(new Error("Predictor stdin unavailable."));
      return;
    }
    child.stdin.setDefaultEncoding("utf8");
    child.stdin.write(JSON.stringify({ features, modelPath: absPath }));
    child.stdin.end();
  });
}

async function fetchLatestCloses(
  supabase: AppSupabaseClient,
  symbol: string,
  limitRows = 260,
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
  source = "ml-trend-bot",
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
    console.debug("[ML Trend Bot] Recorded wealth snapshot", { cash, stocks, total });
  } catch (err) {
    console.error("[ML Trend Bot] Failed to record wealth snapshot", err);
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}

async function main() {
  const metadata = await loadTrendMetadata();

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

  const botEmail = requiredEnv("BOT_MLTREND_EMAIL");
  const botPassword = requiredEnv("BOT_MLTREND_PASSWORD");

  const symbol = (process.env.BOT_MLTREND_SYMBOL ?? metadata.best_ticker ?? "ADBE").toUpperCase();
  const lotSizeRaw = Number(process.env.BOT_MLTREND_QTY ?? "5");
  const lotSize = Number.isFinite(lotSizeRaw) && lotSizeRaw > 0 ? lotSizeRaw : 5;

  console.log(`[ML Trend Bot] Target symbol: ${symbol}, Lot size: ${lotSize}`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const cred = await signInWithEmailAndPassword(auth, botEmail, botPassword);
  const uid = cred.user.uid;
  console.log(`[ML Trend Bot] Authenticated as UID ${uid}`);

  const db = getFirestore(app);
  const supabase: AppSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  const closes = await fetchLatestCloses(supabase, symbol, 300);
  if (closes.length < 150) {
    console.warn("[ML Trend Bot] Not enough history to compute trend features.");
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
    `[ML Trend Bot] Latest=${latestPrice.toFixed(2)}, Cash=${cash.toFixed(2)}, Qty=${qtyHeld}`,
  );

  const { vector, details } = computeTrendFeatures(metadata.feature_names, closes);
  console.log("[ML Trend Bot] Features", details);

  const predictedReturn = await runTrendPrediction(metadata.model_artifact, vector);
  console.log(`[ML Trend Bot] Predicted return over horizon: ${(predictedReturn * 100).toFixed(2)}%`);

  let action: SpotSide | "hold" = "hold";
  if (predictedReturn >= BUY_RETURN_THRESHOLD) {
    action = "buy";
  } else if (predictedReturn <= SELL_RETURN_THRESHOLD) {
    action = "sell";
  }

  const reason =
    action === "hold"
      ? `Expected return ${(predictedReturn * 100).toFixed(2)}% within band.`
      : `Expected return ${(predictedReturn * 100).toFixed(2)}% triggered ${action}.`;
  console.log(`[ML Trend Bot] Decision: ${action} (${reason})`);

  if (action === "buy" && cash >= latestPrice * lotSize) {
    await submitSpotOrder(db, { uid, symbol, side: "buy", qty: lotSize, fillPrice: latestPrice });
  } else if (action === "sell" && qtyHeld >= lotSize) {
    await submitSpotOrder(db, { uid, symbol, side: "sell", qty: lotSize, fillPrice: latestPrice });
  } else {
    console.log("[ML Trend Bot] No order submitted.");
  }

  await recordWealthSnapshot(uid, db, supabase);
}

main()
  .then(() => {
    console.log("[ML Trend Bot] Run completed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
