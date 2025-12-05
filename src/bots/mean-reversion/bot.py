from dataclasses import dataclass
from typing import Literal, Sequence

Action = Literal["buy", "sell", "hold"]


@dataclass
class MarketContext:
    closes: Sequence[float]
    cash_available: float
    qty_held: float
    lot_size: float


def decide_trade(context: MarketContext) -> Action:
    """
    Simple mean reversion rule:
    - Compute a rolling mean/std over the last 20 closes.
    - Buy when the latest close is 1.5 std below the mean and we can afford one lot.
    - Sell when the latest close is 1.5 std above the mean and we hold at least one lot.
    - Otherwise hold.
    """
    closes = list(context.closes)[-20:]
    if len(closes) < 20:
        return "hold"

    mean_price = sum(closes) / len(closes)
    variance = sum((price - mean_price) ** 2 for price in closes) / len(closes)
    std_dev = variance ** 0.5
    latest = closes[-1]

    if std_dev == 0:
        return "hold"

    z_score = (latest - mean_price) / std_dev

    if z_score <= -1.5 and context.cash_available >= latest * context.lot_size:
        return "buy"

    if z_score >= 1.5 and context.qty_held >= context.lot_size:
        return "sell"

    return "hold"
