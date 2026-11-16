/** Dialling codes for the phone picker. Qatar first, then the Gulf, then common home countries of residents. */
export const COUNTRIES: { iso: string; name: string; dial: string; flag: string }[] = [
  { iso: "QA", name: "Qatar", dial: "974", flag: "🇶🇦" },
  { iso: "SA", name: "Saudi Arabia", dial: "966", flag: "🇸🇦" },
  { iso: "AE", name: "United Arab Emirates", dial: "971", flag: "🇦🇪" },
  { iso: "KW", name: "Kuwait", dial: "965", flag: "🇰🇼" },
  { iso: "BH", name: "Bahrain", dial: "973", flag: "🇧🇭" },
  { iso: "OM", name: "Oman", dial: "968", flag: "🇴🇲" },
  { iso: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { iso: "PK", name: "Pakistan", dial: "92", flag: "🇵🇰" },
  { iso: "BD", name: "Bangladesh", dial: "880", flag: "🇧🇩" },
  { iso: "LK", name: "Sri Lanka", dial: "94", flag: "🇱🇰" },
  { iso: "NP", name: "Nepal", dial: "977", flag: "🇳🇵" },
  { iso: "PH", name: "Philippines", dial: "63", flag: "🇵🇭" },
  { iso: "EG", name: "Egypt", dial: "20", flag: "🇪🇬" },
  { iso: "JO", name: "Jordan", dial: "962", flag: "🇯🇴" },
  { iso: "LB", name: "Lebanon", dial: "961", flag: "🇱🇧" },
  { iso: "SY", name: "Syria", dial: "963", flag: "🇸🇾" },
  { iso: "PS", name: "Palestine", dial: "970", flag: "🇵🇸" },
  { iso: "SD", name: "Sudan", dial: "249", flag: "🇸🇩" },
  { iso: "SO", name: "Somalia", dial: "252", flag: "🇸🇴" },
  { iso: "ET", name: "Ethiopia", dial: "251", flag: "🇪🇹" },
  { iso: "KE", name: "Kenya", dial: "254", flag: "🇰🇪" },
  { iso: "NG", name: "Nigeria", dial: "234", flag: "🇳🇬" },
  { iso: "MA", name: "Morocco", dial: "212", flag: "🇲🇦" },
  { iso: "TN", name: "Tunisia", dial: "216", flag: "🇹🇳" },
  { iso: "DZ", name: "Algeria", dial: "213", flag: "🇩🇿" },
  { iso: "TR", name: "Türkiye", dial: "90", flag: "🇹🇷" },
  { iso: "IR", name: "Iran", dial: "98", flag: "🇮🇷" },
  { iso: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { iso: "FR", name: "France", dial: "33", flag: "🇫🇷" },
  { iso: "ES", name: "Spain", dial: "34", flag: "🇪🇸" },
  { iso: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { iso: "IT", name: "Italy", dial: "39", flag: "🇮🇹" },
  { iso: "US", name: "United States / Canada", dial: "1", flag: "🇺🇸" },
  { iso: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { iso: "ZA", name: "South Africa", dial: "27", flag: "🇿🇦" },
  { iso: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
  { iso: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
  { iso: "CN", name: "China", dial: "86", flag: "🇨🇳" },
];

/** Join a dial code and a local number into "+974 55551234" (an already-international number is kept). */
export function joinPhone(dial: string, local: string): string | null {
  const l = local.replace(/[^\d+]/g, "");
  if (!l) return null;
  if (l.startsWith("+")) return l;
  if (l.startsWith("00")) return "+" + l.slice(2);
  return `+${dial.replace(/\D/g, "")} ${l.replace(/^0+/, "")}`;
}

export const PROPERTY_COUNTS = ["1", "2-5", "6-20", "21-100", "100+"];
