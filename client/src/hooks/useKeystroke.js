import { useCallback, useRef } from 'react';

/**
 * Captures keystroke dynamics: for each printable key, keydown time (d) and keyup time (u) in ms.
 * dwell = u - d, flight = next.d - this.u. Attach onKeyDown/onKeyUp to any input/textarea.
 */
export function useKeystroke({ max = 200 } = {}) {
  const events = useRef([]);
  const pending = useRef(new Map());

  const onKeyDown = useCallback((e) => {
    if (e.repeat || e.key.length !== 1 || e.ctrlKey || e.metaKey) return;
    pending.current.set(e.code, { k: e.key, d: performance.now() });
  }, []);
  const onKeyUp = useCallback((e) => {
    const p = pending.current.get(e.code);
    if (!p) return;
    pending.current.delete(e.code);
    events.current.push({ k: p.k, d: Math.round(p.d), u: Math.round(performance.now()) });
    if (events.current.length > max) events.current.shift();
  }, [max]);

  const reset = useCallback(() => { events.current = []; pending.current.clear(); }, []);
  const take = useCallback(() => { const out = events.current; events.current = []; return out; }, []);
  const peek = useCallback(() => events.current, []);
  return { onKeyDown, onKeyUp, reset, take, peek };
}
