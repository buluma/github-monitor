// Apply the saved theme before first paint so there is no flash of the wrong
// theme. Loaded synchronously from <head>; must stay CSP-safe (no inline JS).
try {
  const settings = JSON.parse(localStorage.getItem("pr-deck:v1") || "{}");
  document.documentElement.dataset.theme =
    settings.theme === "light" ? "light" : "dark";
} catch {
  document.documentElement.dataset.theme = "dark";
}
