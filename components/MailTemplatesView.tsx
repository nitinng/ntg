
import React, { useState, useEffect } from 'react';
import { MailTemplate, UserRole, PNCStatus, TravelRequest, Priority, TravelMode, TripType, ApprovalStatus } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import Input from './Input';
import TextArea from './TextArea';
import Select from './Select';

const SAMPLE_REQUEST: TravelRequest = {
    id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    submissionId: 'TRV-O-231025-001',
    timestamp: new Date().toISOString(),
    requesterId: 'user-123',
    requesterName: 'Aditi Sharma',
    requesterEmail: 'aditi@navgurukul.org',
    requesterPhone: '9876543210',
    requesterDepartment: 'Program',
    requesterCampus: 'Pune',
    purpose: 'Annual Review Meeting',
    tripType: TripType.ONE_WAY,
    mode: TravelMode.FLIGHT,
    from: 'Pune',
    to: 'Bangalore',
    dateOfTravel: '2023-11-15',
    preferredDepartureWindow: 'Morning (6am - 12pm)',
    numberOfTravelers: 1,
    priority: Priority.HIGH,
    approvalStatus: ApprovalStatus.APPROVED,
    pncStatus: PNCStatus.APPROVED,
    ticketCost: 4500,
    vendorName: 'Indigo',
    hasViolation: false,
    comments: [],
    timeline: [],
    emergencyContactName: 'Ravi Sharma',
    emergencyContactPhone: '9876543211',
    emergencyContactRelation: 'Father',
    bloodGroup: 'B+',
};

// localStorage key for unsaved in-progress new template form
const DRAFT_KEY = 'mail_template_draft';

type Tab = 'published' | 'drafts';

interface MailTemplatesViewProps {
    currentUserRole: UserRole;
}

const MailTemplatesView: React.FC<MailTemplatesViewProps> = ({ currentUserRole }) => {
    const [templates, setTemplates] = useState<MailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('published');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [currentTemplate, setCurrentTemplate] = useState<Partial<MailTemplate>>({});
    const [previewTemplate, setPreviewTemplate] = useState<MailTemplate | null>(null);
    const [saving, setSaving] = useState(false);

    const canEdit = currentUserRole === UserRole.ADMIN;

    const published = templates.filter(t => !t.isDraft);
    const drafts = templates.filter(t => t.isDraft);

    // ── Data fetching ─────────────────────────────────────────────────────────
    useEffect(() => { fetchTemplates(); }, []);

    const fetchTemplates = async () => {
        try {
            const { data, error } = await supabase
                .from('mail_templates')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formatted: MailTemplate[] = (data || []).map((t: any) => ({
                id: t.id,
                name: t.name,
                subject: t.subject,
                body: t.body,
                statusTrigger: t.status_trigger,
                isDraft: t.is_draft ?? false,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
            }));
            setTemplates(formatted);
        } catch (err: any) {
            toast.error('Error fetching templates: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Save draft to localStorage while user types ──────────────────────────
    useEffect(() => {
        if (isModalOpen && !currentTemplate.id) {
            if (currentTemplate.name || currentTemplate.subject || currentTemplate.body) {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(currentTemplate));
            }
        }
    }, [currentTemplate, isModalOpen]);

    // ── Open modal ────────────────────────────────────────────────────────────
    const openModal = (template?: MailTemplate) => {
        if (template) {
            setCurrentTemplate(template);
        } else {
            // Restore unsaved local draft if present
            const saved = localStorage.getItem(DRAFT_KEY);
            if (saved) {
                try {
                    const draft = JSON.parse(saved);
                    if (draft.name || draft.subject || draft.body) {
                        setCurrentTemplate(draft);
                        toast.info('Unsaved draft restored');
                    } else {
                        resetForm();
                    }
                } catch {
                    resetForm();
                }
            } else {
                resetForm();
            }
        }
        setIsModalOpen(true);
    };

    const resetForm = () => setCurrentTemplate({
        name: '', subject: '', body: '', statusTrigger: PNCStatus.NOT_STARTED, isDraft: false,
    });

    const clearLocalDraft = () => localStorage.removeItem(DRAFT_KEY);

    // ── Save (publish or save-as-draft) ───────────────────────────────────────
    const handleSave = async (saveAsDraft: boolean) => {
        if (!currentTemplate.name) { toast.error('Template name is required'); return; }
        if (!saveAsDraft && (!currentTemplate.subject || !currentTemplate.body || !currentTemplate.statusTrigger)) {
            toast.error('Please fill all fields before publishing');
            return;
        }

        setSaving(true);
        try {
            const payload: any = {
                name: currentTemplate.name,
                subject: currentTemplate.subject || '',
                body: currentTemplate.body || '',
                status_trigger: currentTemplate.statusTrigger || null,
                is_draft: saveAsDraft,
                updated_at: new Date().toISOString(),
            };

            if (currentTemplate.id) {
                const { error } = await supabase
                    .from('mail_templates')
                    .update(payload)
                    .eq('id', currentTemplate.id);
                if (error) throw error;
                toast.success(saveAsDraft ? 'Saved as draft' : 'Template published');
            } else {
                const { error } = await supabase
                    .from('mail_templates')
                    .insert([payload]);
                if (error) throw error;
                toast.success(saveAsDraft ? 'Draft saved to database' : 'Template published');
            }

            clearLocalDraft();
            setIsModalOpen(false);
            fetchTemplates();
            setActiveTab(saveAsDraft ? 'drafts' : 'published');
        } catch (err: any) {
            toast.error('Error saving template: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Publish an existing draft ─────────────────────────────────────────────
    const handlePublishDraft = async (template: MailTemplate) => {
        if (!template.subject || !template.body || !template.statusTrigger) {
            // Open to edit and fill missing fields
            openModal(template);
            toast.warning('Please fill all fields before publishing');
            return;
        }
        setSaving(true);
        try {
            const { error } = await supabase
                .from('mail_templates')
                .update({ is_draft: false, updated_at: new Date().toISOString() })
                .eq('id', template.id);
            if (error) throw error;
            toast.success(`"${template.name}" published`);
            fetchTemplates();
            setActiveTab('published');
        } catch (err: any) {
            toast.error('Publish failed: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = async (id: string) => {
        if (!confirm('Delete this template?')) return;
        try {
            const { error } = await supabase.from('mail_templates').delete().eq('id', id);
            if (error) throw error;
            toast.success('Template deleted');
            fetchTemplates();
        } catch (err: any) {
            toast.error('Delete failed: ' + err.message);
        }
    };

    // ── Preview ───────────────────────────────────────────────────────────────
    const openPreview = (template: MailTemplate) => { setPreviewTemplate(template); setIsPreviewOpen(true); };

    const renderPreviewContent = (content: string) => {
        if (!content) return '';
        let processed = content;
        Object.entries(SAMPLE_REQUEST).forEach(([key, value]) => {
            processed = processed.replace(new RegExp(`{{${key}}}`, 'g'), String(value ?? ''));
        });
        return processed;
    };

    // ── Card ──────────────────────────────────────────────────────────────────
    const TemplateCard = ({ template }: { template: MailTemplate }) => (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:shadow-lg transition-all group flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        {template.statusTrigger || 'No trigger'}
                    </span>
                    {template.isDraft && (
                        <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            Draft
                        </span>
                    )}
                </div>
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!template.isDraft && (
                        <button onClick={() => openPreview(template)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors" title="Preview">
                            <i className="fa-solid fa-eye text-sm"></i>
                        </button>
                    )}
                    {canEdit && (
                        <>
                            {template.isDraft && (
                                <button onClick={() => handlePublishDraft(template)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-600 transition-colors" title="Publish">
                                    <i className="fa-solid fa-upload text-sm"></i>
                                </button>
                            )}
                            <button onClick={() => openModal(template)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                                <i className="fa-solid fa-pen text-sm"></i>
                            </button>
                            <button onClick={() => handleDelete(template.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-600 transition-colors" title="Delete">
                                <i className="fa-solid fa-trash text-sm"></i>
                            </button>
                        </>
                    )}
                </div>
            </div>

            <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">{template.name}</h3>
            {template.subject && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-1">Subject: {template.subject}</p>
            )}
            {!template.subject && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-3 italic">No subject yet</p>
            )}

            <div className="mt-auto pt-4 border-t dark:border-slate-800 flex justify-between items-center text-xs text-slate-400">
                <span>Updated {new Date(template.updatedAt || template.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {!template.isDraft && canEdit && (
                    <button onClick={() => openPreview(template)} className="text-indigo-500 hover:text-indigo-700 font-semibold transition-colors">
                        Preview →
                    </button>
                )}
            </div>
        </div>
    );

    const EmptyState = ({ type }: { type: Tab }) => (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl ${type === 'drafts' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500' : 'bg-indigo-50 dark:bg-slate-800 text-indigo-600'}`}>
                <i className={`fa-solid ${type === 'drafts' ? 'fa-file-pen' : 'fa-envelope-open-text'}`}></i>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {type === 'drafts' ? 'No Drafts' : 'No Published Templates'}
            </h3>
            <p className="text-slate-500 mt-2 mb-6 text-sm">
                {type === 'drafts'
                    ? 'Drafts let you work on a template before publishing it.'
                    : 'Create and publish a template to start sending automated emails.'}
            </p>
            {canEdit && (
                <button onClick={() => openModal()} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-indigo-700 transition-all active:scale-95">
                    <i className="fa-solid fa-plus mr-2"></i>
                    {type === 'drafts' ? 'Start a Draft' : 'Create Template'}
                </button>
            )}
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Mail Templates</h2>
                    <p className="text-slate-500 text-sm mt-1">Manage automated email notifications for each request status.</p>
                </div>
                {canEdit && (
                    <button
                        onClick={() => openModal()}
                        className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95 hover:bg-indigo-700 self-start sm:self-auto"
                    >
                        <i className="fa-solid fa-plus mr-2"></i>Create Template
                    </button>
                )}
            </header>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                {(['published', 'drafts'] as Tab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold capitalize transition-all ${activeTab === tab
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        {tab === 'published' ? (
                            <><i className="fa-solid fa-check-circle mr-2 text-emerald-500"></i>Published <span className="ml-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full text-xs">{published.length}</span></>
                        ) : (
                            <><i className="fa-solid fa-file-pen mr-2 text-amber-500"></i>Drafts <span className="ml-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full text-xs">{drafts.length}</span></>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-600"></i>
                </div>
            ) : activeTab === 'published' ? (
                published.length === 0 ? <EmptyState type="published" /> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {published.map(t => <TemplateCard key={t.id} template={t} />)}
                    </div>
                )
            ) : (
                drafts.length === 0 ? <EmptyState type="drafts" /> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {drafts.map(t => <TemplateCard key={t.id} template={t} />)}
                    </div>
                )
            )}

            {/* ── Create / Edit Modal ────────────────────────────────────── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden z-50 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

                        {/* Modal header */}
                        <div className="px-8 py-5 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                    {currentTemplate.id
                                        ? (currentTemplate.isDraft ? '✏️ Edit Draft' : '✏️ Edit Template')
                                        : '✉️ New Template'
                                    }
                                </h3>
                                {!currentTemplate.id && (
                                    <p className="text-xs text-slate-400 mt-0.5">Auto-saved to browser while you type</p>
                                )}
                            </div>
                            <button onClick={() => setIsModalOpen(false)}>
                                <i className="fa-solid fa-xmark text-slate-400 hover:text-slate-600 text-xl transition-colors"></i>
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                            <Input
                                label="Template Name *"
                                value={currentTemplate.name || ''}
                                onChange={(e: any) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                                placeholder="e.g. Booking Confirmation Email"
                            />

                            <Select
                                label="Trigger Status"
                                value={currentTemplate.statusTrigger || ''}
                                options={Object.values(PNCStatus).map(s => ({ label: s, value: s }))}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, statusTrigger: e.target.value })}
                            />

                            <Input
                                label="Email Subject"
                                value={currentTemplate.subject || ''}
                                onChange={(e: any) => setCurrentTemplate({ ...currentTemplate, subject: e.target.value })}
                                placeholder="e.g. Your travel request {{submissionId}} has been approved"
                            />

                            <div>
                                <div className="mb-2 text-xs text-slate-400 leading-relaxed">
                                    <span className="font-semibold text-slate-500">Available placeholders:</span>{' '}
                                    {Object.keys(SAMPLE_REQUEST).map(k => (
                                        <code key={k} className="bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded text-[11px] mr-1 mb-1 inline-block">{`{{${k}}}`}</code>
                                    ))}
                                </div>
                                <TextArea
                                    label="Email Body (HTML supported)"
                                    value={currentTemplate.body || ''}
                                    onChange={(e: any) => setCurrentTemplate({ ...currentTemplate, body: e.target.value })}
                                    placeholder="<p>Dear {{requesterName}},</p><p>Your request has been approved.</p>"
                                    rows={10}
                                />
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div className="p-6 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-between items-center gap-3">
                            <div>
                                {!currentTemplate.id && (currentTemplate.name || currentTemplate.subject || currentTemplate.body) && (
                                    <button
                                        onClick={() => {
                                            if (confirm('Discard this draft?')) {
                                                clearLocalDraft();
                                                resetForm();
                                                toast.success('Draft discarded');
                                            }
                                        }}
                                        className="px-4 py-2 text-rose-500 font-semibold hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all text-sm"
                                    >
                                        <i className="fa-solid fa-trash mr-2"></i>Discard
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 text-slate-500 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                {canEdit && (
                                    <>
                                        <button
                                            onClick={() => handleSave(true)}
                                            disabled={saving}
                                            className="px-5 py-2.5 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-all text-sm disabled:opacity-60 shadow"
                                        >
                                            <i className="fa-solid fa-floppy-disk mr-2"></i>
                                            {currentTemplate.isDraft ? 'Update Draft' : 'Save as Draft'}
                                        </button>
                                        <button
                                            onClick={() => handleSave(false)}
                                            disabled={saving}
                                            className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all text-sm disabled:opacity-60"
                                        >
                                            <i className="fa-solid fa-paper-plane mr-2"></i>
                                            {saving ? 'Saving…' : 'Publish'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Preview Modal ──────────────────────────────────────────── */}
            {isPreviewOpen && previewTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={() => setIsPreviewOpen(false)}></div>
                    <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden z-50 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-8 py-5 bg-indigo-600 text-white flex justify-between items-center">
                            <div>
                                <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Email Preview · Sample Data</p>
                                <h3 className="text-lg font-bold">{renderPreviewContent(previewTemplate.subject)}</h3>
                            </div>
                            <button onClick={() => setIsPreviewOpen(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors">
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-slate-50 dark:bg-slate-950">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 mx-auto max-w-2xl overflow-hidden">
                                <div
                                    className="p-8"
                                    dangerouslySetInnerHTML={{ __html: renderPreviewContent(previewTemplate.body) }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MailTemplatesView;
