#!/bin/bash
# Nightly web_search polish run.
#
# Cron entry:  0 23 * * * $DSH_HOME/automation/run.sh >> $DSH_HOME/automation/logs/cron.log 2>&1
#
# Cron starts a bare environment with no proxy, no credentials and no profile,
# so everything the run needs is loaded here from env.sh (mode 0600).
# One run at a time: a second invocation exits instead of fighting over the
# git worktree and the model quota.
set -uo pipefail

AUTOMATION_DIR="${DSH_HOME}/automation"
WORKTREE="${DSH_AUTOMATION_WORKTREE:-}"
PATCH_FILE="${AUTOMATION_DIR}/provider.patch.yml"
PROMPT_FILE="$AUTOMATION_DIR/prompt.md"
REPORT_DIR="$AUTOMATION_DIR/reports"
LOG_DIR="$AUTOMATION_DIR/logs"
LOCK_FILE="$AUTOMATION_DIR/state/run.lock"

[ -n "$WORKTREE" ] || { echo "DSH_AUTOMATION_WORKTREE is not set" >&2; exit 2; }

mkdir -p "$REPORT_DIR" "$LOG_DIR" "$(dirname "$LOCK_FILE")"

stamp="$(date +%Y%m%dT%H%M%S)"
log="$LOG_DIR/run-$stamp.log"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$stamp] another run holds $LOCK_FILE; skipping" >> "$LOG_DIR/cron.log"
  exit 0
fi

# shellcheck source=/dev/null
. "$AUTOMATION_DIR/env.sh"

cd "$WORKTREE" || { echo "[$stamp] worktree missing: $WORKTREE" >> "$LOG_DIR/cron.log"; exit 1; }

# Refuse to run on top of uncommitted work from an interrupted night: the
# report would then mix two runs' changes.
if [ -n "$(git status --porcelain)" ]; then
  echo "[$stamp] worktree dirty at start; refusing to run" >> "$log"
  git status --porcelain >> "$log"
  echo "[$stamp] skipped: dirty worktree" >> "$LOG_DIR/cron.log"
  exit 1
fi

{
  echo "=== run $stamp ==="
  echo "branch: $(git rev-parse --abbrev-ref HEAD)  head: $(git rev-parse --short HEAD)"
  echo "prompt bytes: $(wc -c < "$PROMPT_FILE")"
} >> "$log"

timeout 3h dsh --profile headless \
  --patch "$PATCH_FILE" \
  --json \
  "$(cat "$PROMPT_FILE")" >> "$log" 2>&1
status=$?

{
  echo "=== exit $status at $(date +%Y%m%dT%H%M%S) ==="
  echo "commits this run:"
  git log --oneline -5
  echo "worktree status:"
  git status --porcelain
} >> "$log"

if [ "$status" -eq 0 ]; then
  echo "[$stamp] ok -> $log" >> "$LOG_DIR/cron.log"
else
  echo "[$stamp] failed (exit $status) -> $log" >> "$LOG_DIR/cron.log"
fi
exit "$status"
