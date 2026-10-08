import React from 'react';
import { useSignedUrl } from '../hooks/useSignedUrl';

/**
 * Storage-backed link and image, for buckets that are private as of migration
 * 20261008100200. Both take the URL as persisted in the database and resolve it
 * to a short-lived signed URL before rendering.
 *
 * Using components rather than calling useSignedUrl() directly lets list rows
 * resolve their own URL without breaking the rules of hooks inside a .map().
 */

interface SignedLinkProps {
  /** The URL as stored in the database. */
  storedUrl: string | null | undefined;
  className?: string;
  children: React.ReactNode;
  /** Rendered when the object is missing or this user may not read it. */
  fallback?: React.ReactNode;
}

export const SignedLink: React.FC<SignedLinkProps> = ({ storedUrl, className, children, fallback = null }) => {
  const { url, loading } = useSignedUrl(storedUrl);

  if (loading) {
    return <span className={className} aria-busy="true">{children}</span>;
  }
  if (!url) return <>{fallback}</>;

  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
};

interface SignedImageProps {
  storedUrl: string | null | undefined;
  className?: string;
  alt?: string;
  fallback?: React.ReactNode;
}

export const SignedImage: React.FC<SignedImageProps> = ({ storedUrl, className, alt = '', fallback = null }) => {
  const { url, loading } = useSignedUrl(storedUrl);

  if (loading) {
    return <div className={`${className ?? ''} animate-pulse bg-slate-200 dark:bg-slate-800`} aria-busy="true" />;
  }
  if (!url) return <>{fallback}</>;

  return <img src={url} alt={alt} className={className} />;
};
