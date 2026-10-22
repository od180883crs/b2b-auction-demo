import Link from "next/link";
import { requireAdmin } from "./guard";
import { getDict } from "@/lib/lang-server";
import { formatDateTime } from "@/lib/time";
import type { Auction } from "@/lib/types";
import { StatusBadge } from "@/components/Countdown";
import { AdminRowActions } from "./AdminRowActions";

type Row = Auction & { lots: { bid_count: number }[] };

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { lang, d } = await getDict();
  const { data } = await supabase.from("auctions").select("*, lots(bid_count)").order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">{d.admin}: {d.auctions}</h1>
        <Link href="/admin/auctions/new" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">+ {d.newAuction}</Link>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">№</th><th className="px-4 py-3">{d.title}</th><th className="px-4 py-3">{d.status}</th>
              <th className="px-4 py-3">{d.endsAt}</th><th className="px-4 py-3 text-right">{d.lots}</th><th className="px-4 py-3 text-right">{d.bids}</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-slate-500">{a.number}</td>
                <td className="px-4 py-3">
                  <Link href={`/auction/${a.id}`} className="font-medium hover:text-brand">{a.title}</Link>
                  {a.is_private && <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">{d.private}</span>}
                </td>
                <td className="px-4 py-3"><StatusBadge startsAt={a.starts_at} endsAt={a.ends_at} /></td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(a.ends_at, lang, a.timezone)}</td>
                <td className="px-4 py-3 text-right">{a.lots.length}</td>
                <td className="px-4 py-3 text-right">{a.lots.reduce((s, l) => s + l.bid_count, 0)}</td>
                <td className="px-4 py-3"><AdminRowActions auction={a} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
