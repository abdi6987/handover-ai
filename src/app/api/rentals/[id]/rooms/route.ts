import { bad, handler, num, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { addRoom, assertRoomsEditable, copyRooms, roomsOf } from "@/lib/inspections";
import { rentalForUser } from "@/lib/rentals";

/** Change the property's room list and checklists. Either side can, until the move-in inspection is submitted. */
export const POST = handler(async (req, user, p) => {
  const { rental } = await rentalForUser(Number(p.id), user);
  assertRoomsEditable(rental);
  const b = await req.json();
  const action = str(b.action);
  const rooms = await roomsOf(rental.id);
  const room = rooms.find((x) => x.id === num(b.room_id));

  if (action === "add_room") {
    const name = str(b.name, 60);
    if (!name) bad("Type a room name");
    if (rooms.some((x) => x.name.toLowerCase() === name.toLowerCase())) bad("There's already a room with that name");
    await addRoom(rental, name);
    await audit(rental.id, user.id, "rooms.edited", { change: "room_added", room: name });
    return;
  }
  if (action === "remove_room") {
    if (!room) bad("Room not found");
    if (rooms.length <= 1) bad("Keep at least one room");
    await db().run("DELETE FROM inspection_ratings WHERE item_id IN (SELECT id FROM checklist_items WHERE room_id = ?)", room.id);
    await db().run("DELETE FROM rental_rooms WHERE id = ? AND rental_id = ?", room.id, rental.id);
    await audit(rental.id, user.id, "rooms.edited", { change: "room_removed", room: room.name });
    return;
  }
  if (action === "add_item") {
    if (!room) bad("Room not found");
    const name = str(b.name, 80);
    if (!name) bad("Type what to check, e.g. 'Curtains'");
    if (room.items.length >= 40) bad("A room can have up to 40 checklist items");
    await db().run("INSERT INTO checklist_items (rental_id, room_id, name, position) VALUES (?,?,?,?)", rental.id, room.id, name, room.items.length);
    await audit(rental.id, user.id, "rooms.edited", { change: "item_added", room: room.name, item: name });
    return;
  }
  if (action === "remove_item") {
    const item = rooms.flatMap((x) => x.items.map((i) => ({ ...i, room: x.name }))).find((i) => i.id === num(b.item_id));
    if (!item) bad("Checklist item not found");
    await db().run("DELETE FROM checklist_items WHERE id = ? AND rental_id = ?", item.id, rental.id);
    await audit(rental.id, user.id, "rooms.edited", { change: "item_removed", room: item.room, item: item.name });
    return;
  }
  if (action === "copy") {
    const from = await rentalForUser(Number(b.from), user);
    if (from.rental.id === rental.id) bad("Pick a different property");
    await copyRooms(rental, from.rental.id);
    await audit(rental.id, user.id, "rooms.edited", { change: "copied", from: from.rental.name });
    return;
  }
  bad("Unknown action");
});
