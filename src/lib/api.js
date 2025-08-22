// src/lib/api.js
const API_BASE = import.meta.env.DEV
  ? "https://qrwebaccdb.web.app"     // dev -> hit Firebase Hosting
  : "";                               // prod -> same origin

export async function mint(store, area) {
  const res = await fetch(`${API_BASE}/api/mint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "fHXA2Aw0bpVXQ5AAIdewrkDj20llAmBqxPmK6pu",
    },
    body: JSON.stringify({ store, area }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error(data.error || "Mint failed");
  return data; // { token }
}
