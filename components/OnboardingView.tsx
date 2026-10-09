import React, { useState, useEffect, useMemo } from 'react';
import { SignedImage } from './SignedMedia';
import { User, PolicyConfig, VerificationStatus, IdProofType, UserDocument, Department } from '../types';
import Card from './Card';
import Input from './Input';
import Select from './Select';
import TextArea from './TextArea';
import StatusBadge from './StatusBadge';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { areBookingEmailsIdentical } from '../utils/bookingValidation';
import { reportSos } from '../utils/sos/raiseSos';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  icon?: string;
  columns?: string;
}

export const Section: React.FC<SectionProps> = ({ title, children, icon, columns = 'grid-cols-1 sm:grid-cols-2' }) => (
  <div className="space-y-4 pt-4 first:pt-0">
    <div className="flex items-center gap-2.5 border-b dark:border-slate-800 pb-2.5">
      {icon && (
        <div className="w-7 h-7 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md flex items-center justify-center text-xs">
          <i className={`fa-solid ${icon}`}></i>
        </div>
      )}
      <h4 className="font-bold text-slate-800 dark:text-white text-base leading-none">{title}</h4>
    </div>
    <div className={`grid ${columns} gap-4`}>
      {children}
    </div>
  </div>
);

export const SubHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="md:col-span-2">
    <h5 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{title}</h5>
  </div>
);

interface OnboardingViewProps {
  user: User;
  policy: PolicyConfig;
  onUpdate: (updatedUser: User) => void;
  isLock?: boolean;
  onSkip?: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  onLogout?: () => void;
  departments?: Department[];
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  user,
  policy,
  onUpdate,
  isLock,
  onSkip,
  isDarkMode,
  onToggleTheme,
  onLogout,
  departments = []
}) => {
  const [formData, setFormData] = useState<User>(user);

  // Sync internal state if prop changes (important for role toggles)
  useEffect(() => {
    setFormData(user);
  }, [user]);

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
      // Verification and reimbursement both block on a file that is not
      // there, and the employee cannot escalate what nobody recorded.
      reportSos('DOCUMENT_UPLOAD_FAILED', err, { field, bucket: 'user-documents' });
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
    if (areBookingEmailsIdentical(formData.email, formData.managerEmail)) {
      toast.error("Email address and Approving Manager Email cannot be the same");
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
    <div className={`space-y-6 animate-in fade-in duration-500 pb-16 ${isLock ? 'w-full max-w-3xl mx-auto' : ''}`}>
      <header className="flex flex-col md:flex-row items-center gap-6 bg-white dark:bg-slate-900 p-5 md:p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative group shrink-0">
          <div className={`w-20 h-20 sm:w-24 sm:h-24 bg-indigo-50 dark:bg-slate-800 rounded-full overflow-hidden border-2 border-white dark:border-slate-900 shadow-md transition-all group-hover:brightness-90 flex items-center justify-center ${isUploading === 'avatar' ? 'animate-pulse' : ''}`}>
            {isUploading === 'avatar' ? (
              <i className="fa-solid fa-spinner fa-spin text-indigo-600 text-2xl"></i>
            ) : formData.avatar ? (
              <img src={formData.avatar} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{formData.name?.charAt(0) || 'U'}</span>
            )}
          </div>
          <label className="absolute bottom-0 right-0 w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-slate-900 transform group-hover:scale-110 transition-all cursor-pointer">
            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'avatar')} disabled={!!isUploading} />
            <i className="fa-solid fa-camera text-[10px]"></i>
          </label>
        </div>

        <div className="flex-1 text-center md:text-left space-y-1.5 w-full">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">{isLock ? 'Getting Started' : 'Account Profile'}</h2>
              <p className="text-slate-500 text-xs sm:text-sm font-medium">{isLock ? 'Please complete your profile to enable travel booking features.' : 'Maintain your personal, professional and identity information.'}</p>
            </div>
            {!isLock && (
              <div className="flex items-center gap-2 self-center md:self-start">
                <button
                  onClick={onToggleTheme}
                  className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-lg transition-all shadow-sm active:scale-95"
                  title="Toggle Theme"
                >
                  {isDarkMode ? <i className="fa-solid fa-sun text-sm"></i> : <i className="fa-solid fa-moon text-sm"></i>}
                </button>
                <button
                  onClick={onLogout}
                  className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-xs font-black uppercase tracking-widest rounded-lg transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  Sign Out
                </button>
              </div>
            )}
          </div>

          <div className="mt-3">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none">Profile Completeness</span>
              <span className={`text-[11px] font-bold leading-none ${completeness === 100 ? 'text-emerald-500' : 'text-indigo-600'}`}>{completeness}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
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
          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                <i className="fa-solid fa-forward-step text-xl text-indigo-500"></i>
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800 dark:text-white">Need to book travel immediately?</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">You can temporarily skip verification for {policy.temporaryUnlockDays} days. After this window, full verification will be required to maintain access.</p>
              </div>
            </div>
            <button onClick={onSkip} className="whitespace-nowrap px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 rounded-lg text-xs font-black uppercase hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 transition-all shadow-sm active:scale-95">Skip for Now</button>
          </div>
        )}

        {policy.isEnforcementEnabled && minDaysRemaining !== null && minDaysRemaining > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-5 flex items-start gap-4 animate-in slide-in-from-top-2">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
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
          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-lg p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-lg flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
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

      <Card className="p-5 md:p-7 space-y-6 md:space-y-7">
        {/* Personal Details */}
        <Section title="Personal Information" icon="fa-user-gear" columns="grid-cols-1 md:grid-cols-3">
          <Input label="Full Name" value={formData.name || ''} onChange={(e: any) => setFormData({ ...formData, name: e.target.value })} />
          <Input label="Email Address" value={formData.email || ''} disabled placeholder="From authentication" />
          <Input label="Contact Number" value={formData.phone || ''} placeholder="10 digit mobile number" onChange={(e: any) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
        </Section>

        {/* Org Details */}
        <Section title="Professional Details" icon="fa-briefcase" columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Department"
            value={formData.department || ''}
            options={departments.map((d: any) => ({ label: d.name, value: d.name }))}
            placeholder="Select department..."
            onChange={(e: any) => setFormData({ ...formData, department: e.target.value })}
          />
          <Input label="Campus / Location" value={formData.campus || ''} onChange={(e: any) => setFormData({ ...formData, campus: e.target.value })} />
          <Input label="Approving Manager Name" value={formData.managerName || ''} onChange={(e: any) => setFormData({ ...formData, managerName: e.target.value })} />
          <Input
            label="Approving Manager Email"
            type="email"
            value={formData.managerEmail || ''}
            error={areBookingEmailsIdentical(formData.email, formData.managerEmail) ? "Email address and Approving Manager Email cannot be the same" : undefined}
            onChange={(e: any) => setFormData({ ...formData, managerEmail: e.target.value })}
          />
        </Section>

        {/* Emergency & Medical Information */}
        <Section title="Emergency & Health" icon="fa-heart-pulse" columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Emergency Contact Name" value={formData.emergencyContactName || ''} onChange={(e: any) => setFormData({ ...formData, emergencyContactName: e.target.value })} />
          <Input label="Relationship" value={formData.emergencyContactRelation || ''} onChange={(e: any) => setFormData({ ...formData, emergencyContactRelation: e.target.value })} />
          <Input label="Emergency Contact Number" value={formData.emergencyContactPhone || ''} placeholder="10 digit mobile number" onChange={(e: any) => setFormData({ ...formData, emergencyContactPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          <Select
            label="Blood Group"
            value={formData.bloodGroup || ''}
            options={bloodGroupOptions}
            onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <TextArea
              label="Medical Conditions (Optional)"
              value={formData.medicalConditions || ''}
              placeholder="List any serious medical conditions, disabilities or allergies PNC should be aware of"
              onChange={(e) => setFormData({ ...formData, medicalConditions: e.target.value })}
            />
          </div>
        </Section>

        {/* Identity Verification */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between border-b dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-indigo-600/20 text-xs"><i className="fa-solid fa-file-shield"></i></div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-base leading-none">Identity Verification</h4>
                <p className="text-[10px] text-slate-500 mt-1 uppercase font-black tracking-widest leading-none">Approval Required</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* A. Passport Photo */}
            <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-800/30 rounded-lg p-5 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h5 className="font-black text-slate-800 dark:text-white text-xs sm:text-sm">A. Passport Photo</h5>
                  <p className="text-2xs text-slate-500 mt-0.5">Clear headshot with plain background</p>
                </div>
                <StatusBadge type="status" value={formData.passportPhoto?.status || VerificationStatus.INCOMPLETE} />
              </div>

              <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 p-4 min-h-[140px] group transition-all hover:border-indigo-400">
                {isUploading === 'passportPhoto' ? (
                  <div className="flex flex-col items-center gap-2">
                    <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-600"></i>
                    <p className="text-3xs font-bold text-indigo-600 uppercase tracking-widest">Uploading...</p>
                  </div>
                ) : formData.passportPhoto?.fileUrl ? (
                  <div className="relative group/preview">
                    <SignedImage storedUrl={formData.passportPhoto.fileUrl} alt="Passport photo" className="w-28 h-28 rounded-lg object-cover shadow-md border-2 border-white dark:border-slate-800" />
                    <div className="absolute inset-0 bg-slate-900/40 rounded-lg opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                      <i className="fa-solid fa-eye text-white text-xl"></i>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-center text-2xl group-hover:scale-110 transition-transform"><i className="fa-solid fa-image-portrait"></i></div>
                    <p className="text-2xs font-medium">No photo uploaded</p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-center">
                {(!formData.passportPhoto?.fileUrl || formData.passportPhoto.status === VerificationStatus.REJECTED || formData.passportPhoto.status === VerificationStatus.PENDING || formData.passportPhoto.status === VerificationStatus.INCOMPLETE) && (
                  <label className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-bold text-xs shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer">
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'passportPhoto')} disabled={!!isUploading} />
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    {formData.passportPhoto?.fileUrl ? 'Replace Photo' : 'Upload Photo'}
                  </label>
                )}
              </div>
            </div>

            {/* B. Government ID */}
            <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-800/30 rounded-lg p-5 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h5 className="font-black text-slate-800 dark:text-white text-xs sm:text-sm">B. Government ID</h5>
                  <p className="text-2xs text-slate-500 mt-0.5">Proof of identity (Aadhaar, Passport, etc.)</p>
                </div>
                <StatusBadge type="status" value={formData.idProof?.status || VerificationStatus.INCOMPLETE} />
              </div>

              <div className="space-y-4 flex-1 flex flex-col">
                <Select
                  label="ID Type"
                  value={formData.idProof?.type || ''}
                  options={Object.values(IdProofType).map(v => ({ label: v, value: v }))}
                  onChange={(e) => setFormData({ ...formData, idProof: { ...(formData.idProof || {}), type: e.target.value as IdProofType, status: formData.idProof?.status || VerificationStatus.INCOMPLETE } })}
                />

                <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 p-4 min-h-[140px] group transition-all hover:border-violet-400">
                  {isUploading === 'idProof' ? (
                    <div className="flex flex-col items-center gap-2">
                      <i className="fa-solid fa-circle-notch fa-spin text-2xl text-violet-600"></i>
                      <p className="text-3xs font-bold text-violet-600 uppercase tracking-widest">Uploading...</p>
                    </div>
                  ) : formData.idProof?.fileUrl ? (
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 w-full">
                      <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center text-violet-600 shadow-sm shrink-0"><i className="fa-solid fa-file-pdf text-lg"></i></div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate">Document Uploaded</p>
                        <p className="text-[10px] text-slate-500 font-medium">Click to replace or view</p>
                      </div>
                      <i className="fa-solid fa-check-circle text-emerald-500 text-sm"></i>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-center text-2xl group-hover:scale-110 transition-transform"><i className="fa-solid fa-address-card"></i></div>
                      <p className="text-2xs font-medium">No document uploaded</p>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex justify-center">
                  {(!formData.idProof?.fileUrl || formData.idProof.status === VerificationStatus.REJECTED || formData.idProof.status === VerificationStatus.PENDING || formData.idProof.status === VerificationStatus.INCOMPLETE) && (
                    <label className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-2.5 rounded-lg font-bold text-xs shadow-md shadow-violet-600/20 hover:bg-violet-700 active:scale-95 transition-all cursor-pointer">
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

        <div className="pt-5 border-t dark:border-slate-800">
          <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all">Save Profile Changes</button>
        </div>
      </Card>
    </div>
  );
};

export default OnboardingView;
