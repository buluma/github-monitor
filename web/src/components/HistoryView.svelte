<script>
  import { get } from "svelte/store";
  import { historyBars } from "../lib/normalize.js";
  import { formatDateTime } from "../lib/format.js";

  let { history, filter } = $props();
  const ROW_H = 66;
  let scrollTop = $state(0);
  let viewportH = $state(600);

  // Sync stores to local state to avoid orphaned effects
  let localHistory = $state(get(history));
  let localFilter = $state(get(filter));
  $effect(() => { localHistory = history; });
  $effect(() => { localFilter = filter; });

  const buckets = $derived(localHistory?.buckets || []);
  const q = $derived((localFilter || "").trim().toLowerCase());
  const filtered = $derived(
    q
      ? buckets.filter(
          (b) =>
            formatDateTime(b.ts).toLowerCase().includes(q) ||
            String(b.scans || "").includes(q),
        )
      : buckets,
  );
  const total = $derived(filtered.length);
  const start = $derived(Math.max(0, Math.floor(scrollTop / ROW_H) - 4));
  const end = $derived(Math.min(total, start + Math.ceil(viewportH / ROW_H) + 8));
  const visible = $derived(filtered.slice(start, end));

  const VIEW_TITLE = {
    ts: "Time",
    scans: "Scans",
    repos: "Repos",
    passing: "Pass",
    failing: "Fail",
    running: "Run",
    cd: "CD",
    done: "Done",
    bad: "Bad",
    runners: "Runners",
  };
</script>

<section
  class="history-list"
  style="max-height:72vh; overflow:auto;"
  bind:clientHeight={viewportH}
  onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
>
  {#if total === 0}
    <p class="empty-state">No scan history yet.</p>
  {:else}
    <div style="height:{total * ROW_H}px; position:relative;">
      <div style="transform:translateY({start * ROW_H}px);">
        {#each visible as b (b.ts)}
          <article class="row history-row" style="height:{ROW_H}px;">
            <div class="row-main">
              <div class="row-title">
                <span class="history-ts">{formatDateTime(b.ts)}</span>
                <span class="history-scope">{b.scans} scan{b.scans === 1 ? "" : "s"}/hr</span>
              </div>
              <div class="history-bars">
                {#each historyBars(b) as bar}
                  <span
                    class="history-bar"
                    style="--bar-width:{bar.width}%;--bar-color:var(--{bar.color})"
                    title={bar.value}>{bar.value}</span
                  >
                {/each}
              </div>
              <div class="history-labels">
                <span>repos</span><span>pass</span><span>fail</span><span>run</span>
                <span>cd</span><span>done</span><span>bad</span><span>runners</span>
              </div>
            </div>
          </article>
        {/each}
      </div>
    </div>
  {/if}
</section>
