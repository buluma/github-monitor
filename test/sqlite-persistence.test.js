import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import {
  initDb,
  closeDb,
  insertHistorySnapshotDb,
  getHistorySnapshotsDb,
  getClientStateDb,
  updateClientStateDb,
  clearClientStateDb,
  saveEtagCacheDb,
  loadEtagCacheDb,
  saveGithubValueCacheDb,
  loadGithubValueCacheDb,
  saveInstallationTokenDb,
  loadInstallationTokensDb,
  saveAutoMergeCandidateDb,
  loadAutoMergeCandidatesDb,
  deleteAutoMergeCandidateDb,
} from "../db.js";

test("SQLite Persistence operations", async (t) => {
  const testDbPath = join(tmpdir(), `test-gh-monitor-${Date.now()}.db`);

  t.after(async () => {
    closeDb();
    await rm(testDbPath, { force: true });
  });

  await t.test("DB initialization & schema creation", async () => {
    const db = await initDb(testDbPath);
    // If node:sqlite is not supported in this Node environment, db will be null
    if (!db) {
      t.skip("node:sqlite unavailable in this Node environment");
      return;
    }
    assert.ok(db, "Database initialized");
  });

  await t.test("History snapshots CRUD", async () => {
    const snapshot = {
      ts: new Date().toISOString(),
      mode: "all",
      owners: "org1",
      repos: 10,
      passingPrs: 5,
      failingPrs: 1,
      payload: { testKey: "testValue" },
    };

    insertHistorySnapshotDb(snapshot);
    const history = getHistorySnapshotsDb();
    assert.equal(history.length, 1);
    assert.equal(history[0].testKey, "testValue");
  });

  await t.test("Client state storage CRUD", async () => {
    updateClientStateDb({
      settings: { theme: "dark", view: "passing" },
      dismissed: { "pr-1": "2026-08-16T00:00:00Z" },
    });

    const clientState = getClientStateDb();
    assert.deepEqual(clientState.settings, { theme: "dark", view: "passing" });
    assert.deepEqual(clientState.dismissed, { "pr-1": "2026-08-16T00:00:00Z" });

    clearClientStateDb();
    const emptyState = getClientStateDb();
    assert.deepEqual(emptyState, {});
  });

  await t.test("Server etag cache CRUD", async () => {
    saveEtagCacheDb("https://api.github.com/test", "GET", 'W/"123"', "Sun, 16 Aug 2026 00:00:00 GMT", { ok: true }, 0);
    const etags = loadEtagCacheDb();
    assert.equal(etags.length, 1);
    assert.equal(etags[0].key, "https://api.github.com/test");
    assert.equal(etags[0].etag, 'W/"123"');
  });

  await t.test("Github value cache CRUD", async () => {
    const expires = Date.now() + 60000;
    saveGithubValueCacheDb("test-val-key", { status: "cached" }, expires);
    const vals = loadGithubValueCacheDb();
    assert.equal(vals.length, 1);
    assert.equal(vals[0].key, "test-val-key");
  });

  await t.test("Installation tokens CRUD", async () => {
    const expires = Date.now() + 3600000;
    saveInstallationTokenDb("my-org", "ghs_secret123", expires);
    const tokens = loadInstallationTokensDb();
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].owner, "my-org");
    assert.equal(tokens[0].token, "ghs_secret123");
  });

  await t.test("Auto-merge candidates CRUD", async () => {
    saveAutoMergeCandidateDb({
      repo: "org/repo",
      number: 42,
      numberLabel: "#42",
      title: "Fix bug",
      url: "https://github.com/org/repo/pull/42",
      deadline: Date.now() + 15000,
      error: "",
    });

    let candidates = loadAutoMergeCandidatesDb();
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].repo, "org/repo");
    assert.equal(candidates[0].number, 42);

    deleteAutoMergeCandidateDb("org/repo", 42);
    candidates = loadAutoMergeCandidatesDb();
    assert.equal(candidates.length, 0);
  });
});
