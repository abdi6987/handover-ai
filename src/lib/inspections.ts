import { db, now, tx } from "./db";
import { canonical, sha256 } from "./hash";
import { fullySigned, HttpError, mediaFor, moveInLocked } from "./rentals";
import type { Rental, Role } from "./types";

/**
 * Room-by-room inspections.
 * - Each rental has its own list of rooms, and each room its own checklist (walls, floor, sink...). They start from
 *   sensible defaults and either side can change them until the move-in is sealed.
 * - At move-in and again at move-out, every item gets a rating (good, fair, damaged, or not applicable) and a note.
 * - Both sides then sign the inspection report. A signature covers a fingerprint of every room, rating, note and
 *   photo in it, so the proof page can show if anything changed afterwards.
 * Default room and item names are stored in English and translated when shown; names people type are kept as typed.
 */
export type Stage = "move_in" | "move_out";
export const STAGES: Stage[] = ["move_in", "move_out"];
export const isStage = (s: unknown): s is Stage => s === "move_in" || s === "move_out";

export const CONDITIONS = { good: "Good", fair: "Fair", damaged: "Damaged", na: "Not applicable" } as const;
export type Condition = keyof typeof CONDITIONS;
export const isCondition = (c: unknown): c is Condition => typeof c === "string" && c in CONDITIONS;

export const DEFAULT_ROOMS = ["Living room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom", "Hallway", "Balcony"];
const BASIC = ["Walls", "Floor", "Ceiling", "Doors", "Windows", "Lights and switches", "Power sockets", "Air conditioning"];

/** Checklist a new room starts with, picked from its name (works for typed names in the app's languages too). */
export function defaultItems(room: string): string[] {
  const n = room.toLowerCase();
  if (/kitchen|cuisine|cocina|مطبخ|रसोई|അടുക്കള|باورچی/.test(n))
    return ["Walls", "Floor", "Ceiling", "Windows", "Lights and switches", "Power sockets", "Cabinets and drawers", "Countertops", "Sink and taps", "Stove and oven", "Fridge", "Extractor hood"];
  if (/bath|toilet|wc|shower|salle de bain|baño|حمام|बाथरूम|കുളിമുറി|غسل/.test(n))
    return ["Walls", "Floor", "Ceiling", "Door", "Lights and switches", "Toilet", "Shower or bath", "Sink and taps", "Tiles and grout", "Mirror", "Extractor fan"];
  if (/balcon|terrace|patio|شرفة|बालकनी|ബാൽക്കണി|بالکونی/.test(n))
    return ["Floor", "Walls", "Railings", "Doors", "Lights"];
  if (/hall|entr|corridor|couloir|pasillo|ممر|गलियारा|ഇടനാഴി|راہداری/.test(n))
    return ["Walls", "Floor", "Ceiling", "Front door and locks", "Lights and switches", "Power sockets"];
  if (/bed|chambre|dormitorio|غرفة نوم|बेडरूम|കിടപ്പുമുറി|بیڈروم/.test(n)) return [...BASIC, "Wardrobes"];
  return BASIC;
}

export type Room = { id: number; name: string; position: number; items: { id: number; name: string }[] };
export type Rating = { item_id: number; condition: Condition; note: string | null; rated_by: number; rated_at: string };

/** The rental's rooms and checklists. A rental that has none yet gets the defaults (once, even under concurrency). */
export async function roomsOf(rentalId: number): Promise<Room[]> {
  let rooms = (await db().all("SELECT id, name, position FROM rental_rooms WHERE rental_id = ? ORDER BY position, id", rentalId)) as Omit<Room, "items">[];
  if (!rooms.length) {
    await tx(async () => {
      await db().get("SELECT id FROM rentals WHERE id = ? FOR UPDATE", rentalId);
      const again = (await db().get("SELECT 1 AS x FROM rental_rooms WHERE rental_id = ? LIMIT 1", rentalId)) as { x: number } | undefined;
      if (!again) for (const [i, name] of DEFAULT_ROOMS.entries()) await insertRoom(rentalId, name, i, defaultItems(name));
    });
    rooms = (await db().all("SELECT id, name, position FROM rental_rooms WHERE rental_id = ? ORDER BY position, id", rentalId)) as Omit<Room, "items">[];
  }
  const items = (await db().all("SELECT id, room_id, name FROM checklist_items WHERE rental_id = ? ORDER BY position, id", rentalId)) as { id: number; room_id: number; name: string }[];
  return rooms.map((r) => ({ ...r, items: items.filter((i) => i.room_id === r.id).map(({ id, name }) => ({ id, name })) }));
}

async function insertRoom(rentalId: number, name: string, position: number, items: string[]) {
  const { lastInsertRowid: roomId } = await db().run("INSERT INTO rental_rooms (rental_id, name, position) VALUES (?,?,?)", rentalId, name, position);
  for (const [i, item] of items.entries()) await db().run("INSERT INTO checklist_items (rental_id, room_id, name, position) VALUES (?,?,?,?)", rentalId, roomId, item, i);
  return roomId;
}

/** Rooms and checklists can change until the move-in record is submitted; after that both sides have agreed on them. */
export function roomsEditable(r: Rental) {
  return !moveInLocked(r) && !r.ended_at;
}

export function assertRoomsEditable(r: Rental) {
  if (!roomsEditable(r)) throw new HttpError(400, "The room list is locked once the move-in inspection is submitted");
}

export async function addRoom(r: Rental, name: string) {
  assertRoomsEditable(r);
  const max = (await db().get("SELECT COALESCE(MAX(position), -1) AS p, COUNT(*) AS n FROM rental_rooms WHERE rental_id = ?", r.id)) as { p: number; n: number };
  if (max.n >= 40) throw new HttpError(400, "A property can have up to 40 rooms");
  return insertRoom(r.id, name, max.p + 1, defaultItems(name));
}

/** Replace this rental's rooms with a copy of another rental's (for landlords with many similar units). */
export async function copyRooms(r: Rental, fromRentalId: number) {
  assertRoomsEditable(r);
  const source = await roomsOf(fromRentalId);
  await tx(async () => {
    await db().run("DELETE FROM inspection_ratings WHERE rental_id = ?", r.id);
    await db().run("DELETE FROM checklist_items WHERE rental_id = ?", r.id);
    await db().run("DELETE FROM rental_rooms WHERE rental_id = ?", r.id);
    for (const [i, room] of source.entries()) await insertRoom(r.id, room.name, i, room.items.map((x) => x.name));
  });
}

export async function ratingsOf(rentalId: number, stage: Stage): Promise<Map<number, Rating>> {
  const rows = (await db().all("SELECT item_id, condition, note, rated_by, rated_at FROM inspection_ratings WHERE rental_id = ? AND stage = ?", rentalId, stage)) as Rating[];
  return new Map(rows.map((x) => [x.item_id, x]));
}

export type ReportRow = {
  rental_id: number; stage: Stage; report_hash: string; report: string;
  owner_signed_at: string | null; owner_sign_name: string | null; owner_sign_hash: string | null;
  tenant_signed_at: string | null; tenant_sign_name: string | null; tenant_sign_hash: string | null;
};

export async function reportRow(rentalId: number, stage: Stage) {
  return ((await db().get("SELECT * FROM inspection_reports WHERE rental_id = ? AND stage = ?", rentalId, stage)) as ReportRow | undefined) ?? null;
}

export const reportStarted = (row: ReportRow | null) => !!(row && (row.owner_signed_at || row.tenant_signed_at));
export const reportDone = (row: ReportRow | null) => !!(row && row.owner_signed_at && row.tenant_signed_at);

/** Can ratings (and, for move-out, photos) still change? */
export function ratingsOpen(r: Rental, stage: Stage, row: ReportRow | null) {
  if (stage === "move_in") return !moveInLocked(r);
  return fullySigned(r) && !r.ended_at && !reportStarted(row);
}

/** Why the report can't be signed yet, or null when it can. */
export function signBlocker(r: Rental, stage: Stage, hasContent: boolean): string | null {
  if (!r.owner_id || !r.tenant_id) return "Both the landlord and the tenant need to join first";
  if (stage === "move_in") return r.movein_status === "approved" ? null : "The move-in report can be signed once the landlord approves the move-in inspection";
  if (!fullySigned(r)) return "The move-out report opens once the lease is signed by both sides";
  return hasContent ? null : "Add move-out photos or ratings first";
}

/**
 * What a report signature covers: every room, item, rating and note for the stage, and the fingerprint of every photo
 * and video. For move-in, the photo list is the sealed one.
 */
export async function buildReport(r: Rental, stage: Stage) {
  const rooms = await roomsOf(r.id);
  const ratings = await ratingsOf(r.id, stage);
  const media = await mediaFor(r.id, stage);
  return {
    rental_id: r.id,
    stage,
    property: { name: r.name, address: r.address },
    owner_id: r.owner_id,
    tenant_id: r.tenant_id,
    movein_seal: r.movein_seal,
    rooms: rooms.map((room) => ({
      name: room.name,
      items: room.items.map((it) => {
        const x = ratings.get(it.id);
        return { name: it.name, condition: x?.condition ?? null, note: x?.note ?? null };
      }),
    })),
    files: media.map((m) => ({ id: m.id, room: m.room, name: m.original_name, sha256: m.sha256 })),
  };
}
export type Report = Awaited<ReturnType<typeof buildReport>>;

export const reportHash = (rep: Report) => sha256(canonical(rep));
export const reportSignatureHash = (hash: string, signer: number, name: string, at: string) => sha256(canonical({ report_hash: hash, signer, name, signed_at: at }));

/** The checklist part of the move-in seal: rooms, items and move-in ratings at the moment of approval. */
export async function checklistSnapshot(r: Rental) {
  const rep = await buildReport(r, "move_in");
  return rep.rooms;
}

export const reportHasContent = (rep: Report) => rep.files.length > 0 || rep.rooms.some((x) => x.items.some((i) => i.condition));

/** Sign the report for a stage. The first signature freezes it; the second must match the same fingerprint. */
export async function signReport(r: Rental, stage: Stage, role: Role, userId: number, name: string) {
  return tx(async () => {
    await db().get("SELECT id FROM rentals WHERE id = ? FOR UPDATE", r.id);
    const rep = await buildReport(r, stage);
    const block = signBlocker(r, stage, reportHasContent(rep));
    if (block) throw new HttpError(400, block);
    const hash = reportHash(rep);
    const row = await reportRow(r.id, stage);
    if (row?.[`${role}_signed_at`]) throw new HttpError(400, "You already signed this report");
    if (row && reportStarted(row) && row.report_hash !== hash) throw new HttpError(409, "The report changed after the other side signed it. Reload the page.");
    const at = now();
    const sig = reportSignatureHash(hash, userId, name, at);
    if (!row) await db().run("INSERT INTO inspection_reports (rental_id, stage, report_hash, report) VALUES (?,?,?,?)", r.id, stage, hash, canonical(rep));
    else await db().run("UPDATE inspection_reports SET report_hash = ?, report = ? WHERE rental_id = ? AND stage = ?", hash, canonical(rep), r.id, stage);
    await db().run(`UPDATE inspection_reports SET ${role}_signed_at = ?, ${role}_sign_name = ?, ${role}_sign_hash = ? WHERE rental_id = ? AND stage = ?`, at, name, sig, r.id, stage);
    const after = (await reportRow(r.id, stage))!;
    return { hash, signature: sig, done: reportDone(after) };
  });
}

/** Proof-page checks for the checklist sealed at move-in and for each signed report. */
export async function verifyInspections(r: Rental) {
  const checks: { label: string; ok: boolean; detail?: string; vars?: Record<string, string> }[] = [];
  if (r.movein_manifest) {
    const m = JSON.parse(r.movein_manifest) as { checklist?: unknown };
    if (m.checklist) checks.push({ label: "Move-in room checklist unchanged since approval", ok: canonical(m.checklist) === canonical(await checklistSnapshot(r)) });
  }
  for (const stage of STAGES) {
    const row = await reportRow(r.id, stage);
    if (!row || !reportStarted(row)) continue;
    const current = reportHash(await buildReport(r, stage));
    const stored = sha256(row.report) === row.report_hash;
    checks.push({ label: stage === "move_in" ? "Move-in report unchanged since it was signed" : "Move-out report unchanged since it was signed", ok: stored && current === row.report_hash, detail: row.report_hash.slice(0, 16) });
    for (const side of ["owner", "tenant"] as const) {
      const at = row[`${side}_signed_at`], nm = row[`${side}_sign_name`], h = row[`${side}_sign_hash`];
      const uid = side === "owner" ? r.owner_id : r.tenant_id;
      if (at && nm && h && uid)
        checks.push({
          label: stage === "move_in" ? (side === "owner" ? "Landlord signature on the move-in report is valid" : "Tenant signature on the move-in report is valid")
            : side === "owner" ? "Landlord signature on the move-out report is valid" : "Tenant signature on the move-out report is valid",
          ok: reportSignatureHash(row.report_hash, uid, nm, at) === h,
        });
    }
  }
  return checks;
}

/** When each stage is due: move-in on the lease start date, move-out on the end date (YYYY-MM-DD). */
export function dueDate(r: Rental, stage: Stage) {
  return (stage === "move_in" ? r.start_date : r.end_date)?.slice(0, 10) || null;
}

/** Today's date where the app's users are (Qatar by default), as YYYY-MM-DD. */
export function localDate(d = new Date(), tz = process.env.DISPLAY_TZ || "Asia/Qatar") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Whole days from `today` to `due` (negative when overdue). Both YYYY-MM-DD. */
export function daysBetween(today: string, due: string) {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "Due in 3 days", "Due today", "Overdue by 2 days", in the reader's language. */
export function dueText(days: number, t: (s: string, v?: Record<string, string | number>) => string) {
  if (days > 1) return t("Due in {n} days", { n: days });
  if (days === 1) return t("Due tomorrow");
  if (days === 0) return t("Due today");
  return days === -1 ? t("Overdue by 1 day") : t("Overdue by {n} days", { n: -days });
}
