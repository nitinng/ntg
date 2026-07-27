import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MermaidDiagram } from './MermaidDiagram';
import { PNCStatus, Priority, ApprovalStatus, VerificationStatus, TravelModePolicy, TravelMode } from '../types';

interface EmployeeGuideViewProps {
  onTabChange?: (tab: string) => void;
  policies?: TravelModePolicy[];
}

interface Section {
  id: string;
  label: string;
  icon: string;
  sub: string;
}

const sections: Section[] = [
  { id: 'profile', label: 'Profile & Verification', icon: 'fa-id-card', sub: "Upload ID documents and understand the verification grace period." },
  { id: 'dashboard', label: 'Your Dashboard', icon: 'fa-gauge-high', sub: "Navigating your home screen widgets, metrics, and active trips." },
  { id: 'submit', label: 'Submit a Request', icon: 'fa-ticket', sub: "Step-by-step walk-through of the travel booking form." },
  { id: 'lifecycle', label: 'Request Lifecycle', icon: 'fa-diagram-project', sub: "Understanding the 12 request states and booking flows." },
  { id: 'detail', label: 'Request Detail View', icon: 'fa-layer-group', sub: "Reading your single source of truth for travel details and timeline." },
  { id: 'onhold', label: 'On Hold Responses', icon: 'fa-circle-question', sub: "How to respond to PNC information requests directly." },
  { id: 'rejections', label: 'Edit & Resubmit', icon: 'fa-pen-to-square', sub: "Correcting rejected requests and handling resubmission caps." },
  { id: 'cancel', label: 'Cancellations', icon: 'fa-circle-xmark', sub: "Cancelling tickets and reconciliation of employee vs org costs." },
  { id: 'approvals', label: 'Approving as Manager', icon: 'fa-user-check', sub: "How to approve or reject notice policy violations for colleagues." },
  { id: 'chat', label: 'PNC Support Chat', icon: 'fa-comments', sub: "Starting direct support threads for questions and requests." },
  { id: 'faq', label: 'FAQ', icon: 'fa-circle-info', sub: "Frequently asked questions about tickets, rejections, and balances." },
];

export const EmployeeGuideView: React.FC<EmployeeGuideViewProps> = ({ onTabChange, policies = [] }) => {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const flightDays = policies.find(p => p.travelMode === TravelMode.FLIGHT)?.minAdvanceDays ?? 7;
  const trainDays = policies.find(p => p.travelMode === TravelMode.TRAIN)?.minAdvanceDays ?? 3;
  const busDays = policies.find(p => p.travelMode === TravelMode.BUS)?.minAdvanceDays ?? 1;

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (selectedSectionId) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => document.body.classList.remove('overflow-hidden');
  }, [selectedSectionId]);

  const selectedSection = sections.find(s => s.id === selectedSectionId);

  const renderSectionContent = (id: string) => {
    switch (id) {
      case 'profile':
        return (
          <div className="space-y-6">
            <p className="text-slate-650 dark:text-slate-350 leading-relaxed text-sm">
              Before you can book anything, the Travel Desk needs to know who you are, who approves your travel, and who to call if something goes wrong on the road. It takes about five minutes. Do it now and you'll never think about it again.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">What you'll need to fill in</h3>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm">
              You'll see a completeness bar at the top of the page. It fills up as you go, and you're aiming for 100%. Your email is already there and can't be changed — it's tied to your login.
            </p>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-3xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                      <th className="py-2.5 px-4 w-12 text-center">#</th>
                      <th className="py-2.5 px-4 w-44">What to enter</th>
                      <th className="py-2.5 px-4">Why it matters</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {[
                      { f: 'Full name', m: "Must match your ID exactly, or your ticket won't be valid at check-in" },
                      { f: 'Department', m: 'Pick from the dropdown' },
                      { f: 'Campus', m: "Where you're normally based" },
                      { f: 'Manager\'s name', m: 'Fills in automatically on every request you make' },
                      { f: 'Manager\'s email', m: "Double-check this one. It's where approval requests go — a typo here means your travel silently sits unapproved" },
                      { f: 'Phone number', m: '10 digits. PNC will call this if there\'s a problem with your booking' },
                      { f: 'Emergency contact name', m: '—' },
                      { f: 'Emergency contact phone', m: '10 digits' },
                      { f: 'Blood group', m: 'Choose from the dropdown' },
                      { f: 'Passport-size photo', m: 'A clear, recent one. Keep it under 5 MB' },
                      { f: 'Government ID', m: 'Aadhaar, Passport, PAN, Voter ID or Driving Licence. Under 5 MB' },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                        <td className="py-2.5 px-4 text-center">
                          <span className="font-mono text-3xs font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-850 dark:text-slate-205">{row.f}</td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs">{row.m}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 p-4 rounded-r-xl text-indigo-900 dark:text-indigo-200 space-y-1">
              <span className="block text-3xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Tip</span>
              <p className="text-xs leading-relaxed font-medium">
                Keep your documents handy before you sit down to do this. Hunting for documents mid-form is what turns a five-minute job into an abandoned one.
              </p>
            </div>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">What happens to your documents</h3>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm">
              Once you upload your photo and ID, the PNC team reviews them. You'll see the status change on your Profile page as it moves along:
            </p>

            <ul className="space-y-2 text-xs sm:text-sm">
              <li className="flex items-start gap-2.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs uppercase font-bold border bg-slate-105 text-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 shrink-0">Incomplete</span>
                <span className="text-slate-600 dark:text-slate-400">nothing uploaded yet</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs uppercase font-bold border bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-500 dark:border-amber-800/50 shrink-0"><i className="fa-solid fa-clock mr-1 text-[10px]"></i>Pending Verification</span>
                <span className="text-slate-600 dark:text-slate-400 font-medium">uploaded, waiting on PNC</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs uppercase font-bold border bg-emerald-100 text-emerald-705 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-450 dark:border-emerald-800/50 shrink-0"><i className="fa-solid fa-circle-check mr-1 text-[10px]"></i>Approved</span>
                <span className="text-slate-600 dark:text-slate-400 font-medium">you're all set</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs uppercase font-bold border bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-450 dark:border-rose-800/50 shrink-0"><i className="fa-solid fa-circle-xmark mr-1 text-[10px]"></i>Rejected</span>
                <span className="text-slate-600 dark:text-slate-400 font-medium">something was wrong with the file</span>
              </li>
            </ul>

            <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm leading-relaxed mt-1">
              If a document is rejected, just upload a clearer or corrected version. It goes back into the review queue automatically.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">You can start booking before approval comes through</h3>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed">
              You don't have to wait around for PNC to get to your documents. The moment you upload them — or click <strong className="text-slate-850 dark:text-white font-bold">Skip for Now</strong> on the dashboard prompt — you get a 7-day window to use the Travel Desk normally.
            </p>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm">
              You'll see a countdown on your Profile page:
            </p>
            <div className="bg-slate-50 dark:bg-slate-800/50 border-l-4 border-indigo-500 p-4 rounded-r-xl">
              <p className="text-xs sm:text-sm font-medium italic text-slate-700 dark:text-slate-300">
                "You have 5 days remaining to use the travel desk while your documents are reviewed."
              </p>
            </div>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed">
              When you're down to <strong className="text-slate-850 dark:text-white font-bold">2 days or fewer</strong>, the message turns amber. That's your cue to nudge PNC.
            </p>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed">
              If the window runs out before your documents are approved, you won't be able to submit new requests. Anything already in progress carries on as normal — you just can't start something new until someone approves you.
            </p>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed">
              If a document gets rejected, the grace period ends immediately. There's no second window. Re-upload and you'll need to wait for approval this time.
            </p>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed">
              Once you're approved, the countdown disappears for good and you never see it again.
            </p>

            <div className="bg-rose-50/50 dark:bg-rose-950/20 border-l-4 border-rose-500 p-4 rounded-r-xl text-rose-900 dark:text-rose-350 space-y-1">
              <span className="block text-3xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-455">Don't leave this until you need it</span>
              <p className="text-xs leading-relaxed font-medium">
                The grace period exists so you're not blocked in an emergency — but if you burn it on day one of a quiet month and then need to fly urgently three weeks later, you'll be locked out at exactly the wrong moment.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              <i className="fa-solid fa-circle-chevron-right text-indigo-500"></i>
              <span>
                Click <strong className="text-slate-800 dark:text-white font-bold">Profile</strong> in the sidebar to get started — or{' '}
                <button
                  onClick={() => {
                    setSelectedSectionId(null);
                    if (onTabChange) onTabChange('profile');
                  }}
                  className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold hover:underline inline-flex items-center gap-0.5"
                >
                  click here <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                </button>
              </span>
            </div>
          </div>
        );

      case 'dashboard':
        return (
          <div className="space-y-6">
            <p className="text-slate-650 dark:text-slate-350 leading-relaxed text-sm">
              This is the screen you'll land on every time you log in. It answers one question at a glance: <strong className="text-slate-800 dark:text-white font-bold">what's happening with my travel right now?</strong>
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">The three numbers at the top</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-4 rounded-xl shadow-2xs">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-3xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Active Requests</span>
                  <i className="fa-solid fa-plane-up text-indigo-500 text-xs"></i>
                </div>
                <p className="text-xs sm:text-sm text-slate-655 dark:text-slate-350 leading-relaxed">
                  Trips still in motion. Anything you've submitted that hasn't finished its journey through the system yet: waiting on your manager, sitting with PNC, booked and coming up. If this number is above zero, something is in progress.
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-4 rounded-xl shadow-2xs">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-3xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Past Trips</span>
                  <i className="fa-solid fa-clock-rotate-left text-indigo-500 text-xs"></i>
                </div>
                <p className="text-xs sm:text-sm text-slate-655 dark:text-slate-350 leading-relaxed">
                  Everything that's done. Trips you've taken, requests that were rejected, and bookings you cancelled. Nothing here needs your attention; it's your history.
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-4 rounded-xl shadow-2xs">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-3xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Profile Status</span>
                  <i className="fa-solid fa-circle-user text-indigo-500 text-xs"></i>
                </div>
                <p className="text-xs sm:text-sm text-slate-655 dark:text-slate-350 leading-relaxed">
                  Your completeness score, 0 to 100%. If it's under 100%, an Action Required banner appears just below with a Complete Profile button. Click it and you'll go straight to the missing fields.
                </p>
              </div>
            </div>

            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed">
              Below the numbers, your requests appear as cards — one per trip, each showing its current status. Click any card to open the full details.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">The sidebar</h3>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-3xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                      <th className="py-2.5 px-4 w-44">Sidebar tab</th>
                      <th className="py-2.5 px-4 w-32 text-center">Always there?</th>
                      <th className="py-2.5 px-4">What it's for</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {[
                      { name: 'Dashboard', icon: 'fa-gauge-high', always: 'Yes', isAlways: true, desc: 'This screen — your active and past trips' },
                      { name: 'Profile', icon: 'fa-id-card', always: 'Yes', isAlways: true, desc: 'Your details and ID documents' },
                      { name: 'Cancellations', icon: 'fa-money-bill-transfer', always: 'Yes', isAlways: true, desc: 'Refunds owed to you, and anything you owe back' },
                      { name: 'Chat Support', icon: 'fa-comments', always: 'Yes', isAlways: true, desc: 'Message the PNC team directly. A small dot appears when they\'ve replied to you' },
                      { name: 'Approvals', icon: 'fa-user-check', always: 'Sometimes', isAlways: false, desc: 'Appears only when a colleague is waiting on you to approve their travel. Shows a number badge with how many' },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                        <td className="py-2.5 px-4 font-semibold text-slate-850 dark:text-slate-205 flex items-center gap-2">
                          <i className={`fa-solid ${row.icon} text-indigo-500 w-4 text-center`}></i>
                          {row.name}
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-2xs uppercase">
                          <span className={`inline-flex px-1.5 py-0.5 rounded ${row.isAlways ? 'bg-emerald-50 text-emerald-650 dark:bg-emerald-950/20 dark:text-emerald-400' : 'bg-amber-50 text-amber-650 dark:bg-amber-950/20 dark:text-amber-400'}`}>
                            {row.always}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs">{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed">
              If you've never seen the <strong className="text-slate-800 dark:text-white font-bold">Approvals</strong> link, that's normal — it only shows up when someone has named you as their approving manager and their request needs a decision. It disappears again once you've cleared them all.
            </p>

            <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 rounded-r-xl text-amber-900 dark:text-amber-305 space-y-1">
              <span className="block text-3xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Note</span>
              <p className="text-xs leading-relaxed font-medium">
                You'll also see a standing "Chat Feature is in Beta" banner. It's there as a reminder that support chat can occasionally be slow or glitchy — don't rely on it for anything urgent.
              </p>
            </div>
          </div>
        );

      case 'submit':
        return (
          <div className="space-y-6">
            <p className="text-slate-655 dark:text-slate-350 leading-relaxed text-sm">
              Click <strong className="text-slate-800 dark:text-white font-bold">New Booking</strong> on your dashboard. The form comes in three parts, and the progress bar at the top shows where you are. You can go Back at any point without losing what you've entered.
            </p>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm">
              Most of Step 1 fills itself in from your profile, so if you've already set that up, this is quicker than it looks.
            </p>

            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 p-4 rounded-r-xl text-indigo-900 dark:text-indigo-305 space-y-1">
              <span className="block text-3xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Important</span>
              <p className="text-xs leading-relaxed font-medium">
                Read the travel policy before you start. It sets out which mode of travel applies to which kind of trip, how far ahead you need to book, and what your organisation will cover. Five minutes with it now saves a rejected request later.
              </p>
            </div>

            {/* STEP 1 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 px-4 py-3 font-bold text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">
                Step 1 of 3 — Who's travelling and why
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-150 dark:border-slate-800 text-3xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                      <th className="py-2.5 px-4 w-44">Field</th>
                      <th className="py-2.5 px-4 w-28 text-center">Required?</th>
                      <th className="py-2.5 px-4">What to enter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {[
                      { f: 'Full name', req: true, n: 'Pre-filled. Edit it only if it doesn\'t match your ID' },
                      { f: 'Email address', req: true, n: 'Locked to your account — you can\'t change it here' },
                      { f: 'Phone number', req: true, n: '10 digits' },
                      { f: 'Department', req: false, n: 'Pre-filled if it\'s on your profile' },
                      { f: 'Purpose of travel', req: true, n: 'Be specific. "Site visit to Pune" tells PNC something; "work" doesn\'t' },
                      { f: 'Approving manager name', req: true, n: 'Pre-filled if it\'s on your profile' },
                      { f: 'Approving manager email', req: true, n: 'Where the approval request goes if your trip needs one. Check it\'s right' },
                      { f: 'Mode of travel', req: true, n: 'Flight, Train or Bus' },
                      { f: 'Trip type', req: true, n: 'One-way or Round-trip' },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                        <td className="py-2.5 px-4 font-semibold text-slate-850 dark:text-slate-205">{row.f}</td>
                        <td className="py-2.5 px-4 text-center">
                          {row.req ? (
                            <span className="text-3xs text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 border border-emerald-100 dark:border-emerald-800/30 rounded">Required</span>
                          ) : (
                            <span className="text-3xs text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Optional</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs">{row.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed mt-1">
              The mode you pick is a preference, not a decision. PNC has the final call on how you travel, and they'll allocate based on the travel policy — distance, duration, cost and what's approved for your grade. If you ask for a flight on a route the policy covers by train, expect to be booked on the train. Choosing in line with the policy from the start is the fastest way to get booked.
            </p>

            {/* STEP 2 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 sm:p-5 space-y-4">
              <div className="font-bold text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2">
                Step 2 of 3 — Where you're going and when
              </div>
              <div className="space-y-3">
                <h4 className="text-xs sm:text-sm font-bold text-slate-850 dark:text-slate-200 flex items-center gap-2">
                  <i className="fa-solid fa-arrow-right-long text-indigo-500"></i> Your outbound journey
                </h4>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-400 text-2xs sm:text-xs">
                  <li><strong>From / To</strong> — type the city, airport or station</li>
                  <li><strong>Departure date</strong> — the earliest you can pick is tomorrow</li>
                  <li><strong>Preferred time</strong> — Morning (6AM–12PM), Afternoon (12PM–6PM), Evening (6PM–12AM), or Anytime</li>
                </ul>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-150 dark:border-slate-800 text-slate-650 dark:text-slate-400 text-xs leading-relaxed font-medium">
                Not sure of your timings yet? Choose <strong className="text-slate-800 dark:text-white font-bold">Anytime</strong>. It gives PNC the widest search and usually gets you a better fare.
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-850 dark:text-slate-200 flex items-center gap-2">
                  <i className="fa-solid fa-arrow-left-long text-indigo-500"></i> Your return journey <span className="bg-slate-100 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 text-3xs px-2 py-0.5 rounded font-medium">round-trip only</span>
                </h4>
                <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed pl-5">
                  Your outbound cities are swapped in automatically, so you'll usually only need to set the return date — which has to be on or after your departure date. Same four time options.
                </p>
              </div>
            </div>

            {/* SHORT NOTICE INFO */}
            <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 rounded-r-xl text-amber-900 dark:text-amber-350 space-y-2">
              <span className="block text-3xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">If you're booking at short notice</span>
              <p className="text-xs leading-relaxed font-medium">
                Every travel mode has a minimum notice period set in the travel policy — flights require {flightDays} days, trains require {trainDays} days, and buses require {busDays} days. The moment you've chosen a mode and a departure date, the form checks whether you're inside that window.
              </p>
              <p className="text-xs leading-relaxed font-medium">
                If you are, a <strong className="text-rose-650 dark:text-rose-455 font-bold">Policy Violation Detected</strong> card appears and you'll need to type a reason before you can continue. Something like <em>"Client scheduled urgent meeting"</em> — a real explanation, because your manager reads it word for word and has to approve the trip before PNC can book anything. A vague reason is a slow reason.
              </p>
            </div>

            {/* STEP 3 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 px-4 py-3 font-bold text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">
                Step 3 of 3 — Emergency details
              </div>
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 dark:border-slate-850">
                <p className="text-slate-650 dark:text-slate-350 leading-relaxed text-xs sm:text-sm">
                  This is the part that matters if something goes wrong while you're away. Take the extra thirty seconds.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-150 dark:border-slate-800 text-3xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                      <th className="py-2.5 px-4 w-44">Field</th>
                      <th className="py-2.5 px-4 w-28 text-center">Required?</th>
                      <th className="py-2.5 px-4">What to enter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {[
                      { f: 'Blood group', req: false, n: 'From the dropdown' },
                      { f: 'Emergency contact name', req: true, n: 'Someone reachable while you\'re travelling' },
                      { f: 'Relationship', req: true, n: 'How they\'re related to you' },
                      { f: 'Emergency contact phone', req: true, n: '10 digits' },
                      { f: 'Medical conditions / special requirements', req: false, n: 'Allergies, conditions PNC should know about, dietary needs, or assistance like wheelchair access' },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                        <td className="py-2.5 px-4 font-semibold text-slate-850 dark:text-slate-205">{row.f}</td>
                        <td className="py-2.5 px-4 text-center">
                          {row.req ? (
                            <span className="text-3xs text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 border border-emerald-100 dark:border-emerald-800/30 rounded">Required</span>
                          ) : (
                            <span className="text-3xs text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Optional</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs">{row.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm font-semibold flex items-center gap-2 text-indigo-650 dark:text-indigo-400 pt-1">
              <i className="fa-solid fa-circle-check text-indigo-500"></i>
              Hit Submit Request and you're done. Your request appears on your dashboard straight away.
            </p>
          </div>
        );

      case 'lifecycle': {
        const normalPathChart = `flowchart TD
    A([Step 1: Not Started]) --> B{Booked with<br>enough notice?}
    B -- Yes --> C[Processing]
    B -- No --> D[Approval Pending]
    D --> E[Approved]
    E --> C
    C --> F([Final: Booked])

    style A fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px,color:#475569
    style B fill:#fdf4ff,stroke:#d946ef,stroke-width:1px,color:#701a75
    style C fill:#eef2ff,stroke:#6366f1,stroke-width:1px,color:#312e81
    style D fill:#fffbeb,stroke:#f59e0b,stroke-width:1px,color:#78350f
    style E fill:#ecfdf5,stroke:#10b981,stroke-width:1px,color:#064e3b
    style F fill:#eff6ff,stroke:#3b82f6,stroke-width:1px,color:#1e3a8a
    
    linkStyle default stroke:#94a3b8,stroke-width:1px
`;

        const sidewaysPathChart = `flowchart LR
    A[Rejected] --> B[Edit and Resubmit]
    B --> C[Not Started]
    C --> D(Checked again<br>from scratch)

    style A fill:#fef2f2,stroke:#f87171,stroke-width:1px,color:#991b1b
    style B fill:#eef2ff,stroke:#6366f1,stroke-width:1px,color:#312e81
    style C fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px,color:#475569
    style D fill:#ecfdf5,stroke:#10b981,stroke-width:1px,color:#064e3b
    
    linkStyle default stroke:#94a3b8,stroke-width:1px
`;

        return (
          <div className="space-y-6">
            <p className="text-slate-650 dark:text-slate-350 leading-relaxed text-sm">
              Once you hit Submit, your request starts moving through a set of stages. Each one has a coloured label on your dashboard card, so you can always see where things stand at a glance.
            </p>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm">
              Most requests only touch four or five of these stages and need nothing from you at all. The rest exist for when something needs fixing.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">The normal path</h3>

            {/* Visual Flow diagram - Mermaid */}
            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-4 rounded-xl max-w-md mx-auto">
              <MermaidDiagram chart={normalPathChart} />
            </div>

            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm leading-relaxed">
              In plain terms: your request gets checked, goes to your manager only if it needs approval, then sits with PNC until they've bought your ticket. <strong className="text-slate-850 dark:text-white font-bold">Booked</strong> is the finish line — that's your trip confirmed.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">The three stages where you need to do something</h3>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm mt-1">
              Everything else runs on its own. These are the only ones that stop and wait for you.
            </p>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-3xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                      <th className="py-2.5 px-4 w-48">What's happened</th>
                      <th className="py-2.5 px-4">What to do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 text-amber-705 border border-amber-100 dark:bg-amber-900/20 dark:text-amber-555 dark:border-amber-800/50 text-2xs font-bold rounded-lg uppercase">
                          <i className="fa-solid fa-circle text-[8px] text-amber-500"></i> On Hold
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
                        PNC has a question — a sold-out flight, a spelling on your ID. <strong className="text-slate-800 dark:text-white font-bold">Open the request and reply in the box.</strong> It goes back to Processing the moment you send it.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-900/20 dark:text-rose-455 dark:border-rose-800/50 text-2xs font-bold rounded-lg uppercase">
                          <i className="fa-solid fa-circle text-[8px] text-rose-500"></i> Rejected by Manager
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
                        Your manager said no, and gave a reason. <strong className="text-slate-800 dark:text-white font-bold">Read the reason, then Edit &amp; Resubmit</strong> — or cancel if plans changed.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-900/20 dark:text-rose-455 dark:border-rose-800/50 text-2xs font-bold rounded-lg uppercase">
                          <i className="fa-solid fa-circle text-[8px] text-rose-500"></i> Rejected by PNC
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
                        PNC couldn't make it work — budget, availability, wrong mode. <strong className="text-slate-800 dark:text-white font-bold">Same: fix what they flagged and resubmit.</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-slate-550 dark:text-slate-450 text-2xs italic">
              If your request is in any other stage, you don't need to do anything.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">Every stage, explained</h3>

            <div className="space-y-4">
              {/* Category 1 */}
              <div>
                <h4 className="text-2xs font-black uppercase text-indigo-655 dark:text-indigo-400 tracking-wider mb-2">While it's being sorted</h4>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {[
                        { s: 'Not Started', b: 'bg-slate-105 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', desc: 'Just submitted. Being checked against the notice policy — takes seconds' },
                        { s: 'Approval Pending', b: 'bg-amber-50 text-amber-705 border-amber-100 dark:bg-amber-900/20 dark:text-amber-500 dark:border-amber-800/50', desc: 'Your trip is short-notice, so your manager has to sign off. Chase them if it\'s been a few days' },
                        { s: 'Approved', b: 'bg-emerald-50 text-emerald-705 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-500 dark:border-emerald-800/50', desc: 'Your manager said yes. Moves straight on by itself' },
                        { s: 'Processing', b: 'bg-indigo-50 text-indigo-700 border-indigo-150 dark:bg-indigo-900/20 dark:text-indigo-405 dark:border-indigo-805/50', desc: 'PNC is searching fares and talking to vendors. Sit tight' },
                        { s: 'On Hold', b: 'bg-amber-50 text-amber-705 border-amber-100 dark:bg-amber-900/20 dark:text-amber-500 dark:border-amber-800/50', desc: 'PNC needs something from you before they can carry on' },
                      ].map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/10">
                          <td className="py-2.5 px-4 w-44 font-semibold">
                            <span className={`inline-flex px-2 py-0.5 border text-3xs font-bold uppercase rounded ${item.b}`}>{item.s}</span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs">{item.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Category 2 */}
              <div>
                <h4 className="text-2xs font-black uppercase text-indigo-655 dark:text-indigo-400 tracking-wider mb-2">When it's confirmed</h4>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <tbody>
                      <tr className="hover:bg-slate-50/20 dark:hover:bg-slate-800/10">
                        <td className="py-2.5 px-4 w-44 font-semibold">
                          <span className="inline-flex px-2 py-0.5 border bg-blue-55 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-405 dark:border-blue-800/50 text-3xs font-bold uppercase rounded">Booked</span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs">
                          Your ticket exists. Cost, vendor and the ticket file are on the request — download it from the card and you're good to travel
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Category 3 */}
              <div>
                <h4 className="text-2xs font-black uppercase text-indigo-655 dark:text-indigo-400 tracking-wider mb-2">When it doesn't happen</h4>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {[
                        { s: 'Rejected by Manager', b: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-455 dark:border-rose-800/50', desc: 'Declined before it reached PNC' },
                        { s: 'Rejected by PNC', b: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-455 dark:border-rose-800/50', desc: 'PNC couldn\'t fulfil it' },
                        { s: 'Cancellation Requested', b: 'bg-slate-105 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', desc: 'You\'ve asked to cancel a ticket that was already bought. PNC is processing the refund' },
                        { s: 'Cancelled by Employee', b: 'bg-slate-105 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', desc: 'Cancelled at your request. You may owe a share of the cost — see Chapter 8' },
                        { s: 'Cancelled by PNC', b: 'bg-slate-105 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', desc: 'Cancelled for reasons outside your control, like an airline pulling the flight. You owe nothing. Submit a fresh request if you still need to travel' },
                      ].map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/10">
                          <td className="py-2.5 px-4 w-44 font-semibold">
                            <span className={`inline-flex px-2 py-0.5 border text-3xs font-bold uppercase rounded ${item.b}`}>{item.s}</span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-xs">{item.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">If things go sideways</h3>

            {/* Visual Sideway process */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-5 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center text-center">
                <span className="px-2 py-1 bg-rose-50 text-rose-705 border border-rose-100 dark:bg-rose-900/20 dark:text-rose-500 dark:border-rose-800/50 text-2xs font-bold rounded uppercase">Rejected</span>
                <div className="text-slate-400"><i className="fa-solid fa-arrow-right rotate-90 sm:rotate-0"></i></div>
                <span className="px-2 py-1 bg-indigo-50 text-indigo-750 border border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-405 dark:border-indigo-805/50 text-2xs font-bold rounded uppercase">Edit and Resubmit</span>
                <div className="text-slate-400"><i className="fa-solid fa-arrow-right rotate-90 sm:rotate-0"></i></div>
                <span className="px-2 py-1 bg-slate-105 text-slate-605 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 text-2xs font-bold rounded uppercase">Not Started</span>
                <div className="text-slate-400"><i className="fa-solid fa-arrow-right rotate-90 sm:rotate-0"></i></div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-455">Checked again from scratch</span>
              </div>
            </div>

            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm leading-relaxed">
              A resubmitted request always goes back to the beginning and gets re-checked. That's deliberate — if your edit fixed the dates, it skips manager approval entirely and goes straight to PNC.
            </p>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm leading-relaxed">
              You get <strong className="text-slate-850 dark:text-white font-bold">three attempts</strong>. After a third rejection the resubmit button locks and you'll need to sort it out directly with PNC or your manager.
            </p>
          </div>
        );
      }

      case 'detail':
        return (
          <div className="space-y-6">
            <p className="text-slate-655 dark:text-slate-350 leading-relaxed text-sm">
              Click any request card on your dashboard and the full details slide in from the right. This is where you go when you want to know what's actually happening — not just the status label, but who did what and when.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">What you'll find, top to bottom</h3>

            <div className="space-y-3.5">
              {[
                { title: 'At the top', desc: 'Your request ID, the current status, and a red flag if the trip was short-notice. Quote that ID if you ever message PNC about this trip; it saves them hunting.' },
                { title: 'Your details', desc: 'Name, email, phone, department and campus, as they were when you submitted.' },
                { title: 'The trip itself', desc: 'Where you\'re going, when, by what mode, your preferred time window, return legs if it\'s a round trip, your stated purpose, and anything you flagged as a special requirement. There\'s also a compliance line here: green if you booked with enough notice, red with the reason if you didn\'t.' },
                { title: 'Your ticket', desc: 'Appears once the trip is Booked. Ticket cost, vendor name, and a View Ticket link to download your invoice or itinerary. This is where you get your ticket from.' },
                { title: 'Who\'s approving', desc: 'Your manager\'s name and email, as recorded on the request.' },
                { title: 'Emergency and health', desc: 'Your emergency contact, their phone number, your blood group, and any medical conditions you noted. Worth a glance before you travel to check it\'s all still accurate.' },
                { title: 'The timeline', desc: 'A running log of everything that\'s happened to this request.' },
              ].map((item, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800/80 p-4 rounded-xl shadow-2xs space-y-1">
                  <span className="text-3xs uppercase font-black tracking-wider text-indigo-500 dark:text-indigo-400">{item.title}</span>
                  <p className="text-slate-655 dark:text-slate-350 text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 p-4 rounded-r-xl text-indigo-900 dark:text-indigo-305 space-y-1">
              <span className="block text-3xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">The timeline is the bit people miss</span>
              <p className="text-xs leading-relaxed font-medium">
                Before you message anyone asking what's going on, scroll down and read this. It usually already answers the question.
              </p>
            </div>

            {/* Visual Timeline component */}
            <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Example Timeline</h4>
              
              <div className="relative pl-6 border-l-2 border-slate-150 dark:border-slate-800 ml-2 space-y-6 py-1">
                {[
                  { t: 'Request submitted', u: 'You', n: 'policy check queued' },
                  { t: 'Short-notice flag raised — sent for approval', u: 'System', n: 'flight is 4 days out, policy requires 14' },
                  { t: 'Approved by manager', u: 'Priya', n: '"Client meeting is fixed, approved."' },
                  { t: 'Picked up by PNC', u: 'PNC', n: 'searching fares' },
                  { t: 'Ticket booked', u: 'PNC', n: 'vendor and cost recorded' },
                ].map((node, i) => (
                  <div key={i} className="relative space-y-0.5">
                    <span className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-900"></span>
                    <div className="text-xs font-bold text-slate-850 dark:text-slate-200">{node.t}</div>
                    <div className="text-2xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-655 dark:text-slate-350">{node.u}</span> · {node.n}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed">
              Every entry shows who did it, when, and any note they left. So if your trip sat unmoving for four days, the timeline tells you whether it was waiting on your manager or sitting in PNC's queue — and you'll know who to nudge.
            </p>
          </div>
        );

      case 'onhold':
        return (
          <div className="space-y-6">
            <p className="text-slate-655 dark:text-slate-350 leading-relaxed text-sm">
              Sometimes PNC hits a snag they can't resolve without you. The morning flight is sold out. Your name on the booking doesn't match your Aadhaar. Rather than guess, they put your request <strong className="text-slate-800 dark:text-white font-bold">On Hold</strong> and ask.
            </p>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm">
              You'll know because your request card shows a warning strip: <strong className="text-amber-605 dark:text-amber-500 font-bold">Action Required: Information Requested</strong>.
            </p>

            <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
              <h4 className="text-xs sm:text-sm font-bold text-slate-805 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2 uppercase tracking-wider">
                Answering
              </h4>
              <ol className="list-decimal pl-5 space-y-2 text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                <li>Click the card to open the details.</li>
                <li>Read their question under <strong className="dark:text-white font-bold">PNC Clarification Needed</strong>.</li>
                <li>Type your answer in the <strong className="dark:text-white font-bold">Your Response</strong> box.</li>
                <li>Click <strong className="text-indigo-650 dark:text-indigo-400 font-bold">Submit Response &amp; Resume Processing</strong>.</li>
              </ol>
            </div>

            <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm leading-relaxed pl-1">
              That's it. Your request goes straight back to <span className="px-2 py-0.5 bg-indigo-50 text-indigo-750 border border-indigo-150 dark:bg-indigo-900/20 dark:text-indigo-405 dark:border-indigo-805/50 text-3xs font-bold rounded uppercase">Processing</span> and PNC picks it up again — no email, no chasing, no separate thread.
            </p>

            <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 rounded-r-xl text-amber-900 dark:text-amber-350 space-y-2">
              <span className="block text-3xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Time is money</span>
              <p className="text-xs leading-relaxed font-medium">
                Reply the same day if you can. Nothing moves on a held request until you answer, and fares change fast — the seat PNC quoted you on Monday may be gone by Wednesday. A quick reply beats a polished one tomorrow.
              </p>
            </div>
          </div>
        );

      case 'rejections': {
        const checkPathChart = `flowchart TD
    A[You resubmit] --> B[Checked again from scratch]
    B --> C{Still short notice?}
    C -- Yes --> D[Back to your manager]
    C -- No --> E[Straight to PNC]

    style A fill:#eef2ff,stroke:#6366f1,stroke-width:1px,color:#312e81
    style B fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px,color:#475569
    style C fill:#fdf4ff,stroke:#d946ef,stroke-width:1px,color:#701a75
    style D fill:#fffbeb,stroke:#f59e0b,stroke-width:1px,color:#78350f
    style E fill:#ecfdf5,stroke:#10b981,stroke-width:1px,color:#064e3b
    
    linkStyle default stroke:#94a3b8,stroke-width:1px
`;

        return (
          <div className="space-y-6">
            <p className="text-slate-655 dark:text-slate-350 leading-relaxed text-sm">
              A rejection isn't the end of it. Whether it came from your manager or from PNC, you can correct the problem and send the same request back through — no need to start over.
            </p>

            <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
              <h4 className="text-xs sm:text-sm font-bold text-slate-805 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2 uppercase tracking-wider">
                What to do
              </h4>
              <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                <li>Open the request. The reason is right there in the details — e.g. <em>"Wrong travel dates"</em>, <em>"Please select Train instead of Flight"</em>.</li>
                <li>Click <strong className="dark:text-white font-bold">Edit &amp; Resubmit</strong>. The form reopens with everything you entered last time already filled in.</li>
                <li>Fix what they flagged and submit.</li>
              </ul>
            </div>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">What happens next</h3>

            {/* Visual flowchart - Recheck path */}
            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-4 rounded-xl max-w-sm mx-auto">
              <MermaidDiagram chart={checkPathChart} />
            </div>

            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm leading-relaxed pl-1">
              Your request always gets re-checked from the beginning. That works in your favour: if your edit fixed the timing, it skips manager approval entirely and goes straight into PNC's queue. If it's still short-notice, it correctly goes back for approval.
            </p>

            <div className="bg-rose-50/50 dark:bg-rose-950/20 border-l-4 border-rose-500 p-4 rounded-r-xl text-rose-900 dark:text-rose-350 space-y-2">
              <span className="block text-3xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-455">Attempts are capped</span>
              <p className="text-xs leading-relaxed font-medium">
                You get three attempts. After the third rejection the resubmit button is replaced with a message telling you to contact PNC or your manager directly. At that point something needs a conversation, not another form.
              </p>
            </div>
          </div>
        );
      }

      case 'cancel': {
        const cancelCheckChart = `flowchart TD
    A[Need to cancel] --> B{Is it Booked?}
    B -- No --> C[Cancelled immediately<br>Nothing owed]
    B -- Yes --> D[Goes to PNC<br>Refund calculated]

    style A fill:#eef2ff,stroke:#6366f1,stroke-width:1px,color:#312e81
    style B fill:#fdf4ff,stroke:#d946ef,stroke-width:1px,color:#701a75
    style C fill:#ecfdf5,stroke:#10b981,stroke-width:1px,color:#064e3b
    style D fill:#fffbeb,stroke:#f59e0b,stroke-width:1px,color:#78350f
    
    linkStyle default stroke:#94a3b8,stroke-width:1px
`;

        return (
          <div className="space-y-6">
            <p className="text-slate-655 dark:text-slate-350 leading-relaxed text-sm">
              The one thing that matters here: has a ticket been bought yet? Everything else follows from that.
            </p>

            {/* Visual flowchart - Is it Booked? */}
            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-4 rounded-xl max-w-sm mx-auto">
              <MermaidDiagram chart={cancelCheckChart} />
            </div>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">If it isn't booked yet</h3>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed pl-1">
              Open the request and click <strong className="dark:text-white font-bold">Cancel Request</strong>. Type a reason — it's required, you can't confirm without one — then <strong className="dark:text-white font-bold">Confirm Cancellation</strong>.
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed pl-1">
              Done immediately. No penalty, no cost, nothing to settle. Your reason is saved on the request so there's a record of why.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">If your ticket is already booked</h3>
            <ol className="list-decimal pl-5 space-y-1.5 text-slate-655 dark:text-slate-405 text-xs sm:text-sm">
              <li>Open the request and click <strong className="dark:text-white font-bold">Cancel Request</strong>.</li>
              <li>Confirm. Your status becomes <span className="px-2 py-0.5 bg-slate-105 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-3xs font-bold rounded uppercase">Cancellation Requested</span>.</li>
              <li>PNC cancels with the airline or vendor and works out what's refundable.</li>
            </ol>
            <p className="text-slate-600 dark:text-slate-400 text-2xs italic pl-5 mt-1">
              This one takes a little time — PNC has to go through the vendor, and refund rules vary by fare.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">Will it cost you anything?</h3>
            <div className="overflow-x-auto border border-slate-205 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-3xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                    <th className="py-2.5 px-4 w-1/2">Why it was cancelled</th>
                    <th className="py-2.5 px-4">Who pays</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-2xs sm:text-xs">
                  <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                    <td className="py-2.5 px-4 text-slate-705 dark:text-slate-300 font-medium">The airline cancelled, ops changed the plan, or there was a fare error</td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">The organisation covers it in full. Nothing owed by you.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                    <td className="py-2.5 px-4 text-slate-705 dark:text-slate-300 font-medium">Your plans changed</td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">You may owe a share of the non-refundable fare or penalty, worked out under the cancellation policy.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 rounded-r-xl text-amber-900 dark:text-amber-350 space-y-2">
              <span className="block text-3xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Timing is everything</span>
              <p className="text-xs leading-relaxed font-medium">
                Cancel as early as you realistically can. Refund percentages drop sharply the closer you get to the travel date. The difference between cancelling a week out and cancelling the night before is often the entire fare.
              </p>
            </div>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">Tracking what you owe</h3>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed pl-1">
              Open <strong className="dark:text-white font-bold">Cancellations</strong> in the sidebar. It shows refunds coming back, costs the organisation absorbed, and any balance sitting against your name.
            </p>
            <p className="text-slate-655 dark:text-slate-350 text-xs sm:text-sm leading-relaxed pl-1">
              A balance from a personal cancellation stays open as <span className="px-2 py-0.5 bg-slate-105 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 text-3xs font-bold rounded uppercase">Pending Refund</span> until it's settled — usually through a salary adjustment. Nothing happens silently; you'll see it here first.
            </p>
          </div>
        );
      }

      case 'approvals':
        return (
          <div className="space-y-6">
            <p className="text-slate-655 dark:text-slate-350 leading-relaxed text-sm">
              If someone names you as their approving manager and books at short notice, their request comes to you. You'll see an <strong className="text-slate-800 dark:text-white font-bold">Approvals</strong> link appear in your sidebar with a number badge showing how many are waiting.
            </p>
            <p className="text-slate-605 dark:text-slate-400 text-xs sm:text-sm pl-1">
              The link only exists when there's something to decide. When your queue is empty, it disappears.
            </p>

            <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-sm">
              <h4 className="text-xs sm:text-sm font-bold text-slate-805 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2 uppercase tracking-wider">
                Making the call
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Open <strong className="dark:text-white">Approvals</strong> and you'll see a card for each pending request. Click one to review it. You get everything you need in a single view:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400 text-2xs sm:text-xs">
                <li><strong className="text-slate-705 dark:text-slate-305">Who's travelling</strong> — name, department, campus, email</li>
                <li><strong className="text-slate-705 dark:text-slate-305">The trip</strong> — route, date, mode, one-way or return</li>
                <li><strong className="text-slate-705 dark:text-slate-305">Why</strong> — their stated purpose</li>
                <li><strong className="text-slate-705 dark:text-slate-305">What tripped the flag</strong> — how far inside the notice period they are, and the justification they wrote</li>
              </ul>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed pt-1.5">
                Then choose <strong className="text-emerald-650 dark:text-emerald-500 font-bold">Approve Request</strong> or <strong className="text-rose-650 dark:text-rose-500 font-bold">Reject</strong>.
              </p>
            </div>

            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 p-4 rounded-r-xl text-indigo-900 dark:text-indigo-305 space-y-1">
              <span className="block text-3xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Rejections need a target action</span>
              <p className="text-xs leading-relaxed font-medium">
                If you reject, write a reason they can act on. You'll be prompted for one, and it's shown to them directly on their request. <em>"Take the train, it's a 6-hour route"</em> tells them exactly what to resubmit. <em>"Not approved"</em> just sends them to your desk to ask why.
              </p>
            </div>

            <p className="text-slate-500 dark:text-slate-400 text-2xs italic pl-1">
              When you've cleared the last one, you're taken back to your dashboard automatically.
            </p>

            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">A note on what you're actually approving</h3>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm leading-relaxed pl-1">
              You're not approving the trip itself — you're approving the short notice. The question in front of you is whether the reason justifies booking inside the policy window, given that late bookings usually cost the organisation more.
            </p>
            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm leading-relaxed pl-1">
              PNC still has the final say on mode and fare, so you don't need to second-guess whether they should be flying or taking the train. That's covered downstream.
            </p>
          </div>
        );

      case 'chat':
        return (
          <div className="space-y-6">
            <p className="text-slate-655 dark:text-slate-350 leading-relaxed text-sm">
              Chat Support puts you in touch with the PNC team without leaving the app. Find it in your sidebar — a small dot appears when they've replied.
            </p>

            <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-sm">
              <h4 className="text-xs sm:text-sm font-bold text-slate-805 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2 uppercase tracking-wider">
                Starting a conversation
              </h4>
              <ol className="list-decimal pl-5 space-y-2 text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                <li>Click <strong className="dark:text-white">Chat Support</strong>, then <strong className="dark:text-white">Start New Chat</strong>.</li>
                <li>Pick what it's about:
                  <ul className="list-disc pl-5 mt-1 space-y-1.5 text-slate-500 dark:text-slate-400 text-2xs sm:text-xs">
                    <li><strong className="text-slate-705 dark:text-slate-300">Existing Request</strong> — a question about a trip you've already submitted. Pick it from the dropdown and PNC sees the full request alongside your message — no need to explain the background.</li>
                    <li><strong className="text-slate-750 dark:text-slate-300">Future Request</strong> — a trip you're planning but haven't submitted yet.</li>
                    <li><strong className="text-slate-750 dark:text-slate-300">Others</strong> — anything else — policy questions, reimbursements, feedback.</li>
                  </ul>
                </li>
                <li>Send your message. PNC picks it up from their support dashboard.</li>
              </ol>
            </div>

            <p className="text-slate-655 dark:text-slate-355 text-xs sm:text-sm leading-relaxed pl-1">
              Replies come through in real time, and you can attach files right in the chat — a visa copy, a permission letter, a screenshot of something that looks wrong.
            </p>

            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 p-4 rounded-r-xl text-indigo-900 dark:text-indigo-305 space-y-1">
              <span className="block text-3xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Chat is in beta</span>
              <p className="text-xs leading-relaxed font-medium">
                It works, but expect the occasional delay or glitch. If something is genuinely urgent — you're at the airport, your ticket is wrong, you're travelling tomorrow — contact PNC directly rather than waiting on a chat reply.
              </p>
            </div>
          </div>
        );



      case 'faq': {
        return (
          <div className="space-y-4 max-w-3xl">
            {[
              {
                q: 'My request still says Not Started. Is it stuck?',
                a: 'No. That\'s just the policy check running, and it takes seconds. It\'ll move to Processing if you booked with enough notice, or Approval Pending if you didn\'t.',
              },
              {
                q: 'My manager hasn\'t responded and it\'s been days.',
                a: 'Nothing chases them automatically, so follow up directly. If they\'re on leave or unreachable, contact PNC — they can advise on an alternative approver.',
              },
              {
                q: 'Can I change a request after submitting it?',
                a: 'Only if it\'s been rejected — then use Edit & Resubmit, up to three times. For a request still in progress, cancel it and submit a corrected one. For a minor detail, message PNC on chat instead of starting over.',
              },
              {
                q: 'I don\'t know my travel times yet.',
                a: 'Choose Anytime in the Preferred Time dropdown. It gives PNC the widest search and usually gets you a better fare.',
              },
              {
                q: 'My temporary access window is about to expire.',
                a: 'Ask PNC or an Admin to review your documents. Once it lapses you can\'t submit anything new, but any request already in progress carries on as normal.',
              },
              {
                q: 'My document was rejected — do I get another grace period?',
                a: 'No. A rejection locks booking straight away. Upload a corrected version and it goes back into the review queue.',
              },
              {
                q: 'Will cancelling cost me anything?',
                a: 'Not if the ticket hasn\'t been bought yet — that\'s clean, with no penalty. After booking it depends on why: cancellations driven by the airline or by ops are absorbed by the organisation, while a change in your own plans may leave you owing a share of the fare. Anything owed shows in the Cancellations dashboard as Pending Refund until it\'s settled.',
              },
              {
                q: 'I\'ve used all three resubmissions.',
                a: 'The button locks after the third attempt. Speak to PNC or your manager directly — at that point the issue needs a conversation, then a fresh request.',
              },
            ].map((faq, i) => (
              <details key={i} className="group border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
                <summary className="flex items-center gap-3 p-4 font-bold text-slate-850 dark:text-white cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 select-none">
                  <i className="fa-solid fa-circle-question text-indigo-500 text-xs shrink-0"></i>
                  <span className="text-xs sm:text-sm flex-1">{faq.q}</span>
                  <i className="fa-solid fa-chevron-down text-2xs text-slate-400 group-open:rotate-180 transition-transform duration-250 shrink-0 ml-auto"></i>
                </summary>
                <div className="p-4 pt-0 pl-10 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-50 dark:border-slate-800/50 mt-1">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Boarding Pass Hero Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden relative">
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-500 dark:from-indigo-950 dark:via-indigo-900 dark:to-indigo-800 text-white p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute right-0 top-0 text-[8rem] opacity-5 pointer-events-none transform translate-x-4 -translate-y-4">
            <i className="fa-solid fa-plane"></i>
          </div>
          <p className="text-2xs font-black uppercase tracking-widest text-indigo-200 mb-2">NG Travel Desk · Guide Home</p>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight mb-2">
            Employee Travel Handbook &amp; Guide
          </h1>
          <p className="text-xs sm:text-sm text-indigo-100 max-w-2xl font-medium leading-relaxed">
            Click on any chapter card below to open the complete reference information, tables, and instructions.
          </p>
        </div>
      </div>

      {/* Guide Cards Grid */}
      <div className="space-y-4">
        <h2 className="text-base font-black uppercase text-slate-400 tracking-wider pl-1">Guide Chapters</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sections.map((sec, index) => (
            <div
              key={sec.id}
              onClick={() => setSelectedSectionId(sec.id)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-indigo-400 dark:hover:border-indigo-800 cursor-pointer shadow-2xs hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group"
            >
              <div>
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm group-hover:scale-110 transition-transform">
                    <i className={`fa-solid ${sec.icon}`}></i>
                  </div>
                  <span className="font-mono text-6xl font-black text-indigo-600/40 dark:text-indigo-500/40 leading-none select-none">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-850 dark:text-white mt-4 group-hover:text-indigo-650 dark:group-hover:text-indigo-405 transition-colors">
                  {sec.label}
                </h3>
                <p className="text-sm pr-10 text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed font-medium">
                  {sec.sub}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-3xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mt-5 opacity-0 group-hover:opacity-100 transition-opacity">
                Read Details <i className="fa-solid fa-arrow-right text-[8px] translate-y-[-0.5px]"></i>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Centered Modal Overlay */}
      {selectedSectionId && selectedSection && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={() => setSelectedSectionId(null)}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
          ></div>

          {/* Modal Container */}
          <div className="relative bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden">
            {/* Header */}
            <header className="px-6 py-4 border-b border-indigo-700/30 dark:border-slate-800 flex items-center justify-between shrink-0 bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-500 dark:from-indigo-950 dark:via-indigo-900 dark:to-indigo-850 text-white relative overflow-hidden">
              {/* Large transparent icon in background */}
              <div className="absolute right-12 top-0 text-[5rem] opacity-10 pointer-events-none transform translate-x-4 -translate-y-2 text-white">
                <i className={`fa-solid ${selectedSection.icon}`}></i>
              </div>
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center text-xs">
                  <i className={`fa-solid ${selectedSection.icon}`}></i>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">{selectedSection.label}</h3>
                  <p className="text-3xs text-indigo-200 uppercase font-black tracking-wider">Chapter {sections.findIndex(s => s.id === selectedSectionId) + 1}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSectionId(null)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-indigo-150 hover:text-white transition-colors relative z-10"
                aria-label="Close modal"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </header>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              <p className="text-slate-500 dark:text-slate-400 font-medium italic border-l-2 border-indigo-200 dark:border-indigo-800 pl-3 py-0.5">
                {selectedSection.sub}
              </p>
              {renderSectionContent(selectedSectionId)}
            </div>

            {/* Footer */}
            <footer className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/10 flex justify-end shrink-0 gap-2">
              <button
                onClick={() => setSelectedSectionId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-2xs font-black uppercase tracking-wider transition-colors active:scale-95"
              >
                Close
              </button>
            </footer>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default EmployeeGuideView;
