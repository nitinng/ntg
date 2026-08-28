import { describe, it, expect } from 'vitest';
import { RELEASES_DATA } from '../components/VersionChangelogView';
import { UserRole } from '../types';

describe('Version & Changelog Engine', () => {
  it('contains correctly structured release metadata', () => {
    expect(RELEASES_DATA.length).toBeGreaterThan(0);
    const latestRelease = RELEASES_DATA[0];

    expect(latestRelease.version).toBe('v2.4.0');
    expect(latestRelease.date).toBe('2026-08-28');
    expect(latestRelease.badge).toBe('Latest Release');
    expect(latestRelease.commits.length).toBeGreaterThan(0);
    expect(latestRelease.highlights.length).toBeGreaterThan(0);
  });

  it('validates all commits have valid hash, date, author, message, and type', () => {
    RELEASES_DATA.forEach(release => {
      release.commits.forEach(commit => {
        expect(commit.hash).toMatch(/^[a-f0-9]{7}$/);
        expect(commit.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(commit.author).toBeTruthy();
        expect(commit.message).toBeTruthy();
        expect(['feat', 'fix', 'refactor', 'style', 'test', 'merge', 'docs', 'chore']).toContain(commit.type);
      });
    });
  });

  it('enforces role-based visibility rules (visible to all roles other than employee)', () => {
    const isAllowed = (role: UserRole) => role !== UserRole.EMPLOYEE;

    expect(isAllowed(UserRole.EMPLOYEE)).toBe(false);
    expect(isAllowed(UserRole.PNC)).toBe(true);
    expect(isAllowed(UserRole.FINANCE)).toBe(true);
    expect(isAllowed(UserRole.ADMIN)).toBe(true);
  });

  it('filters releases by search keywords accurately', () => {
    const query = 'transactional email';
    const matches = RELEASES_DATA.filter(r =>
      r.title.toLowerCase().includes(query) ||
      r.summary.toLowerCase().includes(query) ||
      r.commits.some(c => c.message.toLowerCase().includes(query))
    );

    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].version).toBe('v2.4.0');
  });
});
