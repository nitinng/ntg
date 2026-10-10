/**
 * The queue worker deploys as one self-contained file — tsconfig.json excludes
 * supabase/functions from the app build — so the PDF builder and the digest
 * mapping are mirrored into it, the way the slot router already is.
 *
 * Mirrored code rots the moment someone edits one copy. This compares the two
 * directly: imports and export keywords aside, the block inside the worker must
 * be the source files, character for character.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '..');

const SOURCES = ['utils/report/pdfBuilder.ts', 'utils/desk/digest.ts'];
const WORKER = 'supabase/functions/process-email-queue/index.ts';
const START = '// ===== MIRRORED REPORT BUILDER (start) =====';
const END = '// ===== MIRRORED REPORT BUILDER (end) =====';

/** Drops imports and export keywords, which are the only legitimate differences. */
const normalize = (source: string): string =>
  source
    .split('\n')
    .filter(line => !/^\s*import\s/.test(line))
    .join('\n')
    .replace(/^export const /gm, 'const ')
    .replace(/^export interface /gm, 'interface ')
    .replace(/^export type /gm, 'type ')
    .trim();

describe('the report builder mirrored into the queue worker', () => {
  const worker = readFileSync(resolve(root, WORKER), 'utf8');

  it('is present and delimited', () => {
    expect(worker).toContain(START);
    expect(worker).toContain(END);
  });

  it('matches the source files exactly', () => {
    const block = worker.slice(worker.indexOf(START), worker.indexOf(END));
    const expected = SOURCES.map(file => normalize(readFileSync(resolve(root, file), 'utf8')));

    for (const [index, source] of expected.entries()) {
      expect(
        block.includes(source),
        `${SOURCES[index]} has drifted from the copy in ${WORKER}. ` +
          'Re-mirror the source files into the MIRRORED REPORT BUILDER block.'
      ).toBe(true);
    }
  });

  it('is the only copy the worker uses — nothing imports the originals from there', () => {
    expect(worker).not.toContain("from '../../../utils/");
  });
});
