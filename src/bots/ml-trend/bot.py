from dataclasses import dataclass
from typing import Literal

Action = Literal["buy", "sell", "hold"]


def ema(prices: list[float], span: int) -> float:
  alpha = 2 / (span + 1)
  value = prices[0]
  for price in prices[1:]:
    value = alpha * price + (1 - alpha) * value
  return value


def atr(prices: list[float], period: int = 14) -> float:
  diffs = [abs(prices[i] - prices[i - 1]) for i in range(1, len(prices))]
  window = diffs[-period:]
  return sum(window) / len(window)


@dataclass
class FeatureVector:
  ema_diff_short: float
  ema_diff_long: float
  momentum5: float
  rsi14: float
  atr: float


@dataclass
class MarketContext:
  features: FeatureVector
  predicted_return: float
  buy_threshold: float = 0.0025
  sell_threshold: float = -0.001


def decide_trade(ctx: MarketContext) -> Action:
  if ctx.predicted_return >= ctx.buy_threshold:
    return "buy"
  if ctx.predicted_return <= ctx.sell_threshold:
    return "sell"
  return "hold"