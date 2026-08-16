<script>
  import { get } from "svelte/store";
  import { laneRows } from "../lib/normalize.js";
  let { data, view, onselect } = $props();

  // Sync stores to local state to avoid orphaned effects
  let localData = $state(get(data));
  let localView = $state(get(view));
  $effect(() => { localData = data; });
  $effect(() => { localView = view; });

  const items = [
    { view: "fail", label: "Failing CI", dot: "red" },
    { view: "conflicts", label: "Conflicts", dot: "conflict" },
    { view: "running", label: "CI Running", dot: "amber" },
    { view: "pass", label: "Passing CI", dot: "green" },
    { view: "noCi", label: "No CI", dot: "gray" },
    { view: "pipelineTraces", label: "Pipeline Traces", dot: "red" },
    { view: "runningCd", label: "Running CD", dot: "blue" },
    { view: "finishedCd", label: "Finished CD", dot: "green" },
    { view: "deployments", label: "Deployments", dot: "violet" },
    { view: "runners", label: "Runners", dot: "gray" },
    { view: "failedCd", label: "Failed CD", dot: "ink" },
    { view: "history", label: "History", dot: "ink" },
  ];

  function count(v) {
    if (v === "history") return data?.history?.totals?.scans ?? 0;
    return laneRows(v, localData).length;
  }
</script>

<nav class="rail" aria-label="Views">
  {#each items as item}
    <button
      class="rail-item"
      class:active={view === item.view}
      type="button"
      data-view={item.view}
      aria-current={view === item.view ? "true" : "false"}
      onclick={() => onselect?.(item.view)}
    >
      <span class="dot {item.dot}"></span>
      {item.label}
      <strong>{count(item.view)}</strong>
    </button>
  {/each}
</nav>
