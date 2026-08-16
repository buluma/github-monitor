<script>
  import { get } from "svelte/store";
  let { data, history, onselect } = $props();

  // Sync stores to local state to avoid orphaned effects from $derived(store)
  let localData = $state(get(data));
  let localHistory = $state(get(history));
  $effect(() => { localData = data; });
  $effect(() => { localHistory = history; });

  const summary = $derived(localData?.summary || {});
  const totals = $derived(localHistory?.totals || {});

  const groups = $derived([
    {
      label: "Integration",
      tiles: [
        { view: "pass", label: "Passing CI", value: summary.passingPrs || 0, cls: "green" },
        { view: "noCi", label: "No CI", value: summary.noCiPrs || 0, cls: "gray" },
        { view: "fail", label: "Failing CI", value: summary.failingPrs || 0, cls: "red" },
        { view: "conflicts", label: "Conflicts", value: summary.conflictPrs || 0, cls: "conflict" },
        { view: "running", label: "CI Running", value: summary.runningPrs || 0, cls: "amber" },
      ],
    },
    {
      label: "Delivery",
      tiles: [
        { view: "runningCd", label: "Running CD", value: summary.runningCd || 0, cls: "blue" },
        { view: "finishedCd", label: "Finished CD", value: summary.finishedCd || 0, cls: "green" },
        { view: "failedCd", label: "Failed CD", value: summary.failedCd || 0, cls: "ink" },
      ],
    },
    {
      label: "Pipeline",
      tiles: [
        { view: "pipelineTraces", label: "Flagged", value: summary.flaggedJourneys || 0, cls: "red", traceFilter: "flagged" },
        { view: "pipelineTraces", label: "In Flight", value: summary.activeJourneys || 0, cls: "blue", traceFilter: "active" },
        { view: "pipelineTraces", label: "Shipped", value: summary.shippedJourneys || 0, cls: "green", traceFilter: "completed" },
        { view: "pipelineTraces", label: "Unknown", value: summary.tracingUnknown || 0, cls: "gray", traceFilter: "unknown" },
      ],
    },
    {
      label: "History",
      tiles: [{ view: "history", label: "Scans", value: totals.scans || 0, cls: "ink" }],
    },
  ]);
</script>

<section class="scoreboard" aria-label="Summary">
  {#each groups as group}
    <div class="metric-group" style="--tiles:{group.tiles.length}" role="group" aria-label={group.label}>
      <p class="metric-group-label">{group.label}</p>
      <div class="metric-grid">
        {#each group.tiles as tile}
          <button
            class="metric metric-{tile.cls}"
            type="button"
            data-view={tile.view}
            onclick={() => onselect?.(tile.view)}
            aria-label={"Show " + tile.label}
          >
            <span class="metric-top"><span class="metric-dot"></span><span class="metric-label">{tile.label}</span></span>
            <strong>{tile.value}</strong>
          </button>
        {/each}
      </div>
    </div>
  {/each}
</section>
