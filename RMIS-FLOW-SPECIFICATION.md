# RMIS v3.8 — Functional Flow Specification (UI-Agnostic)

**System:** RMIS — Recruitment Management Information System for **DOST-MIRDC** (Metals Industry Research and Development Center, a Philippine government R&D agency under the Department of Science and Technology).
**Source of truth:** reverse-engineered 1:1 from the production codebase (`mi7sudev/RMISv3.8` — Next.js 16 / TypeScript / Prisma / SQLite).
**Purpose of this document:** a complete, self-contained behavioral specification of the system's **flows, data, rules, and contracts** so that another AI agent can rebuild the entire application — its **UI, UX, theme, styling, and layout are yours to design from scratch**. Nothing in this document constrains visual presentation.

---

## 0. How to Read This Document (Ground Rules for the Rebuilding Agent)

1. **This spec intentionally omits ALL presentation concerns** — no colors, typography, spacing, components, or layout are specified. You have 100% freedom on UI/UX/theme/styling/layout.
2. What you MUST reproduce faithfully:
   - The **actor model** and what each role can see/do.
   - The **flows** (step order, gates, branches) as described.
   - The **data** each flow collects, displays, and exchanges.
   - The **business rules** (MQR evaluation, profile completeness, status machine, deadline visibility, notification doctrine).
   - The **API contracts** (paths, methods, payloads, status codes, and the *exact* error-message wording flagged as a "wording contract").
   - The **client behavior contracts** (polling cadence, session refresh triggers, deep-link/alias handling) — these are functional, not visual.
3. Where this document quotes a server message verbatim (in `"code spans"`), treat the wording as a **contract** — other logic branches on it.
4. Navigation model (functional): the production app is a **single-page application with one route (`/`)** and a **hash-based router** of the form `#/view?param=value&...`. Views are switched client-side per role. You may implement navigation differently, but the *set of views per role*, their *entry conditions*, and their *deep-link parameters* must be preserved. View keys and aliases are listed in §16.
5. Data storage conventions in production (SQLite, legacy Strapi-era naming) are documented in §5 for fidelity, but a rebuild may normalize storage **provided** every entity, field, and behavior in §5 and §6 is preserved.

---

## 1. System Identity & Purpose

RMIS digitizes government recruitment end-to-end for MIRDC:

1. **Applicants** register, build a **7-part profile** (Personal / Education / Work Experience / Training / Eligibility / Awards / Supporting Documents) — manually or by **uploading a CSC Personal Data Sheet (PDS, CS Form 212)** which the system auto-parses (deterministic parser, with AI fallback) and auto-fills into the profile.
2. Applicants **browse open job postings**, get **automatically screened against Minimum Qualification Requirements (MQR)**, and submit applications. Credentials are **snapshotted (frozen)** at apply time.
3. **HR/Evaluators** review applications against the frozen snapshots, **shortlist or reject**, and the system sends **status notices, regret letters, interview invitations, and skills-exam notices** (email + SMS + in-app).
4. **System intervention deliberately ENDS at the shortlist/reject notification.** Interviews, exams, and selection are conducted **face-to-face, offline** (per HR Minutes-of-Meeting 2026-09-03 policy).

Core loop (the 5-step MOM process the system implements):

```
1. Applicant submits application via RMIS
2. RMIS auto-evaluates minimum qualifications (MQR gate)
3. HR reviews qualified applicants and shortlists
4. System sends automated regret letters (not shortlisted)
5. System sends interview invitations / skills-exam notices (shortlisted)
   — everything after this point is offline
```

Technology context (for orientation only; the rebuild may re-platform): Next.js 16 App Router (React 19), TypeScript, Tailwind + shadcn/ui, SQLite via Prisma ORM (single file `db/production-data.db`), custom JWT auth (`jose`) + bcryptjs, separate audit SQLite file (`db/audit.db`), AI extraction via any OpenAI-compatible API (default NVIDIA), filesystem document storage under `upload/<applicantId>/`.

---

## 2. Actor Model & Access Control

### 2.1 Roles

| Role | Who | Purpose | Home view after sign-in |
|---|---|---|---|
| **ADMIN** | HR staff (full authority) | Everything an evaluator can do, PLUS user management, settings (email/SMS providers), audit log, command center, analytics | `operations` (Command Center) |
| **EVALUATOR** | HR staff (reviewer) | Review queue, application review/decisions, notices, bulk regrets, direct email, assessments, job posting CRUD, candidate registry, jobs board | `review-queue` |
| **APPLICANT** | Public job seekers | Register, profile, PDS upload/extraction, browse/apply, track/cancel own applications | `home` |
| **Anonymous** | Not signed in | Public landing, job board (read-only), sign-in/sign-up | `home` (landing) |

Role derivation (production data model): a user is ADMIN if `is_admin` flag is set; APPLICANT if linked to role id 3 (`applicants`); **EVALUATOR is the default for everyone else**. Admins can do everything evaluators can (evaluator guard = EVALUATOR **or** ADMIN).

### 2.2 Two-Tier Network Access (staff intranet lock)

- **Applicants/anonymous:** may access from any network (public internet).
- **Staff (ADMIN + EVALUATOR):** restricted to the **agency intranet** (private/loopback/CGNAT/link-local/IPv6-ULA IPs, or IPs in the `INTRANET_CIDRS` allowlist). Enforced at **three** independent chokepoints (defense in depth):
  1. `POST /api/auth/login` — staff login from a public IP → `403` + audit `LOGIN_BLOCKED_EXTERNAL`;
  2. `GET /api/session` — a staff session cookie resolved from a public IP returns `user: null` (fail closed) + audit `STAFF_ACCESS_BLOCKED_EXTERNAL`;
  3. Every guarded staff API call → `403` with a message explaining the intranet/VPN requirement.
- IP classification uses the **last** entry of `X-Forwarded-For` (proxy-vouched, spoof-resistant), then `X-Real-IP`. Kill switch: `INTRANET_ENFORCEMENT=off`.

### 2.3 Permission Matrix (API level)

| Capability | Anonymous | APPLICANT | EVALUATOR | ADMIN |
|---|---|---|---|---|
| Public landing, job board (GET jobs), health, reference data | ✔ | ✔ | ✔ (intranet) | ✔ (intranet) |
| Register / sign-in / sign-out | ✔ | ✔ | ✔ (intranet) | ✔ (intranet) |
| Session read | ✔ (null rules) | ✔ | ✔ (intranet) | ✔ (intranet) |
| Create/edit/delete job postings | ✗ | ✗ | ✔ | ✔ |
| MQR pre-check, apply, cancel own application, own profile CRUD, own documents, extraction | ✗ | ✔ | ✗ | ✗ |
| File downloads | ✗ | own files only | any | any |
| Evaluator queue, application detail, status decisions, notices, bulk regrets, direct email, assessments | ✗ | ✗ | ✔ | ✔ |
| Applicant master registry (`/api/admin/applicants`), positions management | ✗ | ✗ | ✔ | ✔ |
| User management, eligibility registry, stats, audit logs, email/SMS panels | ✗ | ✗ | ✗ | ✔ |

---

## 3. Session & Authentication

### 3.1 Session model

- JWT (HS256) containing `{ id, email, name, role }`; secret from `NEXTAUTH_SECRET`.
- Transported in an httpOnly cookie named `next-auth.session-token` (also accepts `__Secure-` prefix on read), `sameSite=lax`, `path=/`, 24-hour expiry; `secure` flag only when the request is HTTPS (plain-HTTP intranets must work).
- Login accepts **username OR email** as the identifier (case-insensitive on email).

### 3.2 `GET /api/session` (bootstrap)

Returns `{ user: null }` for: no session; staff resolved from a non-intranet network (audited); user deleted or `blocked`. Otherwise:

```json
{
  "user": {
    "id": "string", "email": "string", "username": "string",
    "role": "ADMIN|EVALUATOR|APPLICANT",
    "firstName": "string", "lastName": "string", "middleName": "string|null",
    "isActive": true,
    "applicant": { "id": number, "isProfileComplete": boolean } | null
  }
}
```

`applicant.isProfileComplete` is the **apply-gate flag** mirrored from the applicant record — it drives the applicant home banner and profile-completeness UX; every profile mutation must trigger a session refresh client-side.

### 3.3 Sign-in flow (`POST /api/auth/login`)

1. Body `{ identifier, password }`.
2. Rate limit: key = IP+identifier; **5 failed attempts per rolling 15 min**; on the 5th failure a **progressive lockout ladder** begins: 1 → 3 → 5 → 10 → 15 → 30 minutes; the escalation level is remembered until a successful login clears it.
3. Find user by email or username → bcrypt verify. Failure → `401 "Invalid credentials"` + audit `LOGIN_FAILED`.
4. Blocked account → `403 "Account is blocked"`.
5. Staff + non-intranet network → `403` (intranet message) + audit.
6. Success → audit `LOGIN_SUCCESS`, set cookie. Response: `{ id, email, username, role, firstName, lastName }`.
7. Client: toast welcome → session refresh → redirect to role home (ADMIN `operations`, EVALUATOR `review-queue`, APPLICANT `home`).

### 3.4 Registration flow (`POST /api/auth/register`)

- Rate limit: **5 per IP per hour** → `429`.
- Body: `{ email, firstName, lastName, password }`; password 6–128 chars. Duplicate email → `409`.
- Client-side additionally requires: password confirmation match and a **mandatory data-privacy consent checkbox** (RA 10173 compliance).
- Server (single transaction): create user (bcrypt cost 10, `is_applicant=true`, confirmed, not blocked, auto-username from email local part with numeric suffix dedupe) → role link (role id 3) → create **applicant profile row** → user↔applicant link.
- `201` → `{ id, email, role: "APPLICANT", applicantId }`.
- **Client flow: auto-login immediately after registration** (login with the email), session refresh, then navigate to the **profile builder** (new applicants land there, not home). Fallback to sign-in if auto-login fails.

### 3.5 Sign-out (`POST /api/auth/logout`)

Audits `LOGOUT`, expires the cookie with identical flags. Client: fire-and-forget (does not block navigation) → session refresh → navigate to sign-in.

---

## 4. Application Status Machine (Single Source of Truth)

### 4.1 Canonical pipeline

```
Applied ──→ Under Review ──→ ┌→ Shortlisted   (terminal in-system; interview is offline)
                             └→ Rejected      (terminal)
```

- The **in-system pipeline ends at the decision**. Interview scheduling, skills exams, and selection happen face-to-face; the system only *notifies*.

### 4.2 Stored values & normalization

The database contains mixed spellings (production Title Case + legacy UPPER_CASE). The status vocabulary module normalizes everything:

| Stored values (all aliases) | Canonical label | Semantics |
|---|---|---|
| `""`/DRAFT | Draft | neutral |
| `Applied`, `APPLIED` | **Applied** | submitted, not yet picked up |
| `Pending`, `PENDING` | Pending | treated as Applied stage |
| `Under Review`, `UNDER_REVIEW`, `For Evaluation`, `FOR_EVALUATION`, `Screening`, `SCREENING`, `Evaluation`, `EVALUATION`, `Final Review`, `FINAL_REVIEW`, `Evaluated`, `EVALUATED` | **Under Review** | evaluator has picked it up (all legacy spellings unify) |
| `Shortlisted`, `SHORTLISTED`, `Interview`, `INTERVIEW`, `Selected`, `SELECTED`, `Approved`, `APPROVED` | **Shortlisted** | passed; notice sent |
| `Rejected`, `REJECTED`, `Declined`, `DECLINED` | **Rejected** | not shortlisted |
| `Withdrawn`, `WITHDRAWN` | Withdrawn (Rejected stage) | |
| `Needs Correction`, `NEEDS_CORRECTION` | Needs Correction | |
| `Open`/`CLOSED` | (job-related legacy values) | |

### 4.3 Writable statuses & transition rules

- **API-writable (`SETTABLE_STATUSES`)** — only 4 values, in both spellings: `Applied | Under Review | Shortlisted | Rejected`. Enforced by validation (`statusUpdateSchema` with optional `reason` ≤500). **Only EVALUATOR/ADMIN** can write status. Applicants can never set status.
- There is **no explicit transition table** — any settable status may be written; correctness is enforced by *notification doctrine* (§9.3) and *notice stage guards* (§7.12):
  - Writing literal `"Applied"` = **silent revert**: no SMS, no email, no notification.
  - `Under Review` = explicit "Start Review" pick-up → dedicated under-review email + status SMS.
  - `Shortlisted` → flagship shortlist email + status SMS.
  - `Rejected`/`Declined` → **formal regret letter** email, **no** status SMS.
- **Applicant cancel:** only while status is exactly `Applied` (see §7.9).
- **Filterable statuses (`QUERYABLE_STATUSES`)** for the evaluator queue: 10 values × 2 spellings (Applied, Pending, Under Review, For Evaluation, Screening, Evaluation, Evaluated, Final Review, Shortlisted, Rejected, Interview, Selected, Approved, Declined, Needs Correction family); absent/invalid filter returns ALL. Queue ordering: **FIFO by application date ascending**.

---

## 5. Data Model (Functional Entity Catalog)

> Field lists are the functional source of truth. Production physical names are given in parentheses when the naming is non-obvious. FKs are by naming convention; ordering of child collections is preserved via float `*_ord` columns on junction tables (production writes epoch-ms timestamps there).

### 5.1 User (`up_users`)

`id`, `username`, `email`, `password` (bcrypt), `firstName`, `middleName`, `lastName`, `is_admin` (bool), `is_applicant` (bool), `blocked` (bool — deactivation flag), `confirmed` (bool), `information_fillouted` (bool), `otp`, `encrypted_id`, `no_of_attemps` (login throttling), Strapi scaffolding timestamps. **Never expose** password/otp/tokens in any API.

### 5.2 Applicant (`applicants`) — ~90 fields, the 7-part profile

**Identity:** `employee_number`, `first_name`, `middle_name`, `last_name`, `extension_name`, `nickname`, `employee_id`
**Contact:** `mobile_number` (BigInt), `contact_number`, `contact_number_secondary`, `telephone_number`, `email_address`
**Personal:** `birth_date` (TEXT "YYYY-MM-DD"), `birth_place`, `gender`, `civil_status`, `citizenship`, `height`, `weight`, `blood_type`, `religion`, `ethnicity`, `is_pwd` (bool)
**Government IDs:** `pagibig`, `gsis`, `philhealth`, `tin`, `sss`, `govt_issued_id`, `govt_id_issued_number`, `govt_id_issued_place`, `govt_id_date_issued`, `govt_id_valid_until`
**Present address:** `house_number`, `street`, `subdivision`, `barangay`, `city`, `province`, `country`, `zip_code`, `present_address`
**Permanent address:** `permanent_*` set (+ `permanent_zip_code`, `permanent_telephone_number`)
**Declarations:** `is_government`, `pending_cases`, `admin_case` + `admin_case_details`, `crime_charge` + `crime_date` (TEXT) + `crime_case_status`, `character_reference` (**JSON array**: name, title, company, companyAddress, email, contact — 1..5 entries), `specify_referral`, `remarks`
**Workflow:** `qualified`, `institution`, `application_status` (⚠️ legacy BOOLEAN, unrelated to the application status machine), `submitted_date`, **`is_fillouted`** (bool — THE profile-complete gate flag), `status_of_eployment` (legacy typo), `respondent_to`
**Legacy single-file attachment paths:** `image_path`, `application_letter_path`, `pds_path`, `employment_certificate_path`, `tor_path`, `coe_path`, `training_certificate_path`, `info_sheet_path`, `curriculum_vitae_path`, `performance_path`, `wexp_path` (coexist with the modern document store §10)

### 5.3 Profile sub-entities (each: content table + applicant junction with `*_ord` ordering)

| Entity | Key fields |
|---|---|
| **Education** | `education_level` (Elementary/Secondary/Vocational/College/Graduate — plus "Senior High School" concept), `degree`, `course`, `specify_others`, `school_name`, `ongoing` (bool), `is_highest_education`, `year_from`/`year_to` (TEXT), `highest_level`, `units_earned`, `year_graduated` (TEXT), `awards`, `hr_remarks` |
| **Work Experience** | `position_title`, `employer_name`, `employer_address`, `is_present_work`, `is_govt_service`, `inclusive_date_from/to` (datetime), `status_of_employment`, `monthly_salary` (float), `supervisor_name/position`, `office`, `reason_for_leaving`, `accomplishment`, `actual_duties`, `hr_remarks`, **`year_decimal`** (float — computed years used by MQR: derived from inclusive dates with 365.25-day years; open-ended = until today) |
| **Training** | `title_of_training`, `type_of_training`, `specify_training`, `number_hours` (int), `hour_decimal` (float, MQR: `hour_decimal ?? number_hours`), `is_present_work`, `is_govt_service`, inclusive dates, `hr_remarks` |
| **Eligibility** | NO title column — the display title comes from a link to the `eligibilities` reference vocabulary; own fields: `rating` (e.g. "85.5"), `exam_date`, `exam_place`, `license_number`, `license_validity`, `hr_remarks`. Exam-based types store rating/date/place; Bar/Board adds license no./validity; conferment-type entries reuse exam date/place as "date/place of conferment" |
| **Award** | `recognition_type` (Award/Accomplishment), `scope` (Individual/Group · Local/Foreign/International), `details`, `category`, `recognition_provider` (awarding body), `date_granted` (TEXT), `points`, `hr_remarks` |
| (legacy) Accomplishment | separate table, merged view with awards in UI vocabulary |

### 5.4 Position (`postions` — table typo preserved) — the plantilla item + CSC standards

- `item_number`, `position_title`, `position_type`, `position_status`, `position_salary_grade` (string), `position_salary_step` (string; wire name `salaryStep` — documented rename trap), `position_salary_amount`, `salary_grade`, `salary_amount` (float), `position_level` (int), `division_id` (BigInt), `place_of_assignment_id` (+ junction), `office_id`, `department_id`, `section_id`, `date_vacated`, `incumbent_id`, `years_required`, `hours_required`, `special_skill` / license, `preferred_qualification`, `competency_requirements` (+ richtext JSON)
- **CSC MQR standard columns** (the heart of matching):
  - `csc_education` (verbatim requirement text, e.g. "Bachelor's degree relevant to the job")
  - `csc_eligibility` and `csc_eligibility_group` (e.g. "Career Service Professional", "RA 1080 (Bar/Board)", "N/A")
  - `csc_work_experience` (e.g. "1 year of relevant experience" — quantity parsed)
  - `csc_training_requirements` (e.g. "Sixteen (16) hours of relevant training")
- Legacy free-text mirrors: `education`, `experience`, `training`, `eligibility`, `division`, `section`.

### 5.5 Job Posting (`jobpostings`) — the vacancy as published

- `position_type`, `number_of_vacancy` (int), `brief_description` (+ `brief_description_richtext`), `duties_responsibilities` (+ richtext), `compensation_package` (+ richtext), `other_qualifications` (+ richtext), `publish_date`, `deadline_date`, `processing_date`, `contract_date_from/to`
- Linked to a Position via junction `jobpostings_postions_lnk` (first-by-ord wins). Authored by a staff user.
- **Rich-text pairs:** plain textarea values are stored alongside sanitized HTML companions (`*_Html` fields) — HTML is sanitized server-side (allowlist; strips scripts/iframes/inline handlers/`javascript:`/styles/`data-*`; forces links to `target=_blank rel=noopener noreferrer`).

### 5.6 Application (`applications`)

- `date_applied` (datetime), `application_status` (string — the status machine §4)
- **7 snapshot JSON columns** (the frozen credentials, written via raw SQL because they are `Unsupported("json")` in Prisma):
  - `snapshot_profile`: id, firstName, lastName, emailAddress, contactNumber, gender, civilStatus, citizenship, birthDate, presentAddress, city, province, country, + characterReference (parsed array)
  - `snapshot_educations`, `snapshot_experiences`, `snapshot_trainings`, `snapshot_eligibilities`, `snapshot_awards`: full entry arrays
  - `snapshot_attachment`: attachment metadata (legacy)
- Linked to applicant and job posting via junction tables (`applications_applicant_lnk`, `applications_job_lnk`).
- **Snapshots are the reviewer's source of truth** — the live profile may drift after applying; reviewer surfaces must read snapshots. MQR results are **never persisted** (recomputed on demand).

### 5.7 Evaluation artifacts

- **Interview Assessment** (`applicant_interview_assessments`): 11 integer 1–10 ratings each with a comment — education, work_experience, training, eligibility, technical_skills, organizational_awareness, interpersonal_skills, adaptability, extra_curricular, personal_development, technology_application — plus `overall_assessment_rating` (Outstanding / Very Satisfactory / Satisfactory / Fair / Unsatisfactory), `comment_and_recommendation`, `type_of_application`, `year`. Linked to applicant, interviewer, position.
- **Interviewer** (`interviewers`): find-or-create by user name, position "Evaluator".
- **Interview** (`applicant_interviews`): date/mode/place/remarks/notified/zoom_link/type/year (offline workflow record).
- **Examination** (`applicant_examinations`): date/place/rating/psychosocial_test/mode/notified/type/year.

### 5.8 Notifications & message logs

- **In-app Notification** (`notifications`): `name`, `notification_description`, `notification_date` (TEXT), linked to an applicant via junction — used for status changes, notices, bulk regrets. (Historically also carried audit rows `name LIKE "[AUDIT]%"` — since migrated.)
- **`email_logs`**: to, subject, body_text, body_html, provider, status (`sent|failed|mock|skipped`), provider_ref, error, related_type/related_id (e.g. `"application"`, `"application-direct"`, `"test"`), attachments (metadata only: name+bytes), created_at.
- **`sms_logs`**: to, message, provider, status (`sent|failed|mock`), provider_ref, error, related_type/related_id, created_at.
- Subject **prefixes double as idempotency keys** (e.g. `"Application regret — "` ⇒ already-sent detection for bulk regrets; notice history queries email_logs by subject prefixes).

### 5.9 Reference / lookup data

- **Eligibilities** (`eligibilities`): name + sort index; seeded: "None Required", "Career Service Sub-Professional", "Career Service Professional". Draft/published duplication exists — dedupe by name on read; only published rows served.
- **Courses** (`courses`): name, abbreviation (`abbri`), category, level — seeded with 16 (BSBA, BSA, BSME, BSEE, BSCE, BSIE, BSCS, BSIT, BS Chem, BS Physics, BS Bio, BS Psych, AB PolSci; MSME, MPA, MBA).
- **Places of assignment** (`place_of_assignments`): name (seeded: Accounting Unit, Human Resource Development Unit, Metrology Laboratory, Materials and Corrosion Laboratory).
- **Divisions**: 8 official DOST-MIRDC divisions keyed by short code — PMD, TSSS, FAD, TDD, MPRD, TSD, AMMRDD, PERDD (plain string on positions; no table).
- **Projects** (`projects`): code, name, description, position_type, contract dates.
- **Evaluation criteria** (`evaluation_criterias`): effectivity_date, type, + 3 JSON criteria blobs (education/training/work-exp) — legacy scoring scaffolding (table exists; not surfaced by current flows).
- **Files/file-links** (`files`, `files_related_mph`): polymorphic attachment metadata mirror (every upload is best-effort mirrored here; `field` slot per document category; `files_related_mph."order"` is a reserved word needing quotes).

### 5.10 Audit database (separate SQLite file `db/audit.db`)

```
audit_logs (
  id INTEGER PK AUTOINCREMENT,
  timestamp TEXT,        -- ISO 8601
  user_id TEXT,          -- actor id
  user_label TEXT,       -- "username (email)"
  user_role TEXT,        -- ADMIN | EVALUATOR | APPLICANT | SYSTEM
  action TEXT,           -- see §11 catalog
  entity_type TEXT, entity_id TEXT,
  description TEXT,      -- human summary, NO PII
  ip_address TEXT
)
```
Indexes on timestamp/user_id/action/(entity_type, entity_id). Writes are fire-and-forget (never break an operation).

### 5.11 Applicant documents — filesystem, not DB

- Binary: `upload/<applicantId>/<uuid>.<ext>`; sidecar: `<uuid>.meta.json` — **the sidecar is the document's source of truth**:
  `{ id, applicantId, uploadedById, fileName, originalName, mimeType, size (bytes), filePath (relative), category, status, extractedJson, extractionError, extractedAt, createdAt, updatedAt, fileTableId }`
- Document `status`: `UPLOADED → PROCESSING → EXTRACTED | PARTIALLY_EXTRACTED | FAILED`.

---

## 6. Complete API Surface (Contract Reference)

Conventions:
- Envelope: success returns the payload JSON directly (HTTP 200/201); failure returns `{ "error": string, "details"?: object }` with 400/401/403/404/409/413/415/429/500/502. Unexpected exceptions always collapse to a generic 500 (never leak internals).
- Pagination: `?page` (≥1), `?pageSize` (1–100, default 50) → `{ data, total, page, pageSize, hasMore }`.
- Body convention `body.data ?? body`. Dates accepted as `YYYY-MM-DD` or full ISO. Numeric IDs parsed strictly (NaN → 400).
- **No middleware** — every route re-asserts auth + role + intranet tier itself.

### 6.1 Auth & session
| Method/Path | Role | Purpose / notes |
|---|---|---|
| `POST /api/auth/login` | public | §3.3 |
| `POST /api/auth/register` | public | §3.4 |
| `POST /api/auth/logout` | any | §3.5 |
| `GET /api/session` | public | §3.2 |

### 6.2 Jobs
| Method/Path | Role | Behavior |
|---|---|---|
| `GET /api/jobs` | public/any | Published postings, newest publish first. `?mine=true`, `?limit` (default 100, cap 200). **Deadline visibility rule:** non-staff viewers additionally exclude postings whose `deadline_date < start-of-today` (a posting disappears from public listing the day after closing); staff see all. Every item embeds: resolved `title` (position title → fallback brief description), `isActive`, full linked `position` (incl. all `csc_*`), `placeOfAssignment {id,name}`, author, viewer's own application(s) with status ("Applied" badge), and `applicationCount`. |
| `POST /api/jobs` | EVALUATOR/ADMIN | Create + immediately publish. Fields: `title`* (1–200), `positionType`, `numberOfVacancy` (1–99, default 1), `briefDescription` + `briefDescriptionHtml`, `dutiesResponsibilities` + `...Html`, `compensationPackage` + `...Html`, `otherQualifications` + `...Html`, `publishDate`, `deadlineDate`, `processingDate`, **qualification vitals**: `division`, `education`, `experience`, `training`, `eligibility`, `license`. HTML companions sanitized server-side. Vitals are **written through** to the linked position's `csc_*` columns; if no position selected but vitals present → a new Position row is created + linked. Audit `JOB_POSTING_CREATED`. |
| `PATCH /api/jobs/[id]` | EVALUATOR/ADMIN | Partial update; `positionId` present → junction delete+recreate; vitals write-through/update-or-create position. No audit on update. 404 if missing. |
| `DELETE /api/jobs/[id]` | EVALUATOR/ADMIN | **Confirm gate:** if linked applications exist and no `?scope=all` → `409 { applicationCount }` + warning message. With `scope=all`: cascade deletes junctions, applications (+ their snapshots), posting. Audit `JOB_POSTING_DELETED` (+N applications). |
| `POST /api/jobs/verify-mqr` | APPLICANT | `{ jobId }` → `{ mqrResults: { education, eligibility, workExperience, training }, allMet }` (read-only pre-check, §8.1). |
| `POST /api/jobs/apply` | APPLICANT | §7.8. Ordered gates: applicant link 404 → job 404 → **deadline passed 400** → duplicate 409 `"You have already applied for this position"` → **profile-completion gate** (flag AND live re-validation; failure → 400 with `details.missing[]`, message begins `"Please complete your profile"` — wording contract) → **server-side MQR gate** (failure → 400 `"You do not meet the Minimum Qualification Requirements for this position. Please update your profile."` + per-dimension `mqrResults`; fast-track cannot bypass) → create Application (status `"Applied"`) → raw-SQL snapshot write (7 columns) → junctions → audit `APPLICATION_SUBMITTED` → SMS "application received" (never throws). 201 → `{ ...application, status:"APPLIED", mqrResults, position }`. |
| `GET /api/applications` | APPLICANT | Own applications, newest first, each with embedded job+position+place; `assessments: []` (compat). |
| `DELETE /api/applications/[id]` | APPLICANT | Own only (junction ownership check → 403). **Cancellable only while `Applied`**; otherwise 400 with guidance to contact HR. Deletes junctions then the application (re-apply becomes possible). |

### 6.3 Applicant profile & sub-entities
| Method/Path | Role | Behavior |
|---|---|---|
| `GET /api/applicant/profile` | APPLICANT | Full applicant + all 5 ordered sections + parsed characterReferences + `isProfileComplete` alias. Section loads are failure-isolated (a corrupted section degrades to `[]`, never 500s). |
| `PUT /api/applicant/profile` | APPLICANT | Whitelist ~55 personal fields (`""`→null; mobile → digit-strip → BigInt; dates stay TEXT). `isProfileComplete:true` is **server-gated** via the completeness engine (§8.3) → sets `is_fillouted=true` + `submitted_date`. `characterReferences` → raw-SQL JSON update. Audit `PROFILE_UPDATED`. |
| `POST /api/applicant/profile/complete` | APPLICANT | Fast-track step: validates completion (400 + missing list otherwise); sets flag; audit `PROFILE_COMPLETED`. Returns `{ isProfileComplete: true, requirements }`. |
| `POST /api/applicant/profile/clear` | APPLICANT | **Destructive** re-upload gate: deletes ALL education/work/training/eligibility/award rows + junctions; nulls the form-managed personal fields; `is_fillouted=false`, `submitted_date=null`; `character_reference=NULL`; resets every extractable-category document sidecar back to `status:"UPLOADED"` (files kept for HR). Audit `PROFILE_CLEARED` (+counts). |
| `POST /api/applicant/profile/auto-apply` | APPLICANT | §8.4 (extraction application semantics). No audit. |
| `GET/POST /api/applicant/educations` · `DELETE /api/applicant/educations/[id]` | APPLICANT | Section CRUD. Same pattern for `work-experiences` (POST computes `yearDecimal`; GET sorts present-work-first then dateFrom desc), `trainings` (POST `hourDecimal ?? numberHours`), `awards` (dateGranted TEXT, sort desc). Delete verifies junction ownership (404 otherwise); deletes remove junction then row. **Updates are modeled as delete+recreate** (no PUT). |
| `GET/POST /api/applicant/eligibilities` (+`DELETE /[id]`) | APPLICANT | POST resolves the title against the eligibility vocabulary: explicit `eligibilityId` preferred, else find-or-create a **draft** reference row; links category. DELETE additionally **retires orphaned draft** reference rows (published rows never deleted). GET backfills `eligibilityTitle` through the link chain. |
| `GET /api/reference` | public | `{ eligibilities[], courses[], placesOfAssignment[] }` — published only, deduped by name. |

### 6.4 Documents
| Method/Path | Role | Behavior |
|---|---|---|
| `POST /api/applicant/documents` | APPLICANT | multipart `file` + `category` (one of 12; default SUPPORTING). **Max 10 MB (413)**. MIME/extension allowlist (§12.2; unknown MIME falls back to extension; generic octet-stream accepted when the extension is known) else 415. Storage §5.11; PROFILE_PICTURE = **replace semantics** (previous photos deleted). Best-effort mirror to legacy `files`/`files_related_mph` (never fatal). Audit `DOCUMENT_UPLOADED`. 201 → sidecar meta. |
| `GET /api/applicant/documents` | APPLICANT | Own sidecars, newest first. |
| `DELETE /api/applicant/documents/[id]` | APPLICANT | Removes binary + sidecar (mirror rows untouched). Audit `DOCUMENT_DELETED`. |
| `POST /api/applicant/documents/extract` | APPLICANT | `{ documentIds? , category? }`; default = own `UPLOADED` docs in the 8 extractable categories (PDS, RESUME, EDUCATION, WORK_EXPERIENCE, TRAINING, ELIGIBILITY, AWARD, ACCOMPLISHMENT). Marks all PROCESSING; returns a **streaming 200** with `\n` keep-alive every 5 s and a final `{ results: [{ id, status, fieldsExtracted, extraction, error? }], merged }`. Per-doc status: 0 fields → `FAILED` (+ special blank-CS-Form-212 message), <3 fields → `PARTIALLY_EXTRACTED`, else `EXTRACTED`. PDS × Excel uses the **deterministic parser first**; other formats → text extraction (exceljs / unpdf / mammoth) → LLM; images → vision model. `merged` = per-field highest-confidence merge across documents. |
| `GET /api/files/[...path]` | any signed-in | Serves `upload/<applicantId>/<file>`; APPLICANT → own directory only (403); staff → any. `.meta.json` never served. Path containment guard. `Content-Disposition: inline` with original name; `Cache-Control: private, no-store`. |

### 6.5 Evaluator workspace
| Method/Path | Role | Behavior |
|---|---|---|
| `GET /api/evaluator/queue` | EVALUATOR/ADMIN | All applications, FIFO by dateApplied asc, paginated. `?status` (validated against queryable set; invalid/absent = ALL). Per row: applicant mini, job + position title + place, and `match { verdict, metCount, requiredCount }` computed from **snapshots vs live position standards** (§8.2). |
| `GET /api/evaluator/applications/[id]` | EVALUATOR/ADMIN | Full review payload: application, applicant (live mini), job+position, `snapshots { profile (key-normalized snake→camel), educations, experiences, trainings, eligibilities, awards, documents: [] }`, `requirements` (full report §8.2 recomputed), `interviews: []`, `examinations: []`, `statusChanges: []` (no history table exists). |
| `PATCH /api/evaluator/applications/[id]` | EVALUATOR/ADMIN | `{ status ∈ SETTABLE, reason? ≤500 }` → writes status; side effects (§9.3): audit `APPLICATION_STATUS_CHANGED`; in-app notification; SMS (skipped for silent-revert `Applied` and for the rejected family); email routed by status (Shortlisted → flagship; Under Review → dedicated; Rejected → regret letter; else generic with reason). |
| `GET /api/evaluator/applications/[id]/notice` | EVALUATOR/ADMIN | `{ notices: [{ id, type: regret|interview|skills_exam, subject, status, to, sentAt }] }` — reads email_logs by subject prefixes. |
| `POST /api/evaluator/applications/[id]/notice` | EVALUATOR/ADMIN | `{ type, date?, time?, venue?, contact?, notes?, examType? }`. Guards: non-regret requires date+time+venue (400); **regret to shortlisted-stage → 409**; **interview/skills_exam to non-shortlisted-stage → 409** (stage mapping §4.2 so Interview/Selected/Approved still count as shortlisted). Fans out email + SMS + in-app notification + audit `NOTICE_SENT`. |
| `POST /api/evaluator/applications/regrets` | EVALUATOR/ADMIN | `{ applicationIds: [1..200] }` bulk regret. Skips: not found; shortlisted-stage (hard skip); **already sent** (prior successful regret email with subject prefix `"Application regret —"`; failed/skipped are retried). Per eligible: regret email + SMS + in-app notification. Audit `REGRET_LETTERS_BULK_SENT`. Returns `{ summary: { total, sent, alreadySent, shortlisted, failed, notFound }, results[] }`. |
| `GET/POST /api/evaluator/applications/[id]/email` | EVALUATOR/ADMIN | Direct email: JSON `{ subject? ≤200, message 1–5000 }` or multipart `attachments` (≤3 files, ≤5 MB each, ≤10 MB total, ext allowlist pdf/doc/docx/xls/xlsx/csv/txt/png/jpg/jpeg/webp; filenames sanitized). **Recipient always resolved server-side** from the applicant record (no arbitrary destinations). Rate limit 20/user/10 min → 429. Audit `DIRECT_EMAIL_SENT`. Provider failure → 502. |
| `GET/POST /api/evaluator/assessments/[applicationId]` | EVALUATOR/ADMIN | Interview scorecard §7.13 (11 ratings 1–10 + comments + overall enum). Upsert per interviewer+applicant. **Decision coupling:** a present overall rating auto-transitions the application — `Unsatisfactory` → Rejected, anything else → Shortlisted — audit `ASSESSMENT_SUBMITTED`. |

### 6.6 Admin
| Method/Path | Role | Behavior |
|---|---|---|
| `GET /api/admin/users` | ADMIN | Paginated; `?q` (email/username/name substring), `?role` (junction-filtered), paging. Safe select (never password/otp/tokens). Each row + derived `role`, `isActive:!blocked`, `applicant { id, isProfileComplete }`. |
| `POST /api/admin/users` | ADMIN | `{ email, username (3–60), password (6–128), role enum, firstName?, lastName?, isActive }`; 409 dupes; bcrypt 10; role link (APPLICANT→3 else 1); APPLICANT creation also creates the applicant row + link. Audit `USER_CREATED`. |
| `GET/PATCH/DELETE /api/admin/users/[id]` | ADMIN | GET: safe user + role + linked applicant (full). PATCH: names/email/isActive(→blocked)/password(rehash)/role (role change rewrites links + is_admin; audit `USER_ROLE_CHANGED`, else `USER_UPDATED`). DELETE default = **soft-disable** (`blocked=true`, audit `USER_DISABLED`); `?hard=1` = real delete with guards: cannot delete self; cannot delete another ADMIN (demote first); junction cleanup explicit; audit `USER_DELETED`. |
| `GET /api/admin/applicants` | EVALUATOR/ADMIN | Paginated master registry of **all applicants** (even without accounts/applications). `?search` (name/email/employeeNumber/contact), `?status=complete|incomplete` (explicit NULL handling), `?hasAccount=yes|no` (post-query filter; totals reflect it). Rows: profile basics, `isProfileComplete`, `hasAccount`, embedded user, `applicationCount`. |
| `GET /api/admin/applicants/[id]` | EVALUATOR/ADMIN | **Full live profile** (contrast: evaluator detail = frozen snapshots): identity/contact/demographics/address, completeness, all 5 sections (eligibility titles backfilled), characterReferences, filesystem documents, application history `{ id, status, dateApplied, jobId, positionTitle }`. |
| `GET/POST /api/admin/positions` · `PATCH /api/admin/positions/[id]` | EVALUATOR/ADMIN | Position master CRUD (19 fields incl. CSC columns; wire `salaryStep` → column `position_salary_step`; placeOfAssignment via junction). GET includes posting counts. |
| `GET/POST /api/admin/eligibilities` | ADMIN | List eligibility names (sorted) / create `{ name 1–200 }` (published immediately). |
| `GET /api/admin/stats` | ADMIN | Dashboard counts: totalUsers, admins, applicants, evaluators, activeJobs (published), totalApplications, pendingReview (pre-decision family incl. legacy spellings), shortlisted, rejected, byStatus distribution, recent 8 applications (applicant + position title), and **Needs-Attention**: `failedLogins24h` (audit DB), `deadlinesThisWeek` (published jobs, deadline within 7 days), `blockedUsers`, `incompleteProfiles`. |
| `GET /api/admin/audit-logs` | ADMIN | Audit DB query: `?search/?action/?userId/?entityType/?startDate/?endDate/?page/?pageSize` → rows + `actions` (distinct) + `summary { totalEvents, onPage, topActions(6), byRole }`. |
| `GET/POST /api/admin/email` | ADMIN | Provider info (mock\|resend + configured flag + setup info), stats { total, sent, failed, skipped, last24h }, last 25 email_logs. POST: test send `{ to, subject? ≤200, message? ≤2000 }`; failure → 502. |
| `GET/POST /api/admin/sms` | ADMIN | Mirror for SMS (mock\|android\|semaphore). POST `{ to (PH format ≥7), message? ≤640 }` with PH mobile normalization (§9.4); invalid number → 400; failure → 502. |

### 6.7 Misc
| Method/Path | Role | Behavior |
|---|---|---|
| `GET /api/health` | public | `SELECT 1` probe → `{ status:"healthy", checks:{ app:"ok", database:"ok" } }` or 503. |
| `GET /api` | public | Stub. |

---

## 7. End-to-End Flows

### 7.1 Public visitor (anonymous)

1. Lands on the **public landing** view (`#/`): agency identity, tagline, CTAs ("Browse open positions", "How to apply"), a **live snapshot panel** computed from the same jobs payload (total open positions, distinct hiring divisions, soonest future deadline, salary-grade min–max range), a grid of the first **12** open positions with **filter chips per division (with counts)**, and a static 3-step "How to apply" explainer: *Browse positions → Prepare requirements (PDS CS Form 212 + eligibility records) → Submit before deadline*, with "Create an account" / "Sign in" CTAs.
2. **Jobs board** (`#/jobs`, public): search rail (position text search; division multi-select with facet counts; clear filters), toolbar (result count; sort by Newest / Deadline / Salary), paginated listing (8 per page). Each posting card: title, "Applied" badge (if viewer already applied), meta line (place · employment type · monthly salary · deadline state), expandable quick view with **6 QuickFacts** (Item No., Vacancies, Salary Grade/step, Monthly Salary, Published, Deadline) + actions "Apply now" (disabled when overdue) and "Read full description".
3. **Job detail** (in-flow, deep link `#/jobs?job=<id>`): back action (restores prior scroll position), hero facts, sections: Brief Description, **Minimum Qualification Requirements ledger** (Education / Work Experience / Training / Eligibility (hidden when "N/A") / License-Certification), Duties & Responsibilities, Compensation Package, Other Qualifications, vitals grid + dates, and an **Apply / applied-state / Cancel** action rail. Deadline states: `Open`, `Closing soon` (≤7 days), `Closing today`, `Closed`/`N days left`.
4. Clicking **Apply** while anonymous → info prompt "Please sign in to apply" → sign-in view.

### 7.2 Registration → first-run profile

Sign-up collects: First name*, Last name*, Email*, Password* (≥6, with show/hide), Confirm password*, **mandatory RA 10173 data-privacy consent checkbox**. On success: **auto-login → session refresh → navigate to Profile builder**. The applicant's goal at this point: complete the profile (banner on applicant home until `isProfileComplete`).

### 7.3 Applicant home (`#/home`)

- Data: own applications + open jobs, **15 s silent poll + refetch on focus** (so evaluator decisions surface live).
- Shows: welcome header; **"Complete Your Profile" banner** while incomplete (→ profile builder); a persistent list of **"Your Applications"** newest-first; and a pane of **open positions** (deadline not passed) with Apply actions that deep-link into the board (single apply logic, no duplication). Empty applications state → "No applications yet" + Browse Positions CTA.
- **Application journey card** (per application): index, position title + place, "Applied {date}", status in applicant vocabulary (**Submitted / In Review / Shortlisted / Not Selected**), a **3-checkpoint tracking timeline** — `Submitted ✓ → Review → Decision` — where Review is "done" only after a decision exists (or "current" while Under Review) and Decision renders neutrally as pending ("Awaiting the shortlist decision") until it becomes "Shortlisted" (success) or "Not Shortlisted" (failed ✕); plus a **Next Step** hint paragraph:
  - rejected → "…was not shortlisted… you may apply for other positions."
  - shortlisted → "A notice has been sent to your registered email… HR will contact you for the next steps."
  - in review → "…is currently being evaluated by our HR team."
  - else → "…has been received and is awaiting evaluation."
- Clicking a journey card opens the **Application detail** view (full posting details + "Successfully Applied · Applied {date}" strip + **Cancel Application** when still `Applied`).

### 7.4 Profile builder — the 7-part applicant profile (`#/profile`)

Functional structure (all presentation free):

- **Header:** avatar (from latest PROFILE_PICTURE document; replaceable), name, completeness status (Complete/Incomplete), a **completion ring = filled sections / 7**, "Mark Complete" action when eligible, document count, and an "AI-assisted" indicator while extraction is active.
- **Section navigation:** numbered 01–07 with per-section completeness indicators and a "Section X of 7" readout; works on mobile (stepper) and desktop (sticky list).
- **Data loading:** parallel fetch of profile + reference data (eligibilities, courses, places of assignment) + own documents.

**Section 01 — Personal Information** (4 disclosure groups, each with "X of N completed" summaries):
- *Identity:* First name*, Middle name, Last name*, Extension name, Email address* (helper: "interview invites are sent here"), Mobile number (helper format `09XXXXXXXXX`, 11 digits), Secondary contact, Birth date, Birth place, Gender (Male/Female), Civil status (Single/Married/Widowed/Separated/Divorced), Citizenship, Religion, PWD toggle (Yes/No), Ethnicity.
- *Address:* present address block (house no., street, subdivision, barangay, city, province, country, ZIP).
- *Legal disclosures:* administrative offense Yes/No → conditional details; criminal charge Yes/No → conditional date filed + case status.
- *Character references:* 1–5 entries (add capped at 5; remove floors at 1), each: name, title, company, company address, email, contact. Empty-name entries filtered at save.
- **Autosave:** every change re-arms a **1.2 s debounce** → `PUT /api/applicant/profile`, with a live save-state indicator (Saving… / Changes saved / Save failed — retry). An explicit Save action exists (and a mobile fixed save affordance while dirty). Save triggers a session refresh.

**Sections 02–06 — Education / Work Experience / Training / Eligibility / Awards** (identical functional pattern: list of entry cards + add/edit form + delete):
- *Education:* Education level select (incl. Vocational/Trade), Course/Degree, School name*, Year graduated, Units earned, Awards/honors.
- *Work experience:* Position title*, Employer name*, Employment status select, Employer address, Date from/to, "Currently employed here?" (clears Date to), Monthly salary (number), Government service Yes/No, Actual duties.
- *Training:* Title*, Type select, Number of hours, Date from/to.
- *Eligibility:* **spec-driven selection** from the CSC eligibility registry (merged with reference data). Choosing a type reveals only its relevant fields — exam-based → Rating / Exam date / Exam place; Bar/Board → + License no. / Validity; conferment-based → Date/Place of Conferment; "Others" → one free-text title. The saved title must match the job's required eligibility vocabulary for MQR matching.
- *Awards:* Recognition type (Award/Accomplishment), Scope (Individual/Group vs Local/Foreign/International), Details*, Category, Awarding body, Date granted.
- Mutations: create via POST; **edit = delete + recreate** (no update endpoints); deletes confirm; toasts on every outcome; optimistic local updates with "pending-" placeholder ids for unsaved extraction data.
- **Mark Complete:** confirm dialog stating the profile will be "ready for application… subject to verification by HR" → `PUT profile { isProfileComplete: true }` (server re-validates §8.3) → session refresh.
- **Header card gate:** `canMarkComplete` = personal core (first+last+email) + ≥1 education + ≥1 work.

**Section 07 — Supporting Documents:** **storage-only by design** (no extraction): a category must be selected before any upload (12 categories); multi-file batch upload; file rows (name, size, category, timestamp) with batch delete; profile picture uploads replace the previous one.

### 7.5 PDS upload & AI auto-extraction (`upload-pds-card`, top of profile)

Pipeline (with phase progress: Uploading 30% → Extracting 70% → Applying 90%):

1. **Upload** the PDS file (drag or picker; accepted: `.pdf .png .jpg .jpeg .gif .webp .doc .docx .xlsx .xls .xlsm`, ≤10 MB) → `POST /api/applicant/documents` (category PDS).
2. **Extract** → `POST /api/applicant/documents/extract` (§6.4) → merged extraction. Any non-EXTRACTED per-doc result → error with the server message.
3. **Auto-apply** → `POST /api/applicant/profile/auto-apply` (§8.4) → `{ applied, replaced }` summaries.
4. **Done state:** total fields updated (+ "N replaced" warnings), 6 summary chips (Personal / Education / Work / Training / Eligibility / Awards), action "Review Sections" (jumps to section 01), and **"Clear Forms & Re-upload"**.
5. **One-extraction lock:** once any extractable document reaches EXTRACTED/PARTIALLY_EXTRACTED, the dropzone is replaced by a locked indicator. The **only** way back is "Clear Forms & Re-upload" → an explicit confirm ("erases ALL of your profile information… profile marked incomplete again; uploaded files stay") → `POST /api/applicant/profile/clear` → silent reload → session refresh (re-opens the apply gate correctly) → dropzone returns.
6. Error state: message + file name + "Try Again". Raw extraction text is never exposed to the client.
7. **AI-free photo extraction:** for PDS documents, an embedded ID photo is extracted (PDF image extraction / XLSX media scan; ≥60 px, sane aspect; largest wins; normalized to PNG ≤800 px) and stored as a PROFILE_PICTURE document, replacing the avatar.

### 7.6 Apply flow — two paths, one gate set

**Entry gating (shared):** not signed in → "Please sign in to apply" (→ sign-in); signed-in non-applicant → error; **applicant with incomplete profile → the Fast-Track dialog** (below); complete profile → an **Apply confirmation step** (position title, item no., place).

**Path A — Normal apply (complete profile):**
1. `POST /api/jobs/verify-mqr` → if `!allMet`, show the **MQR failure presentation** listing each dimension (Education / Work Experience / Training / Eligibility) with Met ✓ / Not met ✕ and the server's diagnostic detail; CTA → "Update Profile" (→ profile builder). No application is created.
2. If all met → `POST /api/jobs/apply` → success (toast, Applied badge, list reload). Server 400 containing "complete your profile" (stale session) also routes into the fast-track.

**Path B — Fast-track apply (incomplete profile; `fast-track-apply-dialog` semantics, 5 steps):**
1. **Upload PDS** → upload + extract + auto-apply (same as §7.5; document types limited to .pdf/.doc/.docx/.xlsx/.xls/.xlsm).
2. **Review step (hard stop):** summary chips + the **Completion Requirements checklist** (personal name+email / ≥1 education / ≥1 work). If unmet → blocked panel with "Go to Profile" or "Upload Another Document" (data already saved).
3. If complete → **mandatory truthfulness certification checkbox** ("certifies the data is true and correct" — civil-service attestation) enables **"Certify & Submit"**:
4. `POST /api/jobs/verify-mqr` (same MQR gate; failure → per-dimension list, data kept, "Go to Profile") → `POST /api/applicant/profile/complete` (server re-validates the rule) → `POST /api/jobs/apply`.
5. **Done:** submitted confirmation, summary chips, "View My Applications" (→ home) / "Review Profile" (→ profile). Parent context refreshes session so `isProfileComplete` is current.
6. Generic failure state: "Fast-Track Paused" — no data lost; Try Again / Fill Profile Manually.

### 7.7 Application tracking & cancellation

- Tracking surfaces: applicant home journey cards + detail (timeline + next-step hint, §7.3). The in-system journey **ends at the decision**; shortlisted applicants are told to await HR contact.
- **Cancel Application** (only while `Applied`): confirm → `DELETE /api/applications/[id]` → toast → list reload. If already progressed: server 400 with guidance ("contact HR") — surfaced as-is.

### 7.8 Evaluator review queue (`#/review-queue`)

- Data: `GET /api/evaluator/queue` (all) + `GET /api/admin/applicants?pageSize=100` (roster of registered people with zero applications); **15 s silent poll + focus refresh**.
- **Two view modes (functional):**
  - **Kanban:** 5 columns — "Applicants" (roster; card → candidate detail) + pipeline **Applied → Under Review → Shortlisted → Rejected** (grouped via stage mapping; columns partition the universe — nobody appears twice). Card body = review trigger + sibling profile action; footer = date + status tag.
  - **List:** ledger rows: index, monogram, name, position · place · applied date · status pill, actions **Review / View Decision** (opens the review workspace) + **Profile** (→ candidate detail).
- Toolbar: item count; **"Qualified only"** switch (filters to `match.verdict === "ALL_MET"` — MOM step 3 lens); stage filter tabs with counts (list mode); **"Send regret letters (N)"** (list mode + Rejected tab only) → confirm → bulk regret API → summary toast (sent / alreadySent / failed; shortlisted hard-skipped); Manual Refresh.
- Empty states per tab; error retry; skeleton loading.

### 7.9 Evaluator review workspace (modal/deep-link `#/evaluator-review?id=<applicationId>`)

Two functional halves:

**A. Applicant dossier (left):** tabs **Profile / Education / Experience / Documents** rendering the **frozen snapshots** (captured at apply time) — never live data (privacy + auditability).

**B. Decision rail (right):**
1. **Requirements match panel** (server-computed §8.2): verdict chip with meaning — `ALL_MET` "Meets the minimum requirements" / `PARTIAL` / `NONE_MET` / `NEEDS_REVIEW` / `NO_REQUIREMENTS` — plus `metCount/requiredCount`, and per-standard rows (REQUIRED → APPLICANT → EVIDENCE, expandable) with per-check status **Met / Not met (quantified shortfall) / Verify manually / Not required**.
2. **Credentials-on-file checklist** counts (Personal / Education / Work / Training / Eligibility / Awards / Supporting).
3. **State banner:** Shortlisted (applicant notified) / Not Qualified / Under Review / Awaiting Review.
4. **Decision card** (undecided): optional **Remarks** textarea; actions **Start Review** (→ Under Review), **Shortlist**, **Not Qualified** — each opens a confirm that spells out the notification consequence (recipient email, or "No email on record — HR will contact directly"). Remarks are echoed.
5. **Revise decision** (decided): flip Shortlisted ↔ Not Qualified, or **Return to Review**; caption: "Changing the decision notifies the applicant."
6. **Notices card** (post-decision): previously-sent notices (type + status + date). Shortlisted → **Send Interview Invitation** / **Send Skills-Exam Notice** (form: Exam type [skills only], Date*, Time*, Venue*, HR contact, Notes; submit disabled until required fields are present). Rejected → **Send Regret Letter** (confirm; re-send blocked after success). Sends fan out email+SMS+in-app (§6.5).
7. **Direct email card** (any stage): free-form Subject + Message + attachments (≤3 files, ≤5 MB each, ≤10 MB total, extension allowlist) → direct-email API; history rows listed. Recipient always server-resolved.

### 7.10 HR job posting management

**Recruitment list (`#/recruitment`):** header + Refresh + **Create Job**; filter bar (search across title/item no./place; status All/Open/Closed where active = published AND deadline not passed; sort Recently posted / Deadline / Applications); fixed-height table (columns: Position [title + type · item no. · place], Vacancies, Monthly Salary, Applications count, Deadline [danger when overdue], OPEN/CLOSED status); row → job workspace; pagination 10/page. Data: 30 s silent poll + focus refresh.

**Job form (create & edit):** fields —
- `Title`* (1–200); `Position Type` (combobox: static registry + ever-used values + inline create); `Number of Vacancies`* (>0);
- **Qualification vitals (write-through to the position master):** Division (official 8 codes + ever-used + inline create), Education (CSC MC 07 first-level + higher-level option registries + custom), Experience, Training, Eligibility (CSC registry with grant-rule hints + custom), License/Special skill;
- Rich-text section pairs (plain text + generated HTML companion): Brief Description / Duties & Responsibilities / Compensation Package / Other Qualifications;
- Dates: Publish (defaults today), Deadline, Processing.
- Validation: title non-empty, vacancies ≥ 1. **No position-master selector** — the posting form owns the requirements; the API auto-creates/links the position row.

**Job workspace (`#/job?id=<id>&tab=`):** header (back, title, OPEN/CLOSED, vitals, actions Back / Delete / Edit); tabs — **Overview** (safe-rendered HTML sections + sticky summary [vacancies, salary, SG(-step), applications, dates with overdue flagging] + mini pipeline counts), **Pipeline** (kanban for this job), **Candidates** (rows → candidate detail), **Activity** — all from the evaluator queue filtered to the job. **Delete:** count-aware confirm ("…and its N linked applications — including their PDS snapshots…") → `DELETE ?scope=all` (server 409 + count when applications exist without the scope).

### 7.11 Candidate registry & detail

**Registry (`#/candidates`):** server-paginated list (25/page) with KPI tiles (Total on file / Showing range / Complete profiles / Has logins); filter bar (debounced search; profile status All/Complete/Incomplete — deep-link prefilter `?status=incomplete|complete`; has-account All/Yes/No); **two modes:** List (row → quick-view modal: identity, contact links, mini pipeline dots [Submitted→Review→Shortlisted; rejected pinned at Submitted with a negative chip], first 2 education entries, document list with doc-status chips, "View full profile") and Kanban (applications grouped by stage; card → candidate detail). 20 s silent poll + focus refresh + manual Refresh.

**Candidate detail (`#/candidate?id=<applicantId>`):** full **live** profile from the admin applicants API — header (back, name, vitals: latest position · applied date · completeness chip · latest status), KPI tiles (education / work / documents / applications counts), tabs **Overview** (personal ledger: email, phones, gender, civil status, birth date/place, address) / Education / Experience / Training / Eligibility / Awards (read-only cards) / Documents / **Applications** (rows with status pill; row click → review workspace deep link for that application). Focus refresh (no poll).

### 7.12 Admin command center (`#/operations`)

Data: admin stats + jobs + own queue fetch (30 s silent poll). Content:
- **Needs attention** (4 actionable stat tiles + total headline): Awaiting review (→ review queue); Deadlines this week (→ recruitment); Incomplete profiles (→ candidates prefiltered `?status=incomplete`); Failed logins 24 h (→ settings audit tab).
- **Active recruitment:** up to 6 active jobs (title, meta, deadline, applications) → job workspace; "View all" → recruitment.
- **Recent activity:** recent applications (applicant · job · date · status) → candidate detail.
- **Overview aside:** Applicants / Active jobs / Applications / Shortlisted counts; link → Analytics.

### 7.13 Analytics (`#/analytics`)

Sources: stats + queue + audit logs. Sections:
1. **Pipeline conversion funnel** (stage counts + conversion %; clicking a stage sets the drill filter).
2. **Application volume over time** (line chart of applications/day, last 30 days, from queue data).
3. **Status distribution** (bar chart of the byStatus breakdown).
4. **Drill-down candidate list** (stage select + funnel clicks; rows → candidate detail; recruitment-cycle select is a placeholder with a single "All time" option).
5. **Recent activity feed** (audit ledger: actor, action, timestamp; event count).

### 7.14 Settings (`#/settings?tab=…`) — ADMIN only

Sub-areas (deep-linkable): **Users & Roles**, **Audit Log**, **SMS Gateway**, **Email Notices**. (Legacy `positions` deep-links fall through to Users — position masters are managed through the job form.)

- **Users & Roles:** toolbar count + Create User; search (debounced; name/email/username); role filter ALL/APPLICANT/EVALUATOR/ADMIN; 15/page. Row: name, email, username, role badge, **active toggle** (disable = soft delete with confirm; enable = PATCH isActive:true), Edit dialog (role select, first/last name, optional password reset — min 6), **hard delete** (explicit confirm; self and ADMIN rows protected). Create dialog: valid email, username ≥ 3 (live error), password ≥ 6 (live error), role (default APPLICANT), optional names.
- **Audit Log:** search + action filter (options from server) + pagination; summary tiles (Total events; per-role counts); per-row actor, action chip, detail, timestamp.
- **SMS Gateway:** active provider card (mock / Android-gateway / Semaphore with configured + cost info), stats tiles (total/sent/failed/skipped/last 24 h), **test send** (PH mobile + message; per-status toasts), last 25 sms_logs.
- **Email Notices:** same shape for mock/Resend; test send; last 25 email_logs (including automatic notices with attachment counts).

### 7.15 Interview assessment scorecard (legacy-capable)

`POST /api/evaluator/assessments/[applicationId]`: 11 integer ratings (1–10) each with a comment — education, work experience, training, eligibility, technical skills, organizational awareness, interpersonal skills, adaptability, extra-curricular, personal development, technology application — plus overall rating (Outstanding / Very Satisfactory / Satisfactory / Fair / Unsatisfactory), comment-and-recommendation, application type, year. Upsert per interviewer+applicant. **Coupling:** submitting an overall rating auto-decides the application (Unsatisfactory → Rejected; anything else → Shortlisted). GET returns the existing assessment or null.

---

## 8. Business Rules Engines

### 8.1 MQR apply gate (`mqr.ts`) — binary, MOM-vocabulary

`verifyMqr(applicant, position)` → verdict strings per dimension. Success string is mandated verbatim: `"Meets the minimum requirements"`; failure: `"Does not meet the minimum requirements"` (+ diagnostic). `allMet` = all four equal the success string. **Enforced server-side at apply; fast-track cannot bypass; results are never persisted.**

| Dimension | Rule |
|---|---|
| **Education** | Tokenize requirement (`csc_education`) and every applicant education entry (`course + specify_others`), lowercase, strip non-alphanumerics, drop generic stop-words (bachelor(s), degree, of, in, arts, major, minor, course, program, career, service, to, the, science). Pass if requirement empty **or** contains "relevant" (then any education passes — HR judges relevance). Otherwise pass if **≥ min(2, #required tokens)** match. **Substitution:** holding any "bachelor" credential lowers the threshold to **≥ 1 matched token**. |
| **Eligibility** | Requirement text = `csc_eligibility_group`. Empty / `N/A` / `NA` / `None` → pass (not required). Generic boilerplate ("Career Service Professional", "Second Level Eligibility" — all stop-words) → pass iff applicant holds **≥1 eligibility of any kind**. Otherwise **every** required token must appear in some eligibility title (subset match). |
| **Work experience** | Required years = first number in `csc_work_experience` (parenthesized form wins: `"(4)"` beats bare digits). Applicant years = **Σ `year_decimal`** across all work entries (no relevance filter). Pass: `total ≥ required`. |
| **Training** | Required hours extracted identically from `csc_training_requirements`. Applicant hours = Σ (`hour_decimal` ?? `number_hours`). Pass: `total ≥ required`. |

### 8.2 Reviewer-side requirements report (`requirements.ts`) — honest-uncertainty engine

Recomputed **live** from the application **snapshots** vs the **live** position `csc_*` columns (never persisted — profiles can drift). Per-check status vocabulary: **`MET | NOT_MET | NOT_REQUIRED | REVIEW`** (ambiguous standards → REVIEW, "never silently fails the applicant"). Report verdicts: **`ALL_MET | PARTIAL | NONE_MET | NEEDS_REVIEW | NO_REQUIREMENTS`**.

- "Not required" detector: blank, N/A, na, none, "none required", "not required" → excluded from requiredCount.
- Bare-number standards (legacy rows) → REVIEW for education/experience/training.
- Quantity extraction: parenthesized `(4)` → "4 hours" digit+unit → word numbers (one…fifteen, twenty, twentyfour, forty, eighty, hundred) → 0; a standard with no year/hour word at all → REVIEW.
- **Experience:** Σ years per row from `year_decimal`, else derived from inclusive dates (365.25-day years; open-ended rows count to today). NOT_MET quantifies the shortfall ("0.5 more years of relevant experience needed") with up to 3 evidence lines.
- **Education clause parser:** requirement split on ` or ` / `;` into alternatives; each parsed to `{ minLevel, partialCollege, tokens }`. Level detection: post-grad/PhD=6, master's=5, **vocational/trade/technical=3 (checked before bachelor)**, bachelor/BS/BA/AB/college/degree=4, high school/SHS/grade 12=2, elementary=1; "two years in college" ⇒ level 4 + partialCollege (ongoing college counts). Course tokens suppressed entirely when the clause contains "relevant". A row matches if level ≥ minLevel AND completion (not ongoing / graduated year present) AND any course token appears in the row's course/degree text.
- **Eligibility alternatives:** split on `/ , ; or` (commas inside parens protected); classify each: RA 1080 / Professional / Sub-Professional / named / unparseable. Matching: professional ⇐ applicant eligibility level ≥ 5 OR name contains "professional" (not "sub") OR name encodes RA 1080 (board license counts as professional-class); sub ⇐ level ≥ 2 OR sub/first-level/professional naming; ra1080 ⇐ compact name contains `ra1080`; named ⇐ token substring. Specific-eligibility rows with numeric levels also count.

### 8.3 Profile completeness (the government apply gate)

Exactly **3 requirements**, all-or-nothing (no weights):
1. **Personal** — first name AND last name AND email address non-empty;
2. **Education** — ≥ 1 education entry;
3. **Work experience** — ≥ 1 work experience entry.

Enforced at **three** points: `PUT profile` (granting the flag), `POST profile/complete` (fast-track), and **`POST jobs/apply` re-validation** (flag AND live re-check — an emptied-but-flagged profile cannot apply). Error wording contract: `"Please complete your profile before applying. Still required: {missing}."` — the jobs client routes messages matching `/complete your profile/i` into the fast-track. Corrupted section reads degrade to "not met" (never 500).

### 8.4 Extraction auto-apply semantics (`/api/applicant/profile/auto-apply`)

Input: `{ extraction: { personalInfo?, educations?, workExperiences?, trainings?, eligibilities?, awards? } }` where array items use `{ field: { value, confidence } }` shape.
- **Personal info = OVERRIDE:** an 18-field allowlist is overwritten with extracted values (birth date → ISO text; mobile → digit-strip → BigInt); entries with confidence `"none"`/empty are skipped.
- **Each section = REPLACE (delete-all + recreate) only when the extraction contains ≥ 1 entry** — zero entries ⇒ existing data kept (empty ≠ "no data").
- Row anchors required (education: school/course/degree; work: position/employer [+ server-computed yearDecimal]; training: title; eligibility: title/license/rating — title resolved via find-or-create draft reference row; award: details/type/provider).
- After writes, recompute profile completion. Response: `{ applied, replaced, totalFilled, totalReplaced, profileCompletion, message }`.

### 8.5 Deterministic PDS parser (primary path for PDS × Excel)

Recognizes **CSC Form 212** (2017 & **Revised 2026** layouts) by sheet fingerprints. Strategy: **label-anchored scanning** (find the label cell → scan rightward within bounds for the first non-noise value). Noise filters: ~200-country name set, dropdown options, bare Yes/No (2026 checkboxes), form furniture (continuation markers, "CS FORM 212", "page N of N", SIGNATURE/DATE rows, parenthetical instructions, section headers I.–XII., "do not abbreviate", etc.).

- **Sheets:** C1 = personal + family + education; C2 = eligibility + work; C3 = training + voluntary + other/awards; C4 = disclosures/references; continuation sheets classified by header keywords or **table-shape sniffing** (applicant-made continuation layouts recovered; official blank continuation pages excluded); unclassifiable sheets → warning surfaced to the reviewer.
- **Personal:** surname/first/middle/extension, birth date (sanity-normalized 1900–2200), birth place, sex (domain-checked male|female), civil status (domain-checked), citizenship, residential address block (city/province read from the row above the sub-label — known layout quirk), ZIP, mobile, email (must contain `@`).
- **Education table:** level column patterns (ELEMENTARY/SECONDARY/VOCATIONAL/COLLEGE/GRADUATE), school, degree/course, period, year graduated, honors; "GRADUATED" in the degree column ⇒ units="GRADUATED", degree null; scan bounded by markers (supports overflow rows).
- **Eligibility table:** columns auto-detected from header text (2017 vs 2026 layouts differ: rating/exam date/place/license/validity positions).
- **Work table:** Mode A (official header) + Mode B (**applicant-made continuation layout** recovered by column-shape: counter, from, to, position >8 chars, employer, salary, status, govt).
- **Training table:** Mode A (official: title, dates, hours with " HOURS" suffix stripping, type) + Mode B (continuation shape, gated by date/hours-shaped cells).
- **Awards:** anchored on "NON-ACADEMIC DISTINCTIONS", scan to "MEMBERSHIP"; per-row first valid cell → recognition type "Recognition".
- Invariants: blank official template ⇒ **0 fields extracted** (tested); duplicates deduped by signature (training: title|from; award: details; work: title|employer|from; eligibility: title|examDate; education: level|school).

### 8.6 AI extraction fallback (`extraction.ts` + `ai-client.ts`)

- Trigger: PDS parsing returns null / non-PDS document types / images.
- Text extraction: Excel via exceljs (skip Lookup sheet, country-noise filter, merged-cell echo dedupe, 16K truncation); PDF per-page (unpdf); Word via mammoth (12K truncation for non-PDS).
- LLM: any OpenAI-compatible API. Defaults: base `https://integrate.api.nvidia.com/v1`, text model `nvidia/llama-3.3-nemotron-super-49b-v1`, vision `nvidia/nemotron-nano-12b-v2-vl`. Config via env (`AI_API_KEY`, `AI_BASE_URL`, `AI_TEXT_MODEL`, `AI_VISION_MODEL`). Missing key ⇒ extraction fails with a clear message; everything else keeps working.
- PDS-Excel fallback: 2 sequential LLM calls (sheet-split; 429 retry with 3/6/9 s backoff; section failure ⇒ empty section, never abort). PDS-PDF: page-chunked (≤4 pages / ≤11K chars per chunk, ≤40 pages; chunk 1 core + later chunks shape-classified continuation prompts; results merged + deduped). Images: single vision call per category prompt.
- Prompt contract (all templates): extract only what is clearly present; **never fabricate**; not found ⇒ value null + confidence "none"; confidence high/medium/low definitions; JSON only; "N/A" ⇒ empty array; dates → `YYYY-MM-DD`.
- Extraction status per doc: 0 fields → FAILED; <3 → PARTIALLY_EXTRACTED; else EXTRACTED (persisted on the sidecar). Safe, user-facing error mapping (file-read / not-configured / unreachable / generic).

### 8.7 Job visibility & deadline rules

- Public listing (non-staff viewers) hides a posting once `deadline_date < start-of-today` (date-level compare) — MOM rule: "removed from public listing the day after closing." Staff (ADMIN/EVALUATOR) always see all.
- Apply API independently **blocks** past-deadline submissions (400).
- Deadline urgency vocabulary used in flows: Open / Closing today / Closing in N days (≤7) / N days left (≤30) / Closed / "Open until filled" when no deadline.

### 8.8 Snapshot freezing (apply time)

On successful apply, the profile is frozen into the 7 snapshot JSON columns (§5.6) via raw SQL. Reviewer surfaces read **only** snapshots; key normalization (snake_case legacy → camelCase) is applied on read. Snapshots are deleted with the application (job cascade delete).

---

## 9. Notification Subsystem

### 9.1 Providers & guarantee

- **Email:** `mock` (default — logs only) | `resend` (HTTP API; env `RESEND_API_KEY`, `EMAIL_FROM`, default sender "DOST-MIRDC Recruitment <onboarding@resend.dev>").
- **SMS:** `mock` | `android` (self-hosted SMS Gateway REST or textbee mode) | `semaphore` (PH API, paid).
- **Hard contract:** `sendEmail`/`sendSms` **never throw** — notifications are fire-and-forget side effects; **every attempt is persisted** to `email_logs`/`sms_logs` with status `sent|failed|mock|skipped` (skipped = e.g. no valid address/phone), provider ref, error, relatedType/relatedId, attachment **metadata only** (name + bytes).

### 9.2 In-app notifications

Status changes, notices, and bulk regrets also create a Notification row linked to the applicant (`name`, `description`, date). The admin notifications panel derives its items from stats: **attention** ("N applications awaiting review", "N job deadlines this week"), **updates** ("N incomplete applicant profiles"), **system** ("N failed logins (24 h)") — informational, 30 s visible-tab poll, empty state "You're up to date".

### 9.3 Trigger matrix (the notification doctrine)

| Event | Email | SMS | In-app |
|---|---|---|---|
| Application submitted | — | "application received" notice | — |
| Status → **Under Review** (explicit pick-up) | Dedicated under-review notice ("outcome will be communicated") | generic status SMS | ✔ |
| Status → **Shortlisted** | **Flagship shortlist notice** (face-to-face hand-off; **bring ORIGINAL credentials** — diploma/TOR, training certs, eligibility/license, COEs) | generic status SMS | ✔ |
| Status → **Rejected/Declined** | **Formal regret letter** (warm; encourages future applications) | **none (deliberate)** | ✔ |
| Any other settable status | generic status-change notice (+ optional HR reason) | generic status SMS (≤640 chars) | ✔ |
| Literal `"Applied"` write (silent revert) | none | none | none |
| Interview invitation (notice) | invitation template (date/time/venue table; TBA fallback; contact/notes) | companion SMS | ✔ |
| Skills-exam notice (notice) | exam notice (+ exam type; "bring ID + pen; arrive 15 min early") | companion SMS | ✔ |
| Regret letter (single or bulk) | regret template | "not shortlisted" SMS | ✔ |
| Direct email | free-form HR message (attachments allowed) | — | — |
| Test send (settings) | test | test | — |

**Doctrine guards:** regret **never** to a shortlisted-stage application (409); interview/skills-exam **only** to shortlisted-stage applications (409); bulk regrets dedupe on prior success (subject-prefix key) and hard-skip shortlisted.

### 9.4 Philippine mobile normalization

`0917…` / `+63917…` / `63917…` / `917…` → `{ local: "09171234567", e164: "+639171234567" }`; invalid → logged `skipped`. Applied to all SMS sends + the settings test send.

---

## 10. Document & File Handling

- **12 categories:** PDS, RESUME, EDUCATION, WORK_EXPERIENCE, TRAINING, ELIGIBILITY, AWARD, ACCOMPLISHMENT, COE, PERFORMANCE_EVALUATION, SUPPORTING, PROFILE_PICTURE.
- **Extractable categories (8):** PDS, RESUME, EDUCATION, WORK_EXPERIENCE, TRAINING, ELIGIBILITY, AWARD, ACCOMPLISHMENT.
- **Per-upload cap 10 MB** (413). **Extensions:** images png/jpg/jpeg/gif/webp/bmp; excel xlsx/xls/xlsm; pdf; word doc/docx. MIME allowlist mirrors; unknown MIME falls back to extension; generic octet-stream accepted when the extension is known (else 415 with the supported list).
- **PROFILE_PICTURE replace semantics** (old photos + sidecars deleted).
- **Serving:** authenticated; applicants restricted to their own directory (403 otherwise); staff any; sidecar JSON never served; traversal guard; inline disposition with the original filename; `no-store`.
- **Direct-email attachments:** ≤3 files, ≤5 MB each, ≤10 MB total, extension allowlist; server-side filename sanitization (path flattening, control-char strip, ≤120 chars).
- Legacy mirror: every upload best-effort writes `files` + `files_related_mph` rows (field slot per category: PDS/RESUME/COE/PERFORMANCE_EVALUATION/SUPPORTING → `merged_pdf`; EDUCATION → `education_attachment`; WORK_EXPERIENCE/TRAINING/ELIGIBILITY → `*_attachment`; AWARD/ACCOMPLISHMENT → `award_attachment`; PROFILE_PICTURE → `profile_picture`). Mirror failure never fails the upload.

---

## 11. Audit Logging

- **Dual write:** structured `[AUDIT]` JSON console line (SIEM) + a row in the dedicated audit DB (§5.10). Fire-and-forget; never blocks or breaks an operation. No PII/passwords/tokens in descriptions.
- **Action catalog:** `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_BLOCKED_EXTERNAL`, `STAFF_ACCESS_BLOCKED_EXTERNAL`, `LOGOUT`, `USER_CREATED`, `USER_UPDATED`, `USER_DISABLED`, `USER_DELETED`, `USER_ROLE_CHANGED`, `APPLICATION_SUBMITTED`, `APPLICATION_STATUS_CHANGED`, `ASSESSMENT_SUBMITTED`, `JOB_POSTING_CREATED`, `JOB_POSTING_UPDATED`, `JOB_POSTING_DELETED`, `POSITION_CREATED`, `POSITION_UPDATED`, `DOCUMENT_UPLOADED`, `DOCUMENT_DELETED`, `PROFILE_UPDATED`, `PROFILE_COMPLETED`, `PROFILE_CLEARED`, `DIRECT_EMAIL_SENT`, `NOTICE_SENT`, `REGRET_LETTERS_BULK_SENT`.
- Payload: `{ timestamp, userId, userLabel "username (email)", userRole, action, entityType, entityId, description, ipAddress }`.
- One-time idempotent migration imports legacy `[AUDIT]` notification rows (lossy: user/role/IP null).

---

## 12. Security & Validation Reference

### 12.1 Rate limits (in-memory; reset on restart — documented stopgap)
| Scope | Rule |
|---|---|
| Login | 5 failures / rolling 15 min per IP+identifier → progressive lockout ladder 1→3→5→10→15→30 min; escalation remembered until a success clears it |
| Registration | 5 per IP per hour → 429 |
| Direct emails | 20 per user per 10 min → 429 (minutes-remaining message) |

### 12.2 File constraints — see §10.

### 12.3 Validation (Zod, shared client+server)
- Dates accept `YYYY-MM-DD` or ISO datetime (production dates are TEXT).
- Register: email, names ≤80, password 6–128. Users: username 3–60, role enum.
- Education: level ≤50, degree ≤120, course/school ≤200, yearGraduated ≤20, awards/hrRemarks ≤500. Work: position ≤200, monthlySalary 0–10,000,000, address ≤500, duties/accomplishment ≤2000. Training: hours 0–10000. Eligibility: title ≤200, rating ≤20, license ≤80. Awards: type/scope ≤30, details ≤500, points 0–1000.
- Job create: title 1–200, vacancy 1–99 default 1, rich-text caps (e.g. dutiesHtml ≤20000). Position: 19 fields (positionLevel 0–20, salaryAmount 0–1,000,000, CSC columns capped 200–1000).
- Status update: SETTABLE enum + reason ≤500. Assessments: 11 ratings int 1–10 + comments ≤2000 + overall enum.
- Zod failures → 400 with `details = zodError.flatten()`.

### 12.4 Sanitization
`sanitizeHtml` (regex allowlist): strips script/style/iframe/object/embed/form/input/textarea/select/button/link/meta/base/svg/math content & tags, `on*` handlers, `javascript:` URLs (→ `href="#"`), all `data-*` and `style` attributes; non-allowlisted tags stripped keeping text; `<a>` forced to `target=_blank rel="noopener noreferrer"`. Applied to all admin-authored job rich text before storage.

### 12.5 Error-handling posture
- `handleApi` wrapper: known `ApiError` → its message + status; unexpected → server console + generic 500. Client: network failure → "Unable to connect…" fallback; 4xx uses the server's route-authored message verbatim; 5xx always generic.

---

## 13. Client Behavior Contracts (functional)

- **Session sync:** boot refresh (failure clears user); silent session fetch on window focus, visibility change, and a 60 s interval (visible tabs only, in-flight guard; failure keeps the user).
- **Polling cadence (silent; never flip skeletons or clobber good data on transient failure):** session 60 s · admin notifications 30 s · admin/evaluator workspaces 15–30 s · applicant home 15 s · jobs board 20 s · candidate detail focus-only. Plus **refetch-on-focus** everywhere.
- **Navigation:** hash router `#/view?params`; alias map on parse AND navigate: `evaluator-queue→review-queue`, `admin-dashboard→operations`, `admin-jobs→recruitment`, `admin-applicants→candidates`, `admin-audit-log|admin-users|admin-positions→settings`, `applicant-details→candidate`, `my-applications→home`. Role homes: APPLICANT `home`, EVALUATOR `review-queue`, ADMIN `operations`. Signed-in users on `signin`/`signup` are redirected to their role home.
- **View registry per role:**
  - Logged out: `signin`, `signup`, `jobs`; anything else → public landing.
  - APPLICANT: `home`, `profile`, `jobs` (+ deep link `#/jobs?job=<id>`).
  - EVALUATOR: `review-queue` (default), `evaluator-review?id=<applicationId>`, plus staff views `candidates`, `candidate?id=`, `recruitment`, `job?id=&tab=`, `jobs`.
  - ADMIN: `operations` (default), `recruitment`, `job?id=&tab=`, `candidates`, `candidate?id=`, `review-queue`, `evaluator-review?id=`, `analytics`, `settings?tab=users|audit|sms|email`.
- **Global command palette (⌘K/Ctrl+K):** Navigation (role's items), Positions (staff: first 50 jobs → job detail), Applicants (staff: first 50 registry entries → candidate), Quick actions (sign out).
- **Wording contracts (verbatim server messages that client logic branches on):**
  - `"Please complete your profile"` prefix → routes into the fast-track.
  - `"You have already applied for this position"` (409).
  - `"You do not meet the Minimum Qualification Requirements for this position. Please update your profile."` (400, with mqrResults).
  - MQR verdict strings `"Meets the minimum requirements"` / `"Does not meet the minimum requirements"` (MOM-mandated).
  - Job delete 409 carrying `{ applicationCount }` drives the count-aware confirm.

---

## 14. Environment & Configuration

Validated fail-fast config (the app refuses to boot without the required three):

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✔ | SQLite file URL (absolute path, `file:` prefix) |
| `NEXTAUTH_SECRET` | ✔ | JWT secret (≥16 chars) |
| `NEXTAUTH_URL` | ✔ | Canonical public URL — **must match the browser address bar exactly** (scheme+IP+port), else login loops |
| `AI_API_KEY` | optional | enables AI extraction (deterministic PDS parser works without it) |
| `AI_BASE_URL` / `AI_TEXT_MODEL` / `AI_VISION_MODEL` | optional | OpenAI-compatible endpoint + models |
| `UPLOAD_DIR` | optional | override document storage root |
| `INTRANET_CIDRS` / `INTRANET_ENFORCEMENT` | optional | staff network tier allowlist / kill switch (`off`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional | real email delivery (else mock) |
| SMS provider vars | optional | Android gateway / textbee / Semaphore credentials (else mock) |

---

## 15. Reference & Seed Data

Operative seed (a rebuild may reproduce equivalents): RBAC role rows (id 1 "Authenticated", id 3 "applicants"); 4 places of assignment; 3 eligibilities ("None Required", "Career Service Sub-Professional", "Career Service Professional"); 16 courses; 4 positions with `csc_*` standards; 4 postings; demo accounts `testadmin` / `testevaluator` / `testapplicant` (+ one more evaluator), password `password123` (login accepts username **or** email); 2 full candidate profiles; 4 applications across pipeline stages. Real staff accounts are created by a CLI tool (`create-admin`) supporting `--email --password --name --role admin|evaluator --reset --deactivate` (bcrypt 10, password ≥12 enforced there, links role 1 for staff, never role 3).

---

## 16. Explicitly Out of System / Known Deferred Items (policy context)

Per HR governance (MOM 2026-09-03, CSC MC 07 s. 2025):
1. **Post-shortlist process is offline** (interviews, skills exams, selection) — the system only sends notices.
2. **Retention:** employment-application data kept max **1 year**, then requires a fresh application; disposal action (delete/anonymize/archive) is deferred to records management — **not implemented**.
3. **Eligibility auto-disqualification** proposals: explicitly **not** implemented pending CSC confirmation; preferred credentials must never alter published minimums (preference ≠ disqualification).
4. **SHS equivalency** technical controls (MC 07 education options) — option lists implemented; deeper equivalency enforcement gated on HR confirmation.
5. **Preference-points ranking** — modeling scaffold only (evaluation-criteria tables exist), not built into flows.
6. A posting's **processing date** and legacy mid-process statuses exist in data but play no active role in the pipeline.

---

## 17. Glossary

- **PDS** — Personal Data Sheet, CSC Form 212 (Revised 2017/2026), the Philippine government job-application spreadsheet.
- **MQR** — Minimum Qualification Requirements; the four CSC standards (education, experience, training, eligibility) attached to a position.
- **CSC** — Civil Service Commission (Philippines); source of eligibility/education requirement rules (e.g., MC 07 s. 2025 education equivalency).
- **SG / Salary Grade** — government pay banding shown on postings.
- **Snapshot** — the frozen copy of an applicant's credentials written into the application at apply time.
- **Fast-track** — the apply-while-incomplete flow: upload PDS → auto-fill → certify completeness → submit.
- **Stage** — the canonical pipeline grouping of any stored status spelling (Applied / Under Review / Shortlisted / Rejected).
- **Intranet tier** — the network-level restriction limiting staff accounts to agency networks.
- **Regret letter** — the formal "not shortlisted" notice (email; deliberately no SMS).
- **Notice** — interview invitation or skills-exam notification sent to shortlisted applicants.

---

*End of specification. Every behavior above is normative; every pixel is yours.*
