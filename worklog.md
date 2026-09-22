# Worklog

---
Task ID: 1
Agent: Z.ai Code (main orchestrator)
Task: Clone https://github.com/mi7sudev/RMISv3.8.git and prepare comprehensive flow analysis

Work Log:
- Cloned repo to /home/z/RMISv3.8 (211MB, Next.js 16 + Prisma/SQLite recruitment system for DOST-MIRDC)
- Read AGENTS.md: confirmed stack (Next.js 16 App Router, React 19, TS5, SQLite via Prisma 6.11, custom JWT auth with jose + bcryptjs, RBAC ADMIN/EVALUATOR/APPLICANT, AI PDS auto-extract via OpenAI-compatible API, audit log in separate db/audit.db)
- Identified structure: src/app/api/* (API routes), src/components/views/* + src/components/workspaces/* (frontend), src/lib/* (business logic), prisma/schema.prisma (pure mapping to legacy DB)

Stage Summary:
- Repo cloned and oriented. Dispatching 4 parallel analysis agents: DB schema (2-a), Backend APIs (2-b), Frontend flows (2-c), Business logic (2-d). Final deliverable: comprehensive FLOW specification MD file with no UI/theme/layout details.
---
Task ID: 2-b
Agent: Explore (Backend API analysis)
Task: Analyze RMISv3.8 backend API layer

Work Log:
- Read worklog.md context (Task 1: repo cloned, 4-agent analysis dispatched).
- Enumerated all 49 route.ts files under /home/z/RMISv3.8/src/app/api/ (auth, session, jobs, applications, applicant/*, evaluator/*, admin/*, reference, health, files, api root) and read each in full.
- Read core libs defining API contracts: api.ts (ok/err/handleApi envelope + ApiError), jwt.ts + auth.ts (HS256 JWT, cookie "next-auth.session-token", 24h, guards), roles.ts / role-utils.ts / access-tier.ts (role derivation + intranet two-tier enforcement), rate-limit.ts, validation.ts (all Zod schemas), sanitize.ts (HTML allowlist), status.ts (status vocabulary), wire.ts / raw-json.ts / snapshot.ts (wire shapes + SQLite json-column workaround).
- Read business-logic libs: applicant-data.ts (junction-table loaders/clearers), profile-completeness.ts (server-side completion gate), mqr.ts (MQR engine), requirements.ts (reviewer-side match report), positions.ts, humanize.ts, divisions.ts, env.ts, db.ts (BigInt polyfill).
- Read PDS pipeline: extraction.ts, pds-parser.ts (deterministic Excel parser), pds-photo.ts (AI-free photo extraction), ai-client.ts (NVIDIA OpenAI-compatible client), documents.ts + file-types.ts (upload store + sidecar JSON).
- Read notification subsystems: email.ts (mock/resend + 8 templates), sms.ts (mock/android/semaphore), audit-log.ts + audit-db.ts (dedicated db/audit.db).
- Cross-checked HTTP method inventory: 26 GET, 21 POST, 4 PATCH, 1 PUT, 9 DELETE handlers; no middleware.ts — all auth is per-route via require*FromReq guards.

Stage Summary:
- Envelope: every route returns raw JSON via ok()/err(); success = data object directly, error = {error, details?}. handleApi() catches everything — ApiError passes its message, anything else returns generic 500 (no internals leak).
- Auth: custom JWT (jose, HS256, secret NEXTAUTH_SECRET ≥16 chars) in httpOnly cookie "next-auth.session-token" (or __Secure- variant), 24h expiry, secure flag only on HTTPS deploys. Claims {id:string, email, name, role}. Roles derived at login: is_admin→ADMIN, role_id=3→APPLICANT, else EVALUATOR. Live-account re-check (blocked/deleted→401) on every guarded call.
- Two-tier network access: staff (ADMIN/EVALUATOR) blocked at 3 enforcement points from public web (login 403, session→user:null, requireRoleFromReq 403) via last-XFF-entry IP classification; INTRANET_ENFORCEMENT=off is the kill switch.
- Rate limits (in-memory): login 5 fails→progressive lockout 1/3/5/10/15/30 min keyed IP+identifier; register 5/hour/IP; direct emails 20/10min/user.
- Application submission (POST /api/jobs/apply): APPLICANT-only; enforces deadline, duplicate-block (409), profile-completion gate (personal + ≥1 education + ≥1 work), and server-side MQR gate (education/eligibility/experience/training; all must "Meets the minimum requirements"); writes Application (status "Applied"), snapshot_profile/educations/experiences/trainings/eligibilities/awards via raw SQL, junction links, audit APPLICATION_SUBMITTED, SMS via notifyApplicationSubmitted.
- Evaluator review: GET queue (paginated, ?status, dateApplied asc, per-row requirements match verdict computed from snapshots vs live position CSC standards); GET [id] returns full snapshot bundle (snake_case→camelCase transformed); PATCH [id] sets status (SETTABLE: Applied/Under Review/Shortlisted/Rejected both spellings) + fires email (shortlist/under-review/regret templates) + SMS + notification row + audit; literal "Applied" write is a silent revert. assessments/[applicationId] upserts the interview-assessment scorecard and auto-derives status (Unsatisfactory→Rejected, else Shortlisted).
- Notices: notice route (regret|interview|skills_exam) enforces doctrine (regret never to shortlisted; interview/skills only to shortlisted stage), fans out email+SMS+in-app Notification+audit; regrets bulk route (≤200 ids) dedupes on email_logs subject prefix "Application regret —"; direct email route resolves recipient server-side, allows ≤3 attachments (5MB/file, 10MB total), 502 on failed send.
- Admin: users CRUD (soft-disable default, hard delete guards self+admin), stats dashboard (counts + failedLogins24h from audit.db), audit-logs browser, email/sms test panels, positions CRUD (19-field mapped writer), eligibilities dictionary; admin/applicants lists ALL applicants incl. accountless ones.
- Files: upload POST multipart ≤10MB, MIME/ext allowlist (images/PDF/Word/Excel), 12 categories, stored at upload/<applicantId>/<uuid>.<ext> + .meta.json sidecar + best-effort mirror to files/files_related_mph; GET /api/files/[...path] serves with per-role authorization, path-traversal guard, meta.json never served, no-store.
- Audit log: 25 action codes written to dedicated db/audit.db (better-sqlite3, WAL) + console JSON line; one-time migration from legacy notifications rows; ADMIN-only read API with filters + summary.
---
Task ID: 2-a
Agent: Explore (DB schema analysis)
Task: Analyze RMISv3.8 database layer

Work Log:
- Read /home/z/my-project/worklog.md for context (repo cloned at /home/z/RMISv3.8, Next.js 16 + Prisma 6.11 + SQLite, pure-mapping schema to db/production-data.db)
- Read prisma/schema.prisma fully (1509 lines, 81 models, 9 sections); read db-schema.txt fully (95 physical tables) and cross-checked: 14 tables intentionally unmapped (5 admin_*, 9 components_evaluation_*, i18n_locale) + place_of_assignments_user_lnk; sms_logs/email_logs are new app tables absent from the dump
- Read src/lib/db.ts (BigInt.toJSON polyfill, global-cached PrismaClient, env validation), src/lib/raw-json.ts (better-sqlite3 readonly sidecar for 16 Unsupported("json") columns), src/lib/audit-db.ts (db/audit.db audit_logs schema, WAL, historical migration from notifications "[AUDIT]%" rows)
- Read src/lib/documents.ts, requirements.ts, positions.ts, role-utils.ts, status.ts, mqr.ts header, env.ts, file-types.ts, applicant-data.ts (junction loaders/link creators), apply route (snapshot write path via $executeRaw)
- Read prisma/seed.ts (STALE — references fields that do not exist in the mapping schema) and scripts/seed-fresh.ts (the real reset+seed tool) and scripts/create-admin.ts (bcrypt cost 10 staff accounts, role link 1)
- Verified status vocabularies (src/lib/status.ts is single source of truth) and *_ord conventions (Date.now() ordering values)

Stage Summary:
- Schema is a PURE MAPPING (never db push): all 81 models @@map/@map to legacy Strapi-era tables; NO Prisma @relation — every m2m is an explicit *_lnk junction table with Float *_ord ordering columns
- Type conventions: DATETIME = epoch-ms INTEGER (Prisma DateTime?), DATE = TEXT "1993-07-25" (String?), json SQLite columns = Unsupported("json")? skipped by Prisma → read via raw-json.ts (better-sqlite3 readonly), written via $executeRaw; BigInt columns (mobile_number, division_id, incumbent_id) serialized as strings by polyfill in db.ts
- Domains: Users/Auth (up_users + up_roles + lnk, roles: is_admin=1 → ADMIN, role_id 3 → APPLICANT, else EVALUATOR); Applicant ~90-col profile + 7 child record groups (education/wexp/training/eligibility/award/accomplishment + forms/summary) each with own applicant_id_lnk; Jobs (jobpostings ↔ postions via jobpostings_postions_lnk, postions carries csc_* MQR standards); Applications with 7 snapshot_* JSON columns (frozen profile at apply time); Interviews/Assessments/Examinations with 11 rating+comment dimension pairs; Notifications; Projects; Files/files_related_mph polymorphic attachments
- applications.application_status is free varchar with MIXED stored spellings (Title Case "Applied"/"Shortlisted"/"Rejected"/"Under Review" + legacy UPPER_CASE FOR_EVALUATION etc.); src/lib/status.ts normalizes; writable set = 4 canonical values. applicants.application_status is an unrelated Boolean. Documents sidecar status: UPLOADED/PROCESSING/EXTRACTED/PARTIALLY_EXTRACTED/FAILED
- MQR is NEVER persisted (no mqr_results column): computed at apply-time (mqr.ts gate) and recomputed at review from snapshots vs live position csc_* (requirements.ts → MET/NOT_MET/NOT_REQUIRED/REVIEW)
- Documents live on filesystem upload/<applicantId>/<uuid>.<ext> + <uuid>.meta.json sidecar (source of truth), best-effort mirrored into legacy files + files_related_mph (related_type "api::applicant.applicant", field merged_pdf/education_attachment/profile_picture/...)
- Audit log is a separate db/audit.db (better-sqlite3, WAL): audit_logs(timestamp ISO, user_id, user_label, user_role, action, entity_type, entity_id, description, ip_address) with 4 indexes; historical "[AUDIT]" notifications rows migrated on boot
- prisma/seed.ts is stale/broken vs the mapping schema; scripts/seed-fresh.ts is the real seeder (wipes domain tables except RBAC trio, seeds 4 places, 3 eligibilities, 16 courses, 4 positions, 4 postings, test accounts password123); scripts/create-admin.ts creates staff (bcrypt cost 10, provider "local", role 1 "Authenticated")
- Legacy quirks preserved: table "postions" + "postion_id" typo, up_users.no_of_attemps, applicants.status_of_eployment, is_fillouted/information_fillouted, courses.abbri, table "merged_awards_accomp73efd_applicant_accomplishments_lnk", files_related_mph."order" reserved word, created_by_id/updated_by_id FK to admin_users (left null for applicant-created rows)
---
Task ID: 2-d
Agent: Explore (Business logic analysis)
Task: Analyze RMISv3.8 business rules and domain logic

Work Log:
- Read worklog.md for context; listed src/lib (41 modules), docs/, upload/, scripts/
- Deep-read mqr.ts (token-based MQR engine) + requirements.ts (reviewer-side MET/NOT_MET/NOT_REQUIRED/REVIEW engine) and traced both call sites (jobs/apply, jobs/verify-mqr, evaluator/queue, evaluator/applications/[id])
- Read csc-requirements.ts (CSC MC 07 s.2025 education registry, 8 eligibility options, field specs), positions.ts (19-field wire→column map, salaryStep rename trap), divisions.ts (8 official divisions)
- Read pds-parser.ts in full (label-anchored C1/C2/C3 parsing, furniture/noise filters, continuation-sheet classifier), pds-photo.ts (PDF raster + xlsx xl/media ZIP heuristics), PDS-2026-field-map.md (11-sheet 2026 template anchors), test-pds-parser.ts + inspect-pds-xlsx.ts
- Read extraction.ts (1220 lines: excel→text, PDF page-chunking, 2-call PDS LLM path, VLM image path, dedupe/merge), ai-client.ts (NVIDIA OpenAI-compatible, 2-step OCR+structure vision)
- Read profile-completeness.ts (3-requirement gate), status.ts (status vocabulary + pipeline stages + SETTABLE/QUERYABLE whitelists), snapshot.ts (snake→camel normalizer) + apply route (snapshot freezing, raw SQL json write)
- Read email.ts (mock/resend providers, 6 templates), sms.ts (mock/android/semaphore, PH E.164 normalization), audit-log.ts (23 actions), rate-limit.ts (progressive login lockout ladder, generic consumeRateLimit), validation.ts (all zod schemas), sanitize.ts (HTML allowlist), file-types.ts, access-tier.ts (two-tier intranet), roles.ts + role-utils.ts
- Read apply/verify-mqr/notice/regrets/email/queue/login/documents/profile routes for enforcement, notification triggers, and audit call sites
- Read MOM-2026-09-03-analysis.md, MOM docx (extracted text via unzip), MC No. 07 s. 2025.pdf (pypdf), Pasted Content txt files (identical UI mockups), RMIS DESIGN.md (UI-only), audit-doc-extract.md, DEPLOYMENT-RUNBOOK.md + RUN_LOCALLY.md (skim)

Stage Summary:
- TWO MQR engines: (1) mqr.ts at APPLY time — applicant-fatal gate (all four must pass or HTTP 400, never persisted); education = token match needing ≥2 of required tokens (≥1 if applicant tokenizes "bachelor", "relevant" → any education), eligibility = subset-of-tokens match with boilerplate-only → any-holds-an-eligibility rule, experience = Σ yearDecimal ≥ extracted years (paren number priority), training = Σ hours ≥ extracted hours; (2) requirements.ts at REVIEW time — honest-verdict snapshot engine (MET/NOT_MET/NOT_REQUIRED/REVIEW, verdicts ALL_MET/PARTIAL/NONE_MET/NEEDS_REVIEW/NO_REQUIREMENTS) recomputed live, edu clause parser with min-level (1-6) + course-token matching, "professional" eligibility satisfied by level≥5 or RA1080 license
- CSC catalog: MC 07 s.2025 amended first-level education options (8 entries) + higher-level (5); 8 CSC eligibility options with exam-based vs conferment-based field specs; "None Required" is non-holdable vocabulary; legacy titles self-heal to official strings
- Status state machine: canonical pipeline Applied → Under Review → Shortlisted | Rejected (system ends at notification; everything after is face-to-face per MOM); SETTABLE = {Applied/APPLIED, Under Review/UNDER_REVIEW, Shortlisted/SHORTLISTED, Rejected/REJECTED} — only EVALUATOR+ADMIN write; literal "Applied" write = silent revert (no notifications); 6 legacy spellings (For Evaluation/Screening/Evaluation/Evaluated/Final Review + Interview/Selected/Approved) normalized to Under Review / Shortlisted stages
- Completeness gate: personal (firstName+lastName+emailAddress) + ≥1 education + ≥1 work experience — enforced server-side in 3 places (PUT profile isProfileComplete=true, /profile/complete, /jobs/apply re-validates against live data + isFillouted)
- PDS pipeline: deterministic ExcelJS parser (C1 personal/education, C2 eligibility/work, C3 training/awards; label-anchored with furniture/country-noise filters, continuation-sheet classification, blank-template → 0 fields) is PRIMARY for PDS xlsx; LLM fallback = 2-call sequential (C1+C2 core, C3 trainings+awards) for excel, page-chunked (≤4 pages/11K chars, 40-page cap) shape-classified for PDFs, VLM (nemotron-vl) for images; auto-apply = OVERRIDE personal + REPLACE sections (zero entries keep old data); profile photo: PDF raster / xlsx ZIP media, ≥60px, ratio 0.3–3.5, largest wins, PNG ≤800px
- Notification matrix: apply → SMS received; status PATCH → Under Review email+SMS, Shortlist flagship email + generic SMS, Rejected/Declined → formal regret letter (no SMS), other statuses generic email+SMS; notices route: regret (never to Shortlisted-stage), interview/skills_exam (ONLY Shortlisted-stage, date/time/venue required); bulk regrets dedupe on "Application regret —" subject in email_logs (sent/mock), shortlisted hard-skip, max 200/batch; providers: email mock|resend, SMS mock|android(sms-gate/textbee)|semaphore; sendEmail/sendSms never throw, all sends logged to email_logs/sms_logs
- Audit: 23 actions to dedicated db/audit.db (better-sqlite3) + [AUDIT] console JSON; no PII/passwords; covers users, applications, postings, documents, profile lifecycle, notices, logins (incl. LOGIN_BLOCKED_EXTERNAL intranet enforcement)
- Rate limits: login 5 fails/15min → progressive lockout 1→3→5→10→15→30min (escalation remembered until successful login); register 5/IP/hour; direct email 20/user/10min (5MB/file, 10MB/email attachments)
- Files: 10MB per upload; images (png/jpg/jpeg/gif/webp/bmp), pdf, word (doc/docx), excel (xlsx/xls/xlsm); 12 document categories; MIME+extension check with octet-stream fallback to extension
- Hiring policy from docs: MOM 2026-09-03 mandates the 5-step flow + exact qualification strings + red alert + SHS option + hidden-after-deadline posting + 1-year retention + eligibility auto-DQ explicitly NOT implemented pending CSC-policy confirmation (CSC doctrine = preference-not-disqualification); MC 07 s.2025 education equivalency table drives csc-requirements.ts options
---
Task ID: 2-c
Agent: Explore (Frontend flow analysis)
Task: Analyze RMISv3.8 frontend functional flows

Work Log:
- Read app/page.tsx + layout.tsx: single-page hash-routed SPA; SessionProvider→NavProvider→AppShell; hydration-gated Router with per-role view switching
- Read nav-provider.tsx (hash router #/view?params, VIEW_ALIASES legacy mapping, ROLE_HOME), session-provider.tsx (boot refresh + 60s poll + focus/visibility silent refresh), config/navigation.ts (per-role nav sections)
- Read shell components: app-shell (public vs authed shells), nav-rail (collapsed/expanded w/ localStorage), workspace-header (breadcrumb + ⌘K + notifications), command-menu (nav + applicant/job search + sign out), notifications (admin stats-derived, 30s poll)
- Read lib/client.ts (apiFetch error policy, formatters, fullName), lib/api.ts (server helper), use-admin-data.ts + use-refetch-on-focus.ts (silent focus/poll refresh patterns, 30s admin / 15s applicant / 20s jobs polls)
- Read public landing: public-landing (hero+snapshot+ticker+jobs grid+how-to-apply), jobs-carousel (12-card grid, division filters, urgency chips, View-all → jobs), hero/how-to-apply/footer content+CTAs; noted life/method/facilities/showcase-banner sections exist but are unused (no imports)
- Read signup/signin views (fields, validation, auto-login, demo accounts, redirect-by-role)
- Read applicant-home (two-pane: open positions + applications rail, 15s poll, journey cards), application-detail-modal (full posting + cancel), jobs-view 1332 lines (search rail, facets, sort, pagination, quick view, detail page, apply/cancel confirms, MQR failure dialog, fast-track hook), fast-track-apply-dialog (upload→extract→auto-apply→review/certify→MQR→complete→apply), upload-pds-card (3-phase pipeline + one-extraction lock + clear-forms wipe)
- Read profile-view + use-profile-data + types (7 sections, completion %, autosave 1.2s debounce, mark-complete gate, sub-entity CRUD delete+create pattern, documents storage-only)
- Read profile sections field inventories: personal-info (identity/address/legal/character refs 1-5), education, work, training, eligibility (CSC spec-driven dynamic fields), awards, documents (category required, multi-select batch)
- Read evaluator: review-queue (kanban+list, roster column, qualified-only lens, bulk regret), review-modal (dossier tabs, decision rail, RequirementsMatchPanel, start review/shortlist/not-qualified + revise, notices w/ schedule dialog, direct email w/ attachment rules), review-workspace (deep-link wrapper), requirements-match (verdicts), status.ts + tracking-timeline (journey steps)
- Read recruitment: recruitment-list (search/status/sort/pagination + create/edit JobFormDialog fields incl. scalable comboboxes), job-workspace (Overview/Pipeline/Candidates/Activity tabs, edit, delete), job-delete-dialog (cascade ?scope=all), creatable-combobox
- Read candidates: candidate-workspace (list/kanban, filters, deep link ?status=incomplete, modal), candidate-detail (8 tabs), candidate-modal (quick view + mini-pipeline)
- Read admin command-center (attention tiles w/ deep links, active recruitment, activity feed, overview), analytics (funnel drill-down, volume line chart, status bar chart, audit feed), settings (users CRUD + create/edit validation, audit log viewer w/ ACTION_META, sms panel, email panel)
- Mined 5 audit docs for field inventories, validation rules, and known issues (noting they reference older iterations; current code shows several fixed e.g. isPwd casing)
- Composed exhaustive functional flow report (returned in final message)

Stage Summary:
- App is a client-only hash-routed SPA (#/view?params) on one Next.js page; SSR shows neutral shell until hydration; role routing: APPLICANT→home, EVALUATOR→review-queue, ADMIN→operations; legacy view names alias to new workspaces (my-applications→home, admin-*→new views)
- Session store outlives navigation; silent self-heal (focus/visibility/60s poll); every profile mutation re-syncs session (isProfileComplete gates apply)
- Status vocabulary centralized in lib/status.ts: pipeline Applied→Under Review→Shortlisted/Rejected; applicant journey labels Submitted/In Review/Shortlisted/Not Selected; timeline shows 3 checkpoints (Submitted/Review/Decision) — offline hand-off after shortlist is deliberate
- Apply has two paths: normal (profile-complete gate → MQR verify-mqr → POST /api/jobs/apply with confirm dialogs) and fast-track PDS (upload→extract→auto-apply→REVIEW+CERTIFY checkbox→MQR→profile/complete→apply); MQR failure dialogs route back to Profile
- Profile = 7 sections with completion ring, Google-Forms autosave (1.2s debounce), section entity CRUD (edit = delete+create), one-extraction lock on PDS auto-fill (Clear Forms wipes everything via /profile/clear)
- Evaluator review modal = dossier (Profile/Education/Experience/Documents snapshot tabs) + decision rail (RequirementsMatchPanel verdict MET/NOT_MET/REVIEW per CSC standard, credential checklist, Start Review/Shortlist/Not Qualified with email notices, revise, MOM notices: regret/interview invite/skills-exam w/ schedule form, direct email ≤3 files 5MB each 10MB total)
- HR job form: title, positionType (creatable), vacancies, division (registry code + creatable), CSC MQR fields (education/experience/training/eligibility/license), 4 richtext text+html pairs, publish/deadline/processing dates; delete cascades applications with ?scope=all confirm
- All admin/evaluator lists poll silently (15-30s) + refetch on focus; applicant home polls 15s; jobs board 20s; notifications badge 30s (admin only, derived from /api/admin/stats)
- Settings: Users (search/role filter/pagination, create: email+username≥3+password≥6+role, disable=DELETE, hard delete ?hard=1, edit w/ optional password reset), Audit log (action filter from server, summary tiles by role, ACTION_META labels), SMS panel (mock/android/semaphore, test send, last 25 sms_logs), Email panel (mock/resend, test send, email_logs incl. auto notices)
- Command menu (⌘K): role nav, jobs→job workspace, applicants→candidate detail (staff only), sign out; Notifications panel (admin): pending review/deadlines this week/incomplete profiles/failed logins — tiles deep-link to review-queue/recruitment/candidates?status=incomplete/settings?tab=audit

---
Task ID: 3
Agent: Z.ai Code (main orchestrator)
Task: Synthesize all agent findings into the final UI-agnostic FLOW specification MD

Work Log:
- Verified load-bearing contracts directly in source (status.ts vocabulary, MQR verdict strings, profile-completeness rule + exact error wording, apply-route gates)
- Cross-referenced and merged 4 agent reports (DB schema, API reference, frontend flows, business rules)
- Wrote /home/z/my-project/RMIS-FLOW-SPECIFICATION.md (~870 lines): system identity, actor model + intranet tier, session/auth flows, status state machine, full data model, complete API contract, 15 end-to-end flows per persona, business rules engines (MQR gate + reviewer requirements report + completeness + auto-apply + PDS parser + AI fallback), notification trigger matrix, document handling, audit catalog, security/validation, client behavior contracts, env config, seed data, deferred policy items, glossary

Stage Summary:
- Deliverable complete: RMIS-FLOW-SPECIFICATION.md — comprehensive, UI/theme/layout-free, flow-only spec ready to hand to another AI agent for a from-scratch rebuild
