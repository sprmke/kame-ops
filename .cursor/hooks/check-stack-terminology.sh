#!/usr/bin/env bash
# afterFileEdit hook: warns when legacy stack terms are introduced.
# Reads JSON from stdin with "file_path". Never blocks edits.

set -e
input=$(cat)

if command -v jq >/dev/null 2>&1; then
  file_path=$(echo "$input" | jq -r '.file_path // empty')
else
  file_path=$(echo "$input" | grep -o '"file_path":"[^"]*"' | head -1 | sed 's/"file_path":"//;s/"$//')
fi

if [[ -n "$file_path" && -f "$file_path" ]]; then
  if rg -i -q "better auth|better-auth|neon|nextauth|auth\.js" "$file_path"; then
    echo "Warning: legacy stack term detected in $file_path. Prefer Supabase Postgres/Auth/Storage terminology." >&2
  fi
fi

echo '{}'
