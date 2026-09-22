"use client";

// ============================================================================
// RMIS — Profile builder · Section 01 Personal Information (spec §7.4).
// 4 disclosure groups with "X of N completed" micro-labels: Identity,
// Address, Legal Disclosures (conditional detail fields), Character
// References (1–5 rows; empty-name rows filtered at save).
// AUTOSAVE: every change re-arms a 1.2 s debounce → PUT /api/applicant/profile
// with a live save-state indicator; an explicit "Save Changes" button also
// exists (toast + session refresh). birthDate is sent as YYYY-MM-DD directly.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserRound } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { CIVIL_STATUS_OPTIONS } from "@/lib/constants";
import { SectionCard } from "@/components/ui/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApplicantProfile, CharacterReference } from "./section-types";

// ── Draft model ─────────────────────────────────────────────────────────────

type PersonalForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  extensionName: string;
  emailAddress: string;
  mobileNumber: string;
  contactNumber: string;
  birthDate: string;
  birthPlace: string;
  gender: string;
  civilStatus: string;
  citizenship: string;
  ethnicity: string;
  isPwd: boolean;
  presentAddress: string;
  houseNumber: string;
  street: string;
  subdivision: string;
  barangay: string;
  city: string;
  province: string;
  country: string;
  zipCode: string;
  isGovernment: boolean;
  adminCase: boolean;
  adminCaseDetails: string;
  crimeCharge: boolean;
  crimeDate: string;
  crimeCaseStatus: string;
};

const EMPTY_FORM: PersonalForm = {
  firstName: "", middleName: "", lastName: "", extensionName: "",
  emailAddress: "", mobileNumber: "", contactNumber: "",
  birthDate: "", birthPlace: "", gender: "", civilStatus: "", citizenship: "", ethnicity: "",
  isPwd: false,
  presentAddress: "", houseNumber: "", street: "", subdivision: "", barangay: "",
  city: "", province: "", country: "", zipCode: "",
  isGovernment: false, adminCase: false, adminCaseDetails: "",
  crimeCharge: false, crimeDate: "", crimeCaseStatus: "",
};

const EMPTY_REF: CharacterReference = { name: "", title: "", company: "", companyAddress: "", email: "", contact: "" };

const IDENTITY_FIELDS: (keyof PersonalForm)[] = [
  "firstName", "middleName", "lastName", "extensionName", "emailAddress", "mobileNumber",
  "contactNumber", "birthDate", "birthPlace", "gender", "civilStatus", "citizenship", "ethnicity",
];
const ADDRESS_FIELDS: (keyof PersonalForm)[] = [
  "presentAddress", "houseNumber", "street", "subdivision", "barangay", "city", "province", "country", "zipCode",
];

function seedForm(p: ApplicantProfile | null): PersonalForm {
  if (!p) return { ...EMPTY_FORM };
  return {
    firstName: p.firstName ?? "",
    middleName: p.middleName ?? "",
    lastName: p.lastName ?? "",
    extensionName: p.extensionName ?? "",
    emailAddress: p.emailAddress ?? "",
    mobileNumber: p.mobileNumber ?? "",
    contactNumber: p.contactNumber ?? "",
    birthDate: p.birthDate ?? "",
    birthPlace: p.birthPlace ?? "",
    gender: p.gender ?? "",
    civilStatus: p.civilStatus ?? "",
    citizenship: p.citizenship ?? "",
    ethnicity: p.ethnicity ?? "",
    isPwd: p.isPwd === true,
    presentAddress: p.presentAddress ?? "",
    houseNumber: p.houseNumber ?? "",
    street: p.street ?? "",
    subdivision: p.subdivision ?? "",
    barangay: p.barangay ?? "",
    city: p.city ?? "",
    province: p.province ?? "",
    country: p.country ?? "",
    zipCode: p.zipCode ?? "",
    isGovernment: p.isGovernment === true,
    adminCase: p.adminCase === true,
    adminCaseDetails: p.adminCaseDetails ?? "",
    crimeCharge: p.crimeCharge === true,
    crimeDate: p.crimeDate ?? "",
    crimeCaseStatus: p.crimeCaseStatus ?? "",
  };
}

function filledCount(form: PersonalForm, keys: (keyof PersonalForm)[]): number {
  return keys.filter((k) => typeof form[k] === "string" && (form[k] as string).trim() !== "").length;
}

// ── Small field primitives ──────────────────────────────────────────────────

const labelCls = "mb-1.5 block text-xs font-medium text-graphite";
const inputCls = "dlg-input min-h-[44px]";
const NONE = "__none__";

function TextField({
  label, required, helper, value, onChange, type = "text", placeholder,
}: {
  label: string; required?: boolean; helper?: string; value: string;
  onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <Label className={labelCls}>
        {label}
        {required && <span className="text-dusty-rose"> *</span>}
      </Label>
      <Input type={type} className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {helper && <p className="mt-1 text-xs text-pebble">{helper}</p>}
    </div>
  );
}

function SelectField({
  label, required, helper, value, options, onChange,
}: {
  label: string; required?: boolean; helper?: string; value: string;
  options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className={labelCls}>
        {label}
        {required && <span className="text-dusty-rose"> *</span>}
      </Label>
      <Select value={value !== "" ? value : NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger className={`${inputCls} w-full`}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent className="z-[60]">
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
          <SelectItem value={NONE}>
            <span className="text-pebble">Not specified</span>
          </SelectItem>
        </SelectContent>
      </Select>
      {helper && <p className="mt-1 text-xs text-pebble">{helper}</p>}
    </div>
  );
}

function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between rounded-[12px] bg-fog px-3">
      <span className="text-xs font-medium text-graphite">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function GroupHeading({ n, title, done, total }: { n: string; title: string; done: number; total: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
      <h3 className="font-display text-lg text-ink">
        <span className="mr-2 text-sm text-pebble">{n}</span>
        {title}
      </h3>
      <span className="rounded-full bg-fog px-3 py-1 text-xs font-medium text-graphite">
        <span className="num">{done}</span> of <span className="num">{total}</span> completed
      </span>
    </div>
  );
}

function RefRow({
  index, reference, onChange, onRemove, canRemove,
}: {
  index: number; reference: CharacterReference; onChange: (patch: Partial<CharacterReference>) => void;
  onRemove: () => void; canRemove: boolean;
}) {
  const fields: { key: keyof CharacterReference; label: string; type?: string }[] = [
    { key: "name", label: "Name" },
    { key: "title", label: "Title / Position" },
    { key: "company", label: "Company" },
    { key: "companyAddress", label: "Company Address" },
    { key: "email", label: "Email", type: "email" },
    { key: "contact", label: "Contact No." },
  ];
  return (
    <div className="dlg-card-plain rounded-[12px] border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-graphite">Reference <span className="num">{index + 1}</span></p>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="focus-ring min-h-[44px] px-3 text-xs text-stone underline-offset-4 hover:text-[var(--bad)] hover:underline disabled:opacity-40"
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key}>
            <Label className={labelCls}>{f.label}</Label>
            <Input
              type={f.type ?? "text"}
              className={inputCls}
              value={(reference[f.key] as string | null) ?? ""}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main section ────────────────────────────────────────────────────────────

export default function PersonalInfoSection({
  profile,
  seed,
  refreshSession,
}: {
  profile: ApplicantProfile | null;
  /** Bump to force a re-seed from the server profile (after PDS auto-apply / clear). */
  seed: number;
  refreshSession: () => Promise<unknown>;
}) {
  const [form, setForm] = useState<PersonalForm>(EMPTY_FORM);
  const [refs, setRefs] = useState<CharacterReference[]>([{ ...EMPTY_REF }]);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  const refsRef = useRef(refs);
  const seededToken = useRef<string>("");

  // Keep latest-value refs in sync after commit (never during render).
  useEffect(() => {
    formRef.current = form;
    refsRef.current = refs;
  }, [form, refs]);

  // Seed (and re-seed on `seed` bumps) from the loaded profile — never during
  // silent reloads, so in-flight typing/autosave is never clobbered.
  useEffect(() => {
    if (!profile) return;
    const token = `${seed}`;
    if (seededToken.current === token) return;
    seededToken.current = token;
    setForm(seedForm(profile));
    const list = Array.isArray(profile.characterReferences) ? profile.characterReferences : [];
    setRefs(list.length > 0 ? list.map((r) => ({ ...EMPTY_REF, ...r })) : [{ ...EMPTY_REF }]);
    setSaveState("idle");
  }, [profile, seed]);

  const save = useCallback(
    async (manual: boolean) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setSaveState("saving");
      try {
        const payload: Record<string, string | boolean | CharacterReference[]> = {
          ...formRef.current,
          characterReferences: refsRef.current
            .map((r) => ({
              name: (r.name ?? "").trim(),
              title: (r.title ?? "").trim(),
              company: (r.company ?? "").trim(),
              companyAddress: (r.companyAddress ?? "").trim(),
              email: (r.email ?? "").trim(),
              contact: (r.contact ?? "").trim(),
            }))
            .filter((r) => r.name !== ""), // empty-name rows filtered at save (§7.4)
        };
        await apiFetch("/api/applicant/profile", { method: "PUT", body: payload });
        setSaveState("saved");
        if (manual) {
          toast.success("Profile changes saved");
          await refreshSession();
        }
      } catch (e) {
        setSaveState("error");
        if (manual) toast.error(e instanceof Error ? e.message : "Save failed — please try again");
      }
    },
    [refreshSession]
  );

  /** Re-arm the 1.2 s autosave debounce on every change (§7.4). */
  const touch = useCallback(() => {
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void save(false);
    }, 1200);
  }, [save]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const set = useCallback(
    <K extends keyof PersonalForm>(key: K, value: PersonalForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      touch();
    },
    [touch]
  );

  const identityDone = filledCount(form, IDENTITY_FIELDS);
  const addressDone = filledCount(form, ADDRESS_FIELDS);
  const legalTotal = 2 + (form.adminCase ? 1 : 0) + (form.crimeCharge ? 2 : 0);
  const legalDone =
    2 +
    (form.adminCase && form.adminCaseDetails.trim() !== "" ? 1 : 0) +
    (form.crimeCharge && form.crimeDate.trim() !== "" ? 1 : 0) +
    (form.crimeCharge && form.crimeCaseStatus.trim() !== "" ? 1 : 0);
  const refsNamed = refs.filter((r) => (r.name ?? "").trim() !== "").length;

  const saveIndicator =
    saveState === "saving" ? (
      <span className="inline-flex items-center gap-1.5 text-xs leading-none text-stone">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    ) : saveState === "saved" ? (
      <span className="inline-flex items-center gap-1.5 text-xs leading-none text-[var(--ok)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" aria-hidden="true" /> Saved ✓
      </span>
    ) : saveState === "error" ? (
      <span className="text-xs leading-none text-[var(--bad)]">Save failed — click Save Changes</span>
    ) : saveState === "dirty" ? (
      <span className="text-xs leading-none text-pebble">Unsaved changes</span>
    ) : null;

  return (
    <SectionCard
      icon={UserRound}
      chipTone="slate"
      title="Personal Information"
      description="Changes save automatically as you type."
      actions={
        <div className="flex items-center gap-3">
          {saveIndicator}
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={saveState === "saving"}
            className="dlg-cta min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      }
    >

      {/* Group 1 — Identity */}
      <section className="space-y-4">
        <GroupHeading n="1.1" title="Identity" done={identityDone} total={IDENTITY_FIELDS.length} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="First Name" required value={form.firstName} onChange={(v) => set("firstName", v)} />
          <TextField label="Middle Name" value={form.middleName} onChange={(v) => set("middleName", v)} />
          <TextField label="Last Name" required value={form.lastName} onChange={(v) => set("lastName", v)} />
          <TextField
            label="Extension Name"
            helper="e.g. Jr., Sr., III"
            value={form.extensionName}
            onChange={(v) => set("extensionName", v)}
          />
          <TextField
            label="Email Address"
            required
            type="email"
            helper="Interview invites are sent to this address"
            value={form.emailAddress}
            onChange={(v) => set("emailAddress", v)}
          />
          <TextField
            label="Mobile Number"
            type="tel"
            helper="09XXXXXXXXX"
            value={form.mobileNumber}
            onChange={(v) => set("mobileNumber", v)}
          />
          <TextField label="Secondary Contact No." type="tel" value={form.contactNumber} onChange={(v) => set("contactNumber", v)} />
          <TextField label="Birth Date" type="date" value={form.birthDate} onChange={(v) => set("birthDate", v)} />
          <TextField label="Birth Place" value={form.birthPlace} onChange={(v) => set("birthPlace", v)} />
          <SelectField label="Gender" value={form.gender} options={["Male", "Female"]} onChange={(v) => set("gender", v)} />
          <SelectField
            label="Civil Status"
            value={form.civilStatus}
            options={CIVIL_STATUS_OPTIONS}
            onChange={(v) => set("civilStatus", v)}
          />
          <TextField label="Citizenship" value={form.citizenship} onChange={(v) => set("citizenship", v)} placeholder="Filipino" />
          <TextField label="Ethnicity" value={form.ethnicity} onChange={(v) => set("ethnicity", v)} />
          <SwitchField label="Person with Disability (PWD)" checked={form.isPwd} onChange={(v) => set("isPwd", v)} />
        </div>
      </section>

      {/* Group 2 — Address */}
      <section className="mt-8 space-y-4">
        <GroupHeading n="1.2" title="Address" done={addressDone} total={ADDRESS_FIELDS.length} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Present Address (full)" value={form.presentAddress} onChange={(v) => set("presentAddress", v)} />
          </div>
          <TextField label="House Number" value={form.houseNumber} onChange={(v) => set("houseNumber", v)} />
          <TextField label="Street" value={form.street} onChange={(v) => set("street", v)} />
          <TextField label="Subdivision / Village" value={form.subdivision} onChange={(v) => set("subdivision", v)} />
          <TextField label="Barangay" value={form.barangay} onChange={(v) => set("barangay", v)} />
          <TextField label="City / Municipality" value={form.city} onChange={(v) => set("city", v)} />
          <TextField label="Province" value={form.province} onChange={(v) => set("province", v)} />
          <TextField label="Country" value={form.country} onChange={(v) => set("country", v)} />
          <TextField label="ZIP Code" value={form.zipCode} onChange={(v) => set("zipCode", v)} />
        </div>
      </section>

      {/* Group 3 — Legal Disclosures */}
      <section className="mt-8 space-y-4">
        <GroupHeading n="1.3" title="Legal Disclosures" done={legalDone} total={legalTotal} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SwitchField label="Are you a government employee?" checked={form.isGovernment} onChange={(v) => set("isGovernment", v)} />
          <SwitchField label="Have you been administratively charged?" checked={form.adminCase} onChange={(v) => set("adminCase", v)} />
          {form.adminCase && (
            <div className="sm:col-span-2">
              <Label className={labelCls}>
                Administrative Case Details<span className="text-dusty-rose"> *</span>
              </Label>
              <Textarea
                className={`${inputCls} min-h-[88px]`}
                value={form.adminCaseDetails}
                onChange={(e) => set("adminCaseDetails", e.target.value)}
                placeholder="Briefly describe the case status and particulars"
              />
            </div>
          )}
          <SwitchField label="Have you ever been charged of any crime?" checked={form.crimeCharge} onChange={(v) => set("crimeCharge", v)} />
          {form.crimeCharge && (
            <>
              <TextField label="Date Filed" type="date" value={form.crimeDate} onChange={(v) => set("crimeDate", v)} />
              <TextField label="Case Status" value={form.crimeCaseStatus} onChange={(v) => set("crimeCaseStatus", v)} />
            </>
          )}
        </div>
      </section>

      {/* Group 4 — Character References */}
      <section className="mt-8 space-y-4">
        <GroupHeading n="1.4" title="Character References" done={refsNamed} total={5} />
        <div className="space-y-3">
          {refs.map((r, i) => (
            <RefRow
              key={i}
              index={i}
              reference={r}
              canRemove={refs.length > 1}
              onChange={(patch) => {
                setRefs((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
                touch();
              }}
              onRemove={() => {
                if (refs.length <= 1) {
                  toast.info("At least one character reference row is kept");
                  return;
                }
                setRefs((prev) => prev.filter((_, j) => j !== i));
                touch();
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (refs.length >= 5) {
              toast.info("You can add up to 5 character references");
              return;
            }
            setRefs((prev) => [...prev, { ...EMPTY_REF }]);
            touch();
          }}
          className="dlg-ghost min-h-[44px] w-full py-2.5 text-sm sm:w-auto sm:px-6"
        >
          + Add Character Reference
        </button>
      </section>
    </SectionCard>
  );
}
