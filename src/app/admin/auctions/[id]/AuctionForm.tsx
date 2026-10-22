"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TIMEZONES, utcToZonedInput, zonedToUtc } from "@/lib/time";
import type { Auction, Lot } from "@/lib/types";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";

type LotDraft = Pick<Lot, "name" | "size" | "steel_grade" | "volume" | "defects"> & { id?: string; start_price: string };

const emptyLot = (): LotDraft => ({ name: "", size: "", steel_grade: "", volume: "", defects: "", start_price: "" });

export function AuctionForm({ auction, lots }: { auction: Auction | null; lots: Lot[] }) {
  const { d } = useLang();
  const toast = useToast();
  const router = useRouter();
  const hasBids = lots.some((l) => l.bid_count > 0);
  const tz0 = auction?.timezone ?? "Europe/Kyiv";
  const [f, setF] = useState({
    title: auction?.title ?? "",
    description: auction?.description ?? "",
    currency: auction?.currency ?? "USD",
    delivery_type: auction?.delivery_type ?? "",
    timezone: tz0,
    starts_at: auction ? utcToZonedInput(auction.starts_at, tz0) : "",
    ends_at: auction ? utcToZonedInput(auction.ends_at, tz0) : "",
    step: String(auction?.step ?? ""),
    anti_snipe_minutes: String(auction?.anti_snipe_minutes ?? 2),
    is_private: auction?.is_private ?? false,
  });
  const [lotRows, setLotRows] = useState<LotDraft[]>(
    lots.length ? lots.map((l) => ({ ...l, start_price: String(l.start_price) })) : [emptyLot()],
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const setLot = (i: number, k: keyof LotDraft, v: string) => setLotRows(lotRows.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    const row = {
      title: f.title, description: f.description, currency: f.currency, delivery_type: f.delivery_type, timezone: f.timezone,
      starts_at: zonedToUtc(f.starts_at, f.timezone), ends_at: zonedToUtc(f.ends_at, f.timezone),
      step: Number(f.step), anti_snipe_minutes: Number(f.anti_snipe_minutes), is_private: f.is_private,
    };
    const res = auction
      ? await supabase.from("auctions").update(row).eq("id", auction.id).select().single()
      : await supabase.from("auctions").insert(row).select().single();
    if (res.error) { setBusy(false); return toast(res.error.message, "error"); }
    const id = (res.data as Auction).id;

    if (!hasBids) {
      const keep = lotRows.filter((l) => l.id).map((l) => l.id!);
      const removed = lots.filter((l) => !keep.includes(l.id)).map((l) => l.id);
      if (removed.length) await supabase.from("lots").delete().in("id", removed);
      const payload = lotRows.map((l, i) => ({
        ...(l.id ? { id: l.id } : {}), auction_id: id, position: i + 1, name: l.name, size: l.size,
        steel_grade: l.steel_grade, volume: l.volume, defects: l.defects, start_price: Number(l.start_price),
      }));
      const upd = await supabase.from("lots").upsert(payload);
      if (upd.error) { setBusy(false); return toast(upd.error.message, "error"); }
    }
    setBusy(false);
    toast(d.saved);
    router.push("/admin");
    router.refresh();
  }

  async function remove() {
    if (!auction) return;
    const { error } = await createClient().from("auctions").delete().eq("id", auction.id);
    if (error) return toast(error.message, "error");
    router.push("/admin");
    router.refresh();
  }

  const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  const label = "mb-1 block text-xs font-medium text-slate-500";
  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm text-slate-500 hover:underline">← {d.back}</Link>
        <h1 className="text-2xl font-bold">{auction ? `${d.edit}: № ${auction.number}` : d.newAuction}</h1>
      </div>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={label}>{d.title}</label><input required className={input} value={f.title} onChange={set("title")} /></div>
        <div className="sm:col-span-2"><label className={label}>{d.description}</label><textarea rows={3} className={input} value={f.description} onChange={set("description")} /></div>
        <div><label className={label}>{d.currency}</label>
          <select className={input} value={f.currency} onChange={set("currency")} disabled={hasBids}>{["USD", "EUR", "UAH"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className={label}>{d.delivery}</label><input className={input} value={f.delivery_type} onChange={set("delivery_type")} placeholder="FCA, DAP…" /></div>
        <div><label className={label}>{d.timezone}</label>
          <select className={input} value={f.timezone} onChange={set("timezone")}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
        <div><label className={label}>{d.step}</label><input required type="number" min="0.01" step="0.01" className={input} value={f.step} onChange={set("step")} disabled={hasBids} /></div>
        <div><label className={label}>{d.startsAt}</label><input required type="datetime-local" className={input} value={f.starts_at} onChange={set("starts_at")} /></div>
        <div><label className={label}>{d.endsAt}</label><input required type="datetime-local" className={input} value={f.ends_at} onChange={set("ends_at")} /></div>
        <div><label className={label}>{d.antiSnipe}, {d.minutes}</label><input type="number" min="0" max="30" className={input} value={f.anti_snipe_minutes} onChange={set("anti_snipe_minutes")} /></div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.is_private} onChange={set("is_private")} />{d.isPrivate}</label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">{d.lots}</h2>
        {hasBids && <p className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">{d.hasBidsWarning}</p>}
        <div className="space-y-2">
          {lotRows.map((l, i) => (
            <div key={l.id ?? `new-${i}`} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1fr_auto]">
              <input required disabled={hasBids} className={input} placeholder={`${d.lot} ${i + 1}`} value={l.name} onChange={(e) => setLot(i, "name", e.target.value)} />
              <input disabled={hasBids} className={input} placeholder={d.size} value={l.size} onChange={(e) => setLot(i, "size", e.target.value)} />
              <input disabled={hasBids} className={input} placeholder={d.steelGrade} value={l.steel_grade} onChange={(e) => setLot(i, "steel_grade", e.target.value)} />
              <input disabled={hasBids} className={input} placeholder={d.volume} value={l.volume} onChange={(e) => setLot(i, "volume", e.target.value)} />
              <input disabled={hasBids} className={input} placeholder={d.defects} value={l.defects} onChange={(e) => setLot(i, "defects", e.target.value)} />
              <input required disabled={hasBids} type="number" min="0.01" step="0.01" className={input} placeholder={d.startPrice} value={l.start_price} onChange={(e) => setLot(i, "start_price", e.target.value)} />
              {!hasBids && lotRows.length > 1 && (
                <button type="button" onClick={() => setLotRows(lotRows.filter((_, j) => j !== i))} className="text-sm text-red-600 hover:underline">{d.removeLot}</button>
              )}
            </div>
          ))}
        </div>
        {!hasBids && (
          <button type="button" onClick={() => setLotRows([...lotRows, emptyLot()])} className="mt-3 text-sm font-medium text-brand hover:underline">+ {d.addLot}</button>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-md bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50">{d.save}</button>
        {auction && !confirmDelete && <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto text-sm text-red-600 hover:underline">{d.delete}</button>}
        {confirmDelete && (
          <span className="ml-auto flex items-center gap-2 text-sm">
            {d.confirmDelete}
            <button type="button" onClick={remove} className="rounded bg-red-600 px-3 py-1 text-white">{d.yes}</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded border px-3 py-1">{d.no}</button>
          </span>
        )}
      </div>
    </form>
  );
}
