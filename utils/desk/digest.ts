/**
 * The desk digest: what the travel desk did today.
 *
 * The data is assembled by `public.build_desk_digest()` — one query pass over
 * requests, ownership and status history — and this module turns it into the
 * report that goes to the notifications channel as a PDF attachment.
 *
 * The shape below is the contract with that function. The Slack message itself
 * is built in SQL, next to the data, so there is exactly one place that writes
 * it; this file owns only the document.
 */

import { PdfDocument, buildPdfBase64 } from '../report/pdfBuilder';

export interface DigestTotals {
  raised: number;
  booked: number;
  closed: number;
  cancelled: number;
  open: number;
  assigned: number;
  unassigned: number;
  claimed: number;
  moved: number;
  stalled: number;
  oldestOpenHours: number;
}

export interface DigestRequestRow {
  ticket: string;
  status: string;
  requester: string;
  trip: string;
  travelDate?: string | null;
  priority?: string | null;
  owner?: string | null;
  ageHours?: number | null;
}

export interface DigestOwnerRow {
  owner: string;
  assigned: number;
  booked: number;
  open: number;
}

export interface DigestMovementRow {
  ticket: string;
  fromStatus?: string | null;
  toStatus: string;
  at: string;
  actor?: string | null;
}

export interface DeskDigest {
  generatedAt: string;
  windowLabel: string;
  windowFrom: string;
  windowTo: string;
  totals: DigestTotals;
  byStatus: Array<{ status: string; count: number }>;
  byOwner: DigestOwnerRow[];
  raisedList: DigestRequestRow[];
  unassignedList: DigestRequestRow[];
  stalledList: DigestRequestRow[];
  movementList: DigestMovementRow[];
}

/** "3d 4h" — short enough for a table column, exact enough to act on. */
export const formatAge = (hours?: number | null): string => {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  const whole = Math.max(0, Math.round(hours));
  if (whole < 24) return `${whole}h`;
  const days = Math.floor(whole / 24);
  const rest = whole % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
};

const shortTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  // IST, because every reader of this report is on it.
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const summaryLine = (totals: DigestTotals): string =>
  [
    `raised=${totals.raised}`,
    `booked=${totals.booked}`,
    `closed=${totals.closed}`,
    `cancelled=${totals.cancelled}`,
    `open=${totals.open}`,
    `assigned=${totals.assigned}`,
    `unassigned=${totals.unassigned}`,
    `claimed=${totals.claimed}`,
    `moved=${totals.moved}`,
    `stalled=${totals.stalled}`
  ].join('  ');

/**
 * Turns a digest into the printable report.
 *
 * Ordered by what someone acting on it needs first: the numbers, then the work
 * nobody owns, then the work that has stopped moving, then the detail.
 */
export const digestToPdfDocument = (digest: DeskDigest): PdfDocument => {
  const { totals } = digest;

  return {
    title: 'Travel Desk — Daily Report',
    subtitle: `${digest.windowLabel} (IST) · generated ${shortTime(digest.generatedAt)}`,
    footer: 'Navgurukul Travel Desk',
    sections: [
      {
        heading: 'Summary',
        paragraphs: [
          summaryLine(totals),
          `Oldest open request: ${formatAge(totals.oldestOpenHours)}.`,
          digest.byStatus.length
            ? `Open by status — ${digest.byStatus.map(s => `${s.status}=${s.count}`).join('  ')}`
            : 'No open requests.'
        ]
      },
      {
        heading: `Unassigned — nobody owns these (${digest.unassignedList.length})`,
        table: {
          columns: [
            { header: 'Ticket', width: 17 },
            { header: 'Status', width: 18 },
            { header: 'Requester', width: 24 },
            { header: 'Trip', width: 24 },
            { header: 'Age', width: 6 }
          ],
          rows: digest.unassignedList.map(r => [
            r.ticket,
            r.status,
            r.requester,
            r.trip,
            formatAge(r.ageHours)
          ]),
          emptyText: 'Every open request has an owner.'
        }
      },
      {
        heading: `Stalled — no movement (${digest.stalledList.length})`,
        table: {
          columns: [
            { header: 'Ticket', width: 17 },
            { header: 'Status', width: 18 },
            { header: 'Owner', width: 20 },
            { header: 'Requester', width: 20 },
            { header: 'Idle', width: 7 }
          ],
          rows: digest.stalledList.map(r => [
            r.ticket,
            r.status,
            r.owner || 'Unassigned',
            r.requester,
            formatAge(r.ageHours)
          ]),
          emptyText: 'Everything open has moved recently.'
        }
      },
      {
        heading: `Desk load by owner (${digest.byOwner.length})`,
        table: {
          columns: [
            { header: 'Owner', width: 30 },
            { header: 'Holding', width: 9 },
            { header: 'Open', width: 7 },
            { header: 'Booked', width: 8 }
          ],
          rows: digest.byOwner.map(o => [
            o.owner,
            String(o.assigned),
            String(o.open),
            String(o.booked)
          ]),
          emptyText: 'Nothing is assigned.'
        }
      },
      {
        heading: `Raised in this window (${digest.raisedList.length})`,
        table: {
          columns: [
            { header: 'Ticket', width: 17 },
            { header: 'Requester', width: 20 },
            { header: 'Trip', width: 22 },
            { header: 'Travel', width: 9 },
            { header: 'Pri', width: 6 },
            { header: 'Owner', width: 14 }
          ],
          rows: digest.raisedList.map(r => [
            r.ticket,
            r.requester,
            r.trip,
            r.travelDate || '—',
            r.priority || '—',
            r.owner || 'Unassigned'
          ]),
          emptyText: 'No new requests in this window.'
        }
      },
      {
        heading: `Movement in this window (${digest.movementList.length})`,
        table: {
          columns: [
            { header: 'Ticket', width: 17 },
            { header: 'From', width: 18 },
            { header: 'To', width: 18 },
            { header: 'When', width: 14 },
            { header: 'By', width: 14 }
          ],
          rows: digest.movementList.map(m => [
            m.ticket,
            m.fromStatus || '—',
            m.toStatus,
            shortTime(m.at),
            m.actor || '—'
          ]),
          emptyText: 'Nothing moved in this window.'
        }
      }
    ]
  };
};

/** The attachment the notifications channel receives. */
export const digestToPdfBase64 = (digest: DeskDigest): string =>
  buildPdfBase64(digestToPdfDocument(digest));

/** `travel-desk-report-2026-10-10.pdf` */
export const digestFileName = (digest: DeskDigest): string => {
  const day = (digest.windowTo || digest.generatedAt || '').slice(0, 10) || 'report';
  return `travel-desk-report-${day}.pdf`;
};
