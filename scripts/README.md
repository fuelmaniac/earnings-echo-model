# Scripts

This directory contains utility scripts for the Earnings Echo project.

## calculate-pattern-history.js

This script calculates historical pattern accuracy for stock pairs (trigger → echo relationships).

### APIs Used

- **Finnhub**: For earnings data (`/stock/earnings` endpoint)
- **Tiingo**: For historical daily close prices (EOD endpoint)

### What it does

1. **Fetches earnings history** - Gets the last 8 earnings reports for each trigger stock (via Finnhub)
2. **Fetches historical prices** - For each echo stock, fetches the full price history in a single API call (via Tiingo)
3. **Calculates echo movements** - For each earnings date, looks up:
   - `preClose` = price on earnings date (D)
   - `t1Close` = price on D+1 (next trading day)
   - `echoMovePercent` = (t1Close / preClose - 1) * 100
4. **Determines pattern accuracy** - A pattern is considered "accurate" when:
   - Trigger surprise is >= 2%
   - Echo move is >= 1.5%
   - Both move in the same direction (beat → up, miss → down)
5. **Calculates statistics** - Computes Pearson correlation (if n >= 4), accuracy percentage, and average echo move
6. **Generates JSON output** - Saves results to `src/data/pattern-history.json`

### Stock pairs analyzed

- **AMD_NVDA**: AMD (trigger) → NVDA (echo)
- **JPM_BAC**: JPM (trigger) → BAC (echo)
- **TSLA_F**: TSLA (trigger) → F (echo)
- **AAPL_MSFT**: AAPL (trigger) → MSFT (echo)
- **XOM_CVX**: XOM (trigger) → CVX (echo)

### Prerequisites

1. Get a free API key from [Finnhub](https://finnhub.io/)
2. Get a free API key from [Tiingo](https://www.tiingo.com/)
3. Install dependencies:
   ```bash
   npm install
   ```

### Setting the API Keys

**Linux/macOS:**
```bash
export FINNHUB_API_KEY=your_finnhub_key_here
export TIINGO_API_KEY=your_tiingo_key_here
```

**Windows (Command Prompt):**
```cmd
set FINNHUB_API_KEY=your_finnhub_key_here
set TIINGO_API_KEY=your_tiingo_key_here
```

**Windows (PowerShell):**
```powershell
$env:FINNHUB_API_KEY="your_finnhub_key_here"
$env:TIINGO_API_KEY="your_tiingo_key_here"
```

### Running the script

```bash
npm run calculate:history
```

Or directly:
```bash
FINNHUB_API_KEY=your_key TIINGO_API_KEY=your_key node scripts/calculate-pattern-history.js
```

### Output

The script generates `src/data/pattern-history.json` with the following structure:

```json
{
  "AMD_NVDA": {
    "history": [
      {
        "quarter": "Q3 2024",
        "date": "2024-09-30",
        "triggerResult": "Beat",
        "triggerSurprisePercent": 8.2,
        "echoMovePercent": 4.2,
        "accurate": true
      }
    ],
    "stats": {
      "correlation": 0.87,
      "accuracy": 87.5,
      "avgEchoMove": 3.6,
      "sampleSize": 8
    }
  }
}
```

### Rate Limiting

- **Finnhub**: Free tier has 60 calls/minute
- **Tiingo**: Free tier allows 50 requests/hour, but only 1 call per echo symbol is needed

The script makes minimal API calls:
- 5 calls to Finnhub (one per trigger stock for earnings)
- 5 calls to Tiingo (one per echo stock for full price history)

### Troubleshooting

- **"FINNHUB_API_KEY environment variable is not set"** - Make sure you've exported the Finnhub API key before running
- **"TIINGO_API_KEY environment variable is not set"** - Make sure you've exported the Tiingo API key before running
- **No earnings data returned** - The Finnhub free tier has limited requests; wait and try again
- **No price data for earnings date** - The earnings date may fall on a weekend/holiday; the script will log a warning
- **echoMovePercent is null** - Missing price data for either D or D+1; check the warning messages
