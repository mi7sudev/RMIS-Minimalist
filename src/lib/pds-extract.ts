// ============================================================================
// RMIS — Document extraction pipeline (spec §8.5 deterministic PDS parser,
// §8.6 AI fallback). SERVER-SIDE ONLY.
//   xlsx/xls/xlsm → deterministic label-anchored parser first, AI fallback
//   pdf  → unpdf text → AI      docx → mammoth text → AI      images → AI vision
// Prompt contract: extract only what is clearly present; NEVER fabricate;
// not found ⇒ null + confidence "none"; dates → YYYY-MM-DD; JSON only.
// ============================================================================

import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

export type ConfidentValue = { value: string | number | boolean | null; confidence: "high" | "medium" | "low" | "none" };
export type ExtractionSection = Record<string, ConfidentValue>;
export type ExtractionResult = {
  personalInfo?: ExtractionSection;
  educations?: ExtractionSection[];
  workExperiences?: ExtractionSection[];
  trainings?: ExtractionSection[];
  eligibilities?: ExtractionSection[];
  awards?: ExtractionSection[];
  warnings?: string[];
};

const cv = (value: string | number | null, confidence: ConfidentValue["confidence"] = "high"): ConfidentValue =>
  ({ value: value === "" ? null : value, confidence });

// ── Deterministic PDS parsing (CSC Form 212, label-anchored) ────────────────

const NOISE = /cs\s*form|page\s*\d+\s*of|signature|do not abbreviate|^\s*[ivx]+\.\s*$|over-\s*mark/i;

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "";
  if (typeof v === "object" && v !== null) {
    const obj = v as { text?: string; result?: unknown };
    if (typeof obj.text === "string") return obj.text;
    if (obj.result != null) return String(obj.result);
    return "";
  }
  return String(v).trim();
}

function findRow(ws: XLSX.WorkSheet, labelRe: RegExp, maxRow = 80): { row: number; col: number } | null {
  const ref = ws["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  const rEnd = Math.min(range.e.r, maxRow);
  for (let r = range.s.r; r <= rEnd; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 14); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const t = cellText(cell?.v);
      if (t && labelRe.test(t) && !NOISE.test(t)) return { row: r, col: c };
    }
  }
  return null;
}

function scanRight(ws: XLSX.WorkSheet, row: number, startCol: number, maxScan = 12): string {
  const ref = ws["!ref"];
  if (!ref) return "";
  const range = XLSX.utils.decode_range(ref);
  for (let c = startCol + 1; c <= Math.min(range.e.c, startCol + maxScan); c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: row, c })];
    const t = cellText(cell?.v);
    if (t && !NOISE.test(t) && !/^(yes|no)$/i.test(t) && !/^\d{1,2}$/.test(t)) return t;
  }
  return "";
}

function normDate(v: string): string {
  if (!v) return "";
  // Excel serial?
  const num = Number(v);
  if (!Number.isNaN(num) && num > 20000 && num < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) as unknown as number);
    d.setUTCDate(d.getUTCDate() + Math.floor(num));
    return d.toISOString().slice(0, 10);
  }
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(v)) return parsed.toISOString().slice(0, 10);
  const m = v.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

export function parsePdsWorkbook(filePath: string): ExtractionResult | null {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.readFile(filePath, { cellDates: false });
  } catch {
    return null;
  }
  const sheetName = wb.SheetNames.find((n) => /C1|Sheet1|personal/i.test(n)) || wb.SheetNames[0];
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  const a1 = cellText(ws["A1"]?.v ?? ws["A2"]?.v);
  const looksLikePds =
    /personal\s*data\s*sheet/i.test(a1) ||
    wb.SheetNames.some((n) => /C\d/i.test(n)) ||
    !!findRow(ws, /personal\s*data\s*sheet/i, 12);
  if (!looksLikePds) return null;

  const result: ExtractionResult = { warnings: [] };
  const personal: ExtractionSection = {};

  const put = (key: string, v: string, conf: ConfidentValue["confidence"] = "high") => {
    if (v) personal[key] = cv(v, conf);
  };

  const surname = findRow(ws, /sur\s*name/i) || findRow(ws, /^surname/i);
  if (surname) put("lastName", scanRight(ws, surname.row, surname.col));
  const given = findRow(ws, /given\s*name|first\s*name/i);
  if (given) put("firstName", scanRight(ws, given.row, given.col));
  const middle = findRow(ws, /middle\s*name/i);
  if (middle) put("middleName", scanRight(ws, middle.row, middle.col));
  const ext = findRow(ws, /name\s*extension/i);
  if (ext) put("extensionName", scanRight(ws, ext.row, ext.col));
  const dob = findRow(ws, /date\s*of\s*birth/i);
  if (dob) put("birthDate", normDate(scanRight(ws, dob.row, dob.col)), "high");
  const pob = findRow(ws, /place\s*of\s*birth/i);
  if (pob) put("birthPlace", scanRight(ws, pob.row, pob.col));
  const sex = findRow(ws, /^sex|gender/i);
  if (sex) {
    const raw = scanRight(ws, sex.row, sex.col);
    const m = raw.match(/male|female/i);
    if (m) put("gender", m[0][0].toUpperCase() + m[0].slice(1).toLowerCase());
  }
  const cs = findRow(ws, /civil\s*status/i);
  if (cs) {
    const raw = scanRight(ws, cs.row, cs.col).toLowerCase();
    const hit = ["single", "married", "widowed", "separated", "divorced"].find((s) => raw.includes(s));
    if (hit) put("civilStatus", hit[0].toUpperCase() + hit.slice(1));
  }
  const cit = findRow(ws, /citizenship/i);
  if (cit) put("citizenship", scanRight(ws, cit.row, cit.col));
  const res = findRow(ws, /residential\s*address|house\/?street|house\s*no/i);
  if (res) {
    put("houseNumber", scanRight(ws, res.row, res.col));
    const block = [res.row, res.row + 1, res.row + 2].map((r) => scanRight(ws, r, res.col)).filter(Boolean);
    if (block.length > 0) put("presentAddress", block.join(", "), "medium");
  }
  const zip = findRow(ws, /zip\s*code/i);
  if (zip) put("zipCode", scanRight(ws, zip.row, zip.col));
  const tel = findRow(ws, /tele(phone)?\s*\/?\s*mobile|mobile/i);
  if (tel) {
    const raw = scanRight(ws, tel.row, tel.col).replace(/\s+/g, "");
    if (/^[\d+()-]{7,15}$/.test(raw)) put("mobileNumber", raw);
  }
  const email = findRow(ws, /e-?mail/i);
  if (email) {
    const raw = scanRight(ws, email.row, email.col);
    if (raw.includes("@")) put("emailAddress", raw);
  }

  const fieldsExtracted = Object.keys(personal).length;
  if (fieldsExtracted === 0 && wb.SheetNames.length <= 1) {
    result.warnings?.push("No PDS labels recognized");
    return result;
  }
  result.personalInfo = personal;

  // ── Education table (sheet C1: header "NAME OF SCHOOL") ──────────────────
  const eduSheet = wb.Sheets[sheetName];
  const eduHeader = findRow(eduSheet, /name\s*of\s*school/i, 200);
  const educations: ExtractionSection[] = [];
  if (eduHeader) {
    const ref = XLSX.utils.decode_range(eduSheet["!ref"]!);
    for (let r = eduHeader.row + 1; r <= Math.min(ref.e.r, eduHeader.row + 20); r++) {
      const level = cellText(eduSheet[XLSX.utils.encode_cell({ r, c: 1 })]?.v);
      const school = cellText(eduSheet[XLSX.utils.encode_cell({ r, c: 3 })]?.v);
      const degree = cellText(eduSheet[XLSX.utils.encode_cell({ r, c: 6 })]?.v);
      const from = cellText(eduSheet[XLSX.utils.encode_cell({ r, c: 9 })]?.v);
      const to = cellText(eduSheet[XLSX.utils.encode_cell({ r, c: 10 })]?.v);
      const grad = cellText(eduSheet[XLSX.utils.encode_cell({ r, c: 12 })]?.v);
      const honors = cellText(eduSheet[XLSX.utils.encode_cell({ r, c: 13 })]?.v);
      if (!school && !degree) continue;
      if (NOISE.test(school + degree)) continue;
      const entry: ExtractionSection = {};
      if (level) entry.educationLevel = cv(/elementary/i.test(level) ? "Elementary" : /secondary/i.test(level) ? "Secondary" : /vocational/i.test(level) ? "Vocational / Trade" : /graduate/i.test(level) ? "Graduate Studies" : "College", "medium");
      if (school) entry.schoolName = cv(school);
      if (degree && !/^graduated$/i.test(degree)) entry.course = cv(degree, "medium");
      if (from) entry.yearFrom = cv(/^\d{4}$/.test(from) ? from : (from.match(/\d{4}/)?.[0] ?? ""), "medium");
      if (to) entry.yearTo = cv(/^\d{4}$/.test(to) ? to : (to.match(/\d{4}/)?.[0] ?? ""), "medium");
      if (grad) entry.yearGraduated = cv(/^\d{4}$/.test(grad) ? grad : (grad.match(/\d{4}/)?.[0] ?? ""), "medium");
      if (honors) entry.awards = cv(honors, "medium");
      if (Object.keys(entry).length > 0) educations.push(entry);
    }
    if (educations.length > 0) result.educations = educations;
  }

  // ── Sheets C2 (eligibility + work) and C3 (training + awards) ────────────
  const c2 = wb.SheetNames.find((n) => /C2/i.test(n));
  if (c2) {
    const ws2 = wb.Sheets[c2];
    const eligHeader = findRow(ws2, /career\s*service(?!.*eligibility)|\bscreligib|eligib/i, 120);
    const eligibilities: ExtractionSection[] = [];
    if (eligHeader) {
      const ref = XLSX.utils.decode_range(ws2["!ref"]!);
      for (let r = eligHeader.row + 1; r <= Math.min(ref.e.r, eligHeader.row + 12); r++) {
        const title = cellText(ws2[XLSX.utils.encode_cell({ r, c: 1 })]?.v) || cellText(ws2[XLSX.utils.encode_cell({ r, c: 2 })]?.v);
        const rating = cellText(ws2[XLSX.utils.encode_cell({ r, c: 5 })]?.v);
        const date = cellText(ws2[XLSX.utils.encode_cell({ r, c: 6 })]?.v);
        const place = cellText(ws2[XLSX.utils.encode_cell({ r, c: 7 })]?.v);
        if (!title || NOISE.test(title)) continue;
        const entry: ExtractionSection = { title: cv(title.replace(/\s*\(.*?\)\s*$/, "")) };
        if (rating && /^\d/.test(rating)) entry.rating = cv(rating, "medium");
        if (date) entry.examDate = cv(normDate(date) || date, "medium");
        if (place) entry.examPlace = cv(place, "medium");
        eligibilities.push(entry);
      }
      if (eligibilities.length > 0) result.eligibilities = eligibilities;
    }

    const workHeader = findRow(ws2, /position\s*title/i, 200);
    const work: ExtractionSection[] = [];
    if (workHeader) {
      const ref = XLSX.utils.decode_range(ws2["!ref"]!);
      for (let r = workHeader.row + 1; r <= Math.min(ref.e.r, workHeader.row + 30); r++) {
        const from = cellText(ws2[XLSX.utils.encode_cell({ r, c: 0 })]?.v) || cellText(ws2[XLSX.utils.encode_cell({ r, c: 1 })]?.v);
        const to = cellText(ws2[XLSX.utils.encode_cell({ r, c: 2 })]?.v) || cellText(ws2[XLSX.utils.encode_cell({ r, c: 3 })]?.v);
        const position = cellText(ws2[XLSX.utils.encode_cell({ r, c: 4 })]?.v) || cellText(ws2[XLSX.utils.encode_cell({ r, c: 3 })]?.v);
        const employer = cellText(ws2[XLSX.utils.encode_cell({ r, c: 6 })]?.v) || cellText(ws2[XLSX.utils.encode_cell({ r, c: 5 })]?.v);
        const salary = cellText(ws2[XLSX.utils.encode_cell({ r, c: 8 })]?.v);
        if (!position || position.length < 3 || NOISE.test(position)) continue;
        const entry: ExtractionSection = { positionTitle: cv(position) };
        if (employer && employer.length > 2) entry.employerName = cv(employer, "medium");
        const dFrom = normDate(from);
        if (dFrom) entry.dateFrom = cv(dFrom, "medium");
        const dTo = normDate(to);
        if (dTo) entry.dateTo = cv(dTo, "medium");
        else if (!to || /present/i.test(to)) entry.isPresentWork = cv("true", "medium");
        if (salary && Number(salary.replace(/[^\d.]/g, "")) > 0) entry.monthlySalary = cv(Number(salary.replace(/[^\d.]/g, "")), "medium");
        work.push(entry);
      }
      if (work.length > 0) result.workExperiences = work;
    }
  }

  const c3 = wb.SheetNames.find((n) => /C3/i.test(n));
  if (c3) {
    const ws3 = wb.Sheets[c3];
    const trainHeader = findRow(ws3, /title\s*of\s*learning|title\s*of\s*training/i, 200);
    const trainings: ExtractionSection[] = [];
    if (trainHeader) {
      const ref = XLSX.utils.decode_range(ws3["!ref"]!);
      for (let r = trainHeader.row + 1; r <= Math.min(ref.e.r, trainHeader.row + 30); r++) {
        const title = cellText(ws3[XLSX.utils.encode_cell({ r, c: 0 })]?.v) || cellText(ws3[XLSX.utils.encode_cell({ r, c: 1 })]?.v);
        const from = cellText(ws3[XLSX.utils.encode_cell({ r, c: 4 })]?.v) || cellText(ws3[XLSX.utils.encode_cell({ r, c: 2 })]?.v);
        const to = cellText(ws3[XLSX.utils.encode_cell({ r, c: 5 })]?.v) || cellText(ws3[XLSX.utils.encode_cell({ r, c: 3 })]?.v);
        const hours = cellText(ws3[XLSX.utils.encode_cell({ r, c: 6 })]?.v);
        const type = cellText(ws3[XLSX.utils.encode_cell({ r, c: 7 })]?.v);
        if (!title || title.length < 4 || NOISE.test(title) || /^\d+$/.test(title)) continue;
        const entry: ExtractionSection = { title: cv(title) };
        const dFrom = normDate(from);
        if (dFrom) entry.dateFrom = cv(dFrom, "medium");
        const dTo = normDate(to);
        if (dTo) entry.dateTo = cv(dTo, "medium");
        const hNum = Number(String(hours).replace(/[^\d.]/g, ""));
        if (hours && !Number.isNaN(hNum) && hNum > 0) entry.numberHours = cv(hNum, "medium");
        if (type && type.length > 2 && !NOISE.test(type)) entry.typeOfTraining = cv(type, "medium");
        trainings.push(entry);
      }
      if (trainings.length > 0) result.trainings = trainings;
    }

    const awardsHeader = findRow(ws3, /non-?academic\s*distinctions/i, 250);
    const awards: ExtractionSection[] = [];
    if (awardsHeader) {
      const ref = XLSX.utils.decode_range(ws3["!ref"]!);
      for (let r = awardsHeader.row + 1; r <= Math.min(ref.e.r, awardsHeader.row + 15); r++) {
        for (let c = 0; c <= 7; c++) {
          const v = cellText(ws3[XLSX.utils.encode_cell({ r, c })]?.v);
          if (v && v.length > 6 && !NOISE.test(v) && !/^\d+$/.test(v) && !/membership/i.test(v)) {
            awards.push({ details: cv(v), recognitionType: cv("Award", "medium") });
            break;
          }
        }
      }
      if (awards.length > 0) result.awards = awards;
    }
  }

  return result;
}

// ── AI extraction (z-ai-web-dev-sdk — backend only) ─────────────────────────

const AI_JSON_PROMPT = (category: string, text: string) => `You are a data-extraction engine for Philippine government recruitment (CSC forms).
From the following ${category} document text, extract structured data as STRICT JSON with this exact shape (omit sections you find nothing for):
{
  "personalInfo": { "<field>": {"value": <string|number|null>, "confidence": "high"|"medium"|"low"} },
  "educations": [ { "educationLevel": {...}, "course": {...}, "schoolName": {...}, "yearFrom": {...}, "yearTo": {...}, "yearGraduated": {...}, "awards": {...} } ],
  "workExperiences": [ { "positionTitle": {...}, "employerName": {...}, "dateFrom": {...}, "dateTo": {...}, "monthlySalary": {...}, "isPresentWork": {...} } ],
  "trainings": [ { "title": {...}, "numberHours": {...}, "typeOfTraining": {...}, "dateFrom": {...}, "dateTo": {...} } ],
  "eligibilities": [ { "title": {...}, "rating": {...}, "examDate": {...}, "examPlace": {...}, "licenseNumber": {...}, "licenseValidity": {...} } ],
  "awards": [ { "details": {...}, "recognitionType": {...}, "provider": {...}, "dateGranted": {...} } ]
}
personalInfo fields may include: firstName, middleName, lastName, extensionName, birthDate, birthPlace, gender, civilStatus, citizenship, mobileNumber, emailAddress, houseNumber, street, subdivision, barangay, city, province, zipCode.
Rules: extract ONLY what is clearly present; NEVER fabricate; not found ⇒ value null with confidence "none"; all values in the {value, confidence} shape; dates formatted YYYY-MM-DD; respond with JSON only — no markdown fences, no commentary.

DOCUMENT TEXT (truncated):
"""
${text.slice(0, 12000)}
"""`;

function parseAiJson(raw: string): ExtractionResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as ExtractionResult;
  } catch {
    return null;
  }
}

async function aiExtractText(text: string, category: string): Promise<ExtractionResult | null> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: "You extract structured data from documents and reply with JSON only." },
        { role: "user", content: AI_JSON_PROMPT(category, text) },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content || "";
    return parseAiJson(raw);
  } catch (e) {
    console.error("[EXTRACT] AI failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Text extraction helpers ─────────────────────────────────────────────────

export function extractExcelText(filePath: string): string {
  try {
    const wb = XLSX.readFile(filePath, { cellDates: false });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      if (/lookup/i.test(name)) continue;
      const ws = wb.Sheets[name];
      parts.push(`## Sheet: ${name}`);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
      for (const row of rows.slice(0, 300)) {
        const cells = (row as unknown[]).map((c) => cellText(c)).filter(Boolean);
        if (cells.length > 0) parts.push(cells.join(" | "));
      }
    }
    return parts.join("\n").slice(0, 16000);
  } catch {
    return "";
  }
}

export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buffer = fs.readFileSync(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.slice(0, 16000);
  } catch {
    return "";
  }
}

export async function extractDocxText(filePath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.slice(0, 12000);
  } catch {
    return "";
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function countExtractedFields(result: ExtractionResult | null): number {
  if (!result) return 0;
  let n = 0;
  const countSection = (s?: ExtractionSection) => { if (s) n += Object.values(s).filter((v) => v && v.value !== null && v.value !== "").length; };
  countSection(result.personalInfo);
  for (const arr of [result.educations, result.workExperiences, result.trainings, result.eligibilities, result.awards]) {
    for (const s of arr ?? []) countSection(s);
  }
  return n;
}

export function mergeExtractions(results: (ExtractionResult | null)[]): ExtractionResult | null {
  const valid = results.filter((r): r is ExtractionResult => !!r);
  if (valid.length === 0) return null;
  const merged: ExtractionResult = { warnings: [] };
  // personal: per-field highest-confidence non-null wins
  const rank: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
  const personal: ExtractionSection = {};
  for (const r of valid) {
    for (const [k, v] of Object.entries(r.personalInfo ?? {})) {
      if (v.value === null || v.value === "") continue;
      const cur = personal[k];
      if (!cur || (rank[v.confidence] ?? 0) > (rank[cur.confidence] ?? 0)) personal[k] = v;
    }
  }
  if (Object.keys(personal).length > 0) merged.personalInfo = personal;
  const mergeArr = (key: keyof ExtractionResult) => {
    const all = valid.flatMap((r) => (r[key] as ExtractionSection[] | undefined) ?? []);
    if (all.length > 0) (merged as Record<string, unknown>)[key as string] = dedupeSectionArray(all, key as string);
  };
  mergeArr("educations");
  mergeArr("workExperiences");
  mergeArr("trainings");
  mergeArr("eligibilities");
  mergeArr("awards");
  merged.warnings = valid.flatMap((r) => r.warnings ?? []);
  return merged;
}

function dedupeSectionArray(arr: ExtractionSection[], key: string): ExtractionSection[] {
  const seen = new Set<string>();
  const out: ExtractionSection[] = [];
  for (const item of arr) {
    const sig =
      key === "trainings" ? `${item.title?.value ?? ""}|${item.dateFrom?.value ?? ""}`
      : key === "awards" ? `${item.details?.value ?? ""}`
      : key === "workExperiences" ? `${item.positionTitle?.value ?? ""}|${item.employerName?.value ?? ""}|${item.dateFrom?.value ?? ""}`
      : key === "eligibilities" ? `${item.title?.value ?? ""}|${item.examDate?.value ?? ""}`
      : `${item.educationLevel?.value ?? ""}|${item.schoolName?.value ?? ""}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }
  return out;
}

/**
 * Extract structured data from a stored document (spec §6.4). Deterministic
 * parser first for PDS × Excel; AI fallback otherwise.
 */
export async function extractFromDocument(
  filePath: string,
  category: string,
  mimeType: string
): Promise<{ result: ExtractionResult | null; error?: string }> {
  const ext = path.extname(filePath).toLowerCase();
  if (/\.(xlsx|xls|xlsm)$/.test(ext)) {
    const deterministic = parsePdsWorkbook(filePath);
    if (deterministic && countExtractedFields(deterministic) >= 3) return { result: deterministic };
    const text = extractExcelText(filePath);
    if (text.trim().length > 40) {
      const ai = await aiExtractText(text, category);
      return { result: mergeExtractions([deterministic, ai]) };
    }
    return { result: deterministic };
  }
  if (ext === ".pdf") {
    const text = await extractPdfText(filePath);
    if (!text.trim()) return { result: null, error: "Could not read text from this PDF. Try uploading the Excel version of the PDS." };
    return { result: await aiExtractText(text, category) };
  }
  if (ext === ".docx" || ext === ".doc") {
    const text = await extractDocxText(filePath);
    if (!text.trim()) return { result: null, error: "Could not read this document. Try a DOCX or XLSX file." };
    return { result: await aiExtractText(text, category) };
  }
  if (/\.(png|jpg|jpeg|gif|webp|bmp)$/.test(ext)) {
    return { result: null, error: "Image extraction is not available in this deployment. Please upload the PDS as XLSX, PDF, or DOCX." };
  }
  return { result: null, error: `Unsupported file type for extraction (${mimeType}).` };
}
