import React, { useState, useEffect } from 'react';
import { User, MailTemplate, MailTemplateStatus, MailTemplateHistory, UserRole, PNCStatus, TravelRequest, Priority, TravelMode, TripType, ApprovalStatus, TravelEvent, EmailAudience } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import Input from './Input';
import TextArea from './TextArea';
import Select from './Select';
import fallbackMailTemplates from '../utils/fallbackMailTemplates.json';

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

const AUDIENCE_LABELS: Record<string, string> = {
  employee: 'Employee',
  manager: 'Manager',
  pnc: 'PNC',
  finance: 'Finance',
  escalation_owner: 'Escalation'
};

/**
 * Trigger events that carry a mail, grouped the way the triggers sheet groups them.
 * Events the sheet deliberately keeps silent are omitted - offering them in the
 * editor would invite someone to author copy that never sends.
 */
const MAILABLE_EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: TravelEvent.POLICY_VIOLATION_DETECTED, label: 'Policy violated - approval needed' },
  { value: TravelEvent.POLICY_EVALUATION_PASSED, label: 'Policy passed - straight to booking' },
  { value: TravelEvent.MANAGER_APPROVED, label: 'Manager approved' },
  { value: TravelEvent.MANAGER_REJECTED, label: 'Manager rejected' },
  { value: TravelEvent.EMPLOYEE_CANCELLED_PRE_APPROVAL, label: 'Employee withdrew before approval' },
  { value: TravelEvent.PNC_REJECTED, label: 'Travel desk cannot fulfil the request' },
  { value: TravelEvent.INFO_REQUESTED, label: 'Information requested - on hold' },
  { value: TravelEvent.INFO_PROVIDED, label: 'Employee responded - back in the queue' },
  { value: TravelEvent.INFO_REQUEST_REMINDER_24H, label: 'Reminder: information still needed' },
  { value: TravelEvent.INFO_REQUEST_REMINDER_72H, label: 'Final reminder before closure' },
  { value: TravelEvent.INFO_REQUEST_ESCALATED, label: 'Escalated - SLA breached' },
  { value: TravelEvent.INFO_REQUEST_EXPIRED, label: 'Closed - no response within SLA' },
  { value: TravelEvent.BOOKING_CONFIRMED, label: 'Booking confirmed' },
  { value: TravelEvent.BOOKING_UPDATED, label: 'Booking materially changed' },
  { value: TravelEvent.CANCELLATION_REQUESTED, label: 'Cancellation requested' },
  { value: TravelEvent.CANCELLATION_PROCESSED_EMPLOYEE, label: 'Cancellation completed' },
  { value: TravelEvent.PNC_CANCELLATION, label: 'Travel desk cancelled the booking' },
  { value: TravelEvent.PARTIAL_CANCELLATION, label: 'Part of the trip cancelled' },
  { value: TravelEvent.SEGMENT_REFUND_COMPLETED, label: 'Refund for a cancelled leg' },
  { value: TravelEvent.PARTIAL_REFUND_RECEIVED, label: 'Partial refund received' },
  { value: TravelEvent.REFUND_COMPLETED, label: 'Full refund received' },
  { value: TravelEvent.REFUND_WRITTEN_OFF, label: 'Amount written off' },
  { value: TravelEvent.REFUND_DISPUTED, label: 'Refund disputed - needs review' },
  { value: TravelEvent.REFUND_RECONCILIATION_COMPLETED, label: 'Settlement closed' },
  { value: TravelEvent.NO_REFUND_REQUIRED, label: 'Settled - nothing recoverable' },
  { value: TravelEvent.RETROACTIVE_BOOKING_RECORDED, label: 'Self-booked travel recorded' }
];

const CONTEXT_KEY_OPTIONS = [
  { value: '', label: 'Default - use whenever no variant matches' },
  { value: 'post_booking', label: 'Only after a ticket was issued' },
  { value: 'resubmit_after_manager_rejection', label: 'Only on resubmission after a manager rejection' },
  { value: 'resubmit_after_pnc_rejection', label: 'Only on resubmission after a travel desk rejection' },
  { value: 'after_partial_refund', label: 'Only when a partial refund already happened' },
  { value: 'after_write_off', label: 'Only when an amount was written off' }
];

const CC_RULE_OPTIONS = [
  { value: 'default', label: 'Default CC' },
  { value: 'default_finance', label: 'Default CC + Finance' },
  { value: 'default_manager', label: 'Default CC + Manager' },
  { value: 'default_manager_if_approved', label: 'Default CC + Manager, only if they approved it' },
  { value: 'manager', label: 'Manager only' },
  { value: 'none', label: 'No CC' }
];

export type TemplateCategory = 'all' | 'approvals' | 'holds' | 'fulfillment' | 'cancellations';

export interface CategoryConfig {
  id: TemplateCategory;
  label: string;
  icon: string;
  badgeClass: string;
  pillActiveClass: string;
}

export const TEMPLATE_CATEGORIES: CategoryConfig[] = [
  {
    id: 'all',
    label: 'All Templates',
    icon: 'fa-layer-group',
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    pillActiveClass: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm',
  },
  {
    id: 'approvals',
    label: 'Policy & Approvals',
    icon: 'fa-signature',
    badgeClass: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60',
    pillActiveClass: 'bg-blue-600 text-white shadow-sm',
  },
  {
    id: 'holds',
    label: 'Holds & Clarifications',
    icon: 'fa-circle-question',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
    pillActiveClass: 'bg-amber-600 text-white shadow-sm',
  },
  {
    id: 'fulfillment',
    label: 'Booking & Fulfillment',
    icon: 'fa-ticket',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
    pillActiveClass: 'bg-emerald-600 text-white shadow-sm',
  },
  {
    id: 'cancellations',
    label: 'Cancellations & Refunds',
    icon: 'fa-ban',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60',
    pillActiveClass: 'bg-rose-600 text-white shadow-sm',
  },
];

export const getTemplateCategory = (t: MailTemplate): Exclude<TemplateCategory, 'all'> => {
  const ev = (t.event || '').toLowerCase();
  const st = (t.statusTrigger || '').toLowerCase();
  const name = (t.name || '').toLowerCase();
  const key = (t.templateKey || '').toLowerCase();
  const combined = `${ev} ${st} ${name} ${key}`;

  if (
    combined.includes('cancel') ||
    combined.includes('refund') ||
    combined.includes('write_off') ||
    combined.includes('written_off') ||
    combined.includes('dispute') ||
    combined.includes('settlement')
  ) {
    return 'cancellations';
  }

  if (
    combined.includes('info_request') ||
    combined.includes('info_provid') ||
    combined.includes('clarification') ||
    combined.includes('hold') ||
    combined.includes('reminder') ||
    combined.includes('escalat') ||
    combined.includes('expired')
  ) {
    return 'holds';
  }

  if (
    combined.includes('book') ||
    combined.includes('ticket') ||
    combined.includes('flight') ||
    combined.includes('hotel') ||
    combined.includes('cab') ||
    combined.includes('retroactive')
  ) {
    return 'fulfillment';
  }

  return 'approvals';
};

type Tab = 'published' | 'drafts' | 'archived';

interface MailTemplatesViewProps {
  currentUserRole: UserRole;
  currentUser?: User | null;
}

export const MailTemplatesView: React.FC<MailTemplatesViewProps> = ({ currentUserRole, currentUser }) => {
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('published');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('all');
  const [selectedAudience, setSelectedAudience] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const [currentTemplate, setCurrentTemplate] = useState<Partial<MailTemplate>>({});
  const [editorMode, setEditorMode] = useState<'code' | 'preview'>('code');
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

      if (error) {
        console.warn('Error fetching remote templates, using local fallback:', error.message);
      }

      const sourceRows = (data && data.length > 0) ? data : (fallbackMailTemplates as any[]);

      const formatted: MailTemplate[] = sourceRows.map((t: any) => {
        let derivedStatus: MailTemplateStatus = 'Published';
        if (t.status === 'Archived') derivedStatus = 'Archived';
        else if (t.status === 'Draft' || t.is_draft) derivedStatus = 'Draft';

        let body = t.body || '';
        if (/<h1[^>]*>navgurukul/i.test(body)) {
          body = body.replace(
            /<h1[^>]*>navgurukul(?: travel desk)?<\/h1>/gi,
            '<img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />'
          );
        }

        return {
          id: t.id || t.template_key,
          name: t.name,
          subject: t.subject,
          body,
          statusTrigger: t.status_trigger,
          isDraft: derivedStatus === 'Draft',
          status: derivedStatus,
          version: t.version || 1,
          audience: t.audience || 'employee',
          createdAt: t.created_at || new Date().toISOString(),
          updatedAt: t.updated_at || new Date().toISOString(),

          // Trigger model from the Travel Desk triggers sheet. Templates created
          // before that migration have no event and fall back to status_trigger.
          templateKey: t.template_key || t.id,
          event: t.event || null,
          contextKey: t.context_key || null,
          fromStatus: t.from_status || null,
          toStatus: t.to_status || t.status_trigger || null,
          ccRule: t.cc_rule || 'default',
          isActive: t.is_active !== false,
          sheetRow: t.sheet_row || null,
          sheetSummary: t.sheet_summary || null,
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

  // Default starter body with the centered official brand logo and red divider
  const DEFAULT_STARTER_BODY = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
    <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
    <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
  </div>
  <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
  <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your email notification message goes here.</p>
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
    Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
  </div>
</div>`;

  // Open Edit/Create modal
  const openModal = (template?: MailTemplate) => {
    setEditorMode('code');
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
    body: DEFAULT_STARTER_BODY,
    statusTrigger: PNCStatus.NOT_STARTED,
    isDraft: false,
    status: 'Published',
    version: 1,
    audience: 'employee',
    event: TravelEvent.POLICY_EVALUATION_PASSED,
    contextKey: null,
    ccRule: 'default',
    isActive: true,
  });

  const clearLocalDraft = () => localStorage.removeItem(DRAFT_KEY);

  // Save (publish or save as draft)
  const handleSave = async (saveAsDraft: boolean) => {
    if (!currentTemplate.name) {
      toast.error('Template name is required');
      return;
    }
    if (!saveAsDraft && (!currentTemplate.subject || !currentTemplate.body || !currentTemplate.event)) {
      toast.error('Subject, body and trigger event are required before publishing');
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
        event: currentTemplate.event || null,
        context_key: currentTemplate.contextKey || null,
        cc_rule: currentTemplate.ccRule || 'default',
        is_active: currentTemplate.isActive !== false,
        // Stable key for the (event, audience, context) trigger. Templates seeded
        // from the sheet keep theirs; hand-authored ones get one on first save.
        template_key:
          currentTemplate.templateKey ||
          `${(currentTemplate.event || 'custom').toLowerCase()}.${currentTemplate.audience || 'employee'}.${currentTemplate.contextKey || 'default'}`,
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
    processed = processed.replace(
      /<h1[^>]*>navgurukul(?: travel desk)?<\/h1>/gi,
      '<img src="/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />'
    );
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
    processed = processed.replace(/\{\{portal_url\}\}/g, 'https://ng-travel-desk.vercel.app');
    processed = processed.replace(/https:\/\/ng-travel-desk\.vercel\.app\/navgurukul-brand-logo\.png/g, '/navgurukul-brand-logo.png');
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
  const TemplateCard: React.FC<{ template: MailTemplate }> = ({ template }) => {
    const cat = getTemplateCategory(template);
    const catConfig = TEMPLATE_CATEGORIES.find(c => c.id === cat) || TEMPLATE_CATEGORIES[1];

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:shadow-lg transition-all group flex flex-col h-full">
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Category badge */}
            <span
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1.5 ${catConfig.badgeClass}`}
            >
              <i className={`fa-solid ${catConfig.icon} text-[10px]`}></i>
              {catConfig.label}
            </span>

            {/* Audience badge */}
            <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider">
              {AUDIENCE_LABELS[template.audience] || template.audience || 'employee'}
            </span>

            {/* Trigger event badge */}
            <span
              className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md text-[11px] font-bold font-mono tracking-tight"
              title={template.event ? 'Trigger event' : 'Legacy stage trigger'}
            >
              {template.event || template.statusTrigger || 'No trigger'}
            </span>

            {template.contextKey && (
              <span
                className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider"
                title="Variant - used only in this situation, otherwise the default for this trigger is sent"
              >
                {template.contextKey.replace(/_/g, ' ')}
              </span>
            )}

            <span className="text-[11px] font-mono text-slate-400">
              v{template.version || 1}
            </span>
            {template.sheetRow && (
              <span className="text-[11px] font-mono text-slate-300 dark:text-slate-600" title="Row in the Travel Desk triggers sheet">
                #{template.sheetRow}
              </span>
            )}
          </div>
          <div className="flex gap-1 opacity-90 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button
              onClick={() => openPreview(template)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
              title="Preview Email"
            >
              <i className="fa-solid fa-eye text-xs"></i>
            </button>
            <button
              onClick={() => openHistory(template)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
              title="View Edit History"
            >
              <i className="fa-solid fa-clock-rotate-left text-xs"></i>
            </button>
            {canEdit && (
              <>
                {template.status === 'Draft' && (
                  <button
                    onClick={() => handlePublishDraft(template)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-600 transition-colors"
                    title="Publish Template"
                  >
                    <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                  </button>
                )}
                {template.status === 'Published' && (
                  <button
                    onClick={() => handleMoveToDraft(template)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-400 hover:text-amber-600 transition-colors"
                    title="Move to Draft"
                  >
                    <i className="fa-solid fa-file-pen text-xs"></i>
                  </button>
                )}
                {template.status !== 'Archived' ? (
                  <>
                    <button
                      onClick={() => openModal(template)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 transition-colors"
                      title="Edit Template"
                    >
                      <i className="fa-solid fa-pen text-xs"></i>
                    </button>
                    <button
                      onClick={() => handleArchive(template)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Archive Template"
                    >
                      <i className="fa-solid fa-box-archive text-xs"></i>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleRestore(template)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-400 hover:text-indigo-600 transition-colors"
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

        <div className="mt-auto pt-3 border-t dark:border-slate-800 flex justify-between items-center text-xs text-slate-400">
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
  };

  // Derive filtered template list based on active tab, category, audience, and search query
  const activeTabList = activeTab === 'published' ? published : activeTab === 'drafts' ? drafts : archived;

  const getCategoryCount = (catId: TemplateCategory) => {
    if (catId === 'all') return activeTabList.length;
    return activeTabList.filter(t => getTemplateCategory(t) === catId).length;
  };

  const filteredTemplates = activeTabList.filter(t => {
    if (selectedCategory !== 'all') {
      const cat = getTemplateCategory(t);
      if (cat !== selectedCategory) return false;
    }

    if (selectedAudience !== 'all' && t.audience !== selectedAudience) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (t.name || '').toLowerCase();
      const subject = (t.subject || '').toLowerCase();
      const ev = (t.event || '').toLowerCase();
      const key = (t.templateKey || '').toLowerCase();
      if (!name.includes(q) && !subject.includes(q) && !ev.includes(q) && !key.includes(q)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
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
          onClick={() => {
            setActiveTab('published');
            setSelectedCategory('all');
          }}
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
          onClick={() => {
            setActiveTab('drafts');
            setSelectedCategory('all');
          }}
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
          onClick={() => {
            setActiveTab('archived');
            setSelectedCategory('all');
          }}
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

      {/* Category Pills & Filters */}
      <div className="space-y-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Category selector pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {TEMPLATE_CATEGORIES.map(cat => {
            const count = getCategoryCount(cat.id);
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all ${
                  isActive
                    ? cat.pillActiveClass
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
                }`}
              >
                <i className={`fa-solid ${cat.icon} text-xs ${isActive ? '' : 'text-slate-400'}`}></i>
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 max-w-md">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              placeholder="Search by name, subject, or trigger event..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <i className="fa-solid fa-user-group text-slate-400"></i>
              <span className="font-medium hidden sm:inline">Audience:</span>
            </div>
            <select
              value={selectedAudience}
              onChange={e => setSelectedAudience(e.target.value)}
              className="text-xs py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            >
              <option value="all">All Audiences</option>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="pnc">PNC</option>
              <option value="finance">Finance</option>
              <option value="escalation_owner">Escalation</option>
            </select>

            {(selectedCategory !== 'all' || selectedAudience !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedAudience('all');
                  setSearchQuery('');
                }}
                className="text-xs text-rose-500 hover:text-rose-600 font-semibold px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors flex items-center gap-1"
                title="Reset filters"
              >
                <i className="fa-solid fa-rotate-left text-[10px]"></i>
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Grid (Strictly 2 cards per row on tablet/desktop) */}
      {loading ? (
        <div className="flex justify-center py-20">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-600"></i>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg p-12 text-center border border-slate-200 dark:border-slate-800">
          <i className="fa-solid fa-folder-open text-3xl text-slate-300 dark:text-slate-700 mb-3 block"></i>
          <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">
            {activeTabList.length === 0
              ? activeTab === 'published'
                ? 'No published templates found.'
                : activeTab === 'drafts'
                ? 'No drafts currently open.'
                : 'No archived templates.'
              : 'No templates match your filters.'}
          </p>
          {(selectedCategory !== 'all' || selectedAudience !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedAudience('all');
                setSearchQuery('');
              }}
              className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTemplates.map(t => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}

      {/* Edit / Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div
            className="relative w-[90vw] h-[90vh] max-w-[90vw] max-h-[90vh] bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-10 flex flex-col"
            style={{ width: '90vw', height: '90vh' }}
          >
            <header className="px-8 py-5 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 flex-shrink-0">
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
                      { value: 'finance', label: 'Finance' },
                      { value: 'escalation_owner', label: 'Escalation Owner' },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Select
                    label="Trigger Event"
                    value={currentTemplate.event || ''}
                    onChange={e => setCurrentTemplate({ ...currentTemplate, event: e.target.value as TravelEvent })}
                    options={MAILABLE_EVENT_OPTIONS}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    What happened, not where the request landed. Several stages are reached
                    by more than one event and need different wording.
                  </p>
                </div>

                <div>
                  <Select
                    label="Variant (optional)"
                    value={currentTemplate.contextKey || ''}
                    onChange={e =>
                      setCurrentTemplate({
                        ...currentTemplate,
                        contextKey: (e.target.value || null) as any
                      })
                    }
                    options={CONTEXT_KEY_OPTIONS}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Leave as default unless this wording is only correct in one situation.
                    The default is sent whenever no variant matches.
                  </p>
                </div>
              </div>

              <div>
                <Select
                  label="Who is copied"
                  value={currentTemplate.ccRule || 'default'}
                  onChange={e => setCurrentTemplate({ ...currentTemplate, ccRule: e.target.value as any })}
                  options={CC_RULE_OPTIONS}
                />
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  Actual addresses are configured under Email Routing, so they can be changed
                  without editing every template.
                </p>
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

              <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    HTML Email Body
                  </span>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setEditorMode('code')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        editorMode === 'code'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                    >
                      <i className="fa-solid fa-code mr-1.5 text-[11px]"></i>
                      Edit HTML
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode('preview')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        editorMode === 'preview'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                    >
                      <i className="fa-solid fa-eye mr-1.5 text-[11px]"></i>
                      Live Preview
                    </button>
                  </div>
                </div>

                {editorMode === 'code' ? (
                  <TextArea
                    label="HTML Source"
                    required
                    rows={12}
                    value={currentTemplate.body || ''}
                    onChange={e => setCurrentTemplate({ ...currentTemplate, body: e.target.value })}
                    placeholder="<p>Hi {{requester_name}},</p><p>Your travel has been confirmed.</p>"
                  />
                ) : (
                  <div className="p-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm prose dark:prose-invert max-w-none text-sm min-h-[260px] overflow-y-auto max-h-[400px]">
                    <div dangerouslySetInnerHTML={{ __html: renderPreviewContent(currentTemplate.body || '') }} />
                  </div>
                )}
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
          <div
            className="relative w-[90vw] h-[90vh] max-w-[90vw] max-h-[90vh] bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-10 flex flex-col"
            style={{ width: '90vw', height: '90vh' }}
          >
            <header className="px-8 py-5 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 flex-shrink-0">
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
          <div
            className="relative w-[90vw] h-[90vh] max-w-[90vw] max-h-[90vh] bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-10 flex flex-col"
            style={{ width: '90vw', height: '90vh' }}
          >
            <header className="px-8 py-5 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 flex-shrink-0">
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
