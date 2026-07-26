import React, { useState } from 'react';
import { Department } from '../types';
import Card from './Card';
import Input from './Input';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

interface DepartmentManagementProps {
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
}

export const DepartmentManagement = ({ departments, setDepartments }: DepartmentManagementProps) => {
  const [name, setName] = useState('');
  const [hodName, setHodName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
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
      toast.success(`Department "${data.name}" added successfully`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to add department');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDepartment = async (id: string, name: string) => {
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
      console.error(err);
      toast.error(err.message || 'Failed to delete department');
    }
  };

  const filteredDepartments = departments.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.hod_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Departments</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Manage organization departments and department heads (HODs).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Add form */}
        <div className="lg:col-span-1">
          <Card className="p-6 space-y-6">
            <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Add Department</h3>
            <form onSubmit={handleAddDepartment} className="space-y-4">
              <Input
                label="Department Name"
                required
                placeholder="e.g. AI LAB, Sama, Residential"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <Input
                label="HOD Name (Optional)"
                placeholder="e.g. Nitin Sudarshan"
                value={hodName}
                onChange={e => setHodName(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <i className="fa-solid fa-spinner fa-spin text-sm"></i>
                ) : (
                  <i className="fa-solid fa-plus-circle text-sm"></i>
                )}
                Add Department
              </button>
            </form>
          </Card>
        </div>

        {/* Right: List of Departments */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Active Departments</h3>
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search departments..."
                  className="w-full h-10 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 text-sm focus:border-indigo-600 outline-none font-medium text-slate-800 dark:text-white"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-2xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Department Name</th>
                    <th className="px-6 py-4">HOD Name</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {filteredDepartments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400 font-medium bg-white dark:bg-slate-900">
                        No departments found.
                      </td>
                    </tr>
                  ) : (
                    filteredDepartments.map(dept => (
                      <tr key={dept.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 bg-white dark:bg-slate-900 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{dept.name}</td>
                        <td className="px-6 py-4 font-medium text-slate-500 dark:text-slate-450">
                          {dept.hod_name ? (
                            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                              <i className="fa-solid fa-user-shield text-indigo-500 text-xs"></i>
                              {dept.hod_name}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not Assigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                            className="p-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-450 rounded-lg transition-all"
                            title="Delete Department"
                          >
                            <i className="fa-solid fa-trash-can text-sm"></i>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DepartmentManagement;
