#!/bin/bash
# Supplementary sweep: candidate-detail + evaluator-review page (previously unswept)
AB="agent-browser"
BASE="http://localhost:3000"
ADMIN_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4NzAwMDByNWd4N2dvMXRzY2siLCJlbWFpbCI6InRlc3RhZG1pbkBtaXJkYy5nb3YucGgiLCJuYW1lIjoiVGVzdCBBZG1pbiIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.M4l5oYzetjxkgxyGKXPTg6AwHq0hPv_HjuqYVwCa6vs"
EVAL_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4ODAwMDFyNWd4dTRrYml1NzIiLCJlbWFpbCI6InRlc3RldmFsdWF0b3JAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgRXZhbHVhdG9yIiwicm9sZSI6IkVWQUxVQVRPUiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.WF1pnGE5Gfnx1UtrbruTQJ_2SARFP8Y_puVb7NbCkyI"
OVJS='(() => { const vw = document.documentElement.clientWidth; const ov = document.documentElement.scrollWidth - vw; const canary = (document.querySelector("main") || document.querySelector("header")) ? "ok" : "ERR"; return "PAGE=" + canary + " OV=" + ov; })()'

sweep() { # session token views...
  local s=$1; shift; local t=$1; shift
  $AB --session "$s" open "$BASE/" >/dev/null 2>&1
  $AB --session "$s" wait --load networkidle >/dev/null 2>&1
  $AB --session "$s" wait 1000 >/dev/null 2>&1
  [ -n "$t" ] && $AB --session "$s" cookies set next-auth.session-token "$t" >/dev/null 2>&1
  for v in 320 375 768 1024 2560; do
    $AB --session "$s" set viewport $v 900 >/dev/null 2>&1
    for view in "$@"; do
      $AB --session "$s" open "$BASE/$view" >/dev/null 2>&1
      $AB --session "$s" reload >/dev/null 2>&1
      $AB --session "$s" wait --load networkidle >/dev/null 2>&1
      $AB --session "$s" wait 900 >/dev/null 2>&1
      echo "[$s][${v}px] $view -> $($AB --session "$s" eval "$OVJS" 2>/dev/null)"
    done
  done
  $AB --session "$s" close >/dev/null 2>&1
}
sweep cd2 "$ADMIN_TOKEN" "#/candidate?id=1" "#/candidate?id=2" "#/evaluator-review"
sweep ce2 "$EVAL_TOKEN" "#/candidate?id=1" "#/candidate?id=2"
echo DONE
