/**
 * Invariants over the templates generated from the triggers sheet.
 *
 * These guard the seam between three things that can drift apart independently:
 * the sheet, the generator, and the TypeScript enums the trigger engine resolves
 * against. A template seeded with an event the engine does not know about would
 * simply never fire, silently, in production - so it fails here instead.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TravelEvent, PNCStatus } from '../types';

interface GeneratedTemplate {
  template_key: string;
  name: string;
  subject: string;
  body: string;
  event: string;
  audience: string;
  context_key: string | null;
  from_status: string | null;
  to_status: string | null;
  cc_rule: string;
  sheet_row: string;
}

const templates: GeneratedTemplate[] = JSON.parse(
  readFileSync(
    resolve(__dirname, '../scripts/email-templates/generated_templates.json'),
    'utf-8'
  )
);

const VALID_EVENTS = new Set<string>(Object.values(TravelEvent));
const VALID_STAGES = new Set<string>(Object.values(PNCStatus));
const VALID_AUDIENCES = new Set(['employee', 'manager', 'pnc', 'finance', 'escalation_owner']);
const VALID_CC_RULES = new Set([
  'default', 'default_finance', 'default_manager',
  'default_manager_if_approved', 'manager', 'none'
]);
const VALID_CONTEXTS = new Set([
  'post_booking', 'resubmit_after_manager_rejection', 'resubmit_after_pnc_rejection',
  'after_partial_refund', 'after_write_off'
]);

// Every variable resolveTemplateVariables knows how to fill.
const SUPPORTED_VARIABLES = new Set([
  'request_id', 'submissionId', 'requester_name', 'requesterName', 'requester_email',
  'requesterEmail', 'manager_name', 'manager_email', 'origin', 'from', 'destination',
  'to', 'departure_date', 'dateOfTravel', 'travel_mode', 'mode', 'trip_type', 'tripType',
  'purpose', 'estimated_cost', 'ticketCost', 'ticket_cost', 'vendor_name', 'vendorName',
  'invoiceUrl', 'violation_reasons', 'rejection_reason', 'statusChangeReason',
  'information_requested', 'infoRequested', 'employee_response', 'employeeResponse',
  'booking_reference', 'cancellation_reason', 'cancelledReason', 'portal_url',
  'support_email', 'original_fare', 'refund_amount', 'expected_refund',
  'written_off_amount', 'employee_owed_amount', 'org_absorbed_amount',
  'cancellation_charge', 'outstanding_amount', 'cancelled_segments', 'active_segments',
  'change_summary', 'days_on_hold', 'current_status'
]);

const variablesIn = (text: string): string[] =>
  Array.from(text.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1]);

describe('generated lifecycle templates', () => {
  it('generated a template for every mailing row in the sheet', () => {
    expect(templates.length).toBe(40);
  });

  it('gives every template a unique key', () => {
    const keys = templates.map(t => t.template_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('leaves at most one default template per event and audience', () => {
    // Two rows claiming the NULL context for one pair would make resolution
    // non-deterministic; the database enforces this too, but failing here is faster.
    const seen = new Map<string, string>();
    for (const t of templates.filter(t => !t.context_key)) {
      const pair = `${t.event}:${t.audience}`;
      expect(seen.has(pair), `${pair} has two default templates`).toBe(false);
      seen.set(pair, t.template_key);
    }
  });

  it('uses only events the trigger engine knows', () => {
    for (const t of templates) {
      expect(VALID_EVENTS.has(t.event), `${t.template_key}: unknown event ${t.event}`).toBe(true);
    }
  });

  it('uses only known audiences, contexts and CC rules', () => {
    for (const t of templates) {
      expect(VALID_AUDIENCES.has(t.audience), `${t.template_key}: ${t.audience}`).toBe(true);
      expect(VALID_CC_RULES.has(t.cc_rule), `${t.template_key}: ${t.cc_rule}`).toBe(true);
      if (t.context_key) {
        expect(VALID_CONTEXTS.has(t.context_key), `${t.template_key}: ${t.context_key}`).toBe(true);
      }
    }
  });

  it('references only stages the lifecycle actually has', () => {
    for (const t of templates) {
      for (const stage of [t.from_status, t.to_status]) {
        if (!stage || stage === '-') continue;
        // The sheet writes one combined cell as "Processing / On Hold".
        const parts = stage.split(' / ').map(s => s.trim());
        const known = VALID_STAGES.has(stage) || parts.every(p => VALID_STAGES.has(p));
        expect(known, `${t.template_key}: unknown stage "${stage}"`).toBe(true);
      }
    }
  });

  it('interpolates only variables the renderer can fill', () => {
    for (const t of templates) {
      for (const variable of [...variablesIn(t.subject), ...variablesIn(t.body)]) {
        expect(
          SUPPORTED_VARIABLES.has(variable),
          `${t.template_key} uses {{${variable}}}, which resolveTemplateVariables does not supply`
        ).toBe(true);
      }
    }
  });

  it('gives every template a non-empty subject and body', () => {
    for (const t of templates) {
      expect(t.subject.trim().length, t.template_key).toBeGreaterThan(0);
      expect(t.body.trim().length, t.template_key).toBeGreaterThan(0);
      expect(t.name.trim().length, t.template_key).toBeGreaterThan(0);
    }
  });

  it('carries no leftover "Subject:" line in the rendered body', () => {
    // The sheet embeds the subject as the first line of the template column.
    for (const t of templates) {
      expect(t.body, t.template_key).not.toMatch(/>\s*Subject:/);
    }
  });

  it('carries none of the sheet\'s editorial notes into the mail', () => {
    // Several cells open with notes addressed to whoever is reading the spreadsheet
    // ("MERGED into rows 23 and 24", "PNC mail: use the row 23 template"). Those are
    // commentary on the design, and a traveller must never see them.
    const editorial = [
      'use the row', 'see rows', 'two mails', 'fixed:', 'merged', 'new row',
      'gap filled', 'restored', 'email added', 'row 12', 'row 13', 'row 23', 'row 51'
    ];
    for (const t of templates) {
      const text = `${t.subject} ${t.body.replace(/<[^>]+>/g, ' ')}`.toLowerCase();
      for (const phrase of editorial) {
        expect(text.includes(phrase), `${t.template_key} leaks "${phrase}"`).toBe(false);
      }
    }
  });

  it('balances div tags in every body', () => {
    for (const t of templates) {
      const open = (t.body.match(/<div\b/g) || []).length;
      const close = (t.body.match(/<\/div>/g) || []).length;
      expect(open, `${t.template_key}: ${open} <div> vs ${close} </div>`).toBe(close);
    }
  });

  it('never leaves an unreplaced sheet placeholder in the copy', () => {
    for (const t of templates) {
      expect(t.body, t.template_key).not.toMatch(/\bNa\b\s*<\/p>/);
      expect(t.subject, t.template_key).not.toBe('Na');
    }
  });

  it('points every call to action at the configured portal', () => {
    // The sheet writes these as bare prose ("View Itinerary: Travel Desk"); an
    // unlinked one is a dead end for the reader.
    const withCta = templates.filter(t => t.body.includes('<a href='));
    expect(withCta.length).toBeGreaterThan(0);
    for (const t of withCta) {
      expect(t.body, t.template_key).toContain('href="{{portal_url}}"');
    }
  });

  it('addresses the traveller by name in every employee mail', () => {
    for (const t of templates.filter(t => t.audience === 'employee')) {
      expect(t.body, t.template_key).toContain('{{requester_name}}');
    }
  });

  it('identifies the request in every subject line', () => {
    for (const t of templates) {
      expect(t.subject, t.template_key).toMatch(/\{\{submissionId\}\}/);
    }
  });

  it('routes the refund dispute internally, never to the traveller', () => {
    // Sheet row 53 is explicit: the employee is not told until it resolves.
    const dispute = templates.find(t => t.event === TravelEvent.REFUND_DISPUTED);
    expect(dispute?.audience).toBe('finance');
    expect(templates.filter(t => t.event === TravelEvent.REFUND_DISPUTED)).toHaveLength(1);
  });

  it('copies Finance on every settlement mail', () => {
    const settlementEvents = [
      TravelEvent.PARTIAL_REFUND_RECEIVED,
      TravelEvent.REFUND_COMPLETED,
      TravelEvent.REFUND_WRITTEN_OFF
    ];
    for (const t of templates.filter(t => settlementEvents.includes(t.event as TravelEvent))) {
      expect(t.cc_rule, t.template_key).toBe('default_finance');
    }
  });

  it('does not promise an attached ticket it cannot send', () => {
    // Sheet row 22 calls this out: the sender builds a single-part HTML message
    // and the queue has no attachments column.
    const booking = templates.find(t => t.event === TravelEvent.BOOKING_CONFIRMED)!;
    expect(booking.body.toLowerCase()).toContain('not attached');
  });
});
