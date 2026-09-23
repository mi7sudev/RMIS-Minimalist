#!/bin/bash
# Self-healing screenshot runner v2: waits for page context before cookie set.
AB="agent-browser"
BASE="http://localhost:3000"
DIR="/home/z/my-project/audit-shots/resp"
ADMIN_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4NzAwMDByNWd4N2dvMXRzY2siLCJlbWFpbCI6InRlc3RhZG1pbkBtaXJkYy5nb3YucGgiLCJuYW1lIjoiVGVzdCBBZG1pbiIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.M4l5oYzetjxkgxyGKXPTg6AwHq0hPv_HjuqYVwCa6vs"
EVAL_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4ODAwMDFyNWd4dTRrYml1NzIiLCJlbWFpbCI6InRlc3RldmFsdWF0b3JAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgRXZhbHVhdG9yIiwicm9sZSI6IkVWQUxVQVRPUiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.WF1pnGE5Gfnx1UtrbruTQJ_2SARFP8Y_puVb7NbCkyI"
APP_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4OTAwMDJyNWd4cGx3MXR0ZjEiLCJlbWFpbCI6InRlc3RhcHBsaWNhbnRAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgQXBwbGljYW50Iiwicm9sZSI6IkFQUExJQ0FOVCIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.F05RDES6yaotEpsilf-Yz6oVEUFA6XLYRS2NpFvhOXs"

ensure_server() {
  for i in 1 2 3; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/")
    if [ "$code" = "200" ]; then return 0; fi
    echo "  [server down -> restarting (attempt $i)]"
    pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2
    cd /home/z/my-project && nohup bun run dev > dev.log 2>&1 &
    for w in $(seq 1 14); do
      sleep 5
      c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/")
      [ "$c" = "200" ] && break
    done
  done
  curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/" | grep -q 200
}

shot() { # session token w h view outfile
  local s=$1 t=$2 w=$3 h=$4 view=$5 out=$6
  ensure_server || { echo "SKIP $out (server unreachable)"; return 1; }
  $AB --session "$s" open "$BASE/" >/dev/null 2>&1
  $AB --session "$s" wait --load networkidle >/dev/null 2>&1
  $AB --session "$s" wait 1000 >/dev/null 2>&1
  $AB --session "$s" cookies set next-auth.session-token "$t" >/dev/null 2>&1
  # verify cookie really stored
  if ! $AB --session "$s" cookies 2>/dev/null | grep -q "next-auth.session-token"; then
    echo "RETRY-cookie $out"; $AB --session "$s" cookies set next-auth.session-token "$t" >/dev/null 2>&1; sleep 1
  fi
  $AB --session "$s" set viewport $w $h >/dev/null 2>&1
  $AB --session "$s" open "$BASE/$view" >/dev/null 2>&1
  $AB --session "$s" wait --load networkidle >/dev/null 2>&1
  $AB --session "$s" wait 1200 >/dev/null 2>&1
  $AB --session "$s" screenshot "$DIR/$out" >/dev/null 2>&1 && echo "saved $out"
  $AB --session "$s" close >/dev/null 2>&1
}

shot adm "$ADMIN_TOKEN" 375 900 "#/analytics" f01-adm-analytics-375.png
shot adm "$ADMIN_TOKEN" 320 900 "#/analytics" f02-adm-analytics-320.png
shot adm "$ADMIN_TOKEN" 320 900 "#/settings" f03-adm-settings-320.png
shot adm "$ADMIN_TOKEN" 768 1024 "#/operations" f04-adm-ops-768.png
shot evl "$EVAL_TOKEN" 1024 768 "#/review-queue" f05-evl-kanban-1024.png
shot evl "$EVAL_TOKEN" 768 1024 "#/review-queue" f06-evl-kanban-768.png
shot app "$APP_TOKEN" 1024 768 "#/" f07-app-home-1024.png
shot app "$APP_TOKEN" 320 900 "#/" f08-app-home-320.png
shot anon "" 768 1024 "#/jobs" f09-anon-jobs-768.png
shot anon "" 375 900 "#/jobs" f10-anon-jobs-375.png
echo ALL-DONE
