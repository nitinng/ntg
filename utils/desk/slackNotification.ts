export interface SlackPayload {
  text: string;
  blocks?: any[];
  attachments?: Array<{
    color: string;
    blocks: any[];
  }>;
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

  const modeLower = (request.travel_mode || '').toLowerCase();
  const modeIcon =
    modeLower.includes('train') || modeLower.includes('rail') ? '🚆' :
    modeLower.includes('bus') ? '🚌' :
    modeLower.includes('cab') || modeLower.includes('taxi') || modeLower.includes('car') ? '🚕' :
    '✈️';

  const routeIcon =
    modeLower.includes('train') ? '🚆' :
    modeLower.includes('bus') ? '🚌' :
    modeLower.includes('cab') ? '🚕' :
    '🛫';

  // Calculate dynamic urgency from days remaining as per policy thresholds
  // Critical: <2d, High: 2-10d, Medium/Normal: 10-20d, Low: >20d
  let daysRemaining: number | null = null;
  if (request.date_of_travel) {
    const travelDate = new Date(request.date_of_travel);
    if (!isNaN(travelDate.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      travelDate.setHours(0, 0, 0, 0);
      daysRemaining = Math.ceil((travelDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  const rawPriority =
    request.priority ||
    (daysRemaining !== null
      ? daysRemaining < 2 ? 'Urgent' : daysRemaining <= 10 ? 'High' : daysRemaining <= 20 ? 'Normal' : 'Low'
      : 'Normal');

  const prioLower = String(rawPriority).toLowerCase();

  let priorityEmoji = `⚡ ${rawPriority}`;
  if (prioLower === 'urgent' || prioLower === 'critical') {
    priorityEmoji = daysRemaining !== null
      ? `🚨 Urgent (${daysRemaining}d to travel · <2d policy)`
      : '🚨 Urgent';
  } else if (prioLower === 'high') {
    priorityEmoji = daysRemaining !== null
      ? `🔴 High (${daysRemaining}d to travel · 2-10d policy)`
      : '🔴 High';
  } else if (prioLower === 'medium' || prioLower === 'normal') {
    priorityEmoji = daysRemaining !== null
      ? `⚡ Normal (${daysRemaining}d to travel · 10-20d policy)`
      : '⚡ Normal';
  } else if (prioLower === 'low') {
    priorityEmoji = daysRemaining !== null
      ? `🟢 Low (${daysRemaining}d to travel · >20d policy)`
      : '🟢 Low';
  }

  const color =
    prioLower === 'urgent' || prioLower === 'critical' ? '#E24B4A' :
    prioLower === 'high' ? '#EF9F27' :
    prioLower === 'low' ? '#10B981' :
    '#176AE6';

  // 1. Rich mrkdwn text (optimized for Slack Workflow Builder and mobile previews)
  const text = [
    `${modeIcon} *TRAVEL DESK NOTIFICATION · NEW REQUEST*`,
    `*Request ID:* \`${ticket}\`  •  *Status:* 🟡 ${status}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `👤 *Traveler:* ${who}`,
    `🏢 *Dept / Campus:* ${dept}`,
    `${routeIcon} *Trip Route:* ${trip}`,
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
        text: `${modeIcon} New Travel Request — ${ticket}`,
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
        { type: 'mrkdwn', text: `*${routeIcon} Trip Route:*\n${trip}` },
        { type: 'mrkdwn', text: `*📅 Travel Date:*\n${date} · ${mode}` }
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
          text: `\`${ticket}\` · Navgurukul Travel Desk • Automated Notification`
        }
      ]
    }
  ];

  return {
    text,
    blocks,
    attachments: [
      {
        color,
        blocks
      }
    ]
  };
};

/**
 * Formats a status transition notification (e.g. Approved by Manager, Assigned to PNC, Booked).
 */
export const formatSlackStatusChange = (
  ticket: string,
  trip: string,
  newStatus: string,
  updatedBy: string,
  details?: {
    traveler?: string;
    date?: string;
    priority?: string;
    note?: string;
  },
  portalUrl?: string
): SlackPayload => {
  const basePortal = portalUrl ? portalUrl.replace(/\/+$/, '') : 'https://ng-travel-desk.vercel.app';
  const targetUrl = `${basePortal}/?tab=requests`;

  const isApproved = newStatus.toLowerCase().includes('approved');
  const isBooked = newStatus.toLowerCase().includes('booked');
  const isRejected = newStatus.toLowerCase().includes('reject');

  const color = isBooked ? '#10B981' : isApproved ? '#3B82F6' : isRejected ? '#E24B4A' : '#EF9F27';
  const icon = isBooked ? '🎫' : isApproved ? '✅' : isRejected ? '❌' : '🔄';

  const text = [
    `${icon} *TRAVEL DESK NOTIFICATION · STATUS UPDATE*`,
    `*Request ID:* \`${ticket}\`  •  *New Status:* *${newStatus}*`,
    `*Trip Route:* ${trip}`,
    `*Updated By:* ${updatedBy}`,
    details?.note ? `*Note:* ${details.note}` : '',
    '',
    `🔗 *Action:* <${targetUrl}|View in Travel Desk →>`
  ].filter(Boolean).join('\n');

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${icon} Request ${ticket} — ${newStatus}`,
        emoji: true
      }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Request ID*\n\`${ticket}\`` },
        { type: 'mrkdwn', text: `*Status*\n*${newStatus}*` },
        { type: 'mrkdwn', text: `*Trip Route*\n${trip}` },
        { type: 'mrkdwn', text: `*Updated By*\n${updatedBy}` }
      ]
    },
    ...(details?.note ? [{
      type: 'section',
      text: { type: 'mrkdwn', text: `>${details.note}` }
    }] : []),
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View in Travel Desk →', emoji: true },
          url: targetUrl,
          style: 'primary'
        }
      ]
    }
  ];

  return {
    text,
    blocks,
    attachments: [
      {
        color,
        blocks
      }
    ]
  };
};

/**
 * Returns a collapsed single-line card when a request is Booked or Closed.
 */
export const formatSlackRequestResolved = (
  ticket: string,
  trip: string,
  resolvedBy: string,
  statusLabel = 'Booked'
) => ({
  replace_original: true,
  attachments: [
    {
      color: '#10B981',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:white_check_mark: *${statusLabel}* — \`${ticket}\` (${trip})\n_Handled by ${resolvedBy} · Completed_`
          }
        }
      ]
    }
  ]
});

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
