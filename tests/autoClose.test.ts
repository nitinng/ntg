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

const SCHEDULE_MIGRATION = 'supabase/migrations/20261009160000_schedule_auto_close_sweep.sql';
const scheduleSql = readFileSync(SCHEDULE_MIGRATION, 'utf8');

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

describe('the sweep is scheduled overnight in IST, not UTC', () => {
  /** The cron expression the migration actually registers. */
  const cronExpression = (): string => {
    const match = /PERFORM cron\.schedule\(\s*'auto-close-trips',\s*'([^']+)'/.exec(scheduleSql);
    if (!match) throw new Error('could not find the cron expression in ' + SCHEDULE_MIGRATION);
    return match[1];
  };

  it('runs at 02:00 IST', () => {
    // pg_cron runs on the server clock, which is UTC on Supabase. '0 2 * * *'
    // would be 07:30 IST -- the start of the working morning, when a batch of
    // closure mail is least welcome. 20:30 UTC the night before is 02:00 IST.
    const [minute, hour] = cronExpression().split(' ');

    const utcHour = Number(hour);
    const utcMinute = Number(minute);
    const istTotalMinutes = (utcHour * 60 + utcMinute + 5 * 60 + 30) % (24 * 60);

    expect(istTotalMinutes).toBe(2 * 60);
  });

  it('is a daily schedule', () => {
    const [, , dayOfMonth, month, dayOfWeek] = cronExpression().split(' ');
    expect([dayOfMonth, month, dayOfWeek]).toEqual(['*', '*', '*']);
  });

  it('replaces rather than duplicates the job when re-run', () => {
    // Without the unschedule, every re-run would add another job and the sweep
    // would fire several times a night.
    expect(scheduleSql).toContain('cron.unschedule');
    expect(scheduleSql).toMatch(/IF EXISTS \(SELECT 1 FROM cron\.job WHERE jobname/);
  });

  it('degrades to a notice when pg_cron is absent, rather than failing', () => {
    // It ships alongside other migrations in one transaction; raising here
    // would roll back everything applied with it.
    expect(scheduleSql).toContain("to_regproc('cron.schedule') IS NULL");
    expect(scheduleSql).toContain('RAISE NOTICE');
    expect(scheduleSql).not.toContain('RAISE EXCEPTION');
  });
});
