import { cookies, headers } from "next/headers";
import { cache } from "react";
import { isLang, LANGS, makeT, type Lang } from "./langs";
import { DICTS } from "./dicts";

export { DICTS };

/** Language from the "lang" cookie, else the browser's Accept-Language, else English. */
export const getLang = cache(async (): Promise<Lang> => {
  const c = (await cookies()).get("lang")?.value;
  if (isLang(c)) return c;
  if (c === "xx" && process.env.I18N_DEBUG === "1") return "xx" as Lang;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return "en";
});

export async function getT() {
  return makeT(DICTS[await getLang()]);
}

export function langInfo(code: Lang) {
  return LANGS.find((l) => l.code === code) ?? LANGS[0];
}
