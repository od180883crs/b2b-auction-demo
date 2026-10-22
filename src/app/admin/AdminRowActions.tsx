"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { errorText } from "@/lib/i18n";
import type { Auction } from "@/lib/types";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";

export function AdminRowActions({ auction }: { auction: Auction }) {
  const { d } = useLang();
  const toast = useToast();
  const router = useRouter();

  async function copyAuction() {
    const { data, error } = await createClient().rpc("copy_auction", { p_auction_id: auction.id });
    if (error) return toast(errorText(d, error.message), "error");
    router.push(`/admin/auctions/${data}`);
  }

  async function copyLink() {
    const path = auction.is_private ? `/join/${auction.invite_token}` : `/auction/${auction.id}`;
    await navigator.clipboard.writeText(window.location.origin + path);
    toast(d.linkCopied);
  }

  const btn = "rounded-md border border-slate-300 px-2 py-1 text-xs hover:border-brand hover:text-brand";
  return (
    <div className="flex justify-end gap-1">
      <Link href={`/admin/auctions/${auction.id}`} className={btn}>{d.edit}</Link>
      <button onClick={copyAuction} className={btn}>{d.copy}</button>
      <button onClick={copyLink} className={btn}>{d.copyLink}</button>
      <Link href={`/admin/auctions/${auction.id}/log`} className={btn}>{d.log}</Link>
    </div>
  );
}
