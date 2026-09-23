#!/bin/bash
# Visual confirmation screenshots at critical viewport combos
AB="agent-browser"
BASE="http://localhost:3000"
DIR="/home/z/my-project/audit-shots/resp"

shot() { # session w h view outfile [wait]
  local s=$1 w=$2 h=$3 view=$4 out=$5
  $AB --session "$s" set viewport $w $h >/dev/null 2>&1
  $AB --session "$s" open "$BASE/$view" >/dev/null 2>&1
  $AB --session "$s" wait --load networkidle >/dev/null 2>&1
  $AB --session "$s" wait 600 >/dev/null 2>&1
  $AB --session "$s" screenshot "$DIR/$out" >/dev/null 2>&1
  echo "saved $out"
}

shot adm 320 900 "#/analytics" 01-adm-analytics-320.png
shot adm 375 900 "#/analytics" 02-adm-analytics-375.png
shot adm 375 900 "#/candidates" 03-adm-candidates-375.png
shot app 375 900 "#/jobs" 04-app-jobs-375.png
shot app 1024 768 "#/" 05-app-home-1024.png
shot evl 1024 768 "#/review-queue" 06-evl-kanban-1024.png
shot evl 768 1024 "#/review-queue" 07-evl-kanban-768.png
shot evl 1024 768 "#/evaluator-review" 08-evl-workspace-1024.png
shot adm 320 900 "#/settings" 09-adm-settings-320.png
shot adm 768 1024 "#/operations" 10-adm-ops-768.png
shot app 768 1024 "#/profile" 11-app-profile-768.png
shot adm 2560 1440 "#/candidates" 12-adm-candidates-2560.png
shot app 320 900 "#/jobs" 13-app-jobs-320.png
shot evl 768 1024 "#/evaluator-review" 14-evl-workspace-768.png
shot adm 768 1024 "#/recruitment" 15-adm-recruitment-768.png
echo DONE
