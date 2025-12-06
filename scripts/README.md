# Scripts

This directory contains utility scripts for the Earnings Echo project.

## calculate-pattern-history.js

This script calculates historical pattern accuracy for stock pairs (trigger → echo relationships), including both **Price Echo** and **Fundamental Echo** analysis.

### APIs Used

- **Finnhub**: For earnings data (`/stock/earnings` endpoint) - fetches data for both trigger and echo stocks
- **Tiingo**: For historical daily close prices (EOD endpoint) - fetches data for echo stocks

### What it does

The script calculates two types of correlations:

#### 1. Price Echo (trigger earnings → echo stock price movement)

This measures how the echo stock's price reacts after the trigger company reports earnings.

- **Fetches earnings history** - Gets the last 8 earnings reports for each trigger stock (via Finnhub)
- **Fetches historical prices** - For each echo stock, fetches the full price history in a single API call (via Tiingo)
- **Calculates echo movements** - For each earnings date, looks up:
  - `preClose` = price on earnings date (D)
  - `t1Close` = price on D+1 (next trading day)
  - `echoMovePercent` = (t1Close / preClose - 1) * 100
- **Determines pattern accuracy** - A pattern is considered "accurate" when:
  - Trigger surprise is >= 2%
  - Echo move is >= 1.5%
  - Both move in the same direction (beat → up, miss → down)
- **Calculates statistics** - Computes Pearson correlation (if n >= 4), accuracy percentage, and average echo move

#### 2. Fundamental Echo (trigger earnings → echo earnings)

This measures: "When the first reporter beats, does the second reporter also beat?"

- **Fetches earnings for both stocks** - Gets the last 8 earnings reports for both trigger and echo stocks
- **Matches by quarter** - Pairs up earnings that occurred in the same fiscal quarter (e.g., "2024-Q3")
- **Determines trigger/echo by date** - Whichever company reports first = trigger, second = echo
  - If same day, uses alphabetical order
- **Classifies results**:
  - **Beat**: surprisePercent > 2.0%
  - **Miss**: surprisePercent < -2.0%
  - **Inline**: -2.0% <= surprisePercent <= 2.0%
- **Calculates statistics**:
  - `beatFollowsBeat`: P(echo beats | trigger beats)
  - `missFollowsMiss`: P(echo misses | trigger misses)
  - `directionAgreement`: % where both have same result (Beat/Miss/Inline)
  - `fundamentalCorrelation`: Pearson correlation of surprise percentages
  - `avgGapDays`: Average days between trigger and echo earnings
  - `sampleSize`: Number of matched quarters

### Important Notes

- **Terminology**: In the backend/code, "trigger" = first reporter and "echo" = second reporter
- Both are major sector players, no hierarchy implied
- Order is determined by actual earnings announcement date, not hardcoded
- Some quarters AMD might report before NVDA, other quarters vice versa
- Warnings are logged if earnings in the same quarter are >45 days apart
- Stats are set to `null` if sample size < 4

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
    "priceEcho": {
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
    },
    "fundamentalEcho": {
      "matchedQuarters": [
        {
          "quarter": "Q3 2024",
          "triggerDate": "2024-10-24",
          "triggerSymbol": "AMD",
          "echoDate": "2024-11-15",
          "echoSymbol": "NVDA",
          "gapDays": 22,
          "triggerResult": "Beat",
          "echoResult": "Beat",
          "triggerSurprisePercent": 8.2,
          "echoSurprisePercent": 5.1,
          "agreement": true
        }
      ],
      "stats": {
        "beatFollowsBeat": 0.75,
        "missFollowsMiss": 0.60,
        "directionAgreement": 0.80,
        "fundamentalCorrelation": 0.65,
        "avgGapDays": 19,
        "sampleSize": 8
      }
    }
  }
}
```

#### Price Echo Fields

- `history[].quarter`: Display quarter (e.g., "Q3 2024")
- `history[].date`: Trigger earnings date
- `history[].triggerResult`: "Beat", "Miss", or "Inline"
- `history[].triggerSurprisePercent`: Trigger's surprise percentage
- `history[].echoMovePercent`: Echo stock price movement on D+1
- `history[].accurate`: Whether pattern met accuracy thresholds
- `stats.correlation`: Pearson correlation (-1 to 1)
- `stats.accuracy`: % of patterns meeting thresholds
- `stats.avgEchoMove`: Average absolute echo movement
- `stats.sampleSize`: Number of valid data points

#### Fundamental Echo Fields

- `matchedQuarters[].quarter`: Display quarter (e.g., "Q3 2024")
- `matchedQuarters[].triggerDate`: Date of first earnings report
- `matchedQuarters[].triggerSymbol`: Symbol that reported first
- `matchedQuarters[].echoDate`: Date of second earnings report
- `matchedQuarters[].echoSymbol`: Symbol that reported second
- `matchedQuarters[].gapDays`: Days between the two earnings dates
- `matchedQuarters[].triggerResult`: First reporter's result
- `matchedQuarters[].echoResult`: Second reporter's result
- `matchedQuarters[].triggerSurprisePercent`: First reporter's surprise %
- `matchedQuarters[].echoSurprisePercent`: Second reporter's surprise %
- `matchedQuarters[].agreement`: Whether both had same result
- `matchedQuarters[].warning`: (optional) Warning if gap >45 days
- `stats.beatFollowsBeat`: P(echo beats | trigger beats)
- `stats.missFollowsMiss`: P(echo misses | trigger misses)
- `stats.directionAgreement`: % with same result direction
- `stats.fundamentalCorrelation`: Pearson correlation of surprise %
- `stats.avgGapDays`: Average days between earnings
- `stats.sampleSize`: Number of matched quarters

### Rate Limiting

- **Finnhub**: Free tier has 60 calls/minute
- **Tiingo**: Free tier allows 50 requests/hour, but only 1 call per echo symbol is needed

The script makes minimal API calls:
- 10 calls to Finnhub (one per trigger stock + one per echo stock for earnings)
- 5 calls to Tiingo (one per echo stock for full price history)

### Troubleshooting

- **"FINNHUB_API_KEY environment variable is not set"** - Make sure you've exported the Finnhub API key before running
- **"TIINGO_API_KEY environment variable is not set"** - Make sure you've exported the Tiingo API key before running
- **No earnings data returned** - The Finnhub free tier has limited requests; wait and try again
- **No price data for earnings date** - The earnings date may fall on a weekend/holiday; the script will log a warning
- **echoMovePercent is null** - Missing price data for either D or D+1; check the warning messages
