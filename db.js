import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";

let DatabaseSync = null;
try {
  const sqliteModule = await import("node:sqlite");
  DatabaseSync = sqliteModule.DatabaseSync;
} catch {
  // node:sqlite unavailable (e.g. Node version < 22.5)
}

let dbInstance = null;
let dbInitialized = false;

export function getDbPath() {
  return (
    process.env.DB_PATH ||
    join(homedir(), ".local", "share", "github-monitor", "github-monitor.db")
  );
}

export async function initDb(overridePath = null) {
  if (dbInitialized) return dbInstance;
  if (!DatabaseSync) {
    console.warn("SQLite persistence unavailable: node:sqlite not supported in this Node environment.");
    dbInitialized = true;
    return null;
  }

  const dbPath = overridePath || getDbPath();
  try {
    const dbDir = join(dbPath, "..");
    await mkdir(dbDir, { recursive: true });

    dbInstance = new DatabaseSync(dbPath);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA synchronous = NORMAL;");

    createTables(dbInstance);
    dbInitialized = true;
    return dbInstance;
  } catch (err) {
    console.warn(`SQLite initialization failed: ${err.message}. Falling back to in-memory mode.`);
    dbInstance = null;
    dbInitialized = true;
    return null;
  }
}

function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS history_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      mode TEXT,
      owners TEXT,
      repos INTEGER,
      passing_prs INTEGER,
      no_ci_prs INTEGER,
      failing_ci INTEGER,
      running_ci INTEGER,
      pending_cd INTEGER,
      failed_cd INTEGER,
      running_deployments INTEGER,
      busy_runners INTEGER,
      include_cd INTEGER,
      include_runners INTEGER,
      quota_remaining INTEGER,
      quota_limit INTEGER,
      payload TEXT
    );

    CREATE TABLE IF NOT EXISTS etag_cache (
      key TEXT PRIMARY KEY,
      method TEXT,
      etag TEXT,
      last_modified TEXT,
      body TEXT,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS github_value_cache (
      key TEXT PRIMARY KEY,
      value TEXT,
      expires_at INTEGER,
      promise_state TEXT
    );

    CREATE TABLE IF NOT EXISTS status_payload_cache (
      query TEXT PRIMARY KEY,
      payload TEXT,
      cached_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS installation_tokens (
      owner TEXT PRIMARY KEY,
      token TEXT,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS observed_rate_buckets (
      resource TEXT,
      limit_val INTEGER,
      remaining INTEGER,
      reset_at INTEGER,
      observed_at INTEGER,
      PRIMARY KEY (resource, reset_at)
    );

    CREATE TABLE IF NOT EXISTS dependabot_cleanup_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS dependabot_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo TEXT,
      run_id INTEGER,
      pr_number INTEGER,
      state TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS auto_merge_candidates (
      repo TEXT,
      number INTEGER,
      number_label TEXT,
      title TEXT,
      url TEXT,
      deadline INTEGER,
      error TEXT,
      PRIMARY KEY (repo, number)
    );

    CREATE TABLE IF NOT EXISTS auto_merge_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS client_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    );
  `);
}

export function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Best effort
    }
    dbInstance = null;
  }
  dbInitialized = false;
}

// ----------------------------------------------------
// History Helpers
// ----------------------------------------------------
export function insertHistorySnapshotDb(snapshot) {
  if (!dbInstance) return;
  try {
    const stmt = dbInstance.prepare(`
      INSERT INTO history_snapshots (
        ts, mode, owners, repos, passing_prs, no_ci_prs, failing_ci, running_ci,
        pending_cd, failed_cd, running_deployments, busy_runners, include_cd, include_runners,
        quota_remaining, quota_limit, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      snapshot.ts || new Date().toISOString(),
      snapshot.mode || "all",
      snapshot.owners || "",
      snapshot.repos || 0,
      snapshot.passingPrs || 0,
      snapshot.noCiPrs || 0,
      snapshot.failingCi || 0,
      snapshot.runningCi || 0,
      snapshot.pendingCd || 0,
      snapshot.failedCd || 0,
      snapshot.runningDeployments || 0,
      snapshot.busyRunners || 0,
      snapshot.includeCd ? 1 : 0,
      snapshot.includeRunners ? 1 : 0,
      snapshot.quotaRemaining ?? null,
      snapshot.quotaLimit ?? null,
      JSON.stringify(snapshot.payload || snapshot)
    );
  } catch (err) {
    // Best-effort
  }
}

export function getHistorySnapshotsDb(sinceIso) {
  if (!dbInstance) return [];
  try {
    let stmt;
    if (sinceIso) {
      stmt = dbInstance.prepare(`SELECT payload FROM history_snapshots WHERE ts >= ? ORDER BY id ASC`);
      const rows = stmt.all(sinceIso);
      return rows.map((r) => JSON.parse(r.payload));
    } else {
      stmt = dbInstance.prepare(`SELECT payload FROM history_snapshots ORDER BY id ASC`);
      const rows = stmt.all();
      return rows.map((r) => JSON.parse(r.payload));
    }
  } catch (err) {
    return [];
  }
}

export async function migrateJsonlHistory(historyBasePath) {
  if (!dbInstance || !historyBasePath) return;
  try {
    const years = await readdir(historyBasePath).catch(() => []);
    for (const year of years) {
      const yearDir = join(historyBasePath, year);
      const s = await stat(yearDir).catch(() => null);
      if (!s?.isDirectory()) continue;
      const months = await readdir(yearDir).catch(() => []);
      for (const month of months) {
        const filePath = join(yearDir, month);
        if (!filePath.endsWith(".jsonl")) continue;
        const content = await readFile(filePath, "utf8").catch(() => "");
        const lines = content.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            insertHistorySnapshotDb(entry);
          } catch {
            // Ignore bad JSON lines
          }
        }
      }
    }
  } catch {
    // Best effort migration
  }
}

// ----------------------------------------------------
// Client State Helpers
// ----------------------------------------------------
export function getClientStateDb() {
  if (!dbInstance) return null;
  try {
    const stmt = dbInstance.prepare(`SELECT key, value FROM client_state`);
    const rows = stmt.all();
    if (!rows || rows.length === 0) return {};
    const state = {};
    for (const row of rows) {
      try {
        state[row.key] = JSON.parse(row.value);
      } catch {
        state[row.key] = row.value;
      }
    }
    return state;
  } catch {
    return null;
  }
}

export function updateClientStateDb(updates) {
  if (!dbInstance || !updates || typeof updates !== "object") return;
  try {
    const stmt = dbInstance.prepare(`
      INSERT INTO client_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    const now = Date.now();
    for (const [key, val] of Object.entries(updates)) {
      stmt.run(key, JSON.stringify(val), now);
    }
  } catch (err) {
    // Best-effort
  }
}

export function clearClientStateDb() {
  if (!dbInstance) return;
  try {
    dbInstance.exec(`DELETE FROM client_state`);
  } catch {
    // Best-effort
  }
}

// ----------------------------------------------------
// Server Cache Helpers
// ----------------------------------------------------
export function loadEtagCacheDb() {
  if (!dbInstance) return [];
  try {
    const stmt = dbInstance.prepare(`SELECT key, method, etag, last_modified, body, expires_at FROM etag_cache`);
    return stmt.all();
  } catch {
    return [];
  }
}

export function saveEtagCacheDb(key, method, etag, lastModified, body, expiresAt) {
  if (!dbInstance) return;
  try {
    const stmt = dbInstance.prepare(`
      INSERT INTO etag_cache (key, method, etag, last_modified, body, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        method=excluded.method, etag=excluded.etag, last_modified=excluded.last_modified,
        body=excluded.body, expires_at=excluded.expires_at
    `);
    stmt.run(key, method || "GET", etag || "", lastModified || "", typeof body === "string" ? body : JSON.stringify(body), expiresAt || 0);
  } catch {
    // Best effort
  }
}

export function loadGithubValueCacheDb() {
  if (!dbInstance) return [];
  try {
    const stmt = dbInstance.prepare(`SELECT key, value, expires_at FROM github_value_cache`);
    return stmt.all();
  } catch {
    return [];
  }
}

export function saveGithubValueCacheDb(key, value, expiresAt) {
  if (!dbInstance) return;
  try {
    const stmt = dbInstance.prepare(`
      INSERT INTO github_value_cache (key, value, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at
    `);
    stmt.run(key, JSON.stringify(value), expiresAt || 0);
  } catch {
    // Best effort
  }
}

export function loadInstallationTokensDb() {
  if (!dbInstance) return [];
  try {
    const stmt = dbInstance.prepare(`SELECT owner, token, expires_at FROM installation_tokens`);
    return stmt.all();
  } catch {
    return [];
  }
}

export function saveInstallationTokenDb(owner, token, expiresAt) {
  if (!dbInstance) return;
  try {
    const stmt = dbInstance.prepare(`
      INSERT INTO installation_tokens (owner, token, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(owner) DO UPDATE SET token=excluded.token, expires_at=excluded.expires_at
    `);
    stmt.run(owner, token, expiresAt || 0);
  } catch {
    // Best effort
  }
}

export function loadAutoMergeCandidatesDb() {
  if (!dbInstance) return [];
  try {
    const stmt = dbInstance.prepare(`SELECT repo, number, number_label, title, url, deadline, error FROM auto_merge_candidates`);
    return stmt.all();
  } catch {
    return [];
  }
}

export function saveAutoMergeCandidateDb(candidate) {
  if (!dbInstance) return;
  try {
    const stmt = dbInstance.prepare(`
      INSERT INTO auto_merge_candidates (repo, number, number_label, title, url, deadline, error)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo, number) DO UPDATE SET
        number_label=excluded.number_label, title=excluded.title, url=excluded.url,
        deadline=excluded.deadline, error=excluded.error
    `);
    stmt.run(
      candidate.repo,
      candidate.number,
      candidate.numberLabel || `#${candidate.number}`,
      candidate.title || "",
      candidate.url || "",
      candidate.deadline || 0,
      candidate.error || null
    );
  } catch {
    // Best effort
  }
}

export function deleteAutoMergeCandidateDb(repo, number) {
  if (!dbInstance) return;
  try {
    const stmt = dbInstance.prepare(`DELETE FROM auto_merge_candidates WHERE repo = ? AND number = ?`);
    stmt.run(repo, number);
  } catch {
    // Best effort
  }
}
