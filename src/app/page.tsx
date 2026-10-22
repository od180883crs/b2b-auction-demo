import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDict } from "@/lib/lang-server";
import { auctionStatus, formatDateTime, formatMoney, type AuctionStatus } from "@/lib/time";
import type { Auction } from "@/lib/types";
import { Countdown, StatusBadge } from "@/components/Countdown";

type Row = Auction & { lots: { start_price: number; current_price: number | null }[] };
const FILTERS: (AuctionStatus | "all")[] = ["all", "live", "upcoming", "ended"];

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "all" } = await searchParams;
  const { lang, d } = await getDict();
  const supabase = await createClient();
  let query = supabase.from("auctions").select("*, lots(start_price, current_price)").order("ends_at", { ascending: true });
  const num = Number(q.replace(/\D/g, ""));
  if (q && num) query = query.eq("number", num);
  const { data } = await query;

  const now = Date.now();
  const order: Record<AuctionStatus, number> = { live: 0, upcoming: 1, ended: 2 };
  const rows = ((data ?? []) as Row[])
    .map((a) => ({ ...a, st: auctionStatus(a, now) }))
    .filter((a) => status === "all" || a.st === status)
    .sort((a, b) => order[a.st] - order[b.st]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-bold">{d.currentTenders}</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder={d.searchLot}
            className="w-56 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
          {status !== "all" && <input type="hidden" name="status" value={status} />}
        </form>
        <div className="flex overflow-hidden rounded-md border border-slate-300 bg-white text-sm">
          {FILTERS.map((f) => (
            <Link key={f} href={`/?status=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`px-3 py-2 ${f === status ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>
              {d[f]}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 && <p className="rounded-lg bg-white p-8 text-center text-slate-500">{d.noTenders}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((a) => {
          const total = a.lots.reduce((s, l) => s + Number(l.current_price ?? l.start_price), 0);
          return (
            <Link key={a.id} href={`/auction/${a.id}`}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">№ {a.number}</span>
                <StatusBadge startsAt={a.starts_at} endsAt={a.ends_at} />
                {a.is_private && <span className="rounded bg-purple-100 px-2 py-0.5 font-semibold text-purple-800">{d.private}</span>}
              </div>
              <h2 className="mb-3 line-clamp-2 font-semibold">{a.title}</h2>
              <dl className="mb-4 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-slate-500">{d.lots}</dt><dd className="text-right">{a.lots.length}</dd>
                <dt className="text-slate-500">{d.bestPrice}</dt><dd className="text-right font-medium">{formatMoney(total, a.currency, lang)}</dd>
                <dt className="text-slate-500">{d.closesAt}</dt><dd className="text-right">{formatDateTime(a.ends_at, lang, a.timezone)}</dd>
              </dl>
              <div className="mt-auto border-t border-slate-100 pt-3 text-sm">
                <Countdown startsAt={a.starts_at} endsAt={a.ends_at} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
