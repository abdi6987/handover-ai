export type User = { id: number; email: string; name: string; phone: string | null; account_type: "tenant" | "owner"; created_at: string };

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
  ref_id: number | null; room: string | null; title: string | null; kind: "photo" | "video" | "file";
  original_name: string; stored_name: string; mime: string; size: number; sha256: string;
  uploaded_by: number; uploaded_at: string; deleted_at: string | null;
};

export type Issue = {
  id: number; rental_id: number; type: "maintenance" | "damage" | "wear_tear"; room: string | null;
  title: string; description: string;
  status: "reported" | "acknowledged" | "in_progress" | "done" | "disputed";
  reported_by: number; created_at: string; done_at: string | null; done_by: number | null;
  confirmed_at: string | null; confirmed_by: number | null;
};

export type Role = "owner" | "tenant";

export const ROOMS = ["Living room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom", "Hallway", "Balcony", "Other"];
export const ISSUE_TYPES: Record<Issue["type"], string> = {
  maintenance: "Maintenance request",
  damage: "Breakage / damage",
  wear_tear: "Normal wear and tear",
};
export const ISSUE_STATUS: Record<Issue["status"], string> = {
  reported: "Reported",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  done: "Done",
  disputed: "Disputed",
};
export const BILL_CATEGORIES = { electricity: "Electricity", water: "Water", internet: "Internet", other: "Other" } as const;
