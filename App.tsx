
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TravelRequest, PNCStatus, Priority, TravelMode, UserRole, User, TripType, ApprovalStatus, PolicyConfig, VerificationStatus, IdProofType, PaymentStatus, UserDocument
} from './types';
import { mockUsers, initialRequests } from './mockData';
import StatusBadge from './components/StatusBadge';
import Input from './components/Input';
import NewRequestModal from './components/NewRequestModal';
import AuthView from './components/AuthView';
import Select from './components/Select';
import TextArea from './components/TextArea';
import { supabase } from './supabaseClient';
import { Toaster, toast } from 'sonner';



// --- UI Utility Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 ${className}`}>
    {children}
  </div>
);

const StatCard = ({ title, value, icon, description, trend, trendUp }: any) => (
  <Card className="p-6">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <div className="text-indigo-600 dark:text-indigo-400 opacity-60 text-lg">{icon}</div>
    </div>
    <div className="flex items-baseline gap-2">
      <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</h3>
      {trend && (
        <span className={`text-2xs font-bold ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
          {trend}
        </span>
      )}
    </div>
    {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
  </Card>
);



// --- Chart Components (CSS based) ---

const BarChart = ({ data, color = 'bg-indigo-500' }: { data: { label: string, value: number }[], color?: string }) => {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div className="flex items-end justify-between h-32 gap-2 pt-4">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center group">
          <div className="relative w-full flex justify-center">
            <div
              className={`w-full max-w-[2rem] rounded-t-sm transition-all duration-500 group-hover:opacity-80 ${color}`}
              style={{ height: `${(d.value / max) * 100}%` }}
            ></div>
            <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded pointer-events-none">
              {d.value}
            </div>
          </div>
          <span className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// --- Shared Components ---

const Navbar = ({ currentUser, baseRole, onToggleRole, onOpenProfile }: { currentUser: User, baseRole: UserRole | null, onToggleRole: (role: UserRole) => void, onOpenProfile: () => void }) => {
  const getVisibleRoles = () => {
    if (baseRole === UserRole.ADMIN) return Object.values(UserRole);
    if (baseRole === UserRole.PNC) return [UserRole.EMPLOYEE, UserRole.PNC, UserRole.FINANCE];
    if (baseRole === UserRole.FINANCE) return [UserRole.EMPLOYEE, UserRole.FINANCE];
    return [];
  };

  const visibleRoles = getVisibleRoles();

  return (
    <nav className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40 transition-colors duration-300">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-600/20">N</div>
        <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 hidden md:block tracking-tight">Navgurukul Travel Desk</h1>
        {visibleRoles.length > 0 && (
          <div className="ml-4 flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors duration-300">
            {visibleRoles.map(role => (
              <button
                key={role}
                onClick={() => onToggleRole(role)}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-300 ${currentUser.role === role ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {role}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <div className="text-right hidden sm:block">
            <p className="text-base font-bold text-slate-800 dark:text-white leading-none">{currentUser.name}</p>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-tighter font-medium">{currentUser.role} View</p>
          </div>
          <button
            onClick={onOpenProfile}
            className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl overflow-hidden border-2 border-transparent hover:border-indigo-500/20 flex items-center justify-center transition-all"
          >
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : currentUser.passportPhoto?.fileUrl ? (
              <img src={currentUser.passportPhoto.fileUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              currentUser.name.charAt(0)
            )}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-600 transition-colors"
            title="Sign Out"
          >
            <i className="fa-solid fa-right-from-bracket text-lg"></i>
          </button>
        </div>
      </div>
    </nav >
  );
};

const SidebarLink = ({ icon, label, active, onClick, badge }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
    <i className={`fa-solid ${icon} w-5 ${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'}`}></i>
    <span className="flex-1 text-left">{label}</span>
    {badge && <span className="text-2xs bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-bold">{badge}</span>}
  </button>
);

const Toggle = ({ active, onChange }: { active: boolean, onChange: () => void }) => (
  <button onClick={onChange} className={`w-11 h-6 rounded-full relative transition-all duration-300 active:scale-95 ${active ? 'bg-indigo-600 ring-2 ring-indigo-500/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300 ${active ? 'right-1' : 'left-1'}`}></div>
  </button>
);

// --- Constants ---
const WELCOME_NOTES = [
  "Ready for your next adventure?",
  "Let's get you where you need to be.",
  "Your travel, our priority.",
  "Smooth travels start here.",
  "Where to next, explorer?",
  "Making every journey count.",
  "Safe travels and happy journeys!",
  "Your gateway to Navgurukul campuses."
];

// --- Shared Components ---

const AdminDashboard = ({ requests, users, onTabChange }: any) => {
  const pendingCount = requests.filter((r: TravelRequest) => r.approvalStatus === ApprovalStatus.PENDING).length;
  const criticalCount = requests.filter((r: TravelRequest) => r.priority === Priority.CRITICAL).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Admin Overview</h2>
          <p className="text-slate-500 text-sm mt-1">System-wide performance metrics and controls.</p>
        </div>
        <button onClick={() => onTabChange('requests')} className="bg-slate-900 dark:bg-slate-800 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all active:scale-95">View Queue</button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Users" value={users.length} icon={<i className="fa-solid fa-users"></i>} description="Active accounts" />
        <StatCard title="Pending Approvals" value={pendingCount} icon={<i className="fa-solid fa-clock"></i>} description="Needs attention" />
        <StatCard title="Critical Trips" value={criticalCount} icon={<i className="fa-solid fa-triangle-exclamation"></i>} trendUp={false} description="High priority" />
      </div>

      <Card className="p-6">
        <h4 className="font-bold text-slate-800 dark:text-white mb-4">Recent Activity</h4>
        <div className="space-y-4">
          {requests.slice(0, 5).map((r: TravelRequest) => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{r.requesterName}</p>
                <p className="text-xs text-slate-500">{r.from} → {r.to}</p>
              </div>
              <StatusBadge type="pnc" value={r.pncStatus} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const PNCDashboard = ({ requests, onTabChange }: any) => {
  const processing = requests.filter((r: TravelRequest) => r.pncStatus === PNCStatus.PROCESSING).length;
  const newReqs = requests.filter((r: TravelRequest) => r.pncStatus === PNCStatus.NOT_STARTED).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">PNC Operations</h2>
          <p className="text-slate-500 text-sm mt-1">Manage transport bookings and fulfillment steps.</p>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="New Requests" value={newReqs} icon={<i className="fa-solid fa-bell"></i>} trend="+2" trendUp={true} />
        <StatCard title="Processing" value={processing} icon={<i className="fa-solid fa-spinner"></i>} />
        <StatCard title="Completed (M)" value={requests.filter((r: TravelRequest) => r.pncStatus === PNCStatus.BOOKED_AND_CLOSED).length} icon={<i className="fa-solid fa-check-double"></i>} />
        <StatCard title="Avg Turnaround" value="4h" icon={<i className="fa-solid fa-stopwatch"></i>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <h4 className="font-bold text-slate-800 dark:text-white mb-6">Queue Overview</h4>
          <BarChart data={[
            { label: 'New', value: newReqs },
            { label: 'Processing', value: processing },
            { label: 'Done', value: requests.filter((r: TravelRequest) => r.pncStatus === PNCStatus.BOOKED_AND_CLOSED).length }
          ]} />
        </Card>
        <Card className="p-6 flex flex-col justify-center items-center text-center space-y-4">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-full flex items-center justify-center text-2xl"><i className="fa-solid fa-list-check"></i></div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-white">Process Queue</h4>
            <p className="text-xs text-slate-500 mt-1">Start working on pending bookings</p>
          </div>
          <button onClick={() => onTabChange('requests')} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-bold">Go to Queue</button>
        </Card>
      </div>
    </div>
  );
};

const FinanceDashboard = ({ requests }: any) => {
  const totalSpend = requests.reduce((acc: number, r: TravelRequest) => acc + (r.ticketCost || 0), 0);
  const pendingPayment = requests.filter((r: TravelRequest) => r.paymentStatus === PaymentStatus.PENDING).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Financial Overview</h2>
        <p className="text-slate-500 text-sm mt-1">Monitor budget utilization and travel spend.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Spend" value={`₹${totalSpend.toLocaleString()}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} />
        <StatCard title="Pending Invoices" value={pendingPayment} icon={<i className="fa-solid fa-file-invoice-dollar"></i>} trendUp={false} trend="Needs Action" />
        <StatCard title="Avg Ticket Cost" value={`₹${requests.length ? Math.round(totalSpend / requests.length) : 0}`} icon={<i className="fa-solid fa-calculator"></i>} />
      </div>
      <Card className="p-6">
        <h4 className="font-bold text-slate-800 dark:text-white mb-4">Cost Center Allocation</h4>
        <div className="h-48 flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-xl">
          Chart placeholder: Spend distribution by department
        </div>
      </Card>
    </div>
  );
};

const PolicyManagement = ({ policy, setPolicy }: any) => {
  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Policy Configuration</h2>
        <p className="text-slate-500 text-sm mt-1">Define global constraints and automated guardrails.</p>
      </header>

      <Card className="p-8 space-y-8">
        <div className="space-y-6">
          <h4 className="font-bold text-slate-800 dark:text-white border-b pb-2 dark:border-slate-800">Notice Periods (Days)</h4>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Flight" type="number" value={policy.flightNoticeDays} onChange={(e: any) => setPolicy({ ...policy, flightNoticeDays: parseInt(e.target.value) })} />
            <Input label="Train" type="number" value={policy.trainNoticeDays} onChange={(e: any) => setPolicy({ ...policy, trainNoticeDays: parseInt(e.target.value) })} />
            <Input label="Bus" type="number" value={policy.busNoticeDays} onChange={(e: any) => setPolicy({ ...policy, busNoticeDays: parseInt(e.target.value) })} />
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="font-bold text-slate-800 dark:text-white border-b pb-2 dark:border-slate-800">Compliance & Limits</h4>
          <Input label="Auto-approval Limit (₹)" type="number" value={policy.autoApproveBelowAmount} onChange={(e: any) => setPolicy({ ...policy, autoApproveBelowAmount: parseInt(e.target.value) })} />

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Enforce Verification</p>
              <p className="text-xs text-slate-500">Require documents before booking</p>
            </div>
            <Toggle active={policy.isEnforcementEnabled} onChange={() => setPolicy({ ...policy, isEnforcementEnabled: !policy.isEnforcementEnabled })} />
          </div>

          {policy.isEnforcementEnabled && (
            <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-unlock text-indigo-600 dark:text-indigo-400 mt-1"></i>
                <div className="flex-1">
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Temporary Unlock Duration</p>
                  <p className="text-xs text-slate-500 mt-1">Allow access for a set number of days after document upload, even without approval. After this period, access is locked until documents are approved.</p>
                </div>
              </div>
              <Input
                label="Unlock Duration (Days)"
                type="number"
                min="1"
                max="30"
                value={policy.temporaryUnlockDays}
                onChange={(e: any) => setPolicy({ ...policy, temporaryUnlockDays: parseInt(e.target.value) || 7 })}
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

const UserRoleManagement = ({ users, onUpdateUser }: { users: User[], onUpdateUser: (u: User) => void }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredUsers = useMemo(() => {
    return users.filter(user =>
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Role Management</h2>
          <p className="text-slate-500 text-sm mt-1">Manage user roles and system access permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 hover:text-indigo-600 transition-all shadow-sm"
            title="Refresh Data"
          >
            <i className="fa-solid fa-sync"></i>
          </button>
          <div className="relative w-full md:w-80">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
            />
          </div>
        </div>
      </header>

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                <th className="px-8 py-6">User Details</th>
                <th className="px-8 py-6">Status / Role</th>
                <th className="px-8 py-6 text-right">Update Access</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {paginatedUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 bg-indigo-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center font-black text-indigo-600 border border-slate-100 dark:border-slate-700 shadow-sm group-hover:scale-105 transition-transform">
                        {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover rounded-2xl" /> : user.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white leading-tight">{user.name}</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <StatusBadge type="status" value={user.role} />
                  </td>
                  <td className="px-8 py-5 text-right">
                    <select
                      value={user.role}
                      onChange={(e) => onUpdateUser({ ...user, role: e.target.value as UserRole })}
                      className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-black text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-sm hover:border-slate-300 transition-colors"
                    >
                      {Object.values(UserRole).map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination & Controls */}
        <div className="px-8 py-6 bg-slate-50/50 dark:bg-slate-800/30 border-t dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
              {filteredUsers.length > 0 ? (
                <>Showing <span className="text-slate-700 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> of {filteredUsers.length}</>
              ) : "No users found"}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Rows</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 dark:text-white outline-none"
              >
                {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-xl text-xs font-black transition-all ${currentPage === page ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const OnboardingView = ({ user, policy, onUpdate, isLock, onSkip }: any) => {
  const [formData, setFormData] = useState(user);

  // Profile Section Helper
  const Section = ({ title, children, icon }: { title: string, children: React.ReactNode, icon?: string }) => (
    <div className="space-y-6 pt-6 first:pt-0">
      <div className="flex items-center gap-3 border-b dark:border-slate-800 pb-3">
        {icon && <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center"><i className={`fa-solid ${icon}`}></i></div>}
        <h4 className="font-bold text-slate-800 dark:text-white text-lg">{title}</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {children}
      </div>
    </div>
  );

  // Sub-section Header Helper
  const SubHeader = ({ title }: { title: string }) => (
    <div className="md:col-span-2">
      <h5 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{title}</h5>
    </div>
  );

  // Calculate profile completeness (excluding email)
  const calculateCompleteness = () => {
    let completed = 0;
    const total = 11; // 11 key fields for full profile

    if (formData.name && formData.name.trim() !== '') completed++;
    if (formData.department && formData.department.trim() !== '') completed++;
    if (formData.campus && formData.campus.trim() !== '') completed++;
    if (formData.managerName && formData.managerName.trim() !== '') completed++;
    if (formData.managerEmail && formData.managerEmail.trim() !== '') completed++;
    if (formData.passportPhoto?.fileUrl) completed++;
    if (formData.idProof?.fileUrl) completed++;
    if (formData.phone && formData.phone.trim() !== '') completed++;
    if (formData.emergencyContactName && formData.emergencyContactName.trim() !== '') completed++;
    if (formData.emergencyContactPhone && formData.emergencyContactPhone.trim() !== '') completed++;
    if (formData.bloodGroup && formData.bloodGroup.trim() !== '') completed++;

    return Math.round((completed / total) * 100);
  };

  const completeness = calculateCompleteness();

  const calculateDaysRemaining = (doc?: UserDocument) => {
    if (!doc?.uploadedAt || !doc?.fileUrl) return null;
    if (doc.status === VerificationStatus.APPROVED) return null;
    if (doc.status === VerificationStatus.REJECTED) return null;

    const uploadedDate = new Date(doc.uploadedAt);
    const now = new Date();
    const daysSinceUpload = (now.getTime() - uploadedDate.getTime()) / (1000 * 60 * 60 * 24);
    const daysRemaining = Math.max(0, policy.temporaryUnlockDays - daysSinceUpload);
    return Math.ceil(daysRemaining);
  };

  const minDaysRemaining = useMemo(() => {
    const pDays = calculateDaysRemaining(formData.passportPhoto);
    const iDays = calculateDaysRemaining(formData.idProof);
    if (pDays === null && iDays === null) return null;
    if (pDays === null) return iDays;
    if (iDays === null) return pDays;
    return Math.min(pDays, iDays);
  }, [formData.passportPhoto, formData.idProof, policy.temporaryUnlockDays]);

  const [isUploading, setIsUploading] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'avatar' | 'passportPhoto' | 'idProof') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Max size is 5MB.");
      return;
    }

    setIsUploading(field);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${field}_${Date.now()}.${fileExt}`;
      const filePath = `${formData.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('user-documents')
        .getPublicUrl(filePath);

      if (field === 'avatar') {
        setFormData({ ...formData, avatar: publicUrl });
      } else {
        const currentDoc = formData[field] || { status: VerificationStatus.INCOMPLETE };
        setFormData({
          ...formData,
          [field]: {
            ...currentDoc,
            fileUrl: publicUrl,
            status: VerificationStatus.PENDING,
            uploadedAt: new Date().toISOString()
          }
        });
      }
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')} uploaded!`);
    } catch (err: any) {
      console.error("Upload fail:", err);
      toast.error("Upload failed: " + (err.message || "Please check if 'user-documents' bucket exists."));
    } finally {
      setIsUploading(null);
    }
  };

  const handleSave = () => {
    const phoneRegex = /^\d{10}$/;
    if (formData.phone && !phoneRegex.test(formData.phone)) {
      toast.error("Contact Number must be exactly 10 digits");
      return;
    }
    if (formData.emergencyContactPhone && !phoneRegex.test(formData.emergencyContactPhone)) {
      toast.error("Emergency Contact Number must be exactly 10 digits");
      return;
    }

    onUpdate(formData);
    toast.success("Profile updated successfully");
  };

  const bloodGroupOptions = [
    { label: 'A+', value: 'A+' }, { label: 'A-', value: 'A-' },
    { label: 'B+', value: 'B+' }, { label: 'B-', value: 'B-' },
    { label: 'O+', value: 'O+' }, { label: 'O-', value: 'O-' },
    { label: 'AB+', value: 'AB+' }, { label: 'AB-', value: 'AB-' }
  ];

  return (
    <div className={`space-y-8 animate-in fade-in duration-500 pb-20 ${isLock ? 'w-full max-w-3xl mx-auto' : ''}`}>
      <header className="flex flex-col md:flex-row items-center gap-8 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative group">
          <div className={`w-32 h-32 bg-indigo-50 dark:bg-slate-800 rounded-full overflow-hidden border-4 border-white dark:border-slate-900 shadow-xl transition-all group-hover:brightness-90 flex items-center justify-center ${isUploading === 'avatar' ? 'animate-pulse' : ''}`}>
            {isUploading === 'avatar' ? (
              <i className="fa-solid fa-spinner fa-spin text-indigo-600 text-3xl"></i>
            ) : formData.avatar ? (
              <img src={formData.avatar} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400">{formData.name?.charAt(0) || 'U'}</span>
            )}
          </div>
          <label className="absolute bottom-1 right-1 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-900 transform group-hover:scale-110 transition-all cursor-pointer">
            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'avatar')} disabled={!!isUploading} />
            <i className="fa-solid fa-camera text-sm"></i>
          </label>
        </div>

        <div className="flex-1 text-center md:text-left space-y-2">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{isLock ? 'Getting Started' : 'Account Profile'}</h2>
          <p className="text-slate-500 text-sm font-medium">{isLock ? 'Please complete your profile to enable travel booking features.' : 'Maintain your personal, professional and identity information.'}</p>

          <div className="mt-6">
            <div className="flex justify-between items-end mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Profile Completeness</span>
              <span className={`text-xs font-bold leading-none ${completeness === 100 ? 'text-emerald-500' : 'text-indigo-600'}`}>{completeness}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ease-out ${completeness === 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.4)]'}`}
                style={{ width: `${completeness}%` }}
              ></div>
            </div>
          </div>
        </div>
      </header>

      {/* Warnings & Notices */}
      <div className="space-y-4">
        {isLock && onSkip && policy.isEnforcementEnabled && !minDaysRemaining && (
          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                <i className="fa-solid fa-forward-step text-xl text-indigo-500"></i>
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800 dark:text-white">Need to book travel immediately?</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">You can temporarily skip verification for {policy.temporaryUnlockDays} days. After this window, full verification will be required to maintain access.</p>
              </div>
            </div>
            <button onClick={onSkip} className="whitespace-nowrap px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 rounded-xl text-xs font-black uppercase hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 transition-all shadow-sm active:scale-95">Skip for Now</button>
          </div>
        )}

        {policy.isEnforcementEnabled && minDaysRemaining !== null && minDaysRemaining > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-5 flex items-start gap-4 animate-in slide-in-from-top-2">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
              <i className="fa-solid fa-hourglass-half"></i>
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-amber-800 dark:text-amber-400">Temporary Access Period Active</p>
              <p className="text-xs text-amber-700 dark:text-amber-500/80 mt-1 leading-relaxed">
                You have <span className="font-bold underline decoration-2">{minDaysRemaining} day{minDaysRemaining !== 1 ? 's' : ''}</span> remaining to use the travel desk while your documents are under review.
              </p>
            </div>
          </div>
        )}

        {policy.isEnforcementEnabled && minDaysRemaining === 0 && (
          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
              <i className="fa-solid fa-lock"></i>
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-rose-800 dark:text-rose-400">Temporary Access Expired</p>
              <p className="text-xs text-rose-700 dark:text-rose-500/80 mt-1 leading-relaxed">
                Your grace period has ended. Access to booking features will be restored automatically once your identity documents are approved by the PNC team.
              </p>
            </div>
          </div>
        )}
      </div>

      <Card className="p-8 md:p-12 space-y-12">
        {/* Personal Details */}
        <Section title="Personal Details" icon="fa-user-gear">
          <Input label="Full Name" value={formData.name} onChange={(e: any) => setFormData({ ...formData, name: e.target.value })} />
          <Input label="Email Address" value={formData.email} disabled placeholder="From authentication" />
          <Input label="Contact Number" value={formData.phone || ''} placeholder="10 digit number" onChange={(e: any) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
        </Section>

        {/* Org Details */}
        <Section title="Org Details" icon="fa-briefcase">
          <Input label="Department" value={formData.department || ''} onChange={(e: any) => setFormData({ ...formData, department: e.target.value })} />
          <Input label="Campus" value={formData.campus || ''} onChange={(e: any) => setFormData({ ...formData, campus: e.target.value })} />
          <Input label="Approving Manager Name" value={formData.managerName || ''} onChange={(e: any) => setFormData({ ...formData, managerName: e.target.value })} />
          <Input label="Approving Manager Email" value={formData.managerEmail || ''} onChange={(e: any) => setFormData({ ...formData, managerEmail: e.target.value })} />
        </Section>

        {/* Emergency & Medical Information */}
        <Section title="Emergency & Medical Information" icon="fa-heart-pulse">
          <Input label="Emergency Contact Name" value={formData.emergencyContactName || ''} onChange={(e: any) => setFormData({ ...formData, emergencyContactName: e.target.value })} />
          <Input label="Emergency Contact Number" value={formData.emergencyContactPhone || ''} placeholder="10 digit number" onChange={(e: any) => setFormData({ ...formData, emergencyContactPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          <Input label="Relationship" value={formData.emergencyContactRelation || ''} onChange={(e: any) => setFormData({ ...formData, emergencyContactRelation: e.target.value })} />

          <Select
            label="Blood Group"
            value={formData.bloodGroup || ''}
            options={bloodGroupOptions}
            onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
          />
          <div className="md:col-span-2">
            <TextArea
              label="Medical Conditions (Optional)"
              value={formData.medicalConditions || ''}
              placeholder="List any serious medical conditions, disabilities or allergies PNC should be aware of"
              onChange={(e) => setFormData({ ...formData, medicalConditions: e.target.value })}
            />
          </div>
        </Section>

        {/* Identity Verification */}
        <div className="space-y-8 pt-6">
          <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20"><i className="fa-solid fa-file-shield"></i></div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-lg leading-none">Identity Verification</h4>
                <p className="text-[10px] text-slate-500 mt-1.5 uppercase font-black tracking-widest leading-none">Approval Required</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* A. Passport Photo */}
            <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-800/30 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h5 className="font-black text-slate-800 dark:text-white text-sm">A. Passport Photo</h5>
                  <p className="text-xs text-slate-500 mt-1">Clear headshot with plain background</p>
                </div>
                <StatusBadge type="status" value={formData.passportPhoto?.status || VerificationStatus.INCOMPLETE} />
              </div>

              <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 p-6 min-h-[220px] group transition-all hover:border-indigo-400">
                {isUploading === 'passportPhoto' ? (
                  <div className="flex flex-col items-center gap-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-600"></i>
                    <p className="text-2xs font-bold text-indigo-600 uppercase tracking-widest">Uploading...</p>
                  </div>
                ) : formData.passportPhoto?.fileUrl ? (
                  <div className="relative group/preview">
                    <img src={formData.passportPhoto.fileUrl} className="w-40 h-40 rounded-3xl object-cover shadow-2xl border-4 border-white dark:border-slate-800" />
                    <div className="absolute inset-0 bg-slate-900/40 rounded-3xl opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                      <i className="fa-solid fa-eye text-white text-2xl"></i>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-slate-400">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform"><i className="fa-solid fa-image-portrait"></i></div>
                    <p className="text-xs font-medium">No photo uploaded</p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-center">
                {(!formData.passportPhoto?.fileUrl || formData.passportPhoto.status === VerificationStatus.REJECTED || formData.passportPhoto.status === VerificationStatus.PENDING || formData.passportPhoto.status === VerificationStatus.INCOMPLETE) && (
                  <label className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer">
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'passportPhoto')} disabled={!!isUploading} />
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    {formData.passportPhoto?.fileUrl ? 'Replace Photo' : 'Upload Photo'}
                  </label>
                )}
              </div>
            </div>

            {/* B. Government ID */}
            <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-800/30 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h5 className="font-black text-slate-800 dark:text-white text-sm">B. Government ID</h5>
                  <p className="text-xs text-slate-500 mt-1">Proof of identity (Aadhaar, Passport, etc.)</p>
                </div>
                <StatusBadge type="status" value={formData.idProof?.status || VerificationStatus.INCOMPLETE} />
              </div>

              <div className="space-y-6 flex-1 flex flex-col">
                <Select
                  label="ID Type"
                  value={formData.idProof?.type || ''}
                  options={Object.values(IdProofType).map(v => ({ label: v, value: v }))}
                  onChange={(e) => setFormData({ ...formData, idProof: { ...(formData.idProof || {}), type: e.target.value as IdProofType, status: formData.idProof?.status || VerificationStatus.INCOMPLETE } })}
                />

                <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 p-6 min-h-[160px] group transition-all hover:border-violet-400">
                  {isUploading === 'idProof' ? (
                    <div className="flex flex-col items-center gap-3">
                      <i className="fa-solid fa-circle-notch fa-spin text-3xl text-violet-600"></i>
                      <p className="text-2xs font-bold text-violet-600 uppercase tracking-widest">Uploading...</p>
                    </div>
                  ) : formData.idProof?.fileUrl ? (
                    <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full">
                      <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center text-violet-600 shadow-sm"><i className="fa-solid fa-file-pdf text-xl"></i></div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate">Document Uploaded</p>
                        <p className="text-[10px] text-slate-500 font-medium">Click to replace or view</p>
                      </div>
                      <i className="fa-solid fa-check-circle text-emerald-500"></i>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform"><i className="fa-solid fa-address-card"></i></div>
                      <p className="text-xs font-medium">No document uploaded</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-center">
                  {(!formData.idProof?.fileUrl || formData.idProof.status === VerificationStatus.REJECTED || formData.idProof.status === VerificationStatus.PENDING || formData.idProof.status === VerificationStatus.INCOMPLETE) && (
                    <label className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-violet-600/20 hover:bg-violet-700 active:scale-95 transition-all cursor-pointer">
                      <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleFileChange(e, 'idProof')} disabled={!!isUploading} />
                      <i className="fa-solid fa-file-arrow-up"></i>
                      {formData.idProof?.fileUrl ? 'Replace ID' : 'Upload ID Document'}
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t dark:border-slate-800">
          <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-4 rounded-[1.25rem] font-black uppercase tracking-widest text-sm shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all">Save Profile Changes</button>
        </div>
      </Card>
    </div>
  );
};


// --- Analytics & Reporting Component ---

const AnalyticsView = ({ requests, currentUser }: { requests: TravelRequest[], currentUser: User }) => {
  const [filters, setFilters] = useState({
    campus: 'All',
    department: 'All',
    period: 'All Time'
  });
  const [widgets, setWidgets] = useState({
    spend: true,
    volume: true,
    status: true,
    table: true
  });
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Filter Data Logic
  const filteredData = useMemo(() => {
    return requests.filter(r => {
      const matchCampus = filters.campus === 'All' || r.requesterCampus === filters.campus;
      const matchDept = filters.department === 'All' || r.requesterDepartment === filters.department;
      return matchCampus && matchDept;
    });
  }, [requests, filters]);

  // Aggregations
  const totalSpend = filteredData.reduce((acc, r) => acc + (r.ticketCost || 0), 0);
  const totalTrips = filteredData.length;
  const avgCost = totalTrips > 0 ? Math.round(totalSpend / totalTrips) : 0;

  // Charts Data Preparation
  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const d = r.requesterDepartment || 'Unknown';
      counts[d] = (counts[d] || 0) + (currentUser.role === UserRole.FINANCE || currentUser.role === UserRole.ADMIN ? (r.ticketCost || 0) : 1);
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [filteredData, currentUser.role]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      counts[r.pncStatus] = (counts[r.pncStatus] || 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label: label.replace('_', ' '), value }));
  }, [filteredData]);

  const uniqueCampuses = Array.from(new Set(requests.map(r => r.requesterCampus).filter(Boolean)));
  const uniqueDepts = Array.from(new Set(requests.map(r => r.requesterDepartment).filter(Boolean)));

  const isFinancialView = currentUser.role === UserRole.FINANCE || currentUser.role === UserRole.ADMIN;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">
            {currentUser.role === UserRole.EMPLOYEE ? 'My Travel Insights' : 'Analytics & Reporting'}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {currentUser.role === UserRole.EMPLOYEE ? 'Track your personal travel history and spend.' : 'Data-driven insights for strategic decision making.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsCustomizing(!isCustomizing)} className={`px-4 py-2.5 rounded-lg text-sm font-bold border transition-all ${isCustomizing ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700'}`}>
            <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>Customize
          </button>
          <button onClick={() => toast.success("Exporting CSV...")} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
            <i className="fa-solid fa-download mr-2"></i>Export Report
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mr-2"><i className="fa-solid fa-filter"></i> Filters</div>

        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.campus} onChange={e => setFilters({ ...filters, campus: e.target.value })}>
          <option value="All">All Campuses</option>
          {uniqueCampuses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })}>
          <option value="All">All Departments</option>
          {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}>
          <option value="All Time">All Time</option>
          <option value="This Month">This Month</option>
          <option value="Last Quarter">Last Quarter</option>
          <option value="FY 24-25">FY 24-25</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Bookings" value={totalTrips} icon={<i className="fa-solid fa-ticket"></i>} trend="+5%" trendUp={true} description="Total requests in period" />
        {isFinancialView && (
          <StatCard title="Total Spend" value={`₹ ${totalSpend.toLocaleString()}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} trend="+12%" trendUp={false} description="Actual ticket cost" />
        )}
        <StatCard title="Avg Processing" value="1.2 Days" icon={<i className="fa-solid fa-stopwatch"></i>} description="Submit to Issue" />
        <StatCard title="Compliance Rate" value="94%" icon={<i className="fa-solid fa-check-circle"></i>} trend="-2%" trendUp={false} description="Adherence to policy" />
      </div>

      {/* Widget Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {widgets.volume && (
          <Card className={`p-6 ${isCustomizing ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}>
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-bold text-slate-800 dark:text-white">
                {isFinancialView ? 'Spend by Department' : 'Volume by Department'}
              </h4>
              {isCustomizing && <button onClick={() => setWidgets({ ...widgets, volume: false })} className="text-rose-500 text-xs font-bold uppercase"><i className="fa-solid fa-trash mr-1"></i> Remove</button>}
            </div>
            <BarChart data={deptData} color={isFinancialView ? 'bg-emerald-500' : 'bg-indigo-500'} />
          </Card>
        )}

        {widgets.status && (
          <Card className={`p-6 ${isCustomizing ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}>
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-bold text-slate-800 dark:text-white">Request Status Breakdown</h4>
              {isCustomizing && <button onClick={() => setWidgets({ ...widgets, status: false })} className="text-rose-500 text-xs font-bold uppercase"><i className="fa-solid fa-trash mr-1"></i> Remove</button>}
            </div>
            <BarChart data={statusData} color="bg-amber-400" />
          </Card>
        )}
      </div>

      {/* Master Data Table */}
      {widgets.table && (
        <Card className={`overflow-hidden ${isCustomizing ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}>
          <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
            <h4 className="font-bold text-slate-800 dark:text-white">Detailed Report</h4>
            {isCustomizing && <button onClick={() => setWidgets({ ...widgets, table: false })} className="text-rose-500 text-xs font-bold uppercase"><i className="fa-solid fa-trash mr-1"></i> Remove</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-white dark:bg-slate-900 text-2xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Submission ID</th>
                  <th className="px-6 py-4">Traveler</th>
                  <th className="px-6 py-4">Dept / Campus</th>
                  <th className="px-6 py-4">Route</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Status</th>
                  {isFinancialView && <th className="px-6 py-4">Cost</th>}
                  {isFinancialView && <th className="px-6 py-4">Vendor</th>}
                  {isFinancialView && <th className="px-6 py-4">Invoice</th>}
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {filteredData.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-indigo-600 text-xs">{r.submissionId || r.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{r.requesterName}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {r.requesterDepartment} <span className="text-slate-300 mx-1">•</span> {r.requesterCampus}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{r.from} → {r.to}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{new Date(r.dateOfTravel).toLocaleDateString()}</td>
                    <td className="px-6 py-4"><StatusBadge type="pnc" value={r.pncStatus} /></td>
                    {isFinancialView && <td className="px-6 py-4 font-mono text-slate-700 dark:text-slate-300">₹ {r.ticketCost || 0}</td>}
                    {isFinancialView && <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{r.vendorName || '-'}</td>}
                    {isFinancialView && <td className="px-6 py-4 text-xs font-mono text-slate-500">{r.invoiceNumber || '-'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Customization Hint */}
      {isCustomizing && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 z-50 animate-in slide-in-from-bottom-4">
          <span className="text-sm font-bold">Editing Dashboard Layout</span>
          <button onClick={() => setIsCustomizing(false)} className="bg-white text-slate-900 px-3 py-1 rounded-lg text-xs font-black uppercase hover:bg-slate-100">Done</button>
        </div>
      )}
    </div>
  );
};

// --- Main App Implementation ---

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<TravelRequest[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null);
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [baseRole, setBaseRole] = useState<UserRole | null>(null);

  const [policy, setPolicy] = useState<PolicyConfig>({
    flightNoticeDays: 15,
    trainNoticeDays: 7,
    busNoticeDays: 7,
    autoApproveBelowAmount: 5000,
    isPassportRequired: true,
    isIdRequired: true,
    isEnforcementEnabled: true,
    temporaryUnlockDays: 7
  });

  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Handle Auth State
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch Profile and Data when session changes
  useEffect(() => {
    if (!session) {
      setCurrentUser(null);
      setRequests([]);
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch Profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError) throw profileError;

        // Map snake_case to camelCase for local User type
        const mappedUser: User = {
          id: profile.id,
          name: profile.name || session.user.email?.split('@')[0],
          email: profile.email,
          role: profile.role || UserRole.EMPLOYEE,
          department: profile.department,
          campus: profile.campus,
          managerName: profile.manager_name,
          managerEmail: profile.manager_email,
          passportPhoto: profile.passport_photo,
          idProof: profile.id_proof,
          avatar: profile.avatar || session.user.user_metadata.avatar_url,
          phone: profile.phone,
          emergencyContactName: profile.emergency_contact_name,
          emergencyContactPhone: profile.emergency_contact_phone,
          emergencyContactRelation: profile.emergency_contact_relation,
          bloodGroup: profile.blood_group,
          medicalConditions: profile.medical_conditions,
        };
        setCurrentUser(mappedUser);
        setBaseRole(profile.role as UserRole);

        // 2. Fetch Requests
        let query = supabase.from('travel_requests').select('*');

        // Employees only see their own
        if (mappedUser.role === UserRole.EMPLOYEE) {
          query = query.eq('requester_id', mappedUser.id);
        }

        const { data: reqs, error: reqsError } = await query.order('created_at', { ascending: false });
        if (reqsError) throw reqsError;

        // Map snake_case to camelCase for TravelRequest type
        const mappedReqs = reqs.map((r: any) => ({
          id: r.id,
          submissionId: r.submission_id,
          timestamp: r.created_at,
          requesterId: r.requester_id,
          requesterName: r.requester_name,
          requesterEmail: r.requester_email,
          requesterPhone: r.requester_phone,
          requesterDepartment: r.requester_department,
          requesterCampus: r.requester_campus,
          purpose: r.purpose,
          approvingManagerName: r.approving_manager_name,
          approvingManagerEmail: r.approving_manager_email,
          tripType: r.trip_type,
          mode: r.travel_mode,
          from: r.from_location,
          to: r.to_location,
          dateOfTravel: r.date_of_travel,
          preferredDepartureWindow: r.preferred_departure_window,
          returnDate: r.return_date,
          returnPreferredDepartureWindow: r.return_preferred_departure_window,
          numberOfTravelers: r.number_of_travelers,
          travellerNames: r.traveller_names,
          contactNumbers: r.contact_numbers,
          priority: r.priority,
          specialRequirements: r.special_requirements,
          approvalStatus: r.approval_status,
          pncStatus: r.pnc_status,
          ticketCost: r.ticket_cost,
          vendorName: r.vendor_name,
          timeline: r.timeline || [],
          emergencyContactName: r.emergency_contact_name,
          emergencyContactPhone: r.emergency_contact_phone,
          emergencyContactRelation: r.emergency_contact_relation,
          bloodGroup: r.blood_group,
          medicalConditions: r.medical_conditions,
        }));

        setRequests(mappedReqs);

        // 3. If Admin/PNC, fetch all users
        if (mappedUser.role === UserRole.ADMIN || mappedUser.role === UserRole.PNC) {
          const { data: allUsers, error: usersError } = await supabase.from('profiles').select('*');
          if (!usersError && allUsers) {
            console.log(`Fetched ${allUsers.length} users for role ${mappedUser.role}`);
            setUsers(allUsers.map((u: any) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
              department: u.department,
              campus: u.campus,
              passportPhoto: u.passport_photo,
              idProof: u.id_proof,
              phone: u.phone,
              emergencyContactName: u.emergency_contact_name,
              emergencyContactPhone: u.emergency_contact_phone,
              emergencyContactRelation: u.emergency_contact_relation,
              bloodGroup: u.blood_group,
              medicalConditions: u.medical_conditions,
            })));
          } else {
            console.error("Users error:", usersError);
            // Fallback: at least include self
            setUsers([mappedUser]);
          }
        } else {
          // Non-admin only see themselves
          setUsers([mappedUser]);
        }

      } catch (err: any) {
        toast.error("Failed to load data: " + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [session]);

  // Re-fetch all users if role changes to Admin/PNC and we only have self
  useEffect(() => {
    if ((currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.PNC) && users.length <= 1) {
      const fetchAllUsers = async () => {
        const { data: allUsers, error: usersError } = await supabase.from('profiles').select('*');
        if (!usersError && allUsers) {
          setUsers(allUsers.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            department: u.department,
            campus: u.campus,
            passportPhoto: u.passport_photo,
            idProof: u.id_proof,
            phone: u.phone,
            emergencyContactName: u.emergency_contact_name,
            emergencyContactPhone: u.emergency_contact_phone,
            emergencyContactRelation: u.emergency_contact_relation,
            bloodGroup: u.blood_group,
            medicalConditions: u.medical_conditions,
          })));
        }
      };
      fetchAllUsers();
    }
  }, [currentUser?.role]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return;
    setIsLoading(true);
    setActiveTab(tab);
    setTimeout(() => setIsLoading(false), 400);
  };

  // Calculate profile completeness (excluding email)
  // Fields: name, department, campus, managerName, managerEmail, passportPhoto, idProof = 7 fields
  const calculateProfileCompleteness = (user: User | null): number => {
    if (!user) return 0;
    let completed = 0;
    const total = 7;

    if (user.name && user.name.trim() !== '') completed++;
    if (user.department && user.department.trim() !== '') completed++;
    if (user.campus && user.campus.trim() !== '') completed++;
    if (user.managerName && user.managerName.trim() !== '') completed++;
    if (user.managerEmail && user.managerEmail.trim() !== '') completed++;
    if (user.passportPhoto?.fileUrl) completed++;
    if (user.idProof?.fileUrl) completed++;
    if (user.phone && user.phone.trim() !== '') completed++;
    if (user.emergencyContactName && user.emergencyContactName.trim() !== '') completed++;
    if (user.emergencyContactPhone && user.emergencyContactPhone.trim() !== '') completed++;
    if (user.bloodGroup && user.bloodGroup.trim() !== '') completed++;

    return Math.round((completed / 11) * 100);
  };

  const isUserVerified = (user: User | null) => {
    if (!user) return false;
    const passportOk = !policy.isPassportRequired || user.passportPhoto?.status === VerificationStatus.APPROVED;
    const idOk = !policy.isIdRequired || user.idProof?.status === VerificationStatus.APPROVED;

    // If already approved, return true
    if (passportOk && idOk) return true;

    // Check if user skipped verification and is still within the skip period
    if (user.skippedVerificationAt) {
      const now = new Date();
      const skippedDate = new Date(user.skippedVerificationAt);
      const daysSinceSkip = (now.getTime() - skippedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSkip <= policy.temporaryUnlockDays) {
        return true; // Still within skip period
      }
    }

    // Check for temporary unlock: if documents are uploaded and within the unlock period
    const now = new Date();
    const checkTemporaryUnlock = (doc?: UserDocument) => {
      if (!doc?.uploadedAt || !doc?.fileUrl) return false;
      if (doc.status === VerificationStatus.REJECTED) return false; // Rejected docs don't get temporary unlock

      const uploadedDate = new Date(doc.uploadedAt);
      const daysSinceUpload = (now.getTime() - uploadedDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpload <= policy.temporaryUnlockDays;
    };

    const passportTempUnlock = !policy.isPassportRequired || checkTemporaryUnlock(user.passportPhoto);
    const idTempUnlock = !policy.isIdRequired || checkTemporaryUnlock(user.idProof);

    return passportTempUnlock && idTempUnlock;
  };

  const isLocked = useMemo(() => {
    if (!currentUser) return false; // Don't lock if user isn't loaded yet
    if (currentUser.role === UserRole.ADMIN) return false;
    if (!policy.isEnforcementEnabled) return false;
    return !isUserVerified(currentUser);
  }, [currentUser, policy]);

  const handleUpdateUser = async (updatedUser: User) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          department: updatedUser.department,
          campus: updatedUser.campus,
          manager_name: updatedUser.managerName,
          manager_email: updatedUser.managerEmail,
          passport_photo: updatedUser.passportPhoto,
          id_proof: updatedUser.idProof,
          phone: updatedUser.phone,
          emergency_contact_name: updatedUser.emergencyContactName,
          emergency_contact_phone: updatedUser.emergencyContactPhone,
          emergency_contact_relation: updatedUser.emergencyContactRelation,
          blood_group: updatedUser.bloodGroup,
          medical_conditions: updatedUser.medicalConditions,
          role: updatedUser.role,
          updated_at: new Date().toISOString()
        })
        .eq('id', updatedUser.id);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      if (currentUser?.id === updatedUser.id) {
        setCurrentUser(updatedUser);
      }
      toast.success("Profile updated in database");
    } catch (err: any) {
      toast.error("Update failed: " + err.message);
    }
  };

  const renderContent = () => {
    if (isLoading || !currentUser) return <SkeletonDashboard />;

    // Helper to render the appropriate dashboard based on role
    const renderDashboard = () => {
      if (currentUser.role === UserRole.EMPLOYEE) {
        const completeness = calculateProfileCompleteness(currentUser);
        return (
          <EmployeeDashboard
            requests={requests.filter(r => r.requesterId === currentUser.id)}
            onNewRequest={() => setIsNewRequestModalOpen(true)}
            onView={setSelectedRequest}
            isWarningVisible={!isUserVerified(currentUser) && !policy.isEnforcementEnabled}
            completeness={completeness}
            onViewProfile={() => handleTabChange('profile')}
            user={currentUser}
          />
        );
      }
      if (currentUser.role === UserRole.ADMIN) {
        return <AdminDashboard requests={requests} users={users} onTabChange={handleTabChange} />;
      }
      if (currentUser.role === UserRole.PNC) {
        return <PNCDashboard requests={requests} onTabChange={handleTabChange} />;
      }
      if (currentUser.role === UserRole.FINANCE) {
        return <FinanceDashboard requests={requests} />;
      }
      return null;
    };

    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'analytics':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <AnalyticsView requests={requests} currentUser={currentUser} />;
      case 'past-requests':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <PastRequestsView requests={requests.filter(r => r.requesterId === currentUser.id)} onView={setSelectedRequest} />;
      case 'requests':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <AdminQueueView requests={requests} onView={setSelectedRequest} />;
      case 'verification':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <VerificationQueue users={users} onUpdateUser={handleUpdateUser} />;
      case 'policies':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <PolicyManagement policy={policy} setPolicy={setPolicy} />;
      case 'role-management':
        if (currentUser.role !== UserRole.ADMIN) return renderDashboard();
        return <UserRoleManagement users={users} onUpdateUser={handleUpdateUser} />;
      case 'profile':
        return (
          <div className="max-w-4xl mx-auto transition-all duration-300">
            <OnboardingView user={currentUser!} policy={policy} onUpdate={handleUpdateUser} isLock={false} />
          </div>
        );
      case 'settings':
        return <SettingsView isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} />;
      default:
        return null;
    }
  };

  const handleSkipVerification = () => {
    const updatedUser = {
      ...currentUser,
      skippedVerificationAt: new Date().toISOString()
    };
    handleUpdateUser(updatedUser);
    toast.success(`Verification skipped. You have ${policy.temporaryUnlockDays} days to complete your profile.`);
  };

  if (!session || isResettingPassword) {
    return <AuthView initialMode={isResettingPassword ? 'reset' : 'login'} onFinishReset={() => setIsResettingPassword(false)} />;
  }

  // If loading is finished but fetching the profile failed, show session logout/error
  if (!isLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/20 text-rose-600 rounded-3xl flex items-center justify-center text-3xl mx-auto shadow-xl">
            <i className="fa-solid fa-cloud-bolt"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">Connection Error</h2>
          <p className="text-slate-500 font-medium">We couldn't load your profile. This might be due to a database sync issue or incorrect permissions.</p>
          <div className="flex flex-col gap-3 pt-4">
            <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all">Retry Connection</button>
            <button onClick={() => supabase.auth.signOut()} className="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest transition-all">Sign Out & Try Again</button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) return <SkeletonDashboard />;

  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
        <Toaster position="top-right" richColors />
        <nav className="h-16 bg-white dark:bg-slate-900 border-b dark:border-slate-800 px-8 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-600/20">N</div>
            <h1 className="font-bold tracking-tight text-slate-800 dark:text-white">Navgurukul Travel Desk</h1>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-bold text-slate-400 hover:text-rose-600 uppercase tracking-widest transition-all duration-300 px-3 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
          >
            Sign Out
          </button>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/50 via-transparent to-transparent dark:from-indigo-900/10 transition-colors duration-300">
          <OnboardingView
            user={currentUser!}
            policy={policy}
            onUpdate={handleUpdateUser}
            isLock={true}
            onSkip={handleSkipVerification}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
      <Toaster position="top-right" richColors theme={isDarkMode ? 'dark' : 'light'} />
      <Navbar currentUser={currentUser!} baseRole={baseRole} onToggleRole={(r) => {
        // Mock role toggle for demo, usually role is static from DB
        setCurrentUser(prev => prev ? { ...prev, role: r } : null);
        handleTabChange('dashboard');
      }} onOpenProfile={() => handleTabChange('profile')} />

      <div className="flex-1 flex flex-col md:flex-row transition-colors duration-300">
        <aside className="w-full md:w-64 bg-white dark:bg-slate-900 border-r dark:border-slate-800 p-6 flex flex-col space-y-6 transition-colors duration-300">
          {currentUser.role === UserRole.EMPLOYEE ? (
            <>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">My Space</p>
                <SidebarLink icon="fa-chart-pie" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
              </div>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">Account</p>
                <SidebarLink icon="fa-sliders" label="Settings" active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} />
                <SidebarLink icon="fa-user-pen" label="Edit Profile" active={activeTab === 'profile'} onClick={() => handleTabChange('profile')} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">Operations</p>
                <SidebarLink icon="fa-chart-pie" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
                <SidebarLink icon="fa-list-check" label="Queue" active={activeTab === 'requests'} onClick={() => handleTabChange('requests')} />
                <SidebarLink icon="fa-chart-simple" label="Analytics" active={activeTab === 'analytics'} onClick={() => handleTabChange('analytics')} />
                {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC) && (
                  <SidebarLink icon="fa-id-card-clip" label="Verification" active={activeTab === 'verification'} onClick={() => handleTabChange('verification')} badge={users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING).length || null} />
                )}
                {currentUser.role === UserRole.ADMIN && (
                  <>
                    <SidebarLink icon="fa-shield-halved" label="Policies" active={activeTab === 'policies'} onClick={() => handleTabChange('policies')} />
                    <SidebarLink icon="fa-users-gear" label="Roles" active={activeTab === 'role-management'} onClick={() => handleTabChange('role-management')} />
                  </>
                )}
              </div>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">Account</p>
                <SidebarLink icon="fa-sliders" label="Settings" active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} />
                <SidebarLink icon="fa-user-pen" label="Edit Profile" active={activeTab === 'profile'} onClick={() => handleTabChange('profile')} />
              </div>
            </>
          )}
        </aside>

        <main className="flex-1 p-8 overflow-auto transition-colors duration-300 bg-slate-50/50 dark:bg-slate-950">
          {renderContent()}
        </main>
      </div>

      {isNewRequestModalOpen && (
        <NewRequestModal
          onClose={() => setIsNewRequestModalOpen(false)}
          currentUser={currentUser!}
          onSubmit={async (data: any) => {
            try {
              const newRequest = {
                requester_id: currentUser!.id,
                requester_name: data.requesterName || currentUser!.name,
                requester_email: currentUser!.email,
                requester_phone: data.requesterPhone,
                requester_department: data.requesterDepartment || currentUser!.department,
                requester_campus: data.requesterCampus || currentUser!.campus,
                purpose: data.purpose,
                approving_manager_name: data.approvingManagerName,
                approving_manager_email: data.approvingManagerEmail,
                trip_type: data.tripType,
                travel_mode: data.mode,
                from_location: data.from,
                to_location: data.to,
                date_of_travel: data.dateOfTravel,
                preferred_departure_window: data.preferredDepartureWindow,
                return_date: data.returnDate,
                return_preferred_departure_window: data.returnPreferredDepartureWindow,
                number_of_travelers: data.numberOfTravelers,
                traveller_names: data.travellerNames,
                contact_numbers: data.contactNumbers,
                priority: data.priority || Priority.MEDIUM,
                special_requirements: data.specialRequirements,
                emergency_contact_name: data.emergencyContactName,
                emergency_contact_phone: data.emergencyContactPhone,
                emergency_contact_relation: data.emergencyContactRelation,
                blood_group: data.bloodGroup,
                medical_conditions: data.medicalConditions,
                approval_status: ApprovalStatus.PENDING,
                pnc_status: PNCStatus.NOT_STARTED,
                timeline: [{ id: '1', timestamp: new Date().toISOString(), actor: currentUser!.name, event: 'Request Created' }]
              };

              const { data: inserted, error } = await supabase
                .from('travel_requests')
                .insert(newRequest)
                .select()
                .single();

              if (error) throw error;

              // Re-fetch or add to state
              setRequests(prev => [{
                ...data,
                id: inserted.id,
                timestamp: inserted.created_at,
                requesterId: inserted.requester_id,
                requesterName: inserted.requester_name,
                requesterEmail: inserted.requester_email,
                requesterPhone: inserted.requester_phone,
                requesterDepartment: inserted.requester_department,
                requesterCampus: inserted.requester_campus,
                purpose: inserted.purpose,
                approvingManagerName: inserted.approving_manager_name,
                approvingManagerEmail: inserted.approving_manager_email,
                tripType: inserted.trip_type,
                mode: inserted.travel_mode,
                from: inserted.from_location,
                to: inserted.to_location,
                dateOfTravel: inserted.date_of_travel,
                preferredDepartureWindow: inserted.preferred_departure_window,
                returnDate: inserted.return_date,
                returnPreferredDepartureWindow: inserted.return_preferred_departure_window,
                numberOfTravelers: inserted.number_of_travelers,
                travellerNames: inserted.traveller_names,
                contactNumbers: inserted.contact_numbers,
                priority: inserted.priority,
                specialRequirements: inserted.special_requirements,
                approvalStatus: inserted.approval_status,
                pncStatus: inserted.pnc_status,
                timeline: inserted.timeline,
                emergencyContactName: inserted.emergency_contact_name,
                emergencyContactPhone: inserted.emergency_contact_phone,
                emergencyContactRelation: inserted.emergency_contact_relation,
                bloodGroup: inserted.blood_group,
                medicalConditions: inserted.medical_conditions,
              }, ...prev]);

              setIsNewRequestModalOpen(false);
              toast.success("Travel request saved to Supabase");
            } catch (err: any) {
              toast.error("Submission failed: " + err.message);
            }
          }}
        />
      )}

      {selectedRequest && (
        <RequestDetailOverlay request={selectedRequest} role={currentUser.role} onClose={() => setSelectedRequest(null)} onUpdate={(updated: any) => {
          setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
          toast.success("Request updated");
        }} />
      )}
    </div>
  );
};

// --- Shared Display Sub-components ---

const EmployeeDashboard = ({ requests, onNewRequest, onView, isWarningVisible, completeness, onViewProfile, user }: any) => {
  const welcomeNote = useMemo(() => WELCOME_NOTES[Math.floor(Math.random() * WELCOME_NOTES.length)], []);
  const activeRequests = requests.filter((r: TravelRequest) => r.pncStatus !== PNCStatus.BOOKED_AND_CLOSED && r.pncStatus !== PNCStatus.REJECTED_PNC);
  const closedRequests = requests.filter((r: TravelRequest) => r.pncStatus === PNCStatus.BOOKED_AND_CLOSED || r.pncStatus === PNCStatus.REJECTED_PNC);

  return (
    <div className="space-y-10 animate-in fade-in duration-700 transition-all">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-4xl">👋</span>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Hey, {user?.name?.split(' ')[0] || 'there'}!
            </h2>
          </div>
          <p className="text-slate-500 font-medium text-lg italic ml-1.5 opacity-80 decoration-indigo-500/30">
            "{welcomeNote}"
          </p>
        </div>
        <button onClick={onNewRequest} className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-3">
          <i className="fa-solid fa-plus-circle"></i>
          <span>New Booking</span>
        </button>
      </header>

      {completeness < 100 && (
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-8 rounded-[2rem] shadow-2xl shadow-indigo-200 dark:shadow-none relative overflow-hidden group border border-white/10">
          <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-125 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
            <i className="fa-solid fa-user-astronaut text-9xl"></i>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white">Action Required</span>
              <div className="h-1.5 w-32 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white transition-all duration-1000" style={{ width: `${completeness}%` }}></div>
              </div>
              <span className="text-white/80 text-xs font-bold">{completeness}% Complete</span>
            </div>
            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Profile Incomplete</h3>
            <p className="text-indigo-100/80 text-base mb-8 max-w-lg leading-relaxed font-medium">Your identity verification and background details are pending. Complete these now to avoid any delays in your upcoming travel approvals.</p>
            <button
              onClick={onViewProfile}
              className="bg-white text-indigo-700 px-8 py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-xl active:scale-95"
            >
              Finish Setup
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center"><i className="fa-solid fa-calendar-check"></i></div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">Active Bookings</h3>
        </div>

        {activeRequests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 transition-all">
            {activeRequests.map((r: TravelRequest) => (
              <div key={r.id} onClick={() => onView(r)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 rounded-[1.8rem] hover:shadow-2xl hover:border-indigo-500/50 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 -mr-8 -mt-8 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <span className="text-xs font-black text-indigo-500/60 font-mono tracking-tighter uppercase">{r.id}</span>
                  <StatusBadge type="pnc" value={r.pncStatus} />
                </div>
                <h4 className="font-black text-xl mb-1 text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{r.from} → {r.to}</h4>
                <p className="text-sm text-slate-500 mb-6 font-bold flex items-center gap-2">
                  <i className="fa-solid fa-calendar-day text-xs text-slate-300"></i>
                  {new Date(r.dateOfTravel).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center relative z-10">
                  <StatusBadge type="priority" value={r.priority} />
                  <div className="w-8 h-8 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all"><i className="fa-solid fa-arrow-right text-xs"></i></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-5 bg-white/50 dark:bg-slate-900/30 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem] transition-colors">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto text-slate-300 text-3xl shadow-inner"><i className="fa-solid fa-passport"></i></div>
            <div>
              <h3 className="font-black text-slate-500 dark:text-slate-400 text-lg">No active travel requests</h3>
              <p className="text-slate-400 text-sm mt-1">When you book travel, it will appear here.</p>
            </div>
            <button onClick={onNewRequest} className="text-indigo-600 font-black text-xs uppercase tracking-widest hover:text-indigo-700 transition-colors">Begin New Booking Request</button>
          </div>
        )}
      </div>

      <div className="space-y-6 pt-6">
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg flex items-center justify-center"><i className="fa-solid fa-history"></i></div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">Past Requests</h3>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b dark:border-slate-800">
                  <th className="px-8 py-6">Trip ID</th>
                  <th className="px-8 py-6">Destination</th>
                  <th className="px-8 py-6">Travel Date</th>
                  <th className="px-8 py-6">Status</th>
                  <th className="px-8 py-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {closedRequests.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-8 py-5 font-mono text-xs font-black text-indigo-500 group-hover:scale-105 transition-transform origin-left">{r.id}</td>
                    <td className="px-8 py-5">
                      <p className="font-bold text-slate-800 dark:text-white">{r.to}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{r.mode}</p>
                    </td>
                    <td className="px-8 py-5 text-sm font-bold text-slate-600 dark:text-slate-400">{new Date(r.dateOfTravel).toLocaleDateString()}</td>
                    <td className="px-8 py-5"><StatusBadge type="pnc" value={r.pncStatus} /></td>
                    <td className="px-8 py-5 text-right">
                      <button onClick={() => onView(r)} className="w-10 h-10 hover:bg-white dark:hover:bg-slate-700 rounded-full transition-all text-slate-300 hover:text-indigo-600 shadow-sm hover:shadow active:scale-95 border border-transparent hover:border-slate-100 dark:hover:border-slate-600">
                        <i className="fa-solid fa-arrow-right-long text-sm"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {closedRequests.length === 0 && (
            <div className="py-16 text-center text-slate-400 font-bold italic opacity-60">No past travel requests found in your history.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const VerificationQueue = ({ users, onUpdateUser }: { users: User[], onUpdateUser: (u: User) => void }) => {
  const pending = users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Track individual statuses and reasons in local state for the modal
  const [reviewState, setReviewState] = useState({
    passportStatus: VerificationStatus.PENDING,
    passportReason: '',
    idStatus: VerificationStatus.PENDING,
    idReason: ''
  });

  useEffect(() => {
    if (selectedUser) {
      setReviewState({
        passportStatus: selectedUser.passportPhoto?.status || VerificationStatus.PENDING,
        passportReason: selectedUser.passportPhoto?.rejectionReason || '',
        idStatus: selectedUser.idProof?.status || VerificationStatus.PENDING,
        idReason: selectedUser.idProof?.rejectionReason || ''
      });
    }
  }, [selectedUser]);

  const handleSaveAll = () => {
    if (!selectedUser) return;
    const updated = { ...selectedUser };

    if (updated.passportPhoto) {
      updated.passportPhoto = {
        ...updated.passportPhoto,
        status: reviewState.passportStatus,
        rejectionReason: reviewState.passportStatus === VerificationStatus.REJECTED ? reviewState.passportReason : ''
      };
    }

    if (updated.idProof) {
      updated.idProof = {
        ...updated.idProof,
        status: reviewState.idStatus,
        rejectionReason: reviewState.idStatus === VerificationStatus.REJECTED ? reviewState.idReason : ''
      };
    }

    onUpdateUser(updated);
    setSelectedUser(null);
    toast.success("Verification updates saved for " + selectedUser.name);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Verification Queue</h2>
      {pending.length === 0 ? (
        <div className="py-24 text-center text-slate-400 font-medium bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-sm transition-colors duration-300 italic">All caught up! No pending verifications.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 transition-all duration-300">
          {pending.map(u => (
            <div key={u.id} onClick={() => setSelectedUser(u)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl flex items-center gap-4 hover:shadow-lg hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all duration-300 cursor-pointer group">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center font-bold text-indigo-600 text-xl shadow-inner transition-colors duration-300 overflow-hidden">
                {u.avatar ? (
                  <img src={u.avatar} className="w-full h-full object-cover rounded-2xl transition-all duration-300" />
                ) : u.passportPhoto?.fileUrl ? (
                  <img src={u.passportPhoto.fileUrl} className="w-full h-full object-cover rounded-2xl transition-all duration-300" />
                ) : (
                  u.name.charAt(0)
                )}
              </div>
              <div className="flex-1 transition-colors duration-300">
                <h4 className="font-bold text-slate-800 dark:text-white transition-colors duration-300">{u.name}</h4>
                <p className="text-xs text-slate-500 font-medium transition-colors duration-300">Pending Docs: {[u.passportPhoto?.status === VerificationStatus.PENDING && 'Passport', u.idProof?.status === VerificationStatus.PENDING && 'ID Proof'].filter(Boolean).join(', ')}</p>
              </div>
              <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all duration-300 shadow-lg shadow-indigo-600/10">Review Submission</button>
            </div>
          ))}
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setSelectedUser(null)}></div>
          <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <header className="px-10 py-8 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Review Submissions</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{selectedUser.name}</span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className="text-xs font-medium text-slate-500">{selectedUser.email}</span>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-3 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 border border-transparent hover:border-slate-100 dark:hover:border-slate-700"><i className="fa-solid fa-xmark text-xl"></i></button>
            </header>

            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {/* Passport Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">1. Passport Photo</h4>
                </div>
                <div className="h-48 aspect-video mx-auto bg-slate-100 dark:bg-slate-800 rounded-3xl overflow-hidden border-2 border-slate-50 dark:border-slate-700 shadow-inner group relative">
                  {selectedUser.passportPhoto?.fileUrl ? (
                    <>
                      <img src={selectedUser.passportPhoto.fileUrl} className="w-full h-full object-cover transition-all" />
                      <a href={selectedUser.passportPhoto.fileUrl} target="_blank" className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-indigo-600 shadow-md"><i className="fa-solid fa-expand"></i></a>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3"><i className="fa-solid fa-camera text-4xl"></i><span className="text-2xs font-bold uppercase">Not Provided</span></div>
                  )}
                </div>

                {selectedUser.passportPhoto?.fileUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReviewState({ ...reviewState, passportStatus: VerificationStatus.APPROVED })}
                        className={`py-3 rounded-xl font-bold text-xs transition-all ${reviewState.passportStatus === VerificationStatus.APPROVED ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewState({ ...reviewState, passportStatus: VerificationStatus.REJECTED })}
                        className={`py-3 rounded-xl font-bold text-xs transition-all ${reviewState.passportStatus === VerificationStatus.REJECTED ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600'}`}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewState.passportStatus === VerificationStatus.REJECTED && (
                      <textarea
                        className="w-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-xl text-xs font-medium focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                        placeholder="Rejection reason (visible to user)..."
                        rows={3}
                        value={reviewState.passportReason}
                        onChange={(e) => setReviewState({ ...reviewState, passportReason: e.target.value })}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ID Proof Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">2. Government ID ({selectedUser.idProof?.type || 'Not Set'})</h4>
                </div>
                <div className="h-48 aspect-video mx-auto bg-slate-100 dark:bg-slate-800 rounded-3xl overflow-hidden border-2 border-slate-50 dark:border-slate-700 shadow-inner group relative">
                  {selectedUser.idProof?.fileUrl ? (
                    <>
                      <img src={selectedUser.idProof.fileUrl} className="w-full h-full object-cover transition-all" />
                      <a href={selectedUser.idProof.fileUrl} target="_blank" className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-violet-600 shadow-md"><i className="fa-solid fa-expand"></i></a>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3"><i className="fa-solid fa-id-card text-4xl"></i><span className="text-2xs font-bold uppercase">Not Provided</span></div>
                  )}
                </div>

                {selectedUser.idProof?.fileUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReviewState({ ...reviewState, idStatus: VerificationStatus.APPROVED })}
                        className={`py-3 rounded-xl font-bold text-xs transition-all ${reviewState.idStatus === VerificationStatus.APPROVED ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewState({ ...reviewState, idStatus: VerificationStatus.REJECTED })}
                        className={`py-3 rounded-xl font-bold text-xs transition-all ${reviewState.idStatus === VerificationStatus.REJECTED ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600'}`}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewState.idStatus === VerificationStatus.REJECTED && (
                      <textarea
                        className="w-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-xl text-xs font-medium focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                        placeholder="Rejection reason (visible to user)..."
                        rows={3}
                        value={reviewState.idReason}
                        onChange={(e) => setReviewState({ ...reviewState, idReason: e.target.value })}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-10 border-t dark:border-slate-800 flex gap-4 bg-slate-50/30 dark:bg-slate-800/20">
              <button onClick={() => setSelectedUser(null)} className="flex-1 py-4 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-sm">Cancel Review</button>
              <button
                onClick={handleSaveAll}
                className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all text-sm uppercase tracking-widest"
              >
                Save Decisions & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsView = ({ isDarkMode, onToggleTheme }: any) => (
  <div className="max-w-xl space-y-8 animate-in fade-in duration-500 transition-all duration-300">
    <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Settings</h2>
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl space-y-8 shadow-sm transition-colors duration-300">
      <div className="flex items-center justify-between transition-colors duration-300">
        <div><h4 className="text-lg font-bold text-slate-800 dark:text-white transition-colors duration-300">Dark Mode</h4><p className="text-sm text-slate-500 font-medium transition-colors duration-300">Toggle application appearance for better viewing.</p></div>
        <Toggle active={isDarkMode} onChange={onToggleTheme} />
      </div>
      <div className="pt-8 border-t dark:border-slate-800 text-center text-2xs font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">v2.5.0 Stable Build</div>
    </div>
  </div>
);

// --- Simplified Skeletons/Wizards ---

const SkeletonDashboard = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-300">
    {[1, 2, 3, 4, 5, 6].map(i => (
      <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-3xl animate-pulse space-y-4 transition-colors duration-300">
        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/3 transition-colors duration-300"></div>
        <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-full transition-colors duration-300"></div>
        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-2/3 transition-colors duration-300"></div>
      </div>
    ))}
  </div>
);

const AdminQueueView = ({ requests, onView }: any) => (
  <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Booking Queue</h2>
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
      <table className="w-full text-left">
        <thead className="bg-slate-50 dark:bg-slate-800 text-2xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300"><tr><th className="px-6 py-5">ID</th><th className="px-6 py-5">Traveler</th><th className="px-6 py-5">Route</th><th className="px-6 py-5">Status</th></tr></thead>
        <tbody className="divide-y dark:divide-slate-800 transition-colors duration-300">
          {requests.map((r: any) => (
            <tr key={r.id} onClick={() => onView(r)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors duration-300 group">
              <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600 transition-colors duration-300">{r.id}</td>
              <td className="px-6 py-4 font-bold text-slate-800 dark:text-white transition-colors duration-300">{r.requesterName}</td>
              <td className="px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 transition-colors duration-300">{r.from} → {r.to}</td>
              <td className="px-6 py-4 transition-colors duration-300"><StatusBadge type="pnc" value={r.pncStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const PastRequestsView = ({ requests, onView }: any) => {
  const closedRequests = requests.filter((r: any) => r.pncStatus === PNCStatus.BOOKED_AND_CLOSED || r.pncStatus === PNCStatus.REJECTED_PNC);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Past Requests</h2>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-2xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300"><tr><th className="px-6 py-5">Trip ID</th><th className="px-6 py-5">Destination</th><th className="px-6 py-5 text-right">Action</th></tr></thead>
          <tbody className="divide-y dark:divide-slate-800 transition-colors duration-300">
            {closedRequests.map((r: any) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-300">
                <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600 transition-colors duration-300">{r.id}</td>
                <td className="px-6 py-4 font-bold text-slate-800 dark:text-white transition-colors duration-300">{r.to}</td>
                <td className="px-6 py-4 text-right pr-6 transition-colors duration-300"><button onClick={() => onView(r)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors duration-300 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-circle-info text-lg"></i></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {closedRequests.length === 0 && (
          <div className="py-20 text-center text-slate-400 font-medium transition-colors duration-300">No past travel requests found.</div>
        )}
      </div>
    </div>
  );
};



const RequestDetailOverlay = ({ request, role, onClose, onUpdate }: any) => {
  const [status, setStatus] = useState(request.pncStatus);
  return (
    <div className="fixed inset-0 z-50 flex justify-end transition-all duration-300">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-all duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 h-full p-10 flex flex-col space-y-10 animate-in slide-in-from-right transition-all duration-300 shadow-2xl overflow-y-auto custom-scrollbar border-l border-white/10">
        <header className="flex justify-between items-center transition-colors duration-300">
          <div className="flex items-center gap-3 transition-colors duration-300">
            <span className="w-3 h-3 rounded-full bg-indigo-600 animate-pulse"></span>
            <h3 className="text-2xl font-black font-mono text-indigo-600 tracking-tighter transition-colors duration-300">{request.id}</h3>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors duration-300"><i className="fa-solid fa-xmark text-slate-400 text-xl"></i></button>
        </header>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-2xl space-y-8 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
          <div className="flex items-center gap-5 transition-colors duration-300">
            <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center font-bold text-indigo-600 shadow-sm border dark:border-slate-700 text-2xl transition-all duration-300">
              {request.requesterName?.charAt(0) || 'U'}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">Traveler</p>
              <p className="font-bold text-2xl text-slate-900 dark:text-white transition-all">{request.requesterName}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-10 pt-4 transition-all duration-300 border-t dark:border-slate-700/50">
            <div><p className="text-xs font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">Origin</p><p className="font-bold text-xl text-slate-700 dark:text-slate-300 transition-all">{request.from}</p></div>
            <div><p className="text-xs font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">Destination</p><p className="font-bold text-xl text-slate-700 dark:text-slate-300 transition-all">{request.to}</p></div>
          </div>
          <div className="pt-4 transition-colors duration-300 border-t dark:border-slate-700/50">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">Travel Purpose</p>
            <p className="text-base font-medium leading-relaxed text-slate-600 dark:text-slate-300 mt-3 p-5 bg-white dark:bg-slate-900 rounded-xl italic border border-slate-100 dark:border-slate-800 transition-all shadow-sm">"{request.purpose}"</p>
          </div>
        </div>

        {role === UserRole.PNC ? (
          <div className="space-y-6 pt-10 border-t dark:border-slate-800 mt-auto transition-colors duration-300">
            <div className="space-y-3 transition-colors duration-300">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 transition-colors duration-300">Update Booking Status</label>
              <div className="relative">
                <select className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-800 p-4 rounded-xl font-bold focus:border-indigo-600 outline-none transition-all appearance-none cursor-pointer text-base text-slate-800 dark:text-white shadow-sm" value={status} onChange={e => setStatus(e.target.value as any)}>
                  {Object.values(PNCStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><i className="fa-solid fa-chevron-down"></i></div>
              </div>
            </div>
            <button onClick={() => onUpdate({ ...request, pncStatus: status })} className="w-full bg-indigo-600 text-white py-5 rounded-xl font-bold shadow-2xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all text-sm uppercase tracking-widest">Apply Booking Update</button>
          </div>
        ) : (
          <div className="mt-auto p-8 bg-slate-50 dark:bg-slate-800/80 rounded-2xl text-center border border-slate-100 dark:border-slate-800 transition-colors duration-300">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 transition-colors duration-300">Request Status</p>
            <StatusBadge type="pnc" value={request.pncStatus} />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
