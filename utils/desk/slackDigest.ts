import { DeskDigest, formatAge } from './digest';

/**
 * Formats the daily desk digest into a clean, human-readable Slack mrkdwn message.
 * Optimized for Slack incoming webhooks / workflow builder.
 */
export const formatSlackDigest = (digest: DeskDigest, portalUrl?: string): string => {
  const { totals } = digest;
  const lines: string[] = [];

  lines.push(`📊 *DAILY DESK DIGEST · ${digest.windowLabel} (IST)*`);
  lines.push('');
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

  const url = portalUrl ? portalUrl.replace(/\/+$/, '') : 'https://ng-travel-desk.vercel.app';
  lines.push('');
  lines.push(`🔗 *Open Desk:* <${url}/?tab=all-requests|View All Requests>`);

  return lines.join('\n');
};
