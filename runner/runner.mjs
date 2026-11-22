#!/usr/bin/env node
/**
 * Nightly Automation runner.
 *
 * The one executable that turns a *task definition* into a real, isolated agent
 * run. It is invoked both by cron (one process per scheduled firing) and by the
 * settings page's "Run now"; both get the same behaviour, so a manual run can
 * never prove something the timer will not do.
 *
 * A run is deliberately a child `dsh --profile headless` process rather than an
 * in-process Agent: the point of this automation is a *fresh Session id per
 * firing* that cannot accumulate context, cannot interfere with the Web UI
 * session, and keeps working when the Web UI is not running.
 *
 * Usage:  runner.mjs --task <id>
 * Exit:   0 success, non-zero failure; every outcome is appended to cron.log.
 *
 * @module nightly-automation/runner
 */

import { execFile, spawn } from 'node:child_process'
import { open, readFile, readdir, rename, stat, unlink, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

/** Root of everything this automation owns. */
const ROOT = join(homedir(), '.dsh', 'automation')
const TASKS_FILE = join(ROOT, 'tasks.json')
const STATE_DIR = join(ROOT, 'state')
const LOG_DIR = join(ROOT, 'logs')
const REPORT_DIR = join(ROOT, 'reports')
const ENV_FILE = join(ROOT, 'env.sh')
const CRON_LOG = join(LOG_DIR, 'cron.log')
const CRON_TAG = 'dsh-nightly-automation'

/** Hard ceiling on one run, so a stuck night cannot hold the lock forever. */
const DEFAULT_RUN_TIMEOUT_MS = 3 * 60 * 60 * 1000
/** Per-task override: `timeoutHours` in tasks.json, clamped to 1–8 hours. */
function runTimeoutMs(task) {
  const hours = Number(task?.timeoutHours)
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_RUN_TIMEOUT_MS
  return Math.max(1, Math.min(8, hours)) * 60 * 60 * 1000
}

/**
 * Timestamp in the compact form used by log file names and cron.log lines.
 * @returns `YYYYMMDDTHHMMSS` in local time.
 */
function stamp() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/**
 * Append one line to a file, creating the directory when needed.
 * @param path - absolute file path.
 * @param line - text to append, without a trailing newline.
 */
async function appendLine(path, line) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${line}\n`, { flag: 'a', mode: 0o600 })
}

/**
 * Read and validate the task catalog.
 * @returns the parsed catalog.
 */
async function readTasks() {
  const text = await readFile(TASKS_FILE, 'utf8')
  const parsed = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
    throw new Error(`${TASKS_FILE} has no tasks array`)
  }
  return parsed
}

/**
 * Resolve one task by id, failing loud when it does not exist.
 * @param tasks - the parsed catalog.
 * @param id - task id from the command line.
 * @returns the task definition.
 */
function requireTask(tasks, id) {
  const task = tasks.tasks.find(candidate => candidate.id === id)
  if (task === undefined) throw new Error(`no task with id "${id}" in ${TASKS_FILE}`)
  return task
}

/**
 * Load the launch environment the scheduler must export into the child.
 *
 * cron starts from an empty environment, and a run must see the same proxy and
 * credentials the Web UI uses, so the file is sourced by bash rather than parsed
 * here; that keeps its `export` syntax authoritative.
 * @returns the environment entries to overlay on this process's environment.
 */
async function launchEnvironment() {
  if (!existsSync(ENV_FILE)) throw new Error(`missing environment file ${ENV_FILE}`)
  const { stdout } = await runFile('/bin/bash', ['-c', `set -a; . ${JSON.stringify(ENV_FILE)}; env -0`], {
    maxBuffer: 4 * 1024 * 1024,
  })
  const environment = {}
  for (const entry of stdout.split('\0')) {
    if (entry === '') continue
    const separator = entry.indexOf('=')
    if (separator <= 0) continue
    environment[entry.slice(0, separator)] = entry.slice(separator + 1)
  }
  return environment
}

/**
 * Render the profile overlay that routes this run at the requested model.
 *
 * The provider block is copied verbatim from the deployment's own profile rather
 * than duplicated here, so keys, base URLs, and model catalogs keep exactly one
 * home. Only the default-model row differs per run.
 * @param profileFile - the live profile patch file.
 * @param provider - provider route id, such as `wbcn`.
 * @param model - model id within that route.
 * @param reasoningEffort - optional reasoning effort id.
 * @returns the written overlay path.
 */
/**
 * Cut one top-level `- id:` entry (including its nested config) out of a
 * profile patch. Entries are found by id, not by indentation width.
 * @param profile - full profile patch text.
 * @param rowId - the entry's `id` value.
 * @returns the entry text, or an empty string when absent.
 */
function extractEntry(profile, rowId) {
  const lines = profile.split('\n')
  const start = lines.findIndex(line => line.trim() === `- id: ${rowId}`)
  if (start === -1) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^- /.test(lines[index])) { end = index; break }
  }
  return lines.slice(start, end).join('\n').trimEnd()
}

/**
 * Generate the per-run profile overlay. It copies the live `llm-pi-ai`
 * providers block, overrides only `agent-default-model`, and — when the task
 * asks for an agent preset and is NOT resuming a session — copies the preset
 * row plus a registry override so the headless run composes the same tools.
 * @param profileFile - live profile patch path.
 * @param task - task definition.
 * @returns the written overlay path.
 */
async function writeOverlay(profileFile, task) {
  const profile = await readFile(profileFile, 'utf8')
  const block = extractEntry(profile, 'llm-pi-ai')
  if (block === '') throw new Error(`profile ${profileFile} has no llm-pi-ai entry`)
  const provider = task.model.provider
  if (!new RegExp(`^\\s+${provider}:\\s*$`, 'm').test(block)) {
    throw new Error(`provider route "${provider}" is not configured in ${profileFile}`)
  }
  const rows = [
    '# Generated per run by runner.mjs from the live profile. Do not edit.',
    block,
    '- id: agent-default-model',
    "  name: '@deepseek-ai/dsh-agent-default-model'",
    '  config:',
    `    provider: ${provider}`,
    `    model: ${task.model.model}`,
  ]
  if (task.model.reasoningEffort !== undefined && task.model.reasoningEffort !== '') {
    rows.push(`    reasoningEffort: ${task.model.reasoningEffort}`)
  }
  // A resumed session cannot carry a preset (headless assertAdoptable), so the
  // two are mutually exclusive and Host validation already enforced that.
  if (task.agentPreset && !task.resumeSessionId) {
    // Shipped presets live in the bundle layer, not in the user's patch file,
    // so read the composed profile instead of the raw patch.
    let composed = profile
    try {
      const { stdout } = await runFile('dsh', ['--profile', 'web', '--dump-config'], { maxBuffer: 16 * 1024 * 1024 })
      composed = stdout
    } catch { /* fall back to the patch file */ }
    const presetRow = extractEntry(composed, `preset-${task.agentPreset}`)
    if (presetRow === '') throw new Error(`agent preset "${task.agentPreset}" is not defined in the composed web profile`)
    rows.push(
      '- id: agent-preset-registry',
      "  name: '@deepseek-ai/dsh-agent-preset-registry'",
      '  config:',
      `    default: ${task.agentPreset}`,
      `    selectedDefault: ${task.agentPreset}`,
      presetRow,
    )
  }
  const path = join(STATE_DIR, 'run-overlay.yml')
  await writeFile(path, `${rows.join('\n')}\n`, { mode: 0o600 })
  return path
}

/**
 * Cut the `llm-pi-ai` entry out of a profile patch file.
 *
 * The entry runs until the next top-level list item, which is what keeps this
 * independent of how many providers or models the profile declares.
 * @param profile - full profile patch text.
 * @returns the entry text, or an empty string when the entry is absent.
 */
function extractProviderBlock(profile) {
  const lines = profile.split('\n')
  const start = lines.findIndex(line => line.trim() === '- id: llm-pi-ai')
  if (start === -1) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^- /.test(lines[index])) { end = index; break }
  }
  return lines.slice(start, end).join('\n').trimEnd()
}

/**
 * Serialize one task run behind a per-task lock.
 *
 * Two firings of the same task must never overlap, while two different tasks may
 * legitimately run at once, so the lock is per task id.
 * @param taskId - the task to lock.
 * @returns a release function, or null when the lock is already held.
 */
async function acquireLock(taskId) {
  const path = join(STATE_DIR, `${taskId.replace(/[^\w.-]/g, '_')}.lock`)
  await mkdir(STATE_DIR, { recursive: true })
  const handle = await open(path, 'wx', 0o600).catch(error => {
    if (error?.code === 'EEXIST') return undefined
    throw error
  })
  if (handle === undefined) return null
  await handle.writeFile(String(process.pid))
  await handle.close()
  return async () => { await unlink(path).catch(() => {}) }
}

/**
 * Is a task's lock currently held?
 * @param taskId - the task to inspect.
 * @returns true when a run of that task is in progress.
 */
export async function isTaskRunning(taskId) {
  const path = join(STATE_DIR, `${taskId.replace(/[^\w.-]/g, '_')}.lock`)
  if (!existsSync(path)) return false
  const pid = Number((await readFile(path, 'utf8').catch(() => '')).trim())
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    // The recorded owner is gone, so the lock is stale; clear it so the next
    // firing is not blocked by a crashed run.
    await unlink(path).catch(() => {})
    return false
  }
}

/**
 * Largest run id already present for a task, so prune keeps the newest history.
 * @param taskId - the task whose logs to list.
 * @returns log file names, newest first.
 */
async function taskLogs(taskId) {
  let names
  try {
    names = await readdir(LOG_DIR)
  } catch {
    return []
  }
  const prefix = `${taskId.replace(/[^\w.-]/g, '_')}-`
  return names.filter(name => name.startsWith(prefix) && name.endsWith('.log')).sort().reverse()
}

/**
 * Delete all but the newest `keep` transcripts of one task.
 * @param taskId - the task to prune.
 * @param keep - how many transcripts to retain.
 */
async function pruneLogs(taskId, keep) {
  const logs = await taskLogs(taskId)
  for (const name of logs.slice(keep)) await unlink(join(LOG_DIR, name)).catch(() => {})
}

/**
 * Run one task: acquire the lock, generate the overlay, drive the agent, record
 * the outcome in both the task transcript and the shared cron log.
 * @param taskId - task id from the command line.
 * @returns the process exit code.
 */
/**
 * Is a failed attempt worth retrying? Only transport-level failures: a model
 * that answered with a real error, a bad config, or a missing directory will
 * fail identically on every attempt.
 * @param transcript - the attempt's captured output.
 * @returns whether the failure looks transient.
 */
function isRetryable(transcript) {
  return /"code":"(TIMEOUT|NETWORK_ERROR|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ABORTED)"|Request timed out|fetch failed|socket hang up/i.test(transcript)
}

/**
 * Drive one `dsh --profile headless` attempt and capture its full output.
 * @param options - environment, cwd, args and log path.
 * @returns the exit code and the captured transcript.
 */
async function attempt({ environment, cwd, args, logPath, timeoutMs }) {
  const child = spawn('dsh', args, {
    cwd,
    env: { ...environment, HOME: homedir(), DSH_HOME: join(homedir(), '.dsh') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const sink = await open(logPath, 'w', 0o600)
  const timer = setTimeout(() => { child.kill('SIGKILL') }, timeoutMs)
  let exitCode = 1
  try {
    for await (const chunk of child.stdout) await sink.write(chunk)
    for await (const chunk of child.stderr) await sink.write(chunk)
    exitCode = await new Promise(resolve => {
      child.on('error', () => resolve(1))
      child.on('close', code => resolve(code ?? 1))
    })
  } finally {
    clearTimeout(timer)
    await sink.close()
  }
  return { exitCode, transcript: await readFile(logPath, 'utf8').catch(() => '') }
}

/**
 * Run one task: acquire the lock, generate the overlay, drive the agent, record
 * the outcome in both the task transcript and the shared cron log. A transient
 * transport failure is retried with backoff so one night's gateway hiccup does
 * not waste the whole scheduled firing.
 * @param taskId - task id from the command line.
 * @returns the process exit code.
 */
async function main(taskId) {
  const catalog = await readTasks()
  const task = requireTask(catalog, taskId)

  const release = await acquireLock(taskId)
  if (release === null) {
    await appendLine(CRON_LOG, `[${stamp()}] skip task=${taskId} reason=already-running`)
    process.stdout.write(`task ${taskId} is already running\n`)
    return 0
  }

  const started = stamp()
  const logPath = join(LOG_DIR, `${taskId.replace(/[^\w.-]/g, '_')}-${started}.log`)
  let exitCode = 1
  try {
    const environment = await launchEnvironment()
    const overlay = await writeOverlay(catalog.profileFile, task)
    const cwd = task.cwd ?? process.cwd()
    if (!existsSync(cwd)) throw new Error(`working directory ${cwd} does not exist`)

    await mkdir(REPORT_DIR, { recursive: true })
    const prompt = await readFile(join(ROOT, task.promptFile), 'utf8')
    const args = ['--profile', 'headless', '--patch', overlay, '--json']
    if (task.resumeSessionId) args.push('--session-id', task.resumeSessionId)
    args.push(prompt)
    const maxAttempts = Math.max(1, Math.min(3, Number(task.retries ?? 2) + 1))

    let transcript = ''
    for (let index = 0; index < maxAttempts; index += 1) {
      const result = await attempt({ environment, cwd, args, logPath, timeoutMs: runTimeoutMs(task) })
      exitCode = result.exitCode
      transcript = result.transcript
      if (exitCode === 0) break
      if (index === maxAttempts - 1 || !isRetryable(transcript)) break
      const delayMs = 15_000 * (index + 1)
      await appendLine(logPath, `\n[retry] transient failure; retrying in ${delayMs / 1000}s (attempt ${index + 2}/${maxAttempts})\n`)
      await appendLine(CRON_LOG, `[${stamp()}] retry task=${taskId} attempt=${index + 2} reason=transient`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    const sessionId = /"sessionId":"([^"]+)"/.exec(transcript)?.[1] ?? 'unknown'
    const outcome = exitCode === 0 ? 'ok' : `failed(exit ${exitCode})`
    await appendLine(CRON_LOG, `[${started}] ${outcome} task=${taskId} session=${sessionId} log=${logPath}`)
    await pruneLogs(taskId, task.keepRuns ?? 20)
    process.stdout.write(`task ${taskId}: ${outcome} session=${sessionId}\n`)
  } catch (error) {
    await appendLine(logPath, `runner error: ${error instanceof Error ? error.message : String(error)}\n`)
    await appendLine(CRON_LOG, `[${started}] failed task=${taskId} error=${JSON.stringify(error instanceof Error ? error.message : String(error))} log=${logPath}`)
    process.stderr.write(`runner: ${error instanceof Error ? error.message : String(error)}\n`)
    exitCode = 1
  } finally {
    await release()
  }
  return exitCode
}

const argv = process.argv.slice(2)
const taskFlag = argv.indexOf('--task')
if (taskFlag === -1 || argv[taskFlag + 1] === undefined) {
  process.stderr.write('usage: runner.mjs --task <id>\n')
  process.exit(2)
}
process.exit(await main(argv[taskFlag + 1]))
