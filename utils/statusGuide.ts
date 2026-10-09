/**
 * What each request status means, in the traveller's words.
 *
 * One source for the in-app guide, the employee dashboard and the status
 * timeline, so the three cannot describe the same stage differently -- which is
 * how "Action Required" came to look like a status in its own right when it is
 * the employee-facing label for On Hold.
 */

import { PNCStatus } from '../types';

export type StatusStage =
  | 'Submitted'
  | 'Approval'
  | 'With the desk'
  | 'Booked'
  | 'Cancellation'
  | 'Refund'
  | 'Closed';

export interface StatusGuideEntry {
  status: PNCStatus;
  /** What the employee sees. Differs from `status` only where the internal name misleads. */
  label: string;
  stage: StatusStage;
  meaning: string;
  whoActsNext: string;
  whatHappensNext: string;
  /** The question travellers actually have. */
  employeeAction: string | null;
}

/**
 * Every stage a request can be in, grouped by where it sits in the journey.
 * Kept exhaustive over PNCStatus by the Record type: a new status will not
 * compile until it is documented here.
 */
export const STATUS_GUIDE: Record<PNCStatus, StatusGuideEntry> = {
  [PNCStatus.NOT_STARTED]: {
    status: PNCStatus.NOT_STARTED,
    label: 'Submitted',
    stage: 'Submitted',
    meaning: 'Your request has been received and is being checked against travel policy.',
    whoActsNext: 'The system, automatically.',
    whatHappensNext: 'If your request meets the advance-notice policy it goes straight to the travel desk. If not, it goes to your manager for approval.',
    employeeAction: null
  },
  [PNCStatus.APPROVAL_PENDING]: {
    status: PNCStatus.APPROVAL_PENDING,
    label: 'Waiting for Manager Approval',
    stage: 'Approval',
    meaning: 'Your request needs your manager to approve it, usually because it was raised at shorter notice than policy allows.',
    whoActsNext: 'Your manager.',
    whatHappensNext: 'Once they approve, it goes to the travel desk to book. If they reject it, you can edit and resubmit.',
    employeeAction: 'Nothing, though a nudge to your manager can help if it is urgent.'
  },
  [PNCStatus.APPROVED]: {
    status: PNCStatus.APPROVED,
    label: 'Approved',
    stage: 'Approval',
    meaning: 'Your manager has approved the request.',
    whoActsNext: 'The travel desk.',
    whatHappensNext: 'It moves to the desk immediately to be booked.',
    employeeAction: null
  },
  [PNCStatus.REJECTED_BY_MANAGER]: {
    status: PNCStatus.REJECTED_BY_MANAGER,
    label: 'Rejected by Manager',
    stage: 'Approval',
    meaning: 'Your manager did not approve this request. Their reason is on the request.',
    whoActsNext: 'You.',
    whatHappensNext: 'Nothing until you act. Editing and resubmitting sends it back for a fresh look.',
    employeeAction: 'Yes — read the reason, then edit and resubmit, or leave it if the trip is off.'
  },
  [PNCStatus.PROCESSING]: {
    status: PNCStatus.PROCESSING,
    label: 'Being Booked',
    stage: 'With the desk',
    meaning: 'The travel desk has your request and is finding and booking tickets.',
    whoActsNext: 'The travel desk.',
    whatHappensNext: 'You get your ticket by email once it is booked. If they need something from you first, the request moves to Action Required.',
    employeeAction: null
  },
  [PNCStatus.ON_HOLD]: {
    status: PNCStatus.ON_HOLD,
    // "Action Required" is this status's employee-facing label, not a status of
    // its own. The dashboard, the guide and the timeline all use this name.
    label: 'Action Required',
    stage: 'With the desk',
    meaning: 'The travel desk needs information from you before they can book — a date confirmation, an ID detail, a preference.',
    whoActsNext: 'You.',
    whatHappensNext: 'Booking is paused until you reply. You will be reminded, and if nobody replies for long enough the request is escalated and eventually closed.',
    employeeAction: 'Yes — open the request and answer the question. This is the one status that genuinely waits on you.'
  },
  [PNCStatus.ON_HOLD_ESCALATED]: {
    status: PNCStatus.ON_HOLD_ESCALATED,
    label: 'Action Required — Escalated',
    stage: 'With the desk',
    meaning: 'The desk\'s question has gone unanswered long enough that it has been escalated.',
    whoActsNext: 'You, with the escalation owner now watching.',
    whatHappensNext: 'Booking is still paused. Without a reply the request will be closed automatically.',
    employeeAction: 'Yes — answer the outstanding question now, or cancel the request if the trip is off.'
  },
  [PNCStatus.REJECTED_BY_PNC]: {
    status: PNCStatus.REJECTED_BY_PNC,
    label: 'Rejected by Travel Desk',
    stage: 'With the desk',
    meaning: 'The travel desk could not proceed with this request. Their reason is on the request.',
    whoActsNext: 'You.',
    whatHappensNext: 'Nothing until you act. Editing and resubmitting sends it back to the desk.',
    employeeAction: 'Yes — read the reason, then edit and resubmit if you still need to travel.'
  },
  [PNCStatus.BOOKED]: {
    status: PNCStatus.BOOKED,
    label: 'Booked',
    stage: 'Booked',
    meaning: 'Your tickets are booked. The booking details and your ticket are on the request.',
    whoActsNext: 'You — travel.',
    whatHappensNext: 'After the trip the request is closed, and you will be asked to submit any expenses.',
    employeeAction: 'Yes — download your ticket and check the details are right. Tell the desk straight away if anything is wrong.'
  },
  [PNCStatus.CANCELLATION_REQUESTED]: {
    status: PNCStatus.CANCELLATION_REQUESTED,
    label: 'Cancellation Requested',
    stage: 'Cancellation',
    meaning: 'You or the desk have asked for this trip to be cancelled, and the desk is working through it.',
    whoActsNext: 'The travel desk.',
    whatHappensNext: 'The desk cancels with the airline or operator and works out whether any money comes back.',
    employeeAction: null
  },
  [PNCStatus.CANCELLED_BY_EMPLOYEE]: {
    status: PNCStatus.CANCELLED_BY_EMPLOYEE,
    label: 'Cancelled by You',
    stage: 'Cancellation',
    meaning: 'This trip was cancelled at your request.',
    whoActsNext: 'The travel desk, if there is money to recover.',
    whatHappensNext: 'If a refund is due the request moves to Pending Refund. If nothing is recoverable it is reconciled and closed.',
    employeeAction: 'Possibly — if a cancellation charge falls to you, Finance will contact you. Nothing to do until they do.'
  },
  [PNCStatus.CANCELLED_BY_PNC]: {
    status: PNCStatus.CANCELLED_BY_PNC,
    label: 'Cancelled by Travel Desk',
    stage: 'Cancellation',
    meaning: 'The travel desk cancelled this booking. The reason is on the request.',
    whoActsNext: 'The travel desk.',
    whatHappensNext: 'Any refund is pursued and the request is closed. A desk cancellation carries no cost to you.',
    employeeAction: 'Yes, if you still need to travel — raise a fresh request.'
  },
  [PNCStatus.CANCELLED_BY_SYSTEM]: {
    status: PNCStatus.CANCELLED_BY_SYSTEM,
    label: 'Closed — No Response',
    stage: 'Cancellation',
    meaning: 'The desk asked for information and heard nothing back in time, so the request was closed automatically.',
    whoActsNext: 'You, if you still need the trip.',
    whatHappensNext: 'This request stays closed.',
    employeeAction: 'Yes, if you still need to travel — raise a fresh request.'
  },
  [PNCStatus.PARTIALLY_CANCELLED]: {
    status: PNCStatus.PARTIALLY_CANCELLED,
    label: 'Partly Cancelled',
    stage: 'Cancellation',
    meaning: 'Part of this trip has been cancelled — one leg of a return, say — and the rest is still booked.',
    whoActsNext: 'The travel desk.',
    whatHappensNext: 'The desk recovers what it can on the cancelled part. Your remaining tickets are unaffected.',
    employeeAction: 'Yes — check which legs are still booked and travel on those as planned.'
  },
  [PNCStatus.PENDING_REFUND]: {
    status: PNCStatus.PENDING_REFUND,
    label: 'Refund in Progress',
    stage: 'Refund',
    meaning: 'The booking is cancelled and the desk is chasing the refund with the airline or operator.',
    whoActsNext: 'The travel desk and the vendor.',
    whatHappensNext: 'Refunds usually take 7–10 working days. You will be emailed when it settles.',
    employeeAction: 'No — you do not need to chase this. Finance will contact you separately if any part is yours to settle.'
  },
  [PNCStatus.PARTIALLY_REFUNDED]: {
    status: PNCStatus.PARTIALLY_REFUNDED,
    label: 'Partly Refunded',
    stage: 'Refund',
    meaning: 'Some of the fare has come back. The rest is either still being chased or was not recoverable.',
    whoActsNext: 'The travel desk.',
    whatHappensNext: 'The desk pursues the balance, then closes the request.',
    employeeAction: null
  },
  [PNCStatus.FULLY_REFUNDED]: {
    status: PNCStatus.FULLY_REFUNDED,
    label: 'Fully Refunded',
    stage: 'Refund',
    meaning: 'The whole refundable amount has been recovered.',
    whoActsNext: 'The travel desk.',
    whatHappensNext: 'The request is reconciled and closed.',
    employeeAction: null
  },
  [PNCStatus.WRITTEN_OFF]: {
    status: PNCStatus.WRITTEN_OFF,
    label: 'No Refund Possible',
    stage: 'Refund',
    meaning: 'Nothing could be recovered on this booking, so the cost has been written off.',
    whoActsNext: 'The travel desk.',
    whatHappensNext: 'The request is reconciled and closed.',
    employeeAction: 'Possibly — if any share falls to you, Finance will have been in touch. Otherwise nothing.'
  },
  [PNCStatus.DISPUTED]: {
    status: PNCStatus.DISPUTED,
    label: 'Refund Disputed',
    stage: 'Refund',
    meaning: 'The desk disagrees with the vendor about what should come back, and Finance is involved.',
    whoActsNext: 'Finance and the travel desk.',
    whatHappensNext: 'Once settled, the request is reconciled and closed.',
    employeeAction: null
  },
  [PNCStatus.RECONCILED]: {
    status: PNCStatus.RECONCILED,
    label: 'Settled',
    stage: 'Refund',
    meaning: 'The money side of this trip is finished and the books agree.',
    whoActsNext: 'Nobody.',
    whatHappensNext: 'The request is closed.',
    employeeAction: null
  },
  [PNCStatus.CLOSED]: {
    status: PNCStatus.CLOSED,
    label: 'Closed',
    stage: 'Closed',
    meaning: 'This request is finished. Nothing further will happen on it.',
    whoActsNext: 'Nobody.',
    whatHappensNext: 'Nothing. The request stays here as a record.',
    employeeAction: 'Only if you paid for something yourself on this trip — submit those expenses.'
  },
  [PNCStatus.CLOSED_RECORDED]: {
    status: PNCStatus.CLOSED_RECORDED,
    label: 'Closed — Self-Booked',
    stage: 'Closed',
    meaning: 'You booked this trip yourself and it has been recorded here afterwards for the records.',
    whoActsNext: 'Nobody.',
    whatHappensNext: 'Nothing. The request stays here as a record.',
    employeeAction: 'Only if you are claiming the cost back — submit those expenses.'
  }
};

/** Stage order, for grouping the guide. */
export const STATUS_STAGES: StatusStage[] = [
  'Submitted',
  'Approval',
  'With the desk',
  'Booked',
  'Cancellation',
  'Refund',
  'Closed'
];

/**
 * The employee-facing name for a status.
 *
 * Falls back to the raw status for anything unrecognised, so a stage added to
 * the database before the guide catches up still renders something truthful.
 */
export const employeeStatusLabel = (status: PNCStatus | string): string =>
  STATUS_GUIDE[status as PNCStatus]?.label ?? String(status);

/** Statuses in a given stage, in declaration order. */
export const statusesInStage = (stage: StatusStage): StatusGuideEntry[] =>
  Object.values(STATUS_GUIDE).filter(entry => entry.stage === stage);

/** Stages where the request is finished and nothing more will happen. */
export const isClosedStatus = (status: PNCStatus | string): boolean =>
  STATUS_GUIDE[status as PNCStatus]?.stage === 'Closed';
