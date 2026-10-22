// Часові пояси без сторонніх бібліотек: усе через Intl.

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "2026-10-25T16:00" у поясі "Asia/Kolkata" → ISO в UTC. */
export function zonedToUtc(local: string, timeZone: string): string {
  const [d, t = "00:00"] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, day, h, min);
  let utc = naive - tzOffsetMs(naive, timeZone);
  utc = naive - tzOffsetMs(utc, timeZone); // друга ітерація — для переходу на літній/зимовий час
  return new Date(utc).toISOString();
}

/** ISO в UTC → "YYYY-MM-DDTHH:mm" у вказаному поясі (для input type=datetime-local). */
export function utcToZonedInput(iso: string, timeZone: string): string {
  const ms = new Date(iso).getTime() + tzOffsetMs(new Date(iso).getTime(), timeZone);
  return new Date(ms).toISOString().slice(0, 16);
}

export function formatDateTime(iso: string, lang: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(lang === "uk" ? "uk-UA" : "en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone, timeZoneName: timeZone ? "short" : undefined,
  }).format(new Date(iso));
}

export function formatMoney(amount: number | string | null, currency: string, lang: string): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat(lang === "uk" ? "uk-UA" : "en-US", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function splitDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export const TIMEZONES = [
  "Europe/Kyiv", "Europe/Warsaw", "Europe/Berlin", "Europe/London", "Europe/Istanbul",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "America/New_York", "UTC",
];

export type AuctionStatus = "upcoming" | "live" | "ended";

export function auctionStatus(a: { starts_at: string; ends_at: string }, nowMs: number): AuctionStatus {
  if (nowMs < new Date(a.starts_at).getTime()) return "upcoming";
  if (nowMs >= new Date(a.ends_at).getTime()) return "ended";
  return "live";
}
