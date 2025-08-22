// server/insights-ai.js
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/api/insights-ai", async (req, res) => {
  try {
    const { store, summary, question } = req.body; // summary = { byHour, byDow, byArea, window }
    if (!summary) return res.status(400).json({ error: "Missing summary" });

    const system = `You are a retail analytics assistant. Given weekly/day-of-week/hour-of-day counts of QR scans, 
provide clear, actionable insights: peak hours, busiest days, top areas, anomalies, and scheduling suggestions.
Be concise, use bullets, and include concrete times.`;

    const user = `
Store: ${store || "All"}
Window: ${summary.window || "Unspecified"}

ByHour (24h -> count):
${Object.entries(summary.byHour || {}).map(([h,c]) => `${h}: ${c}`).join(", ")}

ByDayOfWeek (Sat..Fri -> count):
${Object.entries(summary.byDow || {}).map(([d,c]) => `${d}: ${c}`).join(", ")}

ByArea (name -> count) [top ${Object.keys(summary.byArea||{}).length}]:
${Object.entries(summary.byArea || {}).map(([a,c]) => `${a}: ${c}`).join(", ")}

Question: ${question || "What are the busiest times and areas, and what staffing changes should we consider?"}
`;

    // OpenAI Responses API (recommended)
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.2
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: data.error?.message || "OpenAI error" });
    }

    const text =
      data.output?.[0]?.content?.[0]?.text // newer Responses shape
      || data.output_text                       // fallback
      || "No output.";
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

export function startInsightsServer(port = 8787) {
  app.listen(port, () => console.log(`Insights AI server on :${port}`));
}
