/**
 * The daily report: the document the notifications channel receives.
 *
 * It is generated with a hand-written PDF writer, from two places that cannot
 * share a bundler, so the parts worth pinning are the ones that fail silently —
 * a table wider than the page, a cross-reference table that does not match the
 * objects, a character the font cannot render.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_TABLE_CHARS,
  buildPdfBase64,
  buildPdfRaw,
  fitCell,
  toWinAnsi,
  wrapText
} from '../utils/report/pdfBuilder';
import { DeskDigest, digestFileName, digestToPdfDocument, formatAge } from '../utils/desk/digest';

const digest: DeskDigest = {
  generatedAt: '2026-10-10T13:30:00Z',
  windowLabel: '10 Oct 2026',
  windowFrom: '2026-10-09T18:30:00Z',
  windowTo: '2026-10-10T13:30:00Z',
  totals: {
    raised: 12, booked: 7, closed: 5, cancelled: 1, open: 15,
    assigned: 10, unassigned: 5, claimed: 4, moved: 12, stalled: 3,
    oldestOpenHours: 168
  },
  byStatus: [{ status: 'Approval Pending', count: 5 }, { status: 'Processing', count: 4 }],
  byOwner: [{ owner: 'Asha Nair', assigned: 5, booked: 2, open: 3 }],
  raisedList: [{
    ticket: 'TRV-O-261010-001', status: 'Approval Pending', requester: 'Priya Sharma',
    trip: 'Pune -> Bengaluru', travelDate: '20 Oct', priority: 'High', owner: null
  }],
  unassignedList: [{
    ticket: 'TRV-O-261010-004', status: 'On Hold', requester: 'Priya Sharma',
    trip: 'Pune -> Delhi', ageHours: 168
  }],
  stalledList: [{
    ticket: 'TRV-O-261010-012', status: 'On Hold', requester: 'Priya Sharma',
    trip: 'Pune -> Delhi', owner: 'Ravi Kumar', ageHours: 144
  }],
  movementList: [{
    ticket: 'TRV-O-261010-003', fromStatus: 'Approved', toStatus: 'Processing',
    at: '2026-10-10T09:15:00Z', actor: 'Asha Nair'
  }]
};

describe('the report document', () => {
  const doc = digestToPdfDocument(digest);

  it('leads with the numbers, then the work nobody owns, then what has stopped moving', () => {
    const headings = doc.sections.map(s => s.heading);
    expect(headings[0]).toBe('Summary');
    expect(headings[1]).toContain('Unassigned');
    expect(headings[2]).toContain('Stalled');
    expect(headings.join(' ')).toContain('Raised in this window');
    expect(headings.join(' ')).toContain('Movement in this window');
  });

  it('keeps every table inside the page width', () => {
    for (const section of doc.sections) {
      if (!section.table) continue;
      const width =
        section.table.columns.reduce((sum, c) => sum + c.width, 0) +
        (section.table.columns.length - 1);
      expect(width, `${section.heading} overruns the page`).toBeLessThanOrEqual(MAX_TABLE_CHARS);
    }
  });

  it('gives ticket ids room for a full submission id', () => {
    for (const section of doc.sections) {
      const ticketColumn = section.table?.columns.find(c => c.header === 'Ticket');
      if (!ticketColumn) continue;
      expect(ticketColumn.width).toBeGreaterThanOrEqual('TRV-O-261010-001'.length);
    }
  });

  it('says so plainly when a section has nothing in it', () => {
    const empty = digestToPdfDocument({
      ...digest,
      unassignedList: [],
      stalledList: [],
      byOwner: [],
      raisedList: [],
      movementList: []
    });
    for (const section of empty.sections) {
      if (!section.table) continue;
      expect(section.table.emptyText, `${section.heading} has no empty state`).toBeTruthy();
    }
  });

  it('names the file after the day it covers', () => {
    expect(digestFileName(digest)).toBe('travel-desk-report-2026-10-10.pdf');
  });
});

describe('formatAge', () => {
  it('reads in hours below a day and in days above it', () => {
    expect(formatAge(5)).toBe('5h');
    expect(formatAge(23)).toBe('23h');
    expect(formatAge(24)).toBe('1d');
    expect(formatAge(30)).toBe('1d 6h');
    expect(formatAge(168)).toBe('7d');
  });

  it('does not invent an age it does not have', () => {
    expect(formatAge(null)).toBe('—');
    expect(formatAge(undefined)).toBe('—');
  });
});

describe('text fitting', () => {
  it('pads a cell to its column width so Courier columns line up', () => {
    expect(fitCell('abc', 6)).toBe('abc   ');
    expect(fitCell('abc', 3)).toBe('abc');
  });

  it('marks a truncated cell rather than cutting it off silently', () => {
    expect(fitCell('abcdefgh', 5)).toBe('abcd>');
  });

  it('wraps on words and breaks a word too long to fit', () => {
    expect(wrapText('one two three', 7)).toEqual(['one two', 'three']);
    expect(wrapText('supercalifragilistic', 8)).toEqual(['supercal', 'ifragili', 'stic']);
  });

  it('transliterates what the font cannot render instead of emitting broken bytes', () => {
    expect(toWinAnsi('Pune → Delhi')).toBe('Pune -> Delhi');
    expect(toWinAnsi('10 Oct · IST')).toBe('10 Oct - IST');
    expect(toWinAnsi('₹1,200')).toBe('INR 1,200');
    expect(toWinAnsi('naïve')).toBe('na?ve');
    expect(toWinAnsi('🚨 alert')).toContain('alert');
  });
});

describe('the PDF itself', () => {
  const raw = buildPdfRaw(digestToPdfDocument(digest));

  it('is a well-formed PDF file', () => {
    expect(raw.startsWith('%PDF-1.4')).toBe(true);
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(raw).toContain('/Type /Catalog');
    expect(raw).toContain('trailer');
  });

  it('points its cross-reference table at the real object offsets', () => {
    const startxref = Number(raw.slice(raw.lastIndexOf('startxref')).split('\n')[1]);
    expect(raw.slice(startxref, startxref + 4)).toBe('xref');

    const entries = raw
      .slice(startxref)
      .split('\n')
      .filter(line => /^\d{10} \d{5} n $/.test(line));

    // Every entry but the free head must land on its own "N 0 obj".
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(raw.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
  });

  it('escapes parentheses, which would otherwise end a string early', () => {
    const tricky = buildPdfRaw({
      title: 'Report (draft)',
      sections: [{ heading: 'A \\ B', paragraphs: ['one (two) three'] }]
    });
    expect(tricky).toContain('(Report \\(draft\\)) Tj');
    expect(tricky).toContain('one \\(two\\) three');
  });

  it('paginates rather than running off the bottom of the page', () => {
    const many = buildPdfRaw(
      digestToPdfDocument({
        ...digest,
        raisedList: Array.from({ length: 120 }, (_, i) => ({
          ...digest.raisedList[0],
          ticket: `TRV-O-261010-${String(i).padStart(3, '0')}`
        }))
      })
    );
    const count = Number(many.match(/\/Count (\d+)/)?.[1] ?? 0);
    expect(count).toBeGreaterThan(1);
    expect(many.match(/\/Type \/Page[^s]/g)?.length).toBe(count);
  });

  it('base64-encodes to something that decodes back to the same bytes', () => {
    const encoded = buildPdfBase64(digestToPdfDocument(digest));
    expect(Buffer.from(encoded, 'base64').toString('latin1')).toBe(raw);
  });
});
