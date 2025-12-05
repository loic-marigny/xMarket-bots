# bot-canvas-dash

> Multi-bot trading command center built with React, TypeScript, Tailwind, shadcn/ui, Firebase and Supabase.

## Overview

This repository hosts the dashboard and automation scripts that monitor several trading strategies:

| Bot | Style | Tech / Logic |
| --- | --- | --- |
| Momentum Scalper | Intraday momentum | TypeScript runner + Python heuristic |
| Mean Reversion Pro | FX/Equities mean reversion | TypeScript runner + Python logic |
| Trend Follower Elite | Medium-term trends | TypeScript runner + Python logic |
| ML Mean (ml-mean) | Logistic regression | Consumes `ml-models/mean_reversion_model.json` |
| ML Trend (ml-trend) | Gradient boosting regressor | Consumes `ml-models/trend_model.pkl` |

Each bot has a dedicated folder under `src/bots/<slug>` with the runner (`bot.ts`), the human-readable strategy (`strategy.md`) and `history.json` that feeds activation timelines in the UI.

The SPA (React/Vite) surfaces live P&L, ROI, trades, open/closed positions, code/strategy panels, localized in English and French. It pulls real-time metrics from Firebase Firestore and Supabase when credentials are provided; otherwise it falls back to mock data.

## Stack

- **Frontend**: React 18 + Vite + TypeScript, shadcn/ui, Tailwind CSS, i18next for i18n (English/French).
- **Data**: Firebase Auth + Firestore for bot state, Supabase for historical OHLC (table `stock_market_history`).
- **Automation**: Node (tsx) scripts, Python helpers for model inference and training, GitHub Actions workflows.

## Quick Start

```bash
git clone <repo-url>
cd bot-canvas-dash
npm install
npm run dev
```

Copy `.env.local` from `.env.example` (if present) or create it manually with the required Firebase, Supabase, and bot credentials (see below). The Vite dev server runs on `http://localhost:5173` by default.

### Environment variables

`src/bots` runners load both `.env` and `.env.local`. The UI reads variables prefixed with `VITE_`. Required keys include:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

BOT_MOMENTUM_EMAIL=...
BOT_MOMENTUM_PASSWORD=...
VITE_BOT_MOMENTUM_UID=...

BOT_MEAN_EMAIL=...
BOT_MEAN_PASSWORD=...
VITE_BOT_MEAN_UID=...

BOT_TREND_EMAIL=...
BOT_TREND_PASSWORD=...
VITE_BOT_TREND_UID=...

BOT_MLMEAN_EMAIL=...
BOT_MLMEAN_PASSWORD=...
VITE_BOT_MLMEAN_UID=...

BOT_MLTREND_EMAIL=...
BOT_MLTREND_PASSWORD=...
VITE_BOT_MLTREND_UID=...
```

Optional overrides (symbols, lot sizes, thresholds) are documented at the top of each runner.

### Running bots locally

```powershell
npm run bot:momentum
npm run bot:mean-reversion
npm run bot:trend
npm run bot:ml-mean
npm run bot:ml-trend
```

- All runners are TypeScript scripts executed via `tsx`.
- ML Trend also spawns `src/bots/ml-trend/trend_predictor.py`. Install Python requirements before running:

```bash
python -m pip install -r scripts/ml/requirements.txt
```

### Firebase provisioning

Use `npx tsx scripts/admin/provision-bots.ts` to create/authenticate bot users in Firebase. Configure bot entries in `scripts/admin/bots.json` and ensure `FIREBASE_ADMIN_CREDENTIALS` plus `BOT_*` env vars are set before running the script. The script writes new UIDs to `scripts/admin/bots-output.json`; copy them into `.env.local` / GitHub secrets.

## Machine-learning pipeline

Located in `scripts/ml`:

- `train_models.py` fetches OHLC data from Supabase, prepares features, trains:
  - A **Logistic Regression** mean-reversion classifier (StandardScaler + LogisticRegression).
  - A **HistGradientBoostingRegressor** trend model.
- Best models are saved under `ml-models/` (JSON for logistic, Pickle/JSON pair for trend).
- Requirements: pandas, numpy, scikit-learn, requests, joblib, python-dotenv.

### CI training workflow

`.github/workflows/train-ml-bots.yml` runs daily (CRON) or on demand. Steps:
1. Setup Python 3.11 and install `scripts/ml/requirements.txt`.
2. Run `python scripts/ml/train_models.py` with Supabase secrets.
3. Commit the new `ml-models/*` artifacts when they change.

## Automation workflows

### run-bots.yml

Runs every hour (or via `workflow_dispatch`):

1. `npm run bot:momentum`
2. `npm run bot:mean-reversion`
3. `npm run bot:trend`
4. `npm run bot:ml-mean` (requires Python deps installed beforehand)
5. `npm run bot:ml-trend`
6. Records activation history for each bot via `npm run bot:record-activation -- <slug> activated`
7. Commits changes to the related `history.json` files.

### deploy.yml

Builds and deploys the SPA to GitHub Pages on pushes to `main`:

1. Checkout, install Node deps via `npm ci`.
2. Export all `VITE_*` env vars, run `npm run build` (outputs `dist/`).
3. Copy SPA fallback `dist/404.html`, upload artifact, deploy via `actions/deploy-pages`.

### update-bot-data.yml

An auxiliary workflow that triggers `deploy.yml` after certain updates (see file for details).

## Project structure

```
src/
 ├─ bots/                  # Bot logic, history, strategies
 ├─ components/            # Reusable UI elements (shadcn-based)
 ├─ hooks/                 # Data-fetch hooks (live stats, wealth history)
 ├─ data/mockBots.ts       # Mock dataset used when no live data is available
 ├─ i18n/locales/          # en/fr translations
 ├─ pages/                 # Router pages (Dashboard, BotDetail)
 ├─ lib/                   # Utility modules (Firebase, Supabase clients, lifecycle helpers)
scripts/
 ├─ admin/                 # Provisioning utilities for Firebase
 └─ ml/                    # ML training scripts + requirements
ml-models/                 # Serialized ML artifacts committed by CI
.github/workflows/         # Automation workflows (run bots, deploy, train ML, etc.)
```

## Internationalization

- i18n is powered by `react-i18next`. Language switcher is available on the dashboard and bot detail pages.
- Translations live under `src/i18n/locales/en.json` and `fr.json`. All UI labels, button captions, table headers and chart tooltips are covered.

## Testing & Linting

```bash
npm run build   # type-check + bundle
npm run lint    # ESLint
```

No automated component/unit tests are included yet; monitoring is done via CI runs and manual dashboard verification.

## Deployment checklist

1. Ensure GitHub secrets contain matching Firebase/Supabase credentials and bot UIDs (including ML bots).
2. Verify `scripts/ml/train_models.py` has run recently (models stored under `ml-models/`).
3. Run `npm run build` locally if needed, then push to `main` to trigger GitHub Pages deployment.

## Contributing

1. Fork the repo and create a branch (`git checkout -b feature/amazing-feature`).
2. Make changes, add tests if applicable, run `npm run build`.
3. Commit (`git commit -m "feat: amazing feature"`) and push.
4. Submit a Pull Request.

Please keep code in TypeScript, respect shadcn UI patterns, and update translations when adding UI strings.

## License

This project is licensed under the [MIT License](./LICENSE).
*** End Patch
