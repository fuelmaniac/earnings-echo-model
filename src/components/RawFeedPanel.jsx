import React, { useState, useEffect, useMemo, useCallback } from "react";

/**
 * RawFeedPanel - Admin-only panel for viewing last run snapshot
 *
 * Displays:
 * - Health banner (warn/error status)
 * - Summary stats (fetchedCount, keptCount, droppedCount, fallback status)
 * - List of raw items with provider, timestamp, macroMatch indicator
 * - Client-side search filter
 */

function RawFeedPanel() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [adminSecret, setAdminSecret] = useState(null);
  const [showSecretPrompt, setShowSecretPrompt] = useState(false);

  // Data states
  const [snapshot, setSnapshot] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

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

  // Fetch snapshot
  const fetchSnapshot = useCallback(async () => {
    if (!adminSecret) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/raw-news?admin=1&secret=${encodeURIComponent(adminSecret)}&limit=50`
      );
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Unknown error");
      }
      setSnapshot(data.snapshot);
      setHealth(data.health);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  // Load data when secret is available
  useEffect(() => {
    if (adminSecret && !snapshot) {
      fetchSnapshot();
    }
  }, [adminSecret, snapshot, fetchSnapshot]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!snapshot?.items) return [];
    if (!searchQuery.trim()) return snapshot.items;
    const query = searchQuery.toLowerCase();
    return snapshot.items.filter(
      (item) =>
        item.headline?.toLowerCase().includes(query) ||
        item.source?.toLowerCase().includes(query) ||
        item.provider?.toLowerCase().includes(query)
    );
  }, [snapshot, searchQuery]);

  // Format timestamp
  const formatTime = (ts) => {
    if (!ts) return "N/A";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  // Get health banner style
  const getHealthBannerStyle = (level) => {
    if (level === "error") {
      return "bg-red-500/20 border-red-500/50 text-red-400";
    }
    if (level === "warn") {
      return "bg-yellow-500/20 border-yellow-500/50 text-yellow-400";
    }
    return "bg-green-500/20 border-green-500/50 text-green-400";
  };

  // Render secret prompt
  if (showSecretPrompt) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 mb-6 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Raw Feed Panel</h2>
        <form onSubmit={handleSecretSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Enter admin secret to access raw feed:
            </label>
            <input
              name="secret"
              type="password"
              placeholder="NEWS_WATCHDOG_CRON_SECRET"
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Unlock Raw Feed
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
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="text-left">
            <h2 className="text-lg font-semibold text-white">Raw Feed Panel</h2>
            <p className="text-xs text-gray-400">Last run snapshot + health status</p>
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
          {/* Health Banner */}
          {health && (
            <div className={`border rounded-lg p-3 ${getHealthBannerStyle(health.level)}`}>
              <div className="flex items-center gap-2">
                {health.level === "error" ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
                <span className="font-medium">
                  {health.level === "error" ? "Ingest Error" : "Ingest Warning"}
                </span>
              </div>
              <p className="text-sm mt-1">{health.message}</p>
              <p className="text-xs mt-1 opacity-75">
                Provider: {health.provider} | Status: {health.status} | {formatTime(health.ts)}
              </p>
            </div>
          )}

          {/* Loading / Error */}
          {loading && (
            <div className="text-gray-400 text-sm py-4 text-center">Loading snapshot...</div>
          )}
          {error && (
            <div className="text-red-400 text-sm py-4 text-center bg-red-500/10 rounded-lg">
              Error: {error}
            </div>
          )}

          {/* No snapshot */}
          {!loading && !error && !snapshot && (
            <div className="text-gray-400 text-sm py-4 text-center">
              No snapshot available yet. Run news-watchdog first.
            </div>
          )}

          {/* Snapshot Data */}
          {!loading && !error && snapshot && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-400">
                    {snapshot.primary?.fetchedCount || 0}
                  </div>
                  <div className="text-xs text-gray-400">
                    Primary ({snapshot.primary?.provider})
                  </div>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-400">
                    {snapshot.keptCount || 0}
                  </div>
                  <div className="text-xs text-gray-400">Kept</div>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <div className="text-2xl font-bold text-yellow-400">
                    {snapshot.droppedCount || 0}
                  </div>
                  <div className="text-xs text-gray-400">Dropped</div>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <div className={`text-2xl font-bold ${snapshot.fallback?.used ? "text-orange-400" : "text-gray-500"}`}>
                    {snapshot.fallback?.used ? "YES" : "NO"}
                  </div>
                  <div className="text-xs text-gray-400">
                    Fallback ({snapshot.fallback?.provider})
                  </div>
                </div>
              </div>

              {/* Fallback details if used */}
              {snapshot.fallback?.used && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-sm text-orange-400">
                  NewsAPI fallback was triggered. Fetched {snapshot.fallback.fetchedCount} items.
                  {snapshot.fallback.error && ` Error: ${snapshot.fallback.error}`}
                </div>
              )}

              {/* Timestamp */}
              <div className="text-xs text-gray-500">
                Snapshot from: {formatTime(snapshot.ts)}
              </div>

              {/* Search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search headlines, sources, providers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={fetchSnapshot}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                >
                  Refresh
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-96 overflow-auto">
                {filteredItems.length === 0 ? (
                  <div className="text-gray-400 text-sm py-4 text-center">
                    No items match your search
                  </div>
                ) : (
                  filteredItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-white font-medium flex-1">{item.headline}</span>
                        {item.macroMatch && (
                          <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded border border-purple-500/50">
                            Tier-0
                          </span>
                        )}
                        {item.kept && (
                          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded border border-green-500/50">
                            Kept
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                        <span className="px-2 py-0.5 bg-gray-800 rounded">
                          {formatTime(item.timestamp)}
                        </span>
                        <span className={`px-2 py-0.5 rounded ${
                          item.provider === "finnhub"
                            ? "bg-blue-500/20 text-blue-400"
                            : item.provider === "newsapi"
                            ? "bg-orange-500/20 text-orange-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}>
                          {item.provider}
                        </span>
                        {item.source && (
                          <span className="px-2 py-0.5 bg-gray-800 rounded">
                            {item.source}
                          </span>
                        )}
                        {item.importanceScore != null && (
                          <span className={`px-2 py-0.5 rounded ${
                            item.importanceScore >= 50
                              ? "bg-green-500/20 text-green-400"
                              : item.importanceScore >= 30
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}>
                            Score: {item.importanceScore}
                          </span>
                        )}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
                          >
                            Link
                          </a>
                        )}
                      </div>
                      {item.error && (
                        <div className="text-xs text-red-400 mt-2">
                          Error: {item.error}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Item count */}
              <div className="text-xs text-gray-500 pt-2">
                Showing {filteredItems.length} of {snapshot.items?.length || 0} items
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default RawFeedPanel;
