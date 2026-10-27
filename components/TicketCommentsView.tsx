import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, TravelRequest, TicketComment } from '../types';
import { supabase } from '../supabaseClient';
import { getMentionColor } from './TicketCommentThread';
import { mapDbRequest } from '../services/requestMapper';
import StatusBadge from './StatusBadge';
import { toast } from 'sonner';

interface TicketCommentsViewProps {
  currentUser: User | null;
  requests: TravelRequest[];
  onViewRequest: (request: TravelRequest) => void;
  onCommentsViewed?: () => void;
}

export const isUserMentionedInComment = (
  comment: { mentions?: string[] | null; comment_text?: string },
  user: User | null
): boolean => {
  if (!user) return false;
  const userName = (user.name || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();
  const userHandle = userEmail.includes('@') ? userEmail.split('@')[0].toLowerCase() : '';

  if (Array.isArray(comment.mentions) && comment.mentions.length > 0) {
    for (const m of comment.mentions) {
      const clean = (typeof m === 'string' ? m : '').trim().toLowerCase();
      if (!clean) continue;
      if (clean === userName || clean === userEmail || clean === userHandle) return true;
      if (userName && clean === userName) return true;
      if (userEmail && userEmail.startsWith(clean + '@')) return true;
      if (userHandle && clean === userHandle) return true;
    }
  }

  const text = (comment.comment_text || '').toLowerCase();
  if (userEmail && text.includes(`@${userEmail}`)) return true;
  if (userHandle && (text.includes(`@${userHandle} `) || text.endsWith(`@${userHandle}`))) return true;
  if (userName && text.includes(`@${userName}`)) return true;

  return false;
};

interface TicketDiscussionGroup {
  ticketId: string;
  request?: TravelRequest;
  comments: TicketComment[];
  mentionCount: number;
  unreadMentionCount: number;
  hasUnread: boolean;
  latestComment: TicketComment;
}

export const TicketCommentsView: React.FC<TicketCommentsViewProps> = ({
  currentUser,
  requests,
  onViewRequest,
  onCommentsViewed
}) => {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [fetchedRequestsMap, setFetchedRequestsMap] = useState<Map<string, TravelRequest>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'mentioned' | 'all'>('mentioned');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [readCommentIds, setReadCommentIds] = useState<Set<string>>(() => {
    try {
      if (!currentUser?.id) return new Set();
      const raw = localStorage.getItem(`read_comments_${currentUser.id}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Mark all comments of a ticket as read
  const markTicketCommentsAsRead = useCallback((ticketId: string, ticketComments: TicketComment[]) => {
    if (!currentUser?.id) return;
    setReadCommentIds(prev => {
      const next = new Set(prev);
      ticketComments.forEach(c => next.add(c.id));
      try {
        localStorage.setItem(`read_comments_${currentUser.id}`, JSON.stringify(Array.from(next)));
      } catch (err) {
        console.warn('Could not save read comments', err);
      }
      return next;
    });
    if (onCommentsViewed) onCommentsViewed();
  }, [currentUser, onCommentsViewed]);

  const markAllAsRead = () => {
    if (!currentUser?.id) return;
    const allIds = comments.map(c => c.id);
    const next = new Set(allIds);
    setReadCommentIds(next);
    try {
      localStorage.setItem(`read_comments_${currentUser.id}`, JSON.stringify(allIds));
    } catch (err) {
      console.warn('Could not save read comments', err);
    }
    toast.success("All comment mentions marked as read");
    if (onCommentsViewed) onCommentsViewed();
  };

  // Load all comments & ensure all associated ticket stubs are fetched from Supabase
  const loadData = async () => {
    try {
      setLoading(true);
      const { data: commentsData, error: commentsError } = await supabase
        .from('ticket_comments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (commentsError) throw commentsError;

      const loadedComments = (commentsData || []) as TicketComment[];
      setComments(loadedComments);

      // Collect all ticket IDs that need full request details
      const uniqueTicketIds = Array.from(new Set(loadedComments.map(c => c.ticket_id)));
      if (uniqueTicketIds.length > 0) {
        const { data: dbRequests, error: reqsError } = await supabase
          .from('travel_requests')
          .select('*')
          .in('id', uniqueTicketIds);

        if (!reqsError && dbRequests) {
          const map = new Map<string, TravelRequest>();
          dbRequests.forEach((r: any) => {
            const mapped = mapDbRequest(r);
            map.set(mapped.id, mapped);
            if (mapped.submissionId) {
              map.set(mapped.submissionId, mapped);
            }
          });
          setFetchedRequestsMap(map);
        }
      }
    } catch (err) {
      console.error('Failed to load ticket comments and request stubs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to live comments across all tickets
    const channel = supabase
      .channel('ticket_comments_stub_view')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_comments' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Combined requests map: props + directly fetched
  const requestsById = useMemo(() => {
    const map = new Map<string, TravelRequest>();
    // Seed with props requests
    requests.forEach(r => {
      if (r.id) map.set(r.id, r);
      if (r.submissionId) map.set(r.submissionId, r);
    });
    // Overlay fetched requests
    fetchedRequestsMap.forEach((req, key) => {
      map.set(key, req);
    });
    return map;
  }, [requests, fetchedRequestsMap]);

  // Group comments by ticket stub
  const ticketGroups = useMemo(() => {
    const groupMap = new Map<string, TicketComment[]>();
    comments.forEach(c => {
      const list = groupMap.get(c.ticket_id) || [];
      list.push(c);
      groupMap.set(c.ticket_id, list);
    });

    const groups: TicketDiscussionGroup[] = [];

    groupMap.forEach((cList, ticketId) => {
      const sortedComments = [...cList].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const req = requestsById.get(ticketId);

      const mentionComments = sortedComments.filter(c => isUserMentionedInComment(c, currentUser));
      const mentionCount = mentionComments.length;
      const unreadMentionCount = mentionComments.filter(c => !readCommentIds.has(c.id)).length;
      const hasUnread = sortedComments.some(c => !readCommentIds.has(c.id) && isUserMentionedInComment(c, currentUser));

      groups.push({
        ticketId,
        request: req,
        comments: sortedComments,
        mentionCount,
        unreadMentionCount,
        hasUnread,
        latestComment: sortedComments[0]
      });
    });

    // Sort groups: unread mentions first, then newest latest comment
    groups.sort((a, b) => {
      if (a.unreadMentionCount > 0 && b.unreadMentionCount === 0) return -1;
      if (b.unreadMentionCount > 0 && a.unreadMentionCount === 0) return 1;
      return new Date(b.latestComment.created_at).getTime() - new Date(a.latestComment.created_at).getTime();
    });

    return groups;
  }, [comments, requestsById, currentUser, readCommentIds]);

  // Filter groups
  const displayGroups = useMemo(() => {
    let list = ticketGroups;

    if (activeSubTab === 'mentioned') {
      list = list.filter(g => g.mentionCount > 0);
    }

    if (unreadOnly) {
      list = list.filter(g => g.hasUnread);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(g => {
        const req = g.request;
        const matchTicketId = g.ticketId.toLowerCase().includes(q) || (req?.submissionId && req.submissionId.toLowerCase().includes(q));
        const matchRequester = req?.requesterName?.toLowerCase().includes(q);
        const matchRoute = (req?.from && req.from.toLowerCase().includes(q)) || (req?.to && req.to.toLowerCase().includes(q));
        const matchComment = g.comments.some(c => c.comment_text?.toLowerCase().includes(q) || c.author_name?.toLowerCase().includes(q));
        return matchTicketId || matchRequester || matchRoute || matchComment;
      });
    }

    return list;
  }, [ticketGroups, activeSubTab, unreadOnly, searchQuery]);

  const totalMentionedTickets = useMemo(() => {
    return ticketGroups.filter(g => g.mentionCount > 0).length;
  }, [ticketGroups]);

  const totalUnreadMentions = useMemo(() => {
    return ticketGroups.reduce((acc, g) => acc + g.unreadMentionCount, 0);
  }, [ticketGroups]);

  // Click handler to open the full ticket stub overlay
  const handleOpenTicketStub = async (group: TicketDiscussionGroup) => {
    markTicketCommentsAsRead(group.ticketId, group.comments);

    let req = group.request || requestsById.get(group.ticketId);

    // If still missing, fetch on demand from Supabase to guarantee opening
    if (!req) {
      try {
        const { data, error } = await supabase
          .from('travel_requests')
          .select('*')
          .eq('id', group.ticketId)
          .maybeSingle();

        if (!error && data) {
          req = mapDbRequest(data);
          setFetchedRequestsMap(prev => new Map(prev).set(req!.id, req!));
        }
      } catch (err) {
        console.warn('Could not fetch request details:', err);
      }
    }

    if (req) {
      onViewRequest(req);
    } else {
      toast.error(`Ticket details for ${group.ticketId.slice(0, 8)} could not be loaded.`);
    }
  };

  /**
   * Formats comment text with high-contrast @mention pill badges.
   */
  const renderCommentContent = (text: string) => {
    if (!text) return null;
    const pattern = /@([\w.-]+(?:@[\w.-]+)?)/gi;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(text.slice(lastIdx, match.index));
      }
      const mentionName = match[1];
      const color = getMentionColor(mentionName);
      parts.push(
        <span
          key={match.index}
          className={`inline-flex items-center gap-0.5 px-2 py-0.5 mx-0.5 rounded-md text-xs font-semibold border shadow-2xs ${color} align-baseline`}
        >
          <span className="opacity-75 font-mono text-[10px]">@</span>
          <span>{mentionName}</span>
        </span>
      );
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < text.length) {
      parts.push(text.slice(lastIdx));
    }
    return parts;
  };

  const getModeIcon = (mode?: string) => {
    switch (mode) {
      case 'Flight': return 'fa-plane';
      case 'Train': return 'fa-train';
      case 'Bus': return 'fa-bus';
      case 'Cab': return 'fa-taxi';
      default: return 'fa-ticket';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
            <i className="fa-solid fa-comments text-indigo-400"></i>
            Ticket Discussion Queue
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Ticket Stubs with Comments & @Mentions
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Click any ticket stub below to open the complete request details and participate in the live comment thread.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex-1 md:flex-initial bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center">
            <span className="text-2xs font-bold uppercase tracking-wider text-indigo-300 block">
              Mentioned Tickets
            </span>
            <span className="text-2xl font-black text-white">{totalMentionedTickets}</span>
          </div>
          <div className="flex-1 md:flex-initial bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center">
            <span className="text-2xs font-bold uppercase tracking-wider text-rose-300 block">
              Unread Mentions
            </span>
            <span className="text-2xl font-black text-rose-400">{totalUnreadMentions}</span>
          </div>
          <div className="flex-1 md:flex-initial bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center">
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-300 block">
              Total Stubs
            </span>
            <span className="text-2xl font-black text-slate-200">{ticketGroups.length}</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Tabs, Search, Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Sub tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            onClick={() => setActiveSubTab('mentioned')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'mentioned'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-at text-xs"></i>
            Mentioned Tickets ({totalMentionedTickets})
            {totalUnreadMentions > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-3xs font-black bg-rose-500 text-white">
                {totalUnreadMentions}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'all'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-layer-group text-xs"></i>
            All Active Discussions ({ticketGroups.length})
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2.5 flex-1 sm:max-w-md">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by ticket #, requester, route, or comment..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={() => setUnreadOnly(prev => !prev)}
            title="Filter unread mentions only"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              unreadOnly
                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            <i className={`fa-solid fa-filter text-2xs ${unreadOnly ? 'text-indigo-500' : 'text-slate-400'}`}></i>
            <span className="hidden sm:inline">Unread</span>
          </button>

          {totalUnreadMentions > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 transition-all cursor-pointer"
              title="Mark all as read"
            >
              <i className="fa-solid fa-check-double text-2xs mr-1"></i>
              <span className="hidden md:inline">Mark all read</span>
            </button>
          )}
        </div>
      </div>

      {/* Ticket Stubs Grid / List */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="inline-block w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-medium text-slate-400">Loading ticket stubs...</p>
        </div>
      ) : displayGroups.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl">
            <i className="fa-solid fa-ticket"></i>
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {activeSubTab === 'mentioned' ? 'No ticket mentions found' : 'No ticket discussions found'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {activeSubTab === 'mentioned'
              ? 'When someone mentions you in a ticket stub with @your-name, the ticket stub with a mention badge will appear here.'
              : 'No ticket comments match your filter criteria.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {displayGroups.map(group => {
            const req = group.request;
            const fromCity = req?.from || 'Origin';
            const toCity = req?.to || 'Destination';
            const fromCode = fromCity.length >= 3 ? fromCity.substring(0, 3).toUpperCase() : fromCity.toUpperCase();
            const toCode = toCity.length >= 3 ? toCity.substring(0, 3).toUpperCase() : toCity.toUpperCase();
            const modeIcon = getModeIcon(req?.mode);
            const isUnread = group.hasUnread;

            return (
              <div
                key={group.ticketId}
                onClick={() => handleOpenTicketStub(group)}
                className={`group relative bg-white dark:bg-slate-900 rounded-xl flex flex-col md:flex-row overflow-hidden border cursor-pointer shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 ${
                  isUnread
                    ? 'border-indigo-400/80 dark:border-indigo-600/80 ring-1 ring-indigo-500/20'
                    : 'border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                }`}
              >
                {/* Left Ticket Main Body (Boarding Pass Layout) */}
                <div className="flex-1 p-5 sm:p-6 relative overflow-hidden bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20 border-b md:border-b-0 md:border-r border-dashed border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  {/* Background Watermark Icon */}
                  <div className="absolute -right-6 -bottom-6 opacity-[0.03] dark:opacity-[0.04] text-[9rem] pointer-events-none text-indigo-900 dark:text-indigo-200">
                    <i className={`fa-solid ${modeIcon}`}></i>
                  </div>

                  <div>
                    {/* Top Header Row of the Stub */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 relative z-10">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-3xs font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                          {req?.submissionId || group.ticketId.slice(0, 8)}
                        </span>

                        {/* Prominent Mentions Notification Badge */}
                        {group.mentionCount > 0 && (
                          <span className={`px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs ${
                            group.unreadMentionCount > 0
                              ? 'bg-rose-500 text-white animate-pulse'
                              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          }`}>
                            <i className="fa-solid fa-at text-xs"></i>
                            {group.mentionCount} {group.mentionCount === 1 ? 'mention' : 'mentions'}
                          </span>
                        )}

                        <span className="text-3xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          <i className="fa-solid fa-comments text-slate-400 mr-1"></i>
                          {group.comments.length} {group.comments.length === 1 ? 'comment' : 'comments'}
                        </span>
                      </div>

                      {req?.pncStatus && (
                        <div className="shrink-0">
                          <StatusBadge type="pnc" value={req.pncStatus} audience="employee" />
                        </div>
                      )}
                    </div>

                    {/* Route Display */}
                    <div className="flex items-center justify-between mb-5 relative z-10">
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                          {fromCode}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold truncate max-w-[120px] sm:max-w-[180px]">
                          {fromCity}
                        </p>
                      </div>

                      <div className="flex-[2] flex flex-col items-center justify-center px-3 sm:px-6">
                        <div className="w-full flex items-center opacity-60">
                          <div className="h-[2px] flex-1 bg-transparent border-t-[2px] border-dashed border-slate-300 dark:border-slate-600"></div>
                          <i className={`fa-solid ${modeIcon} text-indigo-600 dark:text-indigo-400 mx-3 text-base sm:text-xl group-hover:scale-125 transition-transform duration-300`}></i>
                          <div className="h-[2px] flex-1 bg-transparent border-t-[2px] border-dashed border-slate-300 dark:border-slate-600"></div>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 mt-1">
                          {req?.mode || 'Travel'}
                        </span>
                      </div>

                      <div className="text-right flex-1 min-w-0">
                        <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                          {toCode}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold truncate max-w-[120px] sm:max-w-[180px]">
                          {toCity}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Requester & Date Meta Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 relative z-10 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-3xs uppercase font-bold text-slate-400">Requester:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {req?.requesterName || 'Employee Request'}
                      </span>
                      {req?.requesterDepartment && (
                        <span className="text-3xs text-slate-400 font-medium">({req.requesterDepartment})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 text-3xs font-mono">
                      {req?.dateOfTravel && (
                        <span>
                          <i className="fa-solid fa-calendar mr-1 text-slate-400"></i>
                          {new Date(req.dateOfTravel).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      <span>
                        <i className="fa-solid fa-clock mr-1 text-slate-400"></i>
                        Active {new Date(group.latestComment.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Tear-Off Stub (Discussion Preview & Action) */}
                <div className="w-full md:w-80 bg-slate-50/80 dark:bg-slate-900/80 p-5 flex flex-col justify-between relative overflow-hidden">
                  {/* Perforation holes on md screens */}
                  <div className="hidden md:block absolute -left-3 top-[-10px] w-6 h-6 bg-slate-100 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>
                  <div className="hidden md:block absolute -left-3 bottom-[-10px] w-6 h-6 bg-slate-100 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-3xs font-black uppercase tracking-wider text-slate-400">
                        Latest Comment
                      </span>
                      <span className="text-3xs text-slate-400 font-mono">
                        {new Date(group.latestComment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Latest Comment Bubble */}
                    <div className="p-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/80 space-y-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                          {group.latestComment.author_name}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                        {renderCommentContent(group.latestComment.comment_text)}
                      </p>
                    </div>

                    {group.comments.length > 1 && (
                      <p className="text-3xs text-slate-400 text-center font-medium">
                        + {group.comments.length - 1} earlier {group.comments.length - 1 === 1 ? 'comment' : 'comments'} in thread
                      </p>
                    )}
                  </div>

                  {/* Primary Stub CTA */}
                  <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                      Open Ticket Stub
                      <i className="fa-solid fa-arrow-right text-2xs"></i>
                    </span>

                    {isUnread && (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-500/20 shrink-0" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TicketCommentsView;
