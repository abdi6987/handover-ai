import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { I18nProvider, LanguageMenu, LogoutButton } from "@/components/client";
import { DICTS, getLang, getT, langInfo } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Handover AI",
  description: "Move-in and move-out proof, leases, repairs and reports for tenants and owners.",
  appleWebApp: { capable: true, title: "Handover AI" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const lang = await getLang();
  const user = await currentUser();
  return (
    <html lang={lang} dir={langInfo(lang).dir}>
      <body className="min-h-screen antialiased">
        <I18nProvider lang={lang} dict={DICTS[lang]}>
        <header className="no-print sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
            <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 font-bold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-sm text-white">H</span>
              <span>Handover AI</span>
            </Link>
            {user ? (
              <nav className="flex items-center gap-1 text-sm">
                <Link href="/dashboard" className="rounded-lg px-2.5 py-1.5 hover:bg-gray-100">{t(user.account_type === "staff" ? "Jobs" : "Rentals")}</Link>
                {user.account_type === "owner" && <Link href="/dashboard/landlord/maintenance" className="hidden rounded-lg px-2.5 py-1.5 hover:bg-gray-100 sm:inline">{t("Maintenance")}</Link>}
                {user.account_type === "owner" && <Link href="/dashboard/landlord/staff" className="hidden rounded-lg px-2.5 py-1.5 hover:bg-gray-100 sm:inline">{t("Staff")}</Link>}
                <Link href="/inbox" className="rounded-lg px-2.5 py-1.5 hover:bg-gray-100">{t("Emails")}</Link>
                <LanguageMenu />
                <LogoutButton />
              </nav>
            ) : (
              <nav className="flex items-center gap-2 text-sm">
                <LanguageMenu />
                <Link href="/login" className="rounded-lg px-3 py-1.5 hover:bg-gray-100">{t("Log in")}</Link>
                <Link href="/signup" className="btn-primary !py-1.5">{t("Sign up")}</Link>
              </nav>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
