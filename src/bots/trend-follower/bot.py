from dataclasses import dataclass
from typing import Literal, Sequence

Action = Literal["buy", "sell", "hold"]


@dataclass
class MarketContext:
    closes: Sequence[float]
    cash_available: float
    qty_held: float
    lot_size: float


def ema(values: Sequence[float], span: int) -> float:
    if not values:
        return 0.0
    k = 2 / (span + 1)
    ema_value = values[0]
    for price in values[1:]:
        ema_value = price * k + ema_value * (1 - k)
    return ema_value


def decide_trade(context: MarketContext) -> Action:
    """
    Trend-following heuristic:
    - Compute EMA(20), EMA(50) and EMA(200) over the latest closes.
    - Buy when EMA20 > EMA50 > EMA200 and we can afford one lot.
    - Sell when EMA20 < EMA50 < EMA200 and we hold at least one lot.
    - Otherwise hold.
    """
    closes = list(context.closes)
    if len(closes) < 200:
        return "hold"

    ema_20 = ema(closes[-200:], 20)
    ema_50 = ema(closes[-200:], 50)
    ema_200 = ema(closes[-200:], 200)

    if ema_20 > ema_50 > ema_200 and context.cash_available >= closes[-1] * context.lot_size:
        return "buy"

    if ema_20 < ema_50 < ema_200 and context.qty_held >= context.lot_size:
        return "sell"

    return "hold"
