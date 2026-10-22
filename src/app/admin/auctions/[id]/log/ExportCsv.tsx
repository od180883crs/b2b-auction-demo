"use client";

export function ExportCsv({ rows, filename, label }: { rows: string[][]; filename: string; label: string }) {
  function download() {
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const text = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n"); // BOM + ";" — щоб Excel коректно відкрив кирилицю
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }
  return <button onClick={download} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:border-brand hover:text-brand">{label}</button>;
}
