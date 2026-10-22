import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../guard";
import { getDict } from "@/lib/lang-server";
import { formatDateTime, formatMoney } from "@/lib/time";
import type { Auction } from "@/lib/types";
import { ExportCsv } from "./ExportCsv";

type Result = { lot_position: number; lot_name: string; start_price: number; final_price: number | null; bid_count: number;
  winner_company: string | null; winner_contact: string | null; winner_email: string | null };
type LogRow = { id: number; amount: number; created_at: string; bulk_id: string | null;
  profiles: { company: string; contact_name: string; email: string } | null; lots: { position: number; name: string } | null };

export default async function AuctionLog({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { lang, d } = await getDict();
  const [{ data: auction }, { data: results }, { data: log }] = await Promise.all([
    supabase.from("auctions").select("*").eq("id", id).maybeSingle(),
    supabase.rpc("auction_results", { p_auction_id: id }),
    supabase.from("bids").select("id, amount, created_at, bulk_id, profiles(company, contact_name, email), lots(position, name)")
      .eq("auction_id", id).order("created_at", { ascending: false }),
  ]);
  if (!auction) notFound();
  const a = auction as Auction;
  const res = (results ?? []) as Result[];
  const rows = (log ?? []) as unknown as LogRow[];
  const money = (v: number | null) => formatMoney(v, a.currency, lang);
  const tz = a.timezone;

  const csv = [
    [d.time + ` (${tz})`, d.lot, d.participant, d.contactName, d.email, d.amount, a.currency, d.bulk],
    ...rows.map((r) => [formatDateTime(r.created_at, lang, tz), `${r.lots?.position}. ${r.lots?.name}`, r.profiles?.company ?? "",
      r.profiles?.contact_name ?? "", r.profiles?.email ?? "", String(r.amount), a.currency, r.bulk_id ? "1" : ""]),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-sm text-slate-500 hover:underline">← {d.back}</Link>
        <h1 className="mr-auto text-2xl font-bold">№ {a.number} · {a.title}</h1>
        <ExportCsv rows={csv} filename={`tender-${a.number}-bids.csv`} label={d.exportCsv} />
      </div>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 font-semibold">{d.results}</h2>
        <table className="mt-2 w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">{d.lot}</th><th className="px-4 py-2 text-right">{d.startPrice}</th><th className="px-4 py-2 text-right">{d.finalPrice}</th>
              <th className="px-4 py-2 text-right">{d.bids}</th><th className="px-4 py-2">{d.winner}</th></tr>
          </thead>
          <tbody>
            {res.map((r) => (
              <tr key={r.lot_position} className="border-t border-slate-100">
                <td className="px-4 py-2">{r.lot_position}. {r.lot_name}</td>
                <td className="px-4 py-2 text-right text-slate-500">{money(r.start_price)}</td>
                <td className="px-4 py-2 text-right font-semibold">{money(r.final_price)}</td>
                <td className="px-4 py-2 text-right">{r.bid_count}</td>
                <td className="px-4 py-2">{r.winner_company ? `${r.winner_company} · ${r.winner_contact} · ${r.winner_email}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 font-semibold">{d.bidLog} ({rows.length})</h2>
        <table className="mt-2 w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">{d.time} ({tz})</th><th className="px-4 py-2">{d.lot}</th><th className="px-4 py-2">{d.participant}</th><th className="px-4 py-2 text-right">{d.amount}</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-500">{formatDateTime(r.created_at, lang, tz)}</td>
                <td className="px-4 py-2">{r.lots?.position}. {r.lots?.name}</td>
                <td className="px-4 py-2">{r.profiles?.company} <span className="text-slate-400">{r.profiles?.email}</span></td>
                <td className="px-4 py-2 text-right font-medium">{money(r.amount)}{r.bulk_id && <span className="ml-1 text-xs text-slate-400">({d.bulk})</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
