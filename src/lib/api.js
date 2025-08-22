// src/lib/api.js
// Use the hosting rewrite URL
const MINT_URL = "/api/mint";

export async function mint(store, area) {
  const res = await fetch(MINT_URL, {
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
