/**
 * The catalogue is the contract between the browser, the queue worker and the
 * database sweep: all three raise alerts by code, and the SOS console renders
 * the same list as its "what is monitored" reference. These tests keep that
 * list well-formed and keep the promises it makes to a reader at 11pm.
 */

import { describe, it, expect } from 'vitest';
import {
  SOS_CATEGORY_LABELS,
  SOS_CODES,
  SOS_CODE_LIST,
  SOS_SEVERITY_ICONS,
  SOS_SEVERITY_LABELS,
  SosCategory,
  SosSeverity,
  getSosSpec,
  sosCodesByCategory
} from '../utils/sos/catalog';

const SEVERITIES: SosSeverity[] = ['critical', 'high', 'warning', 'info'];

describe('the SOS catalogue', () => {
  it('keys every entry by its own code, so a lookup cannot return someone else', () => {
    for (const [key, spec] of Object.entries(SOS_CODES)) {
      expect(spec.code).toBe(key);
    }
  });

  it('gives every entry a known category and severity', () => {
    for (const spec of SOS_CODE_LIST) {
      expect(Object.keys(SOS_CATEGORY_LABELS)).toContain(spec.category);
      expect(SEVERITIES).toContain(spec.severity);
    }
  });

  it('tells the reader what broke, why it matters and what to check', () => {
    for (const spec of SOS_CODE_LIST) {
      expect(spec.title.length).toBeGreaterThan(10);
      expect(spec.meaning.length).toBeGreaterThan(30);
      expect(spec.firstCheck.length).toBeGreaterThan(15);
      expect(spec.raisedBy.length).toBeGreaterThan(0);
    }
  });

  it('names a source for every entry that one of the three raisers can actually use', () => {
    for (const spec of SOS_CODE_LIST) {
      for (const source of spec.raisedBy) {
        expect(['web', 'worker', 'database']).toContain(source);
      }
    }
  });

  it('covers the failure paths the system is known to have', () => {
    // These are the ones that moved the needle: the SMTP failover the alerting
    // was built for, money, bookings, and the jobs nothing else watches.
    const mustExist = [
      'SMTP_FAILOVER_PROMOTED',
      'SMTP_QUOTA_EXHAUSTED',
      'EMAIL_SEND_PERMANENT_FAILURE',
      'EMAIL_QUEUE_STUCK',
      'EMAIL_WORKER_CRASHED',
      'ADVANCE_DEDUCTION_FAILED',
      'BOOKING_RECORD_FAILED',
      'AUTH_PROVIDER_FAILED',
      'DOCUMENT_UPLOAD_FAILED',
      'CRON_JOB_FAILED',
      'AUTO_CLOSE_SWEEP_STALLED',
      'SOS_NOTIFICATION_FAILED'
    ];
    for (const code of mustExist) {
      expect(getSosSpec(code), `${code} is missing from the catalogue`).toBeDefined();
    }
  });

  it('keeps the money and booking failures at the top of the volume scale', () => {
    expect(SOS_CODES.ADVANCE_DEDUCTION_FAILED.severity).toBe('critical');
    expect(SOS_CODES.BOOKING_RECORD_FAILED.severity).toBe('critical');
    expect(SOS_CODES.SMTP_FAILOVER_PROMOTED.severity).toBe('critical');
  });

  it('groups every code into exactly one category for the console', () => {
    const grouped = sosCodesByCategory().flatMap(group => group.codes.map(c => c.code));
    expect(grouped.sort()).toEqual(SOS_CODE_LIST.map(c => c.code).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('labels and icons every category and severity the console can render', () => {
    for (const category of Object.keys(SOS_CATEGORY_LABELS) as SosCategory[]) {
      expect(SOS_CATEGORY_LABELS[category]).toBeTruthy();
    }
    for (const severity of SEVERITIES) {
      expect(SOS_SEVERITY_LABELS[severity]).toBeTruthy();
      expect(SOS_SEVERITY_ICONS[severity]).toBeTruthy();
    }
  });

  it('returns nothing for a code it does not know, rather than a wrong answer', () => {
    expect(getSosSpec('NOT_A_REAL_CODE')).toBeUndefined();
  });
});
