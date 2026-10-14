/**
 * Slack mrkdwn -> HTML, for the preview gallery.
 *
 * The gallery used to hand-write its own markup, which is how it drifted into
 * printing `*Status:*` and `:red_circle:` literally while the real channel
 * rendered them properly. Everything the cards actually use is handled here, in
 * the order Slack applies it, so the preview reads the same payload the webhook
 * receives.
 */

const EMOJI: Record<string, string> = {
  red_circle: '\u{1F534}',
  large_orange_circle: '\u{1F7E0}',
  large_yellow_circle: '\u{1F7E1}',
  large_blue_circle: '\u{1F535}',
  large_green_circle: '\u{1F7E2}',
  white_circle: '⚪',
  warning: '⚠️',
  information_source: 'ℹ️',
  airplane: '✈️',
  bell: '\u{1F514}',
  bar_chart: '\u{1F4CA}',
  rotating_light: '\u{1F6A8}',
  white_check_mark: '✅'
};

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Converts one mrkdwn string to HTML. Input is escaped first, so every tag in
 * the result is one this function added.
 */
export const mrkdwnToHtml = (raw: string): string => {
  if (!raw) return '';
  let out = escapeHtml(raw);

  // Code spans are lifted out before any inline rule runs and put back at the
  // end. Without this, a stack trace containing an asterisk comes back bolded
  // and a pointer like *ptr silently loses its star.
  const vault: string[] = [];
  const stash = (html: string): string => {
    vault.push(html);
    return `\u0000${vault.length - 1}\u0000`;
  };

  out = out.replace(/```([\s\S]*?)```/g, (_m, code) =>
    stash(`<pre class="slack-pre">${String(code).replace(/^\n/, '')}</pre>`)
  );
  out = out.replace(/`([^`\n]+)`/g, (_m, code) =>
    stash(`<code class="slack-code">${code}</code>`)
  );

  // Slack escapes the angle brackets of a link target, so match the escaped form.
  out = out.replace(
    /&lt;(https?:[^|&]+)\|([^&]+)&gt;/g,
    '<a class="slack-link" href="$1" target="_blank" rel="noopener noreferrer">$2</a>'
  );
  out = out.replace(
    /&lt;(https?:[^|&]+)&gt;/g,
    '<a class="slack-link" href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  out = out.replace(
    /&lt;(mailto:[^|&]+)\|([^&]+)&gt;/g,
    '<a class="slack-link" href="$1">$2</a>'
  );

  out = out.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');

  // Anchored to a boundary so snake_case survives -- an unanchored _(...)_
  // turns sos_dispatch_webhook into sosdispatchwebhook.
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');

  out = out.replace(/:([a-z0-9_+-]+):/g, (m, name) => EMOJI[name] || m);
  out = out.replace(/\n/g, '<br />');

  return out.replace(/\u0000(\d+)\u0000/g, (_m, i) => vault[Number(i)]);
};

/** Plain-text variant, for the Workflow Builder view. */
export const mrkdwnToPlain = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(/<([^>|]*)\|([^>]*)>/g, '$2')
    .replace(/<([^>|]*)>/g, '$1')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/[*`]/g, '')
    .replace(/:([a-z0-9_+-]+):/g, (m, name) => EMOJI[name] || m);
};
