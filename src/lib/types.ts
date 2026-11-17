export type User = { id: number; email: string; name: string; phone: string | null; account_type: "tenant" | "owner" | "staff"; created_at: string; email_verified_at?: string | null; lang?: string | null; whatsapp_reminders?: boolean };

export type Rental = {
  id: number; name: string; address: string;
  owner_id: number | null; tenant_id: number | null; created_by: number;
  rent: number | null; currency: string; deposit: number | null;
  start_date: string | null; end_date: string | null; terms: string;
  movein_status: "open" | "submitted" | "changes_requested" | "approved";
  movein_note: string | null; movein_seal: string | null; movein_manifest: string | null;
  movein_approved_at: string | null; movein_approved_by: number | null;
  owner_signed_at: string | null; owner_sign_name: string | null; owner_sign_hash: string | null;
  tenant_signed_at: string | null; tenant_sign_name: string | null; tenant_sign_hash: string | null;
  ended_at: string | null; created_at: string;
};

export type Media = {
  id: number; rental_id: number; context: "move_in" | "move_out" | "issue" | "document" | "bill";
  ref_id: number | null; room: string | null; title: string | null; kind: "photo" | "video" | "audio" | "file";
  original_name: string; stored_name: string; mime: string; size: number; sha256: string; md5?: string | null;
  uploaded_by: number; uploaded_at: string; deleted_at: string | null;
  preview_name: string | null; preview_mime: string | null; preview_status: "none" | "processing" | "ready" | "failed" | null;
};

export type Issue = {
  id: number; rental_id: number; type: "maintenance" | "damage" | "wear_tear" | "upkeep"; room: string | null;
  title: string; description: string;
  status: "reported" | "acknowledged" | "in_progress" | "done" | "disputed";
  reported_by: number; created_at: string; done_at: string | null; done_by: number | null;
  confirmed_at: string | null; confirmed_by: number | null;
  repair_cost: number | null; cost_note: string | null; assigned_to: number | null;
  category: string | null; urgency: "urgent" | "normal" | "low";
};

export type Staff = { id: number; owner_id: number; user_id: number | null; name: string; email: string | null; phone: string | null; trade: string | null; token: string; created_at: string; accepted_at: string | null; removed_at: string | null };

export type Role = "owner" | "tenant";

export const ROOMS = ["Living room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom", "Hallway", "Balcony", "Other"];
export const ISSUE_TYPES: Record<Issue["type"], string> = {
  maintenance: "Maintenance request",
  damage: "Breakage / damage",
  wear_tear: "Normal wear and tear",
  upkeep: "Routine upkeep",
};
export const ISSUE_STATUS: Record<Issue["status"], string> = {
  reported: "Reported",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  done: "Done",
  disputed: "Disputed",
};
export const BILL_CATEGORIES = { electricity: "Electricity", water: "Water", internet: "Internet", other: "Other" } as const;

/** What the problem is about. Many aren't visible (smell, noise, pests at night), so photos are optional. */
export const ISSUE_CATEGORIES: Record<string, { label: string; icon: string; hint: string }> = {
  leak: { label: "Water leak", icon: "💧", hint: "Where is it dripping or wet? Since when?" },
  plumbing: { label: "Plumbing / drains", icon: "🚰", hint: "Blocked drain, low pressure, no hot water…" },
  smell: { label: "Bad smell", icon: "👃", hint: "What does it smell like (sewage, gas, damp, burning)? Where is it strongest? Constant or at certain times?" },
  mould: { label: "Mould / damp", icon: "🦠", hint: "Where do you see or smell it? Any condensation or wet walls?" },
  pests: { label: "Pests / insects", icon: "🪳", hint: "What kind (cockroaches, ants, mice, bed bugs)? Where and how often do you see them?" },
  ac: { label: "AC / cooling", icon: "❄️", hint: "Not cooling, noisy, leaking, bad smell from vents?" },
  electrical: { label: "Electrical / power", icon: "⚡", hint: "Which sockets or rooms? Any sparks or burning smell? (If dangerous, turn off the breaker.)" },
  lighting: { label: "Lights", icon: "💡", hint: "Which lights? Flickering, dead, or too dim?" },
  noise: { label: "Noise", icon: "🔊", hint: "What kind of noise, from where, and at what times?" },
  appliance: { label: "Appliance", icon: "🧺", hint: "Which appliance and what's wrong?" },
  doors_windows: { label: "Doors, windows, locks", icon: "🚪", hint: "Stuck, broken, not locking, draughty?" },
  structural: { label: "Walls, floors, ceiling", icon: "🧱", hint: "Cracks, holes, loose tiles, peeling paint?" },
  internet: { label: "Internet / TV", icon: "📶", hint: "No connection, slow, building wiring?" },
  safety: { label: "Safety / security", icon: "🚨", hint: "Smoke alarm, gas, broken lock, exposed wires…" },
  other: { label: "Other", icon: "📝", hint: "Describe the problem in your own words." },
};
export const URGENCY = { urgent: "Urgent", normal: "Normal", low: "Low" } as const;
