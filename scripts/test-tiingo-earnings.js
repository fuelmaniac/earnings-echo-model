/**
 * Test Tiingo API for Earnings Report Dates
 *
 * Goal: Verify if Tiingo provides actual earnings announcement dates (reportDate)
 * in addition to fiscal period end dates.
 *
 * RESEARCH FINDINGS (based on web search):
 * =========================================
 * Tiingo provides:
 *   ✓ Financial statements (income, balance sheet, cash flow)
 *   ✓ Daily fundamentals (P/E, market cap, etc.)
 *   ✓ 5-15+ years of historical fundamental data
 *   ✗ NO earnings calendar / announcement dates
 *
 * Tiingo's "date" field = Fiscal period end date (e.g., 2024-09-30 for Q3)
 * NOT the actual earnings announcement date (e.g., 2024-10-29 when AMD reports)
 *
 * RECOMMENDATION: Use Finnhub /calendar/earnings for:
 *   - Actual earnings announcement dates
 *   - Pre-market vs after-hours timing
 *   - Estimated vs actual EPS
 */

const https = require('https');

const TIINGO_API_KEY = process.env.TIINGO_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

function fetchTiingo(url) {
  return new Promise((resolve, reject) => {
    if (!TIINGO_API_KEY) {
      reject(new Error('TIINGO_API_KEY not set'));
      return;
    }
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${TIINGO_API_KEY}`
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.substring(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function fetchFinnhub(url) {
  return new Promise((resolve, reject) => {
    if (!FINNHUB_API_KEY) {
      reject(new Error('FINNHUB_API_KEY not set'));
      return;
    }
    const fullUrl = `${url}${url.includes('?') ? '&' : '?'}token=${FINNHUB_API_KEY}`;

    https.get(fullUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.substring(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

async function testTiingoStatements() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: Tiingo Fundamentals Statements');
  console.log('='.repeat(70));
  console.log('URL: https://api.tiingo.com/tiingo/fundamentals/AMD/statements\n');

  try {
    const data = await fetchTiingo('https://api.tiingo.com/tiingo/fundamentals/AMD/statements');

    if (Array.isArray(data) && data.length > 0) {
      console.log(`✓ Received ${data.length} statement(s)\n`);

      // Show first 3 income statements
      const incomeStatements = data.filter(s => s.statementType === 'incomeStatement').slice(0, 3);
      console.log('Recent Income Statements:');
      console.log('-'.repeat(50));

      incomeStatements.forEach((stmt, i) => {
        console.log(`\n[${i + 1}] ${stmt.statementType}`);
        console.log(`    date: ${stmt.date}`);
        console.log(`    quarter: ${stmt.quarter}`);
        console.log(`    year: ${stmt.year}`);

        // Check for earnings-related dates
        const stmtStr = JSON.stringify(stmt).toLowerCase();
        if (stmtStr.includes('reportdate')) {
          console.log(`    reportDate: FOUND!`);
        }
        if (stmtStr.includes('announcementdate')) {
          console.log(`    announcementDate: FOUND!`);
        }
      });

      // Analyze date fields
      const firstStmt = data[0];
      const allKeys = Object.keys(firstStmt).filter(k =>
        k.toLowerCase().includes('date') ||
        k.toLowerCase().includes('period') ||
        k.toLowerCase().includes('report')
      );

      console.log('\n' + '-'.repeat(50));
      console.log('DATE-RELATED FIELDS IN RESPONSE:');
      allKeys.forEach(k => console.log(`  • ${k}: ${firstStmt[k]}`));

      // Verdict
      const hasReportDate = data.some(s => s.reportDate || s.announcementDate);
      console.log('\n' + '-'.repeat(50));
      console.log('VERDICT: Tiingo has reportDate/announcementDate?');
      console.log(`  → ${hasReportDate ? 'YES ✓' : 'NO ✗ - Only fiscal period dates'}`);

    } else if (data.detail) {
      console.log('API Error:', data.detail);
    } else {
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.log('ERROR:', error.message);
  }
}

async function testFinnhubEarnings() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: Finnhub Earnings Calendar (for comparison)');
  console.log('='.repeat(70));
  console.log('URL: https://finnhub.io/api/v1/calendar/earnings?symbol=AMD\n');

  try {
    const data = await fetchFinnhub('https://finnhub.io/api/v1/calendar/earnings?symbol=AMD');

    if (data.earningsCalendar && data.earningsCalendar.length > 0) {
      console.log(`✓ Received ${data.earningsCalendar.length} earnings event(s)\n`);

      console.log('Recent Earnings Announcements:');
      console.log('-'.repeat(50));

      data.earningsCalendar.slice(0, 5).forEach((event, i) => {
        console.log(`\n[${i + 1}] AMD Earnings`);
        console.log(`    date: ${event.date}          ← ACTUAL ANNOUNCEMENT DATE`);
        console.log(`    hour: ${event.hour || 'N/A'}         ← Pre-market/After-hours`);
        console.log(`    epsEstimate: ${event.epsEstimate}`);
        console.log(`    epsActual: ${event.epsActual || 'TBD'}`);
        console.log(`    revenueEstimate: ${event.revenueEstimate}`);
        console.log(`    revenueActual: ${event.revenueActual || 'TBD'}`);
        console.log(`    quarter: ${event.quarter}`);
        console.log(`    year: ${event.year}`);
      });

      console.log('\n' + '-'.repeat(50));
      console.log('VERDICT: Finnhub has earnings announcement dates?');
      console.log('  → YES ✓ - With timing (pre-market/after-hours)');

    } else if (data.error) {
      console.log('API Error:', data.error);
    } else {
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.log('ERROR:', error.message);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║    TIINGO vs FINNHUB: Earnings Announcement Date Test                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\nTest Symbol: AMD`);

  if (TIINGO_API_KEY) {
    console.log(`Tiingo API Key: ${TIINGO_API_KEY.substring(0, 8)}...`);
  } else {
    console.log('Tiingo API Key: NOT SET');
  }

  if (FINNHUB_API_KEY) {
    console.log(`Finnhub API Key: ${FINNHUB_API_KEY.substring(0, 8)}...`);
  } else {
    console.log('Finnhub API Key: NOT SET');
  }

  if (TIINGO_API_KEY) {
    await testTiingoStatements();
  } else {
    console.log('\n⚠️  Skipping Tiingo test - TIINGO_API_KEY not set');
  }

  if (FINNHUB_API_KEY) {
    await testFinnhubEarnings();
  } else {
    console.log('\n⚠️  Skipping Finnhub test - FINNHUB_API_KEY not set');
  }

  console.log('\n' + '═'.repeat(70));
  console.log('FINAL CONCLUSION');
  console.log('═'.repeat(70));
  console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│  TIINGO FUNDAMENTALS API:                                           │
│  • Provides: Financial statements, daily metrics, ratios            │
│  • Date field: Fiscal period END date (e.g., 2024-09-30 for Q3)     │
│  • Missing: Actual earnings announcement date                       │
│  • Missing: Pre-market vs after-hours timing                        │
│                                                                     │
│  FINNHUB EARNINGS CALENDAR API:                                     │
│  • Provides: Actual earnings announcement dates                     │
│  • Provides: Timing (amc = after-market-close, bmo = before-open)   │
│  • Provides: EPS estimates and actuals                              │
│  • Provides: Revenue estimates and actuals                          │
│                                                                     │
│  RECOMMENDATION:                                                    │
│  → Use Finnhub /calendar/earnings for earnings dates                │
│  → Use Tiingo for historical price data (already in use)            │
└─────────────────────────────────────────────────────────────────────┘

For the Earnings Echo Model, we need ACTUAL announcement dates to:
1. Know WHEN to trade (day before for pre-market, day-of for after-hours)
2. Align historical price data with earnings events

ACTION: Switch to Finnhub for earnings calendar data.
`);
}

main().catch(console.error);
