"use client";

import * as React from "react";
import Link from "next/link";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { FIELD_LABELS, IMPORT_FIELDS } from "@/lib/import-map";
import { cn } from "@/lib/utils";

type Preview = {
  sheets: string[];
  sheet: string;
  headers: string[];
  mapping: Record<string, string>;
  rows: Record<string, string>[];
  truncated: boolean;
  filename: string;
};

type Result = {
  batchId: string; total: number; created: number; updated: number;
  skipped: number; stockPosted: number; errors: { row: number; message: string }[];
};

const STEPS = ["Upload", "Map columns", "Review"] as const;

export function ImportView() {
  const toast = useToast();
  const { locations } = useLookups();

  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [locationId, setLocationId] = React.useState("");
  const [stockMode, setStockMode] = React.useState<"skip" | "replace" | "add">("replace");
  const [updateExisting, setUpdateExisting] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (locationId || !locations.length) return;
    setLocationId((locations.find((l) => l.kind === "WAREHOUSE") ?? locations[0]).id);
  }, [locations, locationId]);

  async function upload(chosen: File, sheet?: string) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", chosen);
      if (sheet) body.append("sheet", sheet);
      const res = await fetch("/api/import/preview", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not read that file");
      setFile(chosen);
      setPreview(data);
      setMapping(data.mapping);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<Result>("/api/import/commit", {
        method: "POST",
        body: JSON.stringify({
          filename: preview.filename,
          mapping,
          rows: preview.rows,
          locationId: stockMode === "skip" ? null : locationId,
          stockMode,
          updateExisting,
        }),
      });
      setResult(data);
      setStep(2);
      toast(`${data.created} created, ${data.updated} updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(0);
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setError(null);
  }

  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const quantityMapped = mappedFields.has("quantity");
  const canContinue = mappedFields.has("name") || mappedFields.has("sku");

  return (
    <>
      <PageHeader
        title="Import from a spreadsheet"
        description="Upload your existing stock sheet — Excel or CSV — and the catalogue is built from it."
      />

      <div className="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                i === step
                  ? "border-accent bg-accent-soft text-accent"
                  : i < step
                    ? "border-transparent bg-ok-soft text-ok"
                    : "border-border text-fg-subtle",
              )}
            >
              <span className="tabular flex h-4 w-4 items-center justify-center rounded-full bg-current/15 text-[10px]">
                {i < step ? "✓" : i + 1}
              </span>
              {label}
            </div>
            {i < STEPS.length - 1 ? <div className="h-px w-4 shrink-0 bg-border" /> : null}
          </React.Fragment>
        ))}
      </div>

      {error ? (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-[13px] text-danger">{error}</p>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- step 1 */}
      {step === 0 ? (
        <Card>
          <CardBody>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) void upload(dropped);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center transition-colors",
                dragging ? "border-accent bg-accent-soft" : "border-border bg-surface-2/40",
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) void upload(chosen);
                  e.target.value = "";
                }}
              />
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface">
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5 text-fg-subtle" />
                )}
              </div>
              <h3 className="text-[15px] font-semibold">
                {busy ? "Reading your spreadsheet…" : "Drop your stock sheet here"}
              </h3>
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-fg-muted">
                .xlsx, .xls or .csv, up to 10MB. The first sheet is read by default and the header row is
                detected automatically, even when there is a title above it.
              </p>
              <Button className="mt-5" onClick={() => inputRef.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4" /> Choose file
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["Columns are matched for you", "Headers like “Material Code”, “Qty on Hand” or “Reorder Level” are recognised automatically — you can correct any of them."],
                ["Existing materials update", "Rows are matched on SKU. Anything already in the catalogue is updated rather than duplicated."],
                ["Opening stock is posted", "Quantities land in the location you choose and appear in the movement ledger as an auditable entry."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-border bg-surface-2/40 p-3.5">
                  <p className="text-[13px] font-semibold">{title}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">{body}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------- step 2 */}
      {step === 1 && preview ? (
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="Match your columns"
              description={`${preview.rows.length} data rows found in “${preview.sheet}”`}
              action={
                preview.sheets.length > 1 ? (
                  <Select
                    value={preview.sheet}
                    onChange={(e) => file && void upload(file, e.target.value)}
                    className="w-44"
                  >
                    {preview.sheets.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                ) : null
              }
            />
            <CardBody>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {preview.headers.map((header) => {
                  const value = mapping[header] ?? "";
                  const sample = preview.rows.find((r) => r[header])?.[header] ?? "";
                  return (
                    <div
                      key={header}
                      className={cn(
                        "rounded-xl border p-3 transition-colors",
                        value ? "border-accent/40 bg-accent-soft/30" : "border-border bg-surface-2/30",
                      )}
                    >
                      <p className="truncate text-[13px] font-medium" title={header}>{header}</p>
                      <p className="mb-2 mt-0.5 truncate text-[11.5px] text-fg-subtle" title={sample}>
                        {sample ? `e.g. ${sample}` : "no sample data"}
                      </p>
                      <Select
                        value={value}
                        className="h-9 text-[13px]"
                        onChange={(e) =>
                          setMapping((m) => {
                            const next = { ...m };
                            const chosen = e.target.value;
                            // Each field can only come from one column.
                            if (chosen) {
                              for (const k of Object.keys(next)) {
                                if (next[k] === chosen) delete next[k];
                              }
                              next[header] = chosen;
                            } else {
                              delete next[header];
                            }
                            return next;
                          })
                        }
                      >
                        <option value="">Ignore this column</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
              </div>

              {!canContinue ? (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-warn">
                  <AlertTriangle className="h-4 w-4" />
                  Map at least a material name or a SKU column to continue.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Opening stock" description="What to do with the quantity column" />
            <CardBody className="space-y-3">
              {!quantityMapped ? (
                <p className="rounded-lg border border-border bg-surface-2/40 px-3.5 py-3 text-[13px] text-fg-muted">
                  No quantity column is mapped, so only the catalogue records will be created. You can post
                  stock later from the Stock page.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      ["replace", "Set balance", "Make the sheet the source of truth — posts the difference as an adjustment."],
                      ["add", "Add on top", "Treat the quantity as newly received stock."],
                      ["skip", "Ignore quantities", "Import the catalogue only."],
                    ] as const).map(([mode, title, body]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setStockMode(mode)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors",
                          stockMode === mode
                            ? "border-accent bg-accent-soft"
                            : "border-border bg-surface-2/30 hover:border-border-strong",
                        )}
                      >
                        <p className={cn("text-[13px] font-semibold", stockMode === mode && "text-accent")}>
                          {title}
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{body}</p>
                      </button>
                    ))}
                  </div>

                  {stockMode !== "skip" ? (
                    <Field label="Stock belongs to">
                      <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                </>
              )}

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-2/30 p-3">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-[13px] font-medium">Update materials that already exist</span>
                  <span className="block text-[12px] text-fg-muted">
                    Matched on SKU. Leave this off to only add materials that are new.
                  </span>
                </span>
              </label>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Preview" description="First 8 rows as they will be read" />
            <TableWrap>
              <thead>
                <tr>
                  {preview.headers.map((h) => (
                    <Th key={h} className="whitespace-nowrap">
                      <span className="block">{h}</span>
                      {mapping[h] ? (
                        <span className="mt-0.5 block font-normal normal-case tracking-normal text-accent">
                          → {FIELD_LABELS[mapping[h]]}
                        </span>
                      ) : null}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 8).map((row, i) => (
                  <Tr key={i}>
                    {preview.headers.map((h) => (
                      <Td
                        key={h}
                        className={cn(
                          "max-w-[220px] truncate whitespace-nowrap text-[12.5px]",
                          mapping[h] ? "text-fg" : "text-fg-subtle",
                        )}
                      >
                        {row[h] || "—"}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={reset}>
              <ArrowLeft className="h-4 w-4" /> Start over
            </Button>
            <Button onClick={commit} loading={busy} disabled={!canContinue} size="lg">
              Import {preview.rows.length} row{preview.rows.length > 1 ? "s" : ""}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- step 3 */}
      {step === 2 && result ? (
        <div className="space-y-3">
          <Card>
            <CardBody className="flex flex-col items-center py-10 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ok-soft">
                <CheckCircle2 className="h-6 w-6 text-ok" />
              </div>
              <h2 className="text-[19px] tracking-tight">Import complete</h2>
              <p className="mt-1.5 text-[13.5px] text-fg-muted">
                {result.total} row{result.total > 1 ? "s" : ""} processed from your spreadsheet.
              </p>

              <div className="mt-6 grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Created", result.created],
                  ["Updated", result.updated],
                  ["Skipped", result.skipped],
                  ["Stock posted", result.stockPosted],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-border bg-surface-2/40 p-3">
                    <p className="tabular text-[22px] font-semibold leading-none">{String(value)}</p>
                    <p className="mt-1.5 text-[12px] text-fg-muted">{String(label)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap justify-center gap-2">
                <Link href="/products">
                  <Button>View the catalogue</Button>
                </Link>
                <Button variant="secondary" onClick={reset}>Import another sheet</Button>
              </div>
            </CardBody>
          </Card>

          {result.errors.length ? (
            <Card>
              <CardHeader
                title={`${result.errors.length} row${result.errors.length > 1 ? "s" : ""} could not be imported`}
                description="Fix these in the spreadsheet and import again — everything else was saved."
              />
              <CardBody className="max-h-72 space-y-1.5 overflow-y-auto scrollbar-thin">
                {result.errors.map((e) => (
                  <p key={e.row} className="flex gap-2 text-[12.5px]">
                    <span className="tabular shrink-0 text-fg-subtle">Row {e.row}</span>
                    <span className="text-danger">{e.message}</span>
                  </p>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
