#!/bin/bash
# Dynamic-state responsive checks (popover / dossier / modal / sheet)
AB="agent-browser"
BASE="http://localhost:3000"
DIR="/home/z/my-project/audit-shots/resp"
ADMIN_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4NzAwMDByNWd4N2dvMXRzY2siLCJlbWFpbCI6InRlc3RhZG1pbkBtaXJkYy5nb3YucGgiLCJuYW1lIjoiVGVzdCBBZG1pbiIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.M4l5oYzetjxkgxyGKXPTg6AwHq0hPv_HjuqYVwCa6vs"
EVAL_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4ODAwMDFyNWd4dTRrYml1NzIiLCJlbWFpbCI6InRlc3RldmFsdWF0b3JAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgRXZhbHVhdG9yIiwicm9sZSI6IkVWQUxVQVRPUiIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.WF1pnGE5Gfnx1UtrbruTQJ_2SARFP8Y_puVb7NbCkyI"
APP_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtdWNjaGp4OTAwMDJyNWd4cGx3MXR0ZjEiLCJlbWFpbCI6InRlc3RhcHBsaWNhbnRAbWlyZGMuZ292LnBoIiwibmFtZSI6IlRlc3QgQXBwbGljYW50Iiwicm9sZSI6IkFQUExJQ0FOVCIsImlhdCI6MTc5MDE0ODc1NSwiZXhwIjoxNzkwMjM1MTU1fQ.F05RDES6yaotEpsilf-Yz6oVEUFA6XLYRS2NpFvhOXs"

boot() { # session token w h
  $AB --session "$1" open "$BASE/" >/dev/null 2>&1
  $AB --session "$1" wait --load networkidle >/dev/null 2>&1
  $AB --session "$1" wait 1200 >/dev/null 2>&1
  [ -n "$2" ] && $AB --session "$1" cookies set next-auth.session-token "$2" >/dev/null 2>&1
  $AB --session "$1" set viewport $3 $4 >/dev/null 2>&1
}

echo "== 1. Notifications popover @320 (admin) =="
boot d1 "$ADMIN_TOKEN" 320 900
$AB --session d1 open "$BASE/#/operations" >/dev/null 2>&1
$AB --session d1 reload >/dev/null 2>&1
$AB --session d1 wait --load networkidle >/dev/null 2>&1; $AB --session d1 wait 1000 >/dev/null 2>&1
$AB --session d1 eval '(() => { const b = document.querySelector("button[aria-label^=\"Notifications\"]"); if (!b) return "NO-BELL"; b.click(); return "clicked"; })()'
$AB --session d1 wait 800 >/dev/null 2>&1
$AB --session d1 eval '(() => { const w = document.querySelector("[data-radix-popper-content-wrapper]"); if (!w) return "NO-POPOVER"; const r = w.getBoundingClientRect(); return JSON.stringify({left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: window.innerWidth}); })()'
$AB --session d1 screenshot "$DIR/d01-notif-320.png" >/dev/null 2>&1 && echo saved-d01
$AB --session d1 close >/dev/null 2>&1

echo "== 2. Review dossier open @1024 (evaluator) =="
boot d2 "$EVAL_TOKEN" 1024 768
$AB --session d2 open "$BASE/#/review-queue" >/dev/null 2>&1
$AB --session d2 reload >/dev/null 2>&1
$AB --session d2 wait --load networkidle >/dev/null 2>&1; $AB --session d2 wait 1500 >/dev/null 2>&1
$AB --session d2 eval '(() => { const cards = document.querySelectorAll("[aria-label*=\"Review\"]"); if (cards.length) { cards[0].click(); return "card-clicked:" + cards.length; } const any = document.querySelector("main button[class*=\"lift\"]"); if (any) { any.click(); return "lift-clicked"; } return "NO-CARD"; })()'
$AB --session d2 wait --load networkidle >/dev/null 2>&1; $AB --session d2 wait 1800 >/dev/null 2>&1
$AB --session d2 eval '(() => { const h1 = document.querySelector("h1"); const ov = document.documentElement.scrollWidth - document.documentElement.clientWidth; return JSON.stringify({h1: h1 ? h1.textContent.slice(0,40) : "none", ov}); })()'
$AB --session d2 screenshot "$DIR/d02-dossier-1024.png" >/dev/null 2>&1 && echo saved-d02
$AB --session d2 close >/dev/null 2>&1

echo "== 3. Candidates quick-view modal @320 (admin) =="
boot d3 "$ADMIN_TOKEN" 320 900
$AB --session d3 open "$BASE/#/candidates" >/dev/null 2>&1
$AB --session d3 reload >/dev/null 2>&1
$AB --session d3 wait --load networkidle >/dev/null 2>&1; $AB --session d3 wait 1500 >/dev/null 2>&1
$AB --session d3 eval '(() => { const btns = Array.from(document.querySelectorAll("main table button, main [role=row] button")); if (!btns.length) return "NO-ROW-BTN"; btns[btns.length-1].click(); return "clicked"; })()'
$AB --session d3 wait 1200 >/dev/null 2>&1
$AB --session d3 eval '(() => { const dlg = document.querySelector("[role=dialog]"); if (!dlg) return "NO-DIALOG"; const r = dlg.getBoundingClientRect(); const ov = document.documentElement.scrollWidth - document.documentElement.clientWidth; return JSON.stringify({w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth, ov}); })()'
$AB --session d3 screenshot "$DIR/d03-quickview-320.png" >/dev/null 2>&1 && echo saved-d03
$AB --session d3 close >/dev/null 2>&1

echo "== 4. Mobile nav sheet @320 (applicant) =="
boot d4 "$APP_TOKEN" 320 900
$AB --session d4 open "$BASE/#/" >/dev/null 2>&1
$AB --session d4 reload >/dev/null 2>&1
$AB --session d4 wait --load networkidle >/dev/null 2>&1; $AB --session d4 wait 1500 >/dev/null 2>&1
$AB --session d4 eval '(() => { const m = document.querySelector("button[aria-label=\"Open navigation menu\"]"); if (!m) return "NO-MENU"; m.click(); return "clicked"; })()'
$AB --session d4 wait 900 >/dev/null 2>&1
$AB --session d4 eval '(() => { const dlg = document.querySelector("[role=dialog]"); if (!dlg) return "NO-SHEET"; const r = dlg.getBoundingClientRect(); return JSON.stringify({w: Math.round(r.width), vw: window.innerWidth}); })()'
$AB --session d4 screenshot "$DIR/d04-navsheet-320.png" >/dev/null 2>&1 && echo saved-d04
$AB --session d4 close >/dev/null 2>&1
echo ALL-DONE
