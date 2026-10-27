import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, UserRole, TicketComment } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

interface TicketCommentThreadProps {
  ticketId: string;
  currentUser: User | null;
  users?: User[];
  title?: string;
}

/**
 * Curated palette of WCAG AAA high-contrast color pairings (> 9:1 contrast ratio)
 * for @mention badges in both light and dark modes.
 */
const MENTION_PALETTES = [
  {
    name: 'indigo',
    light: 'bg-indigo-100 text-indigo-950 border-indigo-300',
    dark: 'dark:bg-indigo-950/90 dark:text-indigo-200 dark:border-indigo-700'
  },
  {
    name: 'emerald',
    light: 'bg-emerald-100 text-emerald-950 border-emerald-300',
    dark: 'dark:bg-emerald-950/90 dark:text-emerald-200 dark:border-emerald-700'
  },
  {
    name: 'amber',
    light: 'bg-amber-100 text-amber-950 border-amber-300',
    dark: 'dark:bg-amber-950/90 dark:text-amber-200 dark:border-amber-700'
  },
  {
    name: 'purple',
    light: 'bg-purple-100 text-purple-950 border-purple-300',
    dark: 'dark:bg-purple-950/90 dark:text-purple-200 dark:border-purple-700'
  },
  {
    name: 'sky',
    light: 'bg-sky-100 text-sky-950 border-sky-300',
    dark: 'dark:bg-sky-950/90 dark:text-sky-200 dark:border-sky-700'
  },
  {
    name: 'rose',
    light: 'bg-rose-100 text-rose-950 border-rose-300',
    dark: 'dark:bg-rose-950/90 dark:text-rose-200 dark:border-rose-700'
  },
  {
    name: 'teal',
    light: 'bg-teal-100 text-teal-950 border-teal-300',
    dark: 'dark:bg-teal-950/90 dark:text-teal-200 dark:border-teal-700'
  },
  {
    name: 'cyan',
    light: 'bg-cyan-100 text-cyan-950 border-cyan-300',
    dark: 'dark:bg-cyan-950/90 dark:text-cyan-200 dark:border-cyan-700'
  }
];

export const getMentionColor = (name: string): string => {
  if (!name) return `${MENTION_PALETTES[0].light} ${MENTION_PALETTES[0].dark}`;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % MENTION_PALETTES.length;
  const p = MENTION_PALETTES[index];
  return `${p.light} ${p.dark}`;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const TicketCommentThread: React.FC<TicketCommentThreadProps> = ({
  ticketId,
  currentUser,
  users = [],
  title = "Ticket Activity & Comments"
}) => {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [pncStaffList, setPncStaffList] = useState<User[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync / fetch PNC staff list (PNC + PNC Admin only)
  useEffect(() => {
    const fromProps = (users || []).filter(
      u => u.role === UserRole.PNC || u.role === UserRole.PNC_ADMIN
    );

    if (fromProps.length > 0) {
      setPncStaffList(fromProps);
    } else {
      const fetchPncStaff = async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, name, email, role')
            .in('role', ['PNC', 'PNC Admin']);
          if (!error && data && data.length > 0) {
            setPncStaffList(data as User[]);
          }
        } catch (err) {
          console.warn('Could not fetch PNC staff for mentions:', err);
        }
      };
      fetchPncStaff();
    }
  }, [users]);

  const loadComments = async () => {
    if (!ticketId) return;
    try {
      const { data, error } = await supabase
        .from('ticket_comments')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setComments(data as TicketComment[]);
      }
    } catch (err: any) {
      console.error('Error loading comments:', err);
    }
  };

  useEffect(() => {
    loadComments();

    // Subscribe to realtime changes on ticket_comments for this ticket
    const channel = supabase
      .channel(`ticket-comments-${ticketId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` },
        () => {
          loadComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  // Mention autocomplete suggestions: ONLY PNC members (PNC + PNC Admin)
  const mentionSuggestions = useMemo(() => {
    return pncStaffList.filter(u => {
      if (!mentionQuery) return true;
      const q = mentionQuery.toLowerCase();
      return (
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))
      );
    }).slice(0, 8);
  }, [pncStaffList, mentionQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);

    // Check for @mention trigger
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1 && !textBeforeCursor.slice(lastAt).includes(' ')) {
      setMentionQuery(textBeforeCursor.slice(lastAt + 1));
      setShowMentionMenu(true);
    } else {
      setShowMentionMenu(false);
    }
  };

  const handleSelectMention = (user: User) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = newComment.slice(0, cursor);
    const textAfterCursor = newComment.slice(cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    const updated = textBeforeCursor.slice(0, lastAt) + `@${user.name || user.email} ` + textAfterCursor;
    setNewComment(updated);
    setShowMentionMenu(false);
    textareaRef.current.focus();
  };

  const handlePostComment = async () => {
    if (!currentUser || !newComment.trim()) return;
    setIsSubmitting(true);

    try {
      // Extract mentions matching known PNC staff or generic @handles
      const mentionedNames: string[] = [];
      pncStaffList.forEach(pnc => {
        const namePattern = pnc.name ? new RegExp(`@${escapeRegex(pnc.name)}\\b`, 'i') : null;
        const emailPattern = pnc.email ? new RegExp(`@${escapeRegex(pnc.email)}\\b`, 'i') : null;
        if ((namePattern && namePattern.test(newComment)) || (emailPattern && emailPattern.test(newComment))) {
          mentionedNames.push(pnc.name || pnc.email);
        }
      });

      // Also pick up any generic @mentions
      const genericMatches: string[] = newComment.match(/@([\w.-]+(?:@[\w.-]+)?)/g) || [];
      genericMatches.forEach((m: string) => {
        const clean = m.slice(1).trim();
        if (!mentionedNames.includes(clean)) {
          mentionedNames.push(clean);
        }
      });

      const payload = {
        ticket_id: ticketId,
        author_id: currentUser.id,
        author_name: currentUser.name || currentUser.email,
        author_role: currentUser.role,
        comment_text: newComment.trim(),
        mentions: mentionedNames.length > 0 ? mentionedNames : null,
        is_edited: false
      };

      const { data, error } = await supabase
        .from('ticket_comments')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setComments(prev => [...prev, data as TicketComment]);
      }
      setNewComment('');
      toast.success("Comment added");
    } catch (err: any) {
      toast.error("Failed to add comment: " + (err.message || 'Please try again'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editingText.trim()) return;
    try {
      const { error } = await supabase
        .from('ticket_comments')
        .update({
          comment_text: editingText.trim(),
          is_edited: true,
          edited_at: new Date().toISOString()
        })
        .eq('id', commentId);

      if (error) throw error;

      setComments(prev => prev.map(c => c.id === commentId ? {
        ...c,
        comment_text: editingText.trim(),
        is_edited: true,
        edited_at: new Date().toISOString()
      } : c));

      setEditingCommentId(null);
      setEditingText('');
      toast.success("Comment updated");
    } catch (err: any) {
      toast.error("Failed to update comment: " + err.message);
    }
  };

  /**
   * Parses text and renders @mentions as rounded-md badges with distinct,
   * high-contrast background and text colors.
   */
  const renderFormattedComment = (text: string) => {
    if (!text) return null;

    // Collect all PNC names and emails, sorted by length descending so full names match first
    const candidateNames = pncStaffList
      .flatMap(u => [u.name, u.email])
      .filter((n): n is string => Boolean(n && n.trim()))
      .sort((a, b) => b.length - a.length);

    const pattern = candidateNames.length > 0
      ? new RegExp(`@(${candidateNames.map(escapeRegex).join('|')})\\b|@([\\w.-]+(?:@[\\w.-]+)?)`, 'gi')
      : /@([\w.-]+(?:@[\w.-]+)?)/gi;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const mentionName = match[1] || match[2];
      const fullMention = match[0];
      const colorClasses = getMentionColor(mentionName);

      parts.push(
        <span
          key={match.index}
          className={`inline-flex items-center gap-0.5 px-2 py-0.5 mx-0.5 rounded-md text-xs font-bold border shadow-2xs ${colorClasses} align-baseline`}
          title={`PNC Member: ${mentionName}`}
        >
          <span className="opacity-75 font-mono text-[10px]">@</span>
          <span>{mentionName}</span>
          <span className="ml-1 px-1 py-0.1 rounded text-[9px] font-black uppercase tracking-wider bg-black/10 dark:bg-white/10 opacity-90">
            PNC
          </span>
        </span>
      );

      lastIndex = match.index + fullMention.length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  return (
    <div className="space-y-4 pt-4 border-t dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
          <i className="fa-solid fa-comments text-indigo-600"></i>
          {title} ({comments.length})
        </h4>
        <span className="text-2xs text-slate-400">Type @ to mention PNC team</span>
      </div>

      {/* Comment List */}
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
        {comments.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50 dark:bg-slate-800/20 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
            No comments yet. Start a discussion or mention PNC staff using @.
          </div>
        ) : (
          comments.map(c => {
            const isAuthor = currentUser?.id === c.author_id;
            const isPncAuthor = c.author_role === UserRole.PNC || c.author_role === UserRole.PNC_ADMIN;
            const authorRoleDisplay = isPncAuthor ? 'PNC' : c.author_role;

            return (
              <div
                key={c.id}
                className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{c.author_name}</span>
                    <span className={`px-1.5 py-0.2 rounded text-3xs font-bold uppercase tracking-wider border ${
                      isPncAuthor
                        ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}>
                      {authorRoleDisplay}
                    </span>
                    {c.is_edited && (
                      <span className="text-3xs text-slate-400 italic">(edited)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xs text-slate-400">
                      {new Date(c.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    {isAuthor && editingCommentId !== c.id && (
                      <button
                        onClick={() => {
                          setEditingCommentId(c.id);
                          setEditingText(c.comment_text);
                        }}
                        className="text-slate-400 hover:text-indigo-600 text-3xs font-semibold"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {editingCommentId === c.id ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                      rows={2}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingCommentId(null)}
                        className="px-2.5 py-1 text-2xs font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(c.id)}
                        className="px-3 py-1 bg-indigo-600 text-white rounded text-2xs font-bold shadow-xs hover:bg-indigo-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {renderFormattedComment(c.comment_text)}
                  </p>
                )}

                {c.mentions && c.mentions.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1.5 flex-wrap">
                    <span className="text-3xs font-semibold text-slate-400 flex items-center gap-1">
                      <i className="fa-solid fa-at text-indigo-500"></i> Mentioned:
                    </span>
                    {c.mentions.map((m, idx) => {
                      const colorClasses = getMentionColor(m);
                      return (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-3xs font-bold border shadow-2xs ${colorClasses}`}
                        >
                          <span>@{m}</span>
                          <span className="px-1 py-0.1 rounded text-[8px] font-black uppercase tracking-wider bg-black/10 dark:bg-white/10 opacity-90">
                            PNC
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New Comment Input */}
      {currentUser && (
        <div className="relative space-y-2">
          {/* Mention Menu: Only PNC staff (PNC + PNC Admin), labeled as PNC without role differentiation */}
          {showMentionMenu && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-20 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 text-3xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-at text-indigo-500"></i>
                  Mention PNC Team
                </span>
                <span className="text-3xs text-slate-400 font-normal">{mentionSuggestions.length} available</span>
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {mentionSuggestions.map(u => {
                  const colorClasses = getMentionColor(u.name || u.email);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectMention(u)}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 text-xs flex items-center justify-between gap-2 transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-3xs font-bold border shrink-0 ${colorClasses}`}>
                          {(u.name || u.email || 'P').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                            {u.name || u.email}
                          </span>
                          {u.name && u.email && (
                            <span className="text-3xs text-slate-400 truncate block">
                              {u.email}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Uniform PNC tag - no role differentiation */}
                      <span className="px-2 py-0.5 rounded text-3xs font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                        PNC
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={handleInputChange}
            placeholder="Write a comment or update... Type @ to mention a PNC team member"
            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
            rows={2}
          />

          <div className="flex items-center justify-between">
            <span className="text-3xs text-slate-400">
              Type @ to notify a PNC member.
            </span>
            <button
              onClick={handlePostComment}
              disabled={isSubmitting || !newComment.trim()}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-paper-plane text-2xs"></i>
              Post Comment
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketCommentThread;

