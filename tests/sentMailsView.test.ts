import { describe, it, expect } from 'vitest';
import { EmailQueueRecord } from '../components/SentMailsView';

describe('Sent Mails / Outgoing Delivery Logic', () => {
  const sampleQueue: EmailQueueRecord[] = [
    {
      id: 'msg-1',
      recipients: ['alice@navgurukul.org'],
      subject: 'Travel Request Approved - TRV-001',
      body: '<p>Your travel has been approved.</p>',
      status: 'Sent',
      created_at: '2026-08-28T10:00:00Z',
      sent_at: '2026-08-28T10:00:05Z',
      attempt_count: 1,
      provider: 'gmail',
      provider_message_id: 'g-msg-101'
    },
    {
      id: 'msg-2',
      recipients: ['bob@navgurukul.org'],
      subject: 'Approval Needed - TRV-002',
      body: '<p>Please approve travel.</p>',
      status: 'Pending',
      created_at: '2026-08-28T10:05:00Z',
      attempt_count: 0,
      provider: 'gmail'
    },
    {
      id: 'msg-3',
      recipients: ['carol@navgurukul.org'],
      subject: 'Ticket Booked - TRV-003',
      body: '<p>Your ticket is confirmed.</p>',
      status: 'Processing',
      created_at: '2026-08-28T10:08:00Z',
      attempt_count: 1,
      provider: 'gmail'
    },
    {
      id: 'msg-4',
      recipients: ['dave@navgurukul.org'],
      subject: 'Cancellation Notification - TRV-004',
      body: '<p>Travel cancelled.</p>',
      status: 'Failed',
      created_at: '2026-08-28T10:10:00Z',
      attempt_count: 5,
      last_error: 'Invalid recipient address',
      provider: 'gmail'
    }
  ];

  it('computes accurate aggregate delivery statistics', () => {
    const total = sampleQueue.length;
    const sent = sampleQueue.filter(e => e.status === 'Sent').length;
    const pending = sampleQueue.filter(e => e.status === 'Pending' || e.status === 'Processing').length;
    const failed = sampleQueue.filter(e => e.status === 'Failed').length;
    const successRate = total > 0 ? Math.round((sent / (total - pending || 1)) * 100) : 100;

    expect(total).toBe(4);
    expect(sent).toBe(1);
    expect(pending).toBe(2);
    expect(failed).toBe(1);
    expect(successRate).toBe(50); // 1 sent out of 2 completed (1 sent + 1 failed)
  });

  it('filters queue records by status correctly', () => {
    const sentOnly = sampleQueue.filter(e => e.status === 'Sent');
    expect(sentOnly).toHaveLength(1);
    expect(sentOnly[0].id).toBe('msg-1');

    const pendingOnly = sampleQueue.filter(e => e.status === 'Pending' || e.status === 'Processing');
    expect(pendingOnly).toHaveLength(2);

    const failedOnly = sampleQueue.filter(e => e.status === 'Failed');
    expect(failedOnly).toHaveLength(1);
    expect(failedOnly[0].last_error).toContain('Invalid recipient');
  });

  it('filters queue records by search query across recipients and subject', () => {
    const searchRecipient = sampleQueue.filter(e =>
      (e.recipients || []).some(r => r.includes('bob')) || e.subject.includes('bob')
    );
    expect(searchRecipient).toHaveLength(1);
    expect(searchRecipient[0].id).toBe('msg-2');

    const searchSubject = sampleQueue.filter(e =>
      e.subject.toLowerCase().includes('ticket booked')
    );
    expect(searchSubject).toHaveLength(1);
    expect(searchSubject[0].id).toBe('msg-3');
  });

  it('formats test email payload with user recipient placeholder correctly', () => {
    const template = '<div>Hello {{recipient}}, your test email is delivered.</div>';
    const recipient = 'nitin@navgurukul.org';
    const rendered = template.replace(/{{recipient}}/g, recipient);

    expect(rendered).toContain('Hello nitin@navgurukul.org, your test email is delivered.');
    expect(rendered).not.toContain('{{recipient}}');
  });
});
