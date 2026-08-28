import React, { useState, useEffect } from 'react';
import { User, MailTemplate, MailTemplateStatus, MailTemplateHistory, UserRole, PNCStatus, TravelRequest, Priority, TravelMode, TripType, ApprovalStatus } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import Input from './Input';
import TextArea from './TextArea';
import Select from './Select';

const SAMPLE_REQUEST: TravelRequest = {
  id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  submissionId: 'TRV-O-260828-001',
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
  dateOfTravel: '2026-09-15',
  preferredDepartureWindow: 'Morning (6am - 12pm)',
  numberOfTravelers: 1,
  priority: Priority.HIGH,
  approvalStatus: ApprovalStatus.APPROVED,
  pncStatus: PNCStatus.APPROVED,
  ticketCost: 4500,
  vendorName: 'IndiGo',
  hasViolation: false,
  timeline: [],
  emergencyContactName: 'Ravi Sharma',
  emergencyContactPhone: '9876543211',
  emergencyContactRelation: 'Father',
  bloodGroup: 'B+',
};

const DYNAMIC_VARIABLES = [
  { tag: '{{request_id}}', label: 'Request ID' },
  { tag: '{{requester_name}}', label: 'Requester Name' },
  { tag: '{{requester_email}}', label: 'Requester Email' },
  { tag: '{{manager_name}}', label: 'Manager Name' },
  { tag: '{{origin}}', label: 'Origin' },
  { tag: '{{destination}}', label: 'Destination' },
  { tag: '{{departure_date}}', label: 'Departure Date' },
  { tag: '{{travel_mode}}', label: 'Travel Mode' },
  { tag: '{{estimated_cost}}', label: 'Cost' },
  { tag: '{{vendor_name}}', label: 'Vendor' },
  { tag: '{{purpose}}', label: 'Purpose' },
  { tag: '{{violation_reasons}}', label: 'Violation Reason' },
  { tag: '{{rejection_reason}}', label: 'Rejection Reason' },
  { tag: '{{information_requested}}', label: 'Info Requested' },
  { tag: '{{booking_reference}}', label: 'PNR / Booking Ref' },
  { tag: '{{cancellation_reason}}', label: 'Cancellation Reason' },
  { tag: '{{portal_url}}', label: 'Portal URL' },
];

const DRAFT_KEY = 'mail_template_draft';

type Tab = 'published' | 'drafts' | 'archived';

interface MailTemplatesViewProps {
  currentUserRole: UserRole;
  currentUser?: User | null;
}

export const MailTemplatesView: React.FC<MailTemplatesViewProps> = ({ currentUserRole, currentUser }) => {
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('published');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const [currentTemplate, setCurrentTemplate] = useState<Partial<MailTemplate>>({});
  const [previewTemplate, setPreviewTemplate] = useState<MailTemplate | null>(null);
  const [selectedHistoryTemplate, setSelectedHistoryTemplate] = useState<MailTemplate | null>(null);
  const [historyLogs, setHistoryLogs] = useState<MailTemplateHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = currentUserRole === UserRole.ADMIN;

  const published = templates.filter(t => t.status === 'Published' || (!t.isDraft && t.status !== 'Archived'));
  const drafts = templates.filter(t => t.status === 'Draft' || (t.isDraft && t.status !== 'Archived'));
  const archived = templates.filter(t => t.status === 'Archived');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('mail_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted: MailTemplate[] = (data || []).map((t: any) => {
        let derivedStatus: MailTemplateStatus = 'Published';
        if (t.status === 'Archived') derivedStatus = 'Archived';
        else if (t.status === 'Draft' || t.is_draft) derivedStatus = 'Draft';

        return {
          id: t.id,
          name: t.name,
          subject: t.subject,
          body: t.body,
          statusTrigger: t.status_trigger,
          isDraft: derivedStatus === 'Draft',
          status: derivedStatus,
          version: t.version || 1,
          audience: t.audience || 'employee',
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        };
      });
      setTemplates(formatted);
    } catch (err: any) {
      toast.error('Error fetching templates: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Record audit history log
  const recordHistory = async (
    templateId: string,
    templateName: string,
    action: MailTemplateHistory['action'],
    prevTemplate?: Partial<MailTemplate>,
    newTemplate?: Partial<MailTemplate>
  ) => {
    try {
      const actor = currentUser?.email || 'Admin';
      await supabase.from('mail_template_history').insert({
        template_id: templateId,
        template_name: templateName,
        changed_by: actor,
        changed_at: new Date().toISOString(),
        action,
        previous_subject: prevTemplate?.subject || null,
        new_subject: newTemplate?.subject || null,
        previous_body: prevTemplate?.body || null,
        new_body: newTemplate?.body || null,
        previous_status: prevTemplate?.status || (prevTemplate?.isDraft ? 'Draft' : 'Published'),
        new_status: newTemplate?.status || (newTemplate?.isDraft ? 'Draft' : 'Published'),
        version: newTemplate?.version || 1
      });
    } catch (err) {
      console.warn('Failed to record template history log:', err);
    }
  };

  // Open Edit/Create modal
  const openModal = (template?: MailTemplate) => {
    if (template) {
      setCurrentTemplate(template);
    } else {
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
    name: '',
    subject: '',
    body: '',
    statusTrigger: PNCStatus.NOT_STARTED,
    isDraft: false,
    status: 'Published',
    version: 1,
    audience: 'employee',
  });

  const clearLocalDraft = () => localStorage.removeItem(DRAFT_KEY);

  // Save (publish or save as draft)
  const handleSave = async (saveAsDraft: boolean) => {
    if (!currentTemplate.name) {
      toast.error('Template name is required');
      return;
    }
    if (!saveAsDraft && (!currentTemplate.subject || !currentTemplate.body || !currentTemplate.statusTrigger)) {
      toast.error('Please fill all fields before publishing');
      return;
    }

    setSaving(true);
    try {
      const targetStatus: MailTemplateStatus = saveAsDraft ? 'Draft' : 'Published';
      const prev = templates.find(t => t.id === currentTemplate.id);
      const newVersion = (prev?.version || 0) + 1;

      const payload: any = {
        name: currentTemplate.name,
        subject: currentTemplate.subject || '',
        body: currentTemplate.body || '',
        status_trigger: currentTemplate.statusTrigger || null,
        is_draft: saveAsDraft,
        status: targetStatus,
        version: newVersion,
        audience: currentTemplate.audience || 'employee',
        updated_at: new Date().toISOString(),
      };

      let savedId = currentTemplate.id;

      if (currentTemplate.id) {
        const { error } = await supabase
          .from('mail_templates')
          .update(payload)
          .eq('id', currentTemplate.id);
        if (error) throw error;

        await recordHistory(
          currentTemplate.id,
          currentTemplate.name,
          saveAsDraft ? 'Edited' : 'Published',
          prev,
          { ...currentTemplate, status: targetStatus, version: newVersion }
        );
        toast.success(saveAsDraft ? 'Saved as draft' : 'Template published');
      } else {
        const { data, error } = await supabase
          .from('mail_templates')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        savedId = data?.id;

        if (savedId) {
          await recordHistory(
            savedId,
            currentTemplate.name,
            'Created',
            undefined,
            { ...currentTemplate, status: targetStatus, version: 1 }
          );
        }
        toast.success(saveAsDraft ? 'Draft created' : 'Template published');
      }

      clearLocalDraft();
      setIsModalOpen(false);
      await fetchTemplates();
      setActiveTab(saveAsDraft ? 'drafts' : 'published');
    } catch (err: any) {
      toast.error('Error saving template: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Publish existing draft
  const handlePublishDraft = async (template: MailTemplate) => {
    if (!template.subject || !template.body || !template.statusTrigger) {
      openModal(template);
      toast.warning('Please fill all required fields before publishing');
      return;
    }
    setSaving(true);
    try {
      const newVersion = (template.version || 1) + 1;
      const { error } = await supabase
        .from('mail_templates')
        .update({
          is_draft: false,
          status: 'Published',
          version: newVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (error) throw error;

      await recordHistory(
        template.id,
        template.name,
        'Published',
        template,
        { ...template, status: 'Published', isDraft: false, version: newVersion }
      );

      toast.success(`"${template.name}" published successfully`);
      await fetchTemplates();
      setActiveTab('published');
    } catch (err: any) {
      toast.error('Publish failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Move Published to Draft
  const handleMoveToDraft = async (template: MailTemplate) => {
    if (!confirm(`Move "${template.name}" to Draft? It will not be used for automated emails until republished.`)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('mail_templates')
        .update({
          is_draft: true,
          status: 'Draft',
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (error) throw error;

      await recordHistory(
        template.id,
        template.name,
        'Moved to Draft',
        template,
        { ...template, status: 'Draft', isDraft: true }
      );

      toast.info(`"${template.name}" moved to drafts`);
      await fetchTemplates();
      setActiveTab('drafts');
    } catch (err: any) {
      toast.error('Failed to move to draft: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Archive template
  const handleArchive = async (template: MailTemplate) => {
    if (!confirm(`Archive "${template.name}"? It will be preserved for history but inactive.`)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('mail_templates')
        .update({
          is_draft: true,
          status: 'Archived',
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (error) throw error;

      await recordHistory(
        template.id,
        template.name,
        'Archived',
        template,
        { ...template, status: 'Archived', isDraft: true }
      );

      toast.info(`"${template.name}" archived`);
      await fetchTemplates();
      setActiveTab('archived');
    } catch (err: any) {
      toast.error('Failed to archive: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Restore archived template
  const handleRestore = async (template: MailTemplate) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('mail_templates')
        .update({
          is_draft: true,
          status: 'Draft',
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (error) throw error;

      await recordHistory(
        template.id,
        template.name,
        'Restored',
        template,
        { ...template, status: 'Draft', isDraft: true }
      );

      toast.success(`"${template.name}" restored to drafts`);
      await fetchTemplates();
      setActiveTab('drafts');
    } catch (err: any) {
      toast.error('Failed to restore: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Fetch & open history audit drawer
  const openHistory = async (template: MailTemplate) => {
    setSelectedHistoryTemplate(template);
    setIsHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('mail_template_history')
        .select('*')
        .eq('template_id', template.id)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      setHistoryLogs((data as any) || []);
    } catch (err: any) {
      toast.error('Failed to load history: ' + err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Preview renderer
  const openPreview = (template: MailTemplate) => {
    setPreviewTemplate(template);
    setIsPreviewOpen(true);
  };

  const renderPreviewContent = (content: string) => {
    if (!content) return '';
    let processed = content;
    processed = processed.replace(/\{\{request_id\}\}/g, SAMPLE_REQUEST.submissionId);
    processed = processed.replace(/\{\{submissionId\}\}/g, SAMPLE_REQUEST.submissionId);
    processed = processed.replace(/\{\{requester_name\}\}/g, SAMPLE_REQUEST.requesterName);
    processed = processed.replace(/\{\{requesterName\}\}/g, SAMPLE_REQUEST.requesterName);
    processed = processed.replace(/\{\{requester_email\}\}/g, SAMPLE_REQUEST.requesterEmail);
    processed = processed.replace(/\{\{manager_name\}\}/g, 'Rahul Verma');
    processed = processed.replace(/\{\{origin\}\}/g, SAMPLE_REQUEST.from);
    processed = processed.replace(/\{\{destination\}\}/g, SAMPLE_REQUEST.to);
    processed = processed.replace(/\{\{departure_date\}\}/g, SAMPLE_REQUEST.dateOfTravel);
    processed = processed.replace(/\{\{travel_mode\}\}/g, SAMPLE_REQUEST.mode);
    processed = processed.replace(/\{\{purpose\}\}/g, SAMPLE_REQUEST.purpose);
    processed = processed.replace(/\{\{estimated_cost\}\}/g, String(SAMPLE_REQUEST.ticketCost));
    processed = processed.replace(/\{\{vendor_name\}\}/g, SAMPLE_REQUEST.vendorName || 'IndiGo');
    processed = processed.replace(/\{\{booking_reference\}\}/g, 'IND-88219');
    processed = processed.replace(/\{\{portal_url\}\}/g, 'https://travel.navgurukul.org');
    return processed;
  };

  // Insert variable helper into editor body
  const insertVariable = (tag: string) => {
    setCurrentTemplate(prev => ({
      ...prev,
      body: (prev.body || '') + ` ${tag} `
    }));
  };

  // Card component
  const TemplateCard: React.FC<{ template: MailTemplate }> = ({ template }) => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 hover:shadow-lg transition-all group flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider font-mono">
            {template.statusTrigger || 'No trigger'}
          </span>
          <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider">
            {template.audience || 'employee'}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            v{template.version || 1}
          </span>
        </div>
        <div className="flex gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => openPreview(template)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
            title="Preview Email"
          >
            <i className="fa-solid fa-eye text-xs"></i>
          </button>
          <button
            onClick={() => openHistory(template)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
            title="View Edit History"
          >
            <i className="fa-solid fa-clock-rotate-left text-xs"></i>
          </button>
          {canEdit && (
            <>
              {template.status === 'Draft' && (
                <button
                  onClick={() => handlePublishDraft(template)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-600 transition-colors"
                  title="Publish Template"
                >
                  <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                </button>
              )}
              {template.status === 'Published' && (
                <button
                  onClick={() => handleMoveToDraft(template)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-400 hover:text-amber-600 transition-colors"
                  title="Move to Draft"
                >
                  <i className="fa-solid fa-file-pen text-xs"></i>
                </button>
              )}
              {template.status !== 'Archived' ? (
                <>
                  <button
                    onClick={() => openModal(template)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 transition-colors"
                    title="Edit Template"
                  >
                    <i className="fa-solid fa-pen text-xs"></i>
                  </button>
                  <button
                    onClick={() => handleArchive(template)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Archive Template"
                  >
                    <i className="fa-solid fa-box-archive text-xs"></i>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleRestore(template)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Restore to Drafts"
                >
                  <i className="fa-solid fa-rotate-left text-xs"></i>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">{template.name}</h3>
      {template.subject ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-1 font-mono">
          {template.subject}
        </p>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 italic">No subject defined</p>
      )}

      <div className="mt-auto pt-4 border-t dark:border-slate-800 flex justify-between items-center text-xs text-slate-400">
        <span>Updated {new Date(template.updatedAt || template.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <button
          onClick={() => openPreview(template)}
          className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold text-xs"
        >
          Preview →
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <i className="fa-solid fa-envelope-open-text text-indigo-600"></i>
            Mail Templates
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Author and publish automated lifecycle email templates with version tracking and audit history.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => openModal()}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/20 transition-all active:scale-95 hover:bg-indigo-700 self-start sm:self-auto flex items-center gap-2"
          >
            <i className="fa-solid fa-plus"></i> Create Template
          </button>
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-lg w-fit border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('published')}
          className={`px-5 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'published'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <i className="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
          Published ({published.length})
        </button>
        <button
          onClick={() => setActiveTab('drafts')}
          className={`px-5 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'drafts'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <i className="fa-solid fa-file-pen text-amber-500 text-xs"></i>
          Drafts ({drafts.length})
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`px-5 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'archived'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <i className="fa-solid fa-box-archive text-slate-400 text-xs"></i>
          Archived ({archived.length})
        </button>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-600"></i>
        </div>
      ) : activeTab === 'published' ? (
        published.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-lg p-12 text-center border border-slate-200 dark:border-slate-800">
            <p className="text-slate-400 font-bold text-sm">No published templates found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {published.map(t => <TemplateCard key={t.id} template={t} />)}
          </div>
        )
      ) : activeTab === 'drafts' ? (
        drafts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-lg p-12 text-center border border-slate-200 dark:border-slate-800">
            <p className="text-slate-400 font-bold text-sm">No drafts currently open.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {drafts.map(t => <TemplateCard key={t.id} template={t} />)}
          </div>
        )
      ) : (
        archived.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-lg p-12 text-center border border-slate-200 dark:border-slate-800">
            <p className="text-slate-400 font-bold text-sm">No archived templates.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {archived.map(t => <TemplateCard key={t.id} template={t} />)}
          </div>
        )
      )}

      {/* Edit / Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-10 flex flex-col max-h-[90vh]">
            <header className="px-8 py-5 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {currentTemplate.id ? `Edit: ${currentTemplate.name}` : 'Create New Mail Template'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Define automated email subject, HTML body, and lifecycle trigger.
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </header>

            <div className="p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Input
                    label="Template Name"
                    required
                    placeholder="e.g. Travel Booked Confirmation"
                    value={currentTemplate.name || ''}
                    onChange={e => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                  />
                </div>
                <div>
                  <Select
                    label="Audience"
                    value={currentTemplate.audience || 'employee'}
                    onChange={e => setCurrentTemplate({ ...currentTemplate, audience: e.target.value as any })}
                    options={[
                      { value: 'employee', label: 'Employee' },
                      { value: 'manager', label: 'Manager' },
                      { value: 'pnc', label: 'PNC Team' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <Select
                  label="Lifecycle Status Trigger"
                  value={currentTemplate.statusTrigger || PNCStatus.NOT_STARTED}
                  onChange={e => setCurrentTemplate({ ...currentTemplate, statusTrigger: e.target.value })}
                  options={[
                    { value: PNCStatus.NOT_STARTED, label: 'Not Started (Request Received / Resubmitted)' },
                    { value: PNCStatus.APPROVAL_PENDING, label: 'Approval Pending (Violation detected)' },
                    { value: PNCStatus.APPROVED, label: 'Approved (Manager approved)' },
                    { value: PNCStatus.REJECTED_BY_MANAGER, label: 'Rejected by Manager' },
                    { value: PNCStatus.PROCESSING, label: 'Processing (In PNC Queue)' },
                    { value: PNCStatus.ON_HOLD, label: 'On Hold (Clarification requested)' },
                    { value: PNCStatus.REJECTED_BY_PNC, label: 'Rejected by PNC' },
                    { value: PNCStatus.BOOKED, label: 'Booked (Ticket issued)' },
                    { value: PNCStatus.CANCELLED_BY_EMPLOYEE, label: 'Cancelled by Employee' },
                    { value: PNCStatus.CANCELLED_BY_PNC, label: 'Cancelled by PNC' },
                    { value: PNCStatus.CLOSED, label: 'Closed (Trip completed / Refund done)' },
                  ]}
                />
              </div>

              <div>
                <Input
                  label="Email Subject Line"
                  required
                  placeholder="e.g. Travel Confirmed - {{request_id}}"
                  value={currentTemplate.subject || ''}
                  onChange={e => setCurrentTemplate({ ...currentTemplate, subject: e.target.value })}
                />
              </div>

              {/* Dynamic Variable Chips */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 block">
                  Insert Dynamic Variable
                </label>
                <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  {DYNAMIC_VARIABLES.map(v => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => insertVariable(v.tag)}
                      className="px-2.5 py-1 bg-white dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 hover:text-indigo-600 rounded text-xs font-mono border border-slate-200 dark:border-slate-600 transition-all active:scale-95"
                      title={`Click to insert ${v.tag}`}
                    >
                      {v.tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <TextArea
                  label="HTML Email Body"
                  required
                  rows={10}
                  value={currentTemplate.body || ''}
                  onChange={e => setCurrentTemplate({ ...currentTemplate, body: e.target.value })}
                  placeholder="<p>Hi {{requester_name}},</p><p>Your travel has been confirmed.</p>"
                />
              </div>
            </div>

            <footer className="px-8 py-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 rounded-lg text-xs font-bold transition-all"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
                >
                  Publish Template
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* History / Audit Log Modal */}
      {isHistoryOpen && selectedHistoryTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)}></div>
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-10 flex flex-col max-h-[85vh]">
            <header className="px-8 py-5 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="fa-solid fa-clock-rotate-left text-indigo-500"></i>
                  Edit History: {selectedHistoryTemplate.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Audit trail of all edits, publications, and state changes.
                </p>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-slate-600">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </header>

            <div className="p-8 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              {historyLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-600"></i>
                </div>
              ) : historyLogs.length === 0 ? (
                <p className="text-slate-400 text-center py-8 italic text-sm">
                  No edit history recorded for this template yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {historyLogs.map(log => (
                    <div
                      key={log.id}
                      className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2 text-xs"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold px-2.5 py-0.5 rounded text-[11px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                          {log.action}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {new Date(log.changedAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 font-medium">
                        Modified by <strong className="text-slate-900 dark:text-white">{log.changedBy}</strong>
                      </p>
                      {log.newSubject && log.newSubject !== log.previousSubject && (
                        <div className="font-mono text-[11px] bg-white dark:bg-slate-900 p-2 rounded border dark:border-slate-700">
                          <span className="text-slate-400">Subject: </span>
                          <span className="text-slate-800 dark:text-slate-200">{log.newSubject}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <footer className="px-8 py-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end">
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="px-5 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {isPreviewOpen && previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setIsPreviewOpen(false)}></div>
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-10 flex flex-col max-h-[85vh]">
            <header className="px-8 py-5 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Preview: {previewTemplate.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Subject: {renderPreviewContent(previewTemplate.subject)}
                </p>
              </div>
              <button onClick={() => setIsPreviewOpen(false)} className="text-slate-400 hover:text-slate-600">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </header>

            <div className="p-8 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/50 dark:bg-slate-950/40">
              <div
                className="p-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm prose dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: renderPreviewContent(previewTemplate.body) }}
              />
            </div>

            <footer className="px-8 py-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default MailTemplatesView;
