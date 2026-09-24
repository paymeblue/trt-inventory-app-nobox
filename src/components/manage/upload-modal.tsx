"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { cn, plural, qty } from "@/lib/utils";

type Change = { row: number; sku: string; name: string; action: "create" | "update"; before: number; delta: number; after: number };
type Problem = { row: number | null; column: string | null; message: string };
type Result = { filename: string; applied: boolean; changes: Change[]; errors: Problem[] };

export const TEMPLATE_URL = "/api/items/template";

export function UploadModal({ source, onClose, onApplied }: { source: Source; onClose: () => void; onApplied: () => void }) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  async function send(f: File, commit: boolean): Promise<Result> {
    const form = new FormData();
    form.set("file", f);
    form.set("source", source);
    if (commit) form.set("commit", "1");
    return apiFetch<Result>("/api/items/import", { method: "POST", body: form });
  }

  async function check(f: File) {
    setFile(f);
    setResult(null);
    setBusy(true);
    try {
      setResult(await send(f, false));
    } catch (err) {
      setResult({ filename: f.name, applied: false, changes: [], errors: [{ row: null, column: null, message: err instanceof Error ? err.message : "Upload failed" }] });
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
        // Stock moved between the check and the apply; show what is wrong now.
        setResult(done);
        return;
      }
      toast(`${plural(done.changes.length, "row")} from ${done.filename} applied to ${SOURCE_LABELS[source]}.`);
      onApplied();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const created = result?.changes.filter((c) => c.action === "create").length ?? 0;
  const updated = (result?.changes.length ?? 0) - created;
  const added = result?.changes.reduce((s, c) => s + Math.max(0, c.delta), 0) ?? 0;
  const removed = result?.changes.reduce((s, c) => s + Math.min(0, c.delta), 0) ?? 0;
  const ready = result && !result.errors.length && result.changes.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Upload to ${SOURCE_LABELS[source]}`}
      description="Quantities in the file are added to what is in stock. Negative numbers remove stock."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {ready ? (
            <Button onClick={apply} loading={busy}>
              Apply {plural(result.changes.length, "row")}
            </Button>
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
          <div>
            <p className="text-[14px] font-medium">{file ? file.name : "Drop the filled-in template here"}</p>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              Only the TRT Nobox template is accepted, with its columns unchanged.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={busy && !result}>
              <Upload className="h-4 w-4" /> {file ? "Choose another file" : "Choose file"}
            </Button>
            <a href={TEMPLATE_URL} className={buttonClass("ghost", "sm")}>
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
            <div className="flex items-start gap-2.5 bg-danger-soft px-4 py-3 text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="text-[13px]">
                <p className="font-semibold">Nothing was uploaded.</p>
                <p className="mt-0.5">Fix {result.errors.length === 1 ? "this problem" : `these ${result.errors.length} problems`} in the file and upload it again.</p>
              </div>
            </div>
            <TableWrap className="max-h-72">
              <thead>
                <tr><Th className="w-16">Row</Th><Th className="w-32">Column</Th><Th>Problem</Th></tr>
              </thead>
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-ok-soft px-4 py-3 text-[13px]">
              <span className="flex items-center gap-1.5 font-semibold text-ok">
                <CheckCircle2 className="h-4 w-4" /> File checks out
              </span>
              <span className="text-fg-muted">{plural(created, "new item")}</span>
              <span className="text-fg-muted">{plural(updated, "existing item")}</span>
              <span className="tabular text-fg-muted">+{qty(added)} / {qty(removed)} units</span>
            </div>
            <TableWrap className="max-h-80">
              <thead>
                <tr>
                  <Th className="w-14">Row</Th>
                  <Th>Item</Th>
                  <Th align="right">Now</Th>
                  <Th align="right">Change</Th>
                  <Th align="right">After</Th>
                </tr>
              </thead>
              <tbody>
                {result.changes.map((c) => (
                  <Tr key={c.row}>
                    <Td className="tabular text-[13px] text-fg-subtle">{c.row}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">{c.name}</span>
                        {c.action === "create" ? <Badge tone="info">new</Badge> : null}
                      </span>
                      <span className="code text-[11.5px] text-fg-subtle">{c.sku}</span>
                    </Td>
                    <Td align="right" className="tabular text-[13px] text-fg-muted">{qty(c.before)}</Td>
                    <Td align="right" className={cn("tabular text-[13px] font-medium", c.delta > 0 ? "text-ok" : c.delta < 0 ? "text-danger" : "text-fg-subtle")}>
                      {c.delta > 0 ? "+" : ""}{qty(c.delta)}
                    </Td>
                    <Td align="right" className="tabular text-[13px] font-semibold">{qty(c.after)}</Td>
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
