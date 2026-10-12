export interface SlackPayload {
  text: string;
  blocks?: any[];
}

/**
 * Formats a new travel request into a rich Slack message (mrkdwn + Block Kit),
 * styled to closely match the NavGurukul Mail Template design.
 */
export const formatSlackNewRequest = (
  request: {
    id?: string;
    submission_id?: string;
    requester_name?: string | null;
    requester_email?: string | null;
    requester_department?: string | null;
    requester_campus?: string | null;
    from_location?: string | null;
    to_location?: string | null;
    date_of_travel?: string | null;
    travel_mode?: string | null;
    trip_type?: string | null;
    number_of_travelers?: number | null;
    priority?: string | null;
    approving_manager_email?: string | null;
    pnc_status?: string | null;
  },
  portalUrl?: string
): SlackPayload => {
  const ticket = request.submission_id || (request.id ? request.id.slice(0, 8) : 'NEW');
  const status = request.pnc_status || 'Not Started';
  const trip = `${request.from_location || '?'} ➔ ${request.to_location || '?'}`;
  const date = request.date_of_travel
    ? new Date(request.date_of_travel).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Not specified';
  const who = request.requester_name || request.requester_email || 'Unknown';
  const dept = `${request.requester_department || 'General'}${request.requester_campus ? ` (${request.requester_campus})` : ''}`;
  const mode = `${request.travel_mode || 'Travel'}${request.trip_type ? ` · ${request.trip_type}` : ''}${
    (request.number_of_travelers || 1) > 1 ? ` (${request.number_of_travelers} travelers)` : ''
  }`;
  const priority = request.priority || 'Normal';
  const manager = request.approving_manager_email || 'None';
  const basePortal = portalUrl ? portalUrl.replace(/\/+$/, '') : 'https://ng-travel-desk.vercel.app';
  const targetUrl = `${basePortal}/?tab=requests`;

  const priorityEmoji =
    priority.toLowerCase() === 'high' ? '🔴 High' :
    priority.toLowerCase() === 'urgent' ? '🚨 Urgent' :
    `⚡ ${priority}`;

  // 1. Rich mrkdwn text (optimized for Slack Workflow Builder and mobile previews)
  const text = [
    `✈️ *TRAVEL DESK NOTIFICATION · NEW REQUEST*`,
    `*Request ID:* \`${ticket}\`  •  *Status:* 🟡 ${status}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `👤 *Traveler:* ${who}`,
    `🏢 *Dept / Campus:* ${dept}`,
    `🛫 *Trip Route:* ${trip}`,
    `📅 *Travel Date:* ${date}`,
    `🎫 *Mode & Type:* ${mode}`,
    `⚡ *Priority:* ${priorityEmoji}`,
    `👔 *Approving Manager:* ${manager}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `🔗 *Action:* <${targetUrl}|View in Travel Desk →>`,
    '',
    `_Navgurukul Travel Desk • Automated Notification_`
  ].join('\n');

  // 2. Block Kit blocks (for incoming webhooks supporting native interactive cards)
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `✈️ New Travel Request — ${ticket}`,
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Status:* 🟡 *${status}*   |   *Priority:* *${priorityEmoji}*`
      }
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*👤 Traveler:*\n${who}` },
        { type: 'mrkdwn', text: `*🏢 Dept / Campus:*\n${dept}` },
        { type: 'mrkdwn', text: `*🛫 Trip Route:*\n${trip}` },
        { type: 'mrkdwn', text: `*📅 Travel Date:*\n${date}` },
        { type: 'mrkdwn', text: `*🎫 Mode & Type:*\n${mode}` },
        { type: 'mrkdwn', text: `*👔 Approving Manager:*\n${manager}` }
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
            text: 'View in Travel Desk →',
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
          text: 'Navgurukul Travel Desk • Automated Notification'
        }
      ]
    }
  ];

  return { text, blocks };
};

/**
 * Formats a live test notification to verify Slack workflow webhook connectivity.
 */
export const formatSlackNotificationTest = (
  actorEmail: string,
  portalUrl?: string
): SlackPayload => {
  const basePortal = portalUrl ? portalUrl.replace(/\/+$/, '') : 'https://ng-travel-desk.vercel.app';
  const targetUrl = `${basePortal}/?tab=notifications`;

  const text = [
    `🔔 *TRAVEL DESK NOTIFICATION · LIVE WORKFLOW TEST*`,
    `*Status:* 🟢 Operational  •  *Channel:* #alert-team-automation`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `👤 *Triggered By:* ${actorEmail}`,
    `🕒 *Sent At:* ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' })} IST`,
    `📡 *Delivery Mode:* Slack Workflow Webhook`,
    `🎨 *Template Styling:* NavGurukul Brand Alignment Active`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `🔗 *Manage Settings:* <${targetUrl}|Notification Settings →>`,
    '',
    `_If you see this card in Slack, request traffic is wired up end-to-end._`
  ].join('\n');

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔔 Travel Desk Notification — Test Successful',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Status:* 🟢 *Operational*   |   *Delivery:* *Slack Workflow Webhook*`
      }
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*👤 Triggered By:*\n${actorEmail}` },
        { type: 'mrkdwn', text: `*🕒 Sent At:*\n${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' })} IST` },
        { type: 'mrkdwn', text: `*📡 Channel:*\n#alert-team-automation` },
        { type: 'mrkdwn', text: `*🎨 Design System:*\nMail Template Aligned` }
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
            text: 'Open Notification Settings →',
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
          text: 'Navgurukul Travel Desk • Automated Notification'
        }
      ]
    }
  ];

  return { text, blocks };
};
