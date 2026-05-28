import "server-only";
import { getCurrentUser } from "@/lib/dal";
import { getDictionary, translate, type DictKey } from "@/lib/i18n";
import { DEFAULT_LOCALE, type Locale } from "@/lib/constants";

export type ServerT = (key: DictKey, vars?: Record<string, string | number>) => string;

/** Translation helper for server components, using the current user's locale. */
export async function getServerT(): Promise<{ locale: Locale; t: ServerT }> {
  const user = await getCurrentUser();
  const locale = user?.locale ?? DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  return { locale, t: (key, vars) => translate(dict, key, vars) };
}
