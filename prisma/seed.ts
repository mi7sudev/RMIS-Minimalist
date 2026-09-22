// ============================================================================
// RMIS — Seed script (spec §15): RBAC-free normalized schema; demo accounts,
// reference data, positions + postings, sample applicants + applications
// across pipeline stages. Run: npx tsx prisma/seed.ts (or bun prisma/seed.ts)
// ============================================================================

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("Seeding RMIS…");

  // ── Reference data ────────────────────────────────────────────────────────
  const eligibilityNames = [
    "None Required",
    "Career Service Sub-Professional (First Level)",
    "Career Service Professional (Second Level)",
    "Honor Graduate (PD 907)",
    "Bar/Board (RA 1080)",
  ];
  for (let i = 0; i < eligibilityNames.length; i++) {
    await db.eligibilityRef.upsert({
      where: { name: eligibilityNames[i] },
      update: { index: i },
      create: { name: eligibilityNames[i], index: i },
    });
  }

  const courses: [string, string, string, string][] = [
    ["BSBA", "BSBA", "Business", "College"],
    ["BS Accountancy", "BSA", "Business", "College"],
    ["BS Mechanical Engineering", "BSME", "Engineering", "College"],
    ["BS Electrical Engineering", "BSEE", "Engineering", "College"],
    ["BS Civil Engineering", "BSCE", "Engineering", "College"],
    ["BS Industrial Engineering", "BSIE", "Engineering", "College"],
    ["BS Computer Science", "BSCS", "IT", "College"],
    ["BS Information Technology", "BSIT", "IT", "College"],
    ["BS Chemistry", "BS Chem", "Science", "College"],
    ["BS Physics", "BS Physics", "Science", "College"],
    ["BS Biology", "BS Bio", "Science", "College"],
    ["BS Psychology", "BSPsych", "Social Science", "College"],
    ["AB Political Science", "AB PolSci", "Social Science", "College"],
    ["MS Mechanical Engineering", "MSME", "Engineering", "Graduate"],
    ["Master in Public Administration", "MPA", "Public Admin", "Graduate"],
    ["Master in Business Administration", "MBA", "Business", "Graduate"],
  ];
  for (const [name, abbr, category, level] of courses) {
    await db.course.upsert({ where: { name }, update: {}, create: { name, abbreviation: abbr, category, level } });
  }

  const places = ["Accounting Unit", "Human Resource Development Unit", "Metrology Laboratory", "Materials and Corrosion Laboratory"];
  for (const name of places) {
    await db.placeOfAssignment.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ── Accounts ──────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash("password123", 10);
  const accounts = [
    { username: "testadmin", email: "testadmin@mirdc.gov.ph", firstName: "Test", lastName: "Admin", role: "ADMIN" },
    { username: "testevaluator", email: "testevaluator@mirdc.gov.ph", firstName: "Test", lastName: "Evaluator", role: "EVALUATOR" },
    { username: "testapplicant", email: "testapplicant@mirdc.gov.ph", firstName: "Test", lastName: "Applicant", role: "APPLICANT" },
  ];
  const users: Record<string, string> = {};
  for (const a of accounts) {
    const user = await db.user.upsert({
      where: { username: a.username },
      update: { password: hash, role: a.role, blocked: false },
      create: { ...a, password: hash },
    });
    users[a.role] = user.id;
    if (a.role === "APPLICANT") {
      const existing = await db.applicant.findUnique({ where: { userId: user.id } });
      if (!existing) {
        await db.applicant.create({
          data: {
            userId: user.id,
            firstName: "Test",
            lastName: "Applicant",
            emailAddress: a.email,
            mobileNumber: "09171234567",
          },
        });
      }
    }
  }

  // ── Positions + postings ──────────────────────────────────────────────────
  const day = 86400000;
  const now = Date.now();

  const positionDefs = [
    {
      itemNumber: "MIRDC-MC1-1-1998",
      positionTitle: "Supervising Science Research Specialist",
      positionType: "Permanent",
      division: "MPRD",
      placeOfAssignment: "Materials and Corrosion Laboratory",
      salaryGrade: "22", salaryStep: "1", salaryAmount: 66459,
      cscEducation: "Master's degree or Bachelor's degree relevant to the job",
      cscEligibility: "Career Service Professional", cscEligibilityGroup: "Career Service Professional (Second Level)",
      cscWorkExperience: "2 years of relevant experience",
      cscTraining: "16 hours of relevant training",
      license: "None required",
    },
    {
      itemNumber: "MIRDC-SC1-5-2006",
      positionTitle: "Science Research Specialist I",
      positionType: "Permanent",
      division: "TSD",
      placeOfAssignment: "Metrology Laboratory",
      salaryGrade: "13", salaryStep: "1", salaryAmount: 31699,
      cscEducation: "Bachelor's degree relevant to the job",
      cscEligibility: "Career Service Professional", cscEligibilityGroup: "Career Service Professional (Second Level)",
      cscWorkExperience: "None required",
      cscTraining: "4 hours of relevant training",
      license: "None required",
    },
    {
      itemNumber: "MIRDC-AA1-3-2015",
      positionTitle: "Administrative Assistant I",
      positionType: "Permanent",
      division: "FAD",
      placeOfAssignment: "Accounting Unit",
      salaryGrade: "9", salaryStep: "1", salaryAmount: 22316,
      cscEducation: "Relevant vocational/trade course",
      cscEligibility: "Career Service Sub-Professional", cscEligibilityGroup: "Career Service Sub-Professional (First Level)",
      cscWorkExperience: "None required",
      cscTraining: "None required",
      license: "None required",
    },
    {
      itemNumber: "COS-2026-EMC-01",
      positionTitle: "Electronics Technician (Contract of Service)",
      positionType: "Contract of Service",
      division: "AMMRDD",
      placeOfAssignment: "Human Resource Development Unit",
      salaryGrade: null, salaryStep: null, salaryAmount: 28000,
      cscEducation: "Relevant vocational/trade course",
      cscEligibility: "N/A", cscEligibilityGroup: "N/A",
      cscWorkExperience: "1 year of relevant experience",
      cscTraining: "None required",
      license: "TESDA NC II an advantage",
    },
  ];

  const positions: Record<string, number> = {};
  for (const p of positionDefs) {
    const existing = await db.position.findFirst({ where: { itemNumber: p.itemNumber } });
    const row = existing
      ? await db.position.update({ where: { id: existing.id }, data: p })
      : await db.position.create({ data: p });
    positions[p.positionTitle] = row.id;
  }

  const jobDefs = [
    {
      title: "Supervising Science Research Specialist",
      positionType: "Permanent",
      numberOfVacancy: 1,
      briefDescription: "Leads research projects on metals and materials corrosion, mentors junior researchers, and represents the division in inter-agency collaborations.",
      dutiesResponsibilities: "• Lead R&D projects on materials corrosion and protection\n• Publish research outputs in peer-reviewed venues\n• Mentor junior research staff\n• Coordinate with industry partners on collaborative studies",
      compensationPackage: "SG-22 Step 1 (₱66,459 monthly) plus statutory benefits",
      otherQualifications: "Strong publication record preferred; experience in electrochemical testing an advantage.",
      deadlineOffsetDays: 21,
      positionKey: "Supervising Science Research Specialist",
    },
    {
      title: "Science Research Specialist I",
      positionType: "Permanent",
      numberOfVacancy: 2,
      briefDescription: "Performs calibration and testing services in the Metrology Laboratory and documents results in accordance with ISO/IEC 17025.",
      dutiesResponsibilities: "• Perform calibration of measurement instruments\n• Maintain laboratory quality-management documentation\n• Assist clients with testing requirements",
      compensationPackage: "SG-13 Step 1 (₱31,699 monthly) plus statutory benefits",
      otherQualifications: "Fresh graduates are encouraged to apply.",
      deadlineOffsetDays: 14,
      positionKey: "Science Research Specialist I",
    },
    {
      title: "Administrative Assistant I",
      positionType: "Permanent",
      numberOfVacancy: 1,
      briefDescription: "Provides administrative and records support to the Accounting Unit, including document routing and data entry.",
      dutiesResponsibilities: "• Prepare and route administrative documents\n• Maintain records and filing systems\n• Assist in inventory and supplies monitoring",
      compensationPackage: "SG-9 Step 1 (₱22,316 monthly) plus statutory benefits",
      otherQualifications: "Proficiency in office productivity software required.",
      deadlineOffsetDays: 10,
      positionKey: "Administrative Assistant I",
    },
    {
      title: "Electronics Technician (Contract of Service)",
      positionType: "Contract of Service",
      numberOfVacancy: 3,
      briefDescription: "Supports the fabrication and maintenance of electronics prototypes for advanced manufacturing research projects.",
      dutiesResponsibilities: "• Assemble and test electronics prototypes\n• Maintain laboratory equipment\n• Support project field deployments",
      compensationPackage: "₱28,000 monthly (contract of service)",
      otherQualifications: "TESDA NC II holders encouraged to apply.",
      deadlineOffsetDays: -3, // already closed — demonstrates the visibility rule
      positionKey: "Electronics Technician (Contract of Service)",
    },
  ];

  const adminId = users["ADMIN"];
  for (const j of jobDefs) {
    const existing = await db.jobPosting.findFirst({ where: { title: j.title, positionId: positions[j.positionKey] } });
    const data = {
      title: j.title,
      positionType: j.positionType,
      numberOfVacancy: j.numberOfVacancy,
      briefDescription: j.briefDescription,
      briefDescriptionHtml: `<p>${j.briefDescription}</p>`,
      dutiesResponsibilities: j.dutiesResponsibilities,
      dutiesHtml: j.dutiesResponsibilities.split("\n").map((l) => `<p>${l}</p>`).join(""),
      compensationPackage: j.compensationPackage,
      compensationHtml: `<p>${j.compensationPackage}</p>`,
      otherQualifications: j.otherQualifications,
      otherQualificationsHtml: `<p>${j.otherQualifications}</p>`,
      publishDate: new Date(now - 10 * day),
      deadlineDate: new Date(now + j.deadlineOffsetDays * day),
      positionId: positions[j.positionKey],
      authorId: adminId,
      publishedAt: new Date(now - 10 * day),
    };
    if (!existing) await db.jobPosting.create({ data });
  }

  // ── Sample applicant with complete profile + applications across stages ──
  const sampleEmail = "maria.santos@example.com";
  let sampleUser = await db.user.findUnique({ where: { username: "maria.santos" } });
  if (!sampleUser) {
    sampleUser = await db.user.create({
      data: {
        username: "maria.santos",
        email: sampleEmail,
        password: hash,
        firstName: "Maria",
        lastName: "Santos",
        role: "APPLICANT",
      },
    });
  }
  let sampleApplicant = await db.applicant.findUnique({ where: { userId: sampleUser.id } });
  if (!sampleApplicant) {
    sampleApplicant = await db.applicant.create({
      data: {
        userId: sampleUser.id,
        firstName: "Maria",
        middleName: "Reyes",
        lastName: "Santos",
        emailAddress: sampleEmail,
        mobileNumber: "09181234567",
        gender: "Female",
        civilStatus: "Single",
        citizenship: "Filipino",
        birthDate: "1996-05-14",
        birthPlace: "Quezon City",
        presentAddress: "12 Sampaguita St., Barangay San Roque",
        city: "Quezon City",
        province: "Metro Manila",
        country: "Philippines",
        zipCode: "1100",
        isProfileComplete: true,
        submittedDate: new Date(now - 5 * day),
        characterReference: JSON.stringify([
          { name: "Dr. Jose Cruz", title: "Chief, Materials Lab", company: "DOST-MIRDC", companyAddress: "Taguig", email: "jose.cruz@mirdc.gov.ph", contact: "09170000000" },
        ]),
      },
    });
    await db.education.createMany({
      data: [
        { applicantId: sampleApplicant.id, educationLevel: "College", course: "BS Chemistry", schoolName: "University of the Philippines", yearFrom: "2014", yearTo: "2018", yearGraduated: "2018", ord: 1 },
        { applicantId: sampleApplicant.id, educationLevel: "Secondary", schoolName: "Quezon City Science High School", yearFrom: "2010", yearTo: "2014", yearGraduated: "2014", ord: 2 },
      ],
    });
    await db.workExperience.createMany({
      data: [
        { applicantId: sampleApplicant.id, positionTitle: "Research Assistant", employerName: "DOST-ITDI", dateFrom: new Date("2019-01-01"), dateTo: new Date("2022-06-30"), isGovtService: true, statusOfEmployment: "Permanent", monthlySalary: 28000, yearDecimal: 3.5, ord: 1 },
        { applicantId: sampleApplicant.id, positionTitle: "Laboratory Analyst", employerName: "Private Testing Center", dateFrom: new Date("2022-07-01"), isPresentWork: true, isGovtService: false, statusOfEmployment: "Permanent", monthlySalary: 35000, yearDecimal: 3.1, ord: 2 },
      ],
    });
    await db.training.createMany({
      data: [
        { applicantId: sampleApplicant.id, title: "Basic Occupational Safety and Health", numberHours: 40, typeOfTraining: "Technical", dateFrom: new Date("2019-06-10"), dateTo: new Date("2019-06-14"), ord: 1 },
        { applicantId: sampleApplicant.id, title: "ISO/IEC 17025 Internal Auditor Training", numberHours: 24, typeOfTraining: "Technical", dateFrom: new Date("2021-03-01"), dateTo: new Date("2021-03-03"), ord: 2 },
      ],
    });
    await db.eligibility.create({
      data: { applicantId: sampleApplicant.id, title: "Career Service Professional (Second Level)", rating: "86.40", examDate: "2018-08-12", examPlace: "Quezon City", ord: 1 },
    });
    await db.award.create({
      data: { applicantId: sampleApplicant.id, recognitionType: "Award", scope: "Individual", details: "Best Poster Award — National Chemistry Conference", provider: "Philippine Federation of Chemistry Societies", dateGranted: "2021-11-20", ord: 1 },
    });
  }

  // Applications across stages for the sample applicant
  const jobs = await db.jobPosting.findMany({ include: { position: true } });
  const srs = jobs.find((j) => j.title.includes("Supervising"));
  const srs1 = jobs.find((j) => j.title === "Science Research Specialist I");

  async function ensureApplication(job: (typeof jobs)[number] | undefined, status: string, daysAgo: number) {
    if (!job) return;
    const existing = await db.application.findUnique({
      where: { applicantId_jobId: { applicantId: sampleApplicant!.id, jobId: job.id } },
    });
    if (existing) {
      await db.application.update({ where: { id: existing.id }, data: { status } });
      return;
    }
    const app = await db.application.create({
      data: { applicantId: sampleApplicant!.id, jobId: job.id, status, dateApplied: new Date(now - daysAgo * day) },
    });
    // write snapshots from the live profile
    const full = await db.applicant.findUnique({
      where: { id: sampleApplicant!.id },
      include: { educations: true, workExperiences: true, trainings: true, eligibilities: true, awards: true },
    });
    if (full) {
      await db.application.update({
        where: { id: app.id },
        data: {
          snapshotProfile: JSON.stringify({
            id: full.id, firstName: full.firstName, lastName: full.lastName, emailAddress: full.emailAddress,
            contactNumber: full.mobileNumber, gender: full.gender, civilStatus: full.civilStatus,
            citizenship: full.citizenship, birthDate: full.birthDate, presentAddress: full.presentAddress,
            city: full.city, province: full.province, country: full.country,
            characterReference: JSON.parse(full.characterReference || "null"),
          }),
          snapshotEducations: JSON.stringify(full.educations),
          snapshotExperiences: JSON.stringify(full.workExperiences),
          snapshotTrainings: JSON.stringify(full.trainings),
          snapshotEligibilities: JSON.stringify(full.eligibilities),
          snapshotAwards: JSON.stringify(full.awards),
        },
      });
    }
  }

  await ensureApplication(srs, "Under Review", 6);
  await ensureApplication(srs1, "Shortlisted", 4);

  await db.notification.createMany({
    data: [
      { applicantId: sampleApplicant.id, name: "Application update", description: "Your application for Supervising Science Research Specialist is now Under Review.", createdAt: new Date(now - 5 * day) },
      { applicantId: sampleApplicant.id, name: "Application update", description: "You have been shortlisted for Science Research Specialist I. A notice has been sent to your email.", createdAt: new Date(now - 3 * day) },
    ],
  });

  console.log("Seed complete.");
  console.log("Accounts: testadmin / testevaluator / testapplicant / maria.santos — password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
