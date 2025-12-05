# Momentum Scalper Strategy

- Observe only the delta between the latest price and the prior tick.
- If price jumps by roughly 0.1% and there is enough cash for one lot, the bot buys.
- If price drops by roughly 0.1% and at least one lot is held, the bot sells.
- Otherwise, it keeps the existing position untouched.
