-- =============================================================================
-- Enable uuid-ossp before the first migration that uses it
-- =============================================================================
-- 20260219145722_add_meetup_settings.sql declares
--   id uuid primary key default uuid_generate_v4()
-- but nothing enables the extension that provides uuid_generate_v4(), so that
-- migration fails on a database built from this repo. It only ever worked
-- because the extension had been enabled by hand in the live project.
--
-- ON THE TIMESTAMP: this file is deliberately numbered BEFORE the migration it
-- unblocks, which is the opposite of the usual rule. A later migration cannot
-- help here -- the chain aborts at 145722 and never reaches it. The existing
-- migration is not edited; this one simply runs first.
--
-- Safe on the live database: CREATE EXTENSION IF NOT EXISTS is a no-op when the
-- extension is already present, whatever order the tooling applies this in.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
