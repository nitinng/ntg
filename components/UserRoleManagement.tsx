import React, { useState, useMemo, useEffect } from 'react';
import { User, UserRole, VerificationStatus } from '../types';
import Card from './Card';
import StatusBadge from './StatusBadge';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { PageBanner } from './PageBanner';

interface UserRoleManagementProps {
  users: User[];
  onUpdateRole: (user: User, newRole: UserRole) => void;
  currentUser: User;
}

const ROLE_TABS = [
  { id: 'ALL', label: 'All Roles', icon: 'fa-users' },
  { id: UserRole.EMPLOYEE, label: 'Employees', icon: 'fa-user' },
  { id: UserRole.PNC, label: 'PNC Team', icon: 'fa-plane-departure' },
  { id: UserRole.FINANCE, label: 'Finance', icon: 'fa-wallet' },
  { id: UserRole.ADMIN, label: 'Admins', icon: 'fa-shield-halved' },
];

export const UserRoleManagement: React.FC<UserRoleManagementProps> = ({
  users,
  onUpdateRole,
  currentUser
}) => {
  const [selectedRoleTab, setSelectedRoleTab] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    users.forEach(u => {
      if (u.department && u.department.trim()) {
        depts.add(u.department.trim());
      }
    });
    return Array.from(depts).sort();
  }, [users]);

  const getRoleCount = (roleId: string) => {
    if (roleId === 'ALL') return users.length;
    return users.filter(u => u.role === roleId).length;
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Role filter tab
      if (selectedRoleTab !== 'ALL' && user.role !== selectedRoleTab) {
        return false;
      }
      // Department filter
      if (departmentFilter !== 'ALL' && (user.department || 'General') !== departmentFilter) {
        return false;
      }
      // Verification status filter
      const vStatus = user.idProof?.status || VerificationStatus.INCOMPLETE;
      if (verificationFilter !== 'ALL' && vStatus !== verificationFilter) {
        return false;
      }
      // Search query (name, email, or phone)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = user.name?.toLowerCase().includes(q);
        const matchesEmail = user.email?.toLowerCase().includes(q);
        const matchesPhone = user.phone?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone) {
          return false;
        }
      }
      return true;
    });
  }, [users, selectedRoleTab, departmentFilter, verificationFilter, searchQuery]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRoleTab, departmentFilter, verificationFilter, itemsPerPage]);

  const handleInviteUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }
    setIsInviting(true);
    try {
      // Step 1: Send a magic link / signup invite via Supabase OTP
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: newUserEmail.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin,
          data: { name: newUserName.trim() || undefined }
        }
      });
      if (otpError) throw otpError;

      toast.success(`Invite sent to ${newUserEmail.trim()}! They will receive a magic link to sign in.`);
      setNewUserName('');
      setNewUserEmail('');
      setIsAddUserModalOpen(false);
    } catch (err: any) {
      toast.error('Failed to send invite: ' + err.message);
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageBanner
        title="User Management"
        description="Manage organization users, team roles, system access permissions, and onboard new colleagues."
        icon="fa-users-gear"
      >
        <button
          onClick={() => window.location.reload()}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all backdrop-blur-sm border border-white/20"
          title="Refresh Data"
        >
          <i className="fa-solid fa-sync"></i>
        </button>
        <button
          onClick={() => setIsAddUserModalOpen(true)}
          className="flex items-center gap-2 px-5 py-3 bg-white text-indigo-700 hover:bg-indigo-50 rounded-lg text-sm font-black shadow-lg transition-all"
        >
          <i className="fa-solid fa-user-plus"></i>
          Add User
        </button>
      </PageBanner>

      {/* Role Navigation Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-lg w-fit border border-slate-200 dark:border-slate-700 overflow-x-auto max-w-full scrollbar-none">
        {ROLE_TABS.map(tab => {
          const count = getRoleCount(tab.id);
          const isActive = selectedRoleTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedRoleTab(tab.id)}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <i className={`fa-solid ${tab.icon} text-xs ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}></i>
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[1.25rem] text-center transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300/60 dark:border-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Multi-Column Filter Bar (User, Department, Verification) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* User Search Input */}
        <div className="relative flex-1 max-w-md">
          <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">Dept:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Departments</option>
              {departmentOptions.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Verification Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">Verification:</span>
            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Verification</option>
              <option value={VerificationStatus.APPROVED}>Verified</option>
              <option value={VerificationStatus.PENDING}>Pending Review</option>
              <option value={VerificationStatus.INCOMPLETE}>Incomplete</option>
              <option value={VerificationStatus.REJECTED}>Rejected</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(selectedRoleTab !== 'ALL' || departmentFilter !== 'ALL' || verificationFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedRoleTab('ALL');
                setDepartmentFilter('ALL');
                setVerificationFilter('ALL');
                setSearchQuery('');
              }}
              className="text-xs text-rose-500 hover:text-rose-600 font-semibold px-2 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors flex items-center gap-1"
              title="Reset all filters"
            >
              <i className="fa-solid fa-rotate-left text-[10px]"></i>
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Department / Campus</th>
                <th className="px-4 py-2.5">Contact / Manager</th>
                <th className="px-4 py-2.5">Verification</th>
                <th className="px-4 py-2.5 text-right">Role & Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <i className="fa-solid fa-user-slash text-2xl text-slate-300 dark:text-slate-700 mb-2 block"></i>
                    <p className="font-semibold text-xs text-slate-500">No users match your filters.</p>
                    <button
                      onClick={() => {
                        setSelectedRoleTab('ALL');
                        setDepartmentFilter('ALL');
                        setVerificationFilter('ALL');
                        setSearchQuery('');
                      }}
                      className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                    >
                      Clear all filters
                    </button>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map(user => {
                const isProtectedAdmin = user.email?.toLowerCase() === 'nitin@navgurukul.org';
                const verificationStatus = user.idProof?.status || VerificationStatus.INCOMPLETE;
                return (
                  <tr key={user.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 bg-white dark:bg-slate-900 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-50 dark:bg-slate-800 rounded-lg flex items-center justify-center font-bold text-indigo-600 border border-slate-100 dark:border-slate-700 shadow-2xs shrink-0 text-xs">
                          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover rounded-lg" /> : (user.name?.charAt(0) || 'U')}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-slate-800 dark:text-white leading-tight truncate">{user.name}</p>
                            {isProtectedAdmin && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 select-none">
                                <i className="fa-solid fa-lock text-[9px]"></i>
                                FIXED
                              </span>
                            )}
                          </div>
                          <p className="text-2xs text-slate-500 font-medium truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {user.department || user.campus ? (
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-800 dark:text-white">{user.department || 'General'}</p>
                          {user.campus && (
                            <p className="text-2xs text-slate-500 flex items-center gap-1">
                              <i className="fa-solid fa-location-dot text-[9px] text-slate-400"></i>
                              {user.campus}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-2xs">Not specified</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="space-y-0.5">
                        <p className="font-mono text-2xs text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <i className="fa-solid fa-phone text-[9px] text-slate-400"></i>
                          {user.phone || <span className="text-slate-400 italic font-sans">No phone</span>}
                        </p>
                        <p className="text-2xs text-slate-500 truncate" title={user.managerEmail ? `Manager: ${user.managerEmail}` : undefined}>
                          <span className="text-slate-400 font-normal">Mgr:</span>{' '}
                          {user.managerName || user.managerEmail ? (
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {user.managerName || user.managerEmail}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">None assigned</span>
                          )}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        verificationStatus === VerificationStatus.APPROVED
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40'
                          : verificationStatus === VerificationStatus.PENDING
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40'
                          : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          verificationStatus === VerificationStatus.APPROVED ? 'bg-emerald-500' : verificationStatus === VerificationStatus.PENDING ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                        }`} />
                        {verificationStatus === VerificationStatus.APPROVED ? 'Verified' : verificationStatus === VerificationStatus.PENDING ? 'Pending' : 'Incomplete'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isProtectedAdmin ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-2xs font-bold text-slate-500 select-none">
                          <i className="fa-solid fa-lock text-3xs"></i>
                          Admin
                        </div>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => onUpdateRole(user, e.target.value as UserRole)}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-2xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-2xs hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={user.id === currentUser.id || (currentUser.role === UserRole.PNC && user.role !== UserRole.EMPLOYEE && user.role !== UserRole.PNC)}
                        >
                          {Object.values(UserRole).filter(role => {
                            if (currentUser.role === UserRole.PNC) {
                              return role === UserRole.EMPLOYEE || role === UserRole.PNC;
                            }
                            return true;
                          }).map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>

        {/* Pagination & Controls */}
        <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
              {filteredUsers.length > 0 ? (
                <>Showing <span className="text-slate-700 dark:text-white font-bold">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> of {filteredUsers.length}</>
              ) : "No users found"}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-bold text-slate-400 uppercase">Rows</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-2xs font-bold text-slate-600 dark:text-white outline-none"
              >
                {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="w-7 h-7 rounded flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-left text-2xs"></i>
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 rounded text-2xs font-bold transition-all ${currentPage === page ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="w-7 h-7 rounded flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-right text-2xs"></i>
            </button>
          </div>
        </div>
      </Card>

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsAddUserModalOpen(false)}></div>
          <div className="relative w-[90vw] h-[90vh] bg-white dark:bg-slate-900 rounded-lg shadow-2xl animate-in zoom-in-95 duration-200 z-10 overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/20 dark:to-slate-900 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-xl shadow-lg shadow-indigo-600/20">
                    <i className="fa-solid fa-user-plus"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Add New User</h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">Send an invitation to a new team member</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                >
                  <i className="fa-solid fa-xmark text-lg"></i>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-8 py-8 space-y-6 flex-1 overflow-y-auto max-w-xl mx-auto w-full">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-user text-slate-400"></i>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    disabled={isInviting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Email Address <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-envelope text-slate-400"></i>
                  </div>
                  <input
                    type="email"
                    placeholder="Enter email address"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInviteUser()}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    disabled={isInviting}
                  />
                </div>
              </div>

              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 rounded-lg flex gap-3">
                <i className="fa-solid fa-circle-info text-indigo-500 mt-0.5 flex-shrink-0"></i>
                <p className="text-xs text-indigo-700 dark:text-indigo-400/80 leading-relaxed font-medium">
                  An invitation magic link will be sent to the user's email. They can click it to sign in and complete their profile. Their default role will be <span className="font-black">Employee</span>.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-6 border-t dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex gap-3 justify-end">
              <button
                onClick={() => { setIsAddUserModalOpen(false); setNewUserName(''); setNewUserEmail(''); }}
                className="px-6 py-2.5 text-sm font-black text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                disabled={isInviting}
              >
                Cancel
              </button>
              <button
                onClick={handleInviteUser}
                disabled={isInviting || !newUserEmail.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-black rounded-lg shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInviting ? (
                  <><i className="fa-solid fa-spinner fa-spin"></i> Sending...</>
                ) : (
                  <><i className="fa-solid fa-paper-plane"></i> Send Invite</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserRoleManagement;
