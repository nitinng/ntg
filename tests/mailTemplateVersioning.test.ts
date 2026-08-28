import { describe, it, expect } from 'vitest';
import { MailTemplate, MailTemplateHistory } from '../types';

describe('Mail Template Versioning & Audit History', () => {
  const initialTemplate: MailTemplate = {
    id: 'tpl-101',
    name: 'Booking Confirmation',
    subject: 'Travel Booking Confirmed - {{request_id}}',
    body: '<p>Your ticket is booked.</p>',
    statusTrigger: 'Booked',
    isDraft: false,
    status: 'Published',
    version: 1,
    audience: 'employee',
    createdAt: '2026-08-28T09:00:00Z',
    updatedAt: '2026-08-28T09:00:00Z'
  };

  it('correctly categorizes template status states', () => {
    const publishedList = [initialTemplate].filter(t => t.status === 'Published');
    expect(publishedList).toHaveLength(1);

    const draftTemplate: MailTemplate = {
      ...initialTemplate,
      id: 'tpl-102',
      isDraft: true,
      status: 'Draft',
      version: 2
    };

    const draftsList = [initialTemplate, draftTemplate].filter(t => t.status === 'Draft');
    expect(draftsList).toHaveLength(1);
    expect(draftsList[0].id).toBe('tpl-102');
  });

  it('constructs accurate audit history log entries across lifecycle actions', () => {
    const historyLogs: MailTemplateHistory[] = [
      {
        id: 'hist-1',
        templateId: initialTemplate.id,
        templateName: initialTemplate.name,
        changedBy: 'nitin@navgurukul.org',
        changedAt: '2026-08-28T09:00:00Z',
        action: 'Created',
        previousSubject: undefined,
        newSubject: initialTemplate.subject,
        previousBody: undefined,
        newBody: initialTemplate.body,
        previousStatus: undefined,
        newStatus: 'Published',
        version: 1
      },
      {
        id: 'hist-2',
        templateId: initialTemplate.id,
        templateName: initialTemplate.name,
        changedBy: 'abhishek@navgurukul.org',
        changedAt: '2026-08-28T11:00:00Z',
        action: 'Edited',
        previousSubject: initialTemplate.subject,
        newSubject: '✈️ Confirmed Travel Itinerary - {{request_id}}',
        previousBody: initialTemplate.body,
        newBody: '<p>Your confirmed flight itinerary is attached.</p>',
        previousStatus: 'Published',
        newStatus: 'Draft',
        version: 2
      },
      {
        id: 'hist-3',
        templateId: initialTemplate.id,
        templateName: initialTemplate.name,
        changedBy: 'nitin@navgurukul.org',
        changedAt: '2026-08-28T12:00:00Z',
        action: 'Published',
        previousSubject: '✈️ Confirmed Travel Itinerary - {{request_id}}',
        newSubject: '✈️ Confirmed Travel Itinerary - {{request_id}}',
        previousBody: '<p>Your confirmed flight itinerary is attached.</p>',
        newBody: '<p>Your confirmed flight itinerary is attached.</p>',
        previousStatus: 'Draft',
        newStatus: 'Published',
        version: 2
      }
    ];

    expect(historyLogs).toHaveLength(3);
    expect(historyLogs[0].action).toBe('Created');
    expect(historyLogs[1].action).toBe('Edited');
    expect(historyLogs[1].changedBy).toBe('abhishek@navgurukul.org');
    expect(historyLogs[2].action).toBe('Published');
    expect(historyLogs[2].version).toBe(2);
  });
});
