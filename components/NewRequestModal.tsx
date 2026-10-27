import React, { useState, useMemo, useEffect } from 'react';
import { TripType, TravelMode, Priority, User, TravelModePolicy, Department, TestingSettings, PolicyConfig, BASE_LOCATIONS } from '../types';
import Input from './Input';
import Select from './Select';
import { toast } from 'sonner';
import { calculateDynamicUrgency, getDaysRemaining } from '../utils/policyUtils';
import { areBookingEmailsIdentical, validateBookingStep1Data } from '../utils/bookingValidation';
import { addDaysLocal, earliestBookableDate } from '../utils/utils';
import { supabase } from '../supabaseClient';

interface NewRequestModalProps {
    onClose: () => void;
    onSubmit: (data: any) => void;
    currentUser: User;
    policies: TravelModePolicy[];
    policy?: PolicyConfig;
    meetupContext?: {
        startDate: string;
        endDate: string;
    } | null;
    departments?: Department[];
    testingSettings?: TestingSettings;
    initialData?: any;
    isEditMode?: boolean;
}

const NewRequestModal = ({
    onClose,
    onSubmit,
    currentUser,
    policies,
    policy,
    meetupContext,
    departments = [],
    testingSettings,
    initialData,
    isEditMode = false
}: NewRequestModalProps) => {
    // 4 Steps: 1. Basic & Location, 2. Logistics & Preferences, 3. Emergency Details, 4. Submission Review
    const [step, setStep] = useState(1);
    const totalSteps = 4;

    const getDateWithOffset = (baseDate: string, daysOffset: number) =>
        addDaysLocal(baseDate, daysOffset);

    const defaultMinDate = earliestBookableDate();

    const bloodGroupOptions = [
        'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
    ].map(g => ({ label: g, value: g }));

    const departmentOptions = (departments || []).map(d => ({ label: d.name, value: d.name }));

    const [hasManualUrgencyOverride, setHasManualUrgencyOverride] = useState(false);
    const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);

    const initialDate = isEditMode && initialData ? (initialData.dateOfTravel ? initialData.dateOfTravel.substring(0, 10) : '') : '';
    const initialPriority = isEditMode && initialData
        ? (initialData.priority || calculateDynamicUrgency(initialDate, policy))
        : calculateDynamicUrgency(initialDate, policy);

    // Initial base location from initialData or currentUser.campus
    const initialBase = useMemo(() => {
        if (isEditMode && initialData) {
            return {
                baseLocation: initialData.baseLocation || '',
                remoteLocationDetails: initialData.remoteLocationDetails || ''
            };
        }
        if (currentUser.campus) {
            const raw = currentUser.campus.trim();
            if (raw.toLowerCase().startsWith('remote')) {
                const match = raw.match(/^remote\s*(?:[-–—:\(]\s*|\s*\(\s*)?([^\)]*)\)?$/i);
                const city = match && match[1] ? match[1].trim() : '';
                return { baseLocation: 'Remote', remoteLocationDetails: city };
            }
            const match = BASE_LOCATIONS.find(loc => loc.toLowerCase() === raw.toLowerCase());
            return { baseLocation: match || raw, remoteLocationDetails: '' };
        }
        return { baseLocation: '', remoteLocationDetails: '' };
    }, [currentUser.campus, isEditMode, initialData]);

    const [data, setData] = useState({
        requesterName: isEditMode && initialData ? (initialData.requesterName || '') : currentUser.name,
        requesterEmail: isEditMode && initialData ? (initialData.requesterEmail || '') : currentUser.email,
        requesterPhone: isEditMode && initialData ? (initialData.requesterPhone || '') : (currentUser.phone || ''),
        requesterDepartment: isEditMode && initialData ? (initialData.requesterDepartment || '') : (currentUser.department || ''),
        requesterCampus: isEditMode && initialData ? (initialData.requesterCampus || '') : (currentUser.campus || ''),
        baseLocation: initialBase.baseLocation,
        remoteLocationDetails: initialBase.remoteLocationDetails,
        travelPreferences: isEditMode && initialData ? (initialData.travelPreferences || '') : '',
        screenshotUrl: isEditMode && initialData ? (initialData.screenshotUrl || '') : '',
        purpose: isEditMode && initialData ? (initialData.purpose || '') : (meetupContext ? 'Igatpuri Meetup' : ''),
        approvingManagerName: currentUser.managerName || (isEditMode && initialData ? initialData.approvingManagerName : '') || '',
        approvingManagerEmail: currentUser.managerEmail || (isEditMode && initialData ? initialData.approvingManagerEmail : '') || '',
        tripType: isEditMode && initialData ? (initialData.tripType || TripType.ONE_WAY) : TripType.ONE_WAY,
        mode: isEditMode && initialData ? (initialData.mode || TravelMode.FLIGHT) : TravelMode.FLIGHT,
        from: isEditMode && initialData ? (initialData.from || '') : '',
        to: isEditMode && initialData ? (initialData.to || '') : (meetupContext ? 'Igatpuri' : ''),
        dateOfTravel: initialDate,
        preferredDepartureWindow: isEditMode && initialData ? (initialData.preferredDepartureWindow || '') : '',
        returnDate: isEditMode && initialData ? (initialData.returnDate ? initialData.returnDate.substring(0, 10) : '') : '',
        returnFrom: isEditMode && initialData ? (initialData.returnFrom || initialData.to || '') : (meetupContext ? 'Igatpuri' : ''),
        returnTo: isEditMode && initialData ? (initialData.returnTo || initialData.from || '') : '',
        returnPreferredDepartureWindow: isEditMode && initialData ? (initialData.returnPreferredDepartureWindow || '') : '',
        travellerNames: isEditMode && initialData ? (initialData.travellerNames || '') : currentUser.name,
        priority: initialPriority,
        specialRequirements: isEditMode && initialData ? (initialData.specialRequirements || '') : '',
        emergencyContactName: isEditMode && initialData ? (initialData.emergencyContactName || '') : (currentUser.emergencyContactName || ''),
        emergencyContactPhone: isEditMode && initialData ? (initialData.emergencyContactPhone || '') : (currentUser.emergencyContactPhone || ''),
        emergencyContactRelation: isEditMode && initialData ? (initialData.emergencyContactRelation || '') : (currentUser.emergencyContactRelation || ''),
        bloodGroup: isEditMode && initialData ? (initialData.bloodGroup || '') : (currentUser.bloodGroup || ''),
        medicalConditions: isEditMode && initialData ? (initialData.medicalConditions || '') : (currentUser.medicalConditions || ''),
        violationReason: isEditMode && initialData ? (initialData.violationDetails || '') : ''
    });

    const daysRemaining = useMemo(() => {
        return getDaysRemaining(data.dateOfTravel);
    }, [data.dateOfTravel]);

    const dynamicUrgency = useMemo(() => {
        return calculateDynamicUrgency(data.dateOfTravel, policy);
    }, [data.dateOfTravel, policy]);

    // Keep data.priority in sync with dynamic urgency unless requester manually overrode
    useEffect(() => {
        if (!hasManualUrgencyOverride && data.dateOfTravel) {
            setData(prev => ({ ...prev, priority: dynamicUrgency }));
        }
    }, [dynamicUrgency, hasManualUrgencyOverride, data.dateOfTravel]);

    // Meetup specific date logic
    useEffect(() => {
        if (meetupContext) {
            const isAir = data.mode === TravelMode.FLIGHT;
            const depDefault = isAir ? meetupContext.startDate : getDateWithOffset(meetupContext.startDate, -1);
            const retDefault = isAir ? meetupContext.endDate : getDateWithOffset(meetupContext.endDate, -1);

            setData(prev => ({
                ...prev,
                dateOfTravel: depDefault,
                returnDate: retDefault
            }));
        }
    }, [data.mode, meetupContext]);

    // Calendar constraints
    const depMin = meetupContext ? getDateWithOffset(meetupContext.startDate, -2) : defaultMinDate;
    const depMax = meetupContext ? meetupContext.startDate : undefined;

    const retMin = meetupContext ? getDateWithOffset(meetupContext.endDate, -2) : undefined;
    const retMax = meetupContext ? getDateWithOffset(meetupContext.endDate, 1) : undefined;

    const handleInputChange = (field: string, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.error("Screenshot file must be under 5MB");
            return;
        }

        setIsUploadingScreenshot(true);
        try {
            const fileExt = file.name.split('.').pop();
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const filePath = `${currentUser.id}/${Date.now()}_${safeName}`;

            const { error: uploadError } = await supabase.storage
                .from('request-screenshots')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('request-screenshots')
                .getPublicUrl(filePath);

            setData(prev => ({ ...prev, screenshotUrl: publicUrl }));
            toast.success("Screenshot uploaded successfully");
        } catch (err: any) {
            toast.error("Failed to upload screenshot: " + (err.message || 'Please check bucket configuration'));
        } finally {
            setIsUploadingScreenshot(false);
        }
    };

    const nextStep = () => setStep(s => Math.min(s + 1, totalSteps));
    const prevStep = () => setStep(s => Math.max(s - 1, 1));

    const validationActive = (() => {
        if (!testingSettings) return true;
        if (currentUser.role === 'Admin') return testingSettings.admin;
        if (currentUser.role === 'PNC' || currentUser.role === 'PNC Admin') return testingSettings.pnc;
        return testingSettings.employee;
    })();

    const isManagerEmailSame = useMemo(() => {
        return areBookingEmailsIdentical(data.requesterEmail || currentUser.email, data.approvingManagerEmail);
    }, [data.requesterEmail, data.approvingManagerEmail, currentUser.email]);

    const validateStep = (currentStep: number): boolean => {
        if (!validationActive) return true;

        if (currentStep === 1) {
            if (!data.approvingManagerEmail || !data.approvingManagerName) {
                toast.error("Approving manager is not set in your profile. Please complete your profile first.");
                return false;
            }
            if (isManagerEmailSame) {
                toast.error("Your email and your approving manager's email cannot be the same.");
                return false;
            }
            if (!data.baseLocation) {
                toast.error("Base location is required");
                return false;
            }
            if (data.baseLocation === 'Remote' && !data.remoteLocationDetails?.trim()) {
                toast.error("Please specify your exact remote city/location");
                return false;
            }
            const step1Validation = validateBookingStep1Data(data, currentUser.email);
            if (!step1Validation.isValid) {
                toast.error(step1Validation.error);
                return false;
            }
        } else if (currentStep === 2) {
            if (!data.from.trim()) {
                toast.error("Departure From location is required");
                return false;
            }
            if (!data.to.trim()) {
                toast.error("Departure To location is required");
                return false;
            }
            if (!data.dateOfTravel) {
                toast.error("Departure Date is required");
                return false;
            }
            if (!data.preferredDepartureWindow) {
                toast.error("Preferred Time Window is required");
                return false;
            }
            if (data.tripType === TripType.ROUND_TRIP) {
                const retFrom = data.returnFrom || data.to;
                const retTo = data.returnTo || data.from;
                if (!retFrom.trim()) {
                    toast.error("Return From location is required");
                    return false;
                }
                if (!retTo.trim()) {
                    toast.error("Return To location is required");
                    return false;
                }
                if (!data.returnDate) {
                    toast.error("Return Date is required");
                    return false;
                }
                if (!data.returnPreferredDepartureWindow) {
                    toast.error("Return Preferred Time Window is required");
                    return false;
                }
            }
        } else if (currentStep === 3) {
            if (!data.emergencyContactName.trim()) {
                toast.error("Emergency Contact Name is required");
                return false;
            }
            if (!data.emergencyContactRelation.trim()) {
                toast.error("Emergency Contact Relation is required");
                return false;
            }
            if (!data.emergencyContactPhone.trim()) {
                toast.error("Emergency Contact Phone is required");
                return false;
            }
            if (data.emergencyContactPhone.replace(/\D/g, '').length !== 10) {
                toast.error("Emergency Contact Phone must be exactly 10 digits");
                return false;
            }
        }
        return true;
    };

    const handleNextStep = () => {
        if (validateStep(step)) {
            nextStep();
        }
    };

    const handleSubmit = () => {
        if (!validateStep(1)) {
            setStep(1);
            return;
        }
        if (!validateStep(2)) {
            setStep(2);
            return;
        }
        if (!validateStep(3)) {
            setStep(3);
            return;
        }

        const finalData = {
            ...data,
            baseLocation: data.baseLocation,
            remoteLocationDetails: data.baseLocation === 'Remote' ? data.remoteLocationDetails.trim() : null,
            travelPreferences: data.travelPreferences?.trim() || null,
            screenshotUrl: data.screenshotUrl || null,
            purpose: data.purpose.trim() || 'Testing Booking',
            from: data.from.trim() || '—',
            to: data.to.trim() || '—',
            dateOfTravel: data.dateOfTravel || new Date().toISOString().split('T')[0]
        };
        onSubmit(finalData);
    };

    const progress = (step / totalSteps) * 100;

    const isViolated = useMemo(() => {
        if (!data.dateOfTravel || !data.mode) return false;
        const policy = policies.find(p => p.travelMode === data.mode);
        if (!policy) return false;

        const requestDate = new Date();
        const travelDate = new Date(data.dateOfTravel);
        const daysDifference = Math.floor((travelDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));

        return daysDifference < policy.minAdvanceDays;
    }, [data.dateOfTravel, data.mode, policies]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl" onClick={onClose}></div>

            <div className="relative w-[92vw] max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-slate-200 dark:border-slate-800">

                {/* Progress bar */}
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">

                    {/* Header */}
                    <header className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                                Step {step} of {totalSteps}
                            </span>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <i className="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white leading-tight">
                            {step === 1 && "Basic Information & Policy"}
                            {step === 2 && "Travel Logistics & Preferences"}
                            {step === 3 && "Personal & Emergency Details"}
                            {step === 4 && "Review & Confirm Request"}
                        </h2>
                        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {step === 1 && "Your travel basics, base location, approving manager, and policy guidance."}
                            {step === 2 && "Departure/return itinerary, preferred travel windows, preferences, and quotes."}
                            {step === 3 && "Emergency contact information and any medical requirements."}
                            {step === 4 && "Carefully review all details before submitting for manager approval."}
                        </p>
                    </header>

                    {/* Policy Notice & Manager Remind Note (Always visible at top of form) */}
                    <div className="mb-6 p-4 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <i className="fa-solid fa-book-bookmark text-indigo-600 dark:text-indigo-400 text-sm"></i>
                            <span>
                                Please read the{' '}
                                <a
                                    href="https://app.notion.com/p/navgurukul/Travel-Reimbursement-Policy-2026-37da93c7c39180e7ac27fa2ec5ebc528"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-700"
                                >
                                    Travel Reimbursement Policy 2026
                                </a>{' '}
                                before submitting.
                            </span>
                        </div>
                        <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 shrink-0">
                            <i className="fa-solid fa-bell"></i>
                            <span>Please inform your manager so they can approve this request.</span>
                        </div>
                    </div>

                    {/* Step 1: Basic Information */}
                    {step === 1 && (
                        <div className="space-y-5 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="Full Name"
                                    required
                                    value={data.requesterName}
                                    disabled
                                    onChange={() => { }}
                                />
                                <Input
                                    label="Email Address"
                                    required
                                    value={data.requesterEmail}
                                    disabled
                                    onChange={() => { }}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="Phone Number"
                                    required
                                    type="tel"
                                    placeholder="10-digit mobile number"
                                    value={data.requesterPhone}
                                    onChange={(e: any) => handleInputChange('requesterPhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                />
                                <Select
                                    label="Department"
                                    value={data.requesterDepartment}
                                    options={departmentOptions}
                                    placeholder="Select department..."
                                    onChange={(e: any) => handleInputChange('requesterDepartment', e.target.value)}
                                />
                            </div>

                            {/* Base Location & Remote City Collection */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/80 dark:border-slate-800 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Select
                                        label="Base Location"
                                        required
                                        value={data.baseLocation}
                                        options={BASE_LOCATIONS.map(loc => ({ label: loc, value: loc }))}
                                        placeholder="Select your base campus or remote..."
                                        onChange={(e: any) => handleInputChange('baseLocation', e.target.value)}
                                    />
                                    {data.baseLocation === 'Remote' ? (
                                        <Input
                                            label="Remote Work Location (City / State)"
                                            required
                                            placeholder="e.g. Patna, Lucknow, Hyderabad"
                                            value={data.remoteLocationDetails}
                                            onChange={(e: any) => handleInputChange('remoteLocationDetails', e.target.value)}
                                        />
                                    ) : (
                                        <div className="flex flex-col justify-end text-xs text-slate-500 pb-2">
                                            <span>Campus base: {data.baseLocation || 'None selected'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Approving Manager (Auto-fetched & Read-only) */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/80 dark:border-slate-800">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-base">
                                            <i className="fa-solid fa-user-tie"></i>
                                        </div>
                                        <div>
                                            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                Approving Manager (Auto-linked)
                                            </div>
                                            <div className="text-sm font-bold text-slate-800 dark:text-white">
                                                {currentUser.managerName || data.approvingManagerName || 'Not configured in profile'}
                                                <span className="text-xs font-normal text-slate-500 ml-2">
                                                    ({currentUser.managerEmail || data.approvingManagerEmail || 'no email'})
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {(!currentUser.managerEmail || !currentUser.managerName) && (
                                        <span className="text-xs text-rose-500 font-bold bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded border border-rose-200 dark:border-rose-800">
                                            Missing in profile
                                        </span>
                                    )}
                                </div>
                            </div>

                            <Input
                                label="Purpose of Travel"
                                required
                                placeholder="e.g., Campus orientation, hackathon, quarterly sync..."
                                value={data.purpose}
                                disabled={!!meetupContext}
                                onChange={(e: any) => handleInputChange('purpose', e.target.value)}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Mode of Travel */}
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                        Mode of Travel <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.values(TravelMode).map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => handleInputChange('mode', m)}
                                                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${data.mode === m
                                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                    }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Trip Type */}
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                        Trip Type <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="flex gap-2">
                                        {Object.values(TripType).map(t => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => handleInputChange('tripType', t)}
                                                className={`flex-1 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${data.tripType === t
                                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
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

                    {/* Step 2: Travel Logistics & Preferences & Screenshot */}
                    {step === 2 && (
                        <div className="space-y-5 animate-in fade-in duration-300">
                            {/* Outbound Journey */}
                            <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
                                <div className="flex items-center gap-2">
                                    <i className="fa-solid fa-plane-departure text-indigo-600 text-base"></i>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Outbound Journey</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input
                                        label="From"
                                        required
                                        placeholder="Origin City / Campus"
                                        value={data.from}
                                        onChange={(e: any) => handleInputChange('from', e.target.value)}
                                    />
                                    <Input
                                        label="To"
                                        required
                                        placeholder="Destination City / Campus"
                                        value={data.to}
                                        onChange={(e: any) => handleInputChange('to', e.target.value)}
                                    />
                                    <Input
                                        label="Departure Date"
                                        required
                                        type="date"
                                        min={depMin}
                                        max={depMax}
                                        value={data.dateOfTravel}
                                        onChange={(e: any) => handleInputChange('dateOfTravel', e.target.value)}
                                    />
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                            Preferred Departure Time <span className="text-rose-500">*</span>
                                        </label>
                                        <select
                                            className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                            value={data.preferredDepartureWindow}
                                            onChange={e => handleInputChange('preferredDepartureWindow', e.target.value)}
                                        >
                                            <option value="">Select time window...</option>
                                            <option value="Morning (6AM - 12PM)">Morning (6AM - 12PM)</option>
                                            <option value="Afternoon (12PM - 6PM)">Afternoon (12PM - 6PM)</option>
                                            <option value="Evening (6PM - 12AM)">Evening (6PM - 12AM)</option>
                                            <option value="Anytime">Anytime</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Dynamic Urgency Display */}
                                {data.dateOfTravel && (
                                    <div className="p-3 bg-white dark:bg-slate-900/80 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                                        <div className="flex items-center gap-2.5">
                                            <span className={`w-2.5 h-2.5 rounded-full ${
                                                data.priority === Priority.CRITICAL ? 'bg-rose-500' :
                                                data.priority === Priority.HIGH ? 'bg-amber-500' :
                                                data.priority === Priority.MEDIUM ? 'bg-sky-500' : 'bg-emerald-500'
                                            }`}></span>
                                            <span className="font-bold text-slate-700 dark:text-slate-300">
                                                Assigned Urgency: <strong className="uppercase">{data.priority}</strong>
                                            </span>
                                            {daysRemaining !== null && (
                                                <span className="text-slate-400">
                                                    ({daysRemaining > 0 ? `${daysRemaining} days to travel` : 'Departing today'})
                                                </span>
                                            )}
                                        </div>
                                        {policy?.allowRequesterUrgency && (
                                            <select
                                                value={data.priority}
                                                onChange={e => {
                                                    setHasManualUrgencyOverride(true);
                                                    handleInputChange('priority', e.target.value as Priority);
                                                }}
                                                className="px-2 py-1 text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                                            >
                                                <option value={Priority.LOW}>Low</option>
                                                <option value={Priority.MEDIUM}>Medium</option>
                                                <option value={Priority.HIGH}>High</option>
                                                <option value={Priority.CRITICAL}>Critical</option>
                                            </select>
                                        )}
                                    </div>
                                )}

                                {isViolated && (
                                    <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-lg space-y-2">
                                        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs font-bold">
                                            <i className="fa-solid fa-triangle-exclamation"></i>
                                            <span>Advance Booking Policy Violation (Less than {policies.find(p => p.travelMode === data.mode)?.minAdvanceDays} days)</span>
                                        </div>
                                        <textarea
                                            className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-md outline-none focus:ring-1 focus:ring-rose-500"
                                            placeholder="Please provide justification for short notice booking..."
                                            rows={2}
                                            value={data.violationReason}
                                            onChange={(e) => handleInputChange('violationReason', e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Return Journey */}
                            {data.tripType === TripType.ROUND_TRIP && (
                                <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <i className="fa-solid fa-plane-arrival text-violet-600 text-base"></i>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Return Journey</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input
                                            label="Return From"
                                            required
                                            placeholder="Origin City / Campus"
                                            value={data.returnFrom || data.to}
                                            onChange={(e: any) => handleInputChange('returnFrom', e.target.value)}
                                        />
                                        <Input
                                            label="Return To"
                                            required
                                            placeholder="Destination City / Campus"
                                            value={data.returnTo || data.from}
                                            onChange={(e: any) => handleInputChange('returnTo', e.target.value)}
                                        />
                                        <Input
                                            label="Return Date"
                                            required
                                            type="date"
                                            min={retMin || data.dateOfTravel || defaultMinDate}
                                            max={retMax}
                                            value={data.returnDate}
                                            onChange={(e: any) => handleInputChange('returnDate', e.target.value)}
                                        />
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                                Preferred Return Time <span className="text-rose-500">*</span>
                                            </label>
                                            <select
                                                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                value={data.returnPreferredDepartureWindow}
                                                onChange={e => handleInputChange('returnPreferredDepartureWindow', e.target.value)}
                                            >
                                                <option value="">Select time window...</option>
                                                <option value="Morning (6AM - 12PM)">Morning (6AM - 12PM)</option>
                                                <option value="Afternoon (12PM - 6PM)">Afternoon (12PM - 6PM)</option>
                                                <option value="Evening (6PM - 12AM)">Evening (6PM - 12AM)</option>
                                                <option value="Anytime">Anytime</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Travel Preferences */}
                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Travel Preferences (Optional)
                                </label>
                                <textarea
                                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    rows={2}
                                    placeholder="e.g., Aisle seat, vegetarian meal, flight after 10 AM, etc."
                                    value={data.travelPreferences}
                                    onChange={e => handleInputChange('travelPreferences', e.target.value)}
                                />
                            </div>

                            {/* Screenshot Upload (Max 5MB) */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                                            Screenshot / Itinerary Quote (Optional)
                                        </h4>
                                        <p className="text-2xs text-slate-500 mt-0.5">
                                            Upload a screenshot of preferred flights/trains or quotes (Max 5MB, PDF/Images).
                                        </p>
                                    </div>
                                    {data.screenshotUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setData(prev => ({ ...prev, screenshotUrl: '' }))}
                                            className="text-2xs text-rose-600 hover:underline font-bold"
                                        >
                                            Remove attachment
                                        </button>
                                    )}
                                </div>

                                {data.screenshotUrl ? (
                                    <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <div className="w-8 h-8 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center">
                                            <i className="fa-solid fa-file-image"></i>
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <a
                                                href={data.screenshotUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline truncate block"
                                            >
                                                View Uploaded Attachment
                                            </a>
                                            <span className="text-3xs text-emerald-600 font-semibold">Attached to request</span>
                                        </div>
                                        <i className="fa-solid fa-circle-check text-emerald-500"></i>
                                    </div>
                                ) : (
                                    <label className="flex items-center justify-center gap-2 p-3 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-indigo-500 cursor-pointer transition-all">
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*,application/pdf"
                                            onChange={handleScreenshotUpload}
                                            disabled={isUploadingScreenshot}
                                        />
                                        {isUploadingScreenshot ? (
                                            <>
                                                <i className="fa-solid fa-spinner fa-spin text-indigo-600"></i>
                                                <span>Uploading screenshot...</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="fa-solid fa-cloud-arrow-up text-indigo-600"></i>
                                                <span>Attach Screenshot or PDF</span>
                                            </>
                                        )}
                                    </label>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Traveller Details & Emergency Contacts */}
                    {step === 3 && (
                        <div className="space-y-5 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Select
                                    label="Blood Group"
                                    placeholder="Select Blood Group"
                                    value={data.bloodGroup}
                                    options={bloodGroupOptions}
                                    onChange={(e: any) => handleInputChange('bloodGroup', e.target.value)}
                                />
                            </div>

                            <div className="p-5 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                                    <i className="fa-solid fa-phone-flip text-indigo-600"></i>
                                    Emergency Contact Information
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
                                        placeholder="e.g. Parent, Spouse, Sibling"
                                        value={data.emergencyContactRelation}
                                        onChange={(e: any) => handleInputChange('emergencyContactRelation', e.target.value)}
                                    />
                                    <div className="md:col-span-2">
                                        <Input
                                            label="Emergency Contact Phone"
                                            required
                                            placeholder="10-digit phone number"
                                            value={data.emergencyContactPhone}
                                            onChange={(e: any) => handleInputChange('emergencyContactPhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Medical Conditions or Special Needs (Optional)
                                </label>
                                <textarea
                                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    rows={3}
                                    placeholder="List any serious medical conditions, disabilities, or allergies..."
                                    value={data.medicalConditions || data.specialRequirements}
                                    onChange={e => handleInputChange('medicalConditions', e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 4: Submission Review Screen */}
                    {step === 4 && (
                        <div className="space-y-5 animate-in fade-in duration-300">
                            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center shrink-0">
                                    <i className="fa-solid fa-clipboard-check"></i>
                                </div>
                                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                                    <strong>Please verify your request summary.</strong> Once submitted, an email notification will be sent immediately to your approving manager.
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                                {/* Requester & Manager */}
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-slate-400 font-bold uppercase tracking-wider block text-2xs">Employee</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">{data.requesterName}</span>
                                        <span className="text-slate-500 block">{data.requesterEmail} • {data.requesterPhone}</span>
                                        <span className="text-slate-500 block">Dept: {data.requesterDepartment || 'General'}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 font-bold uppercase tracking-wider block text-2xs">Approving Manager</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">{data.approvingManagerName}</span>
                                        <span className="text-slate-500 block">{data.approvingManagerEmail}</span>
                                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold block mt-1">
                                            <i className="fa-solid fa-envelope mr-1"></i> Will receive approval email
                                        </span>
                                    </div>
                                </div>

                                {/* Base Location & Purpose */}
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-slate-400 font-bold uppercase tracking-wider block text-2xs">Base Location</span>
                                        <span className="font-bold text-slate-800 dark:text-white">
                                            {data.baseLocation}
                                            {data.baseLocation === 'Remote' && data.remoteLocationDetails ? ` (${data.remoteLocationDetails})` : ''}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 font-bold uppercase tracking-wider block text-2xs">Purpose of Travel</span>
                                        <span className="font-bold text-slate-800 dark:text-white">{data.purpose}</span>
                                    </div>
                                </div>

                                {/* Itinerary */}
                                <div className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider text-2xs">Itinerary Details</span>
                                        <span className="font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded text-2xs">
                                            {data.mode} • {data.tripType} • Priority: {data.priority}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                                            <div className="text-2xs font-bold text-slate-400 uppercase">Outbound</div>
                                            <div className="font-bold text-slate-900 dark:text-white mt-1">
                                                {data.from} → {data.to}
                                            </div>
                                            <div className="text-slate-500 mt-0.5">
                                                Date: <strong>{data.dateOfTravel}</strong> ({data.preferredDepartureWindow})
                                            </div>
                                        </div>

                                        {data.tripType === TripType.ROUND_TRIP && (
                                            <div className="p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                                                <div className="text-2xs font-bold text-slate-400 uppercase">Return</div>
                                                <div className="font-bold text-slate-900 dark:text-white mt-1">
                                                    {data.returnFrom || data.to} → {data.returnTo || data.from}
                                                </div>
                                                <div className="text-slate-500 mt-0.5">
                                                    Date: <strong>{data.returnDate}</strong> ({data.returnPreferredDepartureWindow})
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Preferences & Screenshot */}
                                {(data.travelPreferences || data.screenshotUrl) && (
                                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {data.travelPreferences && (
                                            <div>
                                                <span className="text-slate-400 font-bold uppercase tracking-wider block text-2xs">Travel Preferences</span>
                                                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{data.travelPreferences}</p>
                                            </div>
                                        )}
                                        {data.screenshotUrl && (
                                            <div>
                                                <span className="text-slate-400 font-bold uppercase tracking-wider block text-2xs">Attached Quote/Screenshot</span>
                                                <a
                                                    href={data.screenshotUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-indigo-600 dark:text-indigo-400 underline font-bold mt-0.5 inline-block"
                                                >
                                                    <i className="fa-solid fa-paperclip mr-1"></i> View Attachment
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Emergency Contact */}
                                <div className="p-4">
                                    <span className="text-slate-400 font-bold uppercase tracking-wider block text-2xs">Emergency Contact</span>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        {data.emergencyContactName} ({data.emergencyContactRelation}) • {data.emergencyContactPhone}
                                        {data.bloodGroup ? ` • Blood Group: ${data.bloodGroup}` : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    {step > 1 ? (
                        <button
                            type="button"
                            onClick={prevStep}
                            className="px-5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-2"
                        >
                            <i className="fa-solid fa-arrow-left"></i>
                            Back
                        </button>
                    ) : (
                        <div></div>
                    )}

                    {step < totalSteps ? (
                        <button
                            type="button"
                            onClick={handleNextStep}
                            disabled={step === 2 && isViolated && !data.violationReason.trim()}
                            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>{step === 3 ? "Review Summary" : "Continue"}</span>
                            <i className="fa-solid fa-arrow-right"></i>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-lg shadow-lg shadow-emerald-600/25 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <i className="fa-solid fa-check"></i>
                            Confirm & Submit Request
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NewRequestModal;
