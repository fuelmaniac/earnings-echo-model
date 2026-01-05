const translations = {
  tr: {
    // App
    appTitle: "Bilanço Yankısı",
    appSubtitle: "Şirket bilançolarının hisse fiyatlarını nasıl etkilediğini keşfedin",
    liveData: "Canlı Veri",

    // Tabs
    tabRadar: "Radar",
    tabRadarDesc: "Piyasayı etkileyen önemli haberler",
    tabEarnings: "Bilanço Yankısı",
    tabEarningsDesc: "Şirket bilançoları arasındaki ilişkiler",
    tabNews: "Haber Analizi",
    tabNewsDesc: "Manuel haber analizi",
    tabAdmin: "Yönetici",

    // Sectors
    all: "Tümü",
    technology: "Teknoloji",
    finance: "Finans",
    automotive: "Otomotiv",
    energy: "Enerji",

    // Stats
    activePatterns: "Aktif Örüntü",
    avgAccuracy: "Ort. Başarı",
    avgCorrelation: "Korelasyon",
    quartersAnalyzed: "İncelenen Çeyrek",

    // Confidence levels
    veryStrong: "Çok Güçlü",
    strong: "Güçlü",
    moderate: "Orta",
    weak: "Zayıf",

    // Signal Cards
    correlation: "Korelasyon",
    accuracy: "Başarı Oranı",
    patternHistory: "Geçmiş Sonuçlar",
    summaryCorrect: "{correct} / {total} tahmin doğru",
    patternHistoryQuarters: "Geçmiş Sonuçlar ({count} Çeyrek)",

    // Results
    beat: "Beklenti Üstü",
    miss: "Beklenti Altı",
    inline: "Beklentide",

    // Trade Playbook
    tradePlaybook: "Yatırım Rehberi",
    whenTriggerBeats: "{trigger} beklentileri aştığında:",
    echoBehavior: "{echo} da %{percent} oranında beklentileri aştı",
    timing: "Tipik zamanlama: {trigger}'dan ~{days} gün sonra",
    basedOn: "{n} çeyreklik veriye dayanmaktadır",
    trigger: "Tetikleyici",
    behavior: "Davranış",
    sampleSize: "Örnek boyutu",

    // Tooltips / Explanations
    correlationExplain: "İki hissenin birlikte hareket etme oranı (0-1 arası, 1 = tam uyum)",
    accuracyExplain: "Bu örüntünün geçmişte ne sıklıkla doğru tahmin ettiği",
    beatExplain: "Şirket, analistlerin beklediğinden fazla kâr açıkladı",
    missExplain: "Şirket, analistlerin beklediğinden az kâr açıkladı",
    strengthExplain: "Korelasyon ve başarı oranına göre hesaplanan güç göstergesi",

    // Actions
    setAlert: "Uyarı Kur",
    helpful: "Faydalı mı?",
    refresh: "Yenile",
    forceRefresh: "Zorla Yenile",
    cancel: "İptal",
    save: "Kaydet",

    // Earnings
    lastEarnings: "Son Bilanço",
    nextEarnings: "Sonraki Bilanço",
    loadingEarnings: "Bilanço yükleniyor...",
    priceUnavailable: "Fiyat mevcut değil",

    // Major Events
    majorEvents: "Önemli Gelişmeler",
    majorEventsFeed: "Önemli Olaylar",
    noEvents: "Henüz önemli haber yok",
    eventsWillAppear: "Olaylar tespit edildikçe burada görünecek",
    loading: "Yükleniyor...",
    eventGroups: "{count} olay grubu",
    totalEvents: "({total} toplam)",
    moreRelated: "{count} ilgili güncelleme daha",
    generateTradeSignal: "Al-Sat Sinyali Oluştur",
    generating: "Oluşturuluyor...",
    showTradeSignal: "Al-Sat Sinyalini Göster",
    hideTradeSignal: "Al-Sat Sinyalini Gizle",

    // News Intelligence
    newsIntelligence: "Haber Analizi",
    analyzeWithGPT: "GPT-5.1 ile sektör etkisini analiz edin",
    pasteHeadline: "Ana başlık ve özeti yapıştırarak GPT-5.1 ile sektör etkisini analiz edin.",
    headline: "Başlık",
    headlineRequired: "Başlık gerekli",
    body: "Metin",
    optional: "opsiyonel",
    helperText: "Büyük makro haberler (faiz kararları, jeopolitik olaylar, büyük bilanço sürprizleri) için en iyi sonuçlar. Küçük söylentiler daha az yararlı olabilir.",
    analyzeNews: "Haberi Analiz Et",
    analyzing: "Analiz ediliyor...",
    summary: "Özet",
    importance: "Önem",
    horizon: "Zaman Ufku",
    sectorImpacts: "Sektör Etkileri",
    confidence: "Güven",
    exampleTickers: "Örnek hisseler",
    noTickers: "Belirli hisse önerisi yok",
    riskNotes: "Risk Notları",

    // Horizon labels
    horizonVeryShort: "Çok Kısa",
    horizonShort: "Kısa",
    horizonMedium: "Orta",
    horizonLong: "Uzun",

    // Footer
    disclaimer: "Sadece bilgilendirme amaçlıdır. Yatırım tavsiyesi değildir.",
    patternRecognition: "Bilanço Yankısı - Bilgilendirilmiş yatırım kararları için örüntü tanıma",

    // Language
    language: "Dil",

    // Alert Modal
    alertTitle: "Uyarı Kur",
    emailAlert: "E-posta Uyarısı",
    pushNotification: "Anlık Bildirim",
    priceTarget: "Fiyat Hedefi",
    enterEmail: "E-posta adresinizi girin",
    priceThreshold: "Fiyat eşiği",
    saveAlert: "Uyarıyı Kaydet",

    // Empty states
    noPatterns: "Seçili sektör için örüntü bulunamadı",

    // Time
    justNow: "şimdi",
    minutesAgo: "{n}dk önce",
    hoursAgo: "{n}sa önce",
    daysAgo: "{n}g önce",

    // Admin
    adminMode: "Yönetici modu",
    injectEvent: "Olay Ekle",
    testAlertBanner: "Uyarı Afişini Test Et",
    beginner: "Başlangıç",
    beginnerMode: "Başlangıç Modu",

    // Freshness
    updatedServer: "Güncellendi (sunucu)",
    fetchedBrowser: "Alındı (tarayıcı)",
    lastUpdated: "Son güncelleme"
  },

  en: {
    // App
    appTitle: "Earnings Echo",
    appSubtitle: "Discover how company earnings affect stock prices",
    liveData: "Live Data",

    // Tabs
    tabRadar: "Radar",
    tabRadarDesc: "Major market-moving news",
    tabEarnings: "Earnings Echo",
    tabEarningsDesc: "Earnings correlations between companies",
    tabNews: "News Analysis",
    tabNewsDesc: "Manual news analysis",
    tabAdmin: "Admin",

    // Sectors
    all: "All",
    technology: "Technology",
    finance: "Finance",
    automotive: "Automotive",
    energy: "Energy",

    // Stats
    activePatterns: "Active Patterns",
    avgAccuracy: "Avg Accuracy",
    avgCorrelation: "Correlation",
    quartersAnalyzed: "Quarters Analyzed",

    // Confidence levels
    veryStrong: "Very Strong",
    strong: "Strong",
    moderate: "Moderate",
    weak: "Weak",

    // Signal Cards
    correlation: "Correlation",
    accuracy: "Success Rate",
    patternHistory: "Historical Results",
    summaryCorrect: "{correct} / {total} predictions correct",
    patternHistoryQuarters: "Pattern History ({count} Quarters)",

    // Results
    beat: "Beat",
    miss: "Miss",
    inline: "In-line",

    // Trade Playbook
    tradePlaybook: "Trading Guide",
    whenTriggerBeats: "When {trigger} beats expectations:",
    echoBehavior: "{echo} also beat in {percent}% of cases",
    timing: "Typical timing: ~{days} days after {trigger}",
    basedOn: "Based on {n} quarters of data",
    trigger: "Trigger",
    behavior: "Behavior",
    sampleSize: "Sample size",

    // Tooltips / Explanations
    correlationExplain: "How closely these stocks move together (0-1 scale, 1 = perfect match)",
    accuracyExplain: "How often this pattern predicted correctly in the past",
    beatExplain: "Company reported higher earnings than analysts expected",
    missExplain: "Company reported lower earnings than analysts expected",
    strengthExplain: "Strength indicator based on correlation and success rate",

    // Actions
    setAlert: "Set Alert",
    helpful: "Helpful?",
    refresh: "Refresh",
    forceRefresh: "Force Refresh",
    cancel: "Cancel",
    save: "Save",

    // Earnings
    lastEarnings: "Last Earnings",
    nextEarnings: "Next Earnings",
    loadingEarnings: "Loading earnings...",
    priceUnavailable: "Price unavailable",

    // Major Events
    majorEvents: "Major Events",
    majorEventsFeed: "Major Events Feed",
    noEvents: "No major events yet",
    eventsWillAppear: "Events will appear here as they're detected",
    loading: "Loading...",
    eventGroups: "{count} event group(s)",
    totalEvents: "({total} total)",
    moreRelated: "{count} more related update(s)",
    generateTradeSignal: "Generate Trade Signal",
    generating: "Generating...",
    showTradeSignal: "Show Trade Signal",
    hideTradeSignal: "Hide Trade Signal",

    // News Intelligence
    newsIntelligence: "News Intelligence",
    analyzeWithGPT: "Analyze sector impact using GPT-5.1",
    pasteHeadline: "Paste a major news headline and summary to analyze sector impact using GPT-5.1.",
    headline: "Headline",
    headlineRequired: "Headline is required",
    body: "Body",
    optional: "optional",
    helperText: "Best for major macro news (rate decisions, geopolitical events, large earnings surprises). Minor rumors may yield less useful insights.",
    analyzeNews: "Analyze News",
    analyzing: "Analyzing...",
    summary: "Summary",
    importance: "Importance",
    horizon: "Horizon",
    sectorImpacts: "Sector Impacts",
    confidence: "confidence",
    exampleTickers: "Example tickers",
    noTickers: "No specific tickers suggested",
    riskNotes: "Risk Notes",

    // Horizon labels
    horizonVeryShort: "Very Short",
    horizonShort: "Short",
    horizonMedium: "Medium",
    horizonLong: "Long",

    // Footer
    disclaimer: "For informational purposes only. Not financial advice.",
    patternRecognition: "Earnings Echo - Pattern recognition for informed trading decisions",

    // Language
    language: "Language",

    // Alert Modal
    alertTitle: "Set Alert",
    emailAlert: "Email Alert",
    pushNotification: "Push Notification",
    priceTarget: "Price Target",
    enterEmail: "Enter email address",
    priceThreshold: "Price threshold",
    saveAlert: "Save Alert",

    // Empty states
    noPatterns: "No patterns found for the selected sector",

    // Time
    justNow: "just now",
    minutesAgo: "{n}m ago",
    hoursAgo: "{n}h ago",
    daysAgo: "{n}d ago",

    // Admin
    adminMode: "Admin mode",
    injectEvent: "Inject Event",
    testAlertBanner: "Test Alert Banner",
    beginner: "Beginner",
    beginnerMode: "Beginner Mode",

    // Freshness
    updatedServer: "Updated (server)",
    fetchedBrowser: "Fetched (browser)",
    lastUpdated: "Last updated"
  }
}

export default translations
