/**
 * Parser for `version-and-changelog.md`.
 *
 * The markdown file in the repository root is the single source of truth for
 * release history. This module turns it into the structures the in-app
 * Version & Changelog view renders, so a release documented in the markdown
 * shows up in the UI without anyone hand-copying it into a TypeScript array.
 *
 * Expected shape of a release block:
 *
 *   ## [v2.6.0] - 2026-10-01
 *
 *   ### ✉️ Release Title
 *
 *   > **Badge** — One paragraph summary of the release.
 *
 *   #### ✨ Category Heading
 *   * Highlight item
 *     * Nested highlight item
 *
 *   #### 📝 Commits in this Release
 *   * `ab8bf34` — `fix(db): commit subject` — Author Name — 2026-09-30
 *
 * Everything after the commit message (author, date) is optional.
 */

export type ChangelogCommitType =
  | 'feat'
  | 'fix'
  | 'refactor'
  | 'style'
  | 'test'
  | 'merge'
  | 'docs'
  | 'chore';

export interface ChangelogCommit {
  hash: string;
  date: string;
  author?: string;
  message: string;
  type: ChangelogCommitType;
}

export interface ChangelogHighlight {
  category: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  badge: string;
  summary: string;
  highlights: ChangelogHighlight[];
  commits: ChangelogCommit[];
}

const RELEASE_HEADING = /^##\s+\[(v[^\]]+)\]\s*[-–—]\s*(\d{4}-\d{2}-\d{2})\s*$/;
const SUB_HEADING = /^(#{3,6})\s+(.+?)\s*$/;
const BULLET = /^(\s*)[*-]\s+(.+?)\s*$/;
const BLOCKQUOTE = /^>\s?(.*)$/;
const COMMITS_HEADING = /commits\s+in\s+this\s+release/i;
const COMMIT_LINE = /^`([0-9a-f]{6,40})`\s*[—–-]\s*`(.+?)`\s*(.*)$/;
const BADGED_SUMMARY = /^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONVENTIONAL_PREFIX = /^([a-z]+)(\([^)]*\))?!?:/i;

const TYPE_ALIASES: Record<string, ChangelogCommitType> = {
  feat: 'feat',
  feature: 'feat',
  fix: 'fix',
  hotfix: 'fix',
  bugfix: 'fix',
  refactor: 'refactor',
  style: 'style',
  test: 'test',
  tests: 'test',
  docs: 'docs',
  doc: 'docs',
  chore: 'chore',
  build: 'chore',
  ci: 'chore',
  perf: 'chore',
  revert: 'chore'
};

/** Strips the inline markdown the view renders as plain text. */
const toPlainText = (value: string): string =>
  value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export const inferCommitType = (message: string): ChangelogCommitType => {
  if (/^merge\b/i.test(message)) return 'merge';
  if (/^revert\b/i.test(message)) return 'chore';
  const match = message.match(CONVENTIONAL_PREFIX);
  if (match) {
    const alias = TYPE_ALIASES[match[1].toLowerCase()];
    if (alias) return alias;
  }
  return 'chore';
};

const parseCommitLine = (text: string, releaseDate: string): ChangelogCommit | null => {
  const match = text.match(COMMIT_LINE);
  if (!match) return null;

  const [, hash, rawMessage, trailing] = match;
  const message = rawMessage.trim();

  let author: string | undefined;
  let date = releaseDate;

  trailing
    .split(/[—–·|]|\s-\s/)
    .map(part => toPlainText(part))
    .filter(Boolean)
    .forEach(part => {
      if (ISO_DATE.test(part)) {
        date = part;
      } else if (!author) {
        author = part;
      }
    });

  return {
    hash: hash.slice(0, 7),
    date,
    author,
    message,
    type: inferCommitType(message)
  };
};

const splitIntoReleaseBlocks = (lines: string[]): { version: string; date: string; body: string[] }[] => {
  const blocks: { version: string; date: string; body: string[] }[] = [];

  lines.forEach(line => {
    const heading = line.match(RELEASE_HEADING);
    if (heading) {
      blocks.push({ version: heading[1].trim(), date: heading[2], body: [] });
      return;
    }
    if (blocks.length > 0) {
      blocks[blocks.length - 1].body.push(line);
    }
  });

  return blocks;
};

const parseReleaseBlock = (
  block: { version: string; date: string; body: string[] },
  index: number
): ChangelogRelease => {
  let title = '';
  let badge = '';
  let summary = '';

  const highlights: ChangelogHighlight[] = [];
  const commits: ChangelogCommit[] = [];

  let currentCategory = '';
  let inCommitsSection = false;
  let sawTitle = false;

  const pushItem = (item: string) => {
    const category = currentCategory || title || 'Release Notes';
    const existing = highlights.find(h => h.category === category);
    if (existing) {
      existing.items.push(item);
    } else {
      highlights.push({ category, items: [item] });
    }
  };

  block.body.forEach(rawLine => {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim() === '---') return;

    const heading = line.match(SUB_HEADING);
    if (heading) {
      const text = heading[2].trim();
      if (!sawTitle) {
        title = toPlainText(text);
        sawTitle = true;
        currentCategory = '';
        return;
      }
      inCommitsSection = COMMITS_HEADING.test(text);
      currentCategory = inCommitsSection ? '' : toPlainText(text);
      return;
    }

    const quote = line.match(BLOCKQUOTE);
    if (quote) {
      const text = quote[1].trim();
      if (!text) return;
      const badged = text.match(BADGED_SUMMARY);
      if (badged) {
        badge = badge || toPlainText(badged[1]);
        summary = summary ? `${summary} ${toPlainText(badged[2])}` : toPlainText(badged[2]);
      } else {
        summary = summary ? `${summary} ${toPlainText(text)}` : toPlainText(text);
      }
      return;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      const [, indent, content] = bullet;
      if (inCommitsSection) {
        const commit = parseCommitLine(content, block.date);
        if (commit) commits.push(commit);
        return;
      }
      const nested = indent.length >= 2;
      pushItem(nested ? `↳ ${toPlainText(content)}` : toPlainText(content));
      return;
    }

    // A plain paragraph directly under the release title acts as the summary.
    if (!summary && sawTitle && !currentCategory && !inCommitsSection) {
      summary = toPlainText(line);
    }
  });

  if (!summary) {
    summary = highlights[0]?.items.slice(0, 2).join(' ') ?? '';
  }

  return {
    version: block.version,
    date: block.date,
    title: title || block.version,
    badge: badge || (index === 0 ? 'Latest Release' : 'Release'),
    summary,
    highlights: highlights.filter(h => h.items.length > 0),
    commits
  };
};

/** Parses the changelog markdown into releases, newest first. */
export const parseChangelog = (markdown: string): ChangelogRelease[] => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  return splitIntoReleaseBlocks(lines).map(parseReleaseBlock);
};

export default parseChangelog;
