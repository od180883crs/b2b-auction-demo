"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { errorText } from "@/lib/i18n";
import { useLang } from "@/components/LangProvider";

export function JoinClient({ token, loggedIn }: { token: string; loggedIn: boolean }) {
  const { d } = useLang();
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!loggedIn) return;
    createClient().rpc("join_auction", { p_token: token }).then(({ data, error }) => {
      if (error) setError(errorText(d, error.message));
      else router.replace(`/auction/${data}`);
    });
  }, [token, loggedIn, router, d]);
  return (
    <div className="mx-auto max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
      <h1 className="mb-3 text-xl font-bold">{d.joinTitle}</h1>
      <p className={error ? "text-red-600" : "text-slate-600"}>{error || (loggedIn ? d.joining : d.loginToBid)}</p>
    </div>
  );
}
