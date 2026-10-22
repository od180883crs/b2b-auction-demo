"use client";

import { auctionStatus, splitDuration } from "@/lib/time";
import { useLang } from "./LangProvider";
import { useServerNow } from "./useServerClock";

export function Countdown({ startsAt, endsAt, big = false }: { startsAt: string; endsAt: string; big?: boolean }) {
  const { d } = useLang();
  const now = useServerNow();
  if (now === null) return <span className={`tabular-nums text-slate-300 ${big ? "text-2xl font-bold" : "font-semibold"}`}>--:--:--</span>;
  const status = auctionStatus({ starts_at: startsAt, ends_at: endsAt }, now);
  if (status === "ended") return <span className="font-medium text-slate-500">{d.endedAt}</span>;
  const target = new Date(status === "upcoming" ? startsAt : endsAt).getTime();
  const { d: dd, h, m, s } = splitDuration(target - now);
  const urgent = status === "live" && target - now < 5 * 60_000;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={`tabular-nums ${big ? "text-2xl font-bold" : "font-semibold"} ${urgent ? "text-red-600" : "text-slate-900"}`}>
      <span className={`mr-1 font-normal ${big ? "text-sm" : "text-xs"} text-slate-500`}>{status === "upcoming" ? d.startsIn : d.endsIn}</span>
      {dd > 0 && `${dd}d `}{pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

export function StatusBadge({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const { d } = useLang();
  const now = useServerNow(5000);
  if (now === null) return <span className="invisible rounded px-2 py-0.5 text-xs font-semibold">·</span>;
  const st = auctionStatus({ starts_at: startsAt, ends_at: endsAt }, now);
  const cls = { live: "bg-emerald-100 text-emerald-800", upcoming: "bg-sky-100 text-sky-800", ended: "bg-slate-200 text-slate-600" }[st];
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{d[st]}</span>;
}
