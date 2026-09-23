"use client";

// ============================================================================
// RMIS — Profile builder · Section 03 Work Experience (spec §7.4). Entry
// cards + add/edit dialog + confirm delete. Edits are delete + recreate
// (§6.3). "Currently employed here?" clears/disables Date to.
// Presentation pass: SectionCard shell + header save indicator + functional
// destructive styling (--bad); all save/delete behavior unchanged.
// ============================================================================

import { useState } from "react";
import { toast } from "sonner";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, SectionCard } from "@/components/ui/shell";
import { apiFetch, formatCurrency, humanize } from "@/lib/client";
import { EMPLOYMENT_STATUS_OPTIONS } from "@/lib/constants";
import FormDialog from "./form-dialog";
import { SaveHint, useSavedFlash } from "./save-hint";
import { dateInput, type WorkRow } from "./section-types";

export default function WorkExperienceSection({
  items,
  onChanged,
}: {
  items: WorkRow[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savedFlash, flashSaved] = useSavedFlash();

  const initial = editing
    ? {
        positionTitle: editing.positionTitle ?? "",
        employerName: editing.employerName ?? "",
        statusOfEmployment: editing.statusOfEmployment ?? "",
        employerAddress: editing.employerAddress ?? "",
        dateFrom: dateInput(editing.dateFrom),
        dateTo: dateInput(editing.dateTo),
        isPresentWork: editing.isPresentWork === true,
        monthlySalary: editing.monthlySalary ?? "",
        isGovtService: editing.isGovtService === true,
        actualDuties: editing.actualDuties ?? "",
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (editing) await apiFetch(`/api/applicant/work-experiences/${editing.id}`, { method: "DELETE" });
      await apiFetch("/api/applicant/work-experiences", { method: "POST", body: values });
      toast.success(editing ? "Work experience updated" : "Work experience added");
      setOpen(false);
      setEditing(null);
      flashSaved();
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save this entry");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiFetch(`/api/applicant/work-experiences/${id}`, { method: "DELETE" });
      toast.success("Work experience removed");
      setDeleteId(null);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to remove this entry");
    }
  };

  return (
    <SectionCard
      icon={Briefcase}
      chipTone="amber"
      title="Work Experience"
      description="Relevant roles — dates drive the experience requirement check."
      actions={
        <div className="flex items-center gap-3">
          <SaveHint saving={busy} saved={savedFlash} />
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="dlg-ghost inline-flex min-h-[44px] w-fit items-center gap-2 px-5 py-2.5 text-sm"
          >
            <Plus className="h-4 w-4" /> Add Work Experience
          </button>
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={Briefcase}
          tone="amber"
          title="No work experience yet"
          description="At least one entry is required to complete your profile."
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="dlg-card-plain rounded-none border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {row.positionTitle ?? "—"}
                    {row.employerName ? <span className="text-stone"> · {row.employerName}</span> : null}
                  </p>
                  <p className="num mt-1 text-sm text-stone">
                    {row.statusOfEmployment ? `${humanize(row.statusOfEmployment)} · ` : ""}
                    {row.dateFrom ? new Date(row.dateFrom).toLocaleDateString("en-PH", { month: "short", year: "numeric" }) : "?"}
                    {" – "}
                    {row.isPresentWork || !row.dateTo ? "Present" : new Date(row.dateTo).toLocaleDateString("en-PH", { month: "short", year: "numeric" })}
                    {row.monthlySalary != null ? ` · ${formatCurrency(row.monthlySalary)}` : ""}
                    {row.isGovtService ? " · Government service" : ""}
                  </p>
                  {row.actualDuties && <p className="mt-1 line-clamp-2 text-xs text-pebble">{row.actualDuties}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    className="focus-ring min-h-[44px] px-3 text-xs font-medium text-stone underline-offset-4 hover:text-ink hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(row.id)}
                    aria-label="Delete work experience"
                    className="inline-flex h-[44px] w-[44px] items-center justify-center text-pebble transition-colors hover:bg-[var(--bad)]/10 hover:text-[var(--bad)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        title={editing ? "Edit Work Experience" : "Add Work Experience"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={[
          { key: "positionTitle", label: "Position Title", type: "text", required: true, full: true },
          { key: "employerName", label: "Employer Name", type: "text", required: true, full: true },
          {
            key: "statusOfEmployment",
            label: "Status of Employment",
            type: "select",
            options: EMPLOYMENT_STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
          },
          { key: "employerAddress", label: "Employer Address", type: "text" },
          { key: "dateFrom", label: "Date From", type: "date" },
          {
            key: "dateTo",
            label: "Date To",
            type: "date",
            disabledIf: (v) => v.isPresentWork === true,
            helper: "Cleared while you mark this as your current role",
          },
          { key: "isPresentWork", label: "Currently employed here?", type: "checkbox" },
          { key: "monthlySalary", label: "Monthly Salary (PHP)", type: "number", placeholder: "0" },
          { key: "isGovtService", label: "Government service", type: "switch" },
          { key: "actualDuties", label: "Actual Duties", type: "textarea", placeholder: "Summarize your responsibilities" },
        ]}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">Remove this work experience?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              This permanently removes the entry from your profile and may change your experience-years total.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) void remove(deleteId);
              }}
              className="min-h-[44px] border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-fog"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
