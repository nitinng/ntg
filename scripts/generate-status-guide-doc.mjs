/**
 * Regenerates the status reference in EMPLOYEE_GUIDE.md from utils/statusGuide.ts.
 *
 * The in-app guide, the dashboard labels and this document all read the same
 * data. Hand-maintaining the Markdown copy would let it drift from what the app
 * actually shows, which is the problem this section exists to fix.
 *
 * Run: node scripts/generate-status-guide-doc.mjs
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'EMPLOYEE_GUIDE.md');
const START = '<!-- STATUS-GUIDE:START -->';
const END = '<!-- STATUS-GUIDE:END -->';

const bundled = await build({
  entryPoints: [path.join(ROOT, 'utils/statusGuide.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
  // types.ts is the only import, and it is types + enums only.
  external: []
});

const mod = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const { STATUS_GUIDE, STATUS_STAGES, statusesInStage } = mod;

const escape = (text) => String(text).replace(/\|/g, '\\|');

const lines = [
  START,
  '',
  'Every status a request can be in, grouped by where it sits in the journey. Most trips only pass through four or five of these.',
  '',
  '> **"Action Required" is not a separate status.** It is what we call **On Hold** when you look at it — the travel desk has asked you something and your booking is paused until you reply. If you see it, the request is waiting on you and nobody else.',
  ''
];

for (const stage of STATUS_STAGES) {
  const entries = statusesInStage(stage);
  if (entries.length === 0) continue;
  lines.push(`### ${stage}`, '');
  lines.push('| Status | What it means | Who acts next | What happens next | Do you need to do anything? |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');
  for (const entry of entries) {
    const name =
      entry.label === entry.status
        ? `**${entry.label}**`
        : `**${entry.label}**<br/><sub>(internally "${entry.status}")</sub>`;
    lines.push(
      `| ${escape(name)} | ${escape(entry.meaning)} | ${escape(entry.whoActsNext)} | ` +
        `${escape(entry.whatHappensNext)} | ${escape(entry.employeeAction ?? 'No.')} |`
    );
  }
  lines.push('');
}

lines.push(
  `_${Object.keys(STATUS_GUIDE).length} statuses in total. This table is generated from \`utils/statusGuide.ts\` — ` +
    'run `node scripts/generate-status-guide-doc.mjs` after changing it._',
  '',
  END
);

const doc = readFileSync(DOC, 'utf8');
const startIndex = doc.indexOf(START);
const endIndex = doc.indexOf(END);
if (startIndex === -1 || endIndex === -1) {
  throw new Error(`Markers ${START} / ${END} not found in EMPLOYEE_GUIDE.md`);
}

const next = doc.slice(0, startIndex) + lines.join('\n') + doc.slice(endIndex + END.length);
writeFileSync(DOC, next);
console.log(`Regenerated ${Object.keys(STATUS_GUIDE).length} statuses in EMPLOYEE_GUIDE.md`);
