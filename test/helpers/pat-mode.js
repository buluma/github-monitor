// Pin auth mode to PAT before server.js is imported, so this suite behaves
// identically whether or not a local .env (with GitHub App credentials) is
// present. process.loadEnvFile inside server.js does not override env vars that
// are already set, so the empty-string values here win.
process.env.GITHUB_APP_ID = "";
process.env.GITHUB_APP_PRIVATE_KEY_PATH = "";
