export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatRelative(value) {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "never";
  const secs = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(secs);
  const suffix = secs <= 0 ? "ago" : "from now";
  if (abs < 60) return `${abs}s ${suffix}`;
  if (abs < 3600) return `${Math.round(abs / 60)}m ${suffix}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ${suffix}`;
  return `${Math.round(abs / 86400)}d ${suffix}`;
}

export function quotaLabel(rateLimit) {
  if (!rateLimit) return "Quota: waiting";
  const tightest = rateLimit.tightest;
  if (!tightest) return "Quota: ok";
  return `Quota: ${tightest.remaining}/${tightest.limit}`;
}
