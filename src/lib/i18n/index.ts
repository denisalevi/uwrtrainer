import { dictionaries, en, type Dict, type DictKey } from "./dictionaries";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/constants";

export type { Dict, DictKey };

/** Pick the dictionary for a locale, falling back to the default. */
export function getDictionary(locale: string | undefined | null): Dict {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return dictionaries[l] as unknown as Dict;
}

/** Replace {placeholders} in a template string. */
export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/** Server-side translate: dict + key (+ vars) -> string, with English fallback. */
export function translate(
  dict: Dict,
  key: DictKey,
  vars?: Record<string, string | number>,
): string {
  const template = (dict[key] ?? en[key] ?? key) as string;
  return interpolate(template, vars);
}
