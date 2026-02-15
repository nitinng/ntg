
import { 
  TravelRequest, TripType, TravelMode, ApprovalStatus, PNCStatus, Priority, User, UserRole, VerificationStatus, IdProofType, PaymentStatus 
} from './types';

export const mockUsers: User[] = [
  { 
    id: 'u1', 
    name: 'Priyanka Dangwal', 
    email: 'priyanka@navgurukul.org', 
    role: UserRole.EMPLOYEE, 
    passportPhoto: { status: VerificationStatus.INCOMPLETE },
    idProof: { status: VerificationStatus.INCOMPLETE },
    team: 'Program Operations',
    department: 'Programs',
    campus: 'Pune',
    managerName: 'Kishore Kumar',
    managerEmail: 'kishore@navgurukul.org'
  },
  { 
    id: 'u2', 
    name: 'Verification Test User', 
    email: 'test.verify@navgurukul.org', 
    role: UserRole.EMPLOYEE, 
    passportPhoto: { status: VerificationStatus.PENDING, fileUrl: 'https://i.pravatar.cc/150?u=u2' },
    idProof: { status: VerificationStatus.PENDING, type: IdProofType.AADHAAR, fileUrl: '#' },
    team: 'Engineering',
    department: 'Tech',
    campus: 'Remote',
    managerName: 'Admin User',
    managerEmail: 'admin@navgurukul.org'
  },
  { 
    id: 'u3', 
    name: 'Nitin S.', 
    email: 'nitin.s@navgurukul.org', 
    role: UserRole.PNC,
    passportPhoto: { status: VerificationStatus.APPROVED, fileUrl: 'https://i.pravatar.cc/150?u=u3' },
    idProof: { status: VerificationStatus.APPROVED, fileUrl: '#' },
    team: 'Operations',
    department: 'Ops',
    campus: 'Delhi'
  },
  { 
    id: 'u5', 
    name: 'Finance User', 
    email: 'finance@navgurukul.org', 
    role: UserRole.FINANCE,
    passportPhoto: { status: VerificationStatus.APPROVED, fileUrl: 'https://i.pravatar.cc/150?u=u5' },
    idProof: { status: VerificationStatus.APPROVED, fileUrl: '#' },
    department: 'Finance',
    campus: 'Delhi'
  },
  { 
    id: 'u4', 
    name: 'Admin User', 
    email: 'admin@navgurukul.org', 
    role: UserRole.ADMIN,
    passportPhoto: { status: VerificationStatus.APPROVED, fileUrl: 'https://i.pravatar.cc/150?u=u4' },
    idProof: { status: VerificationStatus.APPROVED, fileUrl: '#' },
    department: 'Management',
    campus: 'Bangalore'
  }
];

const generateMockRequests = (): TravelRequest[] => {
  const requests: TravelRequest[] = [
    {
      id: 'TRV-O-251117-001',
      submissionId: 'GF-1001',
      timestamp: '2024-11-17T12:00:00Z',
      requesterId: 'u1',
      requesterName: 'Priyanka Dangwal',
      requesterEmail: 'priyanka@navgurukul.org',
      requesterPhone: '+91 8439167272',
      requesterDepartment: 'Programs',
      requesterCampus: 'Pune',
      purpose: 'Need Program support in Kishanganj',
      tripType: TripType.ONE_WAY,
      mode: TravelMode.FLIGHT,
      from: 'Mumbai',
      to: 'Bagdogra',
      dateOfTravel: '2025-11-26',
      numberOfTravelers: 1,
      approvalStatus: ApprovalStatus.APPROVED,
      pncStatus: PNCStatus.PROCESSING,
      priority: Priority.HIGH,
      hasViolation: true,
      violationDetails: 'Flight: Less than 15 days notice',
      lateBookingReason: 'Emergency program support needed',
      comments: ['Approved for urgent program need'],
      costCenter: 'CC-PROG-01',
      budgetCode: 'BDG-2025-Q4',
      timeline: [
        { id: 'e1', timestamp: '2024-11-17T12:00:00Z', actor: 'Priyanka Dangwal', event: 'Request Submitted' },
        { id: 'e3', timestamp: '2024-11-19T14:00:00Z', actor: 'Nitin S.', event: 'PNC Processing Started' }
      ]
    },
    {
      id: 'TRV-R-251110-015',
      submissionId: 'GF-0980',
      timestamp: '2024-10-10T10:00:00Z',
      requesterId: 'u1',
      requesterName: 'Priyanka Dangwal',
      requesterEmail: 'priyanka@navgurukul.org',
      requesterPhone: '+91 8439167272',
      requesterDepartment: 'Programs',
      requesterCampus: 'Pune',
      purpose: 'Standard visit to Delhi HQ',
      tripType: TripType.ROUND_TRIP,
      mode: TravelMode.TRAIN,
      from: 'Delhi',
      to: 'Bangalore',
      dateOfTravel: '2024-10-10',
      returnDate: '2024-10-15',
      numberOfTravelers: 1,
      approvalStatus: ApprovalStatus.APPROVED,
      pncStatus: PNCStatus.BOOKED_AND_CLOSED,
      priority: Priority.LOW,
      hasViolation: false,
      comments: [],
      pnr: 'PNR123456',
      vendorName: 'MakeMyTrip',
      ticketCost: 4500,
      invoiceNumber: 'INV-MMT-9988',
      paymentStatus: PaymentStatus.PAID,
      timeline: [
        { id: 'e4', timestamp: '2024-10-01T10:00:00Z', actor: 'Priyanka Dangwal', event: 'Request Submitted' },
        { id: 'e6', timestamp: '2024-10-02T15:00:00Z', actor: 'Nitin S.', event: 'Booked & Closed', details: 'Confirmed via Indian Railways' }
      ]
    },
    {
      id: 'TRV-O-251112-003',
      submissionId: 'GF-0999',
      timestamp: '2024-11-12T09:00:00Z',
      requesterId: 'u2',
      requesterName: 'Verification Test User',
      requesterEmail: 'test@navgurukul.org',
      requesterPhone: '+91 9999999999',
      requesterDepartment: 'Tech',
      requesterCampus: 'Remote',
      purpose: 'Team Offsite',
      tripType: TripType.ONE_WAY,
      mode: TravelMode.BUS,
      from: 'Jaipur',
      to: 'Delhi',
      dateOfTravel: '2024-11-20',
      numberOfTravelers: 5,
      approvalStatus: ApprovalStatus.PENDING,
      pncStatus: PNCStatus.NOT_STARTED,
      priority: Priority.MEDIUM,
      hasViolation: false,
      comments: [],
      timeline: [
        { id: 'e7', timestamp: '2024-11-12T09:00:00Z', actor: 'Verification Test User', event: 'Request Submitted' }
      ]
    }
  ];

  return requests;
};

export const initialRequests = generateMockRequests();
