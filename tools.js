/**
 * Nightly Automation — model-facing tools.
 *
 * These are the agent's front door to the same operations the settings panel
 * uses. Every call delegates to the shared `commitTask` / `deleteTask` /
 * `runTask` operations in `index.js`, so validation, the crontab projection,
 * the revision fence and the audit trail cannot drift between the two callers.
 *
 * The tools are registered as plain `ToolDefinition` objects rather than via
 * `defineTool`, so this file needs no dependency on a Harness Client package:
 * the plugin is a linked workspace directory outside the profile's module
 * graph. `output.render` returns the canonical JSON as one text block, which
 * is the same projection the shipped schedule tools use.
 *
 * @module dsh-nightly-automation/tools
 */

import { commitTask, deleteTask, runTask, statusPayload } from './index.js'

/** Stable Cordis plugin name for the tools row. */
export const name = 'nightly-automation-tools'

/** The tool registry is the only service this plugin needs. */
export const inject = ['tools']

/** Render the canonical value as model-facing text. */
function render(args, value) {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** One generic card title for the composer's tool-call row. */
function present(title, kind, rawInput) {
  return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } }
}

/** Wrap an operation so every failure returns a structured value instead of a thrown error. */
async function settle(operation) {
  try {
    return await operation()
  } catch (error) {
    const conflict = error?.code === 'REVISION_CONFLICT'
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ...conflict ? { code: 'REVISION_CONFLICT' } : {},
    }
  }
}

/** Loose output schema: every operation returns an object with `ok` and free-form detail. */
const OBJECT_OUTPUT = {
  schema: { type: 'object', additionalProperties: true, properties: { ok: { type: 'boolean' } }, required: ['ok'] },
  render,
}

/** Schedule parameter, matching the panel's `ScheduleFields` vocabulary. */
const SCHEDULE_PARAMETER = {
  type: 'object',
  required: true,
  description: 'One of: {kind:"daily",hour,minute}, {kind:"weekly",hour,minute,weekdays:[0-6]}, {kind:"hourly",minute}, {kind:"every-minutes",minutes}, {kind:"cron",expression}, or {kind:"manual"}. Times use Asia/Shanghai.',
  properties: {
    kind: { type: 'string', required: true, enum: ['manual', 'every-minutes', 'hourly', 'daily', 'weekly', 'cron'] },
    hour: { type: 'number' },
    minute: { type: 'number' },
    minutes: { type: 'number' },
    weekdays: { type: 'array', items: { type: 'number' } },
    expression: { type: 'string' },
    timeZone: { type: 'string' },
  },
  additionalProperties: false,
}

/** Model selection parameter, matching the profile's provider/model ids. */
const MODEL_PARAMETER = {
  type: 'object',
  required: true,
  description: 'Provider route id and model id as shown by Get /nightly-automation/status (for example wbcn / hy4free).',
  properties: {
    provider: { type: 'string', required: true },
    model: { type: 'string', required: true },
    reasoningEffort: { type: 'string' },
  },
  additionalProperties: false,
}

/** Create or update one automation task. */
export function apply(ctx) {
  ctx.tools.register({
    name: 'automation_task_create',
    description: [
      'Create or update a scheduled automation task. Each firing runs the task in a fresh,',
      'independent DSH Session (or resumes the session named by resumeSessionId).',
      'Returns the saved task, its crontab projection and the new catalog revision.',
      'Use automation_task_list first to see existing ids; pass originalId to update instead of create.',
      'A resumed session cannot carry an agentPreset.',
    ].join(' '),
    parameters: {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "description": "Lowercase id used for the crontab block and log files."
    },
    "originalId": {
      "type": "string",
      "description": "When set, update this existing task instead of creating one."
    },
    "title": {
      "type": "string",
      "description": "Human-readable task name."
    },
    "prompt": {
      "type": "string",
      "description": "The full instruction sent to the model on every run."
    },
    "schedule": {
      "type": "object",
      "description": "One of: {kind:\"daily\",hour,minute}, {kind:\"weekly\",hour,minute,weekdays:[0-6]}, {kind:\"hourly\",minute}, {kind:\"every-minutes\",minutes}, {kind:\"cron\",expression}, or {kind:\"manual\"}. Times use Asia/Shanghai.",
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "manual",
            "every-minutes",
            "hourly",
            "daily",
            "weekly",
            "cron"
          ]
        },
        "hour": {
          "type": "number"
        },
        "minute": {
          "type": "number"
        },
        "minutes": {
          "type": "number"
        },
        "weekdays": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "expression": {
          "type": "string"
        },
        "timeZone": {
          "type": "string"
        }
      },
      "required": [
        "kind"
      ]
    },
    "model": {
      "type": "object",
      "description": "Provider route id and model id as shown by Get /nightly-automation/status (for example wbcn / hy4free).",
      "additionalProperties": false,
      "properties": {
        "provider": {
          "type": "string"
        },
        "model": {
          "type": "string"
        },
        "reasoningEffort": {
          "type": "string"
        }
      },
      "required": [
        "provider",
        "model"
      ]
    },
    "workspace": {
      "type": "string",
      "description": "Absolute working directory; must already exist. Pick one of the workspaces shown in the left sidebar."
    },
    "description": {
      "type": "string"
    },
    "enabled": {
      "type": "boolean",
      "description": "Whether cron fires this task. Defaults to true."
    },
    "agentPreset": {
      "type": "string",
      "description": "Agent preset id (standard/ptc/minimal/cordis/android-re), or omit for none. Mutually exclusive with resumeSessionId."
    },
    "resumeSessionId": {
      "type": "string",
      "description": "Session id to continue on every firing, instead of starting a fresh Session. Mutually exclusive with agentPreset."
    },
    "collect": {
      "type": "object",
      "description": "Optional research configuration: topics, sourceDomains, and a dedupeKey.",
      "additionalProperties": false,
      "properties": {
        "topics": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "sourceDomains": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "dedupeKey": {
          "type": "string"
        }
      }
    },
    "retries": {
      "type": "number",
      "description": "Retries after transient network failures (0-5, default 2)."
    },
    "timeoutHours": {
      "type": "number",
      "description": "Per-run cap in hours (1-8, default 3)."
    },
    "keepRuns": {
      "type": "number",
      "description": "How many transcripts to retain (1-200)."
    },
    "expectedRevision": {
      "type": "string",
      "description": "Revision returned by a prior read; a stale value is refused with REVISION_CONFLICT."
    }
  },
  "required": [
    "id",
    "title",
    "prompt",
    "schedule",
    "model",
    "workspace"
  ]
},
    output: OBJECT_OUTPUT,
    async execute(args) {
      const body = {
        originalId: args.originalId,
        id: args.id,
        title: args.title,
        promptText: args.prompt,
        schedule: args.schedule,
        model: args.model,
        cwd: args.workspace,
        ...args.description === undefined ? {} : { description: args.description },
        ...args.enabled === undefined ? {} : { enabled: args.enabled },
        ...args.agentPreset === undefined ? {} : { agentPreset: args.agentPreset },
        ...args.resumeSessionId === undefined ? {} : { resumeSessionId: args.resumeSessionId },
        ...args.collect === undefined ? {} : { collect: args.collect },
        ...args.retries === undefined ? {} : { retries: args.retries },
        ...args.timeoutHours === undefined ? {} : { timeoutHours: args.timeoutHours },
        ...args.keepRuns === undefined ? {} : { keepRuns: args.keepRuns },
        ...args.expectedRevision === undefined ? {} : { expectedRevision: args.expectedRevision },
      }
      return settle(() => commitTask(body))
    },
    presentCall: args => present(`Create automation task: ${args.title}`, 'other', args),
  })

  ctx.tools.register({
    name: 'automation_task_list',
    description: 'List automation tasks with their schedule, model, agent preset, resume session and next firing time.',
    parameters: {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "includeDisabled": {
      "type": "boolean",
      "description": "Include switched-off tasks. Defaults to true."
    }
  }
},
    output: OBJECT_OUTPUT,
    async execute(args) {
      return settle(async () => {
        const status = await statusPayload()
        const tasks = (args.includeDisabled === false ? status.tasks.filter(task => task.enabled) : status.tasks)
          .map(task => ({
            id: task.id,
            title: task.title,
            enabled: task.enabled,
            cron: task.cron,
            nextRun: task.nextRun,
            model: task.model,
            agentPreset: task.agentPreset ?? null,
            resumeSessionId: task.resumeSessionId ?? null,
            schedule: task.schedule,
          }))
        return { ok: true, tasks, revision: status.revision }
      })
    },
    presentCall: () => present('List automation tasks', 'read'),
  })

  ctx.tools.register({
    name: 'automation_task_run',
    description: 'Start one automation task immediately. Uses the saved on-disk configuration, exactly as cron would.',
    parameters: {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "description": "Task id returned by automation_task_list or automation_task_create."
    }
  },
  "required": [
    "id"
  ]
},
    output: OBJECT_OUTPUT,
    async execute(args) {
      return settle(() => runTask({ id: args.id }))
    },
    presentCall: args => present(`Run automation task: ${args.id}`, 'other', args),
  })

  ctx.tools.register({
    name: 'automation_task_delete',
    description: 'Delete one automation task and remove its crontab block. Transcripts and reports remain on disk and stay reachable through the settings page history.',
    parameters: {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "description": "Task id to delete."
    },
    "expectedRevision": {
      "type": "string",
      "description": "Optional revision fence from automation_task_list."
    }
  },
  "required": [
    "id"
  ]
},
    output: OBJECT_OUTPUT,
    async execute(args) {
      return settle(() => deleteTask({ id: args.id, expectedRevision: args.expectedRevision }))
    },
    presentCall: args => present(`Delete automation task: ${args.id}`, 'other', args),
  })
}
