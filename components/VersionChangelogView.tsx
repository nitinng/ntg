import React, { useState, useMemo } from 'react';
import { User, UserRole } from '../types';
import Card from './Card';
import { toast } from 'sonner';

export interface ChangelogCommit {
  hash: string;
  date: string;
  author: string;
  message: string;
  type: 'feat' | 'fix' | 'refactor' | 'style' | 'test' | 'merge' | 'docs' | 'chore';
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  badge: string;
  summary: string;
  highlights: { category: string; items: string[] }[];
  commits: ChangelogCommit[];
}

export const RELEASES_DATA: ChangelogRelease[] = [
  {
    version: 'v2.4.0',
    date: '2026-08-28',
    title: 'Production-Safe Transactional Email Engine & Template Authoring',
    badge: 'Latest Release',
    summary: 'Full end-to-end transactional email integration connecting the travel lifecycle state machine to versioned mail templates, asynchronous queueing, Gmail API / Amazon SES dispatch, and operational delivery observability.',
    highlights: [
      {
        category: '✨ Template Authoring & Versioning',
        items: [
          'Introduced Published, Drafts, and Archived status lifecycle for mail templates.',
          'Built Template Edit History audit drawer tracking changed_by, changed_at, version counters, and subject diffs.',
          'Added 1-click dynamic variable helper pills for {{request_id}}, {{requester_name}}, {{origin}}, {{destination}}, {{estimated_cost}}, etc.'
        ]
      },
      {
        category: '📧 Sent Mails & Delivery Tracking',
        items: [
          'Real-time outgoing queue monitoring with delivery KPI cards and status badges (Sent, Pending, Processing, Failed).',
          'Interactive live HTML preview and JSON payload inspector.',
          'Template-powered test email sender with auto-filled sample data.',
          'Queue purge ("Clear Queue") and manual worker trigger buttons.'
        ]
      },
      {
        category: '🔒 Centralized Global CC & Database Migrations',
        items: [
          'Central Global Email CC management (travel.team@navgurukul.org, nitin.s@navgurukul.org) with duplicate protection.',
          'Created public.mail_template_history table with Row Level Security policies.',
          'Added 95 automated Vitest tests covering all positive/negative lifecycle triggers and provider failure isolation.'
        ]
      }
    ],
    commits: [
      { hash: 'f62cde6', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'feat(email): complete end-to-end transactional email system with audit history and global CC', type: 'feat' },
      { hash: '220f59b', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'fix(edge-function): add CORS response headers to process-email-queue', type: 'fix' },
      { hash: 'ea6c05a', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'fix(email): resolve template_name schema mismatch and allow standalone test emails in email_queue', type: 'fix' },
      { hash: '7c33103', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'feat(email): add Clear Queue button to purge old email records', type: 'feat' },
      { hash: 'd64246f', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'feat(email): add Sent Mails delivery tracking view, test email sender, and queue trigger', type: 'feat' }
    ]
  },
  {
    version: 'v2.3.0',
    date: '2026-08-28',
    title: 'Domain Modularization & Provider Abstraction',
    badge: 'Architecture',
    summary: 'Decomposed monolithic App.tsx into specialized domain view modules and established the pluggable email provider strategy architecture.',
    highlights: [
      {
        category: '🏗️ Architecture & Performance',
        items: [
          'Modularized App.tsx into dedicated components with dynamic code-splitting (React.lazy + Suspense).',
          'Created IEmailProvider interface with Gmail API and Amazon SES provider implementations.',
          'Constructed RFC 2822 MIME builder with base64url encoding for robust cross-client formatting.'
        ]
      }
    ],
    commits: [
      { hash: '5cfc119', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'refactor(architecture): modularize App.tsx into dedicated domain view components and services', type: 'refactor' },
      { hash: 'ab4932e', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'Implement production-safe email architecture with Gmail API and SES provider abstraction', type: 'feat' },
      { hash: '3cf4dcf', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'Add production-safe test coverage for critical business workflows', type: 'test' },
      { hash: '6db2d61', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'Improve Supabase local dev networking and remove hardcoded IP pinning', type: 'refactor' },
      { hash: 'c938031', date: '2026-08-28', author: 'Nitin Sudarshan', message: 'Add env files to .gitignore and untrack .env', type: 'chore' }
    ]
  },
  {
    version: 'v2.2.0',
    date: '2026-07-28',
    title: 'Analytics Overhaul & Design Polish',
    badge: 'UI & Analytics',
    summary: 'Enhanced PNC, Finance, and Admin analytics with paginated data views, spend analytics, and project-wide transition optimizations.',
    highlights: [
      {
        category: '📊 Analytics & Guides',
        items: [
          'Added comprehensive paginated dashboards for PNC and Finance staff.',
          'Synchronized dark mode CSS transitions to 200ms project-wide.',
          'Introduced Employee Travel Guide view with policy rules and FAQ.'
        ]
      }
    ],
    commits: [
      { hash: '4961d4c', date: '2026-07-28', author: 'Nitin Sudarshan', message: "Merge branch 'feat/ticket-cancellation-logic'", type: 'merge' },
      { hash: 'cdefed0', date: '2026-07-28', author: 'Nitin Sudarshan', message: 'Update PNC, Finance, and Admin Analytics with comprehensive paginated dashboards and layout fixes', type: 'feat' },
      { hash: '1805ce6', date: '2026-07-28', author: 'Nitin Sudarshan', message: 'style: synchronize dark mode transition durations to 200ms project-wide', type: 'style' },
      { hash: 'd122112', date: '2026-07-27', author: 'Nitin Sudarshan', message: 'feat: add Employee Travel Guide view and update branding to NG Travel Desk', type: 'feat' },
      { hash: '964ec73', date: '2026-07-26', author: 'Nitin Sudarshan', message: 'Enhance README with new features and documentation', type: 'docs' }
    ]
  },
  {
    version: 'v2.1.0',
    date: '2026-07-26',
    title: 'Multi-Leg Ticket Cancellation & Policy Splits',
    badge: 'Operations',
    summary: 'Engineered leg-by-leg cancellation workflows, automatic cost split calculations (Navgurukul vs Employee), and finance advance reconciliation.',
    highlights: [
      {
        category: '🔄 Cancellation & Policies',
        items: [
          'Support for partial trip leg cancellations and full itinerary cancellations.',
          'Dynamic policy split computation based on cancellation initiator (PNC vs Employee).',
          'Added departments management table and testing settings bypass toggles.'
        ]
      }
    ],
    commits: [
      { hash: '0677409', date: '2026-07-26', author: 'Nitin Sudarshan', message: 'Merge pull request #8 from nitinng/feat/ticket-cancellation-logic', type: 'merge' },
      { hash: '3b17f5c', date: '2026-07-26', author: 'Nitin Sudarshan', message: 'Complete ticket state machine, fix On Hold / resubmission gaps, wire up email queue and history triggers, and add audience to mail templates', type: 'feat' },
      { hash: 'fdf00d9', date: '2026-07-26', author: 'Nitin Sudarshan', message: 'feat: add testing settings dashboard and conditional form validation bypass', type: 'feat' },
      { hash: 'f7e0e5b', date: '2026-07-26', author: 'Nitin Sudarshan', message: 'feat: add departments table, management dashboard, and dropdown dropdown integration', type: 'feat' },
      { hash: 'cd84199', date: '2026-07-25', author: 'Nitin Sudarshan', message: 'feat: ticket cancellation logic, leg-by-leg multi-cancellation, policy split sync, and advance reconciliation', type: 'feat' }
    ]
  },
  {
    version: 'v2.0.0',
    date: '2026-07-23',
    title: 'Ticket State Machine & Interactive Flowchart',
    badge: 'Core Engine',
    summary: 'Standardized ticket state machine lifecycle, replaced Sankey diagram with interactive SVG Flowchart, and streamlined bundle footprint.',
    highlights: [
      {
        category: '⚡ State Machine & Visualization',
        items: [
          'Full formalization of ticket lifecycle states (Not Started → Approval Pending → Approved → Processing → Booked → Closed).',
          'Interactive SVG/HTML status transition flowchart in PNC Dashboard.',
          'Optimized bundle size with chunking and module tree-shaking.'
        ]
      }
    ],
    commits: [
      { hash: 'f92dce0', date: '2026-07-25', author: 'Nitin Sudarshan', message: "Merge pull request #7 from nitinng/feat/dashboard-flowchart", type: 'merge' },
      { hash: '9640e3f', date: '2026-07-24', author: 'Nitin Sudarshan', message: 'feat: Replace Sankey with native Flowchart in PNC Dashboard & migrate SQL endpoints', type: 'feat' },
      { hash: '8806722', date: '2026-07-23', author: 'Nitin Sudarshan', message: 'refactor: modularize components, add routing, fix types, and optimize bundle size', type: 'refactor' }
    ]
  }
];

interface VersionChangelogViewProps {
  currentUser?: User | null;
}

export const VersionChangelogView: React.FC<VersionChangelogViewProps> = ({ currentUser }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'interactive' | 'markdown'>('interactive');
  const [expandedReleases, setExpandedReleases] = useState<Record<string, boolean>>({
    'v2.4.0': true,
    'v2.3.0': true
  });

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
    return RELEASES_DATA.filter(release => {
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
  }, [searchQuery, selectedVersion]);

  const totalCommitsCount = useMemo(() => {
    return RELEASES_DATA.reduce((acc, r) => acc + r.commits.length, 0);
  }, []);

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
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <i className="fa-solid fa-code-branch text-indigo-600"></i>
              Version & Changelog
            </h2>
            <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-mono text-xs font-bold px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
              v2.4.0 Production
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            System release history, architectural milestones, and commit tracking for Navgurukul Travel Desk.
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200 dark:border-slate-700 self-start md:self-auto">
          <button
            onClick={() => setViewMode('interactive')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === 'interactive'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <i className="fa-solid fa-layer-group"></i> Release View
          </button>
          <button
            onClick={() => setViewMode('markdown')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === 'markdown'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <i className="fa-brands fa-markdown"></i> Markdown Source
          </button>
        </div>
      </header>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Version</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">v2.4.0</h3>
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
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{RELEASES_DATA.length} Versions</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
              <i className="fa-solid fa-boxes-packing"></i>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">From v1.0.0 to current release</p>
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
                <option value="all">All Releases ({RELEASES_DATA.length})</option>
                {RELEASES_DATA.map(r => (
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
                                  <span>{commit.author}</span>
                                  <span>•</span>
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
              onClick={() => copyToClipboard(`# Navgurukul Travel Desk — Version & Changelog...`, 'changelog markdown')}
              className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center gap-1.5"
            >
              <i className="fa-solid fa-copy"></i> Copy Markdown
            </button>
          </div>
          <pre className="p-6 bg-slate-950 text-slate-200 rounded-xl overflow-x-auto text-xs font-mono leading-relaxed max-h-[600px] custom-scrollbar">
{`# Navgurukul Travel Desk — Version & Changelog

All notable changes to the Navgurukul Travel Desk application are documented in this file.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

---

## [v2.4.0] - 2026-08-28 (Production-Safe Transactional Email System)
* Template Authoring Layer with Published/Draft/Archived states and audit logs.
* Sent Mails delivery tracking, status filtering, live inspector, and test email sender.
* Global CC configuration in settings (travel.team@navgurukul.org, nitin.s@navgurukul.org).
* Authoritative mail_sender_routine.md specification.
* 95 automated Vitest tests passing.

Commits:
- f62cde6 feat(email): complete end-to-end transactional email system with audit history and global CC
- 220f59b fix(edge-function): add CORS response headers to process-email-queue
- ea6c05a fix(email): resolve template_name schema mismatch and allow standalone test emails in email_queue
- 7c33103 feat(email): add Clear Queue button to purge old email records
- d64246f feat(email): add Sent Mails delivery tracking view, test email sender, and queue trigger

---

## [v2.3.0] - 2026-08-28 (Domain Modularization & Provider Abstraction)
* Modularized App.tsx into specialized domain view components.
* Pluggable email provider strategy (Gmail API & Amazon SES).
* MIME RFC 2822 builder with base64url encoding.

Commits:
- 5cfc119 refactor(architecture): modularize App.tsx into dedicated domain view components and services
- ab4932e Implement production-safe email architecture with Gmail API and SES provider abstraction
- 3cf4dcf Add production-safe test coverage for critical business workflows`}
          </pre>
        </Card>
      )}
    </div>
  );
};

export default VersionChangelogView;
