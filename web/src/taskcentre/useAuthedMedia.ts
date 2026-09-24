/**
 * Load a scoped media file and hand back a URL an `<img>` or `<video>` can use.
 *
 * `/tc/media/...` applies the same scope as the camera list, which means it needs the bearer token —
 * and an `<img src>` cannot send an Authorization header. So the file is fetched, turned into a
 * blob URL, and that is what the element renders.
 *
 * The alternative was a static mount with no auth, which would have been two lines and would have
 * published every frame of a worksite to anybody who guessed the path. Pictures of people at work
 * are not public.
 *
 * A 404 is not an error here: it means nobody has staged a file for that camera, and the caller
 * renders its "no picture" state. Only a real failure sets `error`.
 */
import { useEffect, useState } from 'react';
import { CLOUD_URL, getToken } from './api';

export interface AuthedMedia {
  /** Blob URL while loaded; `null` when absent, still loading, or failed. */
  url: string | null;
  loading: boolean;
  /** Set only for a real failure — never for "nothing staged". */
  error: string | null;
  /** The server answered 404: there is no file, which is a normal state. */
  absent: boolean;
}

export function useAuthedMedia(path: string | null | undefined): AuthedMedia {
  const [state, setState] = useState<AuthedMedia>({ url: null, loading: !!path, error: null, absent: false });

  useEffect(() => {
    if (!path) {
      setState({ url: null, loading: false, error: null, absent: true });
      return;
    }
    let objectUrl: string | null = null;
    let live = true;
    const ctrl = new AbortController();

    (async () => {
      setState({ url: null, loading: true, error: null, absent: false });
      try {
        const token = getToken();
        const res = await fetch(`${CLOUD_URL}${path}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ctrl.signal,
        });
        if (!live) return;
        if (res.status === 404) {
          setState({ url: null, loading: false, error: null, absent: true });
          return;
        }
        if (!res.ok) {
          setState({ url: null, loading: false, error: `The server answered ${res.status}.`, absent: false });
          return;
        }
        objectUrl = URL.createObjectURL(await res.blob());
        if (!live) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setState({ url: objectUrl, loading: false, error: null, absent: false });
      } catch (e) {
        if (!live || (e instanceof DOMException && e.name === 'AbortError')) return;
        setState({ url: null, loading: false, error: 'Could not load this file.', absent: false });
      }
    })();

    return () => {
      live = false;
      ctrl.abort();
      // Blob URLs are held by the document until revoked; leaving them leaks the whole file.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return state;
}
