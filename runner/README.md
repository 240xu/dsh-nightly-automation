# Runner deployment

`index.js` does **not** install the runner; it only expects it at
`$DSH_HOME/automation/bin/runner.mjs` (it is spawned by cron and by *Run now*).
Deploy it once, after the plugin is mounted:

```bash
mkdir -p "$HOME/.dsh/automation/bin"
install -m 755 runner.mjs "$HOME/.dsh/automation/bin/runner.mjs"
```

The runner is a plain Node script with no dependencies outside Node's standard
library, so it needs no build step. It reads `$DSH_HOME/automation/tasks.json` and
spawns `dsh --profile headless --patch <overlay> --json "<prompt>"`.

Environment it requires:

| Variable | Purpose |
| --- | --- |
| `DSH_HOME` | Harness home; `tasks.json`, logs, and reports are derived from it |
| `PATH` | must contain `dsh`; the runner also shells out to `crontab` and `zstd` |
| `DSH_PERMISSION_MODE` | unattended runs need `danger-full-access` |
| `HTTP_PROXY` / `HTTPS_PROXY` | whatever egress your host requires |
