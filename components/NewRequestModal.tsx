import React, { useState } from 'react';
import { TripType, TravelMode, Priority, User } from '../types';
import Input from './Input';

interface NewRequestModalProps {
    onClose: () => void;
    onSubmit: (data: any) => void;
    currentUser: User;
}

const NewRequestModal = ({ onClose, onSubmit, currentUser }: NewRequestModalProps) => {
    const [step, setStep] = useState(1);
    const totalSteps = 3;

    const [data, setData] = useState({
        requesterName: currentUser.name,
        requesterEmail: currentUser.email,
        requesterPhone: '',
        requesterDepartment: currentUser.department || '',
        requesterCampus: currentUser.campus || '',
        purpose: '',
        approvingManagerName: currentUser.managerName || '',
        approvingManagerEmail: currentUser.managerEmail || '',
        tripType: TripType.ONE_WAY,
        mode: TravelMode.FLIGHT,
        from: '',
        to: '',
        dateOfTravel: '',
        preferredDepartureWindow: '',
        returnDate: '',
        returnFrom: '',
        returnTo: '',
        returnPreferredDepartureWindow: '',
        travellerNames: currentUser.name, // Default to self
        contactNumbers: currentUser.phone || '',
        priority: Priority.MEDIUM,
        specialRequirements: '',
        emergencyContactName: currentUser.emergencyContactName || '',
        emergencyContactPhone: currentUser.emergencyContactPhone || '',
        emergencyContactRelation: currentUser.emergencyContactRelation || '',
        bloodGroup: currentUser.bloodGroup || '',
        medicalConditions: currentUser.medicalConditions || ''
    });

    const handleInputChange = (field: string, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
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
                            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                Step {step} of {totalSteps}
                            </span>
                            <button
                                onClick={onClose}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                                <i className="fa-solid fa-xmark text-xl"></i>
                            </button>
                        </div>
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                            {step === 1 && "Basic Information"}
                            {step === 2 && "Travel Logistics"}
                            {step === 3 && "Personal & Emergency Details"}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                            {step === 1 && "Let's start with the essential details about your travel request"}
                            {step === 2 && "Specify your departure and return travel arrangements"}
                            {step === 3 && "Verify your contact and emergency information for this trip"}
                        </p>
                    </header>

                    {/* Forms */}
                    <div className="space-y-6">

                        {/* Step 1: Basic Information */}
                        {step === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <Input
                                        label="Full Name"
                                        required
                                        value={data.requesterName}
                                        onChange={(e: any) => handleInputChange('requesterName', e.target.value)}
                                    />
                                    <Input
                                        label="Email Address"
                                        required
                                        value={data.requesterEmail}
                                        disabled
                                        onChange={() => { }}
                                    />
                                </div>

                                <Input
                                    label="Purpose of Travel"
                                    required
                                    placeholder="e.g., Client meeting, conference attendance, site visit..."
                                    value={data.purpose}
                                    onChange={(e: any) => handleInputChange('purpose', e.target.value)}
                                />

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <Input
                                        label="Approving Manager Name"
                                        required
                                        value={data.approvingManagerName}
                                        onChange={(e: any) => handleInputChange('approvingManagerName', e.target.value)}
                                    />
                                    <Input
                                        label="Approving Manager Email"
                                        required
                                        value={data.approvingManagerEmail}
                                        onChange={(e: any) => handleInputChange('approvingManagerEmail', e.target.value)}
                                    />
                                </div>

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

                                {/* Outbound Journey */}
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
                                            value={data.dateOfTravel}
                                            onChange={(e: any) => handleInputChange('dateOfTravel', e.target.value)}
                                        />
                                        <div className="space-y-2.5">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Preferred Time <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                                value={data.preferredDepartureWindow}
                                                onChange={e => handleInputChange('preferredDepartureWindow', e.target.value)}
                                            >
                                                <option value="">Select time window</option>
                                                <option value="Morning (6AM - 12PM)">Morning (6AM - 12PM)</option>
                                                <option value="Afternoon (12PM - 6PM)">Afternoon (12PM - 6PM)</option>
                                                <option value="Evening (6PM - 12AM)">Evening (6PM - 12AM)</option>
                                                <option value="Anytime">Anytime</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Return Journey */}
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
                                                placeholder="City, Airport, or Station"
                                                value={data.returnFrom || data.to}
                                                onChange={(e: any) => handleInputChange('returnFrom', e.target.value)}
                                            />
                                            <Input
                                                label="Return To"
                                                required
                                                placeholder="City, Airport, or Station"
                                                value={data.returnTo || data.from}
                                                onChange={(e: any) => handleInputChange('returnTo', e.target.value)}
                                            />
                                            <Input
                                                label="Return Date"
                                                required
                                                type="date"
                                                value={data.returnDate}
                                                onChange={(e: any) => handleInputChange('returnDate', e.target.value)}
                                            />
                                            <div className="space-y-2.5">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Preferred Time <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                                    value={data.returnPreferredDepartureWindow}
                                                    onChange={e => handleInputChange('returnPreferredDepartureWindow', e.target.value)}
                                                >
                                                    <option value="">Select time window</option>
                                                    <option value="Morning (6AM - 12PM)">Morning (6AM - 12PM)</option>
                                                    <option value="Afternoon (12PM - 6PM)">Afternoon (12PM - 6PM)</option>
                                                    <option value="Evening (6PM - 12AM)">Evening (6PM - 12AM)</option>
                                                    <option value="Anytime">Anytime</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 3: Traveller Details */}
                        {step === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <Input
                                        label="Your Contact Number"
                                        required
                                        placeholder="+91 98765 43210"
                                        value={data.contactNumbers}
                                        onChange={(e: any) => handleInputChange('contactNumbers', e.target.value)}
                                    />
                                    <Input
                                        label="Blood Group"
                                        placeholder="e.g., O+, A-"
                                        value={data.bloodGroup}
                                        onChange={(e: any) => handleInputChange('bloodGroup', e.target.value)}
                                    />
                                </div>

                                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                        <i className="fa-solid fa-phone-flip text-indigo-600"></i>
                                        Emergency Contact Info
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input
                                            label="Emergency Contact Name"
                                            required
                                            value={data.emergencyContactName}
                                            onChange={(e: any) => handleInputChange('emergencyContactName', e.target.value)}
                                        />
                                        <Input
                                            label="Relationship"
                                            required
                                            value={data.emergencyContactRelation}
                                            onChange={(e: any) => handleInputChange('emergencyContactRelation', e.target.value)}
                                        />
                                        <div className="md:col-span-2">
                                            <Input
                                                label="Emergency contact phone"
                                                required
                                                value={data.emergencyContactPhone}
                                                onChange={(e: any) => handleInputChange('emergencyContactPhone', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2.5">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Medical Conditions or Special Requirements
                                    </label>
                                    <textarea
                                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                                        rows={3}
                                        placeholder="List any serious medical conditions, allergies, or travel assistance needs..."
                                        value={data.medicalConditions || data.specialRequirements}
                                        onChange={e => handleInputChange('medicalConditions', e.target.value)}
                                    />
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
                            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-emerald-600/25 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] transition-all"
                        >
                            <i className="fa-solid fa-check mr-2"></i>
                            Submit Request
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NewRequestModal;
