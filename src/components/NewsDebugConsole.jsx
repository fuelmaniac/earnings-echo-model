import React, { useState, useEffect, useMemo, useCallback } from "react";

/**
 * NewsDebugConsole - Admin-only panel for debugging the news pipeline
 *
 * Displays:
 * - Raw Ingest: Headlines fetched from providers
 * - Decisions: Why each headline was kept/rejected
 * - Metrics: Pipeline counters and timestamps
 * - Report Missed Major: Manually analyze a headline
 */

// Tab names
const TABS = {
  RAW: "raw",
  DECISIONS: "decisions",
  METRICS: "metrics",
  REPORT: "report",
};

// Decision badge colors
const DECISION_COLORS = {
  ANALYZED: "bg-green-500/20 text-green-400 border-green-500/50",
  SKIPPED_LOW_PREFILTER: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  SKIPPED_ALREADY_PROCESSED: "bg-gray-500/20 text-gray-400 border-gray-500/50",
  SKIPPED_DAILY_CAP: "bg-orange-500/20 text-orange-400 border-orange-500/50",
  SKIPPED_PROVIDER_MISSING: "bg-red-500/20 text-red-400 border-red-500/50",
  ERROR: "bg-red-500/20 text-red-400 border-red-500/50",
};

function NewsDebugConsole() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState(TABS.RAW);
  const [adminSecret, setAdminSecret] = useState(null);
  const [showSecretPrompt, setShowSecretPrompt] = useState(false);

  // Data states
  const [rawItems, setRawItems] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [metrics, setMetrics] = useState(null);

  // Loading states
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Error states
  const [errorRaw, setErrorRaw] = useState(null);
  const [errorDecisions, setErrorDecisions] = useState(null);
  const [errorMetrics, setErrorMetrics] = useState(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Report Missed Major states
  const [reportHeadline, setReportHeadline] = useState("");
  const [reportSummary, setReportSummary] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [reportError, setReportError] = useState(null);

  // Prompt for secret on first load
  useEffect(() => {
    const storedSecret = sessionStorage.getItem("newsDebugSecret");
    if (storedSecret) {
      setAdminSecret(storedSecret);
    } else {
      setShowSecretPrompt(true);
    }
  }, []);

  // Prompt handler
  const handleSecretSubmit = useCallback((e) => {
    e.preventDefault();
    const secret = e.target.elements.secret.value.trim();
    if (secret) {
      sessionStorage.setItem("newsDebugSecret", secret);
      setAdminSecret(secret);
      setShowSecretPrompt(false);
    }
  }, []);

  // Fetch raw items
  const fetchRawItems = useCallback(async () => {
    if (!adminSecret) return;
    setLoadingRaw(true);
    setErrorRaw(null);
    try {
      const res = await fetch(
        `/api/news-debug/raw?admin=1&secret=${encodeURIComponent(adminSecret)}&limit=200`
      );
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Unknown error");
      }
      setRawItems(data.items || []);
    } catch (err) {
      setErrorRaw(err.message);
    } finally {
      setLoadingRaw(false);
    }
  }, [adminSecret]);

  // Fetch decisions
  const fetchDecisions = useCallback(async () => {
    if (!adminSecret) return;
    setLoadingDecisions(true);
    setErrorDecisions(null);
    try {
      const res = await fetch(
        `/api/news-debug/decisions?admin=1&secret=${encodeURIComponent(adminSecret)}&limit=200`
      );
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Unknown error");
      }
      setDecisions(data.items || []);
    } catch (err) {
      setErrorDecisions(err.message);
    } finally {
      setLoadingDecisions(false);
    }
  }, [adminSecret]);

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    if (!adminSecret) return;
    setLoadingMetrics(true);
    setErrorMetrics(null);
    try {
      const res = await fetch(
        `/api/news-debug/metrics?admin=1&secret=${encodeURIComponent(adminSecret)}`
      );
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Unknown error");
      }
      setMetrics(data.metrics || {});
    } catch (err) {
      setErrorMetrics(err.message);
    } finally {
      setLoadingMetrics(false);
    }
  }, [adminSecret]);

  // Load data when secret is available or tab changes
  useEffect(() => {
    if (!adminSecret) return;
    if (activeTab === TABS.RAW && rawItems.length === 0) {
      fetchRawItems();
    } else if (activeTab === TABS.DECISIONS && decisions.length === 0) {
      fetchDecisions();
    } else if (activeTab === TABS.METRICS && !metrics) {
      fetchMetrics();
    }
  }, [adminSecret, activeTab, rawItems.length, decisions.length, metrics, fetchRawItems, fetchDecisions, fetchMetrics]);

  // Filtered raw items
  const filteredRawItems = useMemo(() => {
    if (!searchQuery.trim()) return rawItems;
    const query = searchQuery.toLowerCase();
    return rawItems.filter(
      (item) =>
        item.headline?.toLowerCase().includes(query) ||
        item.source?.toLowerCase().includes(query) ||
        String(item.providerId).includes(query)
    );
  }, [rawItems, searchQuery]);

  // Filtered decisions
  const filteredDecisions = useMemo(() => {
    if (!searchQuery.trim()) return decisions;
    const query = searchQuery.toLowerCase();
    return decisions.filter(
      (item) =>
        item.headline?.toLowerCase().includes(query) ||
        item.decision?.toLowerCase().includes(query) ||
        String(item.providerId).includes(query)
    );
  }, [decisions, searchQuery]);

  // Report Missed Major handler
  const handleReport = useCallback(async () => {
    if (!adminSecret || !reportHeadline.trim()) return;
    setReportLoading(true);
    setReportResult(null);
    setReportError(null);
    try {
      const res = await fetch(
        `/api/news-debug/analyze?admin=1&secret=${encodeURIComponent(adminSecret)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headline: reportHeadline.trim(),
            summary: reportSummary.trim() || null,
            url: reportUrl.trim() || null,
          }),
        }
      );
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Unknown error");
      }
      setReportResult(data);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReportLoading(false);
    }
  }, [adminSecret, reportHeadline, reportSummary, reportUrl]);

  // Copy headline to clipboard
  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text);
  }, []);

  // Format timestamp
  const formatTime = (ts) => {
    if (!ts) return "N/A";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  // Render secret prompt
  if (showSecretPrompt) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 mb-6 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">News Debug Console</h2>
        <form onSubmit={handleSecretSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Enter admin secret to access debug console:
            </label>
            <input
              name="secret"
              type="password"
              placeholder="NEWS_WATCHDOG_CRON_SECRET"
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Unlock Debug Console
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 mb-6">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div className="text-left">
            <h2 className="text-lg font-semibold text-white">News Debug Console</h2>
            <p className="text-xs text-gray-400">Admin-only pipeline observability</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-700 pb-2">
            {[
              { id: TABS.RAW, label: "Raw Ingest" },
              { id: TABS.DECISIONS, label: "Decisions" },
              { id: TABS.METRICS, label: "Metrics" },
              { id: TABS.REPORT, label: "Report Missed" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? "bg-purple-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search (for Raw and Decisions tabs) */}
          {(activeTab === TABS.RAW || activeTab === TABS.DECISIONS) && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search headlines, sources, IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                onClick={() => {
                  if (activeTab === TABS.RAW) fetchRawItems();
                  else fetchDecisions();
                }}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
              >
                Refresh
              </button>
            </div>
          )}

          {/* Raw Ingest Tab */}
          {activeTab === TABS.RAW && (
            <div className="space-y-2">
              {loadingRaw && (
                <div className="text-gray-400 text-sm py-4 text-center">Loading raw items...</div>
              )}
              {errorRaw && (
                <div className="text-red-400 text-sm py-4 text-center bg-red-500/10 rounded-lg">
                  Error: {errorRaw}
                </div>
              )}
              {!loadingRaw && !errorRaw && filteredRawItems.length === 0 && (
                <div className="text-gray-400 text-sm py-4 text-center">No raw items found</div>
              )}
              {!loadingRaw && !errorRaw && filteredRawItems.length > 0 && (
                <div className="overflow-auto max-h-96 space-y-2">
                  {filteredRawItems.map((item, idx) => (
                    <div
                      key={`${item.hash}-${idx}`}
                      className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-white font-medium flex-1">{item.headline}</span>
                        <button
                          onClick={() => copyToClipboard(item.headline)}
                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                          title="Copy headline"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                        <span className="px-2 py-0.5 bg-gray-800 rounded">{formatTime(item.ts)}</span>
                        {item.source && (
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                            {item.source}
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-gray-800 rounded">ID: {item.providerId}</span>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30"
                          >
                            Link
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-500 pt-2">
                Showing {filteredRawItems.length} of {rawItems.length} items
              </div>
            </div>
          )}

          {/* Decisions Tab */}
          {activeTab === TABS.DECISIONS && (
            <div className="space-y-2">
              {loadingDecisions && (
                <div className="text-gray-400 text-sm py-4 text-center">Loading decisions...</div>
              )}
              {errorDecisions && (
                <div className="text-red-400 text-sm py-4 text-center bg-red-500/10 rounded-lg">
                  Error: {errorDecisions}
                </div>
              )}
              {!loadingDecisions && !errorDecisions && filteredDecisions.length === 0 && (
                <div className="text-gray-400 text-sm py-4 text-center">No decisions found</div>
              )}
              {!loadingDecisions && !errorDecisions && filteredDecisions.length > 0 && (
                <div className="overflow-auto max-h-96 space-y-2">
                  {filteredDecisions.map((item, idx) => (
                    <div
                      key={`${item.hash}-${idx}`}
                      className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-white font-medium flex-1">{item.headline}</span>
                        <span
                          className={`px-2 py-0.5 text-xs rounded border ${
                            DECISION_COLORS[item.decision] || "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {item.decision}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mb-2">{item.decisionReason}</div>
                      <div className="flex flex-wrap gap-2 text-xs mb-2">
                        <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-400">
                          {formatTime(item.ts)}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-400">
                          Prefilter: {item.prefilterScore}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-400">
                          Threshold: {item.threshold}
                        </span>
                        {item.dedupeHit && (
                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                            Dedupe Hit
                          </span>
                        )}
                      </div>
                      {/* Prefilter reasons */}
                      {item.prefilterReasons && item.prefilterReasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.prefilterReasons.map((reason, rIdx) => (
                            <span
                              key={rIdx}
                              className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Classifier results */}
                      {item.classifier?.used && (
                        <div className="flex flex-wrap gap-2 text-xs pt-2 border-t border-gray-700">
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                            Score: {item.classifier.importanceScore}
                          </span>
                          {item.classifier.importanceCategory && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                              {item.classifier.importanceCategory}
                            </span>
                          )}
                          {item.majorEventId && (
                            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded">
                              Event: {item.majorEventId}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Error */}
                      {item.error && (
                        <div className="text-xs text-red-400 pt-2 border-t border-gray-700">
                          Error: {item.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-500 pt-2">
                Showing {filteredDecisions.length} of {decisions.length} items
              </div>
            </div>
          )}

          {/* Metrics Tab */}
          {activeTab === TABS.METRICS && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  onClick={fetchMetrics}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                >
                  Refresh
                </button>
              </div>
              {loadingMetrics && (
                <div className="text-gray-400 text-sm py-4 text-center">Loading metrics...</div>
              )}
              {errorMetrics && (
                <div className="text-red-400 text-sm py-4 text-center bg-red-500/10 rounded-lg">
                  Error: {errorMetrics}
                </div>
              )}
              {!loadingMetrics && !errorMetrics && metrics && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "Raw Fetched (Last Run)", value: metrics.rawFetchedLastRun, color: "blue" },
                    { label: "Raw Logged Total", value: metrics.rawLoggedCount, color: "blue" },
                    { label: "Decisions Logged", value: metrics.decisionsLoggedCount, color: "purple" },
                    { label: "Analyzed", value: metrics.analyzedCount, color: "green" },
                    { label: "Skipped (Low Prefilter)", value: metrics.skippedLowPrefilterCount, color: "yellow" },
                    { label: "Skipped (Daily Cap)", value: metrics.skippedDailyCapCount, color: "orange" },
                    { label: "Skipped (Already Processed)", value: metrics.skippedProcessedCount, color: "gray" },
                    { label: "Errors", value: metrics.errorsCount, color: "red" },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className={`bg-${metric.color}-500/10 border border-${metric.color}-500/30 rounded-lg p-3`}
                    >
                      <div className={`text-2xl font-bold text-${metric.color}-400`}>
                        {metric.value ?? 0}
                      </div>
                      <div className="text-xs text-gray-400">{metric.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {!loadingMetrics && !errorMetrics && metrics && (
                <div className="text-xs text-gray-500 pt-2 border-t border-gray-700 mt-4">
                  <div>Last Run: {formatTime(metrics.lastRunAt)}</div>
                  <div>Last Updated: {formatTime(metrics.lastUpdatedAt)}</div>
                </div>
              )}
            </div>
          )}

          {/* Report Missed Tab */}
          {activeTab === TABS.REPORT && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                Paste a headline you expected to see in Major Events. This will analyze it with the
                same classifier without storing it.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Headline *</label>
                  <input
                    type="text"
                    value={reportHeadline}
                    onChange={(e) => setReportHeadline(e.target.value)}
                    placeholder="e.g., Venezuela president captured by US operation"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Summary (optional)</label>
                  <textarea
                    value={reportSummary}
                    onChange={(e) => setReportSummary(e.target.value)}
                    placeholder="Additional context or body text..."
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">URL (optional)</label>
                  <input
                    type="text"
                    value={reportUrl}
                    onChange={(e) => setReportUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleReport}
                  disabled={reportLoading || !reportHeadline.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                >
                  {reportLoading ? "Analyzing..." : "Analyze & Log"}
                </button>
              </div>

              {/* Report Error */}
              {reportError && (
                <div className="text-red-400 text-sm py-4 text-center bg-red-500/10 rounded-lg">
                  Error: {reportError}
                </div>
              )}

              {/* Report Result */}
              {reportResult && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="text-white font-medium">{reportResult.headline}</div>

                  {/* Prefilter */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                      Prefilter Score: {reportResult.prefilter?.score}
                    </span>
                    {reportResult.prefilter?.reasons?.map((r, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded">
                        {r}
                      </span>
                    ))}
                  </div>

                  {/* Analysis */}
                  {reportResult.analysis && (
                    <div className="space-y-2 pt-2 border-t border-gray-700">
                      <div className="flex gap-2 text-xs">
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                          Importance: {reportResult.analysis.importanceScore}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                          {reportResult.analysis.importanceCategory}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded ${
                            reportResult.wouldBeStored
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {reportResult.wouldBeStored ? "Would be stored" : "Would NOT be stored"}
                        </span>
                      </div>
                      <div className="text-sm text-gray-300">{reportResult.analysis.summary}</div>
                      {reportResult.analysis.sectors && reportResult.analysis.sectors.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          {reportResult.analysis.sectors.map((s, i) => (
                            <span
                              key={i}
                              className={`px-2 py-0.5 rounded ${
                                s.direction === "bullish"
                                  ? "bg-green-500/20 text-green-400"
                                  : s.direction === "bearish"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-gray-500/20 text-gray-400"
                              }`}
                            >
                              {s.name}: {s.direction}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {reportResult.error && (
                    <div className="text-red-400 text-xs pt-2 border-t border-gray-700">
                      Analysis Error: {reportResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NewsDebugConsole;
