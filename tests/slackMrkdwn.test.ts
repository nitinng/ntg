import { describe, it, expect } from 'vitest';
import { mrkdwnToHtml, mrkdwnToPlain } from '../components/slack/mrkdwn';

describe('mrkdwnToHtml', () => {
  it('renders bold instead of printing asterisks, as the old gallery did', () => {
    const html = mrkdwnToHtml('*Status:* Pending PNC');
    expect(html).toContain('<strong>Status:</strong>');
    expect(html).not.toContain('*');
  });

  it('renders emoji shortcodes instead of printing :red_circle:', () => {
    expect(mrkdwnToHtml(':red_circle: Critical')).toContain('\u{1F534}');
    expect(mrkdwnToHtml(':red_circle: Critical')).not.toContain(':red_circle:');
  });

  it('leaves an unknown shortcode alone rather than eating it', () => {
    expect(mrkdwnToHtml(':not_a_real_emoji:')).toContain(':not_a_real_emoji:');
  });

  it('renders a link with its label, not the raw <url|label> form', () => {
    const html = mrkdwnToHtml('<https://x.test/d|View in Travel Desk>');
    expect(html).toContain('href="https://x.test/d"');
    expect(html).toContain('>View in Travel Desk<');
    expect(html).not.toContain('|');
  });

  it('renders inline code and fenced blocks', () => {
    expect(mrkdwnToHtml('`TRV-001`')).toContain('<code class="slack-code">TRV-001</code>');
    expect(mrkdwnToHtml('```PostgresError: boom```')).toContain('<pre class="slack-pre">');
  });

  it('does not apply inline rules inside a fenced block', () => {
    const html = mrkdwnToHtml('```a * b * c```');
    expect(html).not.toContain('<strong>');
  });

  it('keeps snake_case identifiers intact', () => {
    const html = mrkdwnToHtml('error in sos_dispatch_webhook call');
    expect(html).toContain('sos_dispatch_webhook');
    expect(html).not.toContain('<em>');
  });

  it('still renders a genuine _italic_ pair', () => {
    expect(mrkdwnToHtml('see _Automated Notification_ below')).toContain('<em>Automated Notification</em>');
  });

  it('escapes HTML in payload content', () => {
    const html = mrkdwnToHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('mrkdwnToPlain (the Workflow Builder view)', () => {
  it('strips every markup character', () => {
    const out = mrkdwnToPlain('*Open:* `12` · <https://x.test|View All>');
    expect(out).toBe('Open: 12 · View All');
  });

  it('keeps snake_case here too', () => {
    expect(mrkdwnToPlain('sos_dispatch_webhook')).toBe('sos_dispatch_webhook');
  });
});
