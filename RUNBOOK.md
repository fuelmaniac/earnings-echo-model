# Earnings Echo Runbook

This runbook describes the **exact steps** to regenerate the earnings pattern data and get it to production.

The core script is:

```bash
node scripts/calculate-pattern-history.js
```

It reads `src/data/earnings-dates.json` and writes `src/data/pattern-history.json`.

---

## 1. Regenerate pattern history with real Tiingo prices

Use this when you want fresh EPS + price reaction data (Day0 / Day1) and you have a valid Tiingo API key.

### 1.1. Open Codespaces and go to the project

In the integrated terminal:

```bash
cd /workspaces/earnings-echo-model
git pull
```

Make sure you are on the `main` branch.

### 1.2. Set TIINGO_API_KEY for this terminal session

Replace `YOUR_KEY_HERE` with your real key from Tiingo:

```bash
export TIINGO_API_KEY=YOUR_KEY_HERE
```

> **Note:** this only applies to the current terminal window. If you open a new terminal, you must export the key again.

### 1.3. Rebuild pattern history

Run the script:

```bash
node scripts/calculate-pattern-history.js
```

**What this does:**

- For each symbol pair:
  - matches earnings quarters (fundamentalEcho)
  - fetches daily closes from Tiingo (once per symbol)
  - computes Day0 / Day1 price moves for trigger and echo
- Overwrites: `src/data/pattern-history.json`
- Prints a summary per pair (sample size, EPS correlation, accuracy, avg echo move).

### 1.4. Commit and push the updated data

```bash
git add src/data/pattern-history.json
git commit -m "Update pattern history with latest Tiingo prices"
git push
```

This sends the new pattern history JSON to GitHub on `main`.

### 1.5. Verify production (Vercel)

1. Wait for Vercel to build and deploy the new commit.
2. Open the production URL in your browser:

   ```
   https://earnings-echo-model-a2ea.vercel.app
   ```

3. On the **AMD → NVDA** card:
   - Expand **"Pattern History (8 Quarters)"**.
   - Check that rows show real Day 0 price moves instead of "Fiyat gün 0 N/A".

**Example of a correct row:**

```
AMD: Beat (EPS +1.1%, Fiyat gün 0 +4.0%) |
NVDA: Beat (EPS +8.0%, Fiyat gün 0 -0.8%) | ✓
```

If you see this type of row, the pipeline from Tiingo → script → JSON → Vercel is working.

---

## 2. Regenerate pattern history without price data (EPS-only fallback)

Use this if you do not want to hit Tiingo, or if your API key is missing/expired.
In this mode, all price fields will be `null` and the UI will show "Fiyat gün 0 N/A".

### 2.1. Unset the Tiingo key

In the project terminal:

```bash
cd /workspaces/earnings-echo-model
unset TIINGO_API_KEY
```

### 2.2. Run the script

```bash
node scripts/calculate-pattern-history.js
```

**Expected behavior:**

- The script logs a warning:
  ```
  TIINGO_API_KEY not set; price reaction fields will remain null.
  ```
- `src/data/pattern-history.json` is regenerated, but all price reaction fields remain `null`.

You can then (optionally) commit and push this EPS-only version if you want production to show only EPS patterns with no price moves.

---

## 3. Running the local UI (for visual checks)

Use this when you want to visually confirm the data in the UI before pushing to production.

### 3.1. Install dependencies (first time only)

```bash
cd /workspaces/earnings-echo-model
npm install
```

### 3.2. Start the dev server

```bash
npm run dev
```

**In Codespaces:**

1. Open the **PORTS** tab.
2. Find the Vite port (e.g. `5173` or `5174`).
3. Click the "Open in Browser" icon.

**In the browser:**

1. **AMD → NVDA** card
2. Expand **"Pattern History (8 Quarters)"**
3. Confirm EPS and price numbers look reasonable.

Stop the dev server with `Ctrl + C` in the terminal.

---

## 4. Quick troubleshooting

**Symptom:** Production still shows "Fiyat gün 0 N/A" after you regenerated data.

**Checklist:**

1. Did you commit and push `src/data/pattern-history.json`?
2. On GitHub, does `src/data/pattern-history.json` contain non-null `triggerDay0MovePercent` / `echoDay0MovePercent` values?
3. Did Vercel finish deploying the latest `main` commit?
4. Did you hard refresh the browser? (`Ctrl + Shift + R`)

If all of the above look correct but the UI still doesn't match, open an issue and attach:

- the console output from `node scripts/calculate-pattern-history.js`
- a copy of the relevant JSON block from `src/data/pattern-history.json`.
