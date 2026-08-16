// Thin client for the existing Node server API. Nothing Svelte-specific.

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore non-JSON bodies
    }
    throw new Error(message);
  }
  return res.json();
}

export function fetchStatus(params = "") {
  return getJson(`/api/status${params}`);
}

export function fetchHistorySummary() {
  return getJson("/api/history/summary");
}

export function fetchHealth() {
  return getJson("/api/health");
}
