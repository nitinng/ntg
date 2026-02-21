
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
  BOOKED = 'Booked',
  REJECTED_BY_PNC = 'Rejected by PNC',
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
  comments: string[];

  // Finance & PNC Tracker Data
  costCenter?: string;
  budgetCode?: string;
  vendorName?: string;
  ticketCost?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  paymentStatus?: PaymentStatus;

  // System
  timeline: TimelineEvent[];
  pnr?: string;
  vendorRef?: string;
  ticketUrl?: string;
  invoiceUrl?: string;
  bookedBy?: string; // 'PNC' or 'SELF'
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
}

export interface TravelModePolicy {
  id: string;
  travelMode: TravelMode;
  minAdvanceDays: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string; // HTML supported
  statusTrigger: string; // e.g., 'Approved', 'Rejected'
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
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
