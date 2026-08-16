// Map API payloads to flat row lists + display summaries for the lanes.

export function laneRows(view, data) {
  if (!data) return [];
  const pr = data.pullRequests || {};
  const actions = data.actions || {};
  const cd = data.cd || {};
  const traces = data.traces || {};
  const deployments = data.deployments || {};
  const runners = data.runners || {};
  switch (view) {
    case "fail":
      return [...(pr.fail || []), ...(actions.failed || [])];
    case "running":
      return [...(pr.running || []), ...(actions.running || [])];
    case "pass":
      return pr.pass || [];
    case "noCi":
      return pr.noCi || [];
    case "conflicts":
      return pr.conflicts || [];
    case "runningCd":
      return cd.running || [];
    case "finishedCd":
      return cd.finished || [];
    case "failedCd":
      return cd.failed || [];
    case "deployments":
      return deployments.running || [];
    case "runners":
      return runners.busy || [];
    case "pipelineTraces":
      return [
        ...(traces.flagged || []),
        ...(traces.active || []),
        ...(traces.unknown || []),
        ...(traces.completed || []),
      ];
    default:
      return [];
  }
}

function isPr(item) {
  if (!item) return false;
  if (item.kind === "pr") return true;
  if (item.url && item.url.includes("/pull/")) return true;
  return item.number != null && item.runNumber == null;
}

export function summarize(item) {
  if (!item) return { title: "—", subtitle: "", url: "", state: "", kind: "" };
  if (isPr(item)) {
    const subtitle = [
      item.repo,
      item.number != null ? `#${item.number}` : null,
      item.author,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      title: item.title || "PR",
      subtitle,
      url: item.url || "",
      state: item.state || (item.hasConflict ? "conflict" : "pass"),
      kind: "pr",
    };
  }
  const title =
    item.title || item.workflow || item.name || item.environment || "Workflow run";
  const subtitle = [
    item.repo || item.scope,
    item.runNumber != null ? `#${item.runNumber}` : null,
    item.branch,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    title,
    subtitle,
    url: item.url || "",
    state: item.conclusion || item.status || "running",
    kind: "run",
  };
}

// Normalize history buckets (hourly rollups) into the bar descriptors the
// History view renders.
export function historyBars(bucket) {
  const repos = Number(bucket.repos || 0);
  const passing = Number(bucket.passingPrs || 0);
  const failing = Number(bucket.failingPrs || 0);
  const running = Number(bucket.runningPrs || 0);
  const runningCd = Number(bucket.runningCd || 0);
  const finishedCd = Number(bucket.finishedCd || 0);
  const failedCd = Number(bucket.failedCd || 0);
  const busyRunners = Number(bucket.busyRunners || 0);
  const maxWork = Math.max(
    repos,
    passing + failing + running,
    runningCd + finishedCd + failedCd,
    busyRunners,
    1,
  );
  const bar = (value, color) => ({
    value,
    color,
    width: Math.max(2, Math.round((value / maxWork) * 100)),
  });
  return [
    bar(repos, "ink"),
    bar(passing, "green"),
    bar(failing, "red"),
    bar(running, "amber"),
    bar(runningCd, "blue"),
    bar(finishedCd, "green"),
    bar(failedCd, "red"),
    bar(busyRunners, "gray"),
  ];
}

export const STATE_CLASS = {
  pass: "green",
  green: "green",
  fail: "red",
  failed: "red",
  failure: "red",
  red: "red",
  running: "amber",
  in_progress: "amber",
  queued: "amber",
  amber: "amber",
  conflict: "conflict",
  noCi: "gray",
  gray: "gray",
  skipped: "gray",
  unknown: "gray",
};
