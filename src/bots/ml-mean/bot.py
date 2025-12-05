from dataclasses import dataclass
from typing import Literal

Action = Literal["buy", "sell", "hold"]


def sigmoid(x: float) -> float:
  return 1 / (1 + pow(2.718281828459045, -x))


@dataclass
class FeatureVector:
  zscore: float
  pct_change: float
  roc5: float
  rsi14: float


@dataclass
class MarketContext:
  features: FeatureVector
  probability: float
  buy_threshold: float = 0.58
  sell_threshold: float = 0.42


def decide_trade(ctx: MarketContext) -> Action:
  """Simple logistic regression decision layer."""
  if ctx.probability >= ctx.buy_threshold:
    return "buy"
  if ctx.probability <= ctx.sell_threshold:
    return "sell"
  return "hold"