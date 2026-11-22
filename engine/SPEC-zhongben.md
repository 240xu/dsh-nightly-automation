# SPEC — 上海市中本贯通资料收集自动化

状态：2026-11-11 冻结。本文件是后续每一步改动的验收依据；实现与它冲突时以本文件为准，除非先修订本文件。

## 1. 目标

把夜间自动化从「打磨 dsh websearch」切换为「每晚收集上海市中本贯通（中职—本科贯通培养）学习资料与考试范围」，产出可核查、可去重、按日累积的结构化报告。同时让 AI 在任意会话里能直接调工具创建/管理任务，任务维度补齐 agent 预设与会话续跑。

## 2. 口径（已冻结，不再追问）

| 项 | 决定 |
|---|---|
| superpower | 本机无同名 DSH skill/bundle，按 **SDD 规格驱动**执行：本 SPEC → 实现 → 对照验收 |
| 全新会话 vs 续跑 | **并存**。`resumeSessionId` 为空 = 每晚全新独立会话（默认）；非空 = 续跑该会话 |
| 旧任务 | `websearch-polish` **停用保留**（代码已提交 `91f6ce3b`），新建 `zhongben-guantong` |
| 排期 | `daily 23:00 Asia/Shanghai`，沿用现有 cron 投影机制 |
| 模型 | `<PROVIDER_ID>/<MODEL_ID>`（当前 profile 中有效），`reasoningEffort: max` |

## 3. 任务字段契约（tasks.json）

在现有 12 字段基础上新增 3 个；所有字段均经 Host `normalizeTask` 校验后才写盘：

| 字段 | 类型 | 默认 | 校验 |
|---|---|---|---|
| `agentPreset` | `string \| null` | `null` | 必须在本 profile 的预设清单内；`null` 表示不注入预设 |
| `resumeSessionId` | `string \| null` | `null` | 形如 `session-<hex>-…`；会话须存在且 `header.cwd === task.cwd` |
| `collect` | `object \| null` | `null` | `{ topics: string[], sourceDomains: string[], dedupeKey: string }`，数组非空、每个元素为非空字符串 |

硬约束：
- **`resumeSessionId !== null` 时 `agentPreset` 必须为 `null`**。headless `assertAdoptable` 拒绝带预设的续跑会话；Host 在校验期直接拒绝并给出明确错误，不把冲突留到运行期。
- 新建任务默认 `agentPreset=null`、`resumeSessionId=null`，即保持最早的「独立会话」语义。
- `promptFile` 与 `promptText` 仍沿用现有分离：提示词落 `prompts/<id>.md`，不进 catalog。

## 4. Host HTTP 契约

沿用现有 `/nightly-automation/*` 前缀与 Host/Origin 信任栅栏、revision 栅栏、`catalog.audit.log`。

| 路由 | 变更 |
|---|---|
| `GET /status` | 响应新增 `presets: [{id,name?,description?}]`、`sessions: [{id,title,cwd}]`（供 UI 选择续跑会话）；保留 `tasks/providers/paths/orphans/revision` |
| `POST /task` | 接受并校验 3 个新字段；`expectedRevision` 不变；返回 `task/status/revision` |
| `POST /delete` | 不变 |
| `POST /run` | 不变（仍从磁盘读任务，保证 cron 与手动同构） |
| `GET /text` | 不变 |

`/status` 的 `sessions` 只列**可续跑**候选：非子会话、无 agentPreset、未被归档、cwd 等于任一现存任务 cwd（或全部会话由 UI 过滤）。取数失败不致命，返回空数组并在 UI 显示提示。

## 5. 工具契约（AI 可直接调用）

新增子路径导出 `dsh-nightly-automation/tools`，`inject: ['tools']`，用 `defineTool` 注册，挂进 agent 预设的 plugin 列表（默认 `standard`）。四个工具**复用与 HTTP 路由完全相同的内部函数**，禁止第二套校验/写盘逻辑：

| 工具 | 主要入参 | 输出 |
|---|---|---|
| `automation_task_create` | `id, title, prompt, schedule, model, workspace, agentPreset?, resumeSessionId?, collect?, enabled?, retries?, timeoutHours?` | `{ok, task, status, revision}` 或 `{ok:false, error, code?}` |
| `automation_task_list` | `includeDisabled?` | `{ok, tasks:[{id,title,enabled,cron,nextRun,agentPreset,resumeSessionId}]}` |
| `automation_task_run` | `id` | `{ok}` |
| `automation_task_delete` | `id, expectedRevision?` | `{ok, status}` |

- `workspace` 接受工作区路径（与现有 `cwd` 一致）；工具写入前用与 `/task` 相同的 `stat(cwd).isDirectory()` 校验。
- `schedule` / `model` 结构复用现有 `ScheduleFields`/`bodyOf` 语义，避免造第二套真相。
- 工具执行受 `exec.signal` 约束；`presentCall` 给出可读卡片标题（如「创建自动化任务：上海市中本贯通资料收集」）。
- 工具与面板写入都触发 `syncCrontab` 与审计；两者并发由 revision 栅栏处理。

## 6. 执行层契约（runner.mjs）

```
args = [--profile, headless, --patch, overlay, --json, prompt]
     + (resumeSessionId ? [--session-id, resumeSessionId] : [])
```

- `overlay` 生成规则：
  - 复制 live profile 的 `llm-pi-ai` 条目 + 覆盖 `agent-default-model`（现有逻辑）。
  - `agentPreset !== null` 且**非续跑**时，追加 `agent-preset-registry` 的 `default` 覆盖与对应 `preset-*` 定义（从 web profile 抽取，或由 spec 允许的只读注入）。
  - 续跑模式**不注入任何预设**（headless 硬约束）。
- 报告：模型写 `reports/<id>-<YYYY-MM-DD>.md`；runner 不代写内容，只保证目录存在、日志与 `cron.log` 落盘、`pruneLogs` 按 `keepRuns` 清理。
- 重试：沿用 `retries:2`、15s/30s 退避、仅传输类错误；`UNKNOWN_MODEL`、cwd 不符、预设冲突不重试。
- 超时：`timeoutHours`（默认 3，该任务 4）。

## 7. 资料收集内容契约（prompt）

`prompts/zhongben-guantong.md` 要求模型产出：

1. **范围**：上海市中本贯通（中职—本科贯通）招生政策、当年招生计划、院校与专业目录、考试科目/大纲/考试范围、历年录取分数线、官方教材与复习资料、报名与志愿时间线。
2. **来源优先级**：上海市教育考试院 / 上海市教委 / 各招生院校官网 / 官方招生简章 → 再考虑权威媒体与公开资料库。
3. **每条必须带**：`来源标题`、`URL`、`抓取日期`、`发布/修订年份`、`可信等级（官方/二手/未核实）`。
4. **报告结构**（Markdown）：
   - `# 上海市中本贯通资料 · YYYY-MM-DD`
   - `## 今日新增`（相对上一份报告去重后的条目）
   - `## 考试范围`（按科目分小节）
   - `## 院校与专业`（表格）
   - `## 时间线`
   - `## 未核实 / 抓取失败`（逐条写失败原因与 URL）
   - `## 来源清单`
5. **去重**：以 `collect.dedupeKey`（默认 `url+year+subject`）对比上一份报告，已收录条目不重复展开，只在「今日新增」为空时明确写出。
6. **禁止**：编造 URL、把检索不到写成事实、调用官方 `web_search`（本机 401）。改用 `web_fetch` 与 unified/DuckDuckGo 能力；每条失败都要留痕。
7. **提交纪律**：每次运行尽快提交；报告写完即结束，不做 3 小时长链路研究。

## 8. 面板契约（client.js）

- Advanced 折叠区新增：**Agent 预设**下拉（含「不指定」）、**续跑会话**选择（`useSessions` 候选 + 手填 ID）、**收集配置**（topics / sourceDomains / dedupeKey）。
- 续跑选中时自动把预设置为「不指定」并禁用，避免用户制造非法组合；反之选中预设时清空续跑并提示二者互斥。
- 列表行显示预设标签与「新会话 / 续跑 <id 前 8 位>」标记。
- 沿用 staged dirty、sticky footer、tabs、revision 冲突、shell.overlay toast、orphan 历史区；字典 zh/en 键数保持一致。

## 9. 验收清单

- [ ] `tasks.json` 中 `zhongben-guantong` enabled、`websearch-polish` disabled；crontab 只有一条 active `0 23 * * * --task zhongben-guantong`
- [ ] `GET /status` 返回 presets 与 sessions；新字段读写往返正确
- [ ] 非法组合（续跑+预设、cwd 不符、未知预设）在 Host 校验期被拒，错误信息明确
- [ ] 模型调 `automation_task_create` 建测试任务成功，tasks/crontab/audit 同步；`automation_task_run` 产生新会话日志；删除后 orphan 入口可达
- [ ] `resumeSessionId` 非空时 runner 拼出 `--session-id` 且真实续跑成功
- [ ] `agentPreset` 非空时 overlay 含预设定义且短任务跑通
- [ ] 23:00 定时触发产出 `reports/zhongben-guantong-<date>.md`，含来源 URL 与抓取日期
- [ ] 面板明暗模式、Escape、报告查看器、历史区无 console 错误
- [ ] 清理所有测试任务/日志/锁；工作树干净；文档记录本轮

## 10. 不做

并排双栏 UI（560px 放不下）；字段级自动保存 / SSE；删除历史记录；改 master 或 push；触碰主 checkout `<DSH_CHECKOUT>`。
