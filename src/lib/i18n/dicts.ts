import { isLang, makeT, type Dict, type Lang } from "./langs";
import ar from "./dict/ar";
import hi from "./dict/hi";
import ml from "./dict/ml";
import ur from "./dict/ur";
import fr from "./dict/fr";
import es from "./dict/es";

/** All dictionaries, without anything request-specific, so the background worker can translate too. */
export const DICTS: Record<Lang, Dict | null> = { en: null, ar, hi, ml, ur, fr, es };
(DICTS as Record<string, Dict | null>).xx = { __pseudo: "1" };

/** Translator for a stored language code (e.g. users.lang); unknown codes fall back to English. */
export function tFor(lang: string | null | undefined) {
  return makeT(isLang(lang) ? DICTS[lang] : null);
}
