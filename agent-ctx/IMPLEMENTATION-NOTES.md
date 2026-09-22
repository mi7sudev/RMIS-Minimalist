# RMIS Implementation Contracts (for all agents)

SOURCE OF TRUTH: `/home/z/my-project/RMIS-FLOW-SPECIFICATION.md` — read §0-§17. This file documents implementation-specific decisions that differ from or refine the spec.

## Deviations from spec (normalization, allowed by spec §0.5)
- Storage is a NORMALIZED Prisma schema (see prisma/schema.prisma) — junction `*_lnk` tables replaced by FK relations with `ord` ordering columns. Audit log is a Prisma `AuditLog` model in the main DB (not a separate audit.db). Snapshots are JSON strings in Application columns. Document metadata is in a `Document` model + files on disk under `upload/<applicantId>/<uuid>.<ext>`.
- Email/SMS providers are `mock` by default (every attempt still logged to email_logs/sms_logs with status "mock"). Resend/Semaphore env paths exist in notify.ts.
- INTRANET_ENFORCEMENT=off in .env (sandbox) — access-tier code is implemented in src/lib/auth.ts exactly per spec but enforcement defaults off.

## Key lib modules (ALWAYS reuse; do NOT reinvent)
- `@/lib/db` → `db` (PrismaClient). Models: User, Applicant, Education, WorkExperience, Training, Eligibility, Award, Position, JobPosting, Application, Notification, EmailLog, SmsLog, AuditLog, Document, EligibilityRef, Course, PlaceOfAssignment.
- `@/lib/api` → `ok(data, status?)`, `err(msg, status?, details?)`, `ApiError(msg, status, details?)`, `handleApi(fn)` wrapper, `getClientIp(req)`.
- `@/lib/jwt` → `signSession({id,email,name,role})`, `setSessionCookie(req, token)`, `clearSessionCookie(req)`, `SESSION_COOKIE`.
- `@/lib/auth` → `getSessionFromReq(req)` (returns AuthedUser|null, re-checks blocked), `requireApplicantFromReq(req)`, `requireEvaluatorFromReq(req)` (EVALUATOR or ADMIN), `requireAdminFromReq(req)`, `requireApplicantRow(req)` (returns {user, applicant}), `STAFF_INTRANET_MESSAGE`.
- `@/lib/status` → `getStatusMeta(status)`, `stageForStatus(status)`, `isRejectedStatus`, `SETTABLE_STATUSES`, `QUERYABLE_STATUSES`, `currentStageLabel`, `PIPELINE_STAGES`.
- `@/lib/mqr` → `verifyMqr(applicant, position)` (§8.1), `allMet(results)`, `MQR_MEETS`, `MQR_FAILS`, `MqrResults`.
- `@/lib/requirements` → `buildRequirementsReport(snapshot, position)` (§8.2) → { verdict, metCount, requiredCount, checks[] }.
- `@/lib/profile-completeness` → `validateProfileCompletion(applicantId)`, `completionErrorMessage(completion)`. MUST be used at PUT profile (isProfileComplete:true), /profile/complete, and /jobs/apply. Error message starts "Please complete your profile" (client contract!).
- `@/lib/snapshot` → `writeApplicationSnapshots(applicationId, applicantId)`, `safeJsonParse`.
- `@/lib/validation` → ALL zod schemas (loginSchema, registerSchema, educationSchema, workExperienceSchema, trainingSchema, eligibilitySchema, awardSchema, personalProfileSchema, jobCreateSchema, statusUpdateSchema, userCreateSchema, userUpdateSchema, paginationSchema, noticeSchema, directEmailSchema, autoApplySchema, DOCUMENT_CATEGORIES, EXTRACTABLE_CATEGORIES).
- `@/lib/rate-limit` → `checkLoginAllowed(ip, id)`, `recordLoginFailure(ip, id)`, `clearLoginFailures(ip, id)`, `consumeRateLimit(key, limit, windowMs)`.
- `@/lib/audit` → `auditLog({ userId, userLabel, userRole, action, entityType, entityId, description, ipAddress })`.
- `@/lib/notify` → `sendEmail`, `sendSms` (never throw; auto-log), `normalizePhMobile`, templates: `emailApplicationReceived/emailStatusChanged/emailUnderReview/emailShortlisted/emailRegretLetter/emailInterviewInvitation/emailSkillsExam/emailDirect`, `smsApplicationReceived/smsStatusChanged/smsNotice`.
- `@/lib/sanitize` → `sanitizeHtml(html)`, `textToHtml(text)`.
- `@/lib/pds-extract` → `extractFromDocument(filePath, category, mimeType)` → `{result, error?}`, `countExtractedFields`.
- `@/lib/client` (client-side) → `apiFetch(path, {method, body, formData})`, `formatDate/formatDateTime/formatCurrency/fullName/humanize/timeAgo/deadlineState`.
- `@/lib/router` (client-side) → `useHashRoute()`, `navigate(view, params)`, types: SessionUser, JobWire, ApplicationWire, PositionWire, DocumentWire, Paginated, MqrResults, ApplicantMini; ROLE_HOME, VIEW_ALIASES.
- `@/lib/constants` → DIVISIONS, divisionName(), POSITION_TYPES, CSC_EDUCATION_FIRST_LEVEL/HIGHER_LEVEL, CSC_ELIGIBILITY_REGISTRY, ELIGIBILITY_SPECS, EDUCATION_LEVELS, CIVIL_STATUS_OPTIONS, EMPLOYMENT_STATUS_OPTIONS, TRAINING_TYPES.

## Wire shapes
See TypeScript types in `src/lib/router.ts` (JobWire includes: resolved `title`, `isActive`, embedded `position` (full PositionWire incl csc_*), `author`, viewer's own `applications` [{id,status}], `applicationCount`).

## Frontend architecture (single-page app)
- ONE route: `src/app/page.tsx` — hash-routed SPA. NO other app routes. Views switched via `useHashRoute()`/`navigate()`.
- `src/components/session-provider.tsx` exists — use `useSession()`.
- View component contracts (fixed paths/exports, NO props; use useSession/useHashRoute/navigate internally):
  - FE-1: `src/components/views/public-landing.tsx` (default), `signin-view.tsx`, `signup-view.tsx`, `jobs-view.tsx`
  - FE-1: `src/components/shell/*` (app-shell, nav-rail, workspace-header, command-menu, notifications-panel, site-header, footer)
  - FE-2: `src/components/views/applicant-home.tsx`, `profile-view.tsx`, `fast-track-dialog.tsx`, `application-detail-modal.tsx`
  - FE-3: `src/components/views/review-queue.tsx`, `review-workspace.tsx`, `recruitment.tsx`, `job-workspace.tsx`, `candidates.tsx`, `candidate-detail.tsx`, `command-center.tsx`, `analytics.tsx`, `settings.tsx`
- page.tsx maps views → components per role exactly per spec §13 view registry.

## Dialog theme quick reference (styling)
- Page bg #f7f7f7 (`bg-fog`), cards `dlg-card` class or bg-white rounded-[24px] p-6, subtle shadow only.
- Primary CTA: `dlg-cta` (orange pill #f69251, black text, radius 28px). Secondary: `dlg-ghost` (white pill). Buttons via shadcn Button with className overrides or raw <button className="dlg-cta ...">.
- Headings: `text-display-hero` (70px), `text-heading-lg` (50px), `text-heading-md` (32px) — font-display (DM Sans 400). NEVER bold headings.
- Body: Inter; secondary text `text-stone` (#636363), primary text `text-ink` (#181825), muted `text-pebble`.
- Badges/pills: rounded-full (100px), neutral bg-white or bg-fog, text-graphite 12px font-medium.
- Inputs: `dlg-input` (radius 0) via className override on shadcn Input/Textarea/Select.
- Status pills: NEUTRAL grayscale tones only (ink/graphite/stone/pebble) + `text-dusty-rose`/`bg-dusty-rose/10` for danger, `bg-ink text-white` for active/primary. Orange #f69251 ONLY on CTAs — never on text/icons/badges.
- Long lists: `max-h-96 overflow-y-auto scroll-thin`. Sticky footer via min-h-screen flex flex-col + mt-auto.
- Toasts: `sonner` (`toast.success/error/info` from "sonner"). min 44px touch targets. Responsive (mobile-first).
