import { supabase } from '../supabaseClient';

/**
 * Resolving stored Supabase Storage URLs after the buckets were made private.
 *
 * The app historically called `getPublicUrl()` and persisted the result — into
 * `travel_requests.invoice_url`, into `split_tickets[].invoiceUrl`, and into the
 * `fileUrl` of the `passport_photo` / `id_proof` JSONB blobs on `profiles`.
 * Those stored strings look like:
 *
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *
 * With the buckets private (migration 20261008100200) those URLs 404. Rather
 * than rewrite the stored values, we parse the bucket and path back out and
 * mint a short-lived signed URL on demand. Signed-URL creation goes through
 * RLS, so a user who may not read the object simply gets no URL.
 */

const PUBLIC_MARKER = '/storage/v1/object/public/';
const SIGNED_MARKER = '/storage/v1/object/sign/';

export interface StorageRef {
  bucket: string;
  path: string;
}

/** Pull {bucket, path} out of a stored public URL. Returns null if it isn't one. */
export function parseStorageUrl(url: string | null | undefined): StorageRef | null {
  if (!url) return null;
  const marker = url.includes(PUBLIC_MARKER)
    ? PUBLIC_MARKER
    : url.includes(SIGNED_MARKER) ? SIGNED_MARKER : null;
  if (!marker) return null;

  const tail = url.split(marker)[1];
  if (!tail) return null;

  // Strip any existing signing query string before splitting.
  const clean = tail.split('?')[0];
  const slash = clean.indexOf('/');
  if (slash <= 0) return null;

  const bucket = clean.slice(0, slash);
  const path = decodeURIComponent(clean.slice(slash + 1));
  if (!bucket || !path) return null;

  return { bucket, path };
}

/** Default signed-URL lifetime: long enough to view or download, short enough not to leak. */
export const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * Turn a stored URL into a freshly signed one.
 *
 * Returns null when the string isn't a storage URL, or when the current user
 * isn't allowed to read the object. Callers should treat null as "no link".
 * A URL that is not a Supabase storage URL at all is passed back unchanged, so
 * externally-hosted links keep working.
 */
export async function resolveStorageUrl(
  storedUrl: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  if (!storedUrl) return null;

  const ref = parseStorageUrl(storedUrl);
  if (!ref) return storedUrl; // not ours — leave it alone

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, expiresIn);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
