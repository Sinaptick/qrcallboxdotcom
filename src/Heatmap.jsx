import React, { useEffect, useMemo, useState } from "react";
import { getFirestore, collection, getDocs } from "firebase/firestore";

/**
 * Heatmap of scans by hour (rows) and day (columns)
 * Columns: Saturday → Friday
 * Rows: 6:00 AM (top) → 11:00 PM (bottom)
 * Rightmost column: per-row Total
 *
 * Props:
 * - selectedStores: string[]
 * - selectedWeek: string[]   (labels like "Week 5 (...)" — optional)
 * - weeks: string[]          (not used, kept for compatibility)
 * - selectedAreas: string[]
 */
export default function Heatmap({
  // db,  // <-- intentionally NOT used; we fetch our own Firestore instance to avoid mismatch
  selectedStores = [],
  selectedWeek = [],
  weeks = [],
  selectedAreas = [],
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // fixed axis
  const dayLabels = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]; // Sat → Fri
  const hours = useMemo(() => {
    const out = [];
    for (let h = 6; h <= 23; h++) out.push(h); // 6 → 23
    return out;
  }, []);

  // SAME week0 as App.jsx (JS Date: month is 0-indexed; 1 = February)
  const week0 = useMemo(() => new Date(2025, 1, 1), []);

  // tolerant timestamp → Date
  function toDate(ts) {
    try {
      if (!ts) return null;
      if (typeof ts.toDate === "function") return ts.toDate();
      if (ts.seconds != null) return new Date(ts.seconds * 1000);
      const d = new Date(ts);
      return isNaN(d) ? null : d;
    } catch {
      return null;
    }
  }

  // build week label exactly like App.jsx
  function weekLabelForDate(d) {
    const diffDays = Math.floor((d - week0) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return null;
    const weekNum = Math.floor(diffDays / 7) + 1;
    const ws = new Date(week0.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
    const we = new Date(ws.getTime() + 6 * 24 * 60 * 60 * 1000);
    return `Week ${weekNum} (${ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${we.toLocaleDateString(undefined, { month: "short", day: "numeric" })})`;
  }

  // fetch logs once; use our own Firestore instance to avoid “Expected first argument…” errors
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const dbLocal = getFirestore(); // default app’s Firestore
        const snap = await getDocs(collection(dbLocal, "logs"));
        const arr = snap.docs.map((d) => d.data());
        if (mounted) setLogs(arr);
      } catch (err) {
        console.error("[Heatmap] Firestore fetch error:", err);
        if (mounted) setLogs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // helper normalizers to avoid case/space mismatches
  const normStore = (v) => String(v ?? "").trim();
  const normArea = (v) => String(v ?? "").trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!logs?.length) return [];

    return logs.filter((l) => {
      // store filter (if any selected)
      if (selectedStores && selectedStores.length > 0) {
        const storeSet = new Set(selectedStores.map(String));
        if (!storeSet.has(String(l.store))) return false;
      }

      // area filter (if any selected)
      if (selectedAreas && selectedAreas.length > 0) {
        const areaSet = new Set(selectedAreas);
        if (!areaSet.has(l.area)) return false;
      }

      // week filter (if any selected)
      if (selectedWeek && selectedWeek.length > 0) {
        const weekSet = new Set(selectedWeek);
        const d = toDate(l.ts);
        if (!d) return false;
        const label = weekLabelForDate(d);
        if (!label || !weekSet.has(label)) return false;
      }

      return true;
    });
  }, [logs, selectedStores, selectedAreas, selectedWeek]);

  // aggregate into a 2D matrix [row(hourIdx)][col(dayIdx)]
  const matrix = useMemo(() => {
    const rows = hours.length;
    const cols = dayLabels.length;
    const init = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ total: 0, areas: new Map() }))
    );

    filtered.forEach((l) => {
      const d = toDate(l.ts);
      if (!d) return;

      // JS getDay(): 0=Sun..6=Sat → we want 0=Sat..6=Fri
      const jsDay = d.getDay();
      const dayIdx = (jsDay + 1) % 7; // Sun->1, Mon->2, ..., Fri->6, Sat->0

      const hour = d.getHours(); // 0..23
      if (hour < 6 || hour > 23) return; // outside grid
      const row = hour - 6; // 6->0, 23->17

      const cell = init[row][dayIdx];
      cell.total += 1;
      const a = normArea(l.area || "Unknown");
      cell.areas.set(a, (cell.areas.get(a) || 0) + 1);
    });

    return init;
  }, [filtered, hours, dayLabels]);

  const rowTotals = useMemo(
    () => matrix.map((row) => row.reduce((sum, c) => sum + c.total, 0)),
    [matrix]
  );
  
  const columnTotals = useMemo(() => {
    const totals = new Array(dayLabels.length).fill(0);
    matrix.forEach(row => {
      row.forEach((cell, colIdx) => {
        totals[colIdx] += cell.total;
      });
    });
    return totals;
  }, [matrix, dayLabels.length]);
  const globalMax = useMemo(
    () => Math.max(1, ...matrix.flat().map((c) => c.total)),
    [matrix]
  );

  // dynamic blue with alpha by strength
  function cellBg(total) {
    const alpha = total === 0 ? 0 : Math.max(0.08, Math.min(1, total / globalMax));
    // Tailwind blue-500 rgb(59,130,246)
    return `rgba(59,130,246,${alpha})`;
  }

  // Color functions for totals
  const maxRowTotal = Math.max(1, ...rowTotals);
  const maxColumnTotal = Math.max(1, ...columnTotals);
  const grandTotal = rowTotals.reduce((sum, total) => sum + total, 0);

  function rowTotalBg(total) {
    const alpha = total === 0 ? 0.1 : Math.max(0.2, Math.min(1, total / maxRowTotal));
    return `rgba(59,130,246,${alpha})`;
  }

  function columnTotalBg(total) {
    const alpha = total === 0 ? 0.1 : Math.max(0.2, Math.min(1, total / maxColumnTotal));
    return `rgba(59,130,246,${alpha})`;
  }

  function grandTotalBg(total) {
    const maxTotal = Math.max(maxRowTotal, maxColumnTotal);
    const alpha = total === 0 ? 0.1 : Math.max(0.3, Math.min(1, total / (maxTotal * 3))); // Scale for grand total
    return `rgba(59,130,246,${alpha})`;
  }

  // format hour like "6:00 AM"
  function fmtHour(h) {
    const ampm = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    return `${hr}:00 ${ampm}`;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted">Loading heatmap…</div>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Header row */}
        <div className="grid gap-2" style={{ gridTemplateColumns: `120px repeat(7, 1fr) 20px 90px` }}>
          <div />{/* top-left corner empty */}
          {dayLabels.map((d) => (
            <div key={d} className="text-sm font-medium text-primary text-center py-2">{d}</div>
          ))}
          <div />{/* gap before total */}
          <div className="text-sm font-medium text-primary text-center py-2">Total</div>
        </div>

        {/* Body rows */}
        <div className="divide-y divide-themed">
          {hours.map((h, rIdx) => (
            <div
              key={h}
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: `120px repeat(7, 1fr) 20px 90px` }}
            >
              {/* Time label */}
              <div className="text-xs text-secondary py-2 pr-2">{fmtHour(h)}</div>

              {/* 7 day cells */}
              {matrix[rIdx].map((cell, cIdx) => {
                // tooltip: top 5 areas
                const parts =
                  Array.from(cell.areas.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([area, n]) => `${area}: ${n}`)
                    .join("\n") || "No scans";

                return (
                  <div
                    key={cIdx}
                    title={parts}
                    className="m-1 rounded-xl h-8 flex items-center justify-center text-[11px] font-medium"
                    style={{
                      backgroundColor: cellBg(cell.total),
                      color: cell.total ? "white" : "rgba(0,0,0,0.35)",
                      border: cell.total ? "1px solid rgba(59,130,246,0.25)" : "1px dashed rgba(0,0,0,0.08)",
                    }}
                  >
                    {cell.total || "—"}
                  </div>
                );
              })}

              <div />{/* gap before total */}
              {/* Row total */}
              <div 
                className="text-sm font-bold text-white rounded-lg text-center py-2 shadow-sm h-8 flex items-center justify-center"
                style={{ backgroundColor: rowTotalBg(rowTotals[rIdx] || 0) }}
              >
                {rowTotals[rIdx] || ""}
              </div>
            </div>
          ))}
        </div>
        
        {/* Gap before footer totals */}
        <div className="mt-4">
          {/* Footer row with column totals */}
          <div className="grid gap-2" style={{ gridTemplateColumns: `120px repeat(7, 1fr) 20px 90px` }}>
            <div className="text-sm font-medium text-primary text-center py-2">Total</div>
            {columnTotals.map((total, idx) => (
              <div 
                key={idx} 
                className="text-sm font-bold text-white rounded-lg text-center py-2 shadow-sm"
                style={{ backgroundColor: columnTotalBg(total || 0) }}
              >
                {total || ""}
              </div>
            ))}
            <div />{/* gap before grand total */}
            <div 
              className="text-sm font-bold text-white rounded-lg text-center py-2 shadow-sm"
              style={{ backgroundColor: grandTotalBg(grandTotal) }}
            >
              {grandTotal || ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}