import { LegalPage } from "@/components/legal";
export const metadata = { title: "Terms of use · Handover AI" };
const POINTS = [
  "Handover AI is a record-keeping tool for tenants, landlords and their maintenance staff. It is not a party to your lease and does not give legal advice.",
  "You must give true information and only upload photos, videos and documents you have the right to share.",
  "Uploaded files are fingerprinted and timestamped. Approved move-in records and signed leases can't be edited afterwards, so check them before you approve or sign.",
  "AI move-out comparisons are suggestions to help both sides. They can be wrong, and the final decision on any deduction stays with the landlord and tenant under your lease and local law.",
  "Don't use the app to harass anyone, upload illegal content, or try to access rentals you aren't part of. We may close accounts that do.",
  "Keep your password safe. You are responsible for what happens in your account.",
  "We may change these terms. If the change is important we will tell you by email before it applies.",
];
export default function Terms() { return <LegalPage title="Terms of use" points={POINTS} />; }
