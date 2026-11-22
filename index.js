/**
 * Nightly Automation — Host half.
 *
 * Owns everything the browser must not decide: the task catalog, the crontab it
 * is projected into, spawning unattended runs, and reading their transcripts.
 * The Client half is a settings page over these routes.
 *
 * Design rules this file enforces:
 *
 * - `tasks.json` is the source of truth; the crontab is derived. Every mutation
 *   writes the catalog first and then re-syncs, so the two cannot drift.
 * - A run is a separate `dsh --profile headless` process. That is what makes
 *   each firing a fresh Session id, isolated from the Web UI conversation.
 * - Nothing here reads another plugin's internals or writes the profile: the
 *   per-run model overlay is generated from the live profile by the runner.
 *
 * @module dsh-nightly-automation
 */

import { execFile } from 'node:child_process'
import { readFile, readdir, stat, writeFile, mkdir, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

/** Root of everything this automation owns. */
const ROOT = join(homedir(), '.dsh', 'automation')
const STATE_DIR = join(ROOT, 'state')
const LOG_DIR = join(ROOT, 'logs')
const REPORT_DIR = join(ROOT, 'reports')
const PROMPT_DIR = join(ROOT, 'prompts')
const RUNNER = join(ROOT, 'bin', 'runner.mjs')

/** Cap on one transcript or report body returned to the browser. */
const MAX_TEXT_BYTES = 256 * 1024

/** Loopback authorities the structural fallback accepts. */
const LOOPBACK = new Set(['127.0.0.1', '[::1]', '::1', 'localhost'])

/** Schedule kinds the page can render, and their field requirements. */
const SCHEDULE_KINDS = new Set(['manual', 'every-minutes', 'hourly', 'daily', 'weekly', 'cron'])

/** Reasoning effort ids a provider may name. */
const EFFORT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/

/** Task ids double as cron-block keys and log-file prefixes. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/

// ── request fence ────────────────────────────────────────────────────────────

/**
 * Split an authority value into its parts, defaulting the port from the scheme.
 * @param value - a Host, Origin, or Referer header value.
 * @param fallbackScheme - scheme to assume when the value carries none.
 * @returns the parsed authority, or null when unusable.
 */
function authorityOf(value, fallbackScheme) {
  if (typeof value !== 'string' || value.trim() === '') return null
  let url
  try {
    url = new URL(value.includes('://') ? value : `${fallbackScheme}://${value}`)
  } catch {
    return null
  }
  if (url.username !== '' || url.password !== '') return null
  return {
    scheme: url.protocol.replace(':', ''),
    hostname: url.hostname,
    port: url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port,
  }
}

/**
 * Replica of the kernel's API trust fence, for compositions without a
 * `connection` service: Host-header rebinding defence, cross-site refusal, and
 * an Origin/Referer authority match.
 * @param req - the incoming request.
 * @returns a rejection reason, or undefined when the request is same-machine.
 */
function structuralReason(req) {
  const host = authorityOf(req.headers.host, 'http')
  if (host === null || !LOOPBACK.has(host.hostname)) return 'host-not-loopback'
  const site = String(req.headers['sec-fetch-site'] ?? '').toLowerCase()
  if (site === 'cross-site') return 'cross-site'
  for (const header of ['origin', 'referer']) {
    const raw = req.headers[header]
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const found = authorityOf(raw.trim())
    if (found === null) return `${header}-invalid`
    if (found.scheme !== host.scheme || found.hostname !== host.hostname || found.port !== host.port) {
      return `${header}-mismatch`
    }
  }
  return undefined
}

/**
 * Decide one request against the composition's admission policy when present.
 * @param ctx - plugin context, read per request because services land late.
 * @param req - the incoming request.
 * @returns an HTTP status to reject with, or undefined to proceed.
 */
function rejectionFor(ctx, req) {
  let connection
  try {
    connection = ctx.get('connection')
  } catch {
    connection = undefined
  }
  if (connection !== undefined) {
    try {
      if (typeof connection.admit === 'function') {
        const admission = connection.admit({ headers: req.headers })
        if (admission === undefined) return undefined
        return typeof admission === 'object' && admission !== null ? admission.rejection : 403
      }
      if (typeof connection.requestRejection === 'function') {
        return connection.requestRejection({ headers: req.headers })
      }
    } catch {
      return 503
    }
  }
  return structuralReason(req) === undefined ? undefined : 403
}

// ── task catalog ─────────────────────────────────────────────────────────────

/** Absolute path of the catalog. */
const TASKS_FILE = join(ROOT, 'tasks.json')

/**
 * Read the catalog, rejecting a structurally broken file.
 * @returns the parsed catalog.
 */
async function readCatalog() {
  const parsed = JSON.parse(await readFile(TASKS_FILE, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
    throw new Error('tasks.json has no tasks array')
  }
  if (typeof parsed.profileFile !== 'string') throw new Error('tasks.json has no profileFile')
  return parsed
}

/**
 * Persist the catalog atomically, so a crash cannot leave a half-written file.
 * @param catalog - complete catalog to write.
 */
/**
 * Revision of the on-disk catalog, used to fence edits the way the built-in
 * settings document does. Two panels editing at once must not silently
 * overwrite each other.
 * @returns an opaque revision string.
 */
async function catalogRevision() {
  const text = await readFile(TASKS_FILE, 'utf8')
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * Refuse an edit whose caller started from a different catalog generation.
 * @param body - request body carrying `expectedRevision`.
 */
async function assertRevision(body) {
  if (body?.expectedRevision === undefined) return
  const current = await catalogRevision()
  if (String(body.expectedRevision) !== current) {
    const error = new Error('this task was changed elsewhere; refresh and retry')
    error.code = 'REVISION_CONFLICT'
    throw error
  }
}

async function writeCatalog(catalog) {
  await mkdir(STATE_DIR, { recursive: true })
  const staging = `${TASKS_FILE}.next`
  await writeFile(staging, `${JSON.stringify(catalog, null, 2)}\n`, { mode: 0o600 })
  await runFile('/bin/mv', [staging, TASKS_FILE])
}

/**
 * Append one line to the catalog audit trail. Writes and deletes are the two
 * operations that can empty the catalog, so both are recorded with their
 * before/after task counts; a silent disappearance is otherwise untraceable.
 * @param action - operation name.
 * @param detail - caller-identifying detail, never a secret.
 */
async function audit(action, detail) {
  const line = `[${new Date().toISOString()}] ${action} ${detail}\n`
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(join(STATE_DIR, 'catalog.audit.log'), line, { flag: 'a', mode: 0o600 })
}

/**
 * Validate a schedule object, returning its normalized form.
 * @param schedule - caller-supplied schedule.
 * @returns the normalized schedule.
 */
function validateSchedule(schedule) {
  if (schedule === null || typeof schedule !== 'object') throw new Error('schedule is required')
  if (!SCHEDULE_KINDS.has(schedule.kind)) throw new Error(`unknown schedule kind "${String(schedule.kind)}"`)
  const bounded = (value, label, min, max) => {
    const number = Number(value)
    if (!Number.isInteger(number) || number < min || number > max) {
      throw new Error(`${label} must be a whole number between ${min} and ${max}`)
    }
    return number
  }
  switch (schedule.kind) {
    case 'manual':
      return { kind: 'manual' }
    case 'every-minutes':
      return { kind: 'every-minutes', minutes: bounded(schedule.minutes, 'interval minutes', 1, 59) }
    case 'hourly':
      return { kind: 'hourly', minute: bounded(schedule.minute ?? 0, 'minute', 0, 59) }
    case 'daily':
      return {
        kind: 'daily',
        hour: bounded(schedule.hour, 'hour', 0, 23),
        minute: bounded(schedule.minute, 'minute', 0, 59),
        timeZone: String(schedule.timeZone ?? 'Asia/Shanghai'),
      }
    case 'weekly': {
      const weekdays = Array.isArray(schedule.weekdays) ? schedule.weekdays.map(day => bounded(day, 'weekday', 0, 6)) : []
      if (weekdays.length === 0) throw new Error('weekdays must name at least one day')
      if (new Set(weekdays).size !== weekdays.length) throw new Error('weekdays must not repeat')
      return {
        kind: 'weekly',
        hour: bounded(schedule.hour, 'hour', 0, 23),
        minute: bounded(schedule.minute, 'minute', 0, 59),
        weekdays: [...weekdays].sort((a, b) => a - b),
        timeZone: String(schedule.timeZone ?? 'Asia/Shanghai'),
      }
    }
    case 'cron': {
      const expression = String(schedule.expression ?? '').trim()
      if (!/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(expression)) {
        throw new Error('a cron expression needs exactly five fields')
      }
      return { kind: 'cron', expression, timeZone: String(schedule.timeZone ?? 'Asia/Shanghai') }
    }
    default:
      throw new Error(`unsupported schedule kind "${schedule.kind}"`)
  }
}

/**
 * Validate a model selection against the providers the profile actually declares.
 * @param model - caller-supplied model selection.
 * @param profileText - the live profile patch text.
 * @returns the normalized selection.
 */
/**
 * Read the `llm-pi-ai` providers block from the live profile.
 *
 * Both the save validator and the editor's dropdown use this one parser, so a
 * model the UI offers is always a model the Host will accept. The block is
 * found by entry id rather than by a fixed indentation width, which survives a
 * YAML re-serialization from the Web model settings page.
 * @param profileText - full profile patch text.
 * @returns provider routes keyed by id, each with its declared model ids.
 */
function parseProviders(profileText) {
  const lines = profileText.split('\n')
  const start = lines.findIndex(line => line.trim() === '- id: llm-pi-ai')
  if (start === -1) return new Map()
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^- /.test(lines[index])) { end = index; break }
  }
  const routes = new Map()
  let providersIndent = null
  let current = null
  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index]
    if (/^\s*providers:\s*$/.test(line)) { providersIndent = line.search(/\S/); continue }
    if (providersIndent === null) continue
    const indent = line.search(/\S/)
    if (indent === -1) continue
    if (indent <= providersIndent) { providersIndent = null; current = null; continue }
    const route = /^(\s+)([\w-]+):\s*$/.exec(line)
    if (route !== null && route[1].length === providersIndent + 2) {
      current = { id: route[2], models: [] }
      routes.set(current.id, current)
      continue
    }
    const model = /^\s*- id:\s*(\S+)\s*$/.exec(line)
    if (model !== null && current !== null && indent > providersIndent + 2) {
      current.models.push(model[1])
    }
  }
  return routes
}

function validateModel(model, profileText) {
  if (model === null || typeof model !== 'object') throw new Error('model is required')
  const provider = String(model.provider ?? '')
  const name = String(model.model ?? '')
  if (!ID_PATTERN.test(provider)) throw new Error('provider must be a lowercase id')
  if (!/^[\w./@+-]{1,96}$/.test(name)) throw new Error('model must be a model id')
  const routes = parseProviders(profileText)
  const route = routes.get(provider)
  if (route === undefined) {
    throw new Error(`provider "${provider}" is not configured in the deployment profile`)
  }
  // A stale model id would fail only at dispatch, hours later. Refuse it here.
  if (route.models.length > 0 && !route.models.includes(name)) {
    throw new Error(`model "${name}" is not offered by provider "${provider}"; choose one of: ${route.models.join(', ')}`)
  }
  const selection = { provider, model: name }
  const effort = model.reasoningEffort
  if (effort !== undefined && effort !== null && effort !== '') {
    if (!EFFORT_PATTERN.test(String(effort))) throw new Error('reasoningEffort must be a lowercase effort id')
    selection.reasoningEffort = String(effort)
  }
  return selection
}

/**
 * Normalize one task document, creating ids and prompt files as needed.
 * @param input - caller-supplied task fields.
 * @param existing - the task being replaced, when editing.
 * @param profileText - live profile text for provider validation.
 * @returns the normalized task.
 */
/** Ids of agent presets declared in the deployment's profile text. */
function presetInventory(profileText) {
  const presets = []
  for (const line of profileText.split('\n')) {
    const row = /^- id: preset-([\w-]+)$/.exec(line)
    if (row === null) continue
    const id = row[1]
    if (presets.some(entry => entry.id === id)) continue
    presets.push({ id })
  }
  // Shipped compositions include these even when a profile patch does not spell
  // the row out; keeping the list explicit makes the UI's options stable.
  for (const id of ['standard', 'ptc', 'minimal', 'cordis', 'android-re']) {
    if (!presets.some(entry => entry.id === id)) presets.push({ id })
  }
  return presets
}

/**
 * Sessions that headless can adopt: persisted, root sessions whose recorded cwd
 * matches one of the task working directories. A session with an agent preset
 * is excluded because the one-shot runner refuses to adopt it.
 * @param catalog - current task catalog.
 * @returns descriptors for the UI's resume picker.
 */
async function resumableSessions(catalog) {
  const allowed = new Set(catalog.tasks.map(task => task.cwd))
  const root = join(homedir(), '.dsh', 'sessions')
  const result = []
  let groups
  try { groups = await readdir(root) } catch { return result }
  for (const group of groups) {
    const directory = join(root, group)
    let names
    try { names = await readdir(directory) } catch { continue }
    for (const name of names) {
      if (!name.startsWith('session-')) continue
      const file = join(directory, name, 'session.v4.jsonl.zstd')
      let text
      try {
        const { stdout } = await runFile('/usr/bin/zstd', ['-dc', file], { maxBuffer: 4 * 1024 * 1024 })
        text = stdout
      } catch { continue }
      const first = text.split('\n')[0]
      let header
      try { header = JSON.parse(first) } catch { continue }
      if (header?.type !== 'session' || header.agentPreset !== undefined) continue
      if (header.parentSession !== undefined || header.origin === 'subagent') continue
      if (typeof header.cwd !== 'string' || !allowed.has(header.cwd)) continue
      result.push({ id: header.id, cwd: header.cwd, createdAt: header.createdAt })
    }
  }
  return result.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0)).slice(0, 100)
}

/** Validate the collection-specific configuration carried by a research task. */
function validateCollect(value, existing) {
  if (value === undefined) return existing?.collect ?? null
  if (value === null) return null
  if (value === null || typeof value !== 'object') throw new Error('collect must be an object or null')
  const strings = key => {
    const list = Array.isArray(value[key]) ? value[key] : []
    const cleaned = list.map(entry => String(entry ?? '').trim()).filter(Boolean)
    if (cleaned.length === 0) throw new Error(`collect.${key} must name at least one value`)
    return [...new Set(cleaned)]
  }
  return {
    topics: strings('topics'),
    sourceDomains: strings('sourceDomains'),
    dedupeKey: String(value.dedupeKey ?? existing?.collect?.dedupeKey ?? 'url+year+subject').trim() || 'url+year+subject',
  }
}

async function normalizeTask(input, existing, profileText) {
  const id = existing?.id ?? String(input.id ?? '').trim().toLowerCase()
  if (!ID_PATTERN.test(id)) throw new Error('id must be lowercase letters, digits and dashes, starting with a letter or digit')
  const title = String(input.title ?? existing?.title ?? '').trim()
  if (title === '') throw new Error('title must not be empty')
  if (title.length > 120) throw new Error('title must be at most 120 characters')

  const promptFile = existing?.promptFile ?? `prompts/${id}.md`
  const promptText = input.promptText
  if (typeof promptText === 'string' && promptText.trim() === '') {
    throw new Error('promptText must not be empty')
  }

  // Every validation runs before any write. A rejected save used to leave the
  // prompt file already overwritten while tasks.json still held the old task,
  // so the next scheduled run silently mixed a new prompt with old settings.
  const cwd = String(input.cwd ?? existing?.cwd ?? process.cwd())
  const info = await stat(cwd).catch(() => undefined)
  if (info === undefined || !info.isDirectory()) throw new Error(`working directory ${cwd} does not exist`)
  const schedule = input.schedule === undefined && existing !== undefined
    ? existing.schedule
    : validateSchedule(input.schedule)
  const model = input.model === undefined && existing !== undefined
    ? existing.model
    : validateModel(input.model, profileText)
  const presets = presetInventory(profileText)
  const agentPreset = input.agentPreset === undefined
    ? (existing?.agentPreset ?? null)
    : (input.agentPreset === null || input.agentPreset === '' ? null : String(input.agentPreset))
  if (agentPreset !== null && !presets.some(entry => entry.id === agentPreset)) {
    throw new Error(`agent preset "${agentPreset}" is not available in this deployment`)
  }
  const resumeSessionId = input.resumeSessionId === undefined
    ? (existing?.resumeSessionId ?? null)
    : (input.resumeSessionId === null || String(input.resumeSessionId).trim() === '' ? null : String(input.resumeSessionId).trim())
  if (resumeSessionId !== null && !/^session-[\w-]+$/.test(resumeSessionId)) {
    throw new Error('resumeSessionId must be a session id')
  }
  if (resumeSessionId !== null && agentPreset !== null) {
    throw new Error('a resumed session cannot carry an agent preset; clear one of the two')
  }
  const collect = validateCollect(input.collect, existing)

  if (typeof promptText === 'string' || existing === undefined) {
    const content = typeof promptText === 'string'
      ? promptText
      : '# Describe what this task should do each run.\n'
    await mkdir(PROMPT_DIR, { recursive: true })
    await writeFile(join(ROOT, promptFile), content, { mode: 0o600 })
  }

  return {
    id,
    title,
    description: String(input.description ?? existing?.description ?? '').slice(0, 500),
    enabled: input.enabled === undefined ? (existing?.enabled ?? true) : input.enabled === true,
    schedule,
    model,
    cwd,
    promptFile,
    keepRuns: Number.isInteger(input.keepRuns) ? Math.max(1, Math.min(200, input.keepRuns)) : (existing?.keepRuns ?? 20),
    retries: Number.isInteger(input.retries) ? Math.max(0, Math.min(5, input.retries)) : (existing?.retries ?? 2),
    timeoutHours: Number.isFinite(Number(input.timeoutHours)) && Number(input.timeoutHours) > 0
      ? Math.max(1, Math.min(8, Number(input.timeoutHours)))
      : (existing?.timeoutHours ?? 3),
    agentPreset,
    resumeSessionId,
    collect,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
}

// ── scheduling ───────────────────────────────────────────────────────────────

/**
 * Encode a schedule as a five-field cron expression.
 * @param schedule - normalized schedule.
 * @returns the expression, or null when the task is manual.
 */
export function cronExpressionOf(schedule) {
  switch (schedule.kind) {
    case 'manual':
      return null
    case 'every-minutes':
      return `*/${schedule.minutes} * * * *`
    case 'hourly':
      return `${schedule.minute} * * * *`
    case 'daily':
      return `${schedule.minute} ${schedule.hour} * * *`
    case 'weekly':
      return `${schedule.minute} ${schedule.hour} * * ${schedule.weekdays.join(',')}`
    case 'cron':
      return schedule.expression
    default:
      return null
  }
}

/**
 * Does one cron field match a candidate date part?
 *
 * Supports the exact dialect `validateSchedule` accepts for custom rules and
 * every expression `cronExpressionOf` emits: `*`, a plain number, a range, a
 * a star value, a plain number, a range, a stepped value, and
 * comma-separated lists of those forms.
 * @param field - the cron field text.
 * @param value - the candidate part.
 * @param lowDefault - inclusive lower bound when the field carries none.
 * @param highDefault - inclusive upper bound when the field carries none.
 * @returns whether the field matches.
 */
function cronFieldMatches(field, value, lowDefault, highDefault) {
  return field.split(',').some(part => {
    if (part === '*') return true
    const [range, stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) return false
    let low = lowDefault
    let high = highDefault
    if (range !== '*' && range !== '') {
      const [startText, endText] = range.split('-')
      low = Number(startText)
      high = endText === undefined ? low : Number(endText)
    }
    if (![low, high, step].every(Number.isFinite)) return false
    if (value < low || value > high) return false
    return (value - low) % step === 0
  })
}

/**
 * Compute the next local wall-clock instant a schedule fires, so the task list
 * can answer "when will this actually run?" without the browser owning a second
 * copy of the cron rules. The crank advances in one-minute steps over at most
 * eight days; every supported rule is minute-granular, so a bounded walk is
 * exact for this set.
 * @param schedule - normalized schedule.
 * @param enabled - whether the task is switched on.
 * @returns an ISO instant, or null when the task will not fire automatically.
 */
export function nextRunOf(schedule, enabled) {
  if (!enabled) return null
  const expression = cronExpressionOf(schedule)
  if (expression === null) return null
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const now = new Date()
  for (let offset = 1; offset <= 8 * 24 * 60; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 60_000)
    if (!cronFieldMatches(fields[0], candidate.getMinutes(), 0, 59)) continue
    if (!cronFieldMatches(fields[1], candidate.getHours(), 0, 23)) continue
    if (!cronFieldMatches(fields[2], candidate.getDate(), 1, 31)) continue
    if (!cronFieldMatches(fields[3], candidate.getMonth() + 1, 1, 12)) continue
    if (!cronFieldMatches(fields[4], candidate.getDay(), 0, 7)) continue
    return candidate.toISOString()
  }
  return null
}

const MARKER = 'dsh-nightly-automation'
const JOB_LINE = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+.*runner\.mjs --task (\S+)\s*$/

/**
 * Read the user's crontab.
 * @returns the crontab text, or an empty string when none is installed.
 */
async function readCrontab() {
  try {
    return (await runFile('/usr/bin/crontab', ['-l'])).stdout
  } catch (error) {
    if (/no crontab/.test(String(error?.stderr ?? ''))) return ''
    throw error
  }
}

/**
 * Render one managed block for a task.
 * @param task - task definition.
 * @param expression - five-field expression, possibly commented out.
 * @returns the block lines.
 */
function renderBlock(task, expression) {
  const comment = `# ${task.title.replace(/[#\r\n]/g, ' ')} — managed by the Nightly Automation settings page.`
  return [
    `# >>> ${MARKER}: ${task.id} >>>`,
    comment,
    `${expression} /usr/bin/node ${RUNNER} --task ${task.id}`,
    `# <<< ${MARKER}: ${task.id} <<<`,
  ]
}

/**
 * Split crontab text into preserved lines and one block per managed task.
 *
 * A block carries the last expression it was given even while its job line is
 * commented out, which is how a disabled task keeps its time.
 * @param text - current crontab text.
 * @returns the preserved lines plus each block's remembered expression.
 */
function splitCrontab(text) {
  const lines = text === '' ? [] : text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const kept = []
  const blocks = new Map()
  for (let index = 0; index < lines.length; index += 1) {
    // The unsuffixed marker is a pre-catalog (v1) block: recognize and drop it
    // so an upgrade never leaves a second firing of the same work behind.
    if (lines[index].trim() === `# >>> ${MARKER} >>>`) {
      const end = lines.indexOf(`# <<< ${MARKER} <<<`, index)
      index = end === -1 ? lines.length : end
      continue
    }
    const open = new RegExp(`^# >>> ${MARKER}: (\\S+) >>>$`).exec(lines[index])
    if (open === null) {
      kept.push(lines[index])
      continue
    }
    const id = open[1]
    let end = index + 1
    while (end < lines.length && lines[end].trim() !== `# <<< ${MARKER}: ${id} <<<`) end += 1
    if (end >= lines.length) continue
    const job = lines.slice(index + 1, end)
    const active = job.find(line => JOB_LINE.test(line))
    const parked = job.map(line => JOB_LINE.exec(line.trim().replace(/^#\s*/, ''))).find(match => match !== null)
    const match = active === undefined ? parked : JOB_LINE.exec(active)
    blocks.set(id, match === null || match === undefined ? null : match.slice(1, 6).join(' '))
    index = end
  }
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop()
  return { kept, blocks }
}

/**
 * Project the catalog into the crontab, preserving every foreign line.
 * @param catalog - the catalog to project.
 * @returns the resulting text plus per-task scheduling status.
 */
async function syncCrontab(catalog) {
  const current = await readCrontab()
  const { kept, blocks } = splitCrontab(current)
  const next = [...kept]
  const status = {}
  for (const task of catalog.tasks) {
    const expression = cronExpressionOf(task.schedule)
    if (task.enabled && expression !== null) {
      next.push('', ...renderBlock(task, expression))
      status[task.id] = { scheduled: true, expression }
    } else {
      // Park the task's *current* expression so a schedule edited while the
      // task is off takes effect the moment it is switched back on; only a
      // manual task falls back to whatever the block held before.
      const parked = expression ?? blocks.get(task.id) ?? '0 0 * * *'
      next.push('', ...renderBlock(task, `# ${parked}`))
      status[task.id] = { scheduled: false, expression, reason: expression === null ? 'manual' : 'disabled' }
    }
  }
  const text = `${next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
  if (text !== current) {
    await mkdir(STATE_DIR, { recursive: true })
    await writeFile(join(STATE_DIR, 'crontab.backup'), current, { mode: 0o600 })
    const staging = join(STATE_DIR, 'crontab.next')
    await writeFile(staging, text, { mode: 0o600 })
    try {
      await runFile('/usr/bin/crontab', [staging])
    } finally {
      await unlink(staging).catch(() => {})
    }
  }
  return status
}

// ── run inspection ───────────────────────────────────────────────────────────

/**
 * Is a task's run lock currently held by a live process?
 * @param taskId - the task to inspect.
 * @returns true when a run of that task is in progress.
 */
async function isRunning(taskId) {
  const path = join(STATE_DIR, `${taskId.replace(/[^\w.-]/g, '_')}.lock`)
  let pid
  try {
    pid = Number((await readFile(path, 'utf8')).trim())
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    // The owning process died without releasing the lock; clear it so the next
    // firing is not blocked forever.
    await unlink(path).catch(() => {})
    return false
  }
}

/**
 * Parse the newest cron.log line for one task.
 * @param taskId - the task to summarize.
 * @returns the last outcome, or null when the task has never run.
 */
async function lastRunOf(taskId) {
  let text
  try {
    text = await readFile(join(LOG_DIR, 'cron.log'), 'utf8')
  } catch {
    return null
  }
  const lines = text.trimEnd().split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line.includes(`task=${taskId}`)) continue
    const stamp = /^\[(\d{8}T\d{6})\]/.exec(line)?.[1]
    const outcome = /\b(ok|failed|skip)\b/.exec(line)?.[1]
    const session = /session=(\S+)/.exec(line)?.[1]
    const log = /log=(\S+)/.exec(line)?.[1]
    return {
      stamp: stamp ?? null,
      ok: outcome === 'ok',
      skipped: outcome === 'skip',
      sessionId: session === undefined || session === 'unknown' ? null : session,
      log: log ?? null,
    }
  }
  return null
}

/**
 * List one task's transcripts, newest first.
 * @param taskId - the task to list.
 * @returns log file descriptors.
 */
async function runsOf(taskId) {
  let names
  try {
    names = await readdir(LOG_DIR)
  } catch {
    return []
  }
  const prefix = `${taskId.replace(/[^\w.-]/g, '_')}-`
  const runs = []
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.log')) continue
    const info = await stat(join(LOG_DIR, name)).catch(() => undefined)
    if (info === undefined || !info.isFile()) continue
    runs.push({ name, bytes: info.size, modifiedAt: new Date(info.mtimeMs).toISOString() })
  }
  return runs.sort((left, right) => (left.name < right.name ? 1 : -1))
}

/**
 * List the reports a task has written, newest first.
 * @param taskId - the task to list.
 * @returns report file descriptors.
 */
async function reportsOf(taskId) {
  let names
  try {
    names = await readdir(REPORT_DIR)
  } catch {
    return []
  }
  const reports = []
  for (const name of names) {
    if (!name.startsWith(`${taskId}-`) || !name.endsWith('.md')) continue
    const info = await stat(join(REPORT_DIR, name)).catch(() => undefined)
    if (info === undefined || !info.isFile()) continue
    reports.push({ name, bytes: info.size, modifiedAt: new Date(info.mtimeMs).toISOString() })
  }
  return reports.sort((left, right) => (left.name < right.name ? 1 : -1))
}

/**
 * Read one file from an owned directory, refusing traversal and oversized bodies.
 * @param directory - the only directory the read may touch.
 * @param name - caller-supplied file name.
 * @returns the file text.
 */
async function readOwnedFile(directory, name) {
  const safe = basename(String(name ?? ''))
  if (safe !== name || !/^[\w.-]+$/.test(safe)) throw new Error('invalid file name')
  const path = join(directory, safe)
  const info = await stat(path)
  if (!info.isFile()) throw new Error('not a file')
  if (info.size > MAX_TEXT_BYTES) throw new Error('file too large to display')
  return await readFile(path, 'utf8')
}

/**
 * Read a task's current prompt text.
 * @param task - task definition.
 * @returns the prompt text, or an empty string when the file is missing.
 */
async function promptOf(task) {
  return await readFile(join(ROOT, task.promptFile), 'utf8').catch(() => '')
}

/**
 * Build the full state the page renders.
 * @returns tasks with their live status.
 */
/**
 * Records left behind by tasks that no longer exist in the catalog.
 *
 * Deletion deliberately keeps transcripts and reports on disk, but the list
 * page only renders live tasks, so those files were previously unreachable.
 * @param catalog - the current task catalog.
 * @returns orphaned run and report descriptors, newest first.
 */
async function orphanRecords(catalog) {
  const live = new Set(catalog.tasks.map(task => task.id.replace(/[^\w.-]/g, '_')))
  const orphans = []
  for (const [directory, kind, pattern] of [
    [LOG_DIR, 'run', /^([\w.-]+)-\d{8}T\d{6}\.log$/],
    [REPORT_DIR, 'report', /^([\w.-]+)-.*\.md$/],
  ]) {
    let names
    try { names = await readdir(directory) } catch { continue }
    for (const name of names) {
      const match = pattern.exec(name)
      if (match === null || live.has(match[1])) continue
      const info = await stat(join(directory, name)).catch(() => undefined)
      if (info === undefined || !info.isFile()) continue
      orphans.push({
        name,
        kind,
        taskId: match[1],
        bytes: info.size,
        modifiedAt: new Date(info.mtimeMs).toISOString(),
      })
    }
  }
  // A rehearsal report carries no task prefix; keep it reachable too.
  try {
    for (const name of await readdir(REPORT_DIR)) {
      if (!name.endsWith('.md') || /^[\w.-]+-.*\.md$/.test(name)) continue
      const info = await stat(join(REPORT_DIR, name)).catch(() => undefined)
      if (info === undefined || !info.isFile() || orphans.some(entry => entry.name === name)) continue
      orphans.push({ name, kind: 'report', taskId: null, bytes: info.size, modifiedAt: new Date(info.mtimeMs).toISOString() })
    }
  } catch { /* report directory absent */ }
  return orphans.sort((left, right) => (left.name < right.name ? 1 : -1))
}

export async function statusPayload() {
  const catalog = await readCatalog()
  const profileText = await readFile(catalog.profileFile, 'utf8').catch(() => '')
  const tasks = []
  for (const task of catalog.tasks) {
    tasks.push({
      ...task,
      promptText: await promptOf(task),
      running: await isRunning(task.id),
      lastRun: await lastRunOf(task.id),
      runs: await runsOf(task.id),
      reports: await reportsOf(task.id),
      cron: cronExpressionOf(task.schedule),
      nextRun: nextRunOf(task.schedule, task.enabled),
    })
  }
  return {
    tasks,
    providers: providerInventory(profileText),
    presets: presetInventory(profileText),
    sessions: await resumableSessions(catalog),
    paths: { automation: ROOT, profile: catalog.profileFile },
    orphans: await orphanRecords(catalog),
    revision: await catalogRevision(),
  }
}

/**
 * Enumerate the provider routes and model ids the profile declares.
 *
 * Read from the profile rather than hardcoded, so a model added to the
 * deployment appears in the task editor without a plugin change.
 * @param profileText - the live profile patch text.
 * @returns provider entries with their model ids.
 */
function providerInventory(profileText) {
  return [...parseProviders(profileText).values()]
    .filter(provider => provider.models.length > 0)
    .map(({ id, models }) => ({ id, models }))
}

// ── shared operations (HTTP and agent tools both call these) ─────────────────

/**
 * Create or update one task. The only write path for the catalog: it validates,
 * writes the prompt, persists the catalog, projects crontab and records an
 * audit line, in that order.
 * @param body - normalized request fields (may include expectedRevision).
 * @returns the accepted task, scheduling status and new revision.
 */
export async function commitTask(body) {
  await assertRevision(body)
  const catalog = await readCatalog()
  const profileText = await readFile(catalog.profileFile, 'utf8')
  const existing = body?.originalId === undefined
    ? undefined
    : catalog.tasks.find(task => task.id === body.originalId)
  if (body?.originalId !== undefined && existing === undefined) throw new Error('task not found')
  const task = await normalizeTask(body, existing, profileText)
  if (existing === undefined && catalog.tasks.some(candidate => candidate.id === task.id)) {
    throw new Error(`a task with id "${task.id}" already exists`)
  }
  catalog.tasks = existing === undefined
    ? [...catalog.tasks, task]
    : catalog.tasks.map(candidate => (candidate.id === existing.id ? task : candidate))
  await writeCatalog(catalog)
  await audit('write', `id=${task.id} action=${existing === undefined ? 'create' : 'update'} tasks=${catalog.tasks.length}`)
  return {
    ok: true,
    task,
    status: await syncCrontab(catalog),
    revision: await catalogRevision(),
  }
}

/**
 * Delete one task by id, keeping its transcripts and reports on disk.
 * @param body - request carrying `id` and optional `expectedRevision`.
 * @returns the resulting scheduling status.
 */
export async function deleteTask(body) {
  await assertRevision(body)
  const catalog = await readCatalog()
  const id = String(body?.id ?? '')
  if (!catalog.tasks.some(task => task.id === id)) throw new Error('task not found')
  catalog.tasks = catalog.tasks.filter(task => task.id !== id)
  await writeCatalog(catalog)
  await audit('delete', `id=${id} tasks=${catalog.tasks.length}`)
  return { ok: true, status: await syncCrontab(catalog), revision: await catalogRevision() }
}

/**
 * Start one task now, detached from the caller's lifetime.
 * @param body - request carrying `id`.
 * @returns a success marker.
 */
export async function runTask(body) {
  const id = String(body?.id ?? '')
  const catalog = await readCatalog()
  if (!catalog.tasks.some(task => task.id === id)) throw new Error('task not found')
  await launch(id)
  return { ok: true }
}

// ── http surface ─────────────────────────────────────────────────────────────

/**
 * Send one JSON response.
 * @param res - the response to own.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/**
 * Read a request body as UTF-8, refusing oversized payloads.
 * @param req - the request to drain.
 * @param limitBytes - maximum accepted size.
 * @returns the decoded body.
 */
async function readBody(req, limitBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > limitBytes) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Launch one task now, detached from this request's lifetime.
 * @param taskId - the task to run.
 */
async function launch(taskId) {
  if (await isRunning(taskId)) throw new Error('this task is already running')
  const child = execFile('/usr/bin/node', [RUNNER, '--task', taskId], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

/**
 * Route one request inside the plugin's namespace.
 * @param ctx - plugin context.
 * @param req - the incoming request.
 * @param res - the response to own.
 */
async function handle(ctx, req, res) {
  const rejection = rejectionFor(ctx, req)
  if (rejection !== undefined) {
    res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(rejection === 401 ? 'unauthorized' : rejection === 503 ? 'admission unavailable' : 'forbidden')
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  const route = url.pathname.replace(/^\/nightly-automation/, '') || '/'
  try {
    if (req.method === 'GET' && route === '/status') {
      sendJson(res, 200, { ok: true, ...await statusPayload() })
      return
    }

    if (req.method === 'GET' && route === '/text') {
      const kind = url.searchParams.get('kind')
      const name = url.searchParams.get('name') ?? ''
      const directory = kind === 'report' ? REPORT_DIR : kind === 'run' ? LOG_DIR : undefined
      if (directory === undefined) {
        sendJson(res, 400, { ok: false, error: 'kind must be report or run' })
        return
      }
      sendJson(res, 200, { ok: true, name, text: await readOwnedFile(directory, name) })
      return
    }

    if (req.method === 'POST' && route === '/task') {
      sendJson(res, 200, await commitTask(JSON.parse(await readBody(req, 512 * 1024))))
      return
    }

    if (req.method === 'POST' && route === '/delete') {
      sendJson(res, 200, await deleteTask(JSON.parse(await readBody(req, 8 * 1024))))
      return
    }

    if (req.method === 'POST' && route === '/run') {
      sendJson(res, 200, await runTask(JSON.parse(await readBody(req, 8 * 1024))))
      return
    }

    sendJson(res, 404, { ok: false, error: 'unknown route' })
  } catch (error) {
    const conflict = error?.code === 'REVISION_CONFLICT'
    sendJson(res, conflict ? 409 : 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ...conflict ? { code: 'REVISION_CONFLICT' } : {},
    })
  }
}

/**
 * Mount the plugin's HTTP surface on the composed Web carrier.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (scoped) => {
    scoped.effect(() => scoped.webServer.register({
      kind: 'prefix',
      path: '/nightly-automation',
      handler: (req, res) => handle(ctx, req, res),
    }), 'nightly-automation: routes')
  })
}
