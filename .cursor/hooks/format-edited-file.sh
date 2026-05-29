#!/usr/bin/env bash
# Format the file that was just edited by the agent.
# Reads afterFileEdit hook input from stdin (JSON with file_path and edits).
# Exits 0 so the edit is not blocked.

set -e
input=$(cat)
if command -v jq >/dev/null 2>&1; then
  file_path=$(echo "$input" | jq -r '.file_path // empty')
else
  file_path=$(echo "$input" | grep -o '"file_path":"[^"]*"' | head -1 | sed 's/"file_path":"//;s/"$//')
fi

if [[ -n "$file_path" && -f "$file_path" ]]; then
  case "$file_path" in
    *.ts|*.tsx|*.js|*.jsx|*.json|*.md)
      bunx prettier --write "$file_path" 2>/dev/null || true
      ;;
  esac
fi

echo '{}'
