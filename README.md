# 📊 Earnings Echo

Financial pattern recognition platform that identifies "echo patterns" - when one company's earnings announcement predictably affects another company's stock price.

## 🎯 Example Patterns

- **AMD earnings beat** → **NVDA rises next day** (87% confidence)
- **JPM margin beats** → **BAC benefits same day** (91% confidence)
- **Google ad revenue up** → **Meta follows** (79% confidence)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm

### Installation
```bash
# Clone the repository
git clone https://github.com/fuelmaniac/earnings-echo-model.git
cd earnings-echo-model

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production
```bash
npm run build
```

## 🔧 Configuration

### API Keys

The app uses Finnhub API for live stock prices. Create a `.env` file:
```env
VITE_FINNHUB_API_KEY=demo
```

Get your free API key at [Finnhub.io](https://finnhub.io/)

**Note:** Demo mode works without API key for testing.

## 📱 Features

- ✅ Real-time stock price updates
- ✅ Historical pattern analysis (8+ quarters)
- ✅ Confidence scoring (65-91%)
- ✅ Risk notes with actionable insights
- ✅ Mobile-responsive design
- ✅ Live/Demo data toggle

## 🏗️ Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Finnhub API** - Stock data

## 📋 Runbook

See [RUNBOOK.md](RUNBOOK.md) for step-by-step operational commands to regenerate and deploy pattern history data.

## 📄 License

MIT License

## 🤝 Contributing

Contributions welcome! Please open an issue first to discuss changes.
