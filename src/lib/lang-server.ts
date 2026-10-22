import { cookies } from "next/headers";
import { dicts, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("lang")?.value;
  return v === "en" ? "en" : "uk";
}

export async function getDict() {
  const lang = await getLang();
  return { lang, d: dicts[lang] };
}
