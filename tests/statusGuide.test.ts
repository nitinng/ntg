/**
 * The status guide is the single source for the in-app guide, the dashboard
 * labels, the employee timeline and EMPLOYEE_GUIDE.md. These tests guard the
 * properties those four surfaces rely on.
 */

import { describe, it, expect } from 'vitest';
import { PNCStatus } from '../types';
import {
  STATUS_GUIDE,
  STATUS_STAGES,
  statusesInStage,
  employeeStatusLabel,
  isClosedStatus
} from '../utils/statusGuide';

describe('coverage', () => {
  it('documents every status the workflow can reach', () => {
    const statuses = Object.values(PNCStatus);
    expect(statuses).toHaveLength(22);
    for (const status of statuses) {
      expect(STATUS_GUIDE[status], `missing guide entry for ${status}`).toBeDefined();
    }
  });

  it('gives every entry all four answers a traveller needs', () => {
    for (const entry of Object.values(STATUS_GUIDE)) {
      expect(entry.meaning.length, entry.status).toBeGreaterThan(10);
      expect(entry.whoActsNext.length, entry.status).toBeGreaterThan(2);
      expect(entry.whatHappensNext.length, entry.status).toBeGreaterThan(10);
      // employeeAction is deliberately nullable: null means "nothing to do",
      // which is itself one of the four answers.
      expect(entry.employeeAction === null || entry.employeeAction.length > 3).toBe(true);
    }
  });

  it('places every status in a known stage, and every stage is used', () => {
    for (const entry of Object.values(STATUS_GUIDE)) {
      expect(STATUS_STAGES, entry.status).toContain(entry.stage);
    }
    for (const stage of STATUS_STAGES) {
      expect(statusesInStage(stage).length, `stage ${stage} has no statuses`).toBeGreaterThan(0);
    }
  });

  it('accounts for every status exactly once across the stages', () => {
    const grouped = STATUS_STAGES.flatMap(stage => statusesInStage(stage));
    expect(grouped).toHaveLength(Object.values(PNCStatus).length);
    expect(new Set(grouped.map(e => e.status)).size).toBe(grouped.length);
  });
});

describe('Action Required is a label, not a status', () => {
  it('is the employee-facing name for On Hold', () => {
    // It must not appear in PNCStatus -- treating it as a status is the
    // confusion this guide exists to remove.
    expect(Object.values(PNCStatus)).not.toContain('Action Required' as any);
    expect(employeeStatusLabel(PNCStatus.ON_HOLD)).toBe('Action Required');
  });

  it('marks the escalated hold as action required too', () => {
    expect(employeeStatusLabel(PNCStatus.ON_HOLD_ESCALATED)).toContain('Action Required');
  });

  it('says plainly that On Hold is waiting on the employee', () => {
    expect(STATUS_GUIDE[PNCStatus.ON_HOLD].whoActsNext).toContain('You');
    expect(STATUS_GUIDE[PNCStatus.ON_HOLD].employeeAction).toBeTruthy();
  });
});

describe('employeeStatusLabel', () => {
  it('falls back to the raw status for anything unrecognised', () => {
    // A stage added to the database before the guide catches up must still
    // render something truthful rather than blank.
    expect(employeeStatusLabel('Some Future Stage')).toBe('Some Future Stage');
  });

  it('leaves statuses alone where the internal name is already clear', () => {
    expect(employeeStatusLabel(PNCStatus.BOOKED)).toBe('Booked');
    expect(employeeStatusLabel(PNCStatus.APPROVED)).toBe('Approved');
  });
});

describe('isClosedStatus', () => {
  it('is true for the two terminal stages the banner covers', () => {
    expect(isClosedStatus(PNCStatus.CLOSED)).toBe(true);
    expect(isClosedStatus(PNCStatus.CLOSED_RECORDED)).toBe(true);
  });

  it('is false for stages that only look final', () => {
    // Reconciled and the cancellations still move on to Closed, so showing a
    // "nothing more to do" banner on them would be wrong.
    expect(isClosedStatus(PNCStatus.RECONCILED)).toBe(false);
    expect(isClosedStatus(PNCStatus.CANCELLED_BY_PNC)).toBe(false);
    expect(isClosedStatus(PNCStatus.BOOKED)).toBe(false);
  });
});
