import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

const g = globalThis as unknown as { __handoverDb?: Database.Database };

function open(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "handover.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id),
    tenant_id INTEGER REFERENCES users(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    rent REAL,
    currency TEXT NOT NULL DEFAULT 'QAR',
    deposit REAL,
    start_date TEXT,
    end_date TEXT,
    terms TEXT NOT NULL DEFAULT '',
    movein_status TEXT NOT NULL DEFAULT 'open',
    movein_note TEXT,
    movein_seal TEXT,
    movein_manifest TEXT,
    movein_approved_at TEXT,
    movein_approved_by INTEGER,
    owner_signed_at TEXT, owner_sign_name TEXT, owner_sign_hash TEXT,
    tenant_signed_at TEXT, tenant_sign_name TEXT, tenant_sign_hash TEXT,
    ended_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invites (
    token TEXT PRIMARY KEY,
    rental_id INTEGER NOT NULL REFERENCES rentals(id),
    role TEXT NOT NULL,
    email TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    accepted_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rental_id INTEGER NOT NULL REFERENCES rentals(id),
    context TEXT NOT NULL,
    ref_id INTEGER,
    room TEXT,
    title TEXT,
    kind TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    uploaded_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rental_id INTEGER NOT NULL REFERENCES rentals(id),
    type TEXT NOT NULL,
    room TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'reported',
    reported_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    done_at TEXT, done_by INTEGER,
    confirmed_at TEXT, confirmed_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS issue_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT,
    status TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rental_id INTEGER NOT NULL REFERENCES rentals(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    period TEXT NOT NULL,
    due_date TEXT,
    paid_at TEXT,
    note TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS comparisons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rental_id INTEGER NOT NULL REFERENCES rentals(id),
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    model TEXT,
    summary TEXT,
    error TEXT,
    demo INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS comparison_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comparison_id INTEGER NOT NULL REFERENCES comparisons(id),
    room TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL,
    classification TEXT NOT NULL,
    confidence REAL,
    before_media TEXT,
    after_media TEXT,
    related_issue_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    owner_response TEXT, tenant_response TEXT,
    owner_note TEXT, tenant_note TEXT
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rental_id INTEGER,
    actor_id INTEGER,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    created_at TEXT NOT NULL,
    delivered INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );
  `);
  const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "account_type")) db.exec("ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'tenant'");
  db.exec(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL, email TEXT, phone TEXT, trade TEXT,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, accepted_at TEXT, removed_at TEXT
  )`);
  const mcols = db.prepare("PRAGMA table_info(media)").all() as { name: string }[];
  if (!mcols.some((c) => c.name === "preview_name")) db.exec("ALTER TABLE media ADD COLUMN preview_name TEXT; ALTER TABLE media ADD COLUMN preview_mime TEXT; ALTER TABLE media ADD COLUMN preview_status TEXT;");
  const icols = db.prepare("PRAGMA table_info(issues)").all() as { name: string }[];
  if (!icols.some((c) => c.name === "repair_cost")) db.exec("ALTER TABLE issues ADD COLUMN repair_cost REAL; ALTER TABLE issues ADD COLUMN cost_note TEXT;");
  if (!icols.some((c) => c.name === "category")) db.exec("ALTER TABLE issues ADD COLUMN category TEXT; ALTER TABLE issues ADD COLUMN urgency TEXT NOT NULL DEFAULT 'normal';");
  if (!icols.some((c) => c.name === "assigned_to")) db.exec("ALTER TABLE issues ADD COLUMN assigned_to INTEGER REFERENCES staff(id);");
  return db;
}

export function db(): Database.Database {
  if (!g.__handoverDb) g.__handoverDb = open();
  return g.__handoverDb;
}

export const now = () => new Date().toISOString();
