import React, { useState } from 'react';
import { Department, User, UserRole } from '../types';
import Card from './Card';
import Input from './Input';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { PageBanner } from './PageBanner';
import { reportSos } from '../utils/sos/raiseSos';

interface DepartmentManagementProps {
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  currentUser?: User | null;
}

export const DepartmentManagement = ({ departments, setDepartments, currentUser }: DepartmentManagementProps) => {
  const [name, setName] = useState('');
  const [hodName, setHodName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const canEdit = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.PNC_ADMIN;

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast.error('Only PNC Admin or Admin can add departments.');
      return;
    }
    if (!name.trim()) {
      toast.error('Department Name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('departments')
        .insert({
          name: name.trim(),
          hod_name: hodName.trim() || null
        })
        .select()
        .single();

      if (error) throw error;

      setDepartments(prev => [...prev, {
        id: data.id,
        name: data.name,
        hod_name: data.hod_name,
        created_at: data.created_at,
        updated_at: data.updated_at
      }].sort((a, b) => a.name.localeCompare(b.name)));

      setName('');
      setHodName('');
      setIsAddModalOpen(false);
      toast.success(`Department "${data.name}" added successfully`);
    } catch (err: any) {
      reportSos('SETTINGS_SAVE_FAILED', err, { screen: 'departments', action: 'add' });
      toast.error(err.message || 'Failed to add department');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDepartment = async (id: string, name: string) => {
    if (!canEdit) {
      toast.error('Only PNC Admin or Admin can delete departments.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the department "${name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setDepartments(prev => prev.filter(d => d.id !== id));
      toast.success(`Department "${name}" deleted`);
    } catch (err: any) {
      reportSos('SETTINGS_SAVE_FAILED', err, { screen: 'departments', action: 'delete' });
      toast.error(err.message || 'Failed to delete department');
    }
  };

  const filteredDepartments = departments.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.hod_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageBanner
        title="Departments"
        description="Manage organization departments, designated cost centers, and department heads (HODs)."
        icon="fa-building"
      >
        {canEdit ? (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-white text-indigo-700 hover:bg-indigo-50 rounded-lg text-sm font-black shadow-lg transition-all active:scale-95 whitespace-nowrap"
          >
            <i className="fa-solid fa-plus"></i>
            Add Department
          </button>
        ) : (
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 backdrop-blur-sm">
            <i className="fa-solid fa-eye mr-1.5"></i> View Only
          </span>
        )}
      </PageBanner>

      {/* Main List: Full width, compact table */}
      <Card className="p-5 space-y-4 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Active Departments</h3>
            <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
              {filteredDepartments.length} {filteredDepartments.length === 1 ? 'department' : 'departments'}
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search departments or HOD..."
              className="w-full h-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 text-xs focus:border-indigo-600 outline-none font-medium text-slate-800 dark:text-white transition-colors"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Department Name</th>
                <th className="px-4 py-2.5">Department Head (HOD)</th>
                {canEdit && <th className="px-4 py-2.5 text-right w-24">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 3 : 2} className="px-4 py-10 text-center text-slate-400 font-medium bg-white dark:bg-slate-900">
                    No departments found.
                  </td>
                </tr>
              ) : (
                filteredDepartments.map(dept => (
                  <tr key={dept.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 bg-white dark:bg-slate-900 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xs font-black">
                          {dept.name.charAt(0).toUpperCase()}
                        </span>
                        <span>{dept.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-600 dark:text-slate-300">
                      {dept.hod_name ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <i className="fa-solid fa-user-shield text-indigo-500 text-3xs"></i>
                          {dept.hod_name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-2xs">Not Assigned</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                          className="w-7 h-7 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded transition-all active:scale-95"
                          title="Delete Department"
                        >
                          <i className="fa-solid fa-trash-can text-2xs"></i>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Department Modal (Standard 90vw 90vh) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => {
              if (!isSubmitting) setIsAddModalOpen(false);
            }}
          ></div>
          <div className="relative w-[90vw] h-[90vh] bg-white dark:bg-slate-900 rounded-lg shadow-2xl animate-in zoom-in-95 duration-200 z-10 overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-8 py-5 border-b dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/20 dark:to-slate-900 flex-shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-lg shadow-lg shadow-indigo-600/20">
                  <i className="fa-solid fa-building-circle-check"></i>
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Add Department</h3>
                  <p className="text-xs text-slate-500 font-medium">Create a new organizational department and assign a department head.</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close modal"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddDepartment} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-8 overflow-y-auto flex-1 space-y-6 max-w-2xl">
                <div className="space-y-4">
                  <Input
                    label="Department Name"
                    required
                    placeholder="e.g. AI LAB, Sama, Residential, Placement"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <Input
                    label="HOD Name (Optional)"
                    placeholder="e.g. Nitin Sudarshan"
                    value={hodName}
                    onChange={e => setHodName(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 rounded-lg flex gap-3">
                    <i className="fa-solid fa-circle-info text-indigo-500 mt-0.5 flex-shrink-0 text-sm"></i>
                    <p className="text-xs text-indigo-700 dark:text-indigo-400/90 leading-relaxed font-medium">
                      Departments will immediately appear in the department selection dropdown across employee onboarding, profiles, and travel booking requests.
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-8 py-4 border-t dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex gap-3 justify-end flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setName(''); setHodName(''); }}
                  className="px-5 py-2 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-lg shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> Adding...</>
                  ) : (
                    <><i className="fa-solid fa-plus-circle"></i> Add Department</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentManagement;
