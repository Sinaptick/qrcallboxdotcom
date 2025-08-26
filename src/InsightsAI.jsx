import React, { useMemo } from "react";

// Helpers: Sat→Fri order, hour labels
const DAY_LABELS = ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday"];
const dayIndexSatFirst = (jsDay /* 0=Sun..6=Sat */) => (jsDay + 1) % 7; // Sat->0 ... Fri->6
const hourLabel = (h) => {
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:00 ${ampm}`;
};

// Robust timestamp to Date
function toDate(ts) {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return Number.isNaN(d) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Analyze activity deterministically.
 * @param {Array} logs   - your filtered logs (already by store/week/area if you want)
 * @param {Object} opts  - optional thresholds & bucketing
 *  { startHour=6, endHour=23, minCount=1 }
 * @returns {Object} insights
 */
function analyzeActivity(logs, opts = {}) {
  const { startHour = 6, endHour = 23, minCount = 1 } = opts;

  // 3D counts: area -> dayIdx(0..6) -> hour(6..23) -> count
  const counts = new Map();
  let total = 0;

  for (const l of logs) {
    const d = toDate(l.ts);
    if (!d) continue;
    const h = d.getHours();
    if (h < startHour || h > endHour) continue;

    const jsDay = d.getDay();            // 0=Sun..6=Sat
    const dayIdx = dayIndexSatFirst(jsDay);
    const area = l.area || "Unknown";

    if (!counts.has(area)) counts.set(area, Array.from({ length: 7 }, () => ({})));
    const byDay = counts.get(area);
    byDay[dayIdx][h] = (byDay[dayIdx][h] || 0) + 1;
    total += 1;
  }

  // Flatten for maxima and summaries
  let topAny = null; // { area, dayIdx, hour, count }
  const areaTotals = []; // [{area, count}]
  const dayTotals = Array(7).fill(0);
  const hourTotals = {};

  for (const [area, byDay] of counts.entries()) {
    let aSum = 0;
    byDay.forEach((hoursObj, dayIdx) => {
      for (const [hStr, c] of Object.entries(hoursObj)) {
        const h = Number(hStr);
        aSum += c;
        dayTotals[dayIdx] += c;
        hourTotals[h] = (hourTotals[h] || 0) + c;

        if (!topAny || c > topAny.count) topAny = { area, dayIdx, hour: h, count: c };
      }
    });
    areaTotals.push({ area, count: aSum });
  }

  // Sort helpers
  areaTotals.sort((a, b) => b.count - a.count);
  const topDays = dayTotals
    .map((c, idx) => ({ dayIdx: idx, count: c }))
    .sort((a, b) => b.count - a.count);

  const topHours = Object.entries(hourTotals)
    .map(([h, c]) => ({ hour: Number(h), count: c }))
    .sort((a, b) => b.count - a.count);

  // Candidate insights (guard against empty)
  const mostActiveArea = areaTotals[0] || null;
  const busiestDay = topDays[0] || null;
  const peakHour = topHours[0] || null;

  // Calculate response metrics
  const responded = logs.filter(l => l.respondedAt).length;
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
  
  // Calculate average response time for responded calls
  let avgResponseTime = null;
  if (responded > 0) {
    const responseTimes = logs
      .filter(l => l.respondedAt && l.ts)
      .map(l => {
        const requestTime = toDate(l.ts);
        const responseTime = toDate(l.respondedAt);
        return responseTime && requestTime ? (responseTime - requestTime) / (1000 * 60) : null; // minutes
      })
      .filter(time => time !== null && time >= 0);
    
    if (responseTimes.length > 0) {
      avgResponseTime = Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
    }
  }

  return {
    total,
    counts,          // full cube if you want to drill-down
    topAny,          // single most concentrated slot
    mostActiveArea,  // overall area
    busiestDay,      // overall day (Sat->Fri index)
    peakHour,        // overall hour
    areaTotals,
    dayTotals,
    hourTotals,
    // Response metrics
    responded,
    responseRate,
    avgResponseTime,
  };
}

/**
 * Turn insights into deterministic sentences.
 * @param {Object} r     analyzeActivity result
 * @returns {string[]}   human-readable lines
 */
function generateSummary(r) {
  const out = [];
  if (!r.total) {
    out.push("No data in the selected range.");
    return out;
  }

  // Top Areas
  if (r.areaTotals.length > 0) {
    out.push(`**Top Area:** **${r.areaTotals[0].area}** (${r.areaTotals[0].count} calls)`);
    if (r.areaTotals.length > 1) {
      out.push(`&nbsp;&nbsp;&nbsp;&nbsp;Close second: **${r.areaTotals[1].area}** (${r.areaTotals[1].count} calls)`);
    }
  }

  // Busiest Days
  const sortedDays = r.dayTotals
    .map((count, idx) => ({ dayIdx: idx, count }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count);
  
  if (sortedDays.length > 0) {
    out.push(`**Busiest Day:** **${DAY_LABELS[sortedDays[0].dayIdx]}** (${sortedDays[0].count} calls)`);
    if (sortedDays.length > 1) {
      out.push(`&nbsp;&nbsp;&nbsp;&nbsp;Close second: **${DAY_LABELS[sortedDays[1].dayIdx]}** (${sortedDays[1].count} calls)`);
    }
  }

  // Peak Hours
  const sortedHours = Object.entries(r.hourTotals)
    .map(([h, c]) => ({ hour: Number(h), count: c }))
    .sort((a, b) => b.count - a.count);
  
  if (sortedHours.length > 0) {
    out.push(`**Peak Hour:** **${hourLabel(sortedHours[0].hour)}** (${sortedHours[0].count} calls)`);
    if (sortedHours.length > 1) {
      out.push(`&nbsp;&nbsp;&nbsp;&nbsp;Close second: **${hourLabel(sortedHours[1].hour)}** (${sortedHours[1].count} calls)`);
    }
  }

  // Most concentrated spike
  if (r.topAny) {
    out.push(`**Most Concentrated Spike:** **${r.topAny.area}** on **${DAY_LABELS[r.topAny.dayIdx]}** at **${hourLabel(r.topAny.hour)}** (${r.topAny.count} calls)`);
  }

  // Response metrics
  if (r.total > 0) {
    out.push(`**Response Rate:** **${r.responseRate}%** (${r.responded}/${r.total} calls responded to)`);
    if (r.avgResponseTime !== null) {
      out.push(`**Average Response Time:** **${r.avgResponseTime} minutes**`);
    }
  }

  return out;
}

export default function InsightsAI({ logs }) {
  const insights = useMemo(() => {
    // logs are already filtered by the parent component
    const analysis = analyzeActivity(logs || []);
    const summary = generateSummary(analysis);
    return summary;
  }, [logs]);

  return (
    <div className="rounded-2xl border border-themed p-4 bg-secondary space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-primary">Activity Insights</div>
        <div className="text-xs text-muted">Automated analysis of selected data</div>
      </div>

      <div className="prose prose-sm max-w-none prose-p:text-primary prose-strong:text-primary">
        {insights.map((line, i) => (
          <p key={i} className="text-primary" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        ))}
      </div>
    </div>
  );
}
