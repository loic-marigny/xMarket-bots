import json
import sys
from dataclasses import dataclass

from bot import MarketContext, decide_trade


@dataclass
class LogicResult:
  action: str
  reason: str


def load_context() -> MarketContext:
  raw = json.loads(sys.stdin.read() or "{}")
  closes = [float(value) for value in raw.get("closes", []) if isinstance(value, (int, float))]
  return MarketContext(
    closes=closes,
    cash_available=float(raw.get("cash", 0)),
    qty_held=float(raw.get("qtyHeld", 0)),
    lot_size=float(raw.get("lotSize", 0)),
  )


def explain_decision(action: str) -> str:
  if action == "buy":
    return "Price trades far below the 20-day mean; buying to revert."
  if action == "sell":
    return "Price trades far above the 20-day mean; selling to mean revert."
  return "Z-score within band; holding current exposure."


if __name__ == "__main__":
  ctx = load_context()
  action = decide_trade(ctx)
  result: LogicResult = {
    "action": action,
    "reason": explain_decision(action),
  }
  print(json.dumps(result))
