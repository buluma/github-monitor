<script>
  import { get } from "svelte/store";
  import { laneRows, summarize, STATE_CLASS } from "../lib/normalize.js";
  let { data, view, filter } = $props();

  // Sync stores to local state to avoid orphaned effects
  let localData = $state(get(data));
  let localView = $state(get(view));
  let localFilter = $state(get(filter));
  $effect(() => { localData = data; });
  $effect(() => { localView = view; });
  $effect(() => { localFilter = filter; });

  const all = $derived(laneRows(localView, localData));
  const q = $derived((localFilter || "").trim().toLowerCase());
  const rows = $derived(
    q
      ? all.filter((r) => {
          const s = summarize(r);
          return `${s.title} ${s.subtitle}`.toLowerCase().includes(q);
        })
      : all,
  );

  function key(item) {
    return item.url || `${item.repo}#${item.number ?? item.runNumber ?? ""}`;
  }
</script>

<div class="content">
  {#if rows.length === 0}
    <p class="empty-state">Nothing here right now.</p>
  {:else}
    {#each rows as item (key(item))}
      {@const s = summarize(item)}
      <a class="row" href={s.url} target="_blank" rel="noopener noreferrer">
        <span class="dot {STATE_CLASS[s.state] || 'gray'}"></span>
        <div class="row-main">
          <div class="row-title">{s.title}</div>
          <div class="row-sub">{s.subtitle}</div>
        </div>
      </a>
    {/each}
  {/if}
</div>
