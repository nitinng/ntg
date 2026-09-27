#!/usr/bin/env python3
"""
Generates the mail_templates seed migration from the Travel Desk triggers sheet.

    python scripts/email-templates/generate_seed.py

Reads  : final_rows.json  (extract of the 'Final' tab), mapping.json (row -> trigger tuple)
Writes : supabase/migrations/20260927120000_seed_travel_lifecycle_mail_templates.sql

The sheet's 'Revised Email Template' column is the source of truth; 'Email Template' is the
fallback where a row has no revised copy. Bodies are plain text in the sheet and are rendered
into the Navgurukul HTML shell here.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(REPO, 'supabase', 'migrations',
                   '20260927120000_seed_travel_lifecycle_mail_templates.sql')
MANIFEST = os.path.join(HERE, 'generated_templates.json')

BRAND_ORANGE = '#FF6B35'
BRAND_INDIGO = '#4F46E5'

# Lines that introduce a call to action. The sheet writes these as bare prose
# ("View Itinerary: Travel Desk", "Review and Approve Request") rather than links.
CTA_PATTERNS = [
    (re.compile(r'^review and approve request\.?$', re.I), 'Review and Approve Request'),
    (re.compile(r'^action required:\s*review on the travel desk\.?$', re.I), 'Review on the Travel Desk'),
    (re.compile(r'^(.+?):\s*travel desk\.?$', re.I), None),          # "View Itinerary: Travel Desk"
    (re.compile(r'^\[\s*(.+?)\s*\](?:\s*->.*)?$', re.I), None),      # "[ View request ] -> url"
]

# "Label: {{value}}" detail lines that should render inside the grey detail box.
DETAIL_RE = re.compile(r'^([A-Z][A-Za-z0-9 /&\'\-]{2,40}):\s*(.+)$')
BULLET_RE = re.compile(r'^[\-•·*]\s+(.*)$')
NUMBER_RE = re.compile(r'^(\d+)\.\s+(.*)$')
SIGNOFF_RE = re.compile(r'^(best regards|warmly|thanks for your help|thank you|regards|thanks)[,!.]?$', re.I)
FOOTER_RE = re.compile(r'^navgurukul travel desk\.?$', re.I)


def esc(text):
    """Escape for HTML text content."""
    return (text.replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;'))


def sql_str(text):
    """Escape for a single-quoted SQL literal."""
    return text.replace("'", "''")


def split_subject(raw):
    """
    Pull the 'Subject: ...' line off a sheet template body, dropping anything above it.

    A few cells open with editorial notes to the reader of the spreadsheet rather than
    with the mail itself - row 35 begins "PNC mail: use the row 23 template." and only
    then gives the employee variant. Everything before the subject line is that kind of
    preamble and must not reach the traveller, so scan for the subject rather than only
    checking the first line. Bounded to the opening few lines so that a "Subject:" deep
    inside real copy cannot truncate the mail.
    """
    lines = raw.split('\n')
    seen = 0
    for i, line in enumerate(lines):
        s = line.strip()
        if not s:
            continue
        if s.lower().startswith('subject:'):
            return s[len('subject:'):].strip(), '\n'.join(lines[i + 1:])
        seen += 1
        if seen >= 6:
            break
    return None, raw


def normalise(body):
    """Collapse the sheet's ragged blank-line runs into single separators."""
    lines = [ln.strip() for ln in body.split('\n')]
    out = []
    for ln in lines:
        if not ln and out and not out[-1]:
            continue
        out.append(ln)
    while out and not out[0]:
        out.pop(0)
    while out and not out[-1]:
        out.pop()
    return out


def cta_label(line):
    for pattern, fixed in CTA_PATTERNS:
        m = pattern.match(line)
        if m:
            return fixed or m.group(1).strip()
    return None


def render_body(raw_body):
    """Plain-text sheet copy -> branded HTML email body."""
    lines = normalise(raw_body)
    parts = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]

        if not line:
            i += 1
            continue

        # Sign-off + footer: swallow the rest, the shell supplies the footer.
        if SIGNOFF_RE.match(line) or FOOTER_RE.match(line):
            i += 1
            continue

        label = cta_label(line)
        if label:
            parts.append(
                '<div style="text-align:center;margin:26px 0;">'
                f'<a href="{{{{portal_url}}}}" style="background-color:{BRAND_INDIGO};color:#ffffff;'
                'padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;'
                f'font-size:14px;display:inline-block;">{esc(label)}</a></div>'
            )
            i += 1
            continue

        # Bulleted run
        if BULLET_RE.match(line):
            items = []
            while i < n and BULLET_RE.match(lines[i]):
                items.append(BULLET_RE.match(lines[i]).group(1).strip())
                i += 1
            parts.append(
                '<ul style="margin:12px 0;padding-left:20px;color:#475569;font-size:13px;line-height:1.8;">'
                + ''.join(f'<li>{esc(it)}</li>' for it in items)
                + '</ul>'
            )
            continue

        # Numbered run
        if NUMBER_RE.match(line):
            items = []
            while i < n and NUMBER_RE.match(lines[i]):
                items.append(NUMBER_RE.match(lines[i]).group(2).strip())
                i += 1
            parts.append(
                '<ol style="margin:12px 0;padding-left:20px;color:#475569;font-size:13px;line-height:1.8;">'
                + ''.join(f'<li>{esc(it)}</li>' for it in items)
                + '</ol>'
            )
            continue

        # Run of "Label: value" detail lines -> one grey box
        if DETAIL_RE.match(line) and not cta_label(line):
            rows = []
            while i < n:
                cur = lines[i]
                if not cur:
                    # a single blank line inside a detail run is the sheet's formatting noise
                    if i + 1 < n and DETAIL_RE.match(lines[i + 1]) and not cta_label(lines[i + 1]):
                        i += 1
                        continue
                    break
                m = DETAIL_RE.match(cur)
                if not m or cta_label(cur):
                    break
                rows.append((m.group(1).strip(), m.group(2).strip()))
                i += 1
            if len(rows) == 1 and '{{' not in rows[0][1]:
                # A lone prose line that merely looks like a label - treat as a paragraph.
                parts.append(paragraph(f'{rows[0][0]}: {rows[0][1]}'))
                continue
            body_rows = ''.join(
                f'<div style="margin:4px 0;"><strong style="color:#334155;">{esc(k)}:</strong> {esc(v)}</div>'
                for k, v in rows
            )
            parts.append(
                '<div style="background-color:#f8fafc;border-left:4px solid '
                f'{BRAND_INDIGO};padding:16px;border-radius:6px;margin:20px 0;'
                'font-size:13px;color:#475569;line-height:1.7;">'
                + body_rows + '</div>'
            )
            continue

        parts.append(paragraph(line))
        i += 1

    return '\n      '.join(parts)


def paragraph(text):
    html = esc(text)
    # Bold the greeting name and any {{...}} already present stays literal.
    html = re.sub(r'^Hi (\{\{\w+\}\}),', r'Hi <strong>\1</strong>,', html)
    return f'<p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{html}</p>'


def shell(inner, strapline):
    strap = (f'<p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">'
             f'{esc(strapline)}</p>') if strapline else ''
    return (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
        'max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'
        'background:#ffffff;">\n'
        '      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;'
        f'border-bottom:2px solid {BRAND_ORANGE};">\n'
        f'        <h1 style="color:{BRAND_ORANGE};margin:0;font-size:26px;font-weight:800;">navgurukul</h1>\n'
        f'        {strap}\n'
        '      </div>\n'
        f'      {inner}\n'
        '      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;'
        'text-align:center;color:#94a3b8;font-size:11px;">\n'
        '        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.\n'
        '      </div>\n'
        '    </div>'
    )


STRAPLINE = {
    'employee': 'Travel Desk Notification',
    'manager': 'Manager Action Required',
    'pnc': 'Travel Desk Operations',
    'finance': 'Finance Action Required',
    'escalation_owner': 'Escalation Notice',
}


def title_case_name(subject, event, audience):
    """Short human name for the template list in the admin UI."""
    base = re.sub(r'\s*[\(\-:]\s*\{\{.*$', '', subject).strip()
    base = re.sub(r'\{\{\w+\}\}', '', base).strip(' -:()')
    base = re.sub(r'\s{2,}', ' ', base)
    if not base:
        base = event.replace('_', ' ').title()
    suffix = {'manager': ' (Manager)', 'pnc': ' (PNC)', 'finance': ' (Finance)',
              'escalation_owner': ' (Escalation)'}.get(audience, '')
    return (base + suffix)[:120]


def main():
    rows = {r['num']: r for r in json.load(open(os.path.join(HERE, 'final_rows.json'), encoding='utf-8'))}
    cfg = json.load(open(os.path.join(HERE, 'mapping.json'), encoding='utf-8'))
    authored = cfg.get('authored', {})

    rendered = {}   # row -> (subject, html)
    records = []

    def sheet_copy(row_num):
        """Revised column wins; original is the fallback; authored copy covers the gap."""
        if row_num in authored:
            a = authored[row_num]
            return a['subject'], render_body('\n'.join(a['body'])), 'authored'

        r = rows[row_num]
        for col, subj_col, origin in (('rev_template', 'rev_subject', 'revised'),
                                      ('template', 'subject', 'original')):
            raw = (r.get(col) or '').strip()
            if not raw or raw == 'Na' or raw.lower().startswith('use the row') or raw.startswith('See rows'):
                continue
            embedded, body = split_subject(raw)
            subject = embedded or (r.get(subj_col) or '').strip()
            if not subject or subject == 'Na':
                subject = (r.get('subject') or '').strip()
            return subject, render_body(body), origin
        raise SystemExit(f'row {row_num}: no usable template body in either column')

    for entry in cfg['emit']:
        row_num = entry['row']
        src_row = entry.get('body_from', re.sub(r'[ab]$', '', row_num) if row_num in ('18a', '18b') else row_num)
        subject, html, origin = sheet_copy(src_row)
        sheet_row = rows.get(row_num) or rows[src_row]

        audience = entry['audience']
        body = shell(html, STRAPLINE.get(audience))

        key_ctx = entry.get('context_key') or 'default'
        template_key = f"{entry['event'].lower()}.{audience}.{key_ctx}"

        records.append({
            'template_key': template_key,
            'name': title_case_name(subject, entry['event'], audience),
            'subject': subject,
            'body': body,
            'event': entry['event'],
            'audience': audience,
            'context_key': entry.get('context_key'),
            'from_status': sheet_row.get('from_stage') or None,
            'to_status': sheet_row.get('to_stage') or None,
            'cc_rule': entry.get('cc_rule', 'default'),
            'sheet_row': row_num,
            'copy_origin': origin,
            'summary': sheet_row.get('summary', '')[:500],
        })
        rendered[row_num] = (subject, body)

    seen = {}
    for rec in records:
        if rec['template_key'] in seen:
            raise SystemExit(f"duplicate template_key {rec['template_key']} "
                             f"(rows {seen[rec['template_key']]} and {rec['sheet_row']})")
        seen[rec['template_key']] = rec['sheet_row']

    values = []
    for r in records:
        values.append(
            "  (" + ", ".join([
                f"'{sql_str(r['template_key'])}'",
                f"'{sql_str(r['name'])}'",
                f"'{sql_str(r['subject'])}'",
                f"'{sql_str(r['body'])}'",
                f"'{sql_str(r['event'])}'",
                f"'{sql_str(r['audience'])}'",
                'NULL' if r['context_key'] is None else f"'{sql_str(r['context_key'])}'",
                'NULL' if not r['from_status'] else f"'{sql_str(r['from_status'])}'",
                'NULL' if not r['to_status'] else f"'{sql_str(r['to_status'])}'",
                f"'{sql_str(r['cc_rule'])}'",
                f"'{sql_str(r['sheet_row'])}'",
                f"'{sql_str(r['summary'])}'",
            ]) + ")"
        )

    silent = cfg['silent']
    silent_lines = '\n'.join(
        f'--   row {k:<4} {v}' for k, v in silent.items() if k != '_doc'
    )

    sql = f"""-- ============================================================================
-- Seed: Travel Desk lifecycle mail templates
--
-- GENERATED FILE - do not edit by hand.
--   source : "Travel Desk Stages- mails - Triggers.xlsx" (Final tab)
--   mapping: scripts/email-templates/mapping.json
--   regen  : python scripts/email-templates/generate_seed.py
--
-- {len(records)} templates across {len(set(r['event'] for r in records))} trigger events.
-- The sheet's "Revised Email Template" column is the source of truth; the original
-- "Email Template" column is the fallback where a row carries no revised copy.
--
-- Rows that deliberately send no email (recorded so the absence is intentional):
{silent_lines}
-- ============================================================================

-- Update audience check constraint to permit all lifecycle audiences
ALTER TABLE public.mail_templates DROP CONSTRAINT IF EXISTS chk_mail_templates_audience;
ALTER TABLE public.mail_templates ADD CONSTRAINT chk_mail_templates_audience
  CHECK (audience IN ('employee', 'manager', 'pnc', 'finance', 'escalation_owner'));

-- Retire any previously seeded lifecycle template that is no longer in the sheet,
-- so a re-run of the generator cannot leave orphans firing in production.
UPDATE public.mail_templates
   SET status = 'Archived', is_active = FALSE, updated_at = NOW()
 WHERE sheet_row IS NOT NULL
   AND template_key NOT IN ({', '.join("'" + sql_str(r['template_key']) + "'" for r in records)});

INSERT INTO public.mail_templates
  (template_key, name, subject, body, event, audience, context_key,
   from_status, to_status, cc_rule, sheet_row, sheet_summary,
   status, is_draft, is_active, version)
SELECT v.template_key, v.name, v.subject, v.body, v.event, v.audience, v.context_key,
       v.from_status, v.to_status, v.cc_rule, v.sheet_row, v.sheet_summary,
       'Published', FALSE, TRUE, 1
FROM (VALUES
{',\n'.join(values)}
) AS v(template_key, name, subject, body, event, audience, context_key,
       from_status, to_status, cc_rule, sheet_row, sheet_summary)
ON CONFLICT (template_key) DO UPDATE SET
  name          = EXCLUDED.name,
  subject       = EXCLUDED.subject,
  body          = EXCLUDED.body,
  event         = EXCLUDED.event,
  audience      = EXCLUDED.audience,
  context_key   = EXCLUDED.context_key,
  from_status   = EXCLUDED.from_status,
  to_status     = EXCLUDED.to_status,
  cc_rule       = EXCLUDED.cc_rule,
  sheet_row     = EXCLUDED.sheet_row,
  sheet_summary = EXCLUDED.sheet_summary,
  status        = 'Published',
  is_active     = TRUE,
  version       = public.mail_templates.version + 1,
  updated_at    = NOW();
"""

    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(sql)

    # Machine-readable manifest of what was generated. tests/seedTemplates.test.ts
    # asserts against this, so a generator change that breaks an invariant - an
    # unknown event, a duplicate trigger, an unfillable variable - fails the suite
    # rather than reaching the database.
    manifest = [
        {k: r[k] for k in
         ('template_key', 'name', 'subject', 'body', 'event', 'audience',
          'context_key', 'from_status', 'to_status', 'cc_rule', 'sheet_row')}
        for r in records
    ]
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(manifest, fh, indent=1, ensure_ascii=False)

    by_aud = {}
    for r in records:
        by_aud[r['audience']] = by_aud.get(r['audience'], 0) + 1
    authored_rows = [r['sheet_row'] for r in records if r['copy_origin'] == 'authored']
    fallback_rows = [r['sheet_row'] for r in records if r['copy_origin'] == 'original']

    print(f'wrote {OUT}')
    print(f'wrote {MANIFEST}')
    print(f'  templates      : {len(records)}')
    print(f'  events         : {len(set(r["event"] for r in records))}')
    print(f'  by audience    : {by_aud}')
    print(f'  silent rows    : {len(silent) - 1}')
    print(f'  copy from revised column : {len(records) - len(authored_rows) - len(fallback_rows)}')
    print(f'  copy from original column: {len(fallback_rows)} {fallback_rows}')
    print(f'  authored here (review!)  : {len(authored_rows)} {authored_rows}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
