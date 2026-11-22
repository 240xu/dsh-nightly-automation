This is a bounded rehearsal for a nightly automation, not a code change.

# Environment
- Working directory: `<WORKTREE>` — git worktree of DeepSeek Harness on branch `automation/websearch-polish`, deps installed.
- `HTTP_PROXY`/`HTTPS_PROXY=http://172.30.66.1:1091` are exported; there is no direct internet.
- OpenCode v2 reference checkout (read-only): `<REF_CHECKOUT>`, tag `v2.2.5`.

# Verified facts (do not re-derive, do not contradict)
- `web_search` currently fails at runtime: `dsh-web-search-deepseek` posts to `https://api.deepseek.com/anthropic/v1/messages` and gets HTTP 401 because the only DeepSeek key here is a third-party gateway key.
- `web_fetch` works through the proxy.
- The gateway's Messages endpoint accepts `web_search_20250305` without error but does not execute it, so it must not be substituted for a real provider.
- OpenCode v2's search design lives in `packages/core/src/websearch.ts`, `packages/schema/src/websearch.ts`, `packages/core/src/tool/plugin/websearch.ts`, `packages/plugin/src/{effect,promise}/websearch.ts`.

# Your task
Do **read-only analysis**. Do not edit any file in the worktree, do not commit, do not run builds.

1. Read DeepSeek Harness's current search implementation: `packages/web/web/src/types.ts`, `packages/web/web/src/index.ts`, `packages/web/web-search-deepseek/src/provider.ts`, `packages/web/tool-web/src/search.ts`, `packages/web/tool-web/src/index.ts`.
2. Read OpenCode v2's equivalents listed above.
3. Write a gap analysis to `$DSH_HOME/automation/reports/2026-11-04-rehearsal.md` with:
   - a comparison table (dimension | DSH today | OpenCode v2 | consequence for users)
   - the three highest-value, realistically shippable changes, each with the exact files it would touch and why it is safe
   - one recommendation, with the reasoning for picking it over the others
   - what you verified by reading code vs. what you inferred
4. Finish with a 5-line summary as your final message, ending in the word REHEARSAL_OK.

Be concrete: cite `path:line` for every claim about the code.
