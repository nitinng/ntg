import { useEffect, useState } from 'react';
import { resolveStorageUrl } from '../utils/storageUrls';

/**
 * Resolve a stored Supabase Storage URL into a short-lived signed URL.
 *
 * The buckets are private (migration 20261008100200), so a persisted
 * `getPublicUrl()` string no longer loads. Pass the stored value; render the
 * link or image only once `url` is non-null.
 *
 *   const { url, loading } = useSignedUrl(request.invoiceUrl);
 *
 * `url` stays null when the stored value is empty, when the object is gone, or
 * when RLS says this user may not read it — all of which should render as
 * "no attachment" rather than a broken link.
 */
export function useSignedUrl(storedUrl: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!storedUrl);

  useEffect(() => {
    let cancelled = false;

    if (!storedUrl) {
      setUrl(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    resolveStorageUrl(storedUrl)
      .then(resolved => { if (!cancelled) setUrl(resolved); })
      .catch(() => { if (!cancelled) setUrl(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [storedUrl]);

  return { url, loading };
}

/**
 * Batch variant for lists — resolves many stored URLs into a lookup keyed by
 * the original string, so a table of rows needs one effect rather than one
 * hook per row.
 */
export function useSignedUrls(storedUrls: (string | null | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = storedUrls.filter(Boolean).join('|');

  useEffect(() => {
    let cancelled = false;
    const unique = Array.from(new Set(storedUrls.filter(Boolean) as string[]));

    Promise.all(unique.map(async stored => [stored, await resolveStorageUrl(stored)] as const))
      .then(pairs => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [stored, resolved] of pairs) if (resolved) next[stored] = resolved;
        setUrls(next);
      })
      .catch(() => { if (!cancelled) setUrls({}); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
