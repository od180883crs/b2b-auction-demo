import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getSessionProfile } from "@/lib/supabase/server";
import { getDict } from "@/lib/lang-server";
import { LangProvider } from "@/components/LangProvider";
import { ToastProvider } from "@/components/Toast";
import { Header } from "@/components/Header";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "B2B Торги — демо",
  description: "Демо-проєкт: B2B-платформа аукціонів зі ставками в реальному часі",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ profile }, { lang }] = await Promise.all([getSessionProfile(), getDict()]);
  return (
    <html lang={lang}>
      <body className={`${inter.variable} min-h-screen font-sans antialiased`}>
        <LangProvider lang={lang}>
          <ToastProvider>
            <Header profile={profile} />
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          </ToastProvider>
        </LangProvider>
      </body>
    </html>
  );
}
