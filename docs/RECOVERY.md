# 源码重建说明（RECOVERY）

## 背景

2026-11-22 的 profile 清理把 `dsh-nightly-automation` 从 web profile 移除，
其源码目录 `<PLUGIN_DIR>/` 被删除
（`.artifacts/` 在 `.gitignore` 里，所以 git 里没有副本）。

删除后系统里仍留有四条线索：

1. `$DSH_HOME/profiles/web/pnpm-lock.yaml` 里还留着指向 `<PLUGIN_DIR>` 的 `link:` 记录
2. `$DSH_HOME-cleanup-<date>/` 保留了 `tasks.json.orig`、`automation-env.sh.orig`
3. `<ARTIFACTS>/websearch-research/` 的基线报告提到过这个插件的路径
4. **本会话的原始 session 日志**保留了全部 943 次工具调用，含每一次 write/edit 的完整载荷

第 4 条是决定性线索：DSH 的 session log 记录所有 tool call 的原始参数，
因此文件内容可以从日志精确重放，而不是凭记忆重写。

## 重建方法

```bash
# 1. 解开本会话日志
zstd -dc $DSH_HOME/sessions/<cwd-key>/<session-id>/session.v4.jsonl.zstd > /tmp/session.jsonl

# 2. 抽出所有触及插件目录的 write / edit / 写文件类 bash 命令，按 seq 排序
#    （排除 curl / crontab / plugin_manager / playwright 等非源码操作）

# 3. 在临时目录按 seq 顺序重放：
#    write → 直接落盘
#    edit  → old_string 精确替换（0 处匹配即视为漂移，记为失败）
#    bash  → 把插件绝对路径改写为临时目录后执行（只跑写文件类命令）

# 4. node --check 校验三个 JS 文件
```

关键点：**edit 的 `old_string` 必须能在当前文件里精确命中**。命中率本身就是
重建正确性的证据——若前面的重放顺序错了，后面的 edit 必然 no-match。

## 结果

- 重放事件 193 个（含 170 条写文件类 bash 命令）
- 3 个 bash 命令返回非 0，均为**当时就失败**的探测命令，不影响源码：
  - `2811` 依赖已被后续步骤覆盖的 `/tmp/full.js`
  - `3717` 是当时的 `node --check` 失败（随后被修好）
  - `3913` 依赖已被覆盖的 Panel 切分中间态
- 最终 `plugin/index.js` 1072 行、`plugin/client.js` 1473 行、`plugin/tools.js` 203 行，
  三者 `node --check` 通过
- 引擎侧同样从日志重放得到 `runner.mjs`（337 行）、`scheduler.mjs`（219 行）、
  `README.md`、`SPEC-zhongben.md`、提示词等

## 已知残缺

- **重放得到的是中途状态，不是最终态。** 会话日志在若干改写之后仍有后续修补，
  按 seq 重放会停在中途：`client.js` 里 `CollapsibleSection` / `EditorTabs` 各有重复定义，
  `shell.overlay` Toast 宿主缺失，`tools.js` 的 `parameters` 仍是裸 property map。
- **仓库里的文件才是最终态。** 它们包含后续的修正：Toast 落到 `shell.overlay`、
  `parameters` 规范化为标准 JSON Schema root（否则严格网关会对整批工具报 400）、
  runner 增加 `retries` / `timeoutHours`。
  两者差异说明见根 README 的 "Schema note"。
- 未在 0.2.2-rc.5 上重新加载验证。

以上残缺均记录在此，不再修——归档的目的是保留证据，不是恢复一个可运行产品。
