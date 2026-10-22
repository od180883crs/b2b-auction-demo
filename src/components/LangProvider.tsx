"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { dicts, type Dict, type Lang } from "@/lib/i18n";

const Ctx = createContext<{ lang: Lang; d: Dict; setLang: (l: Lang) => void }>({
  lang: "uk", d: dicts.uk, setLang: () => {},
});

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const setLang = (l: Lang) => {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return <Ctx.Provider value={{ lang, d: dicts[lang], setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
