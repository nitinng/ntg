/**
 * Closing a trip automatically happens in SQL (20261009140000), but which
 * stages may close is also encoded client-side in deriveEventFromTransition,
 * which decides whether the trip-completed mail is raised at all.
 *
 * The two have to agree. If the scan swept a stage the client treats as silent,
 * requests would close with no mail; if the client mailed on a stage the scan
 * never sweeps, the automatic path would never produce it. Neither would fail
 * loudly, so the agreement is asserted here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNCStatus, TravelEvent } from '../types';
import { deriveEventFromTransition } from '../utils/emailTriggers';

const MIGRATION = 'supabase/migrations/20261009140000_auto_close_completed_trips.sql';
const sql = readFileSync(MIGRATION, 'utf8');

/** The stages the scan's WHERE clause sweeps. */
const sweptStatuses = (): string[] => {
  const match = /pnc_status IN \(([^)]*)\)/.exec(sql);
  if (!match) throw new Error('could not find the scan predicate in ' + MIGRATION);
  return match[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
};

describe('the scan and the mail trigger agree on which stages close', () => {
  it('sweeps exactly the stages that raise the trip-completed mail', () => {
    const swept = sweptStatuses();
    const mailable = Object.values(PNCStatus).filter(
      from => deriveEventFromTransition(from, PNCStatus.CLOSED) === TravelEvent.TRIP_COMPLETED
    );

    expect(swept.slice().sort()).toEqual(mailable.slice().sort());
  });

  it('sweeps the two stages that mean a trip happened', () => {
    expect(sweptStatuses().sort()).toEqual(
      [PNCStatus.BOOKED, PNCStatus.PARTIALLY_CANCELLED].sort()
    );
  });

  it('never sweeps a cancellation or refund stage', () => {
    // Closing these automatically would strand money mid-flight, and would mail
    // "hope your trip went well" about a trip that did not happen.
    const mustNotSweep = [
      PNCStatus.CANCELLED_BY_EMPLOYEE,
      PNCStatus.CANCELLED_BY_PNC,
      PNCStatus.CANCELLED_BY_SYSTEM,
      PNCStatus.CANCELLATION_REQUESTED,
      PNCStatus.PENDING_REFUND,
      PNCStatus.PARTIALLY_REFUNDED,
      PNCStatus.DISPUTED,
      PNCStatus.RECONCILED
    ];
    for (const status of mustNotSweep) {
      expect(sweptStatuses(), `scan must not sweep ${status}`).not.toContain(status);
    }
  });
});

describe('the scan waits for the traveller to be back', () => {
  it('keys on the later of return_date and date_of_travel', () => {
    // A return leg still ahead means the trip is not over.
    expect(sql).toContain('COALESCE(return_date, date_of_travel)');
  });

  it('applies a grace period rather than closing at UTC midnight', () => {
    // date_of_travel is a DATE; closing the instant it passes in UTC fires
    // while it is still the travel evening in IST.
    expect(sql).toContain('auto_close_grace_days');
    expect(sql).toMatch(/CURRENT_DATE - grace_days/);
  });

  it('bounds one run so a backlog cannot fire unlimited mail', () => {
    expect(sql).toMatch(/LIMIT \d+/);
  });
});
