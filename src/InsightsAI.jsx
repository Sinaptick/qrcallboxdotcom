import React, { useMemo, useState } from "react";

export default function InsightsAI({ logs, selectedStores, selectedAreas, selectedWeek }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Build lightweight aggregates from logs already filtered by your UI (or filter here)
  const { summary, storeLabel } = useMemo(() => {
    // Option A: assume logs are already filtered upstream by store/week/area.
    const byHour = {};   // "06:00".."23:00"
    const byDow = {};    // "Sat".."Fri"
    const byArea = {};   // area -> count
    const days = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];

    // init hour buckets 06:00..23:00
    for (let h = 6; h <= 23; h++) {
      const label = `${String(h).padStart(2,"0")}:00`;
      byHour[label] = 0;
    }
    days.forEach(d => (byDow[d] = 0));

    (logs || []).forEach((log) => {
      // guard
      const ts = log?.ts?.toDate ? log.ts.toDate() :
                 log?.ts?.seconds ? new Date(log.ts.seconds * 1000) :
                 (typeof log?.ts === "string" || typeof log?.ts === "number") ? new Date(log.ts) : null;
      if (!ts || isNaN(ts)) return;

      const h = ts.getHours();
      if (h >= 6 && h <= 23) byHour[`${String(h).padStart(2,"0")}:00`] = (byHour[`${String(h).padStart(2,"0")}:00`] || 0) + 1;

      // day index with Saturday as 0 to match your layout
      const dow = (ts.getDay() + 6) % 7; // JS: 0=Sun. Make 0=Sat: ((Sun=0)+6)%7 -> 6, (Sat=6)+6=12%7=5… easier: map manually:
      // Simpler explicit map:
      const js = ts.getDay(); // 0 Sun .. 6 Sat
      const map = { 6:"Sat", 0:"Sun", 1:"Mon", 2:"Tue", 3:"Wed", 4:"Thu", 5:"Fri" };
      const dlabel = map[js] || "Sun";
      byDow[dlabel] = (byDow[dlabel] || 0) + 1;

      if (log?.area) byArea[log.area] = (byArea[log.area] || 0) + 1;
    });

    // Reduce to top N to keep tokens small
    const topN = 20;
    const topAreas = Object.entries(byArea)
      .sort((a,b) => b[1]-a[1])
      .slice(0, topN)
      .reduce((acc,[k,v]) => (acc[k]=v, acc), {});

    const summary = {
      window: selectedWeek?.length ? selectedWeek.join(", ") : "All weeks",
      byHour,
      byDow,
      byArea: topAreas,
    };
    const storeLabel = selectedStores?.length ? selectedStores.join(", ") : "All Stores";
    return { summary, storeLabel };
  }, [logs, selectedStores, selectedAreas, selectedWeek]);

  async function ask() {
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      const r = await fetch("/api/insights-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store: storeLabel,
          summary,
          question: question?.trim() || undefined
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Request failed");
      setAnswer(data.text || "");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4 bg-white space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">Ask Insights AI</div>
        <div className="text-xs text-gray-500">Sends only anonymized counts (no raw logs)</div>
      </div>

      <textarea
        className="w-full rounded-xl border px-3 py-2 text-sm"
        rows={3}
        placeholder="e.g., Where are the bottlenecks this week? What hours are consistently busiest?"
        value={question}
        onChange={e=>setQuestion(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={ask}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Analyzing…" : "Analyze Selected Data"}
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {answer && (
        <div className="prose prose-sm max-w-none">
          {answer.split("\n").map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
    </div>
  );
}
