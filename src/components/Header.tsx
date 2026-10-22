"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/server";
import { LANGS } from "@/lib/i18n";
import { useLang } from "./LangProvider";
import { AuthModal } from "./AuthModal";

export function Header({ profile }: { profile: Profile | null }) {
  const { lang, d, setLang } = useLang();
  const router = useRouter();
  const [modal, setModal] = useState<"login" | "register" | null>(null);

  async function logout() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-sm text-white">B2B</span>
          {d.appName}
        </Link>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{d.demoBadge}</span>
        <nav className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {profile?.role === "admin" && <Link href="/admin" className="rounded-md px-3 py-1.5 hover:bg-slate-100">{d.admin}</Link>}
          {profile && <Link href="/cabinet" className="rounded-md px-3 py-1.5 hover:bg-slate-100">{d.cabinet}</Link>}
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            {LANGS.map((l) => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-2 py-1 text-xs font-semibold uppercase ${l === lang ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {l === "uk" ? "UKR" : "ENG"}
              </button>
            ))}
          </div>
          {profile ? (
            <>
              <span className="hidden text-slate-500 sm:inline">{profile.company || profile.email}</span>
              <button onClick={logout} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100">{d.logout}</button>
            </>
          ) : (
            <button onClick={() => setModal("login")} className="rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark">
              {d.login} / {d.register}
            </button>
          )}
        </nav>
      </div>
      {modal && <AuthModal mode={modal} onClose={() => setModal(null)} />}
    </header>
  );
}
