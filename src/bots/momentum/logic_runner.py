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
  return MarketContext(
    latest_price=float(raw.get("latestPrice", 0)),
    previous_price=float(raw.get("previousPrice", 0)),
    cash_available=float(raw.get("cash", 0)),
    qty_held=float(raw.get("qtyHeld", 0)),
    lot_size=float(raw.get("lotSize", 0)),
  )


def explain_decision(action: str) -> str:
  if action == "buy":
    return "Price is rising and we can afford one extra lot."
  if action == "sell":
    return "Price is falling and we can reduce exposure."
  return "No strong signal, we maintain the current position."


if __name__ == "__main__":
  ctx = load_context()
  action = decide_trade(ctx)
  result: LogicResult = {
    "action": action,
    "reason": explain_decision(action),
  }
  print(json.dumps(result))
