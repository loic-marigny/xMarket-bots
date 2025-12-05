# ML Mean Reversion Bot

This bot runs a logistic regression trained on two years of daily closes to estimate the probability that tomorrow closes higher.

- **Features**: 20-day z-score, daily pct change, 5-session rate of change and RSI14.
- **Scaling**: every feature is standardized using the `mean`/`scale` vectors exported in `ml-models/mean_reversion_model.json`.
- **Decision**: buy if `P(up) >= 0.58`, sell if `P(up) <= 0.42`, hold otherwise.
- **Risk**: fixed lot size, checks cash availability before placing the order.