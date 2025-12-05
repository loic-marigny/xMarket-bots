from dataclasses import dataclass
from typing import Literal

Action = Literal["buy", "sell", "hold"]


@dataclass
class MarketContext:
    latest_price: float
    previous_price: float
    cash_available: float
    qty_held: float
    lot_size: float


def decide_trade(context: MarketContext) -> Action:
    """
    Decide whether to buy, sell, or hold based on simple momentum cues.

    - BUY when the latest price is slightly higher than the previous one
      and we can afford one more lot.
    - SELL when the latest price drops slightly and we still hold enough shares.
    - HOLD otherwise.
    """
    momentum = context.latest_price - context.previous_price
    bullish_threshold = 0.001 * context.previous_price

    if momentum > bullish_threshold and context.cash_available >= context.latest_price * context.lot_size:
        return "buy"

    if momentum < -bullish_threshold and context.qty_held >= context.lot_size:
        return "sell"

    return "hold"
