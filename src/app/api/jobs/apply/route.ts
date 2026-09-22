// ============================================================================
// RMIS — Apply (spec §6.2, §7.6, §8.3, §8.8). APPLICANT-only. Ordered gates:
//   a) applicant row 404 → b) job+published 404 → c) deadline passed 400 →
//   d) duplicate 409 → e) profile-completion gate 400 (wording contract) →
//   f) server-side MQR gate 400 (fast-track cannot bypass) →
//   create Application("Applied") → freeze snapshots (§8.8) → audit → SMS.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { validateProfileCompletion, completionErrorMessage } from "@/lib/profile-completeness";
import { verifyMqr, allMet, type MqrInput, type MqrResult } from "@/lib/mqr";
import { writeApplicationSnapshots } from "@/lib/snapshot";
import { auditLog } from "@/lib/audit";
import { sendSms, smsApplicationReceived } from "@/lib/notify";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const POST = handleApi(async (req: Request) => {
  // a) applicant row must exist (404 otherwise)
  const { user, applicant } = await requireApplicantRow(req);

  const body = await req.json().catch(() => ({}));
  const jobId = Number((body as { jobId?: unknown }).jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) throw new ApiError("jobId is required", 400);

  // b) job must exist and be published (404 otherwise)
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    include: { position: true },
  });
  if (!job || !job.publishedAt) throw new ApiError("Job posting not found", 404);

  // c) deadline gate (spec §8.7 — apply blocked independently of visibility)
  if (job.deadlineDate != null && job.deadlineDate < startOfToday()) {
    throw new ApiError("The deadline for this position has passed.", 400);
  }

  // d) duplicate-application gate
  const existing = await db.application.findUnique({
    where: { applicantId_jobId: { applicantId: applicant.id, jobId } },
  });
  if (existing) throw new ApiError("You have already applied for this position", 409);

  // e) profile-completion gate: flag AND live re-validation (spec §8.3)
  const completion = await validateProfileCompletion(applicant.id);
  if (!applicant.isProfileComplete || !completion.complete) {
    throw new ApiError(completionErrorMessage(completion), 400, {
      missing: completion.missingLabels,
      requirements: completion.requirements,
    });
  }

  // f) server-side MQR gate (spec §8.1) — only when a position is linked
  let mqrResults: MqrResult | undefined;
  if (job.position) {
    // Load the live profile sections for the MQR engine (the applicant row
    // from requireApplicantRow is bare). MqrInput names the education list
    // `education`.
    const full = await db.applicant.findUnique({
      where: { id: applicant.id },
      include: { educations: true, workExperiences: true, trainings: true, eligibilities: true },
    });
    if (!full) throw new ApiError("Applicant profile not found", 404);
    const mqrInput: MqrInput = {
      education: full.educations,
      eligibilities: full.eligibilities,
      workExperiences: full.workExperiences,
      trainings: full.trainings,
    };
    mqrResults = verifyMqr(mqrInput, job.position);
    if (!allMet(mqrResults)) {
      throw new ApiError(
        "You do not meet the Minimum Qualification Requirements for this position. Please update your profile.",
        400,
        { mqrResults }
      );
    }
  }

  const title = job.position?.positionTitle || job.title;

  // Create the application, freeze the profile snapshots (spec §8.8).
  const app = await db.application.create({
    data: {
      applicantId: applicant.id,
      jobId,
      status: "Applied",
      dateApplied: new Date(),
    },
  });
  await writeApplicationSnapshots(app.id, applicant.id);

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "APPLICATION_SUBMITTED",
    entityType: "application",
    entityId: app.id,
    description: `Application submitted for ${title}`,
    ipAddress: getClientIp(req),
  });

  // "Application received" SMS — fire-and-forget (spec §9.3).
  try {
    await sendSms({
      to: applicant.contactNumber ?? "",
      message: smsApplicationReceived(title),
      relatedType: "application",
      relatedId: app.id,
    });
  } catch {
    // never break the application on notification failure
  }

  const fresh = await db.application.findUnique({
    where: { id: app.id },
    include: { job: { include: { position: true } } },
  });

  return ok(
    {
      ...(fresh ?? app),
      status: "APPLIED",
      mqrResults,
      position: job.position ?? null,
    },
    201
  );
});
