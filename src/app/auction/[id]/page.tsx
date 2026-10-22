import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/supabase/server";
import { getDict } from "@/lib/lang-server";
import type { Auction, Lot } from "@/lib/types";
import { LiveAuction } from "./LiveAuction";

export default async function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d } = await getDict();
  const { supabase, user } = await getSessionProfile();
  const [{ data: auction }, { data: lots }, { data: myBids }] = await Promise.all([
    supabase.from("auctions").select("*").eq("id", id).maybeSingle(),
    supabase.from("lots").select("*").eq("auction_id", id).order("position"),
    user ? supabase.from("bids").select("lot_id").eq("auction_id", id).eq("user_id", user.id) : Promise.resolve({ data: [] }),
  ]);
  if (!auction) notFound();
  return (
    <div>
      <Link href="/" className="mb-4 inline-block text-sm text-slate-500 hover:underline">← {d.back}</Link>
      <LiveAuction
        initialAuction={auction as Auction}
        initialLots={(lots ?? []) as Lot[]}
        userId={user?.id ?? null}
        initialMyLots={[...new Set((myBids ?? []).map((b: { lot_id: string }) => b.lot_id))]}
      />
    </div>
  );
}
