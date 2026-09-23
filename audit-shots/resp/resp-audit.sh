#!/bin/bash
# RMIS responsive audit — body-level horizontal overflow check per view × viewport
AB="agent-browser"
BASE="http://localhost:3000"
ADMIN_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4NzAwMDByNWd4N2dvMXRzY2siLCJlbWFpbCI6InRlc3RhZG1pbkBtaXJkYy5nb3YucGgiLCJuYW1lIjoiVGVzdCBBZG1pbiIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.M4l5oYzetjxkgxyGKXPTg6AwHq0hPv_HjuqYVwCa6vs"
EVAL_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4ODAwMDFyNWd4dTRrYml1NzIiLCJlbWFpbCI6InRlc3RldmFsdWF0b3JAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgRXZhbHVhdG9yIiwicm9sZSI6IkVWQUxVQVRPUiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.WF1pnGE5Gfnx1UtrbruTQJ_2SARFP8Y_puVb7NbCkyI"
APP_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4OTAwMDJyNWd4cGx3MXR0ZjEiLCJlbWFpbCI6InRlc3RhcHBsaWNhbnRAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgQXBwbGljYW50Iiwicm9sZSI6IkFQUExJQ0FOVCIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.F05RDES6yaotEpsilf-Yz6oVEUFA6XLYRS2NpFvhOXs"

OVERFLOW_JS='(() => { const vw = document.documentElement.clientWidth; const ov = document.documentElement.scrollWidth - vw; const bad = []; if (ov > 1) { document.querySelectorAll("body *").forEach(el => { const r = el.getBoundingClientRect(); if (r.right > vw + 1 && r.width > 40 && bad.length < 6) { const c = (typeof el.className === "string") ? el.className.slice(0,70) : ""; bad.push(el.tagName + "|" + c); } }); } const canary = (document.querySelector("main") || document.querySelector("header")) ? "ok" : "ERR"; const auth = document.body.innerText.includes("Sign in") ? "ANON" : "authed"; return "PAGE=" + canary + " AUTH=" + auth + " OV=" + ov + (bad.length ? " CULPRITS=" + bad.join(" ;; ") : ""); })()'

run_suite() {
  local name="$1"; shift
  local token="$1"; shift
  local views="$1"; shift
  local v;
  $AB --session "$name" open "$BASE/" >/dev/null 2>&1
  if [ -n "$token" ]; then
    $AB --session "$name" cookies set next-auth.session-token "$token" >/dev/null 2>&1
  fi
  # Force a FULL document load so the SPA boots WITH the cookie — a hash-only
  # open after the first load does not reload, and the session provider would
  # stay anonymous for the whole sweep (false OV=0).
  local boot="1"
  for v in 320 375 768 1024 2560; do
    $AB --session "$name" set viewport $v 900 >/dev/null 2>&1
    for view in $views; do
      $AB --session "$name" open "$BASE/?boot=$boot$view" >/dev/null 2>&1
      boot=$((boot+1))
      $AB --session "$name" wait --load networkidle >/dev/null 2>&1
      $AB --session "$name" wait 300 >/dev/null 2>&1
      local res
      res=$($AB --session "$name" eval "$OVERFLOW_JS" 2>/dev/null)
      echo "[$name][${v}px] $view -> $res"
    done
  done
}

echo "===== ANONYMOUS ====="
run_suite anon "" "/ #/jobs #/signin"
agent-browser --session anon close >/dev/null 2>&1
echo "===== ADMIN ====="
run_suite adm "$ADMIN_TOKEN" "#/operations #/recruitment #/candidates #/analytics #/settings #/review-queue"
agent-browser --session adm close >/dev/null 2>&1
echo "===== EVALUATOR ====="
run_suite evl "$EVAL_TOKEN" "#/review-queue #/candidates #/recruitment"
agent-browser --session evl close >/dev/null 2>&1
echo "===== APPLICANT ====="
run_suite app "$APP_TOKEN" "#/ #/profile #/jobs"
agent-browser --session app close >/dev/null 2>&1
echo "===== DONE ====="
