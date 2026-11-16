import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import { db } from "./db";
import { audit } from "./audit";
import { framesFor, type Frame } from "./video";
import { issuesFor, mediaFor } from "./rentals";
import { notifyUser } from "./notify";
import { ISSUE_STATUS, ISSUE_TYPES, type Media, type Rental } from "./types";

export const AI_MODEL = "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["room_summary", "findings"],
  properties: {
    room_summary: { type: "string", description: "One or two sentences on the overall condition change in this room." },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "severity", "classification", "confidence", "before_images", "after_images", "related_issue_id"],
        properties: {
          title: { type: "string" },
          description: { type: "string", description: "What changed, where exactly, and what in the images shows it." },
          severity: { type: "string", enum: ["minor", "moderate", "major"] },
          classification: { type: "string", enum: ["new_damage", "reported_during_lease", "wear_and_tear", "cleaning", "unclear"] },
          confidence: { type: "number", description: "0 to 1" },
          before_images: { type: "array", items: { type: "integer" }, description: "Numbers of the BEFORE images that show this spot." },
          after_images: { type: "array", items: { type: "integer" }, description: "Numbers of the AFTER images that show this spot." },
          related_issue_id: { anyOf: [{ type: "integer" }, { type: "null" }], description: "ID of the matching issue report, if one exists." },
        },
      },
    },
  },
} as const;

type RoomResult = {
  room_summary: string;
  findings: { title: string; description: string; severity: string; classification: string; confidence: number; before_images: number[]; after_images: number[]; related_issue_id: number | null }[];
};

const SYSTEM = `You are a careful, neutral property inspector comparing a rental apartment's move-in condition (BEFORE, approved and sealed by both sides) with its move-out condition (AFTER).

Your report is used by an owner and a tenant to settle the security deposit, so fairness matters more than finding something:
- Only report a difference you can actually see in the images. Do not guess about areas that aren't visible in both sets; mention missing coverage in the room summary instead.
- Ignore differences caused by lighting, camera angle, zoom, image quality, or furniture/belongings being moved.
- Distinguish real damage (breaks, holes, burns, stains, missing items, deep scratches) from normal wear and tear expected from ordinary living (light scuffs, minor fading, small nail holes) and from cleaning issues.
- You'll get the issue reports logged during the lease. If a finding matches an issue the tenant or owner reported, set classification to "reported_during_lease" (or "wear_and_tear" if that's how it was reported) and give its ID. Issues marked Done were repaired; if the spot now looks fine, don't report it.
- If nothing changed, return an empty findings list.`;

function imageBlocks(label: string, frames: Frame[], media: Map<number, Media>): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  frames.forEach((f, i) => {
    const m = media.get(f.mediaId)!;
    blocks.push({ type: "text", text: `${label} image ${i + 1}: ${m.kind === "video" ? `frame at ${f.t}s of video` : "photo"} "${m.original_name}", uploaded ${m.uploaded_at}` });
    blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(f.jpegPath).toString("base64") } });
  });
  return blocks;
}

async function compareRoom(client: Anthropic, rental: Rental, room: string, before: Media[], after: Media[]) {
  const [bf, af] = await Promise.all([framesFor(before), framesFor(after)]);
  const byId = new Map([...before, ...after].map((m) => [m.id, m]));
  const issues = issuesFor(rental.id).filter((i) => !i.room || i.room.toLowerCase() === room.toLowerCase());
  const issueText = issues.length
    ? issues.map((i) => `#${i.id} [${ISSUE_TYPES[i.type]}${i.category ? `/${i.category}` : ""}, ${ISSUE_STATUS[i.status]}${i.done_at ? ` on ${i.done_at.slice(0, 10)}` : ""}] reported ${i.created_at.slice(0, 10)} by ${i.reporter_name}${i.room ? ` in ${i.room}` : ""}: ${i.title}. ${i.description}`).join("\n")
    : "None.";
  if (!bf.length || !af.length) {
    return { room, frames: { before: bf, after: af }, result: { room_summary: !bf.length ? "No sealed move-in photos of this room to compare against." : "No usable move-out images for this room.", findings: [] } as RoomResult };
  }
  const response = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `Rental: ${rental.name}, ${rental.address}. Room: ${room}.\n\nIssue reports logged during the lease for this room:\n${issueText}` },
        ...imageBlocks("BEFORE (move-in)", bf, byId),
        ...imageBlocks("AFTER (move-out)", af, byId),
        { type: "text", text: `Compare the AFTER images of the ${room} against the BEFORE images and report what changed.` },
      ],
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to analyse this room's images");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Empty AI response");
  return { room, frames: { before: bf, after: af }, result: JSON.parse(text.text) as RoomResult };
}

function demoRoom(room: string, bf: Frame[], af: Frame[]): RoomResult {
  return {
    room_summary: `DEMO RESULT (no Anthropic API key configured): ${room} was not actually analysed.`,
    findings: bf.length && af.length ? [{ title: "Example finding", description: "This is placeholder text so you can try the review flow. Add ANTHROPIC_API_KEY to get a real comparison.", severity: "minor", classification: "unclear", confidence: 0, before_images: [1], after_images: [1], related_issue_id: null }] : [],
  };
}

/** Run a full move-out vs move-in comparison and store the items. Called in the background. */
export async function runComparison(comparisonId: number, rental: Rental, actorId: number) {
  const d = db();
  try {
    const sealedIds = new Set((JSON.parse(rental.movein_manifest || "{\"files\":[]}") as { files: { id: number }[] }).files.map((f) => f.id));
    const before = mediaFor(rental.id, "move_in").filter((m) => sealedIds.has(m.id) && m.kind !== "file");
    const after = mediaFor(rental.id, "move_out").filter((m) => m.kind !== "file");
    const rooms = [...new Set(after.map((m) => m.room || "Other"))];
    const demo = !process.env.ANTHROPIC_API_KEY;
    if (demo && process.env.AI_DEMO !== "1") throw new Error("AI comparison isn't set up yet: add an ANTHROPIC_API_KEY to the server settings.");
    const client = demo ? null : new Anthropic();
    const results: { room: string; frames: { before: Frame[]; after: Frame[] }; result: RoomResult }[] = [];
    for (const room of rooms) {
      const b = before.filter((m) => (m.room || "Other").toLowerCase() === room.toLowerCase());
      const a = after.filter((m) => (m.room || "Other").toLowerCase() === room.toLowerCase());
      if (client) results.push(await compareRoom(client, rental, room, b, a));
      else {
        const [bf, af] = await Promise.all([framesFor(b, 2), framesFor(a, 2)]);
        results.push({ room, frames: { before: bf, after: af }, result: demoRoom(room, bf, af) });
      }
    }
    const ref = (frames: Frame[], nums: number[]) => JSON.stringify(nums.map((n) => frames[n - 1]).filter(Boolean).map((f) => ({ media_id: f.mediaId, t: f.t })));
    const insert = d.prepare(`INSERT INTO comparison_items (comparison_id, room, title, description, severity, classification, confidence, before_media, after_media, related_issue_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let count = 0;
    const summary = results.map((r) => `${r.room}: ${r.result.room_summary}`).join("\n");
    d.transaction(() => {
      for (const r of results) for (const f of r.result.findings) {
        insert.run(comparisonId, r.room, f.title, f.description, f.severity, f.classification, f.confidence, ref(r.frames.before, f.before_images), ref(r.frames.after, f.after_images), f.related_issue_id);
        count++;
      }
      d.prepare("UPDATE comparisons SET status='done', summary=?, model=?, demo=? WHERE id=?").run(summary, demo ? "demo" : AI_MODEL, demo ? 1 : 0, comparisonId);
    })();
    audit(rental.id, actorId, "comparison.completed", { comparison_id: comparisonId, rooms, findings: count, model: demo ? "demo" : AI_MODEL });
    const path = `/rentals/${rental.id}/move-out`;
    for (const uid of [rental.owner_id, rental.tenant_id])
      await notifyUser(uid, `Move-out AI report ready: "${rental.name}"`, `The AI compared the move-out photos with the sealed move-in photos and flagged ${count} item${count === 1 ? "" : "s"}. Please review and agree or dispute each one.`, path);
  } catch (e) {
    d.prepare("UPDATE comparisons SET status='failed', error=? WHERE id=?").run(e instanceof Error ? e.message : String(e), comparisonId);
    audit(rental.id, actorId, "comparison.failed", { comparison_id: comparisonId, error: String(e).slice(0, 300) });
  }
}

