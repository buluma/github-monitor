// Coverage for the "frontend at scale" work: with 600+ repos some lanes hold
// hundreds of rows, so render() now paints the first 40 rows synchronously and
// streams the rest in batches, with a .rendering-note sentinel and a generation
// token that cancels superseded renders (filter keystroke, refresh, view
// switch). Rows also get content-visibility: auto so the browser skips
// offscreen layout/paint, and the filter input is debounced.
//
// This drives the real page through Playwright with every network call mocked —
// no server, no GitHub, fully deterministic. Progressivity is verified with a
// MutationObserver probe injected before app.js runs: it records the row count
// and .rendering-note presence on every DOM mutation, so the assertions hold no
// matter how fast or slow the machine renders the lane.
//
// Covers:
//   1. A 400-row lane streams in progressively (partial counts + note seen)
//      and always converges to all rows with no stray note left behind.
//   2. content-visibility: auto is actually applied to rows.
//   3. The debounced filter narrows a 400-row lane without console errors.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

// These tests drive a real Chromium via Playwright. CI installs the browser
// (see .github/workflows/ci.yml); when it is missing locally, skip with a clear
// hint instead of failing with Playwright's raw "Executable doesn't exist" error.
let browserMissing = false;
try {
  browserMissing = !existsSync(chromium.executablePath());
} catch {
  browserMissing = true;
}
const skip = browserMissing
  ? "Playwright Chromium not installed — run: npx playwright install chromium"
  : false;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(path.join(root, "public/index.html"), "utf8");
const appJs = readFileSync(path.join(root, "public/app.js"), "utf8");
const stylesCss = readFileSync(path.join(root, "public/styles.css"), "utf8");
const themeJs = readFileSync(path.join(root, "public/theme.js"), "utf8");

const REPOS = 20;
const RUNS_PER_REPO = 20; // 400 workflow-run rows total
const TOTAL_ROWS = REPOS * RUNS_PER_REPO;

function workflowRun(repo, runNumber) {
  return {
    kind: "workflowRun",
    repo,
    workflow: "CI",
    runNumber,
    title: `CI run ${runNumber} on ${repo}`,
    branch: "main",
    status: "completed",
    conclusion: "failure",
    createdAt: "2026-06-04T11:00:00Z",
    url: `https://github.com/${repo}/actions/runs/${runNumber}`
  };
}

const failedRuns = [];
for (let r = 0; r < REPOS; r++) {
  const repo = `acme-${String(r).padStart(2, "0")}`;
  for (let n = 1; n <= RUNS_PER_REPO; n++) failedRuns.push(workflowRun(repo, n));
}

const statusBody = {
  account: "test-account",
  accounts: ["test-account"],
  generatedAt: "2026-06-04T12:00:00Z",
  warnings: [],
  options: {},
  autoMerge: { enabled: false, items: [] },
  summary: {
    repos: REPOS,
    passingPrs: 0, noCiPrs: 0, failingPrs: TOTAL_ROWS, conflictPrs: 0, runningPrs: 0,
    runningCd: 0, finishedCd: 0, failedCd: 0, skippedCd: 0,
    runningDeployments: 0, busyRunners: 0,
    flaggedJourneys: 0, activeJourneys: 0, shippedJourneys: 0, tracingUnknown: 0
  },
  pullRequests: { pass: [], noCi: [], fail: [], running: [], conflicts: [] },
  actions: { failed: failedRuns, running: [] },
  cd: { running: [], finished: [], failed: [] },
  deployments: { running: [] },
  runners: { busy: [] },
  traces: { flagged: [], active: [], completed: [], unknown: [] },
  refresh: { quota: { status: "ok" }, nextRefreshAt: null, reason: "" },
  rateLimit: { core: { remaining: 5000, limit: 5000 } }
};

async function openDashboard() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Chromium logs "An unknown error occurred when fetching the script." in
    // EVERY mocked test here: it is a Playwright route.fulfill artifact of
    // serving app.js through an intercepted response (the existing suite has
    // it too, it just never asserts on console errors). The app demonstrably
    // runs — rows render and the API calls fire — so this exact known-spurious
    // message is ignored; any other console error still fails the test.
    if (msg.text().includes("An unknown error occurred when fetching the script")) return;
    errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  // Probe that records every DOM mutation's row count + rendering-note state.
  // Runs before app.js, so mid-stream states are captured no matter the timing.
  // Observes `document` itself: documentElement is null during the initial
  // about:blank navigation and would throw in observe().
  await page.addInitScript(() => {
    window.__renderLog = [];
    new MutationObserver(() => {
      window.__renderLog.push({
        rows: document.querySelectorAll(".row").length,
        notes: document.querySelectorAll(".rendering-note").length
      });
    }).observe(document, { childList: true, subtree: true });
  });

  await page.addInitScript(() => {
    localStorage.setItem("pr-deck:v1", JSON.stringify({ view: "fail", traceFilter: "flagged" }));
    localStorage.removeItem("pr-deck:dismissed:v1");
    localStorage.removeItem("pr-deck:traces:v1");
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/" || p === "/index.html") return route.fulfill({ contentType: "text/html", body: indexHtml });
    if (p === "/app.js") return route.fulfill({ contentType: "text/javascript", body: appJs });
    if (p === "/styles.css") return route.fulfill({ contentType: "text/css", body: stylesCss });
    if (p === "/theme.js") return route.fulfill({ contentType: "text/javascript", body: themeJs });
    if (p === "/api/status") return route.fulfill({ contentType: "application/json", body: JSON.stringify(statusBody) });
    if (p === "/favicon.svg") return route.fulfill({ contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" });
    // Stub every other API call (auto-merge config, etc.) with empty JSON.
    if (p.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: "{}" });
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("http://localhost/");
  await page.waitForSelector("#content");
  return { browser, page, errors };
}

const waitForRows = (page, n) =>
  page.waitForFunction(
    (expected) => document.querySelectorAll(".row").length === expected,
    n,
    { timeout: 5000 },
  );

test("A 400-row lane streams in progressively and always converges", { skip }, async () => {
  const { browser, page, errors } = await openDashboard();
  try {
    await waitForRows(page, TOTAL_ROWS);

    // The MutationObserver probe recorded every intermediate state: we must
    // have seen partial counts (chunked inserts, not one giant innerHTML) and
    // the rendering note while rows were still streaming.
    const log = await page.evaluate(() => window.__renderLog);
    assert.ok(
      log.some((entry) => entry.rows > 0 && entry.rows < TOTAL_ROWS),
      "rows should stream in increments, not all at once",
    );
    assert.ok(
      log.some((entry) => entry.notes > 0),
      "rendering note should appear while the lane is still filling in",
    );

    // Converged: all rows present, note gone, no stray note left in #content.
    assert.equal(
      await page.evaluate(() => document.querySelectorAll(".row").length),
      TOTAL_ROWS,
    );
    assert.equal(await page.locator(".rendering-note").count(), 0);
    assert.equal(
      await page.locator("#content > .rendering-note").count(),
      0,
      "no stray rendering-note left inside #content",
    );
    assert.deepEqual(errors, [], "no console/page errors during progressive render");
  } finally {
    await browser.close();
  }
});

test("Rows opt into content-visibility so offscreen layout is skipped", { skip }, async () => {
  const { browser, page, errors } = await openDashboard();
  try {
    await waitForRows(page, TOTAL_ROWS);
    const cv = await page.evaluate(
      () => getComputedStyle(document.querySelector(".row")).contentVisibility,
    );
    assert.equal(cv, "auto", "rows carry content-visibility: auto");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("The debounced filter narrows a 400-row lane cleanly", { skip }, async () => {
  const { browser, page, errors } = await openDashboard();
  try {
    await waitForRows(page, TOTAL_ROWS);

    // Type a repo prefix: the debounce coalesces keystrokes into one render.
    await page.fill("#filter", "acme-07");
    await waitForRows(page, RUNS_PER_REPO);
    assert.equal(
      await page.evaluate(() => document.querySelectorAll(".row").length),
      RUNS_PER_REPO,
      "filter keeps only acme-07 rows",
    );
    assert.equal(await page.locator(".rendering-note").count(), 0, "no note for a tiny lane");
    assert.deepEqual(errors, []);

    // Clearing the filter restores the full lane (new render, new generation).
    await page.click("#filterClear");
    await waitForRows(page, TOTAL_ROWS);
    assert.equal(
      await page.evaluate(() => document.querySelectorAll(".row").length),
      TOTAL_ROWS,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
