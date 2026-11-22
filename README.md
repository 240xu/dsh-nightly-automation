# dsh-nightly-automation

A small task engine for the DeepSeek Harness **Web UI**: you define tasks (name,
schedule, model, working directory, prompt) in **Settings → Nightly Automation**,
and each firing runs one of them **in a brand-new independent Session**, leaves a
full transcript behind, and optionally writes a report.

> **Status (2026-11-22): archived.** DeepSeek Harness now ships a first-party
> equivalent — `@deepseek-ai/dsh-schedule` + `@deepseek-ai/dsh-tool-schedule` +
> the built-in **Automation tasks** page. This plugin is kept for reference only.
> See [Relationship to the built-in Automation tasks page](#relationship-to-the-built-in-automation-tasks-page).

It is deliberately not the built-in *Automation tasks* page. That feature binds a
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
  so one task can name `wbcn/hy4-preview` while another names something else, and
  the live Web profile is never edited.
- **Per-task working directory.** Chosen from the workspaces the left sidebar
  already lists, so a task usually needs no directory decision. **Browse…** opens
  the shell's own directory picker; a manual path stays available for directories
  that are not workspaces (an isolated git worktree, for example), and such a task
  is shown as *Custom path* rather than silently claiming a workspace.
- **One run at a time per task.** A per-task lock file makes a second firing exit
  instead of racing; different tasks may run concurrently.
- **Bounded.** Per-run timeout (1–8 h, default 3 h); at most `keepRuns` transcripts
  are retained per task.

## The page

Settings → **Nightly Automation**.

| Control | Effect |
| --- | --- |
| Task list | status, schedule, last outcome, and the task id |
| New task | create a task; the editor validates before writing |
| Editor | collapsible Basics / Schedule / Task prompt / Advanced sections, plus a **Settings / Records & reports** tab strip |
| Working directory | dropdown of the workspaces the left sidebar shows, **Browse…**, and **Another folder…** |
| Sticky action bar | Save, Discard changes, **Save & run**, Delete — always visible |
| Draft safety | an **Unsaved changes** bar appears after any edit; leaving asks before discarding; a failed save keeps the draft |
| Records & reports | reports, run transcripts and locations in a separate tab |
| Run now | starts the same `runner.mjs` cron would |
| Delete | removes the task and its crontab block, keeps its transcripts and reports |

Frequencies offered: manual only, every N minutes, hourly, daily, weekly (weekday
picker), and a custom five-field cron expression. Disabling a task parks its job
line as a comment carrying the chosen expression, so switching it back on restores
that time rather than a default.

## Files

`tasks.json` under `~/.dsh/automation/` is the source of truth; the crontab is
derived from it. Every mutation writes the catalog atomically and re-projects the
managed crontab block, preserving every foreign line.

| Path | Role |
| --- | --- |
| `$DSH_HOME/automation/tasks.json` | task catalog (source of truth) |
| `$DSH_HOME/automation/bin/runner.mjs` | one-shot runner, spawned by cron |
| `$DSH_HOME/automation/prompts/<id>.md` | per-task prompt text |
| `$DSH_HOME/automation/logs/` | cron log + one transcript per firing |
| `$DSH_HOME/automation/reports/` | optional markdown reports written by a run |
| `$DSH_HOME/automation/state/` | lock files, crontab backup |

## Model-facing tools

`tools.js` registers four top-level tools so any agent in the profile can manage
tasks:

| Tool | Purpose |
| --- | --- |
| `automation_task_create` | create or update a task (`originalId` updates instead of creating) |
| `automation_task_list` | list tasks with schedule, model, preset, resume session, next firing |
| `automation_task_run` | start one task immediately, exactly as cron would |
| `automation_task_delete` | delete a task and its crontab block |

### Schema note (why this repository's `tools.js` differs from the original)

The first version declared `parameters` as a **bare property map**:

```js
parameters: {
  id: { type: 'string', required: true, description: '…' },
  …
}
```

DeepSeek Harness's own `defineTool()` compiles such a map into a proper JSON
Schema root; the plugin instead calls `ctx.tools.register()` directly, so the bare
map reached the wire untranslated. Strict OpenAI-compatible gateways reject that
shape — for example the OpenDesign/AMR gateway answers

```
400 {"message":"[code=invalid_request_error] The request is invalid. Please check the request parameters.","type":"invalid_request_error","code":"invalid_request_error"}
```

for **every** request, because all tools are sent together. `tools.js` here is
normalised to the standard shape:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": { … },
  "required": ["id", "title", "prompt", "schedule", "model", "workspace"]
}
```

This also makes the per-property `required: true` markers real: they now compile
into the root `required` array, so missing arguments are rejected by
`defineTool`'s argument validation instead of silently reaching the handler.

## Install

```
dsh plugin --profile web add /absolute/path/to/dsh-nightly-automation
```

The plugin is a **bundle**: its `cordis.patch.yml` inserts two rows (the Host half
and the tools half). Restart the Web app afterwards.

For a local checkout the profile usually points at it directly:

```json
"dependencies": { "dsh-nightly-automation": "link:/absolute/path" },
"dsh": { "profile": { "bundles": [ …, "dsh-nightly-automation" ] } }
```

## Relationship to the built-in Automation tasks page

| | built-in (`@deepseek-ai/dsh-schedule`) | this plugin |
| --- | --- | --- |
| Storage | `$DSH_HOME/storages/schedule.json` | `$DSH_HOME/automation/tasks.json` |
| Scheduling | RRULE (+ 5-field cron in the Web editor) | 5-field cron, projected into the user's crontab |
| Per-task model / effort | no — inherits `agent-default-model` | yes |
| Execution | in-process Host delivery, wakes a Session | fresh `dsh --profile headless` child process |
| Tools | `schedule_create/list/view/edit` | `automation_task_*` |
| UI | Automation tasks page (shipped) | Settings → Nightly Automation (this plugin) |

Migrating is a manual step: create the equivalent task with `schedule_create`
(`target: new_once` or `new`) and then remove this bundle, its crontab block, and
`$DSH_HOME/automation/`.

## License

MIT.
