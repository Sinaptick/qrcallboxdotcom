// src/lib/api.js
// Use the hosting rewrite URL
const MINT_URL = "/api/mint";
const API_KEY = import.meta.env.VITE_API_KEY;

// Input sanitization
function sanitizeInput(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLength).replace(/[<>\"'&]/g, '');
}

export async function mint(store, area) {
  if (!API_KEY) {
    throw new Error("API key not configured");
  }

  // Sanitize inputs
  const sanitizedStore = sanitizeInput(String(store), 10);
  const sanitizedArea = sanitizeInput(String(area), 50);

  // Validate inputs
  if (!/^\d{3,6}$/.test(sanitizedStore)) {
    throw new Error("Store number must be 3-6 digits");
  }
  
  if (!/^[a-zA-Z0-9\s._-]{1,50}$/.test(sanitizedArea)) {
    throw new Error("Invalid area name");
  }

  const res = await fetch(MINT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ store: sanitizedStore, area: sanitizedArea }),
  });
  
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error(data.error || "Mint failed");
  return data; // { token }
}
