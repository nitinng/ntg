import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: { storage: { from: () => ({}) } } }));

import { parseStorageUrl } from '../utils/storageUrls';

const PROJECT = 'https://abcdefgh.supabase.co';

describe('parseStorageUrl', () => {
  it('parses a stored public URL into bucket and path', () => {
    expect(parseStorageUrl(`${PROJECT}/storage/v1/object/public/invoices/pnc_self_booking_1733500000.pdf`))
      .toEqual({ bucket: 'invoices', path: 'pnc_self_booking_1733500000.pdf' });
  });

  it('handles nested paths, as user-documents uses', () => {
    expect(parseStorageUrl(`${PROJECT}/storage/v1/object/public/user-documents/11111111-2222/passportPhoto_1733.jpg`))
      .toEqual({ bucket: 'user-documents', path: '11111111-2222/passportPhoto_1733.jpg' });
  });

  it('decodes percent-encoded path segments', () => {
    expect(parseStorageUrl(`${PROJECT}/storage/v1/object/public/invoices/my%20ticket%20copy.pdf`))
      .toEqual({ bucket: 'invoices', path: 'my ticket copy.pdf' });
  });

  it('re-parses an already-signed URL and drops its query string', () => {
    expect(parseStorageUrl(`${PROJECT}/storage/v1/object/sign/invoices/split_abc_1733.pdf?token=eyJhbGciOi`))
      .toEqual({ bucket: 'invoices', path: 'split_abc_1733.pdf' });
  });

  it('returns null for anything that is not a storage URL', () => {
    expect(parseStorageUrl('https://example.com/some/file.pdf')).toBeNull();
    expect(parseStorageUrl('not a url')).toBeNull();
  });

  it('returns null for empty input rather than throwing', () => {
    expect(parseStorageUrl(null)).toBeNull();
    expect(parseStorageUrl(undefined)).toBeNull();
    expect(parseStorageUrl('')).toBeNull();
  });

  it('returns null when a bucket is named but no object path follows', () => {
    expect(parseStorageUrl(`${PROJECT}/storage/v1/object/public/invoices`)).toBeNull();
    expect(parseStorageUrl(`${PROJECT}/storage/v1/object/public/invoices/`)).toBeNull();
  });
});
