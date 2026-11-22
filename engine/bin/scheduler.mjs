#!/usr/bin/env node
/**
 * Nightly Automation scheduler.
 *
 * Keeps the user's crontab in sync with `tasks.json`. The crontab is the
 * execution substrate — cron fires even when the Web UI is stopped — while
 * `tasks.json` stays the human- and UI-editable source of truth. This module is
 * the only writer of the crontab, so the two can never disagree about which
 * tasks are scheduled.
 *
 * Each enabled task owns one managed block, delimited by markers carrying its
 * id. Every line outside those blocks is preserved verbatim, so unrelated cron
 * entries survive repeated syncs.
 *
 * @module nightly-automation/scheduler
 */

import { execFile } from 'node:child_process'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

/** Root of everything this automation owns. */
const ROOT = join(homedir(), '.dsh', 'automation')
const TASKS_FILE = join(ROOT, 'tasks.json')
const RUNNER = join(ROOT, 'bin', 'runner.mjs')
const CRONTAB_BACKUP = join(ROOT, 'state', 'crontab.backup')

/** Marker prefix shared by every block this module writes. */
const MARKER_ID = 'dsh-nightly-automation'

/** Five-field encoding of the schedule kinds the UI offers. */
const CRON_PATTERN = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/

/**
 * Encode one task's schedule as a five-field cron expression.
 * @param schedule - the task's schedule definition.
 * @returns the cron expression, or null when the task should not be scheduled.
 */
export function cronExpressionOf(schedule) {
  if (schedule === null || typeof schedule !== 'object') return null
  switch (schedule.kind) {
    case 'manual':
      return null
    case 'every-minutes': {
      const minutes = Number(schedule.minutes)
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 59) return null
      return `*/${minutes} * * * *`
    }
    case 'hourly': {
      const minute = Number(schedule.minute ?? 0)
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
      return `${minute} * * * *`
    }
    case 'daily': {
      const { hour, minute } = schedule
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
      return `${minute} ${hour} * * *`
    }
    case 'weekly': {
      const { hour, minute, weekdays } = schedule
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
      if (!Array.isArray(weekdays) || weekdays.length === 0) return null
      if (!weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)) return null
      return `${minute} ${hour} * * ${[...weekdays].sort((a, b) => a - b).join(',')}`
    }
    case 'cron': {
      const expression = String(schedule.expression ?? '').trim()
      return CRON_PATTERN.test(expression) ? expression : null
    }
    default:
      return null
  }
}

/**
 * Render one managed block for a task.
 * @param task - task definition.
 * @param expression - its five-field cron expression.
 * @returns the block lines.
 */
function renderBlock(task, expression) {
  return [
    `# >>> ${MARKER_ID}: ${task.id} >>>`,
    `# ${task.title.replace(/[#\r\n]/g, ' ')} — managed by the Nightly Automation settings page.`,
    `${expression} /usr/bin/node ${RUNNER} --task ${task.id}`,
    `# <<< ${MARKER_ID}: ${task.id} <<<`,
  ]
}

/**
 * Split crontab text into its persistent head and one block per managed task.
 *
 * Anything the user wrote outside the markers is carried through untouched; a
 * malformed or duplicated block is dropped rather than merged, so a corrupt file
 * cannot make one task inherit another's schedule.
 * @param text - current crontab text.
 * @returns the preserved lines and the blocks found, keyed by task id.
 */
function splitCrontab(text) {
  const lines = text === '' ? [] : text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const kept = []
  const blocks = new Map()
  for (let index = 0; index < lines.length; index += 1) {
    const open = new RegExp(`^# >>> ${MARKER_ID}: (.+) >>>$`).exec(lines[index])
    if (open === null) {
      kept.push(lines[index])
      continue
    }
    const id = open[1]
    let end = index + 1
    while (end < lines.length && !new RegExp(`^# <<< ${MARKER_ID}: ${id} <<<$`).test(lines[end])) end += 1
    if (end >= lines.length) {
      // Unterminated block: drop the opening marker and resume on the next line
      // so the rest of the table is not swallowed by an orphaned header.
      continue
    }
    blocks.set(id, lines.slice(index + 1, end))
    index = end
  }
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop()
  return { kept, blocks }
}

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
 * Install crontab text, keeping a rollback copy of the previous table.
 * @param text - complete new crontab.
 */
async function writeCrontab(text) {
  const previous = await readCrontab().catch(() => '')
  await writeFile(CRONTAB_BACKUP, previous, { mode: 0o600 })
  const staging = join(ROOT, 'state', 'crontab.next')
  await writeFile(staging, text, { mode: 0o600 })
  try {
    await runFile('/usr/bin/crontab', [staging])
  } finally {
    await unlink(staging).catch(() => {})
  }
}

/**
 * Synchronize the crontab with the task catalog.
 *
 * Disabling a task keeps its block with the job line commented out instead of
 * deleting it, so re-enabling restores the schedule the user chose.
 * @param tasks - the catalog read from `tasks.json`.
 * @returns the resulting crontab text and a per-task status map.
 */
export async function syncCrontab(tasks) {
  const current = await readCrontab()
  const { kept, blocks } = splitCrontab(current)
  const next = [...kept]
  const status = {}
  for (const task of tasks.tasks) {
    const expression = cronExpressionOf(task.schedule)
    if (expression === null && task.schedule?.kind !== 'manual') {
      status[task.id] = { scheduled: false, reason: 'invalid-schedule' }
      continue
    }
    const previous = blocks.get(task.id) ?? []
    if (task.enabled && expression !== null) {
      next.push('', ...renderBlock(task, expression))
      status[task.id] = { scheduled: true, expression }
    } else {
      // Preserve the last expression so switching back on restores the time.
      const remembered = previous.find(line => CRON_PATTERN.test(line.trim()) && !line.trimStart().startsWith('#'))
      const parked = remembered ?? `${expression ?? '0 0 * * *'} /usr/bin/node ${RUNNER} --task ${task.id}`
      next.push('', ...renderBlock(task, `# ${parked.replace(/^#\s*/, '')}`))
      status[task.id] = { scheduled: false, expression: expression ?? null }
    }
    blocks.delete(task.id)
  }
  const text = `${next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
  if (text !== current) await writeCrontab(text)
  return { text, status }
}

/**
 * Read `tasks.json` from disk.
 * @returns the parsed catalog.
 */
export async function readTasks() {
  return JSON.parse(await readFile(TASKS_FILE, 'utf8'))
}

/**
 * Write the catalog back, atomically replacing the old file.
 * @param catalog - complete catalog to persist.
 */
export async function writeTasks(catalog) {
  const staging = `${TASKS_FILE}.next`
  await writeFile(staging, `${JSON.stringify(catalog, null, 2)}\n`, { mode: 0o600 })
  await runFile('/bin/mv', [staging, TASKS_FILE])
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const catalog = await readTasks()
  const { status } = await syncCrontab(catalog)
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
}
