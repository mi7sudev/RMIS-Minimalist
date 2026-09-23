#!/bin/bash
# Post-fix visual verification at critical combos (memory-safe: cookie per session, close after)
AB="agent-browser"
BASE="http://localhost:3000"
DIR="/home/z/my-project/audit-shots/resp"
ADMIN_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4NzAwMDByNWd4N2dvMXRzY2siLCJlbWFpbCI6InRlc3RhZG1pbkBtaXJkYy5nb3YucGgiLCJuYW1lIjoiVGVzdCBBZG1pbiIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.M4l5oYzetjxkgxyGKXPTg6AwHq0hPv_HjuqYVwCa6vs"
EVAL_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4ODAwMDFyNWd4dTRrYml1NzIiLCJlbWFpbCI6InRlc3RldmFsdWF0b3JAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgRXZhbHVhdG9yIiwicm9sZSI6IkVWQUxVQVRPUiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.WF1pnGE5Gfnx1UtrbruTQJ_2SARFP8Y_puVb7NbCkyI"
APP_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4OTAwMDJyNWd4cGx3MXR0ZjEiLCJlbWFpbCI6InRlc3RhcHBsaWNhbnRAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgQXBwbGljYW50Iiwicm9sZSI6IkFQUExJQ0FOVCIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.F05RDES6yaotEpsilf-Yz6oVEUFA6XLYRS2NpFvhOXs"

batch() { # session token w h view outfile
  local s=$1 t=$2 w=$3 h=$4 view=$5 out=$6
  $AB --session "$s" open "$BASE/" >/dev/null 2>&1
  $AB --session "$s" cookies set next-auth.session-token "$t" >/dev/null 2>&1
  $AB --session "$s" set viewport $w $h >/dev/null 2>&1
  $AB --session "$s" open "$BASE/$view" >/dev/null 2>&1
  $AB --session "$s" wait --load networkidle >/dev/null 2>&1
  $AB --session "$s" wait 600 >/dev/null 2>&1
  $AB --session "$s" screenshot "$DIR/$out" >/dev/null 2>&1 && echo "saved $out"
  $AB --session "$s" close >/dev/null 2>&1
}

batch adm "$ADMIN_TOKEN" 375 900 "#/analytics" f01-adm-analytics-375.png
batch adm "$ADMIN_TOKEN" 320 900 "#/analytics" f02-adm-analytics-320.png
batch adm "$ADMIN_TOKEN" 320 900 "#/settings" f03-adm-settings-320.png
batch adm "$ADMIN_TOKEN" 768 1024 "#/operations" f04-adm-ops-768.png
batch evl "$EVAL_TOKEN" 1024 768 "#/review-queue" f05-evl-kanban-1024.png
batch evl "$EVAL_TOKEN" 768 1024 "#/review-queue" f06-evl-kanban-768.png
batch app "$APP_TOKEN" 1024 768 "#/" f07-app-home-1024.png
batch app "$APP_TOKEN" 320 900 "#/" f08-app-home-320.png
batch anon "" 768 1024 "#/jobs" f09-anon-jobs-768.png
batch anon "" 375 900 "#/jobs" f10-anon-jobs-375.png
echo DONE
