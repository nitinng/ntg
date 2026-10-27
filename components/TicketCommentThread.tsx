import React, { useState, useEffect, useRef } from 'react';
import { User, TicketComment } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

interface TicketCommentThreadProps {
  ticketId: string;
  currentUser: User | null;
  users?: User[];
  title?: string;
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Mention autocomplete suggestions
  const mentionSuggestions = users.filter(u => {
    if (!mentionQuery) return true;
    const q = mentionQuery.toLowerCase();
    return (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }).slice(0, 5);

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
      // Extract mentions (@name or @email)
      const mentionMatches = newComment.match(/@([\w.-]+(?:@[\w.-]+)?)/g) || [];
      const mentions = mentionMatches.map(m => m.slice(1).trim());

      const payload = {
        ticket_id: ticketId,
        author_id: currentUser.id,
        author_name: currentUser.name || currentUser.email,
        author_role: currentUser.role,
        comment_text: newComment.trim(),
        mentions: mentions.length > 0 ? mentions : null,
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

  return (
    <div className="space-y-4 pt-4 border-t dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
          <i className="fa-solid fa-comments text-indigo-600"></i>
          {title} ({comments.length})
        </h4>
        <span className="text-2xs text-slate-400">Supports @mentions</span>
      </div>

      {/* Comment List */}
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
        {comments.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50 dark:bg-slate-800/20 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
            No comments yet. Start a discussion or mention colleagues using @.
          </div>
        ) : (
          comments.map(c => {
            const isAuthor = currentUser?.id === c.author_id;
            return (
              <div
                key={c.id}
                className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{c.author_name}</span>
                    <span className="px-1.5 py-0.2 rounded text-3xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                      {c.author_role}
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
                    {c.comment_text}
                  </p>
                )}

                {c.mentions && c.mentions.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1 text-3xs text-indigo-600 dark:text-indigo-400 font-semibold">
                    <i className="fa-solid fa-at"></i>
                    <span>Mentioned: {c.mentions.join(', ')}</span>
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
          {showMentionMenu && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-20 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              <div className="p-2 bg-slate-50 dark:bg-slate-800 text-3xs font-bold uppercase tracking-wider text-slate-400">
                Mention Member
              </div>
              {mentionSuggestions.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelectMention(u)}
                  className="w-full p-2 text-left hover:bg-indigo-50 dark:hover:bg-slate-800 text-xs flex items-center justify-between"
                >
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{u.name}</span>
                  <span className="text-3xs text-slate-400">{u.role}</span>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={handleInputChange}
            placeholder="Write a comment or update... Type @ to mention someone"
            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
            rows={2}
          />

          <div className="flex items-center justify-between">
            <span className="text-3xs text-slate-400">
              Press Post to send comment. Notifications will be sent for @mentions.
            </span>
            <button
              onClick={handlePostComment}
              disabled={isSubmitting || !newComment.trim()}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5"
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
