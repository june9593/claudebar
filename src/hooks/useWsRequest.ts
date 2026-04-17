import { useCallback, useEffect, useRef, useState } from 'react';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Fire ONE WS `req` on mount (and via refetch()); resolve with matching response. */
export function useWsRequest<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  deps: unknown[] = [],
) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const reqIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const fire = useCallback(() => {
    const api = window.electronAPI?.ws;
    if (!api) { setState({ data: null, loading: false, error: 'bridge unavailable' }); return () => {}; }
    cancelledRef.current = false;
    setState({ data: null, loading: true, error: null });
    reqIdRef.current = null;

    const unsub = api.onResponse((resp) => {
      if (cancelledRef.current) return;
      if (reqIdRef.current && resp.id !== reqIdRef.current) return;
      if (resp.ok) {
        setState({ data: (resp.payload as T) ?? null, loading: false, error: null });
      } else {
        const err = (resp.error as { message?: string } | undefined)?.message ?? 'error';
        setState({ data: null, loading: false, error: err });
      }
      unsub();
    });

    api.send(method, params).then((r) => {
      if (cancelledRef.current) return;
      if (r.ok && r.id) reqIdRef.current = r.id;
      else {
        setState({ data: null, loading: false, error: String((r as { error?: unknown }).error ?? 'send failed') });
        unsub();
      }
    }).catch((e) => {
      if (cancelledRef.current) return;
      setState({ data: null, loading: false, error: String(e) });
      unsub();
    });

    return () => { cancelledRef.current = true; unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, JSON.stringify(params)]);

  useEffect(() => {
    const cleanup = fire();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch: fire };
}
