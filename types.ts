export enum UserRole {
  EMPLOYEE = 'Employee',
  PNC = 'PNC',
  PNC_ADMIN = 'PNC Admin',
  FINANCE = 'Finance',
  ADMIN = 'Admin' // Treated as Super Admin
}

export enum VerificationStatus {
  INCOMPLETE = 'Incomplete',
  PENDING = 'Pending Verification',
  APPROVED = 'Approved',
  REJECTED = 'Rejected'
}

export enum IdProofType {
  AADHAAR = 'Aadhaar Card',
  PASSPORT = 'Passport',
  PAN = 'PAN Card',
  VOTER_ID = 'Voter ID',
  DRIVING_LICENSE = 'Driving License'
}

export interface UserDocument {
  type?: IdProofType;
  fileUrl?: string;
  status: VerificationStatus;
  rejectionReason?: string;
  uploadedAt?: string; // Timestamp when document was uploaded/saved
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  passportPhoto?: UserDocument;
  idProof?: UserDocument;
  skippedVerificationAt?: string; // Timestamp when user skipped verification
  // Professional details
  team?: string;
  managerName?: string;
  managerEmail?: string;
  department?: string;
  campus?: string;
  // Personal & Emergency details
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  bloodGroup?: string;
  medicalConditions?: string;
}

export enum TripType {
  ONE_WAY = 'One-way',
  ROUND_TRIP = 'Round-trip'
}

export enum TravelMode {
  FLIGHT = 'Flight',
  TRAIN = 'Train',
  BUS = 'Bus'
}

export enum ApprovalStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected'
}

export enum PNCStatus {
  NOT_STARTED = 'Not Started',
  APPROVAL_PENDING = 'Approval Pending',
  REJECTED_BY_MANAGER = 'Rejected by Manager',
  APPROVED = 'Approved',
  PROCESSING = 'Processing',
  ON_HOLD = 'On Hold',
  REJECTED_BY_PNC = 'Rejected by PNC',
  BOOKED = 'Booked',
  CANCELLED_BY_EMPLOYEE = 'Cancelled by Employee',
  CANCELLED_BY_PNC = 'Cancelled by PNC',
  CANCELLATION_REQUESTED = 'Cancellation Requested',
  CLOSED = 'Closed',

  // Stages added for the Travel Desk triggers sheet. All sit in the cancellation,
  // refund and reconciliation tail, which previously ended at "Cancelled by *".
  CANCELLED_BY_SYSTEM = 'Cancelled by System',
  ON_HOLD_ESCALATED = 'On Hold / Escalated',
  PARTIALLY_CANCELLED = 'Booked / Partially Cancelled',
  PENDING_REFUND = 'Pending Refund',
  PARTIALLY_REFUNDED = 'Partially Refunded',
  FULLY_REFUNDED = 'Fully Refunded',
  WRITTEN_OFF = 'Written Off',
  DISPUTED = 'Disputed',
  RECONCILED = 'Reconciled',
  CLOSED_RECORDED = 'Closed / Recorded - (self-booked)'
}

/**
 * Lifecycle stages that existed before the triggers-sheet migration. Kept so that
 * reporting and funnel views can stay on the original twelve without silently
 * gaining the refund tail.
 */
export const CORE_PNC_STATUSES: PNCStatus[] = [
  PNCStatus.NOT_STARTED,
  PNCStatus.APPROVAL_PENDING,
  PNCStatus.REJECTED_BY_MANAGER,
  PNCStatus.APPROVED,
  PNCStatus.PROCESSING,
  PNCStatus.ON_HOLD,
  PNCStatus.REJECTED_BY_PNC,
  PNCStatus.BOOKED,
  PNCStatus.CANCELLED_BY_EMPLOYEE,
  PNCStatus.CANCELLED_BY_PNC,
  PNCStatus.CANCELLATION_REQUESTED,
  PNCStatus.CLOSED
];

/** Stages that close a request with no further workflow. */
export const TERMINAL_PNC_STATUSES: PNCStatus[] = [
  PNCStatus.CLOSED,
  PNCStatus.CLOSED_RECORDED,
  PNCStatus.RECONCILED,
  PNCStatus.CANCELLED_BY_SYSTEM
];

/**
 * Trigger events from the "Travel Desk Stages- mails - Triggers.xlsx" Final tab.
 *
 * Emails are keyed on the event rather than the destination stage, because several
 * sheet rows land on the same stage and must say different things - rows 2, 12 and 18
 * all reach "Approval Pending"; rows 33 and 37 both reach "Cancelled by Employee" but
 * differ on whether money is owed.
 */
export enum TravelEvent {
  // Request creation and policy evaluation
  REQUEST_SUBMITTED = 'REQUEST_SUBMITTED',
  POLICY_VIOLATION_DETECTED = 'POLICY_VIOLATION_DETECTED',
  POLICY_EVALUATION_PASSED = 'POLICY_EVALUATION_PASSED',

  // Manager approval
  MANAGER_APPROVED = 'MANAGER_APPROVED',
  APPROVAL_COMPLETED = 'APPROVAL_COMPLETED',
  MANAGER_REJECTED = 'MANAGER_REJECTED',
  EMPLOYEE_CANCELLED_PRE_APPROVAL = 'EMPLOYEE_CANCELLED_PRE_APPROVAL',

  // Edit and resubmission
  REQUEST_EDIT_STARTED = 'REQUEST_EDIT_STARTED',
  REQUEST_RESUBMITTED = 'REQUEST_RESUBMITTED',

  // PNC processing
  PNC_REJECTED = 'PNC_REJECTED',
  PNC_STARTED_PROCESSING = 'PNC_STARTED_PROCESSING',
  INFO_REQUESTED = 'INFO_REQUESTED',
  INFO_PROVIDED = 'INFO_PROVIDED',
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',

  // Time-driven, raised by the reminder scan rather than by a user action
  INFO_REQUEST_REMINDER_24H = 'INFO_REQUEST_REMINDER_24H',
  INFO_REQUEST_REMINDER_72H = 'INFO_REQUEST_REMINDER_72H',
  INFO_REQUEST_ESCALATED = 'INFO_REQUEST_ESCALATED',
  INFO_REQUEST_EXPIRED = 'INFO_REQUEST_EXPIRED',

  // Booking maintenance
  BOOKING_UPDATED = 'BOOKING_UPDATED',
  TICKET_DOCUMENT_REPLACED = 'TICKET_DOCUMENT_REPLACED',
  BOOKING_DETAIL_EDITED = 'BOOKING_DETAIL_EDITED',

  // Cancellation
  CANCELLATION_REQUESTED = 'CANCELLATION_REQUESTED',
  CANCELLATION_REQUEST_ASSIGNED = 'CANCELLATION_REQUEST_ASSIGNED',
  CANCELLATION_PROCESSED_EMPLOYEE = 'CANCELLATION_PROCESSED_EMPLOYEE',
  CANCELLATION_CLOSED_PRE_BOOKING = 'CANCELLATION_CLOSED_PRE_BOOKING',
  PNC_CANCELLATION = 'PNC_CANCELLATION',
  PARTIAL_CANCELLATION = 'PARTIAL_CANCELLATION',

  // Refund and reconciliation
  REFUND_PROCESS_STARTED = 'REFUND_PROCESS_STARTED',
  NO_REFUND_REQUIRED = 'NO_REFUND_REQUIRED',
  SEGMENT_REFUND_PENDING = 'SEGMENT_REFUND_PENDING',
  SEGMENT_REFUND_COMPLETED = 'SEGMENT_REFUND_COMPLETED',
  PARTIAL_REFUND_RECEIVED = 'PARTIAL_REFUND_RECEIVED',
  REFUND_COMPLETED = 'REFUND_COMPLETED',
  REFUND_WRITTEN_OFF = 'REFUND_WRITTEN_OFF',
  REFUND_DISPUTED = 'REFUND_DISPUTED',
  REFUND_RECONCILIATION_COMPLETED = 'REFUND_RECONCILIATION_COMPLETED',

  // Completion
  TRAVEL_DATE_REACHED = 'TRAVEL_DATE_REACHED',
  TRIP_COMPLETED = 'TRIP_COMPLETED',

  // Retroactive / self-booked
  RETROACTIVE_BOOKING_RECORDED = 'RETROACTIVE_BOOKING_RECORDED',
  BOOKING_DOCUMENT_UPDATED = 'BOOKING_DOCUMENT_UPDATED'
}

/** Who a lifecycle mail is addressed to. */
export type EmailAudience = 'employee' | 'manager' | 'pnc' | 'finance' | 'escalation_owner';

/**
 * Discriminator for sheet rows that share an (event, audience) pair but carry
 * different copy. `undefined` selects the fallback template for that pair.
 */
export type EmailContextKey =
  | 'post_booking'
  | 'resubmit_after_manager_rejection'
  | 'resubmit_after_pnc_rejection'
  | 'after_partial_refund'
  | 'after_write_off'
  // Reconciliation reached from a desk-initiated cancellation rather than an
  // employee-initiated one. Same event, same audience, different blame.
  | 'pnc_cancellation';

/** How a template's CC list is assembled from the routing settings. */
export type EmailCcRule =
  | 'default'
  | 'default_finance'
  | 'default_manager'
  | 'default_manager_if_approved'
  | 'manager'
  | 'none';

export enum Priority {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low'
}

export enum PaymentStatus {
  PENDING = 'Pending',
  PAID = 'Paid',
  REIMBURSED = 'Reimbursed',
  NA = 'N/A'
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  actor: string;
  event: string;
  details?: string;
}

export interface TravelRequest {
  // Google Form / Input Fields
  id: string; // Booking ID
  submissionId?: string; // Form Submission ID
  timestamp: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requesterCampus?: string;
  requesterDepartment?: string;
  requesterPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  bloodGroup: string;
  medicalConditions?: string;

  purpose: string;
  approvingManagerName?: string;
  approvingManagerEmail?: string;
  /** Fallbacks used when a request predates the approvingManager* fields. */
  managerName?: string;
  managerEmail?: string;
  /** Set when a manager records an approval. Gates the manager CC on sheet row 40. */
  managerApprovalDate?: string;
  tripType: TripType;
  mode: TravelMode;
  from: string;
  to: string;
  dateOfTravel: string;
  preferredDepartureWindow?: string;
  returnDate?: string;
  returnPreferredDepartureWindow?: string;
  numberOfTravelers: number;
  travellerNames?: string;
  priority: Priority;
  specialRequirements?: string;

  // Compliance & Approvals
  approvalStatus: ApprovalStatus;
  pncStatus: PNCStatus;
  hasViolation: boolean;
  violationDetails?: string;
  lateBookingReason?: string;
  statusChangeReason?: string;
  resubmissionCount?: number;
  onHoldSince?: string;
  cancelledReason?: string;
  infoRequested?: string;
  employeeResponse?: string;

  // Added for linking to Advances
  advanceId?: string;

  // Finance & PNC Tracker Data
  costCenter?: string;
  budgetCode?: string;
  vendorName?: string;
  ticketCost?: number;
  invoiceNumber?: string;
  paymentStatus?: PaymentStatus;

  // Cancellation, refund and reconciliation. Added for the triggers sheet - the
  // settlement mails (rows 46-53) interpolate these directly.
  originalFare?: number;
  refundAmount?: number;
  expectedRefund?: number;
  writtenOffAmount?: number;
  employeeOwedAmount?: number;
  orgAbsorbedAmount?: number;
  cancellationCharge?: number;
  /** Human-readable segment lists for the partial-cancellation mails (rows 43, 45). */
  cancelledSegments?: string;
  activeSegments?: string;
  /** What changed on a material booking update (row 29). */
  changeSummary?: string;
  /** When the request went on hold awaiting information. Drives the reminder scan. */
  infoRequestedAt?: string;
  escalatedAt?: string;

  // System
  timeline: TimelineEvent[];
  pnr?: string;
  /** Vendor booking reference / PNR shown to the traveller. */
  bookingReference?: string;
  travelLegs?: TravelLeg[];
  invoiceUrl?: string;
  bookedBy?: string; // 'PNC' or 'SELF'
  paymentSource?: 'Advance' | 'Direct' | 'Not Yet Entered';
  bookingStatus?: 'Booked' | 'Cancelled' | 'Partially Cancelled' | 'Reconciled';
}

export interface TravelLeg {
  id: string; // uuid
  travelRequestId: string;
  fromLocation: string;
  toLocation: string;
  travelMode: TravelMode;
  vendorName: string;
  ticketCost: number;
  /** Per-segment vendor booking reference. */
  pnr?: string;
  invoiceUrl?: string;
  status: 'Active' | 'Cancelled';
  cancelledBy?: 'Employee' | 'Org' | 'Vendor';
  cancellationReason?: string;
  advanceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CancellationRecord {
  id: string;
  travelRequestId: string;
  legId?: string; // optional for full booking cancellation
  cancelledBy: 'Employee' | 'Org';
  cancellationDate: string;
  policyNavgurukulCoverPercent: number;
  policyEmployeeCoverPercent: number;
  originalFare: number;
  netUnrecoveredAmount: number;
  employeeOwedAmount: number;
  orgAbsorbedAmount: number;
  status: 'Pending Refund' | 'Partially Refunded' | 'Fully Refunded' | 'Written Off' | 'Reconciled' | 'Disputed';
  advanceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RefundEntry {
  id: string;
  cancellationRecordId: string;
  amount: number;
  dateReceived: string;
  receiptUrl?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PolicyConfig {
  flightNoticeDays: number;
  trainNoticeDays: number;
  busNoticeDays: number;
  autoApproveBelowAmount: number;
  // Onboarding Toggles
  isPassportRequired: boolean;
  isIdRequired: boolean;
  isEnforcementEnabled: boolean;
  temporaryUnlockDays: number; // Days to unlock access after document upload, even without approval
  // Turnaround Time (TAT) in hours
  tatApprovalHours: number;
  tatProcessingHours: number;
  tatBookingHours: number;
  // Cancellation Policy
  cancellationPncNgCover: number;
  cancellationPncEmpCover: number;
  cancellationEmpNgCover: number;
  cancellationEmpEmpCover: number;
  // Booking Urgency & Priority Configuration
  urgencyThresholds?: {
    criticalDays: number; // Critical if < criticalDays (default 2)
    highDays: number;     // High if between criticalDays and highDays (default 10)
    mediumDays: number;   // Medium if between highDays and mediumDays (default 20)
  };
  allowRequesterUrgency?: boolean;
  autoEscalateUrgentDays?: number;
  enableUrgencySla?: boolean; // When true, ticketing SLA targets are driven by urgency tiers instead of generic TAT
  urgencySlaHours?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface TravelModePolicy {
  id: string;
  travelMode: TravelMode;
  minAdvanceDays: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type MailTemplateStatus = 'Draft' | 'Published' | 'Archived';

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string; // HTML supported
  /** @deprecated Superseded by `event`. Retained so pre-migration templates still render. */
  statusTrigger: string;
  isDraft: boolean;
  status: MailTemplateStatus;
  version: number;
  audience: EmailAudience;
  createdAt: string;
  updatedAt: string;

  /** Stable identifier, e.g. `booking_confirmed.employee.default`. */
  templateKey: string;
  /** The trigger this template answers. Null only on legacy, pre-migration rows. */
  event: TravelEvent | null;
  /** Discriminator when several templates share an (event, audience) pair. */
  contextKey: EmailContextKey | null;
  /** Documentation and UI display only - resolution uses contextKey, not these. */
  fromStatus: string | null;
  toStatus: string | null;
  ccRule: EmailCcRule;
  isActive: boolean;
  /** Row number in the source triggers sheet; null for hand-authored templates. */
  sheetRow: string | null;
  /** The sheet's own note on why this mail exists and what it must say. */
  sheetSummary: string | null;
}

/** A configurable routing default (default CC, Finance CC, escalation owners, SLA windows). */
export interface EmailRoutingSetting {
  key: string;
  value: string[] | string | number | boolean;
  label: string;
  description: string | null;
  valueType: 'email_list' | 'number' | 'text' | 'boolean';
  group: 'routing' | 'reminders';
  sortOrder: number;
  updatedAt: string;
  updatedBy: string | null;
}

/** Resolved, typed view of the routing settings used when queueing a mail. */
export interface EmailRoutingConfig {
  defaultCc: string[];
  financeCc: string[];
  escalationOwners: string[];
  pncQueueCc: string[];
  supportEmail: string;
  portalUrl: string;
  infoReminderFirstHours: number;
  infoReminderFinalHours: number;
  infoEscalationDays: number;
  infoExpiryDays: number;
  remindersEnabled: boolean;
}

export interface MailTemplateHistory {
  id: string;
  templateId: string;
  templateName: string;
  changedBy: string;
  changedAt: string;
  action: 'Created' | 'Edited' | 'Published' | 'Moved to Draft' | 'Archived' | 'Restored';
  previousSubject?: string;
  newSubject?: string;
  previousBody?: string;
  newBody?: string;
  previousStatus?: string;
  newStatus?: string;
  version: number;
}

export interface MeetupApprover {
  id: string;
  email: string;
  name?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MeetupAvailabilityRequest {
  id: string;
  profileId: string;
  fullName: string;
  email: string;
  phone: string;
  department?: string;
  teamSize: number;
  startDate: string;
  endDate: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEvent[];
  attendeeEmails?: string[];
  isFinalized?: boolean;
}

export enum ChatThreadType {
  EXISTING_REQUEST = 'Existing Request',
  FUTURE_REQUEST = 'Future Request',
  OTHERS = 'Others'
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  timestamp: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
}

export interface ChatThread {
  id: string;
  type: ChatThreadType;
  relatedRequestId?: string; // Optional if FUTURE_REQUEST or OTHERS
  employeeId?: string; // The user ID of the employee this thread is for
  employeeName?: string;
  title: string;
  status: 'active' | 'archived';
  lastReadEmployee?: string;
  lastReadPnc?: string;

  participantIds: string[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceChangelogEntry {
  timestamp: string;
  user: string; // The name or ID of the user making the change
  action: 'Created' | 'Edited' | 'Ticket Purchased' | 'Refund Received';
  details: string;
  relatedTicketId?: string; // Storing the UUID
  relatedTicketSubmissionId?: string; // Storing the readable TRV- ID
}

export interface Advance {
  id: string;
  advance_code?: string;
  amount_received: number;
  amount_left: number;
  received_from: string;
  received_by?: string; // UUID of PNC user
  received_on: string;
  is_settled: boolean;
  receipt_id?: string;
  comments?: string;
  changelog: AdvanceChangelogEntry[];
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  hod_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TestingSettings {
  admin: boolean;
  pnc: boolean;
  employee: boolean;
}
