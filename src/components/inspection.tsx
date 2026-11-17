import Link from "next/link";
import { getT } from "@/lib/i18n";
import { db } from "@/lib/db";
import { ActionButton, Form, RatingForm } from "./client";
import { Badge, groupByRoom, MediaGrid } from "./ui";
import { CONDITIONS, daysBetween, dueDate, dueText, localDate, ratingsOf, reportDone, reportRow, reportStarted, roomsEditable, type Room, type Stage } from "@/lib/inspections";
import type { Media, Rental } from "@/lib/types";

const TONE = { good: "green", fair: "amber", damaged: "red", na: "gray" } as const;

/** Room options for the upload box: stored name as the value, translated name as the label. */
export async function roomOptions(rooms: Room[]) {
  const t = await getT();
  return rooms.map((r) => ({ value: r.name, label: t(r.name) }));
}

/**
 * One card per room: its checklist (editable while ratings are open, read-only after) and the photos taken in it.
 * Photos filed under a room that isn't on the list (older uploads) are shown after.
 */
export async function InspectionRooms({ r, stage, rooms, media, names, open, canDelete }: {
  r: Rental; stage: Stage; rooms: Room[]; media: Media[]; names: Map<number, string>; open: boolean; canDelete: (m: Media) => boolean;
}) {
  const t = await getT();
  const ratings = await ratingsOf(r.id, stage);
  const before = stage === "move_out" ? await ratingsOf(r.id, "move_in") : null;
  const byRoom = groupByRoom(media);
  const conditions = Object.entries(CONDITIONS).map(([value, label]) => ({ value, label: t(label) }));
  const total = rooms.reduce((n, x) => n + x.items.length, 0);
  const rated = rooms.reduce((n, x) => n + x.items.filter((i) => ratings.has(i.id)).length, 0);
  const damaged = [...ratings.values()].filter((x) => x.condition === "damaged").length;
  const matched = new Set<string>();
  const cards = rooms.map((room) => {
    const keys = new Set([room.name, t(room.name)]); // older uploads stored the room's translated name
    keys.forEach((k) => matched.add(k));
    return { room, photos: media.filter((m) => keys.has(m.room || "Other")) };
  });
  const others = [...byRoom.entries()].filter(([k]) => !matched.has(k));
  return (
    <div className="space-y-4">
      <div className="card space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">{t("Room-by-room checklist")}</h2>
          <span className="flex gap-2">
            <Badge tone={rated === total && total > 0 ? "green" : "gray"}>{t("{n} of {total} items rated", { n: rated, total })}</Badge>
            {damaged > 0 && <Badge tone="red">{t("{n} damaged", { n: damaged })}</Badge>}
          </span>
        </div>
        <p className="muted">{open ? t("Open each room, rate each item and add a note for anything that isn't perfect. Both sides see every rating, with who made it and when.") : t("These ratings are locked. Open a room to see them.")}</p>
      </div>
      {cards.map(({ room, photos }) => (
        <details key={room.id} className="card group" data-room={room.name}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold"><span className="inline-block transition group-open:rotate-90">▸</span> {t(room.name)} <span className="muted">📷 {photos.length}</span></h3>
            <RoomProgress n={room.items.filter((i) => ratings.has(i.id)).length} total={room.items.length} damaged={room.items.filter((i) => ratings.get(i.id)?.condition === "damaged").length} t={t} />
          </summary>
          <div className="mt-3 space-y-3">
          {room.items.length === 0 ? <p className="muted">{t("No checklist items in this room.")}</p> : open ? (
            <RatingForm rentalId={r.id} stage={stage} conditions={conditions} items={room.items.map((it) => {
              const x = ratings.get(it.id);
              const b = before?.get(it.id);
              return { id: it.id, label: t(it.name), condition: x?.condition ?? null, note: x?.note ?? null, before: b ? t(CONDITIONS[b.condition]) : null };
            })} />
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {room.items.map((it) => {
                const x = ratings.get(it.id);
                const b = before?.get(it.id);
                return (
                  <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>{t(it.name)}{x?.note ? <span className="ms-2 text-gray-600">“{x.note}”</span> : null}</span>
                    <span className="flex items-center gap-2">
                      {b && <span className="text-xs text-gray-500">{t("At move-in: {c}", { c: t(CONDITIONS[b.condition]) })}</span>}
                      {x ? <Badge tone={TONE[x.condition]}>{t(CONDITIONS[x.condition])}</Badge> : <Badge>{t("Not rated")}</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {photos.length > 0 && <MediaGrid media={photos} names={names} canDelete={canDelete} />}
          </div>
        </details>
      ))}
      {others.map(([room, items]) => (
        <section key={room} className="card space-y-3">
          <h3 className="font-semibold">{t(room)} <span className="muted">({items.length})</span></h3>
          <MediaGrid media={items} names={names} canDelete={canDelete} />
        </section>
      ))}
    </div>
  );
}

function RoomProgress({ n, total, damaged, t }: { n: number; total: number; damaged: number; t: (s: string, v?: Record<string, string | number>) => string }) {
  return (
    <span className="flex gap-1.5">
      {damaged > 0 && <Badge tone="red">{t("{n} damaged", { n: damaged })}</Badge>}
      <Badge tone={n === total && total > 0 ? "green" : "gray"}>{n}/{total}</Badge>
    </span>
  );
}

/** Add, remove or copy rooms and checklist items. Shown until the move-in inspection is submitted. */
export async function RoomEditor({ r, rooms, userId }: { r: Rental; rooms: Room[]; userId: number }) {
  if (!roomsEditable(r)) return null;
  const t = await getT();
  const others = (await db().all(
    "SELECT r.id, r.name FROM rentals r WHERE (r.owner_id = ? OR r.tenant_id = ?) AND r.id != ? AND EXISTS (SELECT 1 FROM rental_rooms x WHERE x.rental_id = r.id) ORDER BY r.created_at DESC LIMIT 50",
    userId, userId, r.id,
  )) as { id: number; name: string }[];
  const url = `/api/rentals/${r.id}/rooms`;
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">{t("Edit rooms and checklist")}</summary>
      <div className="mt-3 space-y-4">
        <p className="muted">{t("Match the list to this property. Both sides can change it until the move-in inspection is submitted.")}</p>
        <Form url={url} submitLabel={t("Add room")} extra={{ action: "add_room" }} buttonClass="btn-secondary">
          <input name="name" required maxLength={60} className="input" placeholder={t("Room name, e.g. 'Maid's room' or 'Bedroom 3'")} />
        </Form>
        {others.length > 0 && (
          <Form url={url} submitLabel={t("Copy rooms")} extra={{ action: "copy" }} buttonClass="btn-secondary">
            <label className="label">{t("Or copy the rooms and checklist from another property")}</label>
            <select name="from" className="input" required defaultValue="">
              <option value="" disabled>{t("Pick a property")}</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Form>
        )}
        {rooms.map((room) => (
          <div key={room.id} className="space-y-2 rounded-xl border border-gray-200 p-3" data-edit-room={room.name}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{t(room.name)}</span>
              {rooms.length > 1 && <ActionButton url={url} body={{ action: "remove_room", room_id: room.id }} label={t("Remove room")} className="text-xs font-semibold text-red-700" confirmText={t("Remove this room and its ratings?")} />}
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {room.items.map((it) => (
                <li key={it.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs">
                  {t(it.name)}
                  <ActionButton url={url} body={{ action: "remove_item", item_id: it.id }} label="×" className="font-bold text-gray-500 hover:text-red-700" />
                </li>
              ))}
            </ul>
            <Form url={url} submitLabel={t("Add item")} extra={{ action: "add_item", room_id: String(room.id) }} buttonClass="btn-secondary !py-1.5" className="flex flex-wrap items-start gap-2 space-y-0">
              <input name="name" required maxLength={80} className="input !w-auto flex-1 !py-1.5" placeholder={t("What to check, e.g. 'Curtains'")} />
            </Form>
          </div>
        ))}
      </div>
    </details>
  );
}

/** Link to the stage's report, its signature status and when it's due. */
export async function ReportCard({ r, stage }: { r: Rental; stage: Stage }) {
  const t = await getT();
  const row = await reportRow(r.id, stage);
  const due = dueDate(r, stage);
  const done = reportDone(row);
  const days = due ? daysBetween(localDate(), due) : null;
  const href = `/rentals/${r.id}/report/${stage === "move_in" ? "move-in" : "move-out"}`;
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1">
        <h2 className="h2">{t(stage === "move_in" ? "Move-in report" : "Move-out report")}</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["owner", "tenant"] as const).map((side) => (
            <Badge key={side} tone={row?.[`${side}_signed_at`] ? "green" : "gray"}>
              {t(side === "owner" ? "Landlord" : "Tenant")}: {t(row?.[`${side}_signed_at`] ? "Signed" : "Not signed yet")}
            </Badge>
          ))}
          {!done && days !== null && <Badge tone={days < 0 ? "red" : days <= 3 ? "amber" : "gray"}>{dueText(days, t)}</Badge>}
        </div>
        {reportStarted(row) && !done && <p className="text-xs text-gray-500">{t("The report is frozen while it's being signed.")}</p>}
      </div>
      <Link href={href} className={done ? "btn-secondary" : "btn-primary"}>{t(done ? "View signed report" : "Review and sign the report")}</Link>
    </div>
  );
}
