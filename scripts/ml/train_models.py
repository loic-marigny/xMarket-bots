import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

MODELS_DIR = Path("ml-models")
MODELS_DIR.mkdir(exist_ok=True)

load_dotenv(".env.local")
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
  raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required.")

HEADERS = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
}

CRYPTO_TICKERS = [
  "BTCUSD",
  "ETHUSD",
  "SOLUSD",
  "XRPUSD",
  "ADAUSD",
  "DOGEUSD",
  "LTCUSD",
  "BNBUSD",
  "DOTUSD",
  "AVAXUSD",
]

NYSE_TICKERS = [
  "AAPL",
  "MSFT",
  "AMZN",
  "META",
  "NVDA",
  "GOOGL",
  "TSLA",
  "NFLX",
  "ADBE",
  "INTC",
]

LOOKBACK_DAYS = 365 * 2


def fetch_symbol_history(symbol: str, limit_days: int = LOOKBACK_DAYS) -> Optional[pd.DataFrame]:
  params = {
    "select": "record_date,close_value",
    "symbol": f"eq.{symbol}",
    "order": "record_date.asc",
    "limit": 1200,
  }
  resp = requests.get(f"{SUPABASE_URL}/rest/v1/stock_market_history", headers=HEADERS, params=params, timeout=30)
  if resp.status_code != 200:
    print(f"[WARN] Failed to fetch {symbol}: {resp.status_code} {resp.text}")
    return None
  data = resp.json()
  if not data:
    print(f"[WARN] No data for {symbol}")
    return None
  df = pd.DataFrame(data)
  df["record_date"] = pd.to_datetime(df["record_date"])
  cutoff = datetime.utcnow() - timedelta(days=limit_days)
  df = df[df["record_date"] >= cutoff].copy()
  df.sort_values("record_date", inplace=True)
  df["close"] = pd.to_numeric(df["close_value"], errors="coerce")
  df.dropna(subset=["close"], inplace=True)
  if len(df) < 60:
    print(f"[WARN] Not enough rows for {symbol}")
    return None
  return df


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
  delta = series.diff()
  gain = np.where(delta > 0, delta, 0.0)
  loss = np.where(delta < 0, -delta, 0.0)
  roll_up = pd.Series(gain).ewm(alpha=1 / period, adjust=False).mean()
  roll_down = pd.Series(loss).ewm(alpha=1 / period, adjust=False).mean()
  rs = roll_up / roll_down
  rsi = 100 - (100 / (1 + rs))
  return pd.Series(rsi, index=series.index)


def prepare_mean_reversion_features(df: pd.DataFrame) -> Optional[pd.DataFrame]:
  df = df.copy()
  df["ma20"] = df["close"].rolling(20).mean()
  df["std20"] = df["close"].rolling(20).std()
  df["zscore"] = (df["close"] - df["ma20"]) / df["std20"]
  df["pct_change"] = df["close"].pct_change()
  df["roc5"] = df["close"].pct_change(5)
  df["rsi14"] = compute_rsi(df["close"], 14)
  df["future_return"] = df["close"].shift(-1) / df["close"] - 1
  df["label"] = (df["future_return"] > 0).astype(int)
  df = df.dropna().copy()
  if len(df) < 100:
    return None
  return df


def prepare_trend_features(df: pd.DataFrame, horizon: int = 5) -> Optional[pd.DataFrame]:
  df = df.copy()
  df["ema20"] = df["close"].ewm(span=20, adjust=False).mean()
  df["ema50"] = df["close"].ewm(span=50, adjust=False).mean()
  df["ema100"] = df["close"].ewm(span=100, adjust=False).mean()
  df["ema_diff_short"] = df["ema20"] - df["ema50"]
  df["ema_diff_long"] = df["ema50"] - df["ema100"]
  df["momentum5"] = df["close"] / df["close"].shift(5) - 1
  df["rsi14"] = compute_rsi(df["close"], 14)
  df["atr"] = (df["close"].diff().abs()).rolling(14).mean()
  df["future_return"] = df["close"].shift(-horizon) / df["close"] - 1
  df = df.dropna().copy()
  if len(df) < 150:
    return None
  return df


@dataclass
class MeanReversionResult:
  ticker: str
  pipeline: Pipeline
  accuracy: float
  feature_names: List[str]


@dataclass
class TrendResult:
  ticker: str
  pipeline: Pipeline
  directional_accuracy: float
  rmse: float
  mae: float
  r2: float
  feature_names: List[str]


def train_mean_reversion(ticker: str, df: pd.DataFrame) -> Optional[MeanReversionResult]:
  feats = prepare_mean_reversion_features(df)
  if feats is None:
    return None
  feature_names = ["zscore", "pct_change", "roc5", "rsi14"]
  X = feats[feature_names].values
  y = feats["label"].values
  split = int(len(X) * 0.8)
  if split == 0 or split == len(X):
    return None
  X_train, X_val = X[:split], X[split:]
  y_train, y_val = y[:split], y[split:]
  pipe = Pipeline(
    [
      ("scaler", StandardScaler()),
      ("model", LogisticRegression(max_iter=1000, class_weight="balanced")),
    ]
  )
  pipe.fit(X_train, y_train)
  preds = pipe.predict(X_val)
  acc = accuracy_score(y_val, preds)
  return MeanReversionResult(ticker, pipe, acc, feature_names)


def train_trend_regressor(ticker: str, df: pd.DataFrame) -> Optional[TrendResult]:
  feats = prepare_trend_features(df)
  if feats is None:
    return None
  feature_names = ["ema_diff_short", "ema_diff_long", "momentum5", "rsi14", "atr"]
  X = feats[feature_names].values
  y = feats["future_return"].values
  split = int(len(X) * 0.8)
  if split == 0 or split == len(X):
    return None
  X_train, X_val = X[:split], X[split:]
  y_train, y_val = y[:split], y[split:]
  pipe = Pipeline(
    [
      ("model", HistGradientBoostingRegressor(max_depth=3, learning_rate=0.1, max_iter=200)),
    ]
  )
  pipe.fit(X_train, y_train)
  preds = pipe.predict(X_val)
  directional = np.mean(np.sign(preds) == np.sign(y_val))
  rmse = mean_squared_error(y_val, preds, squared=False)
  mae = mean_absolute_error(y_val, preds)
  r2 = r2_score(y_val, preds)
  return TrendResult(ticker, pipe, directional, rmse, mae, r2, feature_names)


def save_mean_reversion_model(result: MeanReversionResult, results: List[Dict[str, float]]) -> None:
  scaler: StandardScaler = result.pipeline.named_steps["scaler"]
  model: LogisticRegression = result.pipeline.named_steps["model"]
  payload = {
    "generated_at": datetime.utcnow().isoformat(),
    "best_ticker": result.ticker,
    "accuracy": result.accuracy,
    "feature_names": result.feature_names,
    "scaler_mean": scaler.mean_.tolist(),
    "scaler_scale": scaler.scale_.tolist(),
    "coefficients": model.coef_.tolist(),
    "intercept": model.intercept_.tolist(),
    "per_ticker_accuracy": results,
  }
  (MODELS_DIR / "mean_reversion_model.json").write_text(json.dumps(payload, indent=2))


def save_trend_model(result: TrendResult, results: List[Dict[str, float]]) -> None:
  # Serialize model via joblib to keep tree structure
  try:
    import joblib  # type: ignore
  except ImportError as exc:
    raise RuntimeError("joblib is required to save the trend model. Add it to requirements.") from exc
  joblib.dump(result.pipeline, MODELS_DIR / "trend_model.pkl")
  payload = {
    "generated_at": datetime.utcnow().isoformat(),
    "best_ticker": result.ticker,
    "directional_accuracy": result.directional_accuracy,
    "rmse": result.rmse,
    "mae": result.mae,
    "r2": result.r2,
    "feature_names": result.feature_names,
    "per_ticker_metrics": results,
    "model_artifact": "ml-models/trend_model.pkl",
  }
  (MODELS_DIR / "trend_model.json").write_text(json.dumps(payload, indent=2))


def main() -> None:
  tickers = CRYPTO_TICKERS + NYSE_TICKERS
  mean_results: List[MeanReversionResult] = []
  trend_results: List[TrendResult] = []
  for ticker in tickers:
    df = fetch_symbol_history(ticker)
    if df is None:
      continue
    mr = train_mean_reversion(ticker, df)
    if mr:
      mean_results.append(mr)
    tr = train_trend_regressor(ticker, df)
    if tr:
      trend_results.append(tr)

  if not mean_results:
    raise RuntimeError("Mean reversion training failed for all tickers.")
  if not trend_results:
    raise RuntimeError("Trend regressor training failed for all tickers.")

  best_mean = max(mean_results, key=lambda r: r.accuracy)
  best_trend = max(trend_results, key=lambda r: r.directional_accuracy)

  mean_report = [{"ticker": r.ticker, "accuracy": r.accuracy} for r in mean_results]
  trend_report = [
    {
      "ticker": r.ticker,
      "directional_accuracy": r.directional_accuracy,
      "rmse": r.rmse,
      "mae": r.mae,
      "r2": r.r2,
    }
    for r in trend_results
  ]

  save_mean_reversion_model(best_mean, mean_report)
  save_trend_model(best_trend, trend_report)
  print(f"[INFO] Mean reversion best ticker: {best_mean.ticker} (acc={best_mean.accuracy:.3f})")
  print(f"[INFO] Trend regressor best ticker: {best_trend.ticker} (dir acc={best_trend.directional_accuracy:.3f})")


if __name__ == "__main__":
  main()
