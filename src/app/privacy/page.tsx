import { LegalPage } from "@/components/legal";
export const metadata = { title: "Privacy policy · Handover AI" };
const POINTS = [
  "We store your name, email, phone number and the files and messages you add, so the app can work and keep the shared record.",
  "Photos, videos, documents and issue reports in a rental are visible to both the tenant and the landlord of that rental. Assigned maintenance staff see only the repair requests they work on.",
  "Your spending tracker is private: only you can see it, never the landlord or staff.",
  "Move-out photos are sent to an AI service (Anthropic's Claude) only to run the comparison you ask for.",
  "We send emails about your rentals. WhatsApp messages are only sent when you tap a WhatsApp button yourself.",
  "We don't sell your data or show ads.",
  "You can ask us to export or delete your account. Records shared with another person in a rental may be kept as evidence for the length of that lease and any dispute.",
];
export default function Privacy() { return <LegalPage title="Privacy policy" points={POINTS} />; }
