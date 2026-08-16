import { writable, get } from "svelte/store";
import { fetchStatus, fetchHistorySummary } from "./api.js";

export const options = writable({
  mode: "all",
  includeCd: true,
  includeTraces: true,
  includeRunners: false,
});

export const data = writable(null);
export const history = writable({ buckets: [], totals: {}, enabled: false });
export const view = writable("fail");
export const loading = writable(true);
export const error = writable("");
export const stale = writable(false);
export const filter = writable("");
export const autoRefresh = writable(true);
export const generatedAt = writable(null);
export const nextRefreshAt = writable(null);
export const rateLimit = writable(null);

let timer = null;

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function buildQuery() {
  const o = get(options);
  const p = new URLSearchParams();
  p.set("mode", o.mode);
  p.set("includeCd", o.includeCd ? "1" : "0");
  p.set("includeTraces", o.includeTraces ? "1" : "0");
  p.set("includeRunners", o.includeRunners ? "1" : "0");
  p.set("jobs", "4");
  return `?${p.toString()}`;
}

function scheduleNext() {
  clearTimer();
  if (!get(autoRefresh)) return;
  const at = get(nextRefreshAt);
  if (!at) return;
  const delay = Math.max(1000, new Date(at).getTime() - Date.now());
  timer = setTimeout(() => {
    load();
  }, delay);
}

export async function load() {
  loading.set(true);
  error.set("");
  try {
    const [status, hist] = await Promise.all([
      fetchStatus(buildQuery()),
      fetchHistorySummary(),
    ]);
    data.set(status);
    history.set(hist || { buckets: [], totals: {}, enabled: false });
    stale.set(Boolean(status.stale));
    generatedAt.set(status.generatedAt);
    nextRefreshAt.set(status.refresh?.nextRefreshAt || null);
    rateLimit.set(status.rateLimit);
    scheduleNext();
  } catch (e) {
    error.set(e.message || "Failed to load dashboard");
    // Keep the last good data on screen; just stop scheduling.
    clearTimer();
  } finally {
    loading.set(false);
  }
}

export function setOption(key, val) {
  options.update((o) => ({ ...o, [key]: val }));
  load();
}

export function setView(next) {
  view.set(next);
}

export function setAutoRefresh(next) {
  autoRefresh.set(next);
  if (next) scheduleNext();
  else clearTimer();
}

export function refreshNow() {
  load();
}
