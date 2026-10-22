import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";

export async function requireAdmin() {
  const ctx = await getSessionProfile();
  if (ctx.profile?.role !== "admin") redirect("/");
  return ctx;
}
