// ============================================================================
// RMIS — Evaluator application detail + status decision (spec §6.5, §7.9,
// §9.3). GET returns the full review payload built from the FROZEN snapshots
// (never live profile data) with the requirements report recomputed live.
// PATCH writes a settable status and fans out the notification doctrine:
// audit → in-app notification → SMS (skipped for silent-revert "Applied" and
// the rejected family) → routed email.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { getStatusMeta, isRejectedStatus } from "@/lib/status";
import { buildRequirementsReport, type SnapshotShape } from "@/lib/requirements";
import { safeJsonParse } from "@/lib/snapshot";
import { statusUpdateSchema } from "@/lib/validation";
import { auditLog } from "@/lib/audit";
import {
  sendEmail,
  sendSms,
  smsStatusChanged,
  emailStatusChanged,
  emailUnderReview,
  emailShortlisted,
  emailRegretLetter,
} from "@/lib/notify";

const applicantMiniSelect = {
  id: true,
  firstName: true,
  lastName: true,
  emailAddress: true,
  contactNumber: true,
  gender: true,
  isProfileComplete: true,
} as const;

type ApplicantMiniRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  contactNumber: string | null;
  gender: string | null;
  isProfileComplete: boolean;
};

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Invalid id", 400);
  return id;
}

function applicantName(a: ApplicantMiniRow): string {
  return [a.firstName, a.lastName].filter(Boolean).join(" ") || "Applicant";
}

// ── GET /api/evaluator/applications/[id] — full review payload ──────────────

export const GET = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);

  const app = await db.application.findUnique({
    where: { id },
    include: {
      job: { include: { position: true } },
      applicant: { select: applicantMiniSelect },
    },
  });
  if (!app) throw new ApiError("Application not found", 404);

  const position = app.job.position;
  const snapshot: SnapshotShape = {
    educations: safeJsonParse<SnapshotShape["educations"]>(app.snapshotEducations, []),
    experiences: safeJsonParse<SnapshotShape["experiences"]>(app.snapshotExperiences, []),
    trainings: safeJsonParse<SnapshotShape["trainings"]>(app.snapshotTrainings, []),
    eligibilities: safeJsonParse<SnapshotShape["eligibilities"]>(app.snapshotEligibilities, []),
  };
  const requirements = buildRequirementsReport(snapshot, position ?? {});

  return ok({
    id: app.id,
    status: app.status,
    reason: app.reason,
    dateApplied: app.dateApplied.toISOString(),
    applicantId: app.applicantId,
    jobId: app.jobId,
    job: {
      ...app.job,
      title: position?.positionTitle || app.job.title,
      position,
    },
    applicant: app.applicant,
    snapshots: {
      profile: safeJsonParse<Record<string, unknown> | null>(app.snapshotProfile, null),
      educations: safeJsonParse<unknown[]>(app.snapshotEducations, []),
      experiences: safeJsonParse<unknown[]>(app.snapshotExperiences, []),
      trainings: safeJsonParse<unknown[]>(app.snapshotTrainings, []),
      eligibilities: safeJsonParse<unknown[]>(app.snapshotEligibilities, []),
      awards: safeJsonParse<unknown[]>(app.snapshotAwards, []),
      documents: [] as unknown[],
    },
    requirements,
    interviews: [] as unknown[],
    examinations: [] as unknown[],
    statusChanges: [] as unknown[],
  });
});

// ── PATCH /api/evaluator/applications/[id] — status decision ────────────────

export const PATCH = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);

  const body = await req.json().catch(() => ({}));
  const input = statusUpdateSchema.parse(body);

  const app = await db.application.findUnique({
    where: { id },
    include: {
      job: { include: { position: true } },
      applicant: { select: applicantMiniSelect },
    },
  });
  if (!app) throw new ApiError("Application not found", 404);

  const from = app.status;
  const to = input.status;
  const normalizedLabel = getStatusMeta(to).label;
  const jobTitle = app.job.position?.positionTitle || app.job.title;
  const applicant = app.applicant;

  const updated = await db.application.update({
    where: { id },
    data: { status: to, reason: input.reason ?? null, updatedAt: new Date() },
  });

  // ── Side effects — best-effort, never break the decision (spec §9.1) ────

  // 1. Audit trail.
  try {
    auditLog({
      userId: user.id,
      userLabel: `${user.username} (${user.email})`,
      userRole: user.role,
      action: "APPLICATION_STATUS_CHANGED",
      entityType: "application",
      entityId: id,
      description: `Application ${id} status changed: ${from} → ${to}${input.reason ? ` — ${input.reason}` : ""}`,
      ipAddress: getClientIp(req),
    });
  } catch {
    /* best-effort */
  }

  // 2. In-app notification — skipped for the silent-revert "Applied" write
  //    (spec §4.3 / §9.3: no SMS, no email, no notification on revert).
  if (to !== "Applied") {
    try {
      await db.notification.create({
        data: {
          applicantId: app.applicantId,
          name: "Application update",
          description: `Your application for ${jobTitle}: ${normalizedLabel}`,
        },
      });
    } catch {
      /* best-effort */
    }
  }

  // 3. SMS — skipped for the silent-revert "Applied" write and the rejected
  //    family (regret letters deliberately carry no SMS, spec §9.3).
  if (to !== "Applied" && !isRejectedStatus(to)) {
    try {
      await sendSms({
        to: applicant.contactNumber ?? "",
        message: smsStatusChanged(normalizedLabel, jobTitle, input.reason),
        relatedType: "application",
        relatedId: id,
      });
    } catch {
      /* best-effort */
    }
  }

  // 4. Email routed by status (spec §9.3).
  try {
    if (isRejectedStatus(to)) {
      const t = emailRegretLetter(applicantName(applicant), jobTitle);
      await sendEmail({
        to: applicant.emailAddress ?? "",
        subject: t.subject,
        bodyText: t.bodyText,
        bodyHtml: t.bodyHtml,
        relatedType: "application",
        relatedId: id,
      });
    } else if (to === "Shortlisted") {
      const t = emailShortlisted(applicantName(applicant), jobTitle);
      await sendEmail({
        to: applicant.emailAddress ?? "",
        subject: t.subject,
        bodyText: t.bodyText,
        bodyHtml: t.bodyHtml,
        relatedType: "application",
        relatedId: id,
      });
    } else if (to === "Under Review") {
      const t = emailUnderReview(applicantName(applicant), jobTitle);
      await sendEmail({
        to: applicant.emailAddress ?? "",
        subject: t.subject,
        bodyText: t.bodyText,
        bodyHtml: t.bodyHtml,
        relatedType: "application",
        relatedId: id,
      });
    } else if (to !== "Applied") {
      const t = emailStatusChanged(applicantName(applicant), jobTitle, normalizedLabel, input.reason);
      await sendEmail({
        to: applicant.emailAddress ?? "",
        subject: t.subject,
        bodyText: t.bodyText,
        bodyHtml: t.bodyHtml,
        relatedType: "application",
        relatedId: id,
      });
    }
    // literal "Applied" (silent revert) → no email
  } catch {
    /* best-effort */
  }

  return ok({ ...updated, status: to });
});
