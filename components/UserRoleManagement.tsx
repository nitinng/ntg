import React, { useState, useMemo, useEffect } from 'react';
import { User, UserRole } from '../types';
import Card from './Card';
import StatusBadge from './StatusBadge';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

interface UserRoleManagementProps {
  users: User[];
  onUpdateRole: (user: User, newRole: UserRole) => void;
  currentUser: User;
}

export const UserRoleManagement: React.FC<UserRoleManagementProps> = ({
  users,
  onUpdateRole,
  currentUser
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

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
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">User Management</h2>
          <p className="text-slate-500 text-sm mt-1">Manage users, roles and system access permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 hover:text-indigo-600 transition-all shadow-sm"
            title="Refresh Data"
          >
            <i className="fa-solid fa-sync"></i>
          </button>
          <button
            onClick={() => setIsAddUserModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-lg text-sm font-black shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
          >
            <i className="fa-solid fa-user-plus"></i>
            Add User
          </button>
          <div className="relative w-full md:w-80">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
            />
          </div>
        </div>
      </header>

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-black text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                <th className="px-8 py-6">User Details</th>
                <th className="px-8 py-6">Status / Role</th>
                <th className="px-8 py-6 text-right">Update Access</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {paginatedUsers.map(user => {
                const isProtectedAdmin = user.email?.toLowerCase() === 'nitin@navgurukul.org';
                return (
                  <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-indigo-50 dark:bg-slate-800 rounded-lg flex items-center justify-center font-black text-indigo-600 border border-slate-100 dark:border-slate-700 shadow-sm group-hover:scale-105 transition-transform">
                          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover rounded-lg" /> : user.name?.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-800 dark:text-white leading-tight">{user.name}</p>
                            {isProtectedAdmin && (
                              <span className="inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 select-none">
                                <i className="fa-solid fa-lock text-xs"></i>
                                FIXED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <StatusBadge type="status" value={user.role} />
                    </td>
                    <td className="px-8 py-5 text-right">
                      {isProtectedAdmin ? (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-lg text-xs font-black text-slate-400 dark:text-slate-500 select-none" title="This admin account is protected and cannot be changed">
                          <i className="fa-solid fa-lock text-xs"></i>
                          Protected Admin
                        </div>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => onUpdateRole(user, e.target.value as UserRole)}
                          className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-lg px-4 py-2 text-xs font-black text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-sm hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              })}
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
              className="w-10 h-10 rounded-lg flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-lg text-xs font-black transition-all ${currentPage === page ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="w-10 h-10 rounded-lg flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>
      </Card>

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsAddUserModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-2xl animate-in zoom-in-95 duration-200 z-10 overflow-hidden">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/20 dark:to-slate-900">
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
            <div className="px-8 py-8 space-y-6">
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
