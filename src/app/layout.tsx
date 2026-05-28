import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/components/i18n-provider";
import { getCurrentUser } from "@/lib/dal";
import { getDictionary } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "UWR Trainer",
  description: "Plan and track team training together.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "UWR Trainer", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const locale = user?.locale ?? DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  return (
    <html lang={locale}>
      <body className="min-h-full">
        <I18nProvider locale={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
