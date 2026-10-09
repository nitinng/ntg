/**
 * Shared Supabase test double for the lifecycle email suites.
 *
 * Models the four tables the trigger engine touches - mail_templates,
 * email_routing_settings, profiles and email_queue - closely enough that the
 * engine's own query shapes are exercised rather than stubbed past.
 */

import { vi } from 'vitest';
import {
  TravelRequest,
  PNCStatus,
  TripType,
  TravelMode,
  Priority,
  ApprovalStatus
} from '../../types';

export interface TemplateRow {
  id?: string;
  template_key?: string;
  name?: string;
  subject?: string;
  body?: string;
  event: string;
  audience: string;
  context_key?: string | null;
  cc_rule?: string;
  is_active?: boolean;
  is_draft?: boolean;
  status?: string;
}

/** A published template for an (event, audience[, context]) trigger. */
export const template = (
  event: string,
  audience: string,
  overrides: Partial<TemplateRow> = {}
): TemplateRow => ({
  id: `tpl-${event}-${audience}-${overrides.context_key || 'default'}`,
  template_key: `${event.toLowerCase()}.${audience}.${overrides.context_key || 'default'}`,
  name: `${event} / ${audience}`,
  subject: `[${event}] {{submissionId}}`,
  body: `<p>Hi {{requester_name}}, {{origin}} to {{destination}}.</p>`,
  event,
  audience,
  context_key: null,
  cc_rule: 'default',
  is_active: true,
  is_draft: false,
  status: 'Published',
  ...overrides
});

export interface MockOptions {
  templates?: TemplateRow[];
  routingSettings?: { key: string; value: unknown }[];
  pncEmails?: string[];
  /** Rows returned by the ticket_status_history lookup used for resubmission context. */
  statusHistory?: { to_status: string; created_at: string }[];
  /** Makes email_queue.insert report a unique violation, as a duplicate would. */
  insertError?: { code?: string; message: string } | null;
}

export const DEFAULT_ROUTING_SETTINGS = [
  { key: 'default_cc', value: ['travel.team@navgurukul.org'] },
  { key: 'finance_cc', value: ['finance@navgurukul.org'] },
  { key: 'escalation_owners', value: ['escalation@navgurukul.org'] },
  { key: 'pnc_queue_cc', value: [] },
  { key: 'support_email', value: 'travel.team@navgurukul.org' },
  { key: 'portal_url', value: 'https://ng-travel-desk.vercel.app' },
  { key: 'info_reminder_first_hours', value: 24 },
  { key: 'info_reminder_final_hours', value: 72 },
  { key: 'info_escalation_days', value: 5 },
  { key: 'info_expiry_days', value: 7 },
  { key: 'reminders_enabled', value: true }
];

export const createSupabaseMock = (options: MockOptions = {}) => {
  const templates = options.templates ?? [];
  const routingSettings = options.routingSettings ?? DEFAULT_ROUTING_SETTINGS;
  const pncEmails = options.pncEmails ?? ['pnc1@navgurukul.org', 'admin1@navgurukul.org'];

  // Read lazily: a suite that varies the history between cases assigns to it after
  // the mock is built, so capturing the value here would freeze the first state.
  const statusHistory = () => options.statusHistory ?? [];

  /** Every role list passed to profiles.select().in('role', ...), in call order. */
  const profilesRoleFilters: string[][] = [];

  const insertMock = vi.fn().mockResolvedValue({ error: options.insertError ?? null });
  const invokeMock = vi.fn().mockResolvedValue({ data: null, error: null });

  const from = vi.fn((table: string) => {
    if (table === 'mail_templates') {
      // .select(...).eq('event', e).eq('audience', a)  -> awaited
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, event: string) => ({
            eq: vi.fn((_col2: string, audience: string) =>
              Promise.resolve({
                data: templates.filter(t => t.event === event && t.audience === audience),
                error: null
              })
            )
          }))
        }))
      };
    }

    if (table === 'email_routing_settings') {
      return {
        select: vi.fn(() => Promise.resolve({ data: routingSettings, error: null }))
      };
    }

    if (table === 'profiles') {
      return {
        select: vi.fn(() => ({
          // The role list is recorded rather than ignored: which roles count as
          // "the PNC desk" is exactly the kind of thing that silently drifts
          // (PNC Admin was missing here), so tests need to assert on it.
          in: vi.fn((_col: string, roles: string[]) => {
            profilesRoleFilters.push(roles);
            return Promise.resolve({ data: pncEmails.map(email => ({ email })), error: null });
          })
        }))
      };
    }

    if (table === 'ticket_status_history') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: statusHistory(), error: null }))
              }))
            }))
          }))
        }))
      };
    }

    if (table === 'email_queue') {
      return { insert: insertMock };
    }

    return {};
  });

  return {
    supabase: { from, functions: { invoke: invokeMock } },
    insertMock,
    invokeMock,
    from,
    profilesRoleFilters
  };
};

export const createMockRequest = (overrides?: Partial<TravelRequest>): TravelRequest => ({
  id: 'req-123',
  submissionId: 'TRV-5555',
  timestamp: '2026-09-01T10:00:00.000Z',
  requesterId: 'usr-1',
  requesterName: 'Priya Sharma',
  requesterEmail: 'priya@navgurukul.org',
  requesterPhone: '9876543210',
  emergencyContactName: 'Contact Person',
  emergencyContactPhone: '9876543211',
  emergencyContactRelation: 'Parent',
  bloodGroup: 'B+',
  purpose: 'Annual Conference',
  approvingManagerName: 'Manager Verma',
  approvingManagerEmail: 'verma@navgurukul.org',
  tripType: TripType.ONE_WAY,
  mode: TravelMode.FLIGHT,
  from: 'Delhi',
  to: 'Bangalore',
  dateOfTravel: '2026-09-25',
  numberOfTravelers: 1,
  priority: Priority.HIGH,
  approvalStatus: ApprovalStatus.PENDING,
  pncStatus: PNCStatus.APPROVAL_PENDING,
  hasViolation: true,
  timeline: [],
  ...overrides
});
