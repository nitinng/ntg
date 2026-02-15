
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  TravelRequest, PNCStatus, Priority, TravelMode, UserRole, User, TripType, ApprovalStatus, PolicyConfig, VerificationStatus, IdProofType, PaymentStatus
} from './types';
import { mockUsers, initialRequests } from './mockData';
import StatusBadge from './components/StatusBadge';
import { Toaster, toast } from 'sonner';

// --- UI Utility Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-all duration-300 ${className}`}>
    {children}
  </div>
);

const StatCard = ({ title, value, icon, description, trend, trendUp }: any) => (
  <Card className="p-6">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <div className="text-indigo-600 dark:text-indigo-400 opacity-80">{icon}</div>
    </div>
    <div className="flex items-baseline gap-2">
      <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</h3>
      {trend && (
        <span className={`text-[10px] font-bold ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
          {trend}
        </span>
      )}
    </div>
    {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
  </Card>
);

const Input = ({ label, ...props }: any) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>}
    <input 
      {...props} 
      className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-800 p-3 rounded-xl outline-none focus:border-indigo-500/50 transition-colors text-sm font-medium dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600"
    />
  </div>
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

const Navbar = ({ currentUser, onToggleRole, onOpenProfile }: { currentUser: User, onToggleRole: (role: UserRole) => void, onOpenProfile: () => void }) => (
  <nav className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40 transition-colors duration-300">
    <div className="flex items-center gap-4">
      <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-600/20">N</div>
      <h1 className="font-bold text-slate-800 dark:text-slate-100 hidden md:block tracking-tight">Navgurukul Travel Desk</h1>
      <div className="ml-4 flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors duration-300">
        {Object.values(UserRole).map(role => (
          <button 
            key={role}
            onClick={() => onToggleRole(role)}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-300 ${currentUser.role === role ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            {role}
          </button>
        ))}
      </div>
    </div>
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-800 transition-colors duration-300">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-bold text-slate-800 dark:text-white leading-none">{currentUser.name}</p>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-tighter font-medium">{currentUser.role}</p>
        </div>
        <button 
          onClick={onOpenProfile}
          className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-xs uppercase cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all duration-300 overflow-hidden border-2 border-transparent hover:border-indigo-500/20"
        >
          {currentUser.passportPhoto?.fileUrl ? (
            <img src={currentUser.passportPhoto.fileUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            currentUser.name.charAt(0)
          )}
        </button>
      </div>
    </div>
  </nav>
);

const SidebarLink = ({ icon, label, active, onClick, badge }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 group ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
    <i className={`fa-solid ${icon} w-5 ${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'}`}></i>
    <span className="flex-1 text-left">{label}</span>
    {badge && <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-bold">{badge}</span>}
  </button>
);

const Toggle = ({ active, onChange }: { active: boolean, onChange: () => void }) => (
  <button onClick={onChange} className={`w-11 h-6 rounded-full relative transition-colors duration-300 ${active ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${active ? 'right-1' : 'left-1'}`}></div>
  </button>
);

// --- Role Specific Dashboards ---

const AdminDashboard = ({ requests, users, onTabChange }: any) => {
  const pendingCount = requests.filter((r: TravelRequest) => r.approvalStatus === ApprovalStatus.PENDING).length;
  const criticalCount = requests.filter((r: TravelRequest) => r.priority === Priority.CRITICAL).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Admin Overview</h2>
          <p className="text-slate-500 text-sm">System-wide metrics and controls.</p>
        </div>
        <button onClick={() => onTabChange('requests')} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold">View All Requests</button>
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
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">PNC Operations</h2>
                <p className="text-slate-500 text-sm">Manage bookings and fulfillment.</p>
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
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Financial Overview</h2>
                <p className="text-slate-500 text-sm">Track expenses and budget.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Total Spend" value={`₹${totalSpend.toLocaleString()}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} />
                <StatCard title="Pending Invoices" value={pendingPayment} icon={<i className="fa-solid fa-file-invoice-dollar"></i>} trendUp={false} trend="Needs Action" />
                <StatCard title="Avg Ticket Cost" value={`₹${requests.length ? Math.round(totalSpend/requests.length) : 0}`} icon={<i className="fa-solid fa-calculator"></i>} />
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
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Policy Configuration</h2>
                <p className="text-slate-500 text-sm">Adjust rules and automation settings.</p>
            </header>
            
            <Card className="p-8 space-y-8">
                <div className="space-y-6">
                    <h4 className="font-bold text-slate-800 dark:text-white border-b pb-2 dark:border-slate-800">Notice Periods (Days)</h4>
                    <div className="grid grid-cols-3 gap-4">
                        <Input label="Flight" type="number" value={policy.flightNoticeDays} onChange={(e: any) => setPolicy({...policy, flightNoticeDays: parseInt(e.target.value)})} />
                        <Input label="Train" type="number" value={policy.trainNoticeDays} onChange={(e: any) => setPolicy({...policy, trainNoticeDays: parseInt(e.target.value)})} />
                        <Input label="Bus" type="number" value={policy.busNoticeDays} onChange={(e: any) => setPolicy({...policy, busNoticeDays: parseInt(e.target.value)})} />
                    </div>
                </div>

                <div className="space-y-6">
                     <h4 className="font-bold text-slate-800 dark:text-white border-b pb-2 dark:border-slate-800">Compliance & Limits</h4>
                     <Input label="Auto-approval Limit (₹)" type="number" value={policy.autoApproveBelowAmount} onChange={(e: any) => setPolicy({...policy, autoApproveBelowAmount: parseInt(e.target.value)})} />
                     <div className="flex items-center justify-between py-2">
                        <div>
                            <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Enforce Verification</p>
                            <p className="text-xs text-slate-500">Require documents before booking</p>
                        </div>
                        <Toggle active={policy.isEnforcementEnabled} onChange={() => setPolicy({...policy, isEnforcementEnabled: !policy.isEnforcementEnabled})} />
                     </div>
                </div>
            </Card>
        </div>
    );
};

const OnboardingView = ({ user, policy, onUpdate, isLock }: any) => {
    const [formData, setFormData] = useState(user);
    
    // Simple state to simulate file upload
    const handleFileUpload = (field: 'passportPhoto' | 'idProof') => {
        // In a real app this would handle file selection
        const updatedDoc = {
            ...formData[field],
            status: VerificationStatus.PENDING,
            fileUrl: `https://i.pravatar.cc/150?u=${Math.random()}` // Mock URL
        };
        setFormData({ ...formData, [field]: updatedDoc });
    };

    const handleSave = () => {
        onUpdate(formData);
        toast.success("Profile updated successfully");
    };

    return (
        <div className={`space-y-8 animate-in fade-in duration-500 ${isLock ? 'w-full max-w-2xl' : ''}`}>
             <header className="text-center md:text-left">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{isLock ? 'Complete Your Profile' : 'Edit Profile'}</h2>
                <p className="text-slate-500 text-sm">{isLock ? 'Verification is required to access the travel desk.' : 'Manage your personal information and documents.'}</p>
            </header>

            <Card className="p-8 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <Input label="Full Name" value={formData.name} onChange={(e: any) => setFormData({...formData, name: e.target.value})} />
                     <Input label="Email Address" value={formData.email} disabled />
                     <Input label="Department" value={formData.department || ''} onChange={(e: any) => setFormData({...formData, department: e.target.value})} />
                     <Input label="Campus" value={formData.campus || ''} onChange={(e: any) => setFormData({...formData, campus: e.target.value})} />
                 </div>

                 <div className="space-y-6 pt-4 border-t dark:border-slate-800">
                    <h4 className="font-bold text-slate-800 dark:text-white">Identity Documents</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Passport Photo Upload */}
                        <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-center space-y-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            {formData.passportPhoto?.fileUrl ? (
                                <div className="relative w-24 h-24 rounded-full overflow-hidden mb-2">
                                     <img src={formData.passportPhoto.fileUrl} className="w-full h-full object-cover" />
                                </div>
                            ) : (
                                <div className="w-12 h-12 bg-indigo-50 dark:bg-slate-800 text-indigo-500 rounded-full flex items-center justify-center"><i className="fa-solid fa-camera"></i></div>
                            )}
                            <div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Passport Photo</p>
                                <p className="text-[10px] text-slate-400">{formData.passportPhoto?.status || 'Not Uploaded'}</p>
                            </div>
                            <button onClick={() => handleFileUpload('passportPhoto')} className="text-indigo-600 text-xs font-bold hover:underline">
                                {formData.passportPhoto?.fileUrl ? 'Change Photo' : 'Upload Photo'}
                            </button>
                        </div>

                        {/* ID Proof Upload */}
                        <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-center space-y-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                             <div className="w-12 h-12 bg-indigo-50 dark:bg-slate-800 text-indigo-500 rounded-full flex items-center justify-center"><i className="fa-solid fa-id-card"></i></div>
                            <div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Govt ID Proof</p>
                                <p className="text-[10px] text-slate-400">{formData.idProof?.status || 'Not Uploaded'}</p>
                            </div>
                            <button onClick={() => handleFileUpload('idProof')} className="text-indigo-600 text-xs font-bold hover:underline">
                                {formData.idProof?.fileUrl ? 'Re-upload' : 'Upload Document'}
                            </button>
                        </div>
                    </div>
                 </div>

                 <div className="pt-6">
                     <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all">Save Changes</button>
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
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
            {currentUser.role === UserRole.EMPLOYEE ? 'My Travel Insights' : 'Analytics & Reporting'}
          </h2>
          <p className="text-slate-500 text-sm">
            {currentUser.role === UserRole.EMPLOYEE ? 'Track your personal travel history.' : 'Data-driven insights for decision making.'}
          </p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setIsCustomizing(!isCustomizing)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${isCustomizing ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700'}`}>
             <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>Customize
           </button>
           <button onClick={() => toast.success("Exporting CSV...")} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
             <i className="fa-solid fa-download mr-2"></i>Export Report
           </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mr-2"><i className="fa-solid fa-filter"></i> Filters</div>
        
        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.campus} onChange={e => setFilters({...filters, campus: e.target.value})}>
          <option value="All">All Campuses</option>
          {uniqueCampuses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.department} onChange={e => setFilters({...filters, department: e.target.value})}>
          <option value="All">All Departments</option>
          {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.period} onChange={e => setFilters({...filters, period: e.target.value})}>
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
              {isCustomizing && <button onClick={() => setWidgets({...widgets, volume: false})} className="text-rose-500 text-xs font-bold uppercase"><i className="fa-solid fa-trash mr-1"></i> Remove</button>}
            </div>
            <BarChart data={deptData} color={isFinancialView ? 'bg-emerald-500' : 'bg-indigo-500'} />
          </Card>
        )}

        {widgets.status && (
          <Card className={`p-6 ${isCustomizing ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}>
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-bold text-slate-800 dark:text-white">Request Status Breakdown</h4>
              {isCustomizing && <button onClick={() => setWidgets({...widgets, status: false})} className="text-rose-500 text-xs font-bold uppercase"><i className="fa-solid fa-trash mr-1"></i> Remove</button>}
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
            {isCustomizing && <button onClick={() => setWidgets({...widgets, table: false})} className="text-rose-500 text-xs font-bold uppercase"><i className="fa-solid fa-trash mr-1"></i> Remove</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-white dark:bg-slate-900 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
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
  const [currentUser, setCurrentUser] = useState<User>(mockUsers[0]);
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [requests, setRequests] = useState<TravelRequest[]>(initialRequests);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null);
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  
  const [policy, setPolicy] = useState<PolicyConfig>({
    flightNoticeDays: 15,
    trainNoticeDays: 7,
    busNoticeDays: 7,
    autoApproveBelowAmount: 5000,
    isPassportRequired: true,
    isIdRequired: true,
    isEnforcementEnabled: true
  });

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

  const isUserVerified = (user: User) => {
    const passportOk = !policy.isPassportRequired || user.passportPhoto?.status === VerificationStatus.APPROVED;
    const idOk = !policy.isIdRequired || user.idProof?.status === VerificationStatus.APPROVED;
    return passportOk && idOk;
  };

  const isLocked = useMemo(() => {
    if (currentUser.role === UserRole.ADMIN) return false;
    if (!policy.isEnforcementEnabled) return false;
    return !isUserVerified(currentUser);
  }, [currentUser, policy]);

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    if (currentUser.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }
  };

  const renderContent = () => {
    if (isLoading) return <SkeletonDashboard />;

    switch (activeTab) {
      case 'dashboard':
        if (currentUser.role === UserRole.EMPLOYEE) {
          return <MyRequestsView requests={requests.filter(r => r.requesterId === currentUser.id)} onNewRequest={() => setIsNewRequestModalOpen(true)} onView={setSelectedRequest} isWarningVisible={!isUserVerified(currentUser) && !policy.isEnforcementEnabled} />;
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
      case 'analytics':
        return <AnalyticsView requests={requests} currentUser={currentUser} />;
      case 'past-requests':
        return <PastRequestsView requests={requests.filter(r => r.requesterId === currentUser.id)} onView={setSelectedRequest} />;
      case 'requests':
        return <AdminQueueView requests={requests} onView={setSelectedRequest} />;
      case 'verification':
        return <VerificationQueue users={users} onUpdateUser={handleUpdateUser} />;
      case 'policies':
        return <PolicyManagement policy={policy} setPolicy={setPolicy} />;
      case 'profile':
        return (
          <div className="max-w-4xl mx-auto transition-all duration-300">
            <OnboardingView user={currentUser} policy={policy} onUpdate={handleUpdateUser} isLock={false} />
          </div>
        );
      case 'settings':
        return <SettingsView isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} />;
      default:
        return null;
    }
  };

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
            onClick={() => {
              const admin = users.find(u => u.role === UserRole.ADMIN);
              if (admin) setCurrentUser(admin);
            }} 
            className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 uppercase tracking-widest transition-colors duration-300 px-3 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
          >
            Switch to Super Admin
          </button>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/50 via-transparent to-transparent dark:from-indigo-900/10 transition-colors duration-300">
          <OnboardingView user={currentUser} policy={policy} onUpdate={handleUpdateUser} isLock={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
      <Toaster position="top-right" richColors theme={isDarkMode ? 'dark' : 'light'} />
      <Navbar currentUser={currentUser} onToggleRole={(r) => {
        const u = users.find(u => u.role === r);
        if (u) setCurrentUser(u);
        handleTabChange('dashboard');
      }} onOpenProfile={() => handleTabChange('profile')} />

      <div className="flex-1 flex flex-col md:flex-row transition-colors duration-300">
        <aside className="w-full md:w-64 bg-white dark:bg-slate-900 border-r dark:border-slate-800 p-6 flex flex-col space-y-6 transition-colors duration-300">
          <div className="space-y-1">
            <p className="px-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">My Space</p>
            <SidebarLink icon="fa-chart-pie" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
            {currentUser.role === UserRole.EMPLOYEE && (
              <>
                <SidebarLink icon="fa-chart-line" label="My Insights" active={activeTab === 'analytics'} onClick={() => handleTabChange('analytics')} />
                <SidebarLink icon="fa-clock-rotate-left" label="Past Requests" active={activeTab === 'past-requests'} onClick={() => handleTabChange('past-requests')} />
              </>
            )}
            <SidebarLink icon="fa-sliders" label="Settings" active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} />
            <SidebarLink icon="fa-user-pen" label="Edit Profile" active={activeTab === 'profile'} onClick={() => handleTabChange('profile')} />
          </div>

          {(currentUser.role !== UserRole.EMPLOYEE) && (
            <div className="space-y-1">
              <p className="px-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">Operations</p>
              <SidebarLink icon="fa-list-check" label="Queue" active={activeTab === 'requests'} onClick={() => handleTabChange('requests')} />
              <SidebarLink icon="fa-chart-simple" label="Analytics" active={activeTab === 'analytics'} onClick={() => handleTabChange('analytics')} />
              {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC) && (
                <SidebarLink icon="fa-id-card-clip" label="Verification" active={activeTab === 'verification'} onClick={() => handleTabChange('verification')} badge={users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING).length || null} />
              )}
              {currentUser.role === UserRole.ADMIN && (
                <SidebarLink icon="fa-shield-halved" label="Policies" active={activeTab === 'policies'} onClick={() => handleTabChange('policies')} />
              )}
            </div>
          )}
        </aside>

        <main className="flex-1 p-8 overflow-auto transition-colors duration-300 bg-slate-50/50 dark:bg-slate-950">
          {renderContent()}
        </main>
      </div>

      {isNewRequestModalOpen && (
        <NewRequestModal onClose={() => setIsNewRequestModalOpen(false)} onSubmit={(data: any) => {
          setRequests([{ ...data, id: `TRV-${Math.random().toString(36).substr(2,4).toUpperCase()}`, timestamp: new Date().toISOString(), requesterName: currentUser.name, requesterId: currentUser.id, pncStatus: PNCStatus.NOT_STARTED, approvalStatus: ApprovalStatus.PENDING, priority: Priority.MEDIUM } as any, ...requests]);
          setIsNewRequestModalOpen(false);
          toast.success("Travel request sent for approval");
        }} />
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

const MyRequestsView = ({ requests, onNewRequest, onView, isWarningVisible }: any) => {
  const activeRequests = requests.filter((r: TravelRequest) => r.pncStatus !== PNCStatus.BOOKED_AND_CLOSED && r.pncStatus !== PNCStatus.REJECTED_PNC);
  
  return (
    <div className="space-y-8 animate-in fade-in duration-500 transition-all duration-300">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">My Requests</h2>
          <p className="text-slate-500 text-sm">Manage and track your active travel bookings.</p>
        </div>
        <button onClick={onNewRequest} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-600/20 active:scale-95 transition-all duration-300">+ New Booking</button>
      </header>

      {isWarningVisible && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-center gap-4 text-amber-800 dark:text-amber-400 animate-pulse transition-colors duration-300">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <p className="text-xs font-medium flex-1 transition-colors duration-300">Your profile verification is pending. Access to new bookings might be restricted soon. <button className="underline font-bold" onClick={() => toast.info('Update profile in settings')}>Verify Now</button></p>
        </div>
      )}

      {activeRequests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-300">
          {activeRequests.map((r: TravelRequest) => (
            <div key={r.id} onClick={() => onView(r)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl hover:shadow-xl hover:ring-2 hover:ring-indigo-500/20 transition-all duration-300 cursor-pointer group">
              <div className="flex justify-between mb-4"><span className="text-[10px] font-mono font-bold text-indigo-600 transition-colors duration-300">{r.id}</span><StatusBadge type="pnc" value={r.pncStatus} /></div>
              <h4 className="font-bold text-lg mb-1 text-slate-800 dark:text-white transition-colors duration-300">{r.from} → {r.to}</h4>
              <p className="text-xs text-slate-500 mb-4 font-medium transition-colors duration-300">{new Date(r.dateOfTravel).toLocaleDateString()} • {r.mode}</p>
              <div className="pt-4 border-t dark:border-slate-800 flex justify-between items-center transition-colors duration-300">
                <StatusBadge type="priority" value={r.priority} />
                <i className="fa-solid fa-chevron-right text-slate-200 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all duration-300"></i>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-4 border-2 border-dashed dark:border-slate-800 rounded-[2.5rem] transition-colors duration-300">
          <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300 text-2xl shadow-inner transition-colors duration-300"><i className="fa-solid fa-ticket"></i></div>
          <h3 className="font-bold text-slate-400 transition-colors duration-300">You do not have any active requests.</h3>
          <button onClick={onNewRequest} className="text-indigo-600 font-bold hover:underline transition-colors duration-300">Start your first booking</button>
        </div>
      )}
    </div>
  );
};

const VerificationQueue = ({ users, onUpdateUser }: { users: User[], onUpdateUser: (u: User) => void }) => {
  const pending = users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleAction = (status: VerificationStatus, reason?: string) => {
    if (!selectedUser) return;
    const updated = { ...selectedUser };
    if (updated.passportPhoto?.status === VerificationStatus.PENDING) {
      updated.passportPhoto = { ...updated.passportPhoto, status, rejectionReason: reason };
    }
    if (updated.idProof?.status === VerificationStatus.PENDING) {
      updated.idProof = { ...updated.idProof, status, rejectionReason: reason };
    }
    onUpdateUser(updated);
    setSelectedUser(null);
    toast.success(`Verification ${status === VerificationStatus.APPROVED ? 'Approved' : 'Rejected'}`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Verification Queue</h2>
      {pending.length === 0 ? (
        <div className="py-24 text-center text-slate-400 font-medium bg-white dark:bg-slate-900 rounded-[2.5rem] border dark:border-slate-800 transition-colors duration-300">All caught up! No pending verifications.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 transition-all duration-300">
          {pending.map(u => (
            <div key={u.id} onClick={() => setSelectedUser(u)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl flex items-center gap-4 hover:shadow-lg hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all duration-300 cursor-pointer group">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center font-bold text-indigo-600 text-xl shadow-inner transition-colors duration-300">
                {u.passportPhoto?.fileUrl ? <img src={u.passportPhoto.fileUrl} className="w-full h-full object-cover rounded-2xl transition-all duration-300" /> : u.name.charAt(0)}
              </div>
              <div className="flex-1 transition-colors duration-300">
                <h4 className="font-bold text-slate-800 dark:text-white transition-colors duration-300">{u.name}</h4>
                <p className="text-xs text-slate-500 font-medium transition-colors duration-300">Pending Docs: {[u.passportPhoto?.status === VerificationStatus.PENDING && 'Passport', u.idProof?.status === VerificationStatus.PENDING && 'ID Proof'].filter(Boolean).join(', ')}</p>
              </div>
              <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all duration-300 shadow-lg shadow-indigo-600/10">Review Docs</button>
            </div>
          ))}
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-all duration-300" onClick={() => setSelectedUser(null)}></div>
          <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 space-y-8 animate-in zoom-in-95 shadow-2xl transition-colors duration-300">
             <header className="flex justify-between items-center border-b dark:border-slate-800 pb-8 transition-colors duration-300">
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white transition-colors duration-300">Review Submissions</h3>
                  <p className="text-slate-500 text-sm font-medium transition-colors duration-300">{selectedUser.name} • {selectedUser.email}</p>
                </div>
                <button onClick={() => setSelectedUser(null)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors duration-300 text-slate-400"><i className="fa-solid fa-xmark text-xl"></i></button>
             </header>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[50vh] overflow-y-auto px-1 transition-all duration-300">
               <div className="space-y-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest transition-colors duration-300">Passport Photo</p>
                  <div className="aspect-square bg-slate-50 dark:bg-slate-800 rounded-3xl overflow-hidden border dark:border-slate-700 shadow-inner transition-colors duration-300">
                    {selectedUser.passportPhoto?.fileUrl ? <img src={selectedUser.passportPhoto.fileUrl} className="w-full h-full object-cover transition-all duration-300" /> : <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 transition-colors duration-300"><i className="fa-solid fa-camera text-4xl"></i><span className="text-[10px] font-bold uppercase">Not Provided</span></div>}
                  </div>
               </div>
               <div className="space-y-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest transition-colors duration-300">Authorized ID Proof</p>
                  <div className="aspect-square bg-slate-50 dark:bg-slate-800 rounded-3xl overflow-hidden border dark:border-slate-700 shadow-inner transition-colors duration-300">
                    {selectedUser.idProof?.fileUrl ? <img src={selectedUser.idProof.fileUrl} className="w-full h-full object-cover transition-all duration-300" /> : <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 transition-colors duration-300"><i className="fa-solid fa-id-card text-4xl"></i><span className="text-[10px] font-bold uppercase">Not Provided</span></div>}
                  </div>
               </div>
             </div>
             <div className="flex gap-4 pt-8 border-t dark:border-slate-800 transition-colors duration-300">
               <button onClick={() => handleAction(VerificationStatus.REJECTED, 'The uploaded image is blurry or documents are expired.')} className="flex-1 py-4 border-2 border-rose-100 dark:border-rose-900/30 text-rose-600 font-bold rounded-2xl hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-colors duration-300">Reject Submissions</button>
               <button onClick={() => handleAction(VerificationStatus.APPROVED)} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all duration-300">Approve & Unlock Access</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsView = ({ isDarkMode, onToggleTheme }: any) => (
  <div className="max-w-xl space-y-8 animate-in fade-in duration-500 transition-all duration-300">
    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Settings</h2>
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-[2rem] space-y-8 shadow-sm transition-colors duration-300">
      <div className="flex items-center justify-between transition-colors duration-300">
        <div><h4 className="font-bold text-slate-800 dark:text-white transition-colors duration-300">Dark Mode</h4><p className="text-xs text-slate-500 font-medium transition-colors duration-300">Toggle application appearance.</p></div>
        <Toggle active={isDarkMode} onChange={onToggleTheme} />
      </div>
      <div className="pt-8 border-t dark:border-slate-800 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">v2.5.0 Stable Build</div>
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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm transition-colors duration-300">
      <table className="w-full text-left">
        <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300"><tr><th className="px-6 py-5">ID</th><th className="px-6 py-5">Traveler</th><th className="px-6 py-5">Route</th><th className="px-6 py-5">Status</th></tr></thead>
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
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Past Requests</h2>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm transition-colors duration-300">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300"><tr><th className="px-6 py-5">Trip ID</th><th className="px-6 py-5">Destination</th><th className="px-6 py-5 text-right">Action</th></tr></thead>
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

const NewRequestModal = ({ onClose, onSubmit }: any) => {
  const [data, setData] = useState({ from: '', to: '', purpose: '', mode: TravelMode.FLIGHT, dateOfTravel: '' });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-all duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 space-y-8 shadow-2xl animate-in zoom-in-95 transition-colors duration-300">
         <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white transition-colors duration-300">New Travel Request</h2>
         <div className="space-y-5 transition-colors duration-300">
           <div className="space-y-2">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 transition-colors duration-300">Business Purpose</label>
             <textarea className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-800 p-4 rounded-2xl h-24 outline-none focus:border-indigo-500/50 transition-colors duration-300 text-sm font-medium dark:text-white" placeholder="Describe why this travel is necessary..." onChange={e => setData({...data, purpose: e.target.value})} />
           </div>
           <div className="grid grid-cols-2 gap-4 transition-all duration-300">
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 transition-colors duration-300">Origin</label>
                <input className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:border-indigo-500/50 transition-colors duration-300 text-sm font-medium dark:text-white" placeholder="E.g. Delhi" onChange={e => setData({...data, from: e.target.value})} />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 transition-colors duration-300">Destination</label>
                <input className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:border-indigo-500/50 transition-colors duration-300 text-sm font-medium dark:text-white" placeholder="E.g. Mumbai" onChange={e => setData({...data, to: e.target.value})} />
             </div>
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 transition-colors duration-300">Date of Travel</label>
              <input type="date" className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:border-indigo-500/50 transition-colors duration-300 text-sm font-medium dark:text-white" onChange={e => setData({...data, dateOfTravel: e.target.value})} />
           </div>
         </div>
         <div className="flex gap-4 pt-4 border-t dark:border-slate-800 transition-colors duration-300">
           <button onClick={onClose} className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 transition-colors duration-300">Cancel</button>
           <button onClick={() => onSubmit(data)} className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-indigo-600/20 active:scale-95 transition-all duration-300">Submit for Review</button>
         </div>
      </div>
    </div>
  );
};

const RequestDetailOverlay = ({ request, role, onClose, onUpdate }: any) => {
  const [status, setStatus] = useState(request.pncStatus);
  return (
    <div className="fixed inset-0 z-50 flex justify-end transition-all duration-300">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-all duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 h-full p-10 flex flex-col space-y-10 animate-in slide-in-from-right transition-all duration-300 shadow-2xl">
        <header className="flex justify-between items-center transition-colors duration-300">
          <div className="flex items-center gap-3 transition-colors duration-300">
            <span className="w-3 h-3 rounded-full bg-indigo-600 animate-pulse"></span>
            <h3 className="text-2xl font-black font-mono text-indigo-600 tracking-tighter transition-colors duration-300">{request.id}</h3>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors duration-300"><i className="fa-solid fa-xmark text-slate-400 text-xl"></i></button>
        </header>
        
        <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2rem] space-y-8 shadow-inner border border-slate-100 dark:border-slate-800 transition-colors duration-300">
          <div className="flex items-center gap-4 transition-colors duration-300">
            <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center font-bold text-indigo-600 shadow-sm border dark:border-slate-700 text-xl transition-all duration-300">{request.requesterName.charAt(0)}</div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors duration-300">Traveler</p>
              <p className="font-bold text-xl text-slate-900 dark:text-white transition-colors duration-300">{request.requesterName}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 pt-4 transition-all duration-300">
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors duration-300">Origin</p><p className="font-bold text-lg text-slate-700 dark:text-slate-300 transition-colors duration-300">{request.from}</p></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors duration-300">Destination</p><p className="font-bold text-lg text-slate-700 dark:text-slate-300 transition-colors duration-300">{request.to}</p></div>
          </div>
          <div className="pt-4 transition-colors duration-300"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors duration-300">Travel Purpose</p><p className="text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400 mt-2 p-4 bg-white dark:bg-slate-900 rounded-2xl italic border border-slate-100 dark:border-slate-800 transition-colors duration-300">"{request.purpose}"</p></div>
        </div>

        {role === UserRole.PNC ? (
          <div className="space-y-6 pt-10 border-t dark:border-slate-800 mt-auto transition-colors duration-300">
            <div className="space-y-2 transition-colors duration-300">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 transition-colors duration-300">Update Booking Status</label>
               <select className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-800 p-5 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-colors duration-300 appearance-none cursor-pointer text-slate-800 dark:text-white" value={status} onChange={e => setStatus(e.target.value as any)}>
                 {Object.values(PNCStatus).map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>
            <button onClick={() => onUpdate({...request, pncStatus: status})} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-2xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all duration-300">Apply Booking Update</button>
          </div>
        ) : (
          <div className="mt-auto p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl text-center transition-colors duration-300">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 transition-colors duration-300">Request Status</p>
            <StatusBadge type="pnc" value={request.pncStatus} />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
