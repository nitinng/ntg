import React, { useState } from 'react';
import { TravelRequest, PNCStatus, UserRole, TripType } from '../types';
import StatusBadge from './StatusBadge';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { checkPolicyViolation } from '../utils/policyUtils';

interface RequestDetailOverlayProps {
  request: TravelRequest;
  role: UserRole;
  onClose: () => void;
  onUpdate: (updatedRequest: TravelRequest) => Promise<void>;
  policies?: any[];
}

export const RequestDetailOverlay = ({
  request,
  role,
  onClose,
  onUpdate,
  policies = []
}: RequestDetailOverlayProps) => {
  const isPolicyViolated = request.hasViolation || (policies.length > 0 ? checkPolicyViolation(request, policies) : false);
  const [status, setStatus] = useState(request.pncStatus);
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showCancellationForm, setShowCancellationForm] = useState(false);

  // Booking Details State
  const [ticketCost, setTicketCost] = useState<string | number>(request.ticketCost || '');
  const [vendorName, setVendorName] = useState(request.vendorName || '');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInvoiceFile(e.target.files[0]);
    }
  };

  const handleUpdate = async () => {
    try {
      let finalStatus = status;

      // Force a reason for rejection or cancellation
      const requiresReason = 
        status === PNCStatus.REJECTED_BY_PNC ||
        status === PNCStatus.CANCELLED_BY_PNC ||
        status === PNCStatus.CANCELLED_BY_EMPLOYEE ||
        status === PNCStatus.REJECTED_BY_MANAGER;

      if (requiresReason && !statusChangeReason.trim()) {
        toast.error(`Please provide a reason for the ${status} action.`);
        setShowNotes(true);
        return;
      }

      setIsUploading(true);
      let invoiceUrl = request.invoiceUrl;

      if (invoiceFile && status === PNCStatus.BOOKED) {
        const fileExt = invoiceFile.name.split('.').pop();
        const fileName = `${request.id}_invoice_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(fileName, invoiceFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('invoices').getPublicUrl(fileName);
        invoiceUrl = data.publicUrl;
      }

      // Auto-close if all details are present
      if (status === PNCStatus.BOOKED && ticketCost && vendorName && invoiceUrl) {
        finalStatus = PNCStatus.CLOSED;
        toast.success("All booking details verified. Request automatically closed!");
      }

      await onUpdate({
        ...request,
        pncStatus: finalStatus,
        statusChangeReason: finalStatus === PNCStatus.CLOSED ? (statusChangeReason || 'Auto-closed after booking details completed') : statusChangeReason,
        cancelledReason: (finalStatus === PNCStatus.CANCELLED_BY_EMPLOYEE || finalStatus === PNCStatus.CANCELLED_BY_PNC) ? statusChangeReason : request.cancelledReason,
        ticketCost: status === PNCStatus.BOOKED ? parseFloat(ticketCost.toString()) : request.ticketCost,
        vendorName: status === PNCStatus.BOOKED ? vendorName : request.vendorName,
        invoiceUrl: status === PNCStatus.BOOKED ? invoiceUrl : request.invoiceUrl
      });

      setIsUploading(false);
    } catch (error: any) {
      setIsUploading(false);
      console.error("Update failed:", error);
      toast.error("Failed to update request: " + error.message);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancellationReason.trim()) {
      toast.error("Please enter a reason for cancelling this request.");
      return;
    }
    try {
      setIsUploading(true);
      await onUpdate({
        ...request,
        pncStatus: PNCStatus.CANCELLED_BY_EMPLOYEE,
        statusChangeReason: cancellationReason,
        cancelledReason: cancellationReason
      });
      setIsUploading(false);
      onClose();
    } catch (error: any) {
      setIsUploading(false);
      console.error(error);
      toast.error("Failed to cancel request: " + error.message);
    }
  };

  const InfoRow = ({ label, value, icon, fullWidth = false }: any) => (
    <div className={`${fullWidth ? 'col-span-2' : ''} space-y-1`}>
      <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
        {icon && <span className="opacity-50">{icon}</span>}
        {label}
      </p>
      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate-none h-auto min-h-[1.25rem]">
        {value || '—'}
      </p>
    </div>
  );

  const SectionHeader = ({ title, icon }: any) => (
    <div className="flex items-center gap-2 pb-2 border-b dark:border-slate-800 mb-4 mt-6 first:mt-0">
      <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
      <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">{title}</h4>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end transition-all duration-300">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-all duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 h-full flex flex-col animate-in slide-in-from-right transition-all duration-300 shadow-2xl border-l border-white/10">

        {/* Header */}
        <header className="px-6 py-4 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
            <h3 className="text-lg font-black font-mono text-indigo-600 tracking-tight">{request.submissionId || request.id}</h3>
            <StatusBadge type="pnc" value={request.pncStatus} />
            <StatusBadge type="priority" value={request.priority} />
            {isPolicyViolated && (
              <div className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-3 py-1 rounded-full text-xs font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 animate-pulse">
                <i className="fa-solid fa-triangle-exclamation"></i>
                Policy Violation
              </div>
            )}
          </div>
          <button onClick={onClose} className="w-9 h-9 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 flex items-center justify-center">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 md:p-10 custom-scrollbar space-y-10">

          {/* Main Stats Header */}
          <div className="bg-indigo-600 rounded-lg p-5 text-white shadow-lg shadow-indigo-600/20 relative overflow-hidden">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-indigo-200 text-xs font-bold uppercase tracking-wide mb-1 opacity-75">{request.mode}</p>
                <h4 className="text-xl font-black tracking-tight">{request.from} → {request.to}</h4>
              </div>
              <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10">
                <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-0.5">Departure</p>
                <p className="text-sm font-black">{new Date(request.dateOfTravel).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-8">
            {/* Traveler & Org Details */}
            <div className="col-span-2">
              <SectionHeader title="Traveler Details" icon={<i className="fa-solid fa-user-circle"></i>} />
              <div className="grid grid-cols-2 gap-y-6">
                <InfoRow label="Full Name" value={request.requesterName} icon={<i className="fa-solid fa-signature"></i>} />
                <InfoRow label="Email Address" value={request.requesterEmail} icon={<i className="fa-solid fa-envelope"></i>} />
                <InfoRow label="Phone Number" value={request.requesterPhone} icon={<i className="fa-solid fa-phone"></i>} />
                <InfoRow label="Dept / Campus" value={`${request.requesterDepartment || '—'} / ${request.requesterCampus || '—'}`} icon={<i className="fa-solid fa-building"></i>} />
              </div>
            </div>

            {/* Trip Specifics */}
            <div className="col-span-2">
              <SectionHeader title="Logistics & Preferences" icon={<i className="fa-solid fa-route"></i>} />
              <div className="grid grid-cols-2 gap-y-6">
                <InfoRow label="Trip Type" value={request.tripType} icon={<i className="fa-solid fa-arrows-left-right"></i>} />
                <InfoRow label="Travel Mode" value={request.mode} icon={<i className="fa-solid fa-train"></i>} />
                <InfoRow label="Preferred Window" value={request.preferredDepartureWindow} icon={<i className="fa-solid fa-clock"></i>} />
                <InfoRow label="Traveling Staff" value={request.travellerNames} icon={<i className="fa-solid fa-users"></i>} />

                {request.tripType === TripType.ROUND_TRIP && (
                  <>
                    <div className="col-span-2 h-px bg-slate-100 dark:bg-slate-800 my-2"></div>
                    <InfoRow label="Return Date" value={request.returnDate ? new Date(request.returnDate).toLocaleDateString() : '—'} icon={<i className="fa-solid fa-calendar"></i>} />
                    <InfoRow label="Return Window" value={request.returnPreferredDepartureWindow} icon={<i className="fa-solid fa-clock"></i>} />
                  </>
                )}

                <div className="col-span-2 h-px bg-slate-100 dark:bg-slate-800 my-2"></div>
                <InfoRow label="Travel Purpose" value={request.purpose} fullWidth icon={<i className="fa-solid fa-bullseye"></i>} />
                <InfoRow label="Special Requirements" value={request.specialRequirements} fullWidth icon={<i className="fa-solid fa-hand-holding-heart"></i>} />

                <div className="col-span-2 h-px bg-slate-100 dark:bg-slate-800 my-2"></div>
                <div className="col-span-2 space-y-1">
                  <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <i className={`fa-solid ${isPolicyViolated ? 'fa-triangle-exclamation text-rose-500' : 'fa-check-circle text-emerald-500'} opacity-70`}></i>
                    Policy Compliance
                  </p>
                  <p className={`text-sm font-bold ${isPolicyViolated ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {isPolicyViolated ? (request.violationDetails || 'Advance booking policy violation') : 'No Violation'}
                  </p>
                </div>
              </div>
            </div>

            {/* Booking Details (If Booked) */}
            {(request.pncStatus === PNCStatus.BOOKED || request.pncStatus === PNCStatus.CLOSED) && (
              <div className="col-span-2">
                <SectionHeader title="Booking Confirmation" icon={<i className="fa-solid fa-check-circle"></i>} />
                <div className="grid grid-cols-2 gap-y-6 bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/20">
                  <InfoRow label="Ticket Cost" value={`₹ ${request.ticketCost}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} />
                  <InfoRow label="Vendor" value={request.vendorName} icon={<i className="fa-solid fa-shop"></i>} />
                  {request.invoiceUrl ? (
                    <div className="col-span-2">
                      <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-1">
                        <i className="fa-solid fa-file-invoice opacity-50"></i> Ticket
                      </p>
                      <a href={request.invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                        View Ticket <i className="fa-solid fa-external-link-alt text-xs"></i>
                      </a>
                    </div>
                  ) : (
                    <InfoRow label="Ticket" value="Not Uploaded" icon={<i className="fa-solid fa-file-invoice"></i>} />
                  )}
                </div>
              </div>
            )}

            {/* Manager Details */}
            <div className="col-span-2">
              <SectionHeader title="Professional Oversight" icon={<i className="fa-solid fa-user-tie"></i>} />
              <div className="grid grid-cols-2 gap-y-6">
                <InfoRow label="Approving Manager" value={request.approvingManagerName} icon={<i className="fa-solid fa-id-badge"></i>} />
                <InfoRow label="Manager Email" value={request.approvingManagerEmail} icon={<i className="fa-solid fa-at"></i>} />
              </div>
            </div>

            {/* Emergency & Medical */}
            <div className="col-span-2">
              <SectionHeader title="Emergency & Health" icon={<i className="fa-solid fa-heart-pulse"></i>} />
              <div className="grid grid-cols-2 gap-y-6">
                <InfoRow label="Emergency Contact" value={`${request.emergencyContactName || '—'} (${request.emergencyContactRelation || '—'})`} icon={<i className="fa-solid fa-contact-book"></i>} />
                <InfoRow label="Contact Phone" value={request.emergencyContactPhone} icon={<i className="fa-solid fa-mobile-screen"></i>} />
                <InfoRow label="Blood Group" value={request.bloodGroup} icon={<i className="fa-solid fa-droplet"></i>} />
                <InfoRow label="Medical Conditions" value={request.medicalConditions} icon={<i className="fa-solid fa-notes-medical"></i>} />
              </div>
            </div>

            {/* Timeline / History */}
            <div className="col-span-2 pt-6">
              <SectionHeader title="Process Timeline" icon={<i className="fa-solid fa-clock-rotate-left"></i>} />
              <div className="space-y-6 ml-1 flex flex-col">
                {request.timeline?.map((event: any, idx: number) => (
                  <div key={idx} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-500/10 z-10"></div>
                      {idx !== request.timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-100 dark:bg-slate-800"></div>}
                    </div>
                    <div className="pb-6">
                      <p className="text-xs font-black text-slate-900 dark:text-white mb-1 uppercase tracking-tight">{event.event}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-500/60 font-mono tracking-tighter">{new Date(event.timestamp).toLocaleString()}</span>
                        <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">by {event.actor}</span>
                      </div>
                      {event.details && <p className="text-xs text-slate-500 mt-2 font-medium">{event.details}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-8 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20">
          {role === UserRole.PNC ? (
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Update Status</label>

              <div className="relative">
                <select
                  className="w-full h-11 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-4 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all appearance-none cursor-pointer shadow-sm"
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                >
                  {Object.values(PNCStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <i className="fa-solid fa-chevron-down text-xs"></i>
                </div>
              </div>

              {/* Conditional Inputs for Booked Status */}
              {status === PNCStatus.BOOKED && (
                <div className="space-y-3 animate-in slide-in-from-top-2 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Ticket Cost (₹)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 font-medium text-sm focus:border-indigo-600 outline-none"
                        value={ticketCost}
                        onChange={e => setTicketCost(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Vendor Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Indigo"
                        className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 font-medium text-sm focus:border-indigo-600 outline-none"
                        value={vendorName}
                        onChange={e => setVendorName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Upload Ticket</label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.png,.jpeg"
                      onChange={handleFileChange}
                      className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowNotes(!showNotes)}
                className="w-full text-left px-4 py-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-2"
              >
                <i className={`fa-solid fa-chevron-${showNotes ? 'up' : 'down'} text-xs`}></i>
                {showNotes ? 'Hide' : 'Add'} Notes / Reason (Optional)
              </button>

              {showNotes && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <textarea
                    className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all shadow-sm resize-none"
                    rows={3}
                    placeholder="Add context for this status change (e.g., reason for rejection, booking details, etc.)"
                    value={statusChangeReason}
                    onChange={e => setStatusChangeReason(e.target.value)}
                  />
                </div>
              )}

              <button
                onClick={handleUpdate}
                disabled={isUploading}
                className="w-full bg-indigo-600 text-white h-11 rounded-lg font-bold uppercase tracking-wide text-xs shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Processing...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check mr-2"></i> Update & Log
                  </>
                )}
              </button>
            </div>
          ) : role === UserRole.EMPLOYEE &&
            request.pncStatus !== PNCStatus.CANCELLED_BY_EMPLOYEE &&
            request.pncStatus !== PNCStatus.CANCELLED_BY_PNC &&
            request.pncStatus !== PNCStatus.CLOSED ? (
            <div className="space-y-4 w-full">
              {!showCancellationForm ? (
                <button
                  onClick={() => setShowCancellationForm(true)}
                  className="w-full bg-rose-600 text-white h-11 rounded-lg font-bold uppercase tracking-wide text-xs shadow-lg shadow-rose-600/20 hover:bg-rose-700 active:scale-95 transition-all"
                >
                  <i className="fa-solid fa-circle-xmark mr-2"></i> Cancel Request
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Cancel Request Reason</label>
                      <button 
                        onClick={() => setShowCancellationForm(false)} 
                        className="text-xs font-black text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-widest"
                      >
                        Back
                      </button>
                    </div>
                    <textarea
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all shadow-sm resize-none"
                      rows={3}
                      placeholder="Please provide a reason for cancelling this travel request (required)..."
                      value={cancellationReason}
                      onChange={e => setCancellationReason(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleCancelRequest}
                    disabled={isUploading}
                    className="w-full bg-rose-600 text-white h-11 rounded-lg font-bold uppercase tracking-wide text-xs shadow-lg shadow-rose-600/20 hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Cancelling...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-check mr-2"></i> Confirm Cancellation
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 italic">This request is currently in the </span>
                <StatusBadge type="pnc" value={request.pncStatus} />
                <span className="text-xs font-bold text-slate-400 italic"> stage.</span>
              </div>
              {request.cancelledReason && (
                <p className="text-xs text-rose-500 dark:text-rose-400 font-bold mt-1 text-center bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 rounded-lg border border-rose-100 dark:border-rose-900/30">
                  Reason: {request.cancelledReason}
                </p>
              )}
              {request.statusChangeReason && request.pncStatus === PNCStatus.REJECTED_BY_PNC && (
                <p className="text-xs text-rose-500 dark:text-rose-400 font-bold mt-1 text-center bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 rounded-lg border border-rose-100 dark:border-rose-900/30">
                  Rejection Reason: {request.statusChangeReason}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestDetailOverlay;
