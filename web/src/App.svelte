<script>
  import { onMount } from "svelte";
  import {
    data, history, view, loading, error, stale, filter,
    autoRefresh, generatedAt, nextRefreshAt, rateLimit, options,
    load, setView, setOption, setAutoRefresh, refreshNow,
  } from "./lib/store.js";
  import { formatRelative, quotaLabel } from "./lib/format.js";
  import Scoreboard from "./components/Scoreboard.svelte";
  import Rail from "./components/Rail.svelte";
  import Lane from "./components/Lane.svelte";
  import HistoryView from "./components/HistoryView.svelte";

  const VIEW_META = {
    fail: { kicker: "Failing CI", title: "PRs that need attention" },
    conflicts: { kicker: "Conflicts", title: "PRs with merge conflicts" },
    running: { kicker: "CI Running", title: "Workflows in progress" },
    pass: { kicker: "Passing CI", title: "Green PRs" },
    noCi: { kicker: "No CI", title: "Ready PRs without CI" },
    pipelineTraces: { kicker: "Pipeline Traces", title: "PR-to-production journeys" },
    runningCd: { kicker: "Running CD", title: "Deployments in flight" },
    finishedCd: { kicker: "Finished CD", title: "Recently shipped" },
    deployments: { kicker: "Deployments", title: "Running deployments" },
    runners: { kicker: "Runners", title: "Busy self-hosted runners" },
    failedCd: { kicker: "Failed CD", title: "Failed deployments" },
    history: { kicker: "Scan history", title: "Local scan snapshots over time" },
  };

  let theme = $state("dark");
  // Sync view store to local state to avoid orphaned effects from $derived(store)
  let currentView = $state($view);
  $effect(() => { currentView = $view; });
  const meta = $derived(VIEW_META[currentView] || VIEW_META.fail);

  function applyTheme(next) {
    theme = next;
    document.documentElement.dataset.theme = next === "light" ? "light" : "dark";
    try {
      const settings = JSON.parse(localStorage.getItem("pr-deck:v1") || "{}");
      settings.theme = next;
      localStorage.setItem("pr-deck:v1", JSON.stringify(settings));
    } catch {}
  }

  function setMode(next) {
    setOption("mode", next);
  }

  onMount(() => {
    try {
      const settings = JSON.parse(localStorage.getItem("pr-deck:v1") || "{}");
      if (settings.theme === "light") applyTheme("light");
    } catch {}
    load();
  });
</script>

<div class="shell">
  <header class="topbar">
    <div class="brand" title="PR Command Deck">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="currentColor" />
        <rect x="7" y="9" width="14" height="2" rx="1" fill="var(--paper)" />
        <rect x="7" y="15" width="18" height="2" rx="1" fill="var(--red)" />
        <rect x="7" y="21" width="11" height="2" rx="1" fill="var(--green)" />
      </svg>
      <h1 class="brand-name">PR Command Deck</h1>
    </div>

    <section class="controls" aria-label="Dashboard controls">
      <span class="repo-chip" title="Repositories in scope">
        <span class="repo-chip-label">Repos</span>
        <strong>{$data?.summary?.repos ?? 0}</strong>
      </span>

      <label class="appearance-picker">
        <span>Appearance</span>
        <select bind:value={theme} onchange={(e) => applyTheme(e.currentTarget.value)}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>

      <div class="segmented" role="group" aria-label="Scope">
        {#each [["all","All"],["owned","Owned"],["mine","Mine"]] as [m, label]}
          <button
            class="segment"
            class:active={$options.mode === m}
            type="button"
            data-mode={m}
            aria-pressed={$options.mode === m}
            onclick={() => setMode(m)}>{label}</button
          >
        {/each}
      </div>

      <label class="switch" title="Include continuous-deployment workflows">
        <input type="checkbox" checked={$options.includeCd} onchange={(e) => setOption("includeCd", e.currentTarget.checked)} />
        <span>CD</span>
      </label>
      <label class="switch" title="Include busy self-hosted runners">
        <input type="checkbox" checked={$options.includeRunners} onchange={(e) => setOption("includeRunners", e.currentTarget.checked)} />
        <span>Runners</span>
      </label>
      <label class="switch" title="Auto-refresh on an adaptive cadence">
        <input type="checkbox" checked={$autoRefresh} onchange={(e) => setAutoRefresh(e.currentTarget.checked)} />
        <span>Auto</span>
      </label>

      <button class="refresh" type="button" aria-label="Refresh now" title="Refresh" onclick={refreshNow}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v5h-5M6 22v-5h5" />
        </svg>
      </button>
    </section>

    <section class="meta-strip" aria-live="polite">
      <span class="meta-item">
        <span class="meta-label">Signed in</span>
        <strong>{$data?.account ?? "—"}</strong>
      </span>
      <span class="meta-sep"></span>
      <span class="meta-item">
        <span class="meta-label">Updated</span>
        <strong>{formatRelative($generatedAt)}</strong>
      </span>
      <span class="meta-sep"></span>
      <span class="meta-item">
        <span class="meta-label">Next</span>
        <strong>{formatRelative($nextRefreshAt)}</strong>
      </span>
      <span class="meta-sep"></span>
      <span class="meta-item"><strong>{quotaLabel($rateLimit)}</strong></span>
      {#if $stale}
        <span class="stale-badge" role="status">Showing last known data — syncing…</span>
      {/if}
    </section>

    {#if $data?.warnings?.length}
      <section class="refresh-pause-notice" role="status">
        <span class="refresh-pause-copy"><strong>Notice</strong> {$data.warnings.join(" ")}</span>
      </section>
    {/if}
  </header>

  <main>
    <Scoreboard {data} {history} onselect={setView} />

    <div class="loading" class:hidden={!$loading}>
      <div class="loader"></div>
      <span>Scanning GitHub…</span>
    </div>

    {#if $error}
      <section class="error-panel" role="alert">{$error}</section>
    {/if}

    <section class="workspace">
      <Rail {data} view={$view} onselect={setView} />

      <section class="panel" aria-live="polite">
        <div class="panel-head">
          <div>
            <p>{meta.kicker}</p>
            <h2>{meta.title}</h2>
          </div>
          <div class="filter-box">
            <input type="search" placeholder="Filter repo, title, author, branch…" bind:value={$filter} />
          </div>
        </div>

        {#if $view === "history"}
          <HistoryView {history} filter={$filter} />
        {:else}
          <Lane data={$data} view={$view} filter={$filter} />
        {/if}
      </section>
    </section>
  </main>

  <footer class="app-footer">
    <a href="https://github.com/settings/installations/153976772" target="_blank" rel="noopener noreferrer" class="app-footer-link">
      GitHub App Installation Settings ↗
    </a>
    <a href="https://github.com/buluma/github-monitor" target="_blank" rel="noopener noreferrer" class="app-footer-link">
      github-monitor ↗
    </a>
  </footer>
</div>
