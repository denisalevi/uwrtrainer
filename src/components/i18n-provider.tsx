"use client";

import { createContext, useContext, useMemo } from "react";
import { en, type Dict, type DictKey } from "@/lib/i18n/dictionaries";
import { interpolate } from "@/lib/i18n";
import type { Locale } from "@/lib/constants";

type TFn = (key: DictKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<{ locale: Locale; t: TFn }>({
  locale: "en",
  t: (key) => String(key),
});

/**
 * Holds the active dictionary (passed from the server, which reads the user's
 * locale) and exposes a `t()` helper to client components via `useT()`.
 */
export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const t: TFn = (key, vars) =>
      interpolate((dict[key] ?? en[key] ?? key) as string, vars);
    return { locale, t };
  }, [locale, dict]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}
