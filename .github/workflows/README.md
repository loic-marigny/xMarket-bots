# GitHub Actions Workflows

## deploy.yml
Automatically deploys the site to GitHub Pages whenever `main` receives a push (can also be triggered manually).

### Required configuration
1. Open **Settings → Pages** in the repository.
2. Select **GitHub Actions** as the deployment source.

## update-bot-data.yml
Updates the bot data JSON payloads and triggers a redeploy.

### Example usage from a trading workflow

```yaml
name: My Trading Bot

on:
  schedule:
    - cron: '0 * * * *'  # Every hour

jobs:
  trade:
    runs-on: ubuntu-latest
    steps:
      - name: Execute trading bot
        run: |
          # Your trading logic here
          # ...
      
      - name: Update bot data
        uses: actions/github-script@v7
        with:
          script: |
            const botData = {
              bots: [
                {
                  id: "bot-1",
                  name: "My Bot",
                  totalProfit: 1500.50,
                  profitPercentage: 15.5,
                  trades: 42,
                  winRate: 65.5,
                  status: "active",
                  startDate: "2024-01-01T00:00:00.000Z",
                  openTrades: [...],
                  closedTrades: [...]
                }
              ],
              lastUpdated: new Date().toISOString()
            };
            
            await github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'update-bot-data.yml',
              ref: 'main',
              inputs: {
                bot_data: JSON.stringify(botData)
              }
            });
```

## Data structure

### bots.json format

```json
{
  "bots": [
    {
      "id": "string",
      "name": "string",
      "totalProfit": "number",
      "profitPercentage": "number",
      "trades": "number",
      "winRate": "number",
      "status": "active" | "paused" | "stopped",
      "startDate": "ISO date string",
      "openTrades": [
        {
          "id": "string",
          "company": "string",
          "logo": "string (URL)",
          "quantity": "number",
          "buyPrice": "number",
          "buyValue": "number",
          "currentPrice": "number",
          "currentValue": "number",
          "profitLoss": "number",
          "profitLossPercentage": "number",
          "buyDate": "ISO date string"
        }
      ],
      "closedTrades": [
        {
          "id": "string",
          "company": "string",
          "logo": "string (URL)",
          "quantity": "number",
          "buyPrice": "number",
          "buyValue": "number",
          "sellPrice": "number",
          "sellValue": "number",
          "profitLoss": "number",
          "profitLossPercentage": "number",
          "buyDate": "ISO date string",
          "sellDate": "ISO date string"
        }
      ]
    }
  ],
  "lastUpdated": "ISO date string"
}
```
