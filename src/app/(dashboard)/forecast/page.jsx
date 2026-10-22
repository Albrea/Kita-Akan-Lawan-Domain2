"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

export default function ForecastPage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const generateForecast = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/forecast", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate forecast");
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">AI Forecast</h1>
          <p className="page-sub">
            Intelligent restocking recommendations powered by Gemini
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={generateForecast}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {loading ? "Analyzing Data..." : "Generate AI Forecast"}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "var(--red-bg)",
            color: "var(--red-fg)",
            padding: "14px",
            borderRadius: "var(--r)",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      {!analysis && !loading && (
        <div
          className="card"
          style={{ padding: "60px 20px", textAlign: "center" }}
        >
          <Sparkles
            size={40}
            color="var(--primary)"
            style={{ margin: "0 auto 12px" }}
          />
          <h3 style={{ fontSize: "18px", fontWeight: 600 }}>
            Ready to analyze inventory
          </h3>
          <p
            className="page-sub"
            style={{ maxWidth: "420px", margin: "6px auto 20px" }}
          >
            Click the button above to have Gemini review current stock balances,
            sales trends, and buffer thresholds in MYR.
          </p>
        </div>
      )}

      {analysis && (
        <div className="card" style={{ padding: "32px" }}>
          <div
            style={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              fontSize: "14px",
            }}
          >
            {analysis}
          </div>
        </div>
      )}
    </div>
  );
}
