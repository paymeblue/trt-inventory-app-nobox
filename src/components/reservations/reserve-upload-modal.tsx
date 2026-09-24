"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, buttonClass } from "@/components/ui/button";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { SourceBadge } from "@/components/status";
import { apiFetch } from "@/lib/client";
import type { Source } from "@/lib/rbac";
import { cn, plural, qty } from "@/lib/utils";

type Line = { row: number; sku: string; source: Source; name: string; unit: string; quantity: number; project: string; available: number };
type Problem = { row: number | null; column: string | null; message: string };
type Result = { filename: string; applied: boolean; preview: Line[]; errors: Problem[] };

export const RESERVATION_TEMPLATE_URL = "/api/reservations/template";

export function ReserveUploadModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  async function send(f: File, commit: boolean) {
    const form = new FormData();
    form.set("file", f);
    if (commit) form.set("commit", "1");
    return apiFetch<Result>("/api/reservations/import", { method: "POST", body: form });
  }

  async function check(f: File) {
    setFile(f);
    setResult(null);
    setBusy(true);
    try {
      setResult(await send(f, false));
    } catch (err) {
      setResult({ filename: f.name, applied: false, preview: [], errors: [{ row: null, column: null, message: err instanceof Error ? err.message : "Upload failed" }] });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!file) return;
    setBusy(true);
    try {
      const done = await send(file, true);
      if (!done.applied) {
        setResult(done);
        return;
      }
      toast(`${plural(done.preview.length, "reservation")} made from ${done.filename}.`);
      onApplied();
    } catch (err) {
      // Someone else may have reserved the same stock since the check.
      toast(err instanceof Error ? err.message : "Upload failed", "error");
      void check(file);
    } finally {
      setBusy(false);
    }
  }

  const ready = result && !result.errors.length && result.preview.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Reserve from Excel"
      description="One row per material: Material_Code, From (Factory or Nobox), Quantity_Requested, Project_Name, Purpose_Notes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {ready ? (
            <Button onClick={apply} loading={busy}>Reserve {plural(result.preview.length, "item")}</Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void check(f);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
            dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-2/40",
          )}
        >
          <FileSpreadsheet className="h-7 w-7 text-fg-subtle" />
          <p className="text-[14px] font-medium">{file ? file.name : "Drop the filled-in reservation template here"}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={busy && !result}>
              <Upload className="h-4 w-4" /> {file ? "Choose another file" : "Choose file"}
            </Button>
            <a href={RESERVATION_TEMPLATE_URL} className={buttonClass("ghost", "sm")}>
              <Download className="h-4 w-4" /> Download template
            </a>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void check(f);
            }}
          />
        </div>

        {result && result.errors.length ? (
          <div className="overflow-hidden rounded-xl border border-danger/30">
            <div className="flex items-start gap-2.5 bg-danger-soft px-4 py-3 text-[13px] text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p><span className="font-semibold">Nothing was reserved.</span> Fix {result.errors.length === 1 ? "this problem" : `these ${result.errors.length} problems`} and upload again.</p>
            </div>
            <TableWrap className="max-h-72">
              <thead><tr><Th className="w-16">Row</Th><Th className="w-28">Column</Th><Th>Problem</Th></tr></thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <Tr key={i}>
                    <Td className="tabular text-[13px]">{e.row ?? "—"}</Td>
                    <Td className="text-[13px] text-fg-muted">{e.column ?? "—"}</Td>
                    <Td className="text-[13px]">{e.message}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : null}

        {ready ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <p className="flex items-center gap-1.5 border-b border-border bg-ok-soft px-4 py-3 text-[13px] font-semibold text-ok">
              <CheckCircle2 className="h-4 w-4" /> Everything is available
            </p>
            <TableWrap className="max-h-80">
              <thead>
                <tr><Th className="w-14">Row</Th><Th>Item</Th><Th>Project</Th><Th align="right">Reserve</Th><Th align="right">Available</Th></tr>
              </thead>
              <tbody>
                {result.preview.map((l) => (
                  <Tr key={l.row}>
                    <Td className="tabular text-[13px] text-fg-subtle">{l.row}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">{l.name}</span>
                        <SourceBadge source={l.source} />
                      </span>
                      <span className="code text-[11.5px] text-fg-subtle">{l.sku}</span>
                    </Td>
                    <Td className="text-[13px] text-fg-muted">{l.project}</Td>
                    <Td align="right" className="tabular text-[13px] font-semibold">{qty(l.quantity)} {l.unit}</Td>
                    <Td align="right" className="tabular text-[13px] text-fg-muted">{qty(l.available)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
