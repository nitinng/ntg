/**
 * A small, dependency-free PDF writer.
 *
 * The desk digest has to arrive in Slack as a document somebody can open, read
 * and forward — not as a wall of text in a message. That means producing a real
 * PDF from two places that cannot share a bundler: the browser (an admin
 * downloading today's report) and the Deno queue worker (the scheduled send).
 *
 * Pulling a PDF library into both was the obvious option and the wrong one: the
 * worker runs on a cold start with no package manager, and a CDN import is one
 * more thing that can be down at 7pm. The report is text in tables, so the
 * subset of PDF needed to express it is small enough to write out directly.
 *
 * What this supports, deliberately and no more: Helvetica headings, Courier
 * tables (fixed width, so columns line up without measuring glyphs), automatic
 * pagination, and page footers. Everything is WinAnsi; anything outside it is
 * transliterated rather than silently mangled, because a report with a broken
 * glyph reads as a broken report.
 *
 * MIRRORED into supabase/functions/process-email-queue/index.ts — see the PDF
 * BUILDER block there. Any change here must be copied over.
 */

export interface PdfTable {
  columns: Array<{ header: string; width: number }>;
  rows: string[][];
  /** Shown in place of the table when there are no rows. */
  emptyText?: string;
}

export interface PdfSection {
  heading: string;
  /** Free text under the heading, before any table. */
  paragraphs?: string[];
  table?: PdfTable;
}

export interface PdfDocument {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  /** Printed at the foot of every page, with the page number. */
  footer?: string;
}

// US Letter at 72dpi, which every reader and printer handles without scaling.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const BODY_WIDTH = PAGE_WIDTH - MARGIN * 2;

const FONT_HELVETICA = 'F1';
const FONT_HELVETICA_BOLD = 'F2';
const FONT_COURIER = 'F3';

/** Courier is exactly 0.6em wide, which is what lets columns align by counting characters. */
const COURIER_RATIO = 0.6;
const BODY_SIZE = 9;
const CHARS_PER_LINE = Math.floor(BODY_WIDTH / (BODY_SIZE * COURIER_RATIO));

/**
 * The widest a table row may be before it runs past the right margin.
 *
 * Exported because a table's columns are chosen by the caller, and a caller
 * that overruns this produces a report with text falling off the page —
 * `tests/deskDigest.test.ts` checks the digest's tables against it.
 */
export const MAX_TABLE_CHARS = CHARS_PER_LINE;

/**
 * Reduces text to WinAnsi.
 *
 * The digest carries status names, emails and place names, plus whatever an
 * employee typed into a purpose field. Rather than emitting bytes the font
 * cannot render, the handful of characters that actually show up are mapped to
 * their ASCII equivalents and the rest becomes '?'.
 */
export const toWinAnsi = (value: string): string => {
  const replacements: Record<string, string> = {
    '—': '-', '–': '-', '‑': '-', '→': '->', '←': '<-',
    '“': '"', '”': '"', '‘': "'", '’': "'", '•': '*', '·': '-',
    '₹': 'INR ', '×': 'x', '…': '...', ' ': ' '
  };

  return Array.from(value ?? '')
    .map(char => {
      if (replacements[char] !== undefined) return replacements[char];
      const code = char.codePointAt(0) ?? 63;
      if (code === 9) return '    ';
      if (code < 32) return ' ';
      if (code <= 126) return char;
      return '?';
    })
    .join('');
};

/** Escapes the three characters that mean something inside a PDF string literal. */
const pdfString = (value: string): string =>
  toWinAnsi(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Pads or truncates to an exact character count, so Courier columns line up. */
export const fitCell = (value: string, width: number): string => {
  const text = toWinAnsi(value ?? '');
  if (width <= 0) return '';
  if (text.length === width) return text;
  if (text.length < width) return text + ' '.repeat(width - text.length);
  return width <= 1 ? text.slice(0, width) : text.slice(0, width - 1) + '>';
};

/** Greedy word wrap at a character count. Long words are broken rather than overflowing. */
export const wrapText = (value: string, width: number): string[] => {
  const words = toWinAnsi(value ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }

    while (current.length > width) {
      lines.push(current.slice(0, width));
      current = current.slice(width);
    }
  }

  if (current) lines.push(current);
  return lines;
};

interface TextOp {
  font: string;
  size: number;
  text: string;
  /** Points below the previous line. */
  gap: number;
}

/** Lays the document out into pages of positioned text. */
const layout = (doc: PdfDocument): TextOp[][] => {
  const pages: TextOp[][] = [];
  let page: TextOp[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  const bottomLimit = MARGIN + 24; // room for the footer

  const push = (op: TextOp) => {
    if (y - op.gap < bottomLimit) {
      pages.push(page);
      page = [];
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= op.gap;
    page.push({ ...op, gap: y });
  };

  push({ font: FONT_HELVETICA_BOLD, size: 16, text: doc.title, gap: 20 });
  if (doc.subtitle) {
    push({ font: FONT_HELVETICA, size: 10, text: doc.subtitle, gap: 16 });
  }

  for (const section of doc.sections) {
    push({ font: FONT_HELVETICA_BOLD, size: 11, text: section.heading, gap: 26 });

    for (const paragraph of section.paragraphs || []) {
      for (const line of wrapText(paragraph, CHARS_PER_LINE)) {
        push({ font: FONT_COURIER, size: BODY_SIZE, text: line, gap: 12 });
      }
    }

    if (section.table) {
      const { columns, rows, emptyText } = section.table;

      if (rows.length === 0) {
        push({
          font: FONT_COURIER,
          size: BODY_SIZE,
          text: emptyText || 'None.',
          gap: 14
        });
        continue;
      }

      const header = columns.map(c => fitCell(c.header.toUpperCase(), c.width)).join(' ');
      push({ font: FONT_COURIER, size: BODY_SIZE, text: header, gap: 14 });
      push({
        font: FONT_COURIER,
        size: BODY_SIZE,
        text: columns.map(c => '-'.repeat(c.width)).join(' '),
        gap: 11
      });

      for (const row of rows) {
        const line = columns.map((c, i) => fitCell(row[i] ?? '', c.width)).join(' ');
        push({ font: FONT_COURIER, size: BODY_SIZE, text: line, gap: 11 });
      }
    }
  }

  pages.push(page);
  return pages;
};

const contentStream = (ops: TextOp[], footer: string, pageNumber: number, pageCount: number): string => {
  const parts = ops.map(
    op => `BT /${op.font} ${op.size} Tf ${MARGIN} ${op.gap.toFixed(2)} Td (${pdfString(op.text)}) Tj ET`
  );

  const footerText = `${footer ? `${footer}  ` : ''}Page ${pageNumber} of ${pageCount}`;
  parts.push(
    `BT /${FONT_HELVETICA} 8 Tf ${MARGIN} ${MARGIN - 12} Td (${pdfString(footerText)}) Tj ET`
  );

  return parts.join('\n');
};

/**
 * Renders the document and returns the raw PDF as a latin1 string.
 *
 * Offsets in the cross-reference table are byte offsets, and every byte written
 * here is latin1, so string length and byte length are the same number — which
 * is the only reason this can be assembled as a string at all.
 */
export const buildPdfRaw = (doc: PdfDocument): string => {
  const pages = layout(doc);
  const pageCount = pages.length;

  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length; // 1-based object number
  };

  // 1 catalog, 2 page tree, 3-5 fonts: fixed so the page objects can reference them.
  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('PAGES_PLACEHOLDER');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');

  const pageObjectNumbers: number[] = [];

  pages.forEach((ops, index) => {
    const stream = contentStream(ops, doc.footer || '', index + 1, pageCount);
    const contentNumber = addObject(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
    const pageNumber = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /${FONT_HELVETICA} 3 0 R /${FONT_HELVETICA_BOLD} 4 0 R /${FONT_COURIER} 5 0 R >> >> ` +
        `/Contents ${contentNumber} 0 R >>`
    );
    pageObjectNumbers.push(pageNumber);
  });

  objects[1] =
    `<< /Type /Pages /Kids [${pageObjectNumbers.map(n => `${n} 0 R`).join(' ')}] /Count ${pageCount} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
};

/** Base64 of the rendered PDF, which is the form an email attachment takes. */
export const buildPdfBase64 = (doc: PdfDocument): string => {
  const raw = buildPdfRaw(doc);

  if (typeof btoa === 'function') {
    return btoa(raw);
  }

  // Node (tests, and any server-side render).
  return Buffer.from(raw, 'latin1').toString('base64');
};
