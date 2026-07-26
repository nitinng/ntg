import React, { useState } from 'react';
import { TravelRequest, PNCStatus, UserRole, TripType, Advance, AdvanceChangelogEntry } from '../types';
import StatusBadge from './StatusBadge';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { checkPolicyViolation } from '../utils/policyUtils';
import CancellationModal from './CancellationModal';

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

  const handleEmployeeRequestCancel = async () => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.full_name || user?.email || 'Employee';

      const newTimeline = [
        ...(request.timeline || []),
        {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          actor: userName,
          event: `Cancellation Requested`,
          details: `Employee requested cancellation of this ticket.`
        }
      ];

      const { error } = await supabase
        .from('travel_requests')
        .update({
          pnc_status: PNCStatus.CANCELLATION_REQUESTED,
          timeline: newTimeline,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id);

      if (error) throw error;

      toast.success('Cancellation request submitted successfully');
      setShowCancellationForm(false);
      onClose();
      window.location.reload();
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to submit cancellation request: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Booking Details State
  const [ticketCost, setTicketCost] = useState<string | number>(request.ticketCost || '');
  const [vendorName, setVendorName] = useState(request.vendorName || '');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState(request.invoiceUrl || '');
  const [isUploading, setIsUploading] = useState(false);

  // Split Travel State
  const [isSplitTravel, setIsSplitTravel] = useState(request.travelLegs && request.travelLegs.length > 0 ? true : false);
  const [legs, setLegs] = useState<any[]>(request.travelLegs || []);

  // Advance tracking state
  const [purchasedAgainstAdvance, setPurchasedAgainstAdvance] = useState(!!request.advanceId);
  const [activeAdvances, setActiveAdvances] = useState<Advance[]>([]);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState<string>(request.advanceId || '');

  const isAnyAdvanceRequired = purchasedAgainstAdvance || (isSplitTravel && legs.some(t => t.purchasedAgainstAdvance));

  React.useEffect(() => {
    if (isAnyAdvanceRequired && activeAdvances.length === 0) {
      const fetchAdvances = async () => {
        const { data, error } = await supabase.from('advances').select('*');
        if (error) {
          console.error("Error fetching advances:", error);
        }
        if (data) {
          // Filter in memory to handle potential nulls in is_settled
          const validAdvances = data.filter(adv => adv.is_settled !== true && adv.amount_left > 0);
          setActiveAdvances(validAdvances);
        }
      }
      fetchAdvances();
    }
  }, [isAnyAdvanceRequired]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInvoiceFile(e.target.files[0]);
    }
  };

  const handleUpdate = async () => {
    try {
      let finalStatus = status;
      const isBookingStatus = status === PNCStatus.BOOKED || status === PNCStatus.CLOSED;
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
      
      let finalTicketCost = ticketCost;
      let finalVendorName = vendorName;
      let finalInvoiceUrl = invoiceUrl;
      let advanceIdToSave = request.advanceId;

      if (isBookingStatus) {
        if (isSplitTravel) {
          if (legs.length === 0) {
            toast.error("Please add at least one ticket for split travel");
            setIsUploading(false);
            return;
          }
          const hasEmptyFields = legs.some(t => !t.fromLocation || !t.toLocation || !t.travelMode || !t.ticketCost || !t.vendorName || !t.invoiceUrl);
          if (hasEmptyFields) {
            toast.error("Please fill all fields and upload invoices for all split tickets.");
            setIsUploading(false);
            return;
          }
          
          finalTicketCost = legs.reduce((acc, t) => acc + Number(t.ticketCost), 0);
          finalVendorName = 'Multiple Vendors (Split)';
          finalInvoiceUrl = legs[0].invoiceUrl; 
          
          const { data: { user } } = await supabase.auth.getUser();
          const userEmail = user?.email || 'Unknown User';
          
          for (const ticket of legs) {
            if (ticket.purchasedAgainstAdvance && ticket.advanceId && !ticket.processed_advance) {
              const selectedAdv = activeAdvances.find(a => a.id === ticket.advanceId);
              if (selectedAdv) {
                const cost = Number(ticket.ticketCost);
                
                const newChangelogEntry: AdvanceChangelogEntry = {
                  timestamp: new Date().toISOString(),
                  user: userEmail,
                  action: 'Ticket Purchased',
                  details: `Leg (${ticket.fromLocation} to ${ticket.toLocation}) for Ticket ${request.submissionId || request.id} purchased for ₹${cost}.`,
                  relatedTicketId: request.id,
                  relatedTicketSubmissionId: request.submissionId
                };

                const { data: updatedBalance, error: advError } = await supabase.rpc('update_advance_balance', {
                  p_advance_id: ticket.advanceId,
                  p_amount_delta: -cost,
                  p_changelog_entry: newChangelogEntry
                });
                
                if (advError) {
                  console.error("Failed to deduct from advance:", advError);
                  toast.error(`Failed to deduct from advance for leg ${ticket.fromLocation}-${ticket.toLocation}`);
                } else {
                  selectedAdv.amount_left = Number(updatedBalance);
                  selectedAdv.changelog = [...(selectedAdv.changelog || []), {
                    ...newChangelogEntry,
                    details: newChangelogEntry.details + ` Active balance: ₹${updatedBalance}.`
                  }];
                  ticket.processed_advance = true; // prevent double deduction if re-saved
                }
              }
            }
          }
          
          // Removed auto-close logic
        } else {
          if (!ticketCost || !vendorName || !invoiceUrl) {
            toast.error("Please provide ticket cost, vendor name, and upload the invoice before setting status to Booked or Closed.");
            setIsUploading(false);
            return;
          }
          // Removed auto-close logic

          if (purchasedAgainstAdvance && selectedAdvanceId && ticketCost && !request.advanceId) {
            advanceIdToSave = selectedAdvanceId;
            const selectedAdv = activeAdvances.find(a => a.id === selectedAdvanceId);
            if (selectedAdv) {
              const cost = parseFloat(ticketCost.toString());
              
              const { data: { user } } = await supabase.auth.getUser();
              const userEmail = user?.email || 'Unknown User';
              
              const newChangelogEntry: AdvanceChangelogEntry = {
                timestamp: new Date().toISOString(),
                user: userEmail,
                action: 'Ticket Purchased',
                details: `Ticket ${request.submissionId || request.id} purchased for ₹${cost}. Ticket booked on ${new Date().toLocaleDateString()}.`,
                relatedTicketId: request.id,
                relatedTicketSubmissionId: request.submissionId
              };

              const { data: updatedBalance, error: advError } = await supabase.rpc('update_advance_balance', {
                p_advance_id: selectedAdvanceId,
                p_amount_delta: -cost,
                p_changelog_entry: newChangelogEntry
              });

              if (advError) {
                console.error("Failed to deduct from advance:", advError);
                toast.error("Failed to deduct from advance.");
              } else {
                selectedAdv.amount_left = Number(updatedBalance);
                selectedAdv.changelog = [...(selectedAdv.changelog || []), {
                  ...newChangelogEntry,
                  details: newChangelogEntry.details + ` Active balance: ₹${updatedBalance}.`
                }];
              }
            }
          }
        }
      }

      await onUpdate({
        ...request,
        pncStatus: finalStatus,
        statusChangeReason: statusChangeReason,
        cancelledReason: (finalStatus === PNCStatus.CANCELLED_BY_EMPLOYEE || finalStatus === PNCStatus.CANCELLED_BY_PNC) ? statusChangeReason : request.cancelledReason,
        ticketCost: isBookingStatus ? parseFloat(finalTicketCost.toString()) : request.ticketCost,
        vendorName: isBookingStatus ? finalVendorName : request.vendorName,
        invoiceUrl: isBookingStatus ? finalInvoiceUrl : request.invoiceUrl,
        travelLegs: isBookingStatus && isSplitTravel ? legs : request.travelLegs,
        advanceId: advanceIdToSave
      });

      setIsUploading(false);
    } catch (error: any) {
      setIsUploading(false);
      console.error("Update failed:", error);
      toast.error("Failed to update request: " + error.message);
    }
  };

  // handleCancelRequest removed as it is now handled by CancellationModal

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 transition-all duration-300">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-all duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 max-h-[95vh] rounded-2xl flex flex-col animate-in zoom-in-95 transition-all duration-300 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">

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
                
                {request.travelLegs && request.travelLegs.length > 0 ? (
                  <div className="space-y-4">
                    {request.travelLegs.map((ticket, index) => (
                      <div key={index} className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/20">
                        <h4 className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-3 pb-2 border-b border-emerald-200/50 dark:border-emerald-800/50 flex items-center">
                          <i className="fa-solid fa-route mr-2"></i> Leg {index + 1}: {ticket.fromLocation} to {ticket.toLocation}
                        </h4>
                        <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                          <InfoRow label="Mode" value={ticket.travelMode} icon={<i className={`fa-solid ${ticket.travelMode === 'Flight' ? 'fa-plane' : ticket.travelMode === 'Train' ? 'fa-train' : 'fa-bus'}`}></i>} />
                          <InfoRow label="Vendor" value={ticket.vendorName || '—'} icon={<i className="fa-solid fa-shop"></i>} />
                          <InfoRow label="Ticket Cost" value={`₹ ${ticket.ticketCost}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} />
                          
                          <div className="col-span-1">
                            <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-1">
                              <i className="fa-solid fa-file-invoice opacity-50"></i> Ticket
                            </p>
                            {ticket.invoiceUrl ? (
                              <a href={ticket.invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                                View Leg {index + 1} <i className="fa-solid fa-external-link-alt text-xs"></i>
                              </a>
                            ) : (
                              <span className="text-sm font-bold text-slate-800 dark:text-white">Not Uploaded</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Summary row */}
                    <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                      <span className="text-sm font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">Total Trip Cost</span>
                      <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">₹ {request.travelLegs.reduce((sum, t) => sum + (Number(t.ticketCost) || 0), 0).toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
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
                )}
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

        {/* Actions Area */}
        <div className="mt-8 pt-8 border-t dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 p-8 rounded-xl border border-slate-100 dark:border-slate-800">
            {role === UserRole.PNC || role === UserRole.ADMIN ? (
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
              {(status === PNCStatus.BOOKED || status === PNCStatus.CLOSED) && (
                <div className="space-y-3 animate-in slide-in-from-top-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer mb-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900/40">
                    <input 
                      type="checkbox" 
                      checked={isSplitTravel}
                      onChange={(e) => setIsSplitTravel(e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded border-slate-300"
                    />
                    <span className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Is it a split travel / has multiple tickets to upload?</span>
                  </label>

                  {isSplitTravel ? (
                    <div className="space-y-4">
                      {legs.map((ticket, index) => (
                        <div key={ticket.id || index} className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                            <span className="text-sm font-black text-indigo-600 uppercase tracking-widest"><i className="fa-solid fa-ticket mr-2"></i> Leg {index + 1}</span>
                            <button onClick={() => setLegs(legs.filter((_, i) => i !== index))} className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1 bg-rose-50 dark:bg-rose-900/20 rounded-md">
                              <i className="fa-solid fa-trash mr-1"></i> Remove
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-bold text-slate-500 block mb-1">From</label>
                              <input type="text" placeholder="e.g. DEL" className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm focus:border-indigo-600 outline-none font-medium" value={ticket.fromLocation || ''} onChange={e => { const newT = [...legs]; newT[index].fromLocation = e.target.value; setLegs(newT); }} />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500 block mb-1">To</label>
                              <input type="text" placeholder="e.g. BOM" className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm focus:border-indigo-600 outline-none font-medium" value={ticket.toLocation || ''} onChange={e => { const newT = [...legs]; newT[index].toLocation = e.target.value; setLegs(newT); }} />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="text-xs font-bold text-slate-500 block mb-1">Mode</label>
                              <select className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm focus:border-indigo-600 outline-none font-medium" value={ticket.travelMode || ''} onChange={e => { const newT = [...legs]; newT[index].travelMode = e.target.value; setLegs(newT); }}>
                                <option value="Flight">Flight</option>
                                <option value="Train">Train</option>
                                <option value="Bus">Bus</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500 block mb-1">Cost (₹)</label>
                              <input type="number" placeholder="0" className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm focus:border-indigo-600 outline-none font-medium" value={ticket.ticketCost || ''} onChange={e => { const newT = [...legs]; newT[index].ticketCost = e.target.value; setLegs(newT); }} />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500 block mb-1">Vendor</label>
                              <input type="text" placeholder="Indigo" className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm focus:border-indigo-600 outline-none font-medium" value={ticket.vendorName || ''} onChange={e => { const newT = [...legs]; newT[index].vendorName = e.target.value; setLegs(newT); }} />
                            </div>
                          </div>

                          <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Upload Ticket</label>
                            {ticket.invoiceUrl ? (
                              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                <i className="fa-solid fa-check-circle"></i> Ticket Uploaded
                                <button onClick={() => { const newT = [...legs]; newT[index].invoiceUrl = ''; setLegs(newT); }} className="text-xs text-rose-500 ml-auto p-1 hover:bg-rose-100 rounded"><i className="fa-solid fa-xmark text-lg"></i></button>
                              </div>
                            ) : (
                              <input type="file" accept=".pdf,.jpg,.png" className="w-full text-xs file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" onChange={async (e) => {
                                if (e.target.files && e.target.files[0]) {
                                  const file = e.target.files[0];
                                  const fileExt = file.name.split('.').pop();
                                  const fileName = `split_${request.id}_${Date.now()}.${fileExt}`;
                                  
                                  const toastId = toast.loading("Uploading ticket...");
                                  const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, file);
                                  if (!uploadError) {
                                    const { data } = supabase.storage.from('invoices').getPublicUrl(fileName);
                                    const newT = [...legs];
                                    newT[index].invoiceUrl = data.publicUrl;
                                    setLegs(newT);
                                    toast.success("Ticket uploaded successfully!", { id: toastId });
                                  } else { 
                                    toast.error("Upload failed", { id: toastId }); 
                                  }
                                }
                              }} />
                            )}
                          </div>

                          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <label className="flex items-center gap-2 cursor-pointer mb-3">
                              <input type="checkbox" checked={ticket.purchasedAgainstAdvance || false} onChange={e => { const newT = [...legs]; newT[index].purchasedAgainstAdvance = e.target.checked; setLegs(newT); }} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600" />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Purchased against advance</span>
                            </label>
                            {ticket.purchasedAgainstAdvance && (
                              <select className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none cursor-pointer" value={ticket.advanceId || ''} onChange={e => { const newT = [...legs]; newT[index].advanceId = e.target.value; setLegs(newT); }}>
                                <option value="">-- Select an Active Advance --</option>
                                {activeAdvances.map(adv => (
                                  <option key={adv.id} value={adv.id}>{adv.advance_code || adv.id.substring(0,8)} - Balance ₹{adv.amount_left.toLocaleString()}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      <button onClick={() => setLegs([...legs, { id: Date.now().toString(), travelMode: 'Flight', purchasedAgainstAdvance: false }])} className="w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm">
                        <i className="fa-solid fa-plus-circle text-lg"></i> Add Next Ticket
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
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
                        {invoiceUrl ? (
                          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            <i className="fa-solid fa-check-circle"></i> Ticket Uploaded
                            <button onClick={() => setInvoiceUrl('')} className="text-xs text-rose-500 ml-auto p-1 hover:bg-rose-100 rounded"><i className="fa-solid fa-xmark text-lg"></i></button>
                          </div>
                        ) : (
                          <input
                            type="file"
                            accept=".pdf,.jpg,.png,.jpeg"
                            onChange={async (e) => {
                              if (e.target.files && e.target.files[0]) {
                                const file = e.target.files[0];
                                const fileExt = file.name.split('.').pop();
                                const fileName = `${request.id}_invoice_${Date.now()}.${fileExt}`;
                                const toastId = toast.loading("Uploading ticket...");
                                const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, file);
                                if (!uploadError) {
                                  const { data } = supabase.storage.from('invoices').getPublicUrl(fileName);
                                  setInvoiceUrl(data.publicUrl);
                                  toast.success("Ticket uploaded successfully!", { id: toastId });
                                } else { 
                                  toast.error("Upload failed", { id: toastId }); 
                                }
                              }
                            }}
                            className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                        )}
                      </div>

                      <div className="pt-2 border-t dark:border-slate-800">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input 
                            type="checkbox" 
                            checked={purchasedAgainstAdvance}
                            onChange={(e) => setPurchasedAgainstAdvance(e.target.checked)}
                            disabled={!!request.advanceId}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Purchased against advance</span>
                        </label>

                        {purchasedAgainstAdvance && (
                          <div className="animate-in slide-in-from-top-2">
                            <select
                              className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all cursor-pointer disabled:opacity-50"
                              value={selectedAdvanceId}
                              onChange={(e) => setSelectedAdvanceId(e.target.value)}
                              disabled={!!request.advanceId}
                            >
                              <option value="">-- Select an Active Advance --</option>
                              {activeAdvances.map(adv => (
                                <option key={adv.id} value={adv.id}>
                                  {adv.advance_code || adv.id.substring(0,8)} - Balance ₹{adv.amount_left.toLocaleString()} / (Total ₹{adv.amount_received.toLocaleString()})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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

              {(request.pncStatus === PNCStatus.CANCELLATION_REQUESTED || 
                request.pncStatus === PNCStatus.BOOKED || 
                request.pncStatus === PNCStatus.CLOSED) && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  {!showCancellationForm ? (
                    <button
                      type="button"
                      onClick={() => setShowCancellationForm(true)}
                      className="w-full bg-rose-600 text-white h-11 rounded-lg font-bold uppercase tracking-wide text-xs shadow-lg shadow-rose-600/20 hover:bg-rose-700 active:scale-95 transition-all"
                    >
                      <i className="fa-solid fa-ban mr-2"></i> Process Cancellation
                    </button>
                  ) : (
                    <CancellationModal
                      request={request}
                      legs={request.travelLegs || []}
                      role={role}
                      onClose={() => setShowCancellationForm(false)}
                      onSuccess={() => {
                        setShowCancellationForm(false);
                        onClose();
                        window.location.reload();
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ) : role === UserRole.EMPLOYEE &&
            request.pncStatus !== PNCStatus.CANCELLED_BY_EMPLOYEE &&
            request.pncStatus !== PNCStatus.CANCELLED_BY_PNC &&
            request.pncStatus !== PNCStatus.CANCELLATION_REQUESTED &&
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
                <div className="p-4 bg-rose-50 dark:bg-rose-955/20 border border-rose-250 dark:border-rose-900/30 rounded-xl space-y-4">
                  <p className="text-sm font-bold text-rose-800 dark:text-rose-400">
                    Are you sure you want to cancel this ticket?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancellationForm(false)}
                      className="flex-1 h-9 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all"
                    >
                      No, Keep It
                    </button>
                    <button
                      type="button"
                      onClick={handleEmployeeRequestCancel}
                      disabled={isUploading}
                      className="flex-1 h-9 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200 dark:shadow-none transition-all disabled:opacity-50"
                    >
                      {isUploading ? 'Submitting...' : 'Yes, Cancel Request'}
                    </button>
                  </div>
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
  </div>
);
};

export default RequestDetailOverlay;
