"use client";

// ============================================================================
// RMIS — Generic entity form dialog for profile sections 02–06 (spec §7.4).
// A field-config driven Dialog: text / date / number / textarea / select /
// switch / checkbox / datalist inputs, with conditional visibility
// (showIf) + conditional disabling (disabledIf, e.g. "currently employed"
// clearing Date to). Submit normalizes: number → number|null, switches →
// boolean, everything else → string. SAVE = delete + recreate is handled by
// the calling section; this dialog only collects values.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FormValue = string | number | boolean | null;

export type FormFieldConfig = {
  key: string;
  label: string;
  /** Dynamic label override computed from the current values (e.g. exam vs conferment wording). */
  labelOf?: (values: Record<string, FormValue>) => string;
  type: "text" | "date" | "number" | "textarea" | "select" | "switch" | "checkbox" | "datalist";
  required?: boolean;
  placeholder?: string;
  helper?: string;
  options?: { value: string; label: string }[];
  datalistId?: string;
  datalistOptions?: string[];
  showIf?: (values: Record<string, FormValue>) => boolean;
  disabledIf?: (values: Record<string, FormValue>) => boolean;
  /** Full-width field in the 2-column grid. */
  full?: boolean;
};

const NONE = "__none__";

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Label className="mb-1.5 block text-xs font-medium text-graphite">
      {label}
      {required && <span className="text-dusty-rose"> *</span>}
    </Label>
  );
}

export default function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  submitLabel = "Save",
  busy = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  fields: FormFieldConfig[];
  initial: Record<string, FormValue | undefined>;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (values: Record<string, FormValue>) => void | Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, FormValue>>({});

  // Seed from `initial` each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const seeded: Record<string, FormValue> = {};
    for (const f of fields) {
      const v = initial[f.key];
      if (f.type === "switch" || f.type === "checkbox") seeded[f.key] = v === true;
      else if (f.type === "number") seeded[f.key] = v == null ? "" : String(v);
      else seeded[f.key] = v == null ? "" : String(v);
    }
    setValues(seeded);
     
  }, [open]);

  const set = (key: string, value: FormValue) =>
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-clear behaviour hooks (e.g. isPresentWork clears dateTo).
      if (key === "isPresentWork" && value === true) next.dateTo = "";
      return next;
    });

  const visible = useMemo(() => fields.filter((f) => !f.showIf || f.showIf(values)), [fields, values]);

  const missingRequired = visible.some((f) => {
    if (!f.required) return false;
    const v = values[f.key];
    if (f.type === "switch" || f.type === "checkbox") return v !== true;
    return typeof v !== "string" || v.trim() === "";
  });

  const submit = async () => {
    const payload: Record<string, FormValue> = {};
    for (const f of visible) {
      const v = values[f.key];
      if (f.type === "number") payload[f.key] = v === "" || v == null ? null : Number(v);
      else payload[f.key] = v;
    }
    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dlg-card-plain max-h-[90vh] w-full overflow-y-auto scroll-thin shadow-e4 sm:max-w-2xl">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="font-display text-2xl text-ink">{title}</DialogTitle>
          {description && <DialogDescription className="text-sm text-stone">{description}</DialogDescription>}
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((f) => {
            const value = values[f.key];
            const disabled = f.disabledIf?.(values) ?? false;
            const label = f.labelOf ? f.labelOf(values) : f.label;
            return (
              <div key={f.key} className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}>
                {f.type !== "switch" && f.type !== "checkbox" && <FieldLabel label={label} required={f.required} />}

                {(f.type === "text" || f.type === "date" || f.type === "number") && (
                  <Input
                    type={f.type}
                    className="dlg-input min-h-[44px]"
                    value={typeof value === "string" ? value : ""}
                    placeholder={f.placeholder}
                    disabled={disabled}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}

                {f.type === "datalist" && (
                  <>
                    <Input
                      type="text"
                      className="dlg-input min-h-[44px]"
                      value={typeof value === "string" ? value : ""}
                      placeholder={f.placeholder}
                      disabled={disabled}
                      list={f.datalistId}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                    <datalist id={f.datalistId}>
                      {(f.datalistOptions ?? []).map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </>
                )}

                {f.type === "textarea" && (
                  <Textarea
                    className="dlg-input min-h-[88px]"
                    value={typeof value === "string" ? value : ""}
                    placeholder={f.placeholder}
                    disabled={disabled}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}

                {f.type === "select" && (
                  <Select
                    value={typeof value === "string" && value !== "" ? value : NONE}
                    onValueChange={(v) => set(f.key, v === NONE ? "" : v)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="dlg-input min-h-[44px] w-full">
                      <SelectValue placeholder={f.placeholder ?? "Select…"} />
                    </SelectTrigger>
                    <SelectContent className="z-[60]">
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                      <SelectItem value={NONE}>
                        <span className="text-pebble">Not specified</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {f.type === "switch" && (
                  <div className="flex min-h-[44px] items-center justify-between rounded-none bg-fog px-3">
                    <span className="text-xs font-medium text-graphite">
                      {label}
                      {f.required && <span className="text-dusty-rose"> *</span>}
                    </span>
                    <Switch checked={value === true} onCheckedChange={(v) => set(f.key, v)} disabled={disabled} />
                  </div>
                )}

                {f.type === "checkbox" && (
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-none bg-fog px-3">
                    <Checkbox checked={value === true} onCheckedChange={(v) => set(f.key, v === true)} disabled={disabled} />
                    <span className="text-xs font-medium text-graphite">{label}</span>
                  </label>
                )}

                {f.helper && <p className="mt-1 text-xs text-pebble">{f.helper}</p>}
              </div>
            );
          })}
        </div>

        <DialogFooter className="mt-2 flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || missingRequired}
            className="dlg-cta min-h-[44px] px-6 py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
