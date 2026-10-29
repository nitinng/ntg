import { User } from '../types';

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
