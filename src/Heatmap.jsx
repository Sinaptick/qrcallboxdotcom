import React, { useEffect, useMemo, useState, useRef } from "react";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Helper functions for insights - defined at module level
const DAY_LABELS = ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday"];
const dayIndexSatFirst = (jsDay) => (jsDay + 1) % 7;
const hourLabelForInsights = (h) => {
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:00 ${ampm}`;
};

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
  const [exporting, setExporting] = useState(false);
  const heatmapRef = useRef(null);

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

  // Analysis functions for insights
  function analyzeActivity(logs) {
    const startHour = 6, endHour = 23;
    const counts = new Map();
    let total = 0;

    for (const l of logs) {
      const d = toDate(l.ts);
      if (!d) continue;
      const h = d.getHours();
      if (h < startHour || h > endHour) continue;

      const jsDay = d.getDay();
      const dayIdx = dayIndexSatFirst(jsDay);
      const area = l.area || "Unknown";

      if (!counts.has(area)) counts.set(area, Array.from({ length: 7 }, () => ({})));
      const byDay = counts.get(area);
      byDay[dayIdx][h] = (byDay[dayIdx][h] || 0) + 1;
      total += 1;
    }

    let topAny = null;
    const areaTotals = [];
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

    areaTotals.sort((a, b) => b.count - a.count);
    const topDays = dayTotals.map((c, idx) => ({ dayIdx: idx, count: c })).sort((a, b) => b.count - a.count);
    const topHours = Object.entries(hourTotals).map(([h, c]) => ({ hour: Number(h), count: c })).sort((a, b) => b.count - a.count);

    const mostActiveArea = areaTotals[0] || null;
    const busiestDay = topDays[0] || null;
    const peakHour = topHours[0] || null;

    const responded = logs.filter(l => l.respondedAt).length;
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
    
    let avgResponseTime = null;
    if (responded > 0) {
      const responseTimes = logs
        .filter(l => l.respondedAt && l.ts)
        .map(l => {
          const requestTime = toDate(l.ts);
          const responseTime = toDate(l.respondedAt);
          return responseTime && requestTime ? (responseTime - requestTime) / (1000 * 60) : null;
        })
        .filter(time => time !== null && time >= 0);
      
      if (responseTimes.length > 0) {
        avgResponseTime = Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
      }
    }

    return {
      total, counts, topAny, mostActiveArea, busiestDay, peakHour,
      areaTotals, dayTotals, hourTotals, responded, responseRate, avgResponseTime
    };
  }

  function generateSummary(r) {
    const out = [];
    if (!r.total) {
      out.push("No data in the selected range.");
      return out;
    }

    // Top Areas
    if (r.areaTotals.length > 0) {
      out.push(`Top Area: ${r.areaTotals[0].area} (${r.areaTotals[0].count} calls)`);
      if (r.areaTotals.length > 1) {
        out.push(`        Close second: ${r.areaTotals[1].area} (${r.areaTotals[1].count} calls)`);
      }
    }

    // Busiest Days
    const sortedDays = r.dayTotals
      .map((count, idx) => ({ dayIdx: idx, count }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count);
    
    if (sortedDays.length > 0) {
      out.push(`Busiest Day: ${DAY_LABELS[sortedDays[0].dayIdx]} (${sortedDays[0].count} calls)`);
      if (sortedDays.length > 1) {
        out.push(`        Close second: ${DAY_LABELS[sortedDays[1].dayIdx]} (${sortedDays[1].count} calls)`);
      }
    }

    // Peak Hours
    const sortedHours = Object.entries(r.hourTotals)
      .map(([h, c]) => ({ hour: Number(h), count: c }))
      .sort((a, b) => b.count - a.count);
    
    if (sortedHours.length > 0) {
      out.push(`Peak Hour: ${hourLabelForInsights(sortedHours[0].hour)} (${sortedHours[0].count} calls)`);
      if (sortedHours.length > 1) {
        out.push(`        Close second: ${hourLabelForInsights(sortedHours[1].hour)} (${sortedHours[1].count} calls)`);
      }
    }

    // Most concentrated spike
    if (r.topAny) {
      out.push(`Most Concentrated Spike: ${r.topAny.area} on ${DAY_LABELS[r.topAny.dayIdx]} at ${hourLabelForInsights(r.topAny.hour)} (${r.topAny.count} calls)`);
    }

    // Response metrics
    if (r.total > 0) {
      out.push(`Response Rate: ${r.responseRate}% (${r.responded}/${r.total} calls responded to)`);
      if (r.avgResponseTime !== null) {
        out.push(`Average Response Time: ${r.avgResponseTime} minutes`);
      }
    }

    return out;
  }


  // Export to PDF
  async function exportToPDF() {
    if (!heatmapRef.current || exporting) return;
    
    setExporting(true);
    try {
      // Get the heatmap element
      const element = heatmapRef.current;
      
      // Temporarily apply PDF-specific styling (black text for better readability)
      const heatmapCells = element.querySelectorAll('.heatmap-cell');
      const totalCells = element.querySelectorAll('[style*="backgroundColor: rgb"]');
      const originalStyles = [];
      
      // Store original styles and apply black text
      heatmapCells.forEach((cell, index) => {
        originalStyles[index] = cell.style.color;
        if (cell.textContent && cell.textContent !== "—") {
          cell.style.color = '#000000';
          cell.style.fontWeight = 'bold';
        }
      });
      
      // Make total row/column text black too
      totalCells.forEach(cell => {
        if (cell.style.backgroundColor && cell.style.backgroundColor.includes('rgb') && cell.textContent) {
          const originalColor = cell.style.color;
          cell.style.color = '#000000';
          cell.style.fontWeight = 'bold';
          originalStyles.push({ element: cell, color: originalColor, fontWeight: cell.style.fontWeight });
        }
      });
      
      // Capture the heatmap as canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: function(clonedDoc) {
          // Ensure all text is black in the clone
          const clonedCells = clonedDoc.querySelectorAll('.heatmap-cell');
          clonedCells.forEach(cell => {
            if (cell.textContent && cell.textContent !== "—") {
              cell.style.color = '#000000';
              cell.style.fontWeight = 'bold';
            }
          });
          
          const clonedTotalCells = clonedDoc.querySelectorAll('[style*="backgroundColor: rgb"]');
          clonedTotalCells.forEach(cell => {
            if (cell.style.backgroundColor && cell.style.backgroundColor.includes('rgb') && cell.textContent) {
              cell.style.color = '#000000';
              cell.style.fontWeight = 'bold';
            }
          });
        }
      });
      
      // Restore original styles
      heatmapCells.forEach((cell, index) => {
        cell.style.color = originalStyles[index];
        cell.style.fontWeight = 'medium';
      });
      
      // Restore total cell styles
      const totalStylesStart = heatmapCells.length;
      totalCells.forEach((cell, index) => {
        if (originalStyles[totalStylesStart + index]) {
          cell.style.color = originalStyles[totalStylesStart + index].color;
          cell.style.fontWeight = originalStyles[totalStylesStart + index].fontWeight;
        }
      });
      
      // Create PDF - A4 landscape for optimal heatmap display
      const pdf = new jsPDF('landscape', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const printMargin = 60;
      
      // Add header information
      pdf.setFontSize(16);
      pdf.text('QRCallBox Report', printMargin, printMargin);
      
      let yPos = printMargin + 18;
      
      // Add stores
      if (selectedStores.length > 0) {
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        const labelWidth = pdf.getTextWidth('Stores: ');
        pdf.text('Stores: ', printMargin, yPos);
        pdf.setFont('helvetica', 'normal');
        const storeText = selectedStores.join(' - ');
        pdf.text(storeText, printMargin + labelWidth, yPos);
        yPos += 12;
      }
      
      // Add week numbers if selected
      if (selectedWeek.length > 0) {
        const weekNumbers = selectedWeek.map(weekLabel => {
          const match = weekLabel.match(/Week (\d+)/);
          return match ? match[1] : null;
        }).filter(Boolean);
        
        if (weekNumbers.length > 0) {
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'bold');
          const labelWidth = pdf.getTextWidth('Weeks: ');
          pdf.text('Weeks: ', printMargin, yPos);
          pdf.setFont('helvetica', 'normal');
          const weekText = weekNumbers.join(', ');
          pdf.text(weekText, printMargin + labelWidth, yPos);
          yPos += 12;
        }
      }
      
      // Add areas if selected
      if (selectedAreas.length > 0) {
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        const labelWidth = pdf.getTextWidth('Areas: ');
        pdf.text('Areas: ', printMargin, yPos);
        pdf.setFont('helvetica', 'normal');
        const areaText = selectedAreas.join(', ');
        pdf.text(areaText, printMargin + labelWidth, yPos);
        yPos += 12;
      }
      
      yPos += 12;
      
      // Generate and add AI insights
      const analysis = analyzeActivity(filtered);
      const insights = generateSummary(analysis);
      
      if (insights.length > 0) {
        pdf.setFontSize(12);
        pdf.text('Activity Insights', printMargin, yPos);
        yPos += 16;
        
        pdf.setFontSize(8);
        insights.forEach(insight => {
          const maxWidth = pageWidth - 80;
          const lines = pdf.splitTextToSize(insight, maxWidth);
          lines.forEach(line => {
            pdf.text(line, printMargin, yPos);
            yPos += 12;
          });
        });
        yPos += 8;
      }
      
      // Add top responder stats
      const responderStats = {};
      filtered.forEach(log => {
        const name = log.responderName;
        if (!name || !log.responseTimeSeconds) return;
        
        if (!responderStats[name]) {
          responderStats[name] = {
            name,
            totalResponses: 0,
            totalResponseTime: 0,
            fastestResponse: Infinity,
            slowestResponse: 0
          };
        }
        
        const responseTimeSeconds = log.responseTimeSeconds;
        responderStats[name].totalResponses++;
        responderStats[name].totalResponseTime += responseTimeSeconds;
        responderStats[name].fastestResponse = Math.min(responderStats[name].fastestResponse, responseTimeSeconds);
        responderStats[name].slowestResponse = Math.max(responderStats[name].slowestResponse, responseTimeSeconds);
      });
      
      const topResponder = Object.values(responderStats)
        .map(responder => ({
          ...responder,
          avgResponseTime: Math.round(responder.totalResponseTime / responder.totalResponses / 60),
          fastestResponseMin: Math.round(responder.fastestResponse / 60),
          slowestResponseMin: Math.round(responder.slowestResponse / 60)
        }))
        .sort((a, b) => b.totalResponses - a.totalResponses)[0];
      
      if (topResponder) {
        pdf.setFontSize(8);
        const topAssociateText = `Top Associate: ${topResponder.name} with ${topResponder.totalResponses} calls, ${topResponder.avgResponseTime}m avg response time!`;
        pdf.text(topAssociateText, printMargin, yPos);
        yPos += 16;
      }
      
      // Add the captured heatmap image
      const imgData = canvas.toDataURL('image/png');
      const availableWidth = pageWidth - (printMargin * 2);
      const availableHeight = pageHeight - yPos - 60;
      
      // Calculate dimensions to fit the available space while maintaining aspect ratio
      const imgAspectRatio = canvas.width / canvas.height;
      let imgWidth = availableWidth;
      let imgHeight = imgWidth / imgAspectRatio;
      
      // If height is too large, scale down
      if (imgHeight > availableHeight) {
        imgHeight = availableHeight;
        imgWidth = imgHeight * imgAspectRatio;
      }
      
      // Center the image horizontally
      const imgX = (pageWidth - imgWidth) / 2;
      
      pdf.addImage(imgData, 'PNG', imgX, yPos, imgWidth, imgHeight);
      
      yPos += imgHeight + 20;
      
      // Add generation date
      pdf.setFontSize(6);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, printMargin, yPos);
      
      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const storeStr = selectedStores.length > 0 ? `_${selectedStores.join('-')}` : '';
      const filename = `heatmap${storeStr}_${timestamp}.pdf`;
      
      // Save the PDF
      pdf.save(filename);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted">Loading heatmap…</div>;
  }

  return (
    <div className="w-full">
      {/* Export buttons */}
      <div className="flex justify-end gap-3 mb-4">
        
        <button
          onClick={exportToPDF}
          disabled={exporting || filtered.length === 0}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-secondary disabled:text-muted disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-medium"
        >
          {exporting ? (
            <>
              <span className="animate-spin">⏳</span>
              Exporting...
            </>
          ) : (
            <>
              📄 Export Heatmap
            </>
          )}
        </button>
      </div>
      
      <div className="w-full overflow-x-auto">
      <div ref={heatmapRef} className="inline-block min-w-full p-8">
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
              <div className="text-xs text-primary font-medium py-2 pr-2">{fmtHour(h)}</div>

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
                    className="m-1 rounded-xl h-8 flex items-center justify-center text-[11px] font-medium heatmap-cell"
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
    </div>
  );
}