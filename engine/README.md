# Nightly Automation

A small task engine for the DeepSeek Harness Web UI: you define tasks (name,
schedule, model, working directory, prompt) in **Settings → Nightly Automation**,
and each firing runs one of them **in a brand-new independent Session**, leaves a
full transcript behind, and optionally writes a report.

It is deliberately not the built-in "Automation tasks" page. That feature binds a
reminder to *one* Session and wakes that Session later. This one spawns a fresh
`dsh --profile headless` process per firing, which is what makes a nightly
maintenance job safe: no context accumulates, the Web UI conversation is never
touched, and cron keeps firing whether or not the GUI is open.

## What a run is

```
cron  →  runner.mjs --task <id>  →  dsh --profile headless --patch <generated overlay> --json "<prompt>"
```

- **Fresh Session id every firing.** The id is reported in `logs/cron.log` and the
  transcript's first line; the session itself is persisted under `~/.dsh/sessions/`.
- **Per-task model.** The runner generates a profile overlay that copies the live
  profile's `llm-pi-ai` provider block and overrides only `agent-default-model`,
  so a task can name `<PROVIDER_ID>`/`<MODEL_ID>` while another names something else, and
  the live Web profile is never edited.
- **Per-task working directory.** A dedicated git worktree keeps an unattended
  agent away from the checkout your everyday sessions edit.
- **One run at a time per task.** A per-task lock file makes a second firing exit
  instead of racing; different tasks may run concurrently.
- **Bounded.** `timeout 3h`; at most `keepRuns` transcripts are retained per task.

## The page

Settings → **Nightly Automation**.

| Control | Effect |
| --- | --- |
| Task list | status, schedule, last outcome, and the task id |
| New task | create a task; the editor validates before writing |
| Editor | name, id, description, enable switch, frequency, provider + model + reasoning effort, working directory, prompt, keep-runs |
| Run now | starts the same `runner.mjs` cron would |
| Delete | removes the task and its crontab block, keeps its transcripts and reports |
| Reports / Run records | open a transcript or report in a viewer |

Frequencies offered: manual only, every N minutes, hourly, daily, weekly (weekday
picker), and a custom five-field cron expression. Disabling a task parks its job
line as a comment carrying the chosen expression, so switching it back on
restores that time rather than a default.

## Files

| Path | Role |
| --- | --- |
| `tasks.json` | **Source of truth.** Tasks, their model, schedule, prompt file, cwd. |
| `bin/runner.mjs` | Executes one task end to end. Invoked by cron and by "Run now". |
| `prompts/<id>.md` | The standing instruction for one task. |
| `env.sh` | Proxy, credentials, `DSH_HOME`. **Mode 0600.** Regenerate if keys rotate. |
| `logs/cron.log` | One line per firing: `[stamp] ok\|failed task=<id> session=<id> log=<path>`. |
| `logs/<id>-<stamp>.log` | Full `--json` event stream of one run. |
| `reports/` | Optional per-run reports the model writes (`<id>-<date>.md`). |
| `state/<id>.lock` | Per-task run lock (holds the runner's pid). |
| `state/run-overlay.yml` | Last generated model overlay; regenerated every run. |

The crontab is a **projection** of `tasks.json`, written only by the Host half of
the plugin. Every task owns one marker-delimited block; every line outside those
blocks is preserved, so unrelated cron entries are never touched.

## Recovery

```sh
crontab -l                                  # what is actually scheduled
tail -f ~/.dsh/automation/logs/cron.log     # one line per run
ls -t ~/.dsh/automation/logs/*.log | head   # newest transcripts
python3 -m json.tool ~/.dsh/automation/tasks.json
```

- **A task is stuck as "running":** the runner died without clearing its lock.
  `rm ~/.dsh/automation/state/<id>.lock` is safe; the page also self-heals a lock
  whose recorded pid is gone.
- **The page and the crontab disagree:** save any task from the page. Every write
  re-projects the whole catalog, which also drops orphaned blocks.
- **A run produced nothing:** open its transcript and look for
  `runner error:`, a missing credential, or a provider failure.

## Known constraints

- The DeepSeek-hosted `web_search` provider is broken in this deployment: the only
  DeepSeek key here is a third-party gateway key, and the platform search endpoint
  rejects it with HTTP 401. A task that needs current information has to rely on
  `web_fetch` until that is fixed — this engine does not paper over it.
- Egress is allowlisted for uid 1001 (iptables chain `DSH_EGRESS`): only the
  `172.30.66.1` proxy ports and `172.30.0.1:13070` are reachable. `env.sh` carries
  the proxy settings every run inherits.
- The plugin lives in `<PLUGIN_DIR>`.
  After editing it, toggle its row on the Plugins page (or reload the plugin) so
  the new module generation loads.
