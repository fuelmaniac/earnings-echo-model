# Scripts

This directory contains utility scripts for the Earnings Echo project.

## calculate-pattern-history.js

This script calculates historical pattern accuracy for stock pairs (trigger → echo relationships) using the Finnhub API.

### What it does

1. **Fetches earnings history** - Gets the last 8 earnings reports for each trigger stock
2. **Calculates echo movements** - For each earnings date, fetches the echo stock's T+1 (next day) price movement
3. **Determines pattern accuracy** - A pattern is considered "accurate" when:
   - Trigger surprise is >= 2%
   - Echo move is >= 1.5%
   - Both move in the same direction (beat → up, miss → down)
4. **Calculates statistics** - Computes Pearson correlation (if n >= 4), accuracy percentage, and average echo move
5. **Generates JSON output** - Saves results to `src/data/pattern-history.json`

### Stock pairs analyzed

- **AMD_NVDA**: AMD (trigger) → NVDA (echo)
- **JPM_BAC**: JPM (trigger) → BAC (echo)
- **TSLA_F**: TSLA (trigger) → F (echo)
- **AAPL_MSFT**: AAPL (trigger) → MSFT (echo)
- **XOM_CVX**: XOM (trigger) → CVX (echo)

### Prerequisites

1. Get a free API key from [Finnhub](https://finnhub.io/)
2. Install dependencies:
   ```bash
   npm install
   ```

### Setting the API Key

**Linux/macOS:**
```bash
export FINNHUB_API_KEY=your_api_key_here
```

**Windows (Command Prompt):**
```cmd
set FINNHUB_API_KEY=your_api_key_here
```

**Windows (PowerShell):**
```powershell
$env:FINNHUB_API_KEY="your_api_key_here"
```

### Running the script

```bash
npm run calculate:history
```

Or directly:
```bash
FINNHUB_API_KEY=your_api_key node scripts/calculate-pattern-history.js
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

The script includes a 300ms delay between API calls to respect Finnhub's rate limits.

### Troubleshooting

- **"FINNHUB_API_KEY environment variable is not set"** - Make sure you've exported the API key before running
- **No data returned** - The Finnhub free tier has limited requests; wait and try again
- **Missing candle data** - Some historical dates may not have price data available
