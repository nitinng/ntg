import { describe, it, expect } from 'vitest';
import {
  formatSlackNewRequest,
  formatSlackNotificationTest,
  formatSlackStatusChange,
  formatSlackRequestResolved
} from '../utils/desk/slackNotification';
import { formatSlackDigestPayload } from '../utils/desk/slackDigest';
import { DeskDigest } from '../utils/desk/digest';

describe('formatSlackNewRequest', () => {
  it('formats a new request with brand structure, mrkdwn and Block Kit blocks', () => {
    const payload = formatSlackNewRequest({
      id: 'd1964147-36e3-4d6a-a2c6-3392472e3612',
      submission_id: 'TRV-O-261012-001',
      requester_name: 'Nitin Sudarshan',
      requester_department: 'CEO Office',
      requester_campus: 'Remote',
      from_location: 'Pune',
      to_location: 'Bengaluru',
      date_of_travel: '2026-10-14',
      travel_mode: 'Flight',
      trip_type: 'One-way',
      number_of_travelers: 1,
      priority: 'High',
      approving_manager_email: 'nitin.s@navgurukul.org',
      pnc_status: 'Not Started'
    }, 'https://ng-travel-desk.vercel.app');

    expect(payload.text).toContain('✈️ *TRAVEL DESK NOTIFICATION · NEW REQUEST*');
    expect(payload.text).toContain('TRV-O-261012-001');
    expect(payload.text).toContain('Pune ➔ Bengaluru');
    expect(payload.text).toContain('Nitin Sudarshan');
    expect(payload.text).toContain('CEO Office (Remote)');
    expect(payload.text).toContain('https://ng-travel-desk.vercel.app/?tab=requests');

    expect(payload.blocks).toBeDefined();
    expect(payload.blocks!.length).toBeGreaterThan(3);
    const header = payload.blocks!.find(b => b.type === 'header');
    expect(header.text.text).toContain('TRV-O-261012-001');
  });

  it('handles empty/null fields safely without throwing', () => {
    const payload = formatSlackNewRequest({});
    expect(payload.text).toContain('✈️ *TRAVEL DESK NOTIFICATION · NEW REQUEST*');
    expect(payload.text).toContain('Not Started');
    expect(payload.blocks).toBeDefined();
  });

  it('formats train and bus requests with matching mode icons and policy urgency', () => {
    const trainPayload = formatSlackNewRequest({
      submission_id: 'TRV-R-261014-002',
      travel_mode: 'Train',
      date_of_travel: '2026-10-20'
    });
    expect(trainPayload.text).toContain('🚆 *TRAVEL DESK NOTIFICATION · NEW REQUEST*');
    expect(trainPayload.text).toContain('🚆 *Trip Route:*');
    const trainHeader = trainPayload.blocks!.find(b => b.type === 'header');
    expect(trainHeader.text.text).toContain('🚆 New Travel Request');

    const busPayload = formatSlackNewRequest({
      submission_id: 'TRV-B-261014-005',
      travel_mode: 'Bus',
      date_of_travel: '2026-10-28'
    });
    expect(busPayload.text).toContain('🚌 *TRAVEL DESK NOTIFICATION · NEW REQUEST*');
    expect(busPayload.text).toContain('🚌 *Trip Route:*');
    const busHeader = busPayload.blocks!.find(b => b.type === 'header');
    expect(busHeader.text.text).toContain('🚌 New Travel Request');
  });
});

describe('formatSlackNotificationTest', () => {
  it('generates a clean test notification payload', () => {
    const payload = formatSlackNotificationTest('admin@navgurukul.org');
    expect(payload.text).toContain('LIVE WORKFLOW TEST');
    expect(payload.text).toContain('admin@navgurukul.org');
    expect(payload.blocks).toBeDefined();
  });
});

describe('formatSlackDigestPayload', () => {
  it('generates a rich digest payload with totals and action link', () => {
    const sampleDigest: DeskDigest = {
      generatedAt: '2026-10-12T14:00:00Z',
      windowLabel: '12 Oct 2026',
      windowFrom: '2026-10-11T14:00:00Z',
      windowTo: '2026-10-12T14:00:00Z',
      totals: {
        raised: 5,
        booked: 2,
        closed: 1,
        cancelled: 0,
        open: 10,
        assigned: 8,
        unassigned: 2,
        claimed: 1,
        moved: 4,
        stalled: 1,
        oldestOpenHours: 52
      },
      byStatus: [{ status: 'Approval Pending', count: 3 }],
      byOwner: [{ owner: 'Nitin Sudarshan', assigned: 8, booked: 2, open: 6 }],
      raisedList: [],
      unassignedList: [{ ticket: 'TRV-O-261012-001', status: 'Not Started', requester: 'Test', trip: 'A -> B', ageHours: 5 }],
      stalledList: [{ ticket: 'TRV-O-261010-001', status: 'Approval Pending', requester: 'Test', trip: 'A -> B', ageHours: 52 }],
      movementList: []
    };

    const payload = formatSlackDigestPayload(sampleDigest);
    expect(payload.text).toContain('TRAVEL DESK · DAILY DIGEST');
    expect(payload.text).toContain('• *Raised:* 5');
    expect(payload.text).toContain('• *Total Open:* 10');
    expect(payload.text).toContain('TRV-O-261012-001');
    expect(payload.blocks).toBeDefined();
  });
});

describe('formatSlackStatusChange and formatSlackRequestResolved', () => {
  it('formats status transition card with 4-field grid', () => {
    const payload = formatSlackStatusChange(
      'TRV-O-261012-001',
      'Pune ➔ Bengaluru',
      'Approved by Manager',
      'nitin.s@navgurukul.org',
      { note: 'Approved for budget cycle Q3' }
    );
    expect(payload.text).toContain('STATUS UPDATE');
    expect(payload.text).toContain('Approved by Manager');
    expect(payload.blocks).toBeDefined();
    expect(payload.attachments).toBeDefined();
    expect(payload.attachments![0].color).toBe('#3B82F6');
  });

  it('formats collapsed resolved card on booking', () => {
    const payload = formatSlackRequestResolved(
      'TRV-O-261012-001',
      'Pune ➔ Bengaluru',
      'PNC Team',
      'Booked'
    );
    expect(payload.replace_original).toBe(true);
    expect(payload.attachments[0].color).toBe('#10B981');
    expect(payload.attachments[0].blocks[0].text.text).toContain(':white_check_mark: *Booked*');
    expect(payload.attachments[0].blocks[0].text.text).toContain('TRV-O-261012-001');
  });
});
