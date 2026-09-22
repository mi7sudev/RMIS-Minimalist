"use client";

// ============================================================================
// RMIS — Profile builder · Section 02 Education (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (no update
// endpoints — §6.3). Course uses a datalist fed from /api/reference courses.
// ============================================================================

import { useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Plus, Trash2 } from "lucide-react";
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
import { apiFetch, humanize } from "@/lib/client";
import { EDUCATION_LEVELS } from "@/lib/constants";
import FormDialog from "./form-dialog";
import type { EducationRow } from "./section-types";

export default function EducationSection({
  items,
  courses,
  onChanged,
}: {
  items: EducationRow[];
  courses: string[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EducationRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const initial = editing
    ? {
        educationLevel: editing.educationLevel ?? "",
        course: editing.course ?? "",
        schoolName: editing.schoolName ?? "",
        yearFrom: editing.yearFrom ?? "",
        yearTo: editing.yearTo ?? "",
        yearGraduated: editing.yearGraduated ?? "",
        unitsEarned: editing.unitsEarned ?? "",
        awards: editing.awards ?? "",
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (editing) await apiFetch(`/api/applicant/educations/${editing.id}`, { method: "DELETE" });
      await apiFetch("/api/applicant/educations", { method: "POST", body: values });
      toast.success(editing ? "Education entry updated" : "Education entry added");
      setOpen(false);
      setEditing(null);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save this entry");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiFetch(`/api/applicant/educations/${id}`, { method: "DELETE" });
      toast.success("Education entry removed");
      setDeleteId(null);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to remove this entry");
    }
  };

  return (
    <div className="dlg-card p-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink">02 · Education</h2>
          <p className="mt-0.5 text-sm text-stone">List your education background, highest first.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="dlg-ghost inline-flex min-h-[44px] w-fit items-center gap-2 px-5 py-2.5 text-sm"
        >
          <Plus className="h-4 w-4" /> Add Education
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-divider p-8 text-center">
          <GraduationCap className="h-6 w-6 text-pebble" />
          <p className="text-sm text-stone">No education entries yet. At least one is required to complete your profile.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="dlg-card-plain rounded-[12px] border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {row.educationLevel ? humanize(row.educationLevel) : "Education entry"}
                    {row.course ? ` — ${row.course}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-stone">
                    {row.schoolName ?? "—"}
                    {row.yearFrom || row.yearTo ? ` · ${row.yearFrom ?? "?"}–${row.yearTo ?? "Ongoing"}` : ""}
                    {row.yearGraduated ? ` · Graduated ${row.yearGraduated}` : ""}
                  </p>
                  {(row.unitsEarned || row.awards) && (
                    <p className="mt-0.5 text-xs text-pebble">
                      {row.unitsEarned ? `Units: ${row.unitsEarned}` : ""}
                      {row.unitsEarned && row.awards ? " · " : ""}
                      {row.awards ? `Honors: ${row.awards}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    className="min-h-[44px] px-3 text-xs font-medium text-stone underline-offset-4 hover:text-ink hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(row.id)}
                    aria-label="Delete education entry"
                    className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-full text-pebble transition-colors hover:bg-dusty-rose/10 hover:text-dusty-rose"
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
        title={editing ? "Edit Education" : "Add Education"}
        description="Entries are saved against your profile for MQR evaluation."
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={[
          {
            key: "educationLevel",
            label: "Education Level",
            type: "select",
            options: EDUCATION_LEVELS.map((l) => ({ value: l, label: l })),
          },
          {
            key: "course",
            label: "Course / Degree",
            type: "datalist",
            datalistId: "course-options",
            datalistOptions: courses,
            placeholder: "Start typing to see suggestions",
          },
          { key: "schoolName", label: "School Name", type: "text", required: true, full: true },
          { key: "yearFrom", label: "Year From", type: "text", placeholder: "YYYY" },
          { key: "yearTo", label: "Year To", type: "text", placeholder: "YYYY" },
          { key: "yearGraduated", label: "Year Graduated", type: "text", placeholder: "YYYY" },
          { key: "unitsEarned", label: "Units Earned", type: "text" },
          { key: "awards", label: "Awards / Honors Received", type: "text", full: true },
        ]}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">Remove this education entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              This permanently removes the entry from your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] border-0 px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) void remove(deleteId);
              }}
              className="min-h-[44px] rounded-full bg-dusty-rose px-5 py-2.5 text-sm font-medium text-white hover:bg-dusty-rose/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
