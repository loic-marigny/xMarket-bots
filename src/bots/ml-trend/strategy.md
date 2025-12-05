# ML Trend Bot

The ML Trend bot consumes the Gradient Boosting model produced by `scripts/ml/train_models.py` to anticipate 5-day returns.

- **Features**: EMA20/EMA50 spread, EMA50/EMA100 spread, 5-day momentum, RSI14 and a smoothed ATR.
- **Model**: `HistGradientBoostingRegressor` loaded from `trend_model.pkl` (requires joblib + scikit-learn at runtime).
- **Signal**: buy if the expected return is above +0.25 %, sell if below -0.10 %, otherwise hold.
- **Execution**: fixed lot size with cash & position guards plus Firestore wealth snapshots.