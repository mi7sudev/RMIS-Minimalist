// ============================================================================
// RMIS — Reference constants (spec §5.9, §7.10): divisions, position types,
// CSC education options (MC 07 s. 2025), eligibility registry.
// ============================================================================

export const DIVISIONS: { code: string; name: string }[] = [
  { code: "PMD", name: "Policy and Planning Division" },
  { code: "TSSS", name: "Technology Support and Services Division" },
  { code: "FAD", name: "Finance and Administrative Division" },
  { code: "TDD", name: "Technology Diffusion Division" },
  { code: "MPRD", name: "Materials and Products Research Division" },
  { code: "TSD", name: "Testing Services Division" },
  { code: "AMMRDD", name: "Advanced Manufacturing and Materials Research Division" },
  { code: "PERDD", name: "Power and Energy Research and Development Division" },
];

export function divisionName(code: string | null | undefined): string {
  if (!code) return "—";
  const hit = DIVISIONS.find((d) => d.code === code || d.name === code);
  return hit ? `${hit.code} — ${hit.name}` : code;
}

export const POSITION_TYPES = [
  "Permanent", "Temporary", "Contract of Service", "Job Order",
];

/** CSC MC 07 s. 2025 education requirement options (spec §7.10, §15). */
export const CSC_EDUCATION_FIRST_LEVEL = [
  "High school graduate (prior to 2016)",
  "Grade 10 / Junior High School graduate (starting 2016)",
  "Relevant vocational/trade course",
  "Two years of college education (prior to 2018)",
  "High school graduate with relevant vocational course (prior to 2018)",
  "Grade 12 / Senior High School graduate (starting 2016)",
  "Grade 12 / Senior High School — TVL track",
  "Grade 10 / JHS graduate with TESDA NC II (starting 2018)",
];

export const CSC_EDUCATION_HIGHER_LEVEL = [
  "Two years of college education",
  "Bachelor's degree",
  "Bachelor's degree relevant to the job",
  "Master's degree",
  "Doctorate degree",
];

export const CSC_ELIGIBILITY_REGISTRY: { name: string; description: string }[] = [
  { name: "Career Service Sub-Professional (First Level)", description: "Career Service Sub-Professional examination passers — first level positions." },
  { name: "Career Service Professional (Second Level)", description: "Career Service Professional examination passers — second level positions." },
  { name: "Honor Graduate (PD 907)", description: "Cum laude or higher — civil service eligibility without examination." },
  { name: "Bar/Board (RA 1080)", description: "Bar or board examination passers — professional license counts as eligibility." },
  { name: "Barangay Official (RA 7160)", description: "Elected barangay officials completing a term of office." },
  { name: "Veteran Preference (EO 790)", description: "Veterans preference grantee." },
  { name: "Solo Parent (CSC MC 08, s. 2021)", description: "Solo parent eligibility under CSC MC 08, s. 2021." },
  { name: "S&T Specialist (RA 10672)", description: "Science and technology specialist eligibility." },
];

export const ELIGIBILITY_SPECS: Record<string, { kind: "exam" | "license" | "conferment" }> = (() => {
  const map: Record<string, { kind: "exam" | "license" | "conferment" }> = {
    "Career Service Sub-Professional (First Level)": { kind: "exam" },
    "Career Service Professional (Second Level)": { kind: "exam" },
    "Bar/Board (RA 1080)": { kind: "license" },
    "Honor Graduate (PD 907)": { kind: "conferment" },
    "Barangay Official (RA 7160)": { kind: "conferment" },
    "Veteran Preference (EO 790)": { kind: "conferment" },
    "Solo Parent (CSC MC 08, s. 2021)": { kind: "conferment" },
    "S&T Specialist (RA 10672)": { kind: "conferment" },
  };
  return map;
})();

export const EDUCATION_LEVELS = [
  "Elementary", "Secondary", "Senior High School", "Vocational / Trade",
  "College", "Graduate Studies",
];

export const CIVIL_STATUS_OPTIONS = ["Single", "Married", "Widowed", "Separated", "Divorced"];
export const EMPLOYMENT_STATUS_OPTIONS = [
  "Permanent", "Casual", "Contractual", "Contract of Service", "Job Order", "Part-time",
];
export const TRAINING_TYPES = [
  "Managerial", "Supervisory", "Technical", "Non-Technical",
];

export const SEED_PLACES = [
  "Accounting Unit", "Human Resource Development Unit", "Metrology Laboratory", "Materials and Corrosion Laboratory",
];
