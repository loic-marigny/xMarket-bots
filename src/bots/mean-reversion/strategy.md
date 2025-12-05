# Mean Reversion Pro Strategy

- Exploits Bollinger Bands set to 20 periods / 2 std.
- Compute z-score vs middle band to detect over stretch.
- Buys when price is 1.5 std below the mean; sells when 1.5 std above.
- Positions kept intraday with risk managed at portfolio level.
