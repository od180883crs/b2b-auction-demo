import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { getDict } from "@/lib/lang-server";
import { formatDateTime, formatMoney } from "@/lib/time";

type BidRow = {
  id: number; amount: number; created_at: string; bulk_id: string | null; lot_id: string;
  lots: { name: string; position: number; leader_id: string | null; current_price: number | null } | null;
  auctions: { id: string; number: number; title: string; currency: string; ends_at: string } | null;
};

export default async function Cabinet() {
  const { supabase, user, profile } = await getSessionProfile();
  if (!user) redirect("/");
  const { lang, d } = await getDict();
  const { data } = await supabase
    .from("bids")
    .select("id, amount, created_at, bulk_id, lot_id, lots(name, position, leader_id, current_price), auctions(id, number, title, currency, ends_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const bids = (data ?? []) as unknown as BidRow[];

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">{d.cabinet}</h1>
        <p className="text-slate-600">{profile?.company} · {profile?.contact_name} · {profile?.email}</p>
      </div>
      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 font-semibold">{d.myBids}</h2>
        {bids.length === 0 ? <p className="p-4 text-slate-500">{d.noBids}</p> : (
          <table className="mt-2 w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">{d.date}</th><th className="px-4 py-2">{d.auctions}</th><th className="px-4 py-2">{d.lot}</th>
                <th className="px-4 py-2 text-right">{d.amount}</th><th className="px-4 py-2">{d.status}</th></tr>
            </thead>
            <tbody>
              {bids.map((b) => {
                const leading = b.lots?.leader_id === user.id && Number(b.lots?.current_price) === Number(b.amount);
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-500">{formatDateTime(b.created_at, lang)}</td>
                    <td className="px-4 py-2"><Link className="text-brand hover:underline" href={`/auction/${b.auctions?.id}`}>№ {b.auctions?.number} {b.auctions?.title}</Link></td>
                    <td className="px-4 py-2">{b.lots?.position}. {b.lots?.name}{b.bulk_id && <span className="ml-1 text-xs text-slate-400">({d.bulk})</span>}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatMoney(b.amount, b.auctions?.currency ?? "USD", lang)}</td>
                    <td className="px-4 py-2">{leading ? <span className="text-emerald-700">{d.youLead}</span> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
