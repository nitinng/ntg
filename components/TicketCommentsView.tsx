import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, TravelRequest, TicketComment } from '../types';
import { supabase } from '../supabaseClient';
import { getMentionColor, formatResolutionDuration } from './TicketCommentThread';
import { mapDbRequest } from '../services/requestMapper';
import StatusBadge from './StatusBadge';
import PageBanner from './PageBanner';
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
  isResolved: boolean;
  resolvedBy?: string;
  resolutionDurationMs?: number;
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
  const [statusTab, setStatusTab] = useState<'open' | 'completed'>('open');
  const [activeSubTab, setActiveSubTab] = useState<'mentioned' | 'all'>('mentioned');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Local resolution overrides to ensure instant UI transitions
  const [localResolutionMap, setLocalResolutionMap] = useState<Record<string, { resolved: boolean; resolvedBy?: string; durationMs?: number }>>(() => {
    try {
      const raw = localStorage.getItem('local_discussion_resolutions');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

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
      .channel('ticket_comments_resolution_stub_view')
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
    requests.forEach(r => {
      if (r.id) map.set(r.id, r);
      if (r.submissionId) map.set(r.submissionId, r);
    });
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

      // Check resolution status
      const localRes = localResolutionMap[ticketId];
      const isResolved = localRes ? localRes.resolved : Boolean(req?.commentsResolved);
      const resolvedBy = localRes ? localRes.resolvedBy : (req?.commentsResolvedBy || '');
      const resolutionDurationMs = localRes ? localRes.durationMs : req?.commentsResolutionDurationMs;

      groups.push({
        ticketId,
        request: req,
        comments: sortedComments,
        mentionCount,
        unreadMentionCount,
        hasUnread,
        latestComment: sortedComments[0],
        isResolved,
        resolvedBy,
        resolutionDurationMs
      });
    });

    // Sort: unread first, then newest
    groups.sort((a, b) => {
      if (a.unreadMentionCount > 0 && b.unreadMentionCount === 0) return -1;
      if (b.unreadMentionCount > 0 && a.unreadMentionCount === 0) return 1;
      return new Date(b.latestComment.created_at).getTime() - new Date(a.latestComment.created_at).getTime();
    });

    return groups;
  }, [comments, requestsById, currentUser, readCommentIds, localResolutionMap]);

  // Resolve discussion handler
  const handleResolveTicket = async (group: TicketDiscussionGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;

    const earliestComment = group.comments[group.comments.length - 1];
    const startTime = earliestComment
      ? new Date(earliestComment.created_at).getTime()
      : (group.request?.timestamp ? new Date(group.request.timestamp).getTime() : Date.now());
    const durationMs = Math.max(0, Date.now() - startTime);
    const actorName = currentUser.name || currentUser.email;

    // Update local state immediately
    const updatedMap = {
      ...localResolutionMap,
      [group.ticketId]: { resolved: true, resolvedBy: actorName, durationMs }
    };
    setLocalResolutionMap(updatedMap);
    try {
      localStorage.setItem('local_discussion_resolutions', JSON.stringify(updatedMap));
    } catch {}

    // Mark as read
    markTicketCommentsAsRead(group.ticketId, group.comments);

    try {
      await supabase
        .from('travel_requests')
        .update({
          comments_resolved: true,
          comments_resolved_at: new Date().toISOString(),
          comments_resolved_by: actorName,
          comments_resolved_by_id: currentUser.id,
          comments_resolution_duration_ms: durationMs
        })
        .eq('id', group.ticketId);

      toast.success(`Discussion resolved in ${formatResolutionDuration(durationMs)} by ${actorName}`);
    } catch (err: any) {
      console.warn('Could not persist resolution to DB:', err);
    }
  };

  // Reopen discussion handler
  const handleReopenTicket = async (group: TicketDiscussionGroup, e: React.MouseEvent) => {
    e.stopPropagation();

    // Update local state immediately
    const updatedMap = {
      ...localResolutionMap,
      [group.ticketId]: { resolved: false, resolvedBy: undefined, durationMs: undefined }
    };
    setLocalResolutionMap(updatedMap);
    try {
      localStorage.setItem('local_discussion_resolutions', JSON.stringify(updatedMap));
    } catch {}

    try {
      await supabase
        .from('travel_requests')
        .update({
          comments_resolved: false,
          comments_resolved_at: null,
          comments_resolved_by: null,
          comments_resolved_by_id: null,
          comments_resolution_duration_ms: null
        })
        .eq('id', group.ticketId);

      toast.success("Discussion reopened and moved to Open tab");
    } catch (err: any) {
      console.warn('Could not reopen discussion in DB:', err);
    }
  };

  // Partition groups into Open vs Completed
  const openGroups = useMemo(() => ticketGroups.filter(g => !g.isResolved), [ticketGroups]);
  const completedGroups = useMemo(() => ticketGroups.filter(g => g.isResolved), [ticketGroups]);

  // Current active groups based on status tab (open vs completed)
  const currentTabGroups = statusTab === 'open' ? openGroups : completedGroups;

  // Filtered groups
  const displayGroups = useMemo(() => {
    let list = currentTabGroups;

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
  }, [currentTabGroups, activeSubTab, unreadOnly, searchQuery]);

  const openMentionsCount = useMemo(() => {
    return openGroups.filter(g => g.mentionCount > 0).length;
  }, [openGroups]);

  const openUnreadMentionsCount = useMemo(() => {
    return openGroups.reduce((acc, g) => acc + g.unreadMentionCount, 0);
  }, [openGroups]);

  // Click handler to open the full ticket stub overlay
  const handleOpenTicketStub = async (group: TicketDiscussionGroup) => {
    markTicketCommentsAsRead(group.ticketId, group.comments);

    let req = group.request || requestsById.get(group.ticketId);

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
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 mx-0.5 rounded text-3xs font-semibold border shadow-2xs ${color} align-baseline`}
        >
          <span className="opacity-75 font-mono text-[9px]">@</span>
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
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* PageBanner standard */}
      <PageBanner
        title="Ticket Comments & Discussions"
        description="Review questions, replies, and @mentions on travel request stubs. Resolve completed inquiries."
        icon="fa-comments"
      >
        <div className="flex items-center gap-2">
          <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/15 text-center shrink-0">
            <span className="text-3xs uppercase font-bold text-indigo-200 block">Open Stubs</span>
            <span className="text-base font-black text-white">{openGroups.length}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/15 text-center shrink-0">
            <span className="text-3xs uppercase font-bold text-rose-200 block">Unread Mentions</span>
            <span className="text-base font-black text-rose-300">{openUnreadMentionsCount}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/15 text-center shrink-0">
            <span className="text-3xs uppercase font-bold text-emerald-200 block">Completed</span>
            <span className="text-base font-black text-emerald-300">{completedGroups.length}</span>
          </div>
        </div>
      </PageBanner>

      {/* Primary Status Tabs: Open vs Completed */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusTab('open')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              statusTab === 'open'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-envelope-open-text text-xs"></i>
            Open Discussions ({openGroups.length})
            {openUnreadMentionsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-3xs font-black bg-rose-500 text-white">
                {openUnreadMentionsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setStatusTab('completed')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              statusTab === 'completed'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-circle-check text-xs"></i>
            Completed ({completedGroups.length})
          </button>
        </div>

        <span className="text-3xs text-slate-400 font-medium">
          {statusTab === 'open' ? 'Active discussions awaiting resolution' : 'Discussions marked resolved with completion times'}
        </span>
      </div>

      {/* Control Bar: Sub-filters, Search, Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
        {/* Sub tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            onClick={() => setActiveSubTab('mentioned')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'mentioned'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-at text-xs"></i>
            Mentioned (@Me) ({statusTab === 'open' ? openMentionsCount : completedGroups.filter(g => g.mentionCount > 0).length})
          </button>
          <button
            onClick={() => setActiveSubTab('all')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'all'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-layer-group text-xs"></i>
            All in {statusTab === 'open' ? 'Open' : 'Completed'} ({currentTabGroups.length})
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2 flex-1 sm:max-w-md">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search ticket #, requester, route, comment..."
              className="w-full pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-md text-xs outline-none focus:ring-1 focus:ring-indigo-500 transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={() => setUnreadOnly(prev => !prev)}
            title="Filter unread mentions only"
            className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              unreadOnly
                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            <i className={`fa-solid fa-filter text-2xs ${unreadOnly ? 'text-indigo-500' : 'text-slate-400'}`}></i>
            <span className="hidden sm:inline">Unread</span>
          </button>

          {openUnreadMentionsCount > 0 && statusTab === 'open' && (
            <button
              onClick={markAllAsRead}
              className="px-2.5 py-1 rounded-md text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 transition-all cursor-pointer"
              title="Mark all as read"
            >
              <i className="fa-solid fa-check-double text-2xs mr-1"></i>
              <span className="hidden md:inline">Mark read</span>
            </button>
          )}
        </div>
      </div>

      {/* Ticket Stubs Grid / List - Compact Design */}
      {loading ? (
        <div className="py-12 text-center space-y-2">
          <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-medium text-slate-400">Loading ticket stubs...</p>
        </div>
      ) : displayGroups.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">
            <i className={statusTab === 'open' ? 'fa-solid fa-envelope-open-text' : 'fa-solid fa-circle-check text-emerald-500'}></i>
          </div>
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {statusTab === 'open'
              ? (activeSubTab === 'mentioned' ? 'No open ticket mentions' : 'No open ticket discussions')
              : 'No completed ticket discussions'}
          </h3>
          <p className="text-2xs text-slate-400 max-w-sm mx-auto">
            {statusTab === 'open'
              ? 'All ticket discussions are resolved. New comments and @mentions on active ticket stubs will appear here.'
              : 'Discussions that have been marked as resolved will be archived in this Completed tab with resolution times.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
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
                className={`group relative bg-white dark:bg-slate-900 rounded-lg flex flex-col sm:flex-row overflow-hidden border cursor-pointer shadow-2xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 ${
                  group.isResolved
                    ? 'border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/10'
                    : isUnread
                    ? 'border-indigo-400/80 dark:border-indigo-600/80 ring-1 ring-indigo-500/20'
                    : 'border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                }`}
              >
                {/* Left Ticket Main Body (Compact Boarding Pass) */}
                <div className="flex-1 p-3 sm:p-3.5 relative overflow-hidden bg-gradient-to-br from-white via-slate-50/40 to-indigo-50/15 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20 border-b sm:border-b-0 sm:border-r border-dashed border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  {/* Subtle Background Watermark Icon */}
                  <div className="absolute -right-4 -bottom-4 opacity-[0.03] dark:opacity-[0.03] text-[7rem] pointer-events-none text-indigo-900 dark:text-indigo-200">
                    <i className={`fa-solid ${modeIcon}`}></i>
                  </div>

                  <div>
                    {/* Header Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2 relative z-10">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                          {req?.submissionId || group.ticketId.slice(0, 8)}
                        </span>

                        {group.mentionCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 shadow-2xs ${
                            group.unreadMentionCount > 0
                              ? 'bg-rose-500 text-white animate-pulse'
                              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          }`}>
                            <i className="fa-solid fa-at text-[8px]"></i>
                            {group.mentionCount} {group.mentionCount === 1 ? 'mention' : 'mentions'}
                          </span>
                        )}

                        <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                          <i className="fa-solid fa-comments text-slate-400 text-[8px]"></i>
                          {group.comments.length}
                        </span>

                        {group.isResolved && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                            <i className="fa-solid fa-check text-emerald-600 dark:text-emerald-400 text-[8px]"></i>
                            Resolved {group.resolvedBy ? `by ${group.resolvedBy}` : ''}
                          </span>
                        )}
                      </div>

                      {req?.pncStatus && (
                        <div className="shrink-0 scale-85 origin-right">
                          <StatusBadge type="pnc" value={req.pncStatus} audience="employee" />
                        </div>
                      )}
                    </div>

                    {/* Route Section */}
                    <div className="flex items-center justify-between my-1.5 relative z-10">
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight uppercase leading-none">
                          {fromCode}
                        </p>
                        <p className="text-[9.5px] text-slate-400 font-medium truncate max-w-[90px] sm:max-w-[110px] mt-0.5">
                          {fromCity}
                        </p>
                      </div>

                      <div className="flex-[2] flex flex-col items-center justify-center px-1 sm:px-2">
                        <div className="w-full flex items-center opacity-60">
                          <div className="h-[1px] flex-1 border-t border-dashed border-slate-300 dark:border-slate-600"></div>
                          <i className={`fa-solid ${modeIcon} text-indigo-600 dark:text-indigo-400 mx-1.5 text-xs group-hover:scale-115 transition-transform duration-200`}></i>
                          <div className="h-[1px] flex-1 border-t border-dashed border-slate-300 dark:border-slate-600"></div>
                        </div>
                        <span className="text-[8.5px] uppercase font-bold text-slate-400 mt-0.5">
                          {req?.mode || 'Travel'}
                        </span>
                      </div>

                      <div className="text-right flex-1 min-w-0">
                        <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight uppercase leading-none">
                          {toCode}
                        </p>
                        <p className="text-[9.5px] text-slate-400 font-medium truncate max-w-[90px] sm:max-w-[110px] mt-0.5">
                          {toCity}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Requester & Date Meta Row */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 relative z-10 text-[9.5px]">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="uppercase font-semibold text-slate-400 text-[8.5px] shrink-0">Requester:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {req?.requesterName || 'Employee Request'}
                      </span>
                      {req?.requesterDepartment && (
                        <span className="text-slate-400 text-[8.5px] shrink-0">({req.requesterDepartment})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-slate-400 font-mono text-[8.5px] shrink-0">
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

                {/* Right Tear-Off Stub (Compact Discussion Preview & Actions) */}
                <div className="w-full sm:w-56 md:w-60 lg:w-56 xl:w-60 bg-slate-50/70 dark:bg-slate-900/60 p-2.5 sm:p-3 flex flex-col justify-between relative overflow-hidden shrink-0">
                  {/* Perforation holes on sm screens */}
                  <div className="hidden sm:block absolute -left-2 top-[-6px] w-4 h-4 bg-slate-100 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>
                  <div className="hidden sm:block absolute -left-2 bottom-[-6px] w-4 h-4 bg-slate-100 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        Latest Comment
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {new Date(group.latestComment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Latest Comment Bubble */}
                    <div className="p-2 bg-white dark:bg-slate-800/80 rounded border border-slate-200/80 dark:border-slate-700/80 space-y-0.5">
                      <span className="font-bold text-[9.5px] text-slate-800 dark:text-slate-200 block truncate">
                        {group.latestComment.author_name}
                      </span>
                      <p className="text-[9.5px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                        {renderCommentContent(group.latestComment.comment_text)}
                      </p>
                    </div>

                    {group.comments.length > 1 && (
                      <p className="text-[9px] text-slate-400 text-center font-medium">
                        + {group.comments.length - 1} earlier {group.comments.length - 1 === 1 ? 'comment' : 'comments'} in thread
                      </p>
                    )}

                    {group.isResolved && (
                      <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-800/80 text-[9px] space-y-0.5">
                        <div className="flex items-center justify-between text-emerald-900 dark:text-emerald-200">
                          <span className="font-semibold flex items-center gap-1">
                            <i className="fa-solid fa-check-circle text-emerald-600 dark:text-emerald-400"></i>
                            Resolved by
                          </span>
                          <span className="font-bold truncate max-w-[100px]">{group.resolvedBy || 'Staff'}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 pt-0.5 border-t border-emerald-200/50 dark:border-emerald-800/40">
                          <span>Resolution:</span>
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                            {formatResolutionDuration(group.resolutionDurationMs)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stub Actions: Resolve / Reopen & Open */}
                  <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Open Stub
                      <i className="fa-solid fa-arrow-right text-[9px]"></i>
                    </span>

                    <div className="flex items-center gap-1.5">
                      {group.isResolved ? (
                        <button
                          type="button"
                          onClick={(e) => handleReopenTicket(group, e)}
                          title="Reopen discussion to Open tab"
                          className="px-2 py-0.5 text-3xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-arrow-rotate-left text-[9px]"></i>
                          Reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleResolveTicket(group, e)}
                          title="Mark resolved and move to Completed"
                          className="px-2 py-0.5 text-3xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-700 rounded transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <i className="fa-solid fa-circle-check text-[9px]"></i>
                          Resolve
                        </button>
                      )}

                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-500/20 shrink-0" />
                      )}
                    </div>
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
