
import React, { useState } from 'react';
import { TripType, TravelMode, Priority, User, TravelModePolicy, PNCStatus, ApprovalStatus } from '../types';
import Input from './Input';
import Select from './Select';

interface PNCBookingModalProps {
    onClose: () => void;
    onSubmit: (data: any) => void; // Promise<void>
    currentUser: User; // The PNC user
    employees: User[]; // List of all employees to select from
    policies: TravelModePolicy[];
}

const PNCBookingModal = ({ onClose, onSubmit, currentUser, employees, policies }: PNCBookingModalProps) => {
    const [step, setStep] = useState(1);
    const totalSteps = 3;

    // Filter out only employees for the dropdown if needed, or show all
    // For simplicity, showing all users as options
    const employeeOptions = employees.map(u => ({ label: `${u.name} (${u.email})`, value: u.id }));

    const [data, setData] = useState({
        requesterId: '',
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        requesterDepartment: '',
        requesterCampus: '',

        purpose: '',
        approvingManagerName: '', // Can be optional or manually entered
        approvingManagerEmail: '',

        tripType: TripType.ONE_WAY,
        mode: TravelMode.FLIGHT,

        from: '',
        to: '',
        dateOfTravel: '',
        // preferredDepartureWindow REMOVED

        returnDate: '',
        // returnPreferredDepartureWindow REMOVED
        returnFrom: '',
        returnTo: '',

        priority: Priority.MEDIUM,

        // Booking Details (Step 3)
        ticketCost: '',
        vendorName: '',
        invoiceFile: null as File | null,

        // Hidden/Auto fields
        numberOfTravelers: 1,
        travellerNames: '', // Will default to requester name if empty
    });

    const handleInputChange = (field: string, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const handleEmployeeSelect = (userId: string) => {
        const selectedUser = employees.find(u => u.id === userId);
        if (selectedUser) {
            setData(prev => ({
                ...prev,
                requesterId: selectedUser.id,
                requesterName: selectedUser.name,
                requesterEmail: selectedUser.email,
                requesterPhone: selectedUser.phone || '',
                requesterDepartment: selectedUser.department || '',
                requesterCampus: selectedUser.campus || '',
                travellerNames: selectedUser.name,
                approvingManagerName: selectedUser.managerName || '',
                approvingManagerEmail: selectedUser.managerEmail || ''
            }));
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setData(prev => ({ ...prev, invoiceFile: e.target.files![0] }));
        }
    };

    const nextStep = () => setStep(s => Math.min(s + 1, totalSteps));
    const prevStep = () => setStep(s => Math.max(s - 1, 1));

    const progress = (step / totalSteps) * 100;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl" onClick={onClose}></div>

            <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-500 border border-slate-200 dark:border-slate-800">

                {/* Progress bar */}
                <div className="h-1 bg-slate-100 dark:bg-slate-800">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-600 to-violet-600 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 md:p-10 custom-scrollbar">

                    {/* Header */}
                    <header className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-medium text-pink-600 dark:text-pink-400 uppercase tracking-wider bg-pink-50 dark:bg-pink-900/20 px-3 py-1 rounded-full border border-pink-100 dark:border-pink-800">
                                Self Booking Mode
                            </span>
                            <button
                                onClick={onClose}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                                <i className="fa-solid fa-xmark text-xl"></i>
                            </button>
                        </div>
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                            {step === 1 && "Employee & Trip Info"}
                            {step === 2 && "Travel Itinerary"}
                            {step === 3 && "Booking Confirmation"}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                            {step === 1 && "Select the employee and specify the trip purpose."}
                            {step === 2 && "Enter the travel route and dates (past dates allowed)."}
                            {step === 3 && "Record the ticket cost and upload the ticket."}
                        </p>
                    </header>

                    {/* Forms */}
                    <div className="space-y-6">

                        {/* Step 1: Employee & Basic Information */}
                        {step === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <Select
                                    label="Select Employee"
                                    options={employeeOptions}
                                    value={data.requesterId}
                                    placeholder="Search or select employee..."
                                    onChange={(e: any) => handleEmployeeSelect(e.target.value)}
                                />

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <Input
                                        label="Full Name"
                                        required
                                        value={data.requesterName}
                                        onChange={(e: any) => handleInputChange('requesterName', e.target.value)}
                                        disabled={!!data.requesterId}
                                    />
                                    <Input
                                        label="Email Address"
                                        required
                                        value={data.requesterEmail}
                                        onChange={(e: any) => handleInputChange('requesterEmail', e.target.value)}
                                        disabled={!!data.requesterId}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <Input
                                        label="Phone Number"
                                        required
                                        type="tel"
                                        value={data.requesterPhone}
                                        onChange={(e: any) => handleInputChange('requesterPhone', e.target.value)}
                                    />
                                    <Input
                                        label="Department"
                                        value={data.requesterDepartment}
                                        onChange={(e: any) => handleInputChange('requesterDepartment', e.target.value)}
                                    />
                                </div>

                                <Input
                                    label="Purpose of Travel"
                                    required
                                    placeholder="Reason for this past travel..."
                                    value={data.purpose}
                                    onChange={(e: any) => handleInputChange('purpose', e.target.value)}
                                />

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Mode of Travel */}
                                    <div className="space-y-2.5">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Mode of Travel <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {Object.values(TravelMode).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => handleInputChange('mode', m)}
                                                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${data.mode === m
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                        }`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Trip Type */}
                                    <div className="space-y-2.5">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Trip Type <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex gap-2">
                                            {Object.values(TripType).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => handleInputChange('tripType', t)}
                                                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${data.tripType === t
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                        }`}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Travel Logistics */}
                        {step === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-2 mb-5">
                                        <i className="fa-solid fa-plane-departure text-indigo-600 text-lg"></i>
                                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Outbound Journey</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <Input
                                            label="From"
                                            required
                                            placeholder="City, Airport, or Station"
                                            value={data.from}
                                            onChange={(e: any) => handleInputChange('from', e.target.value)}
                                        />
                                        <Input
                                            label="To"
                                            required
                                            placeholder="City, Airport, or Station"
                                            value={data.to}
                                            onChange={(e: any) => handleInputChange('to', e.target.value)}
                                        />
                                        <Input
                                            label="Departure Date"
                                            required
                                            type="date"
                                            // No min date restriction for past travel
                                            value={data.dateOfTravel}
                                            onChange={(e: any) => handleInputChange('dateOfTravel', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {data.tripType === TripType.ROUND_TRIP && (
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-5">
                                            <i className="fa-solid fa-plane-arrival text-violet-600 text-lg"></i>
                                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Return Journey</h3>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <Input
                                                label="Return From"
                                                required
                                                placeholder="City..."
                                                value={data.returnFrom || data.to}
                                                onChange={(e: any) => handleInputChange('returnFrom', e.target.value)}
                                            />
                                            <Input
                                                label="Return To"
                                                required
                                                placeholder="City..."
                                                value={data.returnTo || data.from}
                                                onChange={(e: any) => handleInputChange('returnTo', e.target.value)}
                                            />
                                            <Input
                                                label="Return Date"
                                                required
                                                type="date"
                                                // Ensure return is after departure
                                                min={data.dateOfTravel}
                                                value={data.returnDate}
                                                onChange={(e: any) => handleInputChange('returnDate', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 3: Booking Confirmation (PNC Specific) */}
                        {step === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                                    <div className="flex items-center gap-2 mb-5">
                                        <i className="fa-solid fa-check-circle text-emerald-600 text-lg"></i>
                                        <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">Booking Details</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <Input
                                            label="Ticket Cost (₹)"
                                            required
                                            type="number"
                                            placeholder="0.00"
                                            value={data.ticketCost}
                                            onChange={(e: any) => handleInputChange('ticketCost', e.target.value)}
                                        />
                                        <Input
                                            label="Vendor Name"
                                            required
                                            placeholder="e.g. Indigo, IRCTC"
                                            value={data.vendorName}
                                            onChange={(e: any) => handleInputChange('vendorName', e.target.value)}
                                        />
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1 mb-2">
                                                Ticket Copy <span className="text-red-500">*</span>
                                            </label>
                                            <div className="w-full relative group">
                                                <input
                                                    type="file"
                                                    required
                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                    onChange={handleFileChange}
                                                    className="w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200 cursor-pointer border border-slate-200 dark:border-slate-800 rounded-xl"
                                                />
                                            </div>
                                            {data.invoiceFile && (
                                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-2 flex items-center gap-1 animate-in fade-in">
                                                    <i className="fa-solid fa-file-check"></i>
                                                    Selected: {data.invoiceFile.name}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3">
                    {step > 1 && (
                        <button
                            onClick={prevStep}
                            className="px-6 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                            <i className="fa-solid fa-arrow-left mr-2"></i>
                            Back
                        </button>
                    )}

                    <div className="flex-1"></div>

                    {step < totalSteps ? (
                        <button
                            onClick={nextStep}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-indigo-600/25 hover:shadow-xl hover:shadow-indigo-600/30 active:scale-[0.98] transition-all"
                        >
                            Continue
                            <i className="fa-solid fa-arrow-right ml-2"></i>
                        </button>
                    ) : (
                        <button
                            onClick={() => onSubmit(data)}
                            disabled={!data.ticketCost || !data.vendorName || !data.invoiceFile}
                            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-emerald-600/25 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i className="fa-solid fa-check mr-2"></i>
                            Submit Past Booking
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PNCBookingModal;
