export enum UserRole {
  EMPLOYEE = 'Employee',
  PNC = 'PNC',
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
  CLOSED = 'Closed'
}

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

  // System
  timeline: TimelineEvent[];
  pnr?: string;
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
  statusTrigger: string; // e.g., 'Approved', 'Rejected'
  isDraft: boolean;
  status: MailTemplateStatus;
  version: number;
  audience: 'employee' | 'manager' | 'pnc';
  createdAt: string;
  updatedAt: string;
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
