# Handover AI

Move-in and move-out proof, leases, repairs and reports for tenants and landlords, in one shared, timestamped record.

## What it does

- **Tenant or landlord first.** The landing page asks who you are; each gets its own dashboard (and can switch if they're both).
- **Either side starts a rental** and invites the other by email or a WhatsApp link.
- **Move-in inspection.** Photos and videos room by room, straight from the phone camera. Every file gets a SHA-256 fingerprint and server timestamp on upload. Both sides see everything.
- **Owner approval seals it.** The landlord approves (or asks for more pictures). Approval writes a seal over the exact file list; after that, move-in media can't be added, swapped or removed.
- **Lease signing is locked until approval** (enforced on the server). Each signature hashes the lease terms plus the move-in seal.
- **Issues and repairs.** Maintenance, breakage and wear-and-tear reports with photos/videos, comments and status (Reported → Acknowledged → In progress → Done). The other side confirms or reopens a Done item. Nothing is ever removed from the log.
- **Tenant-only spending tracker.** Electricity, water, internet and other bills with monthly totals, paid/unpaid, and a bill photo. The landlord can't see it.
- **Move-out AI comparison.** Claude compares move-out photos/video frames with the sealed move-in set room by room, cross-checks the issue log, and labels each finding as new damage, reported during the lease, wear and tear, cleaning or unclear. Both sides agree or dispute each item.
- **Proof report.** Re-hashes every sealed file, checks the seal and signatures, and verifies the hash-chained activity log. Printable / save as PDF.
- **Emails both ways** for invites, approvals, signatures, issue updates and the AI report (via Resend, or shown on the in-app Emails page when no key is set).

## Run it

Requires Node 20+ and `ffmpeg`/`ffprobe` on the PATH (used to pull frames from videos).

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY (and RESEND_API_KEY if you want real emails)
npm install
npm run dev                   # http://localhost:3000
```

Production: `npm run build && npm start`. Data lives in `./data` (SQLite + uploads); back that folder up.

## Tech

Next.js 15 (App Router, TypeScript, Tailwind), SQLite via better-sqlite3, local file storage, ffmpeg, Anthropic SDK (`claude-opus-5-5`, structured JSON output, server-side refusal fallback).

## Where things live

- `src/lib/rentals.ts`: access rules, seal, signature hashes, verification
- `src/lib/audit.ts`: hash-chained activity log
- `src/lib/ai.ts`, `src/lib/video.ts`: move-out comparison and frame extraction
- `src/app/api/**`: all actions (each checks the user's role on the rental)
- `src/app/rentals/[id]/**`: rental screens (move-in, lease, issues, move-out, documents, spending, timeline, proof)

## Next steps for production

Swap SQLite/local files for Postgres + S3 (or similar), add password reset and email verification, add a trusted timestamping service (RFC 3161) for the seal, and wrap the site as an iOS/Android app (e.g. Capacitor) once the flows are settled.
