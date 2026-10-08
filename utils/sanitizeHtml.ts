import DOMPurify from 'dompurify';

/**
 * Sanitiser for email HTML rendered into the staff UI.
 *
 * Email bodies reach the browser from `email_queue.body` and `mail_templates.body`.
 * Both are rendered with dangerouslySetInnerHTML -- in SentMailsView's inspector,
 * and in the two MailTemplatesView previews -- so an attacker-controlled body
 * executes in the session of whoever opens it, which in these views is always
 * Admin or PNC.
 *
 * Anyone who can queue a mail can choose its body, so this content is untrusted
 * regardless of how the queue itself is locked down.
 *
 * The allow-list below is what a transactional email legitimately needs:
 * structure, basic text formatting, tables, links and images. It excludes
 * script, iframe, object, embed, form and every event handler, so the preview
 * renders what the recipient would see without granting the page any behaviour.
 */

const ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup',
  'div', 'em', 'figure', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
  'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
];

const ALLOWED_ATTR = [
  'align', 'alt', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'class',
  'color', 'colspan', 'dir', 'face', 'height', 'href', 'rowspan', 'size',
  'src', 'style', 'target', 'title', 'valign', 'width'
];

/**
 * Sanitise an email body for preview. Returns a string safe to pass to
 * dangerouslySetInnerHTML.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block javascript:, vbscript: and data: URLs in href/src while keeping
    // the http(s), mailto and cid schemes mail legitimately uses.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base', 'link'],
    // Belt and braces: the tag/attr allow-lists already exclude handlers.
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onanimationstart'],
    // Keep the markup inside a removed tag rather than silently dropping text.
    KEEP_CONTENT: true
  });
}

/**
 * Sanitise rendered Mermaid SVG.
 *
 * Mermaid's input here is developer-authored, so this is defence in depth rather
 * than a response to untrusted input -- but the sink is the same shape, and
 * Mermaid has had XSS advisories of its own. SVG needs its own allow-list, so
 * this uses DOMPurify's SVG profile instead of the email one above.
 */
export function sanitizeSvg(svg: string | null | undefined): string {
  if (!svg) return '';
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    KEEP_CONTENT: true
  });
}
