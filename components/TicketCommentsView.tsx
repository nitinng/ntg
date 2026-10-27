import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, TravelRequest, TicketComment } from '../types';
import { supabase } from '../supabaseClient';
import { getMentionColor } from './TicketCommentThread';
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

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const TicketCommentsView: React.FC<TicketCommentsViewProps> = ({
  currentUser,
  requests,
  onViewRequest,
  onCommentsViewed
}) => {
  const [comments, setComments] = useState<TicketComment[]>([]);
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

  const markCommentAsRead = useCallback((commentId: string) => {
    if (!currentUser?.id) return;
    setReadCommentIds(prev => {
      if (prev.has(commentId)) return prev;
      const next = new Set(prev);
      next.add(commentId);
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
    toast.success("All comments marked as read");
    if (onCommentsViewed) onCommentsViewed();
  };

  const loadAllComments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ticket_comments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error && data) {
        setComments(data as TicketComment[]);
      }
    } catch (err) {
      console.error('Failed to load ticket comments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllComments();

    // Realtime subscription to live comments across all tickets
    const channel = supabase
      .channel('ticket_comments_live_view')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_comments' },
        () => {
          loadAllComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Map ticketId to TravelRequest
  const requestsById = useMemo(() => {
    const map = new Map<string, TravelRequest>();
    requests.forEach(r => {
      if (r.id) map.set(r.id, r);
      if (r.submissionId) map.set(r.submissionId, r);
    });
    return map;
  }, [requests]);

  // Mentioned comments for current user
  const mentionedComments = useMemo(() => {
    return comments.filter(c => isUserMentionedInComment(c, currentUser));
  }, [comments, currentUser]);

  const unreadMentionsCount = useMemo(() => {
    return mentionedComments.filter(c => !readCommentIds.has(c.id)).length;
  }, [mentionedComments, readCommentIds]);

  // Filtered comments
  const displayComments = useMemo(() => {
    let list = activeSubTab === 'mentioned' ? mentionedComments : comments;

    if (unreadOnly) {
      list = list.filter(c => !readCommentIds.has(c.id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c => {
        const req = requestsById.get(c.ticket_id);
        const matchText = c.comment_text?.toLowerCase().includes(q);
        const matchAuthor = c.author_name?.toLowerCase().includes(q);
        const matchTicketId = c.ticket_id?.toLowerCase().includes(q) || (req?.submissionId && req.submissionId.toLowerCase().includes(q));
        const matchRequester = req?.requesterName?.toLowerCase().includes(q);
        const matchRoute = (req?.from && req.from.toLowerCase().includes(q)) || (req?.to && req.to.toLowerCase().includes(q));
        return matchText || matchAuthor || matchTicketId || matchRequester || matchRoute;
      });
    }

    return list;
  }, [activeSubTab, mentionedComments, comments, unreadOnly, readCommentIds, searchQuery, requestsById]);

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

  const handleOpenTicket = (comment: TicketComment) => {
    markCommentAsRead(comment.id);
    const req = requestsById.get(comment.ticket_id);
    if (req) {
      onViewRequest(req);
    } else {
      toast.info(`Opening request ${comment.ticket_id}...`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / Stats */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
            <i className="fa-solid fa-comments text-indigo-400"></i>
            Ticket Activity Feed
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Ticket Comments & @Mentions
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Stay on top of questions, updates, and team mentions left in ticket stub comments across all travel requests.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex-1 md:flex-initial bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center">
            <span className="text-2xs font-bold uppercase tracking-wider text-indigo-300 block">
              @Me Mentions
            </span>
            <span className="text-2xl font-black text-white">{mentionedComments.length}</span>
          </div>
          <div className="flex-1 md:flex-initial bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center">
            <span className="text-2xs font-bold uppercase tracking-wider text-rose-300 block">
              Unread
            </span>
            <span className="text-2xl font-black text-rose-400">{unreadMentionsCount}</span>
          </div>
          <div className="flex-1 md:flex-initial bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center">
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-300 block">
              Total
            </span>
            <span className="text-2xl font-black text-slate-200">{comments.length}</span>
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
            Mentioned (@Me)
            {unreadMentionsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-3xs font-black bg-rose-500 text-white">
                {unreadMentionsCount}
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
            <i className="fa-solid fa-list-ul text-xs"></i>
            All Comments ({comments.length})
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
              placeholder="Filter by ticket #, user, or keyword..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={() => setUnreadOnly(prev => !prev)}
            title="Filter unread only"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              unreadOnly
                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            <i className={`fa-solid fa-filter text-2xs ${unreadOnly ? 'text-indigo-500' : 'text-slate-400'}`}></i>
            <span className="hidden sm:inline">Unread</span>
          </button>

          {unreadMentionsCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 transition-all cursor-pointer"
              title="Mark all as read"
            >
              <i className="fa-solid fa-check-double text-2xs mr-1"></i>
              <span className="hidden md:inline">Mark read</span>
            </button>
          )}
        </div>
      </div>

      {/* Comment Cards List */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <div className="inline-block w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-medium text-slate-400">Loading ticket comments...</p>
        </div>
      ) : displayComments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl">
            <i className="fa-solid fa-comments"></i>
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {activeSubTab === 'mentioned' ? 'No @mentions found' : 'No comments found'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {activeSubTab === 'mentioned'
              ? 'When someone mentions you in a ticket stub with @your-name, it will appear right here with a direct link to the ticket.'
              : 'No ticket comments match your filter criteria.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {displayComments.map(c => {
            const req = requestsById.get(c.ticket_id);
            const isMentioned = isUserMentionedInComment(c, currentUser);
            const isUnread = !readCommentIds.has(c.id);
            const authorInitial = (c.author_name || 'U').charAt(0).toUpperCase();
            const authorColor = getMentionColor(c.author_name);

            return (
              <div
                key={c.id}
                onClick={() => handleOpenTicket(c)}
                className={`group relative p-4 sm:p-5 rounded-xl border transition-all cursor-pointer shadow-xs hover:shadow-md ${
                  isUnread
                    ? 'bg-white dark:bg-slate-900 border-indigo-300/80 dark:border-indigo-800/80 ring-1 ring-indigo-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Unread indicator badge */}
                {isUnread && (
                  <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-rose-500 ring-4 ring-rose-500/20" />
                )}

                {/* Ticket Reference Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-3xs font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {req?.submissionId || c.ticket_id.slice(0, 8)}
                    </span>

                    {req && (
                      <>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {req.requesterName}
                        </span>
                        {req.from && req.to && (
                          <span className="text-3xs text-slate-400 flex items-center gap-1 font-medium">
                            <i className="fa-solid fa-arrow-right text-[9px] text-slate-400"></i>
                            {req.from} → {req.to}
                          </span>
                        )}
                        {req.pncStatus && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {req.pncStatus}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isMentioned && (
                      <span className="px-2 py-0.5 rounded text-3xs font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1">
                        <i className="fa-solid fa-at text-[10px]"></i>
                        Mentioned You
                      </span>
                    )}
                    <span className="text-3xs text-slate-400 font-mono">
                      {new Date(c.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>

                {/* Comment Content */}
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${authorColor}`}>
                    {authorInitial}
                  </div>

                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {c.author_name}
                      </span>
                      {c.is_edited && (
                        <span className="text-3xs text-slate-400 italic">(edited)</span>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {renderCommentContent(c.comment_text)}
                    </p>
                  </div>
                </div>

                {/* Action Hover / Footer */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-2xs">
                  <span className="text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1 font-semibold">
                    <i className="fa-solid fa-arrow-up-right-from-square text-3xs"></i>
                    Click to view full ticket stub & reply
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isUnread) {
                        markCommentAsRead(c.id);
                      } else {
                        // Mark unread
                        setReadCommentIds(prev => {
                          const next = new Set(prev);
                          next.delete(c.id);
                          if (currentUser?.id) {
                            try {
                              localStorage.setItem(`read_comments_${currentUser.id}`, JSON.stringify(Array.from(next)));
                            } catch (err) {
                              console.warn('Could not save read comments', err);
                            }
                          }
                          return next;
                        });
                        if (onCommentsViewed) onCommentsViewed();
                      }
                    }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-0.5 rounded font-medium transition-colors"
                  >
                    {isUnread ? 'Mark as read' : 'Mark unread'}
                  </button>
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
