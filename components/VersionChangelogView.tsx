import React, { useState, useMemo } from 'react';
import { User, UserRole } from '../types';
import Card from './Card';
import { toast } from 'sonner';
import { PageBanner } from './PageBanner';
import { CHANGELOG_MARKDOWN, RELEASES } from '../utils/changelog';
import type { ChangelogCommit, ChangelogRelease } from '../utils/changelog';

export type { ChangelogCommit, ChangelogRelease };

/**
 * Release history rendered by this view.
 *
 * Parsed at build time from `version-and-changelog.md` in the repository root,
 * which is the single source of truth for the changelog: document a release
 * there and it shows up here (and in the Settings footer) with no code change.
 */
export const RELEASES_DATA: ChangelogRelease[] = RELEASES;

interface VersionChangelogViewProps {
  currentUser?: User | null;
}

export const VersionChangelogView: React.FC<VersionChangelogViewProps> = ({ currentUser }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'interactive' | 'markdown'>('interactive');
  const [expandedReleases, setExpandedReleases] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(RELEASES.slice(0, 3).map(release => [release.version, true]))
  );

  const releases = RELEASES_DATA;

  const latestVersion = releases[0]?.version ?? 'v0.0.0';
  const earliestVersion = releases[releases.length - 1]?.version ?? latestVersion;

  // Guard: Not accessible for Employee role
  if (currentUser?.role === UserRole.EMPLOYEE) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 mx-auto flex items-center justify-center text-2xl mb-4">
          <i className="fa-solid fa-lock"></i>
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white">Restricted Access</h3>
        <p className="text-xs text-slate-400 mt-1">This section is available exclusively to Operations, Finance, and Administrators.</p>
      </div>
    );
  }

  const toggleExpand = (version: string) => {
    setExpandedReleases(prev => ({
      ...prev,
      [version]: !prev[version]
    }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard!`);
  };

  const filteredReleases = useMemo(() => {
    return releases.filter(release => {
      const matchesVersion = selectedVersion === 'all' || release.version === selectedVersion;
      const query = searchQuery.toLowerCase().trim();
      if (!query) return matchesVersion;

      const matchesTitle = release.title.toLowerCase().includes(query);
      const matchesSummary = release.summary.toLowerCase().includes(query);
      const matchesVersionStr = release.version.toLowerCase().includes(query);
      const matchesCommits = release.commits.some(c =>
        c.message.toLowerCase().includes(query) ||
        c.hash.toLowerCase().includes(query) ||
        c.author.toLowerCase().includes(query)
      );

      return matchesVersion && (matchesTitle || matchesSummary || matchesVersionStr || matchesCommits);
    });
  }, [releases, searchQuery, selectedVersion]);

  const totalCommitsCount = useMemo(() => {
    return releases.reduce((acc, r) => acc + r.commits.length, 0);
  }, [releases]);

  const getTypeBadge = (type: ChangelogCommit['type']) => {
    switch (type) {
      case 'feat':
        return <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase">feat</span>;
      case 'fix':
        return <span className="bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase">fix</span>;
      case 'refactor':
        return <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase">refactor</span>;
      case 'style':
        return <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase">style</span>;
      case 'test':
        return <span className="bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase">test</span>;
      default:
        return <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase">{type}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-6xl mx-auto">
      <PageBanner
        title="Version & Changelog"
        description="System release history, architectural milestones, and commit tracking for Navgurukul Travel Desk."
        icon="fa-code-branch"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white/10 backdrop-blur-sm p-1 rounded-lg border border-white/20">
            <button
              onClick={() => setViewMode('interactive')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                viewMode === 'interactive'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-layer-group"></i> Release View
            </button>
            <button
              onClick={() => setViewMode('markdown')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                viewMode === 'markdown'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <i className="fa-brands fa-markdown"></i> Markdown Source
            </button>
          </div>
        </div>
      </PageBanner>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Version</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">{latestVersion}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl">
              <i className="fa-solid fa-tag"></i>
            </div>
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Production Stable
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Releases</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{releases.length} Versions</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
              <i className="fa-solid fa-boxes-packing"></i>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">From {earliestVersion} to current release</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Tracked Commits</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalCommitsCount}+ Commits</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl">
              <i className="fa-solid fa-code-commit"></i>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Main branch deployment history</p>
        </Card>
      </div>

      {viewMode === 'interactive' ? (
        <>
          {/* Controls & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input
                type="text"
                placeholder="Search changelog by commit, version, or feature..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Release:</span>
              <select
                value={selectedVersion}
                onChange={e => setSelectedVersion(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 focus:border-indigo-500 outline-none"
              >
                <option value="all">All Releases ({releases.length})</option>
                {releases.map(r => (
                  <option key={r.version} value={r.version}>
                    {r.version} ({r.date})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Release Timeline Cards */}
          <div className="space-y-6">
            {filteredReleases.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-800">
                <i className="fa-solid fa-magnifying-glass text-3xl text-slate-300 mb-3"></i>
                <p className="text-slate-500 font-bold text-sm">No release notes or commits matching "{searchQuery}"</p>
                <button
                  onClick={() => { setSearchQuery(''); setSelectedVersion('all'); }}
                  className="mt-3 text-xs text-indigo-600 font-bold hover:underline"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              filteredReleases.map(release => {
                const isExpanded = expandedReleases[release.version] ?? true;
                return (
                  <Card key={release.version} className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                    {/* Release Header */}
                    <div
                      onClick={() => toggleExpand(release.version)}
                      className="p-6 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/70 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-base px-3 py-1 rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
                          {release.version}
                        </span>
                        <div>
                          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                            {release.title}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Released on {new Date(release.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-auto" onClick={e => e.stopPropagation()}>
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                          {release.commits.length} commits
                        </span>
                        <button
                          onClick={() => copyToClipboard(release.version, 'version tag')}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Copy Version Tag"
                        >
                          <i className="fa-solid fa-copy text-xs"></i>
                        </button>
                        <button
                          onClick={() => toggleExpand(release.version)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs`}></i>
                        </button>
                      </div>
                    </div>

                    {/* Release Content */}
                    {isExpanded && (
                      <div className="p-6 space-y-6">
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                          {release.summary}
                        </p>

                        {/* Highlights */}
                        <div className="space-y-4">
                          {release.highlights.map(h => (
                            <div key={h.category} className="space-y-2">
                              <h4 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                                {h.category}
                              </h4>
                              <ul className="space-y-1.5 pl-2">
                                {h.items.map((item, idx) => (
                                  <li key={idx} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                                    <span className="text-indigo-500 font-bold mt-0.5">•</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>

                        {/* Commits Table */}
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Commits in this Release
                          </p>
                          <div className="space-y-2">
                            {release.commits.map(commit => (
                              <div
                                key={commit.hash}
                                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 gap-2 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all text-xs"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  {getTypeBadge(commit.type)}
                                  <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                                    {commit.hash}
                                  </span>
                                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                    {commit.message}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-400 text-[11px] self-end sm:self-auto font-mono">
                                  {commit.author && (
                                    <>
                                      <span>{commit.author}</span>
                                      <span>•</span>
                                    </>
                                  )}
                                  <span>{commit.date}</span>
                                  <button
                                    onClick={() => copyToClipboard(commit.hash, 'commit hash')}
                                    className="text-slate-400 hover:text-indigo-600 transition-colors"
                                    title="Copy commit hash"
                                  >
                                    <i className="fa-solid fa-copy text-[10px]"></i>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* Markdown Source View */
        <Card className="p-8 space-y-4">
          <div className="flex items-center justify-between border-b dark:border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                version-and-changelog.md
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Authoritative repository file in workspace root
              </p>
            </div>
            <button
              onClick={() => copyToClipboard(CHANGELOG_MARKDOWN, 'changelog markdown')}
              className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center gap-1.5"
            >
              <i className="fa-solid fa-copy"></i> Copy Markdown
            </button>
          </div>
          <pre className="p-6 bg-slate-950 text-slate-200 rounded-xl overflow-x-auto whitespace-pre-wrap text-xs font-mono leading-relaxed max-h-[600px] custom-scrollbar">
            {CHANGELOG_MARKDOWN}
          </pre>
        </Card>
      )}
    </div>
  );
};

export default VersionChangelogView;
