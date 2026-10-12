import { DeskDigest, formatAge } from './digest';
import { SlackPayload } from './slackNotification';

/**
 * Formats the daily desk digest into a clean, human-readable Slack mrkdwn message
 * closely matching the NavGurukul Mail Template brand design.
 */
export const formatSlackDigest = (digest: DeskDigest, portalUrl?: string): string => {
  return formatSlackDigestPayload(digest, portalUrl).text;
};

/**
 * Formats the daily desk digest into a complete Slack payload with both mrkdwn and Block Kit blocks.
 */
export const formatSlackDigestPayload = (digest: DeskDigest, portalUrl?: string): SlackPayload => {
  const { totals } = digest;
  const lines: string[] = [];
  const basePortal = portalUrl ? portalUrl.replace(/\/+$/, '') : 'https://ng-travel-desk.vercel.app';
  const targetUrl = `${basePortal}/?tab=all-requests`;

  lines.push(`📊 *TRAVEL DESK · DAILY DIGEST*`);
  lines.push(`*Date:* ${digest.windowLabel} (IST)`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('*⚡ Today\'s Activity:*');
  lines.push(`• *Raised:* ${totals.raised}   • *Booked:* ${totals.booked}   • *Closed:* ${totals.closed}   • *Cancelled:* ${totals.cancelled}`);
  lines.push('');
  lines.push('*📈 Queue Status:*');
  lines.push(`• *Total Open:* ${totals.open}   • *Assigned:* ${totals.assigned}   • *Unassigned:* ${totals.unassigned}`);
  lines.push(`• *Stalled (>48h):* ${totals.stalled}   • *Oldest in Queue:* ${formatAge(totals.oldestOpenHours)}`);

  if (digest.byOwner && digest.byOwner.length > 0) {
    lines.push('');
    lines.push('*👤 Team Workload:*');
    const ownerItems = digest.byOwner.map(o => `*${o.owner}:* ${o.assigned} ticket${o.assigned === 1 ? '' : 's'}`).join('  |  ');
    lines.push(`• ${ownerItems}`);
  }

  if (digest.unassignedList && digest.unassignedList.length > 0) {
    lines.push('');
    lines.push(`*🚨 Action Required — Unassigned Tickets (${digest.unassignedList.length}):*`);
    const preview = digest.unassignedList.slice(0, 5).map(u => `\`${u.ticket}\` (${formatAge(u.ageHours)})`).join(' · ');
    const remaining = digest.unassignedList.length > 5 ? ` _(+${digest.unassignedList.length - 5} more)_` : '';
    lines.push(`• ${preview}${remaining}`);
  }

  if (digest.stalledList && digest.stalledList.length > 0) {
    lines.push('');
    lines.push(`*⏳ Stalled Tickets (${digest.stalledList.length}):*`);
    const preview = digest.stalledList.slice(0, 5).map(s => `\`${s.ticket}\` (${formatAge(s.ageHours)})`).join(' · ');
    const remaining = digest.stalledList.length > 5 ? ` _(+${digest.stalledList.length - 5} more)_` : '';
    lines.push(`• ${preview}${remaining}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`🔗 *Action:* <${targetUrl}|View All Requests →>`);
  lines.push('');
  lines.push(`_Navgurukul Travel Desk • Automated Report_`);

  const text = lines.join('\n');

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 Daily Desk Digest — ${digest.windowLabel} (IST)`,
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚡ Today:* *${totals.raised}* raised · *${totals.booked}* booked · *${totals.closed}* closed\n*📈 Queue:* *${totals.open}* open · *${totals.unassigned}* unassigned · *${totals.stalled}* stalled`
      }
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Raised Today:*\n${totals.raised}` },
        { type: 'mrkdwn', text: `*Booked Today:*\n${totals.booked}` },
        { type: 'mrkdwn', text: `*Total Open:*\n${totals.open}` },
        { type: 'mrkdwn', text: `*Unassigned:*\n${totals.unassigned}` },
        { type: 'mrkdwn', text: `*Stalled (>48h):*\n${totals.stalled}` },
        { type: 'mrkdwn', text: `*Oldest in Queue:*\n${formatAge(totals.oldestOpenHours)}` }
      ]
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View All Requests →',
            emoji: true
          },
          url: targetUrl,
          style: 'primary'
        }
      ]
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Navgurukul Travel Desk • Automated Report'
        }
      ]
    }
  ];

  return { text, blocks };
};
