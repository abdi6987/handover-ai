export const LANGS = [
  { code: "en", name: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "ar", name: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳", dir: "ltr" },
  { code: "ml", name: "മലയാളം", flag: "🇮🇳", dir: "ltr" },
  { code: "ur", name: "اردو", flag: "🇵🇰", dir: "rtl" },
  { code: "fr", name: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "es", name: "Español", flag: "🇪🇸", dir: "ltr" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export type Dict = Record<string, string>;
export type TFn = (s: string, vars?: Record<string, string | number | null | undefined>) => string;

export function isLang(x: unknown): x is Lang {
  return LANGS.some((l) => l.code === x);
}

/** Look up an English source string; fall back to English when a translation is missing. */
export function makeT(dict: Dict | null): TFn {
  return (s, vars) => {
    let out = dict?.__pseudo ? `⟦${s}⟧` : (dict && dict[s]) || s; // __pseudo: dev check for untranslated text
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v ?? ""));
    return out;
  };
}
