-- Load-test data at full target size: 1,000,000 registered users, 25,000 of them with live sessions.
-- NEVER run against production. Usage (on an empty test database the app has already migrated):
--   psql "$DATABASE_URL" -v pw_hash="'<salt>:<hash>'" -f deploy/loadtest/seed.sql
-- Every seeded account's password is the one that pw_hash was made from (see README).
\set ON_ERROR_STOP on
\timing on
SET synchronous_commit = off;

-- Users 1..100,000 are landlords, the rest tenants.
INSERT INTO users (id, email, name, phone, password_hash, created_at, account_type, email_verified_at, terms_accepted_at)
SELECT i, 'lt' || i || '@loadtest.invalid', 'Load User ' || i, '+974 5' || lpad((i % 10000000)::text, 7, '0'), :pw_hash,
       '2026-01-01T00:00:00.000Z', CASE WHEN i <= 100000 THEN 'owner' ELSE 'tenant' END,
       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
FROM generate_series(1, 1000000) i;
SELECT setval(pg_get_serial_sequence('users', 'id'), 1000000);

-- 400,000 rentals: each landlord has 4, each with its own tenant.
INSERT INTO rentals (id, name, address, owner_id, tenant_id, created_by, rent, deposit, start_date, end_date, terms,
                     movein_status, movein_seal, movein_approved_at, movein_approved_by, created_at)
SELECT r, 'Flat ' || r, 'Building ' || (r % 5000) || ', Doha', ((r - 1) % 100000) + 1, 100000 + r, ((r - 1) % 100000) + 1,
       5000 + (r % 20) * 500, 10000, '2026-01-01', '2027-01-01', 'Standard terms',
       'approved', md5(r::text) || md5((r + 1)::text), '2026-01-02T00:00:00.000Z', ((r - 1) % 100000) + 1, '2026-01-01T00:00:00.000Z'
FROM generate_series(1, 400000) r;
SELECT setval(pg_get_serial_sequence('rentals', 'id'), 400000);

-- 2,000,000 photo records (5 per rental) and 1,000,000 issues with one update each.
INSERT INTO media (rental_id, context, room, title, kind, original_name, stored_name, mime, size, sha256, md5, uploaded_by, uploaded_at, preview_status)
SELECT ((m - 1) % 400000) + 1, 'move_in', 'Living room', 'photo', 'photo', 'p' || m || '.jpg', 'seed-' || m || '.jpg', 'image/jpeg',
       2000000, md5(m::text) || md5(m::text), 'AAAAAAAAAAAAAAAAAAAAAA==', 100000 + ((m - 1) % 400000) + 1, '2026-01-01T00:00:00.000Z', 'none'
FROM generate_series(1, 2000000) m;

INSERT INTO issues (id, rental_id, type, category, urgency, room, title, description, status, reported_by, created_at)
SELECT k, ((k - 1) % 400000) + 1, 'maintenance', 'plumbing', 'normal', 'Kitchen', 'Leaking tap ' || k, 'Drips all night',
       (ARRAY['reported', 'acknowledged', 'in_progress', 'done'])[1 + k % 4], 100000 + ((k - 1) % 400000) + 1,
       to_char(timestamp '2026-02-01' + (k % 200) * interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"')
FROM generate_series(1, 1000000) k;
SELECT setval(pg_get_serial_sequence('issues', 'id'), 1000000);

INSERT INTO issue_updates (issue_id, user_id, body, status, created_at)
SELECT k, ((((k - 1) % 400000)) % 100000) + 1, 'Plumber booked', 'acknowledged', '2026-03-01T00:00:00.000Z'
FROM generate_series(1, 1000000) k;

-- 4,000,000 audit entries (10 per rental). Hashes are placeholders: seeded rentals fail the proof page check by design.
INSERT INTO audit_log (rental_id, chain_key, seq, actor_id, action, details, created_at, prev_hash, hash)
SELECT r, r, s, ((r - 1) % 100000) + 1, 'issue.reported', '{}', '2026-01-01T00:00:00.000Z', md5((r * 100 + s - 1)::text), md5((r * 100 + s)::text)
FROM generate_series(1, 400000) r, generate_series(1, 10) s;
INSERT INTO chain_heads (chain_key, seq, hash) SELECT r, 10, md5((r * 100 + 10)::text) FROM generate_series(1, 400000) r;

-- 25,000 active users with a session: 5,000 landlords and 20,000 tenants. Tokens are "lt-<user id>".
INSERT INTO sessions (token, user_id, expires_at)
SELECT 'lt-' || i, i, '2099-01-01T00:00:00.000Z' FROM generate_series(1, 5000) i
UNION ALL
SELECT 'lt-' || i, i, '2099-01-01T00:00:00.000Z' FROM generate_series(100001, 120000) i;

ANALYZE;
