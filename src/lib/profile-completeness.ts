// ============================================================================
// RMIS — Profile completeness (spec §8.3). The government apply gate: exactly
// 3 requirements, all-or-nothing. Enforced at PUT profile, /profile/complete,
// and re-validated at /jobs/apply. The error wording is a CLIENT CONTRACT:
// it must start with "Please complete your profile" — the jobs client routes
// messages matching /complete your profile/i into the PDS fast-track.
// ============================================================================

import { db } from "@/lib/db";

export type CompletionRequirement = { id: "personal" | "education" | "work"; label: string; met: boolean };
export type ProfileCompletion = { complete: boolean; requirements: CompletionRequirement[]; missingLabels: string[] };

export async function validateProfileCompletion(applicantId: number): Promise<ProfileCompletion> {
  const applicant = await db.applicant.findUnique({
    where: { id: applicantId },
    select: { firstName: true, lastName: true, emailAddress: true },
  });
  if (!applicant) throw new Error("Applicant not found");

  const [educations, workExperiences] = await Promise.all([
    db.education.count({ where: { applicantId } }).catch(() => 0),
    db.workExperience.count({ where: { applicantId } }).catch(() => 0),
  ]);

  const personalMet = Boolean(
    String(applicant.firstName ?? "").trim() &&
      String(applicant.lastName ?? "").trim() &&
      String(applicant.emailAddress ?? "").trim()
  );

  const requirements: CompletionRequirement[] = [
    { id: "personal", label: "Personal information (first name, last name, email)", met: personalMet },
    { id: "education", label: "At least one education entry", met: educations > 0 },
    { id: "work", label: "At least one work experience entry", met: workExperiences > 0 },
  ];

  return {
    complete: requirements.every((r) => r.met),
    requirements,
    missingLabels: requirements.filter((r) => !r.met).map((r) => r.label),
  };
}

export function completionErrorMessage(completion: ProfileCompletion): string {
  return `Please complete your profile before applying. Still required: ${completion.missingLabels.join("; ")}.`;
}
