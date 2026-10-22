"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errorText } from "@/lib/i18n";
import { auctionStatus, formatDateTime, formatMoney } from "@/lib/time";
import type { Auction, Lot } from "@/lib/types";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import { Countdown, StatusBadge } from "@/components/Countdown";
import { useServerNow } from "@/components/useServerClock";

const minNext = (l: Lot, step: number) => (l.current_price === null ? Number(l.start_price) : Number(l.current_price) + Number(step));

export function LiveAuction({ initialAuction, initialLots, userId, initialMyLots }: {
  initialAuction: Auction; initialLots: Lot[]; userId: string | null; initialMyLots: string[];
}) {
  const { lang, d } = useLang();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [auction, setAuction] = useState(initialAuction);
  const [lots, setLots] = useState(initialLots);
  const [myLots, setMyLots] = useState(new Set(initialMyLots));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const now = useServerNow();
  const status = now === null ? null : auctionStatus(auction, now);
  const money = (v: number | null) => formatMoney(v, auction.currency, lang);

  useEffect(() => {
    const channel = supabase
      .channel(`auction-${auction.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lots", filter: `auction_id=eq.${auction.id}` },
        (p) => {
          const l = p.new as Lot;
          setLots((xs) => xs.map((x) => (x.id === l.id ? l : x)));
          setFlash((f) => ({ ...f, [l.id]: Date.now() }));
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${auction.id}` },
        (p) => {
          const a = p.new as Auction;
          setAuction((prev) => {
            if (new Date(a.ends_at) > new Date(prev.ends_at) && auctionStatus(prev, Date.now()) === "live") toast(d.extended);
            return { ...prev, ...a };
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, auction.id, d.extended, toast]);

  async function bid(lot: Lot, amount: number) {
    setBusy(lot.id);
    const { data, error } = await supabase.rpc("place_bid", { p_lot_id: lot.id, p_amount: amount });
    setBusy(null);
    if (error) return toast(errorText(d, error.message), "error");
    setLots((xs) => xs.map((x) => (x.id === lot.id ? (data as Lot) : x)));
    setMyLots((s) => new Set(s).add(lot.id));
    setAmounts((a) => ({ ...a, [lot.id]: "" }));
    toast(`${d.bidPlaced}: ${money(amount)}`);
  }

  async function bidAll() {
    setBusy("all");
    const { data, error } = await supabase.rpc("place_bulk_bid", { p_auction_id: auction.id });
    setBusy(null);
    if (error) return toast(errorText(d, error.message), "error");
    const { data: fresh } = await supabase.from("lots").select("*").eq("auction_id", auction.id).order("position");
    if (fresh) {
      setLots(fresh as Lot[]);
      setMyLots((s) => new Set([...s, ...(fresh as Lot[]).filter((l) => l.leader_id === userId).map((l) => l.id)]));
    }
    toast(`${d.bulkPlaced}${data}`);
  }

  const canBid = !!userId && status === "live";
  const total = lots.reduce((s, l) => s + Number(l.current_price ?? l.start_price), 0);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono">№ {auction.number}</span>
          <StatusBadge startsAt={auction.starts_at} endsAt={auction.ends_at} />
          {auction.is_private && <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">{d.private}</span>}
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <div className="mr-auto max-w-2xl">
            <h1 className="mb-2 text-2xl font-bold">{auction.title}</h1>
            {auction.description && <p className="whitespace-pre-line text-slate-600">{auction.description}</p>}
          </div>
          <div className="rounded-lg bg-slate-50 p-4 text-right">
            <Countdown big startsAt={auction.starts_at} endsAt={auction.ends_at} />
            <p className="mt-1 text-sm text-slate-600">{d.closesAt}: {formatDateTime(auction.ends_at, lang, auction.timezone)}</p>
            {now !== null && <p className="text-xs text-slate-400">{formatDateTime(auction.ends_at, lang)} ({d.yourTime})</p>}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Info label={d.currency} value={auction.currency} />
          <Info label={d.step} value={money(auction.step)} />
          <Info label={d.delivery} value={auction.delivery_type || "—"} />
          <Info label={d.antiSnipe} value={auction.anti_snipe_minutes ? `${auction.anti_snipe_minutes} ${d.minutes}` : "—"} />
        </dl>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{d.lot}</th>
              <th className="px-4 py-3">{d.size} / {d.steelGrade}</th>
              <th className="px-4 py-3">{d.volume}</th>
              <th className="px-4 py-3">{d.defects}</th>
              <th className="px-4 py-3 text-right">{d.startPrice}</th>
              <th className="px-4 py-3 text-right">{d.bestPrice}</th>
              <th className="px-4 py-3">{d.yourStatus}</th>
              <th className="px-4 py-3">{d.bid}</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const leading = userId && l.leader_id === userId;
              const outbid = userId && !leading && myLots.has(l.id);
              const min = minNext(l, auction.step);
              const fresh = flash[l.id] && Date.now() - flash[l.id] < 1500;
              return (
                <tr key={l.id} className={`border-t border-slate-100 transition-colors ${fresh ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3 font-medium">{l.position}. {l.name}</td>
                  <td className="px-4 py-3 text-slate-600">{[l.size, l.steel_grade].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{l.volume || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{l.defects || "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{money(l.start_price)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold">{l.current_price === null ? d.noBidYet : money(l.current_price)}</span>
                    <span className="block text-xs text-slate-400">{d.bids}: {l.bid_count}</span>
                  </td>
                  <td className="px-4 py-3">
                    {leading && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{d.youLead}</span>}
                    {outbid && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{d.outbid}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {canBid && !leading ? (
                      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); bid(l, Number(amounts[l.id] || min)); }}>
                        <input type="number" step="0.01" min={min} placeholder={String(min)} value={amounts[l.id] ?? ""}
                          onChange={(e) => setAmounts({ ...amounts, [l.id]: e.target.value })}
                          className="w-28 rounded-md border border-slate-300 px-2 py-1" />
                        <button disabled={busy !== null} className="rounded-md bg-brand px-3 py-1 font-medium text-white hover:bg-brand-dark disabled:opacity-50">
                          {amounts[l.id] ? d.bid : d.bidStep}
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <td colSpan={5} className="px-4 py-3 text-right text-slate-500">{d.bestPrice}:</td>
              <td className="px-4 py-3 text-right font-bold">{money(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </section>

      {canBid ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-blue-50 p-4">
          <button onClick={bidAll} disabled={busy !== null}
            className="rounded-md bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {d.bidAll}
          </button>
          <p className="text-sm text-slate-600">{d.bidAllHint}</p>
        </div>
      ) : !userId && status === "live" ? (
        <p className="rounded-xl bg-white p-4 text-center text-slate-600">{d.loginToBid}</p>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
