/**
 * Nightly automation — browser half.
 */
window.__ModuleLoader__.load({
  id: 'dsh-nightly-automation',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const { createElement: h, Fragment, useState, useEffect, useCallback, useRef } = React
    const NS = 'settings.nightlyAutomation'
    const BASE = '/nightly-automation'

    /** App-wide notice owned by the shell overlay, not by the settings panel. */
    const toastStore = {
      value: undefined,
      listeners: new Set(),
      set(notice) {
        this.value = notice
        for (const listener of this.listeners) listener()
      },
      subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) },
    }

    // ── copy ────────────────────────────────────────────────────────────────
    const DICT = {
      zh: {
        nav: '夜间自动化',
        title: '夜间自动化',
        subtitle: '把重复性的研究、清理与打磨交给定时任务：每次运行都是一个独立会话，跑完留下记录和报告。',
        loading: '正在读取…',
        loadFailed: '无法读取自动化任务',
        retry: '重试',
        'tasks.title': '任务',
        'tasks.new': '新建任务',
        'tasks.empty': '还没有任务。新建一个，它会按你设定的时间自动运行。',
        'tasks.enabled': '已启用',
        'tasks.disabled': '已停用',
        'tasks.manual': '仅手动',
        'tasks.next': '下次运行',
        'tasks.never': '不自动运行',
        'tasks.running': '正在运行',
        'tasks.last': '上次',
        'tasks.none': '未运行过',
        'run.ok': '成功',
        'run.failed': '失败',
        'tasks.open': '打开任务设置：{title}',
        'task.new': '新任务',
        'task.edit': '任务设置',
        'task.back': '返回列表',
        'task.id': '标识',
        'task.idHint': '小写字母、数字和短横线。用于 cron 区块和日志文件名，创建后不可改。',
        'task.title': '名称',
        'task.titleHint': '显示在列表、cron 注释和运行记录里。',
        'task.desc': '说明',
        'task.enabled': '启用自动运行',
        'task.schedule': '运行时间',
        'task.kind': '频率',
        'kind.manual': '仅手动（不排期）',
        'kind.every-minutes': '每隔 N 分钟',
        'kind.hourly': '每小时',
        'kind.daily': '每天',
        'kind.weekly': '每周',
        'kind.cron': '自定义 cron',
        'task.hour': '时',
        'task.minute': '分',
        'task.minutes': '间隔（分钟）',
        'task.weekdays': '星期',
        'task.cron': 'cron 表达式',
        'task.cronHint': '五个字段：分 时 日 月 星期。例如 0 23 * * * 是每天 23:00。',
        'task.zone': '时区',
        'task.model': '模型',
        'task.provider': '供应商',
        'task.modelId': '模型',
        'task.effort': '思考强度',
        'task.effortDefault': '默认',
        'task.cwd': '工作目录',
        'task.cwdHint': '任务在这个目录里运行。选左侧工作区里的一个，或用“浏览…”挑一个目录。',
        'task.cwdWorkspaces': '从工作区选择',
        'task.cwdBrowse': '浏览…',
        'task.cwdBrowsing': '正在选择…',
        'task.cwdOther': '其他目录…',
        'task.cwdBackToWorkspaces': '返回工作区列表',
        'task.cwdUseFirstWorkspace': '改用第一个工作区',
        'task.cwdBrowseCancelled': '未选择目录，路径保持不变',
        'task.cwdEmpty': '还没有工作区。用“浏览…”挑一个目录。',
        'task.prompt': '任务提示词',
        'task.promptHint': '每次运行时完整发给模型。写清楚目标、约束和验收标准。',
        'task.keepRuns': '保留运行记录',
        'task.save': '保存任务',
        'task.saving': '保存中…',
        'task.saved': '任务已保存',
        'task.deleted': '任务已删除',
        'task.cancel': '取消',
        'task.delete': '删除任务',
        'task.deleteConfirm': '确定删除「{title}」？运行记录和报告会保留在磁盘上。',
        'task.deleting': '删除中…',
        'task.running': '现在运行',
        'task.starting': '启动中…',
        'task.started': '已启动，稍后会出现在运行记录里',
        'task.busy': '该任务正在运行',
        'task.basics': '基本信息',
        'task.promptPlaceholder': '描述这个任务每次运行要做什么、约束和验收标准…',
        'task.unsaved': '有未保存的更改',
        'task.unsavedHint': '「立即试跑」使用已保存的配置。请先保存，或点「保存并试跑」。',
        'task.discard': '放弃更改',
        'task.confirmLeave': '有未保存的更改，确定离开并放弃吗？',
        'task.saveFailed': '保存失败，可修改后重试',
        'task.conflict': '任务已在别处被修改，请刷新后重试',
        'task.deleteTitle': '删除任务',
        'task.deleteBody': '将从 crontab 移除「{title}」，此操作不可撤销。运行记录和报告仍保留在磁盘上。',
        'task.deleteKeep': '取消',
        'task.deleteConfirmAction': '删除',
        'task.refresh': '刷新',
        'task.savedAndRun': '保存并试跑',
        'task.saveAndRunning': '保存中…',
        'task.modelMissing': '已存模型（当前配置中已无此项）',
        'task.cronPreview': '等效 cron',
        'task.keepRunsHint': '每个任务最多保留多少份运行记录，超出自动清理最旧的。',
        'task.zone': '时区',
        'task.zoneHint': '按本机时区（Asia/Shanghai）解释。',
        'task.tabSettings': '设置',
        'task.tabRecords': '记录与报告',
        'task.collapse': '收起',
        'task.expand': '展开',
        'task.advanced': '高级设置',
        'task.advancedHint': '模型、思考强度、工作目录、保留份数与时区',
        'tasks.next': '下次自动运行',
        'tasks.never': '不会自动运行',
        'orphans.title': '已删除任务的历史记录',
        'orphans.hint': '这些记录留在磁盘上，即使任务已从列表移除也能查看。',
        'orphans.empty': '没有已删除任务的记录',
        'orphans.show': '查看历史记录',
        'orphans.hide': '收起历史记录',
        'task.validation.id': '请填写标识',
        'task.validation.title': '请填写名称',
        'task.validation.prompt': '请填写任务提示词',
        'weekday.0': '周日',
        'weekday.1': '周一',
        'weekday.2': '周二',
        'weekday.3': '周三',
        'weekday.4': '周四',
        'weekday.5': '周五',
        'weekday.6': '周六',
        'runs.title': '运行记录',
        'runs.empty': '还没有运行记录',
        'runs.hint': '每次运行的完整事件流，包含它自己的会话 id。',
        'reports.title': '报告',
        'reports.empty': '还没有报告',
        'reports.hint': '运行结束时由模型自己写。',
        'viewer.close': '关闭',
        'viewer.loading': '正在读取…',
        'viewer.failed': '读取失败',
        'toast.failed': '操作失败',
        'paths.title': '位置',
        'paths.automation': '自动化目录',
        'paths.profile': '模型配置',
        'schema.loading': '正在加载任务…',
      },
      en: {
        nav: 'Nightly Automation',
        title: 'Nightly Automation',
        subtitle: 'Hand repetitive research, cleanup and polish to scheduled tasks: every run is its own Session and leaves a record behind.',
        loading: 'Reading…',
        loadFailed: 'Could not read the automation tasks',
        retry: 'Retry',
        'tasks.title': 'Tasks',
        'tasks.new': 'New task',
        'tasks.empty': 'No tasks yet. Create one and it runs on the schedule you choose.',
        'tasks.enabled': 'Enabled',
        'tasks.disabled': 'Disabled',
        'tasks.manual': 'Manual only',
        'tasks.next': 'Next run',
        'tasks.never': 'Not scheduled',
        'tasks.running': 'Running',
        'tasks.last': 'Last',
        'tasks.none': 'Never run',
        'run.ok': 'Succeeded',
        'run.failed': 'Failed',
        'tasks.open': 'Open task settings: {title}',
        'task.new': 'New task',
        'task.edit': 'Task settings',
        'task.back': 'Back to tasks',
        'task.id': 'Identifier',
        'task.idHint': 'Lowercase letters, digits and dashes. Names its cron block and log files; cannot change later.',
        'task.title': 'Name',
        'task.titleHint': 'Shown in the list, the cron comment, and the run records.',
        'task.desc': 'Description',
        'task.enabled': 'Run automatically',
        'task.schedule': 'Schedule',
        'task.kind': 'Frequency',
        'kind.manual': 'Manual only (not scheduled)',
        'kind.every-minutes': 'Every N minutes',
        'kind.hourly': 'Hourly',
        'kind.daily': 'Daily',
        'kind.weekly': 'Weekly',
        'kind.cron': 'Custom cron',
        'task.hour': 'Hour',
        'task.minute': 'Minute',
        'task.minutes': 'Interval (minutes)',
        'task.weekdays': 'Weekdays',
        'task.cron': 'Cron expression',
        'task.cronHint': 'Five fields: minute hour day month weekday. For example 0 23 * * * is 23:00 daily.',
        'task.zone': 'Time zone',
        'task.model': 'Model',
        'task.provider': 'Provider',
        'task.modelId': 'Model',
        'task.effort': 'Reasoning effort',
        'task.effortDefault': 'Default',
        'task.cwd': 'Working directory',
        'task.cwdHint': 'The task runs here. Pick one of your workspaces, or browse for a directory.',
        'task.cwdWorkspaces': 'Choose a workspace',
        'task.cwdBrowse': 'Browse…',
        'task.cwdBrowsing': 'Choosing…',
        'task.cwdOther': 'Another folder…',
        'task.cwdBackToWorkspaces': 'Back to workspaces',
        'task.cwdUseFirstWorkspace': 'Use the first workspace',
        'task.cwdBrowseCancelled': 'No folder selected; the path is unchanged',
        'task.cwdEmpty': 'No workspaces yet. Use Browse to pick a directory.',
        'task.prompt': 'Task prompt',
        'task.promptHint': 'Sent to the model in full on every run. State the goal, the constraints and the definition of done.',
        'task.keepRuns': 'Keep run records',
        'task.save': 'Save task',
        'task.saving': 'Saving…',
        'task.saved': 'Task saved',
        'task.deleted': 'Task deleted',
        'task.cancel': 'Cancel',
        'task.delete': 'Delete task',
        'task.deleteConfirm': 'Delete “{title}”? Its run records and reports stay on disk.',
        'task.deleting': 'Deleting…',
        'task.running': 'Run now',
        'task.starting': 'Starting…',
        'task.started': 'Started; it appears in the run records shortly',
        'task.busy': 'This task is already running',
        'task.basics': 'Basics',
        'task.promptPlaceholder': 'Describe what this task should do, its constraints, and how to tell it succeeded…',
        'task.unsaved': 'Unsaved changes',
        'task.unsavedHint': 'Run once uses the saved config. Save first, or use Save & run.',
        'task.discard': 'Discard changes',
        'task.confirmLeave': 'You have unsaved changes. Leave and discard them?',
        'task.saveFailed': 'Save failed; fix and retry',
        'task.conflict': 'This task changed elsewhere; refresh and retry',
        'task.deleteTitle': 'Delete task',
        'task.deleteBody': 'This removes “{title}” from crontab and cannot be undone. Run records and reports stay on disk.',
        'task.deleteKeep': 'Cancel',
        'task.deleteConfirmAction': 'Delete',
        'task.refresh': 'Refresh',
        'task.savedAndRun': 'Save & run',
        'task.saveAndRunning': 'Saving…',
        'task.modelMissing': 'Saved model (no longer in config)',
        'task.cronPreview': 'Effective cron',
        'task.keepRunsHint': 'Maximum run records to keep per task; the oldest are pruned.',
        'task.zone': 'Time zone',
        'task.zoneHint': 'Interpreted in the host time zone (Asia/Shanghai).',
        'task.tabSettings': 'Settings',
        'task.tabRecords': 'Records & reports',
        'task.collapse': 'Collapse',
        'task.expand': 'Expand',
        'task.advanced': 'Advanced',
        'task.advancedHint': 'Model, reasoning, working directory, retention and time zone',
        'tasks.next': 'Next run',
        'tasks.never': "Won't run automatically",
        'orphans.title': 'Records from deleted tasks',
        'orphans.hint': 'These stay on disk even after the task is removed from the list.',
        'orphans.empty': 'No records from deleted tasks',
        'orphans.show': 'Show history',
        'orphans.hide': 'Hide history',
        'task.validation.id': 'An identifier is required',
        'task.validation.title': 'A name is required',
        'task.validation.prompt': 'A task prompt is required',
        'weekday.0': 'Sun',
        'weekday.1': 'Mon',
        'weekday.2': 'Tue',
        'weekday.3': 'Wed',
        'weekday.4': 'Thu',
        'weekday.5': 'Fri',
        'weekday.6': 'Sat',
        'runs.title': 'Run records',
        'runs.empty': 'No run yet',
        'runs.hint': 'The full event stream of each run, including its own Session id.',
        'reports.title': 'Reports',
        'reports.empty': 'No report yet',
        'reports.hint': 'Written by the model when a run finishes.',
        'viewer.close': 'Close',
        'viewer.loading': 'Reading…',
        'viewer.failed': 'Could not read the file',
        'toast.failed': 'The action failed',
        'paths.title': 'Locations',
        'paths.automation': 'Automation directory',
        'paths.profile': 'Model config',
        'schema.loading': 'Loading tasks…',
      },
    }

    // ── styles ──────────────────────────────────────────────────────────────
    const CSS = `
.na_root{display:flex;flex-direction:column;gap:20px;max-width:880px;font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary);-webkit-font-smoothing:antialiased}
.na_pagehead{display:flex;align-items:flex-start;gap:14px}
.na_pagehead > div:first-child{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.na_pagehead h2{margin:0;font-size:17px;font-weight:500;letter-spacing:-.2px;line-height:1.3}
.na_pagesub{margin:0;font-size:12.5px;color:var(--dsw-alias-label-secondary);max-width:64ch}
.na_section{display:flex;flex-direction:column;gap:10px}
.na_sechead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding-bottom:6px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
.na_sectitle{margin:0;font-size:13px;font-weight:500}
.na_sechint{margin:0;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.na_card{display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:12px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.na_row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.na_row.between{justify-content:space-between}
.na_field{display:flex;flex-direction:column;gap:5px;flex:1;min-width:150px}
.na_fieldlabel{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}
.na_fieldhint{margin:0;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.na_input,.na_select{width:100%;padding:6px 9px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:0.5px solid var(--dsw-alias-border-l1);border-radius:7px;box-sizing:border-box}
.na_input:focus-visible,.na_select:focus-visible,.na_textarea:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;border-color:transparent}
.na_input:disabled,.na_select:disabled{color:var(--dsw-alias-state-idle-primary);cursor:not-allowed}
.na_input.narrow{width:76px;text-align:center}
.na_check{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dsw-alias-label-primary);cursor:pointer}
.na_check input{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.na_check input:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.na_days{display:flex;gap:6px;flex-wrap:wrap}
.na_day{padding:5px 11px;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:0.5px solid var(--dsw-alias-border-l1);border-radius:99px;cursor:pointer}
.na_day[aria-pressed='true']{color:var(--dsw-alias-bg-base);background:var(--dsw-alias-brand-primary);border-color:transparent}
.na_day:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.na_btn{display:inline-flex;align-items:center;gap:6px;padding:6px 13px;font:inherit;font-size:12.5px;font-weight:500;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:0.5px solid var(--dsw-alias-border-l1);border-radius:8px;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.na_btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2)}
.na_btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.na_btn:disabled{opacity:.5;cursor:not-allowed}
.na_btn.primary{color:var(--dsw-alias-bg-base);background:var(--dsw-alias-brand-primary);border-color:transparent}
.na_btn.primary:hover:not(:disabled){filter:brightness(1.08)}
.na_btn.danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)}
.na_btn.ghost{background:none;border-color:transparent}
.na_btn.ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.na_pill{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:99px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.na_dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.na_dot.ok{background:var(--dsw-alias-state-success-primary)}
.na_dot.err{background:var(--dsw-alias-state-error-primary)}
.na_dot.busy{background:var(--dsw-alias-state-warn-primary)}
.na_tasklist{display:flex;flex-direction:column;gap:8px}
.na_task{display:flex;align-items:flex-start;gap:12px;width:100%;padding:13px 14px;font:inherit;text-align:left;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l1);border-radius:11px;cursor:pointer;transition:border-color .15s ease,background .15s ease}
.na_task:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.na_task:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.na_taskbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.na_tasktitle{font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.na_taskdesc{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.na_taskmeta{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.na_taskmeta .na_mono{font-size:11px}
.na_empty{padding:22px 16px;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-secondary);border:1px dashed var(--dsw-alias-border-l1);border-radius:11px}
.na_notice{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.na_notice.error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);color:var(--dsw-alias-state-error-primary)}
.na_meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:12.5px}
.na_metak{color:var(--dsw-alias-label-secondary)}
.na_metav{color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.na_mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.na_textarea{width:100%;min-height:200px;padding:11px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:0.5px solid var(--dsw-alias-border-l1);border-radius:9px;resize:vertical;box-sizing:border-box}
.na_list{display:flex;flex-direction:column;gap:1px}
.na_item{display:flex;align-items:center;gap:10px;width:100%;padding:7px 9px;font:inherit;font-size:12.5px;text-align:left;color:var(--dsw-alias-label-primary);background:none;border:none;border-radius:7px;cursor:pointer}
.na_item:hover{background:var(--dsw-alias-bg-layer-2)}
.na_item:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.na_itemname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.na_itemmeta{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.na_overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:32px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 62%,transparent)}
.na_viewer{display:flex;flex-direction:column;width:min(920px,100%);max-height:100%;border-radius:14px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 24px 60px rgb(0 0 0 / 28%);overflow:hidden}
.na_viewerhead{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
.na_viewertitle{flex:1;min-width:0;margin:0;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.na_viewerbody{margin:0;padding:14px;overflow:auto;--dsh-scrollbar-track-margin:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary)}
.na_spinner{width:14px;height:14px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:na-spin .8s linear infinite;flex:none}
.na_footer{position:sticky;bottom:-24px;z-index:5;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;margin:4px -14px -16px;background:var(--dsw-alias-bg-layer-1);border-top:0.5px solid var(--dsw-alias-border-l2);border-radius:0 0 12px 12px;box-shadow:0 -8px 20px color-mix(in srgb,var(--dsw-alias-bg-base) 80%,transparent)}
.na_spacer{flex:1}
.na_dirtybar{display:flex;align-items:center;gap:8px;padding:7px 11px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,var(--dsw-alias-bg-layer-1));border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent);font-size:12px;color:var(--dsw-alias-label-primary)}
.na_dirtybar .na_dot{background:var(--dsw-alias-state-warn-primary)}
.na_hintline{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.na_tabs{display:flex;gap:4px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
.na_tab{padding:7px 14px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-secondary);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-1px}
.na_tab[aria-selected='true']{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
.na_tab:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.na_secToggle{display:flex;align-items:center;gap:8px;width:100%;padding:0 0 6px;font:inherit;font-size:13px;font-weight:500;text-align:left;color:var(--dsw-alias-label-primary);background:none;border:none;border-bottom:0.5px solid var(--dsw-alias-border-l1);cursor:pointer}
.na_secToggle:hover{color:var(--dsw-alias-brand-primary)}
.na_secToggle:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px;border-radius:4px}
.na_chevron{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary);transition:transform .16s ease}
.na_chevron.open{transform:rotate(90deg)}
.na_overlay{position:fixed;inset:var(--dsh-frame-chrome-top,0px) 0 0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:32px;background:var(--dsw-alias-bg-mask-1)}
.na_viewer{display:flex;flex-direction:column;width:min(760px,100%);max-height:100%;border-radius:12px;border:0;background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent,0 16px 40px rgb(0 0 0 / 20%));overflow:hidden}
.na_confirm{position:fixed;inset:var(--dsh-frame-chrome-top,0px) 0 0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:32px;background:var(--dsw-alias-bg-mask-1)}
.na_confirmCard{width:min(420px,100%);padding:20px;border-radius:12px;border:0;background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent,0 16px 40px rgb(0 0 0 / 20%))}
.na_confirmTitle{margin:0 0 8px;font-size:15px;font-weight:500;color:var(--dsw-alias-label-primary)}
.na_confirmBody{margin:0 0 18px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.na_confirmActions{display:flex;justify-content:flex-end;gap:8px}
.na_loading{display:flex;align-items:center;justify-content:center;min-height:180px}
.na_toast{position:fixed;right:24px;bottom:24px;z-index:1300;max-width:360px;padding:11px 14px;border-radius:10px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgb(0 0 0 / 18%));font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:10px}
.na_toast.error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent)}
.na_toast .na_dot{flex:none}
.na_toastClose{margin-left:auto;background:none;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;padding:0 2px}
.na_toastClose:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
@keyframes na-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.na_spinner{animation-duration:2.4s}.na_btn,.na_task,.na_chevron{transition:none}}
@media (prefers-color-scheme:dark){.na_footer{box-shadow:0 -8px 20px color-mix(in srgb,var(--dsw-alias-bg-base) 92%,transparent)}}
`

    // ── helpers ─────────────────────────────────────────────────────────────
    /** Read the shell's current language tag for date formatting. */
    function localeTag(ctx) {
      try {
        const snapshot = typeof ctx.locale?.getLocale === 'function' ? ctx.locale.getLocale() : undefined
        const active = snapshot?.active
        if (typeof active === 'string' && active !== '') return active
      } catch { /* locale service unavailable */ }
      return document.documentElement.lang || 'en'
    }

    /** Format a byte count for a row's trailing metadata. */
    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    /** Format an ISO instant in the browser's local zone, or null when absent. */
    function formatInstant(iso, language) {
      if (typeof iso !== 'string' || iso === '') return null
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return null
      return date.toLocaleString(language, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
      })
    }

    /** Turn a `run-20261104T091349.log` stamp into a readable instant. */
    function formatStamp(stamp, language) {
      const match = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(String(stamp ?? ''))
      if (match === null) return String(stamp ?? '')
      const [, year, month, day, hour, minute] = match
      const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
      return date.toLocaleString(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    }

    /**
     * One JSON fetch against the plugin's routes.
     * @param path - route appended to the plugin prefix.
     * @param init - optional request options.
     * @returns the parsed response body; throws on a refused status.
     */
    async function api(path, init) {
      const response = await fetch(`${BASE}${path}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        ...init,
      })
      const body = await response.json().catch(() => undefined)
      if (!response.ok || body?.ok === false) {
        const error = new Error(body?.error ?? `HTTP ${response.status}`)
        error.status = response.status
        error.code = body?.code
        throw error
      }
      return body
    }


    // ── shared bits ─────────────────────────────────────────────────────────
    /** A labelled field: caption, control, optional hint. */
    function Field({ label, hint, children }) {
      return h('label', { className: 'na_field' },
        h('span', { className: 'na_fieldlabel' }, label),
        children,
        hint === undefined ? null : h('span', { className: 'na_fieldhint' }, hint))
    }

    /** One row of the two-column key/value grid. */
    function MetaRow({ label, children }) {
      return h(Fragment, null,
        h('span', { className: 'na_metak' }, label),
        h('span', { className: 'na_metav' }, children))
    }

    /** A section heading with an optional trailing element. */
    function SectionHead({ title, hint, trailing }) {
      return h('div', { className: 'na_sechead' },
        h('h3', { className: 'na_sectitle' }, title),
        hint === undefined ? null : h('span', { className: 'na_sechint' }, hint),
        trailing)
    }

    /** One file list: reports or run transcripts. */
    function FileList({ t, title, hint, empty, files, onOpen }) {
      const body = files.length === 0
        ? h('div', { className: 'na_empty' }, empty)
        : h('div', { className: 'na_card na_list', style: { gap: 1 } },
            ...files.map(file => h('button', {
              key: file.name,
              type: 'button',
              className: 'na_item',
              onClick: () => onOpen(file.name),
            },
            h('span', { className: 'na_itemname' }, file.name),
            h('span', { className: 'na_itemmeta' }, formatBytes(file.bytes)))))
      return h('section', { className: 'na_section' },
        h(SectionHead, { title, hint }),
        body)
    }

    /** The modal that shows one report or transcript body. */
    /**
     * Shared confirmation dialog, portalled out of the settings panel so it is
     * not clipped by the scrolling column and gets its own Escape handling.
     */
    function ConfirmModal({ t, title, body, keepLabel, confirmLabel, tone, onKeep, onConfirm }) {
      const ref = useRef(null)
      useEffect(() => { ref.current?.focus() }, [])
      const onKeyDownCapture = event => {
        if (event.key !== 'Escape') return
        event.preventDefault(); event.stopPropagation(); onKeep()
      }
      return createPortal(h('div', {
        className: 'na_confirm', role: 'presentation',
        onClick: event => { if (event.target === event.currentTarget) onKeep() },
        onKeyDownCapture,
      },
      h('div', {
        ref, className: 'na_confirmCard', role: 'dialog', 'aria-modal': 'true',
        'aria-label': title, tabIndex: -1, 'data-modal-autofocus': '',
      },
        h('h3', { className: 'na_confirmTitle' }, title),
        h('p', { className: 'na_confirmBody' }, body),
        h('div', { className: 'na_confirmActions' },
          h('button', { type: 'button', className: 'na_btn', onClick: onKeep }, keepLabel),
          h('button', {
            type: 'button', className: `na_btn ${tone === 'danger' ? 'danger' : 'primary'}`,
            onClick: onConfirm,
          }, confirmLabel)))), document.body)
    }

    /** Reads the shared toast store through a React subscription. */
    function ShellToastHost({ t, store }) {
      const [notice, setNotice] = useState(store.value)
      const onDismiss = useCallback(() => store.set(undefined), [store])
      useEffect(() => store.subscribe(() => setNotice(store.value)), [store])
      return h(ShellToast, { t, notice, onDismiss })
    }

    /** App-wide toast hosted in shell.overlay, so it outlives the settings panel. */
    function ShellToast({ notice, onDismiss }) {
      useEffect(() => {
        if (notice === undefined || notice.tone !== 'ok') return undefined
        const timer = setTimeout(onDismiss, 5000)
        return () => clearTimeout(timer)
      }, [notice, onDismiss])
      if (notice === undefined) return null
      return h('div', {
        className: `na_toast${notice.tone === 'error' ? ' error' : ''}`,
        role: notice.tone === 'error' ? 'alert' : 'status',
      },
      h('span', { className: `na_dot ${notice.tone === 'error' ? 'err' : 'ok'}`, 'aria-hidden': true }),
      h('span', null, notice.text),
      h('button', {
        type: 'button', className: 'na_toastClose', 'aria-label': 'close', onClick: onDismiss,
      }, '✕'))
    }

    function FileViewer({ t, viewer, onClose }) {
      const dialog = useRef(null)
      useEffect(() => {
        dialog.current?.focus()
        return () => {}
      }, [])
      // The Settings panel's useModalLayer listens on document and closes the
      // whole panel on Escape. Stopping the key here (capture phase, before it
      // reaches document) keeps one Escape = close the viewer only.
      const onKeyDownCapture = event => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
      const body = viewer.error !== undefined
        ? `${t('viewer.failed')}: ${viewer.error}`
        : viewer.text === undefined
          ? t('viewer.loading')
          : viewer.text
      return h('div', {
        className: 'na_overlay',
        role: 'presentation',
        onClick: event => { if (event.target === event.currentTarget) onClose() },
        onKeyDownCapture,
      },
      h('div', {
        ref: dialog,
        className: 'na_viewer',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': viewer.name,
        tabIndex: -1,
        'data-modal-autofocus': '',
      },
        h('div', { className: 'na_viewerhead' },
          h('h4', { className: 'na_viewertitle' }, viewer.name),
          h('button', { type: 'button', className: 'na_btn', onClick: onClose }, t('viewer.close'))),
        h('pre', { className: 'na_viewerbody' }, body)))
    }

    // ── task list ───────────────────────────────────────────────────────────
    /** Describe one task's schedule in words, for a list row. */
    function scheduleLabel(t, task) {
      const s = task.schedule
      if (s.kind === 'manual') return t('tasks.manual')
      if (s.kind === 'every-minutes') return `${t('kind.every-minutes')} (${s.minutes})`
      if (s.kind === 'hourly') return `${t('kind.hourly')} :${String(s.minute).padStart(2, '0')}`
      if (s.kind === 'weekly') {
        const days = s.weekdays.map(day => t(`weekday.${day}`)).join(' ')
        return `${days} ${pad(s.hour)}:${pad(s.minute)}`
      }
      if (s.kind === 'daily') return `${pad(s.hour)}:${pad(s.minute)}`
      return s.expression
    }

    /** Two-digit clock field. */
    function pad(value) {
      return String(Number(value) || 0).padStart(2, '0')
    }

    /** The five-field cron expression a draft would actually install. */
    function effectiveCron(draft) {
      switch (draft.scheduleKind) {
        case 'manual': return null
        case 'every-minutes': return `*/${draft.minutes} * * * *`
        case 'hourly': return `${draft.minute} * * * *`
        case 'daily': return `${draft.minute} ${draft.hour} * * *`
        case 'weekly': return `${draft.minute} ${draft.hour} * * ${draft.weekdays.join(',')}`
        default: return draft.cron
      }
    }

    /** Continuous validation so a bad field blocks Save instead of a top-level toast. */
    function draftErrors(t, draft) {
      const errors = {}
      if (String(draft.id).trim() === '') errors.id = t('task.validation.id')
      if (String(draft.title).trim() === '') errors.title = t('task.validation.title')
      if (String(draft.promptText).trim() === '') errors.promptText = t('task.validation.prompt')
      const inRange = (value, min, max) => value !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max
      if (!inRange(draft.hour, 0, 23)) errors.hour = `${t('task.hour')} 0–23`
      if (!inRange(draft.minute, 0, 59)) errors.minute = `${t('task.minute')} 0–59`
      if (draft.scheduleKind === 'every-minutes' && !inRange(draft.minutes, 1, 59)) errors.minutes = '1–59'
      if (draft.scheduleKind === 'weekly' && draft.weekdays.length === 0) errors.weekdays = t('task.weekdays')
      if (draft.scheduleKind === 'cron' && !/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(String(draft.cron))) errors.cron = t('task.cronHint')
      return errors
    }

    /** A JSON-stable comparison for staged-draft dirtiness. */
    function sameDraft(left, right) {
      if (left === undefined || right === undefined) return left === right
      return JSON.stringify(left) === JSON.stringify(right)
    }

    /** One task row in the list. */
    function TaskRow({ t, task, language, onOpen }) {
      const tone = task.running ? 'busy' : task.enabled && task.schedule.kind !== 'manual' ? 'ok' : ''
      const status = task.running
        ? t('tasks.running')
        : task.schedule.kind === 'manual'
          ? t('tasks.manual')
          : task.enabled ? t('tasks.enabled') : t('tasks.disabled')
      const last = task.lastRun
      const lastText = last === null
        ? t('tasks.none')
        : `${formatStamp(last.stamp, language)} · ${last.ok ? t('run.ok') : t('run.failed')}`
      const next = task.nextRun
        ? `${t('tasks.next')} ${formatInstant(task.nextRun, language)}`
        : t('tasks.never')
      return h('button', {
        type: 'button',
        className: 'na_task',
        onClick: onOpen,
        'aria-label': t('tasks.open').replace('{title}', task.title),
      },
      h('span', { className: `na_dot ${tone}`, 'aria-hidden': true, style: { marginTop: 6 } }),
      h('span', { className: 'na_taskbody' },
        h('span', { className: 'na_tasktitle' },
          task.title,
          h('span', { className: 'na_pill' }, status)),
        task.description === '' ? null : h('span', { className: 'na_taskdesc' }, task.description),
        h('span', { className: 'na_taskmeta' },
          h('span', null, scheduleLabel(t, task)),
          h('span', null, next),
          h('span', null, `${t('tasks.last')} ${lastText}`),
          h('span', { className: 'na_mono' }, task.id))))
    }

    /** The list page: every task plus the create action. */
    function TaskListPage({ t, language, tasks, orphans, onOpen, onCreate, onCreatePlaceholder, onOpenFile }) {
      const [showOrphans, setShowOrphans] = useState(false)
      return h(Fragment, null,
        h('div', { className: 'na_pagehead' },
          h('div', null,
            h('h2', null, t('title')),
            h('p', { className: 'na_pagesub' }, t('subtitle'))),
          h('button', { type: 'button', className: 'na_btn primary', onClick: onCreate }, t('tasks.new'))),
        h('section', { className: 'na_section' },
          h(SectionHead, { title: t('tasks.title') }),
          tasks.length === 0
            ? h('div', { className: 'na_empty' },
                h('div', null, t('tasks.empty')),
                h('div', { style: { marginTop: 12 } },
                  h('button', { type: 'button', className: 'na_btn', onClick: onCreatePlaceholder }, t('tasks.new'))))
            : h('div', { className: 'na_tasklist' },
                ...tasks.map(task => h(TaskRow, {
                  key: task.id, t, task, language, onOpen: () => onOpen(task.id),
                })))),
        orphans === undefined || orphans.length === 0
          ? null
          : h('section', { className: 'na_section' },
              h('button', {
                type: 'button', className: 'na_secToggle',
                'aria-expanded': showOrphans ? 'true' : 'false',
                onClick: () => setShowOrphans(current => !current),
              },
              `${t('orphans.title')} (${orphans.length})`,
              h('span', { className: `na_chevron${showOrphans ? ' open' : ''}`, 'aria-hidden': true }, '›')),
              showOrphans
                ? h(Fragment, null,
                    h('p', { className: 'na_sechint' }, t('orphans.hint')),
                    h('div', { className: 'na_card na_list', style: { gap: 1 } },
                      ...orphans.map(entry => h('button', {
                        key: entry.kind + entry.name,
                        type: 'button', className: 'na_item',
                        onClick: () => onOpenFile(entry.kind, entry.name),
                      },
                        h('span', { className: 'na_itemname' }, entry.taskId === null ? entry.name : `${entry.taskId} / ${entry.name}`),
                        h('span', { className: 'na_itemmeta' }, formatBytes(entry.bytes))))))
                : null))
    }

    // ── task editor ─────────────────────────────────────────────────────────
    /** Empty draft for a brand-new task. */
    function blankDraft(providers, workspaces) {
      const fallback = providers[0]
      // A new task starts in the first workspace rather than an empty path, so
      // the common case needs no directory decision at all.
      const cwd = workspaces.length > 0 ? workspaces[0].path : ''
      return {
        id: '',
        title: '',
        description: '',
        enabled: true,
        scheduleKind: 'daily',
        hour: 23,
        minute: 0,
        minutes: 30,
        weekdays: [1, 2, 3, 4, 5],
        cron: '0 23 * * *',
        timeZone: 'Asia/Shanghai',
        provider: fallback === undefined ? '' : fallback.id,
        model: fallback === undefined ? '' : (fallback.models[0] ?? ''),
        reasoningEffort: '',
        cwd,
        promptText: '',
        keepRuns: 20,
      }
    }

    /** Turn a stored task into an editable draft. */
    function draftOf(task) {
      const s = task.schedule
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        enabled: task.enabled,
        scheduleKind: s.kind,
        hour: s.hour ?? 23,
        minute: s.minute ?? 0,
        minutes: s.minutes ?? 30,
        weekdays: s.weekdays ?? [1, 2, 3, 4, 5],
        cron: s.expression ?? '0 23 * * *',
        timeZone: s.timeZone ?? 'Asia/Shanghai',
        provider: task.model.provider,
        model: task.model.model,
        reasoningEffort: task.model.reasoningEffort ?? '',
        cwd: task.cwd,
        promptText: task.promptText,
        keepRuns: task.keepRuns,
      }
    }

    /** Convert a draft back into the request body the Host validates. */
    function bodyOf(draft, originalId) {
      const zone = draft.timeZone || 'Asia/Shanghai'
      const schedule = (() => {
        switch (draft.scheduleKind) {
          case 'manual': return { kind: 'manual' }
          case 'every-minutes': return { kind: 'every-minutes', minutes: Number(draft.minutes) }
          case 'hourly': return { kind: 'hourly', minute: Number(draft.minute) }
          case 'daily': return { kind: 'daily', hour: Number(draft.hour), minute: Number(draft.minute), timeZone: zone }
          case 'weekly': return { kind: 'weekly', hour: Number(draft.hour), minute: Number(draft.minute), weekdays: draft.weekdays, timeZone: zone }
          default: return { kind: 'cron', expression: draft.cron, timeZone: zone }
        }
      })()
      return {
        originalId,
        id: draft.id,
        title: draft.title,
        description: draft.description,
        enabled: draft.enabled,
        schedule,
        model: {
          provider: draft.provider,
          model: draft.model,
          ...draft.reasoningEffort === '' ? {} : { reasoningEffort: draft.reasoningEffort },
        },
        cwd: draft.cwd,
        promptText: draft.promptText,
        keepRuns: Number(draft.keepRuns),
      }
    }

    /** The weekday picker, shared by the weekly and cron hints. */
    function WeekdayPicker({ t, value, onChange }) {
      return h('div', { className: 'na_days', role: 'group', 'aria-label': t('task.weekdays') },
        ...[0, 1, 2, 3, 4, 5, 6].map(day => h('button', {
          key: day,
          type: 'button',
          className: 'na_day',
          'aria-pressed': value.includes(day) ? 'true' : 'false',
          onClick: () => onChange(value.includes(day)
            ? value.filter(entry => entry !== day)
            : [...value, day].sort((left, right) => left - right)),
        }, t(`weekday.${day}`))))
    }

    /** The schedule sub-form for the chosen frequency. */
    function ScheduleFields({ t, draft, set, errors }) {
      const kind = draft.scheduleKind
      // Switching kind migrates the current clock into the new rule instead of
      // silently reusing a stale cron string or dropping the chosen weekdays.
      const changeKind = next => {
        const patch = { scheduleKind: next }
        if (next === 'cron' && draft.cron === '0 23 * * *') {
          patch.cron = `${draft.minute} ${draft.hour} * * *`
          if (kind === 'weekly' && draft.weekdays.length > 0) {
            patch.cron = `${draft.minute} ${draft.hour} * * ${draft.weekdays.join(',')}`
          }
        }
        set(patch)
      }
      const clock = h(Fragment, null,
        h(Field, { label: t('task.hour') },
          h('input', {
            className: 'na_input narrow', type: 'number', min: 0, max: 23, value: draft.hour,
            onChange: event => set({ hour: event.target.value }),
          })),
        h(Field, { label: t('task.minute') },
          h('input', {
            className: 'na_input narrow', type: 'number', min: 0, max: 59, value: draft.minute,
            onChange: event => set({ minute: event.target.value }),
          })))
      return h(Fragment, null,
        h('div', { className: 'na_row' },
          h(Field, { label: t('task.kind') },
            h('select', {
              className: 'na_select', value: kind,
              onChange: event => changeKind(event.target.value),
            },
            h('option', { value: 'manual' }, t('kind.manual')),
            h('option', { value: 'every-minutes' }, t('kind.every-minutes')),
            h('option', { value: 'hourly' }, t('kind.hourly')),
            h('option', { value: 'daily' }, t('kind.daily')),
            h('option', { value: 'weekly' }, t('kind.weekly')),
            h('option', { value: 'cron' }, t('kind.cron'))))),
        kind === 'every-minutes'
          ? h('div', { className: 'na_row' },
              h(Field, { label: t('task.minutes') },
                h('input', {
                  className: 'na_input narrow', type: 'number', min: 1, max: 59, value: draft.minutes,
                  onChange: event => set({ minutes: event.target.value }),
                })))
          : null,
        kind === 'hourly'
          ? h('div', { className: 'na_row' },
              h(Field, { label: t('task.minute') },
                h('input', {
                  className: 'na_input narrow', type: 'number', min: 0, max: 59, value: draft.minute,
                  onChange: event => set({ minute: event.target.value }),
                })))
          : null,
        kind === 'daily' || kind === 'weekly' ? h('div', { className: 'na_row' }, clock) : null,
        kind === 'weekly'
          ? h(Field, { label: t('task.weekdays') },
              h(WeekdayPicker, { t, value: draft.weekdays, onChange: weekdays => set({ weekdays }) }))
          : null,
        kind === 'cron'
          ? h(Field, { label: t('task.cron'), hint: t('task.cronHint') },
              h('input', {
                className: 'na_input', type: 'text', value: draft.cron, spellCheck: false,
                onChange: event => set({ cron: event.target.value }),
              }))
          : null,
        h('p', { className: 'na_hintline na_mono' },
          `${t('task.cronPreview')}: ${effectiveCron(draft) ?? '—'}`),
        Object.keys(errors).length === 0 ? null : h('p', { className: 'na_hintline', style: { color: 'var(--dsw-alias-state-error-primary)' } }, Object.values(errors).join(' · ')))
    }

    /**
     * Working-directory chooser.
     *
     * The common case is "one of my workspaces", so the picker offers the same
     * list the left sidebar shows and keeps the raw path out of sight. A manual
     * path stays available behind a toggle for the rare directory that is not a
     * workspace, and "Browse…" opens the shell's own directory picker so the
     * user never has to type a path at all.
     */
    function WorkingDirectoryPicker({ t, draft, set, workspaces, onBrowse, report }) {
      const [manual, setManual] = useState(false)
      const [browsing, setBrowsing] = useState(false)
      const known = workspaces.some(workspace => workspace.path === draft.cwd)
      // Derived: a non-workspace path must never render as the first workspace.
      // Dropping the persisted `manual` flag when a workspace becomes selected
      // keeps the control honest after Browse picks a known directory.
      const showManual = manual || (!known && draft.cwd !== '')
      const selected = known ? draft.cwd : ''
      const browse = async () => {
        setBrowsing(true)
        try {
          const picked = await onBrowse()
          if (typeof picked === 'string' && picked !== '') {
            set({ cwd: picked })
            if (workspaces.some(workspace => workspace.path === picked)) setManual(false)
          } else {
            report(t('task.cwdBrowseCancelled'))
          }
        } catch (error) {
          report(error)
        } finally {
          setBrowsing(false)
        }
      }
      return h(Fragment, null,
        workspaces.length === 0 && !showManual
          ? h('p', { className: 'na_fieldhint' }, t('task.cwdEmpty'))
          : h(Field, { label: t('task.cwdWorkspaces') },
              h('select', {
                className: 'na_select',
                value: showManual ? '__manual__' : selected,
                onChange: event => {
                  const next = event.target.value
                  if (next === '__manual__') { setManual(true); return }
                  set({ cwd: next })
                },
              },
              // A path outside the workspace list must not render as the first
              // workspace: the select falls back to option one, which would show
              // a directory this task does not use.
              showManual
                ? h('option', { value: '__manual__' }, t('task.cwdOther'))
                : null,
              // The placeholder only makes sense while nothing is chosen.
              showManual || selected !== ''
                ? null
                : h('option', { value: '' }, '—'),
              ...workspaces.map(workspace => h('option', {
                key: workspace.workspaceId,
                value: workspace.path,
              }, workspace.title === workspace.path ? workspace.path : `${workspace.title} — ${workspace.path}`)),
              showManual ? null : h('option', { value: '__manual__' }, t('task.cwdOther')))),
        h('div', { className: 'na_row' },
          h('button', {
            type: 'button', className: 'na_btn', disabled: browsing, onClick: () => { browse().catch(() => {}) },
          }, browsing ? t('task.cwdBrowsing') : t('task.cwdBrowse')),
          showManual
            ? h('button', {
                type: 'button', className: 'na_btn ghost',
                // Switching back to the picker necessarily changes the path;
                // label that honestly instead of pretending it is a view toggle.
                onClick: () => {
                  setManual(false)
                  if (workspaces.length > 0) set({ cwd: workspaces[0].path })
                },
              }, t('task.cwdUseFirstWorkspace'))
            : null),
        showManual
          ? h('input', {
              className: 'na_input na_mono', type: 'text', value: draft.cwd, spellCheck: false,
              'aria-label': t('task.cwd'),
              onChange: event => set({ cwd: event.target.value }),
            })
          : null,
        draft.cwd === ''
          ? null
          : h('p', { className: 'na_fieldhint na_mono' }, draft.cwd))
    }

    /** The full editor: identity, schedule, model, working directory, prompt. */
    /** One collapsible section: advanced sections start closed. */
    function CollapsibleSection({ t, title, hint, open, onToggle, children }) {
      return h('section', { className: 'na_section' },
        h('button', {
          type: 'button', className: 'na_secToggle',
          'aria-expanded': open ? 'true' : 'false', onClick: onToggle,
        },
        title,
        hint === undefined || !open ? null : h('span', { className: 'na_sechint' }, hint),
        h('span', { className: `na_chevron${open ? ' open' : ''}`, 'aria-hidden': true }, '›')),
        open ? children : null)
    }

    /** The editor tab strip, shared by Settings and Records views. */
    function EditorTabs({ t, tab, onTab }) {
      const keys = ['settings', 'records']
      const onKeyDown = event => {
        const current = keys.indexOf(tab)
        let next = current
        if (event.key === 'ArrowRight') next = (current + 1) % keys.length
        else if (event.key === 'ArrowLeft') next = (current - 1 + keys.length) % keys.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = keys.length - 1
        else return
        event.preventDefault()
        onTab(keys[next])
        const buttons = event.currentTarget.querySelectorAll('[role="tab"]')
        buttons[next]?.focus()
      }
      return h('div', { className: 'na_tabs', role: 'tablist', onKeyDown },
        keys.map(key => h('button', {
          key,
          type: 'button',
          className: 'na_tab',
          role: 'tab',
          tabIndex: tab === key ? 0 : -1,
          'aria-selected': tab === key ? 'true' : 'false',
          onClick: () => onTab(key),
        }, key === 'settings' ? t('task.tabSettings') : t('task.tabRecords'))))
    }

    /** The full editor: identity, schedule, advanced settings, prompt, actions. */
    function TaskEditor({ t, draft, set, providers, workspaces, onBrowse, report,
      pending, isNew, dirty, errors, savedStatus, tab, onTab, expanded, onToggle,
      onSave, onCancel, onBack, onDelete, onSaveAndRun, running, current, paths, onOpenFile }) {
      const provider = providers.find(item => item.id === draft.provider)
      const models = provider?.models ?? []
      // A model id the live profile no longer advertises must not silently fall
      // back to the first option: that would rewrite it on the next save.
      const modelMissing = draft.model !== '' && !models.includes(draft.model)
      const busySave = pending.has('save') || pending.has('saveAndRun')
      const busyRun = pending.has('run') || pending.has('saveAndRun')
      const invalid = Object.keys(errors).length > 0
      const section = (key, title, hint, content) => h(CollapsibleSection, {
        t, title, hint, open: expanded[key] === true, onToggle: () => onToggle(key),
      }, content)

      const settingsTab = h(Fragment, null,
        section('basics', t('task.basics'), undefined,
          h('div', { className: 'na_card' },
            h('div', { className: 'na_row' },
              h(Field, { label: t('task.id'), hint: isNew ? t('task.idHint') : undefined },
                h('input', {
                  className: 'na_input na_mono', type: 'text', value: draft.id,
                  disabled: !isNew, spellCheck: false,
                  onChange: event => set({ id: event.target.value.toLowerCase() }),
                })),
              h(Field, { label: t('task.title'), hint: t('task.titleHint') },
                h('input', {
                  className: 'na_input', type: 'text', value: draft.title,
                  onChange: event => set({ title: event.target.value }),
                }))),
            errors.id ? h('p', { className: 'na_hintline', style: { color: 'var(--dsw-alias-state-error-primary)' } }, errors.id) : null,
            errors.title ? h('p', { className: 'na_hintline', style: { color: 'var(--dsw-alias-state-error-primary)' } }, errors.title) : null,
            h(Field, { label: t('task.desc') },
              h('input', {
                className: 'na_input', type: 'text', value: draft.description,
                onChange: event => set({ description: event.target.value }),
              })),
            h('label', { className: 'na_check' },
              h('input', {
                type: 'checkbox', checked: draft.enabled,
                onChange: event => set({ enabled: event.target.checked }),
              }),
              t('task.enabled')))),

        section('schedule', t('task.schedule'), undefined,
          h('div', { className: 'na_card' },
            h(ScheduleFields, { t, draft, set, errors }))),

        section('prompt', t('task.prompt'), t('task.promptHint'),
          h(Fragment, null,
            h('textarea', {
              className: 'na_textarea', value: draft.promptText, spellCheck: false,
              'aria-label': t('task.prompt'),
              placeholder: t('task.promptPlaceholder'),
              onChange: event => set({ promptText: event.target.value }),
            }),
            errors.promptText ? h('p', { className: 'na_hintline', style: { color: 'var(--dsw-alias-state-error-primary)' } }, errors.promptText) : null)),

        section('advanced', t('task.advanced'), t('task.advancedHint'),
          h('div', { className: 'na_card' },
            h('div', { className: 'na_row' },
              h(Field, { label: t('task.provider') },
                h('select', {
                  className: 'na_select', value: draft.provider,
                  onChange: event => {
                    const next = providers.find(item => item.id === event.target.value)
                    set({ provider: event.target.value, model: next?.models[0] ?? '' })
                  },
                },
                ...providers.map(item => h('option', { key: item.id, value: item.id }, item.id)))),
              h(Field, { label: t('task.modelId') },
                h('select', {
                  className: 'na_select', value: draft.model,
                  onChange: event => set({ model: event.target.value }),
                },
                modelMissing ? h('option', { key: draft.model, value: draft.model }, `${draft.model} — ${t('task.modelMissing')}`) : null,
                ...models.map(name => h('option', { key: name, value: name }, name)))),
              h(Field, { label: t('task.effort') },
                h('select', {
                  className: 'na_select', value: draft.reasoningEffort,
                  onChange: event => set({ reasoningEffort: event.target.value }),
                },
                h('option', { value: '' }, t('task.effortDefault')),
                ...['low', 'medium', 'high', 'xhigh', 'max'].map(effort => h('option', { key: effort, value: effort }, effort))))),
            h(Field, { label: t('task.cwd'), hint: t('task.cwdHint') },
              h(WorkingDirectoryPicker, { t, draft, set, workspaces, onBrowse, report })),
            h('div', { className: 'na_row' },
              h(Field, { label: t('task.keepRuns'), hint: t('task.keepRunsHint') },
                h('input', {
                  className: 'na_input narrow', type: 'number', min: 1, max: 200, value: draft.keepRuns,
                  onChange: event => set({ keepRuns: event.target.value }),
                })),
              h(Field, { label: t('task.zone'), hint: t('task.zoneHint') },
                h('input', {
                  className: 'na_input', type: 'text', value: draft.timeZone, spellCheck: false,
                  onChange: event => set({ timeZone: event.target.value }),
                }))))),

        savedStatus === null ? null : h('p', { className: 'na_hintline' }, savedStatus))

      const recordsTab = h(Fragment, null,
        h(FileList, {
          t, title: t('reports.title'), hint: t('reports.hint'), empty: t('reports.empty'),
          files: current?.reports ?? [], onOpen: name => onOpenFile('report', name),
        }),
        h(FileList, {
          t, title: t('runs.title'), hint: t('runs.hint'), empty: t('runs.empty'),
          files: (current?.runs ?? []).slice(0, 20), onOpen: name => onOpenFile('run', name),
        }),
        h('section', { className: 'na_section' },
          h(SectionHead, { title: t('paths.title') }),
          h('div', { className: 'na_meta' },
            h(MetaRow, { label: t('paths.automation') }, h('span', { className: 'na_mono' }, paths?.automation ?? '')),
            h(MetaRow, { label: t('paths.profile') }, h('span', { className: 'na_mono' }, paths?.profile ?? '')))))

      return h(Fragment, null,
        h('div', { className: 'na_pagehead' },
          h('div', null,
            h('h2', null, isNew ? t('task.new') : t('task.edit')),
            isNew ? null : h('p', { className: 'na_pagesub na_mono' }, draft.id)),
          h('button', { type: 'button', className: 'na_btn', onClick: onBack }, t('task.back'))),
        h(EditorTabs, { t, tab, onTab }),
        dirty
          ? h('div', { className: 'na_dirtybar' },
              h('span', { className: 'na_dot', 'aria-hidden': true }),
              t('task.unsaved'),
              h('span', { className: 'na_hintline' }, t('task.unsavedHint')))
          : null,
        tab === 'settings' ? settingsTab : recordsTab,
        h('div', { className: 'na_footer' },
          h('button', {
            type: 'button', className: 'na_btn primary',
            disabled: busySave || invalid || !dirty, onClick: onSave,
          }, busySave ? t('task.saving') : t('task.save')),
          h('button', {
            type: 'button', className: 'na_btn', disabled: !dirty || busySave, onClick: onCancel,
          }, t('task.discard')),
          h('button', {
            type: 'button', className: 'na_btn',
            disabled: busyRun || running || isNew || dirty,
            title: dirty ? t('task.unsavedHint') : undefined,
            onClick: onSaveAndRun,
          }, busyRun ? t('task.saveAndRunning') : t('task.savedAndRun')),
          h('span', { className: 'na_spacer' }),
          isNew ? null : h('button', {
            type: 'button', className: 'na_btn danger', disabled: pending.has('delete'), onClick: onDelete,
          }, pending.has('delete') ? t('task.deleting') : t('task.delete'))))
    }

    /** The settings page: the task list, or one task's editor. */
    function Panel(props) {
      const { t, ctx } = props
      const language = localeTag(ctx)
      const workspaces = typeof props.useWorkspaces === 'function'
        ? props.useWorkspaces(snapshot => snapshot.items)
        : []
      const workspaceItems = (workspaces ?? [])
        .filter(workspace => typeof workspace?.path === 'string' && workspace.path !== '')
        .map(workspace => ({
          workspaceId: workspace.workspaceId,
          path: workspace.path,
          title: typeof workspace.title === 'string' && workspace.title !== '' ? workspace.title : workspace.path,
        }))

      const [state, setState] = useState(undefined)
      const [failure, setFailure] = useState(undefined)
      const [notice, setNotice] = useState(undefined)
      const [pending, setPending] = useState(() => new Set())
      const [view, setView] = useState({ kind: 'list' })
      const [draft, setDraft] = useState(undefined)
      const [baseline, setBaseline] = useState(undefined)
      const [tab, setTab] = useState('settings')
      const [expanded, setExpanded] = useState({ basics: true, schedule: true, prompt: true })
      const [viewer, setViewer] = useState(undefined)
      const [savedStatus, setSavedStatus] = useState(null)
      const [confirmation, setConfirmation] = useState(null)
      const setToast = useCallback(notice => toastStore.set(notice), [])
      const [revision, setRevision] = useState(undefined)

      const dirty = !sameDraft(draft, baseline)
      const errors = draft === undefined ? {} : draftErrors(t, draft)

      const begin = useCallback(action => {
        setPending(current => new Set(current).add(action))
      }, [])
      const end = useCallback(action => {
        setPending(current => { const next = new Set(current); next.delete(action); return next })
      }, [])

      const load = useCallback(async () => {
        try {
          const body = await api('/status')
          setState(body)
          setRevision(body.revision)
          setFailure(undefined)
          return body
        } catch (error) {
          setFailure(error instanceof Error ? error.message : String(error))
          return undefined
        }
      }, [])

      useEffect(() => {
        let alive = true
        load().catch(() => {})
        // Run-now feedback is polled at 3s while something is running, 15s idly.
        let timer
        const scheduleNext = () => {
          if (!alive) return
          timer = setTimeout(async () => {
            const body = await load()
            scheduleNext()
            if (body !== undefined) return
          }, 15_000)
        }
        scheduleNext()
        return () => { alive = false; clearTimeout(timer) }
      }, [load])

      const report = useCallback(error => {
        if (error?.code === 'REVISION_CONFLICT' || error?.status === 409) {
          setNotice({ tone: 'error', text: t('task.conflict'), conflict: true })
          return
        }
        const text = error instanceof Error ? error.message : String(error)
        setToast({ tone: 'error', text: `${t('toast.failed')}: ${text}` })
      }, [t])

      // A dirty leave asks through an in-app modal (not window.confirm) and
      // resumes the exact navigation afterwards.
      const requestLeave = useCallback(action => {
        if (!dirty) { action(); return }
        setConfirmation({
          title: t('task.unsaved'),
          body: t('task.confirmLeave'),
          keepLabel: t('task.deleteKeep'),
          confirmLabel: t('task.discard'),
          tone: 'danger',
          onConfirm: () => { setConfirmation(null); action() },
        })
      }, [dirty, t])

      const openTask = useCallback(id => requestLeave(() => {
        const task = state?.tasks.find(candidate => candidate.id === id)
        if (task === undefined) return
        const next = draftOf(task)
        setDraft(next)
        setBaseline(next)
        setView({ kind: 'editor', id })
        setTab('settings')
        setSavedStatus(null)
        setNotice(undefined)
      }), [requestLeave, state])

      const openNew = useCallback(() => requestLeave(() => {
        const next = blankDraft(state?.providers ?? [], workspaceItems)
        setDraft(next)
        setBaseline(next)
        setView({ kind: 'editor', id: undefined })
        setTab('settings')
        setSavedStatus(null)
        setNotice(undefined)
      }), [requestLeave, state, workspaceItems])

      const backToList = useCallback(() => requestLeave(() => {
        setView({ kind: 'list' })
        setDraft(undefined)
        setBaseline(undefined)
        setNotice(undefined)
        load().catch(() => {})
      }), [requestLeave, load])

      const discard = useCallback(() => {
        if (baseline !== undefined) setDraft(baseline)
        setNotice(undefined)
      }, [baseline])

      const set = useCallback(patch => {
        setDraft(current => current === undefined ? current : { ...current, ...patch })
        setNotice(undefined)
      }, [])

      const toggleSection = useCallback(key => {
        setExpanded(current => ({ ...current, [key]: !current[key] }))
      }, [])

      const showSaveStatus = useCallback(body => {
        if (body === undefined || body.status === undefined) return
        const entry = body.status[view.id ?? draft?.id]
        if (entry === undefined) return
        setSavedStatus(entry.scheduled
          ? `${t('task.cronPreview')}: ${entry.expression}`
          : `${t('tasks.never')} · ${entry.reason ?? ''}`)
      }, [draft, t, view.id])

      const save = useCallback(async (thenRun) => {
        if (draft === undefined || Object.keys(errors).length > 0) return false
        const action = thenRun ? 'saveAndRun' : 'save'
        begin(action)
        try {
          const body = await api('/task', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...bodyOf(draft, view.id), expectedRevision: revision }),
          })
          if (body?.revision !== undefined) setRevision(body.revision)
          const next = await load()
          const id = body?.task?.id ?? draft.id
          if (next !== undefined) {
            const saved = next.tasks.find(task => task.id === id)
            if (saved !== undefined) {
              const seeded = draftOf(saved)
              setDraft(seeded)
              setBaseline(seeded)
            }
          }
          setView({ kind: 'editor', id })
          if (!thenRun) setToast({ tone: 'ok', text: t('task.saved') })
          showSaveStatus(body)
          return true
        } catch (error) {
          report(error)
          if (error?.code !== 'REVISION_CONFLICT' && error?.status !== 409) {
            setNotice({ tone: 'error', text: t('task.saveFailed') })
          }
          return false
        } finally {
          end(action)
        }
      }, [begin, draft, end, errors, load, report, showSaveStatus, t, view.id])

      const performDelete = useCallback(async () => {
        begin('delete')
        try {
          await api('/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: view.id, expectedRevision: revision }),
          })
          setDraft(undefined)
          setBaseline(undefined)
          setView({ kind: 'list' })
          setToast({ tone: 'ok', text: t('task.deleted') })
          await load()
        } catch (error) {
          report(error)
        } finally {
          end('delete')
        }
      }, [begin, end, load, report, revision, setToast, t, view.id])

      const remove = useCallback(() => {
        if (draft === undefined || view.id === undefined) return
        setConfirmation({
          title: t('task.deleteTitle'),
          body: t('task.deleteBody').replace('{title}', draft.title),
          keepLabel: t('task.deleteKeep'),
          confirmLabel: t('task.deleteConfirmAction'),
          tone: 'danger',
          onConfirm: () => { setConfirmation(null); performDelete() },
        })
      }, [draft, t, view.id, performDelete])

      // "Save & run" is the only way to start a run from the editor: it makes
      // the just-saved config the one the runner reads, so a stale draft can
      // never launch a run with old settings.
      const saveAndRun = useCallback(async () => {
        const ok = await save(true)
        if (!ok) return
        const id = view.id ?? draft?.id
        if (id === undefined) return
        begin('run')
        try {
          await api('/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id }),
          })
          setToast({ tone: 'ok', text: t('task.started') })
          await load()
        } catch (error) {
          report(error)
        } finally {
          end('run')
        }
      }, [begin, draft, end, load, report, save, t, view.id])

      const openFile = useCallback((kind, name) => {
        setViewer({ kind, name, text: undefined, error: undefined })
      }, [])
      const closeViewer = useCallback(() => { setViewer(undefined) }, [])

      useEffect(() => {
        if (viewer === undefined || viewer.text !== undefined || viewer.error !== undefined) return undefined
        let alive = true
        api(`/text?kind=${encodeURIComponent(viewer.kind)}&name=${encodeURIComponent(viewer.name)}`)
          .then(body => { if (alive) setViewer(current => current === undefined ? current : { ...current, text: body.text }) })
          .catch(error => {
            if (!alive) return
            const message = error instanceof Error ? error.message : String(error)
            setViewer(current => current === undefined ? current : { ...current, error: message })
          })
        return () => { alive = false }
      }, [viewer])

      const noticeNode = notice === undefined
        ? null
        : h('div', {
            className: `na_notice${notice.tone === 'error' ? ' error' : ''}`,
            role: notice.tone === 'error' ? 'alert' : 'status',
          },
          notice.text,
          notice.conflict
            ? h('button', {
                type: 'button', className: 'na_btn',
                onClick: () => { load().catch(() => {}); setNotice(undefined) },
              }, t('task.refresh'))
            : null)

      // A later poll failure must not silently leave stale data on screen.
      const staleNode = failure === undefined || state === undefined
        ? null
        : h('div', { className: 'na_notice error', role: 'alert' },
            t('loadFailed'),
            h('button', {
              type: 'button', className: 'na_btn',
              onClick: () => { setFailure(undefined); load().catch(() => {}) },
            }, t('retry')))

      if (state === undefined) {
        const body = failure === undefined
          ? h('div', { className: 'na_loading' },
              h('span', { className: 'na_spinner', 'aria-hidden': true }))
          : h('div', { className: 'na_notice error' },
              t('loadFailed'),
              h('button', {
                type: 'button', className: 'na_btn',
                onClick: () => { setFailure(undefined); load().catch(() => {}) },
              }, t('retry')))
        return h('div', { className: 'na_root' }, body)
      }

      const current = view.kind === 'editor' && view.id !== undefined
        ? state.tasks.find(task => task.id === view.id)
        : undefined
      const running = current?.running ?? false

      return h(Fragment, null,
        h('div', { className: 'na_root' },
          staleNode,
          noticeNode,
          view.kind === 'list'
            ? h(TaskListPage, {
                t, language, tasks: state.tasks, orphans: state.orphans,
                onOpen: openTask, onCreate: openNew, onCreatePlaceholder: openNew, onOpenFile: openFile,
              })
            : draft === undefined
              ? null
              : h(TaskEditor, {
                  t,
                  draft,
                  set,
                  providers: state.providers,
                  workspaces: workspaceItems,
                  onBrowse: () => ctx.uiWorkspace.pickDirectory(),
                  report,
                  pending,
                  isNew: view.id === undefined,
                  dirty,
                  errors,
                  savedStatus,
                  tab,
                  onTab: setTab,
                  expanded,
                  onToggle: toggleSection,
                  onSave: () => { save(false).catch(() => {}) },
                  onCancel: discard,
                  onBack: backToList,
                  onDelete: remove,
                  onSaveAndRun: () => { saveAndRun().catch(() => {}) },
                  running,
                  current,
                  paths: state.paths,
                  onOpenFile: openFile,
                })),
        viewer === undefined ? null : h(FileViewer, { t, viewer, onClose: closeViewer }),
        confirmation === null ? null : h(ConfirmModal, {
          t,
          title: confirmation.title,
          body: confirmation.body,
          keepLabel: confirmation.keepLabel,
          confirmLabel: confirmation.confirmLabel,
          tone: confirmation.tone,
          onKeep: () => setConfirmation(null),
          onConfirm: confirmation.onConfirm,
        }))
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), 'nightly-automation: dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', 'dsh-nightly-automation')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'nightly-automation: styles')
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'nightly-automation', order: 45, label: () => t('nav'), locale: NS,
      }, props => h(Panel, { ...props, t, ctx })))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay', id: 'nightly-automation.toast', locale: NS,
      }, () => h(ShellToastHost, { t, store: toastStore })))
    }
    return { inject: ['slots', 'locale'], apply }
  },
})
