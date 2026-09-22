// ============================================================================
// RMIS — Extraction auto-apply (spec §8.4). No audit.
//   personalInfo = OVERRIDE: 18-field allowlist; writes only non-null values
//     with confidence !== "none" (birthDate → normalized ISO text; mobile → digits).
//   Each section = REPLACE (delete-all + recreate) ONLY when the extraction
//     array has ≥ 1 entry — zero entries ⇒ existing data kept (empty ≠ "no data").
//   Work rows get server-computed yearDecimal (365.25-day years; open rows count
//     to today). After writes the profile-completion gate is recomputed.
// ============================================================================

import { ok, handleApi } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { autoApplySchema } from "@/lib/validation";
import { validateProfileCompletion, type ProfileCompletion } from "@/lib/profile-completeness";

const PERSONAL_FIELDS = [
  "firstName", "middleName", "lastName", "extensionName",
  "birthDate", "birthPlace", "gender", "civilStatus", "citizenship",
  "mobileNumber", "emailAddress",
  "houseNumber", "street", "subdivision", "barangay", "city", "province", "zipCode",
] as const;

type RawRow = Record<string, unknown>;
type ConfidentEntry = { value: unknown; confidence: string };

/** Read a {value, confidence} entry (tolerates raw primitive values). */
function readCV(raw: unknown): ConfidentEntry | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if ("value" in o) {
      return { value: o.value, confidence: typeof o.confidence === "string" ? o.confidence : "medium" };
    }
    return null;
  }
  return { value: raw, confidence: "medium" };
}

function textOf(entry: ConfidentEntry | null): string | null {
  if (!entry || entry.value == null) return null;
  const s = String(entry.value).trim();
  return s === "" ? null : s;
}

/** Normalize a date-ish string to YYYY-MM-DD ("" when unrecognizable). */
function normDateText(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const num = Number(s);
  if (!Number.isNaN(num) && num > 20000 && num < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + Math.floor(num));
    return d.toISOString().slice(0, 10);
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(s)) return parsed.toISOString().slice(0, 10);
  const m = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

/** MQR year_decimal (§5.3, §8.2): 365.25-day years; open-ended counts to today. */
function computeYearDecimal(dateFrom: Date | null, dateTo: Date | null, isPresent: boolean): number | null {
  if (!dateFrom) return null;
  const end = isPresent || !dateTo ? new Date() : dateTo;
  const years = (end.getTime() - dateFrom.getTime()) / 86_400_000 / 365.25;
  return years > 0 ? years : 0;
}

/** Row extraction helpers ({value, confidence} shaped cells). */
const rowStr = (row: RawRow, key: string): string | null => textOf(readCV(row[key]));
const rowDate = (row: RawRow, key: string): Date | null => {
  const s = rowStr(row, key);
  if (!s) return null;
  const normalized = normDateText(s) || s;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
};
const rowNum = (row: RawRow, key: string): number | null => {
  const entry = readCV(row[key]);
  if (!entry || entry.value == null) return null;
  const n = Number(entry.value);
  return Number.isFinite(n) ? n : null;
};
const rowBool = (row: RawRow, key: string): boolean => {
  const entry = readCV(row[key]);
  if (!entry || entry.value == null) return false;
  const v = String(entry.value).trim().toLowerCase();
  return v === "true" || v === "yes";
};

/** Resolve a title against the eligibility vocabulary (find-or-create draft). */
async function resolveEligibilityTitle(title: string, eligibilityId?: number | null): Promise<string> {
  if (eligibilityId) {
    const ref = await db.eligibilityRef.findUnique({ where: { id: eligibilityId } });
    if (ref) return ref.name;
  }
  const refs = await db.eligibilityRef.findMany();
  const found = refs.find((r) => r.name.toLowerCase() === title.toLowerCase());
  if (found) return found.name;
  const created = await db.eligibilityRef.create({ data: { name: title, index: 99 } });
  return created.name;
}

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const { extraction } = autoApplySchema.parse(await req.json().catch(() => ({})));

  const applied = { personal: 0, education: 0, work: 0, training: 0, eligibility: 0, awards: 0 };
  let replaced = 0;

  // ── Personal info = OVERRIDE (18-field allowlist) ─────────────────────────
  const personal = (extraction.personalInfo ?? {}) as RawRow;
  const updates: Record<string, string> = {};
  for (const field of PERSONAL_FIELDS) {
    const entry = readCV(personal[field]);
    const value = textOf(entry);
    if (!entry || entry.confidence === "none" || !value) continue;
    if (field === "birthDate") {
      const normalized = normDateText(value);
      if (!normalized) continue;
      updates[field] = normalized;
    } else if (field === "mobileNumber") {
      const digits = value.replace(/\D/g, "");
      if (!digits) continue;
      updates[field] = digits;
    } else {
      updates[field] = value;
    }
  }
  if (Object.keys(updates).length > 0) {
    const current = applicant as unknown as RawRow;
    const data: Record<string, string> = {};
    for (const [field, value] of Object.entries(updates)) {
      const existing = String(current[field] ?? "").trim();
      if (existing) replaced++;
      applied.personal++;
      data[field] = value;
    }
    await db.applicant.update({
      where: { id: applicant.id },
      data: data as Parameters<typeof db.applicant.update>[0]["data"],
    });
  }

  // ── Education = REPLACE when ≥ 1 entry (anchor: school/course) ─────────────
  const educations = extraction.educations ?? [];
  if (educations.length > 0) {
    await db.education.deleteMany({ where: { applicantId: applicant.id } });
    for (let i = 0; i < educations.length; i++) {
      const e = educations[i] as RawRow;
      const data = {
        educationLevel: rowStr(e, "educationLevel"),
        course: rowStr(e, "course"),
        specifyOthers: rowStr(e, "specifyOthers"),
        schoolName: rowStr(e, "schoolName"),
        yearFrom: rowStr(e, "yearFrom"),
        yearTo: rowStr(e, "yearTo"),
        yearGraduated: rowStr(e, "yearGraduated"),
        awards: rowStr(e, "awards"),
        ord: i + 1,
      };
      if (!data.schoolName && !data.course && !data.educationLevel) continue;
      await db.education.create({ data: { applicantId: applicant.id, ...data } });
      applied.education++;
    }
  }

  // ── Work experience = REPLACE when ≥ 1 entry (anchor: position/employer) ───
  const works = extraction.workExperiences ?? [];
  if (works.length > 0) {
    await db.workExperience.deleteMany({ where: { applicantId: applicant.id } });
    for (let i = 0; i < works.length; i++) {
      const e = works[i] as RawRow;
      const isPresent = rowBool(e, "isPresentWork");
      const dateFrom = rowDate(e, "dateFrom");
      const dateTo = isPresent ? null : rowDate(e, "dateTo");
      const monthlySalary = rowNum(e, "monthlySalary");
      const data = {
        positionTitle: rowStr(e, "positionTitle"),
        employerName: rowStr(e, "employerName"),
        dateFrom,
        dateTo,
        monthlySalary: monthlySalary != null && monthlySalary > 0 ? monthlySalary : null,
        isPresentWork: isPresent,
        yearDecimal: computeYearDecimal(dateFrom, dateTo, isPresent),
        ord: i + 1,
      };
      if (!data.positionTitle && !data.employerName) continue;
      await db.workExperience.create({ data: { applicantId: applicant.id, ...data } });
      applied.work++;
    }
  }

  // ── Training = REPLACE when ≥ 1 entry (anchor: title) ──────────────────────
  const trainings = extraction.trainings ?? [];
  if (trainings.length > 0) {
    await db.training.deleteMany({ where: { applicantId: applicant.id } });
    for (let i = 0; i < trainings.length; i++) {
      const e = trainings[i] as RawRow;
      const numberHours = rowNum(e, "numberHours");
      const data = {
        title: rowStr(e, "title"),
        numberHours: numberHours != null ? Math.round(numberHours) : null,
        typeOfTraining: rowStr(e, "typeOfTraining"),
        dateFrom: rowDate(e, "dateFrom"),
        dateTo: rowDate(e, "dateTo"),
        hourDecimal: numberHours ?? null,
        ord: i + 1,
      };
      if (!data.title) continue;
      await db.training.create({ data: { applicantId: applicant.id, ...data } });
      applied.training++;
    }
  }

  // ── Eligibility = REPLACE when ≥ 1 entry (anchor: title, parens stripped) ──
  const eligibilities = extraction.eligibilities ?? [];
  if (eligibilities.length > 0) {
    await db.eligibility.deleteMany({ where: { applicantId: applicant.id } });
    for (let i = 0; i < eligibilities.length; i++) {
      const e = eligibilities[i] as RawRow;
      const rawTitle = rowStr(e, "title");
      const title = rawTitle ? rawTitle.replace(/\s*\(.*?\)\s*$/, "").trim() : "";
      if (!title) continue;
      const resolvedTitle = await resolveEligibilityTitle(title);
      const data = {
        title: resolvedTitle,
        rating: rowStr(e, "rating"),
        examDate: rowStr(e, "examDate"),
        examPlace: rowStr(e, "examPlace"),
        ord: i + 1,
      };
      await db.eligibility.create({ data: { applicantId: applicant.id, ...data } });
      applied.eligibility++;
    }
  }

  // ── Awards = REPLACE when ≥ 1 entry (anchor: details/provider) ─────────────
  const awardRows = extraction.awards ?? [];
  if (awardRows.length > 0) {
    await db.award.deleteMany({ where: { applicantId: applicant.id } });
    for (let i = 0; i < awardRows.length; i++) {
      const e = awardRows[i] as RawRow;
      const data = {
        details: rowStr(e, "details"),
        recognitionType: rowStr(e, "recognitionType") ?? "Award",
        provider: rowStr(e, "provider"),
        dateGranted: rowStr(e, "dateGranted"),
        ord: i + 1,
      };
      if (!data.details && !data.provider) continue;
      await db.award.create({ data: { applicantId: applicant.id, ...data } });
      applied.awards++;
    }
  }

  const profileCompletion: ProfileCompletion = await validateProfileCompletion(applicant.id);
  const totalFilled =
    applied.personal + applied.education + applied.work + applied.training + applied.eligibility + applied.awards;

  return ok({
    applied,
    replaced: { personal: replaced },
    totalFilled,
    totalReplaced: replaced,
    profileCompletion,
    message: "Applied extraction to your profile. Review each section before applying.",
  });
});
