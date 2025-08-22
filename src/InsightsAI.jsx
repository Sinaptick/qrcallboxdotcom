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

  if (r.topAny) {
    out.push(
      `Most concentrated spike: **${r.topAny.area}** on **${DAY_LABELS[r.topAny.dayIdx]}** at **${hourLabel(r.topAny.hour)}** (${r.topAny.count} calls).`
    );
  }

  if (r.mostActiveArea?.count) {
    out.push(
      `Top area overall: **${r.mostActiveArea.area}** (${r.mostActiveArea.count} calls).`
    );
    
    // Check for other significant areas
    const otherSignificantAreas = r.areaTotals
      .slice(1) // Skip the top area
      .filter(area => {
        const percentage = Math.round((area.count / r.mostActiveArea.count) * 100);
        return percentage >= 30; // Show areas that are at least 30% of top area
      })
      .slice(0, 2); // Limit to top 2 other areas
    
    if (otherSignificantAreas.length > 0) {
      otherSignificantAreas.forEach(area => {
        const percentage = Math.round((area.count / r.mostActiveArea.count) * 100);
        out.push(`→ **${area.area}** also significant with **${percentage}%** as many calls (${area.count} calls).`);
      });
    }
  }

  if (r.busiestDay?.count) {
    out.push(
      `Busiest day overall: **${DAY_LABELS[r.busiestDay.dayIdx]}** (${r.busiestDay.count} calls).`
    );
    
    // Calculate top area and hour for busiest day
    const dayAreaTotals = [];
    const dayHourTotals = {};
    
    for (const [area, byDay] of r.counts.entries()) {
      const hoursObj = byDay[r.busiestDay.dayIdx] || {};
      const areaCountThisDay = Object.values(hoursObj).reduce((sum, c) => sum + c, 0);
      if (areaCountThisDay > 0) {
        dayAreaTotals.push({ area, count: areaCountThisDay });
      }
      
      for (const [hStr, c] of Object.entries(hoursObj)) {
        const h = Number(hStr);
        dayHourTotals[h] = (dayHourTotals[h] || 0) + c;
      }
    }
    
    const topDayArea = dayAreaTotals.sort((a, b) => b.count - a.count)[0];
    const topDayHour = Object.entries(dayHourTotals)
      .map(([h, c]) => ({ hour: Number(h), count: c }))
      .sort((a, b) => b.count - a.count)[0];
    
    if (topDayArea && topDayHour) {
      out.push(`→ Top area: **${topDayArea.area}** (${topDayArea.count} calls) • Top hour: **${hourLabel(topDayHour.hour)}** (${topDayHour.count} calls).`);
    }
    
    // Check for area outliers on busiest day
    if (r.counts.size > 1 && topDayArea) {
      const percentage = Math.round((topDayArea.count / r.busiestDay.count) * 100);
      if (percentage >= 50) {
        out.push(`→ **${percentage}%** of ${DAY_LABELS[r.busiestDay.dayIdx]}'s activity was in **${topDayArea.area}**.`);
      }
    }
    
    // Check for hour outliers on busiest day
    if (topDayHour && topDayHour.count >= 2) {
      const percentage = Math.round((topDayHour.count / r.busiestDay.count) * 100);
      if (percentage >= 30) {
        out.push(`→ **${percentage}%** of ${DAY_LABELS[r.busiestDay.dayIdx]}'s activity was at **${hourLabel(topDayHour.hour)}**.`);
      }
    }
  }

  if (r.peakHour?.count) {
    out.push(
      `Peak hour overall: **${hourLabel(r.peakHour.hour)}** (${r.peakHour.count} calls).`
    );
    
    // Check for hour outliers
    if (r.counts.size > 1) {
      for (const [area, byDay] of r.counts.entries()) {
        let areaCountThisHour = 0;
        byDay.forEach(hoursObj => {
          if (hoursObj[r.peakHour.hour]) {
            areaCountThisHour += hoursObj[r.peakHour.hour];
          }
        });
        const percentage = Math.round((areaCountThisHour / r.peakHour.count) * 100);
        if (percentage >= 50) {
          out.push(`→ **${percentage}%** of ${hourLabel(r.peakHour.hour)} activity was in **${area}** (${areaCountThisHour} calls).`);
        }
      }
    }
  }

  // Add response metrics
  if (r.total > 0) {
    out.push(`Response rate: **${r.responseRate}%** (${r.responded}/${r.total} calls responded to).`);
    
    if (r.avgResponseTime !== null) {
      out.push(`Average response time: **${r.avgResponseTime} minutes**.`);
    }
  }

  return out;
}

export default function InsightsAI({ logs, selectedStores, selectedAreas, selectedWeek }) {
  const insights = useMemo(() => {
    // Filter logs based on selections (same logic as heatmap)
    const filteredLogs = (logs || []).filter((log) => {
      // Filter by stores
      if (selectedStores?.length && !selectedStores.includes(String(log.store))) {
        return false;
      }
      
      // Filter by areas
      if (selectedAreas?.length && !selectedAreas.includes(log.area)) {
        return false;
      }
      
      // Filter by weeks
      if (selectedWeek?.length) {
        const week0 = new Date(2025, 1, 1);
        let ts = log.ts;
        let d = null;
        if (ts?.toDate) d = ts.toDate();
        else if (ts?.seconds) d = new Date(ts.seconds * 1000);
        else if (typeof ts === "string" || typeof ts === "number") d = new Date(ts);
        
        if (!d || isNaN(d)) return false;
        
        const diffDays = Math.floor((d - week0) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return false;
        
        const weekNum = Math.floor(diffDays / 7) + 1;
        const weekStart = new Date(week0.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        const label = `Week ${weekNum} (${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })})`;
        
        if (!selectedWeek.includes(label)) return false;
      }
      
      return true;
    });
    
    const analysis = analyzeActivity(filteredLogs);
    const summary = generateSummary(analysis);
    return summary;
  }, [logs, selectedStores, selectedAreas, selectedWeek]);

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
