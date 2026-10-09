-- =============================================================================
-- Stop the legacy template_key backfill colliding with its own unique index
-- =============================================================================
-- THE DEFECT
--
-- 20260927110000 backfills template_key for pre-existing rows as
--
--     'legacy.' || slug(COALESCE(status_trigger, name)) || '.' || audience
--
-- and then builds a UNIQUE index on template_key. That key ignores whether a
-- row is a draft -- and by this point every stage has exactly that pair: a
-- draft seeded by 20260726180000 and a published row seeded by 20260828160000,
-- sharing a status_trigger and an audience. Seven keys therefore collide, the
-- index build fails, and the rest of that migration (email_routing_settings,
-- email_reminder_log, the new indexes) never runs -- which cascades into
-- thirteen further migration failures.
--
-- THE FIX
--
-- The existing migration is not edited, and nothing is deleted. Its backfill
-- only fills rows WHERE template_key IS NULL, so it is enough to give the
-- *duplicates* a key here and leave one row of each group NULL for it.
--
-- The published row is the one left NULL, so it receives the exact key the
-- original migration would have given it and anything resolving by that key is
-- unaffected. The draft gets the same key with '.draft.<n>' appended. Both rows
-- survive, both stay visible in the admin UI, and 20260927110000 then archives
-- them as it always intended.
--
-- ON THE TIMESTAMP: numbered BEFORE the migration it protects, because a later
-- migration cannot help -- the chain aborts at the index build. The column is
-- added here with ADD COLUMN IF NOT EXISTS, matching how 20260927110000 adds
-- it, so whichever runs first the other is a no-op.
--
-- Safe on the live database: there template_key is already NOT NULL and
-- populated, so the UPDATE matches nothing.
-- =============================================================================

ALTER TABLE public.mail_templates
  ADD COLUMN IF NOT EXISTS template_key TEXT;

WITH candidate AS (
  SELECT
    id,
    'legacy.' || lower(regexp_replace(COALESCE(status_trigger, name), '[^a-zA-Z0-9]+', '_', 'g'))
              || '.' || COALESCE(audience, 'employee') AS derived_key,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(COALESCE(status_trigger, name), '[^a-zA-Z0-9]+', '_', 'g')),
                   COALESCE(audience, 'employee')
      -- Published first, so the draft is the row that gets suffixed.
      ORDER BY COALESCE(is_draft, FALSE) ASC, created_at NULLS LAST, id
    ) AS rn
  FROM public.mail_templates
  WHERE template_key IS NULL
    AND COALESCE(status_trigger, name) IS NOT NULL
)
UPDATE public.mail_templates t
   SET template_key = c.derived_key || '.draft.' || c.rn
  FROM candidate c
 WHERE t.id = c.id
   AND c.rn > 1;
