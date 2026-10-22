"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { errorText } from "@/lib/i18n";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";
import { useLang } from "./LangProvider";

type Mode = "login" | "register" | "reset";

export function AuthModal({ mode: initial, onClose }: { mode: Mode; onClose: () => void }) {
  const { d } = useLang();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ email: "", password: "", company: "", contact_name: "", phone: "", offer: false, privacy: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true); setError(""); setInfo("");
    const { error } = await fn();
    setBusy(false);
    if (error) return setError(error.message);
    if (mode === "reset") return setInfo(d.resetSent);
    onClose();
    router.refresh();
  }

  const supabase = createClient();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") return run(() => supabase.auth.signInWithPassword({ email: f.email, password: f.password }));
    if (mode === "reset") return run(() => supabase.auth.resetPasswordForEmail(f.email));
    return run(() => supabase.auth.signUp({
      email: f.email, password: f.password,
      options: { data: { company: f.company, contact_name: f.contact_name, phone: f.phone } },
    }));
  };
  const demo = (email: string) => run(() => supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD }));

  const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="mb-4 flex gap-4 border-b border-slate-200">
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); setInfo(""); }}
              className={`-mb-px border-b-2 pb-2 text-sm font-medium ${mode === m ? "border-brand text-brand" : "border-transparent text-slate-500"}`}>
              {d[m]}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input className={input} type="email" required placeholder={d.email} value={f.email} onChange={set("email")} />
          {mode !== "reset" && (
            <input className={input} type="password" required minLength={6} placeholder={d.password} value={f.password} onChange={set("password")} />
          )}
          {mode === "register" && (
            <>
              <input className={input} required placeholder={d.company} value={f.company} onChange={set("company")} />
              <input className={input} required placeholder={d.contactName} value={f.contact_name} onChange={set("contact_name")} />
              <input className={input} required type="tel" placeholder={d.phone} value={f.phone} onChange={set("phone")} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" required checked={f.offer} onChange={set("offer")} />{d.agreeOffer}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" required checked={f.privacy} onChange={set("privacy")} />{d.agreePrivacy}</label>
            </>
          )}
          {error && <p className="text-sm text-red-600">{errorText(d, error)}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          <button disabled={busy} className="w-full rounded-md bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {mode === "reset" ? d.forgotPassword : d[mode]}
          </button>
          {mode === "login" && (
            <button type="button" onClick={() => setMode("reset")} className="text-sm text-slate-500 hover:underline">{d.forgotPassword}</button>
          )}
        </form>
        {DEMO_PASSWORD && mode !== "reset" && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{d.demoLogin}</p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} disabled={busy} onClick={() => demo(a.email)}
                  className="rounded-md border border-slate-300 px-2 py-2 text-xs hover:border-brand hover:text-brand">
                  {d[a.key]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
