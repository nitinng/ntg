import { describe, it, expect } from 'vitest';
import { parseChangelog, inferCommitType } from '../utils/changelog/parseChangelog';
import { APP_VERSION, CHANGELOG_MARKDOWN, RELEASES } from '../utils/changelog';

const FIXTURE = `# Changelog

## Quick Navigation
* [v9.1.0](#v910)

---

## [v9.1.0] - 2026-01-02

### 🚀 Shiny Release

> **Operations** — Something meaningful shipped.

#### ✨ Features
* **Grouped feature**:
  * Nested detail with \`code\`.
* Plain feature with a [link](https://example.com).

#### 📝 Commits in this Release
* \`abc1234\` — \`feat(scope): add the thing\` — Ada Lovelace — 2026-01-01
* \`def5678\` — \`fix: repair the thing\`

---

## [v9.0.0] - 2025-12-25

### 🎯 First Release

> Bare summary without a badge.

* Item directly under the title.

#### 📝 Commits in this Release
* \`0000abc\` — \`Merge pull request #1 from someone/branch\`
`;

describe('parseChangelog', () => {
  const releases = parseChangelog(FIXTURE);

  it('parses every release block, newest first', () => {
    expect(releases.map(r => r.version)).toEqual(['v9.1.0', 'v9.0.0']);
    expect(releases[0].date).toBe('2026-01-02');
    expect(releases[0].title).toBe('🚀 Shiny Release');
  });

  it('reads badge and summary from the blockquote', () => {
    expect(releases[0].badge).toBe('Operations');
    expect(releases[0].summary).toBe('Something meaningful shipped.');
    expect(releases[1].badge).toBe('Release');
    expect(releases[1].summary).toBe('Bare summary without a badge.');
  });

  it('groups highlights under their heading and flattens nested bullets', () => {
    expect(releases[0].highlights).toEqual([
      {
        category: '✨ Features',
        items: [
          'Grouped feature:',
          '↳ Nested detail with code.',
          'Plain feature with a link.'
        ]
      }
    ]);
  });

  it('falls back to the release title when bullets have no sub-heading', () => {
    expect(releases[1].highlights).toEqual([
      { category: '🎯 First Release', items: ['Item directly under the title.'] }
    ]);
  });

  it('parses commits with optional author and date', () => {
    expect(releases[0].commits).toEqual([
      {
        hash: 'abc1234',
        date: '2026-01-01',
        author: 'Ada Lovelace',
        message: 'feat(scope): add the thing',
        type: 'feat'
      },
      {
        hash: 'def5678',
        date: '2026-01-02',
        author: undefined,
        message: 'fix: repair the thing',
        type: 'fix'
      }
    ]);
  });

  it('does not treat the commits heading as a highlight category', () => {
    releases.forEach(release => {
      expect(release.highlights.some(h => /commits/i.test(h.category))).toBe(false);
    });
  });

  it('infers commit types from conventional prefixes', () => {
    expect(inferCommitType('feat(email): add router')).toBe('feat');
    expect(inferCommitType('fix: thing')).toBe('fix');
    expect(inferCommitType('docs(changelog): write notes')).toBe('docs');
    expect(inferCommitType('style(theme): repaint')).toBe('style');
    expect(inferCommitType('refactor: split module')).toBe('refactor');
    expect(inferCommitType('test: cover parser')).toBe('test');
    expect(inferCommitType('ci: bump runner')).toBe('chore');
    expect(inferCommitType('Merge pull request #7 from x/y')).toBe('merge');
    expect(inferCommitType('something unconventional')).toBe('chore');
  });
});

describe('changelog bundled from version-and-changelog.md', () => {
  it('loads the repository markdown file', () => {
    expect(CHANGELOG_MARKDOWN).toContain('# Navgurukul Travel Desk — Version & Changelog');
  });

  it('exposes the newest documented release as the app version', () => {
    expect(APP_VERSION).toBe(RELEASES[0].version);
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('gives every documented release a title, summary, highlights and commits', () => {
    expect(RELEASES.length).toBeGreaterThanOrEqual(9);
    RELEASES.forEach(release => {
      expect(release.title, release.version).toBeTruthy();
      expect(release.summary, release.version).toBeTruthy();
      expect(release.highlights.length, release.version).toBeGreaterThan(0);
      expect(release.commits.length, `${release.version} commits`).toBeGreaterThanOrEqual(0);
    });
  });
});
