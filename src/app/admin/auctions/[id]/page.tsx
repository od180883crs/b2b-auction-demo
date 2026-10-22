import { notFound } from "next/navigation";
import { requireAdmin } from "../../guard";
import type { Auction, Lot } from "@/lib/types";
import { AuctionForm } from "./AuctionForm";

export default async function EditAuction({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  if (id === "new") return <AuctionForm auction={null} lots={[]} />;
  const [{ data: auction }, { data: lots }] = await Promise.all([
    supabase.from("auctions").select("*").eq("id", id).maybeSingle(),
    supabase.from("lots").select("*").eq("auction_id", id).order("position"),
  ]);
  if (!auction) notFound();
  return <AuctionForm auction={auction as Auction} lots={(lots ?? []) as Lot[]} />;
}
